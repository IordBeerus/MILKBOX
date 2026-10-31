(function () {
    const MUSIFY_PRESETS = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bass: [8, 7, 5, 2, 0, 0, 0, 0, 0, 0],
        treble: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
        vocal: [-2, -2, -1, 1, 4, 5, 3, 1, -1, -2],
        acoustic: [3, 2, 1, 0, 2, 2, 3, 3, 2, 1],
        electronic: [5, 4, 2, 0, -2, 2, 1, 2, 5, 6],
        rock: [5, 3, 2, -1, -2, 1, 3, 4, 4, 4],
        hiphop: [6, 5, 3, 1, -1, -1, 1, 2, 3, 4]
    };

    const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

    // High quality royalty-free initial curated tracks
    const DEFAULT_TRACKS = [
        {
            id: 'musify-1',
            title: 'Starlight Odyssey',
            artist: 'Musify Essentials',
            album: 'Material Soundscapes',
            duration: '02:45',
            category: 'trending',
            formatTag: 'MP3',
            qualityBadge: '320 KBPS • MP3',
            cover: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=400&q=80',
            src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
            lyrics: [
                { time: 0, text: "♪ [Milkify — Pure audio streaming] ♪" },
                { time: 10, text: "Streaming through the midnight frequencies" },
                { time: 22, text: "Material You dynamic palette in motion" },
                { time: 38, text: "Every frequency tuned to perfection" },
                { time: 54, text: "No subscriptions, no trackers, just sound" },
                { time: 72, text: "Bass reverberating through obsidian air" },
                { time: 94, text: "Echoes fading into the night horizon" },
                { time: 120, text: "Smooth transitions, effortless rhythm" },
                { time: 145, text: "♪ [Gentle decay] ♪" }
            ],
            details: {
                fileName: 'starlight_odyssey_master.mp3',
                fileSizeFormatted: '6.45 MB',
                fileSizeBytes: '6,763,315 bytes',
                fileType: 'audio/mpeg',
                fileLastModified: 'Curated Library Track',
                codec: 'MP3 (MPEG-1 Audio Layer III)',
                durationFormatted: '02:45',
                durationSeconds: '165.00 seconds',
                bitrate: '320 kbps (CBR High Quality)',
                sampleRate: '44.1 kHz (44,100 Hz)',
                channels: '2 Channels (Stereo)',
                bitDepth: '16-bit Standard',
                year: '2024',
                genre: 'Lofi / Ambient Beats',
                trackNumber: '1 of 4',
                discNumber: '1',
                composer: 'Musify Sound Lab',
                tagType: 'ID3v2.4 Curated Metadata',
                hasEmbeddedArt: true,
                artDimensions: '1200 × 1200 px',
                artFormat: 'JPEG',
                rawTags: {
                    TIT2: 'Starlight Odyssey',
                    TPE1: 'Musify Essentials',
                    TALB: 'Material Soundscapes',
                    TYER: '2024',
                    TCON: 'Lofi Ambient',
                    COMM: 'Official Milkify curated master'
                }
            }
        },
        {
            id: 'musify-2',
            title: 'Neon Skyline Horizon',
            artist: 'Gokadze Waves',
            album: 'Cybernetic Chill',
            duration: '03:12',
            category: 'synthwave',
            formatTag: 'MP3',
            qualityBadge: '320 KBPS • MP3',
            cover: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80',
            src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=chill-abstract-intention-12099.mp3',
            lyrics: [
                { time: 0, text: "♪ [Retro synth arpeggio] ♪" },
                { time: 15, text: "Cruising down the electric boulevard" },
                { time: 32, text: "Cyan reflections across the glass" },
                { time: 50, text: "Synchronized pulse in the digital night" },
                { time: 74, text: "Unlock the full potential of music" },
                { time: 98, text: "Feel the synthwave momentum rise" },
                { time: 124, text: "Limitless audio without boundaries" },
                { time: 150, text: "Fade into the neon glow" }
            ],
            details: {
                fileName: 'neon_skyline_horizon.mp3',
                fileSizeFormatted: '7.34 MB',
                fileSizeBytes: '7,696,547 bytes',
                fileType: 'audio/mpeg',
                fileLastModified: 'Curated Library Track',
                codec: 'MP3 (MPEG-1 Audio Layer III)',
                durationFormatted: '03:12',
                durationSeconds: '192.00 seconds',
                bitrate: '320 kbps (CBR High Quality)',
                sampleRate: '44.1 kHz (44,100 Hz)',
                channels: '2 Channels (Stereo)',
                bitDepth: '16-bit Standard',
                year: '2024',
                genre: 'Synthwave / Retro Electro',
                trackNumber: '2 of 4',
                discNumber: '1',
                composer: 'Valeri Gokadze',
                tagType: 'ID3v2.3 Audio Tags',
                hasEmbeddedArt: true,
                artDimensions: '1200 × 1200 px',
                artFormat: 'JPEG',
                rawTags: {
                    TIT2: 'Neon Skyline Horizon',
                    TPE1: 'Gokadze Waves',
                    TALB: 'Cybernetic Chill',
                    TYER: '2024',
                    TCON: 'Synthwave'
                }
            }
        },
        {
            id: 'musify-3',
            title: 'Velvet Rain Study',
            artist: 'Focus Audio Lab',
            album: 'Deep Focus Vol. 3',
            duration: '02:30',
            category: 'lofi',
            formatTag: 'MP3',
            qualityBadge: '256 KBPS • MP3',
            cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
            src: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_92461b2e1b.mp3?filename=lofi-vibes-11440.mp3',
            lyrics: [
                { time: 0, text: "♪ [Gentle raindrops and vinyl warmth] ♪" },
                { time: 12, text: "Pages turning by the window sill" },
                { time: 28, text: "Warm tea brewing in the quiet room" },
                { time: 48, text: "Gentle chords soothing the restless mind" },
                { time: 70, text: "Focus uninterrupted, time standing still" },
                { time: 98, text: "Soft acoustic touches and mellow keys" },
                { time: 125, text: "Drifting in deep concentration" }
            ],
            details: {
                fileName: 'velvet_rain_study.mp3',
                fileSizeFormatted: '5.82 MB',
                fileSizeBytes: '6,102,732 bytes',
                fileType: 'audio/mpeg',
                fileLastModified: 'Curated Library Track',
                codec: 'MP3 (MPEG-1 Audio Layer III)',
                durationFormatted: '02:30',
                durationSeconds: '150.00 seconds',
                bitrate: '256 kbps (VBR)',
                sampleRate: '44.1 kHz (44,100 Hz)',
                channels: '2 Channels (Stereo)',
                bitDepth: '16-bit Standard',
                year: '2023',
                genre: 'Lo-Fi Study Beats',
                trackNumber: '3 of 4',
                discNumber: '1',
                composer: 'Focus Audio Lab',
                tagType: 'ID3v2.3 Audio Tags',
                hasEmbeddedArt: true,
                artDimensions: '1000 × 1000 px',
                artFormat: 'JPEG',
                rawTags: {
                    TIT2: 'Velvet Rain Study',
                    TPE1: 'Focus Audio Lab',
                    TALB: 'Deep Focus Vol. 3'
                }
            }
        },
        {
            id: 'musify-4',
            title: 'Serenade of the Cosmos',
            artist: 'Aetheric Harmony',
            album: 'Infinite Echoes',
            duration: '03:40',
            category: 'ambient',
            formatTag: 'MP3',
            qualityBadge: '320 KBPS • MP3',
            cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=400&q=80',
            src: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-piano-amp-strings-10711.mp3',
            lyrics: [
                { time: 0, text: "♪ [Grand piano and cinematic strings] ♪" },
                { time: 18, text: "Constellations whispering ancient tales" },
                { time: 42, text: "Galactic winds across the cosmic sea" },
                { time: 68, text: "Harmonics rising to the northern stars" },
                { time: 96, text: "A breath of peace across the infinite void" },
                { time: 128, text: "Echoes settling in tranquil quietude" }
            ],
            details: {
                fileName: 'serenade_of_the_cosmos.mp3',
                fileSizeFormatted: '8.41 MB',
                fileSizeBytes: '8,818,483 bytes',
                fileType: 'audio/mpeg',
                fileLastModified: 'Curated Library Track',
                codec: 'MP3 (MPEG-1 Audio Layer III)',
                durationFormatted: '03:40',
                durationSeconds: '220.00 seconds',
                bitrate: '320 kbps (High Quality)',
                sampleRate: '48.0 kHz (48,000 Hz)',
                channels: '2 Channels (Stereo)',
                bitDepth: '16-bit Standard',
                year: '2023',
                genre: 'Cinematic Ambient Piano',
                trackNumber: '4 of 4',
                discNumber: '1',
                composer: 'Aetheric Harmony',
                tagType: 'ID3v2.4 Audio Tags',
                hasEmbeddedArt: true,
                artDimensions: '1200 × 1200 px',
                artFormat: 'JPEG',
                rawTags: {
                    TIT2: 'Serenade of the Cosmos',
                    TPE1: 'Aetheric Harmony',
                    TALB: 'Infinite Echoes'
                }
            }
        }
    ];

    // Audio metadata and artwork extraction utilities

    function formatBytes(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function formatSeconds(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function getAudioDuration(url) {
        return new Promise((resolve) => {
            const probe = new Audio();
            probe.preload = 'metadata';
            probe.src = url;
            let finished = false;

            const onFinish = () => {
                if (finished) return;
                finished = true;
                cleanup();
                resolve(probe.duration && !isNaN(probe.duration) ? probe.duration : 0);
            };

            const cleanup = () => {
                probe.removeEventListener('loadedmetadata', onFinish);
                probe.removeEventListener('error', onError);
            };

            const onError = () => {
                if (finished) return;
                finished = true;
                cleanup();
                resolve(0);
            };

            probe.addEventListener('loadedmetadata', onFinish);
            probe.addEventListener('error', onError);
            setTimeout(onError, 3000);
        });
    }

    function getImageDimensions(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = url;
            setTimeout(() => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 }), 2500);
        });
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve) => {
            if (!blob) return resolve(null);
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }

    // Dynamic Artwork Generator for tracks that lack embedded album art
    function generateDynamicVinylArt(title, artist) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';

            const str = (title + ' ' + artist).trim();
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            const hue1 = Math.abs(hash) % 360;
            const hue2 = (hue1 + 55 + (Math.abs(hash >> 3) % 90)) % 360;

            // Background gradient
            const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 280);
            grad.addColorStop(0, `hsl(${hue1}, 75%, 26%)`);
            grad.addColorStop(0.5, `hsl(${hue2}, 70%, 14%)`);
            grad.addColorStop(1, '#080d13');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 512, 512);

            // Concentric vinyl grooves
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 1.5;
            for (let r = 74; r < 236; r += 7) {
                ctx.beginPath();
                ctx.arc(256, 256, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Light sheen diagonal reflection
            const sheen = ctx.createLinearGradient(0, 0, 512, 512);
            sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
            sheen.addColorStop(0.5, 'transparent');
            sheen.addColorStop(1, 'rgba(255,255,255,0.06)');
            ctx.fillStyle = sheen;
            ctx.fillRect(0, 0, 512, 512);
            ctx.restore();

            // Center vinyl record label
            ctx.save();
            const labelGrad = ctx.createRadialGradient(256, 256, 10, 256, 256, 80);
            labelGrad.addColorStop(0, `hsl(${hue1}, 85%, 65%)`);
            labelGrad.addColorStop(0.8, `hsl(${hue2}, 80%, 45%)`);
            labelGrad.addColorStop(1, '#111a24');
            ctx.fillStyle = labelGrad;
            ctx.beginPath();
            ctx.arc(256, 256, 76, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Center spindle hole
            ctx.fillStyle = '#05090e';
            ctx.beginPath();
            ctx.arc(256, 256, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            // Song initials
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const initials = (title || 'Track').substring(0, 2).toUpperCase();
            ctx.fillText(initials, 256, 215);

            // Milkify branding
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.font = '700 13px system-ui, sans-serif';
            ctx.fillText('MILKIFY OFFLINE', 256, 460);
            ctx.restore();

            return canvas.toDataURL('image/jpeg', 0.92);
        } catch (e) {
            return '';
        }
    }

    // Parse LRC / Timed or Plain Lyrics
    function parseLrcLyrics(text, durationSec = 180) {
        if (!text || typeof text !== 'string') return [];
        const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const timedLines = [];
        const timeTagRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

        for (const line of rawLines) {
            if (/^\[(ar|ti|al|by|offset|length|re|ve):/i.test(line)) continue;
            const matches = [...line.matchAll(timeTagRegex)];
            if (matches.length > 0) {
                const lyricsText = line.replace(timeTagRegex, '').trim();
                for (const match of matches) {
                    const min = parseInt(match[1], 10);
                    const sec = parseInt(match[2], 10);
                    const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0;
                    const time = min * 60 + sec + ms;
                    timedLines.push({ time, text: lyricsText || '♪' });
                }
            }
        }

        if (timedLines.length >= 1) {
            return timedLines.sort((a, b) => a.time - b.time);
        }

        // Plain text lyrics: distribute evenly across song duration
        const plainLines = rawLines.filter(l => !l.startsWith('[') && l.length > 0);
        if (plainLines.length > 0) {
            const safeDur = (durationSec && durationSec > 10) ? durationSec : 180;
            const step = Math.max(2.5, safeDur / (plainLines.length + 1));
            return plainLines.map((l, i) => ({
                time: Math.round(i * step),
                text: l
            }));
        }

        return [];
    }

    // Fetch synchronized lyrics from LRCLIB open music database
    async function fetchOnlineLyrics(title, artist, durationSec = 0) {
        if (!title || typeof title !== 'string') return null;
        try {
            // Clean title & artist
            let cleanTitle = title.replace(/^\d+[\s.-]+/, '')
                .replace(/[\(\[](?:official|audio|remastered|lyric|video|hd|hq|live|deluxe|version)[^\)\]]*[\)\]]/gi, '')
                .replace(/\.[^/.]+$/, "")
                .trim();
            let cleanArtist = (artist || '')
                .replace(/[\(\[].*?[\)\]]/g, '')
                .trim();
            if (cleanArtist.toLowerCase().includes('offline') || cleanArtist.toLowerCase().includes('device') || cleanArtist.toLowerCase().includes('unknown')) {
                cleanArtist = '';
            }

            // If cleanArtist is empty but cleanTitle is "Artist - Title", separate them
            if (!cleanArtist && cleanTitle.includes(' - ')) {
                const parts = cleanTitle.split(' - ');
                cleanArtist = parts[0].trim();
                cleanTitle = parts.slice(1).join(' - ').trim();
            }

            // 1. Try exact match if artist is available
            if (cleanArtist) {
                try {
                    const durParam = durationSec > 0 ? `&duration=${Math.round(durationSec)}` : '';
                    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}${durParam}`;
                    const resp = await fetch(url);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && (data.syncedLyrics || data.plainLyrics)) {
                            return {
                                syncedLyrics: data.syncedLyrics || '',
                                plainLyrics: data.plainLyrics || '',
                                trackName: data.trackName || cleanTitle,
                                artistName: data.artistName || cleanArtist
                            };
                        }
                    }
                } catch (e) {}
            }

            // 2. Search endpoint with artist + title or title
            const queries = [];
            if (cleanArtist) queries.push(`${cleanArtist} ${cleanTitle}`);
            queries.push(cleanTitle);

            for (const q of queries) {
                try {
                    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
                    const searchResp = await fetch(searchUrl);
                    if (searchResp.ok) {
                        const list = await searchResp.json();
                        if (Array.isArray(list) && list.length > 0) {
                            let best = null;
                            let minDiff = Infinity;
                            for (const it of list) {
                                if (!it.syncedLyrics && !it.plainLyrics) continue;
                                const diff = (durationSec > 0 && it.duration) ? Math.abs(it.duration - durationSec) : 0;
                                if (!best) {
                                    best = it;
                                    minDiff = diff;
                                } else if (it.syncedLyrics && !best.syncedLyrics) {
                                    best = it;
                                    minDiff = diff;
                                } else if (it.syncedLyrics === !!best.syncedLyrics && diff < minDiff) {
                                    best = it;
                                    minDiff = diff;
                                }
                            }
                            if (best) {
                                return {
                                    syncedLyrics: best.syncedLyrics || '',
                                    plainLyrics: best.plainLyrics || '',
                                    trackName: best.trackName || cleanTitle,
                                    artistName: best.artistName || cleanArtist
                                };
                            }
                        }
                    }
                } catch (err) {}
            }
        } catch (err) {
            console.warn('[Musify] fetchOnlineLyrics error:', err);
        }
        return null;
    }

    // Native FLAC parser for STREAMINFO, VORBIS_COMMENT, and PICTURE
    function parseFlacMetadata(buffer) {
        if (!buffer || buffer.byteLength < 42) return null;
        try {
            const view = new DataView(buffer);
            if (view.getUint32(0, false) !== 0x664C6143) return null; // 'fLaC'

            let offset = 4;
            const tags = {};
            let picture = null;
            let streamInfo = null;

            while (offset + 4 <= buffer.byteLength) {
                const header = view.getUint8(offset);
                const isLast = (header & 0x80) !== 0;
                const blockType = header & 0x7F;
                const length = (view.getUint8(offset + 1) << 16) | (view.getUint8(offset + 2) << 8) | view.getUint8(offset + 3);
                offset += 4;
                if (offset + length > buffer.byteLength) break;

                // 0: STREAMINFO
                if (blockType === 0 && length >= 34) {
                    const b = new Uint8Array(buffer, offset, length);
                    const sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
                    const channels = ((b[12] >> 1) & 0x07) + 1;
                    const bitsPerSample = (((b[12] & 0x01) << 4) | (b[13] >> 4)) + 1;
                    const totalSamples = ((b[13] & 0x0F) * 0x100000000) + ((b[14] << 24) >>> 0) + (b[15] << 16) + (b[16] << 8) + b[17];
                    streamInfo = {
                        sampleRate,
                        channels,
                        bitsPerSample,
                        totalSamples,
                        duration: sampleRate > 0 ? (totalSamples / sampleRate) : 0
                    };
                }

                // 4: VORBIS_COMMENT
                if (blockType === 4 && length >= 8) {
                    try {
                        let cOffset = offset;
                        const vendorLen = view.getUint32(cOffset, true);
                        cOffset += 4 + vendorLen;
                        if (cOffset + 4 <= offset + length) {
                            const commentCount = view.getUint32(cOffset, true);
                            cOffset += 4;
                            const decoder = new TextDecoder('utf-8');
                            for (let i = 0; i < commentCount && cOffset + 4 <= offset + length; i++) {
                                const commentLen = view.getUint32(cOffset, true);
                                cOffset += 4;
                                if (cOffset + commentLen > offset + length) break;
                                const commentBytes = new Uint8Array(buffer, cOffset, commentLen);
                                const commentStr = decoder.decode(commentBytes);
                                cOffset += commentLen;
                                const eqIdx = commentStr.indexOf('=');
                                if (eqIdx > 0) {
                                    const key = commentStr.slice(0, eqIdx).toUpperCase();
                                    const val = commentStr.slice(eqIdx + 1).trim();
                                    tags[key] = val;
                                }
                            }
                        }
                    } catch (e) {}
                }

                // 6: PICTURE
                if (blockType === 6 && length >= 32) {
                    try {
                        let pOffset = offset;
                        const picType = view.getUint32(pOffset, false);
                        pOffset += 4;
                        const mimeLen = view.getUint32(pOffset, false);
                        pOffset += 4;
                        let mime = 'image/jpeg';
                        if (mimeLen > 0 && pOffset + mimeLen <= offset + length) {
                            const mimeBytes = new Uint8Array(buffer, pOffset, mimeLen);
                            mime = new TextDecoder('ascii').decode(mimeBytes);
                            pOffset += mimeLen;
                        }
                        const descLen = view.getUint32(pOffset, false);
                        pOffset += 4 + descLen;
                        const width = view.getUint32(pOffset, false);
                        pOffset += 4;
                        const height = view.getUint32(pOffset, false);
                        pOffset += 4;
                        const depth = view.getUint32(pOffset, false);
                        pOffset += 4;
                        const colors = view.getUint32(pOffset, false);
                        pOffset += 4;
                        const dataLen = view.getUint32(pOffset, false);
                        pOffset += 4;
                        if (pOffset + dataLen <= offset + length) {
                            const picData = new Uint8Array(buffer, pOffset, dataLen);
                            picture = {
                                format: mime,
                                width,
                                height,
                                data: picData,
                                type: picType
                            };
                        }
                    } catch (e) {}
                }

                offset += length;
                if (isLast) break;
            }

            return { tags, picture, streamInfo };
        } catch (e) {
            return null;
        }
    }

    // Native ID3v2 fallback parser (for APIC artwork and ID3 text frames)
    function parseId3v2Fallback(buffer) {
        if (!buffer || buffer.byteLength < 10) return null;
        try {
            const view = new DataView(buffer);
            if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) return null; // 'ID3'
            const versionMajor = view.getUint8(3);
            const size = ((view.getUint8(6) & 0x7F) << 21) |
                         ((view.getUint8(7) & 0x7F) << 14) |
                         ((view.getUint8(8) & 0x7F) << 7) |
                         (view.getUint8(9) & 0x7F);

            const tags = {};
            let picture = null;
            let offset = 10;
            const end = Math.min(buffer.byteLength, 10 + size);

            while (offset + 10 <= end) {
                let frameId = '';
                for (let i = 0; i < 4; i++) {
                    const c = view.getUint8(offset + i);
                    if ((c >= 65 && c <= 90) || (c >= 48 && c <= 57)) {
                        frameId += String.fromCharCode(c);
                    }
                }
                if (frameId.length < 4) break;

                let frameSize;
                if (versionMajor === 4) {
                    frameSize = ((view.getUint8(offset + 4) & 0x7F) << 21) |
                                ((view.getUint8(offset + 5) & 0x7F) << 14) |
                                ((view.getUint8(offset + 6) & 0x7F) << 7) |
                                (view.getUint8(offset + 7) & 0x7F);
                } else {
                    frameSize = view.getUint32(offset + 4, false);
                }
                offset += 10;
                if (offset + frameSize > end || frameSize <= 0) break;

                if (frameId === 'APIC' && !picture) {
                    try {
                        const encoding = view.getUint8(offset);
                        let p = offset + 1;
                        let mime = '';
                        while (p < offset + frameSize && view.getUint8(p) !== 0) {
                            mime += String.fromCharCode(view.getUint8(p));
                            p++;
                        }
                        p++;
                        const picType = view.getUint8(p);
                        p++;
                        if (encoding === 0 || encoding === 3) {
                            while (p < offset + frameSize && view.getUint8(p) !== 0) p++;
                            p++;
                        } else {
                            while (p + 1 < offset + frameSize && !(view.getUint8(p) === 0 && view.getUint8(p + 1) === 0)) p += 2;
                            p += 2;
                        }
                        if (p < offset + frameSize) {
                            const picBytes = new Uint8Array(buffer, p, offset + frameSize - p);
                            picture = {
                                format: mime || 'image/jpeg',
                                data: picBytes,
                                type: picType
                            };
                        }
                    } catch (e) {}
                } else if (frameId === 'USLT') {
                    try {
                        const encoding = view.getUint8(offset);
                        let p = offset + 1 + 3; // skip encoding (1) + language (3)
                        // skip descriptor terminated by null
                        if (encoding === 0 || encoding === 3) {
                            while (p < offset + frameSize && view.getUint8(p) !== 0) p++;
                            p++;
                        } else {
                            while (p + 1 < offset + frameSize && !(view.getUint8(p) === 0 && view.getUint8(p + 1) === 0)) p += 2;
                            p += 2;
                        }
                        if (p < offset + frameSize) {
                            const bytes = new Uint8Array(buffer, p, offset + frameSize - p);
                            let text = '';
                            if (encoding === 0) text = new TextDecoder('iso-8859-1').decode(bytes);
                            else if (encoding === 1 || encoding === 2) text = new TextDecoder('utf-16').decode(bytes);
                            else text = new TextDecoder('utf-8').decode(bytes);
                            tags['USLT'] = text.replace(/\0+$/, '').trim();
                        }
                    } catch (e) {}
                } else if (frameId === 'SYLT') {
                    try {
                        const encoding = view.getUint8(offset);
                        let p = offset + 6;
                        if (encoding === 0 || encoding === 3) {
                            while (p < offset + frameSize && view.getUint8(p) !== 0) p++;
                            p++;
                        } else {
                            while (p + 1 < offset + frameSize && !(view.getUint8(p) === 0 && view.getUint8(p + 1) === 0)) p += 2;
                            p += 2;
                        }
                        const syltLines = [];
                        const dec = encoding === 0 ? new TextDecoder('iso-8859-1') : (encoding === 1 || encoding === 2 ? new TextDecoder('utf-16') : new TextDecoder('utf-8'));
                        while (p + 4 < offset + frameSize) {
                            const startP = p;
                            while (p < offset + frameSize && view.getUint8(p) !== 0) p++;
                            const txt = dec.decode(new Uint8Array(buffer, startP, p - startP)).trim();
                            p++;
                            if (p + 4 <= offset + frameSize) {
                                const ms = view.getUint32(p, false);
                                p += 4;
                                if (txt) {
                                    const sec = ms / 1000;
                                    const min = Math.floor(sec / 60);
                                    const remSec = (sec % 60).toFixed(2);
                                    syltLines.push(`[${min < 10 ? '0' : ''}${min}:${remSec < 10 ? '0' : ''}${remSec}] ${txt}`);
                                }
                            }
                        }
                        if (syltLines.length > 0) {
                            tags['SYLT'] = syltLines.join('\n');
                        }
                    } catch (e) {}
                } else if (['TIT2', 'TPE1', 'TALB', 'TYER', 'TDRC', 'TCON', 'TRCK', 'TPOS', 'COMM', 'TCOM'].includes(frameId)) {
                    try {
                        const encoding = view.getUint8(offset);
                        const dataBytes = new Uint8Array(buffer, offset + 1, frameSize - 1);
                        let text = '';
                        if (encoding === 0) {
                            text = new TextDecoder('iso-8859-1').decode(dataBytes).replace(/\0.*$/, '');
                        } else if (encoding === 1 || encoding === 2) {
                            text = new TextDecoder('utf-16').decode(dataBytes).replace(/\0.*$/, '');
                        } else {
                            text = new TextDecoder('utf-8').decode(dataBytes).replace(/\0.*$/, '');
                        }
                        tags[frameId] = text.trim();
                    } catch (e) {}
                }

                offset += frameSize;
            }

            return { tags, picture, version: `ID3v2.${versionMajor}` };
        } catch (e) {
            return null;
        }
    }

    // Master Audio Metadata & Artwork Extraction Function
    async function extractAudioMetadata(file, url) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        const ext = (file.name.split('.').pop() || '').toLowerCase();

        // 1. Probed duration
        const durationSec = await getAudioDuration(url);
        const durationFormatted = formatSeconds(durationSec);

        // Bitrate estimate
        const bitrateKbps = durationSec > 0 ? Math.round((file.size * 8) / durationSec / 1000) : 0;
        let bitrateText = bitrateKbps > 0 ? `${bitrateKbps} kbps` : 'Variable Bitrate';

        // Codec identification
        let formatTag = 'AUDIO';
        let codecName = 'Audio File';
        if (ext === 'mp3' || file.type === 'audio/mpeg' || file.type === 'audio/mp3') {
            formatTag = 'MP3';
            codecName = 'MP3 (MPEG Audio Layer III)';
        } else if (ext === 'flac' || file.type === 'audio/flac') {
            formatTag = 'FLAC';
            codecName = 'FLAC (Free Lossless Audio Codec)';
        } else if (['m4a', 'aac', 'mp4'].includes(ext) || file.type.includes('aac') || file.type.includes('mp4')) {
            formatTag = 'M4A';
            codecName = 'M4A / AAC (Advanced Audio Coding)';
        } else if (ext === 'wav' || file.type === 'audio/wav') {
            formatTag = 'WAV';
            codecName = 'WAV (Uncompressed PCM Audio)';
        } else if (['ogg', 'oga', 'opus'].includes(ext)) {
            formatTag = 'OGG';
            codecName = 'OGG / Vorbis Audio';
        }

        let title = '';
        let artist = '';
        let album = '';
        let year = '';
        let genre = '';
        let trackNumber = '';
        let discNumber = '';
        let composer = '';
        let lyricsRaw = '';
        let tagType = 'Device Audio File';
        let coverBlobUrl = null;
        let hasEmbeddedArt = false;
        let artFormat = 'image/jpeg';
        let artDimensions = '';
        let sampleRate = '';
        let channels = '';
        let bitDepth = '';
        const rawTags = {};

        // 2. Try window.jsmediatags
        if (window.jsmediatags && typeof window.jsmediatags.read === 'function') {
            try {
                const jmtResult = await new Promise((resolve) => {
                    window.jsmediatags.read(file, {
                        onSuccess: (tag) => resolve(tag),
                        onError: () => resolve(null)
                    });
                });

                if (jmtResult && jmtResult.tags) {
                    const t = jmtResult.tags;
                    tagType = jmtResult.type || 'ID3v2';
                    if (t.title) title = String(t.title).trim();
                    if (t.artist) artist = String(t.artist).trim();
                    if (t.album) album = String(t.album).trim();
                    if (t.year) year = String(t.year).trim();
                    if (t.genre) genre = String(t.genre).trim();
                    if (t.track) trackNumber = String(t.track).trim();
                    if (!lyricsRaw && t.USLT) {
                        if (typeof t.USLT === 'string') lyricsRaw = t.USLT;
                        else if (t.USLT.lyrics) lyricsRaw = t.USLT.lyrics;
                        else if (t.USLT.data) lyricsRaw = typeof t.USLT.data === 'string' ? t.USLT.data : (t.USLT.data.lyrics || '');
                    }
                    if (!lyricsRaw && t.SYLT) {
                        if (typeof t.SYLT === 'string') lyricsRaw = t.SYLT;
                        else if (t.SYLT.data) lyricsRaw = typeof t.SYLT.data === 'string' ? t.SYLT.data : (t.SYLT.data.lyrics || '');
                    }
                    if (!lyricsRaw && t.lyrics) {
                        if (typeof t.lyrics === 'string') lyricsRaw = t.lyrics;
                        else if (t.lyrics.lyrics) lyricsRaw = t.lyrics.lyrics;
                        else if (t.lyrics.data) lyricsRaw = typeof t.lyrics.data === 'string' ? t.lyrics.data : (t.lyrics.data.lyrics || '');
                    }
                    if (!lyricsRaw && t.ULT) {
                        if (typeof t.ULT === 'string') lyricsRaw = t.ULT;
                        else if (t.ULT.lyrics) lyricsRaw = t.ULT.lyrics;
                    }
                    if (!lyricsRaw && t['unsynced-lyrics']) {
                        lyricsRaw = typeof t['unsynced-lyrics'] === 'string' ? t['unsynced-lyrics'] : (t['unsynced-lyrics'].lyrics || '');
                    }

                    Object.keys(t).forEach(k => {
                        if (k !== 'picture') {
                            const val = t[k];
                            rawTags[k] = typeof val === 'object' ? JSON.stringify(val) : String(val);
                        }
                    });

                    if (t.picture && t.picture.data) {
                        try {
                            const uint8 = new Uint8Array(t.picture.data);
                            const mime = t.picture.format || 'image/jpeg';
                            const blob = new Blob([uint8], { type: mime });
                            const dataUrl = await blobToDataUrl(blob);
                            coverBlobUrl = dataUrl || URL.createObjectURL(blob);
                            hasEmbeddedArt = true;
                            artFormat = mime;
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }

        // 3. FLAC parsing
        if (ext === 'flac' || (!hasEmbeddedArt && file.type === 'audio/flac')) {
            try {
                const slice = file.slice(0, Math.min(file.size, 2 * 1024 * 1024));
                const buffer = await slice.arrayBuffer();
                const flacData = parseFlacMetadata(buffer);
                if (flacData) {
                    tagType = 'FLAC Vorbis Comment';
                    formatTag = 'FLAC';
                    const ft = flacData.tags;
                    if (!title && ft.TITLE) title = ft.TITLE;
                    if (!artist && ft.ARTIST) artist = ft.ARTIST;
                    if (!album && ft.ALBUM) album = ft.ALBUM;
                    if (!year && (ft.DATE || ft.YEAR)) year = ft.DATE || ft.YEAR;
                    if (!genre && ft.GENRE) genre = ft.GENRE;
                    if (!trackNumber && ft.TRACKNUMBER) trackNumber = ft.TRACKNUMBER;
                    if (!discNumber && ft.DISCNUMBER) discNumber = ft.DISCNUMBER;
                    if (!composer && ft.COMPOSER) composer = ft.COMPOSER;
                    if (!lyricsRaw && ft.LYRICS) lyricsRaw = ft.LYRICS;
                    if (!lyricsRaw && ft.UNSYNCEDLYRICS) lyricsRaw = ft.UNSYNCEDLYRICS;
                    if (!lyricsRaw && ft.SYNCEDLYRICS) lyricsRaw = ft.SYNCEDLYRICS;

                    Object.assign(rawTags, ft);

                    if (flacData.streamInfo) {
                        const si = flacData.streamInfo;
                        sampleRate = `${si.sampleRate.toLocaleString()} Hz (${(si.sampleRate / 1000).toFixed(1)} kHz)`;
                        channels = si.channels === 1 ? '1 Channel (Mono)' : `${si.channels} Channels (Stereo)`;
                        bitDepth = `${si.bitsPerSample}-bit Lossless`;
                        codecName = `FLAC Lossless (${si.bitsPerSample}-bit / ${(si.sampleRate / 1000).toFixed(1)} kHz)`;
                    }

                    if (flacData.picture && flacData.picture.data && !coverBlobUrl) {
                        const blob = new Blob([flacData.picture.data], { type: flacData.picture.format || 'image/jpeg' });
                        const dataUrl = await blobToDataUrl(blob);
                        coverBlobUrl = dataUrl || URL.createObjectURL(blob);
                        hasEmbeddedArt = true;
                        artFormat = flacData.picture.format || 'image/jpeg';
                        if (flacData.picture.width && flacData.picture.height) {
                            artDimensions = `${flacData.picture.width} × ${flacData.picture.height} px`;
                        }
                    }
                }
            } catch (e) {}
        }

        // 4. Native ID3v2 fallback
        if ((!coverBlobUrl || !lyricsRaw) && (ext === 'mp3' || file.type.includes('mpeg') || !ext)) {
            try {
                const slice = file.slice(0, Math.min(file.size, 1024 * 1024));
                const buffer = await slice.arrayBuffer();
                const id3Data = parseId3v2Fallback(buffer);
                if (id3Data) {
                    if (!tagType || tagType === 'Device Audio File') tagType = id3Data.version || 'ID3v2';
                    const it = id3Data.tags;
                    if (!title && it.TIT2) title = it.TIT2;
                    if (!artist && it.TPE1) artist = it.TPE1;
                    if (!album && it.TALB) album = it.TALB;
                    if (!year && (it.TYER || it.TDRC)) year = it.TYER || it.TDRC;
                    if (!genre && it.TCON) genre = it.TCON;
                    if (!trackNumber && it.TRCK) trackNumber = it.TRCK;
                    if (!lyricsRaw && it.SYLT) lyricsRaw = it.SYLT;
                    if (!lyricsRaw && it.USLT) lyricsRaw = it.USLT;
                    Object.assign(rawTags, it);

                    if (id3Data.picture && id3Data.picture.data && !coverBlobUrl) {
                        const blob = new Blob([id3Data.picture.data], { type: id3Data.picture.format || 'image/jpeg' });
                        const dataUrl = await blobToDataUrl(blob);
                        coverBlobUrl = dataUrl || URL.createObjectURL(blob);
                        hasEmbeddedArt = true;
                        artFormat = id3Data.picture.format || 'image/jpeg';
                    }
                }
            } catch (e) {}
        }

        // Clean fallbacks
        title = title || cleanName;
        artist = artist || 'Offline Audio File';
        album = album || 'Device Storage';

        if ((!artist || artist === 'Offline Audio File') && title && title.includes(' - ')) {
            const parts = title.split(' - ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
        }

        // Measure image dimensions
        if (coverBlobUrl) {
            if (!artDimensions) {
                const dims = await getImageDimensions(coverBlobUrl);
                if (dims.width > 0) {
                    artDimensions = `${dims.width} × ${dims.height} px`;
                }
            }
        } else {
            coverBlobUrl = generateDynamicVinylArt(title, artist);
            hasEmbeddedArt = false;
            artFormat = 'canvas/jpeg';
            artDimensions = '512 × 512 px';
        }

        // Quality badge text
        let qualityBadge = `${formatTag} • 320 KBPS`;
        if (formatTag === 'FLAC') {
            qualityBadge = bitDepth ? `FLAC • ${bitDepth}` : 'FLAC • LOSSLESS';
        } else if (bitrateKbps > 0) {
            qualityBadge = `${bitrateKbps} KBPS • ${formatTag}`;
        }

        // Synchronized or formatted lyrics
        const lyricsList = lyricsRaw ? parseLrcLyrics(lyricsRaw, durationSec) : [];

        return {
            title,
            artist,
            album,
            duration: durationFormatted,
            durationSec,
            cover: coverBlobUrl,
            hasEmbeddedArt,
            artFormat,
            artDimensions: artDimensions || '512 × 512 px',
            formatTag,
            qualityBadge,
            lyrics: lyricsList,
            lyricsRaw: lyricsRaw || '',
            details: {
                fileName: file.name,
                fileSizeFormatted: formatBytes(file.size),
                fileSizeBytes: `${file.size.toLocaleString()} bytes`,
                fileType: file.type || `audio/${ext}`,
                fileLastModified: new Date(file.lastModified).toLocaleString(),
                codec: codecName,
                durationFormatted,
                durationSeconds: durationSec > 0 ? `${durationSec.toFixed(2)} seconds` : 'Unknown',
                bitrate: bitrateText,
                sampleRate: sampleRate || '44.1 kHz (44,100 Hz)',
                channels: channels || '2 Channels (Stereo)',
                bitDepth: bitDepth || (formatTag === 'FLAC' ? 'Lossless' : '16-bit Standard'),
                year: year || 'Unknown',
                genre: genre || 'Music',
                trackNumber: trackNumber || '1',
                discNumber: discNumber || '1',
                composer: composer || 'Unknown',
                tagType,
                hasEmbeddedArt,
                artDimensions: artDimensions || '512 × 512 px',
                artFormat: artFormat.replace('image/', '').toUpperCase(),
                rawTags
            }
        };
    }

    // Persistent offline music storage (IndexedDB)

    const MusifyStorage = {
        DB_NAME: 'musify_audio_library_v1',
        DB_VERSION: 1,
        STORE_NAME: 'offline_tracks',
        _dbPromise: null,

        getDB() {
            if (this._dbPromise) return this._dbPromise;
            this._dbPromise = new Promise((resolve) => {
                if (typeof window === 'undefined' || !window.indexedDB) {
                    console.warn('[MusifyStorage] IndexedDB not available in current context.');
                    return resolve(null);
                }
                const request = window.indexedDB.open(this.DB_NAME, this.DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                        store.createIndex('savedAt', 'savedAt', { unique: false });
                    }
                };
                request.onsuccess = (event) => {
                    resolve(event.target.result);
                };
                request.onerror = (event) => {
                    console.error('[MusifyStorage] Failed to open IndexedDB:', event.target.error);
                    resolve(null);
                };
            });
            return this._dbPromise;
        },

        async saveTrack(track, fileOrBlob) {
            try {
                const db = await this.getDB();
                if (!db) return false;

                // Prepare audioBlob
                let audioBlob = fileOrBlob;
                if (!audioBlob && track.src && track.src.startsWith('blob:')) {
                    try {
                        const resp = await fetch(track.src);
                        audioBlob = await resp.blob();
                    } catch (e) {}
                }

                if (!audioBlob) {
                    console.warn('[MusifyStorage] No audioBlob available to save track', track.id);
                    return false;
                }

                // If cover is a blob URL, convert to dataUrl to be persistent across reloads
                let persistentCover = track.cover;
                if (persistentCover && persistentCover.startsWith('blob:')) {
                    try {
                        const cResp = await fetch(persistentCover);
                        const cBlob = await cResp.blob();
                        const cData = await blobToDataUrl(cBlob);
                        if (cData) persistentCover = cData;
                    } catch (e) {}
                }
                if (!persistentCover) {
                    persistentCover = generateDynamicVinylArt(track.title, track.artist);
                }

                const record = {
                    id: track.id,
                    title: track.title,
                    artist: track.artist,
                    album: track.album || 'Device Storage',
                    duration: track.duration || '--:--',
                    durationSec: track.durationSec || 0,
                    category: 'uploads',
                    cover: persistentCover,
                    hasEmbeddedArt: !!track.hasEmbeddedArt,
                    formatTag: track.formatTag || 'AUDIO',
                    qualityBadge: track.qualityBadge || 'LOCAL AUDIO',
                    lyrics: track.lyrics || [],
                    lyricsRaw: track.lyricsRaw || '',
                    details: track.details || {},
                    audioBlob: audioBlob,
                    fileName: (track.details && track.details.fileName) || (fileOrBlob && fileOrBlob.name) || `${track.title}.mp3`,
                    fileSize: audioBlob.size || 0,
                    fileType: audioBlob.type || 'audio/mpeg',
                    savedAt: Date.now()
                };

                return new Promise((resolve) => {
                    const tx = db.transaction([this.STORE_NAME], 'readwrite');
                    const store = tx.objectStore(this.STORE_NAME);
                    const req = store.put(record);
                    req.onsuccess = () => resolve(true);
                    req.onerror = (err) => {
                        console.error('[MusifyStorage] Store put error:', err);
                        resolve(false);
                    };
                });
            } catch (err) {
                console.error('[MusifyStorage] Exception during saveTrack:', err);
                return false;
            }
        },

        async getAllTracks() {
            try {
                const db = await this.getDB();
                if (!db) return [];

                return new Promise((resolve) => {
                    const tx = db.transaction([this.STORE_NAME], 'readonly');
                    const store = tx.objectStore(this.STORE_NAME);
                    const req = store.getAll();
                    req.onsuccess = () => {
                        const records = req.result || [];
                        // Sort by savedAt descending (newest first)
                        records.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

                        const tracks = records.map(rec => {
                            let blobUrl = '';
                            if (rec.audioBlob) {
                                try {
                                    blobUrl = URL.createObjectURL(rec.audioBlob);
                                } catch (e) {
                                    console.warn('[MusifyStorage] Error creating object URL:', e);
                                }
                            }
                            return {
                                id: rec.id,
                                title: rec.title,
                                artist: rec.artist,
                                album: rec.album,
                                duration: rec.duration,
                                durationSec: rec.durationSec,
                                category: 'uploads',
                                cover: rec.cover || generateDynamicVinylArt(rec.title, rec.artist),
                                hasEmbeddedArt: !!rec.hasEmbeddedArt,
                                src: blobUrl,
                                formatTag: rec.formatTag,
                                qualityBadge: rec.qualityBadge,
                                lyrics: rec.lyrics || [],
                                lyricsRaw: rec.lyricsRaw || '',
                                lyricsSource: rec.lyricsSource || '',
                                details: rec.details || {},
                                isSavedOffline: true,
                                isUploaded: true,
                                savedAt: rec.savedAt
                            };
                        });
                        resolve(tracks);
                    };
                    req.onerror = () => resolve([]);
                });
            } catch (err) {
                console.error('[MusifyStorage] Exception during getAllTracks:', err);
                return [];
            }
        },

        async updateTrackLyrics(id, lyrics, lyricsRaw, lyricsSource = '') {
            try {
                const db = await this.getDB();
                if (!db) return false;
                return new Promise((resolve) => {
                    const tx = db.transaction([this.STORE_NAME], 'readwrite');
                    const store = tx.objectStore(this.STORE_NAME);
                    const getReq = store.get(id);
                    getReq.onsuccess = () => {
                        const rec = getReq.result;
                        if (!rec) return resolve(false);
                        rec.lyrics = lyrics;
                        rec.lyricsRaw = lyricsRaw;
                        if (lyricsSource) rec.lyricsSource = lyricsSource;
                        const putReq = store.put(rec);
                        putReq.onsuccess = () => resolve(true);
                        putReq.onerror = () => resolve(false);
                    };
                    getReq.onerror = () => resolve(false);
                });
            } catch (err) {
                console.error('[MusifyStorage] Exception during updateTrackLyrics:', err);
                return false;
            }
        },

        async deleteTrack(id) {
            try {
                const db = await this.getDB();
                if (!db) return false;
                return new Promise((resolve) => {
                    const tx = db.transaction([this.STORE_NAME], 'readwrite');
                    const store = tx.objectStore(this.STORE_NAME);
                    const req = store.delete(id);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            } catch (err) {
                console.error('[MusifyStorage] Exception during deleteTrack:', err);
                return false;
            }
        },

        async clearAll() {
            try {
                const db = await this.getDB();
                if (!db) return false;
                return new Promise((resolve) => {
                    const tx = db.transaction([this.STORE_NAME], 'readwrite');
                    const store = tx.objectStore(this.STORE_NAME);
                    const req = store.clear();
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            } catch (err) {
                console.error('[MusifyStorage] Exception during clearAll:', err);
                return false;
            }
        }
    };

    // Musify player class
    class MusifyPlayer {
        constructor() {
            let removedTrackIds = [];
            try {
                removedTrackIds = JSON.parse(localStorage.getItem('musify_removed_track_ids') || '[]');
            } catch (e) {}
            this.tracks = DEFAULT_TRACKS.filter(t => !removedTrackIds.includes(t.id));
            this.currentIndex = 0;
            this.isPlaying = false;
            this.isShuffle = false;
            this.repeatMode = 'all'; // 'off' | 'all' | 'one'
            this.shuffleHistory = [];
            this.shuffleBag = [];
            this.queue = [];
            this.isQueueCustom = false;
            this.draggedQueueIndex = null;
            this.currentCategory = 'all';
            this.likedTracks = new Set(['musify-1']);
            this.sleepTimerTimeout = null;
            this.inspectedTrack = null;

            // Audio element
            this.audio = new Audio();
            this.audio.crossOrigin = 'anonymous';
            this.audio.preload = 'metadata';

            // Web Audio Nodes
            this.audioCtx = null;
            this.sourceNode = null;
            this.analyser = null;
            this.eqNodes = [];

            this.initDOM();
            this.initEvents();
            this.loadTrack(this.currentIndex, false);
            this.renderTracklist();
            this.initSavedUploads();
        }

        initDOM() {
            this.container = document.getElementById('musifyPlayerContainer');
            if (!this.container) return;

            this.albumArtWrap = document.getElementById('musifyAlbumArtWrap');
            this.albumArt = document.getElementById('musifyAlbumArt');
            this.qualityBadge = document.getElementById('musifyQualityBadge');
            this.nowTitle = document.getElementById('musifyNowTitle');
            this.nowArtist = document.getElementById('musifyNowArtist');
            this.nowInfoBtn = document.getElementById('musifyNowInfoBtn');
            this.playBtn = document.getElementById('musifyPlayBtn');
            this.prevBtn = document.getElementById('musifyPrevBtn');
            this.nextBtn = document.getElementById('musifyNextBtn');
            this.shuffleBtn = document.getElementById('musifyShuffleBtn');
            this.repeatBtn = document.getElementById('musifyRepeatBtn');
            this.progressBar = document.getElementById('musifyProgressBar');
            this.timeCurrent = document.getElementById('musifyTimeCurrent');
            this.timeTotal = document.getElementById('musifyTimeTotal');
            this.volumeSlider = document.getElementById('musifyVolumeSlider');
            this.speedBtn = document.getElementById('musifySpeedBtn');
            this.timerBtn = document.getElementById('musifyTimerBtn');
            this.tracklistEl = document.getElementById('musifyTracklist');
            this.canvas = document.getElementById('musifyVisualizerCanvas');
            this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
            this.lyricsContainer = document.getElementById('musifyLyricsContainer');
            this.searchFilter = document.getElementById('musifySearchInput');
            this.fileInput = document.getElementById('musifyFileInput');
            this.ambientGlow = document.getElementById('musifyAmbientGlow');

            // Audio Details Modal DOM
            this.modal = document.getElementById('musifyAudioDetailsModal');
            this.modalCloseBtn = document.getElementById('musifyModalCloseBtn');
            this.modalTagType = document.getElementById('musifyModalTagType');
            this.modalTitle = document.getElementById('musifyModalTitle');
            this.modalArt = document.getElementById('musifyModalArt');
            this.modalArtSource = document.getElementById('musifyModalArtSource');
            this.modalSongTitle = document.getElementById('musifyModalSongTitle');
            this.modalSongArtist = document.getElementById('musifyModalSongArtist');
            this.modalSongAlbum = document.getElementById('musifyModalSongAlbum');
            this.modalQuickTags = document.getElementById('musifyModalQuickTags');
            this.propsGrid = document.getElementById('musifyPropsGrid');
            this.lyricsPreviewWrap = document.getElementById('musifyLyricsPreviewWrap');
            this.lyricsPreviewText = document.getElementById('musifyLyricsPreviewText');
            this.copyLyricsBtn = document.getElementById('musifyCopyLyricsBtn');
            this.rawTagsDetails = document.getElementById('musifyRawTagsDetails');
            this.rawCount = document.getElementById('musifyRawCount');
            this.rawTableBody = document.getElementById('musifyRawTableBody');
            this.viewFullArtBtn = document.getElementById('musifyViewFullArtBtn');
            this.modalPlayBtn = document.getElementById('musifyModalPlayBtn');
            this.modalDeleteBtn = document.getElementById('musifyModalDeleteBtn');

            // Up Next Queue DOM
            this.queueNavTab = document.getElementById('musifyNavTabQueue');
            this.queueBtn = document.getElementById('musifyQueueBtn');
            this.queueCountNav = document.getElementById('musifyQueueCountNav');
            this.queueCountSec = document.getElementById('musifyQueueCountSec');
            this.queueCountLabel = document.getElementById('musifyQueueCountLabel');
            this.queueSummaryText = document.getElementById('musifyQueueSummaryText');
            this.queueModeChip = document.getElementById('musifyQueueModeChip');
            this.queueModeText = document.getElementById('musifyQueueModeText');
            this.queueShuffleBtn = document.getElementById('musifyQueueShuffleBtn');
            this.queueResetBtn = document.getElementById('musifyQueueResetBtn');
            this.queueAddSongBtn = document.getElementById('musifyQueueAddSongBtn');
            this.queueClearBtn = document.getElementById('musifyQueueClearBtn');
            this.queueListEl = document.getElementById('musifyQueueList');
            this.queueNowArt = document.getElementById('musifyQueueNowArt');
            this.queueNowTitle = document.getElementById('musifyQueueNowTitle');
            this.queueNowArtist = document.getElementById('musifyQueueNowArtist');
            this.queueNowFormat = document.getElementById('musifyQueueNowFormat');
            this.queueNowDuration = document.getElementById('musifyQueueNowDuration');
            this.queueNowStatus = document.getElementById('musifyQueueNowStatus');
            this.queueBarsAnim = document.getElementById('musifyQueueBarsAnim');
            this.queueNowPlayBtn = document.getElementById('musifyQueueNowPlayBtn');

            // Add to Queue Modal DOM
            this.addQueueModal = document.getElementById('musifyAddQueueModal');
            this.addQueueCloseBtn = document.getElementById('musifyAddQueueCloseBtn');
            this.addQueueSearchInput = document.getElementById('musifyAddQueueSearchInput');
            this.queuePickerList = document.getElementById('musifyQueuePickerList');

            // Live Lyrics View DOM
            this.lyricsTrackThumb = document.getElementById('musifyLyricsTrackThumb');
            this.lyricsTrackTitle = document.getElementById('musifyLyricsTrackTitle');
            this.lyricsTrackArtist = document.getElementById('musifyLyricsTrackArtist');
            this.lyricsChip = document.getElementById('musifyLyricsChip');
            this.lyricsFetchBtn = document.getElementById('musifyLyricsFetchBtn');
            this.lyricsFileInput = document.getElementById('musifyLyricsFileInput');
            this.lyricsEditBtn = document.getElementById('musifyLyricsEditBtn');

            // Lyrics Editor Modal DOM
            this.lyricsEditorModal = document.getElementById('musifyLyricsEditorModal');
            this.lyricsEditorCloseBtn = document.getElementById('musifyLyricsEditorCloseBtn');
            this.lyricsEditorTitle = document.getElementById('musifyLyricsEditorTitle');
            this.lyricsEditTextarea = document.getElementById('musifyLyricsEditTextarea');
            this.lyricsEditorCancelBtn = document.getElementById('musifyLyricsEditorCancelBtn');
            this.lyricsEditorSaveBtn = document.getElementById('musifyLyricsEditorSaveBtn');

            // Sync Repeat, Shuffle, and Queue UI
            this.updateShuffleUI();
            this.updateRepeatUI();
            this.updateQueueBadges();
        }

        initAudioContext() {
            if (this.audioCtx) return;
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioCtx = new AudioContext();
                this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

                // Build 10-band Equalizer
                let prevNode = this.sourceNode;
                this.eqNodes = FREQUENCIES.map((freq) => {
                    const filter = this.audioCtx.createBiquadFilter();
                    filter.type = freq <= 62 ? 'lowshelf' : (freq >= 8000 ? 'highshelf' : 'peaking');
                    filter.frequency.value = freq;
                    filter.gain.value = 0;
                    prevNode.connect(filter);
                    prevNode = filter;
                    return filter;
                });

                // Analyser for visualizer
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 128;
                prevNode.connect(this.analyser);
                this.analyser.connect(this.audioCtx.destination);

                this.startVisualizer();
            } catch (err) {
                console.warn('[Musify] Web Audio setup warning:', err);
            }
        }

        startVisualizer() {
            if (!this.canvasCtx || !this.analyser) return;
            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const draw = () => {
                requestAnimationFrame(draw);
                if (!this.canvas) return;

                const width = this.canvas.width;
                const height = this.canvas.height;
                this.analyser.getByteFrequencyData(dataArray);

                this.canvasCtx.clearRect(0, 0, width, height);
                const barWidth = (width / bufferLength) * 2.2;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * height * 0.9;
                    const grad = this.canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
                    grad.addColorStop(0, 'rgba(166, 200, 255, 0.2)');
                    grad.addColorStop(1, '#a6c8ff');

                    this.canvasCtx.fillStyle = grad;
                    this.canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
                    x += barWidth + 1;
                }
            };
            draw();
        }

        initEvents() {
            // Play / Pause
            this.playBtn?.addEventListener('click', () => this.togglePlay());

            // Next / Prev
            this.nextBtn?.addEventListener('click', () => this.nextTrack());
            this.prevBtn?.addEventListener('click', () => this.prevTrack());

            // Shuffle
            this.shuffleBtn?.addEventListener('click', () => this.toggleShuffle());

            // Repeat
            this.repeatBtn?.addEventListener('click', () => this.toggleRepeat());

            // Scrubber
            this.progressBar?.addEventListener('input', (e) => {
                this.audio.currentTime = Number(e.target.value);
            });

            // Volume
            this.volumeSlider?.addEventListener('input', (e) => {
                this.audio.volume = Number(e.target.value);
            });

            // Audio element callbacks
            this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
            this.audio.addEventListener('ended', () => this.onTrackEnded());
            this.audio.addEventListener('loadedmetadata', () => {
                if (this.progressBar && this.audio.duration) {
                    this.progressBar.max = Math.floor(this.audio.duration);
                    if (this.timeTotal) this.timeTotal.textContent = this.formatTime(this.audio.duration);
                }
            });

            // Speed cycle
            const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
            let speedIdx = 0;
            this.speedBtn?.addEventListener('click', () => {
                speedIdx = (speedIdx + 1) % speeds.length;
                const spd = speeds[speedIdx];
                this.audio.playbackRate = spd;
                this.speedBtn.textContent = `${spd}x`;
                this.showToast(`Playback speed: ${spd}x`);
            });

            // Sleep Timer
            const timerOptions = [0, 15, 30, 45, 60];
            let timerIdx = 0;
            this.timerBtn?.addEventListener('click', () => {
                timerIdx = (timerIdx + 1) % timerOptions.length;
                const mins = timerOptions[timerIdx];
                if (this.sleepTimerTimeout) clearTimeout(this.sleepTimerTimeout);

                if (mins === 0) {
                    this.timerBtn.textContent = 'Timer: Off';
                    this.showToast('Sleep timer disabled');
                } else {
                    this.timerBtn.textContent = `${mins}m`;
                    this.showToast(`Music will pause in ${mins} minutes`);
                    this.sleepTimerTimeout = setTimeout(() => {
                        this.audio.pause();
                        this.isPlaying = false;
                        this.updatePlayState();
                        this.timerBtn.textContent = 'Timer: Off';
                        this.showToast('Sleep timer expired. Playback paused.');
                    }, mins * 60 * 1000);
                }
            });

            // Navigation Tabs (Player | Queue | EQ | Lyrics)
            document.querySelectorAll('.musify-tab-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.switchTab(btn.dataset.tab);
                });
            });

            // Secondary controls quick queue button
            this.queueBtn?.addEventListener('click', () => {
                this.switchTab('queue');
            });

            // Up Next Queue toolbar actions
            this.queueShuffleBtn?.addEventListener('click', () => this.shuffleQueue());
            this.queueResetBtn?.addEventListener('click', () => this.resetQueue());
            this.queueAddSongBtn?.addEventListener('click', () => this.openAddQueueModal());
            this.queueClearBtn?.addEventListener('click', () => this.clearQueue());
            this.queueNowPlayBtn?.addEventListener('click', () => this.togglePlay());

            // Add Song Modal
            this.addQueueCloseBtn?.addEventListener('click', () => this.closeAddQueueModal());
            this.addQueueModal?.addEventListener('click', (e) => {
                if (e.target === this.addQueueModal) this.closeAddQueueModal();
            });
            this.addQueueSearchInput?.addEventListener('input', (e) => {
                this.renderQueuePicker(e.target.value.toLowerCase().trim());
            });

            // Category filter pills
            document.querySelectorAll('.musify-cat-pill').forEach((pill) => {
                pill.addEventListener('click', () => {
                    document.querySelectorAll('.musify-cat-pill').forEach((p) => p.classList.remove('active'));
                    pill.classList.add('active');
                    this.currentCategory = pill.dataset.cat || 'all';
                    this.renderTracklist();
                });
            });

            // Search filter
            this.searchFilter?.addEventListener('input', (e) => {
                this.renderTracklist(e.target.value.toLowerCase().trim());
            });

            // Local File Upload / Drag & Drop
            this.fileInput?.addEventListener('change', (e) => this.handleLocalFiles(e.target.files));

            const dropZone = document.getElementById('musifyLibraryCard');
            if (dropZone) {
                dropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropZone.style.borderColor = 'var(--musify-primary)';
                });
                dropZone.addEventListener('dragleave', () => {
                    dropZone.style.borderColor = '';
                });
                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropZone.style.borderColor = '';
                    if (e.dataTransfer && e.dataTransfer.files.length) {
                        this.handleLocalFiles(e.dataTransfer.files);
                    }
                });
            }

            // Add URL Audio Stream
            document.getElementById('musifyAddUrlBtn')?.addEventListener('click', () => {
                const url = prompt('Enter a direct audio URL or live radio stream:');
                if (!url) return;
                const newTrack = {
                    id: 'custom-' + Date.now(),
                    title: 'Stream: ' + (new URL(url).pathname.split('/').pop() || 'Live Audio Stream'),
                    artist: 'Web Radio / Stream',
                    album: 'Online Streams',
                    duration: 'Live',
                    category: 'uploads',
                    formatTag: 'STREAM',
                    qualityBadge: 'LIVE STREAM',
                    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
                    src: url,
                    lyrics: [{ time: 0, text: "♪ Streaming live via Milkify ♪" }],
                    details: {
                        fileName: url,
                        fileSizeFormatted: 'Live Stream',
                        fileSizeBytes: 'N/A',
                        fileType: 'audio/stream',
                        fileLastModified: 'Online',
                        codec: 'Direct Audio Stream',
                        durationFormatted: 'Live',
                        durationSeconds: 'Unlimited',
                        bitrate: 'Adaptive',
                        sampleRate: '44.1 kHz',
                        channels: 'Stereo',
                        year: 'Live',
                        genre: 'Web Radio',
                        tagType: 'Online Stream',
                        hasEmbeddedArt: false
                    }
                };
                this.tracks.unshift(newTrack);
                this.loadTrack(0, true);
                this.renderTracklist();
            });

            // Now Playing Artwork & Info Button Click -> Open Audio Details Modal
            this.albumArtWrap?.addEventListener('click', () => {
                if (this.tracks[this.currentIndex]) {
                    this.openAudioDetailsModal(this.tracks[this.currentIndex]);
                }
            });

            this.nowInfoBtn?.addEventListener('click', () => {
                if (this.tracks[this.currentIndex]) {
                    this.openAudioDetailsModal(this.tracks[this.currentIndex]);
                }
            });

            // Audio Details Modal Event Listeners
            this.modalCloseBtn?.addEventListener('click', () => this.closeAudioDetailsModal());

            this.modal?.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.closeAudioDetailsModal();
                }
            });

            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (this.modal && this.modal.style.display !== 'none') {
                        this.closeAudioDetailsModal();
                    }
                    if (this.addQueueModal && this.addQueueModal.style.display !== 'none') {
                        this.closeAddQueueModal();
                    }
                    if (this.lyricsEditorModal && this.lyricsEditorModal.style.display !== 'none') {
                        this.closeLyricsEditorModal();
                    }
                }
            });

            // Live Lyrics Tab Event Listeners
            this.lyricsFetchBtn?.addEventListener('click', () => {
                this.promptAndFetchLyrics();
            });

            this.lyricsFileInput?.addEventListener('change', (e) => {
                this.handleLyricsFileImport(e);
            });

            this.lyricsEditBtn?.addEventListener('click', () => {
                this.openLyricsEditorModal();
            });

            // Lyrics Editor Modal listeners
            this.lyricsEditorCloseBtn?.addEventListener('click', () => this.closeLyricsEditorModal());
            this.lyricsEditorCancelBtn?.addEventListener('click', () => this.closeLyricsEditorModal());
            this.lyricsEditorSaveBtn?.addEventListener('click', () => this.saveEditedLyrics());

            this.lyricsEditorModal?.addEventListener('click', (e) => {
                if (e.target === this.lyricsEditorModal) {
                    this.closeLyricsEditorModal();
                }
            });

            this.copyLyricsBtn?.addEventListener('click', () => {
                if (this.inspectedTrack && this.inspectedTrack.lyricsRaw) {
                    navigator.clipboard.writeText(this.inspectedTrack.lyricsRaw)
                        .then(() => this.showToast('Lyrics copied to clipboard!'))
                        .catch(() => this.showToast('Failed to copy lyrics'));
                }
            });

            this.viewFullArtBtn?.addEventListener('click', () => {
                if (this.inspectedTrack && this.inspectedTrack.cover) {
                    const win = window.open('', '_blank');
                    if (win) {
                        win.document.write(`
                            <!DOCTYPE html>
                            <html>
                            <head><title>${this.inspectedTrack.title} — Album Artwork</title></head>
                            <body style="margin:0;background:#0e141b;display:flex;align-items:center;justify-content:center;height:100vh;">
                                <img src="${this.inspectedTrack.cover}" style="max-width:95vw;max-height:95vh;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.8);" alt="Full Artwork">
                            </body>
                            </html>
                        `);
                    }
                }
            });

            this.modalPlayBtn?.addEventListener('click', () => {
                if (this.inspectedTrack) {
                    const idx = this.tracks.indexOf(this.inspectedTrack);
                    if (idx !== -1) {
                        this.loadTrack(idx, true);
                        this.closeAudioDetailsModal();
                    }
                }
            });

            this.modalDeleteBtn?.addEventListener('click', () => {
                if (this.inspectedTrack) {
                    const toDelete = this.inspectedTrack;
                    this.closeAudioDetailsModal();
                    this.deleteSavedTrack(toDelete);
                }
            });
        }

        // Local file upload and metadata extraction

        async handleLocalFiles(files) {
            if (!files || !files.length) return;

            const audioFiles = [];
            const lrcFiles = [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (f.type.startsWith('audio/') || /\.(mp3|wav|flac|aac|ogg|m4a|opus)$/i.test(f.name)) {
                    audioFiles.push(f);
                } else if (/\.(lrc|txt)$/i.test(f.name)) {
                    lrcFiles.push(f);
                }
            }

            // If user selected or dropped only lyrics files (.lrc or .txt)
            if (!audioFiles.length && lrcFiles.length) {
                const lrcFile = lrcFiles[0];
                const text = await lrcFile.text();
                const track = this.tracks[this.currentIndex];
                if (track) {
                    track.lyrics = parseLrcLyrics(text, track.durationSec);
                    track.lyricsRaw = text;
                    track.lyricsSource = `Uploaded LRC (${lrcFile.name})`;
                    track.lyricsAttempted = true;
                    if (track.isSavedOffline || track.category === 'uploads') {
                        await MusifyStorage.updateTrackLyrics(track.id, track.lyrics, track.lyricsRaw, track.lyricsSource);
                    }
                    this.renderLyrics();
                    this.showToast(`🎶 Applied synchronized lyrics from ${lrcFile.name} to "${track.title}"!`);
                    this.switchTab('lyrics');
                } else {
                    this.showToast('Please play or select a song first to apply lyrics.');
                }
                return;
            }

            if (!audioFiles.length) {
                this.showToast('No audio files detected in selection.');
                return;
            }

            this.showToast(`Extracting artwork, tags & synchronized lyrics for ${audioFiles.length} file(s)...`);

            // Read any accompanying .lrc files into a map
            const lrcMap = {};
            for (const lf of lrcFiles) {
                try {
                    const text = await lf.text();
                    const baseName = lf.name.replace(/\.[^/.]+$/, "").toLowerCase().trim();
                    lrcMap[baseName] = text;
                } catch (e) {}
            }

            const newTracks = [];
            let savedCount = 0;
            for (let i = 0; i < audioFiles.length; i++) {
                const file = audioFiles[i];
                const blobUrl = URL.createObjectURL(file);
                const fileBaseName = file.name.replace(/\.[^/.]+$/, "").toLowerCase().trim();
                let trackObj = null;

                try {
                    const parsed = await extractAudioMetadata(file, blobUrl);
                    let lyrics = parsed.lyrics;
                    let lyricsRaw = parsed.lyricsRaw;
                    let lyricsSource = lyricsRaw ? 'Embedded ID3 Tags' : '';

                    // Check if an accompanying .lrc was uploaded
                    if (lrcMap[fileBaseName]) {
                        lyricsRaw = lrcMap[fileBaseName];
                        lyrics = parseLrcLyrics(lyricsRaw, parsed.durationSec);
                        lyricsSource = 'Companion LRC File';
                    } else if (audioFiles.length === 1 && lrcFiles.length === 1) {
                        lyricsRaw = Object.values(lrcMap)[0];
                        lyrics = parseLrcLyrics(lyricsRaw, parsed.durationSec);
                        lyricsSource = 'Companion LRC File';
                    }

                    // If still no lyrics, attempt online fetch from LRCLIB
                    if (!lyrics || lyrics.length <= 1) {
                        try {
                            const online = await fetchOnlineLyrics(parsed.title, parsed.artist, parsed.durationSec);
                            if (online && (online.syncedLyrics || online.plainLyrics)) {
                                lyricsRaw = online.syncedLyrics || online.plainLyrics;
                                lyrics = parseLrcLyrics(lyricsRaw, parsed.durationSec);
                                lyricsSource = online.syncedLyrics ? 'LRCLIB (Synchronized)' : 'LRCLIB (Plain)';
                            }
                        } catch (e) {}
                    }

                    trackObj = {
                        id: 'local-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
                        title: parsed.title,
                        artist: parsed.artist,
                        album: parsed.album,
                        duration: parsed.duration,
                        durationSec: parsed.durationSec,
                        category: 'uploads',
                        cover: parsed.cover,
                        hasEmbeddedArt: parsed.hasEmbeddedArt,
                        src: blobUrl,
                        formatTag: parsed.formatTag,
                        qualityBadge: parsed.qualityBadge,
                        lyrics: lyrics || [],
                        lyricsRaw: lyricsRaw || '',
                        lyricsSource: lyricsSource || '',
                        lyricsAttempted: true,
                        details: parsed.details,
                        isSavedOffline: false,
                        isUploaded: true
                    };
                } catch (err) {
                    console.error('[Musify] Metadata parse error:', err);
                    const cleanName = file.name.replace(/\.[^/.]+$/, "");
                    let lyricsRaw = lrcMap[fileBaseName] || '';
                    let lyrics = lyricsRaw ? parseLrcLyrics(lyricsRaw, 180) : [];
                    let lyricsSource = lyricsRaw ? 'Companion LRC File' : '';

                    if (!lyrics || !lyrics.length) {
                        try {
                            const online = await fetchOnlineLyrics(cleanName, '', 0);
                            if (online && (online.syncedLyrics || online.plainLyrics)) {
                                lyricsRaw = online.syncedLyrics || online.plainLyrics;
                                lyrics = parseLrcLyrics(lyricsRaw, 180);
                                lyricsSource = online.syncedLyrics ? 'LRCLIB (Synchronized)' : 'LRCLIB (Plain)';
                            }
                        } catch (e) {}
                    }

                    trackObj = {
                        id: 'local-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
                        title: cleanName,
                        artist: 'Offline Audio File',
                        album: 'Device Storage',
                        duration: '--:--',
                        category: 'uploads',
                        cover: generateDynamicVinylArt(cleanName, 'Offline Audio'),
                        src: blobUrl,
                        formatTag: 'AUDIO',
                        qualityBadge: 'LOCAL AUDIO',
                        lyrics: lyrics || [],
                        lyricsRaw: lyricsRaw || '',
                        lyricsSource: lyricsSource || '',
                        lyricsAttempted: true,
                        details: {
                            fileName: file.name,
                            fileSizeFormatted: formatBytes(file.size),
                            fileSizeBytes: `${file.size.toLocaleString()} bytes`,
                            fileType: file.type || 'audio/*',
                            fileLastModified: new Date(file.lastModified).toLocaleString(),
                            codec: 'Offline Audio File',
                            durationFormatted: '--:--',
                            bitrate: 'Variable',
                            sampleRate: '44.1 kHz',
                            channels: 'Stereo',
                            year: 'Unknown',
                            genre: 'Music',
                            tagType: 'File Header',
                            hasEmbeddedArt: false
                        },
                        isSavedOffline: false,
                        isUploaded: true
                    };
                }

                // Save permanently to IndexedDB
                try {
                    const saved = await MusifyStorage.saveTrack(trackObj, file);
                    if (saved) {
                        trackObj.isSavedOffline = true;
                        savedCount++;
                    }
                } catch (storageErr) {
                    console.warn('[Musify] Could not save track to IndexedDB:', storageErr);
                }

                newTracks.push(trackObj);
            }

            if (newTracks.length) {
                this.tracks.unshift(...newTracks);

                if (this.isShuffle) {
                    this.initShuffleBag();
                }

                // Switch category pill to 'uploads'
                this.currentCategory = 'uploads';
                document.querySelectorAll('.musify-cat-pill').forEach(pill => {
                    pill.classList.toggle('active', pill.dataset.cat === 'uploads');
                });

                // Auto-play the first uploaded song with its real artwork & tags
                this.loadTrack(0, true);
                this.updateOfflineBadge();
                this.renderTracklist();
                this.buildUpcomingQueue();
                this.updateQueueBadges();

                const firstTrack = newTracks[0];
                const artStatus = firstTrack.hasEmbeddedArt ? 'Embedded artwork' : 'Unique vinyl artwork';
                if (savedCount > 0) {
                    this.showToast(`💾 "${firstTrack.title}" saved offline! (${savedCount} track(s) saved permanently to device)`);
                } else {
                    this.showToast(`✅ "${firstTrack.title}" loaded! (${artStatus} · ${firstTrack.qualityBadge})`);
                }
            }

            if (this.fileInput) this.fileInput.value = '';
        }

        // Audio details and metadata modal logic

        openAudioDetailsModal(track) {
            if (!this.modal || !track) return;
            this.inspectedTrack = track;
            const details = track.details || {};

            // Header & Tag Type Chip
            if (this.modalTagType) {
                this.modalTagType.textContent = details.tagType || 'Audio Metadata';
            }
            if (this.modalTitle) {
                this.modalTitle.textContent = 'Audio File Details & Tags';
            }

            // Hero Card: Artwork & Primary Titles
            if (this.modalArt) {
                this.modalArt.src = track.cover;
            }
            if (this.modalArtSource) {
                if (details.hasEmbeddedArt) {
                    this.modalArtSource.textContent = `Embedded Art (${details.artFormat || 'JPEG'} · ${details.artDimensions || 'Original'})${track.isSavedOffline ? ' · Saved Offline' : ''}`;
                    this.modalArtSource.style.color = 'var(--musify-primary)';
                } else if (track.category === 'uploads' || track.isSavedOffline) {
                    this.modalArtSource.textContent = 'Dynamic Vinyl Art (Saved Offline)';
                    this.modalArtSource.style.color = '#10b981';
                } else {
                    this.modalArtSource.textContent = 'Curated Album Artwork';
                    this.modalArtSource.style.color = 'var(--musify-primary)';
                }
            }
            if (this.modalSongTitle) {
                this.modalSongTitle.textContent = track.title;
            }
            if (this.modalSongArtist) {
                this.modalSongArtist.textContent = track.artist;
            }
            if (this.modalSongAlbum) {
                this.modalSongAlbum.textContent = track.album || 'Unknown Album';
            }

            // Quick Badges
            if (this.modalQuickTags) {
                const badges = [
                    track.formatTag || 'AUDIO',
                    details.bitrate || '320 kbps',
                    details.sampleRate ? details.sampleRate.split(' ')[0] : '',
                    details.year && details.year !== 'Unknown' ? `Year: ${details.year}` : '',
                    details.genre && details.genre !== 'Music' && details.genre !== 'Unknown' ? details.genre : ''
                ].filter(Boolean);

                this.modalQuickTags.innerHTML = badges.map(b => `<span class="musify-quick-tag">${b}</span>`).join('');
            }

            // Grid of Properties
            if (this.propsGrid) {
                const items = [
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"/></svg>`,
                        label: 'File Name',
                        val: details.fileName || `${track.title}.mp3`
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z"/></svg>`,
                        label: 'File Size',
                        val: details.fileSizeFormatted ? `${details.fileSizeFormatted} (${details.fileSizeBytes || ''})` : 'Curated'
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="m380-300 280-180-280-180v360ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/></svg>`,
                        label: 'Duration',
                        val: `${track.duration} (${details.durationSeconds || ''})`
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/></svg>`,
                        label: 'Audio Format & Codec',
                        val: details.codec || `${track.formatTag || 'MP3'} Audio`
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M120-240v-80h240v80H120Zm0-200v-80h480v80H120Zm0-200v-80h720v80H120Z"/></svg>`,
                        label: 'Audio Bitrate',
                        val: details.bitrate || '320 kbps'
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M560-131v-82q90-26 145-100t55-167q0-93-55-167T560-747v-82q124 28 202 125.5T840-480q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Z"/></svg>`,
                        label: 'Sample Rate & Channels',
                        val: `${details.sampleRate || '44.1 kHz'} · ${details.channels || 'Stereo'}`
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z"/></svg>`,
                        label: 'Artwork Details',
                        val: `${details.artDimensions || '512 × 512 px'} · ${details.artFormat || 'JPEG'} (${details.hasEmbeddedArt ? 'Embedded' : 'Custom Art'})`
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-640q0-33 23.5-56.5T200-880h560q33 0 56.5 23.5T840-800v640q0 33-23.5 56.5T760-80H200Zm0-80h560v-640H200v640Z"/></svg>`,
                        label: 'Year & Genre',
                        val: `${details.year || 'Unknown'} · ${details.genre || 'Music'}`
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T226-378q62-31 126-46.5T480-440q64 0 128 15.5T734-378q31 15 48.5 43.5T800-272v112H160Z"/></svg>`,
                        label: 'Composer / Artist',
                        val: details.composer && details.composer !== 'Unknown' ? details.composer : track.artist
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M120-120v-720h720v720H120Zm80-80h560v-560H200v560Z"/></svg>`,
                        label: 'Track & Disc Number',
                        val: `Track ${details.trackNumber || '1'} · Disc ${details.discNumber || '1'}`
                    },
                    {
                        icon: `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-160h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Z"/></svg>`,
                        label: 'Storage Location',
                        val: (track.isSavedOffline || track.category === 'uploads') ? '💾 Saved in Device Storage (IndexedDB)' : 'Web Stream / Cloud'
                    }
                ];

                this.propsGrid.innerHTML = items.map(it => `
                    <div class="musify-prop-card">
                        <div class="musify-prop-icon">${it.icon}</div>
                        <div class="musify-prop-meta">
                            <div class="musify-prop-label">${it.label}</div>
                            <div class="musify-prop-val">${it.val}</div>
                        </div>
                    </div>
                `).join('');
            }

            // Embedded Lyrics Preview
            if (this.lyricsPreviewWrap && this.lyricsPreviewText) {
                if (track.lyricsRaw && track.lyricsRaw.trim().length > 0) {
                    this.lyricsPreviewWrap.style.display = 'flex';
                    this.lyricsPreviewText.textContent = track.lyricsRaw.trim();
                } else if (track.lyrics && track.lyrics.length > 1) {
                    this.lyricsPreviewWrap.style.display = 'flex';
                    this.lyricsPreviewText.textContent = track.lyrics.map(l => l.text).join('\n');
                } else {
                    this.lyricsPreviewWrap.style.display = 'none';
                }
            }

            // Raw Tag Metadata Table
            if (this.rawTableBody && this.rawCount) {
                const raw = details.rawTags || {};
                const keys = Object.keys(raw);
                this.rawCount.textContent = `${keys.length} tag${keys.length === 1 ? '' : 's'}`;

                if (keys.length > 0) {
                    this.rawTableBody.innerHTML = keys.map(k => `
                        <tr>
                            <td><strong>${k}</strong></td>
                            <td>${escapeHtml(String(raw[k]))}</td>
                        </tr>
                    `).join('');
                } else {
                    this.rawTableBody.innerHTML = `
                        <tr>
                            <td colspan="2" style="text-align:center;color:var(--musify-text-muted);padding:14px;">No extended ID3 / container frames extracted.</td>
                        </tr>
                    `;
                }
            }

            // Show Delete Button
            if (this.modalDeleteBtn) {
                this.modalDeleteBtn.style.display = 'inline-flex';
                this.modalDeleteBtn.title = (track.isSavedOffline || track.category === 'uploads')
                    ? 'Remove from offline device storage'
                    : 'Remove track from library';
            }

            // Show Dialog
            this.modal.style.display = 'flex';
            this.modal.setAttribute('aria-hidden', 'false');
        }

        closeAudioDetailsModal() {
            if (!this.modal) return;
            this.modal.style.display = 'none';
            this.modal.setAttribute('aria-hidden', 'true');
            this.inspectedTrack = null;
        }

        // Playback engine

        loadTrack(index, autoPlay = true, refreshQueue = true) {
            if (index < 0 || index >= this.tracks.length) return;
            this.currentIndex = index;

            // Remove current track from shuffle pool so it is not immediately re-picked
            if (this.isShuffle && this.shuffleBag) {
                this.shuffleBag = this.shuffleBag.filter(i => i !== index);
            }

            const track = this.tracks[index];

            this.audio.src = track.src;
            if (this.albumArt) this.albumArt.src = track.cover;
            if (this.qualityBadge) this.qualityBadge.textContent = track.qualityBadge || '320 KBPS';
            if (this.nowTitle) this.nowTitle.textContent = track.title;
            if (this.nowArtist) this.nowArtist.textContent = `${track.artist} · ${track.album}`;
            if (this.timeCurrent) this.timeCurrent.textContent = '00:00';
            if (this.timeTotal) this.timeTotal.textContent = track.duration || '00:00';

            // Ambient Glow
            if (this.ambientGlow) {
                this.ambientGlow.style.backgroundImage = `radial-gradient(circle, var(--musify-accent-glow) 0%, transparent 70%)`;
            }

            // Sync upcoming queue
            if (refreshQueue) {
                if (!this.isQueueCustom || !this.queue || this.queue.length === 0) {
                    this.queue = this.buildUpcomingQueue();
                } else if (this.queue.length > 0 && (this.queue[0] === track || this.queue[0]?.id === track.id)) {
                    this.queue.shift();
                }
            }

            this.updateQueueBadges();
            this.renderTracklist();
            this.renderLyrics();
            this.renderQueue();

            if (autoPlay) {
                this.initAudioContext();
                this.audio.play()
                    .then(() => {
                        this.isPlaying = true;
                        this.updatePlayState();
                    })
                    .catch(() => {});
            }
        }

        prevTrack() {
            if (!this.tracks || this.tracks.length === 0) return;

            // If track has been playing for more than 3 seconds, restart it
            if (this.audio && this.audio.currentTime > 3) {
                this.audio.currentTime = 0;
                this.showToast('⏮️ Restarted current song');
                return;
            }

            let prevIndex;
            if (this.shuffleHistory && this.shuffleHistory.length > 0) {
                prevIndex = this.shuffleHistory.pop();
            } else {
                prevIndex = this.currentIndex - 1;
                if (prevIndex < 0) prevIndex = this.tracks.length - 1;
            }
            this.loadTrack(prevIndex, true);
        }

        nextTrack(isAutoNext = false) {
            if (!this.tracks || this.tracks.length === 0) return;

            // Record current index into history for prevTrack()
            if (this.currentIndex >= 0) {
                this.shuffleHistory.push(this.currentIndex);
                if (this.shuffleHistory.length > 50) this.shuffleHistory.shift();
            }

            // 1. If queue has upcoming items, play the top item
            if (this.queue && this.queue.length > 0) {
                const nextTrackObj = this.queue.shift();

                // If repeatMode === 'all', push current track back to the end of upcoming queue
                if (this.repeatMode === 'all' && this.tracks[this.currentIndex]) {
                    this.queue.push(this.tracks[this.currentIndex]);
                }

                let nextIndex = this.tracks.indexOf(nextTrackObj);
                if (nextIndex === -1) {
                    this.tracks.push(nextTrackObj);
                    nextIndex = this.tracks.length - 1;
                }

                this.loadTrack(nextIndex, true, false);
                return;
            }

            // 2. Fallback to standard next track progression
            let nextIndex;
            if (this.isShuffle) {
                nextIndex = this.getNextShuffleIndex();
            } else {
                nextIndex = (this.currentIndex + 1) % this.tracks.length;
            }
            this.loadTrack(nextIndex, true);
        }

        toggleShuffle() {
            this.isShuffle = !this.isShuffle;
            this.updateShuffleUI();
            if (this.isShuffle) {
                this.initShuffleBag();
                this.queue = this.buildUpcomingQueue();
                this.isQueueCustom = false;
                this.showToast('🔀 Shuffle turned ON (Playing tracks randomly)');
            } else {
                this.shuffleBag = [];
                this.queue = this.buildUpcomingQueue();
                this.isQueueCustom = false;
                this.showToast('➡️ Shuffle turned OFF (Sequential playback)');
            }
            this.updateQueueBadges();
            this.renderQueue();
        }

        updateShuffleUI() {
            if (!this.shuffleBtn) return;
            this.shuffleBtn.classList.toggle('active', this.isShuffle);
            this.shuffleBtn.setAttribute('aria-pressed', this.isShuffle ? 'true' : 'false');
            this.shuffleBtn.title = this.isShuffle ? 'Shuffle: ON (Random playback)' : 'Shuffle: OFF (Sequential playback)';
        }

        initShuffleBag() {
            if (!this.tracks || this.tracks.length <= 1) {
                this.shuffleBag = [];
                return;
            }
            const indices = [];
            for (let i = 0; i < this.tracks.length; i++) {
                if (i !== this.currentIndex) indices.push(i);
            }
            // Fisher-Yates shuffle
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            this.shuffleBag = indices;
        }

        getNextShuffleIndex() {
            if (!this.tracks || this.tracks.length <= 1) return 0;
            if (!this.shuffleBag || this.shuffleBag.length === 0) {
                this.initShuffleBag();
            }
            if (this.shuffleBag && this.shuffleBag.length > 0) {
                return this.shuffleBag.shift();
            }
            let candidate = Math.floor(Math.random() * this.tracks.length);
            if (candidate === this.currentIndex && this.tracks.length > 1) {
                candidate = (candidate + 1) % this.tracks.length;
            }
            return candidate;
        }

        toggleRepeat() {
            if (this.repeatMode === 'all') {
                this.repeatMode = 'one';
                this.updateRepeatUI();
                this.showToast('🔂 Repeat ONE: Looping current song');
            } else if (this.repeatMode === 'one') {
                this.repeatMode = 'off';
                this.updateRepeatUI();
                this.showToast('➡️ Repeat OFF: Play until end of playlist');
            } else {
                this.repeatMode = 'all';
                this.updateRepeatUI();
                this.showToast('🔁 Repeat ALL: Looping playlist');
            }
            if (!this.isQueueCustom) {
                this.queue = this.buildUpcomingQueue();
            }
            this.updateQueueBadges();
            this.renderQueue();
        }

        updateRepeatUI() {
            if (!this.repeatBtn) return;
            if (this.repeatMode === 'one') {
                this.repeatBtn.classList.add('active');
                this.repeatBtn.title = 'Repeat Mode: ONE (Looping current song)';
                this.repeatBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M280-80 120-240l160-160 56 58-64 62h408v-160h80v240H272l64 62-56 58Zm400-480L520-720l56-58 64 62H232v-240h-80v320h520l-64 62 56 58 160-160-160-160Zm-180 80h40v-160h-60v40h20v120Z"/></svg>
                    <span class="musify-repeat-sub-badge">1</span>
                `;
            } else if (this.repeatMode === 'all') {
                this.repeatBtn.classList.add('active');
                this.repeatBtn.title = 'Repeat Mode: ALL (Looping entire playlist)';
                this.repeatBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M280-80 120-240l160-160 56 58-64 62h408v-160h80v240H272l64 62-56 58Zm400-480L520-720l56-58 64 62H232v-240h-80v320h520l-64 62 56 58 160-160-160-160Z"/></svg>
                `;
            } else {
                this.repeatBtn.classList.remove('active');
                this.repeatBtn.title = 'Repeat Mode: OFF';
                this.repeatBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M280-80 120-240l160-160 56 58-64 62h408v-160h80v240H272l64 62-56 58Zm400-480L520-720l56-58 64 62H232v-240h-80v320h520l-64 62 56 58 160-160-160-160Z"/></svg>
                `;
            }
        }

        togglePlay() {
            if (!this.audio.src) return;
            this.initAudioContext();
            if (this.isPlaying) {
                this.audio.pause();
                this.isPlaying = false;
            } else {
                this.audio.play()
                    .then(() => {
                        this.isPlaying = true;
                    })
                    .catch(() => {});
            }
            this.updatePlayState();
        }

        onTrackEnded() {
            if (this.repeatMode === 'one') {
                this.audio.currentTime = 0;
                this.audio.play()
                    .then(() => {
                        this.isPlaying = true;
                        this.updatePlayState();
                    })
                    .catch(() => {});
                this.showToast(`🔂 Repeating "${this.tracks[this.currentIndex]?.title || 'Song'}"`);
            } else if (this.queue && this.queue.length > 0) {
                this.nextTrack(true);
            } else if (this.repeatMode === 'all') {
                this.nextTrack(true);
            } else {
                // Repeat Mode is OFF
                if (this.isShuffle) {
                    if (this.shuffleBag && this.shuffleBag.length > 0) {
                        this.nextTrack(true);
                    } else {
                        this.isPlaying = false;
                        this.updatePlayState();
                        this.showToast('⏹️ End of playlist reached (Repeat is OFF)');
                    }
                } else {
                    if (this.currentIndex < this.tracks.length - 1) {
                        this.nextTrack(true);
                    } else {
                        this.isPlaying = false;
                        this.updatePlayState();
                        this.showToast('⏹️ End of playlist reached (Repeat is OFF)');
                    }
                }
            }
        }

        updatePlayState() {
            if (this.playBtn) {
                if (this.isPlaying) {
                    this.playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="currentColor"><path d="M560-200v-560h160v560H560Zm-320 0v-560h160v560H240Z"/></svg>`;
                    this.playBtn.title = "Pause";
                } else {
                    this.playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="currentColor"><path d="M320-200v-560l440 280-440 280Z"/></svg>`;
                    this.playBtn.title = "Play";
                }
            }
            if (this.queueBarsAnim) {
                this.queueBarsAnim.classList.toggle('active', this.isPlaying);
            }
            if (this.queueNowStatus) {
                this.queueNowStatus.textContent = this.isPlaying ? 'Playing' : 'Paused';
            }
            if (this.queueNowPlayBtn) {
                if (this.isPlaying) {
                    this.queueNowPlayBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M560-200v-560h160v560H560Zm-320 0v-560h160v560H240Z"/></svg>`;
                    this.queueNowPlayBtn.title = "Pause";
                } else {
                    this.queueNowPlayBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M320-200v-560l440 280-440 280Z"/></svg>`;
                    this.queueNowPlayBtn.title = "Play";
                }
            }
        }

        // Tab switching and view routing

        switchTab(tab) {
            document.querySelectorAll('.musify-tab-btn').forEach((b) => {
                b.classList.toggle('active', b.dataset.tab === tab);
            });
            document.querySelectorAll('.musify-view-panel').forEach((p) => {
                p.style.display = 'none';
            });

            const view = document.getElementById(`musifyView_${tab}`);
            if (view) view.style.display = 'block';

            if (tab === 'eq') this.renderEqBands();
            if (tab === 'lyrics') this.renderLyrics();
            if (tab === 'queue') this.renderQueue();
            if (tab === 'player') this.renderTracklist();
        }

        // Up next queue management and reordering

        buildUpcomingQueue() {
            if (!this.tracks || this.tracks.length === 0) return [];

            if (this.isShuffle) {
                if (!this.shuffleBag || this.shuffleBag.length === 0) {
                    this.initShuffleBag();
                }
                return this.shuffleBag.map(idx => this.tracks[idx]).filter(Boolean);
            }

            const after = this.tracks.slice(this.currentIndex + 1);
            if (this.repeatMode === 'all') {
                const before = this.tracks.slice(0, this.currentIndex);
                return [...after, ...before];
            } else if (this.repeatMode === 'one') {
                return [this.tracks[this.currentIndex], ...after];
            } else {
                return [...after];
            }
        }

        getQueue() {
            if (!this.queue || (!this.isQueueCustom && this.queue.length === 0)) {
                this.queue = this.buildUpcomingQueue();
            }
            return this.queue;
        }

        updateQueueBadges() {
            const count = this.queue ? this.queue.length : 0;
            if (this.queueCountNav) this.queueCountNav.textContent = count;
            if (this.queueCountSec) this.queueCountSec.textContent = count;
            if (this.queueCountLabel) this.queueCountLabel.textContent = `${count} ${count === 1 ? 'track' : 'tracks'}`;
        }

        reorderQueue(fromIndex, toIndex) {
            if (!this.queue || fromIndex < 0 || fromIndex >= this.queue.length || toIndex < 0 || toIndex >= this.queue.length) return;
            if (fromIndex === toIndex) return;

            const [movedTrack] = this.queue.splice(fromIndex, 1);
            this.queue.splice(toIndex, 0, movedTrack);
            this.isQueueCustom = true;

            if (this.isShuffle) {
                this.shuffleBag = this.queue.map(t => this.tracks.indexOf(t)).filter(i => i !== -1);
            }

            this.updateQueueBadges();
            this.renderQueue();
            this.showToast(`↕️ Moved "${movedTrack.title}" to position #${toIndex + 1}`);
        }

        moveQueueItemUp(index) {
            if (index <= 0) return;
            this.reorderQueue(index, index - 1);
        }

        moveQueueItemDown(index) {
            if (!this.queue || index >= this.queue.length - 1) return;
            this.reorderQueue(index, index + 1);
        }

        removeFromQueue(index) {
            if (!this.queue || index < 0 || index >= this.queue.length) return;
            const [removed] = this.queue.splice(index, 1);
            this.isQueueCustom = true;
            if (this.isShuffle) {
                this.shuffleBag = this.queue.map(t => this.tracks.indexOf(t)).filter(i => i !== -1);
            }
            this.updateQueueBadges();
            this.renderQueue();
            this.showToast(`Removed "${removed.title}" from queue`);
        }

        addToQueue(track, playNext = false) {
            if (!track) return;
            if (!this.queue) this.queue = [];
            this.isQueueCustom = true;

            if (playNext) {
                this.queue.unshift(track);
                if (this.isShuffle) {
                    const idx = this.tracks.indexOf(track);
                    if (idx !== -1) {
                        this.shuffleBag = this.shuffleBag.filter(i => i !== idx);
                        this.shuffleBag.unshift(idx);
                    }
                }
                this.showToast(`⏭️ "${track.title}" will play next`);
            } else {
                this.queue.push(track);
                if (this.isShuffle) {
                    const idx = this.tracks.indexOf(track);
                    if (idx !== -1 && !this.shuffleBag.includes(idx)) {
                        this.shuffleBag.push(idx);
                    }
                }
                this.showToast(`📋 Added "${track.title}" to Up Next queue`);
            }

            this.updateQueueBadges();
            this.renderQueue();
        }

        playQueueItemNow(index) {
            if (!this.queue || index < 0 || index >= this.queue.length) return;
            const track = this.queue[index];
            this.queue.splice(index, 1);
            this.isQueueCustom = true;

            let trackIdx = this.tracks.indexOf(track);
            if (trackIdx === -1) {
                this.tracks.push(track);
                trackIdx = this.tracks.length - 1;
            }
            this.loadTrack(trackIdx, true, false);
            this.showToast(`▶ Now playing "${track.title}"`);
        }

        shuffleQueue() {
            if (!this.queue || this.queue.length <= 1) {
                this.showToast('Need at least 2 tracks in queue to shuffle');
                return;
            }
            for (let i = this.queue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
            }
            this.isQueueCustom = true;
            if (this.isShuffle) {
                this.shuffleBag = this.queue.map(t => this.tracks.indexOf(t)).filter(i => i !== -1);
            }
            this.renderQueue();
            this.showToast('🔀 Shuffled upcoming tracks in queue');
        }

        resetQueue() {
            this.isQueueCustom = false;
            if (this.isShuffle) this.initShuffleBag();
            this.queue = this.buildUpcomingQueue();
            this.updateQueueBadges();
            this.renderQueue();
            this.showToast('↺ Restored playlist sequential order');
        }

        clearQueue() {
            this.queue = [];
            this.isQueueCustom = true;
            if (this.isShuffle) this.shuffleBag = [];
            this.updateQueueBadges();
            this.renderQueue();
            this.showToast('🗑️ Cleared upcoming queue');
        }

        renderQueue() {
            if (!this.queueListEl) return;
            const currentTrack = this.tracks[this.currentIndex];

            // 1. Update Now Playing card in queue
            if (currentTrack) {
                if (this.queueNowArt) this.queueNowArt.src = currentTrack.cover;
                if (this.queueNowTitle) this.queueNowTitle.textContent = currentTrack.title;
                if (this.queueNowArtist) this.queueNowArtist.textContent = `${currentTrack.artist} · ${currentTrack.album}`;
                if (this.queueNowFormat) this.queueNowFormat.textContent = currentTrack.formatTag || 'MP3';
                if (this.queueNowDuration) this.queueNowDuration.textContent = currentTrack.duration || '00:00';
                if (this.queueBarsAnim) this.queueBarsAnim.classList.toggle('active', this.isPlaying);
                if (this.queueNowStatus) this.queueNowStatus.textContent = this.isPlaying ? 'Playing' : 'Paused';
                if (this.queueNowPlayBtn) {
                    this.queueNowPlayBtn.innerHTML = this.isPlaying
                        ? `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M560-200v-560h160v560H560Zm-320 0v-560h160v560H240Z"/></svg>`
                        : `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M320-200v-560l440 280-440 280Z"/></svg>`;
                    this.queueNowPlayBtn.title = this.isPlaying ? "Pause" : "Play";
                }
            }

            // 2. Update status chip & subtitle
            if (this.queueModeChip && this.queueModeText) {
                if (this.repeatMode === 'one') {
                    this.queueModeText.textContent = 'Looping Current Song';
                    if (this.queueSummaryText) this.queueSummaryText.textContent = `Repeat ONE is active. "${currentTrack?.title || 'Song'}" will replay continuously.`;
                } else if (this.isShuffle) {
                    this.queueModeText.textContent = 'Shuffled Queue';
                    if (this.queueSummaryText) this.queueSummaryText.textContent = 'Upcoming tracks playing in random order · Drag or click ▲ ▼ to reorder';
                } else {
                    this.queueModeText.textContent = this.isQueueCustom ? 'Custom Queue' : 'Sequential Queue';
                    if (this.queueSummaryText) this.queueSummaryText.textContent = 'Upcoming tracks in your playlist · Drag handle ⠿ or click ▲ ▼ to reorder';
                }
            }

            // 3. Make sure queue array is populated
            if (!this.queue || (!this.isQueueCustom && this.queue.length === 0)) {
                this.queue = this.buildUpcomingQueue();
            }

            this.updateQueueBadges();

            // 4. Render queue items list
            this.queueListEl.innerHTML = '';
            if (!this.queue || this.queue.length === 0) {
                this.queueListEl.innerHTML = `
                    <div class="musify-queue-empty">
                        <div class="musify-queue-empty-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" height="26px" viewBox="0 -960 960 960" width="26px" fill="currentColor"><path d="M120-320v-80h320v80H120Zm0-160v-80h480v80H120Zm0-160v-80h480v80H120Zm520 480v-320l240 160-240 160Z"/></svg>
                        </div>
                        <h4>Queue is empty</h4>
                        <p>No upcoming tracks queued. Add songs from your playlist library or upload offline audio.</p>
                        <button type="button" class="musify-q-btn" id="musifyQueueEmptyAddBtn" style="margin-top:6px;">
                            + Add Song to Queue
                        </button>
                    </div>
                `;
                document.getElementById('musifyQueueEmptyAddBtn')?.addEventListener('click', () => this.openAddQueueModal());
                return;
            }

            this.queue.forEach((track, qIdx) => {
                const row = document.createElement('div');
                row.className = 'musify-queue-row';
                row.draggable = true;
                row.dataset.index = qIdx;
                row.innerHTML = `
                    <div class="musify-queue-item-left">
                        <span class="musify-queue-drag-handle" title="Drag to reorder">⠿</span>
                        <span class="musify-queue-pos">#${qIdx + 1}</span>
                        <div class="musify-queue-thumb-wrap" title="Play Now">
                            <img src="${track.cover}" class="musify-queue-thumb" alt="${track.title}" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=100&q=80'">
                            <div class="musify-queue-play-overlay">
                                <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M320-200v-560l440 280-440 280Z"/></svg>
                            </div>
                        </div>
                        <div class="musify-queue-info">
                            <h4 class="musify-queue-title">${track.title}</h4>
                            <p class="musify-queue-artist">${track.artist} · ${track.album}</p>
                        </div>
                    </div>
                    <div class="musify-queue-item-right">
                        <span class="musify-queue-badge">${track.formatTag || 'MP3'}</span>
                        <span class="musify-queue-time">${track.duration || '00:00'}</span>
                        <div class="musify-queue-reorder-group">
                            <button type="button" class="musify-reorder-btn move-up-btn" title="Move earlier in queue" ${qIdx === 0 ? 'disabled' : ''}>
                                ▲
                            </button>
                            <button type="button" class="musify-reorder-btn move-down-btn" title="Move later in queue" ${qIdx === this.queue.length - 1 ? 'disabled' : ''}>
                                ▼
                            </button>
                        </div>
                        <button type="button" class="musify-queue-action-btn play-now-btn" title="Play immediately">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M320-200v-560l440 280-440 280Z"/></svg>
                        </button>
                        <button type="button" class="musify-queue-action-btn remove remove-btn" title="Remove from queue">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                        </button>
                    </div>
                `;

                // Button listeners
                row.querySelector('.move-up-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.moveQueueItemUp(qIdx);
                });

                row.querySelector('.move-down-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.moveQueueItemDown(qIdx);
                });

                row.querySelector('.play-now-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.playQueueItemNow(qIdx);
                });

                row.querySelector('.musify-queue-thumb-wrap')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.playQueueItemNow(qIdx);
                });

                row.querySelector('.remove-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeFromQueue(qIdx);
                });

                // HTML5 Drag and Drop events
                row.addEventListener('dragstart', (e) => {
                    this.draggedQueueIndex = qIdx;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', qIdx);
                    row.classList.add('dragging');
                });

                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    row.classList.add('drag-over');
                });

                row.addEventListener('dragleave', () => {
                    row.classList.remove('drag-over');
                });

                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('drag-over');
                    const targetIdx = parseInt(row.dataset.index, 10);
                    if (this.draggedQueueIndex !== null && !isNaN(targetIdx) && this.draggedQueueIndex !== targetIdx) {
                        this.reorderQueue(this.draggedQueueIndex, targetIdx);
                    }
                    this.draggedQueueIndex = null;
                });

                row.addEventListener('dragend', () => {
                    row.classList.remove('dragging');
                    document.querySelectorAll('.musify-queue-row').forEach(r => r.classList.remove('drag-over'));
                    this.draggedQueueIndex = null;
                });

                this.queueListEl.appendChild(row);
            });
        }

        // Add to Queue Picker Dialog
        openAddQueueModal() {
            if (!this.addQueueModal) return;
            this.addQueueModal.style.display = 'flex';
            this.addQueueModal.setAttribute('aria-hidden', 'false');
            if (this.addQueueSearchInput) {
                this.addQueueSearchInput.value = '';
                this.addQueueSearchInput.focus();
            }
            this.renderQueuePicker('');
        }

        closeAddQueueModal() {
            if (!this.addQueueModal) return;
            this.addQueueModal.style.display = 'none';
            this.addQueueModal.setAttribute('aria-hidden', 'true');
        }

        renderQueuePicker(query = '') {
            if (!this.queuePickerList) return;
            this.queuePickerList.innerHTML = '';

            const filtered = this.tracks.filter(t => {
                if (!query) return true;
                return t.title.toLowerCase().includes(query) ||
                       t.artist.toLowerCase().includes(query) ||
                       t.album.toLowerCase().includes(query);
            });

            if (!filtered.length) {
                this.queuePickerList.innerHTML = `<div style="text-align:center;padding:24px;color:var(--musify-text-muted);font-size:12px;">No matching tracks found.</div>`;
                return;
            }

            filtered.forEach(track => {
                const item = document.createElement('div');
                item.className = 'musify-queue-picker-item';
                item.innerHTML = `
                    <img src="${track.cover}" class="musify-queue-picker-thumb" alt="${track.title}" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=80&q=80'">
                    <div class="musify-queue-picker-info">
                        <h5 class="musify-queue-picker-title">${track.title}</h5>
                        <p class="musify-queue-picker-artist">${track.artist} · ${track.duration}</p>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button type="button" class="musify-queue-picker-btn play-next-btn" title="Play next after current song">Play Next</button>
                        <button type="button" class="musify-queue-picker-btn queue-end-btn" title="Add to end of queue">+ Queue</button>
                    </div>
                `;

                item.querySelector('.play-next-btn')?.addEventListener('click', () => {
                    this.addToQueue(track, true);
                    this.closeAddQueueModal();
                });

                item.querySelector('.queue-end-btn')?.addEventListener('click', () => {
                    this.addToQueue(track, false);
                });

                this.queuePickerList.appendChild(item);
            });
        }

        onTimeUpdate() {
            if (!this.audio.duration) return;
            const cur = this.audio.currentTime;
            if (this.progressBar) this.progressBar.value = Math.floor(cur);
            if (this.timeCurrent) this.timeCurrent.textContent = this.formatTime(cur);

            // Update live synchronized lyrics
            this.highlightActiveLyric(cur);
        }

        formatTime(seconds) {
            return formatSeconds(seconds);
        }

        updateOfflineBadge() {
            const offlineCount = this.tracks.filter(t => t.category === 'uploads' || t.isSavedOffline).length;
            const pill = document.querySelector('.musify-cat-pill[data-cat="uploads"]');
            if (pill) {
                pill.innerHTML = offlineCount > 0 ? `Offline Files <span class="musify-cat-badge">${offlineCount}</span>` : 'Offline Files';
            }
        }

        async initSavedUploads() {
            try {
                const saved = await MusifyStorage.getAllTracks();
                if (saved && saved.length > 0) {
                    this.tracks.unshift(...saved);
                    this.updateOfflineBadge();
                    if (!this.isPlaying) {
                        this.currentIndex = 0;
                        this.loadTrack(0, false);
                    }
                    this.renderTracklist();
                    this.buildUpcomingQueue();
                    this.updateQueueBadges();
                    this.showToast(`💾 Restored ${saved.length} saved offline track${saved.length === 1 ? '' : 's'} from your device library!`);
                } else {
                    this.updateOfflineBadge();
                }
            } catch (err) {
                console.error('[Musify] Error restoring saved uploads:', err);
                this.updateOfflineBadge();
            }
        }

        async deleteSavedTrack(track) {
            if (!track) return;
            try {
                if (track.isSavedOffline || track.category === 'uploads') {
                    await MusifyStorage.deleteTrack(track.id);
                } else {
                    const removedIds = JSON.parse(localStorage.getItem('musify_removed_track_ids') || '[]');
                    if (!removedIds.includes(track.id)) {
                        removedIds.push(track.id);
                        localStorage.setItem('musify_removed_track_ids', JSON.stringify(removedIds));
                    }
                }
            } catch (err) {
                console.warn('[Musify] Error removing track from storage:', err);
            }

            if (track.src && track.src.startsWith('blob:')) {
                try { URL.revokeObjectURL(track.src); } catch (e) {}
            }

            this.likedTracks?.delete(track.id);

            const wasCurrent = this.tracks[this.currentIndex]?.id === track.id;
            const idx = this.tracks.findIndex(t => t.id === track.id);
            if (idx !== -1) {
                this.tracks.splice(idx, 1);
            }

            if (this.queue) {
                this.queue = this.queue.filter(t => t.id !== track.id);
            }

            if (wasCurrent) {
                if (this.tracks.length > 0) {
                    if (this.currentIndex >= this.tracks.length) {
                        this.currentIndex = 0;
                    }
                    this.loadTrack(this.currentIndex, this.isPlaying);
                } else {
                    this.audio.pause();
                    this.isPlaying = false;
                    this.updatePlayState();
                }
            } else if (idx < this.currentIndex) {
                this.currentIndex--;
            }

            this.updateOfflineBadge();
            this.renderTracklist();
            this.buildUpcomingQueue();
            this.updateQueueBadges();
            this.showToast(`🗑️ Removed "${track.title}" from library.`);
        }

        async clearAllOfflineMusic() {
            const offlineTracks = this.tracks.filter(t => t.category === 'uploads' || t.isSavedOffline);
            if (!offlineTracks.length) {
                this.showToast('No saved offline tracks to clear.');
                return;
            }

            await MusifyStorage.clearAll();
            offlineTracks.forEach(t => {
                if (t.src && t.src.startsWith('blob:')) {
                    try { URL.revokeObjectURL(t.src); } catch (e) {}
                }
            });

            this.tracks = this.tracks.filter(t => t.category !== 'uploads' && !t.isSavedOffline);
            if (this.currentIndex >= this.tracks.length) {
                this.currentIndex = 0;
            }
            this.loadTrack(this.currentIndex, false);
            this.updateOfflineBadge();
            this.renderTracklist();
            this.buildUpcomingQueue();
            this.updateQueueBadges();
            this.showToast('🗑️ Cleared all saved offline music.');
        }

        // Tracklist rendering

        renderTracklist(searchQuery = '') {
            if (!this.tracklistEl) return;
            this.tracklistEl.innerHTML = '';

            const filtered = this.tracks.filter((t) => {
                const matchCat = this.currentCategory === 'all' ||
                    (this.currentCategory === 'favorites' && this.likedTracks.has(t.id)) ||
                    t.category === this.currentCategory;
                if (!matchCat) return false;
                if (!searchQuery) return true;
                return t.title.toLowerCase().includes(searchQuery) ||
                    t.artist.toLowerCase().includes(searchQuery) ||
                    t.album.toLowerCase().includes(searchQuery);
            });

            if (!filtered.length) {
                if (this.currentCategory === 'uploads') {
                    this.tracklistEl.innerHTML = `
                        <div class="musify-offline-empty-card">
                            <div class="musify-offline-empty-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM160-160q-33 0-56.5-23.5T80-240v-160h80v160h640v-160h80v160q0 33-23.5 56.5T800-160H160Z"/></svg>
                            </div>
                            <h3>No Saved Offline Songs Yet</h3>
                            <p>Upload your own MP3, FLAC, M4A, or WAV audio files. They are automatically saved to your browser's offline storage so you can listen anytime without re-uploading!</p>
                            <label class="musify-act-btn primary" style="cursor:pointer;margin:0 auto;display:inline-flex;">
                                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM160-160q-33 0-56.5-23.5T80-240v-160h80v160h640v-160h80v160q0 33-23.5 56.5T800-160H160Z"/></svg>
                                + Upload &amp; Save Music
                                <input type="file" id="musifyEmptyOfflineInput" accept="audio/*" multiple style="display:none">
                            </label>
                        </div>
                    `;
                    this.tracklistEl.querySelector('#musifyEmptyOfflineInput')?.addEventListener('change', (e) => this.handleLocalFiles(e.target.files));
                    return;
                }
                let restoreBtn = '';
                try {
                    const removed = JSON.parse(localStorage.getItem('musify_removed_track_ids') || '[]');
                    if (removed.length > 0) {
                        restoreBtn = `<br><button id="musifyRestoreDefaultsBtn" class="musify-act-btn" style="margin-top:14px;display:inline-flex;">↺ Restore Default Songs</button>`;
                    }
                } catch (e) {}
                this.tracklistEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--musify-text-muted);font-size:13px;">No audio tracks found. Click "+ Offline Audio" to upload music files.${restoreBtn}</div>`;
                this.tracklistEl.querySelector('#musifyRestoreDefaultsBtn')?.addEventListener('click', () => {
                    localStorage.removeItem('musify_removed_track_ids');
                    this.tracks = [...DEFAULT_TRACKS];
                    this.currentIndex = 0;
                    this.loadTrack(0, false);
                    this.renderTracklist();
                    this.buildUpcomingQueue();
                    this.updateQueueBadges();
                    this.showToast('↺ Restored default songs');
                });
                return;
            }

            // If viewing Offline Files, show storage summary header banner
            if (this.currentCategory === 'uploads') {
                const banner = document.createElement('div');
                banner.className = 'musify-offline-header-banner';
                banner.innerHTML = `
                    <div class="meta-info">
                        <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="#10b981"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm-40-160h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Z"/></svg>
                        <span><strong>Saved Offline Library:</strong> ${filtered.length} song${filtered.length === 1 ? '' : 's'} stored permanently on this device</span>
                    </div>
                    <button type="button" class="musify-offline-clear-btn" id="musifyClearOfflineBannerBtn" title="Clear all saved offline songs from this device">
                        Clear All Offline
                    </button>
                `;
                this.tracklistEl.appendChild(banner);
                banner.querySelector('#musifyClearOfflineBannerBtn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.clearAllOfflineMusic();
                });
            }

            filtered.forEach((track) => {
                const originalIndex = this.tracks.indexOf(track);
                const isCurrent = originalIndex === this.currentIndex;
                const isLiked = this.likedTracks.has(track.id);
                const isOfflineSaved = track.isSavedOffline || track.category === 'uploads';

                const row = document.createElement('div');
                row.className = `musify-track-row ${isCurrent ? 'playing' : ''}`;
                row.innerHTML = `
                    <div class="musify-track-meta">
                        <img src="${track.cover}" class="musify-track-thumb" alt="${track.title}" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=100&q=80'">
                        <div class="musify-track-names">
                            <h4 class="musify-track-title">${track.title}</h4>
                            <p class="musify-track-artist">${track.artist} · ${track.album}</p>
                        </div>
                    </div>
                    <div class="musify-track-extra">
                        ${isOfflineSaved ? `
                            <span class="musify-saved-badge" title="Saved permanently in offline device storage">
                                <svg xmlns="http://www.w3.org/2000/svg" height="11px" viewBox="0 -960 960 960" width="11px" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
                                Saved
                            </span>
                        ` : ''}
                        <span class="musify-track-format-tag">${track.formatTag || 'MP3'}</span>
                        <span class="musify-track-duration">${track.duration}</span>
                        <button class="musify-track-queue-btn" title="Add to Up Next Queue" data-id="${track.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
                                <path d="M120-320v-80h320v80H120Zm0-160v-80h480v80H120Zm0-160v-80h480v80H120Zm520 480v-120H520v-80h120v-120h80v120h120v80H720v120h-80Z"/>
                            </svg>
                        </button>
                        <button class="musify-track-info-btn" title="Audio File Info & Metadata" data-id="${track.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
                                <path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z"/>
                            </svg>
                        </button>
                        <button class="musify-heart-btn ${isLiked ? 'liked' : ''}" title="Favorite" data-id="${track.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
                                <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544.5T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 45-15.5 89.5T810-447.5q-39 52.5-105 118.5T538-172l-58 52Z"/>
                            </svg>
                        </button>
                        <button class="musify-track-delete-btn" title="${isOfflineSaved ? 'Remove from offline storage' : 'Remove track from library'}" data-id="${track.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
                                <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T760-120H280Zm480-600H280v520h480v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
                            </svg>
                        </button>
                    </div>
                `;

                row.addEventListener('click', (e) => {
                    if (e.target.closest('.musify-heart-btn') || e.target.closest('.musify-track-info-btn') || e.target.closest('.musify-track-queue-btn') || e.target.closest('.musify-track-delete-btn')) return;
                    this.loadTrack(originalIndex, true);
                });

                const queueBtn = row.querySelector('.musify-track-queue-btn');
                queueBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.addToQueue(track);
                });

                const infoBtn = row.querySelector('.musify-track-info-btn');
                infoBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openAudioDetailsModal(track);
                });

                const heartBtn = row.querySelector('.musify-heart-btn');
                heartBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.likedTracks.has(track.id)) {
                        this.likedTracks.delete(track.id);
                    } else {
                        this.likedTracks.add(track.id);
                    }
                    this.renderTracklist(searchQuery);
                });

                const deleteBtn = row.querySelector('.musify-track-delete-btn');
                deleteBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.deleteSavedTrack(track);
                });

                this.tracklistEl.appendChild(row);
            });
        }

        // Lyrics and equalizer

        renderLyrics() {
            if (!this.lyricsContainer) return;
            const track = this.tracks[this.currentIndex];
            this.lyricsContainer.innerHTML = '';

            if (!track) {
                this.lyricsContainer.innerHTML = `<div class="musify-lyrics-empty"><h4>No song currently loaded</h4></div>`;
                return;
            }

            // Sync Header UI
            if (this.lyricsTrackThumb) {
                this.lyricsTrackThumb.src = track.cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=120&q=80';
            }
            if (this.lyricsTrackTitle) {
                this.lyricsTrackTitle.textContent = track.title || 'Live Lyrics';
            }
            if (this.lyricsTrackArtist) {
                const sub = track.artist && !track.artist.includes('Offline Audio') ? `${track.artist} · ${track.album || ''}` : (track.album || 'Device Audio');
                this.lyricsTrackArtist.textContent = sub;
            }

            const hasRealLyrics = track.lyrics && track.lyrics.length > 0 && !(track.lyrics.length === 1 && (track.lyrics[0].text.startsWith('♪') && track.lyrics[0].text.endsWith('♪')));

            // Sync status chip
            if (this.lyricsChip) {
                if (track.lyricsLoading) {
                    this.lyricsChip.textContent = 'SEARCHING...';
                    this.lyricsChip.className = 'musify-lyrics-chip loading';
                } else if (hasRealLyrics && track.lyrics.some(l => l.time > 0)) {
                    this.lyricsChip.textContent = track.lyricsSource ? track.lyricsSource.toUpperCase() : 'SYNCHRONIZED';
                    this.lyricsChip.className = 'musify-lyrics-chip synced';
                } else if (hasRealLyrics) {
                    this.lyricsChip.textContent = 'PLAIN LYRICS';
                    this.lyricsChip.className = 'musify-lyrics-chip plain';
                } else {
                    this.lyricsChip.textContent = 'NO LYRICS';
                    this.lyricsChip.className = 'musify-lyrics-chip';
                }
            }

            // If track does not have real lyrics yet, auto-fetch once online
            if (!hasRealLyrics) {
                if (!track.lyricsAttempted && navigator.onLine) {
                    track.lyricsAttempted = true;
                    this.lyricsContainer.innerHTML = `
                        <div class="musify-lyrics-loading">
                            <div class="musify-lyrics-spinner"></div>
                            <p>Searching synchronized live lyrics for "${track.title}"...</p>
                        </div>
                    `;
                    this.fetchLyricsForTrack(track, false);
                    return;
                }

                // Render beautiful interactive empty state
                this.lyricsContainer.innerHTML = `
                    <div class="musify-lyrics-empty">
                        <div class="musify-lyrics-empty-icon">🎵</div>
                        <h4>No Synchronized Lyrics for "${track.title}"</h4>
                        <p>Uploaded songs can be synced automatically from the LRCLIB open database or imported from a .LRC file.</p>
                        <div class="musify-lyrics-empty-actions">
                            <button type="button" class="musify-lyrics-act-btn" id="musifyEmptyFetchBtn">
                                🔍 Search Online (LRCLIB)
                            </button>
                            <label class="musify-lyrics-act-btn" style="cursor:pointer;">
                                📁 Import .LRC File
                                <input type="file" id="musifyEmptyFileInput" accept=".lrc,.txt" style="display:none">
                            </label>
                            <button type="button" class="musify-lyrics-act-btn" id="musifyEmptyEditBtn">
                                ✍️ Add / Paste Lyrics
                            </button>
                        </div>
                    </div>
                `;

                const emptyFetch = this.lyricsContainer.querySelector('#musifyEmptyFetchBtn');
                emptyFetch?.addEventListener('click', () => this.promptAndFetchLyrics());
                const emptyInput = this.lyricsContainer.querySelector('#musifyEmptyFileInput');
                emptyInput?.addEventListener('change', (e) => this.handleLyricsFileImport(e));
                const emptyEdit = this.lyricsContainer.querySelector('#musifyEmptyEditBtn');
                emptyEdit?.addEventListener('click', () => this.openLyricsEditorModal());
                return;
            }

            // Render timed lyric lines
            this.lastActiveLyricLine = null;
            track.lyrics.forEach((line, idx) => {
                const el = document.createElement('div');
                el.className = 'musify-lyric-line';
                el.dataset.time = line.time;
                el.dataset.index = idx;
                el.textContent = line.text;
                el.addEventListener('click', () => {
                    this.audio.currentTime = line.time;
                    if (!this.isPlaying) {
                        this.audio.play().then(() => {
                            this.isPlaying = true;
                            this.updatePlayState();
                        }).catch(() => {});
                    }
                });
                this.lyricsContainer.appendChild(el);
            });

            // Highlight line based on current audio time
            this.highlightActiveLyric(this.audio.currentTime || 0, true);
        }

        highlightActiveLyric(currentTime, forceScroll = false) {
            if (!this.lyricsContainer) return;
            const lines = this.lyricsContainer.querySelectorAll('.musify-lyric-line');
            if (!lines.length) return;

            let activeLine = null;
            for (let i = 0; i < lines.length; i++) {
                const lineTime = Number(lines[i].dataset.time);
                if (currentTime >= lineTime) {
                    activeLine = lines[i];
                } else {
                    break;
                }
            }

            if (activeLine && (activeLine !== this.lastActiveLyricLine || forceScroll)) {
                lines.forEach((l) => l.classList.remove('active'));
                activeLine.classList.add('active');
                this.lastActiveLyricLine = activeLine;
                activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        async fetchLyricsForTrack(track, isManual = false, customTitle = null, customArtist = null) {
            if (!track) return;
            track.lyricsLoading = true;
            if (this.tracks[this.currentIndex] === track && this.lyricsChip) {
                this.lyricsChip.textContent = 'SEARCHING...';
                this.lyricsChip.className = 'musify-lyrics-chip loading';
            }

            const searchTitle = customTitle || track.title;
            const searchArtist = customArtist !== null ? customArtist : (track.artist === 'Offline Audio File' ? '' : track.artist);

            const result = await fetchOnlineLyrics(searchTitle, searchArtist, track.durationSec);
            track.lyricsLoading = false;

            if (result && (result.syncedLyrics || result.plainLyrics)) {
                const raw = result.syncedLyrics || result.plainLyrics;
                track.lyricsRaw = raw;
                track.lyrics = parseLrcLyrics(raw, track.durationSec);
                track.lyricsSource = result.syncedLyrics ? 'LRCLIB (Synchronized)' : 'LRCLIB (Plain)';
                track.lyricsAttempted = true;

                if (track.isSavedOffline || track.category === 'uploads') {
                    await MusifyStorage.updateTrackLyrics(track.id, track.lyrics, track.lyricsRaw, track.lyricsSource);
                }

                if (this.tracks[this.currentIndex] === track) {
                    this.renderLyrics();
                }
                this.showToast(`✨ Found synchronized live lyrics for "${track.title}"!`);
            } else {
                track.lyricsAttempted = true;
                if (isManual) {
                    this.showToast(`No online lyrics found for "${searchTitle}". You can import an .LRC file or paste lyrics.`);
                }
                if (this.tracks[this.currentIndex] === track) {
                    this.renderLyrics();
                }
            }
        }

        promptAndFetchLyrics() {
            const track = this.tracks[this.currentIndex];
            if (!track) {
                this.showToast('No song is currently selected.');
                return;
            }

            let initialQuery = track.title;
            if (track.artist && !track.artist.includes('Offline Audio') && !track.artist.includes('Device')) {
                initialQuery = `${track.artist} - ${track.title}`;
            }

            const input = prompt(`Search live lyrics for this uploaded song:\nEnter Title or "Artist - Song Name":`, initialQuery);
            if (input === null) return;
            const trimmed = input.trim();
            if (!trimmed) return;

            let searchTitle = trimmed;
            let searchArtist = '';
            if (trimmed.includes(' - ')) {
                const parts = trimmed.split(' - ');
                searchArtist = parts[0].trim();
                searchTitle = parts.slice(1).join(' - ').trim();
            }

            this.showToast(`Searching LRCLIB for "${searchTitle}"...`);
            this.fetchLyricsForTrack(track, true, searchTitle, searchArtist);
        }

        async handleLyricsFileImport(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const track = this.tracks[this.currentIndex];
            if (!track) {
                this.showToast('No song is currently selected.');
                return;
            }

            try {
                const text = await file.text();
                const parsed = parseLrcLyrics(text, track.durationSec);
                if (!parsed || !parsed.length) {
                    this.showToast('Could not parse any lyric lines from this file.');
                    return;
                }

                track.lyrics = parsed;
                track.lyricsRaw = text;
                track.lyricsSource = `LRC (${file.name})`;
                track.lyricsAttempted = true;

                if (track.isSavedOffline || track.category === 'uploads') {
                    await MusifyStorage.updateTrackLyrics(track.id, track.lyrics, track.lyricsRaw, track.lyricsSource);
                }

                this.renderLyrics();
                this.showToast(`✅ Imported ${parsed.length} synchronized lyric lines from ${file.name}!`);
            } catch (err) {
                console.error('[Musify] Error importing lyrics file:', err);
                this.showToast('Failed to read the lyrics file.');
            } finally {
                event.target.value = '';
            }
        }

        openLyricsEditorModal() {
            const track = this.tracks[this.currentIndex];
            if (!track) {
                this.showToast('No song is currently selected.');
                return;
            }
            if (!this.lyricsEditorModal) return;

            if (this.lyricsEditorTitle) {
                this.lyricsEditorTitle.textContent = `Edit Lyrics: ${track.title}`;
            }

            if (this.lyricsEditTextarea) {
                if (track.lyricsRaw && track.lyricsRaw.trim()) {
                    this.lyricsEditTextarea.value = track.lyricsRaw.trim();
                } else if (track.lyrics && track.lyrics.length > 0) {
                    this.lyricsEditTextarea.value = track.lyrics.map(l => {
                        const m = Math.floor(l.time / 60);
                        const s = (l.time % 60).toFixed(2);
                        return `[${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}] ${l.text}`;
                    }).join('\n');
                } else {
                    this.lyricsEditTextarea.value = '';
                }
            }

            this.lyricsEditorModal.style.display = 'flex';
            this.lyricsEditorModal.setAttribute('aria-hidden', 'false');
            if (this.lyricsEditTextarea) {
                this.lyricsEditTextarea.focus();
            }
        }

        closeLyricsEditorModal() {
            if (!this.lyricsEditorModal) return;
            this.lyricsEditorModal.style.display = 'none';
            this.lyricsEditorModal.setAttribute('aria-hidden', 'true');
        }

        async saveEditedLyrics() {
            const track = this.tracks[this.currentIndex];
            if (!track || !this.lyricsEditTextarea) return;

            const text = this.lyricsEditTextarea.value.trim();
            if (!text) {
                track.lyrics = [];
                track.lyricsRaw = '';
                track.lyricsSource = '';
            } else {
                const parsed = parseLrcLyrics(text, track.durationSec);
                track.lyrics = parsed;
                track.lyricsRaw = text;
                track.lyricsSource = 'Custom Lyrics';
            }
            track.lyricsAttempted = true;

            if (track.isSavedOffline || track.category === 'uploads') {
                await MusifyStorage.updateTrackLyrics(track.id, track.lyrics, track.lyricsRaw, track.lyricsSource);
            }

            this.closeLyricsEditorModal();
            this.renderLyrics();
            this.showToast('💾 Live lyrics saved and synchronized!');
        }

        renderEqBands() {
            const bandsWrap = document.getElementById('musifyBandsWrap');
            if (!bandsWrap || bandsWrap.children.length) return;

            FREQUENCIES.forEach((freq, i) => {
                const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
                const col = document.createElement('div');
                col.className = 'musify-band-col';
                col.innerHTML = `
                    <span class="musify-band-val" id="musifyBandVal_${i}">0dB</span>
                    <input type="range" class="musify-band-slider" min="-12" max="12" step="1" value="0" data-index="${i}">
                    <span class="musify-band-freq">${label}Hz</span>
                `;

                const slider = col.querySelector('.musify-band-slider');
                const valEl = col.querySelector('.musify-band-val');
                slider.addEventListener('input', (e) => {
                    const gain = Number(e.target.value);
                    valEl.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
                    if (this.eqNodes[i]) {
                        this.eqNodes[i].gain.value = gain;
                    }
                });

                bandsWrap.appendChild(col);
            });

            document.querySelectorAll('.musify-eq-preset-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.musify-eq-preset-btn').forEach((b) => b.classList.remove('active'));
                    btn.classList.add('active');
                    const presetName = btn.dataset.preset;
                    const values = MUSIFY_PRESETS[presetName] || MUSIFY_PRESETS.flat;

                    values.forEach((gain, i) => {
                        const slider = document.querySelector(`.musify-band-slider[data-index="${i}"]`);
                        const valEl = document.getElementById(`musifyBandVal_${i}`);
                        if (slider) slider.value = gain;
                        if (valEl) valEl.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
                        if (this.eqNodes[i]) this.eqNodes[i].gain.value = gain;
                    });
                });
            });
        }

        showToast(msg) {
            const toast = document.getElementById('toast');
            if (toast) {
                toast.textContent = msg;
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 3500);
            }
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Initialize on DOM load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.musifyPlayer = new MusifyPlayer();
        });
    } else {
        window.musifyPlayer = new MusifyPlayer();
    }
})();
