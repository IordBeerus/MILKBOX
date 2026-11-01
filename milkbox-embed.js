(function () {
    'use strict';

    
    const state = {
        type: 'movie', 
        tmdbId: null,
        anilistId: null,
        season: 1,
        episode: 1,
        title: '',
        episodesList: [],
        currentServer: 'x8rrmovies',
        x8rrStreams: [],
        activeX8rrIndex: 0,
        subtitles: [],
        activeSubtitleIndex: -1,
        searchFilterLang: 'all',
        searchQuery: '',
        isPlaying: false,
        isMuted: false,
        volume: 1,
        duration: 0,
        currentTime: 0,
        idleTimer: null,
        upNextTimer: null,
        upNextSeconds: 5
    };

    
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
        subtitlesWrap: document.getElementById('mbSubtitlesWrap'),
        subtitlesBtn: document.getElementById('mbSubtitlesBtn'),
        subtitlesActiveLabel: document.getElementById('mbSubtitlesActiveLabel'),
        subtitlesMenu: document.getElementById('mbSubtitlesMenu'),
        subtitlesList: document.getElementById('mbSubtitlesList'),
        menuSearchSubsBtn: document.getElementById('mbMenuSearchSubsBtn'),
        menuSubStyleBtn: document.getElementById('mbMenuSubStyleBtn'),
        searchSubsBtn: document.getElementById('mbSearchSubsBtn'),
        subStyleBtn: document.getElementById('mbSubStyleBtn'),
        searchSubsModal: document.getElementById('mbSearchSubsModal'),
        searchSubsBackdrop: document.getElementById('mbSearchSubsBackdrop'),
        searchSubsClose: document.getElementById('mbSearchSubsClose'),
        searchSubsMediaTitle: document.getElementById('mbSearchSubsMediaTitle'),
        subsSearchInput: document.getElementById('mbSubsSearchInput'),
        subsRefreshBtn: document.getElementById('mbSubsRefreshBtn'),
        subsFilterChips: document.getElementById('mbSubsFilterChips'),
        subsCountLabel: document.getElementById('mbSubsCountLabel'),
        subsCustomToggle: document.getElementById('mbSubsCustomToggle'),
        subsCustomPanel: document.getElementById('mbSubsCustomPanel'),
        subsUrlInput: document.getElementById('mbSubsUrlInput'),
        subsUrlLoadBtn: document.getElementById('mbSubsUrlLoadBtn'),
        subsFileInput: document.getElementById('mbSubsFileInput'),
        subsResultsList: document.getElementById('mbSubsResultsList'),
        subStyleModal: document.getElementById('mbSubStyleModal'),
        subStyleBackdrop: document.getElementById('mbSubStyleBackdrop'),
        subStyleClose: document.getElementById('mbSubStyleClose'),
        stylePreviewText: document.getElementById('mbStylePreviewText'),
        styleSizeGroup: document.getElementById('mbStyleSizeGroup'),
        styleColorGroup: document.getElementById('mbStyleColorGroup'),
        styleBgGroup: document.getElementById('mbStyleBgGroup'),
        styleAlignGroup: document.getElementById('mbStyleAlignGroup'),
        styleSyncGroup: document.getElementById('mbStyleSyncGroup'),
        styleSyncVal: document.getElementById('mbStyleSyncVal'),
        subtitlesOverlay: document.getElementById('mbSubtitlesOverlay'),
        styleResetBtn: document.getElementById('mbStyleResetBtn'),
        styleSaveBtn: document.getElementById('mbStyleSaveBtn'),
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

    
    const SERVERS = [
        { id: 'x8rrmovies', name: 'x8rr Movies (Ad-Free HLS)', icon: '🍿' },
        { id: 'milkbox', name: 'Milkbox Pink (Core)', icon: '⚡' },
        { id: 'vidlink', name: 'VidLink Ultra', icon: '💎' },
        { id: 'cinesrc', name: 'CineSRC 4K', icon: '🎬' },
        { id: 'vidsrcsbs', name: 'VidSrc SBS', icon: '🚀' },
        { id: 'vidcore', name: 'VidCore HD', icon: '🛡️' },
        { id: 'autoembed', name: 'AutoEmbed VIP', icon: '✨' }
    ];

    
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

    
    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str == null ? '' : String(str);
        return d.innerHTML;
    }

    
    function parseRoute() {
        const path = window.location.pathname.replace(/\/+$/, '');
        const search = new URLSearchParams(window.location.search);
        const qServer = search.get('server');
        if (qServer) state.currentServer = qServer;

        
        const movieMatch = path.match(/^\/movie\/([0-9]+)$/i);
        if (movieMatch) {
            state.type = 'movie';
            state.tmdbId = movieMatch[1];
            return;
        }

        
        const tvMatch = path.match(/^\/tv\/([0-9]+)\/([0-9]+)\/([0-9]+)$/i);
        if (tvMatch) {
            state.type = 'tv';
            state.tmdbId = tvMatch[1];
            state.season = parseInt(tvMatch[2], 10) || 1;
            state.episode = parseInt(tvMatch[3], 10) || 1;
            return;
        }

        
        const animeMatch = path.match(/^\/anime\/([0-9]+)\/([0-9]+)$/i);
        if (animeMatch) {
            state.type = 'anime';
            state.anilistId = animeMatch[1];
            state.episode = parseInt(animeMatch[2], 10) || 1;
            return;
        }

        
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
            
            state.type = 'movie';
            state.tmdbId = '550';
        }
    }

    if (elements.iframe) {
        elements.iframe.addEventListener('load', () => {
            hideLoader();
        });
    }

    
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

    const DEFAULT_SUB_STYLES = {
        fontSize: '1.15rem',
        color: '#ffffff',
        bgOpacity: '0.82',
        textAlign: 'center'
    };

    function getSubtitleStyles() {
        try {
            const saved = localStorage.getItem('milkbox_subtitle_styles');
            if (saved) return Object.assign({}, DEFAULT_SUB_STYLES, JSON.parse(saved));
        } catch {}
        return Object.assign({}, DEFAULT_SUB_STYLES);
    }

    function applySubtitleStyles(styles) {
        let styleEl = document.getElementById('milkbox-dynamic-sub-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'milkbox-dynamic-sub-styles';
            document.head.appendChild(styleEl);
        }
        const s = Object.assign({}, DEFAULT_SUB_STYLES, styles);
        const bgAlpha = parseFloat(s.bgOpacity ?? '0.82');
        const bgColor = bgAlpha === 0 ? 'transparent' : (bgAlpha === 1 ? '#000000' : `rgba(0, 0, 0, ${bgAlpha})`);
        styleEl.textContent = `
            .mb-native-video::cue,
            video::cue {
                color: ${s.color || '#ffffff'} !important;
                background-color: ${bgColor} !important;
                font-size: ${s.fontSize || '1.15rem'} !important;
                text-align: ${s.textAlign || 'center'} !important;
                font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                font-weight: 600 !important;
                line-height: 1.4 !important;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.6) !important;
                border-radius: 4px !important;
                padding: 3px 8px !important;
            }
        `;
    }

    function saveSubtitleStyles(styles) {
        try {
            localStorage.setItem('milkbox_subtitle_styles', JSON.stringify(styles));
        } catch {}
        applySubtitleStyles(styles);
    }

    // Apply saved styles on load
    applySubtitleStyles(getSubtitleStyles());

    let currentDraftStyles = getSubtitleStyles();

    function updatePreviewAndStyles(newStyles) {
        currentDraftStyles = Object.assign({}, currentDraftStyles, newStyles);
        saveSubtitleStyles(currentDraftStyles);

        if (elements.stylePreviewText) {
            elements.stylePreviewText.style.fontSize = currentDraftStyles.fontSize;
            elements.stylePreviewText.style.color = currentDraftStyles.color;
            const bgAlpha = parseFloat(currentDraftStyles.bgOpacity ?? '0.82');
            elements.stylePreviewText.style.backgroundColor = bgAlpha === 0 ? 'transparent' : (bgAlpha === 1 ? '#000000' : `rgba(0, 0, 0, ${bgAlpha})`);
            elements.stylePreviewText.style.textAlign = currentDraftStyles.textAlign;
        }

        if (elements.styleSizeGroup) {
            elements.styleSizeGroup.querySelectorAll('.mb-style-choice-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.size === currentDraftStyles.fontSize);
            });
        }
        if (elements.styleColorGroup) {
            elements.styleColorGroup.querySelectorAll('.mb-style-color-swatch').forEach(btn => {
                btn.classList.toggle('is-active', (btn.dataset.color || '').toLowerCase() === (currentDraftStyles.color || '').toLowerCase());
            });
        }
        if (elements.styleBgGroup) {
            elements.styleBgGroup.querySelectorAll('.mb-style-choice-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.opacity === String(currentDraftStyles.bgOpacity));
            });
        }
        if (elements.styleAlignGroup) {
            elements.styleAlignGroup.querySelectorAll('.mb-style-choice-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.align === currentDraftStyles.textAlign);
            });
        }
    }

    function openSearchSubsModal() {
        if (elements.serverMenu) elements.serverMenu.hidden = true;
        if (elements.speedMenu) elements.speedMenu.hidden = true;
        if (elements.qualityMenu) elements.qualityMenu.hidden = true;
        if (elements.subtitlesMenu) elements.subtitlesMenu.hidden = true;
        if (elements.subStyleModal) elements.subStyleModal.hidden = true;
        if (elements.searchSubsMediaTitle) {
            elements.searchSubsMediaTitle.textContent = state.title || 'Media';
        }
        if (elements.searchSubsModal) {
            elements.searchSubsModal.hidden = false;
        }
        if (!state.subtitles || state.subtitles.length === 0) {
            fetchSubtitlesFromApi();
        } else {
            renderSearchResults();
        }
    }

    function openSubStyleModal() {
        if (elements.serverMenu) elements.serverMenu.hidden = true;
        if (elements.speedMenu) elements.speedMenu.hidden = true;
        if (elements.qualityMenu) elements.qualityMenu.hidden = true;
        if (elements.subtitlesMenu) elements.subtitlesMenu.hidden = true;
        if (elements.searchSubsModal) elements.searchSubsModal.hidden = true;
        if (elements.subStyleModal) {
            elements.subStyleModal.hidden = false;
        }
        updatePreviewAndStyles(getSubtitleStyles());
    }

    function loadSubtitles(subsList) {
        state.subtitles = Array.isArray(subsList) ? subsList : [];
        if (!elements.nativeVideo) return;

        const existing = elements.nativeVideo.querySelectorAll('track');
        existing.forEach(t => t.remove());

        if (elements.subtitlesWrap) elements.subtitlesWrap.style.display = 'inline-block';

        if (state.subtitles.length > 0) {
            elements.nativeVideo.crossOrigin = 'anonymous';
            state.subtitles.forEach((sub, idx) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = sub.label || sub.language || `Subtitle ${idx + 1}`;
                track.srclang = sub.lang || sub.language || 'en';
                let src = sub.vttUrl || sub.url;
                if (src && !src.startsWith('/api/') && !src.endsWith('.vtt') && !src.startsWith('blob:')) {
                    src = `/api/x8rr/subtitles/vtt?url=${encodeURIComponent(src)}`;
                }
                track.src = src;
                if (sub.default) track.default = true;
                elements.nativeVideo.appendChild(track);
            });
        }

        renderSubtitlesMenu();
        renderSearchResults();
    }

    function renderSubtitlesMenu() {
        if (!elements.subtitlesWrap || !elements.subtitlesList) return;
        elements.subtitlesWrap.style.display = 'inline-block';
        const isOff = state.activeSubtitleIndex === -1;

        if (elements.subtitlesActiveLabel) {
            if (isOff || !state.subtitles.length) {
                elements.subtitlesActiveLabel.textContent = 'CC';
            } else {
                const activeSub = state.subtitles[state.activeSubtitleIndex];
                const code = (activeSub?.lang || activeSub?.language || 'CC').toUpperCase().slice(0, 3);
                elements.subtitlesActiveLabel.textContent = code;
            }
        }

        let html = '';
        if (!state.subtitles || state.subtitles.length === 0) {
            html += '<div style="padding:10px 12px;font-size:12px;color:rgba(255,255,255,0.45);text-align:center;">No subtitles loaded.<br>Use "Search Subtitles" above.</div>';
        } else {
            html += `
                <button class="mb-menu-item mb-subtitle-item ${isOff ? 'active' : ''}" data-subtitle="-1">
                    <span>Off</span>
                    ${isOff ? '<span class="mb-menu-check">✓</span>' : ''}
                </button>
            `;

            state.subtitles.forEach((sub, index) => {
                const isActive = state.activeSubtitleIndex === index;
                const label = sub.label || sub.language || `Subtitle ${index + 1}`;
                html += `
                    <button class="mb-menu-item mb-subtitle-item ${isActive ? 'active' : ''}" data-subtitle="${index}">
                        <span>${escapeHtml(label)}</span>
                        ${isActive ? '<span class="mb-menu-check">✓</span>' : ''}
                    </button>
                `;
            });
        }

        elements.subtitlesList.innerHTML = html;
    }

    function renderSearchResults() {
        if (!elements.subsResultsList) return;
        let filtered = (state.subtitles || []).slice();
        if (state.searchFilterLang !== 'all') {
            filtered = filtered.filter(s => (s.lang || '').toLowerCase() === state.searchFilterLang || (s.langCode || '').toLowerCase() === state.searchFilterLang);
        }
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase().trim();
            filtered = filtered.filter(s => (s.label || '').toLowerCase().includes(q) || (s.lang || '').toLowerCase().includes(q) || (s.langCode || '').toLowerCase().includes(q));
        }

        if (elements.subsCountLabel) {
            elements.subsCountLabel.textContent = filtered.length > 0
                ? `${filtered.length} subtitle${filtered.length === 1 ? '' : 's'} available`
                : (state.subtitles.length === 0 ? 'No subtitles found from provider' : 'No subtitles matching filter');
        }

        if (filtered.length === 0) {
            elements.subsResultsList.innerHTML = `
                <div style="text-align: center; padding: 24px 10px; color: rgba(255,255,255,0.45); font-size: 13px;">
                    ${state.subtitles.length === 0 ? 'Click sync 🔄 or load a custom .vtt/.srt file below.' : 'No subtitles matched your search.'}
                </div>
            `;
            return;
        }

        const activeTrack = Array.from(elements.nativeVideo?.textTracks || []).find(t => t.mode === 'showing');
        const activeLabel = activeTrack ? activeTrack.label : '';

        elements.subsResultsList.innerHTML = filtered.map((sub, idx) => {
            const isActive = activeLabel && (activeLabel === sub.label || activeLabel === sub.language);
            return `
                <div class="mb-sub-item-card ${isActive ? 'is-active' : ''}" data-sub-idx="${idx}">
                    <div class="mb-sub-item-left">
                        <span class="mb-sub-lang-pill">${escapeHtml((sub.lang || sub.langCode || 'CC').slice(0, 3).toUpperCase())}</span>
                        <div class="mb-sub-item-info">
                            <span class="mb-sub-item-label">${escapeHtml(sub.label || sub.language || `Subtitle ${idx + 1}`)}</span>
                            <span class="mb-sub-item-source">${escapeHtml(sub.source || 'OpenSubtitles')}</span>
                        </div>
                    </div>
                    <button class="mb-sub-item-load-btn" type="button">
                        ${isActive ? '✓ Active' : 'Load & Play'}
                    </button>
                </div>
            `;
        }).join('');
    }

    function activateSubtitleTrack(sub) {
        if (!elements.nativeVideo) return;
        let existingTrack = Array.from(elements.nativeVideo.querySelectorAll('track')).find(t => t.src === sub.vttUrl || t.src === sub.url);
        if (!existingTrack) {
            existingTrack = document.createElement('track');
            existingTrack.kind = 'subtitles';
            existingTrack.label = sub.label || sub.language || 'Subtitle';
            existingTrack.srclang = sub.lang || sub.language || 'en';
            let trackSrc = sub.vttUrl || sub.url;
            if (trackSrc && !trackSrc.startsWith('/api/') && !trackSrc.endsWith('.vtt') && !trackSrc.startsWith('blob:')) {
                trackSrc = `/api/x8rr/subtitles/vtt?url=${encodeURIComponent(trackSrc)}`;
            }
            existingTrack.src = trackSrc;
            elements.nativeVideo.appendChild(existingTrack);
        }

        setTimeout(() => {
            const textTracks = Array.from(elements.nativeVideo.textTracks || []);
            const target = textTracks.find(t => t.label === (sub.label || sub.language) || (existingTrack && t === existingTrack.track));
            textTracks.forEach(t => {
                if (['subtitles', 'captions'].includes(t.kind)) {
                    t.mode = (t === target || (target && t.label === target.label)) ? 'showing' : 'disabled';
                }
            });
            const foundIdx = state.subtitles.findIndex(s => s.url === sub.url || s.label === sub.label);
            state.activeSubtitleIndex = foundIdx >= 0 ? foundIdx : 0;
            renderSubtitlesMenu();
            renderSearchResults();
        }, 120);
    }

    async function fetchSubtitlesFromApi(customQ = '') {
        if (elements.subsCountLabel) elements.subsCountLabel.textContent = 'Fetching subtitles…';
        const id = state.type === 'anime' ? state.anilistId : state.tmdbId;
        let url = `/api/x8rr/subtitles?type=${encodeURIComponent(state.type)}&id=${encodeURIComponent(id || '')}&season=${state.season}&episode=${state.episode}`;
        if (customQ) {
            url += `&q=${encodeURIComponent(customQ)}`;
        }
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
                    loadSubtitles(data.subtitles);
                    return;
                }
            }
        } catch {}
        renderSearchResults();
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
                            if (Array.isArray(x8Data.subtitles) && x8Data.subtitles.length > 0) {
                                loadSubtitles(x8Data.subtitles);
                            }
                        }
                    } catch {}
                }

                if (data.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
                    loadSubtitles(data.subtitles);
                } else if ((!state.subtitles || state.subtitles.length === 0) && state.type !== 'anime') {
                    fetch(`/api/x8rr/subtitles?type=${encodeURIComponent(state.type)}&id=${encodeURIComponent(id)}&season=${state.season}&episode=${state.episode}`)
                        .then(r => r.ok ? r.json() : null)
                        .then(subData => {
                            if (subData && Array.isArray(subData.subtitles) && subData.subtitles.length > 0) {
                                loadSubtitles(subData.subtitles);
                            }
                        })
                        .catch(() => {});
                }

                const currentMirror = state.x8rrStreams && state.x8rrStreams[state.activeX8rrIndex];
                const activeStreamUrl = currentMirror
                    ? (currentMirror.proxiedUrl || currentMirror.url)
                    : data.directStream;

                
                if (activeStreamUrl && window.Hls && window.Hls.isSupported()) {
                    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
                    elements.iframe.style.display = 'none';
                    elements.iframe.src = 'about:blank';
                    elements.nativeVideo.style.display = 'block';
                    elements.nativeVideo.crossOrigin = 'anonymous';

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

        
        const srv = SERVERS.find(s => s.id === state.currentServer) || SERVERS[0];
        elements.serverBadgeLabel.textContent = srv.name;
        elements.serverActiveLabel.textContent = srv.name;

        
        renderServerMenu();

        
        clearTimeout(state.loadTimeout);
        state.loadTimeout = setTimeout(() => {
            hideLoader();
        }, 12000);
    }

    
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

                    
                    if (Array.isArray(data.seasons)) {
                        elements.seasonSelect.innerHTML = data.seasons
                            .filter(s => s.season_number > 0)
                            .map(s => `<option value="${s.season_number}" ${s.season_number === state.season ? 'selected' : ''}>${escapeHtml(s.name || `Season ${s.season_number}`)} (${s.episode_count || 0} eps)</option>`)
                            .join('');
                    }

                    
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

        
        document.querySelectorAll('.mb-ep-item').forEach(el => {
            const epNum = parseInt(el.dataset.episode, 10);
            el.classList.toggle('active', epNum === state.episode);
        });

        loadStream();
    }

    
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

    
    function showLoader(msg) {
        elements.loaderText.textContent = msg || 'Loading stream…';
        elements.loader.hidden = false;
    }

    function hideLoader() {
        elements.loader.hidden = true;
    }

    
    function showError(msg) {
        hideLoader();
        if (msg) elements.errorDesc.textContent = msg;
        elements.errorCard.hidden = false;
    }

    function hideError() {
        elements.errorCard.hidden = true;
    }

    
    window.addEventListener('message', (e) => {
        try {
            const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (!data) return;

            
            hideLoader();

            
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

            
            const raw = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
            if (/\b(ended|finish|complete|video_ended|onEnded)\b/i.test(raw)) {
                triggerUpNext();
            }
        } catch {}
    });

    
    elements.iframe.addEventListener('load', () => {
        setTimeout(hideLoader, 1500);
    });

    elements.iframe.addEventListener('error', () => {
        showError('Unable to connect to stream. Click below to try an alternate server.');
    });

    
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
            
            try {
                const cmd = play ? 'play' : 'pause';
                elements.iframe.contentWindow.postMessage({ type: cmd, event: cmd }, '*');
            } catch {}
        }

        
        try {
            window.parent.postMessage({
                type: 'mb:sync',
                action: play ? 'play' : 'pause',
                time: state.currentTime || 0
            }, '*');
        } catch {}
    }

    
    elements.prevEpBtn.addEventListener('click', () => {
        if (state.episode > 1) goToEpisode(state.season, state.episode - 1);
    });

    elements.nextEpBtn.addEventListener('click', () => {
        goToEpisode(state.season, state.episode + 1);
    });

    
    elements.upNextPlayBtn.addEventListener('click', () => {
        hideUpNext();
        goToEpisode(state.season, state.episode + 1);
    });

    elements.upNextCancelBtn.addEventListener('click', hideUpNext);

    
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

    if (elements.subtitlesBtn) {
        elements.subtitlesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.serverMenu.hidden = true;
            elements.speedMenu.hidden = true;
            if (elements.qualityMenu) elements.qualityMenu.hidden = true;
            elements.subtitlesMenu.hidden = !elements.subtitlesMenu.hidden;
        });
    }

    if (elements.subtitlesList) {
        elements.subtitlesList.addEventListener('click', (e) => {
            const item = e.target.closest('.mb-subtitle-item');
            if (!item) return;
            const subIdx = parseInt(item.dataset.subtitle, 10);
            state.activeSubtitleIndex = subIdx;

            const textTracks = Array.from(elements.nativeVideo?.textTracks || []);
            textTracks.forEach((track, index) => {
                if (['subtitles', 'captions'].includes(track.kind)) {
                    track.mode = index === subIdx ? 'showing' : 'disabled';
                }
            });

            renderSubtitlesMenu();
            renderSearchResults();
            elements.subtitlesMenu.hidden = true;
        });
    }

    if (elements.menuSearchSubsBtn) {
        elements.menuSearchSubsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.subtitlesMenu.hidden = true;
            openSearchSubsModal();
        });
    }

    if (elements.menuSubStyleBtn) {
        elements.menuSubStyleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.subtitlesMenu.hidden = true;
            openSubStyleModal();
        });
    }

    if (elements.searchSubsBtn) {
        elements.searchSubsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSearchSubsModal();
        });
    }

    if (elements.subStyleBtn) {
        elements.subStyleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSubStyleModal();
        });
    }

    if (elements.searchSubsClose) {
        elements.searchSubsClose.addEventListener('click', () => {
            elements.searchSubsModal.hidden = true;
        });
    }

    if (elements.searchSubsBackdrop) {
        elements.searchSubsBackdrop.addEventListener('click', () => {
            elements.searchSubsModal.hidden = true;
        });
    }

    if (elements.subStyleClose) {
        elements.subStyleClose.addEventListener('click', () => {
            elements.subStyleModal.hidden = true;
        });
    }

    if (elements.subStyleBackdrop) {
        elements.subStyleBackdrop.addEventListener('click', () => {
            elements.subStyleModal.hidden = true;
        });
    }

    if (elements.styleSaveBtn) {
        elements.styleSaveBtn.addEventListener('click', () => {
            elements.subStyleModal.hidden = true;
        });
    }

    if (elements.styleResetBtn) {
        elements.styleResetBtn.addEventListener('click', () => {
            updatePreviewAndStyles(DEFAULT_SUB_STYLES);
        });
    }

    elements.styleSizeGroup?.addEventListener('click', (e) => {
        const btn = e.target.closest('.mb-style-choice-btn');
        if (btn?.dataset.size) updatePreviewAndStyles({ fontSize: btn.dataset.size });
    });

    elements.styleColorGroup?.addEventListener('click', (e) => {
        const btn = e.target.closest('.mb-style-color-swatch');
        if (btn?.dataset.color) updatePreviewAndStyles({ color: btn.dataset.color });
    });

    elements.styleBgGroup?.addEventListener('click', (e) => {
        const btn = e.target.closest('.mb-style-choice-btn');
        if (btn?.dataset.opacity) updatePreviewAndStyles({ bgOpacity: btn.dataset.opacity });
    });

    elements.styleAlignGroup?.addEventListener('click', (e) => {
        const btn = e.target.closest('.mb-style-choice-btn');
        if (btn?.dataset.align) updatePreviewAndStyles({ textAlign: btn.dataset.align });
    });

    elements.subsFilterChips?.addEventListener('click', (e) => {
        const chip = e.target.closest('.mb-subs-chip');
        if (!chip?.dataset.lang) return;
        elements.subsFilterChips.querySelectorAll('.mb-subs-chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        state.searchFilterLang = chip.dataset.lang;
        renderSearchResults();
    });

    if (elements.subsSearchInput) {
        elements.subsSearchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            renderSearchResults();
        });
    }

    if (elements.subsRefreshBtn) {
        elements.subsRefreshBtn.addEventListener('click', () => {
            fetchSubtitlesFromApi(elements.subsSearchInput ? elements.subsSearchInput.value : '');
        });
    }

    if (elements.subsCustomToggle && elements.subsCustomPanel) {
        elements.subsCustomToggle.addEventListener('click', () => {
            elements.subsCustomPanel.hidden = !elements.subsCustomPanel.hidden;
            elements.subsCustomToggle.textContent = elements.subsCustomPanel.hidden
                ? '+ Load Custom File or URL'
                : '− Hide Custom Subtitle Loader';
        });
    }

    if (elements.subsUrlLoadBtn && elements.subsUrlInput) {
        elements.subsUrlLoadBtn.addEventListener('click', () => {
            const raw = elements.subsUrlInput.value.trim();
            if (!raw) return;
            const customSub = {
                id: `custom-${Date.now()}`,
                label: 'Custom Subtitle (URL)',
                lang: 'en',
                langCode: 'custom',
                url: raw,
                vttUrl: raw.endsWith('.vtt') ? raw : `/api/x8rr/subtitles/vtt?url=${encodeURIComponent(raw)}`,
                source: 'Custom URL'
            };
            state.subtitles.unshift(customSub);
            activateSubtitleTrack(customSub);
            elements.subsUrlInput.value = '';
        });
    }

    if (elements.subsFileInput) {
        elements.subsFileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                let text = ev.target.result;
                if (!text.trim().startsWith('WEBVTT')) {
                    text = 'WEBVTT\n\n' + text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2').trim() + '\n';
                }
                const blob = new Blob([text], { type: 'text/vtt;charset=utf-8' });
                const blobUrl = URL.createObjectURL(blob);
                const fileSub = {
                    id: `file-${Date.now()}`,
                    label: file.name.replace(/\.[^/.]+$/, ''),
                    lang: 'en',
                    langCode: 'file',
                    url: blobUrl,
                    vttUrl: blobUrl,
                    source: 'Local File'
                };
                state.subtitles.unshift(fileSub);
                activateSubtitleTrack(fileSub);
            };
            reader.readAsText(file);
        });
    }

    if (elements.subsResultsList) {
        elements.subsResultsList.addEventListener('click', (e) => {
            const card = e.target.closest('.mb-sub-item-card');
            if (!card) return;
            const idx = parseInt(card.dataset.subIdx, 10);
            let filtered = (state.subtitles || []).slice();
            if (state.searchFilterLang !== 'all') {
                filtered = filtered.filter(s => (s.lang || '').toLowerCase() === state.searchFilterLang || (s.langCode || '').toLowerCase() === state.searchFilterLang);
            }
            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase().trim();
                filtered = filtered.filter(s => (s.label || '').toLowerCase().includes(q) || (s.lang || '').toLowerCase().includes(q) || (s.langCode || '').toLowerCase().includes(q));
            }
            const sub = filtered[idx];
            if (sub) {
                activateSubtitleTrack(sub);
            }
        });
    }

    
    elements.nextSourceBtn.addEventListener('click', () => {
        const curIdx = SERVERS.findIndex(s => s.id === state.currentServer);
        const next = SERVERS[(curIdx + 1) % SERVERS.length];
        state.currentServer = next.id;
        loadStream();
    });

    elements.retryBtn.addEventListener('click', loadStream);

   
    elements.speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.serverMenu.hidden = true;
        if (elements.qualityMenu) elements.qualityMenu.hidden = true;
        if (elements.subtitlesMenu) elements.subtitlesMenu.hidden = true;
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

    
    document.addEventListener('click', () => {
        elements.serverMenu.hidden = true;
        elements.speedMenu.hidden = true;
        if (elements.qualityMenu) elements.qualityMenu.hidden = true;
        if (elements.subtitlesMenu) elements.subtitlesMenu.hidden = true;
    });

    
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

    
    function resetIdleTimer() {
        elements.player.classList.remove('is-idle');
        clearTimeout(state.idleTimer);
        state.idleTimer = setTimeout(() => {
            if (!elements.serverMenu.hidden || !elements.speedMenu.hidden || (elements.qualityMenu && !elements.qualityMenu.hidden) || (elements.subtitlesMenu && !elements.subtitlesMenu.hidden) || !elements.epDrawer.hidden || (elements.searchSubsModal && !elements.searchSubsModal.hidden) || (elements.subStyleModal && !elements.subStyleModal.hidden)) return;
            elements.player.classList.add('is-idle');
        }, 3500);
    }

    elements.player.addEventListener('mousemove', resetIdleTimer);
    elements.player.addEventListener('mousedown', resetIdleTimer);
    elements.player.addEventListener('touchstart', resetIdleTimer);

    
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

    
    parseRoute();
    fetchMetadata();
    loadStream();
    resetIdleTimer();
})();
