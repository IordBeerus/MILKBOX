const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Writable } = require('stream');
const { Innertube, Platform } = require('youtubei.js');
const { handleStreamResolve, handleStreamProxy } = require('./stream-provider');
const { handleX8rrProxy, handleX8rrStreamApi, handleX8rrSubtitlesApi, handleX8rrVttProxy } = require('./x8rr-movies');
const { handleX8rrManga } = require('./x8rr-manga');
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
const defaultAppPort = Number(process.env.DEFAULT_APP_PORT) || 3000;
let port = Number(process.env.PORT) || defaultAppPort;
if (port === 8080 || port === Number(process.env.NGINX_PORT || 8080)) {
    port = defaultAppPort;
}
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
        const headers = { 
            Accept: 'application/json',
            'User-Agent': 'MILKBOX/1.0 (https://milkbox.app)'
        };
        if (process.env.MANGADEX_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.MANGADEX_ACCESS_TOKEN}`;
        const response = await fetch(target, { headers });
        const body = await response.text();
        res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
        res.end(body);
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'MangaDex proxy failed', message: error.message }));
    }
    return true;
}

async function proxyMangaDexCover(req, res, requestPath) {
    if (!requestPath.startsWith('/api/mangadex-cover/')) return false;
    const subPath = requestPath.slice('/api/mangadex-cover/'.length);
    if (!subPath) return false;
    const target = `https://uploads.mangadex.org/covers/${subPath}`;
    try {
        const response = await fetch(target, {
            headers: {
                'User-Agent': 'MILKBOX/1.0 (https://milkbox.app)'
            }
        });
        if (!response.ok) {
            res.writeHead(response.status, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return true;
        }
        res.writeHead(200, {
            'Content-Type': response.headers.get('content-type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
        });
        const arrayBuffer = await response.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading cover');
    }
    return true;
}

const fallbackMangaChapterCache = new Map();

function getMangaCandidateTitles(primaryTitle, altTitles = []) {
    const pool = [primaryTitle, ...(Array.isArray(altTitles) ? altTitles : [altTitles])].filter(Boolean);
    const result = [];
    const seen = new Set();
    const add = (t) => {
        const clean = (t || '').trim();
        if (!clean || clean.length < 2) return;
        const key = clean.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            result.push(clean);
        }
    };

    for (const raw of pool) {
        if (typeof raw !== 'string') continue;
        add(raw);
        // Remove parenthesized or bracketed suffixes (e.g. "(Official Colored)", "[Digital]", "(Official)")
        const noParens = raw.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').trim();
        if (noParens) add(noParens);
        // Remove trailing tags like manga, colored, comics, digital
        const noSuffix = noParens.replace(/\s+(manga|colored|comics|official|digital|edition)$/i, '').trim();
        if (noSuffix) add(noSuffix);
        // Prefix before subtitle separators
        const beforeSep = noSuffix.split(/[:\-–]/)[0].trim();
        if (beforeSep && beforeSep.length >= 3) add(beforeSep);
        // Normalize punctuation
        const noPunct = noSuffix.replace(/[:\-–]/g, ' ').replace(/\s+/g, ' ').trim();
        if (noPunct) add(noPunct);
        if (raw.includes('×')) add(raw.replace(/×/g, 'x'));
        if (raw.toLowerCase().includes(' x ')) add(raw.replace(/\s+[xX]\s+/g, ' '));
    }
    return result;
}

async function scrapeMangapillChapter(title, chapterNum) {
    try {
        const sUrl = `https://mangapill.com/search?q=${encodeURIComponent(title)}`;
        const sRes = await fetch(sUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(4500)
        });
        if (!sRes.ok) return null;
        const sHtml = await sRes.text();
        const mangaLinks = [...sHtml.matchAll(/href="(\/manga\/[0-9]+\/[^"]+)"/g)].map(m => m[1]);
        if (!mangaLinks.length) return null;

        const mUrl = `https://mangapill.com${mangaLinks[0]}`;
        const mRes = await fetch(mUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(4500)
        });
        if (!mRes.ok) return null;
        const mHtml = await mRes.text();

        const chMatches = [...mHtml.matchAll(/href="(\/chapters\/[^"]+chapter-([0-9\.]+)[^"]*)"/gi)];
        if (!chMatches.length) return null;

        const targetNum = parseFloat(chapterNum);
        let matchedCh = null;
        if (!isNaN(targetNum)) {
            matchedCh = chMatches.find(c => parseFloat(c[2]) === targetNum);
        }
        if (!matchedCh) {
            matchedCh = chMatches.find(c => {
                return c[2] === String(chapterNum) ||
                    c[1].includes(`chapter-${chapterNum}`) ||
                    c[1].includes(`chapter-0${chapterNum}`) ||
                    c[1].includes(`chapter-00${chapterNum}`);
            });
        }
        if (!matchedCh && chMatches.length === 1) {
            matchedCh = chMatches[0];
        }
        if (!matchedCh) return null;

        const chUrl = `https://mangapill.com${matchedCh[1]}`;
        const chRes = await fetch(chUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000)
        });
        if (!chRes.ok) return null;
        const chHtml = await chRes.text();
        const imgs = [...chHtml.matchAll(/data-src="([^"]+)"/g)].map(m => m[1]);
        if (imgs.length) return { source: 'mangapill', pages: imgs, referer: 'https://mangapill.com/' };
    } catch (_) {}
    return null;
}

