const fs = require('fs');
const path = require('path');

const TMDB_KEY = process.env.TMDB_API_KEY || 'd821ffcf1a2419aa1fcf6923006cfcc4';

const TMDB_GENRES = {
    28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'crime',
    99: 'documentary', 18: 'drama', 10751: 'family', 14: 'fantasy', 36: 'history',
    27: 'horror', 10402: 'musical', 9648: 'mystery', 10749: 'romance', 878: 'scifi',
    53: 'thriller', 10752: 'war', 37: 'western', 10759: 'action', 10762: 'family',
    10765: 'scifi', 10768: 'war', 10770: 'drama', 10763: 'documentary',
    10764: 'documentary', 10766: 'drama', 10767: 'comedy'
};

function tmdbToItem(r, type, forceAnime = false) {
    if (!r || !r.id || r.adult) return null;
    const title = r.title || r.name || r.original_title || r.original_name;
    if (!title || typeof title !== 'string' || !title.trim()) return null;

    const isAnime = forceAnime || (
        (r.genre_ids || []).includes(16) && 
        ((r.origin_country || []).includes('JP') || r.original_language === 'ja')
    );
    const genres = (r.genre_ids || []).map(g => TMDB_GENRES[g]).filter(Boolean);
    if (isAnime && !genres.includes('anime')) genres.push('anime');

    const poster = r.poster_path ? 'https://image.tmdb.org/t/p/w500' + r.poster_path : '';
    const backdrop = r.backdrop_path 
        ? 'https://image.tmdb.org/t/p/w1920' + r.backdrop_path 
        : (poster ? poster.replace('/w500', '/w1920') : '');

    const year = (r.release_date || r.first_air_date || '').slice(0, 4);
    const rating = r.vote_average ? String(Math.round(r.vote_average * 10) / 10) : '7.0';
    const overview = (r.overview || '').slice(0, 240).trim();

    return {
        id: (type === 'tv' ? 't_' : 'm_') + r.id,
        tmdbId: String(r.id),
        title: title.trim(),
        year: year || '2024',
        rating: rating,
        genre: genres.length ? genres : (isAnime ? ['anime', 'animation'] : ['drama']),
        poster: poster,
        backdrop: backdrop,
        description: overview,
        type: type
    };
}

