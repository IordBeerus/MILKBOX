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

function _milkboxCreateNativePlayer(container, sourceUrl, titleText, subtitleText, extraOptions) {
    const player = document.createElement('section');
    player.className = 'milkbox-player';
    player.tabIndex = 0;
    player.setAttribute('aria-label', `Video player: ${titleText || 'Now playing'}`);

    const video = document.createElement('video');
    video.className = 'milkbox-player-video';
    video.preload = 'metadata';
    video.playsInline = true;
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
    player.append(video, loading, error, centerPlay, controls);
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
    subtitleTrackSelect.addEventListener('change', () => {
        const selectedIndex = subtitleTrackSelect.value === 'off' ? -1 : Number(subtitleTrackSelect.value);
        Array.from(video.textTracks || []).forEach((track, index) => {
            if (['subtitles', 'captions'].includes(track.kind)) track.mode = index === selectedIndex ? 'showing' : 'disabled';
        });
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
