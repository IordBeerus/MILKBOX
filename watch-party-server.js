const { WebSocketServer } = require('ws');

// In-memory rooms repository
// roomCode -> { code, hostId, media, playback, users: Map(ws -> userData), messages, controlMode, createdAt }
const rooms = new Map();

function generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let attempts = 0; attempts < 100; attempts++) {
        let code = 'MILK-';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (!rooms.has(code)) return code;
    }
    return `MILK-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function getAuthoritativeTime(room) {
    if (!room || !room.playback) return 0;
    if (!room.playback.isPlaying) {
        return room.playback.currentTime || 0;
    }
    const elapsed = Math.max(0, (Date.now() - room.playback.lastUpdated) / 1000);
    return (room.playback.currentTime || 0) + (elapsed * (room.playback.playbackRate || 1));
}

function serializeRoom(room) {
    if (!room) return null;
    const userList = [];
    for (const userData of room.users.values()) {
        userList.push({
            id: userData.id,
            name: userData.name,
            avatar: userData.avatar,
            isHost: userData.isHost,
            joinedAt: userData.joinedAt
        });
    }

    return {
        code: room.code,
        hostId: room.hostId,
        media: room.media,
        playback: {
            isPlaying: room.playback.isPlaying,
            currentTime: getAuthoritativeTime(room),
            playbackRate: room.playback.playbackRate || 1,
            lastUpdated: room.playback.lastUpdated
        },
        controlMode: room.controlMode,
        users: userList,
        userCount: userList.length,
        messages: room.messages.slice(-50),
        createdAt: room.createdAt
    };
}

function broadcastToRoom(room, event, payload, excludeWs = null) {
    if (!room || !room.users) return;
    const msg = JSON.stringify({
        event,
        ...payload,
        serverTime: Date.now()
    });

    for (const [ws] of room.users.entries()) {
        if (ws !== excludeWs && ws.readyState === 1 /* OPEN */) {
            try {
                ws.send(msg);
            } catch (err) {
                console.error('[WatchParty] Send error:', err.message);
            }
        }
    }
}

function handleUserLeave(ws, room) {
    if (!room || !room.users.has(ws)) return;
    const user = room.users.get(ws);
    room.users.delete(ws);

    console.log(`[WatchParty] User ${user.name} (${user.id}) left room ${room.code}`);

    // If no users left, destroy room after a short 10-minute expiry
    if (room.users.size === 0) {
        console.log(`[WatchParty] Room ${room.code} is now empty. Scheduling cleanup.`);
        room.cleanupTimer = setTimeout(() => {
            if (room.users.size === 0) {
                rooms.delete(room.code);
                console.log(`[WatchParty] Room ${room.code} cleaned up.`);
            }
        }, 10 * 60 * 1000);
        return;
    }

    // If host left, promote next user
    let newHostId = room.hostId;
    if (user.isHost) {
        const nextUser = room.users.values().next().value;
        if (nextUser) {
            nextUser.isHost = true;
            room.hostId = nextUser.id;
            newHostId = nextUser.id;

            const hostMsg = {
                id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: 'system',
                text: `👑 ${nextUser.name} is now the Watch Party host!`,
                time: Date.now()
            };
            room.messages.push(hostMsg);

            broadcastToRoom(room, 'party:host_changed', {
                hostId: nextUser.id,
                hostName: nextUser.name,
                message: hostMsg
            });
        }
    }

    const leaveMsg = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'system',
        text: `${user.name} left the party 👋`,
        time: Date.now()
    };
    room.messages.push(leaveMsg);

    broadcastToRoom(room, 'party:user_left', {
        userId: user.id,
        userName: user.name,
        userCount: room.users.size,
        hostId: newHostId,
        message: leaveMsg
    });
}

function initWatchPartyServer(httpServer) {
    const wss = new WebSocketServer({ noServer: true });

    // Handle WebSocket HTTP upgrade on /ws/party
    httpServer.on('upgrade', (request, socket, head) => {
        try {
            const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
            if (url.pathname === '/ws/party') {
                wss.handleUpgrade(request, socket, head, (ws) => {
                    wss.emit('connection', ws, request);
                });
            }
        } catch (e) {
            socket.destroy();
        }
    });

    // Heartbeat ping interval to detect stale/dead connections
    const pingInterval = setInterval(() => {
        for (const ws of wss.clients) {
            if (ws.isAlive === false) {
                ws.terminate();
                continue;
            }
            ws.isAlive = false;
            try {
                ws.ping();
            } catch (err) {
                ws.terminate();
            }
        }
    }, 30000);

    wss.on('close', () => clearInterval(pingInterval));

    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        let currentRoom = null;
        let currentUser = null;

        const send = (event, payload = {}) => {
            if (ws.readyState === 1 /* OPEN */) {
                try {
                    ws.send(JSON.stringify({ event, ...payload, serverTime: Date.now() }));
                } catch (e) {}
            }
        };

        ws.on('message', (raw) => {
            try {
                const data = JSON.parse(raw.toString('utf8'));
                const { event } = data;

                // 1. CREATE PARTY
                if (event === 'party:create') {
                    const code = generateRoomCode();
                    const userId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                    const userName = (data.name && String(data.name).trim().slice(0, 24)) || 'Milkbox Friend';
                    const userAvatar = data.avatar || '🍿';

                    const newRoom = {
                        code,
                        hostId: userId,
                        media: data.media || null,
                        playback: {
                            isPlaying: false,
                            currentTime: Number(data.currentTime) || 0,
                            playbackRate: 1,
                            lastUpdated: Date.now()
                        },
                        controlMode: data.controlMode === 'host_only' ? 'host_only' : 'everyone',
                        users: new Map(),
                        messages: [],
                        createdAt: Date.now(),
                        cleanupTimer: null
                    };

                    const userData = {
                        id: userId,
                        name: userName,
                        avatar: userAvatar,
                        isHost: true,
                        joinedAt: Date.now()
                    };

                    newRoom.users.set(ws, userData);
                    rooms.set(code, newRoom);

                    currentRoom = newRoom;
                    currentUser = userData;

                    const sysMsg = {
                        id: `sys-${Date.now()}`,
                        type: 'system',
                        text: `🎉 Watch Party created! Share code: ${code}`,
                        time: Date.now()
                    };
                    newRoom.messages.push(sysMsg);

                    console.log(`[WatchParty] Created room ${code} by ${userName}`);

                    send('party:created', {
                        code,
                        user: userData,
                        room: serializeRoom(newRoom)
                    });
                    return;
                }

                // 2. JOIN PARTY
                if (event === 'party:join') {
                    const code = (data.code || '').trim().toUpperCase();
                    const room = rooms.get(code);

                    if (!room) {
                        send('party:error', { message: `Party room "${code}" not found. Check the code and try again!` });
                        return;
                    }

                    if (room.cleanupTimer) {
                        clearTimeout(room.cleanupTimer);
                        room.cleanupTimer = null;
                    }

                    // Max room capacity (e.g. 50 participants)
                    if (room.users.size >= 50) {
                        send('party:error', { message: `Party room "${code}" is currently full (50 max).` });
                        return;
                    }

                    const userId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                    const userName = (data.name && String(data.name).trim().slice(0, 24)) || `Viewer ${room.users.size + 1}`;
                    const userAvatar = data.avatar || '🍿';

                    const userData = {
                        id: userId,
                        name: userName,
                        avatar: userAvatar,
                        isHost: room.users.size === 0,
                        joinedAt: Date.now()
                    };

                    room.users.set(ws, userData);
                    currentRoom = room;
                    currentUser = userData;

                    const joinMsg = {
                        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        type: 'system',
                        text: `${userName} joined the party! 🍿`,
                        time: Date.now()
                    };
                    room.messages.push(joinMsg);

                    console.log(`[WatchParty] ${userName} joined room ${code} (${room.users.size} users)`);

                    // Send room state to the newly joined user
                    send('party:joined', {
                        code,
                        user: userData,
                        room: serializeRoom(room)
                    });

                    // Broadcast to others in the room
                    broadcastToRoom(room, 'party:user_joined', {
                        user: userData,
                        userCount: room.users.size,
                        message: joinMsg
                    }, ws);
                    return;
                }

                // Remaining events require being in a room
                if (!currentRoom || !currentUser) {
                    send('party:error', { message: 'You must join or create a party first.' });
                    return;
                }

                // 3. LEAVE PARTY
                if (event === 'party:leave') {
                    handleUserLeave(ws, currentRoom);
                    currentRoom = null;
                    currentUser = null;
                    send('party:left', { success: true });
                    return;
                }

                // 4. SYNC PLAYBACK ACTION (play, pause, seek, change_media, control_mode)
                if (event === 'party:sync_action') {
                    const { action, time, media, controlMode } = data;

                    // Check host permissions if room is in host_only mode
                    if (currentRoom.controlMode === 'host_only' && !currentUser.isHost && action !== 'request_sync') {
                        send('party:error', { message: 'Only the party host can control playback.' });
                        return;
                    }

                    if (action === 'play') {
                        const targetTime = typeof time === 'number' && Number.isFinite(time) ? Math.max(0, time) : getAuthoritativeTime(currentRoom);
                        currentRoom.playback.isPlaying = true;
                        currentRoom.playback.currentTime = targetTime;
                        currentRoom.playback.lastUpdated = Date.now();

                        broadcastToRoom(currentRoom, 'party:playback_synced', {
                            action: 'play',
                            time: targetTime,
                            isPlaying: true,
                            by: currentUser.name,
                            byId: currentUser.id
                        });
                        return;
                    }

                    if (action === 'pause') {
                        const targetTime = typeof time === 'number' && Number.isFinite(time) ? Math.max(0, time) : getAuthoritativeTime(currentRoom);
                        currentRoom.playback.isPlaying = false;
                        currentRoom.playback.currentTime = targetTime;
                        currentRoom.playback.lastUpdated = Date.now();

                        broadcastToRoom(currentRoom, 'party:playback_synced', {
                            action: 'pause',
                            time: targetTime,
                            isPlaying: false,
                            by: currentUser.name,
                            byId: currentUser.id
                        });
                        return;
                    }

                    if (action === 'seek') {
                        const targetTime = typeof time === 'number' && Number.isFinite(time) ? Math.max(0, time) : 0;
                        currentRoom.playback.currentTime = targetTime;
                        currentRoom.playback.lastUpdated = Date.now();

                        broadcastToRoom(currentRoom, 'party:playback_synced', {
                            action: 'seek',
                            time: targetTime,
                            isPlaying: currentRoom.playback.isPlaying,
                            by: currentUser.name,
                            byId: currentUser.id
                        });
                        return;
                    }

                    if (action === 'change_media') {
                        if (!media || !media.title) {
                            send('party:error', { message: 'Invalid media item.' });
                            return;
                        }

                        currentRoom.media = media;
                        currentRoom.playback.currentTime = 0;
                        currentRoom.playback.isPlaying = false;
                        currentRoom.playback.lastUpdated = Date.now();

                        const titleText = media.title + (media.season && media.episode ? ` (S${media.season}E${media.episode})` : '');
                        const changeMsg = {
                            id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            type: 'system',
                            text: `🎬 ${currentUser.name} loaded: ${titleText}`,
                            time: Date.now()
                        };
                        currentRoom.messages.push(changeMsg);

                        broadcastToRoom(currentRoom, 'party:media_changed', {
                            media: currentRoom.media,
                            by: currentUser.name,
                            byId: currentUser.id,
                            message: changeMsg
                        });
                        return;
                    }

                    if (action === 'set_control_mode') {
                        if (!currentUser.isHost) {
                            send('party:error', { message: 'Only the host can change control permissions.' });
                            return;
                        }
                        const newMode = controlMode === 'host_only' ? 'host_only' : 'everyone';
                        currentRoom.controlMode = newMode;

                        const modeMsg = {
                            id: `sys-${Date.now()}`,
                            type: 'system',
                            text: newMode === 'host_only' ? '🔒 Playback control locked to Host only' : '🔓 Playback control open to everyone',
                            time: Date.now()
                        };
                        currentRoom.messages.push(modeMsg);

                        broadcastToRoom(currentRoom, 'party:control_mode_changed', {
                            controlMode: newMode,
                            message: modeMsg
                        });
                        return;
                    }
                }

                // 5. CHAT MESSAGE
                if (event === 'party:chat') {
                    const text = (data.text || '').trim().slice(0, 300);
                    if (!text) return;

                    const now = Date.now();
                    currentUser._chatTimes = (currentUser._chatTimes || []).filter(t => (now - t) < 3000);
                    if (currentUser._chatTimes.length >= 5) {
                        send('party:error', { message: 'Chat rate limit: please wait a moment before sending more messages.' });
                        return;
                    }
                    currentUser._chatTimes.push(now);

                    const chatMsg = {
                        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        type: 'chat',
                        userId: currentUser.id,
                        name: currentUser.name,
                        avatar: currentUser.avatar || '🍿',
                        isHost: currentUser.isHost,
                        text,
                        time: Date.now()
                    };

                    currentRoom.messages.push(chatMsg);
                    if (currentRoom.messages.length > 100) {
                        currentRoom.messages.shift();
                    }

                    broadcastToRoom(currentRoom, 'party:chat_message', { message: chatMsg });
                    return;
                }

                // 6. FLOATING REACTION
                if (event === 'party:reaction') {
                    const now = Date.now();
                    currentUser._reactionTimes = (currentUser._reactionTimes || []).filter(t => (now - t) < 2000);
                    if (currentUser._reactionTimes.length >= 6) return;
                    currentUser._reactionTimes.push(now);

                    const emoji = (data.emoji || '❤️').slice(0, 4);
                    broadcastToRoom(currentRoom, 'party:reaction', {
                        emoji,
                        userId: currentUser.id,
                        name: currentUser.name
                    });
                    return;
                }

                // 7. TIME RESYNC REQUEST / HEARTBEAT
                if (event === 'party:heartbeat') {
                    send('party:heartbeat_ack', {
                        playback: {
                            isPlaying: currentRoom.playback.isPlaying,
                            currentTime: getAuthoritativeTime(currentRoom),
                            lastUpdated: currentRoom.playback.lastUpdated
                        },
                        userCount: currentRoom.users.size
                    });
                    return;
                }
            } catch (err) {
                console.error('[WatchParty] Message parsing error:', err.message);
            }
        });

        ws.on('close', () => {
            if (currentRoom) {
                handleUserLeave(ws, currentRoom);
            }
        });

        ws.on('error', (err) => {
            console.error('[WatchParty] Socket error:', err.message);
            if (currentRoom) {
                handleUserLeave(ws, currentRoom);
            }
        });
    });

    console.log('[WatchParty] Real-time WebSocket server initialized on path /ws/party');

    // Return helper to inspect room via HTTP
    return {
        getRoomInfo: (code) => {
            const room = rooms.get(code.toUpperCase());
            return serializeRoom(room);
        },
        getActiveRoomsCount: () => rooms.size
    };
}

module.exports = { initWatchPartyServer };
