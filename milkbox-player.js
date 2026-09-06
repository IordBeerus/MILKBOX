// MILKBOX Google Drive Iframe Player Suite using Google Fonts Material Symbols
// Self-contained: no dependency on app.js globals at parse time.

function _milkboxEscapeHtml(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function _milkboxConvertDriveLink(url) {
    if (typeof convertDriveLink === 'function') return convertDriveLink(url);
    if (!url || typeof url !== 'string') return '';
    // Block dangerous schemes
    const trimmed = url.trim();
    if (/^\s*javascript:/i.test(trimmed) || /^\s*data:/i.test(trimmed) || /^\s*vbscript:/i.test(trimmed)) return '';
    const m = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
    const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) return 'https://drive.google.com/file/d/' + m2[1] + '/preview';
    if (trimmed.includes('drive.google.com')) {
        return trimmed.replace('/view', '/preview').replace('/edit', '/preview');
    }
    return trimmed;
}

function createCustomVideoPlayer(container, sourceUrl, titleText, subtitleText) {
    if (!container || !sourceUrl) {
        if (container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No video source</div>';
        return;
    }
    // Stop any previous playback before replacing
    try {
        const prevFrame = container.querySelector('iframe');
        if (prevFrame) prevFrame.src = 'about:blank';
    } catch {}
    container.innerHTML = '';

    const esc = _milkboxEscapeHtml;
    const frameUrl = _milkboxConvertDriveLink(sourceUrl);
    const safeSourceUrl = esc(sourceUrl);

    if (!frameUrl) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">Invalid Google Drive link</div>';
        return;
    }

    container.innerHTML = `
        <div style="position:relative;width:100%;height:100%;background:#000;display:flex;flex-direction:column;">
            <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.85);padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.1);z-index:2;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                    <button class="milkbox-cp-back-btn" id="driveFrameBackBtn" title="Back" aria-label="Back" style="width:32px;height:32px;">
                        <span class="material-symbols-outlined" style="font-size:18px;">arrow_back</span>
                    </button>
                    <div style="min-width:0;">
                        <span style="color:#fff;font-weight:700;font-size:15px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(titleText || 'Google Drive HD-20')}</span>
                        <span style="color:#aaa;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${esc(subtitleText || '')}</span>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                    <a href="${safeSourceUrl}" target="_blank" rel="noopener noreferrer" title="Open in New Tab" style="background:rgba(255,255,255,0.1);color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:16px;">open_in_new</span>
                    </a>
                    <span class="milkbox-cp-badge">HD-20 Drive</span>
                </div>
            </div>
            <iframe src="${esc(frameUrl)}" class="milkbox-drive-frame" allowfullscreen allow="autoplay; encrypted-media; fullscreen" loading="lazy" referrerpolicy="no-referrer" title="${esc(titleText || 'Drive video')}"></iframe>
        </div>
    `;

    const backBtn = container.querySelector('#driveFrameBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            try {
                const iframe = container.querySelector('iframe');
                if (iframe) iframe.src = 'about:blank';
                const modal = document.getElementById('playerModal');
                if (modal) modal.classList.remove('active');
            } catch {}
        });
    }
}
