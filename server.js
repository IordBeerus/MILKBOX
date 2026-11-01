const http = require('http');
const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const { Innertube, Platform } = require('youtubei.js');
const { handleStreamResolve, handleStreamProxy } = require('./stream-provider');
const { handleX8rrProxy, handleX8rrStreamApi } = require('./x8rr-movies');
const { initWatchPartyServer } = require('./watch-party-server');

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
    const tmdbCredential = process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkODIxZmZjZjFhMjQxOWFhMWZjZjY5MjMwMDZjZmNjNCIsIm5iZiI6MTc3NzU2MDc0My45NzMsInN1YiI6IjY5ZjM2Y2E3ZDZhZjA3Yjg2Zjg0MzA3MSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ._CFnVPW7SyxmHdzu3Uxee0LkMlGm4zdW2uCNFV2g9A8';
    if (!tmdbCredential) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'TMDB_API_KEY or TMDB_ACCESS_TOKEN is not configured' }));
        return true;
    }
    const rawTargetPath = requestPath === marker ? '/' : requestPath.slice(marker.length);
    const cleanTargetPath = (rawTargetPath.startsWith('/') ? rawTargetPath : `/${rawTargetPath}`).replace(/\/+/g, '/');
    const target = new URL(`https://api.themoviedb.org/3${cleanTargetPath}`);
    for (const [key, value] of query) {
        if (key !== 'api_key') target.searchParams.set(key, value);
    }
    if (!target.searchParams.has('language')) target.searchParams.set('language', 'en-US');
    const isReadAccessToken = /^Bearer\s+/i.test(tmdbCredential) || tmdbCredential.startsWith('eyJ');
    const headers = {
        'Accept': 'application/json',
        'User-Agent': 'MILKBOX/1.0 (Mozilla/5.0; Streaming; TMDB Proxy)'
    };
    if (isReadAccessToken) headers.Authorization = `Bearer ${tmdbCredential.replace(/^Bearer\s+/i, '')}`;
    else target.searchParams.set('api_key', tmdbCredential);
    try {
        const response = await fetch(target, { headers });
        const body = await response.text();
        const cacheControl = response.ok ? 'public, max-age=180, stale-while-revalidate=600' : 'no-store';
        res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': cacheControl });
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

const ANNOUNCEMENTS_PATH = path.join(__dirname, 'announcements.json');
const OWNER_HASH_PATH = path.join(__dirname, '.owner_hash');
const OWNER_REVOKED_PATH = path.join(__dirname, '.owner_revoked_hashes');
const DEFAULT_OWNER_HASH = '66f9725023472f286313db3388f8a8ff22428fd8c2ac1da1d64acb720dcf2858';

function getActiveOwnerHash() {
    try {
        if (fs.existsSync(OWNER_HASH_PATH)) {
            const h = fs.readFileSync(OWNER_HASH_PATH, 'utf8').trim();
            if (h && h.length === 64) return h;
        }
    } catch (_) {}
    return DEFAULT_OWNER_HASH;
}

function getRevokedOwnerHashes() {
    try {
        if (fs.existsSync(OWNER_REVOKED_PATH)) {
            const list = JSON.parse(fs.readFileSync(OWNER_REVOKED_PATH, 'utf8'));
            if (Array.isArray(list)) return list;
        }
    } catch (_) {}
    return [];
}

function verifyOwnerHash(hash) {
    if (!hash || typeof hash !== 'string') return false;
    const clean = hash.trim().toLowerCase();
    const active = getActiveOwnerHash().toLowerCase();
    const revoked = getRevokedOwnerHashes().map(h => String(h).toLowerCase());
    if (revoked.includes(clean)) return false;
    return clean === active;
}

function readStoredAnnouncements() {
    try {
        if (fs.existsSync(ANNOUNCEMENTS_PATH)) {
            const data = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_PATH, 'utf8'));
            if (Array.isArray(data)) return data;
        }
    } catch (e) {
        console.warn('[Announcements] Failed to parse announcements.json:', e.message);
    }
    return [];
}

function saveStoredAnnouncements(list) {
    fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify(list, null, 2), 'utf8');
}

