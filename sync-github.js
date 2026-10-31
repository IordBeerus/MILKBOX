const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    try {
        for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            const key = match[1];
            const val = match[2].replace(/^['"]|['"]$/g, '').trim();
            if (!process.env[key] || (process.env[key].startsWith('ghp_') && key !== 'GITHUB_TOKEN')) {
                process.env[key] = val;
            }
        }
    } catch {}
}

loadEnvFile();

let _cachedCreds = null;
let _lastCredsCheck = 0;

function resolveCredentials(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _cachedCreds && (now - _lastCredsCheck < 60000)) {
        return _cachedCreds;
    }
    _lastCredsCheck = now;
    loadEnvFile();

    let token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
    if (!token) {
        if (process.env.GITHUB_REPO && process.env.GITHUB_REPO.startsWith('ghp_')) {
            token = process.env.GITHUB_REPO.trim();
        } else if (process.env.GITHUB_BRANCH && process.env.GITHUB_BRANCH.startsWith('ghp_')) {
            token = process.env.GITHUB_BRANCH.trim();
        }
    }

    if (!token) {
        try {
            const currentOrigin = execSync('git remote get-url origin', { cwd: __dirname, encoding: 'utf8', stdio: 'pipe', timeout: 4000 }).trim();
            const match = currentOrigin.match(/https:\/\/([^:@]+)@github\.com/);
            if (match && match[1] && match[1].startsWith('ghp_')) {
                token = match[1];
            }
        } catch {}
    }

    if (!token) {
        try {
            const cfgToken = execSync('git config --local --get milkbox.token', { cwd: __dirname, encoding: 'utf8', stdio: 'pipe', timeout: 4000 }).trim();
            if (cfgToken && cfgToken.startsWith('ghp_')) {
                token = cfgToken;
            }
        } catch {}
    }

    if (!token) {
        try {
            const tokenFilePath = path.join(__dirname, '.git', 'github_token');
            if (fs.existsSync(tokenFilePath)) {
                const fileToken = fs.readFileSync(tokenFilePath, 'utf8').trim();
                if (fileToken && fileToken.startsWith('ghp_')) {
                    token = fileToken;
                }
            }
        } catch {}
    }

    if (token) {
        process.env.GITHUB_TOKEN = token;
        try {
            const envPath = path.join(__dirname, '.env');
            if (!fs.existsSync(envPath) || !fs.readFileSync(envPath, 'utf8').includes('GITHUB_TOKEN=')) {
                fs.writeFileSync(envPath, `GITHUB_TOKEN=${token}\nGITHUB_REPO=https://github.com/IordBeerus/MILKBOX.git\nGITHUB_BRANCH=main\n`);
            }
        } catch {}
        try {
            execSync(`git config --local milkbox.token "${token}"`, { cwd: __dirname, stdio: 'pipe', timeout: 4000 });
        } catch {}
        try {
            const tokenFilePath = path.join(__dirname, '.git', 'github_token');
            fs.writeFileSync(tokenFilePath, token.trim());
        } catch {}
    }

    let repo = (process.env.GITHUB_REPO || '').trim();
    if (!repo.includes('github.com') || repo.startsWith('ghp_')) {
        repo = 'https://github.com/IordBeerus/MILKBOX.git';
    }

    let branch = (process.env.GITHUB_BRANCH || '').trim();
    if (!branch || branch.startsWith('ghp_')) {
        branch = 'main';
    }

    _cachedCreds = { token, repo, branch };
    return _cachedCreds;
}

