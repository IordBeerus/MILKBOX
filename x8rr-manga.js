// x8rr-manga: Dual-source Manga engine ported from https://github.com/x8rr/manga
// Features: MangaDex API Proxy + MangaPill Scraper (via Cheerio) + CDN Image Proxy + Intelligent Fallback

const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MANGADEX_USER_AGENT = 'MILKBOX/1.0 (https://milkbox.app)';

const MANGADEX_BASE = 'https://api.mangadex.org';
const MANGAPILL_BASE = 'https://mangapill.com';

// Cache for search results & chapters to be fast and respectful of upstream rate limits
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.time < CACHE_TTL) {
        return item.val;
    }
    return null;
}

function setCached(key, val) {
    if (cache.size > 2000) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { time: Date.now(), val });
}

async function fetchMangaDexApi(url) {
    const headers = {
        'User-Agent': MANGADEX_USER_AGENT,
        Accept: 'application/json'
    };
    if (process.env.MANGADEX_ACCESS_TOKEN) {
        headers.Authorization = `Bearer ${process.env.MANGADEX_ACCESS_TOKEN}`;
    }
    return fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000)
    });
}

// ==========================================
// MANGADEX IMPLEMENTATION (x8rr/manga)
// ==========================================

const mangadex = {
    async search({ title = '', page = 1, limit = 20, sort = 'relevance', status = '', genre = '' }) {
        const p = Math.max(1, parseInt(page) || 1);
        const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offset = (p - 1) * l;

        const url = new URL(`${MANGADEX_BASE}/manga`);
        url.searchParams.append('limit', String(l));
        url.searchParams.append('offset', String(offset));
        url.searchParams.append('contentRating[]', 'safe');
        url.searchParams.append('contentRating[]', 'suggestive');
        url.searchParams.append('includes[]', 'cover_art');
        url.searchParams.append('includes[]', 'author');
        url.searchParams.append('includes[]', 'artist');

        if (title && title.trim()) {
            url.searchParams.append('title', title.trim());
        }

        if (sort === 'relevance' && title) {
            url.searchParams.append('order[relevance]', 'desc');
        } else if (sort === 'latest') {
            url.searchParams.append('order[latestUploadedChapter]', 'desc');
        } else {
            url.searchParams.append('order[followedCount]', 'desc');
        }

        if (status) {
            url.searchParams.append('status[]', status);
        }
        if (genre) {
            url.searchParams.append('includedTags[]', genre);
        }

        const res = await fetchMangaDexApi(url.toString());

        if (!res.ok) throw new Error(`MangaDex search error: ${res.status}`);
        const data = await res.json();
        const items = (data.data || []).map(entry => {
            const attrs = entry.attributes || {};
            const coverRel = (entry.relationships || []).find(r => r.type === 'cover_art');
            const coverFile = coverRel?.attributes?.fileName;
            const cover = coverFile
                ? `https://uploads.mangadex.org/covers/${entry.id}/${coverFile}.512.jpg`
                : '';

            const enTitle = attrs.title?.en || (attrs.title ? Object.values(attrs.title)[0] : '') || 'Untitled';
            const authors = (entry.relationships || [])
                .filter(r => r.type === 'author' || r.type === 'artist')
                .map(r => r.attributes?.name)
                .filter(Boolean);

            return {
                id: entry.id,
                title: enTitle,
                cover,
                description: attrs.description?.en || (attrs.description ? Object.values(attrs.description)[0] : '') || '',
                authors: Array.from(new Set(authors)),
                year: attrs.year || null,
                status: attrs.status || 'unknown'
            };
        });

        return {
            total: data.total || items.length,
            limit: l,
            offset,
            items,
            next: (offset + l) < (data.total || 0)
        };
    },

    async latest({ page = 1, limit = 20 }) {
        return this.search({ page, limit, sort: 'latest' });
    },

    async detail(id) {
        const url = `${MANGADEX_BASE}/manga/${encodeURIComponent(id)}?includes[]=author&includes[]=artist&includes[]=cover_art`;
        const res = await fetchMangaDexApi(url);
        if (!res.ok) throw new Error(`MangaDex detail error: ${res.status}`);
        const data = await res.json();
        const entry = data.data;
        const attrs = entry.attributes || {};

        const coverRel = (entry.relationships || []).find(r => r.type === 'cover_art');
        const coverFile = coverRel?.attributes?.fileName;
        const cover = coverFile
            ? `https://uploads.mangadex.org/covers/${entry.id}/${coverFile}.512.jpg`
            : '';

        const title = attrs.title?.en || (attrs.title ? Object.values(attrs.title)[0] : '') || 'Untitled';
        const altTitles = (attrs.altTitles || []).map(alt => Object.values(alt)[0]).filter(Boolean);

        const authors = (entry.relationships || [])
            .filter(r => r.type === 'author' || r.type === 'artist')
            .map(r => r.attributes?.name)
            .filter(Boolean);

        const tags = (attrs.tags || [])
            .filter(t => t.attributes?.group === 'genre' || t.attributes?.group === 'theme')
            .map(t => t.attributes?.name?.en)
            .filter(Boolean);

        return {
            id: entry.id,
            title,
            altTitles,
            cover,
            description: attrs.description?.en || (attrs.description ? Object.values(attrs.description)[0] : '') || '',
            status: attrs.status || 'unknown',
            year: attrs.year || null,
            tags,
            authors: Array.from(new Set(authors))
        };
    },

    async chapters(id, { page = 1, limit = 500, lang = 'en' } = {}) {
        const p = Math.max(1, parseInt(page) || 1);
        const l = Math.min(500, Math.max(1, parseInt(limit) || 500));
        const offset = (p - 1) * l;

        const url = new URL(`${MANGADEX_BASE}/manga/${encodeURIComponent(id)}/feed`);
        url.searchParams.append('limit', String(l));
        url.searchParams.append('offset', String(offset));
        url.searchParams.append('order[chapter]', 'desc');
        url.searchParams.append('order[volume]', 'desc');
        url.searchParams.append('contentRating[]', 'safe');
        url.searchParams.append('contentRating[]', 'suggestive');
        url.searchParams.append('includes[]', 'scanlation_group');
        if (lang && lang !== 'all') {
            url.searchParams.append('translatedLanguage[]', lang);
        }

        const res = await fetchMangaDexApi(url.toString());
        if (!res.ok) throw new Error(`MangaDex chapters error: ${res.status}`);
        const data = await res.json();

        const chapters = (data.data || []).map(c => {
            const attrs = c.attributes || {};
            const chapterNum = attrs.chapter || '';
            const chTitle = attrs.title ? (chapterNum ? `Ch. ${chapterNum} — ${attrs.title}` : attrs.title) : (chapterNum ? `Chapter ${chapterNum}` : 'Chapter');
            return {
                id: c.id,
                chapter: chapterNum,
                title: chTitle,
                pages: attrs.pages || 0,
                externalUrl: attrs.externalUrl || null,
                publishAt: attrs.publishAt || null
            };
        });

        return {
            total: data.total || chapters.length,
            limit: l,
            offset,
            chapters
        };
    },

    async pages(chapterId) {
        const url = `${MANGADEX_BASE}/at-home/server/${encodeURIComponent(chapterId)}`;
        const res = await fetchMangaDexApi(url);
        if (!res.ok) throw new Error(`MangaDex at-home error: ${res.status}`);
        const data = await res.json();

        const base = data.baseUrl;
        const hash = data.chapter?.hash;
        const dataSaver = Array.isArray(data.chapter?.dataSaver) && data.chapter.dataSaver.length > 0;
        const files = dataSaver ? data.chapter.dataSaver : (data.chapter?.data || []);
        const folder = dataSaver ? 'data-saver' : 'data';

        if (!base || !hash || !files.length) {
            throw new Error('No pages found in MangaDex response');
        }

        const pages = files.map(file => `${base}/${folder}/${hash}/${file}`);
        return { pages };
    }
};

