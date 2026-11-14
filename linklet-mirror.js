(function () {
    'use strict';

    const HISTORY_STORAGE_KEY = 'milkbox_linklet_history_v1';
    const MAX_HISTORY_ITEMS = 25;

    let statusData = null;
    let activePollTimer = null;
    let activeCountdownTimer = null;
    let activeJobId = null;
    let isSubmitting = false;

    function getEl(id) {
        return document.getElementById(id);
    }

    function showToast(msg) {
        if (typeof window.toast === 'function') {
            window.toast(msg);
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeResultUrl(entry) {
        if (!entry) return '';
        if (typeof entry === 'string') return entry.trim();
        if (typeof entry === 'object') {
            return String(entry.url || entry.link || entry.href || '').trim();
        }
        return '';
    }

    function loadSavedLinks() {
        try {
            const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function saveGeneratedLinks(provider, urls) {
        if (!Array.isArray(urls) || !urls.length) return;
        const existing = loadSavedLinks();
        const existingUrlSet = new Set(existing.map((item) => item.url));
        const nowIso = new Date().toISOString();
        const additions = [];

        for (const url of urls) {
            if (!url || existingUrlSet.has(url)) continue;
            existingUrlSet.add(url);
            additions.push({ url, provider, createdAt: nowIso });
        }

        if (!additions.length) return;
        const merged = [...additions, ...existing].slice(0, MAX_HISTORY_ITEMS);
        try {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(merged));
        } catch (_) {}
    }

    function formatDuration(seconds) {
        const s = Math.max(0, Math.ceil(Number(seconds) || 0));
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const remS = s % 60;
        if (m < 60) return remS ? `${m}m ${remS}s` : `${m}m`;
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return remM ? `${h}h ${remM}m` : `${h}h`;
    }

    function stopPollTimer() {
        if (activePollTimer) {
            clearTimeout(activePollTimer);
            activePollTimer = null;
        }
    }

    function stopCountdownTimer() {
        if (activeCountdownTimer) {
            clearInterval(activeCountdownTimer);
            activeCountdownTimer = null;
        }
    }

    function getSelectedProvider() {
        const select = getEl('linkletProviderSelect');
        const id = select ? select.value : 'cloudflare';
        const providers = (statusData && Array.isArray(statusData.providers)) ? statusData.providers : [];
        return providers.find((p) => p.id === id) || providers[0] || null;
    }

    function updateDynamicFields() {
        const provider = getSelectedProvider();
        if (!provider) return;

        const fileFields = getEl('linkletFileFields');
        const ipFields = getEl('linkletIpFields');
        const envNameGroup = getEl('linkletEnvNameGroup');
        const formatSelect = getEl('linkletFormatSelect');
        const amountInput = getEl('linkletAmountInput');
        const providerHint = getEl('linkletProviderHint');
        const ipInput = getEl('linkletIpInput');

        const isIp = provider.kind === 'ip';
        if (fileFields) fileFields.style.display = isIp ? 'none' : '';
        if (ipFields) ipFields.style.display = isIp ? '' : 'none';
        if (envNameGroup) envNameGroup.style.display = provider.supportsOptionalName ? '' : 'none';

        if (formatSelect && !isIp) {
            const htmlOpt = formatSelect.querySelector('option[value="html"]');
            const svgOpt = formatSelect.querySelector('option[value="svg"]');
            if (htmlOpt) htmlOpt.disabled = !provider.formats.includes('html');
            if (svgOpt) svgOpt.disabled = !provider.formats.includes('svg');
            if (!provider.formats.includes(formatSelect.value)) {
                formatSelect.value = provider.defaultFormat;
            }
        }

        if (amountInput) {
            const maxAmt = Math.max(1, Number(provider.userMaxAmount || 1));
            amountInput.max = String(maxAmt);
            const current = parseInt(amountInput.value, 10) || 1;
            if (current > maxAmt) amountInput.value = String(maxAmt);
            if (current < 1) amountInput.value = '1';
        }

        if (ipInput && isIp && !ipInput.value && statusData && statusData.siteInfo && statusData.siteInfo.resolvedIp) {
            ipInput.value = statusData.siteInfo.resolvedIp;
        }

        if (providerHint) {
            const maxAmt = Math.max(1, Number(provider.userMaxAmount || 1));
            providerHint.textContent = `${provider.name} · Input: ${provider.input} · Max ${maxAmt} link${maxAmt === 1 ? '' : 's'} per batch`;
        }
    }

    function renderQuotaBar() {
        const quotaBadge = getEl('linkletUserQuotaVal');
        const tierBadge = getEl('linkletTierQuotaVal');
        const cooldownNote = getEl('linkletCooldownNote');
        const submitBtn = getEl('linkletGenerateBtn');
        const configNotice = getEl('linkletConfigNotice');
        const targetOriginEl = getEl('linkletTargetOrigin');

        if (!statusData) return;

        if (targetOriginEl && statusData.siteInfo && statusData.siteInfo.origin) {
            targetOriginEl.textContent = statusData.siteInfo.origin;
        }

        if (configNotice) {
            if (!statusData.configured) {
                configNotice.style.display = '';
                configNotice.textContent = 'Server notice: LINKLET_API_KEY is not configured in .env yet. Add your Linklet AllOne MAX key to .env to enable live generation.';
            } else {
                configNotice.style.display = 'none';
            }
        }

        const limits = statusData.limits || {};
        const globalUsage = statusData.globalUsage || {};
        const tier = statusData.tier || { name: 'Linklet AllOne MAX', perMinute: 50, perDay: 5000, linksPerGeneration: 100 };

        if (quotaBadge) {
            const rem = Number(limits.remainingRequests ?? 3);
            const maxReq = Number(limits.maxGenerationsPerWindow ?? 3);
            const maxLinks = Number(limits.maxLinksPerGeneration ?? 5);
            const remDay = Number(limits.remainingLinksToday ?? 15);
            quotaBadge.textContent = `${rem} / ${maxReq} generations left this ${limits.windowLabel || 'hour'} · max ${maxLinks}/batch · ${remDay} links left today`;
        }

        if (tierBadge) {
            const dayRem = Number(globalUsage.dayRemaining ?? tier.perDay);
            tierBadge.textContent = `${tier.name} (${tier.perMinute}/min · ${dayRem.toLocaleString()}/${tier.perDay.toLocaleString()} daily links left · ${tier.linksPerGeneration} MAX/gen)`;
        }

        stopCountdownTimer();

        const computeRetrySeconds = () => {
            if (globalUsage.upstreamCooldownSeconds > 0) return globalUsage.upstreamCooldownSeconds;
            if (limits.remainingRequests <= 0 && limits.resetAt) {
                return Math.max(0, Math.ceil((limits.resetAt - Date.now()) / 1000));
            }
            return 0;
        };

        const updateLockState = () => {
            const retrySec = computeRetrySeconds();
            const exhausted = (limits.remainingRequests <= 0) || (limits.remainingLinksToday <= 0) || retrySec > 0;
            if (cooldownNote) {
                if (retrySec > 0) {
                    cooldownNote.style.display = '';
                    cooldownNote.textContent = `Anti-spam limit active (${limits.limitText || '3 generations per hour'}). Next slot opens in ${formatDuration(retrySec)}.`;
                } else if (limits.remainingLinksToday <= 0) {
                    cooldownNote.style.display = '';
                    cooldownNote.textContent = `Daily per-user limit reached (${limits.maxLinksPerDay || 15} links per day).`;
                } else {
                    cooldownNote.style.display = 'none';
                }
            }
            if (submitBtn) {
                submitBtn.disabled = Boolean(isSubmitting || !statusData.configured || exhausted);
            }
            return retrySec;
        };

        const initialRetry = updateLockState();
        if (initialRetry > 0) {
            activeCountdownTimer = setInterval(() => {
                const left = updateLockState();
                if (left <= 0) {
                    stopCountdownTimer();
                    loadLinkletStatus();
                }
            }, 1000);
        }
    }

    function renderResultsList(urls, jobMeta) {
        const resultsWrap = getEl('linkletResultsWrap');
        const resultsList = getEl('linkletResultsList');
        const statusBanner = getEl('linkletJobStatus');
        const copyAllBtn = getEl('linkletCopyAllBtn');

        if (statusBanner && jobMeta) {
            const stateLabel = String(jobMeta.status || 'queued').toUpperCase();
            const countText = jobMeta.requested ? ` (${jobMeta.completed || 0}/${jobMeta.requested})` : '';
            statusBanner.style.display = '';
            statusBanner.className = `linklet-job-status is-${escapeHtml(String(jobMeta.status || 'queued').toLowerCase())}`;
            statusBanner.textContent = `Job ${jobMeta.id || ''} · ${jobMeta.provider || ''} · ${stateLabel}${countText}`;
        }

        if (!resultsWrap || !resultsList) return;

        const cleanUrls = (urls || []).map(normalizeResultUrl).filter(Boolean);
        const savedUrls = loadSavedLinks();

        if (!cleanUrls.length && !savedUrls.length) {
            resultsWrap.style.display = 'none';
            return;
        }

        resultsWrap.style.display = '';
        if (copyAllBtn) {
            copyAllBtn.style.display = cleanUrls.length > 1 ? '' : 'none';
            copyAllBtn.dataset.urls = JSON.stringify(cleanUrls);
        }

        const itemsToRender = cleanUrls.length
            ? cleanUrls.map((url) => ({ url, provider: (jobMeta && jobMeta.provider) || 'linklet', fresh: true }))
            : savedUrls.map((item) => ({ url: item.url, provider: item.provider || 'saved', fresh: false }));

        resultsList.innerHTML = itemsToRender.map((item) => {
            const safeUrl = escapeHtml(item.url);
            const safeProvider = escapeHtml(item.provider);
            const tag = item.fresh ? 'NEW' : 'SAVED';
            return `
                <div class="linklet-result-row">
                    <div class="linklet-result-meta">
                        <span class="linklet-result-badge">${safeProvider} · ${tag}</span>
                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="linklet-result-url">${safeUrl}</a>
                    </div>
                    <div class="linklet-result-actions">
                        <button type="button" class="linklet-mini-btn linklet-copy-one" data-url="${safeUrl}">Copy</button>
                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="linklet-mini-btn primary">Open ↗</a>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function pollJob(jobId, attempt = 0) {
        if (!jobId || activeJobId !== jobId) return;
        if (attempt >= 35) {
            const statusBanner = getEl('linkletJobStatus');
            if (statusBanner) {
                statusBanner.style.display = '';
                statusBanner.textContent = `Job ${jobId} is still queued at Linklet. Refresh shortly to check results.`;
            }
            return;
        }

        try {
            const res = await fetch(`/api/linklet/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));

            if (res.status === 429) {
                const waitSec = Math.max(2, Number(data.retryAfterSeconds) || parseInt(res.headers.get('Retry-After') || '5', 10) || 5);
                const statusBanner = getEl('linkletJobStatus');
                if (statusBanner) {
                    statusBanner.style.display = '';
                    statusBanner.textContent = `Waiting ${waitSec}s before next status check (Linklet rate limit)…`;
                }
                activePollTimer = setTimeout(() => pollJob(jobId, attempt + 1), waitSec * 1000);
                return;
            }

            if (!res.ok) {
                const statusBanner = getEl('linkletJobStatus');
                if (statusBanner) {
                    statusBanner.style.display = '';
                    statusBanner.className = 'linklet-job-status is-failed';
                    statusBanner.textContent = data.error || `Failed to check job (${res.status})`;
                }
                return;
            }

            const urls = (Array.isArray(data.results) ? data.results : []).map(normalizeResultUrl).filter(Boolean);
            if (urls.length) {
                saveGeneratedLinks(data.provider || 'linklet', urls);
            }
            renderResultsList(urls, data);

            const st = String(data.status || '').toLowerCase();
            if (st === 'complete' || st === 'completed' || st === 'failed' || st === 'error') {
                if (st === 'complete' || st === 'completed') {
                    showToast(`Generated ${urls.length || data.completed || 1} MILKBOX mirror link(s)!`);
                } else {
                    const failReason = (Array.isArray(data.failures) && data.failures[0])
                        ? (typeof data.failures[0] === 'string' ? data.failures[0] : (data.failures[0].error || data.failures[0].message || ''))
                        : '';
                    if (failReason) {
                        const statusBanner = getEl('linkletJobStatus');
                        if (statusBanner) statusBanner.textContent += ` — ${failReason}`;
                    }
                }
                return;
            }

            activePollTimer = setTimeout(() => pollJob(jobId, attempt + 1), 1800);
        } catch (err) {
            activePollTimer = setTimeout(() => pollJob(jobId, attempt + 1), 2500);
        }
    }

    async function loadLinkletStatus() {
        const providerSelect = getEl('linkletProviderSelect');
        const configNotice = getEl('linkletConfigNotice');

        if (window.MILKBOX_GITHUB_PAGES) {
            if (configNotice) {
                configNotice.style.display = '';
                configNotice.textContent = 'Site mirror generation requires the live MILKBOX Node server (not available on static GitHub Pages).';
            }
            const submitBtn = getEl('linkletGenerateBtn');
            if (submitBtn) submitBtn.disabled = true;
            return;
        }

        try {
            const res = await fetch('/api/linklet/status', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            statusData = await res.json();

            if (providerSelect && Array.isArray(statusData.providers)) {
                const prevVal = providerSelect.value;
                providerSelect.innerHTML = statusData.providers.map((p) => (
                    `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.input)} · max ${p.userMaxAmount})</option>`
                )).join('');
                if (prevVal && statusData.providers.some((p) => p.id === prevVal)) {
                    providerSelect.value = prevVal;
                }
            }

            updateDynamicFields();
            renderQuotaBar();
            renderResultsList([], null);
        } catch (err) {
            if (configNotice) {
                configNotice.style.display = '';
                configNotice.textContent = `Could not reach Linklet status endpoint: ${err.message}`;
            }
        }
    }

    async function handleGenerateSubmit(e) {
        e.preventDefault();
        if (isSubmitting) return;

        const provider = getSelectedProvider();
        if (!provider) return;

        const amountInput = getEl('linkletAmountInput');
        const formatSelect = getEl('linkletFormatSelect');
        const tabTitleInput = getEl('linkletTabTitleInput');
        const ipInput = getEl('linkletIpInput');
        const nameInput = getEl('linkletNameInput');
        const statusBanner = getEl('linkletJobStatus');
        const submitBtn = getEl('linkletGenerateBtn');

        const payload = {
            provider: provider.id,
            amount: parseInt(amountInput ? amountInput.value : '1', 10) || 1
        };

        if (provider.kind === 'ip') {
            if (ipInput && ipInput.value.trim()) payload.ip = ipInput.value.trim();
            if (provider.supportsOptionalName && nameInput && nameInput.value.trim()) {
                payload.name = nameInput.value.trim();
            }
        } else {
            payload.format = formatSelect ? formatSelect.value : provider.defaultFormat;
            if (tabTitleInput && tabTitleInput.value.trim()) {
                payload.tabTitle = tabTitleInput.value.trim();
            }
        }

        isSubmitting = true;
        stopPollTimer();
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Generating…';
        }
        if (statusBanner) {
            statusBanner.style.display = '';
            statusBanner.className = 'linklet-job-status is-queued';
            statusBanner.textContent = `Submitting ${provider.name} generation job…`;
        }

        try {
            const res = await fetch('/api/linklet/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));

            if (data.limits && statusData) {
                statusData.limits = data.limits;
                if (data.globalUsage) statusData.globalUsage = data.globalUsage;
                renderQuotaBar();
            }

            if (!res.ok) {
                if (statusBanner) {
                    statusBanner.style.display = '';
                    statusBanner.className = 'linklet-job-status is-failed';
                    statusBanner.textContent = data.error || `Request failed (${res.status})`;
                }
                showToast(data.error || 'Could not generate links');
                await loadLinkletStatus();
                return;
            }

            activeJobId = data.id;
            renderResultsList([], data);
            if (data.id) {
                activePollTimer = setTimeout(() => pollJob(data.id, 0), 900);
            }
            await loadLinkletStatus();
        } catch (err) {
            if (statusBanner) {
                statusBanner.style.display = '';
                statusBanner.className = 'linklet-job-status is-failed';
                statusBanner.textContent = `Network error: ${err.message}`;
            }
        } finally {
            isSubmitting = false;
            if (submitBtn) {
                submitBtn.textContent = 'Generate MILKBOX Links';
            }
            renderQuotaBar();
        }
    }

    function openLinkletModal() {
        const modal = getEl('linkletModal');
        if (!modal) return;
        modal.style.display = 'block';
        modal.classList.add('active');
        loadLinkletStatus();
    }

    function closeLinkletModal() {
        const modal = getEl('linkletModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
        stopPollTimer();
        stopCountdownTimer();
        activeJobId = null;
    }

    function copyText(text, successMsg) {
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => showToast(successMsg)).catch(() => {});
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                showToast(successMsg);
            } catch (_) {}
            ta.remove();
        }
    }

    function initLinkletUI() {
        getEl('linkletNavBtn')?.addEventListener('click', openLinkletModal);
        getEl('footerGenerateSite')?.addEventListener('click', (e) => {
            e.preventDefault();
            openLinkletModal();
        });
        getEl('settingsOpenLinkletBtn')?.addEventListener('click', () => {
            const settingsModal = getEl('settingsModal');
            if (settingsModal) {
                settingsModal.classList.remove('active');
                settingsModal.style.display = 'none';
            }
            openLinkletModal();
        });
        getEl('closeLinkletModal')?.addEventListener('click', closeLinkletModal);
        getEl('linkletModal')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'linkletModal') closeLinkletModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = getEl('linkletModal');
                if (modal && modal.classList.contains('active')) closeLinkletModal();
            }
        });

        getEl('linkletProviderSelect')?.addEventListener('change', updateDynamicFields);
        getEl('linkletForm')?.addEventListener('submit', handleGenerateSubmit);

        document.querySelectorAll('.linklet-title-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const input = getEl('linkletTabTitleInput');
                if (input && chip.dataset.title) {
                    input.value = chip.dataset.title;
                }
            });
        });

        getEl('linkletResultsList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.linklet-copy-one');
            if (btn && btn.dataset.url) {
                copyText(btn.dataset.url, 'Copied mirror link!');
            }
        });

        getEl('linkletCopyAllBtn')?.addEventListener('click', () => {
            const btn = getEl('linkletCopyAllBtn');
            if (!btn || !btn.dataset.urls) return;
            try {
                const urls = JSON.parse(btn.dataset.urls);
                if (Array.isArray(urls) && urls.length) {
                    copyText(urls.join('\n'), `Copied ${urls.length} mirror links!`);
                }
            } catch (_) {}
        });

        getEl('linkletClearHistoryBtn')?.addEventListener('click', () => {
            try {
                localStorage.removeItem(HISTORY_STORAGE_KEY);
            } catch (_) {}
            renderResultsList([], null);
            showToast('Cleared saved mirror links');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLinkletUI);
    } else {
        initLinkletUI();
    }

    window.MILKBOXLinklet = {
        open: openLinkletModal,
        close: closeLinkletModal,
        refresh: loadLinkletStatus
    };
})();
