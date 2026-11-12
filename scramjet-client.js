/**
 * Scramjet Client for MILKBOX
 * Handles modern web proxy functionality with WISP gateway support
 * Integrates with MercuryWorkshop's Scramjet: https://github.com/MercuryWorkshop/scramjet
 */

const WISP_URL = 'wss://wisp.classroom.lat/';

class ScramjetClient {
    constructor(options = {}) {
        this.wispUrl = options.wispUrl || WISP_URL;
        this.wispSocket = null;
        this.isConnected = false;
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.messageHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 2000;
        this.autoReconnect = options.autoReconnect !== false;
        this.onConnect = options.onConnect || (() => {});
        this.onDisconnect = options.onDisconnect || (() => {});
        this.onError = options.onError || (() => {});
        this.onReconnectAttempt = options.onReconnectAttempt || (() => {});
    }

    connect(timeout = 10000) {
        if (this.isConnected || this.wispSocket) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const connectTimeout = setTimeout(() => {
                if (!this.isConnected) {
                    this.wispSocket?.close();
                    this.wispSocket = null;
                    reject(new Error('WISP connection timeout'));
                }
            }, timeout);

            try {
                this.wispSocket = new WebSocket(this.wispUrl);
                
                this.wispSocket.onopen = () => {
                    clearTimeout(connectTimeout);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    console.log('[Scramjet] WISP gateway connected');
                    this.onConnect();
                    resolve();
                };

                this.wispSocket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.wispSocket.onerror = (error) => {
                    console.error('[Scramjet] WISP gateway error:', error);
                    this.onError(error);
                };

                this.wispSocket.onclose = () => {
                    clearTimeout(connectTimeout);
                    this.isConnected = false;
                    const wasConnected = this.wispSocket !== null;
                    this.wispSocket = null;
                    console.log('[Scramjet] WISP gateway disconnected');
                    this.onDisconnect();
                    
                    if (wasConnected && this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        this.onReconnectAttempt(this.reconnectAttempts);
                        setTimeout(() => this.connect(timeout).catch(console.error), this.reconnectDelay);
                    }
                };
            } catch (error) {
                clearTimeout(connectTimeout);
                console.error('[Scramjet] Failed to create WISP socket:', error);
                this.onError(error);
                reject(error);
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
            throw new Error('WISP gateway not connected');
        }

        const url = new URL(targetUrl);
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
            wispUrl: this.wispUrl,
            pendingRequests: this.pendingRequests.size,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts
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
    module.exports = { ScramjetClient, WISP_URL };
}

if (typeof window !== 'undefined') {
    window.ScramjetClient = ScramjetClient;
    window.SCRAMJET_WISP_URL = WISP_URL;
    
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
        }
    });
}