async function scrapeWeebCentralChapter(title, chapterNum) {
    try {
        const sUrl = `https://weebcentral.com/search/data?text=${encodeURIComponent(title)}`;
        const sRes = await fetch(sUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(4500)
        });
        if (!sRes.ok) return null;
        const sHtml = await sRes.text();
        const seriesMatches = [...sHtml.matchAll(/href="([^"]*\/series\/([a-zA-Z0-9]+)\/[^"]*)"/g)];
        if (!seriesMatches.length) return null;
        const seriesId = seriesMatches[0][2];

        const listUrl = `https://weebcentral.com/series/${seriesId}/full-chapter-list`;
        const lRes = await fetch(listUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000)
        });
        if (!lRes.ok) return null;
        const lHtml = await lRes.text();

        // Match chapters with inner text to handle "Days 281", "Chapter 1", "Episode 1", "Act 1", etc.
        const chBlocks = [...lHtml.matchAll(/href="([^"]*\/chapters\/([a-zA-Z0-9]+))"[^>]*>[\s\S]*?<span class="grow[^"]*">[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi)];
        const targetNum = parseFloat(chapterNum);
        let matched = null;

        if (chBlocks.length) {
            matched = chBlocks.find(c => {
                const raw = (c[3] || '').trim();
                const num = parseFloat(raw.match(/([0-9]+(?:\.[0-9]+)?)/)?.[1] || '');
                return !isNaN(num) && !isNaN(targetNum) && num === targetNum;
            });
            if (!matched && !isNaN(targetNum)) {
                matched = chBlocks.find(c => {
                    const raw = (c[3] || '').trim().toLowerCase();
                    return raw.includes(` ${chapterNum}`) || raw.endsWith(`${chapterNum}`);
                });
            }
        }

        // Secondary regex fallback for standard chapter formats
        if (!matched) {
            const altBlocks = [...lHtml.matchAll(/href="([^"]*\/chapters\/([a-zA-Z0-9]+))"[^>]*>[\s\S]*?(?:chapter|episode|act|days|ch\.?|#)?\s*([0-9\.]+)/gi)];
            if (!isNaN(targetNum)) {
                matched = altBlocks.find(c => parseFloat(c[3]) === targetNum);
            }
            if (!matched) {
                matched = altBlocks.find(c => c[3] === String(chapterNum));
            }
        }

        if (!matched) return null;

        const chId = matched[2];
        const imgUrl = `https://weebcentral.com/chapters/${chId}/images?is_prev=False&current_page=1&reading_style=long_strip`;
        const imgRes = await fetch(imgUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000)
        });
        if (!imgRes.ok) return null;
        const imgHtml = await imgRes.text();
        const imgs = [...imgHtml.matchAll(/src="([^"]+)"/g)].map(m => m[1]).filter(u => /^https?:\/\//i.test(u));
        if (imgs.length) return { source: 'weebcentral', pages: imgs, referer: 'https://weebcentral.com/' };
    } catch (_) {}
    return null;
}

async function proxyMangaFallbackChapter(req, res, requestPath, query) {
    if (requestPath !== '/api/manga-fallback-chapter') return false;

    const title = (query.get('title') || '').trim();
    let chapter = (query.get('chapter') || '').trim();
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

    if (!chapter) {
        const m = title.match(/ch(?:apter)?\.?\s*([0-9\.]+)/i);
        chapter = m ? m[1] : '1';
    }

    if (!title && !altTitles.length) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Title required' }));
        return true;
    }

    const candidateTitles = getMangaCandidateTitles(title, altTitles);
    const primaryKey = (candidateTitles[0] || title).toLowerCase().replace(/[^a-z0-9]/g, '_');
    const cacheKey = `${primaryKey}_ch_${chapter}`;
    const cached = fallbackMangaChapterCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true, source: cached.source, pages: cached.pages }));
        return true;
    }

    let result = null;
    for (const cand of candidateTitles) {
        result = await scrapeWeebCentralChapter(cand, chapter);
        if (result && result.pages && result.pages.length) break;
        result = await scrapeMangapillChapter(cand, chapter);
        if (result && result.pages && result.pages.length) break;
    }

    if (result && result.pages && result.pages.length) {
        const proxiedPages = result.pages.map(rawUrl => {
            return `/api/manga-page?url=${encodeURIComponent(rawUrl)}&ref=${encodeURIComponent(result.referer)}`;
        });

        fallbackMangaChapterCache.set(cacheKey, {
            source: result.source,
            pages: proxiedPages,
            timestamp: Date.now()
        });

        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true, source: result.source, pages: proxiedPages }));
        return true;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, error: 'No fallback pages found for this chapter' }));
    return true;
}

