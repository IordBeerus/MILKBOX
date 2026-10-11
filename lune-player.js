/**
 * LUNE Web Music Player
 * Inspired by Lune for Android (Material 3: Expressive & Dark Defocus)
 * Author: MrDemonc · Web Integration for MILKBOX
 */

(function () {
    const LUNE_PRESETS = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bass: [7, 6, 4, 2, 0, 0, 0, 0, 0, 0],
        vocal: [-2, -2, -1, 1, 3, 4, 3, 1, -1, -2],
        acoustic: [3, 2, 1, 0, 2, 2, 3, 3, 2, 1],
        electronic: [5, 4, 2, 0, -2, 2, 1, 2, 4, 5],
        rock: [5, 3, 2, -1, -2, 1, 3, 4, 4, 4],
        pop: [-1, 1, 3, 4, 4, 2, -1, -1, 1, 2],
        spatial: [3, 2, 0, -1, 0, 1, 2, 4, 5, 6]
    };

    const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

    // High quality royalty-free initial curated tracks
    const DEFAULT_TRACKS = [
        {
            id: 'lune-1',
            title: 'Lune Melancholy (Espresso Dreams)',
            artist: 'MrDemonc & Lune Studio',
            album: 'Lune Vol. 1',
            duration: '02:45',
            category: 'lofi',
            cover: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=400&q=80',
            src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
            lyrics: [
                { time: 0, text: "♪ [Soft ambient coffee shop warmth] ♪" },
                { time: 8, text: "Night falls on the quiet street" },
                { time: 18, text: "Steam rises from the fresh espresso" },
                { time: 30, text: "Zero tracking, pure quiet mind" },
                { time: 45, text: "Listening to the gentle rain outside" },
                { time: 60, text: "Lune beats softly through the dark defocus" },
                { time: 80, text: "Let the sound waves carry your thoughts away" },
                { time: 105, text: "Lost in the rhythm of the night" },
                { time: 130, text: "Warm caramel lights glow in the distance" },
                { time: 155, text: "♪ [Gentle fade out] ♪" }
            ]
        },
        {
            id: 'lune-2',
            title: 'Midnight Velvet',
            artist: 'DemonLab Audio',
            album: 'Dark Defocus Sessions',
            duration: '03:12',
            category: 'chill',
            cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
            src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=chill-abstract-intention-12099.mp3',
            lyrics: [
                { time: 0, text: "♪ [Synth pads opening] ♪" },
                { time: 12, text: "Floating across the skyline" },
                { time: 28, text: "City lights blurred like bokeh" },
                { time: 46, text: "Pure audio, pristine frequency" },
                { time: 70, text: "No servers between you and the song" },
                { time: 95, text: "Synchronized heartbeats in time" },
                { time: 120, text: "Bass reverberating through the glass" },
                { time: 150, text: "Until the morning light returns" }
            ]
        },
        {
            id: 'lune-3',
            title: 'Celestial Drift',
            artist: 'Lune Ensemble',
            album: 'Material 3 Suite',
            duration: '02:30',
            category: 'ambient',
            cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=400&q=80',
            src: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-piano-amp-strings-10711.mp3',
            lyrics: [
                { time: 0, text: "♪ [Acoustic piano reverberation] ♪" },
                { time: 15, text: "Drifting past the moonlit clouds" },
                { time: 35, text: "Stars aligned in quiet harmony" },
                { time: 55, text: "Expressive melodies unfolding" },
                { time: 80, text: "Deep resonance in every note" },
                { time: 110, text: "Breathe in the calm, breathe out the noise" },
                { time: 135, text: "♪ [Harmonic decay] ♪" }
            ]
        },
        {
            id: 'lune-4',
            title: 'Tokyo Neon Rain',
            artist: 'Komorebi Sound',
            album: 'Tokyo Odyssey',
            duration: '03:40',
            category: 'lofi',
            cover: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80',
            src: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_92461b2e1b.mp3?filename=lofi-vibes-11440.mp3',
            lyrics: [
                { time: 0, text: "♪ [Vinyl crackle and guitar chords] ♪" },
                { time: 14, text: "Underneath the neon signboards" },
                { time: 32, text: "Footsteps echoing on wet asphalt" },
                { time: 56, text: "Memories playing back in slow motion" },
                { time: 84, text: "A sip of warm tea at 2 AM" },
                { time: 115, text: "Notes echoing through the alleyway" },
                { time: 145, text: "Safe inside the melody" }
            ]
        }
    ];

    class LunePlayer {
        constructor() {
            this.tracks = [...DEFAULT_TRACKS];
            this.currentIndex = 0;
            this.isPlaying = false;
            this.isShuffle = false;
            this.repeatMode = 'all'; // 'off' | 'all' | 'one'
            this.currentCategory = 'all';
            this.likedTracks = new Set(['lune-1']);
            this.sleepTimerTimeout = null;

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
        }

        initDOM() {
            this.container = document.getElementById('lunePlayerContainer');
            if (!this.container) return;

            this.albumArt = document.getElementById('luneAlbumArt');
            this.nowTitle = document.getElementById('luneNowTitle');
            this.nowArtist = document.getElementById('luneNowArtist');
            this.playBtn = document.getElementById('lunePlayBtn');
            this.prevBtn = document.getElementById('lunePrevBtn');
            this.nextBtn = document.getElementById('luneNextBtn');
            this.shuffleBtn = document.getElementById('luneShuffleBtn');
            this.repeatBtn = document.getElementById('luneRepeatBtn');
            this.progressBar = document.getElementById('luneProgressBar');
            this.timeCurrent = document.getElementById('luneTimeCurrent');
            this.timeTotal = document.getElementById('luneTimeTotal');
            this.volumeSlider = document.getElementById('luneVolumeSlider');
            this.speedBtn = document.getElementById('luneSpeedBtn');
            this.timerBtn = document.getElementById('luneTimerBtn');
            this.tracklistEl = document.getElementById('luneTracklist');
            this.canvas = document.getElementById('luneVisualizerCanvas');
            this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
            this.lyricsContainer = document.getElementById('luneLyricsContainer');
            this.searchFilter = document.getElementById('luneSearchInput');
            this.fileInput = document.getElementById('luneFileInput');
            this.ambientGlow = document.getElementById('luneAmbientGlow');
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
                console.warn('[Lune] Web Audio initialization warning:', err);
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

                const barCount = 36;
                const barWidth = (width / barCount) * 0.7;
                const step = Math.floor(bufferLength / barCount);

                for (let i = 0; i < barCount; i++) {
                    const value = this.isPlaying ? dataArray[i * step] : 8;
                    const percent = value / 255;
                    const barHeight = Math.max(3, percent * height);
                    const x = i * (width / barCount) + 2;
                    const y = (height - barHeight) / 2;

                    // Coffee / Caramel gradient
                    const gradient = this.canvasCtx.createLinearGradient(0, y, 0, y + barHeight);
                    gradient.addColorStop(0, '#e2a672');
                    gradient.addColorStop(1, '#b8753a');

                    this.canvasCtx.fillStyle = gradient;
                    this.canvasCtx.beginPath();
                    this.canvasCtx.roundRect(x, y, barWidth, barHeight, 4);
                    this.canvasCtx.fill();
                }
            };
            draw();
        }

        initEvents() {
            // Audio listeners
            this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
            this.audio.addEventListener('ended', () => this.onTrackEnded());
            this.audio.addEventListener('loadedmetadata', () => {
                if (this.progressBar) this.progressBar.max = Math.floor(this.audio.duration || 100);
                if (this.timeTotal) this.timeTotal.textContent = this.formatTime(this.audio.duration);
            });
            this.audio.addEventListener('play', () => {
                this.isPlaying = true;
                this.updatePlayState();
            });
            this.audio.addEventListener('pause', () => {
                this.isPlaying = false;
                this.updatePlayState();
            });

            // Scrubber
            this.progressBar?.addEventListener('input', (e) => {
                const targetTime = Number(e.target.value);
                this.audio.currentTime = targetTime;
                if (this.timeCurrent) this.timeCurrent.textContent = this.formatTime(targetTime);
            });

            // Volume
            this.volumeSlider?.addEventListener('input', (e) => {
                this.audio.volume = Number(e.target.value);
            });

            // Play / Pause
            this.playBtn?.addEventListener('click', () => {
                this.initAudioContext();
                if (this.audioCtx && this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }
                if (this.isPlaying) {
                    this.audio.pause();
                } else {
                    this.audio.play().catch((e) => console.warn('[Lune] Playback notice:', e));
                }
            });

            // Prev / Next
            this.prevBtn?.addEventListener('click', () => this.prevTrack());
            this.nextBtn?.addEventListener('click', () => this.nextTrack());

            // Shuffle
            this.shuffleBtn?.addEventListener('click', () => {
                this.isShuffle = !this.isShuffle;
                this.shuffleBtn.classList.toggle('active', this.isShuffle);
            });

            // Repeat
            this.repeatBtn?.addEventListener('click', () => {
                if (this.repeatMode === 'all') this.repeatMode = 'one';
                else if (this.repeatMode === 'one') this.repeatMode = 'off';
                else this.repeatMode = 'all';
                this.repeatBtn.classList.toggle('active', this.repeatMode !== 'off');
                this.repeatBtn.title = `Repeat: ${this.repeatMode}`;
            });

            // Speed
            this.speedBtn?.addEventListener('click', () => {
                const rates = [1.0, 1.25, 1.5, 2.0, 0.75];
                const currentRate = this.audio.playbackRate;
                const nextRate = rates[(rates.indexOf(currentRate) + 1) % rates.length] || 1.0;
                this.audio.playbackRate = nextRate;
                this.speedBtn.textContent = `${nextRate}x`;
            });

            // Sleep Timer
            this.timerBtn?.addEventListener('click', () => {
                const timers = [0, 15, 30, 45, 60];
                const cur = Number(this.timerBtn.dataset.minutes || 0);
                const next = timers[(timers.indexOf(cur) + 1) % timers.length];
                this.timerBtn.dataset.minutes = next;
                if (this.sleepTimerTimeout) clearTimeout(this.sleepTimerTimeout);
                if (next === 0) {
                    this.timerBtn.textContent = 'Timer: Off';
                    this.timerBtn.classList.remove('active');
                } else {
                    this.timerBtn.textContent = `${next}m`;
                    this.timerBtn.classList.add('active');
                    this.sleepTimerTimeout = setTimeout(() => {
                        this.audio.pause();
                        this.timerBtn.textContent = 'Timer: Off';
                        this.timerBtn.dataset.minutes = '0';
                        this.timerBtn.classList.remove('active');
                    }, next * 60 * 1000);
                }
            });

            // Tab Switching (Player / EQ / Lyrics / Portal)
            document.querySelectorAll('.lune-tab-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    const tab = btn.dataset.tab;
                    document.querySelectorAll('.lune-tab-btn').forEach((b) => b.classList.remove('active'));
                    btn.classList.add('active');

                    document.querySelectorAll('.lune-view-panel').forEach((panel) => {
                        panel.style.display = panel.id === `luneView_${tab}` ? 'block' : 'none';
                    });

                    if (tab === 'eq') this.renderEqBands();
                    if (tab === 'lyrics') this.renderLyrics();
                });
            });

            // Category filtering
            document.querySelectorAll('.lune-cat-pill').forEach((pill) => {
                pill.addEventListener('click', () => {
                    document.querySelectorAll('.lune-cat-pill').forEach((p) => p.classList.remove('active'));
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

            const dropZone = document.getElementById('luneLibraryCard');
            if (dropZone) {
                dropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropZone.style.borderColor = 'var(--lune-accent)';
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
            document.getElementById('luneAddUrlBtn')?.addEventListener('click', () => {
                const url = prompt('Enter a direct audio URL (MP3/FLAC/AAC/Stream):');
                if (!url) return;
                const newTrack = {
                    id: 'custom-' + Date.now(),
                    title: 'Stream ' + new URL(url).pathname.split('/').pop() || 'Web Audio Stream',
                    artist: 'Custom Stream',
                    album: 'External Stream',
                    duration: 'Live',
                    category: 'uploads',
                    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
                    src: url,
                    lyrics: [{ time: 0, text: "♪ Streaming live audio ♪" }]
                };
                this.tracks.unshift(newTrack);
                this.loadTrack(0, true);
                this.renderTracklist();
            });
        }

        handleLocalFiles(files) {
            if (!files || !files.length) return;
            const newTracks = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith('audio/') && !/\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.name)) continue;
                const url = URL.createObjectURL(file);
                const title = file.name.replace(/\.[^/.]+$/, "");
                newTracks.push({
                    id: 'local-' + Date.now() + '-' + i,
                    title: title,
                    artist: 'Local Device Audio',
                    album: 'My Files',
                    duration: '--:--',
                    category: 'uploads',
                    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
                    src: url,
                    lyrics: [{ time: 0, text: `♪ Local audio: ${title} ♪` }]
                });
            }
            if (newTracks.length) {
                this.tracks.unshift(...newTracks);
                this.loadTrack(0, true);
                this.renderTracklist();
            }
        }

        loadTrack(index, autoPlay = true) {
            if (index < 0 || index >= this.tracks.length) return;
            this.currentIndex = index;
            const track = this.tracks[index];

            this.audio.src = track.src;
            if (this.albumArt) this.albumArt.src = track.cover;
            if (this.nowTitle) this.nowTitle.textContent = track.title;
            if (this.nowArtist) this.nowArtist.textContent = `${track.artist} · ${track.album}`;
            if (this.timeCurrent) this.timeCurrent.textContent = '00:00';
            if (this.timeTotal) this.timeTotal.textContent = track.duration || '00:00';

            this.renderTracklist();
            this.renderLyrics();

            if (autoPlay) {
                this.initAudioContext();
                this.audio.play().catch(() => {});
            }
        }

        prevTrack() {
            let nextIndex = this.currentIndex - 1;
            if (nextIndex < 0) nextIndex = this.tracks.length - 1;
            this.loadTrack(nextIndex, true);
        }

        nextTrack() {
            let nextIndex;
            if (this.isShuffle) {
                nextIndex = Math.floor(Math.random() * this.tracks.length);
            } else {
                nextIndex = (this.currentIndex + 1) % this.tracks.length;
            }
            this.loadTrack(nextIndex, true);
        }

        onTrackEnded() {
            if (this.repeatMode === 'one') {
                this.audio.currentTime = 0;
                this.audio.play();
            } else if (this.repeatMode === 'all') {
                this.nextTrack();
            } else {
                this.isPlaying = false;
                this.updatePlayState();
            }
        }

        updatePlayState() {
            if (!this.playBtn) return;
            if (this.isPlaying) {
                this.playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="currentColor"><path d="M560-200v-560h160v560H560Zm-320 0v-560h160v560H240Z"/></svg>`;
                this.playBtn.title = "Pause";
            } else {
                this.playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="currentColor"><path d="M320-200v-560l440 280-440 280Z"/></svg>`;
                this.playBtn.title = "Play";
            }
        }

        onTimeUpdate() {
            if (!this.audio.duration) return;
            const cur = this.audio.currentTime;
            if (this.progressBar) this.progressBar.value = Math.floor(cur);
            if (this.timeCurrent) this.timeCurrent.textContent = this.formatTime(cur);

            // Update synchronized lyrics
            this.highlightActiveLyric(cur);
        }

        formatTime(seconds) {
            if (isNaN(seconds) || seconds < 0) return '00:00';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }

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
                this.tracklistEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--lune-text-muted);font-size:13px;">No audio tracks found in this category. Click "+ Upload Audio" to add your music.</div>`;
                return;
            }

            filtered.forEach((track) => {
                const originalIndex = this.tracks.indexOf(track);
                const isCurrent = originalIndex === this.currentIndex;
                const isLiked = this.likedTracks.has(track.id);

                const row = document.createElement('div');
                row.className = `lune-track-row ${isCurrent ? 'playing' : ''}`;
                row.innerHTML = `
                    <div class="lune-track-meta">
                        <img src="${track.cover}" class="lune-track-thumb" alt="${track.title}" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=100&q=80'">
                        <div class="lune-track-names">
                            <h4 class="lune-track-title">${track.title}</h4>
                            <p class="lune-track-artist">${track.artist}</p>
                        </div>
                    </div>
                    <div class="lune-track-extra">
                        <span class="lune-track-duration">${track.duration}</span>
                        <button class="lune-heart-btn ${isLiked ? 'liked' : ''}" title="Favorite" data-id="${track.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
                                <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544.5T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 45-15.5 89.5T810-447.5q-39 52.5-105 118.5T538-172l-58 52Z"/>
                            </svg>
                        </button>
                    </div>
                `;

                row.addEventListener('click', (e) => {
                    if (e.target.closest('.lune-heart-btn')) return;
                    this.loadTrack(originalIndex, true);
                });

                const heartBtn = row.querySelector('.lune-heart-btn');
                heartBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.likedTracks.has(track.id)) {
                        this.likedTracks.delete(track.id);
                    } else {
                        this.likedTracks.add(track.id);
                    }
                    this.renderTracklist(searchQuery);
                });

                this.tracklistEl.appendChild(row);
            });
        }

        renderLyrics() {
            if (!this.lyricsContainer) return;
            const track = this.tracks[this.currentIndex];
            this.lyricsContainer.innerHTML = '';

            if (!track.lyrics || !track.lyrics.length) {
                this.lyricsContainer.innerHTML = `<div style="color:var(--lune-text-muted);font-size:14px;padding:40px;">No synchronized lyrics available for this track.</div>`;
                return;
            }

            track.lyrics.forEach((line, index) => {
                const el = document.createElement('div');
                el.className = 'lune-lyric-line';
                el.dataset.time = line.time;
                el.textContent = line.text;
                el.addEventListener('click', () => {
                    this.audio.currentTime = line.time;
                    this.audio.play();
                });
                this.lyricsContainer.appendChild(el);
            });
        }

        highlightActiveLyric(currentTime) {
            const lines = document.querySelectorAll('.lune-lyric-line');
            if (!lines.length) return;

            let activeLine = null;
            lines.forEach((line) => {
                const lineTime = Number(line.dataset.time);
                if (currentTime >= lineTime) {
                    activeLine = line;
                }
            });

            lines.forEach((l) => l.classList.remove('active'));
            if (activeLine) {
                activeLine.classList.add('active');
                activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        renderEqBands() {
            const bandsWrap = document.getElementById('luneBandsWrap');
            if (!bandsWrap || bandsWrap.children.length) return;

            FREQUENCIES.forEach((freq, i) => {
                const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
                const col = document.createElement('div');
                col.className = 'lune-band-col';
                col.innerHTML = `
                    <span class="lune-band-val" id="luneBandVal_${i}">0dB</span>
                    <input type="range" class="lune-band-slider" min="-12" max="12" step="1" value="0" data-index="${i}">
                    <span class="lune-band-freq">${label}Hz</span>
                `;

                const slider = col.querySelector('.lune-band-slider');
                const valEl = col.querySelector('.lune-band-val');
                slider.addEventListener('input', (e) => {
                    const gain = Number(e.target.value);
                    valEl.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
                    if (this.eqNodes[i]) {
                        this.eqNodes[i].gain.value = gain;
                    }
                });

                bandsWrap.appendChild(col);
            });

            // Preset listeners
            document.querySelectorAll('.lune-eq-preset-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.lune-eq-preset-btn').forEach((b) => b.classList.remove('active'));
                    btn.classList.add('active');
                    const presetName = btn.dataset.preset;
                    const values = LUNE_PRESETS[presetName] || LUNE_PRESETS.flat;

                    values.forEach((gain, i) => {
                        const slider = document.querySelector(`.lune-band-slider[data-index="${i}"]`);
                        const valEl = document.getElementById(`luneBandVal_${i}`);
                        if (slider) slider.value = gain;
                        if (valEl) valEl.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
                        if (this.eqNodes[i]) this.eqNodes[i].gain.value = gain;
                    });
                });
            });
        }
    }

    // Initialize on DOM load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.lunePlayer = new LunePlayer();
        });
    } else {
        window.lunePlayer = new LunePlayer();
    }
})();
