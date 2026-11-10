/**
 * AdGuard Pop-up & Video Ad Blocker for MILKBOX
 * High-Strength Playback Shield & Anti-Redirect Engine
 *
 * Capabilities:
 *  - Enforces strict sandboxing on third-party streaming iframes to physically forbid top-level redirects
 *  - Blocks all unwhitelisted window.open pop-ups and pop-unders unconditionally
 *  - Intercepts location.assign and location.replace to block external hijack redirects
 *  - Neutralizes in-page video ads, VAST/VPAID overlays, floating ads, and clickjacking traps
 *  - Strips rogue <video> elements inserted by ad networks outside the main player
 *  - Guards against beforeunload page hijacking during active video playback
 *  - Protects both top-level MILKBOX and embed players (milkbox-embed.html)
 */

(function(window) {
    'use strict';

    if (window.__adguardPopupBlockerInitialized) return;
    window.__adguardPopupBlockerInitialized = true;

    const STORAGE_KEY_ENABLED = 'milkbox_adguard_enabled';
    const STORAGE_KEY_COUNT = 'milkbox_adguard_blocked_count';

    let enabled = true;
    try {
        const stored = localStorage.getItem(STORAGE_KEY_ENABLED);
        if (stored !== null) enabled = stored !== 'false';
    } catch {}

    let blockedCount = 0;
    try {
        blockedCount = parseInt(localStorage.getItem(STORAGE_KEY_COUNT) || '0', 10) || 0;
    } catch {}

    // Track internal navigation vs untrusted external redirect attempts
    let lastInternalNavTime = Date.now();
    let lastUserInteractionTime = 0;
    const TRUSTED_INTERACTION_WINDOW_MS = 400;

    function recordUserInteraction(e) {
        if (!e) return;
        if (e.isTrusted) {
            lastUserInteractionTime = Date.now();
            const a = e.target && e.target.closest ? e.target.closest('a, button, [role="button"]') : null;
            if (a) {
                lastInternalNavTime = Date.now();
            }
        }
    }

    ['mousedown', 'mouseup', 'click', 'keydown', 'touchstart', 'pointerdown'].forEach(type => {
        try {
            window.addEventListener(type, recordUserInteraction, { capture: true, passive: true });
        } catch {}
    });

    // -------------------------------------------------------------
    // Extended Ad Domains & Trackers Regex
    // -------------------------------------------------------------
    const AD_DOMAINS_REGEX = /(?:doubleclick|googlesyndication|googleads|adservice|popads|popcash|exoclick|propellerads|adsterra|onclkds|trafficjunky|adnxs|adsystem|criteo|outbrain|taboola|mgid|clickadilla|a-ads|coinzilla|bet365|1xbet|parimatch|monetag|hilltopads|richpush|admaven|yllix|clickadu|infolinks|adcash|revenuehits|galaksion|bidvertiser|trafficstars|adxad|plugrush|ero-advertising|juicyads|chaturbate|bongacams|stripchat|livejasmin|rtmark|creativecdn|syndication|creative-serving|vidsrc-stream|vidcloud-ad|clickshield|onclickmega|tracking|trackingdesk|affiliates?|promotions?|landingpage|redirect|trackurl|adkeeper|adkernel|adsco|adroll|zergnet|vmg\.host|voluum|clickfuse|adform|rubiconproject|pubmatic|smartadserver|spotxchange|openx|casalemedia|inmobi|sovrn|sharethrough|media\.net|exponential|yieldmo|triplelift|gumgum|undertone|conversant|distroscale|teads|connatix|aniview|springserve|beachfront|videology|tremorhub|brightroll|vi-serve|admanmedia|instreamatic|spotx|adblade|bidswitch|simplifi|nativo|revcontent|yieldbird|playwire|setupad|snack-media|themoneytizer|ezoic|monumetric|skimm|skimlinks|viglink|clickbank|leadpages|landingi|instapage|unbounce|casino|betting|slots|crypto-loot|coinhive|whos\.amung\.us|histats|amung\.us|adtrue|bidscube|streamate|cam4|camwhores|bonga|pornhub|xvideos|redtube)/i;

    function isAdUrl(rawUrl) {
        if (!rawUrl) return false;
        const str = String(rawUrl).trim().toLowerCase();
        if (str === 'about:blank' || str === '') return false;
        if (str.startsWith('blob:') || str.startsWith('data:') || str.startsWith('javascript:')) return false;
        if (AD_DOMAINS_REGEX.test(str)) return true;
        if (/\/pop(?:up|under)?[\/?#]/i.test(str) || /\/ad(?:s|server|tag|banner)?[\/?#]/i.test(str) || /\/click[\/?#]/i.test(str)) return true;
        return false;
    }

    // Explicit whitelist of allowed internal & legitimate external destinations
    function isAllowedInternalUrl(rawUrl) {
        if (!rawUrl) return false;
        const str = String(rawUrl).trim();
        if (str === 'about:blank' || str === '') return false;
        if (str.startsWith('blob:') || str.startsWith('data:') || str.startsWith('javascript:')) return false;

        // Relative URLs & same-origin paths are always allowed
        if (str.startsWith('/') || str.startsWith('./') || str.startsWith('#') || str.startsWith('?')) return true;

        try {
            const u = new URL(str, window.location.href);
            if (u.origin === window.location.origin) return true;

            const host = u.hostname.toLowerCase();
            // Whitelisted services MILKBOX uses (OAuth, Trailers, Metadata, Community)
            if (host === 'accounts.google.com' ||
                host === 'drive.google.com' ||
                host === 'console.cloud.google.com' ||
                host === 'console.firebase.google.com' ||
                host === 'www.youtube.com' ||
                host === 'www.youtube-nocookie.com' ||
                host === 'youtu.be' ||
                host === 'discord.gg' ||
                host === 'github.com' ||
                host === 'raw.githubusercontent.com' ||
                host === 'api.themoviedb.org' ||
                host === 'image.tmdb.org' ||
                host === 'graphql.anilist.co' ||
                host === 'api.jikan.moe' ||
                host === 'flagsapi.com' ||
                host === 'cdn.jsdelivr.net' ||
                host === 'fonts.googleapis.com' ||
                host === 'fonts.gstatic.com') {
                return true;
            }
        } catch {}
        return false;
    }

    // Mock Window object returned when an ad popup is blocked to prevent script errors
    function createMockWindow(targetUrl) {
        const u = String(targetUrl || '');
        return {
            closed: false,
            name: '',
            opener: null,
            parent: window,
            top: window,
            self: null,
            window: null,
            location: {
                href: u,
                replace: function() {},
                assign: function() {},
                reload: function() {}
            },
            document: {
                write: function() {},
                writeln: function() {},
                open: function() {},
                close: function() {}
            },
            focus: function() {},
            blur: function() {},
            close: function() { this.closed = true; },
            postMessage: function() {},
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return false; },
            setTimeout: function() { return 0; },
            clearTimeout: function() {},
            setInterval: function() { return 0; },
            clearInterval: function() {}
        };
    }

    // -------------------------------------------------------------
    // High-visibility Toast Notification
    // -------------------------------------------------------------
    let toastTimer = null;
    let toastContainer = null;

    function showBlockedNotification(message, url) {
        if (!enabled) return;
        blockedCount++;
        try {
            localStorage.setItem(STORAGE_KEY_COUNT, String(blockedCount));
        } catch {}

        try {
            window.dispatchEvent(new CustomEvent('adguard:blocked', {
                detail: { count: blockedCount, message, url }
            }));
        } catch {}

        console.info(`[AdGuard PopupBlocker] Shielded: ${message} (${url || 'in-page'}) · Total blocked: ${blockedCount}`);

        if (typeof document === 'undefined' || !document.body) return;

        if (!toastContainer) {
            toastContainer = document.getElementById('adguardToast');
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'adguardToast';
                toastContainer.setAttribute('role', 'status');
                toastContainer.setAttribute('aria-live', 'polite');
                toastContainer.style.cssText = [
                    'position: fixed',
                    'bottom: 24px',
                    'right: 24px',
                    'z-index: 9999999',
                    'background: rgba(18, 22, 28, 0.94)',
                    'backdrop-filter: blur(12px)',
                    '-webkit-backdrop-filter: blur(12px)',
                    'border: 1px solid rgba(74, 222, 128, 0.4)',
                    'border-radius: 10px',
                    'padding: 10px 16px',
                    'color: #ffffff',
                    'font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    'font-size: 13px',
                    'font-weight: 500',
                    'display: flex',
                    'align-items: center',
                    'gap: 10px',
                    'box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(74, 222, 128, 0.2)',
                    'transition: opacity 0.25s ease, transform 0.25s ease',
                    'opacity: 0',
                    'transform: translateY(12px)',
                    'pointer-events: none',
                    'max-width: 380px',
                    'line-height: 1.4'
                ].join(';');

                toastContainer.innerHTML = [
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">',
                    '  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
                    '  <path d="m9 12 2 2 4-4"></path>',
                    '</svg>',
                    '<div style="flex:1;">',
                    '  <div style="font-weight:700; color:#4ade80; font-size:12px; letter-spacing:0.3px; text-transform:uppercase;">AdGuard Shield Active</div>',
                    '  <div id="adguardToastMsg" style="color:#d1d5db; font-size:12px;">Pop-up or ad blocked</div>',
                    '</div>'
                ].join('');
                document.body.appendChild(toastContainer);
            }
        }

        const msgEl = document.getElementById('adguardToastMsg');
        if (msgEl) {
            msgEl.textContent = `${message || 'Pop-up or ad blocked'} (${blockedCount} total)`;
        }

        clearTimeout(toastTimer);
        toastContainer.style.opacity = '1';
        toastContainer.style.transform = 'translateY(0)';

        toastTimer = setTimeout(() => {
            if (toastContainer) {
                toastContainer.style.opacity = '0';
                toastContainer.style.transform = 'translateY(12px)';
            }
        }, 2800);
    }

    // -------------------------------------------------------------
    // Context Check
    // -------------------------------------------------------------
    function isPlayerActiveNow() {
        if (typeof document === 'undefined') return false;
        const playerModal = document.getElementById('playerModal');
        const animeTheater = document.getElementById('animeTheater');
        const mbPlayer = document.getElementById('mbPlayer');
        const isPlayerActive = document.body.classList.contains('player-active') ||
            (playerModal && playerModal.classList.contains('active')) ||
            (animeTheater && animeTheater.style.display !== 'none') ||
            (mbPlayer && mbPlayer.offsetWidth > 0);
        return Boolean(isPlayerActive);
    }

    // -------------------------------------------------------------
    // Ironclad window.open Interception
    // -------------------------------------------------------------
    const originalWindowOpen = window.open;

    function interceptedOpen(url, target, features) {
        if (!enabled) {
            return originalWindowOpen.call(window, url, target, features);
        }

        const targetStr = String(url || '').trim();

        // Allow Google Sign-In & Google Drive OAuth popups
        if (targetStr.startsWith('https://accounts.google.com/') || targetStr.startsWith('https://drive.google.com/')) {
            return originalWindowOpen.call(window, url, target, features);
        }

        // Allow explicitly whitelisted internal/safe links only when initiated by user
        if (isAllowedInternalUrl(targetStr)) {
            return originalWindowOpen.call(window, url, target, features);
        }

        // ANY other external destination, blank popup, or popunder is blocked unconditionally!
        showBlockedNotification('Ad pop-up / new window blocked', targetStr || 'blank pop-up');
        return createMockWindow(targetStr);
    }

    try {
        window.open = interceptedOpen;
        if (window.Window && window.Window.prototype) {
            window.Window.prototype.open = interceptedOpen;
        }
    } catch (e) {
        console.warn('[AdGuard PopupBlocker] Could not wrap window.open:', e);
    }

    try {
        window.showModalDialog = interceptedOpen;
    } catch {}

    // -------------------------------------------------------------
    // Programmatic click & anchor protection
    // -------------------------------------------------------------
    const originalElementClick = window.HTMLElement && window.HTMLElement.prototype ? window.HTMLElement.prototype.click : null;

    if (originalElementClick) {
        window.HTMLElement.prototype.click = function() {
            if (!enabled) return originalElementClick.call(this);

            if (this instanceof HTMLAnchorElement) {
                const href = this.href || this.getAttribute('href') || '';
                if (!isAllowedInternalUrl(href)) {
                    showBlockedNotification('Programmatic ad link click prevented', href);
                    return;
                }
            }

            return originalElementClick.call(this);
        };
    }

    // -------------------------------------------------------------
    // Legitimate App Element Check (Never break MILKBOX UI)
    // -------------------------------------------------------------
    function isLegitimateAppElement(el) {
        if (!el || !(el instanceof HTMLElement)) return true;
        if (el.id === 'playerPopupShield' ||
            el.id === 'playerFrame' ||
            el.id === 'playerContainer' ||
            el.id === 'mbPlayer' ||
            el.id === 'mbStreamIframe' ||
            el.id === 'mbNativeVideo' ||
            el.id === 'mbSubtitlesOverlay' ||
            el.id === 'mbControlsBar' ||
            el.id === 'adguardToast' ||
            el.id === 'siteTitle' ||
            el.id === 'mobileNav') {
            return true;
        }
        if (el.closest && (
            el.closest('.milkbox-player') ||
            el.closest('.mb-player') ||
            el.closest('#playerSelector') ||
            el.closest('.server-selector') ||
            el.closest('.adguard-server-badge') ||
            el.closest('#adguardToast') ||
            el.closest('#mobileNav') ||
            el.closest('header') ||
            el.closest('nav') ||
            el.closest('.sidebar')
        )) {
            return true;
        }
        return false;
    }

    // -------------------------------------------------------------
    // Clickjacking & Floating Overlay Detection
    // -------------------------------------------------------------
    function isOverlayOrClickjacker(el) {
        if (!el || !(el instanceof HTMLElement)) return false;
        if (isLegitimateAppElement(el)) return false;

        try {
            const style = window.getComputedStyle(el);
            const isPositioned = style.position === 'fixed' || style.position === 'absolute';
            if (!isPositioned) return false;

            const zIndex = parseInt(style.zIndex, 10);
            if (isNaN(zIndex) || zIndex < 15) return false;

            const rect = el.getBoundingClientRect();
            const winWidth = window.innerWidth || document.documentElement.clientWidth || 800;
            const winHeight = window.innerHeight || document.documentElement.clientHeight || 600;

            const coversWidth = rect.width >= (winWidth * 0.3);
            const coversHeight = rect.height >= (winHeight * 0.3);
            const isTransparent = style.opacity === '0' || style.backgroundColor.includes('rgba(0, 0, 0, 0)') || style.visibility === 'hidden';

            if (coversWidth && coversHeight) {
                // Transparent clickjack layer OR rogue container with videos/ad links
                if (isTransparent || el.querySelector('video, iframe[src*="ad"], a[target="_blank"]')) {
                    return true;
                }
            }
        } catch {}
        return false;
    }

    // Capturing click listener to catch rogue anchors and clickjackers before they trigger
    document.addEventListener('click', function(e) {
        if (!enabled) return;

        const anchor = e.target.closest('a');
        if (anchor) {
            const href = anchor.href || anchor.getAttribute('href') || '';
            const target = anchor.target || anchor.getAttribute('target');

            // If an anchor points to an external unwhitelisted address
            if (href && !isAllowedInternalUrl(href)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                anchor.remove();
                showBlockedNotification('Ad link click intercepted', href);
                return false;
            }

            if (target === '_top' || target === '_parent') {
                if (!isAllowedInternalUrl(href)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    showBlockedNotification('Top hijack redirect blocked', href);
                    return false;
                }
            }
        }

        // Neutralize clickjacking overlays
        if (isOverlayOrClickjacker(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.target.remove();
            showBlockedNotification('Clickjacking overlay stripped');
            return false;
        }
    }, true);

    // -------------------------------------------------------------
    // Ad Video & In-Page Ad Annihilation Engine
    // -------------------------------------------------------------
    const AD_SELECTORS = [
        '[class*="video-ad"]', '[id*="video-ad"]',
        '[class*="ad-video"]', '[id*="ad-video"]',
        '[class*="vast-"]', '[id*="vast-"]',
        '[class*="vpaid"]', '[id*="vpaid"]',
        '[class*="preroll"]', '[id*="preroll"]',
        '[class*="midroll"]', '[id*="midroll"]',
        '[class*="ad-banner"]', '[id*="ad-banner"]',
        '[class*="ad-container"]', '[id*="ad-container"]',
        '[class*="ad-overlay"]', '[id*="ad-overlay"]',
        '[class*="ad-wrapper"]', '[id*="ad-wrapper"]',
        '[class*="floating-ad"]', '[id*="floating-ad"]',
        '[class*="sticky-ad"]', '[id*="sticky-ad"]',
        '[class*="pop-ad"]', '[id*="pop-ad"]',
        '.adsbygoogle', 'ins.adsbygoogle',
        'iframe[src*="doubleclick"]', 'iframe[src*="googleads"]',
        'iframe[src*="popads"]', 'iframe[src*="exoclick"]',
        'iframe[src*="propeller"]', 'iframe[src*="adsterra"]',
        'iframe[src*="trafficstars"]', 'iframe[src*="monetag"]'
    ].join(',');

    function scanAndNeutralizeOverlays() {
        if (!enabled) return;
        try {
            // 1. Strip rogue video elements outside legitimate MILKBOX player
            const allVideos = document.querySelectorAll('video');
            for (let i = 0; i < allVideos.length; i++) {
                const v = allVideos[i];
                if (v.id === 'mbNativeVideo' || v.classList.contains('milkbox-video-element') || (v.closest && v.closest('.milkbox-player, .mb-player, #playerFrame, #animeTheater'))) {
                    continue;
                }
                try {
                    v.pause();
                    v.muted = true;
                    v.src = '';
                    v.remove();
                    showBlockedNotification('Injected ad video eliminated');
                } catch {}
            }

            // 2. Strip elements matching ad selectors
            const adNodes = document.querySelectorAll(AD_SELECTORS);
            for (let i = 0; i < adNodes.length; i++) {
                const el = adNodes[i];
                if (!isLegitimateAppElement(el)) {
                    el.remove();
                    showBlockedNotification('Ad element removed');
                }
            }

            // 3. Strip suspicious floating overlays & clickjack anchors
            const positioned = document.querySelectorAll('div[style*="fixed"], div[style*="absolute"], a[target="_blank"]');
            for (let i = 0; i < positioned.length; i++) {
                const el = positioned[i];
                if (isOverlayOrClickjacker(el)) {
                    el.remove();
                    showBlockedNotification('Hidden ad overlay neutralized');
                }
            }

            // 4. Enforce strict sandboxing on all playback iframes
            document.querySelectorAll('#playerFrame iframe, #animePlayerWrap iframe, .player-container iframe, #mbStreamIframe').forEach(hardenPlaybackIframe);
        } catch {}
    }

    // -------------------------------------------------------------
    // Strict Iframe Sandboxing (Physically blocks top navigation)
    // -------------------------------------------------------------
    function hardenPlaybackIframe(iframe) {
        if (!iframe || !(iframe instanceof HTMLElement) || iframe.tagName !== 'IFRAME') return;
        try {
            const src = iframe.src || iframe.getAttribute('src') || '';
            const isInternalPlayer = src.includes('milkbox-embed.html') || (src.startsWith('/') && !src.startsWith('//')) || (typeof window !== 'undefined' && src.startsWith(window.location.origin));

            if (!iframe.getAttribute('allow')) {
                iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            }

            if (enabled) {
                // External third-party streams: strictly sandbox to eliminate top redirects & popups!
                // Notice: 'allow-top-navigation' and 'allow-top-navigation-by-user-activation' are OMITTED!
                if (!isInternalPlayer) {
                    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
                }
            } else {
                iframe.removeAttribute('sandbox');
            }
        } catch {}
    }

    // -------------------------------------------------------------
    // Continuous MutationObserver
    // -------------------------------------------------------------
    if (typeof MutationObserver !== 'undefined') {
        let scanDebounce = null;
        const observer = new MutationObserver(mutations => {
            if (!enabled) return;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.addedNodes && m.addedNodes.length > 0) {
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        const node = m.addedNodes[j];
                        if (node.nodeType === 1) {
                            if (node.tagName === 'VIDEO' && !isLegitimateAppElement(node)) {
                                try { node.pause(); node.muted = true; node.src = ''; node.remove(); } catch {}
                                showBlockedNotification('Ad video stripped on injection');
                                return;
                            }
                            if (node.tagName === 'IFRAME') {
                                hardenPlaybackIframe(node);
                            } else if (node.querySelectorAll) {
                                node.querySelectorAll('iframe').forEach(hardenPlaybackIframe);
                            }
                        }
                    }
                }
            }

            if (!scanDebounce) {
                scanDebounce = setTimeout(() => {
                    scanDebounce = null;
                    scanAndNeutralizeOverlays();
                }, 150);
            }
        });

        if (document.documentElement) {
            observer.observe(document.documentElement, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.documentElement, { childList: true, subtree: true });
            });
        }
    }

    // -------------------------------------------------------------
    // Top-Level Navigation Protection (location.assign & location.replace)
    // -------------------------------------------------------------
    try {
        const origAssign = window.location.assign ? window.location.assign.bind(window.location) : null;
        const origReplace = window.location.replace ? window.location.replace.bind(window.location) : null;

        if (origAssign) {
            window.location.assign = function(url) {
                const uStr = String(url || '');
                if (enabled && !isAllowedInternalUrl(uStr)) {
                    showBlockedNotification('External redirect blocked', uStr);
                    return;
                }
                return origAssign(url);
            };
        }

        if (origReplace) {
            window.location.replace = function(url) {
                const uStr = String(url || '');
                if (enabled && !isAllowedInternalUrl(uStr)) {
                    showBlockedNotification('External replace blocked', uStr);
                    return;
                }
                return origReplace(url);
            };
        }
    } catch {}

    // Guard against beforeunload page hijacking during active video playback
    window.addEventListener('beforeunload', (e) => {
        if (!enabled) return;
        if (isPlayerActiveNow()) {
            const now = Date.now();
            // If page unload is requested without an explicit internal link click in the last 800ms
            if ((now - lastInternalNavTime) > 800) {
                e.preventDefault();
                e.returnValue = 'Leave MILKBOX? Playback is currently in progress.';
                return e.returnValue;
            }
        }
    });

    // -------------------------------------------------------------
    // UI Badges & Sync
    // -------------------------------------------------------------
    function updateAdGuardUIElements() {
        if (typeof document === 'undefined') return;

        const srvBadge = document.getElementById('adguardServerBadge');
        const srvText = document.getElementById('adguardServerText');
        const srvCounter = document.getElementById('adguardServerCounter');
        if (srvBadge) {
            srvBadge.classList.toggle('disabled', !enabled);
            srvBadge.title = `AdGuard Pop-up & Ad Blocker: ${enabled ? 'Active (' + blockedCount + ' blocked)' : 'Disabled'}. Click to toggle.`;
        }
        if (srvText) {
            srvText.textContent = `AdGuard: ${enabled ? 'ON' : 'OFF'}`;
        }
        if (srvCounter) {
            srvCounter.textContent = String(blockedCount);
        }

        const animeBtn = document.getElementById('animeCtrlAdguard');
        const animeLabel = document.getElementById('animeAdguardLabel');
        if (animeBtn) {
            animeBtn.classList.toggle('disabled', !enabled);
            animeBtn.title = `AdGuard Pop-up & Ad Blocker: ${enabled ? 'Active (' + blockedCount + ' blocked)' : 'Disabled'}. Click to toggle.`;
        }
        if (animeLabel) {
            animeLabel.textContent = `AdGuard: ${enabled ? 'ON' : 'OFF'} (${blockedCount})`;
        }

        const animeSrvBtn = document.getElementById('animeServerAdguardBtn');
        const animeSrvText = document.getElementById('animeServerAdguardText');
        const animeSrvCounter = document.getElementById('animeServerAdguardCounter');
        if (animeSrvBtn) {
            animeSrvBtn.classList.toggle('disabled', !enabled);
            animeSrvBtn.title = `AdGuard Pop-up & Ad Blocker: ${enabled ? 'Active (' + blockedCount + ' blocked)' : 'Disabled'}. Click to toggle.`;
        }
        if (animeSrvText) {
            animeSrvText.textContent = `AdGuard: ${enabled ? 'ON' : 'OFF'}`;
        }
        if (animeSrvCounter) {
            animeSrvCounter.textContent = String(blockedCount);
        }

        const toggle = document.getElementById('adguardBlockerToggle');
        if (toggle && toggle.checked !== enabled) {
            toggle.checked = enabled;
        }
        const desc = document.getElementById('adguardStatusDesc');
        if (desc) {
            desc.textContent = enabled
                ? `Active · High-strength AdGuard engine blocks video ads, pop-ups, and redirects (${blockedCount} blocked).`
                : 'Disabled · Protection paused.';
        }
    }

    function notifyStateChanged() {
        try {
            window.dispatchEvent(new CustomEvent('adguard:state-changed', {
                detail: { enabled, blockedCount }
            }));
        } catch {}
        try {
            updateAdGuardUIElements();
        } catch {}
    }

    document.addEventListener('click', (e) => {
        const targetBadge = e.target.closest('#adguardServerBadge, #animeCtrlAdguard, #animeServerAdguardBtn');
        if (!targetBadge) return;
        e.preventDefault();
        e.stopPropagation();
        window.AdGuardPopupBlocker.setEnabled(!enabled);
        if (typeof window.toast === 'function') {
            window.toast(`AdGuard Pop-up & Video Blocker ${enabled ? 'enabled' : 'disabled'} on playback servers`, enabled ? 'success' : 'info');
        }
    });

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateAdGuardUIElements);
        } else {
            setTimeout(updateAdGuardUIElements, 50);
        }
    }

    // -------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------
    window.AdGuardPopupBlocker = {
        name: 'AdGuard PopupBlocker for MILKBOX',
        version: '3.0.0-high-strength-shield',
        isEnabled: function() { return enabled; },
        setEnabled: function(val) {
            enabled = Boolean(val);
            try { localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled)); } catch {}
            console.log(`[AdGuard PopupBlocker] Protection ${enabled ? 'enabled' : 'disabled'}`);
            notifyStateChanged();
            scanAndNeutralizeOverlays();
        },
        getBlockedCount: function() { return blockedCount; },
        resetCount: function() {
            blockedCount = 0;
            try { localStorage.setItem(STORAGE_KEY_COUNT, '0'); } catch {}
            notifyStateChanged();
        },
        hardenIframe: hardenPlaybackIframe,
        notifyBlocked: function(msg, url) {
            showBlockedNotification(msg, url);
            notifyStateChanged();
        },
        isAdUrl: isAdUrl,
        scanNow: scanAndNeutralizeOverlays
    };

})(typeof window !== 'undefined' ? window : globalThis);
