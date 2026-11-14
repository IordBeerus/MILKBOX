// LIVE TV Stream Handler
// Fetches and manages live TV channels from IPTV sources

let liveTvChannels = [];
let liveTvFilteredChannels = [];
let liveTvCountries = new Set();
let liveTvInitialized = false;
let liveTvLoadPromise = null;
const liveTvRegionNames = typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function escapeLiveTvHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function fetchLiveTvWithTimeout(url, timeoutMs) {
    if (typeof AbortController === 'undefined') {
        return fetch(url);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
        try { controller.abort(); } catch (_) {}
    }, timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function initializeLiveTV() {
    console.log('Initializing LIVE TV...');
    setupLiveTvUI();
    await loadLiveTvChannels();
}

function ensureLiveTvLoaded() {
    if (liveTvChannels.length > 0) return Promise.resolve();
    setupLiveTvUI();
    return loadLiveTvChannels();
}

async function fetchPlaylistText() {
    const directSource = 'https://iptv-org.github.io/iptv/index.m3u';
    const useServerPlaylist = !window.MILKBOX_GITHUB_PAGES && window.location && window.location.protocol !== 'file:';
    const sources = useServerPlaylist ? ['/api/livetv/playlist', directSource] : [directSource];

    let lastError = null;
    for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        try {
            const response = await fetchLiveTvWithTimeout(src, 25000);
            if (!response.ok) {
                throw new Error(`Playlist returned HTTP ${response.status}`);
            }
            const text = await response.text();
            if (!text || !text.includes('#EXTINF')) {
                throw new Error('Playlist returned empty or invalid M3U data');
            }
            return text;
        } catch (err) {
            lastError = err;
            // In test/mocked environments or when server returned explicit 5xx while upstream also unavailable, continue to fallback only once
        }
    }
    throw lastError || new Error('Failed to load Live TV playlist');
}

async function loadLiveTvChannels() {
    if (liveTvLoadPromise) return liveTvLoadPromise;

    liveTvLoadPromise = (async () => {
        try {
            const playlistText = await fetchPlaylistText();
            const allChannels = parseM3UContent(playlistText)
                .filter(ch => ch.url.startsWith('https://'));

            // Remove duplicates based on URL
            const uniqueChannels = [];
            const seenUrls = new Set();
            for (const ch of allChannels) {
                if (!seenUrls.has(ch.url)) {
                    seenUrls.add(ch.url);
                    uniqueChannels.push(ch);
                }
            }

            liveTvChannels = uniqueChannels;
            // Extract unique countries
            liveTvCountries.clear();
            liveTvChannels.forEach(ch => {
                if (ch.country) liveTvCountries.add(ch.country);
            });

            const countryFilter = document.getElementById('liveTvCountryFilter');
            if (countryFilter) {
                const selectedCountry = countryFilter.value;
                countryFilter.length = 1;
                Array.from(liveTvCountries).sort().forEach(country => {
                    const option = document.createElement('option');
                    option.value = country;
                    option.textContent = country;
                    countryFilter.appendChild(option);
                });
                countryFilter.value = liveTvCountries.has(selectedCountry) ? selectedCountry : '';
            }
            console.log(`Loaded ${liveTvChannels.length} unique live TV channels`);
            filterLiveTvChannels();
        } catch (error) {
            if (window._liveTvDebug) console.warn('Error loading LIVE TV channels:', error);
            showLiveTvError('Failed to load live TV channels. Check your connection and retry.');
        } finally {
            liveTvLoadPromise = null;
        }
    })();

    return liveTvLoadPromise;
}

function parseM3UContent(content) {
    const lines = content.split('\n');
    const channels = [];
    let currentInfo = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // Remove carriage return characters
        line = line.replace(/\r/g, '');

        if (line.startsWith('#EXTINF:')) {
            currentInfo = parseExtinfLine(line);
        } else if (line && !line.startsWith('#') && currentInfo) {
            channels.push({
                ...currentInfo,
                url: line
            });
            currentInfo = null;
        }
    }

    return channels.filter(ch => ch.url && ch.name && ch.url.startsWith('http'));
}

