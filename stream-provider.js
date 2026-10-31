const TMDB_API_KEY = process.env.TMDB_API_KEY || 'd821ffcf1a2419aa1fcf6923006cfcc4';
const { scrapeAll: scrapeX8rrStreams } = require('./x8rr-movies');

// In-memory resolution cache (15 min TTL)
const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.time > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    if (cache.size > 2000) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
    cache.set(key, { data, time: Date.now() });
}

// Fetch TMDB metadata & IMDb external IDs
async function fetchTmdbDetails(type, id) {
    const cacheKey = `tmdb:${type}:${id}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const endpoint = type === 'tv'
            ? `https://api.themoviedb.org/3/tv/${encodeURIComponent(id)}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`
            : `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

        const res = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(6000)
        });

        if (!res.ok) return null;
        const data = await res.json();
        const details = {
            id: String(data.id || id),
            title: data.title || data.name || data.original_title || data.original_name || '',
            year: (data.release_date || data.first_air_date || '').slice(0, 4),
            imdbId: data.external_ids?.imdb_id || data.imdb_id || '',
            overview: data.overview || '',
            backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : '',
            poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
            runtime: data.runtime || (data.episode_run_time ? data.episode_run_time[0] : null) || null,
            genres: Array.isArray(data.genres) ? data.genres.map(g => g.name) : []
        };

        setCache(cacheKey, details);
        return details;
    } catch {
        return null;
    }
}

// Fetch AniList Anime Metadata
async function fetchAnimeDetails(id) {
    const cacheKey = `ani:${id}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const gql = `query ($id: Int) {
            Media (id: $id, type: ANIME) {
                id
                title { english romaji native }
                episodes
                genres
                bannerImage
                coverImage { extraLarge large }
                description
            }
        }`;
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query: gql, variables: { id: parseInt(id, 10) } }),
            signal: AbortSignal.timeout(6000)
        });

        if (!res.ok) return null;
        const json = await res.json();
        const media = json?.data?.Media;
        if (!media) return null;

        const details = {
            id: String(media.id),
            title: media.title?.english || media.title?.romaji || media.title?.native || 'Anime',
            episodes: media.episodes || 24,
            backdrop: media.bannerImage || '',
            poster: media.coverImage?.extraLarge || media.coverImage?.large || '',
            genres: media.genres || []
        };

        setCache(cacheKey, details);
        return details;
    } catch {
        return null;
    }
}

