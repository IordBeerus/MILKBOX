const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || match[1] in process.env) continue;
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
}

loadEnvFile();

const GITHUB_REPO = process.env.GITHUB_REPO || 'https://github.com/IordBeerus/MILKBOX.git';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

function run(cmd, options = {}) {
    return execSync(cmd, { cwd: __dirname, encoding: 'utf8', stdio: 'pipe', ...options });
}

function syncToGitHub(customMessage) {
    try {
        // Ensure git repo is initialized
        try {
            run('git rev-parse --is-inside-work-tree');
        } catch {
            console.log('[Git Sync] Initializing git repository...');
            run('git init');
            run(`git branch -M ${GITHUB_BRANCH}`);
        }

        // Configure git user if not set
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

        // Configure origin
        try {
            const currentOrigin = run('git remote get-url origin').trim();
            if (!currentOrigin) throw new Error('No origin');
        } catch {
            run(`git remote add origin ${GITHUB_REPO}`);
        }

        // Stage all files
        run('git add -A');

        // Check if there are changes to commit
        const status = run('git status --porcelain').trim();
        const commitMsg = customMessage || `Auto-update MILKBOX: ${new Date().toISOString()}`;
        if (status) {
            console.log('[Git Sync] Changes detected, creating commit...');
            run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
            console.log('[Git Sync] Committed successfully.');
        } else {
            console.log('[Git Sync] Working directory clean. Checking push state...');
        }

        // Prepare push URL with token if available
        let pushTarget = 'origin';
        if (GITHUB_TOKEN) {
            let authUrl = GITHUB_REPO;
            if (authUrl.startsWith('https://')) {
                authUrl = authUrl.replace('https://', `https://${GITHUB_TOKEN}@`);
            }
            pushTarget = authUrl;
        }

        console.log(`[Git Sync] Pushing to GitHub (${GITHUB_REPO}) on branch ${GITHUB_BRANCH}...`);
        const pushOutput = run(`git push ${pushTarget} ${GITHUB_BRANCH}`);
        console.log('[Git Sync] Successfully pushed to GitHub!');
        if (pushOutput) console.log(pushOutput);
        return { success: true, message: 'Successfully synced with GitHub' };
    } catch (err) {
        let errMsg = err.stderr || err.message || String(err);
        if (GITHUB_TOKEN) {
            errMsg = errMsg.split(GITHUB_TOKEN).join('***');
        }
        if (errMsg.includes('could not read Username') || errMsg.includes('Authentication failed') || errMsg.includes('Permission to')) {
            console.warn('[Git Sync] Notice: GitHub authentication required to push.');
            console.warn('[Git Sync] To enable automatic push, set GITHUB_TOKEN in your environment or .env file.');
            console.warn('[Git Sync] Example: GITHUB_TOKEN=ghp_yourPersonalAccessToken');
            return {
                success: false,
                requiresAuth: true,
                message: 'GitHub authentication required. Please set GITHUB_TOKEN in .env or environment to allow auto-pushing.'
            };
        }
        console.error('[Git Sync] Error syncing to GitHub:', errMsg);
        return { success: false, error: errMsg };
    }
}

if (require.main === module) {
    const customMessage = process.argv.slice(2).join(' ') || undefined;
    syncToGitHub(customMessage);
}

module.exports = { syncToGitHub };
