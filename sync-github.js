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

// Extract GITHUB_TOKEN reliably from env, .env, git config, or git token file
let GITHUB_TOKEN = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
if (!GITHUB_TOKEN) {
    if (process.env.GITHUB_REPO && process.env.GITHUB_REPO.startsWith('ghp_')) {
        GITHUB_TOKEN = process.env.GITHUB_REPO.trim();
    } else if (process.env.GITHUB_BRANCH && process.env.GITHUB_BRANCH.startsWith('ghp_')) {
        GITHUB_TOKEN = process.env.GITHUB_BRANCH.trim();
    }
}

// Fallback: extract token from current git remote origin if already configured
if (!GITHUB_TOKEN) {
    try {
        const currentOrigin = execSync('git remote get-url origin', { cwd: __dirname, encoding: 'utf8', stdio: 'pipe' }).trim();
        const match = currentOrigin.match(/https:\/\/([^:@]+)@github\.com/);
        if (match && match[1] && match[1].startsWith('ghp_')) {
            GITHUB_TOKEN = match[1];
        }
    } catch {}
}

// Fallback: extract token from git config or untracked .git/github_token
if (!GITHUB_TOKEN) {
    try {
        const cfgToken = execSync('git config --local --get milkbox.token', { cwd: __dirname, encoding: 'utf8', stdio: 'pipe' }).trim();
        if (cfgToken && cfgToken.startsWith('ghp_')) {
            GITHUB_TOKEN = cfgToken;
        }
    } catch {}
}

if (!GITHUB_TOKEN) {
    try {
        const tokenFilePath = path.join(__dirname, '.git', 'github_token');
        if (fs.existsSync(tokenFilePath)) {
            const fileToken = fs.readFileSync(tokenFilePath, 'utf8').trim();
            if (fileToken && fileToken.startsWith('ghp_')) {
                GITHUB_TOKEN = fileToken;
            }
        }
    } catch {}
}

// Persist to .env and git config so future restarts have it immediately without ever being tracked in git
if (GITHUB_TOKEN) {
    try {
        const envPath = path.join(__dirname, '.env');
        if (!fs.existsSync(envPath) || !fs.readFileSync(envPath, 'utf8').includes('GITHUB_TOKEN=')) {
            fs.writeFileSync(envPath, `GITHUB_TOKEN=${GITHUB_TOKEN}\nGITHUB_REPO=https://github.com/IordBeerus/MILKBOX.git\nGITHUB_BRANCH=main\n`);
        }
        execSync(`git config --local milkbox.token "${GITHUB_TOKEN}"`, { cwd: __dirname, stdio: 'pipe' });
    } catch {}
}

let GITHUB_REPO = (process.env.GITHUB_REPO || '').trim();
if (!GITHUB_REPO.includes('github.com') || GITHUB_REPO.startsWith('ghp_')) {
    GITHUB_REPO = 'https://github.com/IordBeerus/MILKBOX.git';
}

let GITHUB_BRANCH = (process.env.GITHUB_BRANCH || '').trim();
if (!GITHUB_BRANCH || GITHUB_BRANCH.startsWith('ghp_')) {
    GITHUB_BRANCH = 'main';
}

function run(cmd, options = {}) {
    return execSync(cmd, { cwd: __dirname, encoding: 'utf8', stdio: 'pipe', ...options });
}

let lastSyncStatus = {
    lastAttempt: null,
    lastSuccess: null,
    success: false,
    message: 'Pending first sync',
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH
};

function getSyncStatus() {
    return { ...lastSyncStatus };
}

function syncToGitHub(customMessage) {
    const timestamp = new Date().toISOString();
    lastSyncStatus.lastAttempt = timestamp;

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
        if (!GITHUB_TOKEN) {
            try {
                const currentOrigin = run('git remote get-url origin').trim();
                const match = currentOrigin.match(/https:\/\/([^:@]+)@github\.com/);
                if (match && match[1]) {
                    GITHUB_TOKEN = match[1];
                }
            } catch {}
        }
        if (!GITHUB_TOKEN) {
            try {
                const cfgToken = run('git config --local --get milkbox.token').trim();
                if (cfgToken && cfgToken.startsWith('ghp_')) GITHUB_TOKEN = cfgToken;
            } catch {}
        }
        if (GITHUB_TOKEN && authUrl.startsWith('https://') && !authUrl.includes('@')) {
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

module.exports = { syncToGitHub, getSyncStatus };
