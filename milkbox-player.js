function _milkboxEscapeHtml(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function _milkboxNormalizeVideoSource(source) {
    if (typeof source !== 'string' || !source.trim()) return '';
    try {
        const url = new URL(source.trim(), window.location.href);
        if (!['http:', 'https:', 'blob:'].includes(url.protocol)) return '';
        const host = url.hostname.toLowerCase();
        if (host === 'drive.google.com' || host.endsWith('.drive.google.com') ||
            host === 'docs.google.com' || host.endsWith('.docs.google.com') ||
            host === 'drive.usercontent.google.com') return '';
        return url.href;
    } catch {
        return '';
    }
}

function stopCustomVideoPlayer(container) {
    const video = container?.querySelector('video');
    if (!video) return;
    if (video._hls) {
        try { video._hls.destroy(); } catch {}
        video._hls = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
}

function _milkboxFormatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainder = totalSeconds % 60;
    return hours
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
        : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

const MILKBOX_DEFAULT_SUB_STYLES = {
    fontSize: '1.2rem',
    color: '#ffffff',
    bgOpacity: '0.82',
    textAlign: 'center',
    syncOffset: 0
};

function _milkboxGetSubtitleStyles() {
    try {
        const saved = localStorage.getItem('milkbox_subtitle_styles');
        if (saved) return Object.assign({}, MILKBOX_DEFAULT_SUB_STYLES, JSON.parse(saved));
    } catch {}
    return Object.assign({}, MILKBOX_DEFAULT_SUB_STYLES);
}

function _milkboxApplySubtitleStyles(styles) {
    let styleEl = document.getElementById('milkbox-dynamic-sub-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'milkbox-dynamic-sub-styles';
        document.head.appendChild(styleEl);
    }
    const s = Object.assign({}, MILKBOX_DEFAULT_SUB_STYLES, styles);
    const bgAlpha = parseFloat(s.bgOpacity ?? '0.82');
    const bgColor = bgAlpha === 0 ? 'transparent' : (bgAlpha === 1 ? '#000000' : `rgba(0, 0, 0, ${bgAlpha})`);
    
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.setProperty('--milkbox-sub-color', s.color || '#ffffff');
        document.documentElement.style.setProperty('--milkbox-sub-bg', bgColor);
        document.documentElement.style.setProperty('--milkbox-sub-size', s.fontSize || '1.2rem');
        document.documentElement.style.setProperty('--milkbox-sub-align', s.textAlign || 'center');
    }

    styleEl.textContent = `
        :root {
            --milkbox-sub-color: ${s.color || '#ffffff'};
            --milkbox-sub-bg: ${bgColor};
            --milkbox-sub-size: ${s.fontSize || '1.2rem'};
            --milkbox-sub-align: ${s.textAlign || 'center'};
        }
        .milkbox-player video::cue,
        .mb-native-video::cue,
        video::cue {
            opacity: 0 !important;
            color: transparent !important;
            background: transparent !important;
            text-shadow: none !important;
        }
    `;
}

function _milkboxSaveSubtitleStyles(styles) {
    try {
        localStorage.setItem('milkbox_subtitle_styles', JSON.stringify(styles));
    } catch {}
    _milkboxApplySubtitleStyles(styles);
}

function _milkboxParseTimestamp(ts) {
    if (!ts) return NaN;
    const clean = String(ts).trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return NaN;
}

function _milkboxParseVttOrSrtCues(text) {
    if (!text) return [];
    const cues = [];
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = clean.split(/\n\s*\n/);
    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (!lines.length) continue;
        let timeLineIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('-->')) {
                timeLineIdx = i;
                break;
            }
        }
        if (timeLineIdx === -1) continue;
        const timeLine = lines[timeLineIdx];
        const parts = timeLine.split('-->');
        if (parts.length !== 2) continue;
        const start = _milkboxParseTimestamp(parts[0]);
        const endPart = parts[1].trim().split(/\s+/)[0];
        const end = _milkboxParseTimestamp(endPart);
        if (isNaN(start) || isNaN(end) || end <= start) continue;
        const textLines = lines.slice(timeLineIdx + 1).join('\n').trim();
        if (!textLines) continue;
        cues.push({ start, end, text: textLines });
    }
    return cues.sort((a, b) => a.start - b.start);
}

function _milkboxCleanSubtitleHtml(raw) {
    if (!raw) return '';
    let s = raw.replace(/\{[^}]+\}/g, '').trim();
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/&lt;(\/?(?:i|b|u|strong|em))&gt;/gi, '<$1>')
         .replace(/&lt;font(?:\s+color=["']?([^"'>]+)["']?)?&gt;/gi, (m, color) => color ? `<span style="color:${color}">` : '<span>')
         .replace(/&lt;\/font&gt;/gi, '</span>')
         .replace(/\n/g, '<br>');
    return s;
}

// Initial apply
if (typeof document !== 'undefined') {
    _milkboxApplySubtitleStyles(_milkboxGetSubtitleStyles());
}

