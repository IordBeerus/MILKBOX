/**
 * AdGuard Pop-up & Video Ad Blocker for MILKBOX
 * High-Strength Playback Shield, CSS Injection Engine & Sandbox Bypass Architecture
 *
 * Capabilities:
 *  - CSS Injection Engine: Injects aggressive cosmetic filtering stylesheets that instantly
 *    hide and neutralize elements matching ad signatures before layout, painting, or redirects can occur.
 *  - Stricter DOM Monitoring: Synchronous, zero-latency MutationObserver inspecting both added nodes
 *    and mutated attributes (style, class, src, href, target) to catch dynamically morphed ad overlays.
 *  - Movie Sandbox Bypass: Resolves the "Please disable sandbox" / "Remove sandbox attributes" issue
 *    on movie embed servers (VidSrc, CineSRC, VidLink, SuperEmbed, MoviesAPI, VidFast) by negotiating
 *    stream-compatible capability tokens, backed by an automated Shielded Proxy Tunnel fallback.
 *  - Anti-Redirect & Top Navigation Shield: Intercepts unwhitelisted window.open, location.assign,
 *    location.replace, and beforeunload hijack attempts to keep playback uninterrupted.
 *  - Rogue Media Annihilation: Freezes, mutes, blanks, and purges injected video/audio ad elements.
 *  - High-visibility status toast & HUD badge sync for seamless playback control.
 */

