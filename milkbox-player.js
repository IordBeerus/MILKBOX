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

function _milkboxFormatShortServerLabel(label, idx) {
    if (!label) return `S${idx + 1}`;
    const match = label.match(/Server\s*(\d+)\s*\(([^()·]+)/i);
    if (match) {
        return `S${match[1]}: ${match[2].trim()}`;
    }
    const altMatch = label.match(/Server\s*(\d+)/i);
    if (altMatch && label.includes('(')) {
        const inner = label.split('(')[1].split(/[)·]/)[0].trim();
        if (inner) return `S${altMatch[1]}: ${inner}`;
    }
    if (label.length > 14) {
        return label.slice(0, 13) + '…';
    }
    return label;
}

function _milkboxSetupCustomDropdown(dropdownEl, actions = {}) {
    if (!dropdownEl || dropdownEl._mbDropdownInitialized) return;
    dropdownEl._mbDropdownInitialized = true;

    const triggerBtn = dropdownEl.querySelector('.milkbox-custom-dropdown-trigger');
    const menuEl = dropdownEl.querySelector('.milkbox-custom-dropdown-menu');
    const listEl = dropdownEl.querySelector('.milkbox-custom-dropdown-list');
    const valEl = dropdownEl.querySelector('.milkbox-custom-dropdown-val');
    const selectEl = dropdownEl.querySelector('select');
    const searchInput = dropdownEl.querySelector('.milkbox-custom-dropdown-search');
    const searchWrap = dropdownEl.querySelector('.milkbox-custom-dropdown-search-wrap');
    const footerSearchSubs = dropdownEl.querySelector('.milkbox-footer-search-subs');
    const footerSubStyle = dropdownEl.querySelector('.milkbox-footer-sub-style');

    if (!triggerBtn || !menuEl || !listEl || !selectEl) return;

    let filterText = '';

    const renderList = () => {
        const options = Array.from(selectEl.options || []);
        if (options.length === 0) {
            listEl.innerHTML = '<div style="padding: 10px 12px; color: rgba(255,255,255,0.4); font-size: 11px; text-align: center;">No options available</div>';
            if (valEl) valEl.textContent = 'None';
            return;
        }

        const selectedOpt = (selectEl.selectedIndex >= 0 ? selectEl.options[selectEl.selectedIndex] : null) || options[0];
        if (valEl) {
            valEl.textContent = selectedOpt ? (selectedOpt.textContent || selectedOpt.value) : 'Select';
            if (selectedOpt && selectedOpt.title) {
                triggerBtn.title = selectedOpt.title;
            }
        }

        if (searchWrap) {
            searchWrap.hidden = options.length <= 6;
        }

        let filtered = options;
        if (filterText) {
            const q = filterText.toLowerCase().trim();
            filtered = options.filter(opt => (opt.textContent || '').toLowerCase().includes(q));
        }

        if (filtered.length === 0) {
            listEl.innerHTML = '<div style="padding: 10px 12px; color: rgba(255,255,255,0.4); font-size: 11px; text-align: center;">No matching options</div>';
            return;
        }

        listEl.innerHTML = '';
        filtered.forEach(opt => {
            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'milkbox-custom-dropdown-item';
            const isSelected = opt === selectedOpt || opt.value === selectEl.value;
            if (isSelected) itemBtn.classList.add('is-selected');

            itemBtn.innerHTML = `
                <span class="milkbox-custom-dropdown-item-label">${_milkboxEscapeHtml(opt.textContent || opt.value)}</span>
                <span class="material-symbols-outlined milkbox-custom-dropdown-item-check" aria-hidden="true">check</span>
            `;

            itemBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEl.value = opt.value;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                closeMenu();
                renderList();
            });

            listEl.appendChild(itemBtn);
        });
    };

    const openMenu = () => {
        const player = dropdownEl.closest('.milkbox-player');
        if (player) {
            player.querySelectorAll('.milkbox-custom-dropdown').forEach(d => {
                if (d !== dropdownEl) {
                    d.classList.remove('is-open');
                    const m = d.querySelector('.milkbox-custom-dropdown-menu');
                    if (m) m.hidden = true;
                }
            });
            const settingsMenu = player.querySelector('.milkbox-player-settings-menu');
            if (settingsMenu) settingsMenu.hidden = true;
        }

        renderList();
        menuEl.hidden = false;
        dropdownEl.classList.add('is-open');
        triggerBtn.setAttribute('aria-expanded', 'true');
        if (searchInput && !searchWrap?.hidden) {
            setTimeout(() => searchInput.focus(), 50);
        }
    };

    const closeMenu = () => {
        menuEl.hidden = true;
        dropdownEl.classList.remove('is-open');
        triggerBtn.setAttribute('aria-expanded', 'false');
        if (searchInput) {
            searchInput.value = '';
            filterText = '';
        }
    };

    triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menuEl.hidden) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterText = e.target.value;
            renderList();
        });
        searchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    if (footerSearchSubs) {
        footerSearchSubs.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMenu();
            if (actions.searchSubsBtn) {
                actions.searchSubsBtn.click();
            } else {
                const btn = dropdownEl.closest('.milkbox-player')?.querySelector('.milkbox-menu-search-subs');
                if (btn) btn.click();
            }
        });
    }

    if (footerSubStyle) {
        footerSubStyle.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMenu();
            if (actions.subStyleBtn) {
                actions.subStyleBtn.click();
            } else {
                const btn = dropdownEl.closest('.milkbox-player')?.querySelector('.milkbox-menu-sub-style');
                if (btn) btn.click();
            }
        });
    }

    selectEl.addEventListener('change', () => {
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        if (valEl && selectedOpt) {
            valEl.textContent = selectedOpt.textContent || selectedOpt.value;
        }
        renderList();
    });

    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => {
            renderList();
        });
        observer.observe(selectEl, { childList: true, subtree: true });
    }

    renderList();

    document.addEventListener('click', (e) => {
        if (!dropdownEl.contains(e.target)) {
            closeMenu();
        }
    });

    dropdownEl._syncCustomDropdown = renderList;
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
    const clean = _milkboxFixSubtitleMojibake(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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

const _MILKBOX_CP1252_MAP = {
    '\u20AC': '\x80', '\u201A': '\x82', '\u0192': '\x83', '\u201E': '\x84',
    '\u2026': '\x85', '\u2020': '\x86', '\u2021': '\x87', '\u02C6': '\x88',
    '\u2030': '\x89', '\u0160': '\x8A', '\u2039': '\x8B', '\u0152': '\x8C',
    '\u017D': '\x8E', '\u2018': '\x91', '\u2019': '\x92', '\u201C': '\x93',
    '\u201D': '\x94', '\u2022': '\x95', '\u2013': '\x96', '\u2014': '\x97',
    '\u02DC': '\x98', '\u2122': '\x99', '\u0161': '\x9A', '\u203A': '\x9B',
    '\u0153': '\x9C', '\u017E': '\x9E', '\u0178': '\x9F'
};

const _MILKBOX_MOJIBAKE_MAP = [
    [/PokÃ©mon/g, 'Pokémon'],
    [/pokÃ©mon/g, 'pokémon'],
    [/PokÃ©/g, 'Poké'],
    [/pokÃ©/g, 'poké'],
    [/â€™/g, '’'], [/â€˜/g, '‘'], [/â€œ/g, '“'], [/â€\u009d/g, '”'], [/â€/g, '”'],
    [/â€”/g, '—'], [/â€“/g, '–'], [/â€¦/g, '…'], [/â€¢/g, '•'], [/â„¢/g, '™'],
    [/â™ª/g, '♪'], [/â™«/g, '♫'], [/Â♪/g, '♪'], [/Â♫/g, '♫'],
    [/Â¿/g, '¿'], [/Â¡/g, '¡'], [/Â«/g, '«'], [/Â»/g, '»'],
    [/Â°/g, '°'], [/Â±/g, '±'], [/Â©/g, '©'], [/Â®/g, '®'],
    [/Ã©/g, 'é'], [/Ã¨/g, 'è'], [/Ãª/g, 'ê'], [/Ã«/g, 'ë'],
    [/Ã¡/g, 'á'], [/Ã /g, 'à'], [/Ã¢/g, 'â'], [/Ã¤/g, 'ä'], [/Ã£/g, 'ã'], [/Ã¥/g, 'å'],
    [/Ã­/g, 'í'], [/Ã¬/g, 'ì'], [/Ã®/g, 'î'], [/Ã¯/g, 'ï'],
    [/Ã³/g, 'ó'], [/Ã²/g, 'ò'], [/Ã´/g, 'ô'], [/Ã¶/g, 'ö'], [/Ãµ/g, 'õ'], [/Ã¸/g, 'ø'],
    [/Ãº/g, 'ú'], [/Ã¹/g, 'ù'], [/Ã»/g, 'û'], [/Ã¼/g, 'ü'],
    [/Ã½/g, 'ý'], [/Ã¿/g, 'ÿ'], [/Ã±/g, 'ñ'], [/Ã§/g, 'ç'],
    [/Ã‰/g, 'É'], [/Ãˆ/g, 'È'], [/ÃŠ/g, 'Ê'], [/Ã‹/g, 'Ë'],
    [/Ã\u0081/g, 'Á'], [/Ã\u0080/g, 'À'], [/Ã\u0082/g, 'Â'], [/Ã\u0084/g, 'Ä'],
    [/Ã\u008D/g, 'Í'], [/Ã\u008C/g, 'Ì'], [/Ã\u008E/g, 'Î'], [/Ã\u008F/g, 'Ï'],
    [/Ã\u0093/g, 'Ó'], [/Ã\u0092/g, 'Ò'], [/Ã\u0094/g, 'Ô'], [/Ã\u0096/g, 'Ö'],
    [/Ã\u009A/g, 'Ú'], [/Ã\u0099/g, 'Ù'], [/Ã\u009B/g, 'Û'], [/Ã\u009C/g, 'Ü'],
    [/Ã\u0091/g, 'Ñ'], [/Ã\u0087/g, 'Ç'],
    [/Â(?=[\x20-\x7E])/g, '']
];

function _milkboxFixSubtitleMojibake(text) {
    if (!text || typeof text !== 'string') return text || '';
    if (!/[ÃÂâ][\u0080-\u00FF\u2000-\u2122]|\uFFFD|PokÃ©/i.test(text)) {
        return text;
    }

    let normalized = text;
    for (const [k, v] of Object.entries(_MILKBOX_CP1252_MAP)) {
        if (normalized.includes(k)) {
            normalized = normalized.split(k).join(v);
        }
    }

    const utf8Regex = /(?:[\xC2-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF4][\x80-\xBF]{3})+/g;
    let repaired = normalized.replace(utf8Regex, (match) => {
        try {
            const bytes = new Uint8Array(match.length);
            for (let i = 0; i < match.length; i++) {
                bytes[i] = match.charCodeAt(i) & 0xFF;
            }
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
            return match;
        }
    });

    for (const [regex, rep] of _MILKBOX_MOJIBAKE_MAP) {
        repaired = repaired.replace(regex, rep);
    }

    return repaired;
}

function _milkboxCleanSubtitleHtml(raw) {
    if (!raw) return '';
    let s = _milkboxFixSubtitleMojibake(raw);
    s = s.replace(/\{[^}]+\}/g, '').trim();
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
                    <button class="milkbox-player-button milkbox-player-prev-ep" type="button" aria-label="Previous Episode" title="Previous Episode" hidden>
                        <span class="material-symbols-outlined" aria-hidden="true">skip_previous</span>
                    </button>
                    <button class="milkbox-player-button milkbox-player-skip-back" type="button" aria-label="Rewind 10 seconds" title="Rewind 10s (←)">
                        <span class="material-symbols-outlined" aria-hidden="true">replay_10</span>
                    </button>
                    <button class="milkbox-player-button milkbox-player-skip-fwd" type="button" aria-label="Forward 10 seconds" title="Forward 10s (→)">
                        <span class="material-symbols-outlined" aria-hidden="true">forward_10</span>
                    </button>
                    <button class="milkbox-player-button milkbox-player-next-ep" type="button" aria-label="Next Episode" title="Next Episode" hidden>
                        <span class="material-symbols-outlined" aria-hidden="true">skip_next</span>
                    </button>

                    <div class="milkbox-player-vol-wrap">
                        <button class="milkbox-player-button milkbox-player-volume-button" type="button" aria-label="Mute" title="Mute (M)">
                            <span class="material-symbols-outlined" aria-hidden="true">volume_up</span>
                        </button>
                        <input class="milkbox-player-volume" type="range" min="0" max="1" value="1" step="0.05" aria-label="Volume">
                        <button class="milkbox-player-boost-button" type="button" aria-label="Audio Boost" title="Audio Boost: Click to cycle boost level">
                            <span class="material-symbols-outlined" style="font-size:13px;">bolt</span>
                            <span class="milkbox-player-boost-text">250%</span>
                        </button>
                    </div>

                    <div class="milkbox-player-time" aria-live="off">
                        <span class="milkbox-player-current">0:00</span>
                        <span class="milkbox-player-time-sep">/</span>
                        <span class="milkbox-player-duration">0:00</span>
                    </div>
                </div>

                <div class="milkbox-player-control-group milkbox-player-right-group">
                    <button class="milkbox-player-episodes-btn" type="button" aria-label="Episodes" title="Episode Selector" hidden>
                        <span class="material-symbols-outlined" style="font-size:16px; color:#ff6b8b;">video_library</span>
                        <span class="milkbox-player-episodes-btn-text">Episodes</span>
                    </button>

                    <div class="milkbox-player-track-selects">
                        <div class="milkbox-custom-dropdown milkbox-player-server-label" hidden title="Select Stream Server">
                            <button class="milkbox-custom-dropdown-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" title="Stream Server">
                                <span class="material-symbols-outlined milkbox-custom-dropdown-icon">dns</span>
                                <span class="milkbox-custom-dropdown-val">Server</span>
                                <span class="material-symbols-outlined milkbox-custom-dropdown-arrow">expand_more</span>
                            </button>
                            <div class="milkbox-custom-dropdown-menu" hidden>
                                <div class="milkbox-custom-dropdown-header">Stream Server</div>
                                <div class="milkbox-custom-dropdown-list" role="listbox"></div>
                            </div>
                            <select class="milkbox-player-server-select" hidden aria-label="Stream server"></select>
                        </div>

                        <div class="milkbox-custom-dropdown milkbox-player-quality-label" hidden title="Select Stream Quality">
                            <button class="milkbox-custom-dropdown-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" title="Stream Quality">
                                <span class="material-symbols-outlined milkbox-custom-dropdown-icon">high_quality</span>
                                <span class="milkbox-custom-dropdown-val">Auto</span>
                                <span class="material-symbols-outlined milkbox-custom-dropdown-arrow">expand_more</span>
                            </button>
                            <div class="milkbox-custom-dropdown-menu" hidden>
                                <div class="milkbox-custom-dropdown-header">Playback Quality</div>
                                <div class="milkbox-custom-dropdown-list" role="listbox"></div>
                            </div>
                            <select class="milkbox-player-quality-select" hidden aria-label="Playback quality">
                                <option value="-1" selected>Auto</option>
                            </select>
                        </div>

                        <div class="milkbox-custom-dropdown milkbox-player-audio-label" hidden title="Audio Track">
                            <button class="milkbox-custom-dropdown-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" title="Audio Track">
                                <span class="material-symbols-outlined milkbox-custom-dropdown-icon">audiotrack</span>
                                <span class="milkbox-custom-dropdown-val">Audio</span>
                                <span class="material-symbols-outlined milkbox-custom-dropdown-arrow">expand_more</span>
                            </button>
                            <div class="milkbox-custom-dropdown-menu" hidden>
                                <div class="milkbox-custom-dropdown-header">Audio Track</div>
                                <div class="milkbox-custom-dropdown-list" role="listbox"></div>
                            </div>
                            <select class="milkbox-player-audio-track" hidden aria-label="Audio track"></select>
                        </div>

                        <div class="milkbox-custom-dropdown milkbox-player-subtitle-label" hidden title="Subtitles">
                            <button class="milkbox-custom-dropdown-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" title="Subtitles & Captions">
                                <span class="material-symbols-outlined milkbox-custom-dropdown-icon">subtitles</span>
                                <span class="milkbox-custom-dropdown-val">Off</span>
                                <span class="material-symbols-outlined milkbox-custom-dropdown-arrow">expand_more</span>
                            </button>
                            <div class="milkbox-custom-dropdown-menu milkbox-dropdown-subtitles-menu" hidden>
                                <div class="milkbox-custom-dropdown-header">Subtitles & Captions</div>
                                <div class="milkbox-custom-dropdown-search-wrap" hidden>
                                    <span class="material-symbols-outlined" style="font-size:14px; opacity:0.6;">search</span>
                                    <input class="milkbox-custom-dropdown-search" type="search" placeholder="Filter languages…" autocomplete="off">
                                </div>
                                <div class="milkbox-custom-dropdown-list" role="listbox"></div>
                                <div class="milkbox-custom-dropdown-footer">
                                    <button class="milkbox-dropdown-footer-btn milkbox-footer-search-subs" type="button">
                                        <span class="material-symbols-outlined" style="font-size:14px; color:#ff6b8b;">manage_search</span>
                                        <span>Search Online Subtitles…</span>
                                    </button>
                                    <button class="milkbox-dropdown-footer-btn milkbox-footer-sub-style" type="button">
                                        <span class="material-symbols-outlined" style="font-size:14px; color:#ff6b8b;">tune</span>
                                        <span>Subtitle Appearance…</span>
                                    </button>
                                </div>
                            </div>
                            <select class="milkbox-player-subtitle-track" hidden aria-label="Subtitle track"></select>
                        </div>
                    </div>

                    <div class="milkbox-player-settings-wrap">
                        <button class="milkbox-player-button milkbox-player-settings-btn" type="button" aria-label="Playback Settings" title="Playback Settings (Speed, Audio Boost, Subtitles)">
                            <span class="material-symbols-outlined" aria-hidden="true">settings</span>
                        </button>
                        <div class="milkbox-player-settings-menu" hidden>
                            <div class="milkbox-settings-section">
                                <div class="milkbox-settings-section-title">
                                    <span class="material-symbols-outlined" style="font-size:14px;">speed</span>
                                    <span>Playback Speed</span>
                                </div>
                                <div class="milkbox-settings-pills-row milkbox-speed-pills">
                                    <button class="milkbox-settings-pill-btn" data-speed="0.5" type="button">0.5×</button>
                                    <button class="milkbox-settings-pill-btn" data-speed="0.75" type="button">0.75×</button>
                                    <button class="milkbox-settings-pill-btn is-active" data-speed="1" type="button">1.0×</button>
                                    <button class="milkbox-settings-pill-btn" data-speed="1.25" type="button">1.25×</button>
                                    <button class="milkbox-settings-pill-btn" data-speed="1.5" type="button">1.5×</button>
                                    <button class="milkbox-settings-pill-btn" data-speed="2" type="button">2.0×</button>
                                </div>
                            </div>
                            <div class="milkbox-settings-section">
                                <div class="milkbox-settings-section-title">
                                    <span class="material-symbols-outlined" style="font-size:14px;">bolt</span>
                                    <span>Audio Boost</span>
                                </div>
                                <div class="milkbox-settings-pills-row milkbox-boost-pills">
                                    <button class="milkbox-settings-pill-btn" data-boost="1.0" type="button">100%</button>
                                    <button class="milkbox-settings-pill-btn" data-boost="1.75" type="button">175%</button>
                                    <button class="milkbox-settings-pill-btn is-active" data-boost="2.5" type="button">250%</button>
                                    <button class="milkbox-settings-pill-btn" data-boost="3.0" type="button">300%</button>
                                </div>
                            </div>
                            <div class="milkbox-settings-section">
                                <div class="milkbox-settings-section-title">
                                    <span class="material-symbols-outlined" style="font-size:14px;">subtitles</span>
                                    <span>Subtitles & CC</span>
                                </div>
                                <div style="display:flex; flex-direction:column; gap:4px;">
                                    <button class="milkbox-settings-action-btn milkbox-menu-search-subs" type="button">
                                        <span style="display:flex; align-items:center; gap:6px;">
                                            <span class="material-symbols-outlined" style="font-size:16px; color:#ff6b8b;">manage_search</span>
                                            <span>Search Subtitles Online</span>
                                        </span>
                                        <span class="material-symbols-outlined" style="font-size:16px; opacity:0.6;">chevron_right</span>
                                    </button>
                                    <button class="milkbox-settings-action-btn milkbox-menu-sub-style" type="button">
                                        <span style="display:flex; align-items:center; gap:6px;">
                                            <span class="material-symbols-outlined" style="font-size:16px; color:#ff6b8b;">tune</span>
                                            <span>Subtitle Appearance</span>
                                        </span>
                                        <span class="material-symbols-outlined" style="font-size:16px; opacity:0.6;">chevron_right</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <select class="milkbox-player-speed" hidden aria-label="Playback speed">
                        <option value="0.5">0.5×</option>
                        <option value="0.75">0.75×</option>
                        <option value="1" selected>1.0×</option>
                        <option value="1.25">1.25×</option>
                        <option value="1.5">1.5×</option>
                        <option value="2">2.0×</option>
                    </select>

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
                <div style="display:flex; align-items:center; gap:8px;">
                    <button class="milkbox-modal-tab-switch milkbox-subs-to-style-btn" type="button" title="Subtitle Appearance">
                        <span class="material-symbols-outlined" style="font-size:14px; color:#ff6b8b;">tune</span>
                        <span>Appearance</span>
                    </button>
                    <button class="milkbox-player-modal-close" type="button" aria-label="Close">✕</button>
                </div>
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
                <div style="display:flex; align-items:center; gap:8px;">
                    <button class="milkbox-modal-tab-switch milkbox-style-to-search-btn" type="button" title="Search Online Subtitles">
                        <span class="material-symbols-outlined" style="font-size:14px; color:#ff6b8b;">manage_search</span>
                        <span>Search</span>
                    </button>
                    <button class="milkbox-player-modal-close" type="button" aria-label="Close">✕</button>
                </div>
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

    const episodesModal = document.createElement('div');
    episodesModal.className = 'milkbox-player-modal milkbox-player-episodes-modal';
    episodesModal.hidden = true;
    episodesModal.innerHTML = `
        <div class="milkbox-player-modal-backdrop"></div>
        <div class="milkbox-player-modal-content" style="max-width: 780px; width: 92%; max-height: 85vh; display: flex; flex-direction: column;">
            <div class="milkbox-player-modal-header">
                <div class="milkbox-player-modal-title-group">
                    <span class="material-symbols-outlined milkbox-player-modal-icon" style="color:var(--milkbox-accent, #ff2e63);">video_library</span>
                    <span class="milkbox-player-modal-title">Episode List</span>
                    <span class="milkbox-player-modal-badge">${_milkboxEscapeHtml(titleText || 'x8rr Movies')}</span>
                </div>
                <button class="milkbox-player-modal-close" type="button" aria-label="Close">✕</button>
            </div>
            <div class="milkbox-player-modal-body" style="display: flex; flex-direction: column; overflow: hidden; padding: 14px; gap: 12px; max-height: calc(85vh - 70px);">
                <div class="milkbox-ep-controls-bar">
                    <div class="milkbox-ep-season-wrap">
                        <label class="milkbox-ep-season-label">Season</label>
                        <div class="milkbox-custom-dropdown milkbox-ep-season-dropdown">
                            <button class="milkbox-custom-dropdown-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" title="Season">
                                <span class="milkbox-custom-dropdown-val">Season 1</span>
                                <span class="material-symbols-outlined milkbox-custom-dropdown-arrow">expand_more</span>
                            </button>
                            <div class="milkbox-custom-dropdown-menu" hidden>
                                <div class="milkbox-custom-dropdown-header">Select Season</div>
                                <div class="milkbox-custom-dropdown-list" role="listbox"></div>
                            </div>
                            <select class="milkbox-ep-season-select" hidden></select>
                        </div>
                    </div>
                    <div class="milkbox-ep-search-wrap">
                        <span class="material-symbols-outlined milkbox-ep-search-icon">search</span>
                        <input class="milkbox-ep-search-input" type="search" placeholder="Search episode by name or number…" autocomplete="off">
                    </div>
                    <span class="milkbox-ep-count-tag" style="font-size: 12px; color: #ffb6d8; font-weight: 600;"></span>
                </div>
                <div class="milkbox-ep-grid-container" style="flex: 1; overflow-y: auto; padding-right: 4px;">
                    <div class="milkbox-ep-loading-state" style="padding: 40px 16px; text-align: center; color: #aaa; font-size: 14px;">Loading episodes…</div>
                </div>
            </div>
        </div>
    `;

    const subtitlesOverlay = document.createElement('div');
    subtitlesOverlay.className = 'milkbox-subtitles-overlay';
    subtitlesOverlay.setAttribute('aria-live', 'polite');

    player.append(video, subtitlesOverlay, loading, error, centerPlay, controls, searchSubsModal, subStyleModal, episodesModal);
    container.replaceChildren(player);

    const playButton = controls.querySelector('.milkbox-player-play');
    const skipBackButton = controls.querySelector('.milkbox-player-skip-back');
    const skipFwdButton = controls.querySelector('.milkbox-player-skip-fwd');
    const prevEpBtn = controls.querySelector('.milkbox-player-prev-ep');
    const nextEpBtn = controls.querySelector('.milkbox-player-next-ep');
    const episodesBtn = controls.querySelector('.milkbox-player-episodes-btn');
    const epSeasonSelect = episodesModal.querySelector('.milkbox-ep-season-select');
    const epSearchInput = episodesModal.querySelector('.milkbox-ep-search-input');
    const epListContainer = episodesModal.querySelector('.milkbox-ep-grid-container');
    const epCountTag = episodesModal.querySelector('.milkbox-ep-count-tag');
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
    const searchSubsBtn = controls.querySelector('.milkbox-menu-search-subs') || controls.querySelector('.milkbox-player-search-subs');
    const subStyleBtn = controls.querySelector('.milkbox-menu-sub-style') || controls.querySelector('.milkbox-player-sub-style');
    const settingsBtn = controls.querySelector('.milkbox-player-settings-btn');
    const settingsMenu = controls.querySelector('.milkbox-player-settings-menu');
    const settingsWrap = controls.querySelector('.milkbox-player-settings-wrap');

    controls.querySelectorAll('.milkbox-custom-dropdown').forEach(dropdown => {
        _milkboxSetupCustomDropdown(dropdown, { searchSubsBtn, subStyleBtn });
    });
    episodesModal.querySelectorAll('.milkbox-custom-dropdown').forEach(dropdown => {
        _milkboxSetupCustomDropdown(dropdown);
    });

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
        select.closest?.('.milkbox-custom-dropdown')?._syncCustomDropdown?.();
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
            subtitleTrackSelect.closest?.('.milkbox-custom-dropdown')?._syncCustomDropdown?.();
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
            if (settingsMenu) settingsMenu.hidden = true;
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
            if (settingsMenu) settingsMenu.hidden = true;
            subStyleModal.hidden = false;
            searchSubsModal.hidden = true;
            updatePreviewAndStyles(_milkboxGetSubtitleStyles());
        });
    }

    searchSubsModal.querySelector('.milkbox-subs-to-style-btn')?.addEventListener('click', () => {
        searchSubsModal.hidden = true;
        subStyleModal.hidden = false;
        updatePreviewAndStyles(_milkboxGetSubtitleStyles());
    });

    subStyleModal.querySelector('.milkbox-style-to-search-btn')?.addEventListener('click', () => {
        subStyleModal.hidden = true;
        searchSubsModal.hidden = false;
        if (currentLoadedSubtitles.length === 0) {
            fetchSubtitlesFromApi();
        } else {
            renderSearchResults();
        }
    });

    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = settingsMenu.hidden;
            settingsMenu.hidden = !isHidden;
            if (!settingsMenu.hidden) {
                if (episodesModal) episodesModal.hidden = true;
                if (searchSubsModal) searchSubsModal.hidden = true;
                if (subStyleModal) subStyleModal.hidden = true;
                controls.querySelectorAll('.milkbox-custom-dropdown').forEach(d => {
                    d.classList.remove('is-open');
                    const m = d.querySelector('.milkbox-custom-dropdown-menu');
                    if (m) m.hidden = true;
                });
                controls.querySelectorAll('.milkbox-speed-pills .milkbox-settings-pill-btn').forEach(b => {
                    b.classList.toggle('is-active', Math.abs(parseFloat(b.dataset.speed) - (video.playbackRate || 1)) < 0.05);
                });
                controls.querySelectorAll('.milkbox-boost-pills .milkbox-settings-pill-btn').forEach(b => {
                    b.classList.toggle('is-active', Math.abs(parseFloat(b.dataset.boost) - currentBoostMultiplier) < 0.05);
                });
            }
        });

        document.addEventListener('click', (e) => {
            if (settingsWrap && !settingsWrap.contains(e.target) && !settingsMenu.hidden) {
                settingsMenu.hidden = true;
            }
        });
    }

    controls.querySelectorAll('.milkbox-speed-pills .milkbox-settings-pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rate = parseFloat(btn.dataset.speed);
            video.playbackRate = rate;
            controls.querySelectorAll('.milkbox-speed-pills .milkbox-settings-pill-btn').forEach(b => b.classList.toggle('is-active', b === btn));
            if (speed) speed.value = String(rate);
            if (typeof window.toast === 'function') window.toast(`Playback Speed: ${rate}×`, 'info');
        });
    });

    controls.querySelectorAll('.milkbox-boost-pills .milkbox-settings-pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentBoostMultiplier = parseFloat(btn.dataset.boost);
            localStorage.setItem('milkbox_audio_boost', String(currentBoostMultiplier));
            updateAudioGain();
            const pct = Math.round(currentBoostMultiplier * 100);
            if (typeof window.toast === 'function') {
                window.toast(`Audio Boost: ${pct}% ${pct > 100 ? '⚡ (Louder sound)' : '(Normal)'}`, 'info');
            }
        });
    });

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

    // -------------------------------------------------------------
    // Episode List & TV Playback Management
    // -------------------------------------------------------------
    const isTV = (extraOptions?.mediaType === 'tv') || (extraOptions?.type === 'tv');
    let currentSeasonNum = parseInt(extraOptions?.season || '1', 10) || 1;
    let currentEpisodeNum = parseInt(extraOptions?.episode || '1', 10) || 1;
    const tvTmdbId = extraOptions?.tmdbId || extraOptions?.id || '';
    const cachedSeasonEpisodes = new Map();
    let showSeasonsList = [];

    if (isTV && tvTmdbId) {
        if (episodesBtn) episodesBtn.hidden = false;
        if (prevEpBtn) prevEpBtn.hidden = currentEpisodeNum <= 1;
        if (nextEpBtn) nextEpBtn.hidden = false;
    }

    const renderEpisodesGrid = (episodes, filterText = '') => {
        if (!epListContainer) return;
        if (!episodes || !episodes.length) {
            epListContainer.innerHTML = '<div style="padding:32px; text-align:center; color:#888;">No episodes found.</div>';
            return;
        }

        const q = (filterText || '').toLowerCase().trim();
        const filtered = episodes.filter(ep => {
            if (!q) return true;
            const nameMatch = (ep.name || '').toLowerCase().includes(q);
            const numMatch = String(ep.episode_number).includes(q);
            const descMatch = (ep.overview || '').toLowerCase().includes(q);
            return nameMatch || numMatch || descMatch;
        });

        if (epCountTag) {
            epCountTag.textContent = `${filtered.length} Episode${filtered.length === 1 ? '' : 's'}`;
        }

        if (!filtered.length) {
            epListContainer.innerHTML = `<div style="padding:32px; text-align:center; color:#888;">No episodes match "${_milkboxEscapeHtml(q)}"</div>`;
            return;
        }

        epListContainer.innerHTML = `
            <div class="milkbox-ep-grid">
                ${filtered.map(ep => {
                    const epNum = ep.episode_number || 1;
                    const isActive = Number(ep.season_number) === Number(currentSeasonNum) && Number(epNum) === Number(currentEpisodeNum);
                    const epTitle = ep.name || `Episode ${epNum}`;
                    const thumb = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : '';
                    const dur = ep.runtime ? `${ep.runtime}m` : '';
                    const meta = [ep.air_date, dur].filter(Boolean).join(' • ');
                    return `
                        <div class="milkbox-ep-card ${isActive ? 'is-active' : ''}" data-season="${ep.season_number}" data-episode="${epNum}" tabindex="0" role="button">
                            <div class="milkbox-ep-thumb-wrap">
                                ${thumb ? `<img class="milkbox-ep-thumb" src="${_milkboxEscapeHtml(thumb)}" alt="${_milkboxEscapeHtml(epTitle)}" loading="lazy">` : `<div style="width:100%;height:100%;background:#1b1b26;display:flex;align-items:center;justify-content:center;color:#444;"><span class="material-symbols-outlined">movie</span></div>`}
                                <div class="milkbox-ep-num-pill">S${ep.season_number}:E${epNum}</div>
                                <div class="milkbox-ep-play-overlay">
                                    <span class="material-symbols-outlined">play_arrow</span>
                                </div>
                            </div>
                            <div class="milkbox-ep-info">
                                <div class="milkbox-ep-title">${_milkboxEscapeHtml(epTitle)}</div>
                                <div class="milkbox-ep-sub">${_milkboxEscapeHtml(meta)}</div>
                                ${ep.overview ? `<div class="milkbox-ep-desc">${_milkboxEscapeHtml(ep.overview)}</div>` : ''}
                                ${isActive ? `<div class="milkbox-ep-active-badge"><span class="material-symbols-outlined" style="font-size:12px;">play_arrow</span> Now Playing</div>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    };

    const loadSeasonEpisodesData = async (seasonNum) => {
        if (!epListContainer) return;
        if (cachedSeasonEpisodes.has(seasonNum)) {
            renderEpisodesGrid(cachedSeasonEpisodes.get(seasonNum), epSearchInput ? epSearchInput.value : '');
            return;
        }

        epListContainer.innerHTML = `<div class="milkbox-ep-loading-state" style="padding:40px 16px; text-align:center; color:#aaa; font-size:14px;">Loading Season ${seasonNum} episodes…</div>`;

        try {
            const res = await fetch(`/api/tmdb/tv/${encodeURIComponent(tvTmdbId)}/season/${encodeURIComponent(seasonNum)}`);
            if (res.ok) {
                const data = await res.json();
                const eps = Array.isArray(data.episodes) ? data.episodes : [];
                cachedSeasonEpisodes.set(seasonNum, eps);
                renderEpisodesGrid(eps, epSearchInput ? epSearchInput.value : '');
            } else {
                epListContainer.innerHTML = `<div style="padding:32px; text-align:center; color:#ff6b8b;">Could not load Season ${seasonNum} episodes.</div>`;
            }
        } catch (e) {
            epListContainer.innerHTML = `<div style="padding:32px; text-align:center; color:#ff6b8b;">Episode load error: ${_milkboxEscapeHtml(e.message)}</div>`;
        }
    };

    const loadShowSeasonsData = async () => {
        if (!tvTmdbId || !isTV) return;
        try {
            const res = await fetch(`/api/tmdb/tv/${encodeURIComponent(tvTmdbId)}`);
            if (res.ok) {
                const data = await res.json();
                showSeasonsList = (data.seasons || []).filter(s => s.season_number > 0);
                if (epSeasonSelect && showSeasonsList.length > 0) {
                    epSeasonSelect.innerHTML = showSeasonsList.map(s => `
                        <option value="${s.season_number}" ${s.season_number === currentSeasonNum ? 'selected' : ''}>
                            Season ${s.season_number} (${s.episode_count || '?'} eps)
                        </option>
                    `).join('');
                    epSeasonSelect.closest?.('.milkbox-custom-dropdown')?._syncCustomDropdown?.();
                }
            }
        } catch {}

        loadSeasonEpisodesData(currentSeasonNum);
    };

    if (epSeasonSelect) {
        epSeasonSelect.addEventListener('change', () => {
            const chosen = parseInt(epSeasonSelect.value, 10);
            if (!isNaN(chosen)) {
                if (epSearchInput) epSearchInput.value = '';
                loadSeasonEpisodesData(chosen);
            }
        });
    }

    if (epSearchInput) {
        epSearchInput.addEventListener('input', () => {
            const cur = epSeasonSelect ? parseInt(epSeasonSelect.value, 10) : currentSeasonNum;
            const eps = cachedSeasonEpisodes.get(cur) || [];
            renderEpisodesGrid(eps, epSearchInput.value);
        });
    }

    if (epListContainer) {
        epListContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.milkbox-ep-card');
            if (!card) return;
            const sNum = parseInt(card.dataset.season, 10) || currentSeasonNum;
            const eNum = parseInt(card.dataset.episode, 10);
            if (!isNaN(eNum)) {
                currentSeasonNum = sNum;
                currentEpisodeNum = eNum;
                episodesModal.hidden = true;
                if (prevEpBtn) prevEpBtn.hidden = currentEpisodeNum <= 1;
                if (typeof extraOptions?.onEpisodeSelect === 'function') {
                    extraOptions.onEpisodeSelect(sNum, eNum);
                }
            }
        });
    }

    if (episodesBtn) {
        episodesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            episodesModal.hidden = false;
            searchSubsModal.hidden = true;
            subStyleModal.hidden = true;
            if (showSeasonsList.length === 0) {
                loadShowSeasonsData();
            } else {
                loadSeasonEpisodesData(epSeasonSelect ? parseInt(epSeasonSelect.value, 10) : currentSeasonNum);
            }
        });
    }

    episodesModal.querySelectorAll('.milkbox-player-modal-close, .milkbox-player-modal-backdrop').forEach(el => {
        el.addEventListener('click', () => { episodesModal.hidden = true; });
    });

    if (prevEpBtn) {
        prevEpBtn.addEventListener('click', () => {
            if (currentEpisodeNum > 1 && typeof extraOptions?.onEpisodeSelect === 'function') {
                extraOptions.onEpisodeSelect(currentSeasonNum, currentEpisodeNum - 1);
            }
        });
    }

    if (nextEpBtn) {
        nextEpBtn.addEventListener('click', () => {
            if (typeof extraOptions?.onEpisodeSelect === 'function') {
                extraOptions.onEpisodeSelect(currentSeasonNum, currentEpisodeNum + 1);
            }
        });
    }

    video.addEventListener('ended', () => {
        if (isTV && typeof extraOptions?.onEpisodeSelect === 'function') {
            if (typeof toast === 'function') toast(`Up next: Episode ${currentEpisodeNum + 1}…`, 'info');
            setTimeout(() => {
                extraOptions.onEpisodeSelect(currentSeasonNum, currentEpisodeNum + 1);
            }, 1200);
        }
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
    const boostButton = controls.querySelector('.milkbox-player-boost-button');
    const boostText = controls.querySelector('.milkbox-player-boost-text');
    let currentBoostMultiplier = parseFloat(localStorage.getItem('milkbox_audio_boost') || '2.5');
    if (isNaN(currentBoostMultiplier) || currentBoostMultiplier < 1) currentBoostMultiplier = 2.5;

    const setupAudioBooster = () => {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            if (video._milkboxAudioBooster) return video._milkboxAudioBooster;

            const ctx = new AudioContextClass();
            const source = ctx.createMediaElementSource(video);
            const gain = ctx.createGain();
            const compressor = ctx.createDynamicsCompressor();

            compressor.threshold.setValueAtTime(-18, ctx.currentTime);
            compressor.knee.setValueAtTime(30, ctx.currentTime);
            compressor.ratio.setValueAtTime(12, ctx.currentTime);
            compressor.attack.setValueAtTime(0.003, ctx.currentTime);
            compressor.release.setValueAtTime(0.25, ctx.currentTime);

            source.connect(gain);
            gain.connect(compressor);
            compressor.connect(ctx.destination);

            const booster = { ctx, source, gain, compressor };
            video._milkboxAudioBooster = booster;

            const unlockAudio = () => {
                if (ctx.state === 'suspended') {
                    ctx.resume().catch(() => {});
                }
            };
            video.addEventListener('play', unlockAudio);
            video.addEventListener('playing', unlockAudio);
            video.addEventListener('volumechange', unlockAudio);
            unlockAudio();
            return booster;
        } catch (e) {
            console.warn('[milkbox-player] Web Audio setup notice:', e.message);
            return null;
        }
    };

    const updateAudioGain = () => {
        const booster = setupAudioBooster();
        const baseVol = video.muted ? 0 : video.volume;
        if (booster && booster.gain) {
            booster.gain.gain.setValueAtTime(baseVol * currentBoostMultiplier, booster.ctx.currentTime);
        }
        if (boostText) {
            boostText.textContent = `${Math.round(currentBoostMultiplier * 100)}%`;
            if (boostButton) {
                const isBoosted = currentBoostMultiplier > 1;
                boostButton.classList.toggle('is-boosted', isBoosted);
                boostButton.title = `Audio Boost: ${Math.round(currentBoostMultiplier * 100)}% (Click to switch 100%, 175%, 250%, 300%)`;
            }
        }
        controls.querySelectorAll('.milkbox-boost-pills .milkbox-settings-pill-btn').forEach(btn => {
            const val = parseFloat(btn.dataset.boost);
            btn.classList.toggle('is-active', Math.abs(val - currentBoostMultiplier) < 0.05);
        });
    };

    volume.addEventListener('input', () => {
        video.volume = Number(volume.value);
        video.muted = video.volume === 0;
        updateAudioGain();
    });
    volumeButton.addEventListener('click', () => {
        video.muted = !video.muted;
        updateAudioGain();
    });
    if (boostButton) {
        boostButton.addEventListener('click', () => {
            const levels = [1.0, 1.75, 2.5, 3.0];
            const currentIdx = levels.indexOf(currentBoostMultiplier);
            const nextIdx = (currentIdx + 1) % levels.length;
            currentBoostMultiplier = levels[nextIdx];
            localStorage.setItem('milkbox_audio_boost', String(currentBoostMultiplier));
            updateAudioGain();
            const pct = Math.round(currentBoostMultiplier * 100);
            if (typeof window.toast === 'function') {
                window.toast(`Audio Boost: ${pct}% ${pct > 100 ? '⚡ (Louder sound & dialog)' : '(Normal volume)'}`, 'info');
            }
        });
    }

    const updateVolumeState = () => {
        const icon = volumeButton.querySelector('span');
        icon.textContent = video.muted || video.volume === 0
            ? 'volume_off'
            : video.volume < 0.5 ? 'volume_down' : 'volume_up';
        volumeButton.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
        if (!video.muted) volume.value = String(video.volume);
        updateAudioGain();
    };
    video.addEventListener('volumechange', updateVolumeState);
    video.addEventListener('canplay', updateAudioGain);
    video.addEventListener('play', updateAudioGain);
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
        qualitySelect.closest?.('.milkbox-custom-dropdown')?._syncCustomDropdown?.();
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
            const fullLabel = srv.serverLabel || srv.providerName || `Server ${idx + 1}`;
            opt.textContent = _milkboxFormatShortServerLabel(fullLabel, idx);
            opt.title = fullLabel;
            if (idx === (extraOptions.activeServerIndex || 0) || srv.id === extraOptions.activeServerId) {
                opt.selected = true;
            }
            serverSelect.appendChild(opt);
        });
        serverSelect.closest?.('.milkbox-custom-dropdown')?._syncCustomDropdown?.();

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
                        qualitySelect.closest?.('.milkbox-custom-dropdown')?._syncCustomDropdown?.();
                    }
                }
            });
            let hlsNetFailCount = 0;
            hls.on(window.Hls.Events.ERROR, (_event, data) => {
                if (data && data.fatal) {
                    switch (data.type) {
                        case window.Hls.ErrorTypes.NETWORK_ERROR:
                            hlsNetFailCount++;
                            if (hlsNetFailCount > 1 && extraOptions && typeof extraOptions.onError === 'function') {
                                try { hls.destroy(); } catch {}
                                extraOptions.onError();
                                return;
                            }
                            hls.startLoad();
                            break;
                        case window.Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            if (extraOptions && typeof extraOptions.onError === 'function') {
                                try { hls.destroy(); } catch {}
                                extraOptions.onError();
                                return;
                            }
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
