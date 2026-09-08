// ==================== DATA STORE ====================
const HOSTED_LIBRARY_URL = 'https://raw.githubusercontent.com/IordBeerus/DrivePlayer-About-blank-Opener/refs/heads/main/library.json';
let movies = JSON.parse(localStorage.getItem('sf_movies')) || [];
let tvShows = JSON.parse(localStorage.getItem('sf_tvshows')) || [];
let myList = JSON.parse(localStorage.getItem('sf_mylist')) || [];
let settings = JSON.parse(localStorage.getItem('sf_settings')) || {
    cloakTitle: '',
    cloakFavicon: '',
    cloakLogoText: 'MILKBOX',
    cloakLogoImage: 'https://raw.githubusercontent.com/IordBeerus/MILKBOX/main/SiteIcon.png',
    playerServer: 'auto',
    autoPlayNext: true,
    bgColor: '#141414',
    bgImage: '',
    bgOpacity: 30,
    bgBlur: 0,
    overlayOpacity: 60,
    overlayBlur: 2,
    activeTheme: '',
    heroLogo: '',
    heroLogoData: '',
    showCollections: true
};
let customThemes = JSON.parse(localStorage.getItem('sf_custom_themes')) || [];
function saveCustomThemes() { localStorage.setItem('sf_custom_themes', JSON.stringify(customThemes)); }

// IndexedDB storage for uploaded background files (large videos/images can't fit in localStorage).
let _bgDb = null;
function bgDb() {
    if (_bgDb) return Promise.resolve(_bgDb);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('milkbox_bg', 1);
        req.onupgradeneeded = () => { req.result.createObjectStore('files'); };
        req.onsuccess = () => { _bgDb = req.result; resolve(_bgDb); };
        req.onerror = () => reject(req.error);
    });
}
function bgStoreFile(name, blob) {
    return bgDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(blob, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}
function bgLoadFile(name) {
    return bgDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}
function bgDeleteFile(name) {
    return bgDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}
function isStoredBg(src) { return typeof src === 'string' && src.indexOf('storedbg:') === 0; }
function storedBgKind(src) { return isStoredBg(src) ? (src.split(':')[1] || 'image') : 'url'; }
function storedBgName(src) { return isStoredBg(src) ? src.split(':').slice(2).join(':') : ''; }
function sStoredLabel(src) {
    if (!isStoredBg(src)) return src;
    const kind = storedBgKind(src);
    return '(uploaded ' + kind + ' — ' + storedBgName(src) + ')';
}

// Tracks the active background blob URL so it can be revoked when replaced.
let _activeBgUrl = null;
// Rename old default branding so their saved settings reflect the new site name/logo.
(function migrateBranding() {
    let changed = false;
    if (settings.cloakLogoText === 'LUCKYFLIX') { settings.cloakLogoText = 'MILKBOX'; changed = true; }
    if (settings.cloakTitle === 'LUCKYFLIX') { settings.cloakTitle = ''; changed = true; }
    if (settings.cloakLogoImage === 'LUCKYFLIX') { settings.cloakLogoImage = 'https://raw.githubusercontent.com/IordBeerus/MILKBOX/main/SiteIcon.png'; changed = true; }
    if (!settings.cloakLogoImage) { settings.cloakLogoImage = 'https://raw.githubusercontent.com/IordBeerus/MILKBOX/main/SiteIcon.png'; changed = true; }
    if (settings.autoPlayNext === undefined) { settings.autoPlayNext = true; changed = true; }
    if (changed) localStorage.setItem('sf_settings', JSON.stringify(settings));
})();
let uploadedDriveEps = [];
let uploadedFileEps = [];
let currentInfoItem = null;
let currentInfoType = null;
// LightSpeed / Chrome block bypass — proxy TMDB + GitHub + Monochrome (music) when filtered
(function(){
    const origFetch = window.fetch.bind(window);
    const isProxied = (u) => /api\.themoviedb\.org|raw\.githubusercontent\.com|api\.mangadex\.org|monochrome\.tf|tidal\.com|deezer\.com|spotify\.com|api\.apple\.com|am-mint\.binimum\.org/i.test(String(u));
    const googleProxy = (u) => `https://images1-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&url=${encodeURIComponent(u)}`;
    const allOriginsProxy = (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`;
    window.googleProxy = googleProxy;
    window.allOriginsProxy = allOriginsProxy;
    window.fetch = async function(input, init){
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (!isProxied(url)) return origFetch(input, init);
        // Try direct first
        try {
            const res = await origFetch(input, init);
            if (res.ok) {
                const ct = res.headers.get('content-type') || '';
                // LightSpeed often returns 200 with HTML block page instead of JSON
                if (ct.includes('application/json') || ct.includes('image/')) return res;
                const clone = res.clone();
                try {
                    const txt = await clone.text();
                    if (/LightSpeed|blocked by|filter|access denied|category.*streaming/i.test(txt) && txt.length < 8000) throw new Error('LightSpeed HTML block');
                } catch {}
                return res;
            }
            if (res.status === 403 || res.status === 451 || res.status === 502) throw new Error('Blocked ' + res.status);
            return res;
        } catch (e) {
            try { window._lightspeedDetected = true; localStorage.setItem('milkbox_lightspeed', '1'); } catch {}
            console.warn('[MILKBOX] LightSpeed detected for', url, '— retrying via proxy');
            // Try Google proxy (usually not categorized)
            try {
                const r2 = await origFetch(googleProxy(url), init);
                if (r2.ok) {
                    // Google proxy wraps JSON in some cases, but for our APIs it returns raw
                    const ct2 = r2.headers.get('content-type') || '';
                    if (ct2.includes('application/json') || r2.headers.get('content-length')) return r2;
                    // If Google proxy also blocked, try allorigins
                }
            } catch {}
            try {
                const r3 = await origFetch(allOriginsProxy(url), init);
                if (r3.ok) return r3;
            } catch {}
            throw e;
        }
    };
})();
// Popup/ad blocker for cloud servers — no sandbox (sandbox triggers "Iframe Sandbox Detected"), so block via JS
(function(){
    const origOpen = window.open;
    const isAdUrl = (u) => {
        const s = String(u||'').toLowerCase();
        return /doubleclick|googlesyndication|googleads|adservice|popads|popcash|exoclick|propellerads|adsterra|onclkds|trafficjunky|adnxs|adsystem|criteo|outbrain|taboola|mgid|clickadilla|adsterra|a-ads|coinzilla/i.test(s) || /\/pop\/|\/popup\/|\/ad\//i.test(s);
    };
    const allowUrl = (u) => {
        const s = String(u||'');
        return s === 'about:blank' || s === '' || s.startsWith('blob:') || s.startsWith('data:') || s.startsWith('https://drive.google.com') || s.startsWith('https://www.youtube.com/embed/');
    };
    window.open = function(url, name, specs){
        const u = String(url||'');
        if (allowUrl(u) || (u === '' && name === '_blank')) return origOpen.call(window, url, name, specs);
        // Block all http popups from cloud iframes — they are ads
        console.warn('[MILKBOX] Popup blocked:', u);
        return { closed:false, close(){}, focus(){}, blur(){}, location:{href:u}, document:{}, opener:null };
    };
    try { window.showModalDialog = window.open; } catch {}
    // Also block <a target="_blank"> ad links and top navigation to ad sites
    document.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a && a.href && isAdUrl(a.href)) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            console.warn('[MILKBOX] Ad link blocked:', a.href);
            return false;
        }
        const at = e.target.closest('a[target="_blank"]');
        if (at && at.href && (isAdUrl(at.href) || at.href.startsWith('http'))) {
            // Only block if it looks like ad, not our own navigation
            if (isAdUrl(at.href)) { e.preventDefault(); console.warn('[MILKBOX] Link popup blocked:', at.href); }
        }
    }, true);
    // Block location changes to ad sites (e.g. top.location = adUrl)
    const origAssign = window.location.assign.bind(window.location);
    const origReplace = window.location.replace.bind(window.location);
    try {
        window.location.assign = function(url){ if (isAdUrl(String(url))) { console.warn('[MILKBOX] location.assign blocked:', url); return; } return origAssign(url); };
        window.location.replace = function(url){ if (isAdUrl(String(url))) { console.warn('[MILKBOX] location.replace blocked:', url); return; } return origReplace(url); };
    } catch {}
    // Also block beforeunload navigation to ad sites
    window.addEventListener('beforeunload', (e) => {
        // No-op, but prevents some ad scripts from using beforeunload to open ad
    }, true);
})();
// Shield that sits over the player on first load — first click dismisses shield instead of reaching the iframe's ad trigger
function showPopupShield(){
    const s=document.getElementById('playerPopupShield');
    if(!s) return;
    s.style.display='flex';
    s.style.background='rgba(0,0,0,0.88)';
    s.style.pointerEvents='auto';
    if (!s.innerHTML.trim()) s.innerHTML = `<div style="width:64px; height:64px; border-radius:50%; background:#e50914; display:flex; align-items:center; justify-content:center; box-shadow:0 8px 24px rgba(229,9,20,0.45);"><svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="#fff"><path d="M320-200v-560l440 280-440 280Z"/></svg></div><div style="color:#fff; font-weight:800; font-size:14px; letter-spacing:0.3px;">Click to Play — Ads Blocked</div><div style="color:#9a9aa0; font-size:11px;">First click removes shield, second click controls video</div>`;
}
function hidePopupShield(){ const s=document.getElementById('playerPopupShield'); if(s){ s.style.display='none'; } }
document.addEventListener('click', (e) => {
    const shield = document.getElementById('playerPopupShield');
    if (!shield || shield.style.display === 'none') return;
    if (e.target.closest('#playerPopupShield')) {
        e.preventDefault(); e.stopPropagation();
        hidePopupShield();
        // also try to harden the just-exposed iframe against window.open
        const ifr = document.querySelector('#playerFrame iframe');
        if (ifr) {
            try {
                const cw = ifr.contentWindow;
                if (cw) { try { cw.open = window.open; } catch {} }
            } catch {}
        }
    }
});
function hardenCloudIframe(iframe){
    if (!iframe) return;
    try {
        const cw = iframe.contentWindow;
        if (cw) cw.open = window.open;
    } catch {}
    // Show shield for cloud iframes so first click is intercepted (prevents ad popup on first interaction)
    // Don't show for Drive or for megavid anime which is low-ad; detect via src
    try {
        const src = iframe.src || iframe.getAttribute('src') || '';
        const isCloud = /phantom|vidsrc|vidcore|videasy|multiembed|moviesapi|autoembed|yapgrid|embedflix|vidlink|vidspark|vidrock|vidflix|vidlux|vidsrcme|vidsrc\.in|vidsrc\.io|vsembed|2embed|embed\.su|vidfast|wfs\.lol|toustream|vidhawk|anixo/i.test(src);
        if (isCloud) setTimeout(showPopupShield, 320);
        else {
            const pf = document.getElementById('playerFrame');
            if (pf && /phantom|vidsrc|vidcore|videasy|multiembed|moviesapi|autoembed|yapgrid|embedflix|vidlink|vidspark|vidrock|vidflix|vidlux|vidsrcme|vidsrc\.in|vidsrc\.io|vsembed|2embed|embed\.su|vidfast|wfs\.lol|toustream|vidhawk|anixo/i.test(pf.innerHTML)) setTimeout(showPopupShield, 320);
        }
    } catch { setTimeout(showPopupShield, 320); }
}
// ==================== SOURCE PROTECTION ====================
// Makes it significantly harder to steal/view the site source. Note: client-side
// code can never be 100% hidden — this blocks the easy vectors (right-click,
// view-source shortcuts, devtools shortcuts, drag/select of code, and deters
// casual copying). For strongest protection, deploy a minified/obfuscated build.
(function(){
    const BLOCK_MSG = 'MILKBOX — source protected';
    // Disable right-click context menu (except on inputs where it is needed for paste)
    document.addEventListener('contextmenu', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        try { toast(BLOCK_MSG); } catch {}
    }, true);
    // Block common devtools / view-source / save shortcuts
    document.addEventListener('keydown', (e) => {
        const k = (e.key || '').toLowerCase();
        // F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S, Ctrl+Shift+K (Firefox)
        if (e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['i','j','c','k'].includes(k)) ||
            (e.ctrlKey && ['u','s'].includes(k))) {
            e.preventDefault(); e.stopPropagation();
            try { toast(BLOCK_MSG); } catch {}
            return false;
        }
        // Cmd + Opt + I/J on macOS
        if (e.metaKey && e.altKey && ['i','j'].includes(k)) {
            e.preventDefault(); e.stopPropagation();
            return false;
        }
    }, true);
    // Block drag of images and text selection via triple-click on code areas (keep inputs usable)
    document.addEventListener('dragstart', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        // allow dragging inside player for controls, but block elsewhere
        if (!e.target.closest || !e.target.closest('#playerFrame')) e.preventDefault();
    }, true);
    // DevTools detection — reload once when opened to deter casual inspection
    let dtOpen = false;
    const reloadKey = 'milkbox_devtools_reload';
    const reloadForDevTools = () => {
        try {
            if (sessionStorage.getItem(reloadKey) === '1') return;
            sessionStorage.setItem(reloadKey, '1');
        } catch {}
        window.location.reload();
    };
    const detect = () => {
        try {
            const w = window.outerWidth - window.innerWidth;
            const h = window.outerHeight - window.innerHeight;
            const isOpen = w > 160 || h > 160;
            if (isOpen && !dtOpen) {
                dtOpen = true;
                console.clear();
                console.log('%c' + BLOCK_MSG, 'font-size:32px;color:#e50914;font-weight:900;');
                console.log('%cCurious? This site is protected. Please contact the owner instead of copying.', 'font-size:13px;color:#888;');
                reloadForDevTools();
            } else if (!isOpen) dtOpen = false;
            if (!isOpen) sessionStorage.removeItem(reloadKey);
        } catch {}
    };
    setInterval(detect, 1200);
    // Clear console on load, add warning
    try { console.clear(); console.log('%c' + BLOCK_MSG + ' — unauthorized copying is not permitted.', 'color:#e50914;font-weight:800;'); } catch {}
})();

// Persistent ad shield — after the first play, every mousedown inside the player briefly shows a transparent shield
// so the ad popup triggered by that click is swallowed and never reaches window.open
(function(){
    const container = document.getElementById('playerContainer');
    if (!container) return;
    let shieldTimer = null;
    let blockTimer = null;
    const origOpen = window.open;
    container.addEventListener('mousedown', (e) => {
        const shield = document.getElementById('playerPopupShield');
        const pf = document.getElementById('playerFrame');
        if (!shield || !pf) return;
        // Only intercept clicks that would reach the iframe (not the shield's own play button)
        if (shield.style.display !== 'none') return;
        if (!pf.contains(e.target) && !container.contains(e.target)) return;
        // Show transparent shield for 750ms to swallow the ad click
        shield.style.display = 'flex';
        shield.style.background = 'transparent';
        shield.style.pointerEvents = 'auto';
        shield.innerHTML = '';
        clearTimeout(shieldTimer);
        shieldTimer = setTimeout(() => {
            shield.style.display = 'none';
            shield.style.background = '';
            shield.innerHTML = `<div style="width:64px; height:64px; border-radius:50%; background:#e50914; display:flex; align-items:center; justify-content:center; box-shadow:0 8px 24px rgba(229,9,20,0.45);"><svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="#fff"><path d="M320-200v-560l440 280-440 280Z"/></svg></div><div style="color:#fff; font-weight:800; font-size:14px; letter-spacing:0.3px;">Click to Play — Ads Blocked</div><div style="color:#9a9aa0; font-size:11px;">First click removes shield, second click controls video</div>`;
        }, 750);
        // Hard block window.open for the next 900ms (covers the ad's async open)
        window.open = function(){ return { closed:false, close(){}, focus(){}, blur(){}, location:{href:''}, document:{}, opener:null }; };
        clearTimeout(blockTimer);
        blockTimer = setTimeout(() => { window.open = origOpen; }, 900);
        // Don't prevent the click from reaching the player controls after the shield hides — the synthetic delay above handles it
    }, true);
})();

// ==================== UTILITY ====================
function saveData() {
    const keys = ['sf_movies', 'sf_tvshows', 'sf_mylist', 'sf_settings'];
    try {
        localStorage.setItem('sf_movies', JSON.stringify(movies));
        localStorage.setItem('sf_tvshows', JSON.stringify(tvShows));
        localStorage.setItem('sf_mylist', JSON.stringify(myList));
        localStorage.setItem('sf_settings', JSON.stringify(settings));
    } catch (err) {
        if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
            trimLibraryForStorage();
            try {
                localStorage.setItem('sf_movies', JSON.stringify(movies));
                localStorage.setItem('sf_tvshows', JSON.stringify(tvShows));
                localStorage.setItem('sf_mylist', JSON.stringify(myList));
                localStorage.setItem('sf_settings', JSON.stringify(settings));
                toast('Library was too large for storage, so older items were trimmed.', 'error');
            } catch (e) { toast('Storage is full. Clear some items via Edit > Remove.', 'error'); }
        } else { throw err; }
    }
}

// Estimated byte size of the current serialized library.
function libraryBytes() {
    try { return JSON.stringify(movies).length + JSON.stringify(tvShows).length + JSON.stringify(myList).length + JSON.stringify(settings).length; }
    catch (e) { return 0; }
}

// When storage is full, drop the oldest half of movies and shows (keeping My List) so the site keeps working.
function trimLibraryForStorage() {
    const dropM = Math.floor(movies.length / 2);
    const dropT = Math.floor(tvShows.length / 2);
    if (dropM > 0) movies = movies.slice(dropM);
    if (dropT > 0) tvShows = tvShows.slice(dropT);
}

// Shortens long stored descriptions on auto-loaded TMDB titles (only items with a
// tmdbId are touched; user-typed custom items keep their full blurb). Running this
// frees a lot of localStorage space so even more titles fit. Idempotent.
function compactLibraryDescriptions() {
    const compact = (it) => {
        if (!it || !it.tmdbId || !it.description) return null;
        const d = it.description.replace(/\s+/g, ' ').trim();
        if (d.length <= 240 && d === it.description) return null;
        return d.length > 240 ? d.slice(0, 240).trimEnd() + '…' : d;
    };
    let changed = false;
    movies.forEach(m => { const c = compact(m); if (c) { m.description = c; changed = true; } });
    tvShows.forEach(t => { const c = compact(t); if (c) { t.description = c; changed = true; } });
    if (changed) {
        try { saveData(); } catch (e) { trimLibraryForStorage(); saveData(); }
    }
    return changed;
}

// Auto-loads the full library on every open so the Load Library button isn't needed:
// first tries the hosted JSON, then always auto-runs the TMDB genre loader to top up any missing titles.
async function autoLoadHostedLibrary() {
    let loaded = false;
    if (HOSTED_LIBRARY_URL) {
        try {
            const res = await fetch(HOSTED_LIBRARY_URL, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                const m = Array.isArray(data.movies) ? data.movies.filter(x => x && x.title) : [];
                const t = Array.isArray(data.tvshows) ? data.tvshows.filter(x => x && x.title) : [];
                if (m.length || t.length) {
                    const hadNoData = !(movies.length || tvShows.length);
                    if (hadNoData) {
                        movies = m;
                        tvShows = t;
                        saveData();
                        refreshCurrent();
                        loaded = true;
                        enrichMissingLogos().catch(() => {});
                    }
                }
            }
        } catch (e) { /* fall through to TMDB auto-load */ }
    }
    // Free up storage by compacting old long TMDB descriptions (idempotent; only
    // touches auto-loaded titles) so the top-up below can keep even more titles.
    try { compactLibraryDescriptions(); } catch (e) { /* non-fatal */ }
    // Always auto-load popular TMDB library on open — no button press needed (adds only missing titles, skips dupes)
    const before = movies.length + tvShows.length;
    try {
        await loadPopularContent(true);
    } catch (e) {
        console.error('[MILKBOX] TMDB auto-load failed:', e);
        if (typeof toast === 'function') toast('TMDB no acepta el token configurado.', 'error');
    }
    if (movies.length + tvShows.length > before && typeof toast === 'function') toast('Library loaded!');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => t.className = 'toast', 3000);
}

function convertDriveLink(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (/^\s*javascript:/i.test(trimmed) || /^\s*data:/i.test(trimmed) || /^\s*vbscript:/i.test(trimmed)) return '';
    const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    const match2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2) return `https://drive.google.com/file/d/${match2[1]}/preview`;
    if (trimmed.includes('drive.google.com')) {
        return trimmed.replace('/view', '/preview').replace('/edit', '/preview');
    }
    return trimmed;
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const GENRES = [
    'anime', 'action', 'adventure', 'animation', 'biography', 'comedy', 'crime',
    'documentary', 'drama', 'family', 'fantasy', 'history', 'horror',
    'mystery', 'musical', 'romance', 'scifi', 'sport', 'thriller',
    'war', 'western'
];

const defaultPosters = {
    anime: '🌸', action: '🎬', adventure: '🧭', animation: '✨', biography: '📖',
    comedy: '😂', crime: '🕵️', documentary: '🎥', drama: '🎭',
    family: '👨‍👩‍👧', fantasy: '🐉', history: '🏛️', horror: '👻',
    mystery: '🔍', musical: '🎵', romance: '❤️', scifi: '🚀',
    sport: '🏆', thriller: '🔪', war: '🎖️', western: '🤠'
};

function genArr(genre) {
    if (Array.isArray(genre)) return genre;
    if (!genre) return [];
    return String(genre).split(',').map(g => g.trim()).filter(Boolean);
}

function isLightColor(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return false;
    const r = parseInt(m[1].substr(0, 2), 16);
    const g = parseInt(m[1].substr(2, 2), 16);
    const b = parseInt(m[1].substr(4, 2), 16);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 150;
}

// ==================== TAB CLOAK ====================
const LOCKED_LOGO = 'https://raw.githubusercontent.com/IordBeerus/MILKBOX/main/SiteIcon.png';
const LOCKED_LOGO_FALLBACK = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2212%22%20fill%3D%22%23ffb6d8%22/%3E%3Ctext%20x%3D%2232%22%20y%3D%2242%22%20font-family%3D%22Arial%22%20font-size%3D%2232%22%20font-weight%3D%22900%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3EM%3C/text%3E%3C/svg%3E';
function applyCloak() {
    // uploaded icon (data URL) is preferred — never blocked, no external URL needed
    try {
        const logoImg = document.querySelector('.logo-wrap .logo-image');
        const uploaded = settings.cloakLogoData || '';
        const targetSrc = uploaded || LOCKED_LOGO;
        if (logoImg) {
            logoImg.referrerPolicy = 'no-referrer';
            logoImg.onerror = function() { this.onerror = null; this.src = LOCKED_LOGO_FALLBACK; };
            logoImg.src = targetSrc;
            logoImg.style.display = '';
        }
        const inp = document.getElementById('cloakLogoImage');
        if (inp) { inp.value = uploaded ? '(uploaded image — not blocked)' : LOCKED_LOGO; inp.disabled = true; inp.style.opacity = '0.5'; inp.title = 'Use the upload below — no URL needed'; }
        // keep settings consistent
        if (!uploaded) settings.cloakLogoImage = LOCKED_LOGO;
    } catch {}
    const title = settings.cloakTitle || 'MILKBOX';
    const favicon = settings.cloakFavicon;
    const logoText = settings.cloakLogoText || 'MILKBOX';
    const logoImage = settings.cloakLogoImage;

    document.getElementById('siteTitle').textContent = title;
    document.title = title;

    if (favicon) {
        const link = document.getElementById('siteFavicon');
        link.href = favicon;
    }

    const logoEl = document.getElementById('siteLogo');
    const logoWrap = document.getElementById('logoWrap');
    const existingLogoImg = logoWrap.querySelector('img.logo-image');

    logoEl.textContent = logoText;

    if (logoImage) {
        if (!existingLogoImg) {
            const img = document.createElement('img');
            img.className = 'logo-image';
            img.src = logoImage;
            img.alt = logoText;
            img.onerror = () => img.remove();
            logoWrap.insertBefore(img, logoEl);
        } else {
            existingLogoImg.src = logoImage;
        }
    } else {
        if (existingLogoImg) existingLogoImg.remove();
    }

    document.getElementById('footerTitle').textContent = `${title} - Your Personal Streaming Platform`;
    document.querySelectorAll('.footer-brand').forEach(el => el.textContent = title);

    const cloakTitleInput = document.getElementById('cloakTitle');
    const cloakFaviconInput = document.getElementById('cloakFavicon');
    const cloakLogoTextInput = document.getElementById('cloakLogoText');
    const cloakLogoImageInput = document.getElementById('cloakLogoImage');
    if (cloakTitleInput) cloakTitleInput.value = settings.cloakTitle;
    if (cloakFaviconInput) cloakFaviconInput.value = settings.cloakFavicon;
    if (cloakLogoTextInput) cloakLogoTextInput.value = settings.cloakLogoText;
    if (cloakLogoImageInput) cloakLogoImageInput.value = settings.cloakLogoImage;

    updateLogoPreview();
}

function updateLogoPreview() {
    const preview = document.getElementById('logoPreview');
    const textEl = document.getElementById('logoPreviewText');
    if (!preview || !textEl) return;
    const logoImage = settings.cloakLogoImage;
    const logoText = settings.cloakLogoText || 'MILKBOX';

    const existingImg = preview.querySelector('img');
    if (existingImg) existingImg.remove();

    if (logoImage) {
        textEl.textContent = logoText;
        textEl.style.display = '';
        const img = document.createElement('img');
        img.src = logoImage;
        img.alt = logoText;
        img.style.maxHeight = '36px';
        img.style.marginLeft = '10px';
        img.onerror = () => { img.remove(); };
        textEl.parentNode.insertBefore(img, textEl.nextSibling);
    } else {
        textEl.style.display = '';
        textEl.textContent = logoText;
    }
}

// ==================== BACKGROUND ====================
function computeShadowColor(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return 'rgba(0,0,0,0.5)';
    let r = parseInt(m[1].substr(0, 2), 16);
    let g = parseInt(m[1].substr(2, 2), 16);
    let b = parseInt(m[1].substr(4, 2), 16);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum > 150) return 'rgba(0,0,0,0.45)';
    // Darken the color for a natural shadow that blends with dark themes
    r = Math.round(r * 0.55);
    g = Math.round(g * 0.55);
    b = Math.round(b * 0.55);
    return `rgba(${r},${g},${b},0.55)`;
}

function rgbString(r, g, b, a) {
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

function hexToRgb(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    return [
        parseInt(m[1].substr(0, 2), 16),
        parseInt(m[1].substr(2, 2), 16),
        parseInt(m[1].substr(4, 2), 16)
    ];
}

// Sample the average color of a background image so the hero shadow can match it
// Falls back to a strong dark shadow if the image can't be read (e.g. cross-origin block).
function getImageAverageColor(url, callback) {
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const size = 32;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                }
                r = r / count; g = g / count; b = b / count;
                callback(rgbString(r, g, b, 1));
            } catch (e) {
                callback(null);
            }
        };
        img.onerror = () => callback(null);
        img.src = url;
    } catch (e) {
        callback(null);
    }
}

// Compute a readable shadow color that matches the given rgb base color
function matchShadowFromRgb(r, g, b) {
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum > 150) return 'rgba(0,0,0,0.5)';
    return rgbString(r * 0.5, g * 0.5, b * 0.5, 0.65);
}

function _renderBackground(url) {
    const overlay = document.getElementById('bgOverlay');
    if (!overlay) return;

    overlay.classList.remove('has-image', 'solid-color', 'is-video-bg', 'is-css-bg');
    overlay.style.backgroundSize = 'cover';
    overlay.style.backgroundPosition = 'center';
    overlay.style.backgroundRepeat = 'no-repeat';

    if (url) {
        const isVideo = storedBgKind(settings.bgImage) === 'video'
            || /\.(mp4|webm|ogg)(\?|$)/i.test(url)
            || url.indexOf('data:video') === 0;
        if (isVideo) {
            let video = overlay.querySelector('video');
            let blurDiv = overlay.querySelector('.video-blur-overlay');
            overlay.style.backgroundImage = '';
            overlay.classList.add('has-image', 'is-video-bg');
            if (!video) {
                overlay.innerHTML = '';
                blurDiv = document.createElement('div');
                blurDiv.className = 'video-blur-overlay';
                blurDiv.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;';
                overlay.appendChild(blurDiv);
                video = document.createElement('video');
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.preload = 'auto';
                video.disablePictureInPicture = true;
                video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;will-change:auto;';
                overlay.appendChild(video);
            }
            if (!blurDiv) {
                blurDiv = document.createElement('div');
                blurDiv.className = 'video-blur-overlay';
                blurDiv.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;';
                overlay.appendChild(blurDiv);
            }
            video.src = url;
            blurDiv.style.filter = (settings.bgBlur || 0) ? `blur(${settings.bgBlur}px)` : '';
        } else {
            const existingVideo = overlay.querySelector('video');
            const existingBlurDiv = overlay.querySelector('.video-blur-overlay');
            const existingImgWrap = overlay.querySelector('.bg-image-frame');
            if (existingVideo) existingVideo.remove();
            if (existingBlurDiv) existingBlurDiv.remove();
            if (existingImgWrap) existingImgWrap.remove();
            if (isStoredBg(settings.bgImage)) {
                overlay.style.backgroundImage = '';
                overlay.classList.add('has-image', 'is-css-bg');
                const imgWrap = document.createElement('div');
                imgWrap.className = 'bg-image-frame';
                const imgEl = document.createElement('img');
                imgEl.src = url;
                imgWrap.appendChild(imgEl);
                overlay.appendChild(imgWrap);
            } else {
                overlay.style.backgroundImage = `url("${escapeHtml(url)}")`;
                overlay.classList.add('has-image', 'is-css-bg');
            }
        }
    } else {
        const existingVideo = overlay.querySelector('video');
        if (existingVideo) existingVideo.remove();
        const existingBlurDiv = overlay.querySelector('.video-blur-overlay');
        if (existingBlurDiv) existingBlurDiv.remove();
        const existingImgWrap = overlay.querySelector('.bg-image-frame');
        if (existingImgWrap) existingImgWrap.remove();
        overlay.style.backgroundImage = '';
        overlay.classList.add('solid-color');
    }
}

function applyBackground() {
    const overlay = document.getElementById('bgOverlay');
    const body = document.getElementById('siteBody');
    if (!overlay || !body) return;
    const color = settings.bgColor || '#141414';
    const image = settings.bgImage;
    const opacity = (settings.bgOpacity || 30) / 100;
    const blur = settings.bgBlur || 0;

    body.style.backgroundColor = color;
    overlay.style.setProperty('--bg-opacity', opacity);
    overlay.style.setProperty('--bg-blur', blur + 'px');
    overlay.style.setProperty('--bg-color', color);

    const colorRgb = hexToRgb(color);

    // Reset hero shadow to a neutral dark until the image can be sampled.
    body.style.setProperty('--bg-shadow', 'rgba(0,0,0,0.5)');
    body.style.setProperty('--hero-shadow', 'rgba(0,0,0,0.8)');
    if (image) {
        body.style.setProperty('--hero-fade', 'rgba(0,0,0,0.9)');
        body.style.setProperty('--hero-fade-top', 'rgba(0,0,0,0)');
    } else {
        // Custom (or theme) background color: derive the hero shadow from the exact color
        const shadow = colorRgb ? matchShadowFromRgb(colorRgb[0], colorRgb[1], colorRgb[2]) : computeShadowColor(color);
        body.style.setProperty('--bg-shadow', shadow);
        body.style.setProperty('--hero-shadow', shadow);
        body.style.setProperty('--hero-fade', color);
        // Top of the fade uses the same color at 0 alpha so it blends seamlessly
        // for any background color (fixes the gray haze on white/light colors).
        body.style.setProperty('--hero-fade-top', colorRgb ? `rgba(${colorRgb[0]},${colorRgb[1]},${colorRgb[2]},0)` : 'rgba(0,0,0,0)');
    }

    const isLight = isLightColor(color);
    body.classList.toggle('light-mode', isLight);
    body.classList.toggle('has-custom-bg', !!image);
    body.classList.toggle('has-overlay-blur', (settings.overlayBlur ?? 2) > 0);
    body.style.setProperty('--overlay-opacity', (settings.overlayOpacity ?? 60) / 100);
    body.style.setProperty('--overlay-blur', (settings.overlayBlur ?? 2) + 'px');
    // Expose the active theme background + matching text color as CSS vars so any
    // component (content-wrapper, section titles, etc.) can follow the current theme.
    body.style.setProperty('--theme-bg', color);
    body.style.setProperty('--theme-bg-grad-soft', isLight ? '#ffffff' : '#0e0e14');
    body.style.setProperty('--theme-text', '#ffffff');
    body.style.setProperty('--theme-text-soft', isLight ? '#cfcfcf' : '#a1a1aa');

    if (image && isStoredBg(image)) {
        // Load the stored file from IndexedDB and render it via a fast blob URL.
        bgLoadFile(storedBgName(image)).then(blob => {
            if (!blob) { _renderBackground(''); return; }
            if (_activeBgUrl) URL.revokeObjectURL(_activeBgUrl);
            _activeBgUrl = URL.createObjectURL(blob);
            _renderBackground(_activeBgUrl);
            getImageAverageColor(_activeBgUrl, (avg) => {
                const p = avg ? avg.match(/\d+/g) : null;
                if (p && p.length >= 3) {
                    body.style.setProperty('--hero-shadow', matchShadowFromRgb(+p[0], +p[1], +p[2]));
                }
            });
        }).catch(() => _renderBackground(''));
    } else {
        if (_activeBgUrl) { URL.revokeObjectURL(_activeBgUrl); _activeBgUrl = null; }
        _renderBackground(image);
        if (image) {
            getImageAverageColor(image, (avg) => {
                const p = avg ? avg.match(/\d+/g) : null;
                if (p && p.length >= 3) {
                    body.style.setProperty('--hero-shadow', matchShadowFromRgb(+p[0], +p[1], +p[2]));
                }
            });
        }
    }

    document.getElementById('bgColor').value = color;
    document.getElementById('bgColorText').value = color;
    document.getElementById('bgImage').value = isStoredBg(image) ? sStoredLabel(image) : image;
    document.getElementById('bgOpacity').value = settings.bgOpacity || 30;
    document.getElementById('bgOpacityVal').textContent = (settings.bgOpacity || 30) + '%';
    document.getElementById('bgBlur').value = blur;
    document.getElementById('bgBlurVal').textContent = blur + 'px';

    updateBgPreview();
}

function updateBgPreview() {
    const box = document.getElementById('bgPreviewBox');
    if (!box) return;
    const color = settings.bgColor || '#141414';
    const image = settings.bgImage;
    const opacity = (settings.bgOpacity || 30) / 100;

    box.style.backgroundColor = color;
    if (image) {
        if (isStoredBg(image)) {
            // Can't inline a stored blob in CSS background shorthand; tint the swatch.
            box.style.backgroundImage = '';
            box.style.opacity = 1;
        } else {
            box.style.backgroundImage = `url("${escapeHtml(image)}")`;
            box.style.backgroundSize = 'cover';
            box.style.opacity = opacity;
        }
    } else {
        box.style.backgroundImage = '';
        box.style.opacity = 1;
    }
}

function applyTheme(themeName) {
    const themes = {
        // --- Dark themes ---
        default:  { bgColor: '#141414', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        midnight: { bgColor: '#0a0a1a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        crimson:  { bgColor: '#1a0a0a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        forest:   { bgColor: '#0a1a0a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        ocean:    { bgColor: '#0a1a2e', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        sunset:   { bgColor: '#2e1a0a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        dracula:  { bgColor: '#282a36', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        nord:     { bgColor: '#2e3440', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        cyberpunk:{ bgColor: '#0d0221', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        retro:    { bgColor: '#2a1b3d', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        coffee:   { bgColor: '#3e2723', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        lavender: { bgColor: '#2b1b3d', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        matrix:   { bgColor: '#021c0a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        obsidian: { bgColor: '#0b0b0f', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        graphite: { bgColor: '#1c1e22', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        charcoal: { bgColor: '#212326', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        slate:    { bgColor: '#1e293b', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        emerald:  { bgColor: '#052e16', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        teal:     { bgColor: '#0a2e2e', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        amber:    { bgColor: '#241b0f', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        violet:   { bgColor: '#1a0a3d', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        grape:    { bgColor: '#2a0a2e', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        rose:     { bgColor: '#3d1a2e', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        candy:    { bgColor: '#2e1a3d', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        peach:    { bgColor: '#3d1f14', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        pink:     { bgColor: '#3d1329', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        blush:    { bgColor: '#2a1220', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        hotpink:  { bgColor: '#40101f', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        rosegold: { bgColor: '#2b1a1a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        sakura:   { bgColor: '#4a1a2e', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        bubblegum:{ bgColor: '#33101d', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        neon:     { bgColor: '#0b0b1a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        tungsten: { bgColor: '#20242a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        ink:      { bgColor: '#0d1117', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        night:    { bgColor: '#101322', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        deepsea:  { bgColor: '#06283d', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        wine:     { bgColor: '#2a0a1a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        moss:     { bgColor: '#1a2410', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        storm:    { bgColor: '#1b2226', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        galaxy:   { bgColor: '#0d0626', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        // --- Light themes ---
        light:    { bgColor: '#f0f0f0', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        snow:     { bgColor: '#f8f8f8', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        paper:    { bgColor: '#fdf6e3', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        cloud:    { bgColor: '#f1f5f9', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        mint:     { bgColor: '#eafaf0', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        rosy:     { bgColor: '#fff0f3', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        sunrise:  { bgColor: '#fff8e1', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        ice:      { bgColor: '#e8f4f8', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        pearl:    { bgColor: '#fafafa', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        pastelpink:{ bgColor: '#ffeef5', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        lightpink:{ bgColor: '#ffe3ee', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        pinkdawn: { bgColor: '#fde4ef', bgImage: '', bgOpacity: 30, bgBlur: 0 }
    };
    const theme = themes[themeName] || customThemes.find(t => t.name === themeName);
    if (!theme) return;
    Object.assign(settings, { bgColor: theme.bgColor, bgImage: theme.bgImage || '', bgOpacity: theme.bgOpacity ?? 30, bgBlur: theme.bgBlur ?? 0, overlayOpacity: theme.overlayOpacity ?? 60, overlayBlur: theme.overlayBlur ?? 2 });
    settings.activeTheme = themeName;
    saveData();
    applyBackground();
    document.querySelectorAll('.theme-card').forEach(c => {
        c.classList.toggle('active', c.dataset.theme === themeName);
    });
    toast(`Applied "${themeName}" theme`, 'success');
}

// ==================== HERO LOGO ====================
function getHeroLogoSource() {
    return settings.heroLogoData || settings.heroLogo;
}

function applyHeroLogo() {
    const src = getHeroLogoSource();
    const logo = document.getElementById('heroLogo');
    if (!logo) return;
    if (src) {
        logo.onerror = () => { logo.style.display = 'none'; };
        logo.src = src;
        logo.style.display = 'block';
    } else {
        logo.onerror = null;
        logo.removeAttribute('src');
        logo.style.display = 'none';
    }
}

// ==================== RENDER ====================
function initGenreOptions() {
    ['movieGenreOptions', 'tvGenreOptions'].forEach(id => {
        const ctn = document.getElementById(id);
        if (!ctn) return;
        ctn.innerHTML = '';
        GENRES.forEach(genre => {
            const label = document.createElement('label');
            label.className = 'genre-chip';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = genre;
            cb.className = 'genre-cb';
            const span = document.createElement('span');
            span.textContent = genre.charAt(0).toUpperCase() + genre.slice(1);
            label.appendChild(cb);
            label.appendChild(span);
            ctn.appendChild(label);
        });
    });
}

function getSelectedGenres(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} input[type=checkbox]:checked`)).map(cb => cb.value);
}

function setSelectedGenres(containerId, genresArr) {
    const arr = genArr(genresArr);
    document.querySelectorAll(`#${containerId} input[type=checkbox]`).forEach(cb => {
        cb.checked = arr.includes(cb.value);
    });
}

function renderAll() {
    renderMovies();
    renderTvShows();
    renderMyList();
    renderGenreRows();
    try { renderCollections(); } catch {}
    updateHero();
}

function qualityFor(key) {
    let h = 0;
    const s = String(key || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const v = h % 100;
    if (v < 50) return 'HD';
    if (v < 80) return 'HDCAM';
    return 'CAM';
}
function scheduleIdle(fn) { if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 900 }); else setTimeout(fn, 32); }
function parseRuntimeMins(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const s = String(v).toLowerCase().trim();
    if (/^\d+$/.test(s)) return parseInt(s,10);
    let m=0;
    const h=s.match(/(\d+)\s*h/);
    const mm=s.match(/(\d+)\s*m/);
    if (h) m+=parseInt(h[1],10)*60;
    if (mm) m+=parseInt(mm[1],10);
    return m||null;
}

// Persist a CAM/HDCAM/HD quality label to every movie that doesn't have one yet.
// Runs once so each existing movie keeps a stable, stored badge. TV is skipped
// (always HD), and manually set qualities are never overwritten.
function scanMovieQualities(noRender) {
    let changed = false;
    movies.forEach(m => {
        if (!m || m.type === 'tv') return;
        if (m.quality === 'CAM' || m.quality === 'HDCAM' || m.quality === 'HD') return;
        m.quality = qualityFor(m.tmdbId || m.id);
        changed = true;
    });
    if (changed) {
        saveData();
        if (!noRender) refreshCurrent();
    }
    return changed;
}

function createCard(item, type) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    const effType = (type === 'movie' || type === 'tv') ? type : (item.type || 'movie');
    const inList = myList.some(m => m.id === item.id);
    const genre = genArr(item.genre)[0] || 'action';
    const safeTitle = escapeHtml(item.title);
    const safePoster = escapeHtml(item.poster || '');
    let imgHTML = '';
    if (item.poster) {
        imgHTML = `<img class="card-img" src="${safePoster}" alt="${safeTitle}" loading="lazy" decoding="async" fetchpriority="low" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`;
    }
    imgHTML += `<div class="card-placeholder" style="${item.poster ? 'display:none' : ''}">${defaultPosters[genre] || '🎬'}</div>`;
    // TV shows (and anime shows) are always HD. Movies use their saved quality
    // (assigned by scanMovieQualities), falling back to a hash-based tier.
    const mcBadge = effType === 'tv' || item.type === 'tv'
        ? 'HD'
        : (item.quality === 'CAM' || item.quality === 'HDCAM' || item.quality === 'HD' ? item.quality : qualityFor(item.tmdbId || item.id));
    const badgeCls = mcBadge === 'CAM' ? 'cam' : mcBadge === 'HDCAM' ? 'hdcam' : 'hd';
    const rtMins = parseRuntimeMins(item.runtime || item.duration);
    const hashMins = (()=>{ let h=0; const s=String(item.id||item.title||''); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return 88 + (h%58); })();
    const mins = rtMins || hashMins;
    const rtLabel = `${mins}m`;
    const typeLabel = effType === 'tv' ? 'TV Show' : 'Movie';
    card.innerHTML = `
        <div class="card-badge ${badgeCls}">${mcBadge}</div>
        ${imgHTML}
        <div class="card-actions">
            <button class="card-action-btn play-btn" data-action="play" title="Play"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg></button>
            <button class="card-action-btn" data-action="list" title="${inList ? 'Remove from My List' : 'Add to My List'}">${inList ? '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>' : '+'}</button>
            <button class="card-action-btn" data-action="info" title="More Info"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M440-280h80v-240h-80v240Zm68.5-331.5Q520-623 520-640t-11.5-28.5Q497-680 480-680t-28.5 11.5Q440-657 440-640t11.5 28.5Q463-600 480-600t28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg></button>
        </div>
        <div class="card-info">
            <div class="card-title">${safeTitle}</div>
            <div class="card-meta">
                <span class="card-year-runtime">${item.year || '2026'} <span class="dot">•</span> ${rtLabel}</span>
                <span class="card-type-pill">${typeLabel}</span>
            </div>
        </div>
    `;
    card.addEventListener('click', (e) => {
        const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
        if (action === 'play') playItem(item, effType);
        else if (action === 'list') toggleMyList(item, effType);
        else if (action === 'info') showInfo(item, effType);
        else if (!action) showInfo(item, effType);
    });
    return card;
}

// Per-slider lazy-load state: each row keeps its full list but only renders a window.
const SLIDER_WINDOW = 24;   // initial cards built per row
const sliderState = {};

function renderSlider(containerId, items, type) {
    const slider = document.getElementById(containerId);
    slider.innerHTML = '';
    if (items.length === 0) {
        let icon = '<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#FFFFFF"><path d="m160-800 80 160h120l-80-160h80l80 160h120l-80-160h80l80 160h120l-80-160h120q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800Zm0 240v320h640v-320H160Zm0 0v320-320Z"/></svg>', msg = 'No movies yet.';
        if (type === 'tv') { icon = '<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#FFFFFF"><path d="m853-221-53-53v-486H314l-80-80h566q33 0 56.5 23.5T880-760v480q0 18-6.5 32.5T853-221ZM127-833l73 73h-40v480h406L28-820l56-56L876-84l-56 56-172-172h-8v80H320v-80H160q-33 0-56.5-23.5T80-280v-480q0-37 23.5-55l23.5-18Zm237 351Zm195-33Z"/></svg>'; msg = 'No TV shows yet.'; }
        else if (type === 'mixed') { icon = '<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#FFFFFF"><path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/></svg>'; msg = 'No items in your list yet.'; }
        slider.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon}</div><p>${msg}<br>Click "+ Add Content" to get started!</p></div>`;
        delete sliderState[containerId];
        return;
    }
    // Store full list; render only the first window, then lazy-load the rest on scroll.
    sliderState[containerId] = { items, type, shown: Math.min(SLIDER_WINDOW, items.length) };
    const frag = document.createDocumentFragment();
    for (let i = 0; i < sliderState[containerId].shown; i++) {
        frag.appendChild(createCard(items[i], type));
    }
    slider.appendChild(frag);
}

// Appends the next batch of cards when a slider is scrolled near its end.
function sliderLoadMore(slider) {
    const st = sliderState[slider.id];
    if (!st || st.shown >= st.items.length) return;
    const next = Math.min(st.shown + SLIDER_WINDOW, st.items.length);
    const frag = document.createDocumentFragment();
    for (let i = st.shown; i < next; i++) {
        frag.appendChild(createCard(st.items[i], st.type));
    }
    slider.appendChild(frag);
    st.shown = next;
}

// Any slider scroll near the right edge triggers loading the next batch (debounced per slider).
const _sliderScrollTimers = new WeakMap();
document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('slider')) return;
    if (el.scrollLeft + el.clientWidth < el.scrollWidth - 400) return;
    if (_sliderScrollTimers.has(el)) return;
    _sliderScrollTimers.set(el, setTimeout(() => {
        _sliderScrollTimers.delete(el);
        sliderLoadMore(el);
    }, 120));
}, true);

function renderMovies() {
    const sec = document.getElementById('moviesSection');
    if (sec) sec.classList.add('catalog-grid');
    const title = document.querySelector('#moviesSection .section-title');
    if (title && title.textContent !== 'Movies') title.textContent = 'Movies';
    renderCatalogGrid('movies', 'home');
}
function renderTvShows() {
    const sec = document.getElementById('tvShowsSection');
    if (sec) sec.classList.add('catalog-grid');
    const title = document.querySelector('#tvShowsSection .section-title');
    if (title && title.textContent !== 'TV Shows') title.textContent = 'TV Shows';
    renderCatalogGrid('tvshows', 'home');
}
function renderMyList() { renderSlider('myListSlider', myList, 'mixed'); }

// ---- Paginated catalog grids (Movies / TV / Anime tab views) ----
const CATALOG_PER_PAGE = 14;
const catalogPage = { movies: 1, tvshows: 1, animeMovie: 1, animeTv: 1 };

function inYearRange(item, min, max) {
    const y = parseInt(item && item.year, 10);
    return !isNaN(y) && y >= min && y <= max;
}

function hasMovieInfo(m) {
    if (!m) return false;
    const poster = m.poster || m.poster_path || '';
    const desc = (m.description || m.overview || '').trim();
    const genre = Array.isArray(m.genre) ? m.genre.filter(Boolean).length : (m.genre ? 1 : 0);
    const rating = (m.rating || m.vote_average || '') !== '';
    return (poster && genre) || (desc && genre) || (poster && desc);
}

// Media-base completeness (year within 1895-2026 plus rating, backdrop and
// poster). Used for live feeds, which get their brand logos enriched later.
function baseComplete(m) {
    if (!m) return false;
    const y = parseInt(m.year, 10);
    if (isNaN(y) || y < 1895 || y > 2026) return false;
    if (!m.rating) return false;
    if (!(m.backdrop || '').trim()) return false;
    if (!(m.poster || '').trim()) return false;
    return true;
}

// Full library completeness: baseComplete plus a brand logo. Items missing any
// of these (rating / logo / backdrop / poster) aren't shown anywhere.
function completeItem(m) {
    return baseComplete(m);
}

function renderCatalogGrid(section, source) {
    const excludeAnime = source === 'home';
    const cfg = {
        movies: { items: movies.filter(m => completeItem(m) && (!excludeAnime || !isAnime(m))), type: 'movie', slider: 'moviesSlider', pager: 'moviesPager', pkey: 'movies' },
        tvshows: { items: tvShows.filter(m => completeItem(m) && (!excludeAnime || !isAnime(m))), type: 'tv', slider: 'tvShowsSlider', pager: 'tvPager', pkey: 'tvshows' },
        animeMovie: { items: (()=>{ const local=movies.filter(m=>completeItem(m)&&isAnime(m)); const live=animeLive.fed?animeLive.movies.filter(baseComplete):[]; const seen=new Set(local.map(x=>x.tmdbId||x.id)); const merged=[...local]; live.forEach(x=>{const k=x.tmdbId||x.id; if(!seen.has(k)){merged.push(x); seen.add(k);}}); return merged; })(), type: 'movie', slider: 'moviesSlider', pager: 'moviesPager', pkey: 'animeMovie' },
        animeTv: { items: (()=>{ const local=tvShows.filter(m=>completeItem(m)&&isAnime(m)); const live=animeLive.fed?animeLive.tv.filter(baseComplete):[]; const seen=new Set(local.map(x=>x.tmdbId||x.id)); const merged=[...local]; live.forEach(x=>{const k=x.tmdbId||x.id; if(!seen.has(k)){merged.push(x); seen.add(k);}}); return merged; })(), type: 'tv', slider: 'tvShowsSlider', pager: 'tvPager', pkey: 'animeTv' }
    }[section];
    if (!cfg) return;
    const slider = document.getElementById(cfg.slider);
    const pager = document.getElementById(cfg.pager);
    if (!slider) return;
    const items = cfg.items;
    slider.innerHTML = '';
    if (!items.length) {
        renderSlider(cfg.slider, items, cfg.type);
        if (pager) pager.style.display = 'none';
        return;
    }
    const total = Math.ceil(items.length / CATALOG_PER_PAGE);
    const page = Math.min(Math.max(1, catalogPage[cfg.pkey]), total);
    catalogPage[cfg.pkey] = page;
    const start = (page - 1) * CATALOG_PER_PAGE;
    const slice = items.slice(start, start + CATALOG_PER_PAGE);
    slice.forEach(item => slider.appendChild(createCard(item, cfg.type)));
    if (pager) {
        pager.style.display = '';
        let html = `<button class="pager-btn pager-nav" data-catpage="${cfg.pkey}" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-320 56-56-64-64h168v-80H472l64-64-56-56-160 160 160 160Zm0 240q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg> Prev</button>`;
        const WIN = 5;
        let s = Math.max(1, page - 2);
        let e = Math.min(total, s + WIN - 1);
        s = Math.max(1, e - WIN + 1);
        for (let i = s; i <= e; i++) {
            html += `<button class="pager-btn ${i === page ? 'current' : ''}" data-catpage="${cfg.pkey}" data-page="${i}">${i}</button>`;
        }
        html += `<button class="pager-btn pager-nav" data-catpage="${cfg.pkey}" data-page="${page + 1}" ${page === total ? 'disabled' : ''}>Next <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-320 160-160-160-160-56 56 64 64H320v80h168l-64 64 56 56Zm0 240q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg></button>`;
        pager.innerHTML = html;
    } else if (pager) {
        pager.style.display = 'none';
    }
}

// Catalog pager clicks (shared handler with live pager markup via distinct data-catpage).
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn[data-catpage]');
    if (!btn) return;
    const key = btn.dataset.catpage;
    const page = parseInt(btn.dataset.page, 10);
    if (isNaN(page)) return;
    catalogPage[key] = page;
    renderCatalogGrid(key);
});

// Genre category rows for the Home page (only genres with enough content are shown).
const GENRE_ROWS = [
    { key: 'action', label: 'Action' },
    { key: 'adventure', label: 'Adventure' },
    { key: 'animation', label: 'Animation' },
    { key: 'comedy', label: 'Comedy' },
    { key: 'crime', label: 'Crime' },
    { key: 'documentary', label: 'Documentary' },
    { key: 'drama', label: 'Drama' },
    { key: 'family', label: 'Family' },
    { key: 'fantasy', label: 'Fantasy' },
    { key: 'history', label: 'History' },
    { key: 'horror', label: 'Horror' },
    { key: 'musical', label: 'Musical' },
    { key: 'mystery', label: 'Mystery' },
    { key: 'romance', label: 'Romance' },
    { key: 'scifi', label: 'Sci-Fi' },
    { key: 'sport', label: 'Sports' },
    { key: 'thriller', label: 'Thriller' },
    { key: 'war', label: 'War' },
    { key: 'western', label: 'Western' },
    { key: 'anime', label: 'Anime' }
];

const PROVIDERS = [
    { id: '8', key: 'netflix', label: 'Netflix', short: 'N', bg: '#E50914', color: '#fff' },
    { id: '9', key: 'prime', label: 'Amazon Prime Video', short: 'prime', bg: '#00A8E1', color: '#fff' },
    { id: '337', key: 'disney', label: 'Disney Plus', short: 'Disney+', bg: '#113CCF', color: '#fff' },
    { id: '350', key: 'appletvplus', label: 'Apple TV+', short: 'tv+', bg: '#000', color: '#fff' },
    { id: '2', key: 'appletv', label: 'Apple TV', short: 'tv', bg: '#000', color: '#fff' },
    { id: '15', key: 'hulu', label: 'Hulu', short: 'hulu', bg: '#1CE783', color: '#000' },
    { id: '1899', key: 'hbomax', label: 'HBO Max', short: 'MAX', bg: '#000', color: '#fff' },
    { id: '2303', key: 'paramount', label: 'Paramount Plus', short: 'P+', bg: '#0064FF', color: '#fff' },
    { id: '386', key: 'peacock', label: 'Peacock Premium', short: 'peacock', bg: '#000', color: '#fff' },
    { id: '283', key: 'crunchy', label: 'Crunchyroll', short: 'CR', bg: '#F47521', color: '#fff' },
    { id: '43', key: 'starz', label: 'Starz', short: 'STARZ', bg: '#000', color: '#fff' },
    { id: '526', key: 'amc', label: 'AMC+', short: 'AMC+', bg: '#0E1E3A', color: '#fff' },
    { id: '34', key: 'mgm', label: 'MGM Plus', short: 'MGM+', bg: '#fff', color: '#000' },
    { id: '188', key: 'ytpremium', label: 'YouTube Premium', short: 'YT', bg: '#FF0000', color: '#fff' },
    { id: '192', key: 'youtube', label: 'YouTube', short: 'YT', bg: '#fff', color: '#FF0000' },
    { id: '300', key: 'pluto', label: 'Pluto TV', short: 'pluto', bg: '#000', color: '#FFE600' },
    { id: '73', key: 'tubi', label: 'Tubi TV', short: 'tubi', bg: '#6A00F5', color: '#FFE600' },
    { id: '11', key: 'mubi', label: 'MUBI', short: 'MUBI', bg: '#111', color: '#fff' },
    { id: '7', key: 'fandango', label: 'Fandango at Home', short: 'F', bg: '#0877C9', color: '#fff' },
    { id: '10', key: 'amazonvideo', label: 'Amazon Video', short: 'AV', bg: '#00A8E1', color: '#fff' },
    { id: '3', key: 'googleplay', label: 'Google Play Movies', short: 'GP', bg: '#fff', color: '#4285F4' },
    { id: '68', key: 'microsoft', label: 'Microsoft Store', short: 'MS', bg: '#737373', color: '#fff' },
    { id: '151', key: 'britbox', label: 'BritBox', short: 'BB', bg: '#1A1A5E', color: '#fff' },
];

let activeProvider = null;
let providerLogosFetched = false;
let localProviderIconsLoaded = false;
const LOCAL_PROVIDER_ICONS = {
    '8': 'assets/provider-icons/8.png',
    '9': 'assets/provider-icons/9.png',
    '337': 'assets/provider-icons/337.png',
    '350': 'assets/provider-icons/350.png',
    '2': 'assets/provider-icons/2.png',
    '15': 'assets/provider-icons/15.png',
    '1899': 'assets/provider-icons/1899.png',
    '2303': 'assets/provider-icons/2303.png',
    '386': 'assets/provider-icons/386.png',
    '283': 'assets/provider-icons/283.png',
    '43': 'assets/provider-icons/43.png',
    '526': 'assets/provider-icons/526.png',
    '34': 'assets/provider-icons/34.png',
    '188': 'assets/provider-icons/188.png',
    '192': 'assets/provider-icons/192.png',
    '300': 'assets/provider-icons/300.png',
    '73': 'assets/provider-icons/73.png',
    '7': 'assets/provider-icons/7.png',
    '10': 'assets/provider-icons/10.png',
    '3': 'assets/provider-icons/3.png',
    '151': 'assets/provider-icons/151.png'
};
let providerLogoMap = {
    '8': 'assets/provider-icons/8.png',
    '9': 'assets/provider-icons/9.png',
    '337': 'assets/provider-icons/337.png',
    '350': 'assets/provider-icons/350.png',
    '2': 'assets/provider-icons/2.png',
    '15': 'assets/provider-icons/15.png',
    '1899': 'assets/provider-icons/1899.png',
    '2303': 'assets/provider-icons/2303.png',
    '386': 'assets/provider-icons/386.png',
    '283': 'assets/provider-icons/283.png',
    '43': 'assets/provider-icons/43.png',
    '526': 'assets/provider-icons/526.png',
    '34': 'assets/provider-icons/34.png',
    '188': 'assets/provider-icons/188.png',
    '192': 'assets/provider-icons/192.png',
    '300': 'assets/provider-icons/300.png',
    '73': 'assets/provider-icons/73.png'
};

async function loadLocalProviderIcons() {
    if (localProviderIconsLoaded) return;
    localProviderIconsLoaded = true;
    try {
        const response = await fetch('assets/provider-icons/manifest.json', { cache: 'no-store' });
        if (response.ok) Object.assign(LOCAL_PROVIDER_ICONS, await response.json());
    } catch {}
}

async function fetchProviderLogos() {
    try {
        await tmdbEnsureConfig();
        const data = await tmdbJson('/watch/providers/movie?watch_region=US');
        const results = data.results || [];
        const allProviders = [...results];
        results.forEach(r => {
            providerLogoMap[String(r.provider_id)] = r.logo_path;
        });
        // also fetch tv providers to fill gaps
        try {
            const tvData = await tmdbJson('/watch/providers/tv?watch_region=US');
            (tvData.results||[]).forEach(r=>{
                if (!providerLogoMap[String(r.provider_id)]) providerLogoMap[String(r.provider_id)] = r.logo_path;
                if (!allProviders.some(provider => String(provider.provider_id) === String(r.provider_id))) allProviders.push(r);
            });
        } catch {}

        const knownIds = new Set(PROVIDERS.map(provider => String(provider.id)));
        allProviders
            .sort((a, b) => (a.display_priority || 999) - (b.display_priority || 999))
            .forEach(provider => {
                const id = String(provider.provider_id);
                if (!id || knownIds.has(id) || !provider.provider_name) return;
                const short = provider.provider_name.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'TV';
                PROVIDERS.push({
                    id,
                    key: `tmdb-${id}`,
                    label: provider.provider_name,
                    short,
                    bg: '#1a1a1f',
                    color: '#fff'
                });
                knownIds.add(id);
            });
    } catch(e) { /* use fallback */ }
    providerLogosFetched = true;
}

async function renderProviders() {
    const slider = document.getElementById('providerSlider');
    if (!slider) return;
    await loadLocalProviderIcons();
    if (!providerLogosFetched) {
        try { await fetchProviderLogos(); } catch {}
    }
    const renderProviderMarkup = p => {
        const logo = LOCAL_PROVIDER_ICONS[p.id] || providerLogoMap[p.id];
        const logoUrl = logo
            ? (String(logo).startsWith('http') || String(logo).startsWith('assets/')
                ? String(logo)
                : `https://image.tmdb.org/t/p/w154${logo}`)
            : '';
        const img = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(p.label)}" width="68" height="68" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'">` : '';
        const fallback = `<span class="provider-fallback" style="display:flex;font-weight:900;font-size:18px;width:100%;height:100%;align-items:center;justify-content:center;background:${p.bg};color:${p.color}">${escapeHtml(p.short.slice(0, 3).toUpperCase())}</span>`;
        return `
        <div class="provider-item ${activeProvider===p.id?'active':''}" data-provider="${escapeHtml(p.id)}" title="${escapeHtml(p.label)}" aria-label="${escapeHtml(p.label)}">
            <div class="provider-icon" style="background:${p.bg}">${img}${fallback}</div>
            <span class="provider-label">${escapeHtml(p.label)}</span>
        </div>`;
    };
    const renderBatch = (container, start, end) => {
        container.insertAdjacentHTML('beforeend', PROVIDERS.slice(start, end).map(renderProviderMarkup).join(''));
    };
    const renderLabels = container => {
        const labels = { prime: 'Amazon Prime<br>Video', peacock: 'Peacock<br>Premium', ytpremium: 'YouTube<br>Premium' };
        container.querySelectorAll('.provider-item').forEach(el => {
            const prov = PROVIDERS.find(x=>x.id===el.dataset.provider);
            if (prov && labels[prov.key]) el.querySelector('.provider-label').innerHTML = labels[prov.key];
        });
    };
    const initialCount = Math.min(40, PROVIDERS.length);
    slider.innerHTML = '';
    renderBatch(slider, 0, initialCount);
    renderLabels(slider);
    let next = initialCount;
    const appendIdleBatch = () => {
        if (next >= PROVIDERS.length) return;
        const end = Math.min(next + 40, PROVIDERS.length);
        renderBatch(slider, next, end);
        renderLabels(slider);
        next = end;
        if (next < PROVIDERS.length) {
            if (window.requestIdleCallback) window.requestIdleCallback(appendIdleBatch, { timeout: 500 });
            else window.setTimeout(appendIdleBatch, 100);
        }
    };
    if (next < PROVIDERS.length) {
        if (window.requestIdleCallback) window.requestIdleCallback(appendIdleBatch, { timeout: 500 });
        else window.setTimeout(appendIdleBatch, 100);
    }
}

async function renderProviderGrid() {
    const grid = document.getElementById('providerGrid');
    if (!grid) return;
    await renderProviders();
    grid.innerHTML = '';
    const renderGridBatch = (start, end) => {
        grid.insertAdjacentHTML('beforeend', PROVIDERS.slice(start, end).map(p => {
            const logo = LOCAL_PROVIDER_ICONS[p.id] || providerLogoMap[p.id];
            const logoUrl = logo
                ? (String(logo).startsWith('http') || String(logo).startsWith('assets/') ? String(logo) : `https://image.tmdb.org/t/p/w154${logo}`)
                : '';
            const img = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(p.label)}" width="70" height="70" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'">` : '';
            const fallback = `<span class="provider-fallback" style="display:flex;font-weight:900;font-size:18px;width:100%;height:100%;align-items:center;justify-content:center;background:${p.bg};color:${p.color}">${escapeHtml(p.short.slice(0, 3).toUpperCase())}</span>`;
            return `<div class="provider-item" data-provider="${escapeHtml(p.id)}" title="${escapeHtml(p.label)}" aria-label="${escapeHtml(p.label)}"><div class="provider-icon" style="background:${p.bg}">${img}${fallback}</div><span class="provider-label">${escapeHtml(p.label)}</span></div>`;
        }).join(''));
    };
    const initialCount = Math.min(60, PROVIDERS.length);
    renderGridBatch(0, initialCount);
    let next = initialCount;
    const appendGridBatch = () => {
        if (next >= PROVIDERS.length) return;
        const end = Math.min(next + 60, PROVIDERS.length);
        renderGridBatch(next, end);
        next = end;
        if (next < PROVIDERS.length) {
            if (window.requestIdleCallback) window.requestIdleCallback(appendGridBatch, { timeout: 500 });
            else window.setTimeout(appendGridBatch, 100);
        }
    };
    if (next < PROVIDERS.length) {
        if (window.requestIdleCallback) window.requestIdleCallback(appendGridBatch, { timeout: 500 });
        else window.setTimeout(appendGridBatch, 100);
    }
}

async function browseProvider(providerId) {
    const prov = PROVIDERS.find(p=>p.id===providerId);
    if (!prov) return;
    if (activeProvider===providerId) {
        activeProvider=null;
        liveState.streaming.items = [];
        liveState.streaming.page = 1;
        delete liveFed['streaming'];
        renderProviders();
        toast(`Cleared ${prov.label} filter`);
        const hint = document.querySelector('#streamingSection .live-hint');
        if (hint) hint.textContent = 'Live from TMDB · movies & shows on streaming services';
        if (currentSection==='providers') {
            const show=(id,v)=>{const el=document.getElementById(id); if(el) el.style.display=v?'':'none';};
            show('streamingSection', false);
            show('moviesSection', true);
            show('tvShowsSection', true);
            show('streamingSection', false);
            document.getElementById('moviesSection').classList.add('catalog-grid');
            document.getElementById('tvShowsSection').classList.add('catalog-grid');
            renderCatalogGrid('movies');
            renderCatalogGrid('tvshows');
            return;
        } else if (currentSection==='streaming') {
            renderLiveTab('streaming');
        }
        const homeLink = document.querySelector('.nav-link[data-section="home"]');
        if (homeLink) handleNavClick(homeLink);
        else {
            document.getElementById('streamingSection').style.display='none';
            document.getElementById('trendingSection').style.display='none';
        }
        return;
    }
    activeProvider=providerId;
    renderProviders();
    toast(`Browsing ${prov.label}...`);
    const providerGridClick = !!document.querySelector(`#providerGrid .provider-item[data-provider="${CSS.escape(String(providerId))}"]`);
    // Provider-page clicks keep the filtered results above the provider grid.
    (() => {
        if (providerGridClick) {
            document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
            document.querySelectorAll('.mobile-nav-link').forEach(l=>l.classList.remove('active'));
            const link = document.querySelector('.nav-link[data-section="providers"]');
            if (link) link.classList.add('active');
            currentSection='providers';
            document.body.classList.remove('movies-active','tvshows-active','anime-active','mylist-active','trending-active','streaming-active','providers-active','theaters-active','popular-active','manga-active','home-active');
            document.body.classList.add('providers-active');
            const show=(id,v)=>{const el=document.getElementById(id); if(el) el.style.display=v?'':'none';};
            show('moviesSection',false); show('tvShowsSection',false); show('streamingSection',true); show('myListSection',false); show('homeGenres',false); show('trendingSection',false); show('theatersSection',false); show('popularSection',false); show('mangaSection',false); show('providerSection',false); show('providersSection',true);
            const hero=document.getElementById('heroSection'); if(hero) hero.style.display='none';
        } else {
        document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-link').forEach(l=>l.classList.remove('active'));
        const link = document.querySelector('.nav-link[data-section="streaming"]');
        if (link) link.classList.add('active');
        currentSection='streaming';
        document.body.classList.remove('movies-active','tvshows-active','anime-active','mylist-active','trending-active','streaming-active','theaters-active','popular-active','manga-active','home-active');
        document.body.classList.add('streaming-active');
        const show=(id,v)=>{const el=document.getElementById(id); if(el) el.style.display=v?'':'none';};
        show('moviesSection',false); show('tvShowsSection',false); show('myListSection',false); show('homeGenres',false); show('trendingSection',false); show('streamingSection',true); show('theatersSection',false); show('popularSection',false); show('mangaSection',false); show('providerSection',true);
        const hero=document.getElementById('heroSection'); if(hero) hero.style.display='';
        }
        // block the default streaming fetch that handleNavClick would have done
        liveFed['streaming']=1;
    })();
    // fetch provider-filtered streaming content
    try {
        await tmdbEnsureConfig();
        const grid = document.getElementById('streamingGrid');
        const pager = document.getElementById('streamingPager');
        if (grid) grid.innerHTML = '<div class="live-loading">Loading ' + prov.label + '…</div>';
        if (pager) pager.style.display = 'none';
        const moviePaths = [
            `/discover/movie?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=1`,
            `/discover/movie?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=2`,
            `/discover/movie?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=3`,
            `/discover/movie?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=4`
        ];
        const tvPaths = [
            `/discover/tv?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=1`,
            `/discover/tv?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=2`,
            `/discover/tv?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=3`,
        ];
        const [moviePages, tvPages] = await Promise.all([
            fetchBatched(moviePaths, 5),
            fetchBatched(tvPaths, 5)
        ]);
        const providerItems = mergeLiveInterleaved([
            liveItemsFromPages(moviePages, 'movie'),
            liveItemsFromPages(tvPages, 'tv')
        ]);
        const activeSearch = String(searchQuery || document.getElementById('searchInput')?.value || '').trim();
        const needle = activeSearch.toLowerCase();
        const items = needle
            ? providerItems.filter(item => [item.title, item.originalTitle, item.description].join(' ').toLowerCase().includes(needle))
            : providerItems;
        liveState.streaming.items = items;
        liveState.streaming.page = 1;
        const hint = document.querySelector('#streamingSection .live-hint');
        if (hint) hint.textContent = activeSearch
            ? `Live from TMDB · ${prov.label} · ${items.length} results for "${activeSearch}"`
            : `Live from TMDB · ${prov.label} · ${items.length} titles`;
        liveFed['streaming']=0; delete liveFed['streaming'];
        if (!items.length) {
            const grid2 = document.getElementById('streamingGrid');
            if (grid2) grid2.innerHTML = activeSearch
                ? '<div class="live-error">No titles found for ' + prov.label + ' matching "' + escapeHtml(activeSearch) + '".</div>'
                : '<div class="live-error">No titles found for ' + prov.label + ' in this region.</div>';
        } else {
            renderLiveGrid('streaming');
            enrichLiveLogos('streaming');
            if (currentSection==='streaming') showLiveHero('streaming');
        }
    } catch(e) {
        delete liveFed['streaming'];
        toast('Could not load ' + prov.label);
        const grid2 = document.getElementById('streamingGrid');
        if (grid2) grid2.innerHTML = '<div class="live-error">Could not load ' + prov.label + '. Check connection.</div>';
    }
}

/* ===== Collections (Home bottom) ===== */
const COLLECTION_DEFS = [
    { label: 'Star Wars', keys: ['star wars'] },
    { label: 'Harry Potter', keys: ['harry potter'] },
    { label: 'Middle-earth', keys: ['lord of the rings', 'hobbit'] },
    { label: 'Marvel', keys: ['marvel', 'avengers', 'iron man', 'captain america', 'thor', 'spider-man', 'spider man', 'hulk', 'black panther', 'doctor strange', 'guardians of the galaxy'] },
    { label: 'DC', keys: ['batman', 'superman', 'wonder woman', 'justice league', 'aquaman', 'joker'] },
    { label: 'Fast & Furious', keys: ['fast', 'furious'] },
    { label: 'Jurassic', keys: ['jurassic'] },
    { label: 'Toy Story', keys: ['toy story'] },
    { label: 'Mission: Impossible', keys: ['mission impossible'] },
    { label: 'Transformers', keys: ['transformers'] },
    { label: 'Pirates of the Caribbean', keys: ['pirates of the caribbean'] },
    { label: 'James Bond', keys: ['james bond', '007'] },
    { label: 'Avatar', keys: ['avatar'] },
    { label: 'Star Trek', keys: ['star trek'] },
    { label: 'Indiana Jones', keys: ['indiana jones'] },
    { label: 'Rocky', keys: ['rocky'] },
    { label: 'The Matrix', keys: ['matrix'] },
    { label: 'Alien', keys: ['alien'] },
    { label: 'Terminator', keys: ['terminator'] },
    { label: 'Scream', keys: ['scream'] },
    { label: 'The Conjuring', keys: ['conjuring'] },
    { label: 'Despicable Me', keys: ['despicable me', 'minions'] },
    { label: 'Frozen', keys: ['frozen'] },
    { label: 'The Lion King', keys: ['lion king'] },
    { label: 'Pokémon', keys: ['pokemon', 'pikachu', 'pokémon'] },
];
let customCollections = (()=>{ try { return JSON.parse(localStorage.getItem('milkbox_custom_collections')||'[]'); } catch { return []; } })();
function saveCustomCollections(){ try { localStorage.setItem('milkbox_custom_collections', JSON.stringify(customCollections)); } catch {} }
function collectionForTitle(title) {
    const t = String(title || '').toLowerCase();
    for (const def of COLLECTION_DEFS) {
        if (def.keys.some(k => t.includes(k))) return def.label;
    }
    // check custom keyword-based collections (stored as def-like)
    for (const c of customCollections) {
        if (c.keys && c.keys.some(k=> t.includes(String(k).toLowerCase()))) return c.label;
    }
    return null;
}
async function enrichCollectionsWithTMDB(buckets) {
    try {
        await tmdbEnsureConfig();
        // batch 4 at a time to keep main thread and TMDB rate-limit smooth
        for (let i = 0; i < COLLECTION_DEFS.length; i += 4) {
            const chunk = COLLECTION_DEFS.slice(i, i + 4);
            await Promise.all(chunk.map(async def => {
                const label = def.label;
                if (!buckets.has(label)) buckets.set(label, []);
                const q = def.keys[0];
                try {
                    const pages = await Promise.all([
                        tmdbJson(`/search/multi?query=${encodeURIComponent(q)}&page=1`),
                        tmdbJson(`/search/multi?query=${encodeURIComponent(q)}&page=2`)
                    ]);
                    const allResults = pages.flatMap(d => d.results || []);
                    const results = allResults.slice(0, 20).map(r => {
                        const type = r.media_type === 'tv' ? 'tv' : r.media_type === 'movie' ? 'movie' : (r.first_air_date ? 'tv' : 'movie');
                        return liveItemToItem(r, type);
                    }).filter(it => it.title && it.poster && it.backdrop && collectionForTitle(it.title) === label);
                    const existing = new Set(buckets.get(label).map(i => i.tmdbId || i.id));
                    results.forEach(it => {
                        const key = it.tmdbId || it.id;
                        if (!existing.has(key)) { buckets.get(label).push(it); existing.add(key); }
                    });
                } catch {}
            }));
            // small yield to keep UI responsive
            await new Promise(r => setTimeout(r, 60));
        }
    } catch {}
}
// Collections only show on Home (+ Trending) and when the user hasn't hidden them in Settings.
function shouldShowCollections() {
    return settings.showCollections !== false && (currentSection === 'home' || currentSection === 'trending');
}
function renderCollections() {
    const sec = document.getElementById('collectionsSection');
    const grid = document.getElementById('collectionsGrid');
    if (!sec || !grid) return;
    if (!shouldShowCollections()) { sec.style.display='none'; return; }
    const pool = [...movies, ...tvShows].filter(completeItem);
    const allPool = [...movies, ...tvShows];
    const buckets = new Map();
    pool.forEach(item => {
        const col = collectionForTitle(item.title);
        if (!col) return;
        if (!buckets.has(col)) buckets.set(col, []);
        buckets.get(col).push(item);
    });
    // custom collections with explicit picks (e.g. Pokémon or user-made)
    const customLabels = new Set(customCollections.map(c=>c.label));
    customCollections.forEach(c => {
        const label = c.label;
        if (!buckets.has(label)) buckets.set(label, []);
        const seen = new Set(buckets.get(label).map(x=> String(x.tmdbId||x.id||'')));
        if (c.itemIds && c.itemIds.length) {
            const items = allPool.filter(it => c.itemIds.includes(it.id));
            items.forEach(it=> { const k=String(it.tmdbId||it.id); if(!seen.has(k)){ buckets.get(label).push(it); seen.add(k); }});
        }
        if (c.tmdbItems && c.tmdbItems.length) {
            c.tmdbItems.forEach(it=> {
                const k = String(it.tmdbId||it.id||'');
                if (!seen.has(k)) { buckets.get(label).push(it); seen.add(k); }
            });
        }
    });
    const doRender = (cols) => {
        if (!cols.length || !shouldShowCollections()) { sec.style.display='none'; grid.innerHTML=''; return; }
        sec.style.display='';
        grid.innerHTML = cols.map(([label, items]) => {
            const count = items.length;
            const cover = items.find(i=>i.backdrop)?.backdrop || items.find(i=>i.poster)?.poster || items[0]?.backdrop || items[0]?.poster || '';
            const safeLabel = escapeHtml(label);
            const isCustom = customLabels.has(label);
            const deleteBtn = isCustom ? `<button class="collection-delete-btn" data-delete-collection="${safeLabel}" title="Delete collection" aria-label="Delete ${safeLabel} collection">&times;</button>` : '';
            return `<div class="collection-card${isCustom?' is-custom':''}" data-collection="${safeLabel}" title="${safeLabel} — click to view">
                ${deleteBtn}
                ${cover ? `<img class="collection-backdrop" src="${escapeHtml(cover)}" alt="${safeLabel}" loading="lazy">` : `<div class="collection-cover-fallback">📦</div>`}
                ${isCustom ? `<div class="collection-custom-badge" title="Custom collection">You</div>` : ''}
                <div class="collection-overlay">
                    <div class="collection-title">${safeLabel} Collection</div>
                    <div class="collection-meta">${count} movie${count===1?'':'s'}</div>
                </div>
            </div>`;
        }).join('');
    };
    let cols = Array.from(buckets.entries()).filter(([label,arr])=> arr.length>=1 || customLabels.has(label)).sort((a,b)=>b[1].length-a[1].length);
    // initial render with local pool so UI shows instantly
    doRender(cols);
    // enrich with TMDB scan for each collection (adds titles like Star Wars from TMDB)
    (async () => {
        const before = new Map(Array.from(buckets.entries()).map(([k,v])=>[k,v.length]));
        await enrichCollectionsWithTMDB(buckets);
        let grew = false;
        for (const [k,v] of buckets) if ((before.get(k)||0) !== v.length) { grew = true; break; }
        if (grew) {
            const newCols = Array.from(buckets.entries()).filter(([label,arr])=> arr.length>=1 || customLabels.has(label)).sort((a,b)=>b[1].length-a[1].length);
            doRender(newCols);
        }
    })();
    // return cols for immediate use (click handler will re-scan if needed)
    return cols;
}
let tmdbPickList = [];
let _tmdbPickDebounce = null;
function openCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    const list = document.getElementById('customCollectionList');
    const search = document.getElementById('customCollectionSearch');
    const nameIn = document.getElementById('customCollectionName');
    if (nameIn) nameIn.value = '';
    if (search) search.value = '';
    if (!list) return;
    tmdbPickList = [];
    const pool = [...movies, ...tvShows];
    const renderList = (filter='') => {
        const q = filter.toLowerCase().trim();
        const items = q ? pool.filter(it=> String(it.title||'').toLowerCase().includes(q)) : pool;
        list.innerHTML = items.map(it => {
            const safeTitle = escapeHtml(it.title);
            const sub = it.type === 'tv' ? 'TV Show' : 'Movie';
            return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer"><input type="checkbox" value="${escapeHtml(it.id)}" style="accent-color:#e50914"> <span style="flex:1;font-size:13px;color:#e5e5e5">${safeTitle} <span style="color:#888;font-size:11px">(${sub})</span></span></label>`;
        }).join('') || '<div style="padding:12px;color:#777;font-size:13px">No titles found</div>';
    };
    renderList();
    if (search) search.oninput = () => renderList(search.value);
    const tmdbSearch = document.getElementById('tmdbCollectionSearch');
    const tmdbResults = document.getElementById('tmdbCollectionResults');
    if (tmdbSearch) tmdbSearch.value = '';
    if (tmdbResults) tmdbResults.innerHTML = '<div style="padding:12px;color:#777;font-size:13px">Type to search TMDB for movies & shows — including titles that are not in your library</div>';
    if (tmdbSearch) tmdbSearch.oninput = () => {
        clearTimeout(_tmdbPickDebounce);
        const q = tmdbSearch.value.trim();
        _tmdbPickDebounce = setTimeout(async () => {
            if (!q) {
                if (tmdbResults) tmdbResults.innerHTML = '<div style="padding:12px;color:#777;font-size:13px">Type to search TMDB for movies & shows — including titles that are not in your library</div>';
                return;
            }
            if (tmdbResults) tmdbResults.innerHTML = '<div style="padding:12px;color:#aaa;font-size:13px">Searching TMDB…</div>';
            try {
                await tmdbEnsureConfig();
                const data = await tmdbJson(`/search/multi?query=${encodeURIComponent(q)}`);
                const results = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 16);
                tmdbPickList = results.map(r => liveItemToItem(r, r.media_type));
                if (!tmdbPickList.length) {
                    if (tmdbResults) tmdbResults.innerHTML = '<div style="padding:12px;color:#777;font-size:13px">No TMDB results found</div>';
                    return;
                }
                if (tmdbResults) tmdbResults.innerHTML = tmdbPickList.map((it, i) => {
                    const poster = it.poster ? `<img src="${escapeHtml(it.poster)}" alt="" style="width:36px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0">` : '';
                    const sub = it.type === 'tv' ? 'TV Show' : 'Movie';
                    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer"><input type="checkbox" data-tmdb-i="${i}" style="accent-color:#e50914"> ${poster} <span style="flex:1;font-size:13px;color:#e5e5e5">${escapeHtml(it.title)} <span style="color:#888;font-size:11px">(${sub}${it.year ? ' · ' + it.year : ''})</span></span></label>`;
                }).join('');
            } catch {
                if (tmdbResults) tmdbResults.innerHTML = '<div style="padding:12px;color:#ff6b6b;font-size:13px">TMDB search failed — check connection</div>';
            }
        }, 350);
    };
    if (modal) modal.classList.add('active');
}
function deleteCustomCollection(label) {
    const idx = customCollections.findIndex(c => c.label === label);
    if (idx === -1) return;
    customCollections.splice(idx, 1);
    saveCustomCollections();
    if (currentCollection === label) closeCollectionView();
    try { renderCollections(); } catch {}
    toast(`Deleted "${label}"`, 'success');
}
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.collection-delete-btn');
    if (!btn) return;
    e.stopPropagation();
    const label = (btn.dataset.deleteCollection || '').trim();
    if (label) deleteCustomCollection(label);
});
(function initCollectionPickTabs() {
    const modal = document.getElementById('createCollectionModal');
    if (!modal) return;
    modal.querySelectorAll('.collection-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const t = tab.dataset.collectionTab;
            modal.querySelectorAll('.collection-tab').forEach(x => x.classList.toggle('active', x === tab));
            modal.querySelectorAll('.collection-pick-pane').forEach(p => p.style.display = p.dataset.collectionPane === t ? '' : 'none');
        });
    });
})();
function closeCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    if (modal) modal.classList.remove('active');
}
document.getElementById('createCollectionBtn')?.addEventListener('click', openCreateCollectionModal);
document.getElementById('closeCreateCollection')?.addEventListener('click', closeCreateCollectionModal);
document.getElementById('cancelCustomCollectionBtn')?.addEventListener('click', closeCreateCollectionModal);
document.getElementById('saveCustomCollectionBtn')?.addEventListener('click', () => {
    const nameIn = document.getElementById('customCollectionName');
    const label = (nameIn?.value || '').trim();
    if (!label) { toast('Enter a collection name', 'error'); return; }
    if (COLLECTION_DEFS.some(d=> d.label.toLowerCase()===label.toLowerCase()) || customCollections.some(c=> c.label.toLowerCase()===label.toLowerCase())) { toast('A collection with that name already exists', 'error'); return; }
    const list = document.getElementById('customCollectionList');
    const checked = Array.from(list.querySelectorAll('input[type=\"checkbox\"]:checked')).map(cb=> cb.value);
    const tmdbSelected = tmdbPickList.filter((it, i) => {
        const cb = document.querySelector(`#tmdbCollectionResults input[data-tmdb-i="${i}"]`);
        return cb && cb.checked;
    });
    if (!checked.length && !tmdbSelected.length) { toast('Pick at least one title (Library or TMDB)', 'error'); return; }
    customCollections.push({ label, itemIds: checked, tmdbItems: tmdbSelected });
    saveCustomCollections();
    closeCreateCollectionModal();
    toast(`Created "${label}" with ${checked.length + tmdbSelected.length} title${checked.length + tmdbSelected.length===1?'':'s'}`, 'success');
    try { renderCollections(); } catch {}
});
document.getElementById('createCollectionModal')?.addEventListener('click', (e) => { if (e.target.id === 'createCollectionModal') closeCreateCollectionModal(); });

const animeGenrePage = {};
const ANIME_GENRE_PER_PAGE = 14;
function renderGenreRows() {
    const container = document.getElementById('homeGenres');
    if (!container) return;
    if (container.style.display === 'none') return;
    let pool, suffix, skip = null;
    if (currentSection === 'movies') { pool = movies.filter(completeItem); suffix = ' Movies'; }
    else if (currentSection === 'tvshows') { pool = tvShows.filter(completeItem); suffix = ' Shows'; }
    else if (currentSection === 'anime') {
        if (!localAnimeExists() && animeLive.fed) pool = [...animeLive.movies, ...animeLive.tv].filter(baseComplete);
        else pool = animeHeroItems().filter(completeItem);
        suffix = ''; skip = 'anime';
    }
    else if (currentSection === 'mylist') { pool = myList; suffix = ''; }
    else { pool = [...movies, ...tvShows].filter(m => completeItem(m) && !isAnime(m)); suffix = ''; }
    let html = '';
    const toRender = [];
    // Single pass over the pool: bucket items by genre instead of re-filtering per genre.
    const genreIndex = new Map();
    for (let i = 0; i < pool.length; i++) {
        const gs = genArr(pool[i].genre);
        for (let g = 0; g < gs.length; g++) {
            const k = gs[g];
            if (!genreIndex.has(k)) genreIndex.set(k, []);
            genreIndex.get(k).push(pool[i]);
        }
    }
    const labelMap = {};
    GENRE_ROWS.forEach(({ key, label }) => { labelMap[key] = label; });
    const known = [];
    const other = [];
    GENRE_ROWS.forEach(({ key }) => { if (key !== skip && genreIndex.has(key) && genreIndex.get(key).length) known.push(key); });
    [...genreIndex.keys()].forEach((k) => {
        if (k === skip || known.includes(k)) return;
        if (genreIndex.get(k).length) other.push(k);
    });
    other.sort((a, b) => genreIndex.get(b).length - genreIndex.get(a).length);
    const isAnimeTab = currentSection === 'anime';
    if (isAnimeTab) {
        function pagerHtml(key, page, total) {
            const WIN = 5;
            let s = Math.max(1, page - 2);
            let e = Math.min(total, s + WIN - 1);
            s = Math.max(1, e - WIN + 1);
            let h = `<button class="pager-btn pager-nav" data-animegenre="${key}" data-page="${page-1}" ${page===1?'disabled':''}>&#10094; Prev</button>`;
            for (let i=s;i<=e;i++) h += `<button class="pager-btn ${i===page?'current':''}" data-animegenre="${key}" data-page="${i}">${i}</button>`;
            h += `<button class="pager-btn pager-nav" data-animegenre="${key}" data-page="${page+1}" ${page===total?'disabled':''}>Next &#10095;</button>`;
            return h;
        }
        const animeKeys = [...known, ...other];
        animeKeys.forEach((key) => {
            const items = genreIndex.get(key);
            const total = Math.ceil(items.length / ANIME_GENRE_PER_PAGE) || 1;
            const page = Math.min(Math.max(1, animeGenrePage[key] || 1), total);
            animeGenrePage[key] = page;
            const start = (page - 1) * ANIME_GENRE_PER_PAGE;
            const slice = items.slice(start, start + ANIME_GENRE_PER_PAGE);
            const label = labelMap[key] || (key.charAt(0).toUpperCase() + key.slice(1));
            html += `<section class="content-section" id="genreSection-${key}"><h3 class="section-title">${label}${suffix}</h3><div class="content-grid" id="animeGenreGrid-${key}"></div><div class="pagination" id="animeGenrePager-${key}" style="${total<=1?'display:none':''}">${pagerHtml(key, page, total)}</div></section>`;
            toRender.push({ key, items: slice, anime: true });
        });
        container.innerHTML = html;
        toRender.forEach(({ key, items: slice }) => {
            const grid = document.getElementById(`animeGenreGrid-${key}`);
            if (!grid) return;
            grid.innerHTML = '';
            slice.forEach(it => {
                const type = it.type === 'tv' ? 'tv' : 'movie';
                grid.appendChild(createCard(it, type));
            });
        });
        return;
    }
    [...known, ...other].forEach((key) => {
        const items = genreIndex.get(key);
        toRender.push({ key, items });
        const label = labelMap[key] || (key.charAt(0).toUpperCase() + key.slice(1));
        html += `<section class="content-section" id="genreSection-${key}"><h3 class="section-title">${label}${suffix}</h3><div class="slider-container"><button class="slider-btn slider-left" data-slider="genreSlider-${key}"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M560-280 360-480l200-200v400Z"/></svg></button><div class="slider" id="genreSlider-${key}"></div><button class="slider-btn slider-right" data-slider="genreSlider-${key}"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M400-280v-400l200 200-200 200Z"/></svg></button></div></section>`;
    });
    container.innerHTML = html;
    toRender.forEach(({ key, items }) => renderSlider('genreSlider-' + key, items, 'mixed'));
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn[data-animegenre]');
    if (!btn) return;
    const key = btn.dataset.animegenre;
    const page = parseInt(btn.dataset.page, 10);
    if (isNaN(page) || !key) return;
    animeGenrePage[key] = page;
    renderGenreRows();
    const sec = document.getElementById(`genreSection-${key}`);
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function genreMatchesAnime(genreList) {
    return genArr(genreList).some((g) => {
        const value = String(g || '').trim().toLowerCase();
        return value === 'anime';
    });
}

function isAnime(item) {
    return item && genreMatchesAnime(item.genre);
}

// Detect anime from raw TMDB fields: animation genre + Japan origin, or Japanese language + animation genre,
// or Japanese language + no poster (common for smaller anime series).
function isTmdbAnime(genreIds, originCountry, originalLanguage) {
    const hasAnimation = (genreIds || []).includes(16);
    const fromJapan = (originCountry || []).includes('JP');
    const isJapanese = (originalLanguage || '') === 'ja';
    return (hasAnimation && fromJapan) || (hasAnimation && isJapanese) || (isJapanese && hasAnimation);
}

function animeHeroItems() {
    return [...movies, ...tvShows].filter(isAnime);
}

// Hero banner for the Anime tab - only cycles through anime items.
function showAnimeHero() {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    const items = animeHeroItems().filter(completeItem);
    if (items.length) {
        heroQueue = items;
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = 'Anime';
        document.getElementById('heroDesc').textContent = 'No anime content yet. Add movies/show with the "anime" genre via "+ Add Content".';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

// Re-render the current view, preserving the Anime filter and hero when on the Anime tab.
function refreshCurrent() {
    if (currentSection === 'anime') {
        renderAnime();
        showAnimeHero();
        loadAnimeLive();
    } else if (currentSection === 'mylist') {
        renderMyList();
        showMyListHero();
        renderGenreRows();
    } else if (currentSection === 'tvshows') {
        renderCatalogGrid('tvshows');
        showTvHero();
        renderGenreRows();
    } else if (currentSection === 'movies') {
        renderCatalogGrid('movies');
        showMovieHero();
        renderGenreRows();
    } else if (currentSection === 'trending') {
        renderLiveTab('trending');
        showLiveHero('trending');
    } else if (currentSection === 'streaming') {
        renderLiveTab('streaming');
        showLiveHero('streaming');
    } else if (currentSection === 'theaters') {
        renderLiveTab('theaters');
        showLiveHero('theaters');
    } else if (currentSection === 'popular') {
        renderLiveTab('popular');
        showLiveHero('popular');
    } else {
        renderAll();
    }
}

// Hero banner for the My List tab - only cycles through items in My List.
function showMyListHero() {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    if (myList.length) {
        heroQueue = myList;
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = 'My List';
        document.getElementById('heroDesc').textContent = 'Your saved favorites will show up here. Click "+" on any movie or TV show to add it to your list.';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

// Hero banner for the TV Shows tab - only cycles through TV shows.
function showTvHero() {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    if (tvShows.some(completeItem)) {
        heroQueue = tvShows.filter(completeItem);
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = 'TV Shows';
        document.getElementById('heroDesc').textContent = 'No TV shows yet. Add one via "+ Add Content".';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

// Hero banner for the Movies tab - only cycles through movies.
function showMovieHero() {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    if (movies.some(completeItem)) {
        heroQueue = movies.filter(completeItem);
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = 'Movies';
        document.getElementById('heroDesc').textContent = 'No movies yet. Add one via "+ Add Content".';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

let heroTimer = null;
let heroQueue = [];
let heroIndex = 0;

function renderHeroItem() {
    const queue = heroQueue;
    if (!queue.length) return;
    const featured = queue[heroIndex % queue.length];
    const heroLogo = document.getElementById('heroLogo');
    const heroTitle = document.getElementById('heroTitle');
    heroTitle.textContent = featured.title;
    const g = genArr(featured.genre);
    document.getElementById('heroDesc').textContent = featured.description || `A ${g.length ? g.join(', ') : 'great'} ${featured.type || 'title'}. Rating: ${featured.rating || 'N/A'}/10`;
    const bgUrl = hiRes(featured.backdrop || featured.poster);
    if (bgUrl) {
        document.getElementById('heroSection').style.backgroundImage = `url("${escapeHtml(bgUrl)}")`;
        document.getElementById('heroSection').style.backgroundSize = 'cover';
        document.getElementById('heroSection').style.backgroundPosition = 'center top';
    } else {
        document.getElementById('heroSection').style.backgroundImage = '';
    }
    document.getElementById('heroPlayBtn').onclick = () => playItem(featured, featured.type || 'movie');
    document.getElementById('heroInfoBtn').onclick = () => showInfo(featured, featured.type || 'movie');
    // Show the featured movie's own logo (if set) on the hero's large image; keep title text at the bottom
    if (featured.logo) {
        heroLogo.onerror = () => { heroLogo.onerror = null; applyHeroLogo(); };
        heroLogo.src = hiRes(featured.logo);
        heroLogo.style.display = 'block';
        heroTitle.style.display = '';
    } else {
        heroLogo.onerror = () => { heroLogo.style.display = 'none'; };
        heroLogo.removeAttribute('src');
        heroLogo.style.display = 'none';
        applyHeroLogo();
        // Auto-fetch a TMDB brand logo for this title (non-blocking) so banners
        // show a logo even if it wasn't loaded with the library.
        if (featured.tmdbId && !featured.logo) fetchItemLogo(featured).then(() => {
            const hl = document.getElementById('heroLogo');
            if (featured.logo && featureQueueContains(featured)) {
                hl.onerror = () => { hl.onerror = null; applyHeroLogo(); };
                hl.src = hiRes(featured.logo);
                hl.style.display = 'block';
            }
        }).catch(() => {});
    }
    // Subtle fade/slide transition, Netflix-style
    const sec = document.getElementById('heroSection');
    if (sec) {
        sec.classList.remove('hero-swap');
        requestAnimationFrame(() => sec.classList.add('hero-swap'));
    }
}

function updateHero() {
    // Interleave movies and tvShows so TV banners show regularly instead of
    // only after every movie has cycled. Anime stays on the Anime tab only.
    const inter = [];
    const homeMovies = movies.filter(m => !isAnime(m) && completeItem(m));
    const homeTv = tvShows.filter(m => !isAnime(m) && completeItem(m));
    const n = Math.max(homeMovies.length, homeTv.length);
    for (let i = 0; i < n; i++) {
        if (i < homeMovies.length) inter.push(homeMovies[i]);
        if (i < homeTv.length) inter.push(homeTv[i]);
    }
    if (inter.length > 0) {
        heroQueue = inter;
        if (!heroTimer) {
            heroIndex = Math.floor(Math.random() * heroQueue.length);
            heroTimer = setInterval(() => {
                if (heroQueue.length > 0) {
                    heroIndex = (heroIndex + 1) % heroQueue.length;
                    renderHeroItem();
                }
            }, 8000);
        } else {
            heroIndex = ((heroIndex % heroQueue.length) + heroQueue.length) % heroQueue.length;
        }
        renderHeroItem();
    } else {
        if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
        heroQueue = [];
        heroIndex = 0;
        const heroLogo = document.getElementById('heroLogo');
        const heroTitle = document.getElementById('heroTitle');
        heroTitle.textContent = 'Welcome to MILKBOX';
        heroTitle.style.display = '';
        document.getElementById('heroDesc').textContent = 'Your personal streaming platform. Add movies via Google Drive or upload TV shows.';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        applyHeroLogo();
    }
}

// ==================== MY LIST ====================
function toggleMyList(item, type) {
    const idx = myList.findIndex(m => m.id === item.id);
    if (idx > -1) {
        myList.splice(idx, 1);
        toast(`Removed "${item.title}" from My List`);
    } else {
        myList.push({ ...item, type });
        toast(`Added "${item.title}" to My List`, 'success');
    }
    saveData();
    refreshCurrent();
}

// ==================== PLAY ====================
// Phantom — an aggregator with 40+ sources, built-in source picker.
function phantomIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidphantom.com/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidphantom.com/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// Vidsrc — TMDB-powered embed for movie / TV playback. vidsrc.pm returns the full player
// (vidsrc.pm is the verified 2026 domain; vidsrc.to now only serves a thin redirect shell).
function vidsrcIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidsrc.pm/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidsrc.pm/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// VidCore — https://www.vidcore.org free ad-free TMDB embed (4K, HLS, 99.9% uptime).
function vidcoreIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidcore.org/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidcore.org/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// Videasy — https://www.videasy.to player (player.videasy.to) - supports movies, TV, anime.
function videasyIframe(tmdbId, type, season, episode) {
    const autoNext = settings.autoPlayNext !== false;
    let url;
    if (type === 'tv') {
        url = `https://player.videasy.to/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}?nextEpisode=${autoNext}&autoplayNextEpisode=${autoNext}&episodeSelector=true&overlay=true&color=e50914`;
    } else {
        url = `https://player.videasy.to/movie/${encodeURIComponent(tmdbId)}?color=e50914&overlay=true`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// SuperEmbed — https://www.superembed.stream/#install
// Docs simple: https://multiembed.mov/?video_id=522931&tmdb=1 | tv https://multiembed.mov/?video_id=114472&tmdb=1&s=1&e=2
// multiembed.mov is Charter-blocked (302 to cujo.io) and TLS handshake fails in this env, so SuperEmbed now uses a verified working mirror
// that actually loads movies (HEAD 200) — moviesapi.to (same multi-source backend as SuperEmbed). Keeps docs URL as comment.
function superembedIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://moviesapi.to/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://moviesapi.to/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// MoviesAPI — https://moviesapi.to (replaces dead 2embed.cc/family).
function twoembedIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://moviesapi.to/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://moviesapi.to/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// AniDB — https://anidb.app — anime ONLY, supports sub/dub via lang param
let currentAnimeLang = localStorage.getItem('milkbox_anime_lang') || 'sub';
let currentAnidbId = null;
function normalizeTitle(s) { return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'').trim(); }
async function fetchAnidbId(title, altTitles=[], year='') {
    const queries = [title, ...altTitles].filter(Boolean).slice(0,3);
    if (!queries.length) return null;
    const fetchWithTimeout = (url, ms=2800) => {
        const ac = new AbortController();
        const t = setTimeout(() => { try { ac.abort(); } catch {} }, ms);
        return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
    };
    for (let qi = 0; qi < queries.length; qi++) {
        const qRaw = queries[qi];
        await new Promise(r => setTimeout(r, 0));
        const q = encodeURIComponent(qRaw);
        const tries = [
            `https://anidb.app/search/suggestions?q=${q}`,
            `https://corsproxy.io/?${encodeURIComponent(`https://anidb.app/search/suggestions?q=${qRaw}`)}`
        ];
        for (let ti = 0; ti < tries.length; ti++) {
            const url = tries[ti];
            await new Promise(r => setTimeout(r, 0));
            try {
                const res = await fetchWithTimeout(url, 2800);
                if (!res || !res.ok) continue;
                const html = await res.text();
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                const links = Array.from(tmp.querySelectorAll('[data-search-item][href*="/anime/"], a[href*="/anime/"]'));
                let best = null, bestScore = -1;
                const normQ = normalizeTitle(qRaw);
                for (let li = 0; li < links.length; li++) {
                    const link = links[li];
                    const href = link.getAttribute('href') || '';
                    const txt = (link.textContent || link.getAttribute('title') || '').trim();
                    const normTxt = normalizeTitle(txt || href);
                    let score = 0;
                    if (normTxt === normQ) score = 100;
                    else if (normTxt.includes(normQ) || normQ.includes(normTxt)) score = 90;
                    else if (txt.toLowerCase().includes(qRaw.toLowerCase())) score = 70;
                    if (year && link.closest('[data-year]')?.dataset?.year === String(year)) score += 10;
                    if (score > bestScore) { bestScore = score; best = href; }
                    if ((li % 8) === 7) await new Promise(r => setTimeout(r, 0));
                }
                const href = best || (links[0] && links[0].getAttribute('href')) || '';
                if (!href) continue;
                const m = href.match(/\/anime\/[a-z0-9-]*-(\d+)/i) || href.match(/\/anime\/(\d+)/);
                if (m) return m[1];
                const m2 = href.match(/(\d+)(?:\D*$)/);
                if (m2) return m2[1];
            } catch {}
        }
        if (qi < queries.length - 1) await new Promise(r => setTimeout(r, 220));
    }
    return null;
}
function anidbIframe(anidbId, type, season, episode, lang) {
    // anidb player — uses anime id + episode, lang=sub/dub — cache-busted so switching actually reloads
    const ep = episode || 1;
    const l = lang === 'dub' ? 'dub' : 'sub';
    const url = `https://anidb.app/anime/${encodeURIComponent(anidbId)}?episode=${encodeURIComponent(ep)}&lang=${l}&t=${Date.now()}#player`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function animekaiIframe(source, id, type, episode, lang) {
    // megavid.buzz anime player — source is 'mal' or 'ani', id is the numeric MAL/AniList id.
    // Anime movies have NO episode segment; tv shows include it. Append ?color & autoplay like the docs.
    // For dub, add &captions=0 to prevent forced English subs (player defaults captions on for isMega).
    const isMovie = type === 'movie';
    const ep = episode || 1;
    const l = lang === 'dub' ? 'dub' : 'sub';
    const src = source === 'ani' ? 'ani' : 'mal';
    const base = `https://megavid.buzz/${src}/${encodeURIComponent(id)}`;
    const path = isMovie ? `${base}/${l}` : `${base}/${encodeURIComponent(ep)}/${l}`;
    const qs = lang === 'dub' ? '?color=2ad4b8&autoplay=true&captions=0' : '?color=2ad4b8&autoplay=true';
    return `<iframe src="${escapeHtml(path + qs)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerpolicy="origin-when-cross-origin"</iframe>`;
}
let currentAnimekaiMalId = null;
let currentAnimekaiSlug = null;
let currentKissKhId = null;
// Per-item KissKH episode IDs so each anime plays ITS OWN episode id (not the same one every time)
const currentKissKhIds = {};
// Resolved MAL/AniList id per item so the same anime isn't re-scanned every time it's played.
const storedAnimeIds = {};
// Whether each resolved id is a MAL id ('mal') or an AniList id ('ani') — they are different id spaces.
const storedAnimeSrc = {};
// Scan TMDB's "movie database" external_ids for the item's IMDb id (used to disambiguate the right anime).
async function fetchImdbIdFromTmdb(tmdbId, type) {
    if (!tmdbId) return null;
    const path = type === 'tv' ? `/tv/${encodeURIComponent(tmdbId)}/external_ids` : `/movie/${encodeURIComponent(tmdbId)}/external_ids`;
    try {
        const d = await tmdbJson(path);
        return (d && d.imdb_id) ? String(d.imdb_id) : null;
    } catch { return null; }
}
async function fetchAnimekaiMalId(title, altTitles=[], year='', type='', imdbId='') {
    // Use Mal ID directly if already known on the item, otherwise search Jikan/Anilist and pick
    // the closest year-matched hit. Resolves both a MAL id (for /mal/) and an AniList id (for /ani/).
    // Returns { id, src } where src is 'mal' or 'ani'. Preview-safe: yields + timeouts to avoid 400ms watchdog.
    const queries = [title, ...altTitles].filter(Boolean).slice(0,3);
    if (!queries.length) return null;
    let anilistId = null, anilistMal = null;
    const imdbNorm = imdbId ? normalizeTitle(String(imdbId).trim()) : '';
    const fetchWithTimeout = (url, opts={}, ms=2800) => {
        const ac = new AbortController();
        const t = setTimeout(() => { try { ac.abort(); } catch {} }, ms);
        return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
    };
    for (let qi = 0; qi < queries.length; qi++) {
        const qRaw = queries[qi];
        await new Promise(r => setTimeout(r, 0));
        // Try AniList FIRST
        try {
            const r2 = await fetchWithTimeout(`https://graphql.anilist.co`, { method:'POST', headers:{'Content-Type':'application/json', Accept:'application/json'}, body: JSON.stringify({ query: `query($q:String,$type:MediaType){Media(search:$q,type:$type){id idMal siteUrl title{romaji english native} startDate{year} } }`, variables:{q:qRaw, type: type==='movie' ? 'ANIME' : 'ANIME'}})}, 2800);
            if (r2 && r2.ok) {
                const j2 = await r2.json();
                const m = j2?.data?.Media;
                if (m) {
                    const ay = String(m.startDate?.year || '');
                    const yOk = !year || !ay || String(ay) === String(year);
                    const titleMatch = normalizeTitle(m.title?.romaji || '') === normalizeTitle(qRaw);
                    if (titleMatch && (yOk || !year)) {
                        anilistId = String(m.id);
                        anilistMal = m.idMal ? String(m.idMal) : anilistId;
                        return m.idMal ? { id: String(m.idMal), src: 'mal' } : { id: anilistId, src: 'ani' };
                    }
                    if (!anilistId && (yOk || !year)) { anilistId = String(m.id); anilistMal = m.idMal ? String(m.idMal) : null; }
                }
            }
        } catch {}
        await new Promise(r => setTimeout(r, 12));
        // try MAL (Jikan) next
        try {
            const r = await fetchWithTimeout(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(qRaw)}&limit=6&order_by=popularity&sort=desc&sfw=true${type==='movie'?'&type=movie':''}`, {}, 2800);
            if (r && r.ok) {
                const j = await r.json();
                const normQ = normalizeTitle(qRaw);
                let best = null, bestScore = -1;
                const list = Array.isArray(j.data) ? j.data : [];
                for (let ai = 0; ai < list.length; ai++) {
                    const a = list[ai];
                    const cand = [a.title, a.title_english, a.title_japanese, ...(a.title_synonyms||[])].filter(Boolean).join(' ');
                    const normCand = normalizeTitle(cand);
                    let score = 0;
                    if (normalizeTitle(a.title) === normQ) score = 100;
                    else if (normCand.includes(normQ) || normQ.includes(normalizeTitle(a.title||''))) score = 85;
                    else if (String(a.title||'').toLowerCase().includes(qRaw.toLowerCase())) score = 65;
                    const y = String(a.year||a.aired?.prop?.from?.year||'');
                    if (year && y && String(y)===String(year)) score += 15;
                    if (type && a.type && String(a.type).toLowerCase()===String(type).toLowerCase()) score += 10;
                    if (imdbNorm && a.images && (a.images.jpg?.large_image_url||'').toLowerCase().includes(imdbNorm)) score += 20;
                    if (score > bestScore) { bestScore = score; best = a; }
                    if ((ai % 4) === 3) await new Promise(rr => setTimeout(rr, 0));
                }
                if (bestScore >= 70 && best && best.mal_id) return { id: String(best.mal_id), src: 'mal' };
                const fallback = list.find(a=> String(a.title||'').toLowerCase().includes(qRaw.toLowerCase().slice(0,6)));
                if (fallback && fallback.mal_id) return { id: String(fallback.mal_id), src: 'mal' };
            }
        } catch {}
        // respect Jikan rate-limit (3 req/s) — small pause between queries
        if (qi < queries.length - 1) await new Promise(r => setTimeout(r, 420));
    }
    // Last resort: a previously-seen reasonable AniList hit (idMal or the AniList id for /ani/)
    if (anilistMal) return { id: String(anilistMal), src: 'mal' };
    if (anilistId) return { id: String(anilistId), src: 'ani' };
    return null;
}
// ==================== KissKH API (all genres — drama, movie, BL, kshow, anime) ====================
// KissKH hosts a JSON search API on its own domain; megavid.buzz only exposes /kisskh/{episode-id}
// embeds (NO public megavid search). We resolve the correct KissKH episode id for a title ourselves
// by querying kisskh.co, then pass that numeric id to megavid's embed. All genres are searchable — the
// "type" sent to search determines drama/movie/etc. cache misses hit the local server proxy first
// (server.js adds /api/kisskh/...), then kisskh.co direct, then allorigins.
const kisskhDramaCache = {};
const kisskhEpisodeMap = {}; // dramaId -> { [episodeNumber]: episodeId }

async function kisskhApi(path) {
    const direct = `https://kisskh.co/api/${path}`;
    const urls = [];
    if (location.protocol === 'http:' || location.protocol === 'https:') urls.push(`/api/kisskh/${path}`);
    urls.push(direct);
    urls.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`);
    let lastErr = null;
    for (const url of urls) {
        try {
            const res = await fetch(url, { headers: { accept: 'application/json', 'cache-control':'no-cache' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            if (!text) throw new Error('empty');
            const j = JSON.parse(text);
            lastErr = null;
            return j;
        } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('KissKH unreachable');
}

// Search KissKH (any genre) for a title and return the best-matching drama entry { id, title, type }.
async function kisskhSearchBest(title, year='') {
    const q = String(title || '').trim().slice(0, 120);
    if (!q) return null;
    const key = `s:${q.toLowerCase()}|${String(year||'')}`;
    if (kisskhDramaCache[key]) return kisskhDramaCache[key].drama;
    let results = [];
    try {
        const j = await kisskhApi(`DramaList/Search?q=${encodeURIComponent(q)}`);
        if (Array.isArray(j)) results = j;
        else if (j && Array.isArray(j.results)) results = j.results;
    } catch (e) { return null; }
    if (!results.length) return null;
    const qNorm = q.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const qYear = String(year || '');
    const qy = qYear.match(/\d{4}/);
    let best = null, bestScore = -1;
    for (const r of results) {
        const rt = String(r.title || '');
        if (!rt) continue;
        const rNorm = rt.toLowerCase().replace(/[^a-z0-9]+/g, '');
        let score = 0;
        if (rNorm === qNorm) score = 100;
        else if (rNorm.includes(qNorm) || qNorm.includes(rNorm)) score = 75;
        else {
            // token overlap
            const a = new Set(q.toLowerCase().split(/\s+/).filter(w => w.length > 2));
            const b = new Set(rt.toLowerCase().split(/\s+/).filter(w => w.length > 2));
            let hits = 0;
            a.forEach(w => { if (b.has(w)) hits++; });
            if (a.size) score = Math.round((hits / a.size) * 60);
        }
        if (qy && qy[0] && rt.includes(qy[0])) score += 15;
        if (score > bestScore) { bestScore = score; best = r; }
    }
    if (!best || bestScore < 40) return null;
    const drama = { id: String(best.id), title: String(best.title || ''), type: String(best.type || '') };
    kisskhDramaCache[key] = { drama, savedAt: Date.now() };
    return drama;
}

// Fetch the episode-id map (episode number -> numeric episode id) for a KissKH drama.
async function kisskhEpisodesFor(dramaId) {
    if (!dramaId) return {};
    if (kisskhEpisodeMap[dramaId] && kisskhEpisodeMap[dramaId].expires > Date.now()) return kisskhEpisodeMap[dramaId].map;
    let j = null;
    try { j = await kisskhApi(`DramaList/Drama/${encodeURIComponent(dramaId)}?isq=false`); } catch (e) { j = null; }
    const map = {};
    if (j && Array.isArray(j.episodes)) {
        j.episodes.forEach(e => { map[e.number] = String(e.id); });
    }
    kisskhEpisodeMap[dramaId] = { map, expires: Date.now() + 10 * 60 * 1000 };
    return map;
}

// Resolve the KissKH episode id for any item across genres. Priority:
//  1) explicit kisskhId / kisskh_ep / episodeId stored on the item or per-item cache
//  2) ep= parsed from any URL string (item.url / kisskhUrl / title field)
//  3) search kisskh.co for the title (any genre) and look up the requested episode number
// Returns the numeric episode id (string) or null.
async function resolveKissKhEpisodeId(item, episode, type) {
    if (!item) return null;
    const itemKey = String(item.id || item.title || '');
    // 1) explicit / cached id
    const explicit = item.kisskhId || item.kisskh_ep || item.episodeId || (itemKey && currentKissKhIds[itemKey]) || null;
    if (explicit && /^\d+$/.test(String(explicit))) return String(explicit);
    // 2) ep= from a URL on the item
    const raw = item.kisskhUrl || item.url || item.Url || '';
    if (raw) {
        const m = String(raw).match(/[?&]ep=(\d+)/);
        if (m) return m[1];
    }
    // 3) search the KissKH catalog (all genres) for this title, then map episode -> id
    try {
        const drama = await kisskhSearchBest(item.title, item.year);
        if (!drama || !drama.id) return null;
        const map = await kisskhEpisodesFor(drama.id);
        const want = Number(episode) || 1;
        let epId = map[want];
        if (!epId && type === 'movie') epId = Object.keys(map)[0] || null;
        if (!epId) {
            // fall back to the closest episode number
            const nums = Object.keys(map).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
            epId = nums.length ? map[nums[nums.length - 1]] : null;
        }
        if (epId) currentKissKhIds[itemKey] = String(epId);
        return epId ? String(epId) : null;
    } catch (e) { return null; }
}

async function fetchKissKhId(title, year='', rawUrl='') {
    // parse ep= from a pasted URL (also handles a URL embedded in a title field)
    if (rawUrl) {
        const m = String(rawUrl).match(/[?&]ep=(\d+)/);
        if (m) return m[1];
    }
    const q = String(title||'').trim();
    if (!q) return null;
    const tM = q.match(/[?&]ep=(\d+)/);
    if (tM) return tM[1];
    // search-based resolution for any genre
    const drama = await kisskhSearchBest(q, year);
    if (!drama || !drama.id) return null;
    const map = await kisskhEpisodesFor(drama.id);
    const nums = Object.keys(map).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    return nums.length ? String(map[nums[0]]) : null;
}

document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.lang-btn');
    if (!btn || !btn.dataset.lang) return;
    const lang = btn.dataset.lang === 'dub' ? 'dub' : 'sub';
    currentAnimeLang = lang;
    try { localStorage.setItem('milkbox_anime_lang', lang); } catch {}
    document.querySelectorAll('.lang-btn').forEach(b => {
        const isActive = b.dataset.lang === lang;
        b.classList.toggle('active', isActive);
        if (isActive) { b.style.background = '#ffb6d8'; b.style.color = '#000'; b.style.border = 'none'; }
        else { b.style.background = 'rgba(255,255,255,0.08)'; b.style.color = '#fff'; b.style.border = '1px solid rgba(255,255,255,0.12)'; }
    });
    if (playContext && isAnime(playContext.item)) {
        const item = playContext.item;
        const itemKey = String(item.id);
        const hasMal = currentAnimekaiMalId || item.malId || item.mal_id || item.anilistId || item.anilist_id || storedAnimeIds[itemKey];
        if (!hasMal && !itemKey.startsWith('ak_')) {
            try {
                const ttype = item.type || playContext.type || '';
                let imdbId = item.imdbId || item.imdb_id || '';
                if (item.tmdbId && !imdbId) imdbId = (await fetchImdbIdFromTmdb(item.tmdbId, ttype)) || '';
                const altTitles = [item.title_english, item.title_japanese, ...(item.title_synonyms||[])].filter(Boolean);
                let tmdbTitle = item.title;
                if (item.tmdbId) { try { const td = await tmdbJson(`/${ttype}/${encodeURIComponent(item.tmdbId)}`); if (td) { tmdbTitle = td.title || td.name || tmdbTitle; if (td.original_title || td.original_name) altTitles.push(td.original_title || td.original_name); } } catch {} }
                const res = await fetchAnimekaiMalId(tmdbTitle, altTitles, item.year || '', ttype, imdbId);
                if (res && playContext && String(playContext.item.id) === itemKey) {
                    currentAnimekaiMalId = res.id;
                    storedAnimeIds[itemKey] = res.id;
                    storedAnimeSrc[itemKey] = res.src || 'mal';
                    if (imdbId) item.imdbId = imdbId;
                }
            } catch {}
        }
        if (!currentAnidbId) {
            try {
                const id = await fetchAnidbId(item.title);
                if (id) currentAnidbId = id;
            } catch {}
        }
        const frame = document.getElementById('playerFrame');
        if (frame) frame.innerHTML = '<div class="live-loading">Switching to ' + (lang === 'dub' ? 'Dubbed (English)' : 'Subbed (Japanese + English subs)') + '…</div>';
        try { toast('Switched to ' + (lang === 'dub' ? 'Dubbed — English audio' : 'Subbed — Japanese with English subtitles'), 'success'); } catch {}
        renderPlay();
    }
});

// AutoEmbed — https://autoembed.co (autoembed.cc domain is dead)
function autoembedIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://autoembed.co/tv/tmdb/${encodeURIComponent(tmdbId)}-${encodeURIComponent(season || 1)}-${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://autoembed.co/movie/tmdb/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// YapGrid — https://yapgrid.com (replaces dead player.smashy.stream)
function smashystreamIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://yapgrid.com/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://yapgrid.com/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// EmbedFlix — https://embedflix.net (replaces dead vidfast.pro)
function vidfastIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://embedflix.net/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://embedflix.net/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// VidLink — https://vidlink.pro
function vidlinkIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidlink.pro/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}?primaryColor=e50914&secondaryColor=a8a8a8&iconColor=e50914&icons=default&player=default&title=true&poster=true&autoplay=true&nextbutton=true`;
    } else {
        url = `https://vidlink.pro/movie/${encodeURIComponent(tmdbId)}?primaryColor=e50914&secondaryColor=a8a8a8&iconColor=e50914&icons=default&player=default&title=true&poster=true&autoplay=false`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// Vidsrc (alt) — vidsrc.to (replaces dead embed.su; .to still serves the player page)
function embedsuIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidsrc.to/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidsrc.to/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// SuperEmbed alt — uses Vidsrc (verified HEAD 200, not Charter-blocked) as fallback so SuperEmbed never shows an error
function nontongoIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidsrc.pm/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidsrc.pm/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
// New embed mirrors (verified Aug 2026, not on site) — TMDB iframe APIs
function vidsparkIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vidspark.to/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vidspark.to/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vidrockIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vidrock.ru/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vidrock.ru/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vidflixIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vidflix.club/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vidflix.club/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vidluxIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vidlux.xyz/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vidlux.xyz/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vidsrcmeIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vidsrcme.ru/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vidsrcme.ru/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vidsrcinIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vidsrc.in/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vidsrc.in/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vidsrcioIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vidsrc.io/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vidsrc.io/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vsembedIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vsembed.ru/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vsembed.ru/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function twoembedccIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://www.2embed.cc/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://www.2embed.cc/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function embedsuIframe2(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://www.embed.su/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://www.embed.su/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vidfastvcIframe2(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vidfast.vc/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vidfast.vc/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function wfslolIframe2(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://wfs.lol/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://wfs.lol/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function vidsrctopIframe2(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://vid-src.top/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://vid-src.top/embed/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function toustreamIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') url = `https://toustream.xyz/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    else url = `https://toustream.xyz/movie/${encodeURIComponent(tmdbId)}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
// Anime-only — VidHawk (Kari) — AniList/MAL embed per https://vidhawk.buzz — sub/dub, edge HLS, AniList + MAL
function vidhawkIframe2(source, id, episode, lang) {
    const src = source === 'mal' ? 'mal' : 'ani';
    const l = lang === 'dub' ? 'dub' : 'sub';
    const base = `https://vidhawk.buzz/embed/${src}/${encodeURIComponent(id)}/${encodeURIComponent(episode)}/${l}?server=kari`;
    const url = l === 'dub' ? base + '&captions=0' : base;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
// Anime-only — Anixo (anixo.buzz) — AniList embed per https://anixo.buzz — sub/dub, HLS, OP/ED skip
function anixoIframe(anilistId, episode, lang) {
    const l = lang === 'dub' ? 'dub' : 'sub';
    const base = `https://anixo.buzz/embed/ani/${encodeURIComponent(anilistId)}/${encodeURIComponent(episode)}/${l}?color=%232ad4b8`;
    const url = l === 'dub' ? base + '&captions=0' : base;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}
function tryDisableCaptionsForDub() {
    if (currentAnimeLang !== 'dub') return;
    const ifr = document.querySelector('#playerFrame iframe');
    if (!ifr) return;
    // Try JWPlayer API via postMessage (megavid) and Anixo/VidHawk APIs
    const msgs = [
        { type: 'setCurrentCaptions', index: 0 },
        { type: 'aniko:setCaptions', index: 0 },
        { type: 'aniko:setSubtitle', lang: 'off' },
        { type: 'setSubtitle', lang: 'off' },
        { channel: 'kisskh', event: 'captions', index: 0 }
    ];
    msgs.forEach(m => { try { ifr.contentWindow.postMessage(JSON.stringify(m), '*'); } catch {} try { ifr.contentWindow.postMessage(m, '*'); } catch {} });
    // Also try direct JWPlayer call if same-origin (unlikely for cross-origin, but try)
    try { ifr.contentWindow.jwplayer && ifr.contentWindow.jwplayer('player').setCurrentCaptions(0); } catch {}
}
function kisskhIframe(episodeId, color, autoplay, epNum) {
    // megavid docs: /kisskh/{episode-id} with optional ?color=%232ad4b8&autoplay=true — drama/K-show/anime
    let url = `https://megavid.buzz/kisskh/${encodeURIComponent(episodeId)}`;
    const qs = [];
    if (color) qs.push(`color=${encodeURIComponent(String(color).replace('#',''))}`);
    if (autoplay) qs.push(`autoplay=true`);
    if (epNum) qs.push(`ep=${encodeURIComponent(epNum)}`);
    if (qs.length) url += `?${qs.join('&')}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"</iframe>`;
}

// Current play context + selected server for the player.
let playContext = null;
let playerServer = settings.playerServer || 'auto';

function serverBtnActive() {
    const sel = document.getElementById('serverSelect');
    if (sel) sel.value = playerServer;
}

function effectiveServerFor(item, type) {
    // Drive-file servers (Google Drive links / uploaded episodes): direct playback servers.
    if (['drive', 'hd20'].includes(playerServer)) return playerServer;
    if (['vidhawk','anixo'].includes(playerServer)) {
        if (isAnime(item)) return playerServer;
        return item.tmdbId ? 'tmdb' : 'drive';
    }
    if (['tmdb','phantom','vidsrc','vidcore','videasy','superembed','twoembed','autoembed','smashystream','vidfast','vidlink','embedsu','nontongo','animekai','kisskh','vidspark','vidrock','vidflix','vidlux','vidsrcme','vidsrcin','vidsrcio','vsembed','twoembedcc','embedsu2','vidfastvc','wfslol','vidsrctop','toustream'].includes(playerServer)) return playerServer;
    // Auto: for anime with AnimeKai available, prefer it; otherwise TMDB
    if (isAnime(item) && currentAnimekaiMalId) return 'animekai';
    // Auto: prefer TMDB (now Vidsrc) when an ID exists, otherwise fall back to Drive.
    return item.tmdbId ? 'tmdb' : 'drive';
}

// Ordered list used for automatic server fallback (TMDB-based sources only).
const SERVER_ORDER = ['tmdb', 'phantom', 'vidsrc', 'vidcore', 'videasy', 'superembed', 'twoembed', 'autoembed', 'smashystream', 'vidfast', 'vidlink', 'embedsu', 'nontongo', 'vidspark','vidrock','vidflix','vidlux','vidsrcme','vidsrcin','vidsrcio','vsembed','twoembedcc','embedsu2','vidfastvc','wfslol','vidsrctop','toustream','vidhawk','anixo','animekai', 'kisskh'];
let fallbackStart = null;
let fallbackTimer = null;
let fallbackLoaded = false;
let fallbackVideoSignal = false;
let _fallbackMsgHandler = null;
let _autoNextArmed = false;

// Clears any in-flight auto-fallback watchdog (called on server switch / new item).
function clearAutoFallback() {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    if (_fallbackMsgHandler) { window.removeEventListener('message', _fallbackMsgHandler); _fallbackMsgHandler = null; }
    fallbackStart = null;
    fallbackLoaded = false;
    fallbackVideoSignal = false;
    _autoNextArmed = false;
}

// Advance to the next TV episode when auto-play is enabled.
function _advanceToNextEpisode() {
    if (!playContext || playContext.type !== 'tv') return;
    if (settings.autoPlayNext === false) return;
    const item = playContext.item;
    if (!item) return;
    const curEp = playContext.episode || 1;
    const season = playContext.season || 1;
    const server = effectiveServerFor(item, 'tv');
    // For anime theater, get the total from _animeEpAll; otherwise use episodeCount or a big number.
    let total = 999;
    try { if (Array.isArray(_animeEpAll) && _animeEpAll.length) total = _animeEpAll.length; } catch {}
    if (!total || total < 999) total = item.episodeCount || item.episodes?.length || 999;
    const nextEp = curEp + 1;
    if (nextEp > total) { try { toast('Last episode'); } catch {} return; }
    try { toast(`Playing next: Episode ${nextEp}`, 'success'); } catch {}
    playTmdbEpisode(item, season, nextEp, server);
}

// Attach load/error + postMessage detection to the just-created iframe for a TMDB
// server so a broken source (loaded page but no video) advances to the next server.
// Also listens for "ended" signals to auto-play the next episode.
function armAutoFallback(frame, server) {
    const ifr = frame && frame.querySelector('iframe');
    if (!ifr || !playContext) return;
    clearAutoFallback();
    if (!fallbackStart) fallbackStart = server;
    fallbackLoaded = false;
    fallbackVideoSignal = false;
    _autoNextArmed = true;

    // --- postMessage listener: cancel fallback + detect video ended ---
    _fallbackMsgHandler = (e) => {
        if (!e.source || e.source !== ifr.contentWindow) return;
        // Any message from the embed iframe means the player is alive — cancel fallback.
        if (fallbackLoaded && fallbackTimer) {
            fallbackVideoSignal = true;
            clearTimeout(fallbackTimer); fallbackTimer = null;
        }
        // Detect video ended signal — auto-play next episode.
        if (_autoNextArmed && playContext && playContext.type === 'tv' && settings.autoPlayNext !== false) {
            try {
                const raw = typeof e.data === 'string' ? e.data : (e.data ? JSON.stringify(e.data) : '');
                if (/\b(ended|finish|complete|video_ended|onEnded)\b/i.test(raw)) {
                    _autoNextArmed = false; // prevent double-fire
                    _advanceToNextEpisode();
                }
            } catch {}
        }
    };
    window.addEventListener('message', _fallbackMsgHandler);

    // --- iframe load: page loaded, start the video-detection window ---
    const onLoad = () => {
        fallbackLoaded = true;
        // If a video signal already arrived before load, don't restart timer.
        if (fallbackVideoSignal) return;
        // Restart timer: give the embed 25s to emit a video signal.
        if (fallbackTimer) clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(() => {
            if (fallbackStart) tryAutoFallback(server);
        }, 25000);
    };
    ifr.removeEventListener('load', onLoad);
    ifr.addEventListener('load', onLoad);

    // Fires only when the iframe fails to load its document at all (dead source).
    ifr.addEventListener('error', () => { if (!fallbackLoaded) tryAutoFallback(server); });

    // Initial timer: if iframe never even loads within 25s, try next server.
    fallbackTimer = setTimeout(() => {
        if (fallbackStart) tryAutoFallback(server);
    }, 25000);
}

// Advance to the next TMDB server in the order. Stops once we've come full circle.
function tryAutoFallback(server) {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    if (!fallbackStart || !playContext) return;
    const idx = SERVER_ORDER.indexOf(server);
    if (idx === -1) return;
    const next = SERVER_ORDER[(idx + 1) % SERVER_ORDER.length];
    if (next === fallbackStart) { fallbackStart = null; fallbackLoaded = false; return; }
    toast(`"${server}" didn't load — trying ${next}...`);
    renderTmdbPlay(next);
}

// Map of server key -> iframe builder (movie/tv, season, episode).
const SERVER_IFRAME = {
    tmdb: vidsrcIframe,
    phantom: phantomIframe,
    vidsrc: vidsrcIframe,
    vidcore: vidcoreIframe,
    videasy: videasyIframe,
    superembed: superembedIframe,
    twoembed: twoembedIframe,
    autoembed: (tmdbId, type, season, episode) => {
        const pc = playContext?.item;
        if (pc && isAnime(pc)) {
            const itemKey = String(pc.id);
            const lang = currentAnimeLang === 'dub' ? 'dub' : 'sub';
            const src = storedAnimeSrc[itemKey] || (pc.anilistId || pc.anilist_id ? 'ani' : 'mal');
            const mid = currentAnimekaiMalId || pc.malId || pc.mal_id || pc.anilistId || pc.anilist_id || null;
            if (mid && /^\d+$/.test(String(mid))) return animekaiIframe(src, mid, type, episode || 1, lang);
            if (currentAnidbId) return anidbIframe(currentAnidbId, type, season, episode || 1, lang);
        }
        return autoembedIframe(tmdbId, type, season, episode);
    },
    smashystream: smashystreamIframe,
    vidfast: vidfastIframe,
    vidlink: vidlinkIframe,
    embedsu: embedsuIframe,
    nontongo: nontongoIframe,
    vidspark: vidsparkIframe,
    vidrock: vidrockIframe,
    vidflix: vidflixIframe,
    vidlux: vidluxIframe,
    vidsrcme: vidsrcmeIframe,
    vidsrcin: vidsrcinIframe,
    vidsrcio: vidsrcioIframe,
    vsembed: vsembedIframe,
    twoembedcc: twoembedccIframe,
    embedsu2: embedsuIframe2,
    vidfastvc: vidfastvcIframe2,
    wfslol: wfslolIframe2,
    vidsrctop: vidsrctopIframe2,
    toustream: toustreamIframe,
    vidhawk: (tmdbId, type, season, episode) => {
        const pc = playContext?.item;
        if (!pc || !isAnime(pc)) return vidsrcIframe(tmdbId, type, season, episode);
        const k = String(pc.id);
        const src = storedAnimeSrc[k] || (pc.anilistId || pc.anilist_id ? 'ani' : 'mal');
        const mid = currentAnimekaiMalId || pc.malId || pc.mal_id || pc.anilistId || pc.anilist_id || pc.anilistId || tmdbId;
        if (!mid || !/^\d+$/.test(String(mid))) return vidsrcIframe(tmdbId, type, season, episode);
        return vidhawkIframe2(src, mid, episode || 1, currentAnimeLang);
    },
    anixo: (tmdbId, type, season, episode) => {
        const pc = playContext?.item;
        if (!pc || !isAnime(pc)) return vidsrcIframe(tmdbId, type, season, episode);
        const k = String(pc.id);
        const aid = pc.anilistId || pc.anilist_id || storedAnimeIds[k] || currentAnimekaiMalId;
        if (!aid || !/^\d+$/.test(String(aid)) || storedAnimeSrc[k] === 'mal') {
            // anixo only supports AniList ids — fall back to megavid mal if we only have MAL
            const src2 = storedAnimeSrc[k] || (pc.anilistId ? 'ani' : 'mal');
            const mid2 = aid || pc.malId || tmdbId;
            return anixoIframe(mid2, episode || 1, currentAnimeLang);
        }
        return anixoIframe(aid, episode || 1, currentAnimeLang);
    },
    animekai: (tmdbId, type, season, episode) => {
        // megavid anime — uses the per-item MAL/AniList id; movies drop the episode segment
        const itemKey = playContext?.item ? String(playContext.item.id) : '';
        const src = storedAnimeSrc[itemKey] || (playContext?.item?.anilistId || playContext?.item?.anilist_id ? 'ani' : 'mal');
        const mid = currentAnimekaiMalId || (playContext?.item?.malId) || (playContext?.item?.anilistId) || tmdbId;
        return animekaiIframe(src, mid, type, episode || 1, currentAnimeLang);
    },
    kisskh: (tmdbId, type, season, episode) => {
        // kisskh embeds need a numeric episode id; those are resolved asynchronously per title in
        // renderKissKhPlay (any genre). If an id is already known on this item, build the embed here.
        const pc = playContext?.item;
        const known = (pc && (pc.kisskhId || pc.kisskh_ep || pc.episodeId)) || null;
        if (known && /^\d+$/.test(String(known))) return kisskhIframe(String(known), '#2ad4b8', false);
        return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:15px;">Resolving KissKH…</div>`;
    }
};

// Renders the correct TMDB-based iframe for the current play context on `server`.
function renderTmdbPlay(server) {
    const frame = document.getElementById('playerFrame');
    if (!frame || !playContext) return;
    const { item, type, episode, season } = playContext;
    if (server === 'kisskh') {
        renderKissKhPlay(item, type, season, episode);
        return;
    }
    // Drive-file servers (HD-20 shows the item's Google Drive file(s) directly).
    if (server === 'drive' || server === 'hd20') {
        if (type === 'movie') {
            const driveLink = convertDriveLink(item.driveLink);
            if (driveLink) {
                createCustomVideoPlayer(frame, driveLink, item.title, item.year ? `${item.year}` : '');
            } else {
                frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No Google Drive link on this server</div>`;
            }
        } else if (item.episodes && item.episodes.length > 0) {
            renderEpisodePlaylist(item);
            playEpisode(item, item.episodes[0], 0);
        } else {
            frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No uploaded episodes on Drive for this show</div>`;
        }
        return;
    }
    if (!item.tmdbId) return;
    const builder = SERVER_IFRAME[server] || vidsrcIframe;
    if (type === 'movie') {
        frame.innerHTML = builder(item.tmdbId, 'movie');
        armAutoFallback(frame, server);
        const ifr = frame.querySelector('iframe'); if (ifr) hardenCloudIframe(ifr);
    } else {
        const se = season || item.season || 1;
        const ep = episode || 1;
        frame.innerHTML = builder(item.tmdbId, 'tv', se, ep);
        armAutoFallback(frame, server);
        const ifr2 = frame.querySelector('iframe'); if (ifr2) hardenCloudIframe(ifr2);
    }
}

// KissKH player: resolves the correct kisskh episode id for the CURRENT title (all genres) and
// renders the megavid /kisskh/{id} embed. Falls back to showing a message if nothing matches and
// arms auto-fallback so a dead embed still advances to the next server.
async function renderKissKhPlay(item, type, season, episode) {
    const frame = document.getElementById('playerFrame');
    if (!frame) return;
    const ep = type === 'tv' ? (episode || 1) : 1;
    clearAutoFallback();
    frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;font-size:16px;">Searching KissKH for “${escapeHtml(item.title)}”…</div>`;
    let epId = null;
    try { epId = await resolveKissKhEpisodeId(item, ep, type); } catch (e) { epId = null; }
    if (!playContext || playContext.item !== item) return; // user switched items while resolving
    if (!epId) {
        frame.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#888;font-size:15px;padding:0 30px;text-align:center;color:#ffb6d8;">No KissKH playback found for “${escapeHtml(item.title)}”${item.year ? ` (${item.year})` : ''}.<br><span style="color:#888;font-size:13px;margin-top:6px;">Try another server, or paste a KissKH episode URL into this title’s details.</span></div>`;
        return;
    }
    if (!playContext || playContext.item !== item) return;
    const subTitle = document.getElementById('playerSubtitle');
    if (subTitle) subTitle.textContent = (type === 'tv' ? `Season ${season || 1} • Episode ${ep}` : item.title);
    frame.innerHTML = kisskhIframe(epId, '#2ad4b8', true, type === 'tv' ? ep : null);
    armAutoFallback(frame, 'kisskh');
    const ifr = frame.querySelector('iframe'); if (ifr) hardenCloudIframe(ifr);
}

function renderPlay() {
    const frame = document.getElementById('playerFrame');
    const subtitle = document.getElementById('playerSubtitle');
    const epSelector = document.getElementById('episodeSelector');
    if (!playContext) return;
    try { hidePopupShield(); } catch {}
    const { item, type } = playContext;
    // Anime + drama via megavid.buzz. Anime (ALL genres — action, romance, mecha, isekai, etc.)
    // plays through /mal/{mal-id}/{ep}/{sub|dub} or /ani/{anilist-id}/{ep}/{sub|dub} using the
    // per-item resolved id (so each show plays ITS OWN title, not the same one). Items that carry a
    // kisskh episode id (any genre — drama, K-show, movie, BL, anime) use /kisskh/{episode-id}.
    const isAnimeTitle = isAnime(item);
    if (isAnimeTitle) {
        const langSel = document.getElementById('animeLangSelector');
        if (langSel) langSel.style.display = 'flex';
        const ep = (type === 'tv' ? (playContext.episode || item.episode || 1) : 1);
        const season = playContext.season || item.season || 1;
        const itemKey = String(item.id);
        const kissId = item.kisskhId || item.kisskh_ep || item.episodeId || currentKissKhIds[itemKey] || null;
        const malId = item.malId || item.mal_id || item.anilistId || item.anilist_id || currentAnimekaiMalId || null;
        const langCheck = currentAnimeLang === 'dub' ? 'dub' : 'sub';
        // 1) megavid anime — pick /ani/ vs /mal/ from the resolved source (they're different id spaces).
        //    Uses the per-item cached source so each show's OWN correct id is used.
        //    When AutoEmbed/VidHawk/Anixo is selected, route through its builder so sub/dub toggle works on that server.
        if (!kissId && malId && /^\d+$/.test(String(malId))) {
            const srv = effectiveServerFor(item, type);
            const src = storedAnimeSrc[itemKey] || (item.anilistId || item.anilist_id ? 'ani' : 'mal');
            const base = src === 'ani' ? 'ani' : 'mal';
            if (srv === 'autoembed') {
                frame.innerHTML = SERVER_IFRAME.autoembed(item.tmdbId, type, season, ep);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • AutoEmbed ${base.toUpperCase()} (${malId})`;
            } else if (srv === 'vidhawk' || srv === 'anixo') {
                frame.innerHTML = SERVER_IFRAME[srv](item.tmdbId, type, season, ep);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • ${srv === 'vidhawk' ? 'VidHawk' : 'Anixo'} ${base.toUpperCase()} (${malId})`;
            } else {
                // megavid /mal/ and /ani/ endpoints — anime movies have NO episode segment
                frame.innerHTML = animekaiIframe(base, malId, type, ep, langCheck);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • megavid ${base.toUpperCase()} (${malId})`;
            }
            epSelector.style.display = type === 'tv' ? 'block' : 'none';
            if (type === 'tv' && item.tmdbId) renderTmdbEpisodes(item, 'tmdb');
            return;
        }
        // 2) KissKH episode id (dramas / Kshows) — the /kisskh/{id} endpoint
        if (kissId) {
            frame.innerHTML = kisskhIframe(kissId, '2ad4b8', true, type === 'tv' ? ep : null);
            subtitle.textContent = `${item.year || ''} • KissKH (${kissId})`;
            epSelector.style.display = type === 'tv' ? 'block' : 'none';
            if (type === 'tv' && item.tmdbId) renderTmdbEpisodes(item, 'tmdb');
            return;
        }
        if (currentAnidbId) {
            const srv2 = effectiveServerFor(item, type);
            if (srv2 === 'autoembed') {
                frame.innerHTML = SERVER_IFRAME.autoembed(item.tmdbId, type, season, ep);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • AutoEmbed AniDB (${currentAnidbId})`;
            } else if (srv2 === 'vidhawk' || srv2 === 'anixo') {
                frame.innerHTML = SERVER_IFRAME[srv2](item.tmdbId, type, season, ep);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • ${srv2 === 'vidhawk' ? 'VidHawk' : 'Anixo'} AniDB (${currentAnidbId})`;
            } else {
                frame.innerHTML = anidbIframe(currentAnidbId, type, season, ep, langCheck);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • AniDB`;
            }
            epSelector.style.display = type === 'tv' ? 'block' : 'none';
            if (type === 'tv' && item.tmdbId) renderTmdbEpisodes(item, 'tmdb');
            return;
        }
    }
    const langSel2 = document.getElementById('animeLangSelector');
    if (langSel2) langSel2.style.display = isAnimeTitle ? 'flex' : 'none';
    const server = effectiveServerFor(item, type);
    frame.innerHTML = '';
    serverBtnActive();

    const isTmdbServer = !!SERVER_IFRAME[server];
    if (type === 'movie') {
        subtitle.textContent = (item.year ? item.year + '  ' : '') + (genArr(item.genre).join(', ') || '');
        epSelector.style.display = 'none';
        if (server === 'kisskh' || (isTmdbServer && item.tmdbId)) {
            renderTmdbPlay(server);
        } else if (['drive', 'hd20'].includes(server) || (server === 'auto' && !item.tmdbId)) {
            const driveLink = convertDriveLink(item.driveLink);
            if (driveLink) {
                createCustomVideoPlayer(frame, driveLink, item.title, item.year ? `${item.year}` : '');
            } else {
                frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No Google Drive link on this server</div>`;
            }
        } else {
            frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No video source on this server</div>`;
        }
    } else if (type === 'tv') {
        subtitle.textContent = `Season ${item.season || 1}`;
        if (server === 'kisskh') {
            epSelector.style.display = 'block';
            if (item.tmdbId) renderTmdbEpisodes(item, server);
            playTmdbEpisode(item, item.season || 1, 1, server);
        } else if (isTmdbServer && item.tmdbId) {
            epSelector.style.display = 'block';
            renderTmdbEpisodes(item, server);
            playTmdbEpisode(item, item.season || 1, 1, server);
        } else if (['drive', 'hd20'].includes(server) && item.episodes && item.episodes.length > 0) {
            epSelector.style.display = 'block';
            renderEpisodePlaylist(item);
            playEpisode(item, item.episodes[0], 0);
        } else {
            epSelector.style.display = 'none';
            frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">${['drive', 'hd20'].includes(server) ? 'No uploaded episodes on Drive for this show' : 'No episodes available on this server'}</div>`;
        }
    }
}

function playItem(item, type) {
    const modal = document.getElementById('playerModal');
    const frame = document.getElementById('playerFrame');
    const title = document.getElementById('playerTitle');
    const epSelector = document.getElementById('episodeSelector');
    if (epSelector) epSelector.classList.remove('collapsed');
    clearAutoFallback();
    try { hidePopupShield(); } catch {}
    title.textContent = item.title;
    frame.innerHTML = '';
    playContext = { item, type };
    try { if (isAnime(item)) { enterAnimeTheater(item); } else { exitAnimeTheater(); } } catch {}
    try { wireAnimeTheaterOnce(); } catch {}
    // anime only: show sub/dub toggle and resolve anidb + animekai ids
    const langSel = document.getElementById('animeLangSelector');
    const animekaiOpt = document.getElementById('serverOptAnimekai');
    if (isAnime(item)) {
        if (langSel) {
            langSel.style.display = 'flex';
            document.querySelectorAll('.lang-btn').forEach(b => {
                const isActive = b.dataset.lang === currentAnimeLang;
                b.classList.toggle('active', isActive);
                if (isActive) { b.style.background = '#ffb6d8'; b.style.color = '#000'; b.style.border = 'none'; }
                else { b.style.background = 'rgba(255,255,255,0.08)'; b.style.color = '#fff'; b.style.border = '1px solid rgba(255,255,255,0.12)'; }
            });
        }
        if (animekaiOpt) animekaiOpt.style.display = '';
        const vidhawkOpt = document.getElementById('serverOptVidhawk');
        const anixoOpt = document.getElementById('serverOptAnixo');
        if (vidhawkOpt) vidhawkOpt.style.display = '';
        if (anixoOpt) anixoOpt.style.display = '';
        currentAnidbId = null;
        currentAnimekaiMalId = null;
        currentAnimekaiSlug = item.animekaiSlug || item.slug || null;
        const altTitles = [item.title_english, item.title_japanese, ...(item.title_synonyms||[])].filter(Boolean);
        const itemKey = String(item.id);
        const year = item.year || '';
        const ttype = item.type || type || '';
        // 1) each anime resolves to its OWN MAL / AniList id (keyed per item) so the /mal/ & /ani/
        //    endpoints play the RIGHT show, not the same one every time. If the item already carries
        //    an id (from Tenrai/Jikan/AniList), use it directly — no search needed.
        const preAni = item.anilistId || item.anilist_id || null;
        const preMal = item.malId || item.mal_id || storedAnimeIds[itemKey] || null;
        if (preAni) {
            currentAnimekaiMalId = String(preAni);
            storedAnimeSrc[itemKey] = 'ani';
        } else if (preMal) {
            currentAnimekaiMalId = String(preMal);
            storedAnimeSrc[itemKey] = 'mal';
        } else if (!itemKey.startsWith('ak_')) {
            // Scan TMDB for IMDb id then resolve the correct MAL/AniList entry — preview-safe with catch to avoid unhandled rejection.
            (async () => {
                try {
                    let imdbId = item.imdbId || item.imdb_id || '';
                    const useTmdb = item.tmdbId && !imdbId;
                    if (useTmdb) {
                        try { imdbId = (await fetchImdbIdFromTmdb(item.tmdbId, ttype)) || ''; } catch {}
                    }
                    let tmdbTitle = item.title;
                    if (useTmdb) { try { const td = await tmdbJson(`/${ttype}/${encodeURIComponent(item.tmdbId)}`); if (td) { tmdbTitle = td.title || td.name || tmdbTitle; if (td.original_title || td.original_name) altTitles.push(td.original_title || td.original_name); } } catch {} }
                    const res = await fetchAnimekaiMalId(tmdbTitle, altTitles, year, ttype, imdbId);
                    if (res && playContext && playContext.item && String(playContext.item.id) === itemKey) {
                        currentAnimekaiMalId = res.id;
                        storedAnimeIds[itemKey] = res.id;
                        storedAnimeSrc[itemKey] = res.src || 'mal';
                        if (imdbId) item.imdbId = imdbId;
                        try { renderPlay(); } catch {}
                    }
                } catch (e) { console.warn('fetchAnimekaiMalId failed', e); }
            })().catch(() => {});
        } else {
            currentAnimekaiMalId = String(item.id);
        }
        // 2) KissKH path: use a known/pasted episode id if provided, otherwise resolve via the
        //    KissKH search API (any genre) keyed per item — the megavid endpoint needs a numeric id.
        if (item.kisskhId || item.kisskh_ep || item.episodeId) {
            currentKissKhIds[itemKey] = String(item.kisskhId || item.kisskh_ep || item.episodeId);
        } else {
            fetchKissKhId(item.title, year, item.kisskhUrl || item.url || item.Url).then(id => {
                if (id) {
                    currentKissKhIds[itemKey] = String(id);
                    if (playContext && playContext.item && String(playContext.item.id) === itemKey) renderPlay();
                }
            });
        }
    } else {
        if (langSel) langSel.style.display = 'none';
        if (animekaiOpt) animekaiOpt.style.display = 'none';
        const vidhawkOpt2 = document.getElementById('serverOptVidhawk');
        const anixoOpt2 = document.getElementById('serverOptAnixo');
        if (vidhawkOpt2) vidhawkOpt2.style.display = 'none';
        if (anixoOpt2) anixoOpt2.style.display = 'none';
        if (['animekai','vidhawk','anixo'].includes(playerServer)) { playerServer = 'tmdb'; settings.playerServer = playerServer; try { saveData(); } catch {} }
        currentAnidbId = null;
        currentAnimekaiMalId = null;
    }
    renderPlay();
    modal.classList.add('active');
}

// Server switcher in the player modal (change event on dropdown).
document.addEventListener('change', (e) => {
    const sel = e.target.closest('#serverSelect');
    if (!sel || !playContext) return;
    clearAutoFallback();
    playerServer = sel.value;
    settings.playerServer = playerServer;
    saveData();
    renderPlay();
});
// Mark the given episode as the active one in the episode sidebar.
function setActiveEpisode(season, episode, list) {
    list.querySelectorAll('.ep-play-item').forEach(el =>
        el.classList.toggle('active', String(el.dataset.season) === String(season) && String(el.dataset.episode) === String(episode)));
}

// TMDB-powered TV episode layout: Season dropdown, episode search, and wide preview cards.
async function renderTmdbEpisodes(tvItem, server) {
    const list = document.getElementById('episodePlaylist');
    const loading = document.getElementById('episodeLoading');
    const errEl = document.getElementById('episodeError');
    const dropdown = document.getElementById('seasonDropdown');
    const seasonTabs = document.getElementById('seasonTabs');
    const summary = document.getElementById('episodesSummary');
    const searchInput = document.getElementById('episodeSearchInput');

    if (loading) loading.style.display = '';
    if (errEl) errEl.style.display = 'none';
    if (list) list.innerHTML = '';

    const tmdbId = tvItem && tvItem.tmdbId;
    if (!tmdbId) {
        if (loading) loading.style.display = 'none';
        if (errEl) { errEl.textContent = 'No TMDB ID available for this show.'; errEl.style.display = ''; }
        return;
    }

    try {
        await tmdbEnsureConfig();
        const detail = await tmdbJson(`/tv/${encodeURIComponent(tmdbId)}`);
        const seasons = (detail.seasons || [])
            .filter(s => s && s.season_number >= 0 && s.episode_count > 0)
            .map(s => s.season_number);

        if (!seasons.length) { if (loading) loading.style.display = 'none'; return; }

        // Fetch all seasons in parallel.
        const seasonInfos = await Promise.all(seasons.map(async sn => ({
            sn,
            eps: (await tmdbJson(`/tv/${encodeURIComponent(tmdbId)}/season/${sn}`)).episodes || []
        })));

        // Populate Season Dropdown
        if (dropdown) {
            dropdown.innerHTML = seasonInfos.map(({ sn }) => {
                const label = sn === 0 ? 'Specials' : `Season ${sn}`;
                return `<option value="${sn}">${label}</option>`;
            }).join('');
        }

        const seasonLabel = (sn) => sn === 0 ? 'Specials' : `Season ${sn}`;
        if (summary) {
            const totalEpisodes = seasonInfos.reduce((total, season) => total + season.eps.length, 0);
            summary.textContent = `${seasonInfos.length} seasons · ${totalEpisodes} episodes`;
        }
        if (seasonTabs) {
            seasonTabs.innerHTML = seasonInfos.map(({ sn, eps }) => `
                <button type="button" class="season-tab" role="tab" aria-selected="false" data-season="${sn}">
                    <span>${seasonLabel(sn)}</span><small>${eps.length}</small>
                </button>
            `).join('');
        }

        let currentSelectedSeason = seasons[0];
        if (playContext && playContext.season !== undefined) {
            currentSelectedSeason = playContext.season;
            if (dropdown) dropdown.value = currentSelectedSeason;
        }

        const syncSeasonControls = () => {
            if (dropdown) dropdown.value = String(currentSelectedSeason);
            if (seasonTabs) seasonTabs.querySelectorAll('.season-tab').forEach(tab => {
                const active = String(tab.dataset.season) === String(currentSelectedSeason);
                tab.classList.toggle('active', active);
                tab.setAttribute('aria-selected', String(active));
            });
        };

        const renderCurrentSeasonEpisodes = (filterText = '') => {
            if (!list) return;
            list.innerHTML = '';
            const found = seasonInfos.find(s => String(s.sn) === String(currentSelectedSeason)) || seasonInfos[0];
            if (!found) return;

            const filteredEps = found.eps.filter(ep => {
                if (!filterText) return true;
                const q = filterText.toLowerCase();
                const nameMatch = (ep.name || '').toLowerCase().includes(q);
                const numMatch = String(ep.episode_number).includes(q);
                const overviewMatch = (ep.overview || '').toLowerCase().includes(q);
                return nameMatch || numMatch || overviewMatch;
            });

            if (!filteredEps.length) {
                list.innerHTML = `<div style="text-align:center;color:#888;padding:30px;font-size:14px;">No episodes found</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            filteredEps.forEach(ep => {
                const card = document.createElement('div');
                card.className = 'cineby-ep-card';
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');
                card.dataset.season = found.sn;
                card.dataset.episode = ep.episode_number;

                const stillPath = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : (tvItem.backdrop || tvItem.poster || '');
                const epTitle = ep.name || `Episode ${ep.episode_number}`;
                const runtime = ep.runtime ? `${ep.runtime} min` : '';
                const overview = ep.overview ? ep.overview : 'No description available for this episode.';
                const meta = [ep.air_date, runtime].filter(Boolean).join('  •  ');
                card.setAttribute('aria-label', `Play episode ${ep.episode_number}: ${epTitle}`);

                card.innerHTML = `
                    <div class="cineby-ep-thumb-wrapper">
                        <img class="cineby-ep-img" src="${escapeHtml(stillPath)}" alt="${escapeHtml(epTitle)}" loading="lazy">
                        <div class="cineby-ep-play-overlay">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="white"><path d="M480-320q75 0 127.5-52.5T660-500t-52.5-127.5T480-680t-127.5 52.5T300-500t52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500t31.5-76.5T480-608t76.5 31.5T588-500t-31.5 76.5T480-392Zm0-80Z"/></svg>
                        </div>
                    </div>
                    <div class="cineby-ep-info">
                        <div class="cineby-ep-title-row"><span class="cineby-ep-number">E${ep.episode_number}</span><h4 class="cineby-ep-title">${escapeHtml(epTitle)}</h4></div>
                        <span class="cineby-ep-meta">${escapeHtml(meta)}</span>
                        <p class="cineby-ep-desc">${escapeHtml(overview)}</p>
                        <button type="button" class="cineby-show-more" aria-expanded="false">Show more</button>
                    </div>
                `;

                if (playContext && String(playContext.season) === String(found.sn) && String(playContext.episode) === String(ep.episode_number)) {
                    card.classList.add('active');
                }

                const showMore = card.querySelector('.cineby-show-more');
                if (showMore) {
                    showMore.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const expanded = card.classList.toggle('description-expanded');
                        showMore.textContent = expanded ? 'Show less' : 'Show more';
                        showMore.setAttribute('aria-expanded', String(expanded));
                    });
                }

                card.onclick = () => {
                    list.querySelectorAll('.cineby-ep-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    playTmdbEpisode(tvItem, found.sn, ep.episode_number, server);
                };
                card.onkeydown = (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        card.click();
                    }
                };

                fragment.appendChild(card);
            });
            list.appendChild(fragment);
        };

        syncSeasonControls();
        renderCurrentSeasonEpisodes();

        if (dropdown) {
            dropdown.onchange = (e) => {
                currentSelectedSeason = e.target.value;
                if (searchInput) searchInput.value = '';
                syncSeasonControls();
                renderCurrentSeasonEpisodes();
            };
        }

        if (seasonTabs) {
            seasonTabs.querySelectorAll('.season-tab').forEach(tab => {
                tab.onclick = () => {
                    currentSelectedSeason = tab.dataset.season;
                    if (searchInput) searchInput.value = '';
                    syncSeasonControls();
                    renderCurrentSeasonEpisodes();
                    tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                };
            });
        }

        if (searchInput) {
            searchInput.oninput = (e) => {
                renderCurrentSeasonEpisodes(e.target.value);
            };
        }

    } catch (e) {
        if (errEl) { errEl.textContent = 'Could not load episodes: ' + (e.message || e); errEl.style.display = ''; }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// Play a specific season + episode on the given TMDB server.
function playTmdbEpisode(tvItem, season, episode, server) {
    const frame = document.getElementById('playerFrame');
    const title = document.getElementById('playerTitle');
    const subtitle = document.getElementById('playerSubtitle');
    clearAutoFallback();
    title.textContent = tvItem.title;
    const isMovie = (playContext && playContext.type === 'movie') || tvItem.type === 'movie' || (tvItem.media_type === 'movie');
    if (isMovie) {
        subtitle.textContent = tvItem.title;
        playContext = { item: tvItem, type: 'movie', season: 1, episode: 1 };
    } else {
        subtitle.textContent = `Season ${season || 1} • Episode ${episode}`;
        playContext = { item: tvItem, type: 'tv', season: season || 1, episode };
    }
    try{ if(isAnime(tvItem)){ renderAnimeTheaterBreadcrumb(tvItem); updateAnimePrevNextState(); setTimeout(()=>{ try{renderAnimeEpisodeListDOM();}catch{} }, 80); } }catch{}
    renderTmdbPlay(server);
}

function renderEpisodePlaylist(tvItem) {
    const list = document.getElementById('episodePlaylist');
    list.innerHTML = '';
    tvItem.episodes.forEach((ep, i) => {
        const div = document.createElement('div');
        div.className = 'ep-play-item' + (i === 0 ? ' active' : '');
        div.innerHTML = `
            <div class="ep-num">${i + 1}</div>
            <div class="ep-info">
                <div class="ep-title">${escapeHtml(ep.name)}</div>
                <div class="ep-size">${ep.size ? formatSize(ep.size) : (ep.driveLink ? 'Google Drive' : '')}</div>
            </div>
        `;
        div.onclick = () => {
            list.querySelectorAll('.ep-play-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            playEpisode(tvItem, ep, i);
        };
        list.appendChild(div);
    });
}

function playEpisode(tvItem, episode, index) {
    const frame = document.getElementById('playerFrame');
    const title = document.getElementById('playerTitle');
    const subtitle = document.getElementById('playerSubtitle');
    title.textContent = tvItem.title;
    subtitle.textContent = `Season ${tvItem.season || 1} • Episode ${index + 1} - ${episode.name}`;
    // Keep playContext in sync for auto-play next
    playContext = { item: tvItem, type: 'tv', season: tvItem.season || 1, episode: index + 1 };
    frame.innerHTML = '';

    if (episode.blobUrl) {
        createCustomVideoPlayer(frame, episode.blobUrl, tvItem.title, `Season ${tvItem.season || 1} • Episode ${index + 1} - ${episode.name}`);
        const vid = frame.querySelector('video');
        if (vid) {
            vid.addEventListener('ended', () => {
                if (settings.autoPlayNext === false) return;
                const nextIdx = index + 1;
                if (nextIdx < tvItem.episodes.length) {
                    try { toast(`Playing next: Episode ${nextIdx + 1}`, 'success'); } catch {}
                    const nextEp = tvItem.episodes[nextIdx];
                    // update active state
                    document.querySelectorAll('#episodePlaylist .ep-play-item').forEach((el,i)=> el.classList.toggle('active', i===nextIdx));
                    playEpisode(tvItem, nextEp, nextIdx);
                }
            });
        }
    } else if (episode.driveLink) {
        const driveLink = convertDriveLink(episode.driveLink);
        createCustomVideoPlayer(frame, driveLink, tvItem.title, `Season ${tvItem.season || 1} • Episode ${index + 1} - ${episode.name}`);
    } else if (episode.url) {
        const driveLink = convertDriveLink(episode.url);
        createCustomVideoPlayer(frame, driveLink, tvItem.title, `Season ${tvItem.season || 1} • Episode ${index + 1} - ${episode.name}`);
    } else {
        frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No video source</div>`;
    }
    // highlight active in playlist
    setTimeout(()=> setActiveEpisode(tvItem.season || 1, index + 1, document.getElementById('episodePlaylist')), 80);
    try{ if(isAnime(tvItem)){ renderAnimeTheaterBreadcrumb(tvItem); updateAnimePrevNextState(); setTimeout(()=>{ try{renderAnimeEpisodeListDOM();}catch{} }, 80); } }catch{}
}
// Auto-play next toggle — sync with settings and re-render current TV episode when toggled
(function(){
    const init = () => {
        const t = document.getElementById('autoPlayNextToggle');
        if (!t) return;
        t.checked = settings.autoPlayNext !== false;
        t.addEventListener('change', (e)=>{
            settings.autoPlayNext = e.target.checked;
            try { localStorage.setItem('sf_settings', JSON.stringify(settings)); } catch {}
            if (playContext && playContext.type === 'tv' && playContext.item && playContext.item.tmdbId) {
                const s = playContext.season || playContext.item.season || 1;
                const ep = playContext.episode || 1;
                const server = effectiveServerFor(playContext.item, 'tv');
                try { playTmdbEpisode(playContext.item, s, ep, server); } catch {}
            }
            try { toast(`Auto-play next ${settings.autoPlayNext ? 'enabled' : 'disabled'}`, 'success'); } catch {}
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.updateAutoPlayNextUI = () => {
        const el = document.getElementById('autoPlayNextToggle');
        if (el) el.checked = settings.autoPlayNext !== false;
    };
})();

// ==================== INFO MODAL ====================
function showInfo(item, type) {
    type = (type === 'movie' || type === 'tv') ? type : (item.type || 'movie');
    const sourceItem = resolveSourceItem(item, type);
    currentInfoItem = sourceItem;
    currentInfoType = type;
    const modal = document.getElementById('infoModal');
    const backdrop = document.getElementById('infoBackdrop');
    const inList = myList.some(m => m.id === item.id);
    const bgUrl = hiRes(item.backdrop || item.poster);
    const gArr = genArr(item.genre);
    if (bgUrl) {
        backdrop.style.backgroundImage = `url("${escapeHtml(bgUrl)}")`;
        backdrop.innerHTML = '';
    } else {
        backdrop.style.backgroundImage = 'none';
        backdrop.textContent = defaultPosters[gArr[0]] || '🎬';
    }
    const infoTitleEl = document.getElementById('infoTitle');
    const infoLogo = document.getElementById('infoLogo');
    if (item.logo) {
        infoLogo.src = item.logo;
        infoLogo.style.display = 'block';
        infoTitleEl.textContent = item.title;
        infoTitleEl.classList.remove('show');
    } else {
        infoLogo.removeAttribute('src');
        infoLogo.style.display = 'none';
        infoTitleEl.textContent = item.title;
        infoTitleEl.classList.add('show');
        // Search results / freshly added items may not have their brand logo yet — fetch
        // it in the background and reveal it in this modal when it arrives.
        if (item && item.tmdbId) {
            fetchItemLogo(item).then(() => {
                if (!item.logo) return;
                const cur = document.getElementById('infoLogo');
                const curTitle = document.getElementById('infoTitle');
                if (cur && currentInfoItem && currentInfoItem.id === item.id) {
                    cur.src = item.logo;
                    cur.style.display = 'block';
                    if (curTitle) { curTitle.classList.remove('show'); curTitle.textContent = item.title; }
                }
            }).catch(() => {});
        }
    }
    document.getElementById('infoYear').textContent = item.year || '';
    // runtime - use stored runtime or fallback 1h 43m like reference
    const rtRaw = item.runtime ?? item.duration ?? item.runtimeMinutes ?? null;
    let rtDisplay = '1h 43m';
    let rtMinutes = 103;
    const parseRt = (v) => {
        if (v == null || v === '') return null;
        if (typeof v === 'number' && !isNaN(v)) return v;
        const s = String(v).toLowerCase().trim();
        if (/^\d+$/.test(s)) return parseInt(s, 10);
        let m = 0;
        const h = s.match(/(\d+)\s*h/);
        const mm = s.match(/(\d+)\s*m/);
        if (h) m += parseInt(h[1], 10) * 60;
        if (mm) m += parseInt(mm[1], 10);
        if (m) return m;
        const n = parseInt(s, 10);
        return isNaN(n) ? null : n;
    };
    const fmtMin = (mins) => {
        if (mins == null || isNaN(mins)) return null;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h && m) return `${h}h ${m}m`;
        if (h) return `${h}h`;
        return `${m}m`;
    };
    if (rtRaw != null && String(rtRaw).trim() !== '') {
        const parsed = parseRt(rtRaw);
        if (parsed != null) {
            rtMinutes = parsed;
            rtDisplay = fmtMin(parsed) || String(rtRaw);
        } else {
            rtDisplay = String(rtRaw);
            rtMinutes = parseRt(rtDisplay) ?? 103;
        }
    }
    const rtEl = document.getElementById('infoRuntime');
    const rt2El = document.getElementById('infoRuntime2');
    if (rtEl) rtEl.textContent = rtDisplay;
    if (rt2El) {
        try {
            const end = new Date();
            end.setMinutes(end.getMinutes() + rtMinutes);
            const endsAt = end.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
            rt2El.textContent = `${rtDisplay} · Ends ${endsAt}`;
        } catch { rt2El.textContent = rtDisplay; }
    }
    document.getElementById('infoRating').innerHTML = item.rating ? `<svg style="display: inline-block; vertical-align: -0.15em; margin-right: 3px;" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#000000"><path d="m384-334 96-74 96 74-36-122 90-64H518l-38-124-38 124H330l90 64-36 122ZM233-120l93-304L80-600h304l96-320 96 320h304L634-424l93 304-247-188-247 188Zm247-369Z"/></svg>` + item.rating : '';
    const infoCertEl = document.getElementById('infoCert');
    if (infoCertEl) { infoCertEl.textContent = item.certification || 'PG'; infoCertEl.style.display = 'inline-flex'; }
    // genres as dot separated • like reference
    const genreEl = document.getElementById('infoGenre');
    if (genreEl) {
        genreEl.innerHTML = gArr.length ? gArr.map(g => `<span>${g.charAt(0).toUpperCase()+g.slice(1)}</span>`).join(' <span style="opacity:0.5">•</span> ') : '';
    }
    // director
    const dirEl = document.getElementById('infoDirector');
    if (dirEl) {
        const dir = item.director || item.creator || '';
        if (dir) { dirEl.innerHTML = `Director: <span>${escapeHtml(dir)}</span>`; dirEl.style.display = ''; } else { dirEl.style.display = 'none'; }
    }
    // status card
    const statusEl = document.getElementById('infoStatus');
    if (statusEl) {
        const yr = parseInt(item.year) || 0;
        statusEl.textContent = (yr && yr > new Date().getFullYear()) ? 'Upcoming' : 'Released';
    }
    const langEl = document.getElementById('infoLanguage');
    if (langEl) langEl.textContent = (item.language || 'EN').toUpperCase().slice(0,2);
    const relEl = document.getElementById('infoReleased');
    if (relEl) {
        if (item.releaseDate) relEl.textContent = item.releaseDate;
        else if (item.year) relEl.textContent = `Aug 28, ${item.year}`;
        else relEl.textContent = 'Aug 28, 2026';
    }
    // external ratings - derive from item.rating
    const imdbEl = document.getElementById('infoImdb');
    if (imdbEl) imdbEl.textContent = item.rating ? (Number(item.rating).toFixed(1) + '/10') : '7.7/10';
    const rt1El = document.getElementById('infoRt1');
    if (rt1El) rt1El.textContent = item.rating ? Math.round(Number(item.rating)*10+2) + '%' : '96%';
    const rt2El2 = document.getElementById('infoRt2');
    if (rt2El2) rt2El2.textContent = item.rating ? Math.round(Number(item.rating)*10) + '%' : '94%';
    document.getElementById('infoDesc').textContent = item.description || 'No description available.';
    document.getElementById('infoPlayBtn').onclick = () => { modal.classList.remove('active'); playItem(sourceItem, type); };
    document.getElementById('infoListBtn').innerHTML = inList ? '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>';
    document.getElementById('infoListBtn').title = inList ? 'Remove from My List' : 'Add to My List';
    document.getElementById('infoListBtn').onclick = () => { toggleMyList(sourceItem, type); showInfo(sourceItem, type); };
    document.getElementById('infoEditBtn').onclick = () => { modal.classList.remove('active'); openEdit(sourceItem, type); };
    const dlBtn = document.getElementById('infoDownloadBtn');
    if (dlBtn) dlBtn.onclick = () => {
        const url = sourceItem.driveLink ? convertDriveLink(sourceItem.driveLink) : (sourceItem.poster || sourceItem.backdrop || '');
        if (!url) { toast('No download available for this title', 'error'); return; }
        if (sourceItem.driveLink) {
            window.open(url, '_blank');
            toast('Opening download...', 'success');
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = (sourceItem.title || 'download').replace(/[^a-z0-9]/gi,'_') + '.jpg';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast('Downloading poster...', 'success');
        }
    };
    document.getElementById('infoDeleteBtn').onclick = () => {
        if (confirm(`Remove "${item.title}" from your library?`)) {
            if (type === 'movie') movies = movies.filter(m => m.id !== item.id);
            else tvShows = tvShows.filter(m => m.id !== item.id);
            myList = myList.filter(m => m.id !== item.id);
            saveData(); refreshCurrent(); modal.classList.remove('active');
            toast(`Removed "${item.title}"`);
        }
    };
    modal.classList.add('active');
}

// ==================== EDIT CONTENT ====================
let editTarget = null;
let editType = null;

function openEdit(item, type) {
    editTarget = item;
    editType = (type === 'movie' || type === 'tv') ? type : (item.type || 'movie');
    const ctn = document.getElementById('editFormContainer');
    const isMovie = editType === 'movie';
    document.getElementById('editModalTitle').textContent = isMovie ? 'Edit Movie' : 'Edit TV Show';

    const g = genArr(item.genre);
    let episodesHTML = '';
    if (!isMovie && item.episodes && item.episodes.length) {
        episodesHTML = item.episodes.map((ep, i) => `
            <div class="edit-ep-row">
                <input type="text" class="edit-ep-name" value="${escapeHtml(ep.name)}" data-i="${i}" placeholder="Episode name">
                <input type="url" class="edit-ep-src" value="${escapeHtml(ep.driveLink || ep.url || '')}" data-i="${i}" placeholder="Drive link or URL">
            </div>`).join('');
    }

    ctn.innerHTML = `
        <form id="editForm">
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="editTitle" value="${escapeHtml(item.title)}" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="editDesc" rows="3">${escapeHtml(item.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Genres</label>
                <div class="genre-options" id="editGenreOptions"></div>
            </div>
            <div class="form-group">
                <label>Year</label>
                <input type="number" id="editYear" min="1900" max="2030" value="${item.year || ''}">
            </div>
            <div class="form-group">
                <label>Rating (1-10)</label>
                <input type="number" id="editRating" min="1" max="10" step="0.1" value="${item.rating || ''}">
            </div>
            <div class="form-group">
                <label for="editPoster">Poster URL</label>
                <input type="url" id="editPoster" value="${escapeHtml(item.poster || '')}">
            </div>
            <div class="form-group">
                <label for="editBackdrop">Backdrop URL</label>
                <input type="url" id="editBackdrop" value="${escapeHtml(item.backdrop || '')}">
            </div>
            <input type="hidden" id="editCertification" value="${escapeHtml(item.certification || '')}">
            ${isMovie ? `
            <div class="form-group">
                <label for="editLogo">Movie Logo URL</label>
                <input type="url" id="editLogo" placeholder="https://example.com/logo.png" value="${escapeHtml(item.logo || '')}">
                <small class="help-text">Logo image shown on top of the movie title in the info modal.</small>
            </div>
            <div class="form-group">
                <label for="editTmdbId">TMDB ID (optional)</label>
                <input type="text" id="editTmdbId" placeholder="27205" value="${escapeHtml(item.tmdbId || '')}">
                <button type="button" class="btn-tmdb" id="editFetchTmdb">Load from TMDB</button>
                <small class="help-text">Playback via a TMDB-powered player. If filled, Play uses this; otherwise it uses the Drive link below.</small>
            </div>
            <div class="form-group">
                <label for="editDriveLink">Google Drive Link</label>
                <input type="url" id="editDriveLink" value="${escapeHtml(item.driveLink || '')}">
            </div>` : `
            <div class="form-group">
                <label>Season Number</label>
                <input type="number" id="editSeason" min="1" value="${item.season || 1}">
            </div>
            <div class="form-group">
                <label for="editTmdbId">TMDB ID (optional)</label>
                <input type="text" id="editTmdbId" placeholder="1396" value="${escapeHtml(item.tmdbId || '')}">
                <button type="button" class="btn-tmdb" id="editFetchTmdb">Load from TMDB</button>
                <small class="help-text">Playback via a TMDB-powered player. If filled, Play uses this; otherwise it uses the episode sources below.</small>
            </div>
            <div class="form-group">
                <label for="editLogo">Logo URL</label>
                <input type="url" id="editLogo" placeholder="https://example.com/logo.png" value="${escapeHtml(item.logo || '')}">
                <small class="help-text">Logo image shown on top of the TV show title in the info modal and hero banner.</small>
            </div>
            ${episodesHTML ? `<div class="form-group"><label>Episodes (Google Drive links or URLs)</label>${episodesHTML}</div>` : ''}
            `}
            <button type="submit" class="btn-submit">Save Changes</button>
        </form>
    `;

    // Build genre chips
    GENRES.forEach(genre => {
        const label = document.createElement('label');
        label.className = 'genre-chip';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = genre;
        cb.checked = g.includes(genre);
        const span = document.createElement('span');
        span.textContent = genre.charAt(0).toUpperCase() + genre.slice(1);
        label.appendChild(cb);
        label.appendChild(span);
        document.getElementById('editGenreOptions').appendChild(label);
    });

    document.getElementById('editForm').addEventListener('submit', saveEdit);
    const editFetchBtn = document.getElementById('editFetchTmdb');
    if (editFetchBtn) editFetchBtn.onclick = () => loadTmdbInto(editFetchBtn, isMovie ? 'editMovie' : 'editTv');
    document.getElementById('editModal').classList.add('active');
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Upgrade a TMDB image URL to its highest available resolution so banners and
// hero images stay crisp instead of looking blurry when stretched full-width.
function hiRes(url) {
    if (!url) return url;
    return String(url)
        .replace(/\/t\/p\/w45\//i, '/t/p/w500/')
        .replace(/\/t\/p\/w92\//i, '/t/p/w500/')
        .replace(/\/t\/p\/w154\//i, '/t/p/w500/')
        .replace(/\/t\/p\/w185\//i, '/t/p/w500/')
        .replace(/\/t\/p\/w342\//i, '/t/p/w780/')
        .replace(/\/t\/p\/w500\//i, '/t/p/w1280/')
        .replace(/\/t\/p\/w780\//i, '/t/p/w1280/')
        .replace(/\/t\/p\/w1280\//i, '/t/p/original/')
        .replace(/\/t\/p\/original\//i, '/t/p/original/');
}

function resolveSourceItem(item, type) {
    const t = (type === 'movie' || type === 'tv') ? type : (item.type || 'movie');
    const arr = t === 'movie' ? movies : tvShows;
    return arr.find(x => x.id === item.id) || item;
}

function saveEdit(e) {
    e.preventDefault();
    if (!editTarget) return;
    const target = resolveSourceItem(editTarget, editType);
    const g = Array.from(document.querySelectorAll('#editGenreOptions input[type=checkbox]:checked')).map(cb => cb.value);

    target.title = document.getElementById('editTitle').value.trim();
    target.description = document.getElementById('editDesc').value.trim();
    target.genre = g;
    target.year = document.getElementById('editYear').value;
    target.rating = document.getElementById('editRating').value;
    target.poster = document.getElementById('editPoster').value.trim();
    target.backdrop = document.getElementById('editBackdrop').value.trim();
    target.certification = document.getElementById('editCertification').value.trim();

    if (editType === 'movie') {
        const editLogoEl = document.getElementById('editLogo');
        target.logo = editLogoEl ? editLogoEl.value.trim() : '';
        const tmdbEl = document.getElementById('editTmdbId');
        target.tmdbId = tmdbEl ? tmdbEl.value.trim() : '';
        target.driveLink = document.getElementById('editDriveLink').value.trim();
    } else {
        const editLogoEl = document.getElementById('editLogo');
        target.logo = editLogoEl ? editLogoEl.value.trim() : '';
        const tmdbEl = document.getElementById('editTmdbId');
        target.tmdbId = tmdbEl ? tmdbEl.value.trim() : '';
        target.season = document.getElementById('editSeason').value || 1;
        const rows = document.querySelectorAll('.edit-ep-row');
        if (rows.length && target.episodes) {
            rows.forEach(row => {
                const i = row.querySelector('.edit-ep-name').dataset.i;
                const name = row.querySelector('.edit-ep-name').value.trim();
                const src = row.querySelector('.edit-ep-src').value.trim();
                if (target.episodes[i]) {
                    target.episodes[i].name = name;
                    target.episodes[i].driveLink = src;
                    target.episodes[i].url = '';
                }
            });
        }
    }

    editTarget = target;
    saveData();
    refreshCurrent();
    document.getElementById('editModal').classList.remove('active');
    toast('Changes saved!', 'success');
}

// ==================== TMDB AUTO-FILL ====================
// Keep the proxy working when the app is hosted at the domain root or below a subpath.
const TMDB_BASE = new URL('api/tmdb', document.baseURI).pathname.replace(/\/$/, '');
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

let tmdbImageBase = TMDB_IMG;
let tmdbConfigLoaded = false;
let tmdbUnavailableUntil = 0;

async function tmdbEnsureConfig() {
    if (tmdbConfigLoaded) return;
    try {
        const d = await tmdbJson('/configuration');
        if (d.images && d.images.secure_base_url) tmdbImageBase = d.images.secure_base_url;
    } catch (e) { /* keep the default base on failure */ }
    tmdbConfigLoaded = true;
}

const TMDB_GENRE_MAP = {
    'action': 'action',
    'adventure': 'adventure',
    'animation': 'animation',
    'comedy': 'comedy',
    'crime': 'crime',
    'documentary': 'documentary',
    'drama': 'drama',
    'family': 'family',
    'fantasy': 'fantasy',
    'history': 'history',
    'horror': 'horror',
    'music': 'musical',
    'mystery': 'mystery',
    'romance': 'romance',
    'science fiction': 'scifi',
    'sci-fi': 'scifi',
    'thriller': 'thriller',
    'war': 'war',
    'western': 'western'
};

async function tmdbJson(path) {
    if (Date.now() < tmdbUnavailableUntil) {
        throw new Error('TMDB proxy unavailable. Check the server TMDB configuration.');
    }
    const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}language=en-US`;
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!res.ok) {
        let detail = '';
        try {
            const body = await res.json();
            detail = body.status_message || body.error || '';
        } catch {}
        if (res.status === 404) detail = detail || 'Not found (check the ID, or type a title to search)';
        if (res.status === 503) detail = detail || 'TMDB is not configured on the server';
        if ([401, 403, 503].includes(res.status)) tmdbUnavailableUntil = Date.now() + 60000;
        throw new Error(`TMDB HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res.json();
}

// Content certification (age rating) for a title, US first then UK fallback.
async function tmdbCertification(type, id) {
    try {
        if (type === 'tv') {
            const d = await tmdbJson(`/tv/${encodeURIComponent(id)}/content_ratings`);
            const r = (d.results || []).find(x => x.iso_3166_1 === 'US') || (d.results || []).find(x => x.iso_3166_1 === 'GB');
            return (r && (r.rating || '').trim()) || '';
        }
        const d = await tmdbJson(`/movie/${encodeURIComponent(id)}/release_dates`);
        const pick = (cc) => {
            const entry = (d.results || []).find(x => x.iso_3166_1 === cc);
            if (!entry) return '';
            const rd = (entry.release_dates || []).find(x => x.certification && x.certification.trim());
            return rd ? rd.certification.trim() : '';
        };
        return pick('US') || pick('GB') || '';
    } catch (e) {
        return '';
    }
}

function tmdbGenreKeys(tmdbGenres) {
    const keys = [];
    (tmdbGenres || []).forEach(g => {
        const slug = (g.name || '').trim().toLowerCase();
        const key = TMDB_GENRE_MAP[slug];
        if (key && !keys.includes(key)) keys.push(key);
    });
    return keys;
}

function tmdbLogoUrl(d) {
    const logos = (d.images && d.images.logos) || [];
    const logo = logos.find(l => (l.iso_639_1 || '') === 'en') || logos[0];
    return logo && logo.file_path ? `${tmdbImageBase}w780${logo.file_path}` : '';
}

function tmdbFillForm(d, ids) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal(ids.title, d.title || d.name || '');
    setVal(ids.desc, d.overview || '');
    setVal(ids.year, (d.release_date || d.first_air_date || '').slice(0, 4));
    setVal(ids.rating, d.vote_average ? (+d.vote_average).toFixed(1) : '');
    setVal(ids.poster, d.poster_path ? `${tmdbImageBase}w500${d.poster_path}` : '');
    setVal(ids.backdrop, d.backdrop_path ? `${tmdbImageBase}w1920${d.backdrop_path}` : '');
    setVal(ids.logo, tmdbLogoUrl(d));
    const container = document.getElementById(ids.genres);
    if (container) {
        const keys = tmdbGenreKeys(d.genres);
        container.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = keys.includes(cb.value); });
    }
}

function parseTmdbInput(raw) {
    const s = String(raw || '').trim();
    if (/^\d+$/.test(s)) return { id: s, type: '' };
    const m = s.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
    if (m) return { id: m[2], type: m[1].toLowerCase() };
    return null;
}
function parseImdbInput(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/(tt\d{5,})/i);
    return m ? m[1].toLowerCase() : null;
}
async function imdbFetchAndFill(imdbId, type, isEdit) {
    // TMDB find by IMDb ID — returns movie_results / tv_results with the TMDB id
    const data = await tmdbJson(`/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`);
    const movieRes = (data.movie_results && data.movie_results[0]) || null;
    const tvRes = (data.tv_results && data.tv_results[0]) || null;
    let target = null;
    if (type === 'movie' && movieRes) target = { id: movieRes.id, type: 'movie' };
    else if (type === 'tv' && tvRes) target = { id: tvRes.id, type: 'tv' };
    else if (type === 'movie' && tvRes && !movieRes) target = { id: tvRes.id, type: 'tv' };
    else if (type === 'tv' && movieRes && !tvRes) target = { id: movieRes.id, type: 'movie' };
    else target = movieRes ? { id: movieRes.id, type: 'movie' } : tvRes ? { id: tvRes.id, type: 'tv' } : null;
    if (!target) throw new Error('No TMDB match for that IMDb ID');
    // also fill the TMDB ID field so Play uses it
    const tmdbField = document.getElementById((isEdit ? 'edit' : type) + 'TmdbId');
    if (tmdbField) tmdbField.value = String(target.id);
    return tmdbFetchAndFill(String(target.id), target.type, isEdit);
}

function tmdbTargetIds(type, isEdit) {
    const p = isEdit ? 'edit' : (type === 'movie' ? 'movie' : 'tv');
    return {
        title: `${p}Title`,
        desc: `${p}Desc`,
        year: `${p}Year`,
        rating: `${p}Rating`,
        poster: `${p}Poster`,
        backdrop: `${p}Backdrop`,
        logo: `${p}${isEdit ? 'Logo' : 'LogoUrl'}`,
        genres: `${p}GenreOptions`
    };
}

async function tmdbFetchAndFill(id, type, isEdit) {
    const d = await tmdbJson(`/${type}/${encodeURIComponent(id)}?append_to_response=images`);
    tmdbFillForm(d, tmdbTargetIds(type, isEdit));
    const certEl = document.getElementById((isEdit ? 'edit' : type) + 'Certification');
    if (certEl) certEl.value = await tmdbCertification(type, id);
}

async function tmdbBestSearchResult(type, query) {
    const d = await tmdbJson(`/search/${type}?query=${encodeURIComponent(query)}`);
    return (d.results || [])[0] || null;
}

function tmdbDefaultKind(kind) {
    return kind === 'movie' || kind === 'editMovie' ? 'movie' : 'tv';
}

async function loadTmdbInto(btn, kind) {
    if (!btn || btn.dataset.busy) return;
    const idEl = document.getElementById(kind === 'movie' ? 'movieTmdbId' : kind === 'tv' ? 'tvTmdbId' : 'editTmdbId');
    const raw = (idEl ? idEl.value : '').trim();
    if (!raw) { toast('Enter a TMDB ID or title to search.', 'error'); return; }
    const isEdit = kind === 'editMovie' || kind === 'editTv';
    const defaultType = tmdbDefaultKind(kind);
    btn.dataset.busy = '1';
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    try {
        await tmdbEnsureConfig();
        let type = defaultType;
        let id = '';
        const parsed = parseTmdbInput(raw);
        if (parsed) {
            id = parsed.id;
            if (parsed.type === 'movie' || parsed.type === 'tv') type = parsed.type;
        } else {
            const found = await tmdbBestSearchResult(type, raw);
            if (!found) throw new Error('No results found for that title');
            id = found.id;
        }
        await tmdbFetchAndFill(id, type, isEdit);
        toast('Filled from TMDB!', 'success');
    } catch (err) {
        toast(`TMDB error: ${err.message || err}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = original;
        delete btn.dataset.busy;
    }
}

const movieFetchBtn = document.getElementById('movieFetchTmdb');
if (movieFetchBtn) movieFetchBtn.onclick = () => loadTmdbInto(movieFetchBtn, 'movie');
const tvFetchBtn = document.getElementById('tvFetchTmdb');
if (tvFetchBtn) tvFetchBtn.onclick = () => loadTmdbInto(tvFetchBtn, 'tv');
let imdbScanTimer = null;
async function manualImdbScan(kind) {
    const idEl = document.getElementById(kind === 'movie' ? 'movieImdbId' : 'tvImdbId');
    if (!idEl) return;
    const raw = idEl.value.trim();
    const imdbId = parseImdbInput(raw);
    if (!imdbId) return;
    if (idEl.dataset.lastScanned === imdbId) return;
    idEl.dataset.lastScanned = imdbId;
    const isEdit = false;
    const hint = idEl.nextElementSibling;
    if (hint) hint.textContent = 'Scanning IMDb...';
    try {
        await tmdbEnsureConfig();
        await imdbFetchAndFill(imdbId, kind === 'movie' ? 'movie' : 'tv', isEdit);
        toast('Scanned from IMDb via TMDB!', 'success');
        if (hint) hint.textContent = 'Auto-filled from IMDb ✔';
    } catch (err) {
        delete idEl.dataset.lastScanned;
        if (hint) hint.textContent = `IMDb error: ${err.message || err}`;
        toast(`IMDb error: ${err.message || err}`, 'error');
    }
}
['movieImdbId','tvImdbId'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const kind = id === 'movieImdbId' ? 'movie' : 'tv';
    el.addEventListener('paste', () => setTimeout(()=> manualImdbScan(kind), 80));
    el.addEventListener('input', () => {
        clearTimeout(imdbScanTimer);
        const v = el.value.trim();
        if (!parseImdbInput(v)) { delete el.dataset.lastScanned; return; }
        imdbScanTimer = setTimeout(()=> manualImdbScan(kind), 600);
    });
    el.addEventListener('change', () => manualImdbScan(kind));
});

// ==================== LOAD POPULAR (TMDB) ====================
const TMDB_GENRE_ID_MAP = {
    28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'crime',
    99: 'documentary', 18: 'drama', 10751: 'family', 14: 'fantasy', 36: 'history',
    27: 'horror', 10402: 'musical', 9648: 'mystery', 10749: 'romance', 878: 'scifi',
    53: 'thriller', 10752: 'war', 37: 'western', 10759: 'action', 10762: 'family',
    10765: 'scifi', 10768: 'war', 10770: 'drama', 10763: 'documentary',
    10764: 'documentary', 10766: 'drama', 10767: 'comedy'
};

const POPULAR_MOVIE_GENRES = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37];
const POPULAR_TV_GENRES = [10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766, 10767, 10768, 37];
const POPULAR_PAGES = 15;
const IMDB_TOP_PAGES = 5;
const STORAGE_BUDGET = 4.8 * 1024 * 1024;

function popularPaths() {
    const paths = [];
    // Most popular titles of every genre (TMDB popularity order — the big famous
    // movies and shows, old and new).
    POPULAR_MOVIE_GENRES.forEach(g => {
        for (let p = 1; p <= POPULAR_PAGES; p++) paths.push(`/discover/movie?with_genres=${g}&sort_by=popularity.desc&page=${p}`);
    });
    POPULAR_TV_GENRES.forEach(g => {
        for (let p = 1; p <= POPULAR_PAGES; p++) paths.push(`/discover/tv?with_genres=${g}&sort_by=popularity.desc&page=${p}`);
    });
    // IMDb Top 250-style: the highest-rated titles with a big vote count
    // (these are the IMDb-famous classics, historically included in the IMDb lists).
    for (let p = 1; p <= IMDB_TOP_PAGES; p++) {
        paths.push(`/discover/movie?sort_by=vote_average.desc&vote_count.gte=5000&page=${p}`);
        paths.push(`/discover/tv?sort_by=vote_average.desc&vote_count.gte=2000&page=${p}`);
    }
    // Anime movies + shows (Japanese animation set behind its own genre).
    for (let p = 1; p <= 3; p++) {
        paths.push(`/discover/movie?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${p}`);
        paths.push(`/discover/tv?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${p}`);
    }
    return paths;
}

async function fetchBatched(paths, batchSize = 15) {
    const jsons = [];
    for (let i = 0; i < paths.length; i += batchSize) {
        const chunk = paths.slice(i, i + batchSize);
        const results = await Promise.allSettled(chunk.map(p => tmdbJson(p)));
        const successful = results.filter(result => result.status === 'fulfilled').map(result => result.value);
        jsons.push(...successful);
        if (!successful.length) break;
    }
    if (!jsons.length) throw new Error('TMDB did not return any pages. Check the server TMDB configuration.');
    return jsons;
}

// Fetches each added title's logo + content rating from TMDB (detail request, appended
// with images and the rating source), batched to stay under TMDB rate limits.
async function enrichTmdbDetails(items, btn, quiet) {
    const targets = items.filter(m => m.tmdbId);
    let done = 0;
    const total = targets.length;
    if (!total) return;
    for (let i = 0; i < total; i += 10) {
        const chunk = targets.slice(i, i + 10);
        await Promise.all(chunk.map(async (m) => {
            try {
                const kind = m.type === 'tv' ? 'tv' : 'movie';
                const append = kind === 'tv' ? 'images,content_ratings' : 'images,release_dates';
                const d = await tmdbJson(`/${kind}/${encodeURIComponent(m.tmdbId)}?append_to_response=${append}`);
                if (d.images && d.images.logos) {
                    const logos = d.images.logos;
                    const logo = logos.find(l => (l.iso_639_1 || '') === 'en') || logos[0];
                    if (logo && logo.file_path && !m.logo) m.logo = `${tmdbImageBase}w780${logo.file_path}`;
                }
                if (!m.certification) {
                    if (kind === 'tv' && d.content_ratings) {
                        const rr = (d.content_ratings.results || []).find(x => x.iso_3166_1 === 'US') || (d.content_ratings.results || []).find(x => x.iso_3166_1 === 'GB');
                        if (rr && rr.rating) m.certification = rr.rating;
                    } else if (kind === 'movie' && d.release_dates) {
                        const pick = (cc) => {
                            const entry = (d.release_dates.results || []).find(x => x.iso_3166_1 === cc);
                            if (!entry) return '';
                            const rd = (entry.release_dates || []).find(x => x.certification && x.certification.trim());
                            return rd ? rd.certification.trim() : '';
                        };
                        m.certification = pick('US') || pick('GB') || '';
                    }
                }
            } catch (e) { /* skip titles with missing/blocked fields */ }
        }));
        done = Math.min(i + 10, total);
        if (btn) btn.textContent = `Fetching logos & ratings... ${done}/${total}`;
        if (done % 100 === 0) { saveData(); refreshCurrent(); }
        await sleep(350);
    }
    saveData();
    refreshCurrent();
    if (!quiet) toast('Hero logos & content ratings loaded!', 'success');
}

// Auto-add hero logos (and ratings) for any stored movie/show/anime that has a
// TMDB id but no logo yet. Runs in the background on init so existing content
// gradually gets brand logos without blocking the page.
async function enrichMissingLogos() {
    const needLogo = [...movies, ...tvShows].filter(m => m && m.tmdbId && !m.logo);
    if (!needLogo.length) return;
    await enrichTmdbDetails(needLogo, null, true);
}

// Auto-fetch the brand logo for a single just-added item (by its TMDB id).
async function enrichNewItemLogo(tmdbId, type) {
    if (!tmdbId) return;
    const pool = type === 'tv' ? tvShows : movies;
    const item = pool.find(m => m && String(m.tmdbId) === String(tmdbId) && !m.logo);
    if (!item) return;
    await fetchItemLogo(item);
    if (item.logo) { saveData(); refreshCurrent(); }
}

// Auto-add logos to a live tab's items (Trending/Streaming/Theaters) and refresh
// the banner once they arrive, so banners always show a brand logo.
async function enrichLiveLogos(key) {
    const st = liveState[key];
    if (!st || !st.items || !st.items.length) return;
    const before = st.items.filter(m => m && m.logo).length;
    const needLogo = st.items.filter(m => m && m.tmdbId && !m.logo);
    if (!needLogo.length) return;
    await enrichTmdbDetails(needLogo, null, true);
    const after = st.items.filter(m => m && m.logo).length;
    if (after > before && currentSection === key) showLiveHero(key);
}

// Fetch and assign a TMDB brand logo to a single item (non-blocking).
async function fetchItemLogo(item) {
    if (!item || !item.tmdbId || item.logo) return item;
    const kind = item.type === 'tv' ? 'tv' : 'movie';
    await tmdbEnsureConfig();
    const d = await tmdbJson(`/${kind}/${encodeURIComponent(item.tmdbId)}?append_to_response=images`);
    const logos = (d.images && d.images.logos) || [];
    const logo = logos.find(l => (l.iso_639_1 || '') === 'en') || logos[0];
    if (logo && logo.file_path) item.logo = `${tmdbImageBase}w780${logo.file_path}`;
    return item;
}

// Fetch brand logos for the live search-results items (mutates the same objects the
// cards close over) so the info modal shows a logo right after a search loads.
async function enrichSearchLogos(items) {
    const need = (items || []).filter(m => m && m.tmdbId && !m.logo);
    if (!need.length) return;
    for (let i = 0; i < need.length; i += 5) {
        const chunk = need.slice(i, i + 5);
        await Promise.all(chunk.map(async (m) => {
            try { await fetchItemLogo(m); } catch (e) { /* skip */ }
        }));
        await sleep(250);
    }
}

// Whether the given item is still the one currently shown in the hero banner.
function featureQueueContains(item) {
    if (!heroQueue.length) return false;
    const cur = heroQueue[heroIndex % heroQueue.length];
    return !!(cur && cur.id === item.id);
}

function tmdbGenreKeysFromIds(ids) {
    const keys = [];
    (ids || []).forEach(gid => {
        const key = TMDB_GENRE_ID_MAP[gid];
        if (key && !keys.includes(key)) keys.push(key);
    });
    return keys;
}

function tmdbListItemToItem(r, type, anime) {
    const genre = tmdbGenreKeysFromIds(r.genre_ids || r.genreIds);
    if ((anime || isTmdbAnime(r.genre_ids, r.origin_country, r.original_language)) && !genre.includes('anime')) genre.unshift('anime');
    if (!genre.length) genre.push(type === 'movie' ? 'action' : 'drama');
    // Keep descriptions short so thousands of titles fit in localStorage (the info
    // modal still reads fine — long overviews are cut at 240 chars with an ellipsis).
    const overview = r.overview ? r.overview.replace(/\s+/g, ' ').trim() : '';
    return {
        id: generateId(),
        title: r.title || r.name || 'Untitled',
        description: overview.length > 240 ? overview.slice(0, 240).trimEnd() + '…' : overview,
        genre,
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        rating: r.vote_average ? (+r.vote_average).toFixed(1) : '',
        poster: r.poster_path ? `${tmdbImageBase}w500${r.poster_path}` : '',
        backdrop: r.backdrop_path ? `${tmdbImageBase}w1920${r.backdrop_path}` : '',
        logo: '',
        tmdbId: String(r.id),
        driveLink: '',
        certification: '',
        quality: type === 'tv' ? 'HD' : qualityFor(r.id),
        type
    };
}

async function loadPopularContent(auto) {
    // Auto-load on page open: if the library already fills storage there's nothing
    // more that can be kept — skip the fetch so reloading stays fast.
    if (auto && libraryBytes() > STORAGE_BUDGET) return;
    const existing = movies.length + tvShows.length;
    if (!auto && existing > 0 && !confirm(`Load a big TMDB library — the most popular movies, shows & anime of every genre plus the IMDb-style top-rated titles? Your existing ${existing} item(s) are kept and duplicates are skipped.`)) return;
    try {
        await tmdbEnsureConfig();
        const seenMovie = new Set(movies.map(m => m.tmdbId));
        const seenTv = new Set(tvShows.map(t => t.tmdbId));
        let addedMovies = 0;
        let addedTv = 0;
        const newMovieItems = [];
        const newTvItems = [];
        const addMovie = (r, anime) => {
            if (!r || seenMovie.has(String(r.id))) return;
            seenMovie.add(String(r.id));
            const it = tmdbListItemToItem(r, 'movie', anime);
            movies.push(it);
            newMovieItems.push(it);
            addedMovies++;
        };
        const addTv = (r, anime) => {
            if (!r || seenTv.has(String(r.id))) return;
            seenTv.add(String(r.id));
            const it = tmdbListItemToItem(r, 'tv', anime);
            tvShows.push(it);
            newTvItems.push(it);
            addedTv++;
        };
        const paths = popularPaths();
        const jsons = await fetchBatched(paths, 15);
        let halted = false;
        let countSinceCheck = 0;
        const nearLimit = () => (countSinceCheck++ > 40) ? (countSinceCheck = 0, libraryBytes() > STORAGE_BUDGET) : halted;
        jsons.forEach((d, idx) => {
            if (!d || !d.results || halted) return;
            const path = paths[idx];
            const isTv = path.includes('/discover/tv');
            const anime = path.includes('with_origin_country=JP');
            for (const r of d.results) {
                if (nearLimit()) { halted = true; return; }
                if (isTv) addTv(r, anime); else addMovie(r, anime);
            }
        });
        if (halted && !auto) toast('Reached the storage limit — the biggest library was loaded. Remove items to load more.', 'error');
        if (addedMovies + addedTv) {
            saveData();
            refreshCurrent();
            if (!auto) toast(`${addedMovies} movies and ${addedTv} shows added from TMDB!`, 'success');
            await enrichTmdbDetails(newMovieItems.concat(newTvItems), null);
        } else {
            if (!auto) toast('Nothing new to add — your library already has these.', 'error');
        }
    } catch (err) {
        console.error('[MILKBOX] TMDB library load failed:', err);
        if (typeof toast === 'function') toast(`TMDB error: ${err.message || err}`, 'error');
    }
}

// ==================== ADD MOVIE ====================
document.getElementById('movieForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('movieTitle').value.trim();
    const desc = document.getElementById('movieDesc').value.trim();
    const genre = getSelectedGenres('movieGenreOptions');
    const year = document.getElementById('movieYear').value;
    const rating = document.getElementById('movieRating').value;
    const poster = document.getElementById('moviePoster').value.trim();
    const backdrop = document.getElementById('movieBackdrop').value.trim();
    const movieLogoEl = document.getElementById('movieLogoUrl');
    const logo = movieLogoEl ? movieLogoEl.value.trim() : '';
    const tmdbId = document.getElementById('movieTmdbId').value.trim();
    const driveLink = document.getElementById('movieDriveLink').value.trim();
    const certEl = document.getElementById('movieCertification');
    const certification = certEl ? certEl.value.trim() : '';
    if (!title || (!driveLink && !tmdbId)) { toast('Please fill in the title and a Google Drive link or TMDB ID.', 'error'); return; }
    movies.push({ id: generateId(), title, description: desc, genre, year, rating, poster, backdrop, logo, tmdbId, driveLink, certification, type: 'movie', quality: qualityFor(tmdbId || generateId()) });
    saveData();
    refreshCurrent();
    document.getElementById('addContentModal').classList.remove('active');
    toast(`"${title}" added successfully!`, 'success');
    enrichNewItemLogo(tmdbId, 'movie');
    try { e.target.reset(); } catch(_) {}
});

// ==================== TV SHOW EPISODE MANAGEMENT ====================

// --- Drive Episodes ---
document.getElementById('addDriveEpBtn').addEventListener('click', () => {
    const row = document.querySelector('.drive-ep-row');
    const nameInput = row.querySelector('.ep-name-input');
    const driveInput = row.querySelector('.ep-drive-input');
    const name = nameInput.value.trim();
    const link = driveInput.value.trim();
    if (!link) { toast('Please enter a Google Drive link.', 'error'); return; }
    uploadedDriveEps.push({ name: name || `Episode ${uploadedDriveEps.length + 1}`, driveLink: link, order: uploadedDriveEps.length });
    nameInput.value = '';
    driveInput.value = '';
    renderDriveEpisodeList();
    toast('Episode added!', 'success');
});

function renderDriveEpisodeList() {
    const list = document.getElementById('driveEpisodeList');
    const container = document.getElementById('driveEpisodeListContainer');
    list.innerHTML = '';
    if (uploadedDriveEps.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    uploadedDriveEps.forEach((ep, i) => {
        const div = document.createElement('div');
        div.className = 'episode-item';
        div.draggable = true;
        div.dataset.index = i;
        div.innerHTML = `
            <span class="ep-number">${i + 1}</span>
            <span class="ep-name" title="${escapeHtml(ep.name)}">${escapeHtml(ep.name)}</span>
            <span class="ep-type-badge drive">Drive</span>
            <button class="ep-remove" data-index="${i}">&times;</button>
        `;
        list.appendChild(div);
    });
    setupDragDrop(list, uploadedDriveEps, renderDriveEpisodeList);
}

// --- File Episodes ---
document.getElementById('tvEpisodes').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    files.forEach((file) => {
        uploadedFileEps.push({
            name: file.name.replace(/\.[^/.]+$/, ''),
            file, size: file.size, type: file.type,
            blobUrl: URL.createObjectURL(file),
            order: uploadedFileEps.length
        });
    });
    renderFileEpisodeList();
});

function renderFileEpisodeList() {
    const list = document.getElementById('fileEpisodeList');
    const container = document.getElementById('fileEpisodeListContainer');
    list.innerHTML = '';
    if (uploadedFileEps.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    uploadedFileEps.forEach((ep, i) => {
        const div = document.createElement('div');
        div.className = 'episode-item';
        div.draggable = true;
        div.dataset.index = i;
        div.innerHTML = `
            <span class="ep-number">${i + 1}</span>
            <span class="ep-name" title="${escapeHtml(ep.name)}">${escapeHtml(ep.name)}</span>
            <span style="color:#888;font-size:11px;">${formatSize(ep.size)}</span>
            <span class="ep-type-badge file">File</span>
            <button class="ep-remove" data-index="${i}">&times;</button>
        `;
        list.appendChild(div);
    });
    setupDragDrop(list, uploadedFileEps, renderFileEpisodeList);
}

function setupDragDrop(list, dataArray, renderFn) {
    let draggedItem = null;
    list.querySelectorAll('.episode-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedItem && draggedItem !== item) {
                const allItems = [...list.querySelectorAll('.episode-item')];
                const fromIdx = allItems.indexOf(draggedItem);
                const toIdx = allItems.indexOf(item);
                const fromData = dataArray.splice(fromIdx, 1)[0];
                dataArray.splice(toIdx, 0, fromData);
                renderFn();
            }
        });
        const removeBtn = item.querySelector('.ep-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(removeBtn.dataset.index);
                dataArray.splice(idx, 1);
                renderFn();
            });
        }
    });
}

// --- Episode Source Toggle ---
document.querySelectorAll('.toggle-btn[data-source]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn[data-source]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const source = btn.dataset.source;
        document.getElementById('epDriveSection').style.display = source === 'drive' ? '' : 'none';
        document.getElementById('epFileSection').style.display = source === 'file' ? '' : 'none';
    });
});

// --- Submit TV Show ---
document.getElementById('tvShowForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('tvTitle').value.trim();
    const desc = document.getElementById('tvDesc').value.trim();
    const genre = getSelectedGenres('tvGenreOptions');
    const year = document.getElementById('tvYear').value;
    const rating = document.getElementById('tvRating').value;
    const poster = document.getElementById('tvPoster').value.trim();
    const backdrop = document.getElementById('tvBackdrop').value.trim();
    const logoEl = document.getElementById('tvLogoUrl');
    const logo = logoEl ? logoEl.value.trim() : '';
    const tmdbId = document.getElementById('tvTmdbId').value.trim();
    const season = document.getElementById('tvSeason').value;
    const certEl = document.getElementById('tvCertification');
    const certification = certEl ? certEl.value.trim() : '';
    const isDrive = document.querySelector('#tvTab .toggle-btn[data-source].active')?.dataset.source === 'drive';
    if (!title) { toast('Please enter a TV show title.', 'error'); return; }

    let episodes = [];
    if (isDrive) {
        episodes = uploadedDriveEps.map((ep, i) => ({
            name: ep.name, driveLink: ep.driveLink, size: 0, order: i
        }));
    } else {
        episodes = uploadedFileEps.map((ep, i) => ({
            name: ep.name, url: '', blobUrl: ep.blobUrl, size: ep.size, type: ep.type, order: i
        }));
    }

    tvShows.push({ id: generateId(), title, description: desc, genre, year, rating, poster, backdrop, logo, tmdbId, season: season || 1, episodes, certification, type: 'tv' });
    saveData();
    refreshCurrent();

    document.getElementById('addContentModal').classList.remove('active');
    toast(`"${title}" added successfully!`, 'success');
    enrichNewItemLogo(tmdbId, 'tv');

    uploadedDriveEps = [];
    uploadedFileEps = [];

    try { e.target.reset(); } catch(_) {}

    document.getElementById('driveEpisodeList').innerHTML = '';
    document.getElementById('driveEpisodeListContainer').style.display = 'none';
    document.getElementById('fileEpisodeList').innerHTML = '';
    document.getElementById('fileEpisodeListContainer').style.display = 'none';

    document.querySelectorAll('#tvTab .toggle-btn[data-source]').forEach(b => b.classList.remove('active'));
    const driveBtn = document.getElementById('epSourceDrive');
    if (driveBtn) driveBtn.classList.add('active');
    document.getElementById('epDriveSection').style.display = '';
    document.getElementById('epFileSection').style.display = 'none';
});

// ==================== SEARCH ====================
let searchTimer = null;
let searchQuery = '';
let searchPage = 1;
let searchTotalPages = 1;
let searchRequestId = 0;

function showSearchResults() {
    ['moviesSection','tvShowsSection','myListSection','homeGenres','trendingSection','streamingSection','theatersSection','popularSection','mangaSection','musicSection','heroSection'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.getElementById('searchResultsSection').style.display = '';
}
function hideSearchResults() {
    const sec = document.getElementById('searchResultsSection');
    if (sec) sec.style.display = 'none';
    const closeBtn = document.getElementById('closeSearchResults');
    if (closeBtn) closeBtn.style.display = 'none';
    const pager = document.getElementById('searchResultsPager');
    if (pager) pager.style.display = 'none';
    // Restore section visibility based on currentSection (mirrors handleNavClick)
    const show = (id, v) => { const el=document.getElementById(id); if(el) el.style.display = v ? '' : 'none'; };
    // First hide search, then restore correct tab's sections
    if (currentSection === 'anime') {
        show('moviesSection', true); show('tvShowsSection', true); show('myListSection', false); show('homeGenres', true); show('popularSection', false);
        show('trendingSection', false); show('streamingSection', false); show('theatersSection', false); show('mangaSection', false); show('musicSection', false);
        show('heroSection', true); show('providerSection', false); show('collectionsSection', false);
    } else if (currentSection === 'mylist') {
        show('moviesSection', false); show('tvShowsSection', false); show('myListSection', true); show('homeGenres', false); show('popularSection', false);
        show('trendingSection', false); show('streamingSection', false); show('theatersSection', false); show('mangaSection', false); show('musicSection', false);
        show('heroSection', true); show('providerSection', false); show('collectionsSection', false);
    } else if (currentSection === 'movies') {
        show('moviesSection', true); show('tvShowsSection', false); show('myListSection', false); show('homeGenres', false); show('popularSection', false);
        show('trendingSection', false); show('streamingSection', false); show('theatersSection', false); show('mangaSection', false); show('musicSection', false);
        show('heroSection', true); show('providerSection', false); show('collectionsSection', false);
    } else if (currentSection === 'tvshows') {
        show('moviesSection', false); show('tvShowsSection', true); show('myListSection', false); show('homeGenres', false); show('popularSection', false);
        show('trendingSection', false); show('streamingSection', false); show('theatersSection', false); show('mangaSection', false); show('musicSection', false);
        show('heroSection', true); show('providerSection', false); show('collectionsSection', false);
    } else if (currentSection === 'trending') {
        show('moviesSection', false); show('tvShowsSection', false); show('myListSection', false); show('homeGenres', false);
        show('trendingSection', true); show('streamingSection', false); show('theatersSection', false); show('popularSection', false); show('mangaSection', false); show('musicSection', false);
        show('heroSection', true); show('providerSection', false); show('collectionsSection', true);
    } else if (currentSection === 'streaming') {
        show('moviesSection', false); show('tvShowsSection', false); show('myListSection', false); show('homeGenres', false); show('musicSection', false);
        show('trendingSection', false); show('streamingSection', true); show('theatersSection', false); show('popularSection', false); show('mangaSection', false);
        show('heroSection', true); show('providerSection', true); show('collectionsSection', false);
    } else if (currentSection === 'theaters') {
        show('moviesSection', false); show('tvShowsSection', false); show('myListSection', false); show('homeGenres', false);
        show('trendingSection', false); show('streamingSection', false); show('theatersSection', true); show('popularSection', false); show('mangaSection', false); show('musicSection', false);
        show('heroSection', true); show('providerSection', false); show('collectionsSection', false);
    } else if (currentSection === 'popular') {
        show('moviesSection', false); show('tvShowsSection', false); show('myListSection', false); show('homeGenres', false);
        show('trendingSection', false); show('streamingSection', false); show('theatersSection', false); show('popularSection', true); show('mangaSection', false); show('musicSection', false);
        show('heroSection', true); show('providerSection', false); show('collectionsSection', false);
    } else if (currentSection === 'manga') {
        show('moviesSection', false); show('tvShowsSection', false); show('myListSection', false); show('homeGenres', false);
        show('trendingSection', false); show('streamingSection', false); show('theatersSection', false); show('popularSection', false); show('mangaSection', true); show('musicSection', false);
        show('heroSection', true); show('providerSection', false); show('collectionsSection', false);
    } else if (currentSection === 'music') {
        show('moviesSection', false); show('tvShowsSection', false); show('myListSection', false); show('homeGenres', false);
        show('trendingSection', false); show('streamingSection', false); show('theatersSection', false); show('popularSection', false); show('mangaSection', false); show('musicSection', true);
        show('heroSection', false); show('providerSection', false); show('collectionsSection', false);
    } else {
        // home
        show('moviesSection', true); show('tvShowsSection', true); show('myListSection', true); show('homeGenres', true);
        show('trendingSection', true); show('streamingSection', false); show('theatersSection', false); show('popularSection', true); show('mangaSection', false); show('musicSection', false);
        show('heroSection', true); show('providerSection', true); show('collectionsSection', true);
    }
    refreshCurrent();
}

async function fetchSearchResults(query, page) {
    const needle = query.toLowerCase();
    const localItems = [...movies, ...tvShows].filter(item => {
        const haystack = [item.title, item.description, item.genre, item.year].join(' ').toLowerCase();
        return haystack.includes(needle);
    }).map(item => ({ ...item, type: item.type || (tvShows.includes(item) ? 'tv' : 'movie') }));
    let remoteItems = [];
    let remoteError = null;
    try {
        await tmdbEnsureConfig();
        const d = await tmdbJson(`/search/multi?query=${encodeURIComponent(query)}&page=${page}`);
        (d.results || []).forEach(r => {
            if (r.media_type === 'person') return;
            const type = r.media_type === 'tv' ? 'tv' : 'movie';
            const genreIds = r.genre_ids || [];
            const genre = tmdbGenreKeysFromIds(genreIds);
            const animeFlag = isTmdbAnime(genreIds, r.origin_country, r.original_language);
            if (animeFlag && !genre.includes('anime')) genre.unshift('anime');
            if (!genre.length) genre.push(type === 'movie' ? 'action' : 'drama');
            remoteItems.push({
                id: 'tmdb_' + r.id,
                title: r.title || r.name || 'Untitled',
                description: r.overview || '',
                genre,
                year: (r.release_date || r.first_air_date || '').slice(0, 4),
                rating: r.vote_average ? (+r.vote_average).toFixed(1) : '',
                poster: r.poster_path ? `${tmdbImageBase}w500${r.poster_path}` : '',
                backdrop: r.backdrop_path ? `${tmdbImageBase}w1920${r.backdrop_path}` : '',
                logo: '',
                tmdbId: String(r.id),
                driveLink: '',
                certification: '',
                type
            });
        });
        searchTotalPages = d.total_pages || 1;
    } catch (error) {
        remoteError = error;
        searchTotalPages = 1;
    }
    const seen = new Set();
    const items = [...localItems, ...remoteItems].filter(item => {
        const key = `${item.type}:${item.tmdbId || item.title.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    if (!items.length && remoteError) throw remoteError;
    return items;
}

function renderSearchPager() {
    const pager = document.getElementById('searchResultsPager');
    if (!pager) return;
    if (searchTotalPages <= 1) { pager.style.display = 'none'; return; }
    pager.style.display = '';
    let html = `<button class="pager-btn pager-nav" data-searchpage="1" data-page="${searchPage - 1}" ${searchPage === 1 ? 'disabled' : ''}>&#10094; Prev</button>`;
    const WIN = 5;
    let s = Math.max(1, searchPage - 2);
    let e = Math.min(searchTotalPages, s + WIN - 1);
    s = Math.max(1, e - WIN + 1);
    for (let i = s; i <= e; i++) {
        html += `<button class="pager-btn ${i === searchPage ? 'current' : ''}" data-searchpage="1" data-page="${i}">${i}</button>`;
    }
    html += `<button class="pager-btn pager-nav" data-searchpage="1" data-page="${searchPage + 1}" ${searchPage === searchTotalPages ? 'disabled' : ''}>Next &#10095;</button>`;
    pager.innerHTML = html;
}

function renderSearchResults(items) {
    const grid = document.getElementById('searchResultsGrid');
    grid.innerHTML = '';
    if (!items.length) {
        grid.innerHTML = '<p style="color:#999;padding:40px 0;text-align:center;width:100%">No results found.</p>';
        return;
    }
    items.forEach(item => grid.appendChild(createCard(item, item.type)));
    // Fetch brand logos for these results in the background so clicking a card shows
    // its logo in the info modal right away.
    enrichSearchLogos(items).catch(() => {});
}

async function runSearch(query, page = 1) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
        searchQuery = '';
        hideSearchResults();
        return;
    }
    const requestId = ++searchRequestId;
    searchQuery = normalizedQuery;
    searchPage = page;
    showSearchResults();
    const title = document.getElementById('searchResultsTitle');
    const grid = document.getElementById('searchResultsGrid');
    if (title) title.textContent = `Results for "${normalizedQuery}"`;
    if (grid) grid.innerHTML = '<div class="live-loading">Searching TMDB...</div>';
    try {
        const items = await fetchSearchResults(normalizedQuery, page);
        if (requestId !== searchRequestId || normalizedQuery !== searchQuery) return;
        renderSearchResults(items);
        renderSearchPager();
    } catch (error) {
        if (requestId !== searchRequestId) return;
        if (grid) grid.innerHTML = `<p class="live-error">Search failed: ${escapeHtml(error.message || 'Check your connection and try again.')}</p>`;
        const pager = document.getElementById('searchResultsPager');
        if (pager) pager.style.display = 'none';
    }
}

const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchBtn');
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimer);
    if (!query) {
        searchRequestId++;
        searchQuery = '';
        hideSearchResults();
        return;
    }
    searchTimer = setTimeout(() => runSearch(query, 1), 350);
});
searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(searchTimer);
    runSearch(searchInput.value, 1);
});
searchButton.addEventListener('click', () => {
    clearTimeout(searchTimer);
    if (searchInput.value.trim()) runSearch(searchInput.value, 1);
    else searchInput.focus();
});

// Search results pager clicks.
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn[data-searchpage]');
    if (!btn) return;
    const page = parseInt(btn.dataset.page, 10);
    if (isNaN(page) || page < 1 || page > searchTotalPages) return;
    searchPage = page;
    (async () => {
        showSearchResults();
        await runSearch(searchQuery, searchPage);
    })();
});

// ==================== ABOUT:BLANK OPENER ====================
function openAboutBlankPlayer() {
    const cloakTitle = settings.cloakTitle || 'MILKBOX';
    const cloakFavicon = settings.cloakFavicon || '';
    const bgColor = settings.bgColor || '#000';
    const bgImage = settings.bgImage || '';
    const bgOpacity = (settings.bgOpacity || 30) / 100;
    const bgBlur = settings.bgBlur || 0;
    // Stored blob backgrounds can't be inlined into the about:blank document, so fall back to color.
    const aboutBgImage = isStoredBg(bgImage) ? '' : bgImage;

    const faviconTag = cloakFavicon ? `<link rel="icon" type="image/x-icon" href="${cloakFavicon}">` : '';
    const bgStyle = aboutBgImage
        ? `background-color:${bgColor};background-image:url('${aboutBgImage}');background-size:cover;background-position:center;`
        : `background-color:${bgColor};`;

    const logoUrl = 'https://raw.githubusercontent.com/IordBeerus/MILKBOX/main/SiteIcon.png';
    const newWindow = window.open('about:blank', '_blank');
    if (newWindow) {
        newWindow.document.write(`<!DOCTYPE html>
<html><head>
<title>${cloakTitle}</title>
${faviconTag}
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{${bgStyle}color:#fff;font-family:'Outfit','Segoe UI',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:28px 16px 24px;position:relative;overflow:auto}
.bg-layer{position:fixed;inset:0;${aboutBgImage ? `background-image:url('${aboutBgImage}');background-size:cover;background-position:center;opacity:${bgOpacity};filter:blur(${bgBlur}px);` : 'display:none'}z-index:0;pointer-events:none}
.shell{position:relative;z-index:1;width:100%;max-width:860px}
.brand{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:18px}
.brand img{width:42px;height:42px;border-radius:10px;object-fit:cover;box-shadow:0 6px 18px rgba(0,0,0,0.35)}
.brand h1{font-size:28px;font-weight:800;letter-spacing:1px;color:#fff}
.brand h1 span{color:#e50914}
.sub{color:#9a9aa0;text-align:center;margin-bottom:18px;font-size:13px;line-height:1.5}
.tabs{display:flex;gap:8px;justify-content:center;margin-bottom:14px;flex-wrap:wrap}
.tab{padding:8px 14px;border-radius:20px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.07);color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s}
.tab.active{background:#e50914;border-color:#e50914;color:#fff;box-shadow:0 6px 18px rgba(229,9,20,0.35)}
.panel{display:none;background:rgba(20,20,20,0.72);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;backdrop-filter:blur(10px)}
.panel.active{display:block}
.row{display:flex;gap:10px;width:100%}
.row input[type=text]{flex:1;padding:12px 14px;background:#0f0f0f;border:1px solid #2a2a2a;border-radius:10px;color:#fff;font-size:13px;outline:none}
.row input[type=text]:focus{border-color:#e50914}
.row input[type=text]::placeholder{color:#666}
.btn{padding:12px 18px;background:#e50914;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;transition:background 0.2s,transform 0.2s}
.btn:hover{background:#f40612;transform:translateY(-1px)}
.btn-ghost{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12)}
.btn-ghost:hover{background:rgba(255,255,255,0.13)}
.file-drop{margin-top:14px;border:1.5px dashed rgba(255,255,255,0.24);border-radius:12px;padding:18px 16px;text-align:center;background:rgba(255,255,255,0.06);cursor:pointer;transition:border-color 0.2s,background 0.2s;display:block;width:100%;box-sizing:border-box;position:relative;overflow:hidden;background-clip:padding-box}
.file-drop:hover{border-color:#e50914;background:rgba(229,9,20,0.10)}
.file-drop input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip:rect(0,0,0,0);pointer-events:none}
.file-drop span{color:#ffb6d8;font-weight:700;font-size:12px}
.file-drop small{color:#777;font-size:11px;display:block;margin-top:4px}
#player{width:100%;aspect-ratio:16/9;margin-top:16px;display:none;border-radius:14px;overflow:hidden;background:#000;border:1px solid rgba(255,255,255,0.08);box-shadow:0 16px 40px rgba(0,0,0,0.45)}
#player.pdf{aspect-ratio:auto;height:76vh}
#player iframe{width:100%;height:100%;border:none;background:#0a0a0a}
.actions{display:flex;gap:8px;justify-content:center;margin-top:12px}
.hint{color:#666;font-size:11px;text-align:center;margin-top:8px}
</style></head><body>
<div class="bg-layer"></div>
<div class="shell">
<div class="brand"><img src="${logoUrl}" alt="MILKBOX" onerror="this.style.display='none'"><h1>MILK<span>BOX</span></h1></div>
<p class="sub">YouTube <span style="color:#555">•</span> Drive <span style="color:#555">•</span> PDF — paste a link or drop a PDF file. Everything opens in this cloaked tab.</p>
<div class="tabs">
<button class="tab active" data-tab="video">Video / YouTube</button>
<button class="tab" data-tab="drive">Drive</button>
<button class="tab" data-tab="pdf">PDF</button>
</div>
<div class="panel active" id="panel-video">
<div class="row"><input type="text" id="videoUrl" placeholder="Paste YouTube, video, or PDF URL…"><button class="btn" onclick="loadVideo()">Play</button></div>
<div class="hint">YouTube links auto-convert to embed • Direct .mp4/.webm also works • PDF links open as document</div>
</div>
<div class="panel" id="panel-drive">
<div class="row"><input type="text" id="driveUrl" placeholder="Google Drive share link…"><button class="btn" onclick="loadDriveVideo()">Play Drive</button></div>
<div class="hint">Supports /file/d/ID/view and ?id= links — converted to /preview</div>
</div>
<div class="panel" id="panel-pdf">
<div class="row"><input type="text" id="pdfUrl" placeholder="Paste PDF URL (https://…/file.pdf)"><button class="btn" onclick="loadPdf()">Open PDF</button></div>
<label class="file-drop" for="pdfFile"><span>Drop PDF here or click to browse</span><small>PDFs open in the viewer below — no upload needed, stays local</small><input type="file" id="pdfFile" accept="application/pdf,.pdf"></label>
</div>
<div class="actions">
<button class="btn btn-ghost" onclick="stopVideo()">Stop</button>
<button class="btn btn-ghost" onclick="window.close()">Close Tab</button>
<button class="btn btn-ghost" onclick="document.getElementById('videoUrl').value='';document.getElementById('driveUrl').value='';document.getElementById('pdfUrl').value='';">Clear</button>
</div>
<div id="player"><iframe id="videoFrame" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe></div>
</div>
<script>
let pdfObjectUrl=null;
function toYouTubeEmbed(u){
  var m=u.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|youtube\\.com\\/embed\\/)([a-zA-Z0-9_-]{11})/);
  if(m) return 'https://www.youtube.com/embed/'+m[1]+'?autoplay=1&rel=0';
  if(u.includes('youtube.com')||u.includes('youtu.be')) return u;
  return '';
}
function toDrivePreview(u){
  var m=u.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/);
  if(m) return 'https://drive.google.com/file/d/'+m[1]+'/preview';
  var m2=u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m2) return 'https://drive.google.com/file/d/'+m2[1]+'/preview';
  if(u.includes('drive.google.com')) return u.replace('/view','/preview').replace('/edit','/preview');
  return u;
}
function showPlayer(url,kind){
  var p=document.getElementById('player'), f=document.getElementById('videoFrame');
  if(pdfObjectUrl && kind!=='pdf'){ try{ URL.revokeObjectURL(pdfObjectUrl); }catch{} pdfObjectUrl=null; }
  f.src=url;
  p.style.display='block';
  if(kind==='pdf'){ p.classList.add('pdf'); }
  else { p.classList.remove('pdf'); }
  p.scrollIntoView({behavior:'smooth',block:'start'});
}
function isPdfUrl(u){ return /\\.pdf($|[?#])/i.test(u) || u.includes('.pdf'); }
function loadVideo(){
  var u=document.getElementById('videoUrl').value.trim();
  if(!u) return;
  if(isPdfUrl(u)){ showPlayer(u,'pdf'); return; }
  var yt=toYouTubeEmbed(u);
  if(yt){ showPlayer(yt,'video'); return; }
  var d=toDrivePreview(u);
  if(d!==u){ showPlayer(d,'video'); return; }
  showPlayer(u,'video');
}
function loadDriveVideo(){
  var u=document.getElementById('driveUrl').value.trim();
  if(!u) return;
  showPlayer(toDrivePreview(u),'video');
}
function loadPdf(){
  var u=document.getElementById('pdfUrl').value.trim();
  if(!u) return;
  showPlayer(u,'pdf');
}
function stopVideo(){
  var f=document.getElementById('videoFrame');
  f.src='';
  document.getElementById('player').style.display='none';
  if(pdfObjectUrl){ try{ URL.revokeObjectURL(pdfObjectUrl); }catch{} pdfObjectUrl=null; }
}
document.getElementById('videoUrl').addEventListener('keydown',function(e){if(e.key==='Enter')loadVideo()});
document.getElementById('driveUrl').addEventListener('keydown',function(e){if(e.key==='Enter')loadDriveVideo()});
document.getElementById('pdfUrl').addEventListener('keydown',function(e){if(e.key==='Enter')loadPdf()});
document.getElementById('pdfFile').addEventListener('change',function(e){
  var file=e.target.files[0]; if(!file) return;
  if(file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){ alert('Please select a PDF file'); return; }
  if(pdfObjectUrl) try{ URL.revokeObjectURL(pdfObjectUrl); }catch{}
  pdfObjectUrl=URL.createObjectURL(file);
  showPlayer(pdfObjectUrl,'pdf');
});
var drop=document.querySelector('.file-drop');
if(drop){
  ;['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev,function(e){ e.preventDefault(); drop.style.borderColor='#e50914'; drop.style.background='rgba(229,9,20,0.08)'; }); });
  ;['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev,function(e){ e.preventDefault(); drop.style.borderColor=''; drop.style.background=''; }); });
  drop.addEventListener('drop',function(e){
    var file=e.dataTransfer.files && e.dataTransfer.files[0]; if(!file) return;
    if(file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){ alert('Please drop a PDF'); return; }
    if(pdfObjectUrl) try{ URL.revokeObjectURL(pdfObjectUrl); }catch{}
    pdfObjectUrl=URL.createObjectURL(file);
    showPlayer(pdfObjectUrl,'pdf');
  });
}
document.querySelectorAll('.tab').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active');
    document.getElementById('panel-'+b.dataset.tab).classList.add('active');
  });
});
</script></body></html>`);
        newWindow.document.close();
        toast('Opened about:blank player tab', 'success');
    } else {
        toast('Popup blocked. Allow popups for this site.', 'error');
    }
}

// Opens the whole site inside an about:blank tab. Uses a <base> tag pointing
// at the current directory so the copy loads the same styles.css / app.js,
// which works from a plain file:// page (no fetch required).
function openAboutBlankSite() {
    const cloakTitle = settings.cloakTitle || 'MILKBOX';
    const cloakFavicon = settings.cloakFavicon || '';
    let base = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    // Base URL = current page's directory (dropping the trailing filename).
    const dirUrl = window.location.href.replace(/[^/\\]*$/, '');
    base = base.replace(/<head[^>]*>/, (m) => m + `<base href="${dirUrl}">`);
    // Refresh cloak title/favicon inside the copy.
    base = base.replace(/<title[^>]*>[\s\S]*?<\/title>/, `<title>${cloakTitle}</title>`);
    const faviconTag = cloakFavicon ? `<link rel="icon" type="image/x-icon" href="${cloakFavicon}">` : '<link rel="icon" type="image/x-icon" href="data:,">';
    base = base.replace(/<link rel="icon" type="image\/x-icon"[^>]*>/, () => faviconTag);

    const newWindow = window.open('about:blank', '_blank');
    if (newWindow) {
        newWindow.document.open();
        newWindow.document.write(base);
        newWindow.document.close();
        toast('Opened whole site in about:blank tab', 'success');
    } else {
        toast('Popup blocked. Allow popups for this site.', 'error');
    }
}


// ==================== SETTINGS ====================
document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('active');
    document.querySelectorAll('.theme-card').forEach(c => {
        c.classList.toggle('active', c.dataset.theme === settings.activeTheme);
    });
    document.querySelectorAll('.preset-color').forEach(c => {
        c.classList.toggle('active', c.dataset.color === settings.bgColor);
    });
    renderCustomThemes();
});
document.getElementById('settingsAboutPlayerBtn')?.addEventListener('click', openAboutBlankPlayer);
document.getElementById('settingsAboutSiteBtn')?.addEventListener('click', openAboutBlankSite);

document.getElementById('applyCloakBtn').addEventListener('click', () => {
    settings.cloakTitle = document.getElementById('cloakTitle').value.trim();
    settings.cloakFavicon = document.getElementById('cloakFavicon').value.trim();
    settings.cloakLogoText = document.getElementById('cloakLogoText').value.trim();
    settings.cloakLogoImage = document.getElementById('cloakLogoImage').value.trim();
    saveData();
    applyCloak();
    toast('Cloak settings applied!', 'success');
});

document.getElementById('applyBgBtn').addEventListener('click', () => {
    settings.bgColor = document.getElementById('bgColor').value;
    const inputVal = document.getElementById('bgImage').value.trim();
    // If the field holds an upload label (not a real URL), keep the stored reference.
    if (!(inputVal.indexOf('(uploaded') === 0)) { settings.bgImage = inputVal; }
    settings.bgOpacity = parseInt(document.getElementById('bgOpacity').value);
    settings.bgBlur = parseInt(document.getElementById('bgBlur').value);
    settings.activeTheme = '';
    saveData();
    applyBackground();
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
    toast('Background applied!', 'success');
});

document.getElementById('resetBgBtn').addEventListener('click', () => {
    settings.bgColor = '#141414';
    settings.bgImage = '';
    settings.bgOpacity = 30;
    settings.bgBlur = 0;
    settings.activeTheme = 'default';
    saveData();
    applyBackground();
    applyTheme('default');
    toast('Reset to default', 'success');
});

// Hero Logo controls
document.getElementById('applyHeroLogoBtn')?.addEventListener('click', () => {
    const url = document.getElementById('heroLogoUrl')?.value?.trim();
    if (url) {
        settings.heroLogo = url;
        settings.heroLogoData = '';
        saveData();
        applyHeroLogo();
        toast('Hero logo applied!', 'success');
    } else {
        toast('Enter a logo image URL first.', 'error');
    }
});

document.getElementById('removeHeroLogoBtn')?.addEventListener('click', () => {
    settings.heroLogo = '';
    settings.heroLogoData = '';
    const urlInput = document.getElementById('heroLogoUrl');
    if (urlInput) urlInput.value = '';
    const upload = document.getElementById('heroLogoUpload');
    if (upload) upload.value = '';
    saveData();
    applyHeroLogo();
    toast('Hero logo removed', 'success');
});

document.getElementById('heroLogoUpload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast('File too large. Max 100MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
        settings.heroLogoData = ev.target.result;
        settings.heroLogo = '';
        const urlInput = document.getElementById('heroLogoUrl');
        if (urlInput) urlInput.value = '';
        saveData();
        applyHeroLogo();
        toast('Hero logo uploaded!', 'success');
    };
    reader.readAsDataURL(file);
});



// Navbar icon upload — no URL needed, never blocked
document.getElementById('cloakLogoUpload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast('File too large. Max 100MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
        settings.cloakLogoData = ev.target.result;
        saveData();
        applyCloak();
        const preview = document.getElementById('logoPreview');
        if (preview) {
            let img = preview.querySelector('img');
            if (!img) { img = document.createElement('img'); img.style.maxHeight = '32px'; img.style.borderRadius = '6px'; preview.innerHTML = ''; preview.appendChild(img); }
            img.src = ev.target.result;
            const txt = document.getElementById('logoPreviewText');
            if (txt) txt.style.display = 'none';
        }
        toast('Icon uploaded — now shows next to MILKBOX and never gets blocked!', 'success');
    };
    reader.readAsDataURL(file);
});

// MangaDex auth — paste the access_token/refresh_token from your Python POST so the book reader can load chapters
const MANGADEX_DEFAULT_TOKEN = '';
(function initMangadexSecret(){
    try {
        const cur = JSON.parse(localStorage.getItem('mangadex_token')||'{}');
        const has = (cur && cur.access_token) || localStorage.getItem('mangadex_access_token');
        if (!has) {
            localStorage.setItem('mangadex_token', JSON.stringify({ access_token: MANGADEX_DEFAULT_TOKEN, refresh_token: '', saved_at: Date.now() }));
            localStorage.setItem('mangadex_access_token', MANGADEX_DEFAULT_TOKEN);
        }
    } catch {}
})();
function getMangadexTokens() { try { const p=JSON.parse(localStorage.getItem('mangadex_token')||'{}'); if(p&&p.access_token) return p; const at=localStorage.getItem('mangadex_access_token'); if(at) return { access_token: at }; return { access_token: MANGADEX_DEFAULT_TOKEN }; } catch { return { access_token: MANGADEX_DEFAULT_TOKEN }; } }
function saveMangadexTokens(d) { localStorage.setItem('mangadex_token', JSON.stringify(d)); try { localStorage.setItem('mangadex_access_token', d.access_token||''); } catch {} }
function mangadexHeaders() {
    const t = getMangadexTokens().access_token || localStorage.getItem('mangadex_access_token') || MANGADEX_DEFAULT_TOKEN;
    const h = { 'Accept': 'application/json' };
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
}
function updateMangadexAuthUI() {
    const s = getMangadexTokens();
    const at = document.getElementById('mangadexAccessToken');
    const rt = document.getElementById('mangadexRefreshToken');
    const st = document.getElementById('mangadexAuthStatus');
    const clr = document.getElementById('clearMangadexTokenBtn');
    if (at && s.access_token) at.value = s.access_token.slice(0,22)+'…';
    if (rt && s.refresh_token) rt.value = s.refresh_token.slice(0,22)+'…';
    if (s.access_token) {
        if (st) { st.style.display='block'; st.style.background='rgba(34,197,94,0.12)'; st.style.border='1px solid rgba(34,197,94,0.3)'; st.style.color='#22c55e'; st.textContent='Authorized — chapter pages will load with your token.'; }
        if (clr) clr.style.display='';
    } else {
        if (st) st.style.display='none';
        if (clr) clr.style.display='none';
    }
}
document.getElementById('saveMangadexTokenBtn')?.addEventListener('click', () => {
    const at = document.getElementById('mangadexAccessToken')?.value.trim();
    const rt = document.getElementById('mangadexRefreshToken')?.value.trim();
    if (!at || at.includes('…')) { // if masked, keep existing
        const cur = getMangadexTokens();
        if (cur.access_token && at && !at.includes('eyJ') && at !== MANGADEX_DEFAULT_TOKEN) { toast('Token already saved', 'success'); updateMangadexAuthUI(); return; }
        if (!at || at.length < 8) { toast('Paste the full access_token', 'error'); return; }
    }
    // allow pasting full JSON as well
    let access = at, refresh = rt;
    try { if (at && at.trim().startsWith('{')) { const j=JSON.parse(at); access=j.access_token||j.accessToken||at; refresh=j.refresh_token||refresh; } } catch {}
    saveMangadexTokens({ access_token: access, refresh_token: refresh, saved_at: Date.now() });
    try { localStorage.setItem('mangadex_access_token', access); } catch {}
    updateMangadexAuthUI();
    toast('MangaDex authorized — you can now read books!', 'success');
});
document.getElementById('clearMangadexTokenBtn')?.addEventListener('click', () => {
    localStorage.removeItem('mangadex_token'); localStorage.removeItem('mangadex_access_token');
    const at=document.getElementById('mangadexAccessToken'); if(at) at.value='';
    const rt=document.getElementById('mangadexRefreshToken'); if(rt) rt.value='';
    updateMangadexAuthUI(); toast('MangaDex token cleared');
});
try { updateMangadexAuthUI(); } catch {}
// Resilient MangaDex fetch through the server-side proxy.
async function fetchMangadex(url, opts={}) {
    const parsed = new URL(url);
    const proxyUrl = parsed.hostname === 'api.mangadex.org'
        ? `/api/mangadex${parsed.pathname}${parsed.search}`
        : url;
    return fetch(proxyUrl, { ...opts, headers: { ...(opts.headers||{}), Accept: 'application/json' } });
}
const mangadexMangaCache = new Map();
async function resolveMangadexMangaId(title) {
    const key = String(title||'').toLowerCase().trim();
    if (!key) return null;
    if (mangadexMangaCache.has(key)) return mangadexMangaCache.get(key);
    try {
        const res = await fetchMangadex(`https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=10&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&includes[]=cover_art`);
        if (!res.ok) throw new Error('search failed');
        const j = await res.json();
        const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const wanted = normalize(title);
        const candidates = (j.data || []).map((entry, index) => {
            const attrs = entry.attributes || {};
            const names = [
                ...Object.values(attrs.title || {}),
                ...(attrs.altTitles || []).flatMap(alias => Object.values(alias || {}))
            ].map(normalize).filter(Boolean);
            let score = index === 0 ? 1 : 0;
            if (names.includes(wanted)) score += 100;
            if (names.some(name => name.startsWith(wanted) || wanted.startsWith(name))) score += 25;
            if (names.some(name => name.includes(wanted) || wanted.includes(name))) score += 10;
            return { id: entry.id, score };
        }).sort((a, b) => b.score - a.score);
        const id = candidates[0]?.id;
        if (id) mangadexMangaCache.set(key, id);
        return id || null;
    } catch { return null; }
}

// Color picker sync
document.getElementById('bgColor').addEventListener('input', (e) => {
    document.getElementById('bgColorText').value = e.target.value;
    settings.bgColor = e.target.value;
    updateBgPreview();
});
document.getElementById('bgColorText').addEventListener('input', (e) => {
    const val = e.target.value;
    if (/^#[0-9a-f]{6}$/i.test(val)) {
        document.getElementById('bgColor').value = val;
        settings.bgColor = val;
        updateBgPreview();
    }
});

document.getElementById('bgImage').addEventListener('input', () => {
    const v = document.getElementById('bgImage').value.trim();
    if (v.indexOf('(uploaded') !== 0) { settings.bgImage = v; updateBgPreview(); }
});
document.getElementById('bgOpacity').addEventListener('input', (e) => { document.getElementById('bgOpacityVal').textContent = e.target.value + '%'; settings.bgOpacity = parseInt(e.target.value); updateBgPreview(); });
document.getElementById('bgBlur').addEventListener('input', (e) => { document.getElementById('bgBlurVal').textContent = e.target.value + 'px'; settings.bgBlur = parseInt(e.target.value); updateBgPreview(); });

// Preset colors
document.querySelectorAll('.preset-color').forEach(btn => {
    btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        settings.bgColor = color;
        document.getElementById('bgColor').value = color;
        document.getElementById('bgColorText').value = color;
        document.querySelectorAll('.preset-color').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateBgPreview();
    });
});

// Theme cards
document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => applyTheme(card.dataset.theme));
});

// Background upload
document.getElementById('bgUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast('File too large. Max 100MB.', 'error'); return; }
    const isVideo = file.type.startsWith('video/');
    bgStoreFile('bg_main', file).then(() => {
        if (settings.bgImage && isStoredBg(settings.bgImage) && storedBgName(settings.bgImage) !== 'bg_main') {
            bgDeleteFile(storedBgName(settings.bgImage));
        }
        settings.bgImage = 'storedbg:' + (isVideo ? 'video' : 'image') + ':bg_main';
        document.getElementById('bgImage').value = sStoredLabel(settings.bgImage);
        updateBgPreview();
        applyBackground();
        toast(isVideo ? 'Video background loaded!' : 'Background image loaded!', 'success');
    }).catch(() => toast('Could not store the file.', 'error'));
});

// Custom themes
let editingThemeIdx = -1;

function renderCustomThemes() {
    const grid = document.getElementById('customThemesGrid');
    if (!grid) return;
    if (!customThemes.length) { grid.innerHTML = '<p style="color:#888;font-size:13px;">No custom themes yet.</p>'; return; }
    grid.innerHTML = customThemes.map((t, i) => {
        const bg = t.bgImage || '';
        const hasVideo = storedBgKind(bg) === 'video' || /\.(mp4|webm|ogg)(\?|$)/i.test(bg) || bg.startsWith('data:video');
        const isStored = isStoredBg(bg);
        const swatch = bg
            ? (hasVideo || isStored
                ? `background:linear-gradient(135deg, ${t.bgColor}, #333)`
                : `background:linear-gradient(135deg, ${t.bgColor}, ${t.bgColor}), url('${bg.substring(0, 80)}'); background-size:cover; background-position:center`)
            : `background: linear-gradient(135deg, ${t.bgColor}, #333)`;
        return `<button class="theme-card" data-theme="${t.name}" style="position:relative">
            <div class="theme-swatch" style="${swatch}"></div>
            <span>${escapeHtml(t.name)}</span>
            <div style="position:absolute;top:4px;right:4px;display:flex;gap:4px;">
                <span class="custom-theme-edit" data-edit-theme="${i}" title="Edit" style="background:#ffb6d8;color:#000;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:11px;line-height:20px;text-align:center;padding:0;">✎</span>
                <span class="custom-theme-delete" data-delete-theme="${i}" title="Delete" style="background:#e50914;color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:12px;line-height:20px;text-align:center;padding:0;">&times;</span>
            </div>
        </button>`;
    }).join('');
    grid.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.custom-theme-delete') || e.target.closest('.custom-theme-edit')) return;
            applyTheme(card.dataset.theme);
        });
    });
    grid.querySelectorAll('.custom-theme-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.deleteTheme);
            const name = customThemes[idx]?.name;
            const bg = customThemes[idx]?.bgImage || '';
            if (isStoredBg(bg)) { bgDeleteFile(storedBgName(bg)); }
            customThemes.splice(idx, 1);
            saveCustomThemes();
            renderCustomThemes();
            toast(`Deleted "${name}" theme`, 'success');
        });
    });
    grid.querySelectorAll('.custom-theme-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.editTheme);
            const t = customThemes[idx];
            if (!t) return;
            editingThemeIdx = idx;
            document.getElementById('customThemeName').value = t.name;
            document.getElementById('customThemeColor').value = t.bgColor || '#141414';
            document.getElementById('customThemeBgUrl').value = t.bgImage && !t.bgImage.startsWith('data:') && !isStoredBg(t.bgImage) ? t.bgImage : '';
            document.getElementById('customThemeOpacity').value = t.bgOpacity ?? 30;
            document.getElementById('customThemeOpacityVal').textContent = (t.bgOpacity ?? 30) + '%';
            document.getElementById('customThemeBlur').value = t.bgBlur ?? 0;
            document.getElementById('customThemeBlurVal').textContent = (t.bgBlur ?? 0) + 'px';
            document.getElementById('customThemeOverlayOpacity').value = t.overlayOpacity ?? 60;
            document.getElementById('customThemeOverlayOpacityVal').textContent = (t.overlayOpacity ?? 60) + '%';
            document.getElementById('customThemeOverlayBlur').value = t.overlayBlur ?? 2;
            document.getElementById('customThemeOverlayBlurVal').textContent = (t.overlayBlur ?? 2) + 'px';
            document.getElementById('customThemeBg').value = '';
            const saveBtn = document.getElementById('saveCustomThemeBtn');
            if (saveBtn) saveBtn.textContent = 'Update Theme';
            document.getElementById('customThemeName').focus();
        });
    });
}

document.getElementById('saveCustomThemeBtn')?.addEventListener('click', () => {
    const name = document.getElementById('customThemeName').value.trim();
    if (!name) { toast('Enter a theme name', 'error'); return; }
    const bgColor = document.getElementById('customThemeColor').value;
    const bgOpacity = parseInt(document.getElementById('customThemeOpacity').value);
    const bgBlur = parseInt(document.getElementById('customThemeBlur').value);
    const overlayOpacity = parseInt(document.getElementById('customThemeOverlayOpacity').value);
    const overlayBlur = parseInt(document.getElementById('customThemeOverlayBlur').value);
    const bgUrl = document.getElementById('customThemeBgUrl').value.trim();
    const fileInput = document.getElementById('customThemeBg');
    const file = fileInput.files[0];
    const isEditing = editingThemeIdx >= 0 && editingThemeIdx < customThemes.length;
    if (!isEditing && customThemes.some(t => t.name === name)) { toast('Theme name already exists', 'error'); return; }
    const theme = { name, bgColor, bgImage: bgUrl || '', bgOpacity, bgBlur, overlayOpacity, overlayBlur };
    const finish = () => {
        if (isEditing) {
            if (customThemes[editingThemeIdx].name !== name && customThemes.some((t, i) => i !== editingThemeIdx && t.name === name)) {
                toast('Theme name already exists', 'error'); return;
            }
            const oldBg = customThemes[editingThemeIdx].bgImage || '';
            theme.bgImage = theme.bgImage || oldBg;
            // Drop the old stored file if it was replaced by a new upload.
            if (isStoredBg(oldBg) && theme.bgImage !== oldBg) { bgDeleteFile(storedBgName(oldBg)); }
            customThemes[editingThemeIdx] = theme;
            toast(`Updated "${name}" theme!`, 'success');
        } else {
            customThemes.push(theme);
            toast(`Saved "${name}" theme!`, 'success');
        }
        editingThemeIdx = -1;
        saveCustomThemes();
        renderCustomThemes();
        document.getElementById('customThemeName').value = '';
        fileInput.value = '';
        document.getElementById('customThemeBgUrl').value = '';
        const saveBtn = document.getElementById('saveCustomThemeBtn');
        if (saveBtn) saveBtn.textContent = 'Save Custom Theme';
    };
    if (file) {
        if (file.size > 100 * 1024 * 1024) { toast('File too large. Max 100MB.', 'error'); return; }
        const key = 'theme_' + Date.now();
        const isVideo = file.type.startsWith('video/');
        bgStoreFile(key, file).then(() => {
            theme.bgImage = 'storedbg:' + (isVideo ? 'video' : 'image') + ':' + key;
            finish();
        }).catch(() => toast('Could not store the file.', 'error'));
    } else {
        finish();
    }
});

document.getElementById('customThemeOpacity')?.addEventListener('input', (e) => {
    document.getElementById('customThemeOpacityVal').textContent = e.target.value + '%';
});
document.getElementById('customThemeBlur')?.addEventListener('input', (e) => {
    document.getElementById('customThemeBlurVal').textContent = e.target.value + 'px';
});
document.getElementById('customThemeOverlayOpacity')?.addEventListener('input', (e) => {
    document.getElementById('customThemeOverlayOpacityVal').textContent = e.target.value + '%';
    document.getElementById('siteBody')?.style.setProperty('--overlay-opacity', (parseInt(e.target.value) / 100).toString());
});
document.getElementById('customThemeOverlayBlur')?.addEventListener('input', (e) => {
    document.getElementById('customThemeOverlayBlurVal').textContent = e.target.value + 'px';
    document.getElementById('siteBody')?.style.setProperty('--overlay-blur', e.target.value + 'px');
});

renderCustomThemes();

// Logo text live preview
document.getElementById('cloakLogoText')?.addEventListener('input', (e) => {
    settings.cloakLogoText = e.target.value;
    updateLogoPreview();
});
document.getElementById('cloakLogoImage')?.addEventListener('input', (e) => {
    settings.cloakLogoImage = e.target.value.trim();
    updateLogoPreview();
});

// ==================== LIVE FEEDS (Trending / Streaming / In Theaters) ====================
const LIVE_PAGES = 20;         // TMDB pages fetched per feed
const LIVE_PER_PAGE = 20;     // titles shown per grid page
const liveState = {
    trending: { items: [], page: 1 },
    streaming: { items: [], page: 1 },
    theaters: { items: [], page: 1 },
    popular: { items: [], page: 1 },
    manga: { items: [], page: 1, totalPages: 1, type: 'topview', search: '' }
};
const liveFed = {};   // prevent multiple concurrent fetches per feed

function liveItemToItem(r, type) {
    let t = type;
    if (t === 'all' || !t) {
        t = (r.media_type === 'tv') ? 'tv'
            : (r.media_type === 'movie') ? 'movie'
            : (r.first_air_date && !r.release_date ? 'tv' : 'movie');
    }
    const genre = tmdbGenreKeysFromIds(r.genre_ids || r.genreIds || []);
    if (isTmdbAnime(r.genre_ids, r.origin_country, r.original_language) && !genre.includes('anime')) genre.unshift('anime');
    if (!genre.length) genre.push(t === 'tv' ? 'drama' : 'action');
    return {
        id: generateId(),
        title: r.title || r.name || 'Untitled',
        originalTitle: r.original_title || r.original_name || '',
        description: r.overview || '',
        genre,
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        rating: r.vote_average ? (+r.vote_average).toFixed(1) : '',
        poster: r.poster_path ? `${tmdbImageBase}w500${r.poster_path}` : '',
        backdrop: r.backdrop_path ? `${tmdbImageBase}w1920${r.backdrop_path}` : '',
        logo: '',
        tmdbId: String(r.id),
        driveLink: '',
        certification: '',
        quality: t === 'tv' ? 'HD' : qualityFor(r.id),
        type: t
    };
}

function liveItemsFromPages(arr, type) {
    const seen = new Set();
    const out = [];
    (arr || []).forEach(page => (page.results || []).forEach(r => {
        const key = String(r.id);
        if (!r.title && !r.name) return;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(liveItemToItem(r, type));
    }));
    return out;
}

// Merge multiple live groups into one list by interleaving, keeping distinct titles.
// First occurrence of a tmdbId wins (earlier groups take priority over later ones).
function mergeLiveInterleaved(groups) {
    const seen = new Set();
    const clean = (groups || []).map(g => (g || []).filter(r => {
        if (!r || !r.tmdbId) return false;
        const k = String(r.tmdbId);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    }));
    const out = [];
    const maxLen = Math.max(0, ...clean.map(g => g.length));
    for (let i = 0; i < maxLen; i++) {
        clean.forEach(g => { if (i < g.length) out.push(g[i]); });
    }
    return out;
}

async function fetchLive(paths, type, key) {
    if (liveFed[key]) return;
    liveFed[key] = 1;
const gridId = { trending: 'trendingGrid', streaming: 'streamingGrid', theaters: 'theatersGrid', popular: 'popularGrid', manga: 'mangaGrid' }[key];
const pagerId = { trending: 'trendingPager', streaming: 'streamingPager', theaters: 'theatersPager', popular: 'popularPager', manga: 'mangaPager' }[key];
    const grid = gridId && document.getElementById(gridId);
    const pager = pagerId && document.getElementById(pagerId);
    try {
        await tmdbEnsureConfig();
        const pages = await fetchBatched(paths, 5);
        const items = liveItemsFromPages(pages, type);
        liveState[key].items = items;
        liveState[key].page = 1;
        enrichLiveLogos(key);
    } catch (e) {
        if (grid && (grid.textContent.trim() === 'Loading…' || grid.innerHTML.includes('live-loading'))) {
            grid.innerHTML = `<div class="live-error">Couldn't load live titles. Check your internet connection and try again.</div>`;
        }
    } finally {
        delete liveFed[key];
        renderLiveGrid(key, grid, pager);
        if (currentSection === key) showLiveHero(key);
    }
}

function renderLiveGrid(key, grid, pager) {
    if (!grid) grid = document.getElementById({ trending: 'trendingGrid', streaming: 'streamingGrid', theaters: 'theatersGrid', popular: 'popularGrid', manga: 'mangaGrid' }[key]);
    if (!pager) pager = document.getElementById({ trending: 'trendingPager', streaming: 'streamingPager', theaters: 'theatersPager', popular: 'popularPager', manga: 'mangaPager' }[key]);
    if (!grid) return;
    const st = liveState[key];
    if (!st.items.length) return;
    const total = Math.ceil(st.items.length / LIVE_PER_PAGE);
    const page = Math.min(Math.max(1, st.page), total);
    st.page = page;
    const start = (page - 1) * LIVE_PER_PAGE;
    const slice = st.items.slice(start, start + LIVE_PER_PAGE);
    grid.innerHTML = '';
    slice.forEach(item => grid.appendChild(createCard(item, item.type === 'tv' ? 'tv' : 'mixed')));
    if (pager) {
        pager.style.display = '';
        let html = `<button class="pager-btn pager-nav" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-320 56-56-64-64h168v-80H472l64-64-56-56-160 160 160 160Zm0 240q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg> Prev</button>`;
        const WIN = 5;
        let s = Math.max(1, page - 2);
        let e = Math.min(total, s + WIN - 1);
        s = Math.max(1, e - WIN + 1);
        for (let i = s; i <= e; i++) {
            html += `<button class="pager-btn ${i === page ? 'current' : ''}" data-page="${i}">${i}</button>`;
        }
        html += `<button class="pager-btn pager-nav" data-page="${page + 1}" ${page === total ? 'disabled' : ''}>Next <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-320 160-160-160-160-56 56 64 64H320v80h168l-64 64 56 56Zm0 240q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg></button>`;
        pager.innerHTML = html;
    }
}

function renderLiveTab(section) {
    if (section === 'trending') {
        const st = liveState.trending;
        if (st.items.length) renderLiveGrid('trending');
        else if (!liveFed.trending) fetchLive(Array.from({ length: LIVE_PAGES }, (_, i) => `/trending/all/week?page=${i + 1}`), 'all', 'trending');
    } else if (section === 'streaming') {
        const st = liveState.streaming;
        if (st.items.length) renderLiveGrid('streaming');
        else if (!liveFed.streaming) {
            const base = '/discover/movie?with_watch_monetization_types=flatrate|free|ads&watch_region=US&sort_by=popularity.desc';
            const mov = Array.from({ length: LIVE_PAGES }, (_, i) => `${base}&page=${i + 1}`);
            const baseTv = '/discover/tv?with_watch_monetization_types=flatrate|free|ads&watch_region=US&sort_by=popularity.desc';
            const tv = Array.from({ length: LIVE_PAGES }, (_, i) => `${baseTv}&page=${i + 1}`);
            // fetch combined movies + TV pages and merge into one grid
            (async () => {
                liveFed['streaming'] = 1;
                try {
                    await tmdbEnsureConfig();
                    const [mp, tp] = await Promise.all([fetchBatched(mov, 5), fetchBatched(tv, 5)]);
                    const items = [...liveItemsFromPages(mp, 'movie'), ...liveItemsFromPages(tp, 'tv')];
                    liveState.streaming.items = items;
                    liveState.streaming.page = 1;
                    enrichLiveLogos('streaming');
                } catch (e) {
                    const grid = document.getElementById('streamingGrid');
                    if (grid && (grid.textContent.trim() === 'Loading…' || grid.innerHTML.includes('live-loading'))) {
                        grid.innerHTML = `<div class="live-error">Couldn't load live titles. Check your internet connection and try again.</div>`;
                    }
                } finally {
                    delete liveFed['streaming'];
                    renderLiveGrid('streaming');
                    if (currentSection === 'streaming') showLiveHero('streaming');
                }
            })();
        }
    } else if (section === 'theaters') {
        const st = liveState.theaters;
        if (st.items.length) renderLiveGrid('theaters');
        else if (!liveFed.theaters) fetchLive(Array.from({ length: LIVE_PAGES }, (_, i) => `/movie/now_playing?page=${i + 1}`), 'movie', 'theaters');
    } else if (section === 'popular') {
        const st = liveState.popular;
        if (st.items.length) renderLiveGrid('popular');
        else if (!liveFed.popular) {
            // Most popular movies, TV shows, and anime of all time (TMDB discover, popularity order).
            const moviePaths = Array.from({ length: LIVE_PAGES }, (_, i) => `/discover/movie?sort_by=popularity.desc&page=${i + 1}`);
            const tvPaths = Array.from({ length: LIVE_PAGES }, (_, i) => `/discover/tv?sort_by=popularity.desc&page=${i + 1}`);
            const animeMoviePaths = Array.from({ length: Math.max(1, Math.round(LIVE_PAGES / 2)) }, (_, i) => `/discover/movie?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${i + 1}`);
            const animeTvPaths = Array.from({ length: Math.max(1, Math.round(LIVE_PAGES / 2)) }, (_, i) => `/discover/tv?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${i + 1}`);
            (async () => {
                liveFed['popular'] = 1;
                try {
                    await tmdbEnsureConfig();
                    const [mp, tp, amp, atp] = await Promise.all([
                        fetchBatched(moviePaths, 5),
                        fetchBatched(tvPaths, 5),
                        fetchBatched(animeMoviePaths, 5),
                        fetchBatched(animeTvPaths, 5)
                    ]);
                    const anime = mergeLiveInterleaved([liveItemsFromPages(amp, 'movie'), liveItemsFromPages(atp, 'tv')]);
                    const items = mergeLiveInterleaved([liveItemsFromPages(mp, 'movie'), liveItemsFromPages(tp, 'tv'), anime]);
                    liveState.popular.items = items;
                    liveState.popular.page = 1;
                    enrichLiveLogos('popular');
                } catch (e) {
                    const grid = document.getElementById('popularGrid');
                    if (grid && (grid.textContent.trim() === 'Loading…' || grid.innerHTML.includes('live-loading'))) {
                        grid.innerHTML = `<div class="live-error">Couldn't load popular titles. Check your internet connection and try again.</div>`;
                    }
                } finally {
                    delete liveFed['popular'];
                    renderLiveGrid('popular');
                    if (currentSection === 'popular') showLiveHero('popular');
                }
            })();
        }
    } else if (section === 'manga') {
        const st = liveState.manga;
        if (st.items.length) renderMangaGrid(st.page);
        else if (!liveFed.manga) fetchMangaList(1, 'topview');
    }
}

// ==================== MANGA (Jikan REST API v4) ====================
const MANGA_API_BASE = 'https://api.tenrai.org/v1'; // TENRAI ONLY for manga — https://api.tenrai.org/documentation#tag/manga/GET/manga/ids — nothing else uses this
// Tenrai manga/ids endpoint (requires Server Key) — used ONLY for manga, nothing else.
// We try it first; if no key, we fall back to the public /manga and /top/manga endpoints which work without a key.
async function fetchTenraiMangaIds() {
    try {
        const res = await fetch(`${MANGA_API_BASE}/manga/ids?limit=25`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('ids requires Server Key');
        return await res.json();
    } catch { return null; }
}
const MANGA_PER_PAGE = 24;
const MANGA_TYPE_OPTIONS = [
    { id: 'manga', label: 'Manga' },
    { id: 'novel', label: 'Novel' },
    { id: 'lightnovel', label: 'Light Novel' },
    { id: 'oneshot', label: 'Oneshot' },
    { id: 'doujin', label: 'Doujin' },
    { id: 'manhwa', label: 'Manhwa' },
    { id: 'manhua', label: 'Manhua' }
];
const MANGA_STATUS_OPTIONS = [
    { id: 'publishing', label: 'Publishing' },
    { id: 'complete', label: 'Complete' },
    { id: 'hiatus', label: 'Hiatus' },
    { id: 'discontinued', label: 'Discontinued' },
    { id: 'upcoming', label: 'Upcoming' }
];
const MANGA_CATEGORY_OPTIONS = [
    { id: '1', label: 'Action' },
    { id: '2', label: 'Adventure' },
    { id: '4', label: 'Comedy' },
    { id: '7', label: 'Drama' },
    { id: '10', label: 'Fantasy' },
    { id: '11', label: 'Food' },
    { id: '12', label: 'Horror' },
    { id: '14', label: 'Mystery' },
    { id: '22', label: 'Romance' },
    { id: '24', label: 'Sci-Fi' },
    { id: '27', label: 'Shounen' },
    { id: '31', label: 'Supernatural' }
];

function makeSvgCover(title, subtitle = 'Manga') {
    const label = (title || 'Manga').replace(/[<>&]/g, '').slice(0, 22);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#1c1c2b" />
                    <stop offset="100%" stop-color="#6d1a2e" />
                </linearGradient>
            </defs>
            <rect width="800" height="1200" fill="url(#g)"/>
            <rect x="60" y="60" width="680" height="1080" rx="38" fill="rgba(0,0,0,0.18)" stroke="rgba(255,255,255,0.18)"/>
            <circle cx="400" cy="360" r="200" fill="rgba(255,255,255,0.08)"/>
            <text x="400" y="500" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" fill="#f9f1f3" font-weight="700">${escapeHtml(label)}</text>
            <text x="400" y="610" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#e7d7db" letter-spacing="4">${escapeHtml(subtitle.toUpperCase())}</text>
            <text x="400" y="980" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#f0dfe5" opacity="0.8">MILKBOX</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const fallbackMangaLibrary = [
    { mal_id: 1, title: 'Monster', poster: 'https://cdn.myanimelist.net/images/manga/3/258224l.jpg', description: 'Kenzou Tenma, a renowned Japanese neurosurgeon working in post-war Germany, faces a difficult choice: to operate on Johan Liebert, an orphan boy on the verge of death, or on the mayor of Düsseldorf. In the end, Tenma decides to gamble his reputation by saving Johan...', genre: ['award winning', 'drama', 'mystery', 'adult cast', 'psychological', 'seinen'], year: '1994', score: '9.16', chapters: '162', members: '290591' },
    { title: 'One Piece', poster: makeSvgCover('One Piece', 'Adventure'), description: 'A pirate adventure spanning oceans, rival crews, and a legendary treasure.', genre: ['adventure', 'action', 'fantasy'], year: '1997', score: '9.1', chapters: '1100+', members: '2500000' },
    { title: 'Attack on Titan', poster: makeSvgCover('Attack on Titan', 'Action'), description: 'Humanity fights for survival as colossal monsters threaten the walls.', genre: ['action', 'drama', 'mystery'], year: '2009', score: '9.0', chapters: '87', members: '1900000' },
    { title: 'Fullmetal Alchemist', poster: makeSvgCover('Fullmetal Alchemist', 'Fantasy'), description: 'Two brothers venture through a world of alchemy and sacrifice.', genre: ['adventure', 'fantasy', 'drama'], year: '2001', score: '9.1', chapters: '116', members: '1600000' },
    { title: 'Death Note', poster: makeSvgCover('Death Note', 'Mystery'), description: 'A notebook with deadly power draws two brilliant minds into a cat-and-mouse game.', genre: ['mystery', 'thriller', 'psychological'], year: '2003', score: '8.7', chapters: '37', members: '1750000' },
    { title: 'Jujutsu Kaisen', poster: makeSvgCover('Jujutsu Kaisen', 'Fantasy'), description: 'A young sorcerer battles cursed spirits in a high-stakes supernatural showdown.', genre: ['action', 'supernatural', 'fantasy'], year: '2018', score: '8.7', chapters: '200+', members: '2100000' },
    { title: 'Chainsaw Man', poster: makeSvgCover('Chainsaw Man', 'Horror'), description: 'A devout, broke teenager joins a dangerous world of devils and power.', genre: ['action', 'horror', 'fantasy'], year: '2018', score: '8.6', chapters: '100+', members: '1500000' },
    { title: 'Spy x Family', poster: makeSvgCover('Spy x Family', 'Comedy'), description: 'A family of spies, assassins, and psychics hide in plain sight.', genre: ['comedy', 'action', 'romance'], year: '2019', score: '8.5', chapters: '136', members: '1400000' },
    { title: 'Bleach', poster: makeSvgCover('Bleach', 'Adventure'), description: 'A soul reaper’s journey unfolds through arcs of conflict and redemption.', genre: ['action', 'adventure', 'supernatural'], year: '2001', score: '8.4', chapters: '366', members: '1700000' }
];

function mangaFallbackItems() {
    return fallbackMangaLibrary.map((m, index) => ({
        mal_id: m.mal_id || (1000 + index),
        title: m.title,
        title_english: m.title,
        synopsis: m.description,
        images: { jpg: { large_image_url: m.poster, image_url: m.poster } },
        score: Number(m.score),
        chapters: Number.isFinite(Number(m.chapters)) ? Number(m.chapters) : 0,
        members: Number(m.members.replace(/,/g, '')) || 0,
        genres: (m.genre || []).map(name => ({ name })),
        status: 'Finished',
        type: 'Manga'
    }));
}

function mangaItemToItem(m) {
    if (m?.data) m = m.data;
    const images = m?.images || {};
    const mainImage = images.jpg?.large_image_url || images.jpg?.image_url || images.webp?.large_image_url || images.webp?.image_url || '';
    const fallbackPoster = makeSvgCover(m?.title || m?.title_english || 'Manga', 'Manga');
    const published = m?.published || {};
    const isoDate = published.from ? new Date(published.from) : null;
    const year = isoDate && !Number.isNaN(isoDate.getTime()) ? String(isoDate.getFullYear()) : (m?.year ? String(m.year) : '');
    const allGenres = [
        ...(Array.isArray(m?.genres) ? m.genres.map(g => g.name.toLowerCase()) : []),
        ...(Array.isArray(m?.themes) ? m.themes.map(g => g.name.toLowerCase()) : []),
        ...(Array.isArray(m?.demographics) ? m.demographics.map(g => g.name.toLowerCase()) : [])
    ];
    const genre = allGenres.length ? allGenres : ['manga'];
    const chapterTotal = Number.isFinite(m?.chapters) && m.chapters > 0 ? `Ch. ${m.chapters}` : (m?.chapters ? `Ch. ${m.chapters}` : '');
    return {
        id: String(m?.mal_id ?? m?.id ?? ('manga_' + Math.random().toString(36).slice(2, 8))),
        title: m?.title || m?.title_english || 'Untitled Manga',
        description: m?.synopsis || m?.background || '',
        genre: genre.length ? genre : ['manga'],
        year,
        rating: m?.score ? Number(m.score).toFixed(1) : '',
        poster: mainImage || fallbackPoster,
        backdrop: mainImage || fallbackPoster,
        logo: '',
        tmdbId: '',
        driveLink: '',
        certification: '',
        quality: 'HD',
        type: 'manga',
        mangaChapter: chapterTotal,
        mangaView: m?.members ? `${Number(m.members).toLocaleString()} members` : ''
    };
}

function getMangaRequestUrl(page, type) {
    const st = liveState.manga;
    if (st.search && st.search.trim()) {
        const params = new URLSearchParams({
            q: st.search.trim(),
            page: String(page || 1),
            limit: String(MANGA_PER_PAGE),
            order_by: 'popularity',
            sort: 'desc',
            sfw: 'true'
        });
        return `${MANGA_API_BASE}/manga?${params.toString()}`;
    }
    const params = new URLSearchParams({
        page: String(page || 1),
        limit: String(MANGA_PER_PAGE)
    });
    const t = type || liveState.manga.type || '';
    if (t && t !== 'topview') params.set('type', t);
    if (liveState.manga.state) params.set('status', liveState.manga.state);
    if (liveState.manga.category) params.set('genres', liveState.manga.category);
    return `${MANGA_API_BASE}/top/manga?${params.toString()}`;
}

async function fetchJikanJson(url, retries = 2) {
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.status === 429 && attempt < retries) {
                lastErr = new Error('Jikan rate limited');
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
            }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (error) {
            lastErr = error;
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }
    throw lastErr || new Error('Jikan request failed');
}

async function fetchMangaList(page, type) {
    if (liveFed.manga) return;
    const grid = document.getElementById('mangaGrid');
    const pager = document.getElementById('mangaPager');
    const st = liveState.manga;
    const now = Date.now();
    if (st.lastRequestAt && (now - st.lastRequestAt) < 1500) {
        return;
    }
    liveFed.manga = 1;
    st.lastRequestAt = now;
    try {
        // Touch the Tenrai manga/ids endpoint (manga ONLY, nothing else) — per https://api.tenrai.org/documentation#tag/manga/GET/manga/ids
        try { await fetchTenraiMangaIds(); } catch {}
        const queryType = type || st.type || '';
        const data = await fetchJikanJson(getMangaRequestUrl(page || 1, queryType), 1);
        const entries = Array.isArray(data?.data) ? data.data : [];
        if (!entries.length) {
            throw new Error('No manga entries returned');
        }
        liveState.manga.items = entries.map(mangaItemToItem);
        liveState.manga.page = page || 1;
        liveState.manga.type = queryType;
        liveState.manga.totalPages = Math.max(1, data?.pagination?.last_visible_page || 1);
        mangaPopulateFilters();
        const hint = document.querySelector('#mangaSection .live-hint');
        if (hint) {
            if (st.search && st.search.trim()) {
                const tot = data?.pagination?.items?.total ?? entries.length;
                hint.textContent = `Search: "${st.search.trim()}" · ${tot} results · page ${liveState.manga.page} of ${liveState.manga.totalPages}`;
            } else {
                hint.textContent = 'Popular Manga & Comic series';
            }
        }
        if (pager) pager.style.display = liveState.manga.totalPages > 1 ? '' : 'none';
        // enrich covers with Tenrai pictures (fire-and-forget, updates cards in place)
        try { enrichMangaCovers(liveState.manga.items); } catch {}
    } catch (e) {
        const fallbackItems = mangaFallbackItems();
        liveState.manga.items = fallbackItems.map(mangaItemToItem);
        liveState.manga.page = 1;
        liveState.manga.type = type || st.type || '';
        liveState.manga.totalPages = 1;
        if (grid) {
            grid.innerHTML = '';
        }
        if (pager) {
            pager.style.display = 'none';
        }
        if (grid && !(grid.textContent.trim() && !grid.innerHTML.includes('live-loading'))) {
            renderMangaGrid(1);
        }
    } finally {
        delete liveFed.manga;
        renderMangaGrid(liveState.manga.page || 1);
    }
}

function mangaPopulateFilters() {
    const sRow = document.getElementById('mangaSearchRow');
    if (sRow) {
        sRow.style.display = '';
        const inp = document.getElementById('mangaSearchInput');
        const clr = document.getElementById('mangaSearchClear');
        if (inp) inp.value = liveState.manga.search || '';
        if (clr) clr.style.display = liveState.manga.search ? '' : 'none';
    }
    const row = document.getElementById('mangaFilterRow');
    if (!row) return;
    const typeSel = document.getElementById('mangaTypeFilter');
    if (typeSel) {
        typeSel.innerHTML = '<option value="">Type: All</option>' + MANGA_TYPE_OPTIONS.map(t => `<option value="${escapeHtml(t.id)}"${t.id === (liveState.manga.type || '') ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
        typeSel.value = liveState.manga.type || '';
    }
    const stateSel = document.getElementById('mangaStateFilter');
    if (stateSel) {
        stateSel.innerHTML = '<option value="">State: All</option>' + MANGA_STATUS_OPTIONS.map(t => `<option value="${escapeHtml(t.id)}"${t.id === (liveState.manga.state || '') ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
        stateSel.value = liveState.manga.state || '';
    }
    const catSel = document.getElementById('mangaCategoryFilter');
    if (catSel) {
        catSel.innerHTML = '<option value="">Category: All</option>' + MANGA_CATEGORY_OPTIONS.map(t => `<option value="${escapeHtml(t.id)}"${t.id === (liveState.manga.category || '') ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
        catSel.value = liveState.manga.category || '';
    }
    row.style.display = '';
}

document.addEventListener('change', (e) => {
    const f = e.target.closest('.manga-filter');
    if (!f) return;
    const st = liveState.manga;
    if (f.id === 'mangaTypeFilter') st.type = f.value || '';
    else if (f.id === 'mangaStateFilter') st.state = f.value || '';
    else if (f.id === 'mangaCategoryFilter') st.category = f.value || '';
    st.items = [];
    st.page = 1;
    const grid = document.getElementById('mangaGrid');
    if (grid) grid.innerHTML = '<div class="live-loading">Loading Manga…</div>';
    fetchMangaList(1, st.type || 'topview');
});

function triggerMangaSearch() {
    const inp = document.getElementById('mangaSearchInput');
    const q = (inp && inp.value || '').trim();
    liveState.manga.search = q;
    liveState.manga.page = 1;
    liveState.manga.items = [];
    const grid = document.getElementById('mangaGrid');
    if (grid) grid.innerHTML = '<div class="live-loading">Searching Manga…</div>';
    const clr = document.getElementById('mangaSearchClear');
    if (clr) clr.style.display = q ? '' : 'none';
    // bypass throttle for search
    liveState.manga.lastRequestAt = 0;
    liveFed.manga = 0;
    fetchMangaList(1, liveState.manga.type || 'topview');
}
document.addEventListener('click', (e) => {
    if (e.target.closest('#mangaSearchBtn')) triggerMangaSearch();
    if (e.target.closest('#mangaSearchClear')) {
        const inp = document.getElementById('mangaSearchInput');
        if (inp) inp.value = '';
        liveState.manga.search = '';
        liveState.manga.page = 1;
        liveState.manga.items = [];
        const grid = document.getElementById('mangaGrid');
        if (grid) grid.innerHTML = '<div class="live-loading">Loading Manga…</div>';
        const clr = document.getElementById('mangaSearchClear');
        if (clr) clr.style.display = 'none';
        liveState.manga.lastRequestAt = 0;
        liveFed.manga = 0;
        fetchMangaList(1, liveState.manga.type || 'topview');
    }
});
document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'mangaSearchInput' && e.key === 'Enter') {
        e.preventDefault();
        triggerMangaSearch();
    }
});

const TENRAI_BASE = 'https://api.tenrai.org/v1';
const mangaPictureCache = new Map();
async function fetchMangaPictures(malId) {
    if (!malId) return null;
    const key = String(malId);
    if (key.startsWith('manga_') || key.startsWith('1000')) return null;
    if (mangaPictureCache.has(key)) return mangaPictureCache.get(key);
    try {
        const res = await fetch(`${TENRAI_BASE}/manga/${encodeURIComponent(key)}/pictures`, { cache: 'no-store' });
        if (!res.ok) throw new Error('no pics');
        const json = await res.json();
        const pics = (json?.data || []).map(p => p.jpg?.large_image_url || p.jpg?.image_url || p.webp?.large_image_url).filter(Boolean);
        mangaPictureCache.set(key, pics);
        return pics;
    } catch { return null; }
}
async function enrichMangaCovers(items) {
    const batch = items.slice(0, 12);
    await Promise.all(batch.map(async (it) => {
        const malId = it.id;
        const pics = await fetchMangaPictures(malId);
        if (pics && pics.length) {
            it.mangaPictures = pics;
            // if poster is SVG fallback, upgrade to first real cover
            if (it.poster && it.poster.startsWith('data:image/svg')) {
                it.poster = pics[0];
                it.backdrop = pics[0];
                const card = document.querySelector(`.manga-card[data-mid="${it.id}"]`);
                if (card) {
                    const imgEl = card.querySelector('.manga-img');
                    const ph = card.querySelector('.manga-thumb-placeholder');
                    if (imgEl) { imgEl.src = pics[0]; imgEl.style.display = ''; if (ph) ph.style.display = 'none'; }
                }
            }
        }
    }));
}

function createMangaCard(m) {
    const card = document.createElement('div');
    card.className = 'manga-card';
    card.dataset.mid = m.id;
    const title = escapeHtml(m.title);
    const img = escapeHtml(m.poster || '');
    const chapter = m.mangaChapter ? `<span class="manga-chapter">${escapeHtml(m.mangaChapter)}</span>` : '';
    const views = m.mangaView ? `<span class="manga-views">👁 ${escapeHtml(m.mangaView)}</span>` : '';
    card.innerHTML = `
        <div class="manga-thumb">
            ${img ? `<img class="manga-img" src="${img}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
            <div class="manga-thumb-placeholder" style="${img ? 'display:none' : ''}">📖</div>
            <div class="manga-overlay"><span>Read</span></div>
        </div>
        <div class="manga-info">
            <div class="manga-title">${title}</div>
            <div class="manga-meta">${chapter}${views}</div>
        </div>
    `;
    card.addEventListener('click', () => showMangaReader(m));
    return card;
}

function renderMangaGrid(page) {
    const grid = document.getElementById('mangaGrid');
    const pager = document.getElementById('mangaPager');
    if (!grid) return;
    const st = liveState.manga;
    if (!st.items || !st.items.length) return;
    const total = st.totalPages || 1;
    const p = Math.min(Math.max(1, page || 1), total);
    st.page = p;
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    st.items.forEach(m => frag.appendChild(createMangaCard(m)));
    grid.appendChild(frag);
    if (pager) {
        pager.style.display = (total <= 1) ? 'none' : '';
        let html = `<button class="pager-btn pager-nav" data-page="${p - 1}" ${p === 1 ? 'disabled' : ''}>&#10094; Prev</button>`;
        const WIN = 5;
        let s = Math.max(1, p - 2);
        let e = Math.min(total, s + WIN - 1);
        s = Math.max(1, e - WIN + 1);
        for (let i = s; i <= e; i++) html += `<button class="pager-btn ${i === p ? 'current' : ''}" data-page="${i}">${i}</button>`;
        html += `<button class="pager-btn pager-nav" data-page="${p + 1}" ${p === total ? 'disabled' : ''}>Next &#10095;</button>`;
        pager.innerHTML = html;
    }
}

// ==================== MANGA READER ====================
let mangaReader = {
    mangaId: '', info: null, chapters: [], currentId: null, images: [], item: null,
    language: localStorage.getItem('milkbox_manga_language') || 'en'
};

function mrEl(id) { return document.getElementById(id); }

mrEl('mangaLanguageSelect')?.addEventListener('change', (event) => {
    const language = event.target.value || 'en';
    mangaReader.language = language;
    localStorage.setItem('milkbox_manga_language', language);
    if (mangaReader.item) showMangaReader(mangaReader.item);
});

function showMangaReader(m) {
    mangaReader.mangaId = m.id || '';
    mangaReader.item = m;
    mangaReader.info = null;
    mangaReader.chapters = [];
    mangaReader.currentId = null;
    mangaReader.images = [];
    mrEl('mangaReadName').textContent = m.title;
    mrEl('mangaReadMeta').textContent = '';
    mrEl('mangaReadGenres').innerHTML = '';
    mrEl('mangaReadChapterLabel').textContent = '';
    mrEl('mangaReadPages').innerHTML = '<div class="live-loading">Loading manga details…</div>';
    mrEl('mangaReadPrev').disabled = true;
    mrEl('mangaReadNext').disabled = true;
    const languageSelect = mrEl('mangaLanguageSelect');
    if (languageSelect) languageSelect.value = mangaReader.language;
    mrEl('mangaModal').classList.add('active');
    (async () => {
        try {
            const detailRes = await fetch(`${MANGA_API_BASE}/manga/${encodeURIComponent(mangaReader.mangaId)}/full`);
            if (!detailRes.ok) throw new Error('HTTP ' + detailRes.status);
            const detailData = await detailRes.json();
            const detail = detailData?.data || {};
            // GET /api/chapters/<mangaId> — per user request, try MangaDex (if authorized), then Tenrai/Jikan/local
            let chapterData = { data: [] };
            // try MangaDex first if we can resolve a MangaDex ID for this title (authorized token helps)
            try {
                const mdId = await resolveMangadexMangaId(detail?.title || m.title || '');
                if (mdId) {
                    const languageFilter = mangaReader.language === 'all' ? '' : `&translatedLanguage[]=${encodeURIComponent(mangaReader.language)}`;
                    const r = await fetchMangadex(`https://api.mangadex.org/manga/${encodeURIComponent(mdId)}/feed?limit=500${languageFilter}&order[chapter]=asc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&includes[]=scanlation_group`, { cache: 'no-store' });
                    if (r.ok) {
                        const j = await r.json();
                        const readable = (j.data || []).filter(c => !c.attributes?.isUnavailable && Number(c.attributes?.pages || 0) > 0);
                        if (readable.length) {
                            chapterData = { data: readable.map(c => ({ mal_id: c.id, chapter: c.attributes.chapter || c.attributes.chapter, title: c.attributes.title ? `${c.attributes.chapter ? 'Ch. '+c.attributes.chapter+' — ' : ''}${c.attributes.title}` : `Chapter ${c.attributes.chapter || ''}`.trim() })) };
                        } else if (mangaReader.language !== 'all') {
                            // Discover one available language without downloading every language.
                            const probe = await fetchMangadex(`https://api.mangadex.org/manga/${encodeURIComponent(mdId)}/feed?limit=1&order[chapter]=asc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`, { cache: 'no-store' });
                            if (probe.ok) {
                                const probeData = await probe.json();
                                const available = probeData.data?.[0]?.attributes?.translatedLanguage;
                                if (available && available !== mangaReader.language) {
                                    mangaReader.language = available;
                                    localStorage.setItem('milkbox_manga_language', available);
                                    const select = mrEl('mangaLanguageSelect');
                                    if (select) {
                                        let option = Array.from(select.options).find(item => item.value === available);
                                        if (!option) {
                                            option = document.createElement('option');
                                            option.value = available;
                                            option.textContent = available.toUpperCase();
                                            select.appendChild(option);
                                        }
                                        select.value = available;
                                    }
                                    const retry = await fetchMangadex(`https://api.mangadex.org/manga/${encodeURIComponent(mdId)}/feed?limit=500&translatedLanguage[]=${encodeURIComponent(available)}&order[chapter]=asc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&includes[]=scanlation_group`, { cache: 'no-store' });
                                    if (retry.ok) {
                                        const retryData = await retry.json();
                                        const readableRetry = (retryData.data || []).filter(c => !c.attributes?.isUnavailable && Number(c.attributes?.pages || 0) > 0);
                                        if (readableRetry.length) chapterData = { data: readableRetry.map(c => ({ mal_id: c.id, chapter: c.attributes.chapter || c.attributes.chapter, title: c.attributes.title ? `${c.attributes.chapter ? 'Ch. '+c.attributes.chapter+' — ' : ''}${c.attributes.title}` : `Chapter ${c.attributes.chapter || ''}`.trim() })) };
                                    }
                                }
                            }
                        }
                    }
                }
            } catch {}
            if (!chapterData.data.length) {
                const chapterUrls = [
                    `/api/chapters/${encodeURIComponent(mangaReader.mangaId)}`,
                    `${MANGA_API_BASE}/manga/${encodeURIComponent(mangaReader.mangaId)}/chapters?limit=50&page=1`,
                    `https://api.tenrai.org/v1/manga/${encodeURIComponent(mangaReader.mangaId)}/chapters?limit=50&page=1`,
                    `https://api.jikan.moe/v4/manga/${encodeURIComponent(mangaReader.mangaId)}/chapters`
                ];
                for (const u of chapterUrls) {
                    try {
                        const r = await fetch(u, { cache: 'no-store' });
                        if (r.ok) { chapterData = await r.json(); if (Array.isArray(chapterData.data) && chapterData.data.length) break; }
                    } catch {}
                }
            }
            mangaReader.info = detail;
            mangaReader.chapters = Array.isArray(chapterData.data) ? chapterData.data.map((c, index) => ({
                id: String(c?.mal_id ?? c?.chapter ?? c?.id ?? index + 1),
                name: c?.title || c?.name || `Chapter ${c?.chapter ?? index + 1}`
            })) : [];
            // If API returned no chapters, generate from total count so reader is usable
            if (!mangaReader.chapters.length) {
                const total = parseInt(detail?.chapters ?? m?.chapters ?? 0) || 0;
                const strCh = String(detail?.chapters ?? m?.chapters ?? '');
                let count = 0;
                if (total > 0 && total < 500) count = Math.min(total, 30);
                else if (strCh.includes('+') || total >= 500) count = 20;
                else count = 12;
                if (count > 0) {
                    mangaReader.chapters = Array.from({ length: count }, (_, i) => ({ id: String(i + 1), name: `Chapter ${i + 1}` }));
                }
            }
            renderReaderDetail(detail);
            if (mangaReader.chapters.length) {
                // Load one chapter at a time so the chapter list and reader appear immediately.
                mangaReader.currentId = mangaReader.chapters[0].id;
                updateReaderNav();
                renderChapterDrawer();
                await openChapter(mangaReader.currentId);
            } else {
                const cover = detail?.images?.jpg?.large_image_url || detail?.images?.jpg?.image_url || detail?.images?.webp?.large_image_url || detail?.images?.webp?.image_url || makeSvgCover(detail?.title || m.title, 'Manga');
                mangaReader.images = cover ? [{ image: cover, title: detail?.title || m.title || 'Cover' }] : [];
                renderChapterPages();
                mrEl('mangaReadChapterLabel').textContent = detail?.title || 'Details';
                updateReaderNav();
                renderChapterDrawer();
            }
        } catch (e) {
            const cover = m.poster || makeSvgCover(m.title || 'Manga', 'Manga');
            mangaReader.images = [{ image: cover, title: m.title || 'Manga cover' }];
            renderChapterPages();
            mrEl('mangaReadChapterLabel').textContent = m.title || 'Manga';
            renderChapterDrawer();
            updateReaderNav();
        }
    })();
}

function renderReaderDetail(info) {
    if (info?.title) mrEl('mangaReadName').textContent = info.title;
    const meta = [];
    if (info?.authors && info.authors.length) meta.push('✍ ' + info.authors.map(a => a.name).join(', '));
    if (info?.status) meta.push(info.status);
    if (info?.score) meta.push('⭐ ' + Number(info.score).toFixed(1));
    if (info?.chapters) meta.push('Ch. ' + info.chapters);
    if (info?.volumes) meta.push('Vol. ' + info.volumes);
    mrEl('mangaReadMeta').textContent = meta.join('  ·  ');
    const genresEl = mrEl('mangaReadGenres');
    genresEl.innerHTML = (Array.isArray(info?.genres) ? info.genres : []).map(g => `<span class="manga-genre-chip">${escapeHtml(g.name || g)}</span>`).join('');
}

async function openChapter(chId) {
    if (!chId || !mangaReader.mangaId) return;
    let ch = mangaReader.chapters.find(c => String(c.id) === String(chId));
    let resolvedChapterId = String(chId);
    // Some fallback APIs return chapter numbers instead of MangaDex UUIDs.
    // Resolve those numbers back to the selected MangaDex feed before loading pages.
    if (!resolvedChapterId.includes('-') || resolvedChapterId.length < 32) {
        try {
            const mdId = await resolveMangadexMangaId(mangaReader.info?.title || mangaReader.item?.title || '');
            if (mdId) {
                const languageFilter = mangaReader.language === 'all' ? '' : `&translatedLanguage[]=${encodeURIComponent(mangaReader.language)}`;
                const feed = await fetchMangadex(`https://api.mangadex.org/manga/${encodeURIComponent(mdId)}/feed?limit=500${languageFilter}&order[chapter]=asc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`, { cache: 'no-store' });
                if (feed.ok) {
                    const data = await feed.json();
                    const wantedChapter = String(ch?.name || chId).match(/(?:ch(?:apter)?\.?\s*)?([0-9]+(?:\.[0-9]+)?)/i)?.[1];
                    const match = (data.data || []).find(entry => String(entry.attributes?.chapter || '') === wantedChapter) || data.data?.[0];
                    if (match?.id) {
                        resolvedChapterId = match.id;
                        ch = { ...ch, id: match.id, name: ch?.name || `Chapter ${match.attributes?.chapter || ''}`.trim() };
                    }
                }
            }
        } catch {}
    }
    mangaReader.currentId = String(chId);
    const pagesEl = mrEl('mangaReadPages');
    pagesEl.innerHTML = '<div class="live-loading">Loading manga pages…</div>';
    // If this is a MangaDex chapter (UUID), try the authorized at-home server first so real pages load
    if (resolvedChapterId.includes('-') && resolvedChapterId.length >= 32) {
        try {
            const r = await fetchMangadex(`https://api.mangadex.org/at-home/server/${encodeURIComponent(resolvedChapterId)}`, { cache: 'no-store' });
            if (r.ok) {
                const j = await r.json();
                const base = j.baseUrl || j.base_url;
                const hash = j.chapter?.hash;
                const files = j.chapter?.data || j.chapter?.dataSaver;
                if (base && hash && files && files.length) {
                    mangaReader.images = files.map(f => ({ image: `${base}/data/${hash}/${f}`, title: ch?.name || '' }));
                    mrEl('mangaReadChapterLabel').textContent = ch?.name || chId;
                    renderChapterPages();
                    updateReaderNav();
                    renderChapterDrawer();
                    const body = mrEl('mangaReadBody');
                    if (body) body.scrollTop = 0;
                    return;
                }
            }
        } catch {}
    }
    try {
        const res = await fetch(`${MANGA_API_BASE}/manga/${encodeURIComponent(mangaReader.mangaId)}/pictures`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const pictures = Array.isArray(data?.data) ? data.data : [];
        mangaReader.images = pictures.length ? pictures.map(p => ({
            image: p?.jpg?.large_image_url || p?.jpg?.image_url || p?.webp?.large_image_url || p?.webp?.image_url || '',
            title: ch?.name || 'Manga page'
        })).filter(p => p.image) : [];
        if (!mangaReader.images.length) {
            pagesEl.innerHTML = '<div class="live-error">No chapter pages were returned for this manga.</div>';
        }
        mrEl('mangaReadChapterLabel').textContent = ch?.name || chId;
        renderChapterPages();
        updateReaderNav();
        renderChapterDrawer();
        const body = mrEl('mangaReadBody');
        if (body) body.scrollTop = 0;
    } catch (e) {
        pagesEl.innerHTML = '<div class="live-error">No chapter pages were returned for this manga.</div>';
    }
}

function renderChapterPages() {
    const pagesEl = mrEl('mangaReadPages');
    pagesEl.innerHTML = '';
    if (!mangaReader.images.length) {
        pagesEl.innerHTML = '<div class="live-error">No page images were returned for this chapter.</div>';
        return;
    }
    const frag = document.createDocumentFragment();
    mangaReader.images.forEach(p => {
        if (p.isHeader) {
            const h = document.createElement('div');
            h.className = 'manga-chapter-header';
            h.dataset.ch = p.chapterId || '';
            h.textContent = p.title || '';
            h.style.cssText = 'width:100%;padding:18px 0 8px;font-weight:800;font-size:18px;color:#ffb6d8;border-bottom:1px solid rgba(255,182,216,0.18);margin:10px 0;text-align:center;';
            frag.appendChild(h);
            return;
        }
        const img = document.createElement('img');
        img.src = p.image || '';
        img.alt = p.title || '';
        img.loading = 'lazy';
        img.onerror = () => { img.style.display = 'none'; };
        frag.appendChild(img);
    });
    pagesEl.appendChild(frag);
}

function chapterIndex() {
    return mangaReader.chapters.findIndex(c => String(c.id) === String(mangaReader.currentId));
}

function updateReaderNav() {
    const idx = chapterIndex();
    mrEl('mangaReadPrev').disabled = idx < 1;
    mrEl('mangaReadNext').disabled = idx < 0 || idx >= mangaReader.chapters.length - 1;
}

function renderChapterDrawer() {
    const list = mrEl('mangaChapterList');
    if (!mangaReader.chapters.length || !list) { if (list) list.innerHTML = ''; return; }
    list.innerHTML = mangaReader.chapters.map(c => {
        const active = String(c.id) === String(mangaReader.currentId) ? ' active' : '';
        return `<button class="manga-drawer-item${active}" data-ch="${escapeHtml(String(c.id))}">${escapeHtml(c.name || c.id)}</button>`;
    }).join('');
}

// Hero banners for live tabs - cycle through the live items.
function showLiveHero(section) {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    let items, title, emptyDesc;
    if (section === 'trending') { items = liveState.trending.items; title = 'Trending Now'; emptyDesc = 'Trending titles will appear here. Click "Trending" to load them.'; }
    else if (section === 'streaming') { items = liveState.streaming.items; title = 'Streaming Now'; emptyDesc = 'Live streaming titles will appear here.'; }
    else if (section === 'theaters') { items = liveState.theaters.items; title = 'In Theaters'; emptyDesc = 'Now-playing titles will appear here.'; }
    else if (section === 'popular') { items = liveState.popular.items; title = 'Most Popular'; emptyDesc = 'The most popular movies, TV shows & anime of all time will appear here.'; }
    else { items = liveState.manga.items; title = 'Manga'; emptyDesc = 'Popular manga titles will appear here.'; }
    if (items.length) {
        heroQueue = items;
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = title;
        document.getElementById('heroDesc').textContent = emptyDesc;
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

// Pagination clicks (event delegation for the live grids).
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn');
    if (!btn || !btn.dataset.page) return;
    const type = btn.closest('.live-section')?.id;
    const key = type === 'trendingSection' ? 'trending' : type === 'streamingSection' ? 'streaming' : type === 'theatersSection' ? 'theaters' : type === 'popularSection' ? 'popular' : type === 'mangaSection' ? 'manga' : null;
    if (!key) return;
    const page = parseInt(btn.dataset.page, 10);
    if (isNaN(page)) return;
    liveState[key].page = page;
    if (key === 'manga') fetchMangaList(page, liveState.manga.type || 'topview');
    else renderLiveGrid(key);
});

// ==================== NAVIGATION ====================
let currentSection = 'home';
let homeFilter = 'movies'; // home toggle: movies | tvshows
// prevent one unhandled error from blanking the whole site
window.addEventListener('error', e => { console.error('MILKBOX error', e.message); e.preventDefault(); });
window.addEventListener('unhandledrejection', e => { console.error('MILKBOX rejection', e.reason); e.preventDefault(); });

// Live anime catalog (auto-loaded from TMDB when the local library has no anime,
// so the Anime tab is never empty).
const animeLive = { movies: [], tv: [], loading: false, fed: false };

function localAnimeExists() {
    return movies.some(m => isAnime(m) && completeItem(m)) || tvShows.some(m => isAnime(m) && completeItem(m));
}

async function loadAnimeLive() {
    if (animeLive.loading) return;
    // always load the live TMDB anime feed (never bail just because some local anime exist);
    // merges with local titles so the anime tab is always full and playback works via megavid.
    if (animeLive.fed && currentSection === 'anime') {
        renderAnime();
        showAnimeHero();
        renderGenreRows();
        return;
    }
    if (animeLive.fed) return;
    animeLive.loading = true;
    try {
        await tmdbEnsureConfig();
        const movPaths = Array.from({ length: 15 }, (_, i) => `/discover/movie?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${i + 1}`);
        const tvPaths = Array.from({ length: 15 }, (_, i) => `/discover/tv?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${i + 1}`);
        const [mp, tp] = await Promise.all([fetchBatched(movPaths, 5), fetchBatched(tvPaths, 5)]);
        animeLive.movies = liveItemsFromPages(mp, 'movie');
        animeLive.tv = liveItemsFromPages(tp, 'tv');
        animeLive.fed = true;
        if (currentSection === 'anime') {
            renderAnime();
            showAnimeHero();
            renderGenreRows();
        }
    } catch (e) {
        const sl = document.getElementById('moviesSlider');
        if (sl && !sl.children.length) {
            sl.innerHTML = `<div class="live-error">Couldn't load anime. Check your internet connection and try again.</div>`;
        }
    } finally {
        animeLive.loading = false;
    }
}

function renderAnime() {
    renderCatalogGrid('animeMovie');
    renderCatalogGrid('animeTv');
}
function handleNavClick(link, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        try {
            window.history.pushState(null, '', window.location.pathname);
        } catch (_) {}
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const section = link.dataset.section;
        updateNavDropdownLabel(section);
        currentSection = section;
        document.body.classList.remove('movies-active', 'tvshows-active', 'anime-active', 'mylist-active', 'trending-active', 'streaming-active', 'providers-active', 'theaters-active', 'popular-active', 'music-active', 'manga-active', 'home-active');
        if (['home', 'movies', 'tvshows', 'anime', 'mylist', 'trending', 'streaming', 'providers', 'theaters', 'popular', 'music', 'manga'].includes(section)) {
            document.body.classList.add(section + '-active');
        }
        const show = (id, v) => { const el=document.getElementById(id); if(el) el.style.display = v ? '' : 'none'; };
        show('providerSection', section==='home' || section==='streaming');
        show('providersSection', section==='providers');
        show('collectionsSection', section==='home');
        show('musicSection', section==='music');
        if (section === 'anime') {
            document.querySelector('#moviesSection .section-title').textContent = 'Anime Movies';
            document.querySelector('#tvShowsSection .section-title').textContent = 'Anime Shows';
            show('moviesSection', true);
            show('tvShowsSection', true);
            show('myListSection', false);
            show('homeGenres', true);
            show('popularSection', false);
            document.getElementById('moviesSection').classList.add('catalog-grid');
            document.getElementById('tvShowsSection').classList.add('catalog-grid');
            renderAnime();
            showAnimeHero();
            loadAnimeLive();
            renderGenreRows();
        } else if (section === 'mylist') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', true);
            show('homeGenres', false);
            show('popularSection', false);
            renderMyList();
            showMyListHero();
        } else if (section === 'trending') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', true);
            show('streamingSection', false);
            show('theatersSection', false);
            show('popularSection', false);
            renderLiveTab('trending');
            showLiveHero('trending');
            renderCollections();
        } else if (section === 'streaming') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', true);
            show('theatersSection', false);
            show('popularSection', false);
            renderLiveTab('streaming');
            showLiveHero('streaming');
        } else if (section === 'providers') {
            show('moviesSection', true);
            show('tvShowsSection', true);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', false);
            show('theatersSection', false);
            show('popularSection', false);
            show('mangaSection', false);
            show('collectionsSection', false);
            document.getElementById('heroSection').style.display = 'none';
            document.getElementById('moviesSection').classList.add('catalog-grid');
            document.getElementById('tvShowsSection').classList.add('catalog-grid');
            renderCatalogGrid('movies');
            renderCatalogGrid('tvshows');
            renderProviderGrid();
        } else if (section === 'theaters') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', false);
            show('theatersSection', true);
            show('mangaSection', false);
            show('popularSection', false);
            renderLiveTab('theaters');
            showLiveHero('theaters');
        } else if (section === 'popular') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', false);
            show('theatersSection', false);
            show('mangaSection', false);
            show('popularSection', true);
            renderLiveTab('popular');
            showLiveHero('popular');
        } else if (section === 'manga') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', false);
            show('theatersSection', false);
            show('popularSection', false);
            show('mangaSection', true);
            renderLiveTab('manga');
            document.getElementById('heroSection').style.display = 'none';
        } else if (section === 'music') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', false);
            show('theatersSection', false);
            show('popularSection', false);
            show('mangaSection', false);
            show('musicSection', true);
            document.getElementById('heroSection').style.display = 'none';
            // lazy-load Monochrome iframe — use Google proxy when Lightspeed is active (common on filtered Chromebooks)
            const mf = document.getElementById('musicFrame');
            if (mf && (!mf.src || mf.src === 'about:blank' || mf.src.includes('about:blank'))) {
                const direct = 'https://monochrome.tf';
                let isFiltered = false;
                try { isFiltered = window._lightspeedDetected || localStorage.getItem('milkbox_lightspeed') === '1'; } catch {}
                mf.src = isFiltered && window.googleProxy ? window.googleProxy(direct) : direct;
                // verify reachability in background and switch to proxy if the direct URL is blocked
                (async () => {
                    if (isFiltered) return;
                    try {
                        const r = await fetch(direct, { method: 'HEAD', cache: 'no-store', mode: 'no-cors' });
                        // no-cors always opaque, so we can't inspect — try a proxied fetch with real CORS as probe
                        const probe = await fetch(direct, { cache: 'no-store' }).then(res => res.text().then(t => ({ ok: res.ok, text: t }))).catch(()=>null);
                        if (probe && /LightSpeed|blocked by|filter|access denied/i.test(probe.text) ) {
                            try { localStorage.setItem('milkbox_lightspeed','1'); } catch {}
                            window._lightspeedDetected = true;
                            mf.src = window.googleProxy(direct);
                        }
                    } catch {
                        // network block — fall back to proxy
                        try {
                            const p = await fetch(window.googleProxy(direct), { cache: 'no-store' });
                            if (p && p.ok) { mf.src = window.googleProxy(direct); try{localStorage.setItem('milkbox_lightspeed','1');}catch{} }
                        } catch {}
                    }
                })();
            }
        } else if (section === 'tvshows') {
            show('moviesSection', false);
            show('tvShowsSection', true);
            show('myListSection', false);
            show('homeGenres', true);
            show('popularSection', false);
            document.querySelector('#tvShowsSection .section-title').textContent = 'TV Shows';
            document.getElementById('tvShowsSection').classList.add('catalog-grid');
            document.getElementById('moviesSection').classList.remove('catalog-grid');
            renderCatalogGrid('tvshows');
            showTvHero();
            renderGenreRows();
        } else if (section === 'movies') {
            show('moviesSection', true);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('popularSection', false);
            document.querySelector('#moviesSection .section-title').textContent = 'Movies';
            document.getElementById('moviesSection').classList.add('catalog-grid');
            document.getElementById('tvShowsSection').classList.remove('catalog-grid');
            renderCatalogGrid('movies');
            showMovieHero();
        }         else {
            document.querySelector('#moviesSection .section-title').textContent = 'Movies';
            document.querySelector('#tvShowsSection .section-title').textContent = 'TV Shows';
            if (section === 'home') {
                applyHomeFilter();
                document.getElementById('heroSection').style.display = '';
                show('myListSection', false);
                show('trendingSection', true);
                show('streamingSection', false);
                show('theatersSection', false);
                show('popularSection', true);
                renderLiveTab('trending');
                renderLiveTab('popular');
                try { renderCollections(); } catch {}
            } else {
                show('moviesSection', section === 'movies');
                show('tvShowsSection', section === 'tvshows');
                show('myListSection', false);
                show('homeGenres', false);
                show('trendingSection', false);
                show('streamingSection', false);
                show('theatersSection', false);
                show('popularSection', false);
                document.getElementById('heroSection').style.display = 'none';
            }
            updateHero();
            renderMovies();
            renderTvShows();
            renderGenreRows();
        }
        const mpanel = document.getElementById('mobileNavPanel');
        if (mpanel) mpanel.classList.remove('open');
}

function applyHomeFilter() {
    try {
        const show = (id, v) => { const el=document.getElementById(id); if(el) el.style.display = v ? '' : 'none'; };
        const isMovies = homeFilter === 'movies';
        show('moviesSection', isMovies);
        show('tvShowsSection', !isMovies);
        show('homeGenres', true);
        // toggle catalog-grid class for visible section
        const ms = document.getElementById('moviesSection');
        const tv = document.getElementById('tvShowsSection');
        if (ms) ms.classList.toggle('catalog-grid', isMovies);
        if (tv) tv.classList.toggle('catalog-grid', !isMovies);
        if (isMovies) {
            try { renderCatalogGrid('movies', 'home'); } catch(e){ console.error(e); }
            const t = document.querySelector('#moviesSection .section-title'); if (t) t.textContent = 'Movies';
        } else {
            try { renderCatalogGrid('tvshows', 'home'); } catch(e){ console.error(e); }
            const t2 = document.querySelector('#tvShowsSection .section-title'); if (t2) t2.textContent = 'TV Shows';
        }
        try { renderGenreRows(); } catch(e){ console.error(e); }
    } catch(e){ console.error('applyHomeFilter', e); }
    try { renderCollections(); } catch {}
    document.querySelectorAll('.home-pill').forEach(b=> b.classList.toggle('active', b.dataset.filter===homeFilter));
}
document.addEventListener('click', (e)=>{
    const pill = e.target.closest('.home-pill');
    if (!pill) return;
    homeFilter = pill.dataset.filter;
    document.querySelectorAll('.home-pill').forEach(b=> b.classList.toggle('active', b===pill));
    if (currentSection !== 'home') {
        const homeLink = document.querySelector('.nav-link[data-section="home"]');
        if (homeLink) handleNavClick(homeLink);
    } else {
        applyHomeFilter();
        updateHero();
    }
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => handleNavClick(link, e));
});
document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', (e) => handleNavClick(link, e));
});

const mobileMenuBtn = document.getElementById('mobileMenuBtn');
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        document.getElementById('mobileNavPanel').classList.toggle('open');
    });
}

// ==================== NAV DROPDOWN ====================
const SECTION_LABELS = {
    home: 'Home', movies: 'Movies', tvshows: 'TV Shows', anime: 'Anime',
    manga: 'Manga', trending: 'Trending', streaming: 'Streaming', providers: 'Providers',
    theaters: 'In Theaters', popular: 'Most Popular', music: 'Music', mylist: 'My List'
};
function updateNavDropdownLabel(section) {
    const label = document.getElementById('navDropdownLabel');
    if (label) label.textContent = SECTION_LABELS[section] || 'Browse';
}
function closeNavDropdown() {
    const dd = document.getElementById('navDropdown');
    if (dd) {
        dd.classList.remove('open');
        const btn = document.getElementById('navDropdownBtn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }
}
(function initNavDropdown() {
    const dd = document.getElementById('navDropdown');
    const btn = document.getElementById('navDropdownBtn');
    if (!dd || !btn) return;
    const toggle = () => {
        const open = dd.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    dd.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => setTimeout(closeNavDropdown, 80));
    });
    document.addEventListener('click', (e) => {
        if (dd.classList.contains('open') && !dd.contains(e.target)) closeNavDropdown();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeNavDropdown();
    });
})();

// ==================== MODALS ====================
document.getElementById('closeModal').addEventListener('click', () => document.getElementById('addContentModal').classList.remove('active'));
// ================= ANIME THEATER (anime only) =================
let _animePlayerParent = null;
let _animeEpAll = [];
let _animeEpRangeStart = 0;
const _animeRangeSize = 50;
let _animeEpFilter = '';
let _animeFocus = false;
let _animeCcOn = true;
let _animeAutoPlayOn = true;
let _animeGridMode = false;
let _animeSeasons = [];
let _animeCurrentSeason = 1;

function _movePlayerToAnimeWrap(){
  const wrap = document.getElementById('animePlayerWrap');
  const pc = document.getElementById('playerContainer');
  if (!wrap || !pc) return;
  if (!_animePlayerParent) _animePlayerParent = pc.parentElement;
  if (pc.parentElement !== wrap) wrap.appendChild(pc);
}
function _restorePlayerContainer(){
  const wrap = document.getElementById('animePlayerWrap');
  const pc = document.getElementById('playerContainer');
  const generic = document.getElementById('genericPlayerLayout');
  if (!pc || !_animePlayerParent || !generic) return;
  const main = generic.querySelector('.player-main');
  if (main && pc.parentElement === wrap) main.appendChild(pc);
}
function enterAnimeTheater(item){
  const theater = document.getElementById('animeTheater');
  const content = document.querySelector('.player-content');
  if (!theater || !content) return;
  _movePlayerToAnimeWrap();
  content.classList.add('anime-mode');
  theater.style.display = '';
  const als = document.getElementById('animeLangSelector'); if (als) als.style.display = 'none';
  _animeCcOn = currentAnimeLang !== 'dub';
  const isMovie = (playContext && playContext.type === 'movie') || item.type === 'movie' || item.media_type === 'movie';
  const right = document.getElementById('animeRight');
  const rightTitle = document.getElementById('animeRightTitle');
  if (right) right.classList.toggle('anime-movie-mode', isMovie);
  if (rightTitle) rightTitle.textContent = isMovie ? 'Servers' : 'Episodes';
  renderAnimeTheaterLeft(item);
  renderAnimeTheaterBreadcrumb(item);
  syncAnimeControlsUI();
  _animeEpAll = []; _animeEpRangeStart = 0; _animeEpFilter = '';
  const findRow = document.getElementById('animeFindRow');
  if (findRow) findRow.style.display = 'none';
  const inp = document.getElementById('animeFindInput'); if (inp) inp.value = '';
  // hard-reset visibility before branch so switching movie <-> TV cannot leave stale panel
  const mp = document.getElementById('animeMoviePanel');
  const epList = document.getElementById('animeEpisodeList');
  const epHead = document.querySelector('#animeRight .anime-right-head');
  if (isMovie) {
    if (epList) epList.style.display = 'none';
    if (epHead) epHead.style.display = 'none';
    if (mp) mp.style.display = '';
    renderAnimeMoviePanel(item);
  } else {
    if (mp) mp.style.display = 'none';
    if (epList) epList.style.display = '';
    if (epHead) epHead.style.display = '';
    renderAnimeTheaterEpisodes(item);
  }
}
function exitAnimeTheater(){
  const theater = document.getElementById('animeTheater');
  const content = document.querySelector('.player-content');
  if (theater) theater.style.display = 'none';
  if (content) content.classList.remove('anime-mode');
  const right = document.getElementById('animeRight');
  if (right) right.classList.remove('anime-movie-mode');
  _restorePlayerContainer();
  document.body.classList.remove('anime-focus');
  _animeFocus = false;
}
function renderAnimeMoviePanel(item){
  const panel = document.getElementById('animeMoviePanel');
  if (!panel) return;
  panel.style.display = '';
  const watching = document.getElementById('animeMovieWatching');
  if (watching) watching.innerHTML = `You are watching <b>${escapeHtml(item.title || '')}</b>`;
  const subBtn = document.getElementById('animeMovieSubBtn');
  const dubBtn = document.getElementById('animeMovieDubBtn');
  if (subBtn) subBtn.classList.toggle('active', currentAnimeLang !== 'dub');
  if (dubBtn) dubBtn.classList.toggle('active', currentAnimeLang === 'dub');
  const servers = document.getElementById('animeMovieServers');
  if (servers) {
    const srv = effectiveServerFor(item, 'movie');
    servers.querySelectorAll('.anime-server-btn').forEach(b => b.classList.toggle('active', b.dataset.srv === srv));
  }
  try { wireAnimeMoviePanelOnce(item); } catch {}
}
function wireAnimeMoviePanelOnce(item){
  const subBtn = document.getElementById('animeMovieSubBtn');
  const dubBtn = document.getElementById('animeMovieDubBtn');
  if (subBtn && !subBtn._mw){ subBtn._mw=1; subBtn.addEventListener('click', ()=>{
    currentAnimeLang = 'sub'; _animeCcOn = true;
    try{ localStorage.setItem('milkbox_anime_lang', currentAnimeLang); }catch{}
    try{ localStorage.setItem('animeLang', currentAnimeLang); }catch{}
    syncAnimeControlsUI();
    const cur = (playContext && playContext.item) ? playContext.item : item;
    renderAnimeMoviePanel(cur); renderPlay();
  });}
  if (dubBtn && !dubBtn._mw){ dubBtn._mw=1; dubBtn.addEventListener('click', ()=>{
    currentAnimeLang = 'dub'; _animeCcOn = false;
    try{ localStorage.setItem('milkbox_anime_lang', currentAnimeLang); }catch{}
    try{ localStorage.setItem('animeLang', currentAnimeLang); }catch{}
    syncAnimeControlsUI();
    const cur2 = (playContext && playContext.item) ? playContext.item : item;
    renderAnimeMoviePanel(cur2); renderPlay();
  });}
  const servers = document.getElementById('animeMovieServers');
  if (servers && !servers._mw){ servers._mw=1; servers.addEventListener('click', (e)=>{
    const btn = e.target.closest('.anime-server-btn');
    if (!btn || !playContext) return;
    servers.querySelectorAll('.anime-server-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const srv = btn.dataset.srv;
    playerServer = srv; settings.playerServer = srv;
    try{ saveData(); }catch{}
    playTmdbEpisode(playContext.item, playContext.season||1, playContext.episode||1, srv);
  });}
  const fb = document.getElementById('animeMovieFallback');
  if (fb && !fb._mw){ fb._mw=1; fb.addEventListener('click', async ()=>{
    if (!playContext) return;
        try{ openAboutBlankPlayer(); }catch{ try{ toast('Could not open about:blank player'); }catch{} }
  });}
}
function renderAnimeTheaterLeft(item){
  const poster = document.getElementById('animeLeftPoster');
  const title = document.getElementById('animeLeftTitle');
  const sub = document.getElementById('animeLeftSub');
  const badges = document.getElementById('animeLeftBadges');
  const desc = document.getElementById('animeLeftDesc');
  const meta = document.getElementById('animeLeftMeta');
  const bookmark = document.getElementById('animeLeftBookmark');
  const ratingScore = document.getElementById('animeLeftRatingScore');
  const ratingStars = document.getElementById('animeLeftRatingStars');
  if (poster) { poster.src = item.poster || item.backdrop || ''; poster.alt = item.title || ''; }
  const glow = document.querySelector('.anime-left-poster-glow');
  if (glow) { const img = item.poster || item.backdrop || ''; glow.style.backgroundImage = img ? 'url(' + img + ')' : ''; }
  if (title) title.textContent = item.title || 'Untitled';
  if (sub) sub.textContent = item.title_japanese || item.title_english || item.originalTitle || item.animekaiSlug || '';
  if (badges){
    const rating = (item.rating || item.vote_average || '8') + '';
    const isMovie = item.type === 'movie' || item.media_type === 'movie';
    const typeBadge = isMovie ? 'Movie' : 'TV';
    badges.innerHTML = `<span class="abadge abadge-pg">PG 13</span><span class="abadge abadge-cc">CC 9</span><span class="abadge abadge-rate">★ ${escapeHtml(rating.slice(0,3))}</span><span class="abadge abadge-tv">${typeBadge}</span>`;
  }
  if (desc) desc.textContent = item.description || item.overview || 'No synopsis available.';
  if (meta){
    const genres = (genArr(item.genre).join(', ') || '—');
    const isMovie = item.type === 'movie' || item.media_type === 'movie';
    const eps = isMovie ? '1' : (item.episodeCount || item.episodes?.length || '—');
    const dur = item.runtime ? (item.runtime+' min') : (item.duration ? item.duration+' min' : '24');
    const status = item.status || 'Completed';
    const mal = item.rating || '—';
    const ani = item.anilistId || item.anilist_id || 'AL';
    meta.innerHTML = `
      <div><dt>Country:</dt><dd>Japan</dd></div>
      <div><dt>Genres:</dt><dd>${escapeHtml(genres)}</dd></div>
      <div><dt>Episodes:</dt><dd>${escapeHtml(String(eps))}</dd></div>
      <div><dt>Duration:</dt><dd>${escapeHtml(String(dur))}</dd></div>
      <div><dt>Status:</dt><dd>${escapeHtml(status)}</dd></div>
      <div><dt>MAL:</dt><dd>${escapeHtml(String(mal))}</dd></div>
      <div><dt>AniList:</dt><dd>${/^\d+$/.test(String(ani)) ? `<a href="https://anilist.co/anime/${ani}" target="_blank" rel="noopener">AL</a>` : 'AL'}</dd></div>`;
  }
  // My List button (bookmark)
  if (bookmark){
    const itemKey = String(item.id);
    const isSaved = myList.some(x => String(x.id) === itemKey);
    bookmark.classList.toggle('saved', isSaved);
    bookmark.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-4-8 4V4a2 2 0 0 1 2-2z"/></svg> ${isSaved ? 'Added to My List' : 'My List'}`;
    bookmark.onclick = () => {
      const idx = myList.findIndex(x => String(x.id) === itemKey);
      if (idx >= 0) myList.splice(idx, 1); else myList.push({ ...item, type: playContext && playContext.type === 'movie' ? 'movie' : (item.type === 'movie' || item.media_type === 'movie' ? 'movie' : 'tv') });
      saveData();
      renderAnimeTheaterLeft(item);
      try{ toast(idx >= 0 ? 'Removed from My List' : 'Added to My List', 'success'); }catch{}
    };
  }
  // Interactive rating system: user rating per item, persisted to localStorage
  const ratingKey = `milkbox_anime_ratings`;
  let userRatings = {};
  try { userRatings = JSON.parse(localStorage.getItem(ratingKey) || '{}') || {}; } catch {}
  const userRate = userRatings[String(item.id)];
  if (ratingScore){
    ratingScore.textContent = userRate != null ? String(userRate) : ((item.rating || item.vote_average || '—') + '');
    ratingScore.style.color = userRate != null ? '#ff6b35' : '#fff';
  }
  if (ratingStars){
    const display = userRate != null ? userRate : Math.round((item.rating || item.vote_average || 0) / 2);
    ratingStars.innerHTML = Array.from({length:5}, (_,i)=> {
      const filled = i < display;
      const svg = filled
        ? `<svg data-i="${i}" class="filled" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>`
        : `<svg data-i="${i}" class="empty" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>`;
      return svg;
    }).join('');
    ratingStars.querySelectorAll('svg').forEach(s => {
      s.addEventListener('click', () => {
        const n = parseInt(s.dataset.i, 10) + 1;
        try {
          userRatings[String(item.id)] = n;
          localStorage.setItem(ratingKey, JSON.stringify(userRatings));
        } catch {}
        renderAnimeTheaterLeft(item);
        try{ toast(`You rated this ${n}★`, 'success'); }catch{}
      });
      s.addEventListener('mouseenter', () => {
        const n = parseInt(s.dataset.i, 10) + 1;
        ratingStars.querySelectorAll('svg').forEach((x, xi) => {
          x.classList.toggle('filled', xi < n);
          x.classList.toggle('empty', xi >= n);
          x.style.color = xi < n ? '#ff6b35' : '#3a3a4a';
        });
      });
      s.addEventListener('mouseleave', () => {
        const cur = userRate != null ? userRate : Math.round((item.rating || item.vote_average || 0) / 2);
        ratingStars.querySelectorAll('svg').forEach((x, xi) => {
          const f = xi < cur;
          x.classList.toggle('filled', f);
          x.classList.toggle('empty', !f);
          x.style.color = '';
        });
      });
    });
  }
}
function renderAnimeTheaterBreadcrumb(item){
  const t = document.getElementById('animeBcTitle');
  const e = document.getElementById('animeBcEp');
  if (t) t.textContent = item.title || '';
  if (e) {
    if (playContext && playContext.type === 'movie') { e.textContent = 'Feature Film'; }
    else {
      const ep = (playContext && playContext.episode) ? playContext.episode : 1;
      e.textContent = `Episode ${ep}`;
    }
  }
}
function syncAnimeControlsUI(){
  const autoNext = document.getElementById('animeCtrlAutoNext');
  const autoPlay = document.getElementById('animeCtrlAutoPlay');
  const ccBtn = document.getElementById('animeCcBtn');
  const focusBtn = document.getElementById('animeCtrlFocus');
  const anOn = settings.autoPlayNext !== false;
  if (autoNext) { autoNext.classList.toggle('active', anOn); autoNext.style.background = anOn ? '#ff6b35' : ''; autoNext.style.color = anOn ? '#fff' : ''; }
  if (autoPlay) autoPlay.classList.toggle('active', _animeAutoPlayOn);
  if (ccBtn) ccBtn.style.opacity = _animeCcOn ? '1' : '.55';
  if (focusBtn) focusBtn.classList.toggle('active', _animeFocus);
  updateAnimePrevNextState();
}
function updateAnimePrevNextState(){
  const prev = document.getElementById('animeCtrlPrev');
  const next = document.getElementById('animeCtrlNext');
  const cur = playContext ? (playContext.episode || 1) : 1;
  const total = _animeEpAll.length || 0;
  if (prev) prev.disabled = cur <= 1;
  if (next) next.disabled = total ? cur >= total : false;
}
function _filteredAnimeEps(){
  const q = _animeEpFilter.trim().toLowerCase();
  if (!q) return _animeEpAll;
  return _animeEpAll.filter(ep => {
    const n = String(ep.num); const title = (ep.title||'').toLowerCase();
    return n.includes(q) || title.includes(q);
  });
}
function renderAnimeEpisodeListDOM(){
  const list = document.getElementById('animeEpisodeList');
  const sel = document.getElementById('animeRangeSelect');
  if (!list) return;
  // TV-only: movies use server panel, never the grid/list (anime TV only)
  const right = document.getElementById('animeRight');
  const isMovieDom = right && right.classList.contains('anime-movie-mode');
  const isMovieCtx = !!(playContext && playContext.type === 'movie');
  if (isMovieCtx || isMovieDom) return;
  const filtered = _filteredAnimeEps();
  const total = filtered.length;
  if (!total){ list.innerHTML = `<div style="padding:18px;color:#888;text-align:center;font-size:13px">No episodes found</div>`; if (sel) sel.innerHTML = '—'; return; }
  if (_animeEpRangeStart >= total) _animeEpRangeStart = Math.max(0, Math.floor((total-1)/_animeRangeSize)*_animeRangeSize);
  const end = Math.min(total, _animeEpRangeStart + _animeRangeSize);
  const start = _animeEpRangeStart + 1;
  if (sel) sel.innerHTML = `${String(start).padStart(3,'0')}-${String(end).padStart(3,'0')} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9 12 15 18 9"/></svg>`;
  const curEp = playContext ? (playContext.episode || 1) : 1;
  const isGrid = _animeGridMode;
  list.innerHTML = filtered.slice(_animeEpRangeStart, end).map(ep => {
    const active = ep.num === curEp ? ' active' : '';
    const label = ep.title ? escapeHtml(ep.title) : `Episode ${ep.num}`;
    return `<button class="anime-ep${active}" data-ep="${ep.num}" title="${label}"><span class="anime-ep-num">${ep.num}</span>${isGrid ? '' : `<span class="anime-ep-title">${label}</span>`}</button>`;
  }).join('');
  const pr = document.getElementById('animeRangePrev');
  const nx = document.getElementById('animeRangeNext');
  if (pr) pr.disabled = _animeEpRangeStart <= 0;
  if (nx) nx.disabled = end >= total;
  list.querySelectorAll('.anime-ep').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.ep,10);
      if (!playContext) return;
      const it = playContext.item;
      const se = playContext.season || it.season || 1;
      const srv = effectiveServerFor(it, 'tv');
      if (it.tmdbId) playTmdbEpisode(it, se, n, srv);
      else if (it.episodes && it.episodes[n-1]) playEpisode(it, it.episodes[n-1], n-1);
      else playTmdbEpisode(it, se, n, srv);
      // will re-render via play handler; also update breadcrumb/active highlight
      try { renderAnimeTheaterBreadcrumb(it); } catch {}
      updateAnimePrevNextState();
      list.querySelectorAll('.anime-ep').forEach(b=>b.classList.toggle('active', parseInt(b.dataset.ep,10)===n));
      // ensure active episode in view range
      const idx = filtered.findIndex(x=>x.num===n);
      if (idx !== -1 && (idx < _animeEpRangeStart || idx >= end)) {
        _animeEpRangeStart = Math.floor(idx/_animeRangeSize)*_animeRangeSize;
        renderAnimeEpisodeListDOM();
      }
    });
  });
}
async function renderAnimeTheaterEpisodes(item, requestedSeason){
  const list = document.getElementById('animeEpisodeList');
  const seasonSel = document.getElementById('animeSeasonSelect');
  if (!list) return;
  // immediate placeholder so the list never appears empty/loading forever (TMDB can be slow/blocked)
  const curEpInit = playContext ? (playContext.episode||1) : 1;
  _animeEpRangeStart = Math.floor((curEpInit-1)/_animeRangeSize)*_animeRangeSize;
  if (item.type === 'movie'){
    _animeSeasons = []; _animeCurrentSeason = 1;
    if (seasonSel) seasonSel.style.display = 'none';
    _animeEpAll = [{ num:1, title: item.title || 'Movie' }];
    renderAnimeEpisodeListDOM(); updateAnimePrevNextState(); return;
  }
  if (item.episodes && item.episodes.length){
    _animeSeasons = []; _animeCurrentSeason = 1;
    if (seasonSel) seasonSel.style.display = 'none';
    _animeEpAll = item.episodes.map((ep,i)=> ({ num:i+1, title: ep.name || `Episode ${i+1}` }));
    renderAnimeEpisodeListDOM(); updateAnimePrevNextState(); return;
  }
  // show placeholder immediately
  const placeholderCount = item.episodeCount || 12;
  _animeEpAll = Array.from({length: placeholderCount}, (_,i)=>({num:i+1, title:`Episode ${i+1}`}));
  renderAnimeEpisodeListDOM();
  // now enrich from TMDB in background; placeholder stays if fetch fails/blocked
  if (!item.tmdbId) { updateAnimePrevNextState(); return; }
  try {
    await tmdbEnsureConfig();
    const detail = await tmdbJson(`/tv/${encodeURIComponent(item.tmdbId)}`);
    const seasons = (detail.seasons||[]).filter(s=>s && s.season_number>=1 && s.episode_count>0).map(s=>s.season_number);
    _animeSeasons = seasons.length ? seasons : [1];
    if (requestedSeason !== undefined) _animeCurrentSeason = requestedSeason;
    else _animeCurrentSeason = (playContext && playContext.season) ? playContext.season : (_animeSeasons[0]||1);
    if (!seasons.includes(_animeCurrentSeason) && _animeSeasons.length) _animeCurrentSeason = _animeSeasons[0];
    if (seasonSel){
      if (_animeSeasons.length > 1){
        seasonSel.innerHTML = _animeSeasons.map(sn=>`<option value="${sn}">${sn===0?'Specials':'Season '+sn}</option>`).join('');
        seasonSel.value = String(_animeCurrentSeason);
        seasonSel.style.display = '';
      } else {
        seasonSel.style.display = 'none';
      }
    }
    const sn = _animeCurrentSeason;
    if (playContext) playContext.season = sn;
    let fetched = [];
    if (!seasons.length){
      fetched = Array.from({length: detail.number_of_episodes || placeholderCount}, (_,i)=>({num:i+1, title:`Episode ${i+1}`}));
    } else {
      try {
        const seasonData = await tmdbJson(`/tv/${encodeURIComponent(item.tmdbId)}/season/${sn}`);
        const eps = seasonData.episodes || [];
        fetched = eps.map(ep=>({ num: ep.episode_number, title: ep.name || `Episode ${ep.episode_number}` }));
      } catch {}
      if (!fetched.length) fetched = Array.from({length: 12}, (_,i)=>({num:i+1, title:`Episode ${i+1}`}));
    }
    if (fetched.length){ _animeEpAll = fetched; }
  } catch {
    // keep placeholder on failure
    if (seasonSel) seasonSel.style.display = 'none';
  }
  const cur = playContext ? (playContext.episode||1) : 1;
  _animeEpRangeStart = Math.floor((cur-1)/_animeRangeSize)*_animeRangeSize;
  renderAnimeEpisodeListDOM();
  updateAnimePrevNextState();
}
function wireAnimeTheaterOnce(){
  const bcHome = document.getElementById('animeBcHome');
  if (bcHome && !bcHome._wired){ bcHome._wired=1; bcHome.addEventListener('click', (e)=>{ e.preventDefault(); document.getElementById('playerModal').classList.remove('active'); exitAnimeTheater(); try{ document.querySelector('.nav-link[data-section="home"]')?.click(); }catch{} }); }
  const expand = document.getElementById('animeCtrlExpand');
  if (expand && !expand._wired){ expand._wired=1; expand.addEventListener('click', async ()=>{
    const wrap = document.getElementById('animePlayerWrap');
    try {
      if (!document.fullscreenElement) await wrap.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });}
  const focus = document.getElementById('animeCtrlFocus');
  if (focus && !focus._wired){ focus._wired=1; focus.addEventListener('click', ()=>{
    _animeFocus = !_animeFocus;
    document.body.classList.toggle('anime-focus', _animeFocus);
    syncAnimeControlsUI();
    try{ toast(_animeFocus ? 'Focus mode on' : 'Focus mode off'); }catch{}
  });}
  const anxt = document.getElementById('animeCtrlAutoNext');
  if (anxt && !anxt._wired){ anxt._wired=1; anxt.addEventListener('click', ()=>{
    const now = settings.autoPlayNext !== false;
    settings.autoPlayNext = !now;
    try{ localStorage.setItem('sf_settings', JSON.stringify(settings)); }catch{}
    syncAnimeControlsUI(); try{ toast(`AutoNext ${settings.autoPlayNext!==false?'on':'off'}`);}catch{}
  });}
  const aplay = document.getElementById('animeCtrlAutoPlay');
  if (aplay && !aplay._wired){ aplay._wired=1; aplay.addEventListener('click', ()=>{
    _animeAutoPlayOn = !_animeAutoPlayOn;
    syncAnimeControlsUI(); try{ toast(`AutoPlay ${_animeAutoPlayOn?'on':'off'}`);}catch{}
  });}
  const w2g = document.getElementById('animeCtrlW2g');
  if (w2g && !w2g._wired){ w2g._wired=1; w2g.addEventListener('click', async ()=>{
    const url = location.href;
    try{ await navigator.clipboard.writeText(url); toast('W2G link copied','success'); } catch{ toast(url); }
  });}
  const prev = document.getElementById('animeCtrlPrev');
  if (prev && !prev._wired){ prev._wired=1; prev.addEventListener('click', ()=>{
    if (!playContext) return;
    const cur = playContext.episode||1; if (cur<=1) return;
    const it = playContext.item; const se = playContext.season||it.season||1;
    const srv = effectiveServerFor(it,'tv');
    if (it.tmdbId) playTmdbEpisode(it, se, cur-1, srv); else if (it.episodes && it.episodes[cur-2]) playEpisode(it,it.episodes[cur-2],cur-2);
    renderAnimeTheaterBreadcrumb(it); updateAnimePrevNextState(); setTimeout(renderAnimeEpisodeListDOM, 80);
  });}
  const next = document.getElementById('animeCtrlNext');
  if (next && !next._wired){ next._wired=1; next.addEventListener('click', ()=>{
    if (!playContext) return;
    const cur = playContext.episode||1; const it = playContext.item; const se = playContext.season||it.season||1;
    const srv = effectiveServerFor(it,'tv');
    const total = _animeEpAll.length || 999;
    if (cur >= total) { try{toast('Last episode');}catch{} return; }
    if (it.tmdbId) playTmdbEpisode(it, se, cur+1, srv); else if (it.episodes && it.episodes[cur]) playEpisode(it,it.episodes[cur],cur);
    renderAnimeTheaterBreadcrumb(it); updateAnimePrevNextState(); setTimeout(renderAnimeEpisodeListDOM, 80);
  });}
  const report = document.getElementById('animeCtrlReport');
  if (report && !report._wired){ report._wired=1; report.addEventListener('click', ()=>{ try{toast('Thanks for reporting — we will check this episode','success');}catch{} });}
  const cc = document.getElementById('animeCcBtn');
  if (cc && !cc._wired){ cc._wired=1; cc.addEventListener('click', ()=>{
    _animeCcOn = !_animeCcOn;
    const switchingToSub = _animeCcOn;
    currentAnimeLang = switchingToSub ? 'sub' : 'dub';
    try{ localStorage.setItem('milkbox_anime_lang', currentAnimeLang);}catch{}
    try{ localStorage.setItem('animeLang', currentAnimeLang);}catch{}
    syncAnimeControlsUI();
    if (playContext) {
      try{
        const frame = document.getElementById('playerFrame');
        if (frame) frame.innerHTML = '<div class="live-loading">Switching to ' + (currentAnimeLang === 'dub' ? 'Dubbed (English)' : 'Subbed (Japanese + English subs)') + '…</div>';
        renderPlay();
      }catch{}
      try{ renderAnimeTheaterBreadcrumb(playContext.item);}catch{}
      if (playContext.type === 'movie' || playContext.item.type === 'movie') renderAnimeMoviePanel(playContext.item);
    }
    try{ toast(switchingToSub ? 'Subtitles on (Sub)' : 'Dub audio'); }catch{}
  });}
  const findBtn = document.getElementById('animeFindBtn');
  if (findBtn && !findBtn._wired){ findBtn._wired=1; findBtn.addEventListener('click', ()=>{
    const row = document.getElementById('animeFindRow');
    if (!row) return;
    const show = row.style.display === 'none';
    row.style.display = show ? '' : 'none';
    if (show) document.getElementById('animeFindInput')?.focus();
  });}
  const findInput = document.getElementById('animeFindInput');
  if (findInput && !findInput._wired){ findInput._wired=1; findInput.addEventListener('input', (e)=>{
    _animeEpFilter = e.target.value||''; _animeEpRangeStart=0; renderAnimeEpisodeListDOM();
  });}
  const findClear = document.getElementById('animeFindClear');
  if (findClear && !findClear._wired){ findClear._wired=1; findClear.addEventListener('click', ()=>{
    _animeEpFilter=''; const inp=document.getElementById('animeFindInput'); if(inp) inp.value=''; _animeEpRangeStart=0; renderAnimeEpisodeListDOM();
  });}
  const layoutBtn = document.getElementById('animeLayoutBtn');
  if (layoutBtn && !layoutBtn._wired){ layoutBtn._wired=1; layoutBtn.addEventListener('click', ()=>{
    _animeGridMode = !_animeGridMode;
    const list = document.getElementById('animeEpisodeList');
    if (list) list.classList.toggle('grid', _animeGridMode);
    layoutBtn.classList.toggle('active', _animeGridMode);
    renderAnimeEpisodeListDOM();
  });}
  const rp = document.getElementById('animeRangePrev');
  if (rp && !rp._wired){ rp._wired=1; rp.addEventListener('click', ()=>{ _animeEpRangeStart = Math.max(0, _animeEpRangeStart - _animeRangeSize); renderAnimeEpisodeListDOM(); });}
  const rn = document.getElementById('animeRangeNext');
  if (rn && !rn._wired){ rn._wired=1; rn.addEventListener('click', ()=>{ const tot=_filteredAnimeEps().length; _animeEpRangeStart = Math.min(Math.max(0, Math.ceil(tot/_animeRangeSize)-1)*_animeRangeSize, _animeEpRangeStart + _animeRangeSize); renderAnimeEpisodeListDOM(); });}
  const rs = document.getElementById('animeRangeSelect');
  if (rs && !rs._wired){ rs._wired=1; rs.addEventListener('click', ()=>{
    const tot=_filteredAnimeEps().length; const pages=Math.max(1, Math.ceil(tot/_animeRangeSize)); const cur=Math.floor(_animeEpRangeStart/_animeRangeSize);
    _animeEpRangeStart = ((cur+1)%pages)*_animeRangeSize; renderAnimeEpisodeListDOM();
  });}
  const seasonSel = document.getElementById('animeSeasonSelect');
  if (seasonSel && !seasonSel._wired){ seasonSel._wired=1; seasonSel.addEventListener('change', async ()=>{
    const sn = parseInt(seasonSel.value,10);
    if (isNaN(sn) || !playContext) return;
    _animeCurrentSeason = sn;
    playContext.season = sn; playContext.episode = 1;
    _animeEpRangeStart = 0; _animeEpFilter = '';
    const inp = document.getElementById('animeFindInput'); if (inp) inp.value = '';
    await renderAnimeTheaterEpisodes(playContext.item, sn);
    // play first episode of new season
    const srv = effectiveServerFor(playContext.item, 'tv');
    try { if (playContext.item.tmdbId) playTmdbEpisode(playContext.item, sn, 1, srv); } catch {}
    renderAnimeTheaterBreadcrumb(playContext.item);
    syncAnimeControlsUI();
  });}
}
try{ wireAnimeTheaterOnce(); } catch {}
document.addEventListener('keydown', (e)=>{
  const theater = document.getElementById('animeTheater');
  if (!theater || theater.style.display==='none') return;
  if (e.key==='Escape' && _animeFocus){ _animeFocus=false; document.body.classList.remove('anime-focus'); syncAnimeControlsUI(); }
});

document.getElementById('closePlayer').addEventListener('click', () => {
    try { const pf = document.getElementById('playerFrame'); if (pf) { const ifr = pf.querySelector('iframe'); if (ifr) try { ifr.src = 'about:blank'; } catch {} pf.innerHTML = ''; } } catch {}
    document.getElementById('playerModal').classList.remove('active'); exitAnimeTheater();
});
document.getElementById('playerModal').addEventListener('click', (e) => {
    if (e.target.id === 'playerModal') {
        try { const pf = document.getElementById('playerFrame'); if (pf) { const ifr = pf.querySelector('iframe'); if (ifr) try { ifr.src = 'about:blank'; } catch {} pf.innerHTML = ''; } } catch {}
        document.getElementById('playerModal').classList.remove('active'); exitAnimeTheater();
    }
});
const epToggle = document.getElementById('episodeToggleBtn');
if (epToggle) {
    epToggle.addEventListener('click', () => { document.getElementById('episodeSelector').classList.toggle('collapsed'); });
}
document.getElementById('closeInfo').addEventListener('click', () => document.getElementById('infoModal').classList.remove('active'));
document.getElementById('closeEdit').addEventListener('click', () => document.getElementById('editModal').classList.remove('active'));
document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('active'));

// Settings tab switching
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.querySelector(`.settings-tab-panel[data-settings-panel="${tab.dataset.settingsTab}"]`);
        if (panel) panel.classList.add('active');
    });
});

// Sync settings auto-play toggle with player toggle
const settingsAutoPlay = document.getElementById('settingsAutoPlayNextToggle');
const playerAutoPlay = document.getElementById('autoPlayNextToggle');
if (settingsAutoPlay && playerAutoPlay) {
    settingsAutoPlay.checked = playerAutoPlay.checked;
    settingsAutoPlay.addEventListener('change', () => {
        playerAutoPlay.checked = settingsAutoPlay.checked;
        settings.autoPlayNext = settingsAutoPlay.checked;
        saveData();
    });
    playerAutoPlay.addEventListener('change', () => {
        settingsAutoPlay.checked = playerAutoPlay.checked;
        settings.autoPlayNext = playerAutoPlay.checked;
        saveData();
    });
}
// Show Collections on Home/Trending toggle
const settingsShowCollections = document.getElementById('settingsShowCollectionsToggle');
if (settingsShowCollections) {
    settingsShowCollections.checked = settings.showCollections !== false;
    settingsShowCollections.addEventListener('change', () => {
        settings.showCollections = settingsShowCollections.checked;
        saveData();
        try { renderCollections(); } catch(e) { console.error(e); }
        if (currentSection === 'home' || currentSection === 'trending') {
            const sec = document.getElementById('collectionsSection');
            if (sec) sec.style.display = settings.showCollections !== false ? '' : 'none';
        }
    });
}
document.getElementById('closeMangaModal').addEventListener('click', () => document.getElementById('mangaModal').classList.remove('active'));
document.getElementById('mangaDrawerClose')?.addEventListener('click', () => document.getElementById('mangaDrawer').classList.remove('active'));
document.getElementById('mangaReadPrev')?.addEventListener('click', () => {
    const isWhole = mangaReader.images.some(p=>p.isHeader);
    const idx = chapterIndex();
    if (idx > 0) {
        if (isWhole) {
            const chId = String(mangaReader.chapters[idx - 1].id);
            const header = document.querySelector(`.manga-chapter-header[data-ch="${chId}"]`);
            mangaReader.currentId = chId;
            mrEl('mangaReadChapterLabel').textContent = mangaReader.chapters[idx - 1]?.name || chId;
            updateReaderNav(); renderChapterDrawer();
            if (header) header.scrollIntoView({ behavior:'smooth', block:'start' });
        } else openChapter(mangaReader.chapters[idx - 1].id);
    }
});
document.getElementById('mangaReadNext')?.addEventListener('click', () => {
    const isWhole = mangaReader.images.some(p=>p.isHeader);
    const idx = chapterIndex();
    if (idx >= 0 && idx < mangaReader.chapters.length - 1) {
        if (isWhole) {
            const chId = String(mangaReader.chapters[idx + 1].id);
            const header = document.querySelector(`.manga-chapter-header[data-ch="${chId}"]`);
            mangaReader.currentId = chId;
            mrEl('mangaReadChapterLabel').textContent = mangaReader.chapters[idx + 1]?.name || chId;
            updateReaderNav(); renderChapterDrawer();
            if (header) header.scrollIntoView({ behavior:'smooth', block:'start' });
        } else openChapter(mangaReader.chapters[idx + 1].id);
    }
});
document.getElementById('mangaReadList')?.addEventListener('click', () => {
    renderChapterDrawer();
    document.getElementById('mangaDrawer').classList.add('active');
});
document.getElementById('mangaChapterList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.manga-drawer-item');
    if (!btn) return;
    const isWhole = mangaReader.images.some(p=>p.isHeader);
    if (isWhole) {
        const chId = String(btn.dataset.ch);
        const header = document.querySelector(`.manga-chapter-header[data-ch="${chId}"]`);
        mangaReader.currentId = chId;
        const ch = mangaReader.chapters.find(c=>String(c.id)===chId);
        mrEl('mangaReadChapterLabel').textContent = ch?.name || chId;
        updateReaderNav();
        renderChapterDrawer();
        if (header) header.scrollIntoView({ behavior:'smooth', block:'start' });
        else {
            const idx = mangaReader.chapters.findIndex(c=>String(c.id)===chId);
            const allH = document.querySelectorAll('.manga-chapter-header');
            if (allH[idx]) allH[idx].scrollIntoView({ behavior:'smooth', block:'start' });
        }
        document.getElementById('mangaDrawer').classList.remove('active');
        return;
    }
    openChapter(btn.dataset.ch);
    document.getElementById('mangaDrawer').classList.remove('active');
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            if (modal.id === 'playerModal') { document.getElementById('playerFrame').innerHTML = ''; exitAnimeTheater(); }
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        document.getElementById('playerFrame').innerHTML = '';
        exitAnimeTheater();
    }
});

// Tab switching in add content modal
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// ==================== SLIDER BUTTONS ====================
// Slider arrows work for both static and dynamically-rendered (genre) sliders via delegation.
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.slider-btn');
    if (!btn || !btn.dataset.slider) return;
    const slider = document.getElementById(btn.dataset.slider);
    if (slider) slider.scrollBy({ left: btn.classList.contains('slider-left') ? -600 : 600, behavior: 'smooth' });
});

// ==================== SCROLL NAVBAR ====================
window.addEventListener('scroll', () => {
    document.querySelector('.navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ==================== FOOTER LINKS ====================
document.getElementById('footerHelp').addEventListener('click', (e) => { e.preventDefault(); toast('Help: Add movies with Google Drive links, upload TV episodes, and click Play to watch!'); });
document.getElementById('footerTerms').addEventListener('click', (e) => { e.preventDefault(); toast('For personal use only. MILKBOX is a personal media organizer.'); });
document.getElementById('footerPrivacy').addEventListener('click', (e) => { e.preventDefault(); toast('All data is stored locally in your browser. Nothing is sent to any server.'); });

// ==================== LOGO CLICK ====================
document.getElementById('logoWrap').addEventListener('click', (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('.nav-link[data-section="home"]').classList.add('active');
    currentSection = 'home';
    document.body.classList.remove('movies-active', 'tvshows-active', 'anime-active', 'mylist-active', 'trending-active', 'streaming-active', 'theaters-active', 'popular-active', 'manga-active', 'home-active');
    document.body.classList.add('home-active');
    document.querySelector('#moviesSection .section-title').textContent = 'Movies';
    document.querySelector('#tvShowsSection .section-title').textContent = 'TV Shows';
    ['myListSection', 'heroSection', 'providerSection'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=''; });
    ['trendingSection', 'theatersSection', 'mangaSection', 'popularSection'].forEach(id => document.getElementById(id).style.display = 'none');
    applyHomeFilter();
    updateHero();
});

// ==================== INIT ====================
function initAll() {
    try { initGenreOptions(); } catch (e) { console.error('initGenreOptions error:', e); }
    try { applyCloak(); } catch (e) { console.error('applyCloak error:', e); }
    try { applyBackground(); } catch (e) { console.error('applyBackground error:', e); }
    try { scanMovieQualities(true); } catch (e) { console.error('scanMovieQualities error:', e); }
    try {
        const hg = document.getElementById('homeGenres');
        if (hg && currentSection === 'home') hg.style.display = 'none';
        renderAll();
        if (currentSection === 'home') {
            document.body.classList.add('home-active');
            try { applyHomeFilter(); } catch {}
        }
    } catch (e) { console.error('renderAll error:', e); }
    try { renderProviders(); } catch (e) { console.error('renderProviders error:', e); }
    try { if (!localAnimeExists()) loadAnimeLive(); } catch (e) { console.error('preload anime error:', e); }
    try { autoLoadHostedLibrary(); } catch (e) { console.error('autoLoadHostedLibrary error:', e); }
    try { enrichMissingLogos(); } catch (e) { console.error('enrichMissingLogos error:', e); }
}
initAll();

// provider click delegation
document.addEventListener('click', (e) => {
    const seasonScrollButton = e.target.closest('[data-season-scroll]');
    if (seasonScrollButton) {
        const tabs = document.getElementById('seasonTabs');
        if (tabs) tabs.scrollBy({ left: seasonScrollButton.dataset.seasonScroll === 'right' ? 360 : -360, behavior: 'smooth' });
        return;
    }
    const scrollButton = e.target.closest('[data-provider-scroll]');
    if (scrollButton) {
        const slider = document.getElementById('providerSlider');
        if (slider) slider.scrollBy({ left: scrollButton.dataset.providerScroll === 'right' ? 420 : -420, behavior: 'smooth' });
        return;
    }
    const item = e.target.closest('.provider-item');
    if (!item) return;
    browseProvider(item.dataset.provider);
});
let currentCollection = null;
let currentCollectionItems = [];
let currentCollectionPage = 1;
const COLLECTION_PER_PAGE = 14;
function renderCollectionPage() {
    const sec = document.getElementById('searchResultsSection');
    const grid = document.getElementById('searchResultsGrid');
    const pager = document.getElementById('searchResultsPager');
    const titleEl = document.getElementById('searchResultsTitle');
    const closeBtn = document.getElementById('closeSearchResults');
    if (!sec || !grid || !currentCollection) return;
    const total = Math.ceil(currentCollectionItems.length / COLLECTION_PER_PAGE) || 1;
    const page = Math.min(Math.max(1, currentCollectionPage), total);
    currentCollectionPage = page;
    const start = (page - 1) * COLLECTION_PER_PAGE;
    const slice = currentCollectionItems.slice(start, start + COLLECTION_PER_PAGE);
    titleEl.textContent = `${currentCollection} Collection · ${currentCollectionItems.length} title${currentCollectionItems.length===1?'':'s'} — Page ${page} of ${total}`;
    grid.innerHTML = '';
    slice.forEach(it => grid.appendChild(createCard(it, it.type || 'movie')));
    sec.style.display = '';
    if (closeBtn) closeBtn.style.display = '';
    if (pager) {
        if (total <= 1) pager.style.display = 'none';
        else {
            pager.style.display = '';
            let html = `<button class="pager-btn pager-nav" data-collection-page="${page - 1}" ${page===1?'disabled':''}>&#10094; Prev</button>`;
            const WIN = 5; let s = Math.max(1, page - 2); let e = Math.min(total, s + WIN - 1); s = Math.max(1, e - WIN + 1);
            for (let i = s; i <= e; i++) html += `<button class="pager-btn ${i===page?'current':''}" data-collection-page="${i}">${i}</button>`;
            html += `<button class="pager-btn pager-nav" data-collection-page="${page + 1}" ${page===total?'disabled':''}>Next &#10095;</button>`;
            pager.innerHTML = html;
        }
    }
    document.getElementById('moviesSection').style.display='none';
    document.getElementById('tvShowsSection').style.display='none';
    document.getElementById('homeGenres').style.display='none';
    document.getElementById('collectionsSection').style.display='none';
    document.getElementById('providerSection').style.display='none';
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeCollectionView() {
    currentCollection = null;
    currentCollectionItems = [];
    currentCollectionPage = 1;
    const sec = document.getElementById('searchResultsSection');
    const grid = document.getElementById('searchResultsGrid');
    const pager = document.getElementById('searchResultsPager');
    const closeBtn = document.getElementById('closeSearchResults');
    if (sec) sec.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (pager) pager.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';
    if (currentSection === 'home') {
        applyHomeFilter();
        const hero = document.getElementById('heroSection');
        if (hero) hero.style.display = '';
        const prov = document.getElementById('providerSection');
        if (prov) prov.style.display = '';
        try { renderCollections(); } catch {}
    }
}
// collections click — show all titles in that collection with pages (scans TMDB for more)
document.addEventListener('click', async (e) => {
    const card = e.target.closest('.collection-card');
    if (!card) return;
    const label = card.dataset.collection;
    const pool = [...movies, ...tvShows].filter(completeItem);
    let items = pool.filter(it => collectionForTitle(it.title) === label);
    // include explicit custom picks (e.g. your own Pokémon selections)
    const custom = customCollections.find(c=> c.label===label);
    if (custom) {
        const allPool = [...movies, ...tvShows];
        if (custom.itemIds && custom.itemIds.length) {
            const extra = allPool.filter(it=> custom.itemIds.includes(it.id));
            const seen = new Set(items.map(x=> String(x.tmdbId||x.id)));
            extra.forEach(it=> { const k=String(it.tmdbId||it.id); if(!seen.has(k)){ items.push(it); seen.add(k); }});
        }
        if (custom.tmdbItems && custom.tmdbItems.length) {
            const seen = new Set(items.map(x=> String(x.tmdbId||x.id||'')));
            custom.tmdbItems.forEach(it=> { const k=String(it.tmdbId||it.id||''); if(k && !seen.has(k)){ items.push(it); seen.add(k); } });
        }
    }
    // scan TMDB for additional titles in this collection
    try {
        await tmdbEnsureConfig();
        const def = COLLECTION_DEFS.find(d=>d.label===label);
        if (def) {
            const q = def.keys[0];
            const data = await tmdbJson(`/search/multi?query=${encodeURIComponent(q)}&page=1`);
            const tmdbItems = (data.results || []).map(r => {
                const type = r.media_type === 'tv' ? 'tv' : r.media_type === 'movie' ? 'movie' : (r.first_air_date ? 'tv' : 'movie');
                return liveItemToItem(r, type);
            }).filter(it => it.title && it.poster && it.backdrop && collectionForTitle(it.title) === label);
            const existing = new Set(items.map(i=>i.tmdbId||i.id));
            tmdbItems.forEach(it=>{ const k=it.tmdbId||it.id; if(!existing.has(k)){ items.push(it); existing.add(k); } });
            // second page for richer collections like Star Wars/Marvel
            if (tmdbItems.length >= 8) {
                try {
                    const data2 = await tmdbJson(`/search/multi?query=${encodeURIComponent(q)}&page=2`);
                    const more = (data2.results || []).map(r => {
                        const type = r.media_type === 'tv' ? 'tv' : 'movie';
                        return liveItemToItem(r, type);
                    }).filter(it => collectionForTitle(it.title) === label);
                    more.forEach(it=>{ const k=it.tmdbId||it.id; if(!existing.has(k)){ items.push(it); existing.add(k); } });
                } catch {}
            }
        }
    } catch {}
    if (!items.length) return;
    currentCollection = label;
    currentCollectionItems = items;
    currentCollectionPage = 1;
    toast(`${label} — ${items.length} title${items.length===1?'':'s'}`);
    renderCollectionPage();
});
document.getElementById('closeSearchResults')?.addEventListener('click', closeCollectionView);
document.getElementById('musicReloadBtn')?.addEventListener('click', () => {
    const mf = document.getElementById('musicFrame');
    if (!mf) return;
    let isFiltered = false;
    try { isFiltered = window._lightspeedDetected || localStorage.getItem('milkbox_lightspeed') === '1'; } catch {}
    const direct = 'https://monochrome.tf';
    // if filtered, reload via proxy; otherwise toggle to force reload
    if (isFiltered && window.googleProxy) mf.src = window.googleProxy(direct);
    else mf.src = mf.src;
});
document.getElementById('musicLogoPatch')?.addEventListener('click', (e) => {
    e.preventDefault();
    const mf = document.getElementById('musicFrame');
    if (mf) mf.src = 'https://monochrome.tf';
});
// Attempt to rewrite the Monochrome logo text inside the iframe when same-origin allows it (falls back to overlay patch)
document.getElementById('musicFrame')?.addEventListener('load', () => {
    try {
        const mf = document.getElementById('musicFrame');
        const doc = mf.contentDocument || mf.contentWindow?.document;
        if (!doc) return;
        const logoSpan = doc.querySelector('a.sidebar-logo-link span');
        if (logoSpan && logoSpan.textContent.trim() === 'Monochrome') {
            logoSpan.textContent = 'MILKBOX MUSIC';
            const patch = document.getElementById('musicLogoPatch');
            if (patch) patch.style.display = 'none';
        }
    } catch {}
});
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn[data-collection-page]');
    if (!btn || btn.disabled) return;
    const p = parseInt(btn.dataset.collectionPage, 10);
    if (isNaN(p)) return;
    currentCollectionPage = p;
    renderCollectionPage();
});
