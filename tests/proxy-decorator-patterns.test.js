/**
 * Integration tests for the HTTP proxy chain and log decorator.
 *
 * Proxy chain: BaseHttpClient → AuthProxy → LoggingProxy → RateLimitProxy
 * Strategies tested: oauth (Bearer), apiKey (X-API-Key), jwt (Bearer JWT)
 * Decorator: createLogDecorator — DEBUG / INFO / ERROR levels, sync & async
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { BaseHttpClient } from '../src/http/base-client.js';
import { AuthProxy } from '../src/http/proxies/auth-proxy.js';
import { LoggingProxy } from '../src/http/proxies/logging-proxy.js';
import { RateLimitProxy } from '../src/http/proxies/rate-limit-proxy.js';
import { GitHubService } from '../src/services/github-service.js';
import { createLogDecorator } from '../src/utils/log-decorator.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function okJson(data) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url: '',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

function unauthorized() {
  return {
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    url: '',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({ error: 'unauthorized' }),
    text: async () => JSON.stringify({ error: 'unauthorized' })
  };
}

// ─── AuthProxy ──────────────────────────────────────────────────────────────


test('AuthProxy retries with refreshed token after 401', async () => {
  const calls = [];
  let attempts = 0;
  const base = new BaseHttpClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      attempts += 1;
      return attempts === 1 ? unauthorized() : okJson({ login: 'octocat' });
    }
  });

  const auth = new AuthProxy(base, {
    strategy: 'oauth',
    credentials: { accessToken: 'initial-token' },
    refreshCredentials: async () => ({ accessToken: 'fresh-token' })
  });

  const logs = [];
  const logging = new LoggingProxy(auth, {
    sink: (entry) => logs.push(entry),
    formatter: (entry) => entry
  });
  const limited = new RateLimitProxy(logging, { requestsPerInterval: 120, intervalMs: 60000 });
  const github = new GitHubService(limited);

  const user = await github.getUser('octocat');

  assert.equal(user.login, 'octocat');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer initial-token');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fresh-token');
  assert.ok(logs.some((e) => e.event === 'request'));
  assert.ok(logs.some((e) => e.event === 'response'));
});

test('AuthProxy sets X-API-Key header for apiKey strategy', async () => {
  const calls = [];
  const base = new BaseHttpClient({
    fetchImpl: async (url, options) => { calls.push(options); return okJson({ ok: true }); }
  });
  const auth = new AuthProxy(base, {
    strategy: 'apiKey',
    credentials: { key: 'my-api-key' }
  });

  await auth.request({ url: 'https://example.com/api', method: 'GET' });

  assert.equal(calls[0].headers['X-API-Key'], 'my-api-key');
  assert.equal(calls[0].headers.Authorization, undefined);
});

test('AuthProxy sets Bearer JWT header for jwt strategy', async () => {
  const calls = [];
  const base = new BaseHttpClient({
    fetchImpl: async (url, options) => { calls.push(options); return okJson({ ok: true }); }
  });
  const auth = new AuthProxy(base, {
    strategy: 'jwt',
    credentials: { jwt: 'my.jwt.token' }
  });

  await auth.request({ url: 'https://example.com/api', method: 'GET' });

  assert.equal(calls[0].headers.Authorization, 'Bearer my.jwt.token');
});

test('AuthProxy resolves credentials from function on each request', async () => {
  const calls = [];
  let counter = 0;
  const base = new BaseHttpClient({
    fetchImpl: async (url, options) => { calls.push(options); return okJson({ ok: true }); }
  });
  const auth = new AuthProxy(base, {
    strategy: 'oauth',
    credentials: () => ({ accessToken: `token-${(counter += 1)}` })
  });

  await auth.request({ url: 'https://example.com/a' });
  await auth.request({ url: 'https://example.com/b' });

  assert.equal(calls[0].headers.Authorization, 'Bearer token-1');
  assert.equal(calls[1].headers.Authorization, 'Bearer token-2');
  assert.equal(counter, 2);
});

test('AuthProxy without refreshCredentials returns 401 response as-is', async () => {
  const base = new BaseHttpClient({ fetchImpl: async () => unauthorized() });
  const auth = new AuthProxy(base, {
    strategy: 'oauth',
    credentials: { accessToken: 'token' }
  });

  const response = await auth.request({ url: 'https://example.com/api' });

  assert.equal(response.status, 401);
});

// ─── RateLimitProxy ─────────────────────────────────────────────────────────

test('RateLimitProxy enforces minimum spacing between requests', async () => {
  const base = new BaseHttpClient({ fetchImpl: async () => okJson({ ok: true }) });
  const limited = new RateLimitProxy(base, { requestsPerInterval: 1, intervalMs: 100 });

  await limited.request({ url: 'https://example.com/1' });
  const t1 = Date.now();
  await limited.request({ url: 'https://example.com/2' });
  const t2 = Date.now();

  assert.ok(t2 - t1 >= 60, `expected >= 60ms spacing, got ${t2 - t1}ms`);
});

test('LoggingProxy logs failure event on network error', async () => {
  const base = new BaseHttpClient({
    fetchImpl: async () => { throw new Error('network error'); }
  });
  const logs = [];
  const logging = new LoggingProxy(base, {
    sink: (entry) => logs.push(entry),
    formatter: (entry) => entry
  });

  await assert.rejects(() => logging.request({ url: 'https://example.com' }), /network error/);

  const failure = logs.find((e) => e.event === 'failure');
  assert.ok(failure, 'failure event should be logged');
  assert.equal(failure.level, 'ERROR');
  assert.ok(failure.error.message.includes('network error'));
});

// ─── createLogDecorator ──────────────────────────────────────────────────────


test('createLogDecorator at ERROR level does not log successful sync call', () => {
  const entries = [];
  const log = createLogDecorator({
    level: 'ERROR',
    sink: (formatted, entry) => entries.push(entry),
    formatter: (entry) => JSON.stringify(entry)
  });

  const fn = log((x) => x * 2, { label: 'double' });
  assert.equal(fn(3), 6);
  assert.equal(entries.length, 0);
});

test('createLogDecorator logs sync throw at ERROR level', () => {
  const entries = [];
  const log = createLogDecorator({
    level: 'ERROR',
    sink: (formatted, entry) => entries.push(entry),
    formatter: (entry) => JSON.stringify(entry)
  });

  const fn = log(() => { throw new Error('boom'); }, { label: 'explosive' });
  assert.throws(() => fn(), /boom/);

  const errorEntry = entries.find((e) => e.level === 'ERROR');
  assert.ok(errorEntry);
  assert.equal(errorEntry.error.message, 'boom');
});

test('createLogDecorator logs async function result at INFO level', async () => {
  const entries = [];
  const log = createLogDecorator({
    level: 'INFO',
    sink: (formatted, entry) => entries.push(entry),
    formatter: (entry) => JSON.stringify(entry)
  });

  const fn = log(async (x) => { await sleep(5); return x * 3; }, { label: 'triple' });
  const result = await fn(4);

  assert.equal(result, 12);
  const returnEntry = entries.find((e) => e.event === 'return');
  assert.ok(returnEntry, 'should log return event for async function');
  assert.equal(returnEntry.level, 'INFO');
  assert.equal(returnEntry.label, 'triple');
  assert.ok(typeof returnEntry.durationMs === 'number');
});

test('createLogDecorator logs async error at ERROR level', async () => {
  const entries = [];
  const log = createLogDecorator({
    level: 'INFO',
    sink: (formatted, entry) => entries.push(entry),
    formatter: (entry) => JSON.stringify(entry)
  });

  const fn = log(async () => { throw new Error('async boom'); }, { label: 'async-fail' });
  await assert.rejects(() => fn(), /async boom/);

  const errorEntry = entries.find((e) => e.event === 'error');
  assert.ok(errorEntry);
  assert.equal(errorEntry.level, 'ERROR');
  assert.equal(errorEntry.error.message, 'async boom');
});

test('createLogDecorator at DEBUG level logs call event', () => {
  const entries = [];
  const log = createLogDecorator({
    level: 'DEBUG',
    sink: (formatted, entry) => entries.push(entry),
    formatter: (entry) => JSON.stringify(entry)
  });

  const fn = log((x) => x + 1, { label: 'increment' });
  fn(5);

  const callEntry = entries.find((e) => e.event === 'call');
  assert.ok(callEntry, 'should log call event at DEBUG level');
  assert.equal(callEntry.level, 'DEBUG');
  assert.equal(callEntry.label, 'increment');
});

test('createLogDecorator per-function ERROR level suppresses success events', () => {
  const entries = [];
  const log = createLogDecorator({
    level: 'DEBUG',
    sink: (formatted, entry) => entries.push(entry),
    formatter: (entry) => JSON.stringify(entry)
  });

  const fn = log((x) => x, { label: 'strict', level: 'ERROR' });
  fn(42);

  const strictEntries = entries.filter((e) => e.label === 'strict');
  assert.equal(strictEntries.length, 0, 'no events logged for ERROR-only function on success');
});
