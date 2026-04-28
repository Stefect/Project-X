import test from 'node:test';
import assert from 'node:assert/strict';

import memoize from '../src/utils/memoize.js';
import * as asyncArray from '../src/utils/async-array.js';
import scheduler from '../src/modules/ai-task-scheduler.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, timeoutMs = 500, stepMs = 10) {
  const stopAt = Date.now() + timeoutMs;

  while (Date.now() < stopAt) {
    if (predicate()) {
      return true;
    }
    await sleep(stepMs);
  }

  return false;
}

function resetScheduler(maxQueueSize = 100) {
  scheduler.clearQueue();
  scheduler.isProcessing = false;
  scheduler.maxQueueSize = maxQueueSize;
  scheduler.stats = {
    processed: 0,
    dropped: 0,
    errors: 0
  };
}

test('memoize reuses in-flight tab summary request', async () => {
  let requestCount = 0;

  const loadTabSummary = memoize(async (tabId) => {
    requestCount += 1;
    await sleep(30);
    return `summary:${tabId}`;
  }, { maxSize: 20 });

  const [a, b, c] = await Promise.all([
    loadTabSummary('tab-42'),
    loadTabSummary('tab-42'),
    loadTabSummary('tab-42')
  ]);

  assert.equal(a, 'summary:tab-42');
  assert.equal(b, 'summary:tab-42');
  assert.equal(c, 'summary:tab-42');
  assert.equal(requestCount, 1);
});

test('scheduler drops low-priority task when queue is full', async () => {
  resetScheduler(2);
  const executed = [];

  const createTask = (id) => ({
    execute: async () => {
      executed.push(id);
      await sleep(5);
    }
  });

  scheduler.addTask(createTask('background-sync'), 1);
  scheduler.addTask(createTask('active-tab-ai'), 10);
  scheduler.addTask(createTask('manual-user-search'), 9);

  const queueDrained = await waitUntil(() => !scheduler.isProcessing && scheduler.taskQueue.isEmpty(), 1000);
  assert.equal(queueDrained, true);
  assert.deepEqual(executed, ['active-tab-ai', 'manual-user-search']);
  assert.equal(scheduler.stats.dropped, 1);

  resetScheduler();
});

test('scheduler keeps insertion order for equal-priority tasks', async () => {
  resetScheduler(10);
  const executed = [];

  const createTask = (id) => ({
    execute: async () => {
      executed.push(id);
      await sleep(5);
    }
  });

  scheduler.addTask(createTask('tab-a'), 7);
  scheduler.addTask(createTask('tab-b'), 7);
  scheduler.addTask(createTask('tab-c'), 7);

  const queueDrained = await waitUntil(() => !scheduler.isProcessing && scheduler.taskQueue.isEmpty(), 1000);
  assert.equal(queueDrained, true);
  assert.deepEqual(executed, ['tab-a', 'tab-b', 'tab-c']);
  assert.equal(scheduler.stats.dropped, 0);

  resetScheduler();
});

test('asyncMap stops with AbortError when user leaves page', async () => {
  const controller = asyncArray.createAsyncController();
  const tabs = ['home', 'news', 'settings', 'profile'];

  const promise = asyncArray.asyncMap(
    tabs,
    async (tab) => {
      await sleep(35);
      return tab.toUpperCase();
    },
    { concurrency: 1, signal: controller.signal }
  );

  setTimeout(() => controller.cancel(), 50);

  await assert.rejects(
    promise,
    (error) => error && error.name === 'AbortError'
  );
});