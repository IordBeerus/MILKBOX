(function () {
    // Pinned Google Drive Target Folder
    const TARGET_FOLDER_ID = '10tvBZbrFa6sHGvrP1XGG82kHbX2QjB2-';
    const TARGET_FOLDER_NAME = 'Google Drive Music Library';
    const TARGET_FOLDER_LINK = 'https://drive.google.com/drive/folders/10tvBZbrFa6sHGvrP1XGG82kHbX2QjB2-?usp=drive_link';

    // In-memory auth state
    let cachedAccessToken = null;
    let currentUser = null;
    let selectedFolder = { id: TARGET_FOLDER_ID, name: TARGET_FOLDER_NAME };
    let libraryTracks = [];
    let libraryArtists = [];
    let libraryAlbums = [];
    let libraryFolders = [];
    let currentView = 'artists'; // 'artists' | 'albums' | 'folders' | 'tracks'
    let selectedArtistFilter = null;
    let selectedAlbumFilter = null;
    let selectedFolderFilter = null;
    let isScanning = false;

    const CACHE_KEY_LIBRARY = 'milkbox_gdrive_music_library';
    const CACHE_KEY_CHUNK_PREFIX = 'milkbox_gdrive_chunk_';
    const CACHE_KEY_CHUNK_COUNT = 'milkbox_gdrive_chunk_count';
    const CHUNK_PAGE_SIZE = 25; // 25 tracks per page (~5-12 KB per chunk, well below browser quotas)
    const CACHE_KEY_FOLDER = 'milkbox_gdrive_selected_folder';
    const CACHE_KEY_FOLDERS = 'milkbox_gdrive_music_folders';

    const GOOGLE_CLIENT_ID = '744931726227-96j4j3phqbvnvjhelbes7dp2sor2m18v.apps.googleusercontent.com';
    const GOOGLE_PROJECT_ID = '744931726227';
    const CACHE_KEY_USER = 'milkbox_gdrive_user';
    const CACHE_KEY_TOKEN = 'milkbox_gdrive_token';
    const CACHE_KEY_EXPIRES = 'milkbox_gdrive_token_expires';

    let tokenClient = null;
    let pendingAuthResolve = null;
    let pendingAuthReject = null;

    // Indexeddb Storage (Resolves Localstorage 5Mb Quota Restrictions)

    const IDB_DB_NAME = 'milkbox_music_idb';
    const IDB_STORE_NAME = 'tracks';
    const IDB_VERSION = 1;

    function openMusicDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB not supported'));
                return;
            }
            const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
                    db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
        });
    }

    async function saveTracksToIndexedDB(tracks) {
        try {
            const db = await openMusicDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
                const store = tx.objectStore(IDB_STORE_NAME);
                store.clear();
                for (const track of tracks) {
                    store.put(track);
                }
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => {
                    console.warn('[GDrive Music] IndexedDB transaction warning:', tx.error);
                    reject(tx.error);
                };
            });
        } catch (e) {
            console.warn('[GDrive Music] IndexedDB save notice:', e.message);
            return false;
        }
    }

    async function loadTracksFromIndexedDB() {
        try {
            const db = await openMusicDB();
            return new Promise((resolve) => {
                const tx = db.transaction(IDB_STORE_NAME, 'readonly');
                const store = tx.objectStore(IDB_STORE_NAME);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        } catch (e) {
            return [];
        }
    }

    async function clearTracksFromIndexedDB() {
        try {
            const db = await openMusicDB();
            return new Promise((resolve) => {
                const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
                const store = tx.objectStore(IDB_STORE_NAME);
                store.clear();
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (e) {
            return false;
        }
    }

    function sanitizeTracksForLocalStorage(tracks) {
        // Strip out large embedded data: base64 URLs so storage stays compact
        return tracks.map(t => {
            const clean = { ...t };
            if (clean.coverUrl && clean.coverUrl.startsWith('data:')) {
                clean.coverUrl = '';
            }
            return clean;
        });
    }

    // Paginated Local Storage (Prevents Setitem Quota Exceeded Error)

    function cleanupPaginatedLocalStorage() {
        try {
            const countStr = localStorage.getItem(CACHE_KEY_CHUNK_COUNT);
            const count = countStr ? parseInt(countStr, 10) : 60;
            const limit = Math.max(isNaN(count) ? 0 : count, 60);
            for (let i = 0; i < limit; i++) {
                localStorage.removeItem(`${CACHE_KEY_CHUNK_PREFIX}${i}`);
            }
            localStorage.removeItem(CACHE_KEY_CHUNK_COUNT);
            localStorage.removeItem(CACHE_KEY_LIBRARY);
        } catch (e) {}
    }

    function saveTracksPaginatedLocalStorage(tracks) {
        // First, purge previous chunked keys and any legacy monolithic key
        cleanupPaginatedLocalStorage();

        if (!Array.isArray(tracks) || tracks.length === 0) return 0;

        const sanitized = sanitizeTracksForLocalStorage(tracks);
        const totalPages = Math.ceil(sanitized.length / CHUNK_PAGE_SIZE);
        let savedPages = 0;

        for (let i = 0; i < totalPages; i++) {
            const start = i * CHUNK_PAGE_SIZE;
            const pageTracks = sanitized.slice(start, start + CHUNK_PAGE_SIZE);
            try {
                localStorage.setItem(`${CACHE_KEY_CHUNK_PREFIX}${i}`, JSON.stringify(pageTracks));
                savedPages++;
            } catch (err) {
                console.warn(`[GDrive Music] LocalStorage quota reached at page ${i + 1}/${totalPages}. Stored ${savedPages} pages.`);
                break;
            }
        }

        try {
            localStorage.setItem(CACHE_KEY_CHUNK_COUNT, String(savedPages));
        } catch (e) {}

        // Ensure legacy monolithic key is cleared so it doesn't waste space
        try {
            localStorage.removeItem(CACHE_KEY_LIBRARY);
        } catch (e) {}

        return savedPages;
    }

    function loadTracksPaginatedLocalStorage() {
        try {
            const countStr = localStorage.getItem(CACHE_KEY_CHUNK_COUNT);
            if (countStr) {
                const count = parseInt(countStr, 10);
                if (!isNaN(count) && count > 0) {
                    const tracks = [];
                    for (let i = 0; i < count; i++) {
                        const pageData = localStorage.getItem(`${CACHE_KEY_CHUNK_PREFIX}${i}`);
                        if (pageData) {
                            try {
                                const parsedPage = JSON.parse(pageData);
                                if (Array.isArray(parsedPage)) {
                                    tracks.push(...parsedPage);
                                }
                            } catch (e) {}
                        }
                    }
                    if (tracks.length > 0) return tracks;
                }
            }

            // Fallback for legacy single-key cache if present
            const legacy = localStorage.getItem(CACHE_KEY_LIBRARY);
            if (legacy) {
                const parsed = JSON.parse(legacy);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('[GDrive Music] Error loading paginated localStorage:', e.message);
        }
        return [];
    }

    // Chunked Library Upload (Server Persistence Backup)

    async function uploadLibraryInChunks(tracks, folderId = TARGET_FOLDER_ID, folderName = TARGET_FOLDER_NAME) {
        if (!Array.isArray(tracks) || tracks.length === 0) return false;
        const sanitized = sanitizeTracksForLocalStorage(tracks);
        const UPLOAD_CHUNK_SIZE = 50;
        const totalChunks = Math.ceil(sanitized.length / UPLOAD_CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * UPLOAD_CHUNK_SIZE;
            const chunkTracks = sanitized.slice(start, start + UPLOAD_CHUNK_SIZE);
            try {
                await fetch('/api/gdrive/library/chunk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chunkIndex: i,
                        totalChunks,
                        tracks: chunkTracks,
                        folderId,
                        folderName
                    })
                });
            } catch (err) {
                console.warn(`[GDrive Music] Chunk ${i + 1}/${totalChunks} upload notice:`, err.message);
                break;
            }
        }
        return true;
    }

    async function saveLibraryTracks(tracks) {
        // 1. Primary storage: IndexedDB (handles gigabytes of data and base64 artwork easily)
        await saveTracksToIndexedDB(tracks);

        // 2. Paginated LocalStorage approach: stored in small pages to prevent setItem quota exceeded errors
        saveTracksPaginatedLocalStorage(tracks);

        // 3. Chunked Library Upload: backup parsed library metadata to server in 50-track batches
        uploadLibraryInChunks(tracks, selectedFolder.id, selectedFolder.name).catch(() => {});
    }

    // 1. Google Cloud Oauth 2.0 & Initialization (Google Identity Services)

    async function getOAuthConfig() {
        try {
            const res = await fetch('/firebase-applet-config.json');
            if (res.ok) {
                const data = await res.json();
                return {
                    clientId: data.oAuthClientId || GOOGLE_CLIENT_ID,
                    projectId: data.projectId || GOOGLE_PROJECT_ID
                };
            }
        } catch (e) {
            console.warn('[GDrive Music] Failed to fetch applet config, using defaults:', e.message);
        }
        return {
            clientId: GOOGLE_CLIENT_ID,
            projectId: GOOGLE_PROJECT_ID
        };
    }

    function isTokenExpired() {
        if (!cachedAccessToken) return true;
        const expiresAtStr = sessionStorage.getItem(CACHE_KEY_EXPIRES);
        if (!expiresAtStr) return false;
        return Date.now() >= Number(expiresAtStr);
    }

    function ensureGsiLoaded() {
        return new Promise((resolve) => {
            if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                resolve(true);
                return;
            }
            let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
            if (!script) {
                script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                document.head.appendChild(script);
            }
            let count = 0;
            const check = setInterval(() => {
                count++;
                if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                    clearInterval(check);
                    resolve(true);
                } else if (count > 60) {
                    clearInterval(check);
                    resolve(false);
                }
            }, 50);
        });
    }

    function initTokenClientInstance(clientId) {
        if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return;
        try {
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
                callback: async (response) => {
                    if (response.error) {
                        console.error('[GDrive Music] OAuth response error:', response);
                        if (pendingAuthReject) {
                            pendingAuthReject(new Error(response.error_description || response.error));
                            pendingAuthReject = null;
                            pendingAuthResolve = null;
                        }
                        if (response.error === 'origin_mismatch') {
                            showCloudAuthModal(GOOGLE_PROJECT_ID, 'Origin mismatch: preview domain must be in Authorized JavaScript origins.');
                        } else {
                            notify(`Google authorization: ${response.error_description || response.error}`, 'error');
                        }
                        return;
                    }
                    if (response.access_token) {
                        const token = response.access_token;
                        const expiresInSec = Number(response.expires_in) || 3600;
                        const expiresAt = Date.now() + (expiresInSec * 1000) - 60000;
                        try {
                            sessionStorage.setItem(CACHE_KEY_EXPIRES, String(expiresAt));
                        } catch (e) {}

                        await onTokenReceived(token, false);

                        if (pendingAuthResolve) {
                            pendingAuthResolve(token);
                            pendingAuthResolve = null;
                            pendingAuthReject = null;
                        }
                    }
                },
                error_callback: (err) => {
                    console.warn('[GDrive Music] OAuth popup error:', err);
                    if (pendingAuthReject) {
                        pendingAuthReject(new Error(err && err.message ? err.message : 'Google authorization closed'));
                        pendingAuthReject = null;
                        pendingAuthResolve = null;
                    }
                    if (err && err.type === 'popup_closed') {
                        notify('Google sign-in window closed.', 'info');
                    } else if (err && err.message) {
                        notify(err.message, 'info');
                    }
                }
            });
        } catch (err) {
            console.error('[GDrive Music] Could not init token client:', err);
        }
    }

    function requestGoogleAccessToken(promptType = 'select_account') {
        if (!tokenClient) {
            initTokenClientInstance(getActiveClientId());
        }

        if (!tokenClient) {
            notify('Google authorization is initializing. Please click again.', 'info');
            return Promise.reject(new Error('Google OAuth token client not ready'));
        }

        return new Promise((resolve, reject) => {
            pendingAuthResolve = resolve;
            pendingAuthReject = reject;

            try {
                // Must be called synchronously within the user click turn to preserve browser activation
                tokenClient.requestAccessToken({ prompt: promptType });
            } catch (err) {
                pendingAuthResolve = null;
                pendingAuthReject = null;
                reject(err);
            }
        });
    }

    async function ensureValidToken(interactive = false) {
        if (cachedAccessToken && !isTokenExpired()) {
            return cachedAccessToken;
        }

        // Never attempt popup windows in background/silent tasks
        if (!interactive) {
            return null;
        }

        // Only when explicitly initiated by user interaction
        notify('Refreshing Google Drive authorization...', 'info');
        try {
            const token = await requestGoogleAccessToken('select_account');
            return token;
        } catch (err) {
            console.warn('[GDrive Music] Sign-in notice:', err.message);
            throw err;
        }
    }

    async function fetchDriveApi(url, options = {}) {
        const token = cachedAccessToken;
        if (!token || isTokenExpired()) {
            cachedAccessToken = null;
            updateConnectedUI();
            throw new Error('Google Drive session expired. Please click "Sync Music" or "Connect Drive" to reconnect.');
        }

        const headers = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`
        };

        const res = await fetch(url, { ...options, headers });

        if (res.status === 401) {
            console.warn('[GDrive Music] Received 401 Unauthorized from Drive API.');
            cachedAccessToken = null;
            try {
                sessionStorage.removeItem(CACHE_KEY_TOKEN);
                sessionStorage.removeItem(CACHE_KEY_EXPIRES);
            } catch (e) {}
            updateConnectedUI();
            notify('Google Drive session expired. Click "Sync Music" or "Connect Drive" to reconnect.', 'info');
            throw new Error('Google Drive authorization expired. Please click "Sync Music" or "Connect Drive" to reconnect.');
        }

        return res;
    }

    async function fetchFolderInfo(folderId = TARGET_FOLDER_ID) {
        if (!cachedAccessToken) return;
        try {
            const res = await fetchDriveApi(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name&supportsAllDrives=true`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.name) {
                    selectedFolder = { id: folderId, name: data.name };
                    try {
                        localStorage.setItem(CACHE_KEY_FOLDER, JSON.stringify(selectedFolder));
                    } catch (e) {}
                    const headerFolderName = document.getElementById('gdriveHeaderFolderName');
                    if (headerFolderName) headerFolderName.textContent = data.name;
                }
            }
        } catch (e) {
            console.warn('[GDrive Music] Could not fetch folder details:', e.message);
        }
    }

    async function fetchUserProfile(token) {
        try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                return {
                    displayName: data.name || data.given_name || 'Google User',
                    email: data.email || '',
                    photoURL: data.picture || '',
                    uid: data.sub || ''
                };
            }
        } catch (e) {
            console.warn('[GDrive Music] Could not fetch Google user profile:', e.message);
        }
        return {
            displayName: 'Google Drive User',
            email: '',
            photoURL: '',
            uid: 'gdrive-user'
        };
    }

    async function onTokenReceived(token, autoScan = false) {
        cachedAccessToken = token;
        try {
            sessionStorage.setItem(CACHE_KEY_TOKEN, token);
        } catch (e) {}

        const profile = await fetchUserProfile(token);
        currentUser = profile;
        try {
            localStorage.setItem(CACHE_KEY_USER, JSON.stringify(profile));
        } catch (e) {}

        closeCloudAuthModal();
        updateConnectedUI();

        if (autoScan) {
            notify(`Connected as ${currentUser.displayName}! 🎵 Syncing library...`, 'success');
            await fetchFolderInfo(TARGET_FOLDER_ID);
            await scanFolder(TARGET_FOLDER_ID, selectedFolder.name);
        }
    }

    async function initGoogleAuth() {
        // Restore saved folder
        try {
            const savedFolder = localStorage.getItem(CACHE_KEY_FOLDER);
            if (savedFolder) {
                const parsedFolder = JSON.parse(savedFolder);
                if (parsedFolder && parsedFolder.id === TARGET_FOLDER_ID) {
                    selectedFolder = parsedFolder;
                }
            }
        } catch (e) {}

        // Invalidate stale token if OAuth client ID has changed
        try {
            const lastClientId = localStorage.getItem('milkbox_gdrive_active_client_id');
            if (lastClientId && lastClientId !== GOOGLE_CLIENT_ID) {
                sessionStorage.removeItem(CACHE_KEY_TOKEN);
                sessionStorage.removeItem(CACHE_KEY_EXPIRES);
                localStorage.removeItem(CACHE_KEY_USER);
            }
            localStorage.setItem('milkbox_gdrive_active_client_id', GOOGLE_CLIENT_ID);
        } catch (e) {}

        // Restore saved user profile
        try {
            const savedUser = localStorage.getItem(CACHE_KEY_USER);
            if (savedUser) {
                currentUser = JSON.parse(savedUser);
            }
        } catch (e) {}

        // Restore token from sessionStorage if not expired
        try {
            const savedToken = sessionStorage.getItem(CACHE_KEY_TOKEN);
            if (savedToken) {
                cachedAccessToken = savedToken;
            }
        } catch (e) {}

        // Restore saved library tracks (IndexedDB -> Paginated localStorage -> Server cache)
        try {
            let loaded = false;
            const idbTracks = await loadTracksFromIndexedDB();
            if (Array.isArray(idbTracks) && idbTracks.length > 0) {
                libraryTracks = idbTracks;
                buildArtistAndAlbumIndexes();
                loaded = true;
            }

            if (!loaded) {
                const paginatedTracks = loadTracksPaginatedLocalStorage();
                if (Array.isArray(paginatedTracks) && paginatedTracks.length > 0) {
                    paginatedTracks.forEach(t => {
                        if (!t.coverUrl) {
                            t.coverUrl = generateVinylArt(t.title, t.artist);
                        }
                    });
                    libraryTracks = paginatedTracks;
                    buildArtistAndAlbumIndexes();
                    loaded = true;
                }
            }

            if (!loaded) {
                try {
                    const res = await fetch('/api/gdrive/library/cache');
                    if (res.ok) {
                        const data = await res.json();
                        if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
                            data.tracks.forEach(t => {
                                if (!t.coverUrl) {
                                    t.coverUrl = generateVinylArt(t.title, t.artist);
                                }
                            });
                            libraryTracks = data.tracks;
                            buildArtistAndAlbumIndexes();
                            loaded = true;
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}

        // Update UI immediately with restored cached state
        updateConnectedUI();

        // Eagerly prepare Google Identity Services client in background
        const isLoaded = await ensureGsiLoaded();
        if (isLoaded) {
            const cfg = await getOAuthConfig();
            const activeId = getActiveClientId() || cfg.clientId;
            initTokenClientInstance(activeId);
        }

        // If we have an active token, refresh folder metadata
        if (cachedAccessToken && !isTokenExpired()) {
            fetchFolderInfo(TARGET_FOLDER_ID);
        }
    }

    async function connectGoogleDrive() {
        try {
            notify('Opening Google authorization...', 'info');
            const token = await requestGoogleAccessToken('select_account');
            if (token) {
                notify(`Connected as ${currentUser ? currentUser.displayName : 'Google User'}! 🎵 Syncing library...`, 'success');
                await fetchFolderInfo(TARGET_FOLDER_ID);
                await scanFolder(TARGET_FOLDER_ID, selectedFolder.name);
                return token;
            }
        } catch (err) {
            console.error('[GDrive Music] Failed to request access token:', err);
            showCloudAuthModal(GOOGLE_PROJECT_ID, 'Google OAuth 2.0 Policy Error 400: origin_mismatch');
            return null;
        }
    }

    function getActiveClientId() {
        return localStorage.getItem('milkbox_gdrive_custom_client_id') || GOOGLE_CLIENT_ID;
    }

    function showCloudAuthModal(projectId = GOOGLE_PROJECT_ID, reason = '') {
        closeCloudAuthModal();

        const currentOrigin = window.location.origin;
        let pairedOrigin = '';
        if (currentOrigin.includes('ais-dev-')) {
            pairedOrigin = currentOrigin.replace('ais-dev-', 'ais-pre-');
        } else if (currentOrigin.includes('ais-pre-')) {
            pairedOrigin = currentOrigin.replace('ais-pre-', 'ais-dev-');
        }

        const activeClient = getActiveClientId();
        const credentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${encodeURIComponent(projectId)}`;
        const consentScreenUrl = `https://console.cloud.google.com/apis/credentials/consent?project=${encodeURIComponent(projectId)}`;

        const modal = document.createElement('div');
        modal.id = 'gdriveAuthModalBackdrop';
        modal.className = 'gdrive-auth-modal-backdrop';
        modal.innerHTML = `
            <div class="gdrive-auth-modal-card">
                <button type="button" class="gdrive-auth-modal-close" id="gdriveCloseAuthModalBtn" aria-label="Close dialog">&times;</button>
                <div class="gdrive-auth-modal-header">
                    <div class="gdrive-auth-modal-icon">
                        <svg viewBox="0 0 24 24" height="24" width="24" fill="currentColor">
                            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="gdrive-auth-modal-title">Fix Google OAuth 2.0 Policy Error</h3>
                        <p style="margin:2px 0 0 0;font-size:12px;color:#94a3b8;">
                            Google Cloud Project: <strong style="color:#60a5fa;">${escapeHtml(projectId)}</strong>
                        </p>
                    </div>
                </div>

                <div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12.5px;color:#fca5a5;line-height:1.5;">
                    <div style="font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                        <svg viewBox="0 0 24 24" height="16" width="16" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                        Why "Error 400: origin_mismatch" occurs:
                    </div>
                    Google OAuth strictly checks the <strong>Authorized JavaScript origins</strong> of the OAuth Client ID. Cloudflare Access only configures <em>Redirect URIs</em>, but this browser-based music stream requires registering the app's web origin in Google Cloud Console.
                </div>

                <p class="gdrive-auth-modal-desc" style="margin-bottom:8px;">
                    <strong>Step 1:</strong> Copy the App Origin URLs below:
                </p>

                <div class="gdrive-domain-copy-box">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:2px;">Current App Origin (Required)</div>
                        <span class="gdrive-domain-text" id="gdriveDomainText">${escapeHtml(currentOrigin)}</span>
                    </div>
                    <button type="button" class="gdrive-copy-btn" id="gdriveCopyDomainBtn">
                        <svg viewBox="0 0 24 24" height="14" width="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        <span id="gdriveCopyLabel">Copy Origin</span>
                    </button>
                </div>

                ${pairedOrigin ? `
                <div class="gdrive-domain-copy-box" style="margin-top:-8px;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:2px;">Preview/Staging Origin (Recommended)</div>
                        <span class="gdrive-domain-text" style="color:#cbd5e1;">${escapeHtml(pairedOrigin)}</span>
                    </div>
                    <button type="button" class="gdrive-copy-btn" id="gdriveCopyPairedBtn" style="background:#475569;">
                        <svg viewBox="0 0 24 24" height="14" width="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        <span id="gdriveCopyPairedLabel">Copy</span>
                    </button>
                </div>
                ` : ''}

                <div style="font-size:12px;font-weight:700;color:#e2e8f0;margin:12px 0 6px 0;">Step 2: Add to Google Cloud Console</div>
                <ul class="gdrive-auth-steps">
                    <li class="gdrive-auth-step-item">
                        <span class="gdrive-step-num">1</span>
                        <span>Click <strong>Open Google Cloud Credentials ↗</strong> below.</span>
                    </li>
                    <li class="gdrive-auth-step-item">
                        <span class="gdrive-step-num">2</span>
                        <span>Under <strong>OAuth 2.0 Client IDs</strong>, click your Web Client (<code>${escapeHtml(activeClient.slice(0, 16))}...</code>).</span>
                    </li>
                    <li class="gdrive-auth-step-item">
                        <span class="gdrive-step-num">3</span>
                        <span>Scroll down to <strong>Authorized JavaScript origins</strong> (NOT Authorized redirect URIs).</span>
                    </li>
                    <li class="gdrive-auth-step-item">
                        <span class="gdrive-step-num">4</span>
                        <span>Click <strong>+ ADD URI</strong>, paste <code>${escapeHtml(currentOrigin)}</code>, and click <strong>SAVE</strong>.</span>
                    </li>
                    <li class="gdrive-auth-step-item">
                        <span class="gdrive-step-num">5</span>
                        <span>In <a href="${consentScreenUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;">OAuth consent screen ↗</a>, ensure <strong>raypolebobby15@gmail.com</strong> is added under <strong>Test users</strong> (if publishing status is Testing).</span>
                    </li>
                </ul>

                <div class="gdrive-auth-modal-actions">
                    <a href="${credentialsUrl}" target="_blank" rel="noopener noreferrer" class="gdrive-auth-btn-external">
                        <svg viewBox="0 0 24 24" height="15" width="15" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                        Open Google Cloud Credentials ↗
                    </a>
                    <a href="${consentScreenUrl}" target="_blank" rel="noopener noreferrer" class="gdrive-auth-btn-external" style="background:#0f766e;">
                        <svg viewBox="0 0 24 24" height="15" width="15" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        OAuth Consent Screen ↗
                    </a>
                    <button type="button" class="gdrive-auth-btn-primary" id="gdriveRetryAuthBtn">
                        <svg viewBox="0 0 24 24" height="15" width="15" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                        Retry Sign-In
                    </button>
                </div>

                <!-- Client ID Config Section -->
                <details class="gdrive-manual-token-details" style="margin-top:14px;">
                    <summary class="gdrive-manual-token-summary">⚙️ Change or Switch OAuth Client ID</summary>
                    <div style="margin-top:10px;display:flex;gap:8px;flex-direction:column;">
                        <input type="text" id="gdriveClientIdInput" class="gdrive-manual-token-input" value="${escapeHtml(activeClient)}" placeholder="Your OAuth Client ID (*.apps.googleusercontent.com)">
                        <div style="display:flex;gap:8px;">
                            <button type="button" class="gdrive-copy-btn" id="gdriveSaveClientIdBtn" style="padding:6px 14px;">Update Client ID</button>
                            <button type="button" class="gdrive-copy-btn" id="gdriveResetClientIdBtn" style="background:#475569;padding:6px 14px;">Reset Default</button>
                        </div>
                    </div>
                </details>

                <!-- Immediate Bearer Token Fallback -->
                <details class="gdrive-manual-token-details">
                    <summary class="gdrive-manual-token-summary">⚡ Have an existing Google Bearer Token? Connect immediately</summary>
                    <div class="gdrive-manual-token-row">
                        <input type="password" id="gdriveManualTokenInput" class="gdrive-manual-token-input" placeholder="Paste Google Bearer Token (ya29...)">
                        <button type="button" class="gdrive-auth-btn-primary" id="gdriveApplyManualTokenBtn">Connect</button>
                    </div>
                </details>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('gdriveCopyDomainBtn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(currentOrigin).then(() => {
                const label = document.getElementById('gdriveCopyLabel');
                if (label) label.textContent = 'Copied! ✓';
                setTimeout(() => {
                    if (label) label.textContent = 'Copy Origin';
                }, 2500);
            }).catch(() => {
                notify(`Origin: ${currentOrigin}`, 'info');
            });
        });

        if (pairedOrigin) {
            document.getElementById('gdriveCopyPairedBtn')?.addEventListener('click', () => {
                navigator.clipboard.writeText(pairedOrigin).then(() => {
                    const label = document.getElementById('gdriveCopyPairedLabel');
                    if (label) label.textContent = 'Copied! ✓';
                    setTimeout(() => {
                        if (label) label.textContent = 'Copy';
                    }, 2500);
                }).catch(() => {
                    notify(`Origin: ${pairedOrigin}`, 'info');
                });
            });
        }

        document.getElementById('gdriveCloseAuthModalBtn')?.addEventListener('click', closeCloudAuthModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeCloudAuthModal();
        });

        document.getElementById('gdriveRetryAuthBtn')?.addEventListener('click', () => {
            closeCloudAuthModal();
            connectGoogleDrive();
        });

        document.getElementById('gdriveSaveClientIdBtn')?.addEventListener('click', () => {
            const input = document.getElementById('gdriveClientIdInput');
            if (input && input.value) {
                const newId = input.value.trim();
                if (newId) {
                    localStorage.setItem('milkbox_gdrive_custom_client_id', newId);
                    initTokenClientInstance(newId);
                    notify('Updated OAuth Client ID.', 'success');
                }
            }
        });

        document.getElementById('gdriveResetClientIdBtn')?.addEventListener('click', () => {
            localStorage.removeItem('milkbox_gdrive_custom_client_id');
            initTokenClientInstance(GOOGLE_CLIENT_ID);
            const input = document.getElementById('gdriveClientIdInput');
            if (input) input.value = GOOGLE_CLIENT_ID;
            notify('Reset to default OAuth Client ID.', 'info');
        });

        document.getElementById('gdriveApplyManualTokenBtn')?.addEventListener('click', () => {
            const input = document.getElementById('gdriveManualTokenInput');
            if (input && input.value) {
                connectWithManualToken(input.value);
            }
        });
    }

    function closeCloudAuthModal() {
        const modal = document.getElementById('gdriveAuthModalBackdrop');
        if (modal) modal.remove();
    }

    async function connectWithManualToken(rawToken) {
        const cleanToken = (rawToken || '').trim();
        if (!cleanToken) {
            notify('Please enter a valid Google access token.', 'error');
            return;
        }

        closeCloudAuthModal();
        await onTokenReceived(cleanToken, true);
    }

    async function disconnectGoogleDrive() {
        if (confirm('Disconnect Google Drive from Milkbox? Your cached music index will be cleared.')) {
            if (cachedAccessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
                try {
                    window.google.accounts.oauth2.revoke(cachedAccessToken, () => {
                        console.log('[GDrive Music] Token revoked on Google');
                    });
                } catch (e) {}
            }
            cachedAccessToken = null;
            currentUser = null;
            selectedFolder = { id: TARGET_FOLDER_ID, name: TARGET_FOLDER_NAME };
            libraryTracks = [];
            libraryArtists = [];
            libraryAlbums = [];
            libraryFolders = [];
            selectedArtistFilter = null;
            selectedAlbumFilter = null;
            selectedFolderFilter = null;
            try {
                sessionStorage.removeItem(CACHE_KEY_TOKEN);
                sessionStorage.removeItem(CACHE_KEY_EXPIRES);
                localStorage.removeItem(CACHE_KEY_USER);
                localStorage.removeItem(CACHE_KEY_FOLDER);
                localStorage.removeItem(CACHE_KEY_LIBRARY);
                localStorage.removeItem(CACHE_KEY_FOLDERS);
                cleanupPaginatedLocalStorage();
                await clearTracksFromIndexedDB();
                fetch('/api/gdrive/library/clear', { method: 'POST' }).catch(() => {});
            } catch (e) {}
            updateConnectedUI();
            notify('Google Drive disconnected.', 'info');
        }
    }

    // 2. Folder Access & Navigation

    function openTargetFolderInDrive() {
        window.open(TARGET_FOLDER_LINK, '_blank', 'noopener,noreferrer');
    }

    // 3. Folder Scanning & Recursive Discovery

    async function scanFolder(folderId = TARGET_FOLDER_ID, folderName = (selectedFolder ? selectedFolder.name : TARGET_FOLDER_NAME)) {
        if (isScanning) return;

        if (!cachedAccessToken || isTokenExpired()) {
            notify('Please connect Google Drive to sync your music.', 'info');
            connectGoogleDrive();
            return;
        }

        const effectiveFolderId = TARGET_FOLDER_ID;
        const effectiveFolderName = selectedFolder ? selectedFolder.name : folderName;

        isScanning = true;
        renderScanningUI(effectiveFolderName, 0);

        try {
            // Optional check: verify folder exists/accessible
            try {
                const folderCheck = await fetchDriveApi(`https://www.googleapis.com/drive/v3/files/${effectiveFolderId}?fields=id,name&supportsAllDrives=true`);
                if (folderCheck.ok) {
                    const fData = await folderCheck.json();
                    if (fData && fData.name) {
                        selectedFolder = { id: effectiveFolderId, name: fData.name };
                        const headerFolderName = document.getElementById('gdriveHeaderFolderName');
                        if (headerFolderName) headerFolderName.textContent = fData.name;
                    }
                }
            } catch (e) {}

            const discoveredFiles = [];
            const discoveredFoldersMap = {};
            const rootFolderInfo = {
                id: effectiveFolderId,
                name: effectiveFolderName,
                parentId: null,
                path: [],
                audioFiles: [],
                imageFiles: []
            };
            discoveredFoldersMap[effectiveFolderId] = rootFolderInfo;

            const folderQueue = [rootFolderInfo];
            const visitedFolders = new Set([effectiveFolderId]);

            // Deep crawl of all album folders and audio files
            while (folderQueue.length > 0 && discoveredFiles.length < 2500) {
                const currentFolder = folderQueue.shift();
                let pageToken = null;

                do {
                    // Valid Google Drive v3 query: active items in current parent folder
                    const queryParts = [
                        `'${currentFolder.id}' in parents`,
                        `trashed = false`
                    ];
                    const url = new URL('https://www.googleapis.com/drive/v3/files');
                    url.searchParams.set('q', queryParts.join(' and '));
                    url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType, size, createdTime, thumbnailLink)');
                    url.searchParams.set('pageSize', '100');
                    url.searchParams.set('supportsAllDrives', 'true');
                    url.searchParams.set('includeItemsFromAllDrives', 'true');
                    if (pageToken) url.searchParams.set('pageToken', pageToken);

                    const res = await fetchDriveApi(url.toString());

                    if (!res.ok) {
                        const errText = await res.text();
                        console.warn('[GDrive Music] Directory list warning:', errText);
                        break;
                    }

                    const data = await res.json();
                    pageToken = data.nextPageToken;

                    if (Array.isArray(data.files)) {
                        for (const file of data.files) {
                            if (file.mimeType === 'application/vnd.google-apps.folder') {
                                const subFolder = {
                                    id: file.id,
                                    name: (file.name || 'Untitled Folder').trim(),
                                    parentId: currentFolder.id,
                                    path: [...currentFolder.path, currentFolder.name],
                                    audioFiles: [],
                                    imageFiles: []
                                };
                                discoveredFoldersMap[file.id] = subFolder;
                                if (!visitedFolders.has(file.id) && visitedFolders.size < 500) {
                                    visitedFolders.add(file.id);
                                    folderQueue.push(subFolder);
                                }
                            } else {
                                const fileName = (file.name || '').trim();
                                const isAudio = (file.mimeType && (file.mimeType.startsWith('audio/') || file.mimeType.includes('audio') || file.mimeType === 'application/ogg')) ||
                                    /\.(mp3|m4a|flac|wav|ogg|aac|opus|wma|aiff|alac|ape|m4b|mp4|webm)$/i.test(fileName);
                                const isImage = (file.mimeType && file.mimeType.startsWith('image/')) ||
                                    /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);

                                if (isAudio) {
                                    file.folderId = currentFolder.id;
                                    file.folderName = currentFolder.name;
                                    file.folderPath = currentFolder.path;
                                    discoveredFiles.push(file);
                                    discoveredFoldersMap[currentFolder.id].audioFiles.push(file);

                                    const folderCount = Object.keys(discoveredFoldersMap).length - 1;
                                    renderScanningUI(effectiveFolderName, discoveredFiles.length, `Scanning folder: "${currentFolder.name}" • ${folderCount > 0 ? `${folderCount} album folders` : 'Root'} • ${discoveredFiles.length} songs`);
                                } else if (isImage) {
                                    discoveredFoldersMap[currentFolder.id].imageFiles.push(file);
                                }
                            }
                        }
                    }
                } while (pageToken && discoveredFiles.length < 2500);
            }

            if (discoveredFiles.length === 0) {
                notify(`No audio files found in "${effectiveFolderName}". Check that your files or album folders are inside Google Drive.`, 'info');
                isScanning = false;
                renderLibrary();
                return;
            }

            const albumFoldersCount = Object.values(discoveredFoldersMap).filter(f => f.id !== effectiveFolderId && f.audioFiles.length > 0).length;
            notify(`Found ${discoveredFiles.length} audio tracks across ${albumFoldersCount || 1} album folder(s)! Extracting tags & covers...`, 'info');

            // Parse metadata for discovered tracks
            const parsedTracks = [];
            for (let i = 0; i < discoveredFiles.length; i++) {
                const file = discoveredFiles[i];
                renderScanningUI(effectiveFolderName, discoveredFiles.length, `Parsing ${i + 1}/${discoveredFiles.length}: ${file.name} (from "${file.folderName}")`);
                const track = await parseDriveAudioFile(file, discoveredFoldersMap);
                parsedTracks.push(track);
            }

            // Enrich unique artists with high-resolution portraits online
            await enrichArtistPhotos(parsedTracks);

            libraryTracks = parsedTracks;
            buildArtistAndAlbumIndexes();

            // Save to persistent storage (IndexedDB + lightweight localStorage fallback)
            await saveLibraryTracks(libraryTracks);

            isScanning = false;
            notify(`Library loaded! ${libraryTracks.length} tracks across ${libraryFolders.length} album folders ready.`, 'success');
            renderLibrary();
        } catch (err) {
            console.error('[GDrive Music] Scan error:', err);
            notify(`Error scanning folder: ${err.message}`, 'error');
            isScanning = false;
            renderLibrary();
        }
    }

    // 4. Metadata & Artwork Extraction (With Folder Inference)

    function inferAlbumAndArtistFromFolder(file, foldersMap) {
        if (!foldersMap || !file.folderId) return { album: '', artist: '', year: '' };
        let folder = foldersMap[file.folderId];
        if (!folder) return { album: '', artist: '', year: '' };

        let albumName = folder.name || '';
        let artistName = '';
        let year = '';

        // If folder is a multi-disc subfolder (e.g. "CD 1", "Disc 2", "Side A", "Bonus Tracks")
        if (/^(cd\s*\d+|disc\s*\d+|disk\s*\d+|side\s*[a-d]|bonus(\s*tracks)?)$/i.test(albumName)) {
            if (folder.parentId && foldersMap[folder.parentId] && folder.parentId !== TARGET_FOLDER_ID) {
                folder = foldersMap[folder.parentId];
                albumName = folder.name;
            }
        }

        // If this folder is the root target folder, do not treat the root container as the album
        if (folder.id === TARGET_FOLDER_ID) {
            return { album: '', artist: '', year: '' };
        }

        // Check if grandparent folder is an artist folder (e.g. Root / Artist / Album / Track.mp3)
        if (folder.parentId && foldersMap[folder.parentId] && folder.parentId !== TARGET_FOLDER_ID) {
            const parentFolder = foldersMap[folder.parentId];
            if (parentFolder.name && !/^(music|songs|albums|audio|my music|google drive music library)$/i.test(parentFolder.name)) {
                artistName = parentFolder.name.trim();
            }
        }

        // Pattern 1: "Artist - Album" (e.g. "Tyler, The Creator - IGOR")
        if (albumName.includes(' - ')) {
            const parts = albumName.split(' - ');
            if (parts.length >= 2) {
                if (!artistName) {
                    artistName = parts[0].trim();
                }
                albumName = parts.slice(1).join(' - ').trim();
            }
        }

        // Pattern 2: "[Year] Album" or "(Year) Album" or "Year - Album"
        const leadingYear = albumName.match(/^[\(\[]?(19\d\d|20\d\d)[\)\]]?[\s\-:]+(.+)$/);
        if (leadingYear) {
            year = leadingYear[1];
            albumName = leadingYear[2].trim();
        }

        // Pattern 3: "Album (Year)" or "Album [Year]"
        const trailingYear = albumName.match(/^(.+?)[\s]+[\(\[](19\d\d|20\d\d)[\)\]]$/);
        if (trailingYear) {
            albumName = trailingYear[1].trim();
            year = trailingYear[2];
        }

        return { album: albumName, artist: artistName, year };
    }

    function getFolderCoverUrl(folderId, foldersMap, token) {
        if (!foldersMap || !folderId) return '';
        let folder = foldersMap[folderId];
        if (!folder) return '';

        // Check this folder and its parent folder (e.g. multi-disc)
        const candidates = [folder];
        if (folder.parentId && foldersMap[folder.parentId]) {
            candidates.push(foldersMap[folder.parentId]);
        }

        for (const cand of candidates) {
            if (cand.imageFiles && cand.imageFiles.length > 0) {
                const preferred = cand.imageFiles.find(img => /(cover|folder|front|album|art)\.(jpe?g|png|webp)/i.test(img.name)) || cand.imageFiles[0];
                if (preferred) {
                    if (preferred.thumbnailLink) {
                        return preferred.thumbnailLink.replace(/=s\d+/, '=s600');
                    }
                    if (token) {
                        return `/api/gdrive/stream?fileId=${encodeURIComponent(preferred.id)}&token=${encodeURIComponent(token)}`;
                    }
                    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(preferred.id)}&sz=w600`;
                }
            }
        }
        return '';
    }

    async function parseDriveAudioFile(file, foldersMap = null) {
        const cleanFileName = file.name || 'Unknown Track';
        const fileExt = cleanFileName.split('.').pop().toUpperCase();
        let title = cleanFileName.replace(/\.[^/.]+$/, '').trim();
        let artist = 'Unknown Artist';
        let album = 'Unknown Album';
        let year = '';
        let coverUrl = '';
        let durationFormatted = '03:30';

        const folderMeta = inferAlbumAndArtistFromFolder(file, foldersMap);

        // Check for "Artist - Title" format in filename
        if (title.includes(' - ')) {
            const parts = title.split(' - ');
            if (parts.length >= 2) {
                artist = parts[0].trim();
                title = parts.slice(1).join(' - ').trim();
            }
        }

        // Clean track numbers (e.g. "01 Bohemian Rhapsody" -> "Bohemian Rhapsody")
        title = title.replace(/^\d+[\s.-]+/, '').trim();

        // Attempt reading ID3 tags via partial byte range (first 256KB) with safety timeout
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const rangeRes = await fetchDriveApi(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, {
                headers: {
                    'Range': 'bytes=0-262143'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (rangeRes.ok || rangeRes.status === 206) {
                const buffer = await rangeRes.arrayBuffer();
                
                // If jsmediatags is available in window
                if (typeof window.jsmediatags !== 'undefined' && buffer.byteLength > 100) {
                    await new Promise((resolve) => {
                        window.jsmediatags.read(new Blob([buffer]), {
                            onSuccess: (tag) => {
                                const tags = tag.tags || {};
                                if (tags.title) title = String(tags.title).trim();
                                if (tags.artist) artist = String(tags.artist).trim();
                                if (tags.album) album = String(tags.album).trim();
                                if (tags.year) year = String(tags.year).trim();
                                if (tags.picture) {
                                    try {
                                        const pic = tags.picture;
                                        const base64String = pic.data.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
                                        const base64 = btoa(base64String);
                                        coverUrl = `data:${pic.format};base64,${base64}`;
                                    } catch (e) {}
                                }
                                resolve();
                            },
                            onError: () => resolve()
                        });
                    });
                }
            }
        } catch (err) {
            // Non-fatal, fallback to folder & filename inference
        }

        // Folder-based metadata enrichment:
        // If ID3 album tag is missing or generic, use the Google Drive album folder name!
        if ((!album || album === 'Unknown Album' || album === 'Unknown') && folderMeta.album) {
            album = folderMeta.album;
        }

        // If artist tag is missing or generic, use the folder artist name!
        if ((!artist || artist === 'Unknown Artist' || artist === 'Unknown') && folderMeta.artist) {
            artist = folderMeta.artist;
        }

        if (!year && folderMeta.year) {
            year = folderMeta.year;
        }

        // If no embedded cover art, use folder artwork (cover.jpg, folder.jpg, etc.)
        if (!coverUrl && foldersMap) {
            const folderCover = getFolderCoverUrl(file.folderId, foldersMap, cachedAccessToken);
            if (folderCover) {
                coverUrl = folderCover;
            }
        }

        // Fallback to beautiful dynamic vinyl artwork if no cover found
        if (!coverUrl) {
            coverUrl = generateVinylArt(title, artist);
        }

        const sizeFormatted = file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : 'Cloud Audio';

        return {
            id: file.id,
            name: file.name,
            title: title || 'Untitled Track',
            artist: artist || 'Unknown Artist',
            album: album || 'Unknown Album',
            year: year,
            coverUrl: coverUrl,
            durationFormatted: durationFormatted,
            size: Number(file.size) || 0,
            sizeFormatted: sizeFormatted,
            mimeType: file.mimeType || 'audio/mpeg',
            formatTag: fileExt || 'MP3',
            qualityBadge: `${fileExt || 'MP3'} • CLOUD STREAM`,
            createdTime: file.createdTime,
            folderId: file.folderId || '',
            folderName: file.folderName || '',
            folderPath: file.folderPath || []
        };
    }

    function generateVinylArt(title, artist) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 400;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';

            const str = (title + ' ' + artist).trim();
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            const hue1 = Math.abs(hash) % 360;
            const hue2 = (hue1 + 60) % 360;

            // Deep gradient
            const grad = ctx.createLinearGradient(0, 0, 400, 400);
            grad.addColorStop(0, `hsl(${hue1}, 65%, 22%)`);
            grad.addColorStop(1, `hsl(${hue2}, 60%, 10%)`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 400, 400);

            // Vinyl rings
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1.5;
            for (let r = 50; r < 185; r += 8) {
                ctx.beginPath();
                ctx.arc(200, 200, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Center record label
            const labelGrad = ctx.createRadialGradient(200, 200, 10, 200, 200, 65);
            labelGrad.addColorStop(0, `hsl(${hue1}, 85%, 55%)`);
            labelGrad.addColorStop(1, `hsl(${hue2}, 75%, 35%)`);
            ctx.fillStyle = labelGrad;
            ctx.beginPath();
            ctx.arc(200, 200, 60, 0, Math.PI * 2);
            ctx.fill();

            // Center hole
            ctx.fillStyle = '#0a0d14';
            ctx.beginPath();
            ctx.arc(200, 200, 14, 0, Math.PI * 2);
            ctx.fill();

            // Letter abbreviation
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((title || 'M').substring(0, 2).toUpperCase(), 200, 165);

            // Google Drive indicator
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '600 11px -apple-system, sans-serif';
            ctx.fillText('GOOGLE DRIVE', 200, 360);

            return canvas.toDataURL('image/jpeg', 0.9);
        } catch (e) {
            return '';
        }
    }

    async function enrichArtistPhotos(tracks) {
        const uniqueArtists = [...new Set(tracks.map(t => t.artist).filter(a => a && a !== 'Unknown Artist'))];
        const artistMap = {};

        // Query iTunes Search API in parallel (batches of 4)
        for (let i = 0; i < Math.min(uniqueArtists.length, 25); i += 4) {
            const batch = uniqueArtists.slice(i, i + 4);
            await Promise.all(batch.map(async (artName) => {
                try {
                    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artName)}&entity=musicArtist&limit=1`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.results && data.results.length > 0) {
                            // If artist found, search top song for high-res artwork
                            const songUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artName)}&entity=song&limit=1`;
                            const sRes = await fetch(songUrl);
                            if (sRes.ok) {
                                const sData = await sRes.json();
                                if (sData.results && sData.results.length > 0 && sData.results[0].artworkUrl100) {
                                    artistMap[artName] = sData.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
                                }
                            }
                        }
                    }
                } catch (e) {}
            }));
        }

        // Apply high-res artist portraits to artists and tracks lacking artwork
        tracks.forEach(track => {
            if (artistMap[track.artist]) {
                track.artistPhoto = artistMap[track.artist];
                if (!track.coverUrl || track.coverUrl.startsWith('data:image')) {
                    track.coverUrl = artistMap[track.artist];
                }
            }
        });
    }

    function buildArtistAndAlbumIndexes() {
        const artistsDict = {};
        const albumsDict = {};
        const foldersDict = {};

        libraryTracks.forEach(t => {
            // Artists
            const artKey = t.artist || 'Unknown Artist';
            if (!artistsDict[artKey]) {
                artistsDict[artKey] = {
                    name: artKey,
                    photo: t.artistPhoto || t.coverUrl,
                    tracks: [],
                    albums: new Set(),
                    folders: new Set()
                };
            }
            artistsDict[artKey].tracks.push(t);
            artistsDict[artKey].albums.add(t.album || 'Unknown Album');
            if (t.folderName) artistsDict[artKey].folders.add(t.folderName);

            // Albums
            const albKey = `${t.artist} - ${t.album || 'Unknown Album'}`;
            if (!albumsDict[albKey]) {
                albumsDict[albKey] = {
                    key: albKey,
                    title: t.album || 'Unknown Album',
                    artist: t.artist || 'Unknown Artist',
                    cover: t.coverUrl,
                    year: t.year || '',
                    folderName: t.folderName || '',
                    folderId: t.folderId || '',
                    tracks: []
                };
            }
            if ((!albumsDict[albKey].cover || albumsDict[albKey].cover.startsWith('data:image')) && t.coverUrl && !t.coverUrl.startsWith('data:image')) {
                albumsDict[albKey].cover = t.coverUrl;
            }
            albumsDict[albKey].tracks.push(t);

            // Album Folders (from Google Drive folder hierarchy)
            const fKey = t.folderId || 'root';
            const fName = t.folderName || selectedFolder.name || TARGET_FOLDER_NAME;
            if (!foldersDict[fKey]) {
                foldersDict[fKey] = {
                    id: fKey,
                    name: fName,
                    album: t.album || fName,
                    artist: t.artist || 'Unknown Artist',
                    cover: t.coverUrl,
                    tracks: []
                };
            }
            if ((!foldersDict[fKey].cover || foldersDict[fKey].cover.startsWith('data:image')) && t.coverUrl && !t.coverUrl.startsWith('data:image')) {
                foldersDict[fKey].cover = t.coverUrl;
            }
            foldersDict[fKey].tracks.push(t);
        });

        libraryArtists = Object.values(artistsDict).map(a => ({
            ...a,
            albumCount: a.albums.size,
            trackCount: a.tracks.length
        })).sort((a, b) => b.trackCount - a.trackCount);

        libraryAlbums = Object.values(albumsDict).sort((a, b) => a.title.localeCompare(b.title));

        libraryFolders = Object.values(foldersDict).sort((a, b) => a.name.localeCompare(b.name));
    }

    // 5. Playback Dispatch To Musify Engine

    async function playTrackInMusify(track, playlistContext = null) {
        if (!window.musifyPlayer) {
            notify('Music Player is still initializing.', 'info');
            return;
        }

        let token = null;
        try {
            token = await ensureValidToken(true);
        } catch (e) {
            notify('Google authorization needed to stream. Please reconnect Google Drive.', 'error');
            return;
        }

        if (!token) {
            notify('Google authorization needed to stream. Please reconnect Google Drive.', 'error');
            return;
        }

        // Build streaming URL with token parameter for HTTP Range support
        const streamUrl = `/api/gdrive/stream?fileId=${encodeURIComponent(track.id)}&token=${encodeURIComponent(token)}`;

        const musifyTrack = {
            id: `gdrive-${track.id}`,
            title: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.durationFormatted || '03:30',
            category: 'gdrive',
            formatTag: track.formatTag || 'DRIVE',
            qualityBadge: track.qualityBadge || 'GOOGLE DRIVE AUDIO',
            cover: track.coverUrl,
            src: streamUrl,
            isGDrive: true,
            gdriveFileId: track.id,
            lyrics: [
                { time: 0, text: `♪ Streaming from Google Drive: ${track.title} ♪` },
                { time: 4, text: `${track.artist} — ${track.album}` },
                { time: 10, text: "♪ [Personal Cloud Master] ♪" }
            ],
            details: {
                fileName: track.name,
                fileSizeFormatted: track.sizeFormatted,
                fileSizeBytes: track.size,
                fileType: track.mimeType,
                fileLastModified: track.createdTime,
                codec: `${track.formatTag} (Google Drive Stream)`,
                durationFormatted: track.durationFormatted,
                year: track.year || 'Cloud Audio',
                genre: 'Google Drive Music Library',
                tagType: 'Google Drive / ID3 Tags',
                hasEmbeddedArt: true
            }
        };

        const player = window.musifyPlayer;

        // If a playlist context is passed (e.g. all songs from an album or artist), load them all into player tracks
        if (Array.isArray(playlistContext) && playlistContext.length > 0) {
            const contextTracks = playlistContext.map(t => ({
                id: `gdrive-${t.id}`,
                title: t.title,
                artist: t.artist,
                album: t.album,
                duration: t.durationFormatted || '03:30',
                category: 'gdrive',
                formatTag: t.formatTag || 'DRIVE',
                qualityBadge: t.qualityBadge || 'GOOGLE DRIVE AUDIO',
                cover: t.coverUrl,
                src: `/api/gdrive/stream?fileId=${encodeURIComponent(t.id)}&token=${encodeURIComponent(token)}`,
                isGDrive: true,
                gdriveFileId: t.id,
                lyrics: [{ time: 0, text: `♪ Streaming ${t.title} ♪` }]
            }));

            // Replace or prepend tracks
            player.tracks = contextTracks;
            const targetIdx = contextTracks.findIndex(t => t.id === musifyTrack.id);
            player.loadTrack(targetIdx >= 0 ? targetIdx : 0, true);
        } else {
            // Insert single track at beginning and play
            const existingIdx = player.tracks.findIndex(t => t.id === musifyTrack.id);
            if (existingIdx >= 0) {
                player.loadTrack(existingIdx, true);
            } else {
                player.tracks.unshift(musifyTrack);
                player.loadTrack(0, true);
            }
        }

        // Switch to the player tab so the user sees live album art, waveform, and lyrics
        if (typeof player.switchTab === 'function') {
            player.switchTab('player');
        }

        notify(`Now Streaming: ${track.title} by ${track.artist} 🎵`, 'success');
    }

    function playAll(shuffle = false) {
        if (libraryTracks.length === 0) {
            notify('No tracks in your Google Drive library to play.', 'info');
            return;
        }

        let tracksToPlay = [...libraryTracks];
        if (selectedArtistFilter) {
            tracksToPlay = tracksToPlay.filter(t => t.artist === selectedArtistFilter);
        } else if (selectedAlbumFilter) {
            tracksToPlay = tracksToPlay.filter(t => `${t.artist} - ${t.album}` === selectedAlbumFilter);
        } else if (selectedFolderFilter) {
            tracksToPlay = tracksToPlay.filter(t => t.folderId === selectedFolderFilter);
        }

        if (tracksToPlay.length === 0) return;

        if (shuffle) {
            // Fisher-Yates shuffle
            for (let i = tracksToPlay.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracksToPlay[i], tracksToPlay[j]] = [tracksToPlay[j], tracksToPlay[i]];
            }
        }

        playTrackInMusify(tracksToPlay[0], tracksToPlay);
    }

    // 6. Ui Rendering & Component Mapping

    function updateConnectedUI() {
        const connectBtn = document.getElementById('musifyGdriveConnectBtn');
        const countNav = document.getElementById('musifyGdriveCountNav');
        const headerAccount = document.getElementById('gdriveHeaderAccount');
        const headerFolderName = document.getElementById('gdriveHeaderFolderName');

        if (countNav) {
            if (libraryTracks.length > 0) {
                countNav.textContent = libraryTracks.length;
                countNav.style.display = 'inline-flex';
            } else {
                countNav.style.display = 'none';
            }
        }

        if (headerFolderName) {
            headerFolderName.textContent = selectedFolder ? selectedFolder.name : 'No folder selected';
        }

        if (headerAccount) {
            if (currentUser) {
                const avatar = currentUser.photoURL || '';
                const name = currentUser.displayName || currentUser.email || 'Google User';
                headerAccount.innerHTML = `
                    <div class="gdrive-user-chip">
                        ${avatar ? `<img src="${avatar}" class="gdrive-user-avatar" alt="${name}">` : `<span class="gdrive-user-avatar-placeholder">👤</span>`}
                        <span class="gdrive-user-name">${escapeHtml(name)}</span>
                    </div>
                `;
            } else {
                headerAccount.innerHTML = `
                    <span class="gdrive-status-badge disconnected">Not Connected</span>
                `;
            }
        }

        if (connectBtn) {
            if (currentUser) {
                connectBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" height="15px" width="15px" fill="currentColor">
                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z"/>
                    </svg>
                    Google Drive (${libraryTracks.length})
                `;
            } else {
                connectBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" height="15px" width="15px" fill="currentColor">
                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
                    </svg>
                    Connect Drive
                `;
            }
        }

        renderLibrary();
    }

    function renderScanningUI(folderName, count, detailText = '') {
        const container = document.getElementById('gdriveContentArea');
        if (!container) return;

        container.innerHTML = `
            <div class="gdrive-scanning-box">
                <div class="gdrive-spinner"></div>
                <h3 class="gdrive-scanning-title">Scanning "${escapeHtml(folderName)}"...</h3>
                <p class="gdrive-scanning-count">${count} audio tracks discovered</p>
                ${detailText ? `<p class="gdrive-scanning-detail">${escapeHtml(detailText)}</p>` : ''}
                <div class="gdrive-scanning-bar-wrap">
                    <div class="gdrive-scanning-bar-fill"></div>
                </div>
            </div>
        `;
    }

    function renderLibrary(searchQuery = '') {
        const container = document.getElementById('gdriveContentArea');
        if (!container) return;

        // 1. Not connected state
        if (!currentUser) {
            container.innerHTML = `
                <div class="gdrive-empty-card">
                    <div class="gdrive-empty-icon">
                        <svg viewBox="0 0 87.3 78" height="64" width="72">
                            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                        </svg>
                    </div>
                    <h3 class="gdrive-empty-title">Connect Your Google Drive Music</h3>
                    <p class="gdrive-empty-desc">
                        Stream music directly from your designated Google Drive folder with high-res artist photos, embedded artwork, lyrics, and 10-band equalizer.
                    </p>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:8px;">
                        <button type="button" class="gdrive-primary-btn" id="gdriveConnectActionBtn">
                            <svg viewBox="0 0 24 24" height="18px" width="18px" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H8l4-4 4 4h-3v4h-2z"/>
                            </svg>
                            Connect Google Drive
                        </button>
                        <button type="button" class="gdrive-origin-help-btn" id="gdriveOriginHelpBtn">
                            <svg viewBox="0 0 24 24" height="15px" width="15px" fill="currentColor">
                                <path d="M11 15h2v2h-2zm0-8h2v6h-2zm1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                            </svg>
                            Fix "Error 400: origin_mismatch" in Google Cloud
                        </button>
                    </div>
                    <p class="gdrive-empty-footnote">Target folder: <code>10tvBZbrFa6sHGvrP1XGG82kHbX2QjB2-</code> • Read-only access</p>
                </div>
            `;
            document.getElementById('gdriveConnectActionBtn')?.addEventListener('click', connectGoogleDrive);
            document.getElementById('gdriveOriginHelpBtn')?.addEventListener('click', () => {
                showCloudAuthModal(GOOGLE_PROJECT_ID, 'To resolve Error 400: origin_mismatch, register your app origin in Google Cloud Console:');
            });
            return;
        }

        // 2. Connected but no tracks indexed yet
        if (libraryTracks.length === 0) {
            container.innerHTML = `
                <div class="gdrive-empty-card">
                    <div class="gdrive-empty-icon">🎵</div>
                    <h3 class="gdrive-empty-title">Music Folder Ready to Sync</h3>
                    <p class="gdrive-empty-desc">
                        Connected to your Google Drive folder: <strong>${escapeHtml(selectedFolder.name || TARGET_FOLDER_NAME)}</strong>. Click "Sync Music" to index tracks, artists, and album artwork.
                    </p>
                    <div class="gdrive-btn-row">
                        <button type="button" class="gdrive-primary-btn" id="gdriveRescanBtn">
                            <svg viewBox="0 0 24 24" height="16px" width="16px" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                            Sync Music Library
                        </button>
                        <a href="${TARGET_FOLDER_LINK}" target="_blank" rel="noopener noreferrer" class="gdrive-sec-btn" id="gdriveOpenDriveBtn">
                            Open Google Drive ↗
                        </a>
                    </div>
                </div>
            `;
            document.getElementById('gdriveRescanBtn')?.addEventListener('click', () => scanFolder(TARGET_FOLDER_ID, selectedFolder.name));
            return;
        }

        // 4. Render Active Library with Filters
        const cleanQuery = (searchQuery || '').toLowerCase().trim();

        let filteredTracks = libraryTracks;
        if (selectedArtistFilter) {
            filteredTracks = filteredTracks.filter(t => t.artist === selectedArtistFilter);
        } else if (selectedAlbumFilter) {
            filteredTracks = filteredTracks.filter(t => `${t.artist} - ${t.album}` === selectedAlbumFilter);
        } else if (selectedFolderFilter) {
            filteredTracks = filteredTracks.filter(t => t.folderId === selectedFolderFilter);
        }

        if (cleanQuery) {
            filteredTracks = filteredTracks.filter(t => 
                t.title.toLowerCase().includes(cleanQuery) ||
                t.artist.toLowerCase().includes(cleanQuery) ||
                t.album.toLowerCase().includes(cleanQuery) ||
                (t.folderName && t.folderName.toLowerCase().includes(cleanQuery))
            );
        }

        // Filter artists for artist tab
        let filteredArtists = libraryArtists;
        if (cleanQuery) {
            filteredArtists = filteredArtists.filter(a => a.name.toLowerCase().includes(cleanQuery));
        }

        // Filter albums for album tab
        let filteredAlbums = libraryAlbums;
        if (cleanQuery) {
            filteredAlbums = filteredAlbums.filter(a => 
                a.title.toLowerCase().includes(cleanQuery) ||
                a.artist.toLowerCase().includes(cleanQuery)
            );
        }

        // Filter folders for folders tab
        let filteredFolders = libraryFolders;
        if (cleanQuery) {
            filteredFolders = filteredFolders.filter(f => 
                f.name.toLowerCase().includes(cleanQuery) ||
                (f.album && f.album.toLowerCase().includes(cleanQuery)) ||
                (f.artist && f.artist.toLowerCase().includes(cleanQuery))
            );
        }

        let contentHtml = '';

        // Context breadcrumb if drilled down
        let filterBanner = '';
        if (selectedArtistFilter || selectedAlbumFilter || selectedFolderFilter) {
            let filterLabel = '';
            if (selectedArtistFilter) {
                filterLabel = `Artist: ${selectedArtistFilter}`;
            } else if (selectedAlbumFilter) {
                filterLabel = `Album: ${selectedAlbumFilter.split(' - ')[1] || selectedAlbumFilter}`;
            } else if (selectedFolderFilter) {
                const matchedFolder = libraryFolders.find(f => f.id === selectedFolderFilter);
                filterLabel = `Folder: ${matchedFolder ? matchedFolder.name : 'Album Folder'}`;
            }
            filterBanner = `
                <div class="gdrive-filter-banner">
                    <button type="button" class="gdrive-back-btn" id="gdriveClearFilterBtn">
                        <svg viewBox="0 0 24 24" height="16px" width="16px" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                        All Music
                    </button>
                    <span class="gdrive-filter-title">${escapeHtml(filterLabel)}</span>
                    <button type="button" class="gdrive-play-context-btn" id="gdrivePlayContextBtn">
                        ▶ Play Selection (${filteredTracks.length})
                    </button>
                </div>
            `;
        }

        // Tab Views
        if (currentView === 'artists' && !selectedArtistFilter && !selectedAlbumFilter && !selectedFolderFilter) {
            if (filteredArtists.length === 0) {
                contentHtml = `<div class="gdrive-no-results">No artists found matching "${escapeHtml(cleanQuery)}"</div>`;
            } else {
                contentHtml = `
                    <div class="gdrive-artists-grid">
                        ${filteredArtists.map(a => `
                            <div class="gdrive-artist-card" data-artist="${escapeHtml(a.name)}">
                                <div class="gdrive-artist-avatar-wrap">
                                    <img src="${escapeHtml(a.photo || '')}" class="gdrive-artist-avatar" alt="${escapeHtml(a.name)}" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=300&q=80'">
                                    <button type="button" class="gdrive-card-play-btn" title="Play ${escapeHtml(a.name)}" data-play-artist="${escapeHtml(a.name)}">
                                        <svg viewBox="0 0 24 24" height="20px" width="20px" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                    </button>
                                </div>
                                <h4 class="gdrive-artist-name">${escapeHtml(a.name)}</h4>
                                <p class="gdrive-artist-meta">${a.trackCount} ${a.trackCount === 1 ? 'song' : 'songs'} • ${a.albumCount} ${a.albumCount === 1 ? 'album' : 'albums'}</p>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } else if (currentView === 'albums' && !selectedArtistFilter && !selectedAlbumFilter && !selectedFolderFilter) {
            if (filteredAlbums.length === 0) {
                contentHtml = `<div class="gdrive-no-results">No albums found matching "${escapeHtml(cleanQuery)}"</div>`;
            } else {
                contentHtml = `
                    <div class="gdrive-albums-grid">
                        ${filteredAlbums.map(alb => `
                            <div class="gdrive-album-card" data-album-key="${escapeHtml(alb.key)}">
                                <div class="gdrive-album-cover-wrap">
                                    <img src="${escapeHtml(alb.cover || '')}" class="gdrive-album-cover" alt="${escapeHtml(alb.title)}" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80'">
                                    <button type="button" class="gdrive-card-play-btn" title="Play ${escapeHtml(alb.title)}" data-play-album="${escapeHtml(alb.key)}">
                                        <svg viewBox="0 0 24 24" height="20px" width="20px" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                    </button>
                                </div>
                                <h4 class="gdrive-album-title">${escapeHtml(alb.title)}</h4>
                                <p class="gdrive-album-artist">${escapeHtml(alb.artist)}</p>
                                <span class="gdrive-album-count">${alb.tracks.length} songs ${alb.year ? `• ${alb.year}` : ''}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } else if (currentView === 'folders' && !selectedArtistFilter && !selectedAlbumFilter && !selectedFolderFilter) {
            if (filteredFolders.length === 0) {
                contentHtml = `<div class="gdrive-no-results">No album folders found matching "${escapeHtml(cleanQuery)}"</div>`;
            } else {
                contentHtml = `
                    <div class="gdrive-albums-grid">
                        ${filteredFolders.map(folder => `
                            <div class="gdrive-album-card gdrive-folder-card" data-folder-id="${escapeHtml(folder.id)}">
                                <div class="gdrive-album-cover-wrap">
                                    <img src="${escapeHtml(folder.cover || '')}" class="gdrive-album-cover" alt="${escapeHtml(folder.name)}" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80'">
                                    <button type="button" class="gdrive-card-play-btn" title="Play folder: ${escapeHtml(folder.name)}" data-play-folder="${escapeHtml(folder.id)}">
                                        <svg viewBox="0 0 24 24" height="20px" width="20px" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                    </button>
                                </div>
                                <div class="gdrive-folder-badge-pill">📁 Album Folder</div>
                                <h4 class="gdrive-album-title" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</h4>
                                <p class="gdrive-album-artist">${escapeHtml(folder.artist || folder.album || 'Drive Collection')}</p>
                                <span class="gdrive-album-count">${folder.tracks.length} ${folder.tracks.length === 1 ? 'song' : 'songs'}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } else {
            // Tracks list view (or filtered view)
            if (filteredTracks.length === 0) {
                contentHtml = `<div class="gdrive-no-results">No songs found matching your search.</div>`;
            } else {
                contentHtml = `
                    <div class="gdrive-tracks-table">
                        <div class="gdrive-track-row header">
                            <span class="col-num">#</span>
                            <span class="col-title">Title</span>
                            <span class="col-artist">Artist</span>
                            <span class="col-album">Album</span>
                            <span class="col-format">Format</span>
                            <span class="col-duration">Time</span>
                            <span class="col-play"></span>
                        </div>
                        <div class="gdrive-track-list">
                            ${filteredTracks.map((t, idx) => `
                                <div class="gdrive-track-row item" data-track-id="${t.id}">
                                    <span class="col-num">${idx + 1}</span>
                                    <div class="col-title">
                                        <img src="${escapeHtml(t.coverUrl)}" class="gdrive-track-thumb" alt="" onerror="this.style.display='none'">
                                        <div class="gdrive-track-title-wrap">
                                            <span class="gdrive-track-title">${escapeHtml(t.title)}</span>
                                            <span class="gdrive-track-subtitle-mobile">${escapeHtml(t.artist)} • ${escapeHtml(t.album)}</span>
                                        </div>
                                    </div>
                                    <span class="col-artist">${escapeHtml(t.artist)}</span>
                                    <span class="col-album">${escapeHtml(t.album)}</span>
                                    <span class="col-format">${escapeHtml(t.formatTag)}</span>
                                    <span class="col-duration">${t.durationFormatted}</span>
                                    <div class="col-play">
                                        <button type="button" class="gdrive-row-play-btn" title="Play ${escapeHtml(t.title)}" data-play-id="${t.id}">
                                            <svg viewBox="0 0 24 24" height="16px" width="16px" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }

        container.innerHTML = `
            ${filterBanner}
            ${contentHtml}
        `;

        // Wire event listeners in container
        attachContainerListeners(filteredTracks);
    }

    function attachContainerListeners(filteredTracks) {
        // Clear filter
        document.getElementById('gdriveClearFilterBtn')?.addEventListener('click', () => {
            selectedArtistFilter = null;
            selectedAlbumFilter = null;
            selectedFolderFilter = null;
            renderLibrary();
        });

        // Play selection
        document.getElementById('gdrivePlayContextBtn')?.addEventListener('click', () => {
            if (filteredTracks.length > 0) {
                playTrackInMusify(filteredTracks[0], filteredTracks);
            }
        });

        // Click artist card
        document.querySelectorAll('.gdrive-artist-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.gdrive-card-play-btn')) return;
                selectedArtistFilter = card.dataset.artist;
                selectedAlbumFilter = null;
                selectedFolderFilter = null;
                currentView = 'tracks';
                updateSubTabButtons();
                renderLibrary();
            });
        });

        // Click play on artist card
        document.querySelectorAll('[data-play-artist]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const artistName = btn.dataset.playArtist;
                const artistTracks = libraryTracks.filter(t => t.artist === artistName);
                if (artistTracks.length > 0) {
                    playTrackInMusify(artistTracks[0], artistTracks);
                }
            });
        });

        // Click album card
        document.querySelectorAll('.gdrive-album-card:not(.gdrive-folder-card)').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.gdrive-card-play-btn')) return;
                selectedAlbumFilter = card.dataset.albumKey;
                selectedArtistFilter = null;
                selectedFolderFilter = null;
                currentView = 'tracks';
                updateSubTabButtons();
                renderLibrary();
            });
        });

        // Click play on album card
        document.querySelectorAll('[data-play-album]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const albKey = btn.dataset.playAlbum;
                const albTracks = libraryTracks.filter(t => `${t.artist} - ${t.album}` === albKey);
                if (albTracks.length > 0) {
                    playTrackInMusify(albTracks[0], albTracks);
                }
            });
        });

        // Click folder card
        document.querySelectorAll('.gdrive-folder-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.gdrive-card-play-btn')) return;
                selectedFolderFilter = card.dataset.folderId;
                selectedArtistFilter = null;
                selectedAlbumFilter = null;
                currentView = 'tracks';
                updateSubTabButtons();
                renderLibrary();
            });
        });

        // Click play on folder card
        document.querySelectorAll('[data-play-folder]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = btn.dataset.playFolder;
                const folderTracks = libraryTracks.filter(t => t.folderId === folderId);
                if (folderTracks.length > 0) {
                    playTrackInMusify(folderTracks[0], folderTracks);
                }
            });
        });

        // Click track row or row play button
        document.querySelectorAll('.gdrive-track-row.item').forEach(row => {
            row.addEventListener('click', (e) => {
                const trackId = row.dataset.trackId;
                const track = libraryTracks.find(t => t.id === trackId);
                if (track) {
                    playTrackInMusify(track, filteredTracks);
                }
            });
        });
    }

    function updateSubTabButtons() {
        document.querySelectorAll('.gdrive-subtab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === currentView);
        });
    }

    // 7. Initialization & Dom Wiring

    function initUI() {
        initGoogleAuth();

        // Music Tab: "Google Drive" Navigation button in player
        const navBtn = document.getElementById('musifyNavTabGdrive');
        if (navBtn) {
            navBtn.addEventListener('click', () => {
                if (window.musifyPlayer && typeof window.musifyPlayer.switchTab === 'function') {
                    window.musifyPlayer.switchTab('gdrive');
                } else {
                    document.querySelectorAll('.musify-tab-btn').forEach(b => b.classList.remove('active'));
                    navBtn.classList.add('active');
                    document.querySelectorAll('.musify-view-panel').forEach(p => p.style.display = 'none');
                    const panel = document.getElementById('musifyView_gdrive');
                    if (panel) panel.style.display = 'block';
                }
                renderLibrary();
            });
        }

        // Action button inside player view
        const actBtn = document.getElementById('musifyGdriveConnectBtn');
        if (actBtn) {
            actBtn.addEventListener('click', () => {
                if (window.musifyPlayer && typeof window.musifyPlayer.switchTab === 'function') {
                    window.musifyPlayer.switchTab('gdrive');
                }
                if (!cachedAccessToken || isTokenExpired()) {
                    connectGoogleDrive();
                } else {
                    scanFolder(TARGET_FOLDER_ID, selectedFolder.name);
                }
            });
        }

        // Toolbar buttons inside Google Drive view
        document.getElementById('gdriveBtnSelectFolder')?.addEventListener('click', openTargetFolderInDrive);
        document.getElementById('gdriveBtnRescan')?.addEventListener('click', () => {
            if (!cachedAccessToken || isTokenExpired()) {
                connectGoogleDrive();
            } else {
                scanFolder(TARGET_FOLDER_ID, selectedFolder.name);
            }
        });
        document.getElementById('gdriveBtnDisconnect')?.addEventListener('click', disconnectGoogleDrive);

        // Subtabs: Artists | Albums | Folders | Tracks
        document.querySelectorAll('.gdrive-subtab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentView = btn.dataset.view || 'artists';
                selectedArtistFilter = null;
                selectedAlbumFilter = null;
                selectedFolderFilter = null;
                updateSubTabButtons();
                const searchVal = document.getElementById('gdriveSearchInput')?.value || '';
                renderLibrary(searchVal);
            });
        });

        // Search input
        const searchInput = document.getElementById('gdriveSearchInput');
        if (searchInput) {
            let debounce = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    renderLibrary(e.target.value);
                }, 200);
            });
        }

        // Play All and Shuffle All
        document.getElementById('gdrivePlayAllBtn')?.addEventListener('click', () => playAll(false));
        document.getElementById('gdriveShuffleBtn')?.addEventListener('click', () => playAll(true));

        updateConnectedUI();
    }

    function notify(msg, type = 'info') {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = msg;
            toast.className = `toast show ${type}`;
            setTimeout(() => toast.classList.remove('show'), 3800);
        } else {
            console.log(`[GDrive Music] [${type}] ${msg}`);
        }
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Expose Global API
    window.MilkboxGDriveMusic = {
        connect: connectGoogleDrive,
        disconnect: disconnectGoogleDrive,
        openFolder: openTargetFolderInDrive,
        scanFolder: () => scanFolder(TARGET_FOLDER_ID, selectedFolder.name),
        playTrack: playTrackInMusify,
        playAll,
        getTracks: () => libraryTracks,
        getArtists: () => libraryArtists,
        getAlbums: () => libraryAlbums,
        getFolders: () => libraryFolders
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
