const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

// -------------------------------------------------------------
// Keys rotation & auto-discovery (from x8rr/movies keys.js)
// -------------------------------------------------------------
const REFRESH_COOLDOWN = 10 * 60 * 1000;

class RotatingKey {
    constructor({ name, env, fallback, discover }) {
        this.name = name;
        this.current = (env && process.env[env]) || fallback;
        this.discover = discover;
        this.lastRefresh = 0;
        this.refreshing = null;
    }

    async use(fn) {
        const tried = this.current;
        try {
            return await fn(tried);
        } catch (err) {
            const candidates = await this.refresh();
            for (const k of candidates) {
                if (k === tried) continue;
                try {
                    const out = await fn(k);
                    if (this.current !== k) {
                        console.log(`[x8rr/keys] ${this.name}: rotated key to ${k.slice(0, 10)}...`);
                    }
                    this.current = k;
                    return out;
                } catch {}
            }
            throw err;
        }
    }

    refresh() {
        if (this.refreshing) return this.refreshing;
        if (Date.now() - this.lastRefresh < REFRESH_COOLDOWN) return Promise.resolve([]);
        this.lastRefresh = Date.now();
        this.refreshing = (async () => {
            try {
                if (typeof this.discover !== 'function') return [];
                const list = await this.discover();
                const uniq = [...new Set(list)];
                console.log(`[x8rr/keys] ${this.name}: key failed, found ${uniq.length} candidate(s)`);
                return uniq;
            } catch (e) {
                console.warn(`[x8rr/keys] ${this.name}: discovery failed:`, e.message);
                return [];
            } finally {
                this.refreshing = null;
            }
        })();
        return this.refreshing;
    }
}

async function fetchPageScripts(pageUrl, filter = () => true) {
    try {
        const get = (u) => fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) })
            .then((r) => {
                if (!r.ok) throw new Error(`${u} ${r.status}`);
                return r.text();
            });
        const html = await get(pageUrl);
        const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]))]
            .map((s) => new URL(s, pageUrl))
            .filter((u) => u.origin === new URL(pageUrl).origin && filter(u.pathname));
        const scripts = await Promise.all(srcs.map((u) => get(u.href).catch(() => '')));
        return [html, ...scripts];
    } catch {
        return [];
    }
}

function stringLiterals(code, body) {
    if (!code || typeof code !== 'string') return [];
    const re = new RegExp(`(["'\`])(${body})\\1`, 'g');
    return [...code.matchAll(re)].map((m) => m[2]);
}

// -------------------------------------------------------------
// Live link validation (from x8rr/movies providers.js)
// -------------------------------------------------------------
const CHECK_TIMEOUT = 4000;

async function isAlive(stream) {
    if (!stream || !stream.url) return false;
    if (stream.url.includes('/embed.') || stream.url.includes('/embed/')) return false;

    const headers = {
        'User-Agent': UA,
        Referer: new URL(stream.url).origin + '/',
        ...(stream.headers || {})
    };

    try {
        if (stream.type === 'hls' || stream.url.includes('.m3u8')) {
            const r = await fetch(stream.url, { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT) });
            if (!r.ok) return false;
            const text = await r.text();
            const trimmed = text.trimStart();
            return trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#EXT-X-');
        }
        const r = await fetch(stream.url, {
            headers: { ...headers, Range: 'bytes=0-0' },
            signal: AbortSignal.timeout(CHECK_TIMEOUT)
        });
        r.body?.cancel();
        return r.status === 200 || r.status === 206;
    } catch {
        return false;
    }
}

async function checkStreams(streams) {
    if (!Array.isArray(streams) || streams.length === 0) return [];
    const alive = await Promise.all(streams.map((s) => isAlive(s).catch(() => false)));
    return streams.filter((_, i) => alive[i]);
}

function unwrapStreamUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
        const u = new URL(rawUrl);
        if (u.hostname.includes('workers.dev') && u.searchParams.has('url')) {
            const realUrl = u.searchParams.get('url');
            const data = u.searchParams.get('data');
            if (realUrl) {
                if (data && !realUrl.includes('data=')) {
                    return realUrl + (realUrl.includes('?') ? '&' : '?') + 'data=' + encodeURIComponent(data);
                }
                return realUrl;
            }
        }
    } catch {}
    return rawUrl;
}

// -------------------------------------------------------------
// Provider 1: VidZee (player.vidzee.wtf / core.vidzee.wtf)
// -------------------------------------------------------------
const VIDZEE_PLAYER = 'https://player.vidzee.wtf';
const VIDZEE_CORE = 'https://core.vidzee.wtf';
const VIDZEE_HEADERS = { 'User-Agent': UA, Referer: VIDZEE_PLAYER + '/', Origin: VIDZEE_PLAYER };
let vidzeeWasm = null;

