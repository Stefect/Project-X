import assert from 'assert';

import { BaseHttpClient } from '../src/http/base-client.js';
import { AuthProxy } from '../src/http/proxies/auth-proxy.js';
import { LoggingProxy } from '../src/http/proxies/logging-proxy.js';
import { RateLimitProxy } from '../src/http/proxies/rate-limit-proxy.js';
import { GitHubService } from '../src/services/github-service.js';
import { createLogDecorator } from '../src/utils/log-decorator.js';

async function run() {
  const calls = [];
  let attempts = 0;

  const baseClient = new BaseHttpClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      attempts += 1;

      if (attempts === 1) {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          url,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ error: 'missing' }),
          text: async () => JSON.stringify({ error: 'missing' })
        };
      }

      if (!options.headers.Authorization && !options.headers['X-API-Key']) {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          url,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ error: 'missing' }),
          text: async () => JSON.stringify({ error: 'missing' })
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ login: 'octocat' }),
        text: async () => JSON.stringify({ login: 'octocat' })
      };
    }
  });

  const authProxy = new AuthProxy(baseClient, {
    strategy: 'oauth',
    credentials: { accessToken: 'initial-token' },
    refreshCredentials: async () => ({ accessToken: 'fresh-token' })
  });

  const loggedCalls = [];
  const loggingProxy = new LoggingProxy(authProxy, {
    sink: (entry) => loggedCalls.push(entry),
    formatter: (entry) => entry
  });

  const limitedProxy = new RateLimitProxy(loggingProxy, {
    requestsPerInterval: 120,
    intervalMs: 60000
  });

  const service = new GitHubService(limitedProxy);
  const user = await service.getUser('octocat');

  assert.strictEqual(user.login, 'octocat');
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer initial-token');
  assert.strictEqual(calls[1].options.headers.Authorization, 'Bearer fresh-token');
  assert.ok(loggedCalls.some((entry) => entry.event === 'request'));
  assert.ok(loggedCalls.some((entry) => entry.event === 'response'));

  const decoratedEntries = [];
  const log = createLogDecorator({
    level: 'ERROR',
    sink: (formatted, entry) => decoratedEntries.push({ formatted, entry }),
    formatter: (entry) => JSON.stringify(entry)
  });

  const syncFn = log((value) => value * 2, { label: 'double' });
  assert.strictEqual(syncFn(3), 6);
  assert.strictEqual(decoratedEntries.length, 0);

  const errorFn = log(() => {
    throw new Error('boom');
  }, { label: 'explosive' });

  assert.throws(() => errorFn(), /boom/);
  assert.ok(decoratedEntries.some((entry) => entry.entry.level === 'ERROR'));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});