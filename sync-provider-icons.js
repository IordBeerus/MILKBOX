const fs = require('fs/promises');
const path = require('path');

const root = __dirname;
const iconDir = path.join(root, 'assets', 'provider-icons');

async function loadEnvFile() {
    try {
        const content = await fs.readFile(path.join(root, '.env'), 'utf8');
        for (const line of content.split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
        }
    } catch {}
}

async function tmdbRequest(endpoint) {
    const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
    const headers = { Accept: 'application/json' };
    const credential = process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN;
    if (/^Bearer\s+/i.test(credential) || credential.startsWith('eyJ')) {
        headers.Authorization = `Bearer ${credential.replace(/^Bearer\s+/i, '')}`;
    } else {
        url.searchParams.set('api_key', credential);
    }
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
    return response.json();
}

async function syncProviderIcons() {
    await loadEnvFile();
    const credential = process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN;
    if (!credential) throw new Error('TMDB_API_KEY or TMDB_ACCESS_TOKEN is required');

    const [movies, tv] = await Promise.all([
        tmdbRequest('/watch/providers/movie?watch_region=US'),
        tmdbRequest('/watch/providers/tv?watch_region=US')
    ]);
    const providers = new Map();
    for (const provider of [...(movies.results || []), ...(tv.results || [])]) {
        if (provider.provider_id && provider.logo_path) providers.set(String(provider.provider_id), provider);
    }

    await fs.mkdir(iconDir, { recursive: true });
    const manifest = {};
    for (const [id, provider] of providers) {
        const response = await fetch(`https://media.themoviedb.org/t/p/original${provider.logo_path}`);
        if (!response.ok) continue;
        const fileName = `${id}.png`;
        await fs.writeFile(path.join(iconDir, fileName), Buffer.from(await response.arrayBuffer()));
        manifest[id] = `assets/provider-icons/${fileName}`;
    }
    await fs.writeFile(path.join(iconDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Saved ${Object.keys(manifest).length} TMDB provider icons to ${path.relative(root, iconDir)}`);
}

syncProviderIcons().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});