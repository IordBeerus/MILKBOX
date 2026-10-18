const http = require('http');
const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const { Innertube, Platform } = require('youtubei.js');

Platform.shim.eval = async (data) => new Function(data.output)();

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || match[1] in process.env) continue;
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
}

loadEnvFile();
const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
};

async function proxyMangaDex(req, res, requestPath, query) {
    if (!requestPath.startsWith('/api/mangadex/')) return false;
    const target = new URL(`https://api.mangadex.org${requestPath.slice('/api/mangadex'.length)}`);
    for (const [key, value] of query) target.searchParams.append(key, value);
    try {
        const headers = { Accept: 'application/json' };
        if (process.env.MANGADEX_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.MANGADEX_ACCESS_TOKEN}`;
        const response = await fetch(target, { headers });
        const body = await response.text();
        res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'MangaDex proxy failed', message: error.message }));
    }
    return true;
}

async function resolvePlayback(req, res, requestPath, query) {
    if (requestPath !== '/api/playback/resolve') return false;
    const respond = (status, body) => {
        const safeStatus = (status === 502 || status === 503) ? 500 : status;
        res.writeHead(safeStatus, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET', 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return true;
    }

    const id = query.get('id') || '';
    const idType = query.get('idType') || '';
    const type = query.get('type') || '';
    const season = query.get('season') || '1';
    const episode = query.get('episode') || '1';
    if ((idType === 'tmdb' && !/^[1-9]\d*$/.test(id)) ||
        (idType === 'imdb' && !/^tt\d{5,}$/i.test(id)) ||
        !['tmdb', 'imdb'].includes(idType) ||
        !['movie', 'tv'].includes(type) ||
        !/^[1-9]\d*$/.test(season) ||
        !/^[1-9]\d*$/.test(episode)) {
        respond(400, { error: 'Provide a valid TMDB/IMDb ID, media type, season, and episode.' });
        return true;
    }

    const apiUrl = process.env.MILKBOX_PLAYBACK_API_URL;
    if (!apiUrl) {
        respond(500, { error: 'MILKBOX_PLAYBACK_API_URL is not configured.' });
        return true;
    }

    try {
        const target = new URL(apiUrl);
        if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Playback API URL must use HTTP or HTTPS.');
        for (const [key, value] of Object.entries({ id, idType, type, season: type === 'tv' ? season : '1', episode: type === 'tv' ? episode : '1' })) {
            target.searchParams.set(key, value);
        }
        const headers = { Accept: 'application/json' };
        if (process.env.MILKBOX_PLAYBACK_API_KEY) headers.Authorization = `Bearer ${process.env.MILKBOX_PLAYBACK_API_KEY}`;
        const upstream = await fetch(target, { headers, signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) {
            respond(500, { error: `Playback API request failed (${upstream.status}).` });
            return true;
        }
        const data = await upstream.json();
        if (!data || typeof data.url !== 'string') {
            respond(500, { error: 'Playback API response must contain a string "url" field.' });
            return true;
        }
        const playbackUrl = new URL(data.url);
        if (!['http:', 'https:'].includes(playbackUrl.protocol) || playbackUrl.username || playbackUrl.password) {
            respond(500, { error: 'Playback API returned an invalid media URL.' });
            return true;
        }
        respond(200, { url: playbackUrl.href, title: typeof data.title === 'string' ? data.title : '' });
    } catch (error) {
        respond(500, { error: 'Playback API request failed. Check the configured URL and API response.' });
    }
    return true;
}

async function proxyTmdb(req, res, requestPath, query) {
    const marker = '/api/tmdb';
    if (requestPath !== marker && !requestPath.startsWith(`${marker}/`)) return false;
    const tmdbCredential = process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN;
    if (!tmdbCredential) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'TMDB_API_KEY or TMDB_ACCESS_TOKEN is not configured' }));
        return true;
    }
    const targetPath = requestPath === marker ? '/' : requestPath.slice(marker.length);
    const target = new URL(`https://api.themoviedb.org/3${targetPath}`);
    for (const [key, value] of query) target.searchParams.append(key, value);
    if (!target.searchParams.has('language')) target.searchParams.set('language', 'en-US');
    const isReadAccessToken = /^Bearer\s+/i.test(tmdbCredential) || tmdbCredential.startsWith('eyJ');
    const headers = { Accept: 'application/json' };
    if (isReadAccessToken) headers.Authorization = `Bearer ${tmdbCredential.replace(/^Bearer\s+/i, '')}`;
    else target.searchParams.set('api_key', tmdbCredential);
    try {
        const response = await fetch(target, { headers });
        const body = await response.text();
        res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'TMDB proxy failed', message: error.message }));
    }
    return true;
}

