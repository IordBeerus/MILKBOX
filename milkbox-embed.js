(function () {
    'use strict';

    // State
    const state = {
        type: 'movie', // 'movie' | 'tv' | 'anime'
        tmdbId: null,
        anilistId: null,
        season: 1,
        episode: 1,
        title: '',
        episodesList: [],
        currentServer: 'x8rrmovies',
        x8rrStreams: [],
        activeX8rrIndex: 0,
        isPlaying: false,
        isMuted: false,
        volume: 1,
        duration: 0,
        currentTime: 0,
        idleTimer: null,
        upNextTimer: null,
        upNextSeconds: 5
    };

    // DOM Elements
    const elements = {
        player: document.getElementById('mbPlayer'),
        iframe: document.getElementById('mbStreamIframe'),
        nativeVideo: document.getElementById('mbNativeVideo'),
        clickOverlay: document.getElementById('mbClickOverlay'),
        centerPlayBtn: document.getElementById('mbCenterPlayBtn'),
        loader: document.getElementById('mbLoader'),
        loaderText: document.getElementById('mbLoaderText'),
        errorCard: document.getElementById('mbErrorCard'),
        errorDesc: document.getElementById('mbErrorDesc'),
        nextSourceBtn: document.getElementById('mbNextSourceBtn'),
        retryBtn: document.getElementById('mbRetryBtn'),
        upNextCard: document.getElementById('mbUpNextCard'),
        upNextTitle: document.getElementById('mbUpNextTitle'),
        upNextCountdown: document.getElementById('mbUpNextCountdown'),
        upNextPlayBtn: document.getElementById('mbUpNextPlayBtn'),
        upNextCancelBtn: document.getElementById('mbUpNextCancelBtn'),
        topBar: document.getElementById('mbTopBar'),
        mediaTitle: document.getElementById('mbMediaTitle'),
        mediaBadge: document.getElementById('mbMediaBadge'),
        serverBadgeLabel: document.getElementById('mbCurrentServerLabel'),
        scrubWrap: document.getElementById('mbScrubWrap'),
        scrubProgress: document.getElementById('mbScrubProgress'),
        scrubLoaded: document.getElementById('mbScrubLoaded'),
        scrubThumb: document.getElementById('mbScrubThumb'),
        scrubTooltip: document.getElementById('mbScrubTooltip'),
        controlsBar: document.getElementById('mbControlsBar'),
        playBtn: document.getElementById('mbPlayBtn'),
        skipBackBtn: document.getElementById('mbSkipBackBtn'),
        skipFwdBtn: document.getElementById('mbSkipFwdBtn'),
        prevEpBtn: document.getElementById('mbPrevEpBtn'),
        nextEpBtn: document.getElementById('mbNextEpBtn'),
        volBtn: document.getElementById('mbVolBtn'),
        volSlider: document.getElementById('mbVolSlider'),
        timeCur: document.getElementById('mbTimeCur'),
        timeDur: document.getElementById('mbTimeDur'),
        epDrawerBtn: document.getElementById('mbEpDrawerBtn'),
        serverMenuBtn: document.getElementById('mbServerMenuBtn'),
        serverMenu: document.getElementById('mbServerMenu'),
        serverActiveLabel: document.getElementById('mbServerActiveLabel'),
        serverList: document.getElementById('mbServerList'),
        qualityWrap: document.getElementById('mbQualityWrap'),
        qualityBtn: document.getElementById('mbQualityBtn'),
        qualityActiveLabel: document.getElementById('mbQualityActiveLabel'),
        qualityMenu: document.getElementById('mbQualityMenu'),
        qualityList: document.getElementById('mbQualityList'),
        speedBtn: document.getElementById('mbSpeedBtn'),
        speedBadge: document.getElementById('mbSpeedBadge'),
        speedMenu: document.getElementById('mbSpeedMenu'),
        fullscreenBtn: document.getElementById('mbFullscreenBtn'),
        epDrawer: document.getElementById('mbEpDrawer'),
        epDrawerClose: document.getElementById('mbEpDrawerClose'),
        seasonSelectWrap: document.getElementById('mbSeasonSelectWrap'),
        seasonSelect: document.getElementById('mbSeasonSelect'),
        epList: document.getElementById('mbEpList')
    };

    // Available Streaming Servers
    const SERVERS = [
        { id: 'x8rrmovies', name: 'x8rr Movies (Ad-Free HLS)', icon: '🍿' },
        { id: 'milkbox', name: 'Milkbox Pink (Core)', icon: '⚡' },
        { id: 'vidlink', name: 'VidLink Ultra', icon: '💎' },
        { id: 'cinesrc', name: 'CineSRC 4K', icon: '🎬' },
        { id: 'vidsrcsbs', name: 'VidSrc SBS', icon: '🚀' },
        { id: 'vidcore', name: 'VidCore HD', icon: '🛡️' },
        { id: 'autoembed', name: 'AutoEmbed VIP', icon: '✨' }
    ];

    // Format seconds into MM:SS or H:MM:SS
    function formatTime(sec) {
        if (!Number.isFinite(sec) || sec < 0) return '0:00';
        const s = Math.floor(sec);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
            : `${m}:${String(r).padStart(2, '0')}`;
    }

    // Escape HTML helper
    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str == null ? '' : String(str);
        return d.innerHTML;
    }

    // Parse URL Route according to specification:
    // /movie/{tmdbId}
    // /tv/{tmdbId}/{season}/{episode}
    // /anime/{anilistId}/{episode}
    function parseRoute() {
        const path = window.location.pathname.replace(/\/+$/, '');
        const search = new URLSearchParams(window.location.search);
        const qServer = search.get('server');
        if (qServer) state.currentServer = qServer;

        // 1. Movie Route: /movie/{tmdbId}
        const movieMatch = path.match(/^\/movie\/([0-9]+)$/i);
        if (movieMatch) {
            state.type = 'movie';
            state.tmdbId = movieMatch[1];
            return;
        }

        // 2. TV Route: /tv/{tmdbId}/{season}/{episode}
        const tvMatch = path.match(/^\/tv\/([0-9]+)\/([0-9]+)\/([0-9]+)$/i);
        if (tvMatch) {
            state.type = 'tv';
            state.tmdbId = tvMatch[1];
            state.season = parseInt(tvMatch[2], 10) || 1;
            state.episode = parseInt(tvMatch[3], 10) || 1;
            return;
        }

        // 3. Anime Route: /anime/{anilistId}/{episode}
        const animeMatch = path.match(/^\/anime\/([0-9]+)\/([0-9]+)$/i);
        if (animeMatch) {
            state.type = 'anime';
            state.anilistId = animeMatch[1];
            state.episode = parseInt(animeMatch[2], 10) || 1;
            return;
        }

        // Fallback query parameters: ?tmdb=...&type=movie, ?id=...&type=tv&s=1&e=1, etc.
        const qTmdb = search.get('tmdb') || search.get('id');
        const qType = (search.get('type') || (search.has('season') || search.has('s') ? 'tv' : 'movie')).toLowerCase();
        const qAni = search.get('anilist') || search.get('ani') || (qType === 'anime' ? qTmdb : null);

        if (qAni) {
            state.type = 'anime';
            state.anilistId = qAni;
            state.episode = parseInt(search.get('ep') || search.get('episode') || search.get('e') || '1', 10);
        } else if (qTmdb) {
            state.type = qType === 'tv' ? 'tv' : 'movie';
            state.tmdbId = qTmdb;
            state.season = parseInt(search.get('s') || search.get('season') || '1', 10);
            state.episode = parseInt(search.get('e') || search.get('episode') || '1', 10);
        } else {
            // Default demo fallback (Fight Club)
            state.type = 'movie';
            state.tmdbId = '550';
        }
    }

    if (elements.iframe) {
        elements.iframe.addEventListener('load', () => {
            hideLoader();
        });
    }

    // Build the stream URL for the selected server
    function buildStreamUrl(server, type, id, season, episode) {
        const accent = 'ff2e63';

        switch (server) {
            case 'milkbox': {
                if (type === 'anime') {
                    return `https://www.vidy.st/anime/${encodeURIComponent(id)}/${encodeURIComponent(episode || 1)}?color=${accent}&autoplay=true`;
                }
                if (type === 'tv') {
                    return `https://www.vidy.st/tv/${encodeURIComponent(id)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&color=${accent}&autoplay=true`;
                }
                return `https://www.vidy.st/movie/${encodeURIComponent(id)}?color=${accent}&autoplay=true`;
            }

            case 'vidlink': {
                if (type === 'tv') {
                    return `https://vidlink.pro/tv/${encodeURIComponent(id)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}?primaryColor=${accent}&secondaryColor=ff6b9d&iconColor=${accent}&icons=default&player=default&title=true&poster=true&autoplay=true&nextbutton=true`;
                }
                if (type === 'anime') {
                    return `https://www.vidy.st/anime/${encodeURIComponent(id)}/${encodeURIComponent(episode || 1)}?color=${accent}&autoplay=true`;
                }
                return `https://vidlink.pro/movie/${encodeURIComponent(id)}?primaryColor=${accent}&secondaryColor=ff6b9d&iconColor=${accent}&icons=default&player=default&title=true&poster=true&autoplay=true`;
            }

            case 'cinesrc': {
                if (type === 'tv') {
                    return `https://www.cinesrc.st/embed/tv/${encodeURIComponent(id)}?s=${encodeURIComponent(season || 1)}&e=${encodeURIComponent(episode || 1)}`;
                }
                return `https://www.cinesrc.st/embed/movie/${encodeURIComponent(id)}`;
            }

            case 'vidsrcsbs': {
                if (type === 'tv') {
                    return `https://vidsrc.sbs/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
                }
                return `https://vidsrc.sbs/embed/movie/${encodeURIComponent(id)}`;
            }

            case 'vidcore': {
                if (type === 'tv') {
                    return `https://vidcore.org/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
                }
                return `https://vidcore.org/embed/movie/${encodeURIComponent(id)}`;
            }

            case 'autoembed':
            default: {
                if (type === 'anime') {
                    return `https://autoembed.app/anime/${encodeURIComponent(id)}/${encodeURIComponent(episode || 1)}`;
                }
                if (type === 'tv') {
                    return `https://autoembed.app/tv/tmdb/${encodeURIComponent(id)}-${encodeURIComponent(season || 1)}-${encodeURIComponent(episode || 1)}`;
                }
                return `https://autoembed.app/movie/tmdb/${encodeURIComponent(id)}`;
            }
        }
    }

    // Load stream via Milkbox Stream Provider API
    let hlsInstance = null;
    let nativeEventsBound = false;

    function bindNativeVideoEvents() {
        if (nativeEventsBound) return;
        nativeEventsBound = true;
        const v = elements.nativeVideo;
        v.addEventListener('timeupdate', () => {
            state.currentTime = v.currentTime;
            state.duration = v.duration || 0;
            elements.timeCur.textContent = formatTime(state.currentTime);
            elements.timeDur.textContent = formatTime(state.duration);
            if (state.duration) {
                const pct = Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100));
                elements.scrubProgress.style.width = `${pct}%`;
                elements.scrubThumb.style.left = `${pct}%`;
            }
        });
        v.addEventListener('progress', () => {
            if (v.buffered.length > 0 && v.duration) {
                const pct = (v.buffered.end(v.buffered.length - 1) / v.duration) * 100;
                elements.scrubLoaded.style.width = `${pct}%`;
            }
        });
        v.addEventListener('play', () => {
            state.isPlaying = true;
            elements.player.classList.remove('is-paused');
            elements.playBtn.querySelector('.mb-icon-play').style.display = 'none';
            elements.playBtn.querySelector('.mb-icon-pause').style.display = 'block';
        });
        v.addEventListener('pause', () => {
            state.isPlaying = false;
            elements.player.classList.add('is-paused');
            elements.playBtn.querySelector('.mb-icon-play').style.display = 'block';
            elements.playBtn.querySelector('.mb-icon-pause').style.display = 'none';
        });
        v.addEventListener('ended', () => {
            triggerUpNext();
        });
        v.addEventListener('waiting', () => showLoader('Buffering stream…'));
        v.addEventListener('playing', () => hideLoader());
    }

    function renderQualityMenu() {
        if (!elements.qualityWrap || !elements.qualityList) return;
        if (!hlsInstance || !hlsInstance.levels || hlsInstance.levels.length === 0) {
            elements.qualityWrap.style.display = 'none';
            return;
        }

        elements.qualityWrap.style.display = 'block';
        const levels = hlsInstance.levels;
        const curLevel = hlsInstance.currentLevel;
        const isAuto = hlsInstance.autoLevelEnabled || curLevel === -1;

        // Active quality indicator
        let activeText = 'Auto';
        if (!isAuto && curLevel >= 0 && levels[curLevel]) {
            const h = levels[curLevel].height || 720;
            activeText = `${h}p`;
        } else if (isAuto && curLevel >= 0 && levels[curLevel]) {
            const h = levels[curLevel].height || 720;
            activeText = `Auto (${h}p)`;
        }
        if (elements.qualityActiveLabel) {
            elements.qualityActiveLabel.textContent = activeText;
        }

        let html = '<div class="mb-menu-header">Select Quality</div>';
        html += `
            <button class="mb-menu-item mb-quality-item ${isAuto ? 'active' : ''}" data-quality="-1">
                <span>Auto ${curLevel >= 0 && levels[curLevel] ? `(${levels[curLevel].height || 720}p)` : ''}</span>
                ${isAuto ? '<span class="mb-menu-check">✓</span>' : ''}
            </button>
        `;

        const sorted = levels
            .map((lvl, index) => ({ lvl, index }))
            .sort((a, b) => (b.lvl.height || 0) - (a.lvl.height || 0));

        sorted.forEach(({ lvl, index }) => {
            const isActive = !isAuto && curLevel === index;
            const height = lvl.height || Math.round((lvl.bitrate || 0) / 2500) || 720;
            const label = height >= 1080 ? `${height}p Ultra` : (height >= 720 ? `${height}p HD` : `${height}p`);
            html += `
                <button class="mb-menu-item mb-quality-item ${isActive ? 'active' : ''}" data-quality="${index}">
                    <span>${label}</span>
                    ${isActive ? '<span class="mb-menu-check">✓</span>' : ''}
                </button>
            `;
        });

        elements.qualityList.innerHTML = html;
    }

    function switchX8rrMirror(index) {
        if (!state.x8rrStreams || !state.x8rrStreams[index]) return;
        state.activeX8rrIndex = index;
        state.currentServer = 'x8rrmovies';
        const stream = state.x8rrStreams[index];
        const streamUrl = stream.proxiedUrl || stream.url;

        const label = stream.serverLabel || stream.providerName || `Server ${index + 1}`;
        elements.serverBadgeLabel.textContent = `x8rr · ${label}`;
        elements.serverActiveLabel.textContent = label;

        renderServerMenu();

        if (hlsInstance && elements.nativeVideo.style.display !== 'none') {
            const resumePos = Number.isFinite(elements.nativeVideo.currentTime) ? elements.nativeVideo.currentTime : 0;
            const wasPlaying = !elements.nativeVideo.paused;
            showLoader(`Connecting to ${label}…`);
            hlsInstance.loadSource(streamUrl);
            const onParsed = () => {
                hlsInstance.off(window.Hls.Events.MANIFEST_PARSED, onParsed);
                hideLoader();
                renderQualityMenu();
                if (resumePos > 0) {
                    try { elements.nativeVideo.currentTime = resumePos; } catch {}
                }
                if (wasPlaying) {
                    elements.nativeVideo.play().catch(() => {});
                }
            };
            hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, onParsed);
        } else {
            loadStream();
        }
    }

    async function loadStream() {
        showLoader('Connecting to stream…');
        hideError();
        hideUpNext();

        const id = state.type === 'anime' ? state.anilistId : state.tmdbId;

        try {
            // Query our own stream provider API
            const apiUrl = `/api/stream/resolve?type=${encodeURIComponent(state.type)}&id=${encodeURIComponent(id)}&season=${state.season}&episode=${state.episode}&server=${state.currentServer}`;
            const res = await fetch(apiUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.servers && Array.isArray(data.servers)) {
                    SERVERS.length = 0;
                    data.servers.forEach(s => SERVERS.push(s));
                }
                if (data.title && !state.title) {
                    state.title = data.title;
                    elements.mediaTitle.textContent = state.type === 'movie' ? state.title : `${state.title} · S${state.season}:E${state.episode}`;
                }

                // If x8rr streams are available from resolve or directly
                if (data.directStreams && Array.isArray(data.directStreams) && data.directStreams.length > 0) {
                    state.x8rrStreams = data.directStreams;
                } else if (state.currentServer === 'x8rrmovies' && state.type !== 'anime') {
                    try {
                        const x8Url = state.type === 'tv'
                            ? `/api/x8rr/stream/tv/${encodeURIComponent(id)}/${state.season}/${state.episode}`
                            : `/api/x8rr/stream/movie/${encodeURIComponent(id)}`;
                        const x8Res = await fetch(x8Url);
                        if (x8Res.ok) {
                            const x8Data = await x8Res.json();
                            if (Array.isArray(x8Data.streams) && x8Data.streams.length > 0) {
                                state.x8rrStreams = x8Data.streams;
                            }
                        }
                    } catch {}
                }

                const currentMirror = state.x8rrStreams && state.x8rrStreams[state.activeX8rrIndex];
                const activeStreamUrl = currentMirror
                    ? (currentMirror.proxiedUrl || currentMirror.url)
                    : data.directStream;

                // If stream provider returned direct stream and Hls is supported
                if (activeStreamUrl && window.Hls && window.Hls.isSupported()) {
                    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
                    elements.iframe.style.display = 'none';
                    elements.iframe.src = 'about:blank';
                    elements.nativeVideo.style.display = 'block';

                    hlsInstance = new window.Hls({
                        enableWorker: true,
                        lowLatencyMode: false,
                        backBufferLength: 90
                    });
                    hlsInstance.loadSource(activeStreamUrl);
                    hlsInstance.attachMedia(elements.nativeVideo);
                    hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
                        hideLoader();
                        renderQualityMenu();
                        elements.nativeVideo.play().catch(() => {});
                    });
                    hlsInstance.on(window.Hls.Events.LEVEL_SWITCHED, () => {
                        renderQualityMenu();
                    });
                    hlsInstance.on(window.Hls.Events.ERROR, (event, errData) => {
                        if (errData && errData.fatal) {
                            console.warn('[Milkbox Player] HLS fatal error:', errData.type);
                            switch (errData.type) {
                                case window.Hls.ErrorTypes.NETWORK_ERROR:
                                    hlsInstance.startLoad();
                                    break;
                                case window.Hls.ErrorTypes.MEDIA_ERROR:
                                    hlsInstance.recoverMediaError();
                                    break;
                                default:
                                    if (state.x8rrStreams && state.activeX8rrIndex + 1 < state.x8rrStreams.length) {
                                        switchX8rrMirror(state.activeX8rrIndex + 1);
                                    } else {
                                        showError('Playback encountered an error. Click below to try an alternate server.');
                                    }
                                    break;
                            }
                        }
                    });
                    bindNativeVideoEvents();

                    const srv = SERVERS.find(s => s.id === state.currentServer) || SERVERS[0];
                    const label = currentMirror ? (currentMirror.serverLabel || currentMirror.providerName || srv.name) : srv.name;
                    elements.serverBadgeLabel.textContent = currentMirror ? `x8rr · ${label}` : label;
                    elements.serverActiveLabel.textContent = label;
                    renderServerMenu();
                    renderQualityMenu();
                    return;
                }

                // If not native HLS, hide quality menu and switch to iframe embed
                if (elements.qualityWrap) elements.qualityWrap.style.display = 'none';
                const targetUrl = data.streamUrl || buildStreamUrl(state.currentServer, state.type, id, state.season, state.episode);
                if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
                elements.nativeVideo.style.display = 'none';
                elements.nativeVideo.pause();
                elements.iframe.style.display = 'block';
                elements.iframe.src = targetUrl;
            } else {
                if (elements.qualityWrap) elements.qualityWrap.style.display = 'none';
                const fallbackUrl = buildStreamUrl(state.currentServer, state.type, id, state.season, state.episode);
                elements.iframe.style.display = 'block';
                elements.iframe.src = fallbackUrl;
            }
        } catch {
            if (elements.qualityWrap) elements.qualityWrap.style.display = 'none';
            const fallbackUrl = buildStreamUrl(state.currentServer, state.type, id, state.season, state.episode);
            elements.iframe.style.display = 'block';
            elements.iframe.src = fallbackUrl;
        }

        // Update server label
        const srv = SERVERS.find(s => s.id === state.currentServer) || SERVERS[0];
        elements.serverBadgeLabel.textContent = srv.name;
        elements.serverActiveLabel.textContent = srv.name;

        // Render Server dropdown items
        renderServerMenu();

        // Arm watchdog
        clearTimeout(state.loadTimeout);
        state.loadTimeout = setTimeout(() => {
            hideLoader();
        }, 12000);
    }

    // Fetch Metadata from TMDB or AniList
    async function fetchMetadata() {
        try {
            if (state.type === 'movie' && state.tmdbId) {
                elements.mediaBadge.textContent = 'Movie';
                elements.prevEpBtn.style.display = 'none';
                elements.nextEpBtn.style.display = 'none';
                elements.epDrawerBtn.style.display = 'none';

                const res = await fetch(`/api/tmdb/movie/${encodeURIComponent(state.tmdbId)}`);
                if (res.ok) {
                    const data = await res.json();
                    state.title = data.title || data.original_title || `Movie (${state.tmdbId})`;
                    elements.mediaTitle.textContent = state.title;
                    document.title = `${state.title} — Milkbox Player`;
                }
            } else if (state.type === 'tv' && state.tmdbId) {
                elements.mediaBadge.textContent = `S${state.season} : E${state.episode}`;
                elements.prevEpBtn.style.display = state.episode > 1 ? 'flex' : 'none';
                elements.nextEpBtn.style.display = 'flex';
                elements.epDrawerBtn.style.display = 'flex';
                elements.seasonSelectWrap.style.display = 'flex';

                const res = await fetch(`/api/tmdb/tv/${encodeURIComponent(state.tmdbId)}`);
                if (res.ok) {
                    const data = await res.json();
                    state.title = data.name || data.original_name || `Show (${state.tmdbId})`;
                    elements.mediaTitle.textContent = `${state.title} · S${state.season}:E${state.episode}`;
                    document.title = `${state.title} S${state.season}:E${state.episode} — Milkbox Player`;

                    // Populate Seasons
                    if (Array.isArray(data.seasons)) {
                        elements.seasonSelect.innerHTML = data.seasons
                            .filter(s => s.season_number > 0)
                            .map(s => `<option value="${s.season_number}" ${s.season_number === state.season ? 'selected' : ''}>${escapeHtml(s.name || `Season ${s.season_number}`)} (${s.episode_count || 0} eps)</option>`)
                            .join('');
                    }

                    // Fetch episode list for current season
                    fetchSeasonEpisodes(state.season);
                }
            } else if (state.type === 'anime' && state.anilistId) {
                elements.mediaBadge.textContent = `Episode ${state.episode}`;
                elements.prevEpBtn.style.display = state.episode > 1 ? 'flex' : 'none';
                elements.nextEpBtn.style.display = 'flex';
                elements.epDrawerBtn.style.display = 'flex';
                elements.seasonSelectWrap.style.display = 'none';

                const res = await fetch(`/api/miruro/anime/${encodeURIComponent(state.anilistId)}`);
                if (res.ok) {
                    const data = await res.json();
                    state.title = data.title?.english || data.title?.romaji || `Anime (${state.anilistId})`;
                    elements.mediaTitle.textContent = `${state.title} · Ep ${state.episode}`;
                    document.title = `${state.title} Ep ${state.episode} — Milkbox Player`;

                    const count = data.episodes || 24;
                    renderAnimeEpisodes(count);
                }
            }
        } catch (e) {
            console.warn('[Milkbox Player] Metadata fetch notice:', e);
        }
    }

    // Fetch TV Season Episodes
    async function fetchSeasonEpisodes(seasonNum) {
        elements.epList.innerHTML = '<div class="mb-drawer-loading">Loading episodes…</div>';
        try {
            const res = await fetch(`/api/tmdb/tv/${encodeURIComponent(state.tmdbId)}/season/${encodeURIComponent(seasonNum)}`);
            if (res.ok) {
                const data = await res.json();
                state.episodesList = data.episodes || [];
                renderEpisodesList(state.episodesList);
            } else {
                elements.epList.innerHTML = '<div class="mb-drawer-loading">Episodes list unavailable.</div>';
            }
        } catch {
            elements.epList.innerHTML = '<div class="mb-drawer-loading">Could not load episodes.</div>';
        }
    }

    // Render TV Episodes in Drawer
    function renderEpisodesList(episodes) {
        if (!episodes || !episodes.length) {
            elements.epList.innerHTML = '<div class="mb-drawer-loading">No episodes found.</div>';
            return;
        }

        elements.epList.innerHTML = episodes.map(ep => {
            const num = ep.episode_number || 1;
            const isActive = Number(state.season) === Number(ep.season_number) && Number(state.episode) === Number(num);
            const title = ep.name || `Episode ${num}`;
            const dur = ep.runtime ? `${ep.runtime}m` : '';

            return `
                <button class="mb-ep-item ${isActive ? 'active' : ''}" data-season="${ep.season_number}" data-episode="${num}">
                    <div class="mb-ep-item-num">${num}</div>
                    <div class="mb-ep-item-info">
                        <div class="mb-ep-item-title">${escapeHtml(title)}</div>
                        <div class="mb-ep-item-sub">Season ${ep.season_number} ${dur ? '· ' + dur : ''}</div>
                    </div>
                </button>
            `;
        }).join('');
    }

    // Render Anime Episode Grid in Drawer
    function renderAnimeEpisodes(count) {
        const items = [];
        for (let i = 1; i <= count; i++) {
            const isActive = Number(state.episode) === i;
            items.push(`
                <button class="mb-ep-item ${isActive ? 'active' : ''}" data-episode="${i}">
                    <div class="mb-ep-item-num">${i}</div>
                    <div class="mb-ep-item-info">
                        <div class="mb-ep-item-title">Episode ${i}</div>
                        <div class="mb-ep-item-sub">Subbed / Dubbed</div>
                    </div>
                </button>
            `);
        }
        elements.epList.innerHTML = items.join('');
    }

    // Render Server Switcher Menu
    function renderServerMenu() {
        let html = '<div class="mb-menu-header">Providers</div>';
        html += SERVERS.map(s => `
            <button class="mb-menu-item mb-server-choice ${s.id === state.currentServer ? 'active' : ''}" data-server="${s.id}">
                <span>${s.icon} ${escapeHtml(s.name)}</span>
            </button>
        `).join('');

        if (state.x8rrStreams && state.x8rrStreams.length > 0) {
            html += '<div class="mb-menu-header" style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px;">x8rr Mirrors & Servers</div>';
            html += state.x8rrStreams.map((srv, idx) => {
                const isActive = state.currentServer === 'x8rrmovies' && state.activeX8rrIndex === idx;
                const label = srv.serverLabel || srv.providerName || `Server ${idx + 1}`;
                return `
                    <button class="mb-menu-item mb-mirror-item ${isActive ? 'active' : ''}" data-mirror-index="${idx}">
                        <span>📡 ${escapeHtml(label)}</span>
                        ${isActive ? '<span class="mb-menu-check" style="color:var(--mb-pink);font-weight:900;">✓</span>' : ''}
                    </button>
                `;
            }).join('');
        }

        elements.serverList.innerHTML = html;
    }

    // Navigate to next episode
    function goToEpisode(season, episode) {
        state.season = season;
        state.episode = episode;

        let newPath = '';
        if (state.type === 'tv') {
            newPath = `/tv/${state.tmdbId}/${state.season}/${state.episode}`;
            elements.mediaBadge.textContent = `S${state.season} : E${state.episode}`;
            elements.mediaTitle.textContent = `${state.title} · S${state.season}:E${state.episode}`;
            document.title = `${state.title} S${state.season}:E${state.episode} — Milkbox Player`;
        } else if (state.type === 'anime') {
            newPath = `/anime/${state.anilistId}/${state.episode}`;
            elements.mediaBadge.textContent = `Episode ${state.episode}`;
            elements.mediaTitle.textContent = `${state.title} · Ep ${state.episode}`;
            document.title = `${state.title} Ep ${state.episode} — Milkbox Player`;
        }

        if (newPath) {
            window.history.pushState(null, '', newPath);
        }

        elements.prevEpBtn.style.display = state.episode > 1 ? 'flex' : 'none';

        // Update active in episode drawer
        document.querySelectorAll('.mb-ep-item').forEach(el => {
            const epNum = parseInt(el.dataset.episode, 10);
            el.classList.toggle('active', epNum === state.episode);
        });

        loadStream();
    }

    // Trigger Up Next Countdown Card
    function triggerUpNext() {
        if (state.type === 'movie') return;
        const nextEp = state.episode + 1;
        state.upNextSeconds = 5;
        elements.upNextTitle.textContent = `Episode ${nextEp}`;
        elements.upNextCountdown.textContent = state.upNextSeconds;
        elements.upNextCard.hidden = false;

        clearInterval(state.upNextTimer);
        state.upNextTimer = setInterval(() => {
            state.upNextSeconds--;
            elements.upNextCountdown.textContent = state.upNextSeconds;
            if (state.upNextSeconds <= 0) {
                clearInterval(state.upNextTimer);
                elements.upNextCard.hidden = true;
                goToEpisode(state.season, nextEp);
            }
        }, 1000);
    }

    function hideUpNext() {
        clearInterval(state.upNextTimer);
        elements.upNextCard.hidden = true;
    }

    // Loader helpers
    function showLoader(msg) {
        elements.loaderText.textContent = msg || 'Loading stream…';
        elements.loader.hidden = false;
    }

    function hideLoader() {
        elements.loader.hidden = true;
    }

    // Error helpers
    function showError(msg) {
        hideLoader();
        if (msg) elements.errorDesc.textContent = msg;
        elements.errorCard.hidden = false;
    }

    function hideError() {
        elements.errorCard.hidden = true;
    }

    // PostMessage Communication with Embed
    window.addEventListener('message', (e) => {
        try {
            const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (!data) return;

            // Stream loaded signal
            hideLoader();

            // Watch Party command from parent
            if (data && data.type === 'mb:command') {
                if (data.action === 'play') {
                    state.isPlaying = true;
                    togglePlayState(true);
                } else if (data.action === 'pause') {
                    state.isPlaying = false;
                    togglePlayState(false);
                } else if (data.action === 'seek' && typeof data.time === 'number') {
                    if (elements.nativeVideo && elements.nativeVideo.style.display !== 'none') {
                        elements.nativeVideo.currentTime = data.time;
                    }
                    state.currentTime = data.time;
                    elements.timeCur.textContent = formatTime(state.currentTime);
                }
                return;
            }

            // Time update signal
            if (typeof data.currentTime === 'number') {
                state.currentTime = data.currentTime;
                elements.timeCur.textContent = formatTime(state.currentTime);
                if (data.duration) {
                    state.duration = data.duration;
                    elements.timeDur.textContent = formatTime(state.duration);
                    const pct = Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100));
                    elements.scrubProgress.style.width = `${pct}%`;
                    elements.scrubThumb.style.left = `${pct}%`;
                }
            }

            // Video ended signal -> auto next episode
            const raw = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
            if (/\b(ended|finish|complete|video_ended|onEnded)\b/i.test(raw)) {
                triggerUpNext();
            }
        } catch {}
    });

    // Iframe load listener
    elements.iframe.addEventListener('load', () => {
        setTimeout(hideLoader, 1500);
    });

    elements.iframe.addEventListener('error', () => {
        showError('Unable to connect to stream. Click below to try an alternate server.');
    });

    // Event Listeners: Playback Controls
    elements.playBtn.addEventListener('click', () => {
        state.isPlaying = !state.isPlaying;
        togglePlayState(state.isPlaying);
    });

    elements.centerPlayBtn.addEventListener('click', () => {
        state.isPlaying = true;
        togglePlayState(true);
    });

    function togglePlayState(play) {
        elements.player.classList.toggle('is-paused', !play);
        elements.playBtn.querySelector('.mb-icon-play').style.display = play ? 'none' : 'block';
        elements.playBtn.querySelector('.mb-icon-pause').style.display = play ? 'block' : 'none';

        if (elements.nativeVideo && elements.nativeVideo.style.display !== 'none') {
            if (play) elements.nativeVideo.play().catch(() => {});
            else elements.nativeVideo.pause();
        } else {
            // Dispatch play/pause postMessage to embed
            try {
                const cmd = play ? 'play' : 'pause';
                elements.iframe.contentWindow.postMessage({ type: cmd, event: cmd }, '*');
            } catch {}
        }

        // Notify parent Watch Party controller
        try {
            window.parent.postMessage({
                type: 'mb:sync',
                action: play ? 'play' : 'pause',
                time: state.currentTime || 0
            }, '*');
        } catch {}
    }

    // Next / Prev Episode buttons
    elements.prevEpBtn.addEventListener('click', () => {
        if (state.episode > 1) goToEpisode(state.season, state.episode - 1);
    });

    elements.nextEpBtn.addEventListener('click', () => {
        goToEpisode(state.season, state.episode + 1);
    });

    // Up Next Card Actions
    elements.upNextPlayBtn.addEventListener('click', () => {
        hideUpNext();
        goToEpisode(state.season, state.episode + 1);
    });

    elements.upNextCancelBtn.addEventListener('click', hideUpNext);

    // Skip Buttons
    elements.skipBackBtn.addEventListener('click', () => {
        if (elements.nativeVideo && elements.nativeVideo.style.display !== 'none') {
            elements.nativeVideo.currentTime = Math.max(0, elements.nativeVideo.currentTime - 10);
            return;
        }
        try {
            elements.iframe.contentWindow.postMessage({ type: 'seek', offset: -10 }, '*');
        } catch {}
    });

    elements.skipFwdBtn.addEventListener('click', () => {
        if (elements.nativeVideo && elements.nativeVideo.style.display !== 'none') {
            elements.nativeVideo.currentTime = Math.min(elements.nativeVideo.duration || 9999, elements.nativeVideo.currentTime + 10);
            return;
        }
        try {
            elements.iframe.contentWindow.postMessage({ type: 'seek', offset: 10 }, '*');
        } catch {}
    });

    // Volume Slider & Mute
    elements.volSlider.addEventListener('input', (e) => {
        state.volume = parseFloat(e.target.value);
        state.isMuted = state.volume === 0;
        updateVolumeUi();
    });

    elements.volBtn.addEventListener('click', () => {
        state.isMuted = !state.isMuted;
        updateVolumeUi();
    });

    function updateVolumeUi() {
        elements.volBtn.querySelector('.mb-vol-high').style.display = state.isMuted ? 'none' : 'block';
        elements.volBtn.querySelector('.mb-vol-muted').style.display = state.isMuted ? 'block' : 'none';
        elements.volSlider.value = state.isMuted ? 0 : state.volume;
        if (elements.nativeVideo && elements.nativeVideo.style.display !== 'none') {
            elements.nativeVideo.volume = state.isMuted ? 0 : state.volume;
            elements.nativeVideo.muted = state.isMuted;
            return;
        }
        try {
            elements.iframe.contentWindow.postMessage({ type: 'volume', volume: state.isMuted ? 0 : state.volume }, '*');
        } catch {}
    }

    // Scrub Bar Interaction
    elements.scrubWrap.addEventListener('mousemove', (e) => {
        const rect = elements.scrubWrap.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        elements.scrubTooltip.style.left = `${pos * 100}%`;
        elements.scrubTooltip.textContent = formatTime((state.duration || 100) * pos);
    });

    elements.scrubWrap.addEventListener('click', (e) => {
        const rect = elements.scrubWrap.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const targetTime = (state.duration || 100) * pos;
        elements.scrubProgress.style.width = `${pos * 100}%`;
        elements.scrubThumb.style.left = `${pos * 100}%`;
        if (elements.nativeVideo && elements.nativeVideo.style.display !== 'none') {
            elements.nativeVideo.currentTime = targetTime;
            return;
        }
        try {
            elements.iframe.contentWindow.postMessage({ type: 'seekTo', time: targetTime }, '*');
        } catch {}
    });

    // Server Menu
    elements.serverMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.speedMenu.hidden = true;
        if (elements.qualityMenu) elements.qualityMenu.hidden = true;
        elements.serverMenu.hidden = !elements.serverMenu.hidden;
    });

    elements.serverList.addEventListener('click', (e) => {
        const mirrorItem = e.target.closest('.mb-mirror-item');
        if (mirrorItem) {
            const mIdx = parseInt(mirrorItem.dataset.mirrorIndex, 10);
            switchX8rrMirror(mIdx);
            elements.serverMenu.hidden = true;
            return;
        }

        const item = e.target.closest('.mb-server-choice, .mb-menu-item');
        if (!item || !item.dataset.server) return;
        state.currentServer = item.dataset.server;
        elements.serverMenu.hidden = true;
        loadStream();
    });

    // Quality Menu
    if (elements.qualityBtn) {
        elements.qualityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.serverMenu.hidden = true;
            elements.speedMenu.hidden = true;
            elements.qualityMenu.hidden = !elements.qualityMenu.hidden;
        });
    }

    if (elements.qualityList) {
        elements.qualityList.addEventListener('click', (e) => {
            const item = e.target.closest('.mb-quality-item');
            if (!item || !hlsInstance) return;
            const q = parseInt(item.dataset.quality, 10);
            hlsInstance.currentLevel = q;
            renderQualityMenu();
            elements.qualityMenu.hidden = true;
        });
    }

    // Error Actions
    elements.nextSourceBtn.addEventListener('click', () => {
        const curIdx = SERVERS.findIndex(s => s.id === state.currentServer);
        const next = SERVERS[(curIdx + 1) % SERVERS.length];
        state.currentServer = next.id;
        loadStream();
    });

    elements.retryBtn.addEventListener('click', loadStream);

    // Speed Menu
    elements.speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.serverMenu.hidden = true;
        if (elements.qualityMenu) elements.qualityMenu.hidden = true;
        elements.speedMenu.hidden = !elements.speedMenu.hidden;
    });

    elements.speedMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.mb-menu-item');
        if (!item) return;
        const speed = item.dataset.speed;
        elements.speedBadge.textContent = `${speed}x`;
        elements.speedMenu.querySelectorAll('.mb-menu-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        elements.speedMenu.hidden = true;
        if (elements.nativeVideo && elements.nativeVideo.style.display !== 'none') {
            elements.nativeVideo.playbackRate = parseFloat(speed);
            return;
        }
        try {
            elements.iframe.contentWindow.postMessage({ type: 'rate', rate: parseFloat(speed) }, '*');
        } catch {}
    });

    // Close Dropdowns on outside click
    document.addEventListener('click', () => {
        elements.serverMenu.hidden = true;
        elements.speedMenu.hidden = true;
        if (elements.qualityMenu) elements.qualityMenu.hidden = true;
    });

    // Fullscreen Toggle
    elements.fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            elements.player.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    document.addEventListener('fullscreenchange', () => {
        const isFs = !!document.fullscreenElement;
        elements.fullscreenBtn.querySelector('.mb-icon-fs-enter').style.display = isFs ? 'none' : 'block';
        elements.fullscreenBtn.querySelector('.mb-icon-fs-exit').style.display = isFs ? 'block' : 'none';
    });

    // Episodes Drawer
    elements.epDrawerBtn.addEventListener('click', () => {
        elements.epDrawer.hidden = false;
    });

    elements.epDrawerClose.addEventListener('click', () => {
        elements.epDrawer.hidden = true;
    });

    elements.seasonSelect.addEventListener('change', (e) => {
        const s = parseInt(e.target.value, 10);
        fetchSeasonEpisodes(s);
    });

    elements.epList.addEventListener('click', (e) => {
        const item = e.target.closest('.mb-ep-item');
        if (!item) return;
        const ep = parseInt(item.dataset.episode, 10);
        const se = parseInt(item.dataset.season || state.season, 10);
        elements.epDrawer.hidden = true;
        goToEpisode(se, ep);
    });

    // Autohide Controls on Idle
    function resetIdleTimer() {
        elements.player.classList.remove('is-idle');
        clearTimeout(state.idleTimer);
        state.idleTimer = setTimeout(() => {
            if (!elements.serverMenu.hidden || !elements.speedMenu.hidden || (elements.qualityMenu && !elements.qualityMenu.hidden) || !elements.epDrawer.hidden) return;
            elements.player.classList.add('is-idle');
        }, 3500);
    }

    elements.player.addEventListener('mousemove', resetIdleTimer);
    elements.player.addEventListener('mousedown', resetIdleTimer);
    elements.player.addEventListener('touchstart', resetIdleTimer);

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        switch (e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                elements.playBtn.click();
                break;
            case 'f':
                e.preventDefault();
                elements.fullscreenBtn.click();
                break;
            case 'm':
                e.preventDefault();
                elements.volBtn.click();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                elements.skipBackBtn.click();
                break;
            case 'ArrowRight':
                e.preventDefault();
                elements.skipFwdBtn.click();
                break;
            case 'n':
            case 'N':
                if (state.type !== 'movie') {
                    e.preventDefault();
                    elements.nextEpBtn.click();
                }
                break;
        }
    });

    // Initialize Player
    parseRoute();
    fetchMetadata();
    loadStream();
    resetIdleTimer();
})();
