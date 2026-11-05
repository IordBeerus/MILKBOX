const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';


const wasmCache = new Map();

const streamCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

const TMDB_API_KEY = process.env.TMDB_API_KEY || 'd821ffcf1a2419aa1fcf6923006cfcc4';
const imdbIdCache = new Map();
const subtitleCache = new Map();
const SUB_CACHE_TTL_MS = 30 * 60 * 1000;

const LANGUAGE_LABELS = {
    eng: 'English', en: 'English',
    spa: 'Spanish', es: 'Spanish',
    fre: 'French', fra: 'French', fr: 'French',
    ger: 'German', deu: 'German', de: 'German',
    ita: 'Italian', it: 'Italian',
    por: 'Portuguese', pob: 'Portuguese (BR)', pt: 'Portuguese',
    jpn: 'Japanese', ja: 'Japanese',
    kor: 'Korean', ko: 'Korean',
    zho: 'Chinese', chi: 'Chinese', zh: 'Chinese',
    rus: 'Russian', ru: 'Russian',
    ara: 'Arabic', ar: 'Arabic',
    hin: 'Hindi', hi: 'Hindi',
    pol: 'Polish', pl: 'Polish',
    tur: 'Turkish', tr: 'Turkish',
    dut: 'Dutch', nld: 'Dutch', nl: 'Dutch',
    swe: 'Swedish', sv: 'Swedish',
    nor: 'Norwegian', nob: 'Norwegian', no: 'Norwegian',
    dan: 'Danish', da: 'Danish',
    fin: 'Finnish', fi: 'Finnish',
    ind: 'Indonesian', id: 'Indonesian',
    vie: 'Vietnamese', vi: 'Vietnamese',
    tha: 'Thai', th: 'Thai',
    ell: 'Greek', gre: 'Greek', el: 'Greek',
    heb: 'Hebrew', he: 'Hebrew',
    ces: 'Czech', cze: 'Czech', cs: 'Czech',
    hun: 'Hungarian', hu: 'Hungarian',
    ron: 'Romanian', rum: 'Romanian', ro: 'Romanian',
    ukr: 'Ukrainian', uk: 'Ukrainian',
    msa: 'Malay', ms: 'Malay',
    fil: 'Filipino', tl: 'Filipino'
};

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
                if (!token || typeof token !== 'string' || token.toLowerCase().includes('invalid') || token.toLowerCase().includes('mismatched') || token.toLowerCase().includes('error') || token.trim().length < 12) {
                    // Upstream token generation failed (e.g. Cloudflare Turnstile block), skip to avoid serving dead 403 streams
                    continue;
                }
                const url = rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token.trim());
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


