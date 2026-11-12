// LIVE TV Stream Handler
// Fetches and manages live TV channels from IPTV sources

let liveTvChannels = [];
let liveTvFilteredChannels = [];
let liveTvCountries = new Set();

async function initializeLiveTV() {
    console.log('Initializing LIVE TV...');
    await loadLiveTvChannels();
    setupLiveTvUI();
}

async function loadLiveTvChannels() {
    try {
        // Using multiple IPTV sources for redundancy
        const sources = [
            'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us.m3u',
            'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/in.m3u',
            'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/gb.m3u',
            'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/de.m3u',
            'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/fr.m3u',
            'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/es.m3u',
        ];

        const allChannels = [];

        for (const source of sources) {
            try {
                const response = await fetch(source);
                if (!response.ok) continue;
                const text = await response.text();
                const channels = parseM3UContent(text);
                allChannels.push(...channels);
            } catch (error) {
                console.warn(`Failed to load from ${source}:`, error);
            }
        }

        liveTvChannels = allChannels;
        liveTvFilteredChannels = [...liveTvChannels];
        
        // Extract unique countries
        liveTvChannels.forEach(ch => {
            if (ch.country) liveTvCountries.add(ch.country);
        });

        console.log(`Loaded ${liveTvChannels.length} live TV channels`);
        renderLiveTvChannels();
    } catch (error) {
        console.error('Error loading LIVE TV channels:', error);
        showLiveTvError('Failed to load live TV channels');
    }
}

function parseM3UContent(content) {
    const lines = content.split('\n');
    const channels = [];
    let currentInfo = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

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

    return channels.filter(ch => ch.url && ch.name);
}

function parseExtinfLine(line) {
    const match = line.match(/#EXTINF:.*?tvg-name="([^"]*)".*?tvg-logo="([^"]*)".*?group-title="([^"]*)"[^,]*,\s*(.*)/);
    
    if (match) {
        return {
            name: match[4] || 'Unknown',
            logo: match[2] || null,
            category: match[3] || 'Other',
            country: extractCountry(line),
            tvgName: match[1] || null,
        };
    }

    // Fallback parsing
    const nameMatch = line.match(/,(.*)$/);
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const categoryMatch = line.match(/group-title="([^"]*)"/);

    return {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown',
        logo: logoMatch ? logoMatch[1] : null,
        category: categoryMatch ? categoryMatch[1] : 'Other',
        country: extractCountry(line),
        tvgName: null,
    };
}

function extractCountry(line) {
    const countryMap = {
        'us': 'United States',
        'in': 'India',
        'gb': 'United Kingdom',
        'de': 'Germany',
        'fr': 'France',
        'es': 'Spain',
    };

    for (const [code, name] of Object.entries(countryMap)) {
        if (line.toLowerCase().includes(code)) return name;
    }
    return 'International';
}

function setupLiveTvUI() {
    const countryFilter = document.getElementById('liveTvCountryFilter');
    const categoryFilter = document.getElementById('liveTvCategoryFilter');
    const searchInput = document.getElementById('liveTvSearch');

    // Populate country filter
    const countries = Array.from(liveTvCountries).sort();
    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        countryFilter.appendChild(option);
    });

    // Setup event listeners
    countryFilter?.addEventListener('change', filterLiveTvChannels);
    categoryFilter?.addEventListener('change', filterLiveTvChannels);
    searchInput?.addEventListener('input', debounce(filterLiveTvChannels, 300));
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
            channel.category.toLowerCase().includes(searchTerm);

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

    liveTvFilteredChannels.slice(0, 50).forEach(channel => {
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
        <div class="card-media" style="position: relative; overflow: hidden; border-radius: 8px; background: #1a1a1a; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;">
            <img src="${logo}" alt="${channel.name}" 
                 style="width: 100%; height: 100%; object-fit: cover;" 
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23222%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2255%22 font-size=%2214%22 fill=%22%23666%22 text-anchor=%22middle%22 font-family=%22Arial%22%3ETV%3C/text%3E%3C/svg%3E'">
            <div style="position: absolute; top: 8px; right: 8px; background: #ff2e63; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold;">🔴 LIVE</div>
        </div>
        <div class="card-details" style="padding: 12px; min-height: 80px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <h3 style="margin: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;">
                    ${channel.name}
                </h3>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #aaa;">
                    ${channel.category} • ${channel.country}
                </p>
            </div>
            <button class="btn-play-live" style="width: 100%; padding: 8px; background: #ff2e63; color: white; border: none; border-radius: 4px; font-weight: 600; font-size: 12px; cursor: pointer; margin-top: 8px;">
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
    console.log('Playing live channel:', channel.name);
    
    // Use the milkbox player or create a video player overlay
    const playerOverlay = document.getElementById('player-overlay');
    if (playerOverlay && window.currentlyPlaying) {
        // If using existing player, close it first
        document.getElementById('btn-close')?.click?.();
    }

    // Create a simple player modal for live TV
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
                <div id="liveTvPlayerError" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 16px; text-align: center; padding: 20px; flex-direction: column;">
                    <div>
                        <p style="margin: 0 0 16px 0; font-size: 18px;">❌ Unable to play stream</p>
                        <p style="margin: 0 0 24px 0; font-size: 12px; color: #666;">The stream may be unavailable, geographically restricted, or require special access</p>
                        <button id="retryLiveTvStream" style="background: #ff2e63; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">Try Another Channel</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('closeLiveTvPlayer').addEventListener('click', () => {
        modal.remove();
    });

    // Retry button handler
    document.getElementById('retryLiveTvStream').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Attempt to play the stream
    const video = document.getElementById('liveTvVideoPlayer');
    const errorDiv = document.getElementById('liveTvPlayerError');
    
    if (channel.url) {
        try {
            // Use HLS.js for HLS streams, direct for others
            if (channel.url.includes('.m3u8')) {
                // HLS stream
                if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                    const hls = new Hls({
                        debug: false,
                        enableWorker: true,
                        lowLatencyMode: true,
                        emeEnabled: false
                    });
                    
                    hls.loadSource(channel.url);
                    hls.attachMedia(video);
                    
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        video.play().catch(e => {
                            console.warn('Auto-play blocked:', e);
                        });
                    });
                    
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            console.error('HLS Fatal Error:', data);
                            errorDiv.style.display = 'flex';
                            video.style.display = 'none';
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    // Native HLS support (Safari)
                    video.src = channel.url;
                    video.play().catch(e => {
                        console.warn('Playback error:', e);
                        errorDiv.style.display = 'flex';
                        video.style.display = 'none';
                    });
                } else {
                    errorDiv.style.display = 'flex';
                    video.style.display = 'none';
                }
            } else {
                // Direct stream (MP4, WebM, etc.)
                video.src = channel.url;
                video.onerror = () => {
                    errorDiv.style.display = 'flex';
                    video.style.display = 'none';
                };
                video.play().catch(e => {
                    console.warn('Playback error:', e);
                    errorDiv.style.display = 'flex';
                    video.style.display = 'none';
                });
            }
        } catch (error) {
            console.error('Error setting up playback:', error);
            errorDiv.style.display = 'flex';
            video.style.display = 'none';
        }
    }

    modal.style.display = 'flex';
}

function showLiveTvError(message) {
    const statusDiv = document.getElementById('liveTvStatus');
    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = `❌ ${message}`;
    }
}

function debounce(func, delay) {
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