async function proxyMangaPage(req, res, requestPath, query) {
    if (requestPath !== '/api/manga-page') return false;
    const targetUrl = (query.get('url') || '').trim();
    const referer = (query.get('ref') || '').trim();

    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Valid image URL required');
        return true;
    }

    try {
        const u = new URL(targetUrl);
        const refHeader = referer || `${u.protocol}//${u.hostname}/`;
        const resp = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': refHeader,
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!resp.ok) {
            res.writeHead(resp.status, { 'Content-Type': 'text/plain' });
            res.end('Image proxy error: ' + resp.status);
            return true;
        }

        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
            'Access-Control-Allow-Origin': '*'
        });

        const arrayBuffer = await resp.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
    } catch (e) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Failed to proxy manga page: ' + e.message);
    }
    return true;
}

const fallbackImageCache = new Map();

function decodeHtmlEntities(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;|&#39;|&#x27;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function cleanTitleForSearch(t) {
    if (!t) return '';
    return t
        .replace(/\[(?:dub|sub|hd|4k|1080p|720p)\]/gi, '')
        .replace(/\((?:dub|sub|hd|4k|1080p|720p|movie|film|\d{4})\)/gi, '')
        .replace(/\s+(Logo|Poster|Backdrop|Cover|Thumbnail)$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanTokens(str) {
    if (!str) return [];
    const stopWords = new Set(['the', 'a', 'an', 'and', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'movie', 'film', 'part', 'volume', 'vol', 'edition']);
    return str.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 0 && !stopWords.has(t));
}

function titleSimilarity(query, candidate) {
    if (!query || !candidate) return 0;
    const qClean = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cClean = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (qClean === cClean) return 1.0;

    const qTokens = cleanTokens(query);
    const cTokens = cleanTokens(candidate);
    if (!qTokens.length || !cTokens.length) return 0;

    // Single-word short titles must match exactly to prevent false matches (e.g. 'It' vs 'The Last of Us')
    if (qTokens.length === 1 && cTokens.length > 1 && qClean.length <= 4) return 0;

    const cSet = new Set(cTokens);
    let matched = 0;
    for (const qt of qTokens) {
        if (cSet.has(qt)) {
            matched++;
        } else if (cTokens.some(ct => (ct.length >= 4 && qt.length >= 4 && (ct.startsWith(qt) || qt.startsWith(ct))))) {
            matched += 0.8;
        }
    }

    const queryCoverage = matched / qTokens.length;
    const tokenOverlap = (2 * matched) / (qTokens.length + cTokens.length);

    if (queryCoverage >= 0.9) return 0.95;
    if (queryCoverage >= 0.75) return 0.85;
    if (tokenOverlap >= 0.6) return 0.75;
    if (queryCoverage >= 0.5 && tokenOverlap >= 0.4) return 0.6;
    return 0;
}

let _libraryIndex = null;
function getLibraryIndex() {
    if (_libraryIndex) return _libraryIndex;
    _libraryIndex = { byId: new Map(), byTitle: new Map() };
    try {
        const libPath = path.join(__dirname, 'library.json');
        if (fs.existsSync(libPath)) {
            const data = JSON.parse(fs.readFileSync(libPath, 'utf8'));
            const all = [...(data.movies || []), ...(data.tvshows || [])];
            all.forEach(item => {
                if (!item) return;
                const rawId = String(item.tmdbId || item.id || '').trim();
                const numId = rawId.replace(/^[a-z_]+/i, '');
                if (numId) _libraryIndex.byId.set(numId, item);
                if (rawId) _libraryIndex.byId.set(rawId, item);
                const titleKey = (item.title || item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (titleKey && !_libraryIndex.byTitle.has(titleKey)) {
                    _libraryIndex.byTitle.set(titleKey, item);
                }
            });
        }
    } catch (_) {}
    return _libraryIndex;
}

function sendCustomSvg(res, title, year, isBackdrop) {
    const safeTitle = (title || 'Movie').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svgWidth = isBackdrop ? 960 : 500;
    const svgHeight = isBackdrop ? 540 : 750;
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#181824"/>
                    <stop offset="100%" stop-color="#0e0e14"/>
                </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#bg)"/>
            <circle cx="${svgWidth / 2}" cy="${svgHeight / 2 - 35}" r="38" fill="rgba(56, 189, 248, 0.14)"/>
            <path d="M${svgWidth / 2 - 10} ${svgHeight / 2 - 50}v30l24-15z" fill="#38bdf8"/>
            <text x="${svgWidth / 2}" y="${svgHeight / 2 + 35}" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${isBackdrop ? 26 : 22}" font-weight="700" text-anchor="middle">${safeTitle}</text>
            <text x="${svgWidth / 2}" y="${svgHeight / 2 + 65}" fill="#64748b" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" text-anchor="middle">MILKBOX · ${year || 'CINEMA'}</text>
        </svg>
    `.trim();

    res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(svg);
    return true;
}

async function proxyImageFallback(req, res, requestPath, query) {
    if (requestPath !== '/api/image-fallback') return false;

    const rawTitle = decodeHtmlEntities((query.get('title') || '').trim());
    const title = cleanTitleForSearch(rawTitle);
    const year = (query.get('year') || '').trim();
    let rawTmdbId = (query.get('tmdbId') || '').trim();
    const cleanTmdbId = rawTmdbId.replace(/^[a-z_]+/i, '').trim();
    let pathParam = (query.get('path') || '').trim();
    const type = (query.get('type') || 'poster').toLowerCase();
    const isBackdrop = type === 'backdrop';
    const imgSize = isBackdrop ? 'w1280' : 'w500';

    if (pathParam && !pathParam.startsWith('/')) {
        pathParam = '/' + pathParam;
    }

    // Ignore generic icon/placeholder paths to prevent image collisions across movies
    const isGenericPath = !pathParam || /siteicon|placeholder|default|favicon|logo|icon|avatar|cover|poster\.|backdrop\.|thumb\.|null|undefined/i.test(pathParam);
    const isValidTmdbPath = !isGenericPath && /^\/[a-zA-Z0-9_\-]{12,}\.(jpg|jpeg|png|webp)$/i.test(pathParam);

    const isGenericTitle = !title || /^(movie|tv show|untitled|null|undefined|series|film|cinema)$/i.test(title);

    if (isGenericTitle && !isValidTmdbPath && !cleanTmdbId) {
        return sendCustomSvg(res, title || 'Movie', year, isBackdrop);
    }

    // Cache key specific to this exact unique item so images NEVER duplicate or overwrite other titles
    const cleanTitleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let uniqueKey = '';
    if (isValidTmdbPath) {
        uniqueKey = `path_${pathParam.replace(/[^a-z0-9_\-\.]/gi, '_')}`;
    } else if (cleanTmdbId && /^[0-9]+$/.test(cleanTmdbId)) {
        uniqueKey = `tmdb_${cleanTmdbId}`;
    } else if (cleanTitleKey && cleanTitleKey.length > 1 && !isGenericTitle) {
        uniqueKey = `title_${cleanTitleKey}_${year || 'noyear'}`;
    }

    const cacheKey = uniqueKey ? `${uniqueKey}_${type}` : null;

    if (cacheKey) {
        const cached = fallbackImageCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) {
            res.writeHead(200, {
                'Content-Type': cached.contentType || 'image/jpeg',
                'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(cached.buffer);
            return true;
        }
    }

    const tmdbCredential = process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkODIxZmZjZjFhMjQxOWFhMWZjZjY5MjMwMDZjZmNjNCIsIm5iZiI6MTc3NzU2MDc0My45NzMsInN1YiI6IjY5ZjM2Y2E3ZDZhZjA3Yjg2Zjg0MzA3MSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ._CFnVPW7SyxmHdzu3Uxee0LkMlGm4zdW2uCNFV2g9A8';

    async function tryFetchAndSend(imageUrl) {
        try {
            const resp = await fetch(imageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                },
                signal: AbortSignal.timeout(6000)
            });
            if (resp.ok && (resp.headers.get('content-type') || '').startsWith('image/')) {
                const contentType = resp.headers.get('content-type') || 'image/jpeg';
                const arrayBuffer = await resp.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                if (buffer.length > 800) {
                    if (cacheKey) {
                        if (fallbackImageCache.size >= 1000) {
                            const firstKey = fallbackImageCache.keys().next().value;
                            fallbackImageCache.delete(firstKey);
                        }
                        fallbackImageCache.set(cacheKey, { buffer, contentType, timestamp: Date.now() });
                    }

                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(buffer);
                    return true;
                }
            }
        } catch (_) {}
        return false;
    }

    // Step 0: Fast Local Library lookup (24,000+ catalog titles indexed in memory)
    const lib = getLibraryIndex();
    const libItem = (cleanTmdbId && lib.byId.get(cleanTmdbId)) ||
        (rawTmdbId && lib.byId.get(rawTmdbId)) ||
        (title && lib.byTitle.get(title.toLowerCase().replace(/[^a-z0-9]/g, '')));

    if (libItem) {
        const targetImg = isBackdrop ? (libItem.backdrop || libItem.poster) : (libItem.poster || libItem.backdrop);
        if (targetImg && /^https?:\/\//i.test(targetImg)) {
            if (await tryFetchAndSend(targetImg)) return true;
        }
    }

    // Step 1: Exact TMDB path if provided
    if (isValidTmdbPath) {
        if (await tryFetchAndSend(`https://image.tmdb.org/t/p/${imgSize}${pathParam}`)) return true;
    }

    // Step 2: TMDB by ID
    if (cleanTmdbId && /^[0-9]+$/.test(cleanTmdbId)) {
        for (const media of ['movie', 'tv']) {
            try {
                const idUrl = `https://api.themoviedb.org/3/${media}/${cleanTmdbId}`;
                const resp = await fetch(idUrl, {
                    headers: { 'Authorization': `Bearer ${tmdbCredential}` },
                    signal: AbortSignal.timeout(3500)
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const p = isBackdrop ? (data.backdrop_path || data.poster_path) : (data.poster_path || data.backdrop_path);
                    if (p && await tryFetchAndSend(`https://image.tmdb.org/t/p/${imgSize}${p}`)) return true;
                }
            } catch (_) {}
        }
    }

    // Step 3: TMDB Search by Movie Title with smart scoring & matching
    if (title && !isGenericTitle) {
        try {
            // First search movies endpoint for optimal movie title accuracy
            const endpoints = [
                `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&language=en-US`,
                `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(title)}&language=en-US`,
                `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(title)}&language=en-US`
            ];

            for (const endpoint of endpoints) {
                const resp = await fetch(endpoint, {
                    headers: { 'Authorization': `Bearer ${tmdbCredential}` },
                    signal: AbortSignal.timeout(3500)
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const results = data.results || [];
                    if (!results.length) continue;

                    const scored = results
                        .map(r => {
                            const rName = (r.title || r.name || r.original_title || r.original_name || '').toLowerCase().trim();
                            const sim = titleSimilarity(title, rName);
                            const hasImg = Boolean(r.poster_path || r.backdrop_path);
                            const rYear = (r.release_date || r.first_air_date || '').slice(0, 4);
                            let yearBonus = 0;
                            if (year && rYear) {
                                const diff = Math.abs(parseInt(year, 10) - parseInt(rYear, 10));
                                if (diff === 0) yearBonus = 25;
                                else if (diff <= 1) yearBonus = 15;
                            }
                            const pop = r.popularity || 0;
                            const votes = r.vote_count || 0;
                            const score = (sim * 100) + Math.min(pop * 2, 40) + (votes > 50 ? 25 : 0) + yearBonus;
                            return { r, sim, score, hasImg };
                        })
                        .filter(item => item.hasImg && item.sim >= 0.5)
                        .sort((a, b) => b.score - a.score);

                    const bestMatch = scored[0]?.r;
                    if (bestMatch) {
                        const p = isBackdrop ? (bestMatch.backdrop_path || bestMatch.poster_path) : (bestMatch.poster_path || bestMatch.backdrop_path);
                        if (p && await tryFetchAndSend(`https://image.tmdb.org/t/p/${imgSize}${p}`)) return true;
                    }
                }
            }
        } catch (_) {}
    }

    // Step 4: Wikipedia Page Summary API by title
    if (title && !isGenericTitle) {
        try {
            const wikiBase = title.replace(/\s+/g, '_');
            for (const suffix of ['_(film)', '', '_(movie)', '_(series)', '_(TV_series)', '_(anime)']) {
                const wUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiBase + suffix)}`;
                const wRes = await fetch(wUrl, {
                    headers: { 'User-Agent': 'MILKBOX/1.0 (https://milkbox.app; contact@milkbox.app)' },
                    signal: AbortSignal.timeout(3000)
                });
                if (wRes.ok) {
                    const wData = await wRes.json();
                    const wikiImg = (wData.originalimage && wData.originalimage.source) || (wData.thumbnail && wData.thumbnail.source);
                    if (wikiImg && await tryFetchAndSend(wikiImg)) return true;
                    if (wData.type === 'standard') break;
                }
            }
        } catch (_) {}
    }

    // Step 5: Web Search for the specific title
    if (title && !isGenericTitle) {
        try {
            const searchTerms = `"${title}" ${year ? year + ' ' : ''}${isBackdrop ? 'theatrical wallpaper backdrop' : 'theatrical movie poster'}`.trim();
            const vqdRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(searchTerms)}&iax=images&ia=images`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
                signal: AbortSignal.timeout(3500)
            });
            const vqdHtml = await vqdRes.text();
            const vqdMatch = vqdHtml.match(/vqd=([0-9-]+)/) || vqdHtml.match(/vqd=\"([0-9-]+)\"/);
            if (vqdMatch) {
                const imgRes = await fetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(searchTerms)}&vqd=${vqdMatch[1]}&f=,,,`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    signal: AbortSignal.timeout(3500)
                });
                const data = await imgRes.json();
                if (data && Array.isArray(data.results)) {
                    for (const r of data.results.slice(0, 5)) {
                        if (r.image && /^https?:\/\//i.test(r.image) && !/favicon|icon|avatar|blank|pixel/i.test(r.image)) {
                            if (await tryFetchAndSend(r.image)) return true;
                        }
                    }
                }
            }
        } catch (_) {}
    }

    // Step 6: Customized SVG badge with the specific item's exact title and year
    return sendCustomSvg(res, title || 'Movie', year, isBackdrop);
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

        if (targetUrl.startsWith('/milkbox-embed') || targetUrl.includes('server=x8rrmovies')) {
            res.writeHead(302, { 'Location': targetUrl });
            res.end();
            return true;
        }

        try {
            const parsed = new URL(targetUrl, 'http://localhost:3000');
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error('Invalid URL protocol');
            }

            // Extract media metadata from targetUrl if present
            let mediaType = 'movie';
            let mediaId = '';
            let season = 1;
            let episode = 1;

            const pathname = parsed.pathname;
            const tvMatch = pathname.match(/(?:embed\/)?tv\/([a-zA-Z0-9_-]+)(?:\/(\d+))?(?:\/(\d+))?/i);
            const movieMatch = pathname.match(/(?:embed\/)?movie\/([a-zA-Z0-9_-]+)/i);

            if (tvMatch) {
                mediaType = 'tv';
                mediaId = tvMatch[1];
                if (tvMatch[2]) season = parseInt(tvMatch[2], 10) || 1;
                if (tvMatch[3]) episode = parseInt(tvMatch[3], 10) || 1;
            } else if (movieMatch) {
                mediaType = 'movie';
                mediaId = movieMatch[1];
            }

            if (parsed.searchParams.has('s')) season = parseInt(parsed.searchParams.get('s'), 10) || season;
            if (parsed.searchParams.has('season')) season = parseInt(parsed.searchParams.get('season'), 10) || season;
            if (parsed.searchParams.has('e')) episode = parseInt(parsed.searchParams.get('e'), 10) || episode;
            if (parsed.searchParams.has('episode')) episode = parseInt(parsed.searchParams.get('episode'), 10) || episode;
            if (parsed.searchParams.has('id') && !mediaId) mediaId = parsed.searchParams.get('id');

            const idForMirrors = mediaId || '550';
            const mirrors = {
                x8rrmovies: mediaType === 'tv'
                    ? `/milkbox-embed.html?type=tv&id=${encodeURIComponent(idForMirrors)}&season=${season}&episode=${episode}&server=x8rrmovies&autoplay=true`
                    : `/milkbox-embed.html?type=movie&id=${encodeURIComponent(idForMirrors)}&server=x8rrmovies&autoplay=true`,
                vidlink: mediaType === 'tv'
                    ? `https://vidlink.pro/tv/${encodeURIComponent(idForMirrors)}/${season}/${episode}?primaryColor=ff2e63&autoplay=true`
                    : `https://vidlink.pro/movie/${encodeURIComponent(idForMirrors)}?primaryColor=ff2e63&autoplay=true`,
                cinesrc: mediaType === 'tv'
                    ? `https://cinesrc.st/embed/tv/${encodeURIComponent(idForMirrors)}?s=${season}&e=${episode}`
                    : `https://cinesrc.st/embed/movie/${encodeURIComponent(idForMirrors)}`,
                vidsrc: mediaType === 'tv'
                    ? `https://vidsrc.pm/embed/tv/${encodeURIComponent(idForMirrors)}/${season}/${episode}`
                    : `https://vidsrc.pm/embed/movie/${encodeURIComponent(idForMirrors)}`,
                vidnest: mediaType === 'tv'
                    ? `https://vidnest.fun/tv/${encodeURIComponent(idForMirrors)}/${season}/${episode}`
                    : `https://vidnest.fun/movie/${encodeURIComponent(idForMirrors)}`,
                pstream: mediaType === 'tv'
                    ? `https://embed.pstream.cfd/tv/${encodeURIComponent(idForMirrors)}/${season}/${episode}`
                    : `https://embed.pstream.cfd/movie/${encodeURIComponent(idForMirrors)}`,
                vidfast: mediaType === 'tv'
                    ? `https://vidfast.vc/tv/${encodeURIComponent(idForMirrors)}/${season}/${episode}?autoPlay=true&nextButton=true&theme=ff2e63`
                    : `https://vidfast.vc/movie/${encodeURIComponent(idForMirrors)}?autoPlay=true&theme=ff2e63`
            };

            const escapedTargetUrl = targetUrl
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="referrer" content="origin-when-cross-origin">
    <title>Scramjet Shielded Proxy Player</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
            width: 100%;
            height: 100%;
            background: #000;
            overflow: hidden;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #fff;
        }
        .scramjet-container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #000;
        }
        .scramjet-frame {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: 0;
            background: #000;
            z-index: 1;
        }
        .scramjet-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #09090e;
            z-index: 20;
            transition: opacity 0.25s ease, visibility 0.25s ease;
            pointer-events: none;
        }
        .scramjet-overlay.loaded {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
        }
        .scramjet-spinner {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 3px solid rgba(255, 46, 99, 0.2);
            border-top-color: #ff2e63;
            animation: scramjet-spin 0.75s linear infinite;
        }
        @keyframes scramjet-spin {
            to { transform: rotate(360deg); }
        }
        .scramjet-status-title {
            margin-top: 16px;
            font-size: 13px;
            font-weight: 800;
            color: #ff5e82;
            letter-spacing: 0.6px;
            text-transform: uppercase;
        }
        .scramjet-status-sub {
            margin-top: 6px;
            font-size: 12px;
            color: #8c8c9e;
        }
        .scramjet-quick-bar {
            position: absolute;
            bottom: 12px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 30;
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(14, 14, 20, 0.92);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 20px;
            padding: 4px 10px;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: auto;
        }
        .scramjet-container:hover .scramjet-quick-bar {
            opacity: 1;
        }
        .scramjet-quick-btn {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.16);
            color: #dcdce6;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .scramjet-quick-btn:hover {
            background: #ff2e63;
            border-color: #ff2e63;
            color: #fff;
        }
    </style>
