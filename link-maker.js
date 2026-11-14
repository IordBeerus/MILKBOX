(function () {
    'use strict';

    const HISTORY_STORAGE_KEY = 'milkbox_link_maker_history_v1';
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
        const select = getEl('linkMakerProviderSelect');
        const id = select ? select.value : 'cloudflare';
        const providers = (statusData && Array.isArray(statusData.providers)) ? statusData.providers : [];
        return providers.find((p) => p.id === id) || providers[0] || null;
    }

    function updateDynamicFields() {
        const provider = getSelectedProvider();
        if (!provider) return;

        const fileFields = getEl('linkMakerFileFields');
        const ipFields = getEl('linkMakerIpFields');
        const envNameGroup = getEl('linkMakerEnvNameGroup');
        const formatSelect = getEl('linkMakerFormatSelect');
        const amountInput = getEl('linkMakerAmountInput');
        const providerHint = getEl('linkMakerProviderHint');
        const ipInput = getEl('linkMakerIpInput');

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
        const quotaBadge = getEl('linkMakerUserQuotaVal');
        const tierBadge = getEl('linkMakerTierQuotaVal');
        const cooldownNote = getEl('linkMakerCooldownNote');
        const submitBtn = getEl('linkMakerGenerateBtn');
        const configNotice = getEl('linkMakerConfigNotice');
        const targetOriginEl = getEl('linkMakerTargetOrigin');

        if (!statusData) return;

        if (targetOriginEl && statusData.siteInfo && statusData.siteInfo.origin) {
            targetOriginEl.textContent = statusData.siteInfo.origin;
        }

        if (configNotice) {
            if (!statusData.configured) {
                configNotice.style.display = '';
                configNotice.textContent = 'Link Maker is currently unavailable on this server.';
            } else {
                configNotice.style.display = 'none';
            }
        }

        const limits = statusData.limits || {};
        const globalUsage = statusData.globalUsage || {};
        const tier = statusData.tier || { name: 'AllOne MAX', perMinute: 50, perDay: 5000, linksPerGeneration: 100 };

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
                    loadLinkMakerStatus();
                }
            }, 1000);
        }
    }

    function renderResultsList(urls, jobMeta) {
        const resultsWrap = getEl('linkMakerResultsWrap');
        const resultsList = getEl('linkMakerResultsList');
        const statusBanner = getEl('linkMakerJobStatus');
        const copyAllBtn = getEl('linkMakerCopyAllBtn');

        if (statusBanner && jobMeta) {
            const stateLabel = String(jobMeta.status || 'queued').toUpperCase();
            const countText = jobMeta.requested ? ` (${jobMeta.completed || 0}/${jobMeta.requested})` : '';
            statusBanner.style.display = '';
            statusBanner.className = `link-maker-job-status is-${escapeHtml(String(jobMeta.status || 'queued').toLowerCase())}`;
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
            ? cleanUrls.map((url) => ({ url, provider: (jobMeta && jobMeta.provider) || 'link', fresh: true }))
            : savedUrls.map((item) => ({ url: item.url, provider: item.provider || 'saved', fresh: false }));

        resultsList.innerHTML = itemsToRender.map((item) => {
            const safeUrl = escapeHtml(item.url);
            const safeProvider = escapeHtml(item.provider);
            const tag = item.fresh ? 'NEW' : 'SAVED';
            return `
                <div class="link-maker-result-row">
                    <div class="link-maker-result-meta">
                        <span class="link-maker-result-badge">${safeProvider} · ${tag}</span>
                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-maker-result-url">${safeUrl}</a>
                    </div>
                    <div class="link-maker-result-actions">
                        <button type="button" class="link-maker-mini-btn link-maker-copy-one" data-url="${safeUrl}">Copy</button>
                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-maker-mini-btn primary">Open ↗</a>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function pollJob(jobId, attempt = 0) {
        if (!jobId || activeJobId !== jobId) return;
        if (attempt >= 35) {
            const statusBanner = getEl('linkMakerJobStatus');
            if (statusBanner) {
                statusBanner.style.display = '';
                statusBanner.textContent = `Job ${jobId} is still queued. Refresh shortly to check results.`;
            }
            return;
        }

        try {
            const res = await fetch(`/api/link-maker/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));

            if (res.status === 429) {
                const waitSec = Math.max(2, Number(data.retryAfterSeconds) || parseInt(res.headers.get('Retry-After') || '5', 10) || 5);
                const statusBanner = getEl('linkMakerJobStatus');
                if (statusBanner) {
                    statusBanner.style.display = '';
                    statusBanner.textContent = `Waiting ${waitSec}s before next status check…`;
                }
                activePollTimer = setTimeout(() => pollJob(jobId, attempt + 1), waitSec * 1000);
                return;
            }

            if (!res.ok) {
                const statusBanner = getEl('linkMakerJobStatus');
                if (statusBanner) {
                    statusBanner.style.display = '';
                    statusBanner.className = 'link-maker-job-status is-failed';
                    statusBanner.textContent = data.error || `Failed to check job (${res.status})`;
                }
                return;
            }

            const urls = (Array.isArray(data.results) ? data.results : []).map(normalizeResultUrl).filter(Boolean);
            if (urls.length) {
                saveGeneratedLinks(data.provider || 'link', urls);
            }
            renderResultsList(urls, data);

            const st = String(data.status || '').toLowerCase();
            if (st === 'complete' || st === 'completed' || st === 'failed' || st === 'error') {
                if (st === 'complete' || st === 'completed') {
                    showToast(`Created ${urls.length || data.completed || 1} MILKBOX link(s)!`);
                } else {
                    const failReason = (Array.isArray(data.failures) && data.failures[0])
                        ? (typeof data.failures[0] === 'string' ? data.failures[0] : (data.failures[0].error || data.failures[0].message || ''))
                        : '';
                    if (failReason) {
                        const statusBanner = getEl('linkMakerJobStatus');
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

    async function loadLinkMakerStatus() {
        const providerSelect = getEl('linkMakerProviderSelect');
        const configNotice = getEl('linkMakerConfigNotice');

        if (window.MILKBOX_GITHUB_PAGES) {
            if (configNotice) {
                configNotice.style.display = '';
                configNotice.textContent = 'Link Maker requires the live MILKBOX server (not available on static GitHub Pages).';
            }
            const submitBtn = getEl('linkMakerGenerateBtn');
            if (submitBtn) submitBtn.disabled = true;
            return;
        }

        try {
            const res = await fetch('/api/link-maker/status', { cache: 'no-store' });
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
                configNotice.textContent = `Could not reach Link Maker service: ${err.message}`;
            }
        }
    }

    async function handleGenerateSubmit(e) {
        e.preventDefault();
        if (isSubmitting) return;

        const provider = getSelectedProvider();
        if (!provider) return;

        const amountInput = getEl('linkMakerAmountInput');
        const formatSelect = getEl('linkMakerFormatSelect');
        const tabTitleInput = getEl('linkMakerTabTitleInput');
        const ipInput = getEl('linkMakerIpInput');
        const nameInput = getEl('linkMakerNameInput');
        const statusBanner = getEl('linkMakerJobStatus');
        const submitBtn = getEl('linkMakerGenerateBtn');

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
            submitBtn.textContent = 'Making Links…';
        }
        if (statusBanner) {
            statusBanner.style.display = '';
            statusBanner.className = 'link-maker-job-status is-queued';
            statusBanner.textContent = `Submitting ${provider.name} job…`;
        }

        try {
            const res = await fetch('/api/link-maker/generate', {
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
                    statusBanner.className = 'link-maker-job-status is-failed';
                    statusBanner.textContent = data.error || `Request failed (${res.status})`;
                }
                showToast(data.error || 'Could not create links');
                await loadLinkMakerStatus();
                return;
            }

            activeJobId = data.id;
            renderResultsList([], data);
            if (data.id) {
                activePollTimer = setTimeout(() => pollJob(data.id, 0), 900);
            }
            await loadLinkMakerStatus();
        } catch (err) {
            if (statusBanner) {
                statusBanner.style.display = '';
                statusBanner.className = 'link-maker-job-status is-failed';
                statusBanner.textContent = `Network error: ${err.message}`;
            }
        } finally {
            isSubmitting = false;
            if (submitBtn) {
                submitBtn.textContent = 'Make MILKBOX Links';
            }
            renderQuotaBar();
        }
    }

    function activateLinkMakerSettingsTab() {
        const settingsModal = getEl('settingsModal');
        if (settingsModal && !settingsModal.classList.contains('active')) {
            settingsModal.style.display = 'block';
            settingsModal.classList.add('active');
        }
        document.querySelectorAll('.settings-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-panel').forEach((p) => p.classList.remove('active'));
        document.querySelector('.settings-tab[data-settings-tab="linkmaker"]')?.classList.add('active');
        document.querySelector('.settings-tab-panel[data-settings-panel="linkmaker"]')?.classList.add('active');
        loadLinkMakerStatus();
    }

    function cleanupLinkMakerTimers() {
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

    function initLinkMakerUI() {
        getEl('settingsOpenLinkMakerBtn')?.addEventListener('click', activateLinkMakerSettingsTab);
        document.querySelector('.settings-tab[data-settings-tab="linkmaker"]')?.addEventListener('click', () => {
            activateLinkMakerSettingsTab();
        });
        getEl('settingsBtn')?.addEventListener('click', () => {
            if (!statusData) loadLinkMakerStatus();
        });
        getEl('closeSettings')?.addEventListener('click', cleanupLinkMakerTimers);
        getEl('settingsModal')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'settingsModal') cleanupLinkMakerTimers();
        });

        getEl('linkMakerProviderSelect')?.addEventListener('change', updateDynamicFields);
        getEl('linkMakerForm')?.addEventListener('submit', handleGenerateSubmit);

        document.querySelectorAll('.link-maker-title-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const input = getEl('linkMakerTabTitleInput');
                if (input && chip.dataset.title) {
                    input.value = chip.dataset.title;
                }
            });
        });

        getEl('linkMakerResultsList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.link-maker-copy-one');
            if (btn && btn.dataset.url) {
                copyText(btn.dataset.url, 'Copied link!');
            }
        });

        getEl('linkMakerCopyAllBtn')?.addEventListener('click', () => {
            const btn = getEl('linkMakerCopyAllBtn');
            if (!btn || !btn.dataset.urls) return;
            try {
                const urls = JSON.parse(btn.dataset.urls);
                if (Array.isArray(urls) && urls.length) {
                    copyText(urls.join('\n'), `Copied ${urls.length} links!`);
                }
            } catch (_) {}
        });

        getEl('linkMakerClearHistoryBtn')?.addEventListener('click', () => {
            try {
                localStorage.removeItem(HISTORY_STORAGE_KEY);
            } catch (_) {}
            renderResultsList([], null);
            showToast('Cleared saved links');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLinkMakerUI);
    } else {
        initLinkMakerUI();
    }

    window.MILKBOXLinkMaker = {
        open: activateLinkMakerSettingsTab,
        refresh: loadLinkMakerStatus
    };
})();
