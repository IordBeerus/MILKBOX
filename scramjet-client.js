/**
 * Scramjet Client for MILKBOX - Enhanced with Fallback Support
 * Handles modern web proxy functionality with WISP gateway support
 * Integrates with MercuryWorkshop's Scramjet: https://github.com/MercuryWorkshop/scramjet
 * 
 * Features fallback mechanisms for network restrictions and Chrome blocking
 */

// Primary and fallback WISP endpoints
const WISP_URLS = [
    'wss://wisp.classroom.lat/',
    'wss://wisp.works/',
    'wss://wisp.moe/',
    'wss://wisp-gateway.works/'
];

const WISP_URL = WISP_URLS[0]; // Default primary endpoint

class ScramjetClient {
    constructor(options = {}) {
        this.primaryWispUrl = options.wispUrl || WISP_URL;
        this.wispUrls = Array.isArray(options.wispUrls) && options.wispUrls.length ? options.wispUrls : WISP_URLS;
        this.currentWispIndex = 0;
        this.wispSocket = null;
        this.isConnected = false;
        this.useDirectProxy = false; // Fallback to direct proxy if WebSocket fails
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.messageHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 3;
        this.reconnectDelay = options.reconnectDelay || 2000;
        this.autoReconnect = options.autoReconnect !== false;
        this.onConnect = options.onConnect || (() => {});
        this.onDisconnect = options.onDisconnect || (() => {});
        this.onError = options.onError || (() => {});
        this.onReconnectAttempt = options.onReconnectAttempt || (() => {});
        this.onFallback = options.onFallback || (() => {});
        this.supportsWebSocket = this._checkWebSocketSupport();
        this._connectPromise = null;
    }

    _checkWebSocketSupport() {
        try {
            return typeof WebSocket !== 'undefined' && WebSocket !== null;
        } catch {
            return false;
        }
    }

    _activateDirectProxy(reason) {
        this.useDirectProxy = true;
        this.isConnected = true;
        this.wispSocket = null;
        if (reason && typeof window !== 'undefined' && window._scramjetDebug) {
            console.log(`[Scramjet] ${reason}, using direct proxy mode`);
        }
        try { this.onFallback('direct-proxy'); } catch {}
        try { this.onConnect(); } catch {}
    }