async function getImdbId(type, tmdbId) {
    if (!tmdbId) return null;
    const strId = String(tmdbId);
    if (strId.startsWith('tt')) return strId;
    const cacheKey = `${type}:${strId}`;
    if (imdbIdCache.has(cacheKey)) return imdbIdCache.get(cacheKey);

    try {
        const isTV = type === 'tv';
        const url = `https://api.themoviedb.org/3/${isTV ? 'tv' : 'movie'}/${encodeURIComponent(strId)}/external_ids?api_key=${TMDB_API_KEY}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            const data = await res.json();
            if (data && data.imdb_id) {
                imdbIdCache.set(cacheKey, data.imdb_id);
                return data.imdb_id;
            }
        }
    } catch {}
    return null;
}

const CP1252_MAP = {
    '\u20AC': '\x80', '\u201A': '\x82', '\u0192': '\x83', '\u201E': '\x84',
    '\u2026': '\x85', '\u2020': '\x86', '\u2021': '\x87', '\u02C6': '\x88',
    '\u2030': '\x89', '\u0160': '\x8A', '\u2039': '\x8B', '\u0152': '\x8C',
    '\u017D': '\x8E', '\u2018': '\x91', '\u2019': '\x92', '\u201C': '\x93',
    '\u201D': '\x94', '\u2022': '\x95', '\u2013': '\x96', '\u2014': '\x97',
    '\u02DC': '\x98', '\u2122': '\x99', '\u0161': '\x9A', '\u203A': '\x9B',
    '\u0153': '\x9C', '\u017E': '\x9E', '\u0178': '\x9F'
};

const MOJIBAKE_MAP = [
    [/PokÃ©mon/g, 'Pokémon'],
    [/pokÃ©mon/g, 'pokémon'],
    [/PokÃ©/g, 'Poké'],
    [/pokÃ©/g, 'poké'],
    [/â€™/g, '’'], [/â€˜/g, '‘'], [/â€œ/g, '“'], [/â€\u009d/g, '”'], [/â€/g, '”'],
    [/â€”/g, '—'], [/â€“/g, '–'], [/â€¦/g, '…'], [/â€¢/g, '•'], [/â„¢/g, '™'],
    [/â™ª/g, '♪'], [/â™«/g, '♫'], [/Â♪/g, '♪'], [/Â♫/g, '♫'],
    [/Â¿/g, '¿'], [/Â¡/g, '¡'], [/Â«/g, '«'], [/Â»/g, '»'],
    [/Â°/g, '°'], [/Â±/g, '±'], [/Â©/g, '©'], [/Â®/g, '®'],
    [/Ã©/g, 'é'], [/Ã¨/g, 'è'], [/Ãª/g, 'ê'], [/Ã«/g, 'ë'],
    [/Ã¡/g, 'á'], [/Ã /g, 'à'], [/Ã¢/g, 'â'], [/Ã¤/g, 'ä'], [/Ã£/g, 'ã'], [/Ã¥/g, 'å'],
    [/Ã­/g, 'í'], [/Ã¬/g, 'ì'], [/Ã®/g, 'î'], [/Ã¯/g, 'ï'],
    [/Ã³/g, 'ó'], [/Ã²/g, 'ò'], [/Ã´/g, 'ô'], [/Ã¶/g, 'ö'], [/Ãµ/g, 'õ'], [/Ã¸/g, 'ø'],
    [/Ãº/g, 'ú'], [/Ã¹/g, 'ù'], [/Ã»/g, 'û'], [/Ã¼/g, 'ü'],
    [/Ã½/g, 'ý'], [/Ã¿/g, 'ÿ'], [/Ã±/g, 'ñ'], [/Ã§/g, 'ç'],
    [/Ã‰/g, 'É'], [/Ãˆ/g, 'È'], [/ÃŠ/g, 'Ê'], [/Ã‹/g, 'Ë'],
    [/Ã\u0081/g, 'Á'], [/Ã\u0080/g, 'À'], [/Ã\u0082/g, 'Â'], [/Ã\u0084/g, 'Ä'],
    [/Ã\u008D/g, 'Í'], [/Ã\u008C/g, 'Ì'], [/Ã\u008E/g, 'Î'], [/Ã\u008F/g, 'Ï'],
    [/Ã\u0093/g, 'Ó'], [/Ã\u0092/g, 'Ò'], [/Ã\u0094/g, 'Ô'], [/Ã\u0096/g, 'Ö'],
    [/Ã\u009A/g, 'Ú'], [/Ã\u0099/g, 'Ù'], [/Ã\u009B/g, 'Û'], [/Ã\u009C/g, 'Ü'],
    [/Ã\u0091/g, 'Ñ'], [/Ã\u0087/g, 'Ç'],
    [/Â(?=[\x20-\x7E])/g, '']
];

function fixSubtitleMojibake(text) {
    if (!text || typeof text !== 'string') return text || '';
    if (!/[ÃÂâ][\u0080-\u00FF\u2000-\u2122]|\uFFFD|PokÃ©/i.test(text)) {
        return text;
    }

    let normalized = text;
    for (const [k, v] of Object.entries(CP1252_MAP)) {
        if (normalized.includes(k)) {
            normalized = normalized.split(k).join(v);
        }
    }

    const utf8Regex = /(?:[\xC2-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF4][\x80-\xBF]{3})+/g;
    let repaired = normalized.replace(utf8Regex, (match) => {
        try {
            const bytes = new Uint8Array(match.length);
            for (let i = 0; i < match.length; i++) {
                bytes[i] = match.charCodeAt(i) & 0xFF;
            }
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
            return match;
        }
    });

    for (const [regex, rep] of MOJIBAKE_MAP) {
        repaired = repaired.replace(regex, rep);
    }

    return repaired;
}

function srtToVtt(srtText) {
    if (!srtText || typeof srtText !== 'string') return 'WEBVTT\n\n';
    const cleanText = fixSubtitleMojibake(srtText);
    if (cleanText.trim().startsWith('WEBVTT')) return cleanText;
    let vtt = cleanText
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    vtt = vtt.replace(/(\d{2}:\d{2}),(\d{3})/g, '00:$1.$2');
    return 'WEBVTT\n\n' + vtt.trim() + '\n';
}

async function fetchSubtitles(type, tmdbId, season = 1, episode = 1, explicitImdbId = '') {
    const isTV = type === 'tv';
    const se = season || 1;
    const ep = episode || 1;
    const cacheKey = `${type}:${tmdbId || explicitImdbId}:${isTV ? `${se}:${ep}` : '0'}`;

    const cached = subtitleCache.get(cacheKey);
    if (cached && Date.now() - cached.time < SUB_CACHE_TTL_MS) {
        return cached.subtitles;
    }

    let imdbId = explicitImdbId;
    if (!imdbId || !imdbId.startsWith('tt')) {
        imdbId = await getImdbId(type, tmdbId);
    }

    if (!imdbId) {
        return [];
    }

    const subtitles = [];
    const seenUrls = new Set();
    const seenLangCounts = {};

    try {
        const stremioUrl = isTV
            ? `https://opensubtitles-v3.strem.io/subtitles/series/${encodeURIComponent(imdbId)}:${encodeURIComponent(se)}:${encodeURIComponent(ep)}.json`
            : `https://opensubtitles-v3.strem.io/subtitles/movie/${encodeURIComponent(imdbId)}.json`;

        const res = await fetch(stremioUrl, {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            signal: AbortSignal.timeout(7000)
        });

        if (res.ok) {
            const data = await res.json();
            const rawSubs = Array.isArray(data?.subtitles) ? data.subtitles : [];

            for (const s of rawSubs) {
                if (!s || !s.url || seenUrls.has(s.url)) continue;
                seenUrls.add(s.url);

                const rawLang = String(s.lang || 'eng').toLowerCase();
                const baseLabel = LANGUAGE_LABELS[rawLang] || rawLang.toUpperCase();
                const count = (seenLangCounts[rawLang] || 0) + 1;
                seenLangCounts[rawLang] = count;

                let label = baseLabel;
                if (count > 1) {
                    label = `${baseLabel} (${count})`;
                }

                subtitles.push({
                    id: s.id ? `sub-${s.id}` : `sub-${rawLang}-${count}`,
                    lang: rawLang.slice(0, 2),
                    langCode: rawLang,
                    label,
                    url: s.url,
                    vttUrl: `/api/x8rr/subtitles/vtt?url=${encodeURIComponent(s.url)}`,
                    source: 'OpenSubtitles'
                });
            }
        }
    } catch (e) {
        console.warn('[x8rr/movies] Subtitle fetch notice:', e.message);
    }

    if (subtitles.length > 0) {
        const langPriority = ['eng', 'en', 'spa', 'es', 'fre', 'fra', 'fr', 'ger', 'deu', 'de', 'ita', 'it', 'por', 'pob', 'pt', 'jpn', 'ja', 'kor', 'ko', 'zho', 'zh'];
        subtitles.sort((a, b) => {
            const idxA = langPriority.indexOf(a.langCode);
            const idxB = langPriority.indexOf(b.langCode);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.label.localeCompare(b.label);
        });
        subtitleCache.set(cacheKey, { subtitles, time: Date.now() });
    }

    return subtitles;
}