</head>
<body>
    <div class="scramjet-container" id="scramjetContainer">
        <div class="scramjet-overlay" id="scramjetOverlay">
            <div class="scramjet-spinner"></div>
            <div class="scramjet-status-title">⚡ Scramjet Shielded Proxy</div>
            <div class="scramjet-status-sub" id="scramjetStatusText">Establishing secure tunnel with popunder shield…</div>
        </div>

        <iframe id="scramjetTargetIframe"
                class="scramjet-frame"
                src="${escapedTargetUrl}"
                allowfullscreen
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                referrerpolicy="origin-when-cross-origin"></iframe>

        <div class="scramjet-quick-bar" id="scramjetQuickBar">
            <span style="font-size:10px;font-weight:800;color:#ff5e82;text-transform:uppercase;margin-right:2px;">⚡ Scramjet:</span>
            <button class="scramjet-quick-btn" type="button" onclick="loadMirror('x8rrmovies')">🍿 Milkbox HLS</button>
            <button class="scramjet-quick-btn" type="button" onclick="loadMirror('vidlink')">💎 VidLink</button>
            <button class="scramjet-quick-btn" type="button" onclick="loadMirror('cinesrc')">🎬 CineSRC</button>
            <button class="scramjet-quick-btn" type="button" onclick="loadMirror('vidsrc')">📺 VidSrc</button>
            <button class="scramjet-quick-btn" type="button" onclick="loadMirror('vidnest')">🪺 VidNest</button>
            <button class="scramjet-quick-btn" type="button" onclick="loadMirror('pstream')">🚀 P-Stream</button>
            <button class="scramjet-quick-btn" type="button" onclick="loadMirror('vidfast')">⚡ VidFast</button>
        </div>
    </div>

    <script>
        (function() {
            try {
                // Anti-Popunder & Sandbox Protection Shield
                window.open = function() { console.log('[Scramjet Proxy] Blocked popup window'); return null; };
                window.alert = function() {};
                window.confirm = function() { return true; };
                window.prompt = function() { return null; };
                window.onbeforeunload = null;
                window.addEventListener('beforeunload', function(e) { e.stopImmediatePropagation(); }, true);
            } catch(e) {}

            var ifr = document.getElementById('scramjetTargetIframe');
            var overlay = document.getElementById('scramjetOverlay');
            var statusText = document.getElementById('scramjetStatusText');

            function hideOverlay() {
                if (overlay) {
                    overlay.classList.add('loaded');
                    overlay.style.pointerEvents = 'none';
                    setTimeout(function() {
                        if (overlay) overlay.style.display = 'none';
                    }, 250);
                }
            }

            if (ifr) {
                ifr.addEventListener('load', function() {
                    setTimeout(hideOverlay, 150);
                });
            }
            setTimeout(hideOverlay, 600);

            var mirrors = ${JSON.stringify(mirrors)};

            window.loadMirror = function(key) {
                var url = mirrors[key];
                if (!url) return;
                if (overlay) {
                    overlay.style.display = 'flex';
                    overlay.style.pointerEvents = 'none';
                    overlay.classList.remove('loaded');
                    if (statusText) statusText.textContent = 'Switching to ' + key.toUpperCase() + ' mirror…';
                }
                if (ifr) {
                    ifr.src = url;
                }
                try {
                    window.parent.postMessage({ type: 'scramjet:switchSource', source: key }, '*');
                } catch(e) {}
                setTimeout(hideOverlay, 800);
            };
        })();
    </script>
