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
        this.wispUrls = options.wispUrls || WISP_URLS;
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
    }

    _checkWebSocketSupport() {
        try {
            return typeof WebSocket !== 'undefined' && WebSocket !== null;
        } catch {
            return false;
        }
    }

    connect(timeout = 10000) {
        if (this.isConnected || this.wispSocket) {
            return Promise.resolve();
        }

        // If WebSocket is not supported, fallback to direct proxy
        if (!this.supportsWebSocket) {
            console.warn('[Scramjet] WebSocket not supported, using direct proxy mode');
            this.useDirectProxy = true;
            this.isConnected = true;
            this.onFallback('direct-proxy');
            this.onConnect();
            return Promise.resolve();
        }

        return this._connectToWisp(timeout);
    }

    _connectToWisp(timeout) {
        if (this.currentWispIndex >= this.wispUrls.length) {
            console.warn('[Scramjet] All WISP endpoints exhausted, falling back to direct proxy');
            this.useDirectProxy = true;
            this.isConnected = true;
            this.onFallback('direct-proxy');
            this.onConnect();
            return Promise.resolve();
        }

        const wispUrl = this.wispUrls[this.currentWispIndex];
        
        return new Promise((resolve, reject) => {
            const connectTimeout = setTimeout(() => {
                if (!this.isConnected) {
                    this.wispSocket?.close();
                    this.wispSocket = null;
                    console.warn(`[Scramjet] Connection to ${wispUrl} timed out, trying next endpoint`);
                    this.currentWispIndex++;
                    this._connectToWisp(timeout).then(resolve).catch(reject);
                }
            }, timeout);

            try {
                this.wispSocket = new WebSocket(wispUrl);
                
                this.wispSocket.onopen = () => {
                    clearTimeout(connectTimeout);
                    this.isConnected = true;
                    this.useDirectProxy = false;
                    this.reconnectAttempts = 0;
                    console.log(`[Scramjet] Connected to WISP gateway: ${wispUrl}`);
                    this.onConnect();
                    resolve();
                };

                this.wispSocket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.wispSocket.onerror = (error) => {
                    clearTimeout(connectTimeout);
                    console.error(`[Scramjet] Connection error on ${wispUrl}:`, error);
                    this.onError(error);
                };

                this.wispSocket.onclose = () => {
                    clearTimeout(connectTimeout);
                    this.isConnected = false;
                    const wasConnected = this.wispSocket !== null;
                    this.wispSocket = null;
                    console.log(`[Scramjet] Disconnected from ${wispUrl}`);
                    this.onDisconnect();
                    
                    // Try next endpoint or fallback
                    if (wasConnected && this.autoReconnect) {
                        this.currentWispIndex++;
                        if (this.currentWispIndex < this.wispUrls.length && this.reconnectAttempts < this.maxReconnectAttempts) {
                            this.reconnectAttempts++;
                            this.onReconnectAttempt(this.reconnectAttempts);
                            setTimeout(() => this._connectToWisp(timeout).catch(console.error), this.reconnectDelay);
                        } else {
                            console.warn('[Scramjet] Fallback to direct proxy mode');
                            this.useDirectProxy = true;
                            this.isConnected = true;
                            this.onFallback('direct-proxy');
                        }
                    }
                };
            } catch (error) {
                clearTimeout(connectTimeout);
                console.warn(`[Scramjet] Failed to connect to ${wispUrl}:`, error.message);
                this.currentWispIndex++;
                
                if (this.currentWispIndex < this.wispUrls.length) {
                    this._connectToWisp(timeout).then(resolve).catch(reject);
                } else {
                    console.warn('[Scramjet] All endpoints failed, using direct proxy');
                    this.useDirectProxy = true;
                    this.isConnected = true;
                    this.onFallback('direct-proxy');
                    resolve();
                }
            }
        });
    }

    disconnect() {
        this.autoReconnect = false;
        if (this.wispSocket) {
            this.wispSocket.close();
            this.wispSocket = null;
            this.isConnected = false;
        }
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
                        console.error('[Scramjet] Handler error:', e);
                    }
                });
            }
        } catch (error) {
            console.error('[Scramjet] Failed to parse message:', error);
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
        
        // If using direct proxy fallback, use embed endpoint
        if (this.useDirectProxy) {
            return `/api/scramjet/embed?${params.toString()}`;
        }
        
        return `/api/scramjet/embed?${params.toString()}`;
    }

    /**
     * Fetch a resource through the proxy
     */
    async fetchProxy(targetUrl, options = {}) {
        if (!this.isConnected) {
            throw new Error('Proxy not initialized');
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
            console.error('[Scramjet] Proxy fetch failed:', error);
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
            currentWispUrl: this.wispUrls[this.currentWispIndex] || 'none',
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
            console.warn('[Scramjet] Gateway error:', error.message || error);
        },
        onReconnectAttempt: (attempt) => {
            console.log(`[Scramjet] Reconnection attempt ${attempt}`);
        },
        onFallback: (mode) => {
            console.log(`[Scramjet] Falling back to: ${mode}`);
        }
    });
}
