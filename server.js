const http = require('http');
const fs = require('fs');
const path = require('path');

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
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'MangaDex proxy failed', message: error.message }));
    }
    return true;
}

async function proxyTmdb(req, res, requestPath, query) {
    if (!requestPath.startsWith('/api/tmdb/')) return false;
    const tmdbCredential = process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN;
    if (!tmdbCredential) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'TMDB_API_KEY or TMDB_ACCESS_TOKEN is not configured' }));
        return true;
    }
    const targetPath = requestPath.slice('/api/tmdb'.length);
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
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'TMDB proxy failed', message: error.message }));
    }
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

const server = http.createServer(async (req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    if (await proxyTmdb(req, res, requestPath, query)) return;
    if (await proxyMangaDex(req, res, requestPath, query)) return;
    if (await proxyKissKh(req, res, requestPath, query)) return;
    const requestedFile = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.resolve(root, `.${requestedFile}`);

    if (!filePath.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
            return;
        }
        const type = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(content);
    });
});

server.listen(port, '0.0.0.0', () => {
    console.log(`MILKBOX running at http://localhost:${port}`);
});
