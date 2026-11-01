const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';


const wasmCache = new Map();


const streamCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getWasmModule(vs) {
    if (!vs) return null;
    if (vs.wasm_url) {
        const key = `u:${vs.w ?? vs.wasm_url}`;
        if (!wasmCache.has(key)) {
            wasmCache.set(
                key,
                fetch(vs.wasm_url, { headers: { 'User-Agent': UA } })
                    .then((r) => r.arrayBuffer())
                    .then((b) => WebAssembly.compile(b))
            );
        }
        return wasmCache.get(key);
    }
    if (vs.wasm) {
        const key = `b:${vs.w ?? Math.random()}`;
        if (!wasmCache.has(key)) {
            const bin = Buffer.from(vs.wasm, 'base64');
            wasmCache.set(key, WebAssembly.compile(bin));
        }
        return wasmCache.get(key);
    }
    return null;
}

async function decryptStreamUrls(encB64, vs) {
    try {
        const mod = await getWasmModule(vs);
        if (!mod) return null;
        const inst = await WebAssembly.instantiate(mod, {});
        const { alloc, decrypt, memory } = inst.exports;
        const enc = Buffer.from(encB64, 'base64');
        const ptr = alloc(enc.length);
        new Uint8Array(memory.buffer, ptr, enc.length).set(enc);
        const outLen = decrypt(ptr, enc.length);
        const text = new TextDecoder().decode(
            new Uint8Array(memory.buffer, ptr + 12, outLen)
        );
        return text.split('\n').filter(Boolean);
    } catch (err) {
        console.warn('[x8rr/movies] WASM decryption failed:', err.message);
        return null;
    }
}

async function vidsrcFetch(url, referer) {
    return fetch(url, {
        headers: { 'User-Agent': UA, Referer: referer },
        signal: AbortSignal.timeout(12000)
    });
}


async function vidsrcExtract(type, tmdbId, season, episode) {
    try {
        const isTV = type === 'tv';
        const srcPath = isTV ? `${tmdbId}/${season || 1}/${episode || 1}` : String(tmdbId);
        const apiResp = await vidsrcFetch(
            `https://vidsrc.sh/vs_src.php?type=${isTV ? 'tv' : 'movie'}&id=${srcPath}`,
            'https://vidsrc.sh/'
        );
        if (!apiResp.ok) return [];
        const { src } = await apiResp.json();
        if (!src) return [];

        const landResp = await vidsrcFetch(src, 'https://vidsrc.sh/');
        if (!landResp.ok) return [];
        const landHtml = await landResp.text();
        const cfgMatch = landHtml.match(/window\.CFG\s*=\s*(\{[^}]+\})/);
        if (!cfgMatch) return [];
        const cfg = JSON.parse(cfgMatch[1]);
        const origin = new URL(src).origin;

        const playerResp = await vidsrcFetch(origin + cfg.playerUrl, origin + '/');
        if (!playerResp.ok) return [];
        const playerHtml = await playerResp.text();
        const configMatch = playerHtml.match(/window\.CONFIG\s*=\s*(\{.*?\});/s);
        if (!configMatch) return [];
        const config = JSON.parse(configMatch[1]);
        if (!config.apiToken) return [];

        let streamApiUrl;
        if (isTV) {
            streamApiUrl = `https://data.vidsrc.sh/api.php?type=tv&tmdb=${tmdbId}&season=${season || 1}&episode=${episode || 1}&stream_urls&api_token=${encodeURIComponent(config.apiToken)}`;
        } else {
            streamApiUrl = `https://data.vidsrc.sh/api.php?type=movie&tmdb=${tmdbId}&stream_urls&api_token=${encodeURIComponent(config.apiToken)}`;
        }

        const streamResp = await vidsrcFetch(streamApiUrl, origin + '/');
        if (!streamResp.ok) return [];
        const json = await streamResp.json();
        if (String(json.status_code) !== '200' || !json.data) return [];

        let urls = [];
        if (typeof json.data.stream_urls === 'string' && json.vs) {
            urls = await decryptStreamUrls(json.data.stream_urls, json.vs);
            if (!urls) return [];
        } else if (Array.isArray(json.data.stream_urls)) {
            urls = json.data.stream_urls;
        } else {
            return [];
        }

        const hostTokens = new Map();
        for (const u of urls) {
            try {
                const host = new URL(u).origin;
                if (!hostTokens.has(host)) {
                    hostTokens.set(
                        host,
                        fetch(host + '/generate.php', {
                            headers: { 'User-Agent': UA, Accept: 'application/json' },
                            signal: AbortSignal.timeout(6000)
                        })
                            .then((r) => r.text())
                            .then((t) => {
                                try {
                                    const j = JSON.parse(t);
                                    return typeof j === 'string'
                                        ? j
                                        : j.token || j.data || j.string || j.result || '';
                                } catch {
                                    return t.trim();
                                }
                            })
                            .catch(() => '')
                    );
                }
            } catch {}
        }

        const results = [];
        let serverIdx = 1;
        for (const rawUrl of urls) {
            try {
                const host = new URL(rawUrl).origin;
                const token = await hostTokens.get(host);
                const url = token
                    ? rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'token=' + token
                    : rawUrl;
                const label = serverIdx === 1
                    ? 'Server 1 (Primary 1080p)'
                    : (serverIdx === 2 ? 'Server 2 (Backup 1080p)' : `Server ${serverIdx} (Fast 1080p)`);
                results.push({
                    id: `x8rr-vidsrc-${serverIdx}`,
                    url,
                    proxiedUrl: `/api/x8rr/proxy?url=${encodeURIComponent(url)}`,
                    type: rawUrl.includes('.m3u8') ? 'hls' : 'file',
                    quality: '1080p Ultra',
                    provider: 'vidsrc',
                    providerName: `x8rr ${label}`,
                    serverLabel: label
                });
                serverIdx++;
            } catch {}
        }
        return results;
    } catch (e) {
        console.warn('[x8rr/movies] vidsrcExtract notice:', e.message);
        return [];
    }
}