</body>
</html>`;

            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Permissions-Policy': 'autoplay=*, fullscreen=*, picture-in-picture=*',
                'Cache-Control': 'public, max-age=120'
            });
            res.end(html);
            return true;
        } catch (err) {
            console.warn('[Scramjet Proxy] Error:', err.message);
            res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scramjet Proxy Notice</title></head><body style="background:#09090e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;"><div style="padding:24px;max-width:440px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,46,99,0.3);border-radius:12px;"><h3 style="margin:0 0 8px 0;color:#ff2e63;">Scramjet Proxy Connection Notice</h3><p style="margin:0;font-size:13px;color:#a0a0b0;">${err.message || 'Error initializing proxy'}</p></div></body></html>`);
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
    if (requestPath === '/api/x8rr/subtitles/vtt' || requestPath === '/api/subtitles/vtt') {
        if (await handleX8rrVttProxy(req, res, query.get('url'))) return;
    }
    if (requestPath.startsWith('/api/x8rr/subtitles') || requestPath === '/api/stream/subtitles') {
        if (await handleX8rrSubtitlesApi(req, res, requestPath, query)) return;
    }
    if (requestPath === '/api/x8rr/proxy' || requestPath === '/api/proxy') {
        if (await handleX8rrProxy(req, res, query.get('url'))) return;
    }
    if (requestPath.startsWith('/api/x8rr/stream') || requestPath.startsWith('/api/stream/movie/') || requestPath.startsWith('/api/stream/tv/') || requestPath === '/api/stream/scrape') {
        if (await handleX8rrStreamApi(req, res, requestPath, query)) return;
    }
    if (await handleScramjetProxy(req, res, requestPath, query)) return;
    if (await resolvePlayback(req, res, requestPath, query)) return;
    if (await proxyTmdb(req, res, requestPath, query)) return;
    if (await handleX8rrManga(req, res, requestPath, query)) return;
    if (await proxyMangaDex(req, res, requestPath, query)) return;
    if (await proxyMangaDexCover(req, res, requestPath)) return;
    if (await proxyMangaFallbackChapter(req, res, requestPath, query)) return;
    if (await proxyMangaPage(req, res, requestPath, query)) return;
    if (await proxyImageFallback(req, res, requestPath, query)) return;
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

    function injectAbsoluteOg(htmlString, requestObj) {
        const host = requestObj.headers['x-forwarded-host'] || requestObj.headers.host || '';
        const proto = requestObj.headers['x-forwarded-proto'] || (requestObj.socket && requestObj.socket.encrypted ? 'https' : 'http');
        const origin = host ? `${proto}://${host}` : '';
        if (!origin) return htmlString;
        return htmlString
            .replace(/content="\/assets\/milkbox-og-banner\.png"/g, `content="${origin}/assets/milkbox-og-banner.png"`)
            .replace(/"image":\s*"\/assets\/milkbox-og-banner\.png"/g, `"image": "${origin}/assets/milkbox-og-banner.png"`);
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
                    const processed = injectAbsoluteOg(indexContent.toString('utf8'), req);
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(processed);
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
        let outputContent = content;
        if (filePath.endsWith('index.html')) {
            outputContent = Buffer.from(injectAbsoluteOg(content.toString('utf8'), req));
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = mimeTypes[ext] || 'application/octet-stream';
        const isStaticAsset = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'].includes(ext);
        const cacheControl = isStaticAsset ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-cache';
        const acceptEncoding = (req.headers && req.headers['accept-encoding']) || '';

        if (outputContent.length > 2048 && ['.json', '.js', '.css', '.html', '.svg'].includes(ext) && acceptEncoding.includes('gzip')) {
            zlib.gzip(outputContent, (gzErr, gzData) => {
                if (gzErr) {
                    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cacheControl });
                    res.end(outputContent);
                } else {
                    res.writeHead(200, {
                        'Content-Type': type,
                        'Content-Encoding': 'gzip',
                        'Cache-Control': cacheControl
                    });
                    res.end(gzData);
                }
            });
            return;
        }

        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cacheControl });
        res.end(outputContent);
    });
});

