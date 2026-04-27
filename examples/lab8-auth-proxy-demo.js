const { BaseHttpClient } = require('../src/http/base-client');
const { AuthProxy } = require('../src/http/proxies/auth-proxy');
const { LoggingProxy } = require('../src/http/proxies/logging-proxy');
const { RateLimitProxy } = require('../src/http/proxies/rate-limit-proxy');
const { GitHubService } = require('../src/services/github-service');

function createMockFetch() {
  return async (url, options) => {
    const headers = options.headers || {};
    const authorized = headers.Authorization || headers['X-API-Key'];

    if (!authorized) {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        url,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ message: 'missing credentials' }),
        text: async () => JSON.stringify({ message: 'missing credentials' })
      };
    }

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      url,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ login: 'octocat', sourceAuth: authorized }),
      text: async () => JSON.stringify({ login: 'octocat', sourceAuth: authorized })
    };
  };
}

async function main() {
  const baseClient = new BaseHttpClient({ fetchImpl: createMockFetch() });
  const authClient = new AuthProxy(baseClient, {
    strategy: 'oauth',
    credentials: () => ({ accessToken: 'demo-token' }),
    refreshCredentials: async () => ({ accessToken: 'refreshed-token' })
  });
  const loggedClient = new LoggingProxy(authClient, {
    sink: (line) => console.log(line),
    formatter: (entry) => JSON.stringify({ ...entry, tag: 'lab8' })
  });
  const limitedClient = new RateLimitProxy(loggedClient, {
    requestsPerInterval: 30,
    intervalMs: 60000
  });

  const github = new GitHubService(limitedClient);
  const user = await github.getUser('octocat');

  console.log('GitHubService demo result:', user);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});