async function handleAnnouncements(req, res, requestPath) {
    if (!requestPath.startsWith('/api/announcements') && requestPath !== '/api/owner/update-passcode') {
        return false;
    }

    if (requestPath === '/api/announcements' && req.method === 'GET') {
        const list = readStoredAnnouncements();
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify(list));
        return true;
    }

    if (requestPath === '/api/owner/update-passcode') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return true;
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { oldHash, newHash } = JSON.parse(body || '{}');
                if (!verifyOwnerHash(oldHash)) {
                    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Unauthorized: Current owner passcode is incorrect or revoked.' }));
                    return;
                }
                if (!newHash || typeof newHash !== 'string' || newHash.length !== 64) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Invalid new passcode hash format.' }));
                    return;
                }
                const revoked = getRevokedOwnerHashes();
                if (!revoked.includes(oldHash)) revoked.push(oldHash);
                fs.writeFileSync(OWNER_REVOKED_PATH, JSON.stringify(revoked, null, 2), 'utf8');
                fs.writeFileSync(OWNER_HASH_PATH, newHash.trim(), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, message: 'Owner passcode successfully updated.' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message || 'Invalid request' }));
            }
        });
        return true;
    }

    if (requestPath === '/api/announcements/publish') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return true;
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { announcement, ownerHash } = JSON.parse(body || '{}');
                if (!verifyOwnerHash(ownerHash)) {
                    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Unauthorized: Only the site owner can publish announcements.' }));
                    return;
                }
                if (!announcement || !announcement.title || !announcement.message) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Title and message are required.' }));
                    return;
                }
                const cleanAnn = {
                    id: String(announcement.id || `ann-${Date.now()}`),
                    title: String(announcement.title).slice(0, 140),
                    message: String(announcement.message).slice(0, 1000),
                    category: String(announcement.category || 'Added Content').slice(0, 50),
                    date: String(announcement.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })),
                    badge: String(announcement.badge || "WHAT'S NEW").slice(0, 30),
                    isBanner: announcement.isBanner !== false
                };

                let list = readStoredAnnouncements();
                // Remove if already exists with same ID
                list = list.filter(item => item && item.id !== cleanAnn.id);
                // Prepend new announcement to the top so everyone sees it first
                list.unshift(cleanAnn);
                if (list.length > 50) list = list.slice(0, 50);

                saveStoredAnnouncements(list);
                console.log(`[Announcements] Published announcement: "${cleanAnn.title}" (${cleanAnn.id})`);

                // Asynchronously sync to GitHub so the main branch is updated for milkbox.fyi
                setTimeout(() => {
                    try {
                        syncToGitHub(`📢 Announcement: ${cleanAnn.title}`);
                    } catch (syncErr) {
                        console.warn('[Announcements] GitHub sync notice:', syncErr.message);
                    }
                }, 50);

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, announcement: cleanAnn, announcements: list }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message || 'Invalid request body' }));
            }
        });
        return true;
    }

    if (requestPath === '/api/announcements/delete') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return true;
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { id, ownerHash } = JSON.parse(body || '{}');
                if (!verifyOwnerHash(ownerHash)) {
                    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Unauthorized: Only the site owner can remove announcements.' }));
                    return;
                }
                if (!id) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Announcement ID is required.' }));
                    return;
                }
                let list = readStoredAnnouncements();
                const originalLength = list.length;
                list = list.filter(item => item && item.id !== id);
                saveStoredAnnouncements(list);
                console.log(`[Announcements] Deleted announcement ID: ${id}`);

                if (list.length !== originalLength) {
                    setTimeout(() => {
                        try {
                            syncToGitHub(`🗑️ Remove announcement: ${id}`);
                        } catch (syncErr) {
                            console.warn('[Announcements] GitHub sync notice:', syncErr.message);
                        }
                    }, 50);
                }

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, id, announcements: list }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message || 'Invalid request' }));
            }
        });
        return true;
    }

    return false;
}

async function proxyGoogleDriveStream(req, res, requestPath, query) {
    if (requestPath !== '/api/gdrive/stream') return false;

    const fileId = (query.get('fileId') || '').trim();
    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Valid Google Drive fileId is required' }));
        return true;
    }

    const authHeader = req.headers.authorization || (query.get('token') ? `Bearer ${query.get('token')}` : '');
    if (!authHeader) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Authorization header or token parameter required' }));
        return true;
    }

    try {
        const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
        const fetchHeaders = {
            'Authorization': authHeader,
            'User-Agent': 'MILKBOX-MusicPlayer/1.0'
        };
        if (req.headers.range) {
            fetchHeaders['Range'] = req.headers.range;
        }

        const driveRes = await fetch(driveUrl, { headers: fetchHeaders });
        const passHeaders = {
            'Content-Type': driveRes.headers.get('content-type') || 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=7200'
        };
        if (driveRes.headers.get('content-range')) passHeaders['Content-Range'] = driveRes.headers.get('content-range');
        if (driveRes.headers.get('content-length')) passHeaders['Content-Length'] = driveRes.headers.get('content-length');

        res.writeHead(driveRes.status, passHeaders);
        if (driveRes.body) {
            const { Readable } = require('stream');
            Readable.fromWeb(driveRes.body).pipe(res);
        } else {
            res.end();
        }
    } catch (err) {
        console.error('[GDrive Stream] Error:', err.message);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Google Drive stream failed', message: err.message }));
        }
    }
    return true;
}

