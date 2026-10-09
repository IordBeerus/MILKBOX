// MILKBOX custom video player using Google Fonts Material Symbols
// Self-contained: no dependency on app.js globals at parse time.

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

function _milkboxCreateNativePlayer(container, sourceUrl, titleText, subtitleText) {
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

    const centerPlay = document.createElement('button');
    centerPlay.className = 'milkbox-player-center-play';
    centerPlay.type = 'button';
    centerPlay.setAttribute('aria-label', 'Play video');
    centerPlay.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>';

    const controls = document.createElement('div');
    controls.className = 'milkbox-player-controls';
    controls.innerHTML = `
        <input class="milkbox-player-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek">
        <div class="milkbox-player-control-row">
            <div class="milkbox-player-control-group">
                <button class="milkbox-player-button milkbox-player-play" type="button" aria-label="Play">
                    <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                </button>
                <span class="milkbox-player-time" aria-live="off"><span class="milkbox-player-current">0:00</span> / <span class="milkbox-player-duration">0:00</span></span>
            </div>
            <div class="milkbox-player-title" title="${_milkboxEscapeHtml(titleText || 'Now Playing')}">
                <strong>${_milkboxEscapeHtml(titleText || 'Now Playing')}</strong>
                <span>${_milkboxEscapeHtml(subtitleText || '')}</span>
            </div>
            <div class="milkbox-player-control-group milkbox-player-actions">
                <button class="milkbox-player-button milkbox-player-volume-button" type="button" aria-label="Mute">
                    <span class="material-symbols-outlined" aria-hidden="true">volume_up</span>
                </button>
                <input class="milkbox-player-volume" type="range" min="0" max="1" value="1" step="0.05" aria-label="Volume">
                <label class="milkbox-player-speed-label">
                    <span class="material-symbols-outlined" aria-hidden="true">speed</span>
                    <select class="milkbox-player-speed" aria-label="Playback speed">
                        <option value="0.5">0.5×</option><option value="0.75">0.75×</option>
                        <option value="1" selected>Normal</option><option value="1.25">1.25×</option>
                        <option value="1.5">1.5×</option><option value="1.75">1.75×</option>
                        <option value="2">2×</option>
                    </select>
                </label>
                <button class="milkbox-player-button milkbox-player-pip" type="button" aria-label="Picture in picture" title="Picture in picture">
                    <span class="material-symbols-outlined" aria-hidden="true">picture_in_picture_alt</span>
                </button>
                <button class="milkbox-player-button milkbox-player-fullscreen" type="button" aria-label="Enter fullscreen" title="Fullscreen">
                    <span class="material-symbols-outlined" aria-hidden="true">fullscreen</span>
                </button>
            </div>
        </div>`;
    player.append(video, loading, error, centerPlay, controls);
    container.replaceChildren(player);

    const playButton = controls.querySelector('.milkbox-player-play');
    const seek = controls.querySelector('.milkbox-player-seek');
    const currentTime = controls.querySelector('.milkbox-player-current');
    const duration = controls.querySelector('.milkbox-player-duration');
    const volume = controls.querySelector('.milkbox-player-volume');
    const volumeButton = controls.querySelector('.milkbox-player-volume-button');
    const speed = controls.querySelector('.milkbox-player-speed');
    const fullscreenButton = controls.querySelector('.milkbox-player-fullscreen');
    const pictureInPictureButton = controls.querySelector('.milkbox-player-pip');
    let hideControlsTimer;
    if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) pictureInPictureButton.hidden = true;

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
    video.addEventListener('play', updatePlayState);
    video.addEventListener('pause', updatePlayState);
    video.addEventListener('loadedmetadata', () => {
        duration.textContent = _milkboxFormatTime(video.duration);
        loading.hidden = true;
    });
    video.addEventListener('durationchange', () => {
        duration.textContent = _milkboxFormatTime(video.duration);
    });
    video.addEventListener('timeupdate', () => {
        currentTime.textContent = _milkboxFormatTime(video.currentTime);
        if (Number.isFinite(video.duration) && video.duration > 0 && !seek.matches(':active')) {
            seek.value = String(Math.round((video.currentTime / video.duration) * 1000));
            seek.style.setProperty('--milkbox-progress', `${(video.currentTime / video.duration) * 100}%`);
        }
    });
    video.addEventListener('waiting', () => { loading.hidden = false; });
    video.addEventListener('playing', () => { loading.hidden = true; });
    video.addEventListener('canplay', () => { loading.hidden = true; });
    video.addEventListener('error', () => {
        showPlaybackError('This video could not be played. Check the source URL or try another playback server.');
    });
    video.addEventListener('ended', () => {
        updatePlayState();
        player.classList.remove('controls-hidden');
    });
    seek.addEventListener('input', () => {
        if (Number.isFinite(video.duration)) {
            const percent = Number(seek.value) / 1000;
            video.currentTime = percent * video.duration;
            seek.style.setProperty('--milkbox-progress', `${percent * 100}%`);
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

    if (sourceUrl) video.src = sourceUrl;
    updatePlayState();
    updateVolumeState();
}

function createCustomVideoPlayer(container, sourceUrl, titleText, subtitleText) {
    if (!container) return;
    stopCustomVideoPlayer(container);
    const normalizedSource = _milkboxNormalizeVideoSource(sourceUrl);
    _milkboxCreateNativePlayer(container, normalizedSource, titleText, subtitleText);
    if (!normalizedSource) {
        const error = container.querySelector('.milkbox-player-error');
        if (error) {
            error.textContent = 'Use a direct video file URL (MP4, WebM, Ogg, or HLS) or upload a video file.';
            error.hidden = false;
            container.querySelector('.milkbox-player-loading').hidden = true;
        }
    }

    function stopCustomVideoPlayer(container) {
        const video = container?.querySelector('video');
        if (!video) return;
        video.pause();
        video.removeAttribute('src');
        video.load();
    }
}