    async _checkLocalProxyStatus() {
        if (typeof fetch !== 'function') return null;
        try {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), 1500) : null;
            const res = await fetch('/api/scramjet/status', {
                method: 'GET',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            if (timer) clearTimeout(timer);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    connect(timeout = 5000, options = {}) {
        if (this.isConnected) {
            return Promise.resolve();
        }
        if (this._connectPromise) {
            return this._connectPromise;
        }

        const run = async () => {
            // Check local server proxy status first so we avoid spamming dead external WebSocket hosts
            if (!options.forceWisp) {
                const status = await this._checkLocalProxyStatus();
                if (status && status.ok && status.directProxyReady && status.wispReachable === false) {
                    this._activateDirectProxy('External WISP gateway unreachable');
                    return;
                }
            }

            // If WebSocket is not supported, fallback to direct proxy
            if (!this.supportsWebSocket) {
                this._activateDirectProxy('WebSocket not supported');
                return;
            }

            this.currentWispIndex = 0;
            const perEndpointTimeout = Math.min(Number(timeout) || 3000, 2500);
            await this._connectToWisp(perEndpointTimeout);
        };

        this._connectPromise = run().finally(() => {
            this._connectPromise = null;
        });

        return this._connectPromise;
    }

    _cleanupSocket(socket) {
        if (!socket) return;
        try {
            socket.onopen = null;
            socket.onmessage = null;
            socket.onerror = null;
            socket.onclose = null;
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                socket.close();
            }
        } catch {}
    }

    _connectToWisp(timeout) {
        if (this.currentWispIndex >= this.wispUrls.length) {
            this._activateDirectProxy('All WISP endpoints unavailable');
            return Promise.resolve();
        }

        const wispUrl = this.wispUrls[this.currentWispIndex];

        return new Promise((resolve) => {
            let settled = false;
            let didOpen = false;
            let socket = null;

            const advanceToNext = (reason) => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimeout);
                this._cleanupSocket(socket);
                if (this.wispSocket === socket) {
                    this.wispSocket = null;
                }
                if (reason && typeof window !== 'undefined' && window._scramjetDebug) {
                    console.log(`[Scramjet] ${reason} on ${wispUrl}, trying next fallback`);
                }
                this.currentWispIndex++;
                this._connectToWisp(timeout).then(resolve);
            };

            const connectTimeout = setTimeout(() => {
                if (!didOpen) {
                    advanceToNext('Connection timed out');
                }
            }, timeout);

            try {
                socket = new WebSocket(wispUrl);
                this.wispSocket = socket;

                socket.onopen = () => {
                    if (settled) {
                        this._cleanupSocket(socket);
                        return;
                    }
                    settled = true;
                    didOpen = true;
                    clearTimeout(connectTimeout);
                    this.isConnected = true;
                    this.useDirectProxy = false;
                    this.reconnectAttempts = 0;
                    console.log(`[Scramjet] Connected to WISP gateway: ${wispUrl}`);
                    try { this.onConnect(); } catch {}
                    resolve();
                };

                socket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                socket.onerror = () => {
                    const errInfo = new Error(`WISP connection unavailable for ${wispUrl}`);
                    try { this.onError(errInfo); } catch {}
                    if (!didOpen) {
                        advanceToNext('Connection error');
                    }
                };

                socket.onclose = () => {
                    clearTimeout(connectTimeout);
                    if (!didOpen) {
                        advanceToNext('Connection closed');
                        return;
                    }

                    this.isConnected = false;
                    if (this.wispSocket === socket) {
                        this.wispSocket = null;
                    }
                    console.log(`[Scramjet] Disconnected from ${wispUrl}`);
                    try { this.onDisconnect(); } catch {}

                    if (this.autoReconnect) {
                        if (this.reconnectAttempts < this.maxReconnectAttempts) {
                            this.reconnectAttempts++;
                            try { this.onReconnectAttempt(this.reconnectAttempts); } catch {}
                            setTimeout(() => {
                                this._connectToWisp(timeout).catch(() => {});
                            }, this.reconnectDelay);
                        } else {
                            this._activateDirectProxy('Max WISP reconnect attempts reached');
                        }
                    }
                };
            } catch (error) {
                advanceToNext(`Failed to initialize WebSocket (${error?.message || 'error'})`);
            }
        });
    }

    disconnect() {
        this.autoReconnect = false;
        if (this.wispSocket) {
            this._cleanupSocket(this.wispSocket);
            this.wispSocket = null;
        }
        this.isConnected = false;
    }

    handleMessage(data) {
        try {
            const message = typeof data === 'string' ? JSON.parse(data) : data;

            // Handle request responses
            if (message.id && this.pendingRequests.has(message.id)) {
                const { resolve, reject, timeout } = this.pendingRequests.get(message.id);
                clearTimeout(timeout);
                this.pendingRequests.delete(message.id);

                if (message.error) {
                    reject(new Error(message.error));
                } else {
                    resolve(message.data || message);
                }
            }

            // Handle subscribed messages
            if (message.type && this.messageHandlers.has(message.type)) {
                const handlers = this.messageHandlers.get(message.type);
                handlers.forEach(handler => {
                    try {
                        handler(message.data || message);
                    } catch (e) {
                        console.warn('[Scramjet] Handler error:', e?.message || e);
                    }
                });
            }
        } catch (error) {
            console.warn('[Scramjet] Failed to parse message:', error?.message || error);
        }
    }

    send(command, data = {}, timeout = 30000) {
        if (this.useDirectProxy) {
            console.warn('[Scramjet] Using direct proxy mode, send command not available');
            return Promise.reject(new Error('WebSocket not connected, using direct proxy'));
        }

        if (!this.isConnected || !this.wispSocket) {
            return Promise.reject(new Error('WISP gateway not connected'));
        }

        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            const timeoutHandle = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request ${id} (${command}) timed out`));
            }, timeout);

            this.pendingRequests.set(id, { resolve, reject, timeout: timeoutHandle });

            try {
                this.wispSocket.send(JSON.stringify({
                    id,
                    command,
                    data
                }));
            } catch (error) {
                clearTimeout(timeoutHandle);
                this.pendingRequests.delete(id);
                reject(error);
            }
        });
    }

    subscribe(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);

        return () => {
            const handlers = this.messageHandlers.get(type);
            const index = handlers.indexOf(handler);
            if (index > -1) handlers.splice(index, 1);
            if (handlers.length === 0) this.messageHandlers.delete(type);
        };
    }

    /**
     * Create a proxied URL for a given target URL
     * Used for direct resource access (images, API calls, etc.)
     */
    createProxyUrl(targetUrl, options = {}) {
        const params = new URLSearchParams({ url: targetUrl });
        if (options.headers) params.set('headers', JSON.stringify(options.headers));
        if (options.timeout) params.set('timeout', options.timeout);
        return `/api/scramjet/proxy?${params.toString()}`;
    }

    /**
     * Create an embedded proxy frame
     * Used for video player embeds with UI controls
     * Falls back to direct embed if proxy is unavailable
     */
    createEmbedUrl(targetUrl, options = {}) {
        const params = new URLSearchParams({ url: targetUrl });
        if (options.autoplay) params.set('autoplay', 'true');
        if (options.theme) params.set('theme', options.theme);
        return `/api/scramjet/embed?${params.toString()}`;
    }

    /**
     * Fetch a resource through the proxy
     */
    async fetchProxy(targetUrl, options = {}) {
        if (!this.isConnected) {
            await this.connect();
        }

        try {
            const response = await fetch(this.createProxyUrl(targetUrl), {
                method: 'GET',
                headers: options.headers || {},
                signal: options.signal,
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            console.warn('[Scramjet] Proxy fetch failed:', error?.message || error);
            throw error;
        }
    }

    /**
     * Get current connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            useDirectProxy: this.useDirectProxy,
            primaryWispUrl: this.primaryWispUrl,
            currentWispUrl: this.useDirectProxy ? null : (this.wispUrls[this.currentWispIndex] || null),
            attemptsRemaining: this.useDirectProxy ? 0 : Math.max(0, this.wispUrls.length - this.currentWispIndex),
            pendingRequests: this.pendingRequests.size,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            websocketSupported: this.supportsWebSocket
        };
    }

    /**
     * Get or create a singleton instance
     */
    static getInstance(options = {}) {
        if (!window._scramjetClientInstance) {
            window._scramjetClientInstance = new ScramjetClient(options);
        }
        return window._scramjetClientInstance;
    }
}

// Export for use in Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScramjetClient, WISP_URL, WISP_URLS };
}

if (typeof window !== 'undefined') {
    window.ScramjetClient = ScramjetClient;
    window.SCRAMJET_WISP_URL = WISP_URL;
    window.SCRAMJET_WISP_URLS = WISP_URLS;

    // Create a global default instance for easy access
    window.scramjetClient = ScramjetClient.getInstance({
        onConnect: () => {
            if (window._scramjetDebug) console.log('[Scramjet] Global client connected');
        },
        onDisconnect: () => {
            if (window._scramjetDebug) console.log('[Scramjet] Global client disconnected');
        },
        onError: (error) => {
            if (window._scramjetDebug) console.log('[Scramjet] Gateway notice:', error?.message || 'Connection unavailable');
        },
        onReconnectAttempt: (attempt) => {
            console.log(`[Scramjet] Reconnection attempt ${attempt}`);
        },
        onFallback: (mode) => {
            console.log(`[Scramjet] Falling back to: ${mode}`);
        }
    });
}