function saveToken(token) {
    if (!token || typeof token !== 'string') return false;
    const cleanToken = token.trim();
    if (!cleanToken.startsWith('ghp_')) return false;

    _cachedCreds = null;
    _lastCredsCheck = 0;
    process.env.GITHUB_TOKEN = cleanToken;
    try {
        const envPath = path.join(__dirname, '.env');
        fs.writeFileSync(envPath, `GITHUB_TOKEN=${cleanToken}\nGITHUB_REPO=https://github.com/IordBeerus/MILKBOX.git\nGITHUB_BRANCH=main\n`);
    } catch {}
    try {
        execSync(`git config --local milkbox.token "${cleanToken}"`, { cwd: __dirname, stdio: 'pipe', timeout: 4000 });
        fs.writeFileSync(path.join(__dirname, '.git', 'github_token'), cleanToken);
        execSync(`git remote set-url origin "https://${cleanToken}@github.com/IordBeerus/MILKBOX.git"`, { cwd: __dirname, stdio: 'pipe', timeout: 4000 });
    } catch {}
    return true;
}

function run(cmd, options = {}) {
    return execSync(cmd, {
        cwd: __dirname,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 25000,
        env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: '',
            ...options.env
        },
        ...options
    });
}

let lastSyncStatus = {
    lastAttempt: null,
    lastSuccess: null,
    success: false,
    message: 'Pending first sync',
    repo: 'https://github.com/IordBeerus/MILKBOX.git',
    branch: 'main'
};

function getSyncStatus() {
    const creds = resolveCredentials();
    return {
        ...lastSyncStatus,
        hasToken: Boolean(creds.token),
        repo: creds.repo,
        branch: creds.branch
    };
}