async function fetchPage(urlPath, retries = 2) {
    const fullUrl = `https://api.themoviedb.org/3${urlPath}${urlPath.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(fullUrl, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(6000)
            });
            if (res.ok) {
                const data = await res.json();
                return data.results || [];
            }
        } catch {}
        await new Promise(r => setTimeout(r, 200));
    }
    return [];
}

async function fetchBatch(paths, concurrency = 25) {
    const results = [];
    for (let i = 0; i < paths.length; i += concurrency) {
        const slice = paths.slice(i, i + concurrency);
        const batchResults = await Promise.all(slice.map(p => fetchPage(p)));
        results.push(...batchResults.flat());
        await new Promise(r => setTimeout(r, 40));
    }
    return results;
}

async function main() {
    console.log('[Catalog Builder] Starting 20,000+ title ingestion from TMDB…');
    const existingFile = path.join(__dirname, '../library.json');
    let existingMovies = [];
    let existingTv = [];
    if (fs.existsSync(existingFile)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(existingFile, 'utf-8'));
            if (Array.isArray(parsed.movies)) existingMovies = parsed.movies;
            if (Array.isArray(parsed.tvshows)) existingTv = parsed.tvshows;
        } catch {}
    }

    const movieMap = new Map();
    const tvMap = new Map();

    existingMovies.forEach(m => {
        if (m && (m.tmdbId || m.id)) movieMap.set(String(m.tmdbId || m.id), m);
    });
    existingTv.forEach(t => {
        if (t && (t.tmdbId || t.id)) tvMap.set(String(t.tmdbId || t.id), t);
    });

    console.log(`[Catalog Builder] Preserved ${movieMap.size} existing movies and ${tvMap.size} existing shows.`);

    // 1. Movies paths
    const moviePaths = [];
    // Popular movies (pages 1 to 250 = ~5,000 movies)
    for (let p = 1; p <= 250; p++) {
        moviePaths.push(`/discover/movie?sort_by=popularity.desc&vote_count.gte=20&page=${p}`);
    }
    // Top rated movies (pages 1 to 120 = ~2,400 movies)
    for (let p = 1; p <= 120; p++) {
        moviePaths.push(`/discover/movie?sort_by=vote_average.desc&vote_count.gte=100&page=${p}`);
    }
    // Now playing & trending
    for (let p = 1; p <= 50; p++) {
        moviePaths.push(`/movie/now_playing?page=${p}`);
    }
    // Action, comedy, sci-fi, horror, drama, thriller, romance (15 pages each = ~2,100 movies)
    [28, 35, 878, 27, 18, 53, 10749, 12, 14, 9648].forEach(g => {
        for (let p = 1; p <= 15; p++) {
            moviePaths.push(`/discover/movie?with_genres=${g}&sort_by=popularity.desc&page=${p}`);
        }
    });

    console.log(`[Catalog Builder] Fetching ${moviePaths.length} movie query pages…`);
    const rawMovies = await fetchBatch(moviePaths, 25);
    rawMovies.forEach(r => {
        const item = tmdbToItem(r, 'movie');
        if (item && !movieMap.has(item.tmdbId)) {
            movieMap.set(item.tmdbId, item);
        }
    });
    console.log(`[Catalog Builder] Total unique movies now: ${movieMap.size}`);

    // 2. TV Shows paths
    const tvPaths = [];
    // Popular TV shows (pages 1 to 220 = ~4,400 shows)
    for (let p = 1; p <= 220; p++) {
        tvPaths.push(`/discover/tv?sort_by=popularity.desc&vote_count.gte=10&page=${p}`);
    }
    // Top rated TV (pages 1 to 100 = ~2,000 shows)
    for (let p = 1; p <= 100; p++) {
        tvPaths.push(`/discover/tv?sort_by=vote_average.desc&vote_count.gte=50&page=${p}`);
    }
    // Drama, Sci-Fi, Crime, Comedy, Action (15 pages each = ~1,500 shows)
    [18, 10765, 80, 35, 10759, 9648].forEach(g => {
        for (let p = 1; p <= 15; p++) {
            tvPaths.push(`/discover/tv?with_genres=${g}&sort_by=popularity.desc&page=${p}`);
        }
    });

    console.log(`[Catalog Builder] Fetching ${tvPaths.length} TV show query pages…`);
    const rawTv = await fetchBatch(tvPaths, 25);
    rawTv.forEach(r => {
        const item = tmdbToItem(r, 'tv');
        if (item && !tvMap.has(item.tmdbId)) {
            tvMap.set(item.tmdbId, item);
        }
    });
    console.log(`[Catalog Builder] Total unique TV shows now: ${tvMap.size}`);

    // 3. Anime paths
    const animeMoviePaths = [];
    for (let p = 1; p <= 100; p++) {
        animeMoviePaths.push(`/discover/movie?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${p}`);
    }
    const animeTvPaths = [];
    for (let p = 1; p <= 100; p++) {
        animeTvPaths.push(`/discover/tv?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${p}`);
    }

    console.log(`[Catalog Builder] Fetching anime catalog (100 movie + 100 TV pages)…`);
    const [rawAnimeMovies, rawAnimeTv] = await Promise.all([
        fetchBatch(animeMoviePaths, 25),
        fetchBatch(animeTvPaths, 25)
    ]);

    rawAnimeMovies.forEach(r => {
        const item = tmdbToItem(r, 'movie', true);
        if (item && !movieMap.has(item.tmdbId)) {
            movieMap.set(item.tmdbId, item);
        }
    });

    rawAnimeTv.forEach(r => {
        const item = tmdbToItem(r, 'tv', true);
        if (item && !tvMap.has(item.tmdbId)) {
            tvMap.set(item.tmdbId, item);
        }
    });

    const finalMovies = Array.from(movieMap.values());
    const finalTv = Array.from(tvMap.values());

    console.log(`========================================`);
    console.log(`[Catalog Builder] Completed!`);
    console.log(`  Movies:   ${finalMovies.length}`);
    console.log(`  TV Shows: ${finalTv.length}`);
    console.log(`  Total:    ${finalMovies.length + finalTv.length} titles`);
    console.log(`========================================`);

    const outputData = {
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        totalTitles: finalMovies.length + finalTv.length,
        movies: finalMovies,
        tvshows: finalTv
    };

    fs.writeFileSync(existingFile, JSON.stringify(outputData), 'utf-8');
    console.log(`[Catalog Builder] Saved to ${existingFile} (${(fs.statSync(existingFile).size / (1024 * 1024)).toFixed(2)} MB).`);
}

main().catch(console.error);