async function getVidzeeWasm() {
    if (vidzeeWasm) return vidzeeWasm;
    try {
        const js = await fetch(VIDZEE_PLAYER + '/assets/streams-BHpSC3gU.js', { headers: VIDZEE_HEADERS }).then((r) => r.text());
        const b64 = js.match(/["'](AGFzbQ[A-Za-z0-9+/=]+)["']/)?.[1];
        if (b64) {
            vidzeeWasm = await WebAssembly.compile(Buffer.from(b64, 'base64'));
            return vidzeeWasm;
        }
    } catch {}
    return null;
}

async function decryptVidzee(c) {
    try {
        const mod = await getVidzeeWasm();
        if (!mod) return null;
        const { exports: x } = await WebAssembly.instantiate(mod, {
            env: {
                abort() { throw new Error('vidzee wasm abort'); }
            }
        });
        const data = Buffer.from(c, 'base64');
        const dv = () => new DataView(x.memory.buffer);
        const buf = x.__pin(x.__new(data.length, 1)) >>> 0;
        const arr = x.__pin(x.__new(12, 6)) >>> 0;
        dv().setUint32(arr, buf, true);
        dv().setUint32(arr + 4, buf, true);
        dv().setUint32(arr + 8, data.length, true);
        new Uint8Array(x.memory.buffer, buf, data.length).set(data);
        x.__unpin(buf);

        const host = 'player.vidzee.wtf';
        const str = x.__new(host.length << 1, 2) >>> 0;
        const u16 = new Uint16Array(x.memory.buffer);
        for (let i = 0; i < host.length; i++) u16[(str >>> 1) + i] = host.charCodeAt(i);

        try {
            const out = x.decrypt(arr, str) >>> 0;
            if (!out) return null;
            const ptr = dv().getUint32(out + 4, true);
            const len = dv().getUint32(out + 8, true);
            return JSON.parse(new TextDecoder().decode(new Uint8Array(x.memory.buffer, ptr, len)));
        } finally {
            x.__unpin(arr);
        }
    } catch {
        return null;
    }
}

async function getVidzeeServer(path, server) {
    try {
        const r = await fetch(`${VIDZEE_CORE}/streams/${path}?s=${encodeURIComponent(server.id)}`, {
            headers: VIDZEE_HEADERS,
            signal: AbortSignal.timeout(9000)
        });
        if (!r.ok) return null;
        let data = await r.json();
        if (data && typeof data.c === 'string' && !data.url) {
            data = await decryptVidzee(data.c);
        }
        if (!data?.url) return null;

        const headers = data.headers && Object.keys(data.headers).length
            ? data.headers
            : /fastcloud|vercetti|nexcloud/.test(data.url)
                ? { Referer: VIDZEE_PLAYER + '/', Origin: VIDZEE_PLAYER }
                : undefined;

        return {
            url: data.url,
            type: /\.(mp4|mkv|webm)(\?|$)/i.test(data.url) ? 'file' : 'hls',
            quality: '1080p Ultra',
            provider: 'vidzee',
            providerName: 'VidZee ' + server.label,
            serverLabel: `VidZee (${server.label})`,
            ...(headers ? { headers } : {})
        };
    } catch {
        return null;
    }
}

async function vidzeeExtract(type, tmdbId, season, episode) {
    try {
        const isTV = type !== 'movie';
        const path = isTV ? `tv/${tmdbId}/${season || 1}/${episode || 1}` : `movie/${tmdbId}`;
        const langs = await fetch(`${VIDZEE_CORE}/streams/languages/${path}`, {
            headers: VIDZEE_HEADERS,
            signal: AbortSignal.timeout(6000)
        })
            .then((r) => (r.ok ? r.json() : {}))
            .then((d) => (Array.isArray(d?.languages) ? d.languages : []))
            .catch(() => []);

        const servers = [
            ...(isTV ? [] : [{ id: 'peak', label: 'Peak' }]),
            { id: 'dcloud', label: 'Dcloud' },
            ...langs.slice(0, 3).map((l) => ({ id: 'v4:' + l, label: 'Acme ' + l })),
            { id: 'tik', label: 'TCloud' },
            { id: 'v6:English', label: 'English' }
        ];

        const results = await Promise.all(servers.map((s) => getVidzeeServer(path, s)));
        return results.filter(Boolean);
    } catch (e) {
        console.warn('[x8rr/vidzee] error:', e.message);
        return [];
    }
}

// -------------------------------------------------------------
// Provider 2: VidRock (vidrock.net)
// -------------------------------------------------------------
const VIDROCK_BASE = 'https://vidrock.net';
const VIDROCK_HEADERS = { Referer: VIDROCK_BASE + '/', Origin: VIDROCK_BASE };

const VIDROCK_KEY = new RotatingKey({
    name: 'vidrock',
    env: 'VIDROCK_KEY',
    fallback: '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f',
    discover: async () => (await fetchPageScripts(VIDROCK_BASE + '/movie/550')).flatMap((c) => stringLiterals(c, '[0-9a-fA-F]{64}'))
});

function decryptVidrockUrl(enc, hexKey) {
    const buf = Buffer.from(enc, 'base64url');
    if (buf.length < 28) throw new Error('ciphertext too short');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(buf.length - 16));
    return Buffer.concat([decipher.update(buf.subarray(12, buf.length - 16)), decipher.final()]).toString('utf8');
}

async function expandVidrockJsonSource(url, name, headers) {
    try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
        if (!(r.headers.get('content-type') || '').includes('application/json')) return null;
        const list = await r.json();
        if (!Array.isArray(list) || !list[0]?.resolution || !list[0]?.url) return null;
        return list
            .sort((a, b) => b.resolution - a.resolution)
            .map((q) => ({
                url: q.url,
                type: /\.m3u8/i.test(q.url) ? 'hls' : 'file',
                quality: q.resolution + 'p',
                provider: 'vidrock',
                providerName: 'VidRock ' + name,
                serverLabel: `VidRock (${name} ${q.resolution}p)`,
                headers: VIDROCK_HEADERS
            }));
    } catch {
        return null;
    }
}