// ==========================================
// MANGAPILL IMPLEMENTATION (x8rr/manga)
// ==========================================

const mangapill = {
    async fetchHtml(endpoint) {
        const url = endpoint.startsWith('http') ? endpoint : `${MANGAPILL_BASE}${endpoint}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': `${MANGAPILL_BASE}/`,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`MangaPill fetch error: ${res.status}`);
        return await res.text();
    },

    async search({ query = '', page = 1 }) {
        const p = Math.max(1, parseInt(page) || 1);
        const cacheKey = `pill_search_${query.toLowerCase()}_${p}`;
        const cached = getCached(cacheKey);
        if (cached) return cached;

        const endpoint = `/search?q=${encodeURIComponent(query)}&page=${p}`;
        const html = await this.fetchHtml(endpoint);
        const $ = cheerio.load(html);

        const items = [];
        $('div.my-3.grid.justify-end.gap-3.grid-cols-2 > div, div.grid.grid-cols-2.gap-3 > div').each((_, el) => {
            const card = $(el);
            const link = card.find('a[href^="/manga/"]').attr('href');
            if (!link) return;

            const id = link.replace(/^\/manga\//, '');
            const title = card.find('div > a > div, a.line-clamp-2, h3').first().text().trim() ||
                card.find('div.font-bold').text().trim();

            const img = card.find('img').first();
            const rawCover = img.attr('data-src') || img.attr('src') || '';
            const cover = rawCover ? `/img?u=${encodeURIComponent(rawCover)}` : '';

            const yearText = card.find('div.text-xs, div.text-secondary').text().trim();
            const yearMatch = yearText.match(/([12][0-9]{3})/);
            const year = yearMatch ? yearMatch[1] : null;

            if (title && id) {
                items.push({
                    id,
                    title,
                    cover,
                    rawCover,
                    year,
                    status: 'Unknown'
                });
            }
        });

        // Also check pagination
        const hasNext = $('a:contains("Next"), a[rel="next"]').length > 0;
        const result = {
            total: items.length,
            page: p,
            items,
            next: hasNext
        };
        setCached(cacheKey, result);
        return result;
    },

    async latest({ page = 1 }) {
        const p = Math.max(1, parseInt(page) || 1);
        const cacheKey = `pill_latest_${p}`;
        const cached = getCached(cacheKey);
        if (cached) return cached;

        const endpoint = `/chapters?page=${p}`;
        const html = await this.fetchHtml(endpoint);
        const $ = cheerio.load(html);

        const items = [];
        $('div.my-3.grid.justify-end.gap-3.grid-cols-2 > div, div.grid.grid-cols-2.gap-3 > div').each((_, el) => {
            const card = $(el);
            const mangaLink = card.find('a[href^="/manga/"]').first().attr('href');
            const chLink = card.find('a[href^="/chapters/"]').first().attr('href');

            const id = mangaLink ? mangaLink.replace(/^\/manga\//, '') : '';
            const chId = chLink ? chLink.replace(/^\/chapters\//, '') : '';
            const title = card.find('a[href^="/manga/"]').text().trim();
            const chTitle = card.find('a[href^="/chapters/"]').text().trim();

            const img = card.find('img').first();
            const rawCover = img.attr('data-src') || img.attr('src') || '';
            const cover = rawCover ? `/img?u=${encodeURIComponent(rawCover)}` : '';

            if (title && id) {
                items.push({
                    id,
                    chId,
                    title,
                    latestChapter: chTitle,
                    cover,
                    rawCover
                });
            }
        });

        const result = {
            total: items.length,
            page: p,
            items,
            next: $('a:contains("Next")').length > 0
        };
        setCached(cacheKey, result);
        return result;
    },

    async detail(id) {
        const cacheKey = `pill_detail_${id}`;
        const cached = getCached(cacheKey);
        if (cached) return cached;

        const endpoint = `/manga/${id}`;
        const html = await this.fetchHtml(endpoint);
        const $ = cheerio.load(html);

        const title = $('h1').first().text().trim();
        const img = $('figure img, div.flex img, img.data-src').first();
        const rawCover = img.attr('data-src') || img.attr('src') || '';
        const cover = rawCover ? `/img?u=${encodeURIComponent(rawCover)}` : '';

        const description = $('p.text-sm.text-secondary, p.text-sm, div.description').first().text().trim();

        let status = 'Unknown';
        let year = null;
        $('div.grid div, div.flex div').each((_, el) => {
            const t = $(el).text();
            if (t.includes('Status')) {
                status = t.replace('Status', '').trim();
            } else if (t.includes('Year')) {
                const yMatch = t.match(/([12][0-9]{3})/);
                if (yMatch) year = yMatch[1];
            }
        });

        const tags = [];
        $('a[href*="/search?genre="]').each((_, el) => {
            tags.push($(el).text().trim());
        });

        // Chapters list
        const chapters = [];
        $('#chapters a[href^="/chapters/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const chId = href.replace(/^\/chapters\//, '');
            const chText = $(el).text().trim();
            const numMatch = chText.match(/(?:chapter|ch\.?|episode|#)?\s*([0-9\.]+)/i) ||
                             href.match(/chapter-([0-9\.]+)/i);
            const chapterNum = numMatch ? numMatch[1] : '';

            chapters.push({
                id: chId,
                chapter: chapterNum,
                title: chText || (chapterNum ? `Chapter ${chapterNum}` : 'Chapter')
            });
        });

        const result = {
            id,
            title,
            cover,
            rawCover,
            description,
            status,
            year,
            tags,
            totalChapters: chapters.length,
            chapters
        };
        setCached(cacheKey, result);
        return result;
    },

    async chapters(id) {
        const d = await this.detail(id);
        return {
            total: d.chapters.length,
            chapters: d.chapters
        };
    },

    async pages(chapterId) {
        const cacheKey = `pill_pages_${chapterId}`;
        const cached = getCached(cacheKey);
        if (cached) return cached;

        const endpoint = `/chapters/${chapterId}`;
        const html = await this.fetchHtml(endpoint);
        const $ = cheerio.load(html);

        const pages = [];
        $('chapter-page img, img[data-src], img.data-src').each((_, el) => {
            const src = $(el).attr('data-src') || $(el).attr('src');
            if (src && /^https?:\/\//i.test(src)) {
                pages.push(src);
            }
        });

        // If no images matched, try general img scan within main content
        if (!pages.length) {
            $('img').each((_, el) => {
                const src = $(el).attr('data-src') || $(el).attr('src');
                if (src && /readdetectiveconan|mangapill/i.test(src) && !/logo|icon|avatar/i.test(src)) {
                    pages.push(src);
                }
            });
        }

        const proxiedPages = pages.map(p => `/img?u=${encodeURIComponent(p)}`);
        const result = { pages: proxiedPages, rawPages: pages };
        setCached(cacheKey, result);
        return result;
    }
};

// ==========================================
// CDN IMAGE PROXY (x8rr/manga: /img?u=...)
// ==========================================

async function proxyImage(req, res, targetUrl) {
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Valid URL required');
        return true;
    }

    try {
        const resp = await fetch(targetUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': `${MANGAPILL_BASE}/`,
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!resp.ok) {
            res.writeHead(resp.status, { 'Content-Type': 'text/plain' });
            res.end(`Image fetch failed: ${resp.status}`);
            return true;
        }

        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=43200',
            'Access-Control-Allow-Origin': '*'
        });

        const arrayBuffer = await resp.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
        return true;
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Image proxy error: ' + e.message);
        return true;
    }
}

// ==========================================
// FALLBACK CHAPTER RESOLVER
// Extracts pages from MangaPill when MangaDex chapter is unavailable or external
// ==========================================

function normalizeTitle(t) {
    return (t || '')
        .toLowerCase()
        .replace(/[\(\[][^\)\]]*[\)\]]/g, '')
        .replace(/[:\-–—]/g, ' ')
        .replace(/\s+(manga|colored|comics|official|digital|edition)$/i, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function resolveFallbackChapter(title, altTitles = [], chapterNum = '1') {
    const titles = [title, ...(Array.isArray(altTitles) ? altTitles : [altTitles])]
        .filter(Boolean)
        .map(t => String(t).trim())
        .filter(t => t.length > 1);

    const targetNum = parseFloat(chapterNum);
    const targetStr = String(chapterNum).trim();

    // Check cache
    const primaryKey = normalizeTitle(title || titles[0] || 'manga');
    const cacheKey = `manga_fallback_${primaryKey}_ch_${targetStr}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    for (const rawTitle of titles) {
        const cleanTitle = normalizeTitle(rawTitle);
        if (!cleanTitle) continue;

        try {
            // Search MangaPill
            const searchRes = await mangapill.search({ query: cleanTitle });
            if (!searchRes || !searchRes.items || !searchRes.items.length) {
                // Try searching with just the first 2-3 words
                const words = cleanTitle.split(' ');
                if (words.length > 2) {
                    const shortQuery = words.slice(0, 3).join(' ');
                    const shortRes = await mangapill.search({ query: shortQuery });
                    if (shortRes?.items?.length) searchRes.items = shortRes.items;
                }
            }

            if (!searchRes?.items?.length) continue;

            // Find best matching series
            const candidates = searchRes.items.map(item => {
                const itemNorm = normalizeTitle(item.title);
                let score = 0;
                if (itemNorm === cleanTitle) score = 100;
                else if (itemNorm.startsWith(cleanTitle) || cleanTitle.startsWith(itemNorm)) score = 80;
                else if (itemNorm.includes(cleanTitle) || cleanTitle.includes(itemNorm)) score = 50;
                return { item, score };
            }).sort((a, b) => b.score - a.score);

            const bestSeries = candidates[0]?.item;
            if (!bestSeries) continue;

            // Fetch series detail & chapters
            const detail = await mangapill.detail(bestSeries.id);
            if (!detail?.chapters?.length) continue;

            // Match chapter number
            let matchedChapter = null;
            if (!isNaN(targetNum)) {
                matchedChapter = detail.chapters.find(c => parseFloat(c.chapter) === targetNum);
            }
            if (!matchedChapter) {
                matchedChapter = detail.chapters.find(c => {
                    const cNum = c.chapter || '';
                    return cNum === targetStr || c.title.toLowerCase().includes(`chapter ${targetStr}`) || c.id.includes(`chapter-${targetStr}`);
                });
            }
            if (!matchedChapter && detail.chapters.length === 1 && (targetNum === 1 || !targetNum)) {
                matchedChapter = detail.chapters[0];
            }

            if (matchedChapter) {
                // Extract pages
                const pageResult = await mangapill.pages(matchedChapter.id);
                if (pageResult && pageResult.pages && pageResult.pages.length) {
                    const out = {
                        success: true,
                        source: 'mangapill',
                        seriesTitle: detail.title,
                        chapterTitle: matchedChapter.title,
                        pages: pageResult.pages
                    };
                    setCached(cacheKey, out);
                    return out;
                }
            }
        } catch (err) {
            // Continue to next title candidate
        }
    }

    return null;
}

// ==========================================
// HTTP REQUEST DISPATCHER (matches x8rr/manga)
// ==========================================

async function handleX8rrManga(req, res, pathname, query) {
    // 1. Image proxy routes: /img?u=... or /api/manga/img?u=...
    if (pathname === '/img' || pathname === '/api/manga/img') {
        const targetUrl = query.get('u') || query.get('url');
        return await proxyImage(req, res, targetUrl);
    }

    // 2. MangaPill API routes: /pill/* or /api/manga/pill/*
    if (pathname.startsWith('/pill/') || pathname.startsWith('/api/manga/pill/')) {
        const sub = pathname.replace(/^\/(?:api\/manga\/)?pill\//, '');
        const respond = (data, status = 200) => {
            res.writeHead(status, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=300',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(data));
            return true;
        };

        try {
            if (sub === 'search') {
                const q = query.get('q') || query.get('title') || '';
                const page = query.get('page') || 1;
                const result = await mangapill.search({ query: q, page });
                return respond(result);
            }

            if (sub === 'latest') {
                const page = query.get('page') || 1;
                const result = await mangapill.latest({ page });
                return respond(result);
            }

            if (sub.startsWith('detail/')) {
                const id = sub.slice('detail/'.length);
                const result = await mangapill.detail(id);
                return respond(result);
            }

            if (sub.startsWith('chapters/')) {
                const id = sub.slice('chapters/'.length);
                const result = await mangapill.chapters(id);
                return respond(result);
            }

            if (sub.startsWith('pages/')) {
                const chId = sub.slice('pages/'.length);
                const result = await mangapill.pages(chId);
                return respond(result);
            }
        } catch (err) {
            return respond({ error: err.message }, 500);
        }
    }

    // 3. MangaDex API routes: /mangadex/* or /api/manga/mangadex/*
    if (pathname.startsWith('/mangadex/') || pathname.startsWith('/api/manga/mangadex/')) {
        const sub = pathname.replace(/^\/(?:api\/manga\/)?mangadex\//, '');
        const respond = (data, status = 200) => {
            res.writeHead(status, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=300',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(data));
            return true;
        };

        try {
            if (sub === 'search') {
                const title = query.get('title') || query.get('q') || '';
                const page = query.get('page') || 1;
                const limit = query.get('limit') || 20;
                const sort = query.get('sort') || 'relevance';
                const status = query.get('status') || '';
                const genre = query.get('genre') || '';
                const result = await mangadex.search({ title, page, limit, sort, status, genre });
                return respond(result);
            }

            if (sub === 'latest') {
                const page = query.get('page') || 1;
                const limit = query.get('limit') || 20;
                const result = await mangadex.latest({ page, limit });
                return respond(result);
            }

            if (sub.startsWith('detail/')) {
                const id = sub.slice('detail/'.length);
                const result = await mangadex.detail(id);
                return respond(result);
            }

            if (sub.startsWith('chapters/')) {
                const id = sub.slice('chapters/'.length);
                const page = query.get('page') || 1;
                const lang = query.get('lang') || 'en';
                const result = await mangadex.chapters(id, { page, lang });
                return respond(result);
            }

            if (sub.startsWith('pages/')) {
                const chapterId = sub.slice('pages/'.length);
                const result = await mangadex.pages(chapterId);
                return respond(result);
            }
        } catch (err) {
            return respond({ error: err.message }, 500);
        }
    }

    // 4. Fallback chapter extraction: /api/manga-fallback-chapter
    if (pathname === '/api/manga-fallback-chapter' || pathname === '/api/manga/fallback') {
        const title = (query.get('title') || '').trim();
        const chapter = (query.get('chapter') || '1').trim();
        let altTitles = [];
        try {
            const rawAlts = query.get('altTitles') || '';
            if (rawAlts.startsWith('[') || rawAlts.startsWith('{')) {
                const parsed = JSON.parse(rawAlts);
                altTitles = Array.isArray(parsed) ? parsed : Object.values(parsed);
            } else if (rawAlts) {
                altTitles = rawAlts.split(',').map(s => s.trim()).filter(Boolean);
            }
        } catch (_) {}

        try {
            const result = await resolveFallbackChapter(title, altTitles, chapter);
            if (result && result.pages && result.pages.length) {
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(result));
                return true;
            }
        } catch (e) {
            console.error('Fallback chapter error:', e);
        }

        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'No fallback pages found' }));
        return true;
    }

    return false;
}

module.exports = {
    mangadex,
    mangapill,
    proxyImage,
    resolveFallbackChapter,
    handleX8rrManga
};