const GDRIVE_CACHE_FILE = path.join(__dirname, 'gdrive-library-cache.json');
let inMemoryGDriveChunks = {};

async function handleGoogleDriveLibrary(req, res, requestPath) {
    if (!requestPath.startsWith('/api/gdrive/library/')) return false;

    if (requestPath === '/api/gdrive/library/chunk') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return true;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { chunkIndex, totalChunks, tracks, folderId, folderName } = JSON.parse(body || '{}');
                const key = folderId || 'default';

                if (!inMemoryGDriveChunks[key] || chunkIndex === 0) {
                    inMemoryGDriveChunks[key] = {
                        tracks: [],
                        folderId,
                        folderName,
                        totalChunks: totalChunks || 1,
                        updatedAt: Date.now()
                    };
                }

                if (Array.isArray(tracks)) {
                    inMemoryGDriveChunks[key].tracks.push(...tracks);
                }

                // If last chunk or completed, persist to gdrive-library-cache.json
                if (chunkIndex === totalChunks - 1 || inMemoryGDriveChunks[key].tracks.length >= 0) {
                    try {
                        fs.writeFileSync(GDRIVE_CACHE_FILE, JSON.stringify({
                            folderId: inMemoryGDriveChunks[key].folderId,
                            folderName: inMemoryGDriveChunks[key].folderName,
                            updatedAt: inMemoryGDriveChunks[key].updatedAt,
                            tracks: inMemoryGDriveChunks[key].tracks
                        }));
                    } catch (e) {
                        console.warn('[GDrive Library] Cache save notice:', e.message);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    success: true,
                    chunkIndex,
                    totalChunks,
                    storedTracks: inMemoryGDriveChunks[key].tracks.length
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid chunk payload', message: err.message }));
            }
        });
        return true;
    }

    if (requestPath === '/api/gdrive/library/cache') {
        if (req.method !== 'GET') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return true;
        }

        try {
            if (fs.existsSync(GDRIVE_CACHE_FILE)) {
                const content = fs.readFileSync(GDRIVE_CACHE_FILE, 'utf8');
                const parsed = JSON.parse(content);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, ...parsed }));
                return true;
            }
        } catch (e) {}

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ success: true, tracks: [] }));
        return true;
    }

    if (requestPath === '/api/gdrive/library/clear') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return true;
        }

        inMemoryGDriveChunks = {};
        try {
            if (fs.existsSync(GDRIVE_CACHE_FILE)) {
                fs.unlinkSync(GDRIVE_CACHE_FILE);
            }
        } catch (e) {}

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, cleared: true }));
        return true;
    }

    return false;
}

async function proxyMiruro(req, res, requestPath, query) {
    if (!requestPath.startsWith('/api/miruro') && !requestPath.startsWith('/api/anikoto')) return false;

    // Direct Anikoto API proxy
    if (requestPath.startsWith('/api/anikoto/')) {
        const sub = requestPath.slice('/api/anikoto'.length);
        const target = new URL(`https://anikotoapi.site${sub}`);
        for (const [key, value] of query) target.searchParams.append(key, value);
        try {
            const upstream = await fetch(target, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
            const data = await upstream.text();
            res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(data);
        } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return true;
    }

    const subPath = requestPath.slice('/api/miruro'.length) || '/';
    const infoMatch = subPath.match(/^\/info\/(\d+)$/);
    const miruroApiBase = process.env.MIRURO_API_URL || 'https://miruro-api.onrender.com';

    try {
        const target = new URL(`${miruroApiBase.replace(/\/$/, '')}${subPath}`);
        for (const [key, value] of query) target.searchParams.append(key, value);
        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        };
        const upstream = await fetch(target, { headers, signal: AbortSignal.timeout(5000) });
        if (upstream.ok) {
            const body = await upstream.text();
            res.writeHead(200, {
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            res.end(body);
            return true;
        }
    } catch {}

    // Fallback: Miruro native AniList GraphQL query per walterwhite-69/Miruro-API specification
    if (infoMatch) {
        const anilistId = parseInt(infoMatch[1], 10);
        try {
            const gql = `query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    idMal
                    title { romaji english native }
                    description(asHtml: false)
                    coverImage { large extraLarge color }
                    bannerImage
                    format
                    season
                    seasonYear
                    episodes
                    duration
                    status
                    averageScore
                    meanScore
                    popularity
                    genres
                    studios { nodes { id name isAnimationStudio siteUrl } }
                    nextAiringEpisode { episode airingAt timeUntilAiring }
                    streamingEpisodes { title thumbnail url site }
                }
            }`;
            const aniRes = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ query: gql, variables: { id: anilistId } }),
                signal: AbortSignal.timeout(8000)
            });
            const aniData = await aniRes.json();
            if (aniData && aniData.data && aniData.data.Media) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(aniData.data.Media));
                return true;
            }
        } catch {}
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, notice: 'Miruro API server standby', path: subPath }));
    return true;
}