async function vidrockExtract(type, tmdbId, season, episode) {
    try {
        const isTV = type !== 'movie';
        const path = isTV ? `tv/${tmdbId}/${season || 1}/${episode || 1}` : `movie/${tmdbId}`;
        const headers = { 'User-Agent': UA, Referer: `${VIDROCK_BASE}/${path}`, Origin: VIDROCK_BASE };
        const resp = await fetch(`${VIDROCK_BASE}/api/${path}`, { headers, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) throw new Error('api ' + resp.status);
        const data = await resp.json();

        const lists = await Promise.all(
            Object.entries(data || {}).map(async ([name, src]) => {
                if (!src?.url) return [];
                let url;
                try {
                    url = await VIDROCK_KEY.use((k) => decryptVidrockUrl(src.url, k));
                } catch {
                    return [];
                }
                if (!/^https?:\/\//.test(url)) return [];
                const label = src.language && src.language !== 'English' ? `${name} (${src.language})` : name;
                if (src.type !== 'hls' && !/\.(mp4|mkv|m3u8)(\?|$)/i.test(url)) {
                    const expanded = await expandVidrockJsonSource(url, label, headers);
                    if (expanded) return expanded;
                }
                return [
                    {
                        url,
                        type: src.type === 'mp4' ? 'file' : 'hls',
                        quality: '1080p Ultra',
                        provider: 'vidrock',
                        providerName: 'VidRock ' + label,
                        serverLabel: `VidRock (${label})`,
                        headers: VIDROCK_HEADERS
                    }
                ];
            })
        );
        return lists.flat();
    } catch (e) {
        console.warn('[x8rr/vidrock] error:', e.message);
        return [];
    }
}

// -------------------------------------------------------------
// Provider 3: VidNest (vidnest.fun / new.vidnest.fun)
// -------------------------------------------------------------
const VIDNEST_SITE = 'https://vidnest.fun';
const VIDNEST_API = 'https://new.vidnest.fun';

const VIDNEST_SECRET = new RotatingKey({
    name: 'vidnest',
    env: 'VIDNEST_SECRET',
    fallback: 'K3p8vQ2mX9rL5wZ0fN7bG1sH4tJ6dC9_y8S3wM1nQ5pL2',
    discover: async () => {
        const code = (await fetchPageScripts(VIDNEST_SITE + '/movie/550')).join('\n');
        const host = VIDNEST_API.replace(/[.\/]/g, '\\$&');
        const near = [...code.matchAll(new RegExp(`=["'\`]([^"'\`]{16,128})["'\`],\\w+=["'\`]${host}["'\`]`, 'g'))].map((m) => m[1]);
        return [...near, ...stringLiterals(code, '[A-Za-z0-9_-]{32,64}')];
    }
});

const VIDNEST_ALFA_HOSTS = [
    'https://long-night-d802.streamed-5.workers.dev',
    'https://blue-bush-5977.streamed-7.workers.dev',
    'https://rapid-heart-03c8.streamed-4.workers.dev',
    'https://super-flower-9c85.streamed-2.workers.dev',
    'https://flat-sky-cf20.streamed-850.workers.dev',
    'https://vidrift-cf.streamed-8.workers.dev'
];

const VIDNEST_SERVERS = {
    catflix: 'yflix',
    filxer: 'rogflix',
    gama: 'vidzee',
    lamda: 'ophim',
    beta: 'flixhq',
    alfa: 'onehd',
    prime: 'rpmvid',
    zeta: 'nextgencloudfabric',
    ophim: 'klikxxi',
    sigma: 'hollymoviehd',
    delta: 'allmovies'
};

function b64url(s) {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return Buffer.from(t, 'base64');
}

async function decryptVidnest(j) {
    if (!(j && j.v === 2 && j.d)) return j;
    const buf = b64url(j.d);
    const out = await VIDNEST_SECRET.use(async (secret) => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${j.n}|${secret}`));
        const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, key, buf.subarray(12));
    });
    const text = new TextDecoder().decode(out);
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function fetchVidnestApi(path) {
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
    const resp = await fetch(`${VIDNEST_API}${path}?_n=${nonce}`, {
        headers: { 'User-Agent': UA, Referer: VIDNEST_SITE + '/', Origin: VIDNEST_SITE },
        signal: AbortSignal.timeout(9000)
    });
    if (!resp.ok) throw new Error(`${path} ${resp.status}`);
    return decryptVidnest(await resp.json());
}

function pickHeaders(h) {
    if (!h || typeof h !== 'object') return undefined;
    const out = {};
    for (const [k, v] of Object.entries(h)) {
        const key = k.trim();
        if (/^(referer|origin)$/i.test(key)) out[key[0].toUpperCase() + key.slice(1).toLowerCase()] = String(v).trim();
    }
    return Object.keys(out).length ? out : undefined;
}

function mkVidnestStream(server, url, { type, q, headers, label } = {}) {
    const cleanUrl = url.trim().replace(/\s+/g, '');
    const cleanLabel = `VidNest (${server[0].toUpperCase()}${server.slice(1)}${label ? ` ${label}` : ''})`;
    const s = {
        url: cleanUrl,
        type: type === 'mp4' ? 'file' : 'hls',
        quality: q || '1080p Ultra',
        provider: 'vidnest',
        providerName: `VidNest ${server[0].toUpperCase()}${server.slice(1)}`,
        serverLabel: cleanLabel
    };
    if (headers) s.headers = headers;
    return s;
}

const VIDNEST_HANDLERS = {
    catflix: (d) => (d?.url ? [mkVidnestStream('catflix', d.url, { headers: pickHeaders(d.headers) })] : []),
    filxer: (d) => (d?.url ? [mkVidnestStream('filxer', d.url)] : []),
    gama: (d) => (d?.streams || []).filter((s) => s?.url).map((s) => mkVidnestStream('gama', s.url, { type: s.type, q: s.quality, headers: pickHeaders(s.headers), label: s.language })),
    lamda: (d) => (d?.streams || []).filter((s) => s?.url).map((s) => mkVidnestStream('lamda', s.url, { type: s.type, q: s.quality, headers: pickHeaders(s.headers) })),
    beta: (d) => (d?.status === 'success' && d.url ? [mkVidnestStream('beta', d.url, { type: d.type, q: d.quality })] : []),
    alfa: (d) => d?.status === 'success'
        ? (d.streams || []).filter((s) => s?.url && ['original', 'multi'].includes((s.language || '').toLowerCase())).map((s, i) =>
            mkVidnestStream('alfa', /^https?:\/\//.test(s.url) ? s.url : VIDNEST_ALFA_HOSTS[i % VIDNEST_ALFA_HOSTS.length] + s.url, { type: s.type, q: s.quality })
        )
        : [],
    prime: (d) => (d?.streams || []).filter((s) => s?.url).map((s) =>
        mkVidnestStream('prime', s.url, {
            type: s.type,
            q: s.quality,
            headers: s.type === 'mp4' ? undefined : { Referer: 'https://vidora.stream/', Origin: 'https://vidora.stream' }
        })
    ),
    zeta: (d) => (d?.streams || []).filter((s) => s?.url).map((s) => mkVidnestStream('zeta', s.url, { type: s.type, q: s.quality, headers: pickHeaders(s.headers), label: s.language })),
    ophim: (d) => (d?.sources || []).filter((s) => s?.url).map((s) => mkVidnestStream('ophim', s.url, { type: s.type, q: s.quality })),
    sigma: (d) => (d?.streams || []).filter((s) => s?.url && s.type === 'hls' && s.language === 'GS-25').map((s) => mkVidnestStream('sigma', s.url, { headers: pickHeaders(s.headers) })),
    delta: (d) => (d?.streams || []).filter((s) => s?.url).map((s) => mkVidnestStream('delta', s.url, { type: s.type, headers: pickHeaders(s.headers), label: s.language }))
};

async function vidnestExtract(type, tmdbId, season, episode) {
    try {
        const isTV = type !== 'movie';
        const jobs = Object.entries(VIDNEST_SERVERS).map(async ([server, seg]) => {
            const path = isTV ? `/${seg}/tv/${tmdbId}/${season || 1}/${episode || 1}` : `/${seg}/movie/${tmdbId}`;
            try {
                const res = await fetchVidnestApi(path);
                return VIDNEST_HANDLERS[server] ? VIDNEST_HANDLERS[server](res) : [];
            } catch {
                return [];
            }
        });
        const streams = (await Promise.all(jobs)).flat();
        return streams;
    } catch (e) {
        console.warn('[x8rr/vidnest] error:', e.message);
        return [];
    }
}

// -------------------------------------------------------------
// Provider 4: VidSpark (vidspark.to)
// -------------------------------------------------------------
const VIDSPARK_BASE = 'https://vidspark.to';

const VIDSPARK_KEY = new RotatingKey({
    name: 'vidspark',
    env: 'VIDSPARK_KEY',
    fallback: '3a67e8866ae1d2bb9e81fe7f73315a56eb3bdf5e3e755c7554c8be6910aa6b13',
    discover: async () => (await fetchPageScripts(VIDSPARK_BASE + '/movie/550')).flatMap((c) => stringLiterals(c, '[0-9a-fA-F]{64}'))
});

async function vidsparkExtract(type, tmdbId, season, episode) {
    try {
        const isTV = type !== 'movie';
        const path = isTV ? `/tv/${tmdbId}/${season || 1}/${episode || 1}` : `/movie/${tmdbId}`;
        const resp = await VIDSPARK_KEY.use(async (key) => {
            const r = await fetch(`${VIDSPARK_BASE}/api/vidora/v1${path}`, {
                headers: {
                    'User-Agent': UA,
                    Referer: VIDSPARK_BASE + path,
                    'x-player-key': key
                },
                signal: AbortSignal.timeout(8000)
            });
            if (r.status === 401) throw new Error('api 401');
            return r;
        });

        const data = await resp.json().catch(() => null);
        if (!data?.result) return [];

        return (data.sources || [])
            .filter((s) => s?.url)
            .map((s, idx) => ({
                url: s.url,
                type: s.url.includes('.m3u8') ? 'hls' : 'file',
                quality: '1080p Ultra',
                provider: 'vidspark',
                providerName: 'VidSpark',
                serverLabel: `VidSpark ${idx > 0 ? `(${idx + 1})` : '1080p'}`,
                headers: { Referer: VIDSPARK_BASE + '/', Origin: VIDSPARK_BASE }
            }));
    } catch (e) {
        console.warn('[x8rr/vidspark] error:', e.message);
        return [];
    }
}

// -------------------------------------------------------------
// Provider 5: 2Embed (vidsrc.buzz)
// -------------------------------------------------------------
const TWOEMBED_BASE = 'https://vidsrc.buzz';
const TWOEMBED_API = TWOEMBED_BASE + '/pl/api.php';
const MAX_MINTS = 4;

async function getTwoembedJson(url) {
    try {
        const r = await fetch(url, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(6000)
        });
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    }
}

async function twoembedExtract(type, tmdbId, season, episode) {
    try {
        const isTV = type !== 'movie';
        const path = isTV ? `/embed/tv/${tmdbId}/${season || 1}/${episode || 1}` : `/embed/movie/${tmdbId}`;
        const resp = await fetch(TWOEMBED_BASE + path, {
            headers: { 'User-Agent': UA, Referer: 'https://www.2embed.cc/' },
            signal: AbortSignal.timeout(8000)
        });
        if (!resp.ok) return [];
        const html = await resp.text();
        const m = html.match(/var Q = (\{.*?\});\n/s);
        if (!m) return [];
        const q = JSON.parse(m[1]);
        const servers = q.ssr?.servers || [];
        if (!q.t || !servers.length) return [];

        const ordered = [
            ...servers.filter((s) => !/XPM/i.test(s.name)),
            ...servers.filter((s) => /XPM/i.test(s.name))
        ];

        const chunks = [];
        for (let i = 0; i < ordered.length; i += 6) {
            chunks.push(ordered.slice(i, i + 6).map((s) => s.ref));
        }

        const cands = (await Promise.all(chunks.map((refs) =>
            getTwoembedJson(`${TWOEMBED_API}?a=race&refs=${encodeURIComponent(refs.join(','))}`).then((d) => d?.cands || [])
        ))).flat();

        const have = new Set(cands.map((c) => c.ref));
        const missing = ordered
            .filter((s) => !have.has(s.ref) && !/XPM/i.test(s.name))
            .slice(0, MAX_MINTS);

        const minted = await Promise.all(
            missing.map((s) =>
                getTwoembedJson(`${TWOEMBED_API}?a=play&ref=${encodeURIComponent(s.ref)}&t=${encodeURIComponent(q.t)}`).then((d) =>
                    d?.url ? { ref: s.ref, url: d.url, type: d.type } : null
                )
            )
        );

        const seen = new Set();
        const results = [];
        for (const s of [...cands, ...minted.filter(Boolean)]) {
            if (!s || !s.url) continue;
            const fullUrl = new URL(s.url, TWOEMBED_BASE + '/').href;
            if (seen.has(fullUrl)) continue;
            seen.add(fullUrl);
            results.push({
                url: fullUrl,
                type: s.type === 'mp4' ? 'file' : 'hls',
                quality: '1080p HD',
                provider: 'twoembed',
                providerName: '2Embed',
                serverLabel: '2Embed Fast HLS',
                headers: { Referer: TWOEMBED_BASE + '/', Origin: TWOEMBED_BASE }
            });
        }
        return results;
    } catch (e) {
        console.warn('[x8rr/twoembed] error:', e.message);
        return [];
    }
}

// -------------------------------------------------------------
// Provider 6: VixSrc (vixsrc.to)
// -------------------------------------------------------------
const VIXSRC_BASE = 'https://vixsrc.to';

async function vixsrcExtract(type, tmdbId, season, episode) {
    try {
        const isTV = type !== 'movie';
        const path = isTV ? `/tv/${tmdbId}/${season || 1}/${episode || 1}` : `/movie/${tmdbId}`;
        const headers = { 'User-Agent': UA, Referer: VIXSRC_BASE + path };
        const api = await fetch(VIXSRC_BASE + '/api' + path, { headers, signal: AbortSignal.timeout(6000) });
        if (!api.ok) return [];
        const { src } = await api.json();
        if (!src) return [];

        const embed = await fetch(VIXSRC_BASE + src, { headers, signal: AbortSignal.timeout(6000) });
        if (!embed.ok) return [];
        const html = await embed.text();
        const token = html.match(/['"]token['"]\s*:\s*['"]([^'"]+)['"]/)?.[1];
        const expires = html.match(/['"]expires['"]\s*:\s*['"]([^'"]+)['"]/)?.[1];
        const url = html.match(/masterPlaylist[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/)?.[1];
        if (!token || !expires || !url) return [];

        const fhd = /window\.canPlayFHD\s*=\s*true/.test(html);
        const u = new URL(url.replace(/\\\//g, '/'));
        u.searchParams.set('token', token);
        u.searchParams.set('expires', expires);
        if (fhd) u.searchParams.set('h', '1');
        u.searchParams.set('lang', 'en');

        return [
            {
                url: u.toString(),
                type: 'hls',
                quality: fhd ? '1080p Ultra' : '720p HD',
                provider: 'vixsrc',
                providerName: 'VixSrc',
                serverLabel: `VixSrc (${fhd ? '1080p Ultra' : 'HD'})`,
                headers: { Referer: VIXSRC_BASE + '/', Origin: VIXSRC_BASE }
            }
        ];
    } catch {
        return [];
    }
}

// -------------------------------------------------------------
// Provider 7: VidSrc & VidSrc.pm (VidSrc SH + VidOra)
// -------------------------------------------------------------
const wasmCache = new Map();
let lastKnownWasmModule = null;

async function getWasmModule(vs) {
    if (!vs) return lastKnownWasmModule;
    if (vs.wasm_url) {
        const key = `u:${vs.w ?? vs.wasm_url}`;
        if (wasmCache.has(key)) return wasmCache.get(key);
        try {
            const res = await fetch(vs.wasm_url, {
                headers: { 'User-Agent': UA, 'Referer': 'https://data.vidsrc.sh/', 'Origin': 'https://data.vidsrc.sh' },
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const ab = await res.arrayBuffer();
                if (ab && ab.byteLength > 60) {
                    const mod = await WebAssembly.compile(ab);
                    wasmCache.set(key, mod);
                    lastKnownWasmModule = mod;
                    return mod;
                }
            }
        } catch {
            wasmCache.delete(key);
        }
    }
    if (vs.wasm) {
        const key = `b:${vs.w ?? Math.random()}`;
        if (wasmCache.has(key)) return wasmCache.get(key);
        try {
            const bin = Buffer.from(vs.wasm, 'base64');
            const mod = await WebAssembly.compile(bin);
            wasmCache.set(key, mod);
            lastKnownWasmModule = mod;
            return mod;
        } catch {
            wasmCache.delete(key);
        }
    }
    return lastKnownWasmModule;
}

async function decryptStreamUrls(encB64, vs) {
    if (!encB64 || typeof encB64 !== 'string') return null;
    try {
        const mod = await getWasmModule(vs);
        if (!mod) return null;
        const inst = await WebAssembly.instantiate(mod, {});
        const { alloc, decrypt, memory } = inst.exports;
        if (!alloc || !decrypt || !memory) return null;
        const enc = Buffer.from(encB64, 'base64');
        if (enc.length === 0) return null;
        const ptr = alloc(enc.length);
        new Uint8Array(memory.buffer, ptr, enc.length).set(enc);
        const outLen = decrypt(ptr, enc.length);
        if (!outLen || outLen <= 0) return null;
        const text = new TextDecoder().decode(new Uint8Array(memory.buffer, ptr + 12, outLen));
        return text.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
        return null;
    }
}

async function vidsrcExtract(type, tmdbId, season, episode) {
    try {
        const isTV = type === 'tv';
        const srcPath = isTV ? `${tmdbId}/${season || 1}/${episode || 1}` : String(tmdbId);
        const apiResp = await fetch(
            `https://vidsrc.sh/vs_src.php?type=${isTV ? 'tv' : 'movie'}&id=${srcPath}`,
            { headers: { 'User-Agent': UA, Referer: 'https://vidsrc.sh/' }, signal: AbortSignal.timeout(5000) }
        );
        if (!apiResp.ok) return [];
        const { src } = await apiResp.json().catch(() => ({}));
        if (!src) return [];

        const landResp = await fetch(src, { headers: { 'User-Agent': UA, Referer: 'https://vidsrc.sh/' }, signal: AbortSignal.timeout(5000) });
        if (!landResp.ok) return [];
        const landHtml = await landResp.text();
        const cfgMatch = landHtml.match(/window\.CFG\s*=\s*(\{[^}]+\})/);
        if (!cfgMatch) return [];
        const cfg = JSON.parse(cfgMatch[1]);
        const origin = new URL(src).origin;

        const playerResp = await fetch(origin + cfg.playerUrl, { headers: { 'User-Agent': UA, Referer: origin + '/' }, signal: AbortSignal.timeout(5000) });
        if (!playerResp.ok) return [];
        const playerHtml = await playerResp.text();
        const configMatch = playerHtml.match(/window\.CONFIG\s*=\s*(\{.*?\});/s);
        if (!configMatch) return [];
        const config = JSON.parse(configMatch[1]);
        if (!config.apiToken) return [];

        let streamApiUrl = isTV
            ? `https://data.vidsrc.sh/api.php?type=tv&tmdb=${tmdbId}&season=${season || 1}&episode=${episode || 1}&stream_urls&api_token=${encodeURIComponent(config.apiToken)}`
            : `https://data.vidsrc.sh/api.php?type=movie&tmdb=${tmdbId}&stream_urls&api_token=${encodeURIComponent(config.apiToken)}`;

        const streamResp = await fetch(streamApiUrl, { headers: { 'User-Agent': UA, Referer: origin + '/' }, signal: AbortSignal.timeout(5000) });
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
                    const tokenGenUrl = host + '/generate.php?api_token=' + encodeURIComponent(config.apiToken);
                    hostTokens.set(
                        host,
                        fetch(tokenGenUrl, {
                            headers: { 'User-Agent': UA, 'Referer': origin + '/', Accept: 'application/json, text/plain, */*' },
                            signal: AbortSignal.timeout(4000)
                        })
                            .then((r) => r.text())
                            .then((t) => {
                                try {
                                    const j = JSON.parse(t);
                                    return typeof j === 'string' ? j : j.token || j.data || j.string || j.result || '';
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
                if (!token || typeof token !== 'string' || token.toLowerCase().includes('invalid') || token.toLowerCase().includes('error') || token.trim().length < 12) {
                    continue;
                }
                const unwrapped = unwrapStreamUrl(rawUrl);
                const url = unwrapped + (unwrapped.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token.trim());
                results.push({
                    url,
                    type: unwrapped.includes('.m3u8') ? 'hls' : 'file',
                    quality: '1080p Ultra',
                    provider: 'vidsrc',
                    providerName: `VidSrc Server ${serverIdx}`,
                    serverLabel: `VidSrc (${serverIdx === 1 ? 'Primary Ultra' : `Backup ${serverIdx}`})`
                });
                serverIdx++;
            } catch {}
        }
        return results;
    } catch {
        return [];
    }
}

const VIDORA_PLAYER_KEY = 'f3b72e73c80c9a996574379798703796a1936efa3516a7105cb0e43048b46b5a';
const VIDORA_SERVERS = [
    { key: 'vjej', label: 'Vega', quality: '1080p Ultra' },
    { key: 'nzv4', label: 'Zephyr', quality: 'Multi-Bitrate 1080p' },
    { key: 'b4tz', label: 'Beta', quality: '1080p Ultra' },
    { key: 'k2mq', label: 'Alpha', quality: '1080p Ultra' },
    { key: 'w7dn', label: 'Nebula', quality: '1080p HD' }
];

async function vidoraExtract(type, tmdbId, season = 1, episode = 1) {
    const isTV = type === 'tv';
    const subPath = isTV
        ? `tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
        : `movie/${encodeURIComponent(tmdbId)}`;

    const fetches = VIDORA_SERVERS.map(async (s) => {
        try {
            const endpoint = `https://vidsrc.pm/api/vidora/v1/${subPath}?source=${s.key}`;
            const res = await fetch(endpoint, {
                headers: {
                    'User-Agent': UA,
                    'x-player-key': VIDORA_PLAYER_KEY,
                    'Referer': `https://vidsrc.pm/embed/${subPath}`
                },
                signal: AbortSignal.timeout(4000)
            });
            if (!res.ok) return null;
            const data = await res.json().catch(() => null);
            if (!data || !data.result || !Array.isArray(data.sources) || data.sources.length === 0) return null;
            const streamObj = data.sources[0];
            if (!streamObj || !streamObj.url) return null;

            const finalUrl = unwrapStreamUrl(streamObj.url);
            return {
                url: finalUrl,
                type: 'hls',
                quality: s.quality,
                provider: 'vidsrc',
                providerName: `VidOra ${s.label}`,
                serverLabel: `VidOra (${s.label})`,
                headers: { Referer: 'https://vidsrc.pm/', Origin: 'https://vidsrc.pm' }
            };
        } catch {
            return null;
        }
    });

    const settled = await Promise.all(fetches);
    return settled.filter(Boolean);
}

