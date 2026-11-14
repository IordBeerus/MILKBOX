const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;

// Linklet AllOne MAX tier limits ONLY (per https://linklet.extreem.me/docs.html)
const LINKLET_ALLONE_MAX_TIER = Object.freeze({
    name: 'Linklet AllOne MAX',
    perMinute: 50,
    perDay: 5000,
    linksPerGeneration: 100
});

// Per-user anti-spam limits so no single user can exhaust the shared AllOne MAX quota
const DEFAULT_USER_LIMITS = Object.freeze({
    maxGenerationsPerWindow: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    windowLabel: 'hour',
    maxLinksPerGeneration: 5,
    maxLinksPerDay: 15,
    dayMs: 24 * 60 * 60 * 1000
});

// Providers from https://linklet.extreem.me/docs.html, capped by Linklet AllOne MAX (100/gen)
const LINKLET_PROVIDERS = Object.freeze([
    {
        id: 'cloudflare',
        name: 'Cloudflare Pages',
        kind: 'file',
        input: 'SVG / HTML',
        formats: ['html', 'svg'],
        defaultFormat: 'html',
        providerMax: 2000,
        maxAmount: Math.min(2000, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: false
    },
    {
        id: 'cdn',
        name: 'Linklet CDN',
        kind: 'file',
        input: 'SVG / HTML',
        formats: ['html', 'svg'],
        defaultFormat: 'html',
        providerMax: null,
        maxAmount: LINKLET_ALLONE_MAX_TIER.linksPerGeneration,
        supportsOptionalName: false
    },
    {
        id: 'surge',
        name: 'Surge.sh',
        kind: 'file',
        input: 'SVG / HTML / ZIP',
        formats: ['html', 'svg'],
        defaultFormat: 'html',
        providerMax: 30,
        maxAmount: Math.min(30, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: false
    },
    {
        id: 'freedns',
        name: 'FreeDNS',
        kind: 'file',
        input: 'SVG / HTML',
        formats: ['html', 'svg'],
        defaultFormat: 'html',
        providerMax: 500,
        maxAmount: Math.min(500, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: false
    },
    {
        id: 'gglscript',
        name: 'Google Apps Script',
        kind: 'file',
        input: 'SVG / HTML',
        formats: ['html', 'svg'],
        defaultFormat: 'html',
        providerMax: 1000,
        maxAmount: Math.min(1000, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: false
    },
    {
        id: 'uploadcare',
        name: 'Uploadcare',
        kind: 'file',
        input: 'File',
        formats: ['html', 'svg'],
        defaultFormat: 'html',
        providerMax: 1000,
        maxAmount: Math.min(1000, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: false
    },
    {
        id: 'imagekit',
        name: 'ImageKit',
        kind: 'file',
        input: 'File',
        formats: ['html', 'svg'],
        defaultFormat: 'html',
        providerMax: 1000,
        maxAmount: Math.min(1000, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: false
    },
    {
        id: 'padlet',
        name: 'Padlet',
        kind: 'file',
        input: 'SVG',
        formats: ['svg'],
        defaultFormat: 'svg',
        providerMax: 1,
        maxAmount: Math.min(1, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: false
    },
    {
        id: 'sslip',
        name: 'sslip.io (IP Domain)',
        kind: 'ip',
        input: 'IPv4',
        formats: ['ip'],
        defaultFormat: 'ip',
        providerMax: 5,
        maxAmount: Math.min(5, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: false
    },
    {
        id: 'envpm',
        name: 'env.pm (IP + Name)',
        kind: 'ip',
        input: 'IPv4 + optional name',
        formats: ['ip'],
        defaultFormat: 'ip',
        providerMax: 1,
        maxAmount: Math.min(1, LINKLET_ALLONE_MAX_TIER.linksPerGeneration),
        supportsOptionalName: true
    }
]);

const PROVIDER_MAP = new Map(LINKLET_PROVIDERS.map((p) => [p.id, p]));

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isValidPublicIpv4(ip) {
    if (typeof ip !== 'string') return false;
    const trimmed = ip.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 4) return false;
    const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
    if (nums.some((n) => n < 0 || n > 255)) return false;
    const [a, b] = nums;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
    return true;
}

function normalizeClientIp(req) {
    const forwarded = req && req.headers && req.headers['x-forwarded-for'];
    const raw = (typeof forwarded === 'string' && forwarded.split(',')[0].trim())
        || (req && req.headers && req.headers['cf-connecting-ip'])
        || (req && req.socket && req.socket.remoteAddress)
        || '127.0.0.1';
    return String(raw).replace(/^::ffff:/i, '').trim() || '127.0.0.1';
}

function resolveTargetSiteUrl(req, configuredPublicUrl) {
    const rawConfigured = (configuredPublicUrl || '').trim();
    if (rawConfigured) {
        try {
            const parsed = new URL(rawConfigured);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.origin + (parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '');
            }
        } catch (_) {}
    }

    const rawHost = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host) || '').split(',')[0].trim();
    const rawProto = (req && req.headers && req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const isEncrypted = Boolean(req && req.socket && req.socket.encrypted);
    const proto = (rawProto === 'http' || rawProto === 'https') ? rawProto : (isEncrypted ? 'https' : 'http');

    if (rawHost && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(rawHost)) {
        try {
            const parsed = new URL(`${proto}://${rawHost}`);
            return parsed.origin;
        } catch (_) {}
    }

    // Fallback when accessed over localhost without MILKBOX_PUBLIC_URL
    return 'https://milkbox.fyi';
}

function sanitizeTabTitle(rawTitle) {
    const cleaned = String(rawTitle || 'MILKBOX')
        .replace(/[\r\n\t<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48);
    return cleaned || 'MILKBOX';
}

function buildHtmlMirrorDocument(siteUrl, tabTitle) {
    const safeUrl = escapeHtml(siteUrl);
    const safeTitle = escapeHtml(tabTitle || 'MILKBOX');
    const jsonUrl = JSON.stringify(siteUrl);

    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        `<title>${safeTitle}</title>`,
        '<style>',
        '*{box-sizing:border-box;margin:0;padding:0}',
        'html,body{width:100%;height:100%;overflow:hidden;background:#0b0b10;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
        '.mb-portal-frame{position:fixed;inset:0;width:100%;height:100%;border:0;background:#0b0b10}',
        '.mb-portal-bar{position:fixed;right:12px;bottom:12px;z-index:20;display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(16,16,24,.86);border:1px solid rgba(255,46,99,.45);backdrop-filter:blur(8px);font-size:12px}',
        '.mb-portal-btn{color:#fff;text-decoration:none;background:#ff2e63;padding:4px 10px;border-radius:999px;font-weight:700;cursor:pointer;border:0;font-size:12px}',
        '.mb-portal-hide{background:transparent;border:0;color:#aaa;cursor:pointer;font-size:14px;padding:0 4px}',
        '</style>',
        '</head>',
        '<body>',
        `<iframe class="mb-portal-frame" src="${safeUrl}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="no-referrer"></iframe>`,
        '<div class="mb-portal-bar" id="mbPortalBar">',
        `<a class="mb-portal-btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open Direct</a>`,
        '<button class="mb-portal-btn" type="button" id="mbBlankBtn">about:blank</button>',
        '<button class="mb-portal-hide" type="button" aria-label="Hide bar" onclick="this.parentNode.remove()">×</button>',
        '</div>',
        '<script>',
        `document.getElementById('mbBlankBtn').onclick=function(){var u=${jsonUrl};var w=window.open('about:blank','_blank');if(!w){window.location.href=u;return;}w.document.open();w.document.write('<!doctype html><html><head><title>'+document.title+'</title><style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;overflow:hidden;background:#0b0b10}</style></head><body><iframe src="'+u+'" allowfullscreen allow="autoplay;fullscreen;encrypted-media"></iframe></body></html>');w.document.close();};`,
        '</script>',
        '</body>',
        '</html>'
    ].join('');
}

function buildSvgMirrorDocument(siteUrl, tabTitle) {
    const safeUrl = escapeHtml(siteUrl);
    const safeTitle = escapeHtml(tabTitle || 'MILKBOX');

    return [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 960 540" width="960" height="540">',
        '<defs>',
        '<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
        '<stop offset="0%" stop-color="#0d0d14"/>',
        '<stop offset="60%" stop-color="#191021"/>',
        '<stop offset="100%" stop-color="#2b0d1f"/>',
        '</linearGradient>',
        '<linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">',
        '<stop offset="0%" stop-color="#ff2e63"/>',
        '<stop offset="100%" stop-color="#ff6b9d"/>',
        '</linearGradient>',
        '</defs>',
        '<rect width="960" height="540" fill="url(#bg)"/>',
        '<rect x="72" y="72" width="816" height="396" rx="24" fill="rgba(255,255,255,0.04)" stroke="rgba(255,46,99,0.45)" stroke-width="2"/>',
        '<text x="480" y="168" text-anchor="middle" fill="#ff6b9d" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="18" font-weight="800" letter-spacing="4">MILKBOX PORTAL</text>',
        `<text x="480" y="232" text-anchor="middle" fill="#ffffff" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="48" font-weight="900">${safeTitle}</text>`,
        `<text x="480" y="278" text-anchor="middle" fill="#b9bac8" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="18">${safeUrl}</text>`,
        `<a href="${safeUrl}" xlink:href="${safeUrl}" target="_blank" rel="noopener noreferrer">`,
        '<rect x="330" y="324" width="300" height="64" rx="32" fill="url(#accent)"/>',
        '<text x="480" y="364" text-anchor="middle" fill="#ffffff" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="22" font-weight="800">Launch MILKBOX ↗</text>',
        '</a>',
        '</svg>'
    ].join('');
}

function createLinkletService(options = {}) {
    const apiBaseUrl = String(options.apiBaseUrl || process.env.LINKLET_API_URL || 'https://api.linklet.workers.dev').replace(/\/+$/, '');
    const getApiKey = typeof options.getApiKey === 'function'
        ? options.getApiKey
        : () => (options.apiKey !== undefined ? options.apiKey : process.env.LINKLET_API_KEY || '').trim();
    const getPublicUrl = typeof options.getPublicUrl === 'function'
        ? options.getPublicUrl
        : () => (options.publicUrl !== undefined ? options.publicUrl : process.env.MILKBOX_PUBLIC_URL || '').trim();
    const getPublicIpOverride = typeof options.getPublicIpOverride === 'function'
        ? options.getPublicIpOverride
        : () => (options.publicIp !== undefined ? options.publicIp : process.env.MILKBOX_PUBLIC_IP || '').trim();

    const fetchImpl = options.fetchImpl || global.fetch;
    const dnsLookup = options.dnsLookup || dns.lookup;
    const now = options.now || (() => Date.now());
    const stateFilePath = options.stateFilePath === null
        ? null
        : (options.stateFilePath || path.join(__dirname, '.linklet-rate-limits.json'));

    const userLimits = {
        ...DEFAULT_USER_LIMITS,
        ...(options.userLimits || {})
    };

    const state = {
        users: new Map(),
        globalMinuteTimestamps: [],
        globalDailyLinks: [],
        upstreamCooldownUntil: 0,
        jobs: new Map()
    };

    function loadPersistedState() {
        if (!stateFilePath) return;
        try {
            if (!fs.existsSync(stateFilePath)) return;
            const raw = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
            if (raw && typeof raw === 'object') {
                if (Array.isArray(raw.globalMinuteTimestamps)) state.globalMinuteTimestamps = raw.globalMinuteTimestamps;
                if (Array.isArray(raw.globalDailyLinks)) state.globalDailyLinks = raw.globalDailyLinks;
                if (typeof raw.upstreamCooldownUntil === 'number') state.upstreamCooldownUntil = raw.upstreamCooldownUntil;
                if (raw.users && typeof raw.users === 'object') {
                    for (const [ip, rec] of Object.entries(raw.users)) {
                        if (rec && typeof rec === 'object') {
                            state.users.set(ip, {
                                requestTimestamps: Array.isArray(rec.requestTimestamps) ? rec.requestTimestamps : [],
                                dailyLinks: Array.isArray(rec.dailyLinks) ? rec.dailyLinks : []
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[Linklet] Could not load persisted rate-limit state:', err.message);
        }
    }

    function persistState() {
        if (!stateFilePath) return;
        try {
            const serializedUsers = {};
            for (const [ip, rec] of state.users.entries()) {
                if (rec.requestTimestamps.length || rec.dailyLinks.length) {
                    serializedUsers[ip] = rec;
                }
            }
            const payload = {
                globalMinuteTimestamps: state.globalMinuteTimestamps,
                globalDailyLinks: state.globalDailyLinks,
                upstreamCooldownUntil: state.upstreamCooldownUntil,
                users: serializedUsers
            };
            fs.writeFileSync(stateFilePath, JSON.stringify(payload), 'utf8');
        } catch (err) {
            console.warn('[Linklet] Could not persist rate-limit state:', err.message);
        }
    }

    loadPersistedState();

    function pruneState(ts) {
        const minuteCutoff = ts - 60 * 1000;
        const dayCutoff = ts - userLimits.dayMs;
        const userWindowCutoff = ts - userLimits.windowMs;

        state.globalMinuteTimestamps = state.globalMinuteTimestamps.filter((t) => t > minuteCutoff);
        state.globalDailyLinks = state.globalDailyLinks.filter((entry) => entry && entry.ts > dayCutoff && entry.count > 0);

        for (const [ip, rec] of state.users.entries()) {
            rec.requestTimestamps = rec.requestTimestamps.filter((t) => t > userWindowCutoff);
            rec.dailyLinks = rec.dailyLinks.filter((entry) => entry && entry.ts > dayCutoff && entry.count > 0);
            if (!rec.requestTimestamps.length && !rec.dailyLinks.length) {
                state.users.delete(ip);
            }
        }

        // Keep at most 200 tracked job metadata entries in memory
        if (state.jobs.size > 200) {
            const oldestKey = state.jobs.keys().next().value;
            state.jobs.delete(oldestKey);
        }
    }

    function getUserRecord(ip) {
        let rec = state.users.get(ip);
        if (!rec) {
            rec = { requestTimestamps: [], dailyLinks: [] };
            state.users.set(ip, rec);
        }
        return rec;
    }

    function getQuotaSnapshot(clientIp) {
        const ts = now();
        pruneState(ts);

        const rec = state.users.get(clientIp) || { requestTimestamps: [], dailyLinks: [] };
        const usedRequests = rec.requestTimestamps.length;
        const remainingRequests = Math.max(0, userLimits.maxGenerationsPerWindow - usedRequests);
        const oldestRequest = rec.requestTimestamps.length ? Math.min(...rec.requestTimestamps) : null;
        const resetAt = oldestRequest ? oldestRequest + userLimits.windowMs : null;
        const retryAfterSeconds = (remainingRequests === 0 && resetAt)
            ? Math.max(1, Math.ceil((resetAt - ts) / 1000))
            : 0;

        const userLinksUsedToday = rec.dailyLinks.reduce((sum, entry) => sum + entry.count, 0);
        const remainingLinksToday = Math.max(0, userLimits.maxLinksPerDay - userLinksUsedToday);

        const globalMinuteUsed = state.globalMinuteTimestamps.length;
        const globalMinuteRemaining = Math.max(0, LINKLET_ALLONE_MAX_TIER.perMinute - globalMinuteUsed);
        const globalDayUsed = state.globalDailyLinks.reduce((sum, entry) => sum + entry.count, 0);
        const globalDayRemaining = Math.max(0, LINKLET_ALLONE_MAX_TIER.perDay - globalDayUsed);

        return {
            user: {
                maxGenerationsPerWindow: userLimits.maxGenerationsPerWindow,
                windowSeconds: Math.round(userLimits.windowMs / 1000),
                windowLabel: userLimits.windowLabel,
                limitText: `${userLimits.maxGenerationsPerWindow} generations per ${userLimits.windowLabel}`,
                usedRequests,
                remainingRequests,
                resetAt,
                retryAfterSeconds,
                maxLinksPerGeneration: userLimits.maxLinksPerGeneration,
                maxLinksPerDay: userLimits.maxLinksPerDay,
                linksUsedToday: userLinksUsedToday,
                remainingLinksToday
            },
            global: {
                tier: LINKLET_ALLONE_MAX_TIER,
                minuteUsed: globalMinuteUsed,
                minuteRemaining: globalMinuteRemaining,
                dayUsed: globalDayUsed,
                dayRemaining: globalDayRemaining,
                upstreamCooldownSeconds: state.upstreamCooldownUntil > ts
                    ? Math.ceil((state.upstreamCooldownUntil - ts) / 1000)
                    : 0
            }
        };
    }

    async function resolveSiteInfo(req) {
        const origin = resolveTargetSiteUrl(req, getPublicUrl());
        let hostname = '';
        try {
            hostname = new URL(origin).hostname;
        } catch (_) {}

        let resolvedIp = null;
        const overrideIp = getPublicIpOverride();
        if (isValidPublicIpv4(overrideIp)) {
            resolvedIp = overrideIp;
        } else if (hostname) {
            if (isValidPublicIpv4(hostname)) {
                resolvedIp = hostname;
            } else {
                try {
                    const lookup = await dnsLookup(hostname, { family: 4 });
                    if (lookup && isValidPublicIpv4(lookup.address)) {
                        resolvedIp = lookup.address;
                    }
                } catch (_) {}
            }
        }

        return {
            origin,
            hostname,
            resolvedIp
        };
    }

    async function getStatus(req) {
        const clientIp = normalizeClientIp(req);
        const quota = getQuotaSnapshot(clientIp);
        const siteInfo = await resolveSiteInfo(req);

        return {
            configured: Boolean(getApiKey()),
            tier: LINKLET_ALLONE_MAX_TIER,
            providers: LINKLET_PROVIDERS.map((p) => ({
                ...p,
                userMaxAmount: Math.min(p.maxAmount, userLimits.maxLinksPerGeneration)
            })),
            limits: quota.user,
            globalUsage: quota.global,
            siteInfo
        };
    }

    function buildGeneratePayload(input, siteInfo) {
        const providerId = String(input && input.provider ? input.provider : '').trim().toLowerCase();
        const provider = PROVIDER_MAP.get(providerId);
        if (!provider) {
            return { errorStatus: 400, error: `Unsupported provider "${providerId}".` };
        }

        const requestedAmount = input && input.amount !== undefined ? Number(input.amount) : 1;
        if (!Number.isInteger(requestedAmount) || requestedAmount < 1) {
            return { errorStatus: 400, error: 'amount must be a positive integer.' };
        }

        const effectiveUserMax = Math.min(
            provider.maxAmount,
            LINKLET_ALLONE_MAX_TIER.linksPerGeneration,
            userLimits.maxLinksPerGeneration
        );
        if (requestedAmount > effectiveUserMax) {
            return {
                errorStatus: 400,
                error: `Requested amount (${requestedAmount}) exceeds limit of ${effectiveUserMax} link(s) per generation for ${provider.id}.`
            };
        }

        if (provider.kind === 'ip') {
            const candidateIp = String(input && input.ip ? input.ip : (siteInfo.resolvedIp || '')).trim();
            if (!isValidPublicIpv4(candidateIp)) {
                return {
                    errorStatus: 400,
                    error: `A valid public IPv4 address is required for ${provider.id} (could not auto-detect public IPv4 for this host).`
                };
            }

            const payload = {
                provider: provider.id,
                ip: candidateIp,
                amount: requestedAmount
            };

            if (provider.supportsOptionalName && input && typeof input.name === 'string' && input.name.trim()) {
                const cleanName = input.name
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 32);
                if (!cleanName) {
                    return { errorStatus: 400, error: 'Optional name must contain alphanumeric characters or hyphens.' };
                }
                payload.name = cleanName;
            }

            return { provider, payload };
        }

        // File-based request per Linklet docs
        const requestedFormat = String(input && input.format ? input.format : provider.defaultFormat).trim().toLowerCase();
        const format = provider.formats.includes(requestedFormat) ? requestedFormat : provider.defaultFormat;
        if (input && input.format && !provider.formats.includes(requestedFormat)) {
            return {
                errorStatus: 400,
                error: `Provider "${provider.id}" only supports ${provider.formats.join(' / ').toUpperCase()} format.`
            };
        }

        const tabTitle = sanitizeTabTitle(input && input.tabTitle);
        const contentString = format === 'svg'
            ? buildSvgMirrorDocument(siteInfo.origin, tabTitle)
            : buildHtmlMirrorDocument(siteInfo.origin, tabTitle);
        const fileName = format === 'svg' ? 'milkbox-mirror.svg' : 'milkbox-mirror.html';
        const contentType = format === 'svg' ? 'image/svg+xml' : 'text/html';
        const contentBase64 = Buffer.from(contentString, 'utf8').toString('base64');

        return {
            provider,
            payload: {
                provider: provider.id,
                fileName,
                contentType,
                contentBase64,
                amount: requestedAmount
            }
        };
    }

    function checkAndReserveLimits(clientIp, amount) {
        const ts = now();
        const quota = getQuotaSnapshot(clientIp);

        if (state.upstreamCooldownUntil > ts) {
            const retryAfter = Math.max(1, Math.ceil((state.upstreamCooldownUntil - ts) / 1000));
            return {
                allowed: false,
                status: 429,
                retryAfter,
                error: `Linklet upstream cooldown active. Please retry in ${retryAfter}s.`
            };
        }

        if (quota.user.remainingRequests <= 0) {
            return {
                allowed: false,
                status: 429,
                retryAfter: quota.user.retryAfterSeconds || 60,
                error: `Rate limit reached: maximum ${userLimits.maxGenerationsPerWindow} generations per ${userLimits.windowLabel}. Try again in ${Math.ceil((quota.user.retryAfterSeconds || 60) / 60)} min.`
            };
        }

        if (amount > quota.user.remainingLinksToday) {
            return {
                allowed: false,
                status: 429,
                retryAfter: 3600,
                error: `Daily link limit reached (${userLimits.maxLinksPerDay} links per day per user; ${quota.user.remainingLinksToday} remaining today).`
            };
        }

        if (quota.global.minuteRemaining <= 0) {
            const oldestMin = state.globalMinuteTimestamps.length ? Math.min(...state.globalMinuteTimestamps) : ts;
            const retryAfter = Math.max(1, Math.ceil((oldestMin + 60 * 1000 - ts) / 1000));
            return {
                allowed: false,
                status: 429,
                retryAfter,
                error: `Linklet AllOne MAX minute capacity (${LINKLET_ALLONE_MAX_TIER.perMinute}/min) reached. Please wait ${retryAfter}s.`
            };
        }

        if (amount > quota.global.dayRemaining) {
            return {
                allowed: false,
                status: 429,
                retryAfter: 3600,
                error: `Linklet AllOne MAX daily allowance (${LINKLET_ALLONE_MAX_TIER.perDay}/day) reached for today.`
            };
        }

        return { allowed: true };
    }

    function recordConsumption(clientIp, amount) {
        const ts = now();
        const rec = getUserRecord(clientIp);
        rec.requestTimestamps.push(ts);
        rec.dailyLinks.push({ ts, count: amount });
        state.globalMinuteTimestamps.push(ts);
        state.globalDailyLinks.push({ ts, count: amount });
        persistState();
    }

    function parseRetryAfterSeconds(headerValue) {
        if (!headerValue) return 0;
        const asNum = Number(headerValue);
        if (Number.isFinite(asNum) && asNum > 0) return Math.ceil(asNum);
        const asDate = Date.parse(headerValue);
        if (Number.isFinite(asDate)) {
            return Math.max(1, Math.ceil((asDate - now()) / 1000));
        }
        return 0;
    }

    async function generateSiteLinks(req, input) {
        const apiKey = getApiKey();
        if (!apiKey) {
            return {
                status: 503,
                body: {
                    error: 'Linklet API is not configured on this server. Set LINKLET_API_KEY in .env.'
                }
            };
        }

        const clientIp = normalizeClientIp(req);
        const siteInfo = await resolveSiteInfo(req);
        const built = buildGeneratePayload(input, siteInfo);
        if (built.error) {
            return {
                status: built.errorStatus || 400,
                body: {
                    error: built.error,
                    limits: getQuotaSnapshot(clientIp).user
                }
            };
        }

        const gate = checkAndReserveLimits(clientIp, built.payload.amount);
        if (!gate.allowed) {
            return {
                status: gate.status,
                headers: { 'Retry-After': String(gate.retryAfter) },
                body: {
                    error: gate.error,
                    retryAfterSeconds: gate.retryAfter,
                    limits: getQuotaSnapshot(clientIp).user
                }
            };
        }

        let upstreamRes;
        let upstreamData = null;
        try {
            upstreamRes = await fetchImpl(`${apiBaseUrl}/v1/generate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(built.payload),
                signal: AbortSignal.timeout(15000)
            });
            const rawText = await upstreamRes.text();
            try {
                upstreamData = rawText ? JSON.parse(rawText) : {};
            } catch (_) {
                upstreamData = { raw: rawText };
            }
        } catch (err) {
            return {
                status: 502,
                body: {
                    error: 'Failed to reach Linklet generation service.',
                    message: err.message,
                    limits: getQuotaSnapshot(clientIp).user
                }
            };
        }

        if (upstreamRes.status === 429) {
            const retryAfter = parseRetryAfterSeconds(upstreamRes.headers && upstreamRes.headers.get && upstreamRes.headers.get('retry-after')) || 30;
            state.upstreamCooldownUntil = now() + retryAfter * 1000;
            persistState();
            return {
                status: 429,
                headers: { 'Retry-After': String(retryAfter) },
                body: {
                    error: (upstreamData && (upstreamData.error || upstreamData.message)) || 'Linklet rate or queue limit reached.',
                    retryAfterSeconds: retryAfter,
                    limits: getQuotaSnapshot(clientIp).user
                }
            };
        }

        if (upstreamRes.status === 401) {
            return {
                status: 502,
                body: {
                    error: 'Linklet API key was rejected by upstream (401). Please verify LINKLET_API_KEY.'
                }
            };
        }

        if (!upstreamRes.ok) {
            return {
                status: upstreamRes.status >= 500 ? 502 : upstreamRes.status,
                body: {
                    error: (upstreamData && (upstreamData.error || upstreamData.message)) || `Linklet request failed (${upstreamRes.status}).`,
                    limits: getQuotaSnapshot(clientIp).user
                }
            };
        }

        recordConsumption(clientIp, built.payload.amount);

        const jobId = upstreamData.id || upstreamData.jobId || null;
        if (jobId) {
            state.jobs.set(String(jobId), {
                id: String(jobId),
                provider: built.payload.provider,
                requested: built.payload.amount,
                siteUrl: siteInfo.origin,
                lastPollAt: 0
            });
        }

        const updatedQuota = getQuotaSnapshot(clientIp);
        return {
            status: 202,
            body: {
                id: jobId,
                provider: built.payload.provider,
                status: upstreamData.status || 'queued',
                requested: upstreamData.requested || built.payload.amount,
                statusUrl: jobId ? `/api/linklet/jobs/${encodeURIComponent(jobId)}` : null,
                siteUrl: siteInfo.origin,
                tier: LINKLET_ALLONE_MAX_TIER,
                limits: updatedQuota.user,
                globalUsage: updatedQuota.global
            }
        };
    }

    async function getJobStatus(req, jobId) {
        const apiKey = getApiKey();
        if (!apiKey) {
            return {
                status: 503,
                body: { error: 'Linklet API is not configured on this server.' }
            };
        }

        const cleanJobId = String(jobId || '').trim();
        if (!cleanJobId || !/^[a-zA-Z0-9._-]+$/.test(cleanJobId) || cleanJobId.length > 128) {
            return {
                status: 400,
                body: { error: 'Invalid Linklet job ID.' }
            };
        }

        const ts = now();
        if (state.upstreamCooldownUntil > ts) {
            const retryAfter = Math.max(1, Math.ceil((state.upstreamCooldownUntil - ts) / 1000));
            return {
                status: 429,
                headers: { 'Retry-After': String(retryAfter) },
                body: {
                    error: `Linklet rate-limit cooldown active. Retry in ${retryAfter}s.`,
                    retryAfterSeconds: retryAfter
                }
            };
        }

        let upstreamRes;
        let upstreamData = null;
        try {
            upstreamRes = await fetchImpl(`${apiBaseUrl}/v1/generate/${encodeURIComponent(cleanJobId)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                signal: AbortSignal.timeout(12000)
            });
            const rawText = await upstreamRes.text();
            try {
                upstreamData = rawText ? JSON.parse(rawText) : {};
            } catch (_) {
                upstreamData = { raw: rawText };
            }
        } catch (err) {
            return {
                status: 502,
                body: { error: 'Failed to poll Linklet job status.', message: err.message }
            };
        }

        if (upstreamRes.status === 429) {
            const retryAfter = parseRetryAfterSeconds(upstreamRes.headers && upstreamRes.headers.get && upstreamRes.headers.get('retry-after')) || 10;
            state.upstreamCooldownUntil = now() + retryAfter * 1000;
            persistState();
            return {
                status: 429,
                headers: { 'Retry-After': String(retryAfter) },
                body: {
                    error: (upstreamData && (upstreamData.error || upstreamData.message)) || 'Linklet rate limit reached while checking job.',
                    retryAfterSeconds: retryAfter
                }
            };
        }

        if (!upstreamRes.ok) {
            return {
                status: upstreamRes.status >= 500 ? 502 : upstreamRes.status,
                body: {
                    error: (upstreamData && (upstreamData.error || upstreamData.message)) || `Linklet job lookup failed (${upstreamRes.status}).`
                }
            };
        }

        return {
            status: 200,
            body: {
                id: upstreamData.id || cleanJobId,
                provider: upstreamData.provider || (state.jobs.get(cleanJobId)?.provider) || null,
                status: upstreamData.status || 'pending',
                requested: upstreamData.requested ?? null,
                completed: upstreamData.completed ?? 0,
                results: Array.isArray(upstreamData.results) ? upstreamData.results : [],
                failures: Array.isArray(upstreamData.failures) ? upstreamData.failures : []
            }
        };
    }

    async function handleHttpRequest(req, res, requestPath) {
        if (!requestPath.startsWith('/api/linklet')) return false;

        const sendResult = (result) => {
            const headers = {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                ...(result.headers || {})
            };
            res.writeHead(result.status, headers);
            res.end(JSON.stringify(result.body));
        };

        if (requestPath === '/api/linklet/status' && req.method === 'GET') {
            const statusPayload = await getStatus(req);
            sendResult({ status: 200, body: statusPayload });
            return true;
        }

        if (requestPath === '/api/linklet/generate') {
            if (req.method !== 'POST') {
                sendResult({ status: 405, body: { error: 'Method not allowed' } });
                return true;
            }
            const MAX_BODY_BYTES = 64 * 1024;
            let totalBytes = 0;
            const chunks = [];
            let aborted = false;

            req.on('data', (chunk) => {
                if (aborted) return;
                totalBytes += chunk.length;
                if (totalBytes > MAX_BODY_BYTES) {
                    aborted = true;
                    sendResult({ status: 413, body: { error: 'Request body too large' } });
                    return;
                }
                chunks.push(chunk);
            });

            req.on('end', async () => {
                if (aborted) return;
                let parsed;
                try {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    parsed = raw ? JSON.parse(raw) : {};
                } catch (_) {
                    sendResult({ status: 400, body: { error: 'Invalid JSON request body.' } });
                    return;
                }
                const result = await generateSiteLinks(req, parsed);
                sendResult(result);
            });
            return true;
        }

        if (requestPath.startsWith('/api/linklet/jobs/') && req.method === 'GET') {
            const jobId = requestPath.slice('/api/linklet/jobs/'.length);
            const result = await getJobStatus(req, jobId);
            sendResult(result);
            return true;
        }

        sendResult({ status: 404, body: { error: 'Linklet endpoint not found' } });
        return true;
    }

    return {
        LINKLET_ALLONE_MAX_TIER,
        LINKLET_PROVIDERS,
        userLimits,
        getStatus,
        getQuotaSnapshot,
        buildGeneratePayload,
        generateSiteLinks,
        getJobStatus,
        handleHttpRequest
    };
}

module.exports = {
    LINKLET_ALLONE_MAX_TIER,
    LINKLET_PROVIDERS,
    DEFAULT_USER_LIMITS,
    isValidPublicIpv4,
    normalizeClientIp,
    buildHtmlMirrorDocument,
    buildSvgMirrorDocument,
    createLinkletService
};