// Generate Stream Providers List with Milkbox Pink parameters
function generateStreamProviders(type, id, season, episode, imdbId) {
    const accent = 'ff2e63'; // Milkbox brand pink
    const se = season || 1;
    const ep = episode || 1;

    if (type === 'anime') {
        return [
            {
                id: 'milkbox',
                name: 'Milkbox Pink (Core)',
                quality: '1080p HD',
                icon: '⚡',
                url: `https://www.vidy.st/anime/${encodeURIComponent(id)}/${encodeURIComponent(ep)}?color=${accent}&autoplay=true`
            },
            {
                id: 'autoembed',
                name: 'AutoEmbed Anime',
                quality: '1080p HD',
                icon: '✨',
                url: `https://autoembed.app/anime/${encodeURIComponent(id)}/${encodeURIComponent(ep)}`
            },
            {
                id: 'vidhawk',
                name: 'VidHawk Kari',
                quality: '1080p HD',
                icon: '🦅',
                url: `https://vidhawk.buzz/embed/ani/${encodeURIComponent(id)}/${encodeURIComponent(ep)}/sub?server=kari`
            },
            {
                id: 'anixo',
                name: 'Anixo Anime',
                quality: '1080p HD',
                icon: '🎌',
                url: `https://anixo.buzz/embed/ani/${encodeURIComponent(id)}/${encodeURIComponent(ep)}/sub?color=%23${accent}`
            }
        ];
    }

    if (type === 'tv') {
        return [
            {
                id: 'x8rrmovies',
                name: 'x8rr Movies (Direct Stream / Ad-Free HLS)',
                quality: '1080p Ultra (x8rr)',
                icon: '🍿',
                url: `/milkbox-embed.html?type=tv&id=${encodeURIComponent(id)}&s=${encodeURIComponent(se)}&e=${encodeURIComponent(ep)}&server=x8rrmovies`,
                streamApi: `/api/x8rr/stream/tv/${encodeURIComponent(id)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}`
            },
            {
                id: 'scramjet',
                name: 'Scramjet (Proxy: VidSrc → CineSRC → VidLink)',
                quality: '1080p Ultra (Proxy)',
                icon: '⚡',
                wisp: 'wss://wisp.classroom.lat/',
                url: `/api/scramjet/embed?url=${encodeURIComponent(`https://vidsrc.pm/embed/tv/${id}/${se}/${ep}`)}`,
                directUrl: `https://vidsrc.pm/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}`,
                fallbackUrl: `https://www.cinesrc.st/embed/tv/${encodeURIComponent(id)}?s=${encodeURIComponent(se)}&e=${encodeURIComponent(ep)}`
            },
            {
                id: 'milkbox',
                name: 'Milkbox Pink (Core)',
                quality: '1080p Ultra',
                icon: '⚡',
                url: `https://www.vidy.st/tv/${encodeURIComponent(id)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&color=${accent}&autoplay=true`
            },
            {
                id: 'vidlink',
                name: 'VidLink Ultra',
                quality: '1080p HD',
                icon: '💎',
                url: `https://vidlink.pro/tv/${encodeURIComponent(id)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}?primaryColor=${accent}&secondaryColor=ff6b9d&iconColor=${accent}&icons=default&player=default&title=true&poster=true&autoplay=true&nextbutton=true`
            },
            {
                id: 'cinesrc',
                name: 'CineSRC 4K',
                quality: '4K Ultra',
                icon: '🎬',
                url: `https://www.cinesrc.st/embed/tv/${encodeURIComponent(id)}?s=${encodeURIComponent(se)}&e=${encodeURIComponent(ep)}`
            },
            {
                id: 'vidsrcsbs',
                name: 'VidSrc SBS',
                quality: '1080p HD',
                icon: '🚀',
                url: `https://vidsrc.sbs/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}`
            },
            {
                id: 'vidcore',
                name: 'VidCore HD',
                quality: '1080p HD',
                icon: '🛡️',
                url: `https://vidcore.org/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}`
            },
            {
                id: 'autoembed',
                name: 'AutoEmbed VIP',
                quality: '1080p HD',
                icon: '✨',
                url: `https://autoembed.app/tv/tmdb/${encodeURIComponent(id)}-${encodeURIComponent(se)}-${encodeURIComponent(ep)}`
            },
            {
                id: 'vidsrc',
                name: 'VidSrc PM',
                quality: '1080p HD',
                icon: '📺',
                url: `https://vidsrc.pm/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(se)}/${encodeURIComponent(ep)}`
            }
        ];
    }

    // Movie
    return [
        {
            id: 'x8rrmovies',
            name: 'x8rr Movies (Direct Stream / Ad-Free HLS)',
            quality: '1080p Ultra (x8rr)',
            icon: '🍿',
            url: `/milkbox-embed.html?type=movie&id=${encodeURIComponent(id)}&server=x8rrmovies`,
            streamApi: `/api/x8rr/stream/movie/${encodeURIComponent(id)}`
        },
        {
            id: 'scramjet',
            name: 'Scramjet (Proxy: VidSrc → CineSRC → VidLink)',
            quality: '1080p Ultra (Proxy)',
            icon: '⚡',
            wisp: 'wss://wisp.classroom.lat/',
            url: `/api/scramjet/embed?url=${encodeURIComponent(`https://vidsrc.pm/embed/movie/${id}`)}`,
            directUrl: `https://vidsrc.pm/embed/movie/${encodeURIComponent(id)}`,
            fallbackUrl: `https://www.cinesrc.st/embed/movie/${encodeURIComponent(id)}`
        },
        {
            id: 'milkbox',
            name: 'Milkbox Pink (Core)',
            quality: '1080p Ultra',
            icon: '⚡',
            url: `https://www.vidy.st/movie/${encodeURIComponent(id)}?color=${accent}&autoplay=true`
        },
        {
            id: 'vidlink',
            name: 'VidLink Ultra',
            quality: '1080p HD',
            icon: '💎',
            url: `https://vidlink.pro/movie/${encodeURIComponent(id)}?primaryColor=${accent}&secondaryColor=ff6b9d&iconColor=${accent}&icons=default&player=default&title=true&poster=true&autoplay=true`
        },
        {
            id: 'cinesrc',
            name: 'CineSRC 4K',
            quality: '4K Ultra',
            icon: '🎬',
            url: `https://www.cinesrc.st/embed/movie/${encodeURIComponent(id)}`
        },
        {
            id: 'vidsrcsbs',
            name: 'VidSrc SBS',
            quality: '1080p HD',
            icon: '🚀',
            url: `https://vidsrc.sbs/embed/movie/${encodeURIComponent(id)}`
        },
        {
            id: 'vidcore',
            name: 'VidCore HD',
            quality: '1080p HD',
            icon: '🛡️',
            url: `https://vidcore.org/embed/movie/${encodeURIComponent(id)}`
        },
        {
            id: 'autoembed',
            name: 'AutoEmbed VIP',
            quality: '1080p HD',
            icon: '✨',
            url: `https://autoembed.app/movie/tmdb/${encodeURIComponent(id)}`
        },
        {
            id: 'vidsrc',
            name: 'VidSrc PM',
            quality: '1080p HD',
            icon: '📺',
            url: `https://vidsrc.pm/embed/movie/${encodeURIComponent(id)}`
        }
    ];
}