function parseExtinfLine(line) {
    // Extract tvg-id, tvg-logo, group-title, and channel name
    const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
    const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
    const groupTitleMatch = line.match(/group-title="([^"]*)"/);
    const nameMatch = line.match(/,\s*(.*)$/);

    let name = nameMatch ? nameMatch[1].trim() : 'Unknown';

    // Remove (quality) suffix from name if present
    name = name.replace(/\s*\(\d+[pk]\)\s*$/i, '').trim();

    const category = groupTitleMatch ? groupTitleMatch[1] : 'Other';
    const logo = tvgLogoMatch ? tvgLogoMatch[1] : null;
    const tvgId = tvgIdMatch ? tvgIdMatch[1] : null;

    return {
        name: name || 'Unknown',
        logo: logo,
        category: category,
        country: extractCountry(tvgId || line),
        tvgId: tvgId,
    };
}

function extractCountry(tvgIdOrLine) {
    const countryMap = {
        'us': 'United States',
        'in': 'India',
        'gb': 'United Kingdom',
        'de': 'Germany',
        'fr': 'France',
        'es': 'Spain',
        'br': 'Brazil',
        'it': 'Italy',
        'ru': 'Russia',
        'ua': 'Ukraine',
        'pl': 'Poland',
        'nl': 'Netherlands',
        'be': 'Belgium',
        'se': 'Sweden',
        'no': 'Norway',
        'dk': 'Denmark',
        'fi': 'Finland',
        'pt': 'Portugal',
        'gr': 'Greece',
        'cz': 'Czech Republic',
        'hu': 'Hungary',
        'ro': 'Romania',
        'bg': 'Bulgaria',
        'hr': 'Croatia',
        'mx': 'Mexico',
        'ar': 'Argentina',
        'jp': 'Japan',
        'kr': 'South Korea',
        'cn': 'China',
        'th': 'Thailand',
        'vn': 'Vietnam',
        'ph': 'Philippines',
        'id': 'Indonesia',
        'sg': 'Singapore',
        'my': 'Malaysia',
        'au': 'Australia',
        'nz': 'New Zealand',
        'za': 'South Africa',
        'eg': 'Egypt',
        'ae': 'United Arab Emirates',
        'sa': 'Saudi Arabia',
        'il': 'Israel',
    };

    const text = tvgIdOrLine.toLowerCase();

    // Try to extract country code from tvg-id (format: Name.cc@region or Name.cc)
    const tvgMatch = text.match(/\.([a-z]{2})(?:@|$)/);
    if (tvgMatch) {
        const code = tvgMatch[1];
        if (countryMap[code]) return countryMap[code];
        if (liveTvRegionNames) {
            try { return liveTvRegionNames.of(code.toUpperCase()); } catch (_) {}
        }
    }

    // Fallback: search for known country codes in the text
    for (const [code, name] of Object.entries(countryMap)) {
        if (text.includes(`@${code}`) || text.includes(`.${code}`)) return name;
    }

    return 'International';
}

function setupLiveTvUI() {
    if (liveTvInitialized) return;
    liveTvInitialized = true;

    const countryFilter = document.getElementById('liveTvCountryFilter');
    const categoryFilter = document.getElementById('liveTvCategoryFilter');
    const searchInput = document.getElementById('liveTvSearch');

    // Setup event listeners
    countryFilter?.addEventListener('change', filterLiveTvChannels);
    categoryFilter?.addEventListener('change', filterLiveTvChannels);
    searchInput?.addEventListener('input', debounceLiveTv(filterLiveTvChannels, 300));
}

