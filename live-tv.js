// LIVE TV Stream Handler
// Fetches and manages live TV channels from IPTV sources

let liveTvChannels = [];
let liveTvFilteredChannels = [];
let liveTvCountries = new Set();
const liveTvRegionNames = typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

async function initializeLiveTV() {
    console.log('Initializing LIVE TV...');
    setupLiveTvUI();
    await loadLiveTvChannels();
}

async function loadLiveTvChannels() {
    try {
        const source = 'https://iptv-org.github.io/iptv/index.m3u';
        const response = await fetch(source, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Playlist returned HTTP ${response.status}`);
        const allChannels = parseM3UContent(await response.text())
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
        const selectedCountry = countryFilter.value;
        countryFilter.length = 1;
        Array.from(liveTvCountries).sort().forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            countryFilter.appendChild(option);
        });
        countryFilter.value = liveTvCountries.has(selectedCountry) ? selectedCountry : '';
        console.log(`Loaded ${liveTvChannels.length} unique live TV channels`);
        filterLiveTvChannels();
    } catch (error) {
        console.error('Error loading LIVE TV channels:', error);
        showLiveTvError('Failed to load live TV channels. Check your connection and refresh to retry.');
    }
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
        if (liveTvRegionNames) return liveTvRegionNames.of(code.toUpperCase());
    }

    // Fallback: search for known country codes in the text
    for (const [code, name] of Object.entries(countryMap)) {
        if (text.includes(`@${code}`) || text.includes(`.${code}`)) return name;
    }
    
    return 'International';
}

function setupLiveTvUI() {
    const countryFilter = document.getElementById('liveTvCountryFilter');
    const categoryFilter = document.getElementById('liveTvCategoryFilter');
    const searchInput = document.getElementById('liveTvSearch');

    // Setup event listeners
    countryFilter?.addEventListener('change', filterLiveTvChannels);
    categoryFilter?.addEventListener('change', filterLiveTvChannels);
    searchInput?.addEventListener('input', debounceLiveTv(filterLiveTvChannels, 300));
}

function filterLiveTvChannels() {
    const countryFilter = document.getElementById('liveTvCountryFilter').value;
    const categoryFilter = document.getElementById('liveTvCategoryFilter').value;
    const searchTerm = document.getElementById('liveTvSearch').value.toLowerCase();

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
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = '❌ No channels found. Try adjusting your filters.';
        return;
    }

    grid.style.display = 'grid';
    statusDiv.style.display = 'none';
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

    const logo = channel.logo && channel.logo.startsWith('http') 
        ? channel.logo 
        : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23222" width="100" height="100"/%3E%3Ctext x="50" y="55" font-size="14" fill="%23666" text-anchor="middle" font-family="Arial"%3ETV%3C/text%3E%3C/svg%3E';

    card.innerHTML = `
        <div class="card-media" style="position: relative; overflow: hidden; border-radius: 8px 8px 0 0; background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;">
            <img src="${logo}" alt="${channel.name}" 
                 style="width: 100%; height: 100%; object-fit: contain; padding: 12px; background: #0a0a0a;" 
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%231a1a1a%22 width=%22100%22 height=%22100%22/%3E%3Ccircle cx=%2250%22 cy=%2235%22 r=%2215%22 fill=%22%23ff2e63%22/%3E%3Crect x=%2230%22 y=%2255%22 width=%2240%22 height=%2230%22 fill=%22%23ff2e63%22 rx=%225%22/%3E%3C/svg%3E'">
            <div style="position: absolute; top: 8px; right: 8px; background: #ff2e63; color: white; padding: 6px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(255, 46, 99, 0.4);">
                <span style="font-size: 10px;">🔴</span> LIVE
            </div>
        </div>
        <div class="card-details" style="padding: 12px; min-height: 80px; display: flex; flex-direction: column; justify-content: space-between; background: #0f0f0f; border-radius: 0 0 8px 8px;">
            <div>
                <h3 style="margin: 0; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; letter-spacing: 0.3px;">
                    ${channel.name}
                </h3>
                <p style="margin: 6px 0 0 0; font-size: 11px; color: #888; display: flex; gap: 6px; align-items: center;">
                    <span style="color: #ff2e63;">●</span> ${channel.category}
                    <span style="color: #666;">•</span> ${channel.country}
                </p>
            </div>
            <button class="btn-play-live" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #ff2e63 0%, #ff1449 100%); color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; margin-top: 8px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255, 46, 99, 0.3); text-transform: uppercase; letter-spacing: 0.5px;">
                ▶ WATCH LIVE
            </button>
        </div>
    `;

    card.querySelector('.btn-play-live').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        playLiveChannel(channel);
    });

    return card;
}

function playLiveChannel(channel) {
    console.log('Playing live channel:', channel.name, channel.url);
    
    // Close any existing player
    const existingModal = document.getElementById('liveTvPlayerModal');
    if (existingModal) {
        existingModal.querySelector('#closeLiveTvPlayer').click();
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

    modal.innerHTML = `
        <div style="width: 95%; max-width: 1200px; background: #0a0a0a; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">
            <div style="background: #1a1a1a; padding: 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${channel.logo || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23222%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2255%22 font-size=%2214%22 fill=%22%23666%22 text-anchor=%22middle%22 font-family=%22Arial%22%3ETV%3C/text%3E%3C/svg%3E'}" 
                         alt="${channel.name}" 
                         style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
                    <div>
                        <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff;">${channel.name}</h2>
                        <p style="margin: 4px 0 0 0; font-size: 12px; color: #aaa;">🔴 LIVE • ${channel.category} • ${channel.country}</p>
                    </div>
                </div>
                <button id="closeLiveTvPlayer" style="background: none; border: none; font-size: 24px; color: #fff; cursor: pointer; padding: 8px; width: 40px; height: 40px;">✕</button>
            </div>
            <div style="background: #000; aspect-ratio: 16/9; position: relative;">
                <video id="liveTvVideoPlayer" 
                       style="width: 100%; height: 100%; object-fit: contain;" 
                       controls 
                       autoplay
                       crossorigin="anonymous">
                </video>
                <div id="liveTvPlayerLoading" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 16px; flex-direction: column; z-index: 100;">
                    <div style="text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
                        <p style="margin: 0 0 16px 0; font-size: 18px;">Connecting to stream...</p>
                        <p style="margin: 0; font-size: 12px; color: #666;">This may take 10-30 seconds</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    function closePlayer() {
        clearConnectionTimeout();
        const hlsPlayer = window.liveTvHlsInstance;
        if (hlsPlayer) {
            hlsPlayer.destroy();
            window.liveTvHlsInstance = null;
        }
        modal.remove();
    }

    document.getElementById('closeLiveTvPlayer').addEventListener('click', closePlayer);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closePlayer();
        }
    });

    // Attempt to play the stream
    const video = document.getElementById('liveTvVideoPlayer');
    const loadingDiv = document.getElementById('liveTvPlayerLoading');
    
    // Set timeout for stream connection
    let connectionTimeout;
    const connectionTimeoutMs = 45000; // 45 seconds
    
    function clearConnectionTimeout() {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
    }
    
    function showConnectionError(reason) {
        clearConnectionTimeout();
        console.error('Stream connection failed:', reason);
        
        loadingDiv.textContent = `Unable to play this channel: ${reason}`;
    }
    
    if (channel.url) {
        try {
            // Use proxy for all streams to handle CORS
            const proxiedUrl = `/api/livetv/stream?url=${encodeURIComponent(channel.url)}`;
            
            console.log('Stream URL:', channel.url);
            console.log('Proxied URL:', proxiedUrl);
            
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
                        window.liveTvHlsInstance.destroy();
                    }
                    
                    const hls = new Hls({
                        debug: false,
                        enableWorker: true,
                        lowLatencyMode: true,
                        emeEnabled: false,
                        maxMaxBufferSize: 60 * 1000 * 1000,
                        maxBufferSize: 30 * 1000 * 1000,
                        maxBufferLength: 30,
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
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        console.error('HLS error event:', event, data);
                        if (data.fatal) {
                            console.error('Fatal HLS error:', data.type);
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log('Network error - stream may be unavailable');
                                    showConnectionError('Network error - stream may be unavailable or unreachable');
                                    return;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log('Media error - trying recovery');
                                    hls.recoverMediaError();
                                    return;
                            }
                            showConnectionError('HLS fatal error: ' + data.type);
                        }
                    });
                    
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        console.log('HLS manifest parsed successfully');
                        clearConnectionTimeout();
                        loadingDiv.style.display = 'none';
                        video.style.display = 'block';
                        video.play().catch(e => {
                            console.warn('Auto-play blocked:', e);
                        });
                    });
                    
                    hls.on(Hls.Events.LEVEL_SWITCHING, (event, data) => {
                        console.log('Switching quality level:', data.level);
                    });
                    
                    hls.on(Hls.Events.FRAG_BUFFERED, () => {
                        clearConnectionTimeout();
                    });
                    
                    console.log('Loading HLS source:', proxiedUrl);
                    hls.loadSource(proxiedUrl);
                    hls.attachMedia(video);
                    
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    // Native HLS support (Safari)
                    console.log('Using native HLS support (Safari)');
                    video.src = proxiedUrl;
                    
                    video.addEventListener('canplay', () => {
                        console.log('Native HLS: canplay event');
                        clearConnectionTimeout();
                        loadingDiv.style.display = 'none';
                        video.style.display = 'block';
                    }, { once: true });
                    
                    video.addEventListener('error', (e) => {
                        console.error('Native HLS error:', e);
                        showConnectionError('Video playback error');
                    });
                    
                    video.play().catch(e => {
                        console.warn('Playback error:', e);
                        showConnectionError('Unable to play stream');
                    });
                } else {
                    console.error('HLS not supported in this browser');
                    showConnectionError('HLS playback not supported in your browser');
                }
            } else {
                // Direct stream (MP4, WebM, etc.)
                console.log('Loading direct stream:', proxiedUrl);
                video.src = proxiedUrl;
                
                video.addEventListener('canplay', () => {
                    console.log('Direct stream: canplay event');
                    clearConnectionTimeout();
                    loadingDiv.style.display = 'none';
                    video.style.display = 'block';
                }, { once: true });
                
                video.addEventListener('error', (e) => {
                    console.error('Direct stream error:', e);
                    showConnectionError('Stream playback failed');
                });
                
                video.addEventListener('loadstart', () => {
                    console.log('Stream loading started');
                });
                
                video.play().catch(e => {
                    console.warn('Playback error:', e);
                    showConnectionError('Unable to play stream');
                });
            }
        } catch (error) {
            console.error('Error setting up playback:', error);
            showConnectionError('Error setting up playback: ' + error.message);
        }
    } else {
        console.error('No stream URL available for channel:', channel);
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
        statusDiv.textContent = `❌ ${message}`;
    }
}

function debounceLiveTv(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// Initialize LIVE TV when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('liveTvSection')) {
        initializeLiveTV();
    }
});