// -------------------------------------------------------------
// Provider Runner (Primary New Providers & Classic Old Fallback Servers)
// -------------------------------------------------------------
const PRIMARY_PROVIDERS = [
    { id: 'vidzee', name: 'VidZee', extract: vidzeeExtract },
    { id: 'vidnest', name: 'VidNest', extract: vidnestExtract },
    { id: 'vidrock', name: 'VidRock', extract: vidrockExtract },
    { id: 'vidspark', name: 'VidSpark', extract: vidsparkExtract },
    { id: 'twoembed', name: '2Embed', extract: twoembedExtract },
    { id: 'vixsrc', name: 'VixSrc', extract: vixsrcExtract }
];

const FALLBACK_PROVIDERS = [
    { id: 'vidora', name: 'VidOra', extract: vidoraExtract },
    { id: 'vidsrc', name: 'VidSrc PM', extract: vidsrcExtract }
];

const PROVIDERS = [...PRIMARY_PROVIDERS, ...FALLBACK_PROVIDERS];

const PROVIDER_TIMEOUT = 10000;
const GRACE_AFTER_FIRST = 5500;
const HARD_DEADLINE = 11000;

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        promise,
        new Promise((r) => { timer = setTimeout(() => r([]), ms); })
    ]).finally(() => clearTimeout(timer));
}