function filterLiveTvChannels() {
    const countryFilter = document.getElementById('liveTvCountryFilter')?.value || '';
    const categoryFilter = document.getElementById('liveTvCategoryFilter')?.value || '';
    const searchTerm = (document.getElementById('liveTvSearch')?.value || '').toLowerCase();

    liveTvFilteredChannels = liveTvChannels.filter(channel => {
        const matchesCountry = !countryFilter || channel.country === countryFilter;
        const matchesCategory = !categoryFilter || channel.category.toLowerCase().includes(categoryFilter.toLowerCase());
        const matchesSearch = !searchTerm ||
            channel.name.toLowerCase().includes(searchTerm) ||
            channel.category.toLowerCase().includes(searchTerm) ||
            channel.country.toLowerCase().includes(searchTerm);

        return matchesCountry && matchesCategory && matchesSearch;
    });

    renderLiveTvChannels();
}

function renderLiveTvChannels() {
    const grid = document.getElementById('liveTvGrid');
    const statusDiv = document.getElementById('liveTvStatus');

    if (!grid) return;

    if (liveTvFilteredChannels.length === 0) {
        grid.style.display = 'none';
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = '❌ No channels found. Try adjusting your filters.';
        }
        return;
    }

    grid.style.display = 'grid';
    if (statusDiv) statusDiv.style.display = 'none';
    grid.innerHTML = '';

    liveTvFilteredChannels.slice(0, 200).forEach(channel => {
        const card = createLiveTvCard(channel);
        grid.appendChild(card);
    });
}

function createLiveTvCard(channel) {
    const card = document.createElement('div');
    card.className = 'live-tv-card content-card';
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const fallbackLogo = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23222" width="100" height="100"/%3E%3Ctext x="50" y="55" font-size="14" fill="%23666" text-anchor="middle" font-family="Arial"%3ETV%3C/text%3E%3C/svg%3E';
    const logo = channel.logo && channel.logo.startsWith('http')
        ? escapeLiveTvHtml(channel.logo)
        : fallbackLogo;
    const safeName = escapeLiveTvHtml(channel.name);
    const safeCategory = escapeLiveTvHtml(channel.category);
    const safeCountry = escapeLiveTvHtml(channel.country);

    card.innerHTML = `
        <div class="card-media" style="position: relative; overflow: hidden; border-radius: 8px 8px 0 0; background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;">
            <img src="${logo}" alt="${safeName}" loading="lazy"
                 style="width: 100%; height: 100%; object-fit: contain; padding: 12px; background: #0a0a0a;"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%231a1a1a%22 width=%22100%22 height=%22100%22/%3E%3Ccircle cx=%2250%22 cy=%2235%22 r=%2215%22 fill=%22%23ff2e63%22/%3E%3Crect x=%2230%22 y=%2255%22 width=%2240%22 height=%2230%22 fill=%22%23ff2e63%22 rx=%225%22/%3E%3C/svg%3E'">
            <div style="position: absolute; top: 8px; right: 8px; background: #ff2e63; color: white; padding: 5px 9px; border-radius: 20px; font-size: 11px; font-weight: bold; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(255, 46, 99, 0.4);">
                <span style="font-size: 10px;">🔴</span> LIVE
            </div>
        </div>
        <div class="card-details" style="padding: 12px; min-height: 80px; display: flex; flex-direction: column; justify-content: space-between; background: #0f0f0f; border-radius: 0 0 8px 8px;">
            <div>
                <h3 style="margin: 0; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; letter-spacing: 0.3px;">
                    ${safeName}
                </h3>
                <p style="margin: 6px 0 0 0; font-size: 11px; color: #888; display: flex; gap: 6px; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <span style="color: #ff2e63;">●</span> ${safeCategory}
                    <span style="color: #666;">•</span> ${safeCountry}
                </p>
            </div>
            <button type="button" class="btn-play-live" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #ff2e63 0%, #ff1449 100%); color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; margin-top: 8px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255, 46, 99, 0.3); text-transform: uppercase; letter-spacing: 0.5px;">
                ▶ WATCH LIVE
            </button>
        </div>
    `;

    const openChannel = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        playLiveChannel(channel);
    };

    card.addEventListener('click', openChannel);
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            openChannel(e);
        }
    });

    return card;
}