async function scrapeAll(type, tmdbId, season = 1, episode = 1) {
    const isTV = type === 'tv';
    const cacheKey = `${type}:${tmdbId}:${isTV ? `${season}:${episode}` : '0'}`;
    const cached = streamCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
        return cached.streams;
    }

    
    if (process.env.X8RR_MOVIES_URL) {
        try {
            const base = process.env.X8RR_MOVIES_URL.replace(/\/+$/, '');
            const endpoint = isTV
                ? `${base}/api/stream/tv/${tmdbId}/${season}/${episode}`
                : `${base}/api/stream/movie/${tmdbId}`;
            const res = await fetch(endpoint, {
                headers: { 'User-Agent': UA },
                signal: AbortSignal.timeout(8000)
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.streams) && data.streams.length > 0) {
                    const formatted = data.streams.map((s, idx) => ({
                        url: s.url,
                        proxiedUrl: `/api/x8rr/proxy?url=${encodeURIComponent(s.url)}`,
                        type: s.type || (s.url && s.url.includes('.m3u8') ? 'hls' : 'file'),
                        quality: s.quality || '1080p',
                        provider: s.provider || 'x8rr',
                        providerName: s.providerName || `x8rr Source ${idx + 1}`
                    }));
                    streamCache.set(cacheKey, { streams: formatted, time: Date.now() });
                    return formatted;
                }
            }
        } catch (upstreamErr) {
            console.warn('[x8rr/movies] Remote upstream notice:', upstreamErr.message);
        }
    }

   
    const streams = await vidsrcExtract(type, tmdbId, season, episode);
    if (streams.length > 0) {
        streamCache.set(cacheKey, { streams, time: Date.now() });
    }
    return streams;
}


async function handleX8rrProxy(req, res, targetUrl) {
    if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'url required' }));
        return true;
    }

    try {
        const parsed = new URL(targetUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Invalid URL protocol' }));
            return true;
        }

        const r = await fetch(targetUrl, {
            headers: {
                'User-Agent': UA,
                Referer: parsed.origin + '/'
            },
            signal: AbortSignal.timeout(20000)
        });

        if (!r.ok) {
            res.writeHead(r.status, {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain'
            });
            res.end(`Upstream returned ${r.status}`);
            return true;
        }

        const ct = (r.headers.get('content-type') || '').toLowerCase();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (ct.includes('mpegurl') || targetUrl.includes('.m3u8')) {
            let text = await r.text();
            const hostToken = parsed.searchParams.get('token');
            const origin = parsed.origin;
            const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

            
            text = text.replace(/^(?!#)(\S+)$/gm, (line) => {
                const trimmed = line.trim();
                if (!trimmed) return line;
                let abs;
                if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                    abs = trimmed;
                } else if (trimmed.startsWith('/')) {
                    abs = origin + trimmed;
                } else {
                    abs = basePath + trimmed;
                }
                if (hostToken && !abs.includes('token=')) {
                    abs += (abs.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(hostToken);
                }
                return `/api/x8rr/proxy?url=${encodeURIComponent(abs)}`;
            });

            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-cache'
            });
            res.end(text);
        } else {
            
            res.writeHead(200, {
                'Content-Type': ct || 'video/MP2T',
                'Cache-Control': 'public, max-age=86400'
            });
            const buf = Buffer.from(await r.arrayBuffer());
            res.end(buf);
        }
        return true;
    } catch (e) {
        res.writeHead(500, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ error: e.message }));
        return true;
    }
}


async function handleX8rrStreamApi(req, res, requestPath, query) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    
    let type = 'movie';
    let tmdbId = '';
    let season = 1;
    let episode = 1;

    const movieMatch = requestPath.match(/^\/api\/(?:x8rr\/)?stream\/movie\/([0-9]+)$/i);
    const tvMatch = requestPath.match(/^\/api\/(?:x8rr\/)?stream\/tv\/([0-9]+)\/([0-9]+)\/([0-9]+)$/i);

    if (movieMatch) {
        type = 'movie';
        tmdbId = movieMatch[1];
    } else if (tvMatch) {
        type = 'tv';
        tmdbId = tvMatch[1];
        season = parseInt(tvMatch[2], 10) || 1;
        episode = parseInt(tvMatch[3], 10) || 1;
    } else if (requestPath === '/api/x8rr/stream' || requestPath === '/api/stream/scrape') {
        type = (query.get('type') || 'movie').toLowerCase();
        tmdbId = query.get('id') || query.get('tmdb') || '';
        season = parseInt(query.get('season') || query.get('s') || '1', 10);
        episode = parseInt(query.get('episode') || query.get('e') || '1', 10);
    } else {
        return false;
    }

    if (!tmdbId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing TMDB ID' }));
        return true;
    }

    try {
        const streams = await scrapeAll(type, tmdbId, season, episode);
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=180'
        });
        res.end(JSON.stringify({
            ok: true,
            source: 'x8rr/movies',
            type,
            tmdbId,
            season: type === 'tv' ? season : undefined,
            episode: type === 'tv' ? episode : undefined,
            streams
        }));
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message, streams: [] }));
    }
    return true;
}

module.exports = {
    scrapeAll,
    handleX8rrProxy,
    handleX8rrStreamApi
};