watchPartyServer = initWatchPartyServer(server);

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`[MILKBOX] Port ${port} is already in use. Retrying on default port 3000...`);
        if (port !== 3000) {
            port = 3000;
            server.listen(3000, '0.0.0.0');
            return;
        }
    }
    console.error('[MILKBOX] Server error:', err);
});

server.listen(port, '0.0.0.0', () => {
    console.log(`MILKBOX running at http://localhost:${port}`);
    // Startup auto-sync after server initializes (non-blocking in child process)
    setTimeout(() => {
        try {
            console.log('[Auto-Sync] Initiating non-blocking startup sync to GitHub...');
            const { spawn } = require('child_process');
            const child = spawn(process.execPath, [path.join(__dirname, 'sync-github.js'), 'Startup auto-sync: MILKBOX'], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
        } catch (e) {
            console.warn('[Auto-Sync] Startup sync notice:', e.message);
        }
    }, 10000);

    // Continuous auto-sync every 5 minutes (non-blocking in child process)
    setInterval(() => {
        try {
            const { spawn } = require('child_process');
            const child = spawn(process.execPath, [path.join(__dirname, 'sync-github.js'), 'Periodic auto-sync: MILKBOX'], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
        } catch (e) {
            console.warn('[Auto-Sync] Periodic sync notice:', e.message);
        }
    }, 5 * 60 * 1000);
});