function proxyHealth(requestPath, res) {
    if (!requestPath.endsWith('/api/health') && requestPath !== '/api/health') return false;
    const configured = Boolean(process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: configured, tmdb: configured ? 'configured' : 'missing' }));
    return true;
}

// KissKH search / drama-detail proxy — lets the app resolve a real KissKH episode id
// for ANY genre (drama, movie, K-show, BL, anime) so /kisskh/{id} plays the right title.
async function proxyKissKh(req, res, requestPath, query) {
    let target;
    if (requestPath === '/api/kisskh/search') {
        target = `https://kisskh.co/api/DramaList/Search?q=${encodeURIComponent(query.get('q') || '')}`;
    } else if (requestPath.startsWith('/api/kisskh/drama/')) {
        const id = requestPath.slice('/api/kisskh/drama/'.length);
        target = `https://kisskh.co/api/DramaList/Drama/${encodeURIComponent(id)}?isq=false`;
    } else {
        return false;
    }
    try {
        const response = await fetch(target, { headers: { Accept: 'application/json' } });
        const body = await response.text();
        res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch (error) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'KissKH proxy failed', message: error.message }));
    }
    return true;
}

async function resolveYouTubeFormat(videoId) {
    const attempts = [
        { client_type: 'ANDROID', quality: 'best', type: 'video+audio', format: 'mp4' },
        { client_type: 'WEB', quality: 'best', type: 'video+audio', format: 'mp4' },
        { client_type: 'ANDROID', quality: 'best', type: 'video+audio', format: 'any' },
        { client_type: 'WEB', quality: 'best', type: 'video+audio', format: 'any' }
    ];
    let lastError;
    for (const attempt of attempts) {
        try {
            const { client_type, ...options } = attempt;
            const youtube = await Innertube.create({ client_type });
            const format = await youtube.getStreamingData(videoId, options);
            if (format?.url) return format;
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(lastError?.message || 'No downloadable stream was found for this video');
}

async function downloadYouTube(req, res, requestPath, query) {
    if (requestPath !== '/api/youtube/download') return false;
    if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method not allowed');
        return true;
    }

    const videoUrl = query.get('url') || '';
    let videoId;
    try {
        videoId = new URL(videoUrl).searchParams.get('v') || new URL(videoUrl).pathname.split('/').pop();
    } catch {
        videoId = '';
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Paste a valid YouTube video URL.' }));
        return true;
    }

    try {
        const format = await resolveYouTubeFormat(videoId);
        const upstream = await fetch(format.url);
        if (!upstream.ok || !upstream.body) throw new Error(`YouTube media request failed with status ${upstream.status}`);
        const headers = {
            'Content-Type': format.mime_type?.split(';')[0] || 'video/mp4',
            'Content-Disposition': `attachment; filename="youtube-${videoId}.mp4"`,
            'Cache-Control': 'no-store'
        };
        if (format.content_length) headers['Content-Length'] = format.content_length;
        res.writeHead(200, headers);
        upstream.body.pipeTo(Writable.toWeb(res)).catch((error) => res.destroy(error));
    } catch (error) {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Unable to prepare the YouTube download', message: error.message }));
        }
    }
    return true;
}

let innertubeSingleton = null;
async function getInnertube() {
    if (!innertubeSingleton) innertubeSingleton = await Innertube.create();
    return innertubeSingleton;
}

const trailerCache = new Map();

async function proxyTrailerSearch(req, res, requestPath, query) {
    if (requestPath !== '/api/trailer/search') return false;
    const q = (query.get('q') || '').trim();
    if (!q) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing query parameter q' }));
        return true;
    }
    const cacheKey = q.toLowerCase();
    if (trailerCache.has(cacheKey)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
        res.end(JSON.stringify(trailerCache.get(cacheKey)));
        return true;
    }
    try {
        const yt = await getInnertube();
        const search = await yt.search(q, { type: 'video' });
        const first = search.videos?.[0];
        if (first && first.id) {
            const data = { key: first.id, title: first.title?.text || '' };
            trailerCache.set(cacheKey, data);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
            res.end(JSON.stringify(data));
            return true;
        }
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'No video found' }));
    } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Search failed', message: err.message }));
    }
    return true;
}

const { syncToGitHub, getSyncStatus, saveToken } = require('./sync-github.js');

