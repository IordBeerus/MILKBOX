(function () {
    'use strict';

    
    const state = {
        socket: null,
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        reconnectTimer: null,
        heartbeatTimer: null,
        isConnecting: false,
        isActive: false,
        roomCode: null,
        currentUser: null,
        isHost: false,
        hostId: null,
        media: null,
        playback: {
            isPlaying: false,
            currentTime: 0,
            lastUpdated: Date.now()
        },
        controlMode: 'everyone',
        participants: [],
        messages: [],
        isRemoteSyncing: false,
        lastBroadcastAction: null,
        lastBroadcastTime: 0
    };

    
    function getSavedProfile() {
        try {
            const saved = JSON.parse(localStorage.getItem('milkbox_party_profile') || '{}');
            return {
                name: saved.name || `MilkboxViewer${Math.floor(100 + Math.random() * 900)}`,
                avatar: saved.avatar || '🍿'
            };
        } catch {
            return { name: 'MilkboxViewer', avatar: '🍿' };
        }
    }

    function saveProfile(name, avatar) {
        try {
            localStorage.setItem('milkbox_party_profile', JSON.stringify({ name, avatar }));
        } catch {}
    }

    
    function notify(msg, type = 'info') {
        if (typeof window.toast === 'function') {
            window.toast(msg, type);
        } else {
            console.log(`[WatchParty Toast] (${type}): ${msg}`);
        }
    }

    
    function getActivePlayerElement() {
        const frame = document.getElementById('playerFrame');
        if (!frame) return null;

        const nativeVid = frame.querySelector('video') || document.getElementById('mbNativeVideo');
        if (nativeVid) return { type: 'video', el: nativeVid };

        const iframe = frame.querySelector('iframe') || document.getElementById('mbStreamIframe');
        if (iframe) return { type: 'iframe', el: iframe };

        return null;
    }

    
    function formatTime(sec) {
        if (!Number.isFinite(sec) || sec < 0) return '0:00';
        const s = Math.floor(sec);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
            : `${m}:${String(r).padStart(2, '0')}`;
    }

    
    function connectSocket(onOpenCallback) {
        if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) {
            if (state.socket.readyState === WebSocket.OPEN && onOpenCallback) onOpenCallback();
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/party`;

        state.isConnecting = true;
        updateSyncBadge('connecting');

        try {
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                state.socket = ws;
                state.isConnecting = false;
                state.reconnectAttempts = 0;
                console.log('[WatchParty] Connected to real-time server');
                updateSyncBadge('connected');

                
                clearInterval(state.heartbeatTimer);
                state.heartbeatTimer = setInterval(() => {
                    sendSocketMessage('party:heartbeat');
                }, 15000);

                if (onOpenCallback) onOpenCallback();
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleSocketMessage(data);
                } catch (err) {
                    console.error('[WatchParty] Message parsing error:', err);
                }
            };

            ws.onclose = () => {
                state.socket = null;
                state.isConnecting = false;
                clearInterval(state.heartbeatTimer);
                console.warn('[WatchParty] Disconnected from server');

                if (state.isActive) {
                    updateSyncBadge('reconnecting');
                    scheduleReconnect();
                } else {
                    updateSyncBadge('idle');
                }
            };

            ws.onerror = (err) => {
                console.error('[WatchParty] Socket error:', err);
                state.isConnecting = false;
            };
        } catch (e) {
            console.error('[WatchParty] Failed to create WebSocket:', e);
            state.isConnecting = false;
        }
    }

    function scheduleReconnect() {
        if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        if (state.reconnectAttempts >= state.maxReconnectAttempts) {
            notify('Watch Party connection lost. Please reload or rejoin.', 'error');
            updateSyncBadge('error');
            return;
        }

        state.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(1.5, state.reconnectAttempts), 10000);
        console.log(`[WatchParty] Reconnecting in ${Math.round(delay / 1000)}s...`);

        state.reconnectTimer = setTimeout(() => {
            connectSocket(() => {
                if (state.roomCode && state.currentUser) {
                    sendSocketMessage('party:join', {
                        code: state.roomCode,
                        name: state.currentUser.name,
                        avatar: state.currentUser.avatar
                    });
                }
            });
        }, delay);
    }

    function sendSocketMessage(event, payload = {}) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
            console.warn('[WatchParty] Cannot send message: socket not open', event);
            return false;
        }
        try {
            state.socket.send(JSON.stringify({ event, ...payload }));
            return true;
        } catch (e) {
            console.error('[WatchParty] sendSocketMessage error:', e);
            return false;
        }
    }

    
    function handleSocketMessage(msg) {
        const { event } = msg;

        
        if (event === 'party:created') {
            state.isActive = true;
            state.roomCode = msg.code;
            state.currentUser = msg.user;
            state.isHost = true;
            state.hostId = msg.user.id;
            state.controlMode = msg.room.controlMode;
            state.media = msg.room.media;
            state.playback = msg.room.playback;
            state.participants = msg.room.users || [msg.user];
            state.messages = msg.room.messages || [];

            updateUIAfterJoin();
            notify(`Watch Party created! Code: ${msg.code}`, 'success');

            
            if (state.media && state.media.title) {
                applyMediaChange(state.media, false);
            } else {
                const fallback = getCurrentActiveMedia();
                if (fallback) {
                    state.media = fallback;
                    sendSocketMessage('party:change_media', { media: fallback });
                    applyMediaChange(fallback, false);
                }
            }
            return;
        }

        
        if (event === 'party:joined') {
            state.isActive = true;
            state.roomCode = msg.code;
            state.currentUser = msg.user;
            state.isHost = !!msg.user.isHost;
            state.hostId = msg.room.hostId;
            state.controlMode = msg.room.controlMode;
            state.media = msg.room.media;
            state.playback = msg.room.playback;
            state.participants = msg.room.users || [msg.user];
            state.messages = msg.room.messages || [];

            updateUIAfterJoin();
            notify(`Joined Watch Party (${msg.code})!`, 'success');

            
            if (state.media && state.media.title) {
                applyMediaChange(state.media, true);
            } else {
                const fallback = getCurrentActiveMedia();
                if (fallback) {
                    applyMediaChange(fallback, true);
                }
            }
            return;
        }

       
        if (event === 'party:user_joined') {
            const existing = state.participants.find(u => u.id === msg.user.id);
            if (!existing) {
                state.participants.push(msg.user);
            }
            if (msg.message) {
                state.messages.push(msg.message);
                appendChatMessage(msg.message);
            }
            renderParticipants();
            notify(`${msg.user.name} joined the party! 🍿`, 'info');
            return;
        }

        
        if (event === 'party:user_left') {
            state.participants = state.participants.filter(u => u.id !== msg.userId);
            if (msg.hostId) {
                state.hostId = msg.hostId;
                state.isHost = state.currentUser && state.currentUser.id === msg.hostId;
                if (state.currentUser && state.currentUser.id === msg.hostId) {
                    state.currentUser.isHost = true;
                }
            }
            if (msg.message) {
                state.messages.push(msg.message);
                appendChatMessage(msg.message);
            }
            renderParticipants();
            updateHostBadge();
            return;
        }

        
        if (event === 'party:host_changed') {
            state.hostId = msg.hostId;
            state.isHost = state.currentUser && state.currentUser.id === msg.hostId;
            if (state.currentUser && state.currentUser.id === msg.hostId) {
                state.currentUser.isHost = true;
                notify('You are now the party host! 👑', 'success');
            }
            if (msg.message) {
                state.messages.push(msg.message);
                appendChatMessage(msg.message);
            }
            renderParticipants();
            updateHostBadge();
            return;
        }

        
        if (event === 'party:playback_synced') {
            
            if (msg.byId && state.currentUser && msg.byId === state.currentUser.id) {
                return;
            }

            state.playback.isPlaying = !!msg.isPlaying;
            state.playback.currentTime = Number(msg.time) || 0;
            state.playback.lastUpdated = Date.now();

            applyPlaybackSync(msg.action, state.playback.currentTime, state.playback.isPlaying, msg.by);
            return;
        }

        
        if (event === 'party:media_changed') {
            state.media = msg.media;
            state.playback.currentTime = 0;
            state.playback.isPlaying = false;
            state.playback.lastUpdated = Date.now();

            if (msg.message) {
                state.messages.push(msg.message);
                appendChatMessage(msg.message);
            }

            notify(`${msg.by} loaded: ${msg.media.title}`, 'info');
            applyMediaChange(msg.media, true);
            return;
        }

        
        if (event === 'party:control_mode_changed') {
            state.controlMode = msg.controlMode;
            if (msg.message) {
                state.messages.push(msg.message);
                appendChatMessage(msg.message);
            }
            notify(msg.message ? msg.message.text : 'Party control permissions updated', 'info');
            return;
        }

        
        if (event === 'party:chat_message') {
            state.messages.push(msg.message);
            appendChatMessage(msg.message);
            return;
        }

        
        if (event === 'party:reaction') {
            spawnFloatingReaction(msg.emoji, msg.name);
            return;
        }

        
        if (event === 'party:heartbeat_ack') {
            if (msg.playback && !state.isHost) {
                const targetTime = msg.playback.currentTime;
                const player = getActivePlayerElement();
                if (player && player.type === 'video') {
                    const diff = Math.abs(player.el.currentTime - targetTime);
                    
                    if (diff > 2.5) {
                        console.log(`[WatchParty] Compensating drift (${diff.toFixed(1)}s) to match host`);
                        state.isRemoteSyncing = true;
                        player.el.currentTime = targetTime;
                        setTimeout(() => { state.isRemoteSyncing = false; }, 300);
                    }
                }
            }
            return;
        }

        
        if (event === 'party:error') {
            notify(msg.message || 'Party error occurred.', 'error');
            return;
        }
    }

    
    function applyPlaybackSync(action, targetTime, isPlaying, initiatorName) {
        state.isRemoteSyncing = true;
        updateSyncBadge('syncing', initiatorName);

        const player = getActivePlayerElement();
        if (player) {
            if (player.type === 'video') {
                const vid = player.el;
                if (Number.isFinite(targetTime) && Math.abs(vid.currentTime - targetTime) > 0.7) {
                    vid.currentTime = targetTime;
                }
                if (isPlaying && vid.paused) {
                    vid.play().catch(() => {});
                } else if (!isPlaying && !vid.paused) {
                    vid.pause();
                }
            } else if (player.type === 'iframe') {
                try {
                    player.el.contentWindow.postMessage({
                        type: 'mb:command',
                        action: action,
                        time: targetTime,
                        isPlaying: isPlaying
                    }, '*');
                } catch (e) {}
                try {
                    
                    if (action === 'play') {
                        player.el.contentWindow.postMessage({ type: 'pstream', command: 'play' }, '*');
                    } else if (action === 'pause') {
                        player.el.contentWindow.postMessage({ type: 'pstream', command: 'pause' }, '*');
                    } else if (action === 'seek' && Number.isFinite(targetTime)) {
                        player.el.contentWindow.postMessage({ type: 'pstream', command: 'seek', value: Math.max(0, targetTime) }, '*');
                    }
                } catch (e) {}
            }
        }

        setTimeout(() => {
            state.isRemoteSyncing = false;
            updateSyncBadge('in_sync');
        }, 500);
    }

   
    function applyMediaChange(media, autoSeekToPlayback) {
        if (!media || !media.title) return;

        state.isRemoteSyncing = true;

        
        const playerModal = document.getElementById('playerModal');
        if (playerModal) {
            playerModal.classList.add('active');
            document.body.classList.add('player-active');
        }

        
        closePartyModal();

        
        const headerTitle = document.getElementById('playerHeaderTitle');
        const headerBadge = document.getElementById('playerHeaderBadge');
        const playerTitle = document.getElementById('playerTitle');
        const playerSub = document.getElementById('playerSubtitle');
        if (headerTitle) headerTitle.textContent = media.title;
        if (headerBadge) headerBadge.textContent = media.type === 'tv' ? 'Series' : (media.type === 'anime' ? 'Anime' : 'Movie');
        if (playerTitle) playerTitle.textContent = media.title;
        if (playerSub) playerSub.textContent = media.type === 'tv' ? `Season ${media.season || 1} • Episode ${media.episode || 1}` : (media.year || 'Movie');

        
        const drawer = document.getElementById('watchPartyDrawer');
        if (drawer) {
            drawer.style.display = 'flex';
            drawer.classList.add('expanded');
        }

        
        const fullItem = (typeof window.findItemById === 'function' && window.findItemById(media.id || media.tmdbId)) || media.rawItem || {
            id: media.id || media.tmdbId,
            tmdbId: media.tmdbId || media.id,
            anilistId: media.anilistId,
            malId: media.malId,
            title: media.title,
            type: media.type || 'movie',
            season: media.season || 1,
            episode: media.episode || 1,
            poster: media.poster || '',
            backdrop: media.backdrop || ''
        };

        if (media.server) {
            window.playerServer = media.server;
        }

        
        if (typeof window.playItem === 'function') {
            window.playItem(fullItem, media.type || 'movie');
            if (media.type === 'tv' && typeof window.playTmdbEpisode === 'function') {
                window.playTmdbEpisode(fullItem, media.season || 1, media.episode || 1, media.server || window.playerServer || 'milkbox');
            }
        } else if (typeof window.playTmdbEpisode === 'function' && fullItem.tmdbId) {
            window.playTmdbEpisode(fullItem, media.season || 1, media.episode || 1, media.server || 'milkbox');
        } else {
            
            const frame = document.getElementById('playerFrame');
            if (frame) {
                const srv = media.server || window.playerServer || 'scramjet';
                const builder = (window.SERVER_IFRAME && window.SERVER_IFRAME[srv]) || (window.SERVER_IFRAME && window.SERVER_IFRAME.vidsrc);
                if (typeof builder === 'function') {
                    frame.innerHTML = builder(fullItem.tmdbId || fullItem.id, media.type || 'movie', media.season || 1, media.episode || 1);
                } else {
                    const embedUrl = media.type === 'tv'
                        ? `https://vidsrc.pm/embed/tv/${encodeURIComponent(fullItem.tmdbId || fullItem.id)}/${encodeURIComponent(media.season || 1)}/${encodeURIComponent(media.episode || 1)}`
                        : `https://vidsrc.pm/embed/movie/${encodeURIComponent(fullItem.tmdbId || fullItem.id)}`;
                    frame.innerHTML = `<iframe src="${embedUrl}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media" style="width:100%;height:100%;border:none;"></iframe>`;
                }
            }
        }

        
        if (autoSeekToPlayback && state.playback && state.playback.currentTime > 2) {
            setTimeout(() => {
                applyPlaybackSync('seek', state.playback.currentTime, state.playback.isPlaying, 'Party Sync');
            }, 1200);
        }

        setTimeout(() => {
            state.isRemoteSyncing = false;
        }, 1500);
    }

    
    function broadcastLocalAction(action, time, extra = {}) {
        if (!state.isActive || state.isRemoteSyncing) return;

        
        const now = Date.now();
        if (state.lastBroadcastAction === action && (now - state.lastBroadcastTime) < 200) {
            return;
        }
        state.lastBroadcastAction = action;
        state.lastBroadcastTime = now;

        
        if (state.controlMode === 'host_only' && !state.isHost) {
            return;
        }

        sendSocketMessage('party:sync_action', {
            action,
            time: typeof time === 'number' ? time : 0,
            ...extra
        });
    }

    
    function attachPlayerListeners() {
      
        window.addEventListener('message', (event) => {
            if (state.isRemoteSyncing) return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            if (data.type === 'mb:sync') {
                if (data.action === 'play') {
                    broadcastLocalAction('play', data.time);
                } else if (data.action === 'pause') {
                    broadcastLocalAction('pause', data.time);
                } else if (data.action === 'seek') {
                    broadcastLocalAction('seek', data.time);
                }
            } else if (data.type === 'pstream') {
                
                const eventTime = typeof data.time === 'number' ? data.time : 0;
                if (data.event === 'play') {
                    broadcastLocalAction('play', eventTime);
                } else if (data.event === 'pause') {
                    broadcastLocalAction('pause', eventTime);
                } else if (data.event === 'seeked') {
                    broadcastLocalAction('seek', eventTime);
                }
            }
        });

        
        document.addEventListener('play', (e) => {
            if (state.isRemoteSyncing || !e.target || e.target.tagName !== 'VIDEO') return;
            broadcastLocalAction('play', e.target.currentTime);
        }, true);

        document.addEventListener('pause', (e) => {
            if (state.isRemoteSyncing || !e.target || e.target.tagName !== 'VIDEO') return;
            
            if (e.target.ended) return;
            broadcastLocalAction('pause', e.target.currentTime);
        }, true);

        document.addEventListener('seeked', (e) => {
            if (state.isRemoteSyncing || !e.target || e.target.tagName !== 'VIDEO') return;
            broadcastLocalAction('seek', e.target.currentTime);
        }, true);
    }

    
    function updateSyncBadge(status, details = '') {
        const pill = document.getElementById('wpSyncStatusPill');
        const text = document.getElementById('wpSyncStatusText');
        if (!pill || !text) return;

        pill.className = 'wp-status-pill ' + status;
        if (status === 'in_sync') {
            text.textContent = 'Synced with Host';
        } else if (status === 'syncing') {
            text.textContent = details ? `Syncing (${details})` : 'Syncing...';
        } else if (status === 'connecting') {
            text.textContent = 'Connecting...';
        } else if (status === 'reconnecting') {
            text.textContent = 'Reconnecting...';
        } else {
            text.textContent = 'Standby';
        }
    }

    function updateHostBadge() {
        const hostPill = document.getElementById('wpDrawerHostPill');
        if (!hostPill) return;

        if (state.isHost) {
            hostPill.textContent = '👑 Host: You';
            hostPill.classList.add('is-you');
        } else {
            const hostUser = state.participants.find(u => u.id === state.hostId);
            hostPill.textContent = `👑 Host: ${hostUser ? hostUser.name : 'Host'}`;
            hostPill.classList.remove('is-you');
        }
    }

    function renderParticipants() {
        const countBadge = document.getElementById('wpDrawerCountBadge');
        const countActiveBadge = document.getElementById('wpActiveCountBadge');
        const usersBar = document.getElementById('wpDrawerUsersBar');
        const activeList = document.getElementById('wpActiveParticipantsList');

        const countText = `${state.participants.length} watching`;
        if (countBadge) countBadge.textContent = state.participants.length;
        if (countActiveBadge) countActiveBadge.textContent = countText;

        if (usersBar) {
            usersBar.innerHTML = state.participants.map(u => {
                const isMe = state.currentUser && u.id === state.currentUser.id;
                const isHost = u.isHost || u.id === state.hostId;
                return `
                    <div class="wp-user-chip ${isMe ? 'is-me' : ''}" title="${u.name} ${isHost ? '(Host)' : ''}">
                        <span class="wp-chip-avatar">${u.avatar || '🍿'}</span>
                        <span class="wp-chip-name">${u.name}${isMe ? ' (You)' : ''}</span>
                        ${isHost ? '<span class="wp-chip-crown">👑</span>' : ''}
                    </div>
                `;
            }).join('');
        }

        if (activeList) {
            activeList.innerHTML = state.participants.map(u => {
                const isMe = state.currentUser && u.id === state.currentUser.id;
                const isHost = u.isHost || u.id === state.hostId;
                return `
                    <div class="wp-active-user-item ${isMe ? 'is-me' : ''}">
                        <div class="wp-user-avatar-wrap">${u.avatar || '🍿'}</div>
                        <div class="wp-user-details">
                            <span class="wp-user-name">${u.name}${isMe ? ' (You)' : ''}</span>
                            <span class="wp-user-role">${isHost ? 'Party Host 👑' : 'Viewer'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function appendChatMessage(msg) {
        const chatBox = document.getElementById('wpDrawerChatBox');
        if (!chatBox) return;

        
        while (chatBox.children.length >= 80) {
            chatBox.removeChild(chatBox.firstElementChild);
        }

        const div = document.createElement('div');
        if (msg.type === 'system') {
            div.className = 'wp-chat-system';
            div.textContent = msg.text;
        } else {
            const isMe = state.currentUser && msg.userId === state.currentUser.id;
            div.className = `wp-chat-bubble ${isMe ? 'is-me' : 'is-other'}`;
            const timeStr = new Date(msg.time || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            div.innerHTML = `
                <div class="wp-bubble-head">
                    <span class="wp-bubble-avatar">${msg.avatar || '🍿'}</span>
                    <span class="wp-bubble-sender">${msg.name}</span>
                    ${msg.isHost ? '<span class="wp-bubble-crown">👑</span>' : ''}
                    <span class="wp-bubble-time">${timeStr}</span>
                </div>
                <div class="wp-bubble-text">${escapeHtml(msg.text)}</div>
            `;
        }

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function spawnFloatingReaction(emoji, senderName) {
        const container = document.getElementById('wpFloatingReactions');
        if (!container) return;

        
        while (container.children.length >= 12) {
            container.removeChild(container.firstElementChild);
        }

        const react = document.createElement('div');
        react.className = 'wp-floating-reaction';
        const startLeft = Math.floor(15 + Math.random() * 70);
        react.style.left = `${startLeft}%`;

        react.innerHTML = `
            <span class="wp-reaction-emoji">${emoji}</span>
            ${senderName ? `<span class="wp-reaction-sender">${escapeHtml(senderName)}</span>` : ''}
        `;

        container.appendChild(react);
        setTimeout(() => {
            if (react.parentElement) react.parentElement.removeChild(react);
        }, 3200);
    }

    function updateUIAfterJoin() {
        const drawer = document.getElementById('watchPartyDrawer');
        const drawerCode = document.getElementById('wpDrawerCode');
        const activeCodeDisplay = document.getElementById('wpActiveCodeDisplay');
        const navDot = document.getElementById('watchPartyNavDot');
        const playerPulseDot = document.getElementById('playerPartyPulseDot');

        if (drawer) {
            drawer.style.display = 'flex';
            drawer.classList.add('expanded');
        }
        if (drawerCode) drawerCode.textContent = state.roomCode;
        if (activeCodeDisplay) activeCodeDisplay.textContent = state.roomCode;
        if (navDot) navDot.style.display = 'inline-block';
        if (playerPulseDot) playerPulseDot.style.display = 'inline-block';

        renderParticipants();
        updateHostBadge();
        updateSyncBadge('in_sync');

        
        const paneCreate = document.getElementById('wpPaneCreate');
        const paneJoin = document.getElementById('wpPaneJoin');
        const paneActive = document.getElementById('wpPaneActive');
        if (paneCreate) paneCreate.style.display = 'none';
        if (paneJoin) paneJoin.style.display = 'none';
        if (paneActive) paneActive.style.display = 'block';

        
        const chatBox = document.getElementById('wpDrawerChatBox');
        if (chatBox) {
            chatBox.innerHTML = '';
            state.messages.forEach(m => appendChatMessage(m));
        }
    }

    function resetUIAfterLeave() {
        state.isActive = false;
        state.roomCode = null;
        state.isHost = false;
        state.hostId = null;
        state.participants = [];
        state.messages = [];

        const drawer = document.getElementById('watchPartyDrawer');
        const navDot = document.getElementById('watchPartyNavDot');
        const playerPulseDot = document.getElementById('playerPartyPulseDot');
        const modal = document.getElementById('watchPartyModal');

        if (drawer) drawer.style.display = 'none';
        if (navDot) navDot.style.display = 'none';
        if (playerPulseDot) playerPulseDot.style.display = 'none';
        if (modal) modal.style.display = 'none';

        const paneCreate = document.getElementById('wpPaneCreate');
        const paneJoin = document.getElementById('wpPaneJoin');
        const paneActive = document.getElementById('wpPaneActive');
        if (paneCreate) paneCreate.style.display = 'block';
        if (paneJoin) paneJoin.style.display = 'none';
        if (paneActive) paneActive.style.display = 'none';

        
        if (state.socket) {
            state.socket.close();
            state.socket = null;
        }
    }

    
    function createParty(nickname, avatar, initialMedia) {
        saveProfile(nickname, avatar);
        connectSocket(() => {
            sendSocketMessage('party:create', {
                name: nickname,
                avatar: avatar,
                media: initialMedia || getCurrentActiveMedia(),
                controlMode: document.getElementById('wpHostOnlyControl')?.checked ? 'host_only' : 'everyone'
            });
        });
    }

    function joinParty(code, nickname, avatar) {
        if (!code || !code.trim()) {
            notify('Please enter a party code.', 'error');
            return;
        }
        const cleanCode = code.trim().toUpperCase();
        saveProfile(nickname, avatar);

        connectSocket(() => {
            sendSocketMessage('party:join', {
                code: cleanCode,
                name: nickname,
                avatar: avatar
            });
        });
    }

    function leaveParty() {
        if (!state.isActive) return;
        sendSocketMessage('party:leave');
        resetUIAfterLeave();
        notify('Left Watch Party', 'info');
    }

    function sendChat(text) {
        if (!state.isActive || !text || !text.trim()) return;
        sendSocketMessage('party:chat', { text: text.trim() });
    }

    function sendReaction(emoji) {
        if (!state.isActive) return;
        sendSocketMessage('party:reaction', { emoji });
        spawnFloatingReaction(emoji, state.currentUser ? state.currentUser.name : 'You');
    }

    function resyncWithHost() {
        if (!state.isActive) return;
        notify('Requesting synchronization with host...', 'info');
        updateSyncBadge('syncing');
        sendSocketMessage('party:heartbeat');
    }

    function copyCode() {
        if (!state.roomCode) return;
        navigator.clipboard.writeText(state.roomCode).then(() => {
            notify(`Party Code ${state.roomCode} copied to clipboard! 📋`, 'success');
        }).catch(() => {
            prompt('Copy party code:', state.roomCode);
        });
    }

    function copyInviteLink() {
        if (!state.roomCode) return;
        const url = `${window.location.origin}/?party=${state.roomCode}`;
        navigator.clipboard.writeText(url).then(() => {
            notify('Party invite link copied! Send it to your friends! 🔗', 'success');
        }).catch(() => {
            prompt('Copy party link:', url);
        });
    }

    function getCurrentActiveMedia() {
        if (window.playContext && window.playContext.item) {
            const it = window.playContext.item;
            return {
                id: it.id,
                tmdbId: it.tmdbId,
                anilistId: it.anilistId,
                title: it.title || document.getElementById('playerTitle')?.textContent || 'Movie',
                type: window.playContext.type || it.type || 'movie',
                season: window.playContext.season || 1,
                episode: window.playContext.episode || 1,
                poster: it.poster || it.backdrop || '',
                backdrop: it.backdrop || it.poster || '',
                server: window.playerServer || 'milkbox'
            };
        }
        if (window.currentInfoItem) {
            const it = window.currentInfoItem;
            return {
                id: it.id,
                tmdbId: it.tmdbId,
                anilistId: it.anilistId,
                title: it.title || 'Movie',
                type: window.currentInfoType || it.type || 'movie',
                season: 1,
                episode: 1,
                poster: it.poster || it.backdrop || '',
                backdrop: it.backdrop || it.poster || '',
                server: window.playerServer || 'milkbox'
            };
        }
        if (Array.isArray(window.movies) && window.movies.length > 0) {
            const it = window.movies[0];
            return {
                id: it.id,
                tmdbId: it.tmdbId,
                anilistId: it.anilistId,
                title: it.title || 'Featured Movie',
                type: 'movie',
                season: 1,
                episode: 1,
                poster: it.poster || it.backdrop || '',
                backdrop: it.backdrop || it.poster || '',
                server: window.playerServer || 'milkbox'
            };
        }
        return null;
    }

    
    function openPartyModal(prefillCode = '') {
        const modal = document.getElementById('watchPartyModal');
        if (!modal) return;

        const profile = getSavedProfile();
        const hostNickInput = document.getElementById('wpHostNickname');
        const joinNickInput = document.getElementById('wpJoinNickname');
        const joinCodeInput = document.getElementById('wpJoinCode');

        if (hostNickInput) hostNickInput.value = profile.name;
        if (joinNickInput) joinNickInput.value = profile.name;

        
        document.querySelectorAll('.wp-avatar-opt').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.avatar === profile.avatar);
        });

        
        const curMedia = getCurrentActiveMedia();
        const mediaTitle = document.getElementById('wpCreateMediaTitle');
        const mediaPoster = document.getElementById('wpCreateMediaPoster');
        const mediaSub = document.getElementById('wpCreateMediaSub');
        if (curMedia && curMedia.title) {
            if (mediaTitle) mediaTitle.textContent = curMedia.title;
            if (mediaPoster && curMedia.poster) mediaPoster.src = curMedia.poster;
            if (mediaSub) mediaSub.textContent = curMedia.type === 'tv' ? `Season ${curMedia.season} • Episode ${curMedia.episode}` : 'Movie';
        }

        if (state.isActive) {
            document.getElementById('wpPaneCreate').style.display = 'none';
            document.getElementById('wpPaneJoin').style.display = 'none';
            document.getElementById('wpPaneActive').style.display = 'block';
            document.querySelector('.wp-tabs').style.display = 'none';
        } else {
            document.querySelector('.wp-tabs').style.display = 'flex';
            document.getElementById('wpPaneActive').style.display = 'none';
            if (prefillCode) {
                if (joinCodeInput) joinCodeInput.value = prefillCode;
                switchTab('join');
            } else {
                switchTab('create');
            }
        }

        modal.style.display = 'flex';
    }

    function closePartyModal() {
        const modal = document.getElementById('watchPartyModal');
        if (modal) modal.style.display = 'none';
    }

    function switchTab(tab) {
        document.querySelectorAll('.wp-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.wpTab === tab);
        });
        const paneCreate = document.getElementById('wpPaneCreate');
        const paneJoin = document.getElementById('wpPaneJoin');
        if (paneCreate) paneCreate.style.display = tab === 'create' ? 'block' : 'none';
        if (paneJoin) paneJoin.style.display = tab === 'join' ? 'block' : 'none';
    }

    
    function initUI() {
        
        const navBtn = document.getElementById('watchPartyNavBtn');
        if (navBtn) navBtn.addEventListener('click', () => openPartyModal());

        
        const playerBtn = document.getElementById('playerWatchPartyBtn');
        if (playerBtn) {
            playerBtn.addEventListener('click', () => {
                if (state.isActive) {
                    const drawer = document.getElementById('watchPartyDrawer');
                    if (drawer) {
                        drawer.style.display = 'flex';
                        drawer.classList.toggle('expanded');
                    }
                } else {
                    openPartyModal();
                }
            });
        }

        
        const infoBtn = document.getElementById('infoWatchPartyBtn');
        if (infoBtn) infoBtn.addEventListener('click', () => {
            const cur = window.currentInfoItem;
            if (cur) {
                window.playContext = { item: cur, type: window.currentInfoType || cur.type || 'movie' };
            }
            openPartyModal();
        });

        
        const closeBtn = document.getElementById('closeWatchPartyModal');
        if (closeBtn) closeBtn.addEventListener('click', closePartyModal);

        const modal = document.getElementById('watchPartyModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closePartyModal();
            });
        }

       
        document.querySelectorAll('.wp-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.wpTab));
        });

        
        document.querySelectorAll('.wp-avatar-selector').forEach(sel => {
            sel.addEventListener('click', (e) => {
                const opt = e.target.closest('.wp-avatar-opt');
                if (!opt) return;
                sel.querySelectorAll('.wp-avatar-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });

        
        const createBtn = document.getElementById('wpCreatePartyBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                const name = document.getElementById('wpHostNickname')?.value || 'Host';
                const avatar = document.querySelector('#wpHostAvatarSelector .wp-avatar-opt.active')?.dataset.avatar || '🍿';
                createParty(name, avatar);
            });
        }

        
        const joinBtn = document.getElementById('wpJoinPartyBtn');
        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                const codeIn = document.getElementById('wpJoinCode')?.value || '';
                const name = document.getElementById('wpJoinNickname')?.value || 'Viewer';
                const avatar = document.querySelector('#wpJoinAvatarSelector .wp-avatar-opt.active')?.dataset.avatar || '🍿';
                joinParty(codeIn, name, avatar);
            });
        }

        
        const pasteBtn = document.getElementById('wpPasteCodeBtn');
        if (pasteBtn) {
            pasteBtn.addEventListener('click', async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        const match = text.match(/MILK-[A-Z0-9]{4}/i) || text.match(/[A-Z0-9]{4,8}/i);
                        const codeInput = document.getElementById('wpJoinCode');
                        if (codeInput) {
                            codeInput.value = match ? match[0].toUpperCase() : text.trim().toUpperCase();
                            notify('Pasted code from clipboard!', 'info');
                        }
                    }
                } catch {
                    notify('Clipboard access not granted.', 'error');
                }
            });
        }

        
        const copyCodeBtn = document.getElementById('wpCopyCodeBtn');
        if (copyCodeBtn) copyCodeBtn.addEventListener('click', copyCode);

        const copyLinkBtn = document.getElementById('wpCopyLinkBtn');
        if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyInviteLink);

        const returnPlayerBtn = document.getElementById('wpReturnToPlayerBtn');
        if (returnPlayerBtn) {
            returnPlayerBtn.addEventListener('click', () => {
                closePartyModal();
                if (state.media && state.media.title) {
                    applyMediaChange(state.media, true);
                } else {
                    const fallback = getCurrentActiveMedia();
                    if (fallback) applyMediaChange(fallback, true);
                }
                const playerModal = document.getElementById('playerModal');
                if (playerModal && !playerModal.classList.contains('active')) {
                    playerModal.classList.add('active');
                    document.body.classList.add('player-active');
                }
                const drawer = document.getElementById('watchPartyDrawer');
                if (drawer) {
                    drawer.style.display = 'flex';
                    drawer.classList.add('expanded');
                }
            });
        }

        const leaveBtn = document.getElementById('wpLeavePartyBtn');
        if (leaveBtn) leaveBtn.addEventListener('click', leaveParty);

        
        const drawerToggle = document.getElementById('wpDrawerToggle');
        const drawer = document.getElementById('watchPartyDrawer');
        if (drawerToggle && drawer) {
            drawerToggle.addEventListener('click', () => {
                drawer.classList.toggle('expanded');
            });
        }

        const drawerClose = document.getElementById('wpDrawerClose');
        if (drawerClose && drawer) {
            drawerClose.addEventListener('click', () => {
                drawer.classList.remove('expanded');
            });
        }

        const drawerShareBtn = document.getElementById('wpDrawerShareBtn');
        if (drawerShareBtn) drawerShareBtn.addEventListener('click', copyInviteLink);

        const drawerResyncBtn = document.getElementById('wpDrawerResyncBtn');
        if (drawerResyncBtn) drawerResyncBtn.addEventListener('click', resyncWithHost);

        const drawerLeaveBtn = document.getElementById('wpDrawerLeaveBtn');
        if (drawerLeaveBtn) drawerLeaveBtn.addEventListener('click', leaveParty);

        const drawerCode = document.getElementById('wpDrawerCode');
        if (drawerCode) drawerCode.addEventListener('click', copyCode);

        
        document.querySelectorAll('.wp-react-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                sendReaction(btn.dataset.emoji || '❤️');
            });
        });

        
        const chatForm = document.getElementById('wpDrawerChatForm');
        const chatInput = document.getElementById('wpDrawerChatInput');
        if (chatForm && chatInput) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const text = chatInput.value;
                if (text && text.trim()) {
                    sendChat(text);
                    chatInput.value = '';
                }
            });
        }

        
        attachPlayerListeners();

       
        const urlParams = new URLSearchParams(window.location.search);
        const partyParam = urlParams.get('party');
        const pathMatch = window.location.pathname.match(/\/party\/([A-Z0-9-]+)/i);
        const autoCode = partyParam || (pathMatch ? pathMatch[1] : null);

        if (autoCode) {
            setTimeout(() => {
                openPartyModal(autoCode.toUpperCase());
            }, 600);
        }
    }

    
    window.MilkboxWatchParty = {
        state,
        createParty,
        joinParty,
        leaveParty,
        sendChat,
        sendReaction,
        resyncWithHost,
        copyCode,
        copyInviteLink,
        openModal: openPartyModal,
        closeModal: closePartyModal,
        broadcastAction: broadcastLocalAction
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