function playLiveChannel(channel) {
    console.log('Playing live channel:', channel.name, channel.url);

    // Close any existing player
    const existingModal = document.getElementById('liveTvPlayerModal');
    if (existingModal) {
        existingModal.querySelector('#closeLiveTvPlayer')?.click();
    }

    // Show player with server proxy
    showLiveTvPlayer(channel);
}

function showLiveTvPlayer(channel) {
    // Create or show player modal
    let modal = document.getElementById('liveTvPlayerModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'liveTvPlayerModal';
        modal.className = 'player-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        document.body.appendChild(modal);
    }

    const fallbackLogo = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23222%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2255%22 font-size=%2214%22 fill=%22%23666%22 text-anchor=%22middle%22 font-family=%22Arial%22%3ETV%3C/text%3E%3C/svg%3E';
    const safeLogo = escapeLiveTvHtml(channel.logo && channel.logo.startsWith('http') ? channel.logo : fallbackLogo);
    const safeName = escapeLiveTvHtml(channel.name);
    const safeCategory = escapeLiveTvHtml(channel.category);
    const safeCountry = escapeLiveTvHtml(channel.country);

    modal.innerHTML = `
        <div class="live-tv-player-dialog">
            <div style="background: #1a1a1a; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid #333;">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                    <img src="${safeLogo}"
                         alt="${safeName}"
                         style="width: 38px; height: 38px; border-radius: 6px; object-fit: contain; background: #0a0a0a; flex-shrink: 0;">
                    <div style="min-width: 0;">
                        <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeName}</h2>
                        <p style="margin: 3px 0 0 0; font-size: 12px; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">🔴 LIVE • ${safeCategory} • ${safeCountry}</p>
                    </div>
                </div>
                <button type="button" id="closeLiveTvPlayer" aria-label="Close Live TV Player" style="background: rgba(255,255,255,0.08); border: none; border-radius: 8px; font-size: 20px; color: #fff; cursor: pointer; width: 42px; height: 42px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">✕</button>
            </div>
            <div id="liveTvPlayerStage" style="background: #000; aspect-ratio: 16/9; width: 100%; position: relative; max-height: 78dvh;">
                <video id="liveTvVideoPlayer"
                       style="width: 100%; height: 100%; object-fit: contain;"
                       controls
                       autoplay
                       playsinline
                       webkit-playsinline>
                </video>
                <div id="liveTvPlayerLoading" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.82); display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 15px; flex-direction: column; z-index: 100; padding: 16px; text-align: center; box-sizing: border-box;">
                    <div>
                        <div style="font-size: 42px; margin-bottom: 12px;">⏳</div>
                        <p style="margin: 0 0 10px 0; font-size: 17px; color: #fff;">Connecting to stream...</p>
                        <p style="margin: 0; font-size: 12px; color: #888;">This may take a few seconds</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const video = document.getElementById('liveTvVideoPlayer');
    const loadingDiv = document.getElementById('liveTvPlayerLoading');
    const stageDiv = document.getElementById('liveTvPlayerStage');
    let isClosed = false;

    function liveTvDebugLog(...args) {
        if (window._liveTvDebug) console.log('[LIVE TV]', ...args);
    }

    let connectionTimeout = null;
    const connectionTimeoutMs = 45000; // 45 seconds

    function clearConnectionTimeout() {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
    }

    function showTapToPlayPrompt(mutedMode) {
        if (!stageDiv || isClosed) return;
        stageDiv.querySelectorAll('.live-tv-tap-overlay, .live-tv-unmute-pill').forEach(el => el.remove());

        if (mutedMode) {
            const unmuteBtn = document.createElement('button');
            unmuteBtn.type = 'button';
            unmuteBtn.className = 'live-tv-unmute-pill';
            unmuteBtn.textContent = '🔇 Tap to Unmute';
            unmuteBtn.addEventListener('click', () => {
                video.muted = false;
                video.play?.().catch(() => {});
                unmuteBtn.remove();
            });
            stageDiv.appendChild(unmuteBtn);
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'live-tv-tap-overlay';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'live-tv-tap-btn';
        btn.textContent = '▶ Tap to Play Live Stream';
        btn.addEventListener('click', () => {
            video.muted = false;
            const playResult = video.play?.();
            if (playResult && typeof playResult.then === 'function') {
                playResult.then(() => {
                    overlay.remove();
                }).catch(() => {
                    video.muted = true;
                    video.play?.().catch(() => {});
                    overlay.remove();
                    showTapToPlayPrompt(true);
                });
            } else {
                overlay.remove();
            }
        });
        overlay.appendChild(btn);
        stageDiv.appendChild(overlay);
    }

    function attemptVideoPlay() {
        if (!video || typeof video.play !== 'function' || isClosed) return;
        let p;
        try {
            p = video.play();
        } catch (err) {
            liveTvDebugLog('Play threw synchronously:', err);
            return;
        }
        if (p && typeof p.catch === 'function') {
            p.catch((err) => {
                if (isClosed) return;
                liveTvDebugLog('Auto-play blocked, trying muted fallback:', err);
                video.muted = true;
                try {
                    const mutedAttempt = video.play();
                    if (mutedAttempt && typeof mutedAttempt.then === 'function') {
                        mutedAttempt.then(() => {
                            showTapToPlayPrompt(true);
                        }).catch(() => {
                            showTapToPlayPrompt(false);
                        });
                    }
                } catch (_) {
                    showTapToPlayPrompt(false);
                }
            });
        }
    }

    function markStreamReady() {
        if (isClosed) return;
        clearConnectionTimeout();
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (video) video.style.display = 'block';
    }

    function showConnectionError(reason) {
        clearConnectionTimeout();
        liveTvDebugLog('Stream connection failed:', reason);
        if (loadingDiv) {
            loadingDiv.style.display = 'flex';
            loadingDiv.textContent = `Unable to play this channel: ${reason}`;
        }
    }

    function startNativeHls(sourceUrl) {
        video.src = sourceUrl;
        const onReady = () => markStreamReady();
        video.addEventListener('loadedmetadata', onReady, { once: true });
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('canplay', onReady, { once: true });
        video.addEventListener('playing', onReady, { once: true });
        video.addEventListener('error', (e) => {
            liveTvDebugLog('Native HLS error:', e);
            showConnectionError('Video playback error');
        }, { once: true });
        attemptVideoPlay();
    }

    function onEscapeKey(e) {
        if (e.key === 'Escape') {
            closePlayer();
        }
    }

    function closePlayer() {
        if (isClosed) return;
        isClosed = true;
        clearConnectionTimeout();
        document.removeEventListener('keydown', onEscapeKey);
        const hlsPlayer = window.liveTvHlsInstance;
        if (hlsPlayer) {
            try { hlsPlayer.destroy(); } catch (_) {}
            window.liveTvHlsInstance = null;
        }
        if (video) {
            try {
                video.pause?.();
                video.removeAttribute('src');
                video.load?.();
            } catch (_) {}
        }
        modal.remove();
    }

    document.getElementById('closeLiveTvPlayer').addEventListener('click', closePlayer);
    document.addEventListener('keydown', onEscapeKey);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closePlayer();
        }
    });

    if (channel.url) {
        try {
            const playbackUrl = window.MILKBOX_GITHUB_PAGES
                ? channel.url
                : `/api/livetv/stream?url=${encodeURIComponent(channel.url)}`;

            console.log('Stream URL:', channel.url);
            console.log('Playback URL:', playbackUrl);

            // Set connection timeout
            connectionTimeout = setTimeout(() => {
                showConnectionError('Stream connection timeout - server not responding');
            }, connectionTimeoutMs);

            // Use HLS.js for HLS streams, direct for others
            if (channel.url.includes('.m3u8')) {
                // HLS stream
                if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                    // Destroy any existing player
                    if (window.liveTvHlsInstance) {
                        try { window.liveTvHlsInstance.destroy(); } catch (_) {}
                    }

                    const hls = new Hls({
                        debug: false,
                        enableWorker: false,
                        lowLatencyMode: false,
                        emeEnabled: false,
                        maxMaxBufferSize: 60 * 1000 * 1000,
                        maxBufferSize: 30 * 1000 * 1000,
                        maxBufferLength: 30,
                        maxBufferHole: 1.5,
                        nudgeOffset: 0.2,
                        nudgeMaxRetry: 10,
                        maxFragLookUpTolerance: 0.25,
                        liveSyncDurationCount: 3,
                        liveMaxLatencyDurationCount: 10,
                        manifestLoadPolicy: {
                            default: {
                                maxTimeToFirstByteMs: 10000,
                                maxLoadTimeMs: 20000,
                                timeoutRetry: { maxNumRetry: 2, retryDelayMs: 1000 },
                                errorRetry: { maxNumRetry: 2, retryDelayMs: 1000 }
                            }
                        },
                        playlistLoadPolicy: {
                            default: {
                                maxTimeToFirstByteMs: 10000,
                                maxLoadTimeMs: 20000,
                                timeoutRetry: { maxNumRetry: 2, retryDelayMs: 1000 },
                                errorRetry: { maxNumRetry: 2, retryDelayMs: 1000 }
                            }
                        },
                        fragLoadPolicy: {
                            default: {
                                maxTimeToFirstByteMs: 8000,
                                maxLoadTimeMs: 20000,
                                timeoutRetry: { maxNumRetry: 3, retryDelayMs: 1000 },
                                errorRetry: { maxNumRetry: 3, retryDelayMs: 1000 }
                            }
                        }
                    });

                    window.liveTvHlsInstance = hls;

                    // Setup error handler first
                    let mediaRecoveryAttempts = 0;
                    let networkRecoveryAttempts = 0;
                    let usingDirectFallback = Boolean(window.MILKBOX_GITHUB_PAGES);
                    let triedNativeFallback = false;

                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (!data || !data.fatal) {
                            liveTvDebugLog('Non-fatal HLS event:', data?.details || event, data?.reason || '');
                            return;
                        }
                        liveTvDebugLog('Fatal HLS error:', data.type, data.details);
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                if (typeof hls.startLoad === 'function') {
                                    if (networkRecoveryAttempts < 1) {
                                        networkRecoveryAttempts += 1;
                                        liveTvDebugLog('Network error - retrying load...');
                                        hls.startLoad();
                                        return;
                                    }
                                    if (!usingDirectFallback && channel.url) {
                                        usingDirectFallback = true;
                                        networkRecoveryAttempts = 0;
                                        liveTvDebugLog('Proxy network error - falling back to direct stream URL');
                                        hls.loadSource(channel.url);
                                        hls.startLoad();
                                        return;
                                    }
                                    if (!triedNativeFallback && typeof video.canPlayType === 'function' && video.canPlayType('application/vnd.apple.mpegurl')) {
                                        triedNativeFallback = true;
                                        try { hls.destroy(); } catch (_) {}
                                        window.liveTvHlsInstance = null;
                                        startNativeHls(playbackUrl);
                                        return;
                                    }
                                }
                                showConnectionError('Network error - stream may be unavailable or unreachable');
                                return;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                if (mediaRecoveryAttempts < 2) {
                                    mediaRecoveryAttempts += 1;
                                    liveTvDebugLog(`Media error - trying recovery (${mediaRecoveryAttempts}/2)`);
                                    hls.recoverMediaError();
                                    return;
                                }
                                if (!triedNativeFallback && typeof video.canPlayType === 'function' && video.canPlayType('application/vnd.apple.mpegurl')) {
                                    triedNativeFallback = true;
                                    try { hls.destroy(); } catch (_) {}
                                    window.liveTvHlsInstance = null;
                                    startNativeHls(playbackUrl);
                                    return;
                                }
                                showConnectionError('Media error - unable to decode stream');
                                return;
                        }
                        showConnectionError('HLS fatal error: ' + data.type);
                    });

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        console.log('HLS manifest parsed successfully');
                        markStreamReady();
                        attemptVideoPlay();
                    });

                    hls.on(Hls.Events.LEVEL_SWITCHING, (event, data) => {
                        console.log('Switching quality level:', data.level);
                    });

                    hls.on(Hls.Events.FRAG_BUFFERED, () => {
                        networkRecoveryAttempts = 0;
                        mediaRecoveryAttempts = 0;
                        markStreamReady();
                    });

                    console.log('Loading HLS source:', playbackUrl);
                    hls.loadSource(playbackUrl);
                    hls.attachMedia(video);

                } else if (typeof video.canPlayType === 'function' && video.canPlayType('application/vnd.apple.mpegurl')) {
                    // Native HLS support (iOS / Safari)
                    console.log('Using native HLS support (Safari)');
                    startNativeHls(playbackUrl);
                } else {
                    liveTvDebugLog('HLS not supported in this browser');
                    showConnectionError('HLS playback not supported in your browser');
                }
            } else {
                // Direct stream (MP4, WebM, etc.)
                console.log('Loading direct stream:', playbackUrl);
                video.src = playbackUrl;

                const onDirectReady = () => markStreamReady();
                video.addEventListener('loadedmetadata', onDirectReady, { once: true });
                video.addEventListener('canplay', onDirectReady, { once: true });
                video.addEventListener('playing', onDirectReady, { once: true });

                video.addEventListener('error', (e) => {
                    liveTvDebugLog('Direct stream error:', e);
                    showConnectionError('Stream playback failed');
                }, { once: true });

                video.addEventListener('loadstart', () => {
                    console.log('Stream loading started');
                });

                attemptVideoPlay();
            }
        } catch (error) {
            liveTvDebugLog('Error setting up playback:', error);
            showConnectionError('Error setting up playback: ' + error.message);
        }
    } else {
        liveTvDebugLog('No stream URL available for channel:', channel);
        showConnectionError('No valid stream URL available');
    }

    modal.style.display = 'flex';
}

function showLiveTvError(message) {
    const statusDiv = document.getElementById('liveTvStatus');
    if (statusDiv) {
        const grid = document.getElementById('liveTvGrid');
        if (grid) grid.style.display = 'none';
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = '';
        const msgEl = document.createElement('div');
        msgEl.textContent = `❌ ${message}`;
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'live-tv-retry-btn';
        retryBtn.textContent = '🔄 Retry Loading Channels';
        retryBtn.addEventListener('click', () => {
            if (grid) grid.style.display = 'grid';
            statusDiv.style.display = 'none';
            loadLiveTvChannels();
        });
        statusDiv.appendChild(msgEl);
        statusDiv.appendChild(retryBtn);
    }
}

function debounceLiveTv(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

function isLiveTvRouteActive() {
    try {
        const path = (window.location && window.location.pathname || '').toLowerCase();
        const hash = (window.location && window.location.hash || '').toLowerCase();
        return path.includes('livetv') || hash.includes('livetv');
    } catch (_) {
        return false;
    }
}

// Setup UI listeners cleanly; fetch playlist immediately only if landing directly on Live TV
function bootstrapLiveTvOnReady() {
    if (!document.getElementById('liveTvSection')) return;
    setupLiveTvUI();
    if (isLiveTvRouteActive()) {
        loadLiveTvChannels();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapLiveTvOnReady);
} else {
    bootstrapLiveTvOnReady();
}