function _milkboxCreateNativePlayer(container, sourceUrl, titleText, subtitleText, extraOptions) {
    const player = document.createElement('section');
    player.className = 'milkbox-player';
    player.tabIndex = 0;
    player.setAttribute('aria-label', `Video player: ${titleText || 'Now playing'}`);

    const video = document.createElement('video');
    video.className = 'milkbox-player-video';
    video.preload = 'metadata';
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.setAttribute('aria-label', titleText || 'Video');

    const loading = document.createElement('div');
    loading.className = 'milkbox-player-loading';
    loading.setAttribute('aria-live', 'polite');
    loading.innerHTML = '<span></span><span class="milkbox-player-loading-label">Loading video…</span>';

    const error = document.createElement('div');
    error.className = 'milkbox-player-error';
    error.setAttribute('role', 'status');
    error.hidden = true;

    const centerPlay = document.createElement('button');
    centerPlay.className = 'milkbox-player-center-play';
    centerPlay.type = 'button';
    centerPlay.setAttribute('aria-label', 'Play video');
    centerPlay.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>';

    const controls = document.createElement('div');
    controls.className = 'milkbox-player-controls';
    controls.innerHTML = `
        <div class="milkbox-player-top-bar">
            <div class="milkbox-player-header-left">
                <span class="milkbox-player-brand-badge">
                    <span class="milkbox-player-pulse-dot"></span>
                    <span>x8rr Movies</span>
                </span>
                <div class="milkbox-player-header-info">
                    <span class="milkbox-player-header-title">${_milkboxEscapeHtml(titleText || 'Now Playing')}</span>
                    ${subtitleText ? `<span class="milkbox-player-header-sub">${_milkboxEscapeHtml(subtitleText)}</span>` : ''}
                </div>
            </div>
            <div class="milkbox-player-header-right">
                <span class="milkbox-player-tag">Direct HLS</span>
                <span class="milkbox-player-tag milkbox-player-tag-accent">Ad-Free</span>
            </div>
        </div>

        <div class="milkbox-player-dock">
            <div class="milkbox-player-seek-wrap">
                <div class="milkbox-player-seek-track">
                    <div class="milkbox-player-seek-loaded"></div>
                    <div class="milkbox-player-seek-progress"></div>
                </div>
                <input class="milkbox-player-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek">
                <div class="milkbox-player-seek-tooltip">0:00</div>
            </div>

            <div class="milkbox-player-control-row">
                <div class="milkbox-player-control-group milkbox-player-left-group">
                    <button class="milkbox-player-button milkbox-player-play" type="button" aria-label="Play" title="Play / Pause (Space)">
                        <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                    </button>
                    <button class="milkbox-player-button milkbox-player-skip-back" type="button" aria-label="Rewind 10 seconds" title="Rewind 10s (←)">
                        <span class="material-symbols-outlined" aria-hidden="true">replay_10</span>
                    </button>
                    <button class="milkbox-player-button milkbox-player-skip-fwd" type="button" aria-label="Forward 10 seconds" title="Forward 10s (→)">
                        <span class="material-symbols-outlined" aria-hidden="true">forward_10</span>
                    </button>

                    <div class="milkbox-player-vol-wrap">
                        <button class="milkbox-player-button milkbox-player-volume-button" type="button" aria-label="Mute" title="Mute (M)">
                            <span class="material-symbols-outlined" aria-hidden="true">volume_up</span>
                        </button>
                        <input class="milkbox-player-volume" type="range" min="0" max="1" value="1" step="0.05" aria-label="Volume">
                    </div>

                    <div class="milkbox-player-time" aria-live="off">
                        <span class="milkbox-player-current">0:00</span>
                        <span class="milkbox-player-time-sep">/</span>
                        <span class="milkbox-player-duration">0:00</span>
                    </div>
                </div>

                <div class="milkbox-player-control-group milkbox-player-right-group">
                    <div class="milkbox-player-track-selects">
                        <label class="milkbox-player-track-label milkbox-player-server-label" hidden title="Select Stream Server">
                            <span class="milkbox-player-chip-icon material-symbols-outlined">dns</span>
                            <span class="milkbox-player-chip-tag">Server</span>
                            <select class="milkbox-player-server-select" aria-label="Stream server"></select>
                            <span class="material-symbols-outlined milkbox-player-chip-arrow">expand_more</span>
                        </label>
                        <label class="milkbox-player-track-label milkbox-player-quality-label" hidden title="Select Stream Quality">
                            <span class="milkbox-player-chip-icon material-symbols-outlined">high_quality</span>
                            <span class="milkbox-player-chip-tag">Quality</span>
                            <select class="milkbox-player-quality-select" aria-label="Playback quality">
                                <option value="-1" selected>Auto</option>
                            </select>
                            <span class="material-symbols-outlined milkbox-player-chip-arrow">expand_more</span>
                        </label>
                        <label class="milkbox-player-track-label milkbox-player-audio-label" hidden title="Audio Track">
                            <span class="milkbox-player-chip-icon material-symbols-outlined">audiotrack</span>
                            <span class="milkbox-player-chip-tag">Audio</span>
                            <select class="milkbox-player-audio-track" aria-label="Audio track"></select>
                            <span class="material-symbols-outlined milkbox-player-chip-arrow">expand_more</span>
                        </label>
                        <label class="milkbox-player-track-label milkbox-player-subtitle-label" hidden title="Subtitles">
                            <span class="milkbox-player-chip-icon material-symbols-outlined">subtitles</span>
                            <span class="milkbox-player-chip-tag">Subs</span>
                            <select class="milkbox-player-subtitle-track" aria-label="Subtitle track"></select>
                            <span class="material-symbols-outlined milkbox-player-chip-arrow">expand_more</span>
                        </label>
                    </div>

                    <button class="milkbox-player-button milkbox-player-search-subs" type="button" aria-label="Search Subtitles" title="Search & Load Subtitles">
                        <span class="material-symbols-outlined" aria-hidden="true">manage_search</span>
                    </button>

                    <button class="milkbox-player-button milkbox-player-sub-style" type="button" aria-label="Subtitle Styling" title="Subtitle Styling Settings">
                        <span class="material-symbols-outlined" aria-hidden="true">tune</span>
                    </button>

                    <label class="milkbox-player-track-label milkbox-player-speed-label" title="Playback Speed">
                        <span class="material-symbols-outlined milkbox-player-chip-icon">speed</span>
                        <select class="milkbox-player-speed" aria-label="Playback speed">
                            <option value="0.5">0.5×</option>
                            <option value="0.75">0.75×</option>
                            <option value="1" selected>1.0×</option>
                            <option value="1.25">1.25×</option>
                            <option value="1.5">1.5×</option>
                            <option value="2">2.0×</option>
                        </select>
                        <span class="material-symbols-outlined milkbox-player-chip-arrow">expand_more</span>
                    </label>

                    <button class="milkbox-player-button milkbox-player-pip" type="button" aria-label="Picture in Picture" title="Picture in Picture">
                        <span class="material-symbols-outlined" aria-hidden="true">picture_in_picture_alt</span>
                    </button>

                    <button class="milkbox-player-button milkbox-player-fullscreen" type="button" aria-label="Fullscreen" title="Fullscreen (F)">
                        <span class="material-symbols-outlined" aria-hidden="true">fullscreen</span>
                    </button>
                </div>
            </div>
        </div>`;

    const searchSubsModal = document.createElement('div');
    searchSubsModal.className = 'milkbox-player-modal milkbox-player-search-subs-modal';
    searchSubsModal.hidden = true;
    searchSubsModal.innerHTML = `
        <div class="milkbox-player-modal-backdrop"></div>
        <div class="milkbox-player-modal-content">
            <div class="milkbox-player-modal-header">
                <div class="milkbox-player-modal-title-group">
                    <span class="material-symbols-outlined milkbox-player-modal-icon">subtitles</span>
                    <span class="milkbox-player-modal-title">Search Subtitles</span>
                    <span class="milkbox-player-modal-badge">${_milkboxEscapeHtml(titleText || 'Media')}</span>
                </div>
                <button class="milkbox-player-modal-close" type="button" aria-label="Close">✕</button>
            </div>
            <div class="milkbox-player-modal-body">
                <div class="milkbox-subs-search-bar">
                    <span class="material-symbols-outlined milkbox-subs-search-icon">search</span>
                    <input class="milkbox-subs-search-input" type="search" placeholder="Search by language (e.g. Spanish, French) or keyword..." autocomplete="off">
                    <button class="milkbox-subs-refresh-btn" type="button" title="Refetch subtitles from API">
                        <span class="material-symbols-outlined">sync</span>
                    </button>
                </div>
                <div class="milkbox-subs-filter-chips">
                    <button class="milkbox-subs-chip is-active" data-lang="all" type="button">All</button>
                    <button class="milkbox-subs-chip" data-lang="en" type="button">English</button>
                    <button class="milkbox-subs-chip" data-lang="es" type="button">Spanish</button>
                    <button class="milkbox-subs-chip" data-lang="fr" type="button">French</button>
                    <button class="milkbox-subs-chip" data-lang="de" type="button">German</button>
                    <button class="milkbox-subs-chip" data-lang="it" type="button">Italian</button>
                    <button class="milkbox-subs-chip" data-lang="pt" type="button">Portuguese</button>
                    <button class="milkbox-subs-chip" data-lang="ar" type="button">Arabic</button>
                    <button class="milkbox-subs-chip" data-lang="ja" type="button">Japanese</button>
                </div>
                <div class="milkbox-subs-list-status">
                    <span class="milkbox-subs-count-label">Loading subtitles…</span>
                    <button class="milkbox-subs-custom-toggle" type="button">+ Load Custom File or URL</button>
                </div>
                <div class="milkbox-subs-custom-panel" hidden>
                    <div class="milkbox-subs-custom-row">
                        <input class="milkbox-subs-url-input" type="url" placeholder="Paste .vtt or .srt subtitle link (https://...)">
                        <button class="milkbox-subs-url-load-btn" type="button">Load</button>
                    </div>
                    <div class="milkbox-subs-custom-row">
                        <label class="milkbox-subs-file-label">
                            <span class="material-symbols-outlined">upload_file</span>
                            <span>Upload subtitle file (.vtt, .srt)</span>
                            <input class="milkbox-subs-file-input" type="file" accept=".vtt,.srt">
                        </label>
                    </div>
                </div>
                <div class="milkbox-subs-results-list"></div>
            </div>
        </div>
    `;

    const subStyleModal = document.createElement('div');
    subStyleModal.className = 'milkbox-player-modal milkbox-player-sub-style-modal';
    subStyleModal.hidden = true;
    subStyleModal.innerHTML = `
        <div class="milkbox-player-modal-backdrop"></div>
        <div class="milkbox-player-modal-content">
            <div class="milkbox-player-modal-header">
                <div class="milkbox-player-modal-title-group">
                    <span class="material-symbols-outlined milkbox-player-modal-icon">tune</span>
                    <span class="milkbox-player-modal-title">Subtitle Styling</span>
                </div>
                <button class="milkbox-player-modal-close" type="button" aria-label="Close">✕</button>
            </div>
            <div class="milkbox-player-modal-body">
                <div class="milkbox-style-preview-container">
                    <div class="milkbox-style-preview-label">LIVE PREVIEW</div>
                    <div class="milkbox-style-preview-box">
                        <div class="milkbox-style-preview-text">Sample Subtitle · The greatest glory in living lies not in never falling, but in rising every time we fall.</div>
                    </div>
                </div>
                <div class="milkbox-style-section">
                    <div class="milkbox-style-section-title">
                        <span class="material-symbols-outlined">format_size</span>
                        <span>Font Size</span>
                    </div>
                    <div class="milkbox-style-btn-group milkbox-style-size-group">
                        <button class="milkbox-style-choice-btn" data-size="0.9rem" type="button">Small (75%)</button>
                        <button class="milkbox-style-choice-btn is-active" data-size="1.15rem" type="button">Normal (100%)</button>
                        <button class="milkbox-style-choice-btn" data-size="1.45rem" type="button">Large (125%)</button>
                        <button class="milkbox-style-choice-btn" data-size="1.8rem" type="button">Extra Large (150%)</button>
                    </div>
                </div>
                <div class="milkbox-style-section">
                    <div class="milkbox-style-section-title">
                        <span class="material-symbols-outlined">palette</span>
                        <span>Text Color</span>
                    </div>
                    <div class="milkbox-style-color-group">
                        <button class="milkbox-style-color-swatch is-active" data-color="#ffffff" style="--swatch-color:#ffffff;" type="button"><span>White</span></button>
                        <button class="milkbox-style-color-swatch" data-color="#ffe600" style="--swatch-color:#ffe600;" type="button"><span>Yellow</span></button>
                        <button class="milkbox-style-color-swatch" data-color="#00f0ff" style="--swatch-color:#00f0ff;" type="button"><span>Cyan</span></button>
                        <button class="milkbox-style-color-swatch" data-color="#76ff03" style="--swatch-color:#76ff03;" type="button"><span>Green</span></button>
                        <button class="milkbox-style-color-swatch" data-color="#ffb6d8" style="--swatch-color:#ffb6d8;" type="button"><span>Pink</span></button>
                        <button class="milkbox-style-color-swatch" data-color="#ff2e63" style="--swatch-color:#ff2e63;" type="button"><span>Coral</span></button>
                    </div>
                </div>
                <div class="milkbox-style-section">
                    <div class="milkbox-style-section-title">
                        <span class="material-symbols-outlined">opacity</span>
                        <span>Background Opacity</span>
                    </div>
                    <div class="milkbox-style-btn-group milkbox-style-bg-group">
                        <button class="milkbox-style-choice-btn" data-opacity="0" type="button">None (0%)</button>
                        <button class="milkbox-style-choice-btn" data-opacity="0.35" type="button">Subtle (35%)</button>
                        <button class="milkbox-style-choice-btn" data-opacity="0.6" type="button">Medium (60%)</button>
                        <button class="milkbox-style-choice-btn is-active" data-opacity="0.82" type="button">Standard (80%)</button>
                        <button class="milkbox-style-choice-btn" data-opacity="1" type="button">Solid (100%)</button>
                    </div>
                </div>
                <div class="milkbox-style-section">
                    <div class="milkbox-style-section-title">
                        <span class="material-symbols-outlined">format_align_center</span>
                        <span>Text Alignment</span>
                    </div>
                    <div class="milkbox-style-btn-group milkbox-style-align-group">
                        <button class="milkbox-style-choice-btn" data-align="left" type="button">
                            <span class="material-symbols-outlined">format_align_left</span>
                            <span>Left</span>
                        </button>
                        <button class="milkbox-style-choice-btn is-active" data-align="center" type="button">
                            <span class="material-symbols-outlined">format_align_center</span>
                            <span>Center</span>
                        </button>
                        <button class="milkbox-style-choice-btn" data-align="right" type="button">
                            <span class="material-symbols-outlined">format_align_right</span>
                            <span>Right</span>
                        </button>
                    </div>
                </div>
                <div class="milkbox-style-section">
                    <div class="milkbox-style-section-title">
                        <span class="material-symbols-outlined">schedule</span>
                        <span>Subtitle Timing Sync (Audio Offset)</span>
                        <span class="milkbox-style-sync-val" style="margin-left:auto;color:var(--milkbox-accent-soft);font-weight:700;">0.0s</span>
                    </div>
                    <div class="milkbox-style-btn-group milkbox-style-sync-group">
                        <button class="milkbox-style-choice-btn" data-sync="-1" type="button">−1.0s</button>
                        <button class="milkbox-style-choice-btn" data-sync="-0.5" type="button">−0.5s</button>
                        <button class="milkbox-style-choice-btn is-active" data-sync="0" type="button">0.0s (Normal)</button>
                        <button class="milkbox-style-choice-btn" data-sync="0.5" type="button">+0.5s</button>
                        <button class="milkbox-style-choice-btn" data-sync="1" type="button">+1.0s</button>
                    </div>
                </div>
                <div class="milkbox-style-footer">
                    <button class="milkbox-style-reset-btn" type="button">Reset to Defaults</button>
                    <button class="milkbox-style-save-btn" type="button">Done</button>
                </div>
            </div>
        </div>
    `;

    const subtitlesOverlay = document.createElement('div');
    subtitlesOverlay.className = 'milkbox-subtitles-overlay';
    subtitlesOverlay.setAttribute('aria-live', 'polite');

    player.append(video, subtitlesOverlay, loading, error, centerPlay, controls, searchSubsModal, subStyleModal);
    container.replaceChildren(player);

    const playButton = controls.querySelector('.milkbox-player-play');
    const skipBackButton = controls.querySelector('.milkbox-player-skip-back');
    const skipFwdButton = controls.querySelector('.milkbox-player-skip-fwd');
    const seek = controls.querySelector('.milkbox-player-seek');
    const seekLoaded = controls.querySelector('.milkbox-player-seek-loaded');
    const seekProgress = controls.querySelector('.milkbox-player-seek-progress');
    const seekTooltip = controls.querySelector('.milkbox-player-seek-tooltip');
    const seekWrap = controls.querySelector('.milkbox-player-seek-wrap');
    const currentTime = controls.querySelector('.milkbox-player-current');
    const duration = controls.querySelector('.milkbox-player-duration');
    const volume = controls.querySelector('.milkbox-player-volume');
    const volumeButton = controls.querySelector('.milkbox-player-volume-button');
    const speed = controls.querySelector('.milkbox-player-speed');
    const fullscreenButton = controls.querySelector('.milkbox-player-fullscreen');
    const pictureInPictureButton = controls.querySelector('.milkbox-player-pip');
    const serverLabel = controls.querySelector('.milkbox-player-server-label');
    const serverSelect = controls.querySelector('.milkbox-player-server-select');
    const qualityLabel = controls.querySelector('.milkbox-player-quality-label');
    const qualitySelect = controls.querySelector('.milkbox-player-quality-select');
    const audioTrackLabel = controls.querySelector('.milkbox-player-audio-label');
    const audioTrackSelect = controls.querySelector('.milkbox-player-audio-track');
    const subtitleTrackLabel = controls.querySelector('.milkbox-player-subtitle-label');
    const subtitleTrackSelect = controls.querySelector('.milkbox-player-subtitle-track');
    const searchSubsBtn = controls.querySelector('.milkbox-player-search-subs');
    const subStyleBtn = controls.querySelector('.milkbox-player-sub-style');
    let hideControlsTimer;
    if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) pictureInPictureButton.hidden = true;

    if (skipBackButton) {
        skipBackButton.addEventListener('click', () => {
            video.currentTime = Math.max(0, video.currentTime - 10);
        });
    }
    if (skipFwdButton) {
        skipFwdButton.addEventListener('click', () => {
            video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
        });
    }
    if (seekWrap && seekTooltip) {
        seekWrap.addEventListener('mousemove', (e) => {
            const rect = seekWrap.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekTooltip.style.left = `${pos * 100}%`;
            seekTooltip.textContent = _milkboxFormatTime((video.duration || 0) * pos);
        });
    }

    const setTrackOptions = (select, tracks, getLabel, selectedValue) => {
        const options = [];
        tracks.forEach((track, index) => options.push(new Option(getLabel(track, index), String(index))));
        select.replaceChildren(...options);
        select.value = selectedValue;
    };
    const updateTrackSelectors = () => {
        const audioTracks = video.audioTracks;
        if (audioTracks) {
            const tracks = Array.from(audioTracks);
            audioTrackLabel.hidden = tracks.length === 0;
            if (tracks.length) {
                const selectedIndex = tracks.findIndex(track => track.enabled);
                setTrackOptions(
                    audioTrackSelect,
                    tracks,
                    (track, index) => track.label || track.name || [track.language, `Audio ${index + 1}`].filter(Boolean).join(' · '),
                    String(selectedIndex < 0 ? 0 : selectedIndex)
                );
            }
        } else {
            audioTrackLabel.hidden = true;
        }

        const subtitleTracks = Array.from(video.textTracks || [])
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => ['subtitles', 'captions'].includes(track.kind));
        subtitleTrackLabel.hidden = subtitleTracks.length === 0;
        if (subtitleTracks.length) {
            const activeTrack = subtitleTracks.find(({ track }) => track.mode === 'showing');
            const options = [new Option('Off', 'off')];
            subtitleTracks.forEach(({ track, index }) => {
                const kind = track.kind === 'captions' ? 'Captions' : 'Subtitles';
                const label = track.label || track.name || [track.language, `${kind} ${index + 1}`].filter(Boolean).join(' · ');
                options.push(new Option(label, String(index)));
            });
            subtitleTrackSelect.replaceChildren(...options);
            subtitleTrackSelect.value = activeTrack ? String(activeTrack.index) : 'off';
        }
    };
    audioTrackSelect.addEventListener('change', () => {
        const tracks = video.audioTracks;
        if (!tracks) return;
        const selectedIndex = Number(audioTrackSelect.value);
        Array.from(tracks).forEach((track, index) => { track.enabled = index === selectedIndex; });
    });
    let activeParsedCues = [];
    let activeParsedTrackUrl = '';
    let activeSubtitleTrackIndex = -1;

    async function loadCuesForSub(sub) {
        if (!sub) {
            activeParsedCues = [];
            activeParsedTrackUrl = '';
            updateSubtitleOverlay();
            return;
        }
        let trackSrc = sub.vttUrl || sub.url;
        if (trackSrc && !trackSrc.startsWith('/api/') && !trackSrc.endsWith('.vtt') && !trackSrc.startsWith('blob:')) {
            trackSrc = `/api/x8rr/subtitles/vtt?url=${encodeURIComponent(trackSrc)}`;
        }
        activeParsedTrackUrl = trackSrc;
        if (sub._rawText) {
            activeParsedCues = _milkboxParseVttOrSrtCues(sub._rawText);
            updateSubtitleOverlay();
            return;
        }
        try {
            const res = await fetch(trackSrc);
            if (res.ok) {
                const text = await res.text();
                if (activeParsedTrackUrl === trackSrc) {
                    activeParsedCues = _milkboxParseVttOrSrtCues(text);
                    updateSubtitleOverlay();
                }
            }
        } catch (e) {
            console.warn('[Milkbox Player] Subtitle load notice:', e);
        }
    }

    let currentOverlayText = '';
    function updateSubtitleOverlay() {
        if (!activeParsedCues || !activeParsedCues.length || activeSubtitleTrackIndex === -1) {
            if (currentOverlayText !== '') {
                currentOverlayText = '';
                subtitlesOverlay.style.display = 'none';
                subtitlesOverlay.innerHTML = '';
            }
            return;
        }

        const syncOffset = parseFloat(currentDraftStyles.syncOffset || 0);
        const t = (video.currentTime || 0) + syncOffset;

        let matched = [];
        for (let i = 0; i < activeParsedCues.length; i++) {
            const c = activeParsedCues[i];
            if (t >= c.start && t <= c.end) {
                matched.push(c.text);
            } else if (c.start > t + 2) {
                break;
            }
        }

        const newText = matched.join('\n');
        if (newText !== currentOverlayText) {
            currentOverlayText = newText;
            if (!newText) {
                subtitlesOverlay.style.display = 'none';
                subtitlesOverlay.innerHTML = '';
            } else {
                subtitlesOverlay.style.display = 'flex';
                subtitlesOverlay.innerHTML = `<div class="milkbox-subtitle-line">${_milkboxCleanSubtitleHtml(newText)}</div>`;
            }
        }
    }

    video.addEventListener('timeupdate', updateSubtitleOverlay);
    video.addEventListener('seeked', updateSubtitleOverlay);

    subtitleTrackSelect.addEventListener('change', () => {
        const val = subtitleTrackSelect.value;
        if (val === 'off') {
            activeParsedCues = [];
            activeSubtitleTrackIndex = -1;
            updateSubtitleOverlay();
            Array.from(video.textTracks || []).forEach(t => {
                if (['subtitles', 'captions'].includes(t.kind)) t.mode = 'disabled';
            });
            renderSearchResults();
            return;
        }
        const selectedIndex = Number(val);
        activeSubtitleTrackIndex = selectedIndex;
        Array.from(video.textTracks || []).forEach((track, index) => {
            if (['subtitles', 'captions'].includes(track.kind)) track.mode = index === selectedIndex ? 'showing' : 'disabled';
        });
        const sub = currentLoadedSubtitles[selectedIndex];
        if (sub) {
            loadCuesForSub(sub);
        }
        renderSearchResults();
    });
    video.addEventListener('loadedmetadata', updateTrackSelectors);
    video.addEventListener('loadeddata', updateTrackSelectors);
    video.addEventListener('loadstart', updateTrackSelectors);
    for (const trackList of [video.audioTracks, video.textTracks]) {
        if (trackList?.addEventListener) {
            trackList.addEventListener('addtrack', updateTrackSelectors);
            trackList.addEventListener('removetrack', updateTrackSelectors);
            trackList.addEventListener('change', updateTrackSelectors);
        }
    }

    let currentLoadedSubtitles = [];
    let currentSearchFilterLang = 'all';
    let currentSearchQuery = '';

    const renderSearchResults = () => {
        const resultsContainer = searchSubsModal.querySelector('.milkbox-subs-results-list');
        const countLabel = searchSubsModal.querySelector('.milkbox-subs-count-label');
        if (!resultsContainer) return;

        let filtered = currentLoadedSubtitles.slice();
        if (currentSearchFilterLang !== 'all') {
            filtered = filtered.filter(s => (s.lang || '').toLowerCase() === currentSearchFilterLang || (s.langCode || '').toLowerCase() === currentSearchFilterLang);
        }
        if (currentSearchQuery) {
            const q = currentSearchQuery.toLowerCase().trim();
            filtered = filtered.filter(s => (s.label || '').toLowerCase().includes(q) || (s.lang || '').toLowerCase().includes(q) || (s.langCode || '').toLowerCase().includes(q));
        }

        if (countLabel) {
            countLabel.textContent = filtered.length > 0
                ? `${filtered.length} subtitle${filtered.length === 1 ? '' : 's'} available`
                : (currentLoadedSubtitles.length === 0 ? 'No subtitles found from provider' : 'No subtitles matching filter');
        }

        if (filtered.length === 0) {
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 24px 10px; color: rgba(255,255,255,0.45); font-size: 13px;">
                    ${currentLoadedSubtitles.length === 0 ? 'Click sync 🔄 or load a custom .vtt/.srt file below.' : 'No subtitles matched your search.'}
                </div>
            `;
            return;
        }

        const activeSub = activeSubtitleTrackIndex >= 0 ? currentLoadedSubtitles[activeSubtitleTrackIndex] : null;

        resultsContainer.innerHTML = filtered.map((sub, idx) => {
            const isActive = activeSub && (activeSub === sub || activeSub.url === sub.url || activeSub.label === sub.label);
            return `
                <div class="milkbox-sub-item-card ${isActive ? 'is-active' : ''}" data-sub-idx="${idx}">
                    <div class="milkbox-sub-item-left">
                        <span class="milkbox-sub-lang-pill">${_milkboxEscapeHtml((sub.lang || sub.langCode || 'CC').slice(0, 3).toUpperCase())}</span>
                        <div class="milkbox-sub-item-info">
                            <span class="milkbox-sub-item-label">${_milkboxEscapeHtml(sub.label || sub.language || `Subtitle ${idx + 1}`)}</span>
                            <span class="milkbox-sub-item-source">${_milkboxEscapeHtml(sub.source || 'OpenSubtitles')}</span>
                        </div>
                    </div>
                    <button class="milkbox-sub-item-load-btn" type="button">
                        ${isActive ? '✓ Active' : 'Load & Play'}
                    </button>
                </div>
            `;
        }).join('');
    };

    const activateSubtitleTrack = (sub) => {
        let existingTrack = Array.from(video.querySelectorAll('track')).find(t => t.src === sub.vttUrl || t.src === sub.url);
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
            video.appendChild(existingTrack);
        }

        const foundIdx = currentLoadedSubtitles.findIndex(s => s === sub || s.url === sub.url || s.label === sub.label);
        activeSubtitleTrackIndex = foundIdx >= 0 ? foundIdx : 0;
        loadCuesForSub(sub);

        setTimeout(() => {
            const textTracks = Array.from(video.textTracks || []);
            const target = textTracks.find(t => t.label === (sub.label || sub.language) || (existingTrack && t === existingTrack.track));
            textTracks.forEach(t => {
                if (['subtitles', 'captions'].includes(t.kind)) {
                    t.mode = (t === target || (target && t.label === target.label)) ? 'showing' : 'disabled';
                }
            });
            updateTrackSelectors();
            renderSearchResults();
            if (typeof toast === 'function') toast(`Active: ${sub.label || 'Subtitle track'}`, 'success');
        }, 80);
    };

    const fetchSubtitlesFromApi = async (customQ = '') => {
        const countLabel = searchSubsModal.querySelector('.milkbox-subs-count-label');
        if (countLabel) countLabel.textContent = 'Fetching subtitles…';
        const mType = extraOptions?.mediaType || extraOptions?.type || 'movie';
        const mId = extraOptions?.tmdbId || extraOptions?.imdbId || '';
        const sNum = extraOptions?.season || 1;
        const eNum = extraOptions?.episode || 1;
        let url = `/api/x8rr/subtitles?type=${encodeURIComponent(mType)}&id=${encodeURIComponent(mId)}&season=${sNum}&episode=${eNum}`;
        if (customQ) {
            url += `&q=${encodeURIComponent(customQ)}`;
        } else if (extraOptions?.imdbId) {
            url += `&imdb=${encodeURIComponent(extraOptions.imdbId)}`;
        }
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
                    currentLoadedSubtitles = data.subtitles;
                    applySubtitles(data.subtitles);
                    renderSearchResults();
                    return;
                }
            }
        } catch {}
        renderSearchResults();
    };

    const applySubtitles = (subsList) => {
        if (!Array.isArray(subsList) || subsList.length === 0) return;
        currentLoadedSubtitles = subsList.slice();
        video.querySelectorAll('track').forEach(t => t.remove());

        subsList.forEach((sub, idx) => {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = sub.label || sub.language || `Subtitle ${idx + 1}`;
            track.srclang = sub.lang || sub.language || 'en';
            let trackSrc = sub.vttUrl || sub.url;
            if (trackSrc && !trackSrc.startsWith('/api/') && !trackSrc.endsWith('.vtt')) {
                trackSrc = `/api/x8rr/subtitles/vtt?url=${encodeURIComponent(trackSrc)}`;
            }
            track.src = trackSrc;
            if (sub.default) track.default = true;
            video.appendChild(track);
        });

        setTimeout(updateTrackSelectors, 50);
        setTimeout(updateTrackSelectors, 300);
        setTimeout(updateTrackSelectors, 800);
        renderSearchResults();
    };

    if (extraOptions?.subtitles && Array.isArray(extraOptions.subtitles) && extraOptions.subtitles.length > 0) {
        applySubtitles(extraOptions.subtitles);
    } else if (extraOptions?.tmdbId || extraOptions?.imdbId) {
        fetchSubtitlesFromApi();
    }

    // Subtitle Styling interactive state and bindings
    let currentDraftStyles = _milkboxGetSubtitleStyles();
    const previewText = subStyleModal.querySelector('.milkbox-style-preview-text');

    const updatePreviewAndStyles = (newStyles) => {
        currentDraftStyles = Object.assign({}, currentDraftStyles, newStyles);
        _milkboxSaveSubtitleStyles(currentDraftStyles);

        if (previewText) {
            previewText.style.fontSize = currentDraftStyles.fontSize;
            previewText.style.color = currentDraftStyles.color;
            const bgAlpha = parseFloat(currentDraftStyles.bgOpacity ?? '0.82');
            previewText.style.backgroundColor = bgAlpha === 0 ? 'transparent' : (bgAlpha === 1 ? '#000000' : `rgba(0, 0, 0, ${bgAlpha})`);
            previewText.style.textAlign = currentDraftStyles.textAlign;
        }

        subStyleModal.querySelectorAll('.milkbox-style-size-group .milkbox-style-choice-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.size === currentDraftStyles.fontSize);
        });
        subStyleModal.querySelectorAll('.milkbox-style-color-group .milkbox-style-color-swatch').forEach(btn => {
            btn.classList.toggle('is-active', (btn.dataset.color || '').toLowerCase() === (currentDraftStyles.color || '').toLowerCase());
        });
        subStyleModal.querySelectorAll('.milkbox-style-bg-group .milkbox-style-choice-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.opacity === String(currentDraftStyles.bgOpacity));
        });
        subStyleModal.querySelectorAll('.milkbox-style-align-group .milkbox-style-choice-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.align === currentDraftStyles.textAlign);
        });

        const syncValEl = subStyleModal.querySelector('.milkbox-style-sync-val');
        if (syncValEl) {
            const off = parseFloat(currentDraftStyles.syncOffset || 0);
            syncValEl.textContent = off > 0 ? `+${off.toFixed(1)}s` : `${off.toFixed(1)}s`;
        }
        subStyleModal.querySelectorAll('.milkbox-style-sync-group .milkbox-style-choice-btn').forEach(btn => {
            btn.classList.toggle('is-active', parseFloat(btn.dataset.sync) === parseFloat(currentDraftStyles.syncOffset || 0));
        });
        updateSubtitleOverlay();
    };

    updatePreviewAndStyles({});

    if (searchSubsBtn) {
        searchSubsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchSubsModal.hidden = false;
            subStyleModal.hidden = true;
            if (currentLoadedSubtitles.length === 0) {
                fetchSubtitlesFromApi();
            } else {
                renderSearchResults();
            }
        });
    }

    if (subStyleBtn) {
        subStyleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            subStyleModal.hidden = false;
            searchSubsModal.hidden = true;
            updatePreviewAndStyles(_milkboxGetSubtitleStyles());
        });
    }

    searchSubsModal.querySelectorAll('.milkbox-player-modal-close, .milkbox-player-modal-backdrop').forEach(el => {
        el.addEventListener('click', () => { searchSubsModal.hidden = true; });
    });

    subStyleModal.querySelectorAll('.milkbox-player-modal-close, .milkbox-player-modal-backdrop, .milkbox-style-save-btn').forEach(el => {
        el.addEventListener('click', () => { subStyleModal.hidden = true; });
    });

    const resetStyleBtn = subStyleModal.querySelector('.milkbox-style-reset-btn');
    if (resetStyleBtn) {
        resetStyleBtn.addEventListener('click', () => {
            updatePreviewAndStyles(MILKBOX_DEFAULT_SUB_STYLES);
            if (typeof toast === 'function') toast('Subtitle styles reset to defaults', 'info');
        });
    }

    subStyleModal.querySelector('.milkbox-style-size-group')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.milkbox-style-choice-btn');
        if (btn?.dataset.size) updatePreviewAndStyles({ fontSize: btn.dataset.size });
    });

    subStyleModal.querySelector('.milkbox-style-color-group')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.milkbox-style-color-swatch');
        if (btn?.dataset.color) updatePreviewAndStyles({ color: btn.dataset.color });
    });

    subStyleModal.querySelector('.milkbox-style-bg-group')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.milkbox-style-choice-btn');
        if (btn?.dataset.opacity) updatePreviewAndStyles({ bgOpacity: btn.dataset.opacity });
    });

    subStyleModal.querySelector('.milkbox-style-align-group')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.milkbox-style-choice-btn');
        if (btn?.dataset.align) updatePreviewAndStyles({ textAlign: btn.dataset.align });
    });

    searchSubsModal.querySelector('.milkbox-subs-filter-chips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.milkbox-subs-chip');
        if (!chip || !chip.dataset.lang) return;
        searchSubsModal.querySelectorAll('.milkbox-subs-chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        currentSearchFilterLang = chip.dataset.lang;
        renderSearchResults();
    });

    const searchInput = searchSubsModal.querySelector('.milkbox-subs-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value;
            renderSearchResults();
        });
    }

    const refreshSubsBtn = searchSubsModal.querySelector('.milkbox-subs-refresh-btn');
    if (refreshSubsBtn) {
        refreshSubsBtn.addEventListener('click', () => {
            fetchSubtitlesFromApi(searchInput ? searchInput.value : '');
        });
    }

    const customToggle = searchSubsModal.querySelector('.milkbox-subs-custom-toggle');
    const customPanel = searchSubsModal.querySelector('.milkbox-subs-custom-panel');
    if (customToggle && customPanel) {
        customToggle.addEventListener('click', () => {
            customPanel.hidden = !customPanel.hidden;
            customToggle.textContent = customPanel.hidden ? '+ Load Custom File or URL' : '− Hide Custom Subtitle Loader';
        });
    }

    const urlInput = searchSubsModal.querySelector('.milkbox-subs-url-input');
    const urlLoadBtn = searchSubsModal.querySelector('.milkbox-subs-url-load-btn');
    if (urlLoadBtn && urlInput) {
        urlLoadBtn.addEventListener('click', () => {
            const raw = urlInput.value.trim();
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
            currentLoadedSubtitles.unshift(customSub);
            activateSubtitleTrack(customSub);
            urlInput.value = '';
        });
    }

    const fileInput = searchSubsModal.querySelector('.milkbox-subs-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
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
                currentLoadedSubtitles.unshift(fileSub);
                activateSubtitleTrack(fileSub);
            };
            reader.readAsText(file);
        });
    }

    searchSubsModal.querySelector('.milkbox-subs-results-list')?.addEventListener('click', (e) => {
        const card = e.target.closest('.milkbox-sub-item-card');
        if (!card) return;
        const subIdx = parseInt(card.dataset.subIdx, 10);
        let filtered = currentLoadedSubtitles.slice();
        if (currentSearchFilterLang !== 'all') {
            filtered = filtered.filter(s => (s.lang || '').toLowerCase() === currentSearchFilterLang || (s.langCode || '').toLowerCase() === currentSearchFilterLang);
        }
        if (currentSearchQuery) {
            const q = currentSearchQuery.toLowerCase().trim();
            filtered = filtered.filter(s => (s.label || '').toLowerCase().includes(q) || (s.lang || '').toLowerCase().includes(q) || (s.langCode || '').toLowerCase().includes(q));
        }
        const selectedSub = filtered[subIdx];
        if (selectedSub) activateSubtitleTrack(selectedSub);
    });

    const updatePlayState = () => {
        const icon = playButton.querySelector('span');
        icon.textContent = video.paused ? 'play_arrow' : 'pause';
        playButton.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
        centerPlay.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
        centerPlay.classList.toggle('is-paused', video.paused);
        player.classList.toggle('is-paused', video.paused);
    };
    const showPlaybackError = (message) => {
        loading.hidden = true;
        error.textContent = message;
        error.hidden = false;
    };
    const togglePlayback = () => {
        if (video.paused) {
            video.play().catch(() => {
                showPlaybackError('Playback was blocked by the browser. Press play again or check the video source.');
            });
        }
        else video.pause();
    };
    const showControls = () => {
        player.classList.remove('controls-hidden');
        clearTimeout(hideControlsTimer);
        if (!video.paused) {
            hideControlsTimer = setTimeout(() => {
                if (!seek.matches(':active') && !controls.matches(':hover')) {
                    player.classList.add('controls-hidden');
                }
            }, 2500);
        }
    };

    playButton.addEventListener('click', togglePlayback);
    centerPlay.addEventListener('click', togglePlayback);
    video.addEventListener('click', togglePlayback);
    const applyPendingResume = () => {
        if (window._pendingResumeTime > 0 && Number.isFinite(video.duration) && window._pendingResumeTime < Math.max(video.duration - 5, 1)) {
            try {
                video.currentTime = window._pendingResumeTime;
                currentTime.textContent = _milkboxFormatTime(video.currentTime);
            } catch {}
            window._pendingResumeTime = 0;
        }
    };
    video.addEventListener('play', updatePlayState);
    video.addEventListener('pause', () => {
        updatePlayState();
        if (typeof window.onMilkboxVideoTimeUpdate === 'function') {
            window.onMilkboxVideoTimeUpdate(video.currentTime, video.duration, true);
        }
    });
    video.addEventListener('loadedmetadata', () => {
        duration.textContent = _milkboxFormatTime(video.duration);
        loading.hidden = true;
        applyPendingResume();
    });
    video.addEventListener('durationchange', () => {
        duration.textContent = _milkboxFormatTime(video.duration);
    });
    video.addEventListener('progress', () => {
        if (seekLoaded && video.buffered.length > 0 && video.duration) {
            const pct = (video.buffered.end(video.buffered.length - 1) / video.duration) * 100;
            seekLoaded.style.width = `${pct}%`;
        }
    });
    video.addEventListener('timeupdate', () => {
        currentTime.textContent = _milkboxFormatTime(video.currentTime);
        if (Number.isFinite(video.duration) && video.duration > 0 && !seek.matches(':active')) {
            const pct = (video.currentTime / video.duration) * 100;
            seek.value = String(Math.round(pct * 10));
            seek.style.setProperty('--milkbox-progress', `${pct}%`);
            if (seekProgress) seekProgress.style.width = `${pct}%`;
        }
        if (typeof window.onMilkboxVideoTimeUpdate === 'function') {
            window.onMilkboxVideoTimeUpdate(video.currentTime, video.duration);
        }
    });
    video.addEventListener('seeked', () => {
        if (typeof window.onMilkboxVideoTimeUpdate === 'function') {
            window.onMilkboxVideoTimeUpdate(video.currentTime, video.duration, true);
        }
    });
    video.addEventListener('waiting', () => { loading.hidden = false; });
    video.addEventListener('playing', () => { loading.hidden = true; });
    video.addEventListener('canplay', () => {
        loading.hidden = true;
        applyPendingResume();
    });
    video.addEventListener('error', () => {
        showPlaybackError('This video could not be played. Check the source URL or try another playback server.');
    });
    video.addEventListener('ended', () => {
        updatePlayState();
        player.classList.remove('controls-hidden');
        if (typeof window.onMilkboxVideoTimeUpdate === 'function') {
            window.onMilkboxVideoTimeUpdate(video.currentTime, video.duration, true);
        }
    });
    seek.addEventListener('input', () => {
        if (Number.isFinite(video.duration)) {
            const percent = Number(seek.value) / 1000;
            video.currentTime = percent * video.duration;
            seek.style.setProperty('--milkbox-progress', `${percent * 100}%`);
            if (seekProgress) seekProgress.style.width = `${percent * 100}%`;
            currentTime.textContent = _milkboxFormatTime(video.currentTime);
        }
    });
    volume.addEventListener('input', () => {
        video.volume = Number(volume.value);
        video.muted = video.volume === 0;
    });
    volumeButton.addEventListener('click', () => { video.muted = !video.muted; });
    const updateVolumeState = () => {
        const icon = volumeButton.querySelector('span');
        icon.textContent = video.muted || video.volume === 0
            ? 'volume_off'
            : video.volume < 0.5 ? 'volume_down' : 'volume_up';
        volumeButton.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
        if (!video.muted) volume.value = String(video.volume);
    };
    video.addEventListener('volumechange', updateVolumeState);
    speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); });
    fullscreenButton.addEventListener('click', async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await player.requestFullscreen();
        } catch {
            showPlaybackError('Fullscreen is not available in this browser.');
        }
    });
    player.addEventListener('fullscreenchange', () => {
        const fullscreen = document.fullscreenElement === player;
        fullscreenButton.querySelector('span').textContent = fullscreen ? 'fullscreen_exit' : 'fullscreen';
        fullscreenButton.setAttribute('aria-label', fullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
    });
    pictureInPictureButton.addEventListener('click', async () => {
        if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) return;
        try {
            if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
            else await video.requestPictureInPicture();
        } catch {
            showPlaybackError('Picture-in-picture is not available for this video.');
        }
    });
    player.addEventListener('pointermove', showControls);
    player.addEventListener('pointerleave', () => {
        if (!video.paused) player.classList.add('controls-hidden');
    });
    player.addEventListener('keydown', (event) => {
        if (event.target.matches('input, select, button')) return;
        if (event.key === ' ' || event.key.toLowerCase() === 'k') {
            event.preventDefault();
            togglePlayback();
        } else if (event.key.toLowerCase() === 'f') {
            event.preventDefault();
            fullscreenButton.click();
        } else if (event.key.toLowerCase() === 'm') {
            event.preventDefault();
            volumeButton.click();
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + (event.key === 'ArrowRight' ? 10 : -10)));
        }
    });

    const updateHlsQualityOptions = (hls) => {
        if (!qualityLabel || !qualitySelect || !hls || !hls.levels) return;
        const levels = hls.levels;
        if (!levels || levels.length === 0) {
            qualityLabel.hidden = true;
            return;
        }
        qualityLabel.hidden = false;
        const prevVal = qualitySelect.value;
        qualitySelect.innerHTML = '';

        const autoOpt = document.createElement('option');
        autoOpt.value = '-1';
        const curLvl = hls.currentLevel >= 0 ? levels[hls.currentLevel] : null;
        autoOpt.textContent = curLvl && curLvl.height ? `Auto (${curLvl.height}p)` : 'Auto';
        autoOpt.selected = hls.autoLevelEnabled || hls.currentLevel === -1;
        qualitySelect.appendChild(autoOpt);

        const sorted = levels
            .map((lvl, index) => ({ lvl, index }))
            .sort((a, b) => (b.lvl.height || 0) - (a.lvl.height || 0));

        sorted.forEach(({ lvl, index }) => {
            const opt = document.createElement('option');
            opt.value = String(index);
            const height = lvl.height || Math.round((lvl.bitrate || 0) / 2500) || 720;
            opt.textContent = height >= 1080 ? `${height}p Ultra` : (height >= 720 ? `${height}p HD` : `${height}p`);
            if (!hls.autoLevelEnabled && hls.currentLevel === index) {
                opt.selected = true;
            }
            qualitySelect.appendChild(opt);
        });

        if (prevVal && Array.from(qualitySelect.options).some(o => o.value === prevVal)) {
            qualitySelect.value = prevVal;
        }
    };

    if (qualitySelect) {
        qualitySelect.addEventListener('change', () => {
            if (!video._hls) return;
            const val = parseInt(qualitySelect.value, 10);
            video._hls.currentLevel = val;
            const chosen = qualitySelect.options[qualitySelect.selectedIndex]?.textContent || 'Auto';
            if (typeof toast === 'function') toast(`Quality: ${chosen}`, 'success');
        });
    }

    if (serverLabel && serverSelect && extraOptions && Array.isArray(extraOptions.servers) && extraOptions.servers.length > 0) {
        serverLabel.hidden = false;
        serverSelect.innerHTML = '';
        extraOptions.servers.forEach((srv, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = srv.serverLabel || srv.providerName || `Server ${idx + 1}`;
            if (idx === (extraOptions.activeServerIndex || 0) || srv.id === extraOptions.activeServerId) {
                opt.selected = true;
            }
            serverSelect.appendChild(opt);
        });

        serverSelect.addEventListener('change', () => {
            const idx = parseInt(serverSelect.value, 10);
            const srv = extraOptions.servers[idx];
            if (!srv) return;
            const newUrl = srv.proxiedUrl || srv.url;
            if (!newUrl) return;

            const resumePos = Number.isFinite(video.currentTime) ? video.currentTime : 0;
            const wasPaused = video.paused;
            loading.hidden = false;

            if (video._hls) {
                video._hls.loadSource(newUrl);
                const onParsed = () => {
                    video._hls.off(window.Hls.Events.MANIFEST_PARSED, onParsed);
                    loading.hidden = true;
                    updateHlsQualityOptions(video._hls);
                    if (resumePos > 0) {
                        try { video.currentTime = resumePos; } catch {}
                    }
                    if (!wasPaused) video.play().catch(() => {});
                };
                video._hls.on(window.Hls.Events.MANIFEST_PARSED, onParsed);
            } else {
                video.src = newUrl;
                if (resumePos > 0) {
                    try { video.currentTime = resumePos; } catch {}
                }
                if (!wasPaused) video.play().catch(() => {});
            }

            if (typeof extraOptions.onServerChange === 'function') {
                extraOptions.onServerChange(srv, idx);
            }
            if (typeof toast === 'function') {
                toast(`Switched to ${srv.serverLabel || srv.providerName || `Server ${idx + 1}`}`, 'success');
            }
        });
    }

    if (sourceUrl) {
        const isHls = sourceUrl.includes('.m3u8') || sourceUrl.includes('/api/x8rr/proxy') || sourceUrl.includes('/api/proxy') || sourceUrl.includes('mpegurl');
        if (isHls && window.Hls && window.Hls.isSupported()) {
            if (video._hls) {
                try { video._hls.destroy(); } catch {}
                video._hls = null;
            }
            const hls = new window.Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90
            });
            hls.loadSource(sourceUrl);
            hls.attachMedia(video);
            hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                loading.hidden = true;
                updateHlsQualityOptions(hls);
                video.play().catch(() => {});
            });
            hls.on(window.Hls.Events.LEVEL_SWITCHED, (_event, data) => {
                if (hls.autoLevelEnabled && qualitySelect) {
                    const autoOpt = qualitySelect.querySelector('option[value="-1"]');
                    if (autoOpt && hls.levels[data.level]?.height) {
                        autoOpt.textContent = `Auto (${hls.levels[data.level].height}p)`;
                    }
                }
            });
            hls.on(window.Hls.Events.ERROR, (_event, data) => {
                if (data && data.fatal) {
                    switch (data.type) {
                        case window.Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case window.Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            showPlaybackError('HLS playback encountered an unrecoverable error.');
                            hls.destroy();
                            break;
                    }
                }
            });
            video._hls = hls;
        } else {
            video.src = sourceUrl;
        }
    }
    updateTrackSelectors();
    updatePlayState();
    updateVolumeState();
}

function createCustomVideoPlayer(container, sourceUrl, titleText, subtitleText, extraOptions) {
    if (!container) return;
    stopCustomVideoPlayer(container);
    const normalizedSource = _milkboxNormalizeVideoSource(sourceUrl);
    _milkboxCreateNativePlayer(container, normalizedSource, titleText, subtitleText, extraOptions);
    if (!normalizedSource) {
        const error = container.querySelector('.milkbox-player-error');
        if (error) {
            error.textContent = 'Use a direct video file URL (MP4, WebM, Ogg, or HLS) or upload a video file.';
            error.hidden = false;
            container.querySelector('.milkbox-player-loading').hidden = true;
        }
    }
}

async function _milkboxResolvePlayback(options = {}) {
    const { id, idType = 'tmdb', type, season = 1, episode = 1 } = options;
    if (id === undefined || id === null || !String(id).trim()) throw new TypeError('A TMDB or IMDb ID is required.');
    if (idType !== 'tmdb' && idType !== 'imdb') throw new TypeError('idType must be "tmdb" or "imdb".');
    if (type !== 'movie' && type !== 'tv') throw new TypeError('type must be "movie" or "tv".');
    const normalizedId = String(id).trim();
    if (idType === 'tmdb' && !/^[1-9]\d*$/.test(normalizedId)) throw new TypeError('TMDB IDs must be positive integers.');
    if (idType === 'imdb' && !/^tt\d{5,}$/i.test(normalizedId)) throw new TypeError('IMDb IDs must use the tt1234567 format.');
    const positiveInteger = (value, name) => {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1) throw new TypeError(`${name} must be a positive integer.`);
        return number;
    };
    const seasonNumber = type === 'tv' ? positiveInteger(season, 'season') : 1;
    const episodeNumber = type === 'tv' ? positiveInteger(episode, 'episode') : 1;
    const query = new URLSearchParams({
        id: idType === 'imdb' ? normalizedId.toLowerCase() : normalizedId,
        idType,
        type,
        season: String(seasonNumber),
        episode: String(episodeNumber)
    });
    const response = await fetch(`/api/playback/resolve?${query}`, {
        headers: { Accept: 'application/json' }
    });
    const text = await response.text();
    let result = null;
    try {
        if (text && !text.trim().startsWith('<')) {
            result = JSON.parse(text);
        }
    } catch {}
    if (!response.ok || !result) {
        throw new Error((result && result.error) || `Playback lookup failed (${response.status}).`);
    }
    if (typeof result.url !== 'string' || !result.url) throw new Error('The playback API did not return a playable URL.');
    return result;
}

async function _milkboxEmbed(options = {}) {
    const target = typeof options.target === 'string'
        ? document.querySelector(options.target)
        : options.target;
    if (!target || typeof target.replaceChildren !== 'function') {
        throw new TypeError('target must be an element or a selector for an element.');
    }
    const playback = await _milkboxResolvePlayback(options);
    const title = options.title || playback.title || `${options.type === 'tv' ? 'Series' : 'Movie'} player`;
    const subtitle = options.type === 'tv' ? `Season ${options.season || 1} • Episode ${options.episode || 1}` : '';
    createCustomVideoPlayer(target, playback.url, title, subtitle);
    return target.querySelector('.milkbox-player');
}

if (typeof window !== 'undefined') {
    window.MilkboxPlayer = Object.freeze({
        embed: _milkboxEmbed,
        resolvePlayback: _milkboxResolvePlayback
    });
}