async function handleGitHubSync(req, res, requestPath) {
    if (requestPath === '/api/github/status') {
        const status = getSyncStatus();
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify(status));
        return true;
    }
    if (requestPath === '/api/github/save-token') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return true;
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const rawToken = parsed.token || '';
                if (!rawToken || !rawToken.trim().startsWith('ghp_')) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Token must be a valid GitHub Personal Access Token starting with ghp_' }));
                    return;
                }
                const saved = saveToken(rawToken.trim());
                if (saved) {
                    const syncResult = syncToGitHub('Initial sync after token update');
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, message: 'Token saved and synced successfully', syncResult }));
                } else {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Failed to save token to system' }));
                }
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message || 'Invalid request body' }));
            }
        });
        return true;
    }
    if (requestPath !== '/api/github/sync') return false;
    try {
        const result = syncToGitHub('Sync via MILKBOX API');
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify(result));
    } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'GitHub sync failed', message: err.message }));
    }
    return true;
}


async function proxyMiruro(req, res, requestPath, query) {
    if (!requestPath.startsWith('/api/miruro/') && requestPath !== '/api/miruro') return false;
    const subPath = requestPath.slice('/api/miruro'.length) || '/';
    const miruroApiBase = process.env.MIRURO_API_URL || 'https://miruro-api.onrender.com';
    const target = new URL(`${miruroApiBase.replace(/\/$/, '')}${subPath}`);
    for (const [key, value] of query) target.searchParams.append(key, value);

    try {
        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        };
        const upstream = await fetch(target, { headers, signal: AbortSignal.timeout(8000) });
        const body = await upstream.text();
        res.writeHead(upstream.status === 502 || upstream.status === 503 ? 500 : upstream.status, {
            'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(body);
    } catch (error) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Miruro API proxy notice', message: error.message }));
    }
    return true;
}

const server = http.createServer(async (req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    if (proxyHealth(requestPath, res)) return;
    if (await resolvePlayback(req, res, requestPath, query)) return;
    if (await proxyTmdb(req, res, requestPath, query)) return;
    if (await proxyMangaDex(req, res, requestPath, query)) return;
    if (await proxyKissKh(req, res, requestPath, query)) return;
    if (await proxyMiruro(req, res, requestPath, query)) return;
    if (await downloadYouTube(req, res, requestPath, query)) return;
    if (await proxyTrailerSearch(req, res, requestPath, query)) return;
    if (await handleGitHubSync(req, res, requestPath)) return;
    if (requestPath.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Endpoint not found', path: requestPath }));
        return;
    }
    const requestedFile = requestPath === '/' ? '/index.html' : requestPath;
    const normalizedRelative = path.normalize(requestedFile).replace(/^(\.\.[\/\\])+/, '');
    const basename = path.basename(normalizedRelative);

    // Block sensitive files (.env, .git, config secrets, server scripts, etc.)
    const isSensitive = 
        basename.startsWith('.') ||
        basename.endsWith('.env') ||
        basename === 'sync-github.js' ||
        basename === 'render.yaml' ||
        normalizedRelative.includes('/.');

    if (isSensitive) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Access forbidden' }));
        return;
    }

    const filePath = path.resolve(root, `.${requestedFile}`);

    if (!filePath.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            // SPA fallback: routes without file extension serve index.html
            if (!path.extname(requestedFile)) {
                const indexPath = path.resolve(root, './index.html');
                fs.readFile(indexPath, (err, indexContent) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('Server error');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(indexContent);
                });
                return;
            }

            // If a JavaScript file is missing or 404, never return HTML/text that causes SyntaxError
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.js' || ext === '.mjs') {
                res.writeHead(404, { 'Content-Type': 'text/javascript; charset=utf-8' });
                res.end('/* File not found */');
                return;
            }

            res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
            return;
        }
        const type = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(content);
    });
});

server.listen(port, '0.0.0.0', () => {
    console.log(`MILKBOX running at http://localhost:${port}`);
    // Startup auto-sync after server initializes
    setTimeout(() => {
        try {
            console.log('[Auto-Sync] Initiating startup sync to GitHub...');
            syncToGitHub('Startup auto-sync: MILKBOX');
        } catch (e) {
            console.warn('[Auto-Sync] Startup sync notice:', e.message);
        }
    }, 4000);

    // Continuous auto-sync every 5 minutes
    setInterval(() => {
        try {
            console.log('[Auto-Sync] Initiating periodic background sync to GitHub...');
            syncToGitHub('Periodic auto-sync: MILKBOX');
        } catch (e) {
            console.warn('[Auto-Sync] Periodic sync notice:', e.message);
        }
    }, 5 * 60 * 1000);
});
