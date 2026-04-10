/**
 * DIRECTIVE LOADER — GitHub-Synced Behavioral Rules
 * 
 * On boot, pulls the node's behavioral directives from a GitHub repo.
 * Caches to local disk. Polls every 15 minutes for updates.
 * 
 * Directives are versioned. When a new version is detected, the node
 * does NOT auto-apply — it enqueues a DIRECTIVE_UPDATE_AVAILABLE event
 * to its orchestrator, who issues an explicit APPLY command when safe.
 * 
 * Addresses forensic findings F-07 (rate limits) and F-10 (versioning).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_DIR = path.join(__dirname, '..', '.directive-cache');
const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes

let currentVersion = null;

/**
 * Fetch a file from GitHub's raw content API.
 */
function fetchGitHubFile(repo, filePath, token) {
  return new Promise((resolve, reject) => {
    const url = `https://raw.githubusercontent.com/${repo}/main/${filePath}`;
    const headers = { 'User-Agent': 'anc-mcp-core' };
    if (token) headers['Authorization'] = `token ${token}`;

    https.get(url, { headers }, (res) => {
      if (res.statusCode === 404) {
        resolve(null); // File doesn't exist yet
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GitHub API ${res.statusCode} for ${filePath}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Load directives on boot. Attempts GitHub first, falls back to cache.
 */
async function loadDirectives() {
  const repo = process.env.GITHUB_REPO;
  const directivesPath = process.env.GITHUB_DIRECTIVES_PATH;
  const token = process.env.GITHUB_TOKEN;
  const nodeName = process.env.NODE_NAME || 'unknown';

  if (!repo || !directivesPath) {
    console.log('[DIRECTIVES] No GitHub config — running without directives');
    return null;
  }

  // Ensure cache dir exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cacheFile = path.join(CACHE_DIR, `${nodeName}.json`);

  try {
    // Try fetching from GitHub
    const content = await fetchGitHubFile(repo, `${directivesPath}/rules.json`, token);
    if (content) {
      const directives = JSON.parse(content);
      currentVersion = directives.version || '0.0.0';

      // Cache to disk
      fs.writeFileSync(cacheFile, content, 'utf8');
      console.log(`[DIRECTIVES] Loaded v${currentVersion} from GitHub (${directivesPath}/rules.json)`);
      return directives;
    }
  } catch (err) {
    console.warn(`[DIRECTIVES] GitHub fetch failed: ${err.message} — trying cache`);
  }

  // Fall back to cache
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    currentVersion = cached.version || '0.0.0';
    console.log(`[DIRECTIVES] Loaded v${currentVersion} from cache`);
    return cached;
  }

  console.warn('[DIRECTIVES] No directives found (GitHub or cache)');
  return null;
}

/**
 * Start the polling loop for directive updates.
 * Does NOT auto-apply — enqueues an event for the orchestrator.
 */
function startDirectivePolling(enqueueEvent) {
  return setInterval(async () => {
    try {
      const repo = process.env.GITHUB_REPO;
      const directivesPath = process.env.GITHUB_DIRECTIVES_PATH;
      const token = process.env.GITHUB_TOKEN;

      if (!repo || !directivesPath) return;

      const content = await fetchGitHubFile(repo, `${directivesPath}/rules.json`, token);
      if (!content) return;

      const remote = JSON.parse(content);
      const remoteVersion = remote.version || '0.0.0';

      if (remoteVersion !== currentVersion) {
        console.log(`[DIRECTIVES] New version detected: ${currentVersion} → ${remoteVersion}`);
        await enqueueEvent({
          domain: 'infrastructure',
          eventType: 'DIRECTIVE_UPDATE_AVAILABLE',
          payload: {
            nodeId: process.env.NODE_NAME,
            currentVersion,
            newVersion: remoteVersion,
          },
        });
      }
    } catch (err) {
      console.error(`[DIRECTIVES] Poll error: ${err.message}`);
    }
  }, POLL_INTERVAL);
}

module.exports = { loadDirectives, startDirectivePolling };