async function handleX8rrVttProxy(req, res, targetUrl) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

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
            signal: AbortSignal.timeout(10000)
        });

        if (!r.ok) {
            res.writeHead(r.status, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Upstream subtitle returned ${r.status}`);
            return true;
        }

        const text = await r.text();
        const vtt = srtToVtt(text);

        res.writeHead(200, {
            'Content-Type': 'text/vtt; charset=utf-8',
            'Cache-Control': 'public, max-age=86400'
        });
        res.end(vtt);
        return true;
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Subtitle proxy failed', message: e.message }));
        return true;
    }
}

async function handleX8rrSubtitlesApi(req, res, requestPath, query) {
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

    const movieMatch = requestPath.match(/^\/api\/(?:x8rr\/)?subtitles\/movie\/([0-9]+)$/i);
    const tvMatch = requestPath.match(/^\/api\/(?:x8rr\/)?subtitles\/tv\/([0-9]+)\/([0-9]+)\/([0-9]+)$/i);

    if (movieMatch) {
        type = 'movie';
        tmdbId = movieMatch[1];
    } else if (tvMatch) {
        type = 'tv';
        tmdbId = tvMatch[1];
        season = parseInt(tvMatch[2], 10) || 1;
        episode = parseInt(tvMatch[3], 10) || 1;
    } else if (requestPath === '/api/x8rr/subtitles' || requestPath === '/api/stream/subtitles') {
        type = (query.get('type') || 'movie').toLowerCase();
        tmdbId = query.get('id') || query.get('tmdb') || '';
        season = parseInt(query.get('season') || query.get('s') || '1', 10);
        episode = parseInt(query.get('episode') || query.get('e') || '1', 10);
    } else {
        return false;
    }

    let imdbId = query.get('imdb') || '';
    const searchQuery = (query.get('q') || query.get('query') || '').trim();

    if (!tmdbId && searchQuery) {
        if (/^tt\d{5,}$/i.test(searchQuery)) {
            imdbId = searchQuery;
        } else {
            try {
                const sUrl = `https://api.themoviedb.org/3/search/${type === 'tv' ? 'tv' : 'movie'}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}`;
                const sRes = await fetch(sUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
                if (sRes.ok) {
                    const sData = await sRes.json();
                    if (sData.results && sData.results.length > 0) {
                        tmdbId = String(sData.results[0].id);
                    }
                }
            } catch {}
        }
    }

    if (!tmdbId && !imdbId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing TMDB ID, IMDb ID, or search query', subtitles: [] }));
        return true;
    }

    try {
        const subtitles = await fetchSubtitles(type, tmdbId, season, episode, imdbId);
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=600'
        });
        res.end(JSON.stringify({
            ok: true,
            source: 'x8rr/subtitles',
            type,
            tmdbId,
            imdbId,
            season: type === 'tv' ? season : undefined,
            episode: type === 'tv' ? episode : undefined,
            subtitles
        }));
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message, subtitles: [] }));
    }
    return true;
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
        const [streams, subtitles] = await Promise.all([
            scrapeAll(type, tmdbId, season, episode),
            fetchSubtitles(type, tmdbId, season, episode).catch(() => [])
        ]);

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
            streams,
            subtitles
        }));
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message, streams: [], subtitles: [] }));
    }
    return true;
}

module.exports = {
    scrapeAll,
    fetchSubtitles,
    srtToVtt,
    handleX8rrProxy,
    handleX8rrVttProxy,
    handleX8rrSubtitlesApi,
    handleX8rrStreamApi
};
