const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const liveTvScript = fs.readFileSync(path.join(root, 'live-tv.js'), 'utf8');
const appScript = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

async function createPage(url = 'http://localhost/livetv') {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
    await new Promise(resolve => dom.window.addEventListener('DOMContentLoaded', resolve, { once: true }));
    dom.window.eval(dom.window.document.querySelector('head script:not([src])').textContent);
    return dom;
}

function setupNavigation(window) {
    Object.assign(window, {
        stopHeroTrailer() {},
        updateNavDropdownLabel() {},
        getAnimeContinueWatching: () => [],
        getMovieContinueWatching: () => [],
        renderLiveTab() {},
        observeContentSections() {},
    });
    const routeCode = appScript.slice(
        appScript.indexOf('const ROUTE_URL_MAP = {'),
        appScript.indexOf('function handleNavClick(')
    );
    window.eval(`${routeCode}
        window.testSectionFromPath = getSectionFromPath;
        window.testCurrentSection = getCurrentSectionFromLocation;
        window.testApplySectionChange = applySectionChange;`);
}

test('live TV route survives reload and is hidden when navigating away', async () => {
    const dom = await createPage();
    const { window } = dom;
    setupNavigation(window);
    assert.equal(window.testSectionFromPath('/livetv/'), 'livetv');
    window.testApplySectionChange('livetv', null, false);
    assert.equal(window.document.getElementById('liveTvSection').style.display, '');
    window.testApplySectionChange('manga', null, false);
    assert.equal(window.document.getElementById('liveTvSection').style.display, 'none');
    dom.window.close();
});

test('GitHub Pages resolves assets and keeps live TV navigation under the repository path', async () => {
    const dom = await createPage('https://iordbeerus.github.io/MILKBOX/');
    const { window } = dom;
    setupNavigation(window);
    assert.equal(window.document.querySelector('script[src*="live-tv.js"]').src, 'https://iordbeerus.github.io/MILKBOX/live-tv.js?v=20261114-pages-v3');
    assert.equal(window.document.querySelector('link[href="styles.css"]').href, 'https://iordbeerus.github.io/MILKBOX/styles.css');
    window.testApplySectionChange('livetv', null);
    assert.equal(window.location.href, 'https://iordbeerus.github.io/MILKBOX/#/livetv');
    assert.equal(window.testCurrentSection(), 'livetv');
    dom.window.close();
});

test('worldwide playlist metadata supports country, category, and search filters', async () => {
    const dom = await createPage();
    const { window } = dom;
    window.fetch = async () => ({
        ok: true,
        text: async () => [
            '#EXTM3U',
            '#EXTINF:-1 tvg-id="First.us@SD" tvg-logo="https://example.com/logo.png" group-title="News;General",First',
            'https://example.com/first.m3u8',
            '#EXTINF:-1 tvg-id="Second.ca" group-title="Sports",Second',
            'https://example.com/second.m3u8',
            '#EXTINF:-1 tvg-id="Duplicate.us@SD",Duplicate',
            'https://example.com/first.m3u8',
        ].join('\n'),
    });
    window.eval(liveTvScript);
    await window.initializeLiveTV();
    const document = window.document;
    assert.equal(document.querySelectorAll('#liveTvGrid .live-tv-card').length, 2);
    assert.ok([...document.getElementById('liveTvCountryFilter').options].some(option => option.value === 'Canada'));
    document.getElementById('liveTvCategoryFilter').value = 'news';
    window.filterLiveTvChannels();
    assert.match(document.getElementById('liveTvGrid').textContent, /First/);
    assert.doesNotMatch(document.getElementById('liveTvGrid').textContent, /Second/);
    document.getElementById('liveTvCategoryFilter').value = '';
    document.getElementById('liveTvSearch').value = 'Canada';
    window.filterLiveTvChannels();
    assert.match(document.getElementById('liveTvGrid').textContent, /Second/);
    dom.window.close();
});

test('playlist failures replace the loading state with an error', async () => {
    const dom = await createPage();
    const { window } = dom;
    window.fetch = async () => ({ ok: false, status: 503 });
    window.eval(liveTvScript);
    await window.initializeLiveTV();
    assert.equal(window.document.getElementById('liveTvGrid').style.display, 'none');
    assert.match(window.document.getElementById('liveTvStatus').textContent, /Failed to load/);
    dom.window.close();
});

class FakeHls {
        static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest', LEVEL_SWITCHING: 'level', FRAG_BUFFERED: 'fragment' };
        static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' };
        static isSupported() { return true; }
        constructor() { this.handlers = {}; }
        on(event, handler) { this.handlers[event] = handler; }
        loadSource(url) { this.source = url; }
        attachMedia() {}
        destroy() { this.destroyed = true; }
}

test('playback errors remain visible and closing the player cleans up HLS', async () => {
    const dom = await createPage();
    const { window } = dom;
    window.Hls = FakeHls;
    window.eval(liveTvScript);
    window.playLiveChannel({ name: 'Test', category: 'News', country: 'Canada', url: 'https://example.com/live.m3u8' });
    const player = window.liveTvHlsInstance;
    assert.equal(player.source, '/api/livetv/stream?url=https%3A%2F%2Fexample.com%2Flive.m3u8');
    player.handlers.error('error', { fatal: true, type: 'network' });
    assert.match(window.document.getElementById('liveTvPlayerLoading').textContent, /Network error/);
    window.document.getElementById('closeLiveTvPlayer').click();
    assert.equal(player.destroyed, true);
    assert.equal(window.liveTvHlsInstance, null);
    assert.equal(window.document.getElementById('liveTvPlayerModal'), null);
    dom.window.close();
});

test('GitHub Pages plays HLS streams directly', async () => {
    const dom = await createPage('https://iordbeerus.github.io/MILKBOX/');
    const { window } = dom;
    window.Hls = FakeHls;
    window.eval(liveTvScript);
    window.playLiveChannel({ name: 'Test', category: 'News', country: 'Canada', url: 'https://example.com/live.m3u8' });
    assert.equal(window.liveTvHlsInstance.source, 'https://example.com/live.m3u8');
    window.document.getElementById('closeLiveTvPlayer').click();
    dom.window.close();
});