// Scramjet proxy service
async function handleScramjetProxy(req, res, requestPath, query) {
    if (!requestPath.startsWith('/api/scramjet/')) return false;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    if (requestPath === '/api/scramjet/status') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
            ok: true,
            proxy: 'Scramjet Reverse Proxy & Wisp Gateway',
            version: '2.5.0',
            status: 'operational',
            wisp: 'wss://wisp.classroom.lat/',
            sources: ['vidsrc', 'cinesrc', 'vidlink']
        }));
        return true;
    }

    if (requestPath === '/api/scramjet/embed') {
        const targetUrl = query.get('url');
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>Scramjet Proxy Error</h1><p>Missing "url" parameter.</p>');
            return true;
        }

        try {
            const parsed = new URL(targetUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error('Invalid URL protocol');
            }

            const upstream = await fetch(parsed.href, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': parsed.origin + '/'
                },
                signal: AbortSignal.timeout(12000),
                redirect: 'follow'
            });

            if (!upstream.ok) {
                res.writeHead(upstream.status, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head><meta charset="utf-8"><title>Scramjet Proxy Notice</title></head>
                    <body style="background:#09090e;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
                        <div style="padding:24px;max-width:440px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,46,99,0.3);border-radius:12px;">
                            <div style="font-size:32px;margin-bottom:10px;">⚡</div>
                            <h3 style="margin:0 0 8px 0;color:#ff2e63;">Scramjet Proxy: Upstream (${upstream.status})</h3>
                            <p style="margin:0;font-size:13px;color:#a0a0b0;">Source temporarily unreachable. Switching automatically to next proxy source...</p>
                        </div>
                    </body>
                    </html>
                `);
                return true;
            }

            const contentType = upstream.headers.get('content-type') || 'text/html';

            if (contentType.includes('text/html')) {
                let html = await upstream.text();
                const baseTag = `<base href="${parsed.origin}/">\n<meta name="referrer" content="no-referrer">\n`;
                const shieldScript = `
<script>
(function() {
    try {
        // Scramjet Anti-Popunder & Sandbox Protection Shield
        window.open = function() { console.log('[Scramjet Proxy] Blocked popup window'); return null; };
        window.alert = function() {};
        window.confirm = function() { return true; };
        window.prompt = function() { return null; };
        window.onbeforeunload = null;
        window.addEventListener('beforeunload', function(e) { e.stopImmediatePropagation(); }, true);
    } catch (e) {}
})();
</script>
`;
                if (/<head[^>]*>/i.test(html)) {
                    html = html.replace(/<head([^>]*)>/i, `<head$1>\n${baseTag}${shieldScript}`);
                } else {
                    html = `<!DOCTYPE html><html><head>${baseTag}${shieldScript}</head><body>${html}</body></html>`;
                }

                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Permissions-Policy': 'autoplay=*, fullscreen=*, picture-in-picture=*',
                    'Cache-Control': 'public, max-age=120'
                });
                res.end(html);
                return true;
            } else {
                const buf = await upstream.arrayBuffer();
                res.writeHead(upstream.status, {
                    'Content-Type': contentType,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=600'
                });
                res.end(Buffer.from(buf));
                return true;
            }
        } catch (err) {
            console.warn('[Scramjet Proxy] Fetch notice:', err.message);
            res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"><title>Scramjet Proxy Notice</title></head>
                <body style="background:#09090e;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
                    <div style="padding:24px;max-width:440px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,46,99,0.3);border-radius:12px;">
                        <div style="font-size:32px;margin-bottom:10px;">⚡</div>
                        <h3 style="margin:0 0 8px 0;color:#ff2e63;">Scramjet Proxy Connection Notice</h3>
                        <p style="margin:0;font-size:13px;color:#a0a0b0;">${err.message || 'Upstream timeout'}. Switching automatically...</p>
                    </div>
                </body>
                </html>
            `);
            return true;
        }
    }

    if (requestPath === '/api/scramjet/proxy') {
        const targetUrl = query.get('url');
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return true;
        }

        try {
            const parsed = new URL(targetUrl);
            const upstream = await fetch(parsed.href, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': parsed.origin + '/'
                },
                signal: AbortSignal.timeout(12000)
            });

            const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
            res.writeHead(upstream.status, {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=600'
            });

            const buf = await upstream.arrayBuffer();
            res.end(Buffer.from(buf));
            return true;
        } catch (e) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy fetch failed', message: e.message }));
            return true;
        }
    }

    return false;
}