// Main Stream Resolver Controller
async function handleStreamResolve(req, res, requestPath, query) {
    if (requestPath !== '/api/stream/resolve') return false;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    const type = (query.get('type') || 'movie').toLowerCase();
    const id = query.get('id') || query.get('tmdb') || query.get('anilist') || '';
    const season = parseInt(query.get('season') || query.get('s') || '1', 10);
    const episode = parseInt(query.get('episode') || query.get('e') || '1', 10);
    const requestedServer = query.get('server') || 'milkbox';

    if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing media ID (id, tmdb, or anilist).' }));
        return true;
    }

    let meta = null;
    if (type === 'anime') {
        meta = await fetchAnimeDetails(id);
    } else {
        meta = await fetchTmdbDetails(type, id);
    }

    const servers = generateStreamProviders(type, id, season, episode, meta?.imdbId);
    const active = servers.find(s => s.id === requestedServer) || servers[0];

    let directStream = null;
    let directStreams = [];
    if (active.id === 'x8rrmovies' && type !== 'anime') {
        try {
            const scraped = await scrapeX8rrStreams(type, id, season, episode);
            if (scraped && scraped.length > 0) {
                directStream = scraped[0].proxiedUrl;
                directStreams = scraped;
            }
        } catch {}
    }

    const response = {
        ok: true,
        provider: 'Milkbox Streams',
        theme: {
            primaryColor: '#ff2e63',
            secondaryColor: '#ff6b9d',
            softColor: '#ffb6d8'
        },
        type,
        id,
        season: type === 'tv' ? season : undefined,
        episode: ['tv', 'anime'].includes(type) ? episode : undefined,
        title: meta?.title || `${type.toUpperCase()} #${id}`,
        year: meta?.year || '',
        imdbId: meta?.imdbId || '',
        poster: meta?.poster || '',
        backdrop: meta?.backdrop || '',
        activeServer: active.id,
        streamUrl: active.url,
        directStream: directStream || undefined,
        directStreams: (directStreams && directStreams.length > 0) ? directStreams : undefined,
        embedCode: `<iframe src="${active.url}" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay; fullscreen; encrypted-media"></iframe>`,
        servers: servers.map(s => ({
            id: s.id,
            name: s.name,
            quality: s.quality,
            icon: s.icon,
            url: s.url
        }))
    };

    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
    });
    res.end(JSON.stringify(response));
    return true;
}

// Stream Proxy for CORS-restricted HLS or Subtitles
async function handleStreamProxy(req, res, requestPath, query) {
    if (requestPath !== '/api/stream/proxy') return false;

    res.setHeader('Access-Control-Allow-Origin', '*');
    const targetUrl = query.get('url');

    if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing url parameter.' }));
        return true;
    }

    try {
        const parsed = new URL(targetUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');

        const upstream = await fetch(parsed, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': parsed.origin
            },
            signal: AbortSignal.timeout(10000)
        });

        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        res.writeHead(upstream.status, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=600'
        });

        const buffer = await upstream.arrayBuffer();
        res.end(Buffer.from(buffer));
    } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Proxy request failed', message: e.message }));
    }
    return true;
}

module.exports = {
    handleStreamResolve,
    handleStreamProxy,
    generateStreamProviders
};