async function scrapeAll(type, tmdbId, season = 1, episode = 1) {
    const isTV = type === 'tv';
    const se = season || 1;
    const ep = episode || 1;
    const cacheKey = `${type}:${tmdbId}:${isTV ? `${se}:${ep}` : '0'}`;

    const cached = streamCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
        return cached.streams;
    }

    if (process.env.X8RR_MOVIES_URL) {
        try {
            const base = process.env.X8RR_MOVIES_URL.replace(/\/+$/, '');
            const endpoint = isTV
                ? `${base}/api/stream/tv/${tmdbId}/${se}/${ep}`
                : `${base}/api/stream/movie/${tmdbId}`;
            const res = await fetch(endpoint, {
                headers: { 'User-Agent': UA },
                signal: AbortSignal.timeout(7000)
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.streams) && data.streams.length > 0) {
                    const formatted = data.streams.map((s, idx) => ({
                        url: s.url,
                        proxiedUrl: `/api/x8rr/proxy?url=${encodeURIComponent(s.url)}`,
                        type: s.type || (s.url && s.url.includes('.m3u8') ? 'hls' : 'file'),
                        quality: s.quality || '1080p Ultra',
                        provider: s.provider || 'x8rr',
                        providerName: s.providerName || `x8rr Source ${idx + 1}`,
                        serverLabel: s.serverLabel || `Server ${idx + 1}`,
                        isFallback: !!s.isFallback
                    }));
                    streamCache.set(cacheKey, { streams: formatted, time: Date.now() });
                    return formatted;
                }
            }
        } catch (upstreamErr) {
            console.warn('[x8rr/movies] Remote upstream notice:', upstreamErr.message);
        }
    }

    const primarySlots = PRIMARY_PROVIDERS.map(() => []);
    const fallbackSlots = FALLBACK_PROVIDERS.map(() => []);

    const primaryPending = PRIMARY_PROVIDERS.map((p, i) =>
        withTimeout(
            Promise.resolve()
                .then(() => p.extract(type, tmdbId, se, ep))
                .then(checkStreams)
                .catch(() => []),
            PROVIDER_TIMEOUT
        ).then((streams) => {
            primarySlots[i] = streams;
            return streams;
        })
    );

    const fallbackPending = FALLBACK_PROVIDERS.map((p, i) =>
        withTimeout(
            Promise.resolve()
                .then(() => p.extract(type, tmdbId, se, ep))
                .then(checkStreams)
                .catch(() => []),
            PROVIDER_TIMEOUT
        ).then((streams) => {
            fallbackSlots[i] = streams;
            return streams;
        })
    );

    await new Promise((resolve) => {
        let grace = null;
        const hard = setTimeout(resolve, HARD_DEADLINE);
        const done = () => {
            clearTimeout(hard);
            if (grace) clearTimeout(grace);
            resolve();
        };

        Promise.all([...primaryPending, ...fallbackPending]).then(done);

        for (const p of primaryPending) {
            p.then((streams) => {
                if (Array.isArray(streams) && streams.length > 0 && !grace) {
                    grace = setTimeout(done, GRACE_AFTER_FIRST);
                }
            });
        }
    });

    const primaryList = primarySlots.flat().filter(Boolean);
    const fallbackList = fallbackSlots.flat().filter(Boolean);
    const seenUrls = new Set();
    const formatted = [];
    let idx = 1;

    // 1. Primary Streams (New x8rr Providers: VidZee, VidNest, VidRock, VidSpark, 2Embed, VixSrc)
    for (const s of primaryList) {
        if (!s || !s.url || seenUrls.has(s.url)) continue;
        seenUrls.add(s.url);

        let hParam = '';
        if (s.headers && Object.keys(s.headers).length > 0) {
            try {
                hParam = `&h=${encodeURIComponent(Buffer.from(JSON.stringify(s.headers)).toString('base64'))}`;
            } catch {}
        }

        const proxiedUrl = `/api/x8rr/proxy?url=${encodeURIComponent(s.url)}${hParam}`;
        const baseLabel = s.serverLabel || s.providerName || `Server ${idx}`;
        const label = idx === 1
            ? `Server 1 (${baseLabel} · Primary)`
            : (idx === 2 ? `Server 2 (${baseLabel} · Ultra)` : `Server ${idx} (${baseLabel})`);

        formatted.push({
            id: `x8rr-srv-${idx}`,
            url: s.url,
            proxiedUrl,
            type: s.type || (s.url.includes('.m3u8') ? 'hls' : 'file'),
            quality: s.quality || '1080p Ultra',
            provider: s.provider || 'x8rr',
            providerName: s.providerName || `x8rr ${label}`,
            serverLabel: label,
            isFallback: false,
            headers: s.headers
        });
        idx++;
    }

    // 2. Old Servers Kept as Fallbacks (VidOra, VidSrc)
    for (const s of fallbackList) {
        if (!s || !s.url || seenUrls.has(s.url)) continue;
        seenUrls.add(s.url);

        let hParam = '';
        if (s.headers && Object.keys(s.headers).length > 0) {
            try {
                hParam = `&h=${encodeURIComponent(Buffer.from(JSON.stringify(s.headers)).toString('base64'))}`;
            } catch {}
        }

        const proxiedUrl = `/api/x8rr/proxy?url=${encodeURIComponent(s.url)}${hParam}`;
        const baseLabel = s.serverLabel || s.providerName || `Classic Server ${idx}`;
        const label = `Server ${idx} (${baseLabel} · Fallback)`;

        formatted.push({
            id: `x8rr-srv-${idx}`,
            url: s.url,
            proxiedUrl,
            type: s.type || (s.url.includes('.m3u8') ? 'hls' : 'file'),
            quality: s.quality || '1080p Ultra',
            provider: s.provider || 'vidsrc',
            providerName: `x8rr ${baseLabel} (Fallback)`,
            serverLabel: label,
            isFallback: true,
            fallback: true,
            headers: s.headers
        });
        idx++;
    }

    // 3. Guaranteed Embed Fallbacks if all direct HLS providers return empty
    if (formatted.length === 0) {
        const embedFallbacks = [
            {
                url: isTV
                    ? `https://vidsrc.pm/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}`
                    : `https://vidsrc.pm/embed/movie/${encodeURIComponent(tmdbId)}`,
                proxiedUrl: '',
                type: 'embed',
                quality: '1080p HD',
                provider: 'vidsrc',
                providerName: 'x8rr VidSrc PM (Classic Fallback)',
                serverLabel: 'Server 1 (VidSrc PM · Classic Fallback)',
                isFallback: true,
                fallback: true
            },
            {
                url: isTV
                    ? `https://vidsrc.sbs/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}`
                    : `https://vidsrc.sbs/embed/movie/${encodeURIComponent(tmdbId)}`,
                proxiedUrl: '',
                type: 'embed',
                quality: '1080p HD',
                provider: 'vidsrcsbs',
                providerName: 'x8rr VidSrc SBS (Classic Fallback)',
                serverLabel: 'Server 2 (VidSrc SBS · Classic Fallback)',
                isFallback: true,
                fallback: true
            }
        ];
        formatted.push(...embedFallbacks);
    }

    if (formatted.length > 0) {
        streamCache.set(cacheKey, { streams: formatted, time: Date.now() });
    }

    // Async background late collector: if fallback providers finish after initial return, append them to cache
    Promise.all(fallbackPending).then((fSlots) => {
        const lateFallback = fSlots.flat().filter(Boolean);
        if (lateFallback.length > 0) {
            const currentCache = streamCache.get(cacheKey);
            if (currentCache && Array.isArray(currentCache.streams)) {
                const hasFallbacks = currentCache.streams.some(s => s.isFallback);
                if (!hasFallbacks) {
                    const existingUrls = new Set(currentCache.streams.map(s => s.url));
                    let nextIdx = currentCache.streams.length + 1;
                    const appended = [...currentCache.streams];
                    for (const s of lateFallback) {
                        if (!s || !s.url || existingUrls.has(s.url)) continue;
                        existingUrls.add(s.url);
                        let hParam = '';
                        if (s.headers && Object.keys(s.headers).length > 0) {
                            try {
                                hParam = `&h=${encodeURIComponent(Buffer.from(JSON.stringify(s.headers)).toString('base64'))}`;
                            } catch {}
                        }
                        const proxiedUrl = `/api/x8rr/proxy?url=${encodeURIComponent(s.url)}${hParam}`;
                        const baseLabel = s.serverLabel || s.providerName || `Classic Server ${nextIdx}`;
                        const label = `Server ${nextIdx} (${baseLabel} · Fallback)`;
                        appended.push({
                            id: `x8rr-srv-${nextIdx}`,
                            url: s.url,
                            proxiedUrl,
                            type: s.type || (s.url.includes('.m3u8') ? 'hls' : 'file'),
                            quality: s.quality || '1080p Ultra',
                            provider: s.provider || 'vidsrc',
                            providerName: `x8rr ${baseLabel} (Fallback)`,
                            serverLabel: label,
                            isFallback: true,
                            fallback: true,
                            headers: s.headers
                        });
                        nextIdx++;
                    }
                    streamCache.set(cacheKey, { streams: appended, time: Date.now() });
                }
            }
        }
    }).catch(() => {});

    return formatted;
}

