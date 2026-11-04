
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

    
    let lastUserInteractionTime = 0;
    const TRUSTED_INTERACTION_WINDOW_MS = 600;

    function recordUserInteraction(e) {
        if (!e) return;
        if (e.isTrusted) {
            lastUserInteractionTime = Date.now();
        }
    }

    ['mousedown', 'mouseup', 'click', 'keydown', 'touchstart'].forEach(type => {
        try {
            window.addEventListener(type, recordUserInteraction, { capture: true, passive: true });
        } catch {}
    });

    
    const AD_DOMAINS_REGEX = /(?:doubleclick|googlesyndication|googleads|adservice|popads|popcash|exoclick|propellerads|adsterra|onclkds|trafficjunky|adnxs|adsystem|criteo|outbrain|taboola|mgid|clickadilla|a-ads|coinzilla|bet365|1xbet|parimatch|monetag|hilltopads|richpush|admaven|yllix|clickadu|infolinks|adcash|revenuehits|galaksion|bidvertiser|trafficstars|adxad|plugrush|ero-advertising|juicyads|chaturbate|bongacams|stripchat|livejasmin|rtmark|creativecdn|syndication|creative-serving|vidsrc-stream|vidcloud-ad|clickshield|onclickmega|tracking|trackingdesk|affiliates?|promotions?|landingpage|redirect|trackurl)/i;

    function isAdUrl(rawUrl) {
        if (!rawUrl) return false;
        const str = String(rawUrl).trim().toLowerCase();
        if (str === 'about:blank' || str === '') return false;
        if (str.startsWith('blob:') || str.startsWith('data:') || str.startsWith('javascript:')) return false;
        if (AD_DOMAINS_REGEX.test(str)) return true;
        if (/\/pop(?:up|under)?[\/?#]/i.test(str) || /\/ad(?:s|server|tag)?[\/?#]/i.test(str)) return true;
        return false;
    }

    function isAllowedInternalUrl(rawUrl) {
        if (!rawUrl) return true;
        const str = String(rawUrl).trim();
        if (str === 'about:blank' || str === '') return true;
        if (str.startsWith('blob:') || str.startsWith('data:')) return true;
        if (str.startsWith('https://accounts.google.com/') || str.startsWith('https://drive.google.com/')) return true;
        if (str.startsWith('https://console.cloud.google.com/') || str.startsWith('https://console.firebase.google.com/')) return true;
        if (str.startsWith('https://www.youtube.com/embed/') || str.startsWith('https://www.youtube-nocookie.com/embed/')) return true;
        if (str.startsWith('https://discord.gg/') || str.startsWith('https://github.com/')) return true;
        if (str.startsWith('https://api.themoviedb.org/') || str.startsWith('https://image.tmdb.org/')) return true;
        return false;
    }

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

        console.info(`[AdGuard PopupBlocker] Blocked: ${message} (${url || 'no URL'}) · Total blocked: ${blockedCount}`);

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
                    'border: 1px solid rgba(74, 222, 128, 0.35)',
                    'border-radius: 10px',
                    'padding: 10px 16px',
                    'color: #ffffff',
                    'font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    'font-size: 13px',
                    'font-weight: 500',
                    'display: flex',
                    'align-items: center',
                    'gap: 10px',
                    'box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(74, 222, 128, 0.15)',
                    'transition: opacity 0.25s ease, transform 0.25s ease',
                    'opacity: 0',
                    'transform: translateY(12px)',
                    'pointer-events: none',
                    'max-width: 360px',
                    'line-height: 1.4'
                ].join(';');

                toastContainer.innerHTML = [
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">',
                    '  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
                    '  <path d="m9 12 2 2 4-4"></path>',
                    '</svg>',
                    '<div style="flex:1;">',
                    '  <div style="font-weight:700; color:#4ade80; font-size:12px; letter-spacing:0.3px; text-transform:uppercase;">AdGuard Pop-up Blocker</div>',
                    '  <div id="adguardToastMsg" style="color:#d1d5db; font-size:12px;">Pop-up ad blocked</div>',
                    '</div>'
                ].join('');
                document.body.appendChild(toastContainer);
            }
        }

        const msgEl = document.getElementById('adguardToastMsg');
        if (msgEl) {
            msgEl.textContent = `Blocked unwanted pop-up (${blockedCount} total)`;
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


    const originalWindowOpen = window.open;

    function isPlayerActiveNow() {
        if (typeof document === 'undefined') return false;
        const playerModal = document.getElementById('playerModal');
        const animeTheater = document.getElementById('animeTheater');
        const isPlayerActive = document.body.classList.contains('player-active') ||
            (playerModal && playerModal.classList.contains('active')) ||
            (animeTheater && animeTheater.style.display !== 'none');
        return Boolean(isPlayerActive);
    }

    function interceptedOpen(url, target, features) {
        if (!enabled) {
            return originalWindowOpen.call(window, url, target, features);
        }

        const targetStr = String(url || '').trim();

   
        if (targetStr.startsWith('https://accounts.google.com/') || targetStr.startsWith('https://drive.google.com/')) {
            return originalWindowOpen.call(window, url, target, features);
        }

        const now = Date.now();
        const hasRecentTrustedUserInteraction = (now - lastUserInteractionTime) <= TRUSTED_INTERACTION_WINDOW_MS;
        const inPlayerContext = isPlayerActiveNow();

       
        if (inPlayerContext) {
            const isExplicitSafeLink = targetStr.startsWith('https://www.youtube.com/embed/') ||
                                       targetStr.startsWith('https://discord.gg/') ||
                                       targetStr.startsWith('https://github.com/');
            if (!isExplicitSafeLink) {
                showBlockedNotification('Playback server pop-up ad blocked', targetStr || 'blank pop-up');
                return createMockWindow(targetStr);
            }
        }

       
        if (isAdUrl(targetStr)) {
            showBlockedNotification('Ad URL blocked', targetStr);
            return createMockWindow(targetStr);
        }

        
        if (targetStr === '' || targetStr === 'about:blank') {
            showBlockedNotification('Blank pop-up ad blocked', targetStr);
            return createMockWindow(targetStr);
        }

        
        if (isAllowedInternalUrl(targetStr) && hasRecentTrustedUserInteraction) {
            return originalWindowOpen.call(window, url, target, features);
        }

        
        if (!hasRecentTrustedUserInteraction) {
            showBlockedNotification('Unrequested pop-up prevented', targetStr);
            return createMockWindow(targetStr);
        }

        
        if (target === '_blank' && !targetStr.startsWith(window.location.origin) && !isAllowedInternalUrl(targetStr)) {
            showBlockedNotification('Pop-under blocked', targetStr);
            return createMockWindow(targetStr);
        }

        return originalWindowOpen.call(window, url, target, features);
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

    
    const originalElementClick = window.HTMLElement && window.HTMLElement.prototype ? window.HTMLElement.prototype.click : null;

    if (originalElementClick) {
        window.HTMLElement.prototype.click = function() {
            if (!enabled) return originalElementClick.call(this);

            if (this instanceof HTMLAnchorElement) {
                const href = this.href || this.getAttribute('href') || '';
                const target = this.target || this.getAttribute('target');
                const isAd = isAdUrl(href);

                const now = Date.now();
                const hasRecentUser = (now - lastUserInteractionTime) <= TRUSTED_INTERACTION_WINDOW_MS;

                if (isAd || (!hasRecentUser && target === '_blank')) {
                    showBlockedNotification('Programmatic ad link click prevented', href);
                    return;
                }
            }

            return originalElementClick.call(this);
        };
    }

 
    document.addEventListener('click', function(e) {
        if (!enabled) return;

        const anchor = e.target.closest('a');
        if (anchor) {
            const href = anchor.href || anchor.getAttribute('href') || '';
            if (isAdUrl(href)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                showBlockedNotification('Ad link click blocked', href);
                return false;
            }

           
            if (isOverlayAnchor(anchor)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                anchor.remove();
                showBlockedNotification('Clickjacking overlay removed', href);
                return false;
            }
        }
    }, true);

   
    function isOverlayAnchor(el) {
        if (!el || !(el instanceof HTMLElement)) return false;
        try {
            const style = window.getComputedStyle(el);
            const isPositioned = style.position === 'fixed' || style.position === 'absolute';
            if (!isPositioned) return false;

            const zIndex = parseInt(style.zIndex, 10);
            if (isNaN(zIndex) || zIndex < 100) return false;

            const rect = el.getBoundingClientRect();
            const winWidth = window.innerWidth || document.documentElement.clientWidth || 800;
            const winHeight = window.innerHeight || document.documentElement.clientHeight || 600;

           
            const coversWidth = rect.width >= (winWidth * 0.5);
            const coversHeight = rect.height >= (winHeight * 0.5);
            const isTransparent = style.opacity === '0' || style.backgroundColor.includes('rgba(0, 0, 0, 0)') || style.visibility === 'hidden';

            if (coversWidth && coversHeight && isTransparent) {
                return true;
            }
        } catch {}
        return false;
    }

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
                ? `Active · Built-in AdGuard engine protects video playback and site navigation (${blockedCount} blocked).`
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
            window.toast(`AdGuard Pop-up Blocker ${enabled ? 'enabled' : 'disabled'} on playback servers`, enabled ? 'success' : 'info');
        }
    });

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateAdGuardUIElements);
        } else {
            setTimeout(updateAdGuardUIElements, 50);
        }
    }

    
    const CLOUD_SERVER_DOMAINS = /(?:phantom|cinesrc|vidsrc|vidcore|videasy|vidy|multiembed|moviesapi|autoembed|yapgrid|embedflix|vidlink|vidspark|vidrock|vidflix|vidlux|vidsrcme|vidsrc\.in|vidsrc\.io|vsembed|2embed|embed\.su|vidfast|wfs\.lol|toustream|vidhawk|anixo|megavid|kisskh|smashystream|superembed|nontongo|miruro|megaplay|anikoto)/i;

    function hardenPlaybackIframe(iframe) {
        if (!iframe || !(iframe instanceof HTMLElement) || iframe.tagName !== 'IFRAME') return;
        try {
            
            iframe.removeAttribute('sandbox');
            if (!iframe.getAttribute('allow')) {
                iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
            }
        } catch {}
    }

    
    let lastPlayerInteractionTime = 0;
    ['mousedown', 'touchstart', 'click', 'pointerdown'].forEach(evt => {
        document.addEventListener(evt, (e) => {
            if (e.target && (e.target.closest('#playerContainer') || e.target.closest('#animePlayerWrap') || e.target.closest('#playerFrame'))) {
                lastPlayerInteractionTime = Date.now();
            }
        }, { capture: true, passive: true });
    });

    

    function scanAndNeutralizeOverlays() {
        if (!enabled) return;
        try {
            const anchors = document.querySelectorAll('a[target="_blank"], div[style*="fixed"], div[style*="absolute"]');
            for (let i = 0; i < anchors.length; i++) {
                const el = anchors[i];
                if (el.id === 'playerPopupShield' || el.id === 'playerFrame' || el.closest('#playerSelector') || el.closest('.server-selector') || el.closest('.adguard-server-badge')) {
                    continue; 
                }
                if (isOverlayAnchor(el)) {
                    el.remove();
                    showBlockedNotification('Hidden ad overlay neutralized', el.getAttribute('href') || '');
                }
            }

            
            document.querySelectorAll('#playerFrame iframe, #animePlayerWrap iframe, .player-container iframe').forEach(hardenPlaybackIframe);
        } catch {}
    }

    
    if (typeof MutationObserver !== 'undefined') {
        let overlayScanDebounce = null;
        const observer = new MutationObserver(mutations => {
            if (!enabled) return;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.addedNodes && m.addedNodes.length > 0) {
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        const node = m.addedNodes[j];
                        if (node.nodeType === 1) { // Element node
                            if (node instanceof HTMLAnchorElement && isOverlayAnchor(node)) {
                                node.remove();
                                showBlockedNotification('Ad overlay stripped on injection', node.href);
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

            if (!overlayScanDebounce) {
                overlayScanDebounce = setTimeout(() => {
                    overlayScanDebounce = null;
                    scanAndNeutralizeOverlays();
                }, 180);
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

    
    try {
        const origAssign = window.location.assign ? window.location.assign.bind(window.location) : null;
        const origReplace = window.location.replace ? window.location.replace.bind(window.location) : null;

        if (origAssign) {
            window.location.assign = function(url) {
                if (enabled && isAdUrl(String(url))) {
                    showBlockedNotification('Location redirect blocked', url);
                    return;
                }
                return origAssign(url);
            };
        }

        if (origReplace) {
            window.location.replace = function(url) {
                if (enabled && isAdUrl(String(url))) {
                    showBlockedNotification('Location replace blocked', url);
                    return;
                }
                return origReplace(url);
            };
        }
    } catch {}

    
    window.AdGuardPopupBlocker = {
        name: 'AdGuard PopupBlocker for MILKBOX',
        version: '2.6.0-playback-protected',
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
        isAdUrl: isAdUrl
    };

})(typeof window !== 'undefined' ? window : globalThis);