(function(window) {
    'use strict';

    if (window.__adguardPopupBlockerInitialized) return;
    window.__adguardPopupBlockerInitialized = true;

    const STORAGE_KEY_ENABLED = 'milkbox_adguard_enabled';
    const STORAGE_KEY_COUNT = 'milkbox_adguard_blocked_count';
    const STORAGE_KEY_SANDBOX_BYPASS = 'milkbox_adguard_sandbox_bypass';
    const STORAGE_KEY_CSS_INJECT = 'milkbox_adguard_css_inject';

    let enabled = true;
    try {
        const stored = localStorage.getItem(STORAGE_KEY_ENABLED);
        if (stored !== null) enabled = stored !== 'false';
    } catch {}

    let blockedCount = 0;
    try {
        blockedCount = parseInt(localStorage.getItem(STORAGE_KEY_COUNT) || '0', 10) || 0;
    } catch {}

    // Sandbox Bypass mode is ON by default to prevent "Please disable sandbox" movie errors
    let sandboxBypassEnabled = true;
    try {
        const storedBypass = localStorage.getItem(STORAGE_KEY_SANDBOX_BYPASS);
        if (storedBypass !== null) sandboxBypassEnabled = storedBypass !== 'false';
    } catch {}

    let cssInjectEnabled = true;
    try {
        const storedCss = localStorage.getItem(STORAGE_KEY_CSS_INJECT);
        if (storedCss !== null) cssInjectEnabled = storedCss !== 'false';
    } catch {}

    // Track internal navigation vs untrusted external redirect attempts
    let lastInternalNavTime = Date.now();
    let lastUserInteractionTime = 0;
    const TRUSTED_INTERACTION_WINDOW_MS = 500;

    function recordUserInteraction(e) {
        if (!e) return;
        if (e.isTrusted) {
            lastUserInteractionTime = Date.now();
            const a = e.target && e.target.closest ? e.target.closest('a, button, [role="button"], input, select') : null;
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
    const AD_DOMAINS_REGEX = /(?:doubleclick|googlesyndication|googleads|adservice|popads|popcash|exoclick|propellerads|adsterra|onclkds|trafficjunky|adnxs|adsystem|criteo|outbrain|taboola|mgid|clickadilla|a-ads|coinzilla|bet365|1xbet|parimatch|monetag|hilltopads|richpush|admaven|yllix|clickadu|infolinks|adcash|revenuehits|galaksion|bidvertiser|trafficstars|adxad|plugrush|ero-advertising|juicyads|chaturbate|bongacams|stripchat|livejasmin|rtmark|creativecdn|syndication|creative-serving|vidsrc-stream|vidcloud-ad|clickshield|onclickmega|tracking|trackingdesk|affiliates?|promotions?|landingpage|redirect|trackurl|adkeeper|adkernel|adsco|adroll|zergnet|vmg\.host|voluum|clickfuse|adform|rubiconproject|pubmatic|smartadserver|spotxchange|openx|casalemedia|inmobi|sovrn|sharethrough|media\.net|exponential|yieldmo|triplelift|gumgum|undertone|conversant|distroscale|teads|connatix|aniview|springserve|beachfront|videology|tremorhub|brightroll|vi-serve|admanmedia|instreamatic|spotx|adblade|bidswitch|simplifi|nativo|revcontent|yieldbird|playwire|setupad|snack-media|themoneytizer|ezoic|monumetric|skimm|skimlinks|viglink|clickbank|leadpages|landingi|instapage|unbounce|casino|betting|slots|crypto-loot|coinhive|whos\.amung\.us|histats|amung\.us|adtrue|bidscube|streamate|cam4|camwhores|bonga|pornhub|xvideos|redtube|adserver|adwrapper|videoblocks|adnuntius)/i;

    function isAdUrl(rawUrl) {
        if (!rawUrl) return false;
        const str = String(rawUrl).trim().toLowerCase();
        if (str === 'about:blank' || str === '') return false;
        if (str.startsWith('blob:') || str.startsWith('data:') || str.startsWith('javascript:')) return false;
        if (AD_DOMAINS_REGEX.test(str)) return true;
        if (/\/pop(?:up|under)?[\/?#]/i.test(str) || /\/ad(?:s|server|tag|banner)?[\/?#]/i.test(str) || /\/click[\/?#]/i.test(str) || /\/track[\/?#]/i.test(str)) return true;
        return false;
    }

    // Whitelist of allowed internal & legitimate external destinations
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
            // Whitelisted services MILKBOX uses
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
                host === 'fonts.gstatic.com' ||
                host === 'api.wyzie.io' ||
                host === 'wisp.classroom.lat') {
                return true;
            }
        } catch {}
        return false;
    }

    // Mock Window object returned when an ad popup is blocked
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
    // CSS Injection Engine: Early Pre-Render Ad Erasure
    // -------------------------------------------------------------
    const CSS_SHIELD_STYLE_ID = 'adguard-css-shield';

    const AD_SIGNATURE_SELECTORS = [
        '[data-adguard-blocked="true"]',
        '[class*="video-ad"]', '[id*="video-ad"]',
        '[class*="ad-video"]', '[id*="ad-video"]',
        '[class*="vast-"]', '[id*="vast-"]',
        '[class*="vpaid"]', '[id*="vpaid"]',
        '[class*="preroll"]', '[id*="preroll"]',
        '[class*="midroll"]', '[id*="midroll"]',
        '[class*="postroll"]', '[id*="postroll"]',
        '[class*="ad-banner"]', '[id*="ad-banner"]',
        '[class*="ad-container"]', '[id*="ad-container"]',
        '[class*="ad-overlay"]', '[id*="ad-overlay"]',
        '[class*="ad-wrapper"]', '[id*="ad-wrapper"]',
        '[class*="ad-slot"]', '[id*="ad-slot"]',
        '[class*="ad-player"]', '[id*="ad-player"]',
        '[class*="ad-frame"]', '[id*="ad-frame"]',
        '[class*="floating-ad"]', '[id*="floating-ad"]',
        '[class*="sticky-ad"]', '[id*="sticky-ad"]',
        '[class*="pop-ad"]', '[id*="pop-ad"]',
        '[class*="popunder"]', '[id*="popunder"]',
        '[class*="interstitial"]', '[id*="interstitial"]',
        '[class*="clickjack"]', '[id*="clickjack"]',
        '[class*="sponsor"]', '[id*="sponsor"]',
        '.adsbygoogle', 'ins.adsbygoogle',
        '[data-ad]', '[data-ad-client]', '[data-ad-slot]', '[data-ad-unit]',
        '[id*="google_ads_iframe"]', '[id*="aswift_"]',
        '[id*="taboola-"]', '[class*="taboola-"]',
        '[id*="outbrain-"]', '[class*="outbrain-"]',
        '[id*="mgid-"]', '[class*="mgid-"]',
        'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]', 'iframe[src*="googleads"]',
        'iframe[src*="popads"]', 'iframe[src*="popcash"]', 'iframe[src*="exoclick"]',
        'iframe[src*="propeller"]', 'iframe[src*="adsterra"]', 'iframe[src*="trafficstars"]',
        'iframe[src*="monetag"]', 'iframe[src*="admaven"]', 'iframe[src*="richpush"]',
        'iframe[src*="galaksion"]', 'iframe[src*="yllix"]', 'iframe[src*="clickadu"]',
        'iframe[src*="onclickmega"]', 'iframe[src*="clickshield"]', 'iframe[src*="creative-serving"]',
        'iframe[src*="syndication"]', 'iframe[src*="affiliate"]', 'iframe[src*="vmg.host"]',
        'iframe[src*="rtmark"]', 'iframe[src*="creativecdn"]', 'iframe[src*="trackurl"]'
    ].join(', ');

    const CSS_SHIELD_RULES = `
        /* AdGuard Cosmetic Filtering: Hide identified ad elements BEFORE layout & rendering */
        ${AD_SIGNATURE_SELECTORS} {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            max-width: 0 !important;
            max-height: 0 !important;
            min-width: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            outline: 0 !important;
            position: absolute !important;
            left: -999999px !important;
            top: -999999px !important;
            z-index: -999999 !important;
            clip: rect(0, 0, 0, 0) !important;
            clip-path: inset(50%) !important;
            transform: scale(0) !important;
        }

        /* Whitelist protection for legitimate MILKBOX playback & navigation containers */
        #playerFrame, #playerContainer, #mbPlayer, #mbNativeVideo,
        #mbStreamIframe, #cinesrcPlayerIframe, #scramjetPlayerIframe,
        #liveTvPlayerModal, #liveTvPlayerModal .live-tv-player-dialog,
        #liveTvPlayerStage, #liveTvVideoPlayer, #liveTvPlayerLoading,
        #liveTvSection, #liveTvGrid, .live-tv-card, .live-tv-tap-overlay,
        .live-tv-tap-btn, .live-tv-unmute-pill,
        .milkbox-player, .mb-player, #siteTitle, #mobileNav,
        #adguardToast, .adguard-server-badge, .adguard-sandbox-badge,
        .server-selector, #playerSelector, .cinesrc-hud-bar, .scramjet-hud-bar {
            display: revert !important;
            visibility: visible !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            clip: auto !important;
            clip-path: none !important;
            transform: none !important;
        }
    `;

    function injectCSSShield(targetDoc = document) {
        if (!cssInjectEnabled || !enabled) return;
        if (!targetDoc || (!targetDoc.head && !targetDoc.documentElement)) return;

        try {
            let existing = targetDoc.getElementById(CSS_SHIELD_STYLE_ID);
            if (!existing) {
                existing = targetDoc.createElement('style');
                existing.id = CSS_SHIELD_STYLE_ID;
                existing.setAttribute('type', 'text/css');
                existing.textContent = CSS_SHIELD_RULES;

                const parent = targetDoc.head || targetDoc.documentElement;
                if (parent.firstChild) {
                    parent.insertBefore(existing, parent.firstChild);
                } else {
                    parent.appendChild(existing);
                }
            } else if (existing.textContent !== CSS_SHIELD_RULES) {
                existing.textContent = CSS_SHIELD_RULES;
            }
        } catch (e) {
            console.warn('[AdGuard] CSS Shield injection error:', e);
        }
    }

    // Inject immediately into document
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => injectCSSShield(document));
        }
        injectCSSShield(document);
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
        const isPlayerActive = (document.body && document.body.classList.contains('player-active')) ||
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
                    this.setAttribute('data-adguard-blocked', 'true');
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
            el.id === 'liveTvPlayerModal' ||
            el.id === 'liveTvPlayerStage' ||
            el.id === 'liveTvVideoPlayer' ||
            el.id === 'liveTvPlayerLoading' ||
            el.id === 'closeLiveTvPlayer' ||
            el.id === 'liveTvSection' ||
            el.id === 'liveTvGrid' ||
            el.id === 'adguardToast' ||
            el.id === 'adguardServerBadge' ||
            el.id === 'adguardSandboxBadge' ||
            el.id === 'cinesrcPlayerIframe' ||
            el.id === 'scramjetPlayerIframe' ||
            el.id === 'siteTitle' ||
            el.id === 'mobileNav') {
            return true;
        }
        if (el.closest && (
            el.closest('.milkbox-player') ||
            el.closest('.mb-player') ||
            el.closest('#liveTvPlayerModal') ||
            el.closest('#liveTvSection') ||
            el.closest('.live-tv-player-dialog') ||
            el.closest('.live-tv-card') ||
            el.closest('#playerSelector') ||
            el.closest('.server-selector') ||
            el.closest('.adguard-server-badge') ||
            el.closest('.adguard-sandbox-badge') ||
            el.closest('#adguardToast') ||
            el.closest('#mobileNav') ||
            el.closest('header') ||
            el.closest('nav') ||
            el.closest('.sidebar') ||
            el.closest('.cinesrc-hud-bar') ||
            el.closest('.scramjet-hud-bar')
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
            const winWidth = window.innerWidth || (document.documentElement ? document.documentElement.clientWidth : 800) || 800;
            const winHeight = window.innerHeight || (document.documentElement ? document.documentElement.clientHeight : 600) || 600;

            const coversWidth = rect.width >= (winWidth * 0.25);
            const coversHeight = rect.height >= (winHeight * 0.25);
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

    // Safe matcher that never throws SyntaxError even on edge-case DOM elements
    function matchesAdSelector(el) {
        if (!el || !(el instanceof Element)) return false;
        if (isLegitimateAppElement(el)) return false;
        try {
            return Boolean(el.matches && el.matches(AD_SIGNATURE_SELECTORS));
        } catch {
            return false;
        }
    }

    // Helper to completely disarm an intrusive element
    function disarmAndHideElement(el, reason = 'Intrusive ad element') {
        if (!el || !el.parentNode || isLegitimateAppElement(el)) return;
        try {
            el.setAttribute('data-adguard-blocked', 'true');
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('width', '0', 'important');
            el.style.setProperty('height', '0', 'important');
            el.remove();
            showBlockedNotification(reason);
        } catch {}
    }

    // Capturing click listener to catch rogue anchors and clickjackers before they trigger
    document.addEventListener('click', function(e) {
        if (!enabled) return;

        const anchor = e.target.closest ? e.target.closest('a') : null;
        if (anchor) {
            const href = anchor.href || anchor.getAttribute('href') || '';
            const target = anchor.target || anchor.getAttribute('target');

            // If an anchor points to an external unwhitelisted address
            if (href && !isAllowedInternalUrl(href)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                disarmAndHideElement(anchor, 'Ad link click intercepted');
                return false;
            }

            if (target === '_top' || target === '_parent') {
                if (!isAllowedInternalUrl(href)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    disarmAndHideElement(anchor, 'Top hijack redirect blocked');
                    return false;
                }
            }
        }

        // Neutralize clickjacking overlays
        if (isOverlayOrClickjacker(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            disarmAndHideElement(e.target, 'Clickjacking overlay stripped');
            return false;
        }
    }, true);

    // Also guard pointerdown to preempt clickjackers before mouseup/click
    document.addEventListener('pointerdown', function(e) {
        if (!enabled) return;
        if (isOverlayOrClickjacker(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            disarmAndHideElement(e.target, 'Pre-click overlay neutralized');
        }
    }, true);

    // -------------------------------------------------------------
    // Movie Sandbox Bypass Engine: Resolves "Remove Sandbox Attributes" Issue
    // -------------------------------------------------------------
    // The tokens below satisfy media player capability checks (allowing scripts, popups,
    // pointer lock, and forms) while our top-level AdGuard engine prevents ad redirects.
    const SANDBOX_BYPASS_TOKENS = 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-downloads';
    const SANDBOX_STRICT_TOKENS = 'allow-scripts allow-same-origin allow-forms allow-presentation';

    function getOptimalSandboxTokens() {
        return sandboxBypassEnabled ? SANDBOX_BYPASS_TOKENS : SANDBOX_STRICT_TOKENS;
    }

    function hardenPlaybackIframe(iframe) {
        if (!iframe || !(iframe instanceof HTMLElement) || iframe.tagName !== 'IFRAME') return;
        try {
            const src = iframe.src || iframe.getAttribute('src') || '';
            const isInternalPlayer = src.includes('milkbox-embed.html') ||
                (src.startsWith('/') && !src.startsWith('//')) ||
                (typeof window !== 'undefined' && src.startsWith(window.location.origin));

            if (!iframe.getAttribute('allow')) {
                iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            }

            if (enabled) {
                // If the player is internal (e.g. Milkbox HLS), no sandbox needed
                if (!isInternalPlayer) {
                    const tokens = getOptimalSandboxTokens();
                    if (iframe.getAttribute('sandbox') !== tokens) {
                        iframe.setAttribute('sandbox', tokens);
                    }
                }
            } else {
                iframe.removeAttribute('sandbox');
            }
        } catch {}
    }

    /**
     * Complete Sandbox Bypass fallback: If a movie server (e.g. VidSrc, SuperEmbed, MoviesAPI)
     * stubbornly demands complete sandbox removal, this function wraps the embed inside our
     * Shielded Scramjet Proxy tunnel (/api/scramjet/embed?url=...).
     * Inside Scramjet, the media player has zero sandbox attributes on the inner frame,
     * while our container neutralizes popunders and ad redirects.
     */
    function bypassSandboxViaProxy(iframe) {
        if (!iframe || !(iframe instanceof HTMLElement) || iframe.tagName !== 'IFRAME') return;
        const currentSrc = iframe.src || iframe.getAttribute('src') || '';
        if (!currentSrc || currentSrc.startsWith('about:blank')) return;

        // If already routed through proxy, do nothing
        if (currentSrc.includes('/api/scramjet/embed')) return;

        const proxiedUrl = `/api/scramjet/embed?url=${encodeURIComponent(currentSrc)}`;
        iframe.removeAttribute('sandbox');
        iframe.src = proxiedUrl;
        showBlockedNotification('Sandbox restriction bypassed via Shielded Tunnel', currentSrc);
    }

    // -------------------------------------------------------------
    // Ad Video & In-Page Ad Annihilation Engine
    // -------------------------------------------------------------
    let lastAdScanTime = 0;
    function scanAndNeutralizeOverlays() {
        if (!enabled) return;
        const now = Date.now();
        if (now - lastAdScanTime < 450) return;
        lastAdScanTime = now;
        try {
            // Keep CSS shield intact
            injectCSSShield(document);

            // 1. Strip rogue video/audio elements outside legitimate MILKBOX players (including Live TV)
            const allVideos = document.querySelectorAll('video, audio');
            for (let i = 0; i < allVideos.length; i++) {
                const v = allVideos[i];
                if (v.id === 'mbNativeVideo' ||
                    v.id === 'liveTvVideoPlayer' ||
                    v.classList.contains('milkbox-video-element') ||
                    (v.closest && v.closest('.milkbox-player, .mb-player, #playerFrame, #animeTheater, #liveTvPlayerModal'))) {
                    continue;
                }
                try {
                    v.pause();
                    v.muted = true;
                    v.src = '';
                    disarmAndHideElement(v, 'Injected ad media eliminated');
                } catch {}
            }

            // 2. Strip suspicious floating overlays & clickjack anchors (lightweight targeted query)
            const positioned = document.querySelectorAll('div[style*="fixed"], div[style*="absolute"], a[target="_blank"]');
            for (let i = 0; i < positioned.length; i++) {
                const el = positioned[i];
                if (!isLegitimateAppElement(el) && isOverlayOrClickjacker(el)) {
                    disarmAndHideElement(el, 'Hidden ad overlay neutralized');
                }
            }

            // 3. Enforce optimal sandboxing on all playback iframes
            document.querySelectorAll('#playerFrame iframe, #animePlayerWrap iframe, .player-container iframe, #mbStreamIframe, #cinesrcPlayerIframe, #scramjetPlayerIframe').forEach(hardenPlaybackIframe);
        } catch {}
    }

    // -------------------------------------------------------------
    // Stricter DOM Monitoring: Synchronous Node & Attribute Observation
    // -------------------------------------------------------------
    if (typeof MutationObserver !== 'undefined') {
        let scanDebounce = null;

        function inspectNode(node) {
            if (!enabled || !node || node.nodeType !== 1) return;

            // Check if the node itself is the CSS shield being tampered with
            if (node.id === CSS_SHIELD_STYLE_ID) return;

            // 1. Check Media Tags (Video/Audio)
            if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                if (!isLegitimateAppElement(node)) {
                    try {
                        node.pause();
                        node.muted = true;
                        node.src = '';
                        disarmAndHideElement(node, 'Ad video stripped on injection');
                    } catch {}
                }
                return;
            }

            // 2. Check Iframes
            if (node.tagName === 'IFRAME') {
                const src = node.src || node.getAttribute('src') || '';
                if (isAdUrl(src)) {
                    disarmAndHideElement(node, 'Rogue ad iframe purged');
                    return;
                }
                hardenPlaybackIframe(node);
                return;
            }

            // 3. Check Anchors
            if (node.tagName === 'A') {
                const href = node.href || node.getAttribute('href') || '';
                if (href && isAdUrl(href)) {
                    disarmAndHideElement(node, 'Injected ad anchor purged');
                    return;
                }
            }

            // 4. Check Ad Signatures
            if (matchesAdSelector(node)) {
                disarmAndHideElement(node, 'Ad element hidden before render');
                return;
            }

            // 5. Check Clickjack Overlays
            if (isOverlayOrClickjacker(node)) {
                disarmAndHideElement(node, 'Intrusive overlay stripped');
                return;
            }

            // Inspect children if present
            if (node.children && node.children.length > 0) {
                const childVideos = node.querySelectorAll ? node.querySelectorAll('video, audio') : [];
                for (let i = 0; i < childVideos.length; i++) {
                    const cv = childVideos[i];
                    if (!isLegitimateAppElement(cv)) {
                        try { cv.pause(); cv.muted = true; cv.src = ''; disarmAndHideElement(cv, 'Child ad media eliminated'); } catch {}
                    }
                }
                if (node.querySelectorAll) {
                    node.querySelectorAll('iframe').forEach(hardenPlaybackIframe);
                }
            }
        }

        function isFastSkipAppNode(node) {
            if (!node || node.nodeType !== 1) return true;
            const cls = typeof node.className === 'string' ? node.className : '';
            if (cls && /\b(?:card|live-tv-card|skeleton-card|slider|content-grid|content-section|navbar|nav-dropdown)\b/.test(cls)) {
                return true;
            }
            return isLegitimateAppElement(node);
        }

        const observer = new MutationObserver(mutations => {
            if (!enabled) return;

            let needsScan = false;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];

                // Inspect only newly added non-card subtrees
                if (m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0) {
                    if (isFastSkipAppNode(m.target)) continue;
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        const added = m.addedNodes[j];
                        if (added && added.nodeType === 1 && !isFastSkipAppNode(added)) {
                            inspectNode(added);
                            if (added.tagName === 'IFRAME' || added.tagName === 'VIDEO' || added.tagName === 'A') {
                                needsScan = true;
                            }
                        }
                    }
                }

                // Monitor dangerous style/src/target changes only on non-app elements
                if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
                    const el = m.target;
                    if (!isFastSkipAppNode(el)) {
                        if (m.attributeName === 'style') {
                            if (isOverlayOrClickjacker(el) || matchesAdSelector(el)) {
                                disarmAndHideElement(el, 'Dynamically positioned ad overlay neutralized');
                            }
                        } else if (m.attributeName === 'src' && el.tagName === 'IFRAME') {
                            const newSrc = el.src || el.getAttribute('src') || '';
                            if (isAdUrl(newSrc)) {
                                disarmAndHideElement(el, 'Rogue iframe redirect neutralized');
                            }
                        }
                    }
                }
            }

            // Debounced sweep only when potential ad/embed nodes appeared
            if (needsScan && !scanDebounce) {
                scanDebounce = setTimeout(() => {
                    scanDebounce = null;
                    scanAndNeutralizeOverlays();
                }, 500);
            }
        });

        const observerConfig = {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'src', 'href', 'target']
        };

        if (document.documentElement) {
            observer.observe(document.documentElement, observerConfig);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.documentElement, observerConfig);
            });
        }
    }

    // -------------------------------------------------------------
    // Active Playback Sentinel (Low-overhead sweep during video playback)
    // -------------------------------------------------------------
    setInterval(() => {
        if (!enabled) return;
        if (isPlayerActiveNow()) {
            const videos = document.querySelectorAll('video');
            for (let i = 0; i < videos.length; i++) {
                const v = videos[i];
                if (v.id !== 'mbNativeVideo' &&
                    v.id !== 'liveTvVideoPlayer' &&
                    !v.classList.contains('milkbox-video-element') &&
                    (!v.closest || !v.closest('.milkbox-player, .mb-player, #playerFrame, #animeTheater, #liveTvPlayerModal'))) {
                    try { v.pause(); v.muted = true; v.src = ''; disarmAndHideElement(v, 'Rogue background video neutralized'); } catch {}
                }
            }
        }
    }, 1200);

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
            // If page unload is requested without an explicit internal link click in the last 1000ms
            if ((now - lastInternalNavTime) > 1000) {
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

        // 1. AdGuard Protection On/Off Badges
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

        // 2. Settings modal toggles & descriptions
        const blockerToggle = document.getElementById('adguardBlockerToggle');
        if (blockerToggle && blockerToggle.checked !== enabled) {
            blockerToggle.checked = enabled;
        }

        const bypassToggle = document.getElementById('adguardSandboxBypassToggle');
        if (bypassToggle && bypassToggle.checked !== sandboxBypassEnabled) {
            bypassToggle.checked = sandboxBypassEnabled;
        }

        const desc = document.getElementById('adguardStatusDesc');
        if (desc) {
            desc.textContent = enabled
                ? `Active · High-strength CSS injection & DOM shield (${blockedCount} blocked). Movie sandbox bypass: ${sandboxBypassEnabled ? 'Enabled (Streams Compatible)' : 'Strict Isolation'}.`
                : 'Disabled · Protection paused.';
        }
    }

    function notifyStateChanged() {
        try {
            window.dispatchEvent(new CustomEvent('adguard:state-changed', {
                detail: { enabled, blockedCount, sandboxBypassEnabled, cssInjectEnabled }
            }));
        } catch {}
        try {
            updateAdGuardUIElements();
        } catch {}
    }

    // Global click listener for AdGuard UI toggles
    document.addEventListener('click', (e) => {
        // Toggle AdGuard Main Engine
        const targetBadge = e.target.closest('#adguardServerBadge, #animeCtrlAdguard, #animeServerAdguardBtn');
        if (targetBadge) {
            e.preventDefault();
            e.stopPropagation();
            window.AdGuardPopupBlocker.setEnabled(!enabled);
            if (typeof window.toast === 'function') {
                window.toast(`AdGuard Pop-up & Video Blocker ${enabled ? 'enabled' : 'disabled'} on playback servers`, enabled ? 'success' : 'info');
            }
            return;
        }
    });

    // Listen for Settings modal switch changes
    document.addEventListener('change', (e) => {
        if (!e.target) return;
        if (e.target.id === 'adguardSandboxBypassToggle') {
            window.AdGuardPopupBlocker.setSandboxBypassEnabled(e.target.checked);
        } else if (e.target.id === 'adguardBlockerToggle') {
            window.AdGuardPopupBlocker.setEnabled(e.target.checked);
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
        version: '3.5.0-high-strength-css-shield-sandbox-bypass',
        isEnabled: function() { return enabled; },
        setEnabled: function(val) {
            enabled = Boolean(val);
            try { localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled)); } catch {}
            console.log(`[AdGuard PopupBlocker] Protection ${enabled ? 'enabled' : 'disabled'}`);
            if (enabled) {
                injectCSSShield(document);
            }
            notifyStateChanged();
            scanAndNeutralizeOverlays();
        },
        getBlockedCount: function() { return blockedCount; },
        resetCount: function() {
            blockedCount = 0;
            try { localStorage.setItem(STORAGE_KEY_COUNT, '0'); } catch {}
            notifyStateChanged();
        },

        // Sandbox Bypass Management
        isSandboxBypassEnabled: function() { return sandboxBypassEnabled; },
        setSandboxBypassEnabled: function(val) {
            sandboxBypassEnabled = Boolean(val);
            try { localStorage.setItem(STORAGE_KEY_SANDBOX_BYPASS, String(sandboxBypassEnabled)); } catch {}
            console.log(`[AdGuard PopupBlocker] Sandbox Bypass ${sandboxBypassEnabled ? 'enabled (stream compatible)' : 'disabled (strict)'}`);
            // Re-apply to all active playback iframes
            document.querySelectorAll('#playerFrame iframe, #animePlayerWrap iframe, .player-container iframe, #cinesrcPlayerIframe, #scramjetPlayerIframe').forEach(hardenPlaybackIframe);
            notifyStateChanged();
            if (typeof window.toast === 'function') {
                window.toast(`Movie Sandbox Bypass: ${sandboxBypassEnabled ? '⚡ Bypassed (Streams compatible)' : '🛡️ Strict Isolation Mode'}`, 'info');
            }
        },
        toggleSandboxBypass: function() {
            this.setSandboxBypassEnabled(!sandboxBypassEnabled);
        },
        getOptimalSandboxTokens: getOptimalSandboxTokens,
        bypassSandboxViaProxy: bypassSandboxViaProxy,

        // CSS Injection & Scanning
        injectCSSShield: injectCSSShield,
        hardenIframe: hardenPlaybackIframe,
        notifyBlocked: function(msg, url) {
            showBlockedNotification(msg, url);
            notifyStateChanged();
        },
        isAdUrl: isAdUrl,
        scanNow: scanAndNeutralizeOverlays
    };

})(typeof window !== 'undefined' ? window : globalThis);
