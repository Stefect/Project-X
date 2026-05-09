import { BaseHttpClient } from '../http/base-client.js';
import { AuthProxy } from '../http/proxies/auth-proxy.js';
import { RateLimitProxy } from '../http/proxies/rate-limit-proxy.js';
import { GitHubService } from '../services/github-service.js';
import config from '../config.js';

const REPO_OWNER = 'Stefect';
const REPO_NAME = 'browserx';

function buildGitHubService() {
  const base = config.GITHUB_TOKEN
    ? new AuthProxy(new BaseHttpClient(), {
        strategy: 'oauth',
        credentials: { accessToken: config.GITHUB_TOKEN }
      })
    : new BaseHttpClient();

  return new GitHubService(
    new RateLimitProxy(base, { requestsPerInterval: 10, intervalMs: 60000 })
  );
}

function parseVersion(tag) {
  return String(tag || '').replace(/^v/, '').trim();
}

function isNewer(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

async function checkForUpdate() {
  const github = buildGitHubService();
  const release = await github.getLatestRelease(REPO_OWNER, REPO_NAME);

  const remoteVersion = parseVersion(release.tag_name);
  const localVersion = parseVersion(config.APP_VERSION);
  const updateAvailable = isNewer(remoteVersion, localVersion);

  return {
    updateAvailable,
    currentVersion: localVersion,
    latestVersion: remoteVersion,
    releaseUrl: release.html_url,
    releaseName: release.name || release.tag_name
  };
}

export { checkForUpdate };
