const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { JSDOM } = require('jsdom');

const {
    LINKLET_ALLONE_MAX_TIER,
    PUBLIC_TIER_INFO,
    isValidPublicIpv4,
    createLinkletService
} = require('../linklet-service');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const adguardScript = fs.readFileSync(path.join(root, 'adguard-popupblocker.js'), 'utf8');
const linkMakerClientScript = fs.readFileSync(path.join(root, 'link-maker.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function makeReq(ip = '203.0.113.10', host = 'milkbox.fyi') {
    return {
        headers: {
            'x-forwarded-for': ip,
            'x-forwarded-host': host,
            'x-forwarded-proto': 'https'
        },
        socket: { remoteAddress: ip, encrypted: true }
    };
}

test('uses Linklet AllOne MAX tier limits exclusively and hides Linklet from client code', () => {
    assert.deepEqual(LINKLET_ALLONE_MAX_TIER, {
        name: 'Linklet AllOne MAX',
        perMinute: 50,
        perDay: 5000,
        linksPerGeneration: 100
    });
    const serviceSrc = fs.readFileSync(path.join(root, 'linklet-service.js'), 'utf8');
    assert.doesNotMatch(serviceSrc, /AllOne.*Basic|AllOne.*Plus/i);

    // Ensure no browser-served file mentions Linklet or exposes the client-facing mirror script
    assert.doesNotMatch(html, /linklet/i);
    assert.doesNotMatch(linkMakerClientScript, /linklet/i);
    assert.doesNotMatch(stylesCss, /linklet/i);
    assert.doesNotMatch(adguardScript, /linklet/i);
    assert.equal(fs.existsSync(path.join(root, 'linklet-mirror.js')), false);
});

test('formats file-based requests properly, decodes valid HTML/SVG portals, and sanitizes public responses', async () => {
    const captured = [];
    const service = createLinkletService({
        apiKey: 'lkt_live_test_key',
        stateFilePath: null,
        fetchImpl: async (url, init) => {
            captured.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
            if (init.method === 'POST') {
                return {
                    ok: true,
                    status: 202,
                    headers: new Map(),
                    text: async () => JSON.stringify({ id: 'job-file-1', status: 'queued', requested: 2 })
                };
            }
            return {
                ok: true,
                status: 200,
                headers: new Map(),
                text: async () => JSON.stringify({
                    id: 'job-file-1',
                    provider: 'cloudflare',
                    status: 'complete',
                    requested: 2,
                    completed: 2,
                    results: ['https://mirror-1.pages.dev', 'https://mirror-2.pages.dev'],
                    failures: []
                })
            };
        }
    });

    const statusPayload = await service.getStatus(makeReq());
    assert.doesNotMatch(JSON.stringify(statusPayload), /linklet|LINKLET_API_KEY|\.env/i);

    const res = await service.generateSiteLinks(makeReq(), {
        provider: 'cloudflare',
        format: 'html',
        tabTitle: 'Study Notes',
        amount: 2
    });

    assert.equal(res.status, 202);
    assert.equal(res.body.statusUrl, '/api/link-maker/jobs/job-file-1');
    assert.doesNotMatch(JSON.stringify(res.body), /linklet|LINKLET_API_KEY|\.env/i);
    assert.equal(captured[0].url, 'https://api.linklet.workers.dev/v1/generate');
    assert.equal(captured[0].init.headers.Authorization, 'Bearer lkt_live_test_key');
    assert.equal(captured[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(Object.keys(captured[0].body).sort(), ['amount', 'contentBase64', 'contentType', 'fileName', 'provider']);
    assert.equal(captured[0].body.provider, 'cloudflare');
    assert.equal(captured[0].body.fileName, 'milkbox-mirror.html');
    assert.equal(captured[0].body.contentType, 'text/html');
    assert.equal(captured[0].body.amount, 2);

    const decodedHtml = Buffer.from(captured[0].body.contentBase64, 'base64').toString('utf8');
    assert.match(decodedHtml, /<title>Study Notes<\/title>/);
    assert.match(decodedHtml, /https:\/\/milkbox\.fyi/);

    const jobRes = await service.getJobStatus(makeReq(), 'job-file-1');
    assert.equal(jobRes.status, 200);
    assert.equal(captured[1].url, 'https://api.linklet.workers.dev/v1/generate/job-file-1');
    assert.equal(jobRes.body.results.length, 2);
    assert.doesNotMatch(JSON.stringify(jobRes.body), /linklet/i);

    // Padlet enforces SVG format and maximum of 1 link
    const padletBad = await service.generateSiteLinks(makeReq(), { provider: 'padlet', format: 'html', amount: 1 });
    assert.equal(padletBad.status, 400);
    const padletOk = await service.generateSiteLinks(makeReq(), { provider: 'padlet', format: 'svg', amount: 1 });
    assert.equal(padletOk.status, 202);
    assert.equal(captured[2].body.fileName, 'milkbox-mirror.svg');
    assert.equal(captured[2].body.contentType, 'image/svg+xml');
});

test('formats IP-domain requests (sslip and envpm) and rejects private/loopback IPv4', async () => {
    assert.equal(isValidPublicIpv4('34.73.99.76'), true);
    assert.equal(isValidPublicIpv4('127.0.0.1'), false);
    assert.equal(isValidPublicIpv4('192.168.1.50'), false);

    const captured = [];
    const service = createLinkletService({
        apiKey: 'lkt_live_test_key',
        stateFilePath: null,
        dnsLookup: async () => ({ address: '34.73.99.76', family: 4 }),
        fetchImpl: async (url, init) => {
            captured.push(JSON.parse(init.body));
            return {
                ok: true,
                status: 202,
                headers: new Map(),
                text: async () => JSON.stringify({ id: 'job-ip-1', status: 'queued', requested: 1 })
            };
        }
    });

    const sslipRes = await service.generateSiteLinks(makeReq(), { provider: 'sslip', amount: 3 });
    assert.equal(sslipRes.status, 202);
    assert.deepEqual(captured[0], { provider: 'sslip', ip: '34.73.99.76', amount: 3 });

    const envpmRes = await service.generateSiteLinks(makeReq(), { provider: 'envpm', amount: 1, name: 'MilkBox-Alt!' });
    assert.equal(envpmRes.status, 202);
    assert.deepEqual(captured[1], { provider: 'envpm', ip: '34.73.99.76', amount: 1, name: 'milkbox-alt' });

    const badIpRes = await service.generateSiteLinks(makeReq(), { provider: 'sslip', ip: '127.0.0.1', amount: 1 });
    assert.equal(badIpRes.status, 400);
});

test('enforces anti-spam limit of 3 generations per hour per user and batch cap', async () => {
    let clock = 1_700_000_000_000;
    const service = createLinkletService({
        apiKey: 'lkt_live_test_key',
        stateFilePath: null,
        now: () => clock,
        fetchImpl: async () => ({
            ok: true,
            status: 202,
            headers: new Map(),
            text: async () => JSON.stringify({ id: `job-${clock}`, status: 'queued', requested: 1 })
        })
    });

    const userA = makeReq('198.51.100.42');
    const userB = makeReq('198.51.100.99');

    // Batch cap rejects > 5 links per generation
    const overBatch = await service.generateSiteLinks(userA, { provider: 'cloudflare', amount: 6 });
    assert.equal(overBatch.status, 400);

    // 3 generations within 1 hour succeed
    for (let i = 0; i < 3; i++) {
        clock += 10_000;
        const okRes = await service.generateSiteLinks(userA, { provider: 'cloudflare', amount: 1 });
        assert.equal(okRes.status, 202);
        assert.equal(okRes.body.limits.remainingRequests, 2 - i);
    }

    // 4th generation within the same hour is blocked with 429 & Retry-After
    clock += 10_000;
    const blocked = await service.generateSiteLinks(userA, { provider: 'cloudflare', amount: 1 });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers['Retry-After']) > 0);
    assert.match(blocked.body.error, /3 generations per hour/);

    // Different user IP still works
    const otherUser = await service.generateSiteLinks(userB, { provider: 'cloudflare', amount: 1 });
    assert.equal(otherUser.status, 202);

    // Advancing clock past 1 hour resets User A's quota
    clock += 60 * 60 * 1000 + 1000;
    const afterHour = await service.generateSiteLinks(userA, { provider: 'cloudflare', amount: 1 });
    assert.equal(afterHour.status, 202);
});

test('respects upstream 429 Retry-After cooldown and sanitizes upstream Linklet errors', async () => {
    let clock = 1_700_000_000_000;
    let upstreamCalls = 0;
    const service = createLinkletService({
        apiKey: 'lkt_live_test_key',
        stateFilePath: null,
        now: () => clock,
        fetchImpl: async () => {
            upstreamCalls++;
            return {
                ok: false,
                status: 429,
                headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '45' : null) },
                text: async () => JSON.stringify({ error: 'Linklet rate limit reached' })
            };
        }
    });

    const req = makeReq('198.51.100.77');
    const first = await service.generateSiteLinks(req, { provider: 'cdn', amount: 1 });
    assert.equal(first.status, 429);
    assert.equal(first.headers['Retry-After'], '45');
    assert.equal(upstreamCalls, 1);
    assert.doesNotMatch(first.body.error, /linklet/i);

    // Subsequent call during cooldown short-circuits locally before hitting upstream again
    clock += 5000;
    const second = await service.generateSiteLinks(req, { provider: 'cdn', amount: 1 });
    assert.equal(second.status, 429);
    assert.equal(upstreamCalls, 1);
    assert.doesNotMatch(second.body.error, /linklet/i);
});