// -------------------------------------------------------------
// Stream Proxy Handler (With m3u8 playlist rewriting & custom headers)
// -------------------------------------------------------------
async function handleX8rrProxy(req, res, targetUrl) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

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

        const headers = {
            'User-Agent': UA,
            'Accept': '*/*'
        };

        const targetLower = targetUrl.toLowerCase();
        if (targetLower.includes('nectarandnectary.space') || targetLower.includes('stellarconductornexus.com') || targetLower.includes('vidsrc.sh')) {
            headers['Referer'] = 'https://stellarconductornexus.com/';
            headers['Origin'] = 'https://stellarconductornexus.com';
        } else if (targetLower.includes('hscow.com') || targetLower.includes('fcxmb.com') || targetLower.includes('majorplay.net') || targetLower.includes('vidsrc.pm') || targetLower.includes('hd4u.sbs') || targetLower.includes('finalsignal.top')) {
            headers['Referer'] = 'https://vidsrc.pm/';
            headers['Origin'] = 'https://vidsrc.pm';
        } else if (targetLower.includes('remoteconsultinggroup.site') || targetLower.includes('nextgencloudfabric.com')) {
            headers['Referer'] = 'https://nextgencloudfabric.com/';
            headers['Origin'] = 'https://nextgencloudfabric.com';
        } else if (targetLower.includes('vidspark') || targetLower.includes('paretocdn')) {
            headers['Referer'] = 'https://vidspark.to/';
            headers['Origin'] = 'https://vidspark.to';
        } else if (targetLower.includes('vidrock') || targetLower.includes('vercetti.org') || targetLower.includes('slowcloud.live')) {
            headers['Referer'] = 'https://vidrock.net/';
            headers['Origin'] = 'https://vidrock.net';
        } else if (targetLower.includes('vidzee') || targetLower.includes('fastcloud') || targetLower.includes('nexcloud')) {
            headers['Referer'] = 'https://player.vidzee.wtf/';
            headers['Origin'] = 'https://player.vidzee.wtf';
        } else if (targetLower.includes('vidnest') || targetLower.includes('vidora.stream') || targetLower.includes('netrocdn.site') || targetLower.includes('streamflixserver.site') || targetLower.includes('moviesapi.to')) {
            headers['Referer'] = 'https://vidnest.fun/';
            headers['Origin'] = 'https://vidnest.fun';
        } else if (targetLower.includes('vidsrc.buzz')) {
            headers['Referer'] = 'https://vidsrc.buzz/';
            headers['Origin'] = 'https://vidsrc.buzz';
        } else if (targetLower.includes('vixsrc')) {
            headers['Referer'] = 'https://vixsrc.to/';
            headers['Origin'] = 'https://vixsrc.to';
        } else {
            headers['Referer'] = parsed.origin + '/';
            headers['Origin'] = parsed.origin;
        }

        const reqQuery = new URL(req.url, 'http://localhost').searchParams;
        const hParam = reqQuery.get('h') || parsed.searchParams.get('h');
        if (hParam) {
            try {
                const customHeaders = JSON.parse(Buffer.from(hParam, 'base64').toString('utf8'));
                if (customHeaders && typeof customHeaders === 'object') {
                    for (const [k, v] of Object.entries(customHeaders)) {
                        headers[k] = String(v);
                    }
                }
            } catch {}
        }

        const dataParam = parsed.searchParams.get('data');
        if (dataParam) {
            try {
                const decoded = Buffer.from(dataParam, 'base64').toString('utf-8');
                const refMatch = decoded.match(/Referer=([^|&]+)/i);
                const origMatch = decoded.match(/Origin=([^|&]+)/i);
                if (refMatch) headers['Referer'] = refMatch[1].trim();
                if (origMatch) headers['Origin'] = origMatch[1].trim();
            } catch {}
        }

        if (req.headers && req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const r = await fetch(targetUrl, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers,
            signal: AbortSignal.timeout(20000)
        });

        if (!r.ok && r.status !== 206) {
            res.writeHead(r.status, {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain'
            });
            res.end(`Upstream returned ${r.status}`);
            return true;
        }

        const ct = (r.headers.get('content-type') || '').toLowerCase();

        if (ct.includes('mpegurl') || targetUrl.includes('.m3u8')) {
            let text = await r.text();
            const hostToken = parsed.searchParams.get('token');
            const origin = parsed.origin;
            const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

            text = text.replace(/URI="([^"]+)"/g, (match, uri) => {
                let abs;
                if (uri.startsWith('http://') || uri.startsWith('https://')) {
                    abs = uri;
                } else if (uri.startsWith('/')) {
                    abs = origin + uri;
                } else {
                    abs = basePath + uri;
                }
                if (hostToken && !abs.includes('token=')) {
                    abs += (abs.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(hostToken);
                }
                if (dataParam && !abs.includes('data=')) {
                    abs += (abs.includes('?') ? '&' : '?') + 'data=' + encodeURIComponent(dataParam);
                }
                const hSuffix = hParam ? `&h=${encodeURIComponent(hParam)}` : '';
                return `URI="/api/x8rr/proxy?url=${encodeURIComponent(abs)}${hSuffix}"`;
            });

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
                if (dataParam && !abs.includes('data=')) {
                    abs += (abs.includes('?') ? '&' : '?') + 'data=' + encodeURIComponent(dataParam);
                }
                const hSuffix = hParam ? `&h=${encodeURIComponent(hParam)}` : '';
                return `/api/x8rr/proxy?url=${encodeURIComponent(abs)}${hSuffix}`;
            });

            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Allow-Headers': '*'
            });
            res.end(text);
        } else {
            const status = r.status === 206 ? 206 : 200;
            const resHeaders = {
                'Content-Type': ct || 'video/MP2T',
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
            };
            if (r.headers.get('content-range')) resHeaders['Content-Range'] = r.headers.get('content-range');
            if (r.headers.get('content-length')) resHeaders['Content-Length'] = r.headers.get('content-length');
            if (r.headers.get('accept-ranges')) resHeaders['Accept-Ranges'] = r.headers.get('accept-ranges');
            res.writeHead(status, resHeaders);
            if (req.method === 'HEAD') {
                res.end();
            } else {
                const buf = Buffer.from(await r.arrayBuffer());
                res.end(buf);
            }
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

// -------------------------------------------------------------
// Subtitles Engine & Mojibake Repair
// -------------------------------------------------------------
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

    if (!imdbId) return [];

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
    PROVIDERS,
    scrapeAll,
    vidzeeExtract,
    vidnestExtract,
    vidrockExtract,
    vidsparkExtract,
    twoembedExtract,
    vixsrcExtract,
    vidsrcExtract,
    vidoraExtract,
    isAlive,
    checkStreams,
    fetchSubtitles,
    srtToVtt,
    handleX8rrProxy,
    handleX8rrVttProxy,
    handleX8rrSubtitlesApi,
    handleX8rrStreamApi
};