function syncToGitHub(customMessage) {
    const timestamp = new Date().toISOString();
    lastSyncStatus.lastAttempt = timestamp;

    const { token: GITHUB_TOKEN, repo: GITHUB_REPO, branch: GITHUB_BRANCH } = resolveCredentials();
    lastSyncStatus.repo = GITHUB_REPO;
    lastSyncStatus.branch = GITHUB_BRANCH;

    if (!GITHUB_TOKEN) {
        console.warn('[Git Sync] Notice: GitHub token is not configured.');
        lastSyncStatus.success = false;
        lastSyncStatus.message = 'GitHub authentication required (add personal access token in Settings).';
        return {
            success: false,
            requiresAuth: true,
            message: 'GitHub authentication required. Please add your personal access token in Settings.'
        };
    }

    try {
        // 1. Ensure git repo is initialized
        try {
            run('git rev-parse --is-inside-work-tree');
        } catch {
            console.log('[Git Sync] Initializing git repository...');
            run('git init');
        }

        // 2. Configure git user identity
        try {
            run('git config user.name');
        } catch {
            run('git config user.name "lordbeerus"');
        }
        try {
            run('git config user.email');
        } catch {
            run('git config user.email "lordbeeruswastaken@gmail.com"');
        }

        // Configure default branch name
        try {
            run(`git branch -M ${GITHUB_BRANCH}`);
        } catch {}

        // 3. Configure authenticated remote origin
        let authUrl = GITHUB_REPO;
        if (authUrl.startsWith('https://') && !authUrl.includes('@')) {
            authUrl = authUrl.replace('https://', `https://${GITHUB_TOKEN}@`);
        }

        try {
            run('git remote get-url origin');
            run(`git remote set-url origin "${authUrl}"`);
        } catch {
            run(`git remote add origin "${authUrl}"`);
        }

        // 4. Fetch remote history so local tree never diverges or gets rejected
        let remoteFetched = false;
        try {
            console.log(`[Git Sync] Fetching remote branch ${GITHUB_BRANCH}...`);
            run(`git fetch origin ${GITHUB_BRANCH} --depth=30`);
            remoteFetched = true;
        } catch (fetchErr) {
            console.warn('[Git Sync] Initial fetch notice (branch may be empty or newly created):', fetchErr.message);
        }

        // 5. Align HEAD with remote without discarding workspace edits
        if (remoteFetched) {
            try {
                const remoteRev = run(`git rev-parse origin/${GITHUB_BRANCH}`).trim();
                let localRev = null;
                try { localRev = run('git rev-parse HEAD').trim(); } catch {}

                if (remoteRev) {
                    if (!localRev) {
                        // First commit in empty repo: reset to remote
                        run(`git reset origin/${GITHUB_BRANCH}`);
                    } else if (localRev !== remoteRev) {
                        let isDescendant = false;
                        try {
                            run(`git merge-base --is-ancestor origin/${GITHUB_BRANCH} HEAD`);
                            isDescendant = true;
                        } catch {}

                        if (!isDescendant) {
                            console.log('[Git Sync] Re-basing working tree index on top of origin/' + GITHUB_BRANCH);
                            // Mixed reset: sets branch ref to remote commit without touching working tree files
                            run(`git reset origin/${GITHUB_BRANCH}`);
                        }
                    }
                }
            } catch (alignErr) {
                console.warn('[Git Sync] Tree alignment notice:', alignErr.message);
            }
        }

        // 6. Stage all current workspace files
        run('git add -A');

        // 7. Check if there are changes to commit
        const status = run('git status --porcelain').trim();
        const commitMsg = customMessage || `Auto-update MILKBOX: ${timestamp}`;
        let committed = false;

        if (status) {
            console.log('[Git Sync] Workspace changes detected, committing...');
            run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
            console.log('[Git Sync] Committed successfully.');
            committed = true;
        }

        // 8. Determine if local has commits to push
        let commitsAhead = 1;
        if (remoteFetched) {
            try {
                const aheadCount = run(`git rev-list --count origin/${GITHUB_BRANCH}..HEAD`).trim();
                commitsAhead = parseInt(aheadCount, 10) || 0;
            } catch {
                commitsAhead = 1;
            }
        }

        if (commitsAhead === 0 && !committed) {
            console.log('[Git Sync] GitHub is already completely up to date (no unpushed commits).');
            lastSyncStatus.lastSuccess = timestamp;
            lastSyncStatus.success = true;
            lastSyncStatus.message = 'GitHub repository is already up to date';
            return {
                success: true,
                upToDate: true,
                message: 'GitHub is up to date',
                timestamp
            };
        }

        // 9. Push to GitHub
        console.log(`[Git Sync] Pushing to GitHub (${GITHUB_REPO}) on branch ${GITHUB_BRANCH}...`);
        try {
            run(`git push origin ${GITHUB_BRANCH}`);
        } catch (pushErr) {
            console.warn('[Git Sync] Fast-forward push rejected, retrying with force push to ensure GitHub stays in sync...');
            run(`git push origin ${GITHUB_BRANCH} --force`);
        }

        console.log('[Git Sync] Successfully pushed all updates to GitHub!');
        lastSyncStatus.lastSuccess = timestamp;
        lastSyncStatus.success = true;
        lastSyncStatus.message = 'Successfully synced with GitHub';

        return {
            success: true,
            message: 'Successfully synced with GitHub',
            timestamp,
            committed
        };
    } catch (err) {
        let errMsg = err.stderr || err.message || String(err);
        if (GITHUB_TOKEN) {
            errMsg = errMsg.split(GITHUB_TOKEN).join('***');
        }

        if (errMsg.includes('could not read Username') || errMsg.includes('Authentication failed') || errMsg.includes('Permission to')) {
            console.warn('[Git Sync] Notice: GitHub authentication required to push.');
            lastSyncStatus.success = false;
            lastSyncStatus.message = 'GitHub authentication required (check GITHUB_TOKEN).';
            return {
                success: false,
                requiresAuth: true,
                message: 'GitHub authentication required. Please verify GITHUB_TOKEN has repo push permissions.'
            };
        }

        console.error('[Git Sync] Error syncing to GitHub:', errMsg);
        lastSyncStatus.success = false;
        lastSyncStatus.message = `Sync error: ${errMsg}`;
        return { success: false, error: errMsg };
    }
}

if (require.main === module) {
    const customMessage = process.argv.slice(2).join(' ') || undefined;
    syncToGitHub(customMessage);
}

module.exports = { syncToGitHub, getSyncStatus, saveToken };