test('server.js blocks direct HTTP access to backend files and old /api/linklet paths', () => {
    assert.match(serverSrc, /'linklet-service\.js'/);
    assert.match(serverSrc, /'server\.js'/);
    assert.match(serverSrc, /relNoSlash\.startsWith\('scripts\/'\)/);

    const service = createLinkletService({ apiKey: '', stateFilePath: null });
    return (async () => {
        const fakeRes = { statusCode: 0, body: '', writeHead(s) { this.statusCode = s; }, end(b) { this.body = b; } };
        const handledOld = await service.handleHttpRequest({ method: 'GET', headers: {}, socket: {} }, fakeRes, '/api/linklet/status');
        assert.equal(handledOld, false);
        const handledNew = await service.handleHttpRequest({ method: 'GET', headers: {}, socket: {} }, fakeRes, '/api/link-maker/status');
        assert.equal(handledNew, true);
        assert.equal(fakeRes.statusCode, 200);
        assert.doesNotMatch(fakeRes.body, /linklet|LINKLET_API_KEY|\.env/i);
    })();
});

test('Link Maker opens inside Settings, dynamically adapts provider inputs, polls results, and stays whitelisted by AdGuard', async () => {
    const dom = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'outside-only' });
    const { window } = dom;

    const statusPayload = {
        configured: true,
        tier: PUBLIC_TIER_INFO,
        providers: [
            { id: 'cloudflare', name: 'Cloudflare Pages', kind: 'file', input: 'SVG / HTML', formats: ['html', 'svg'], defaultFormat: 'html', maxAmount: 100, userMaxAmount: 5, supportsOptionalName: false },
            { id: 'padlet', name: 'Padlet', kind: 'file', input: 'SVG', formats: ['svg'], defaultFormat: 'svg', maxAmount: 1, userMaxAmount: 1, supportsOptionalName: false },
            { id: 'envpm', name: 'env.pm (IP + Name)', kind: 'ip', input: 'IPv4 + optional name', formats: ['ip'], defaultFormat: 'ip', maxAmount: 1, userMaxAmount: 1, supportsOptionalName: true }
        ],
        limits: {
            maxGenerationsPerWindow: 3,
            windowSeconds: 3600,
            windowLabel: 'hour',
            limitText: '3 generations per hour',
            usedRequests: 0,
            remainingRequests: 3,
            resetAt: null,
            retryAfterSeconds: 0,
            maxLinksPerGeneration: 5,
            maxLinksPerDay: 15,
            linksUsedToday: 0,
            remainingLinksToday: 15
        },
        globalUsage: {
            tier: PUBLIC_TIER_INFO,
            minuteUsed: 0,
            minuteRemaining: 50,
            dayUsed: 0,
            dayRemaining: 5000,
            upstreamCooldownSeconds: 0
        },
        siteInfo: { origin: 'https://milkbox.fyi', hostname: 'milkbox.fyi', resolvedIp: '34.73.99.76' }
    };

    window.fetch = async (url, init) => {
        if (url === '/api/link-maker/status') {
            return { ok: true, status: 200, json: async () => statusPayload };
        }
        if (url === '/api/link-maker/generate') {
            const body = JSON.parse(init.body);
            assert.equal(body.provider, 'cloudflare');
            return {
                ok: true,
                status: 202,
                json: async () => ({
                    id: 'job-ui-1',
                    provider: 'cloudflare',
                    status: 'queued',
                    requested: 1,
                    limits: { ...statusPayload.limits, usedRequests: 1, remainingRequests: 2 }
                })
            };
        }
        if (url === '/api/link-maker/jobs/job-ui-1') {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    id: 'job-ui-1',
                    provider: 'cloudflare',
                    status: 'complete',
                    requested: 1,
                    completed: 1,
                    results: ['https://milkbox-demo.pages.dev'],
                    failures: []
                })
            };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };

    window.eval(adguardScript);
    window.eval(linkMakerClientScript);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    assert.equal(window.document.getElementById('linkletNavBtn'), null);
    assert.equal(window.document.getElementById('footerGenerateSite'), null);

    window.document.getElementById('settingsOpenLinkMakerBtn').click();
    await new Promise((r) => setTimeout(r, 40));

    const settingsModal = window.document.getElementById('settingsModal');
    const linkMakerPanel = window.document.querySelector('.settings-tab-panel[data-settings-panel="linkmaker"]');
    assert.equal(settingsModal.classList.contains('active'), true);
    assert.equal(linkMakerPanel.classList.contains('active'), true);
    assert.notEqual(linkMakerPanel.getAttribute('data-adguard-blocked'), 'true');
    assert.match(window.document.getElementById('linkMakerUserQuotaVal').textContent, /3 \/ 3 generations left this hour/);

    // Submit form -> polls job -> displays generated link
    window.document.getElementById('linkMakerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 1100));

    const resultsText = window.document.getElementById('linkMakerResultsList').textContent;
    assert.match(resultsText, /https:\/\/milkbox-demo\.pages\.dev/);

    // Selecting padlet locks to SVG and max=1
    const sel = window.document.getElementById('linkMakerProviderSelect');
    sel.value = 'padlet';
    sel.dispatchEvent(new window.Event('change'));
    assert.equal(window.document.getElementById('linkMakerFormatSelect').value, 'svg');
    assert.equal(window.document.getElementById('linkMakerAmountInput').max, '1');

    // Selecting envpm reveals IP + optional name fields
    sel.value = 'envpm';
    sel.dispatchEvent(new window.Event('change'));
    assert.equal(window.document.getElementById('linkMakerIpFields').style.display, '');
    assert.equal(window.document.getElementById('linkMakerEnvNameGroup').style.display, '');
    assert.equal(window.document.getElementById('linkMakerIpInput').value, '34.73.99.76');

    dom.window.close();
});