let watchPartyServer = null;

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Owner-Hash');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    if (proxyHealth(requestPath, res)) return;
    if (requestPath === '/api/x8rr/proxy' || requestPath === '/api/proxy') {
        if (await handleX8rrProxy(req, res, query.get('url'))) return;
    }
    if (requestPath.startsWith('/api/x8rr/stream') || requestPath.startsWith('/api/stream/movie/') || requestPath.startsWith('/api/stream/tv/') || requestPath === '/api/stream/scrape') {
        if (await handleX8rrStreamApi(req, res, requestPath, query)) return;
    }
    if (await handleScramjetProxy(req, res, requestPath, query)) return;
    if (await resolvePlayback(req, res, requestPath, query)) return;
    if (await proxyTmdb(req, res, requestPath, query)) return;
    if (await proxyMangaDex(req, res, requestPath, query)) return;
    if (await proxyKissKh(req, res, requestPath, query)) return;
    if (await proxyMiruro(req, res, requestPath, query)) return;
    if (await downloadYouTube(req, res, requestPath, query)) return;
    if (await proxyTrailerSearch(req, res, requestPath, query)) return;
    if (await handleGitHubSync(req, res, requestPath)) return;
    if (await handleAnnouncements(req, res, requestPath)) return;
    if (await handleStreamResolve(req, res, requestPath, query)) return;
    if (await handleStreamProxy(req, res, requestPath, query)) return;
    if (await proxyGoogleDriveStream(req, res, requestPath, query)) return;
    if (await handleGoogleDriveLibrary(req, res, requestPath)) return;

    if (requestPath === '/api/party/room') {
        const code = (query.get('code') || '').trim().toUpperCase();
        if (!code) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Room code required' }));
            return;
        }
        const room = watchPartyServer ? watchPartyServer.getRoomInfo(code) : null;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ exists: !!room, room }));
        return;
    }

    // Milkbox Custom Player Embed Routes:
    // - Movies: /movie/{tmdbId}
    // - TV Shows: /tv/{tmdbId}/{season}/{episode}
    // - Anime: /anime/{anilistId}/{episode}
    const cleanPath = requestPath.replace(/\/+$/, '');
    const isEmbedRoute =
        /^\/(embed\/)?movie\/[0-9]+$/i.test(cleanPath) ||
        /^\/(embed\/)?tv\/[0-9]+\/[0-9]+\/[0-9]+$/i.test(cleanPath) ||
        /^\/(embed\/)?anime\/[0-9]+\/[0-9]+$/i.test(cleanPath);

    if (isEmbedRoute) {
        const embedPath = path.resolve(root, './milkbox-embed.html');
        fs.readFile(embedPath, (err, embedContent) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Player Embed error');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(embedContent);
        });
        return;
    }

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
            // Dedicated player embed fallback: /movie/:id, /tv/:id/:s/:e, /anime/:id/:ep
            if (/^\/(movie|tv|anime)\//i.test(requestedFile)) {
                const embedPath = path.resolve(root, './milkbox-embed.html');
                fs.readFile(embedPath, (err, embedContent) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('Player embed error');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(embedContent);
                });
                return;
            }

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
        const ext = path.extname(filePath).toLowerCase();
        const type = mimeTypes[ext] || 'application/octet-stream';
        const isStaticAsset = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'].includes(ext);
        const cacheControl = isStaticAsset ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-cache';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cacheControl });
        res.end(content);
    });
});

watchPartyServer = initWatchPartyServer(server);

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
