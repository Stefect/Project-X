import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABORT_MESSAGE,
  asyncMap,
  asyncMapCallback,
  asyncFilterMap,
  asyncFind,
  createAsyncController,
} from '../src/utils/async-array.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


test('asyncMap transforms all elements', async () => {
  const result = await asyncMap([1, 2, 3], async (x) => x * 2);
  assert.deepEqual(result, [2, 4, 6]);
});

test('asyncMap preserves element order with concurrency', async () => {
  const result = await asyncMap([3, 1, 2], async (x) => {
    await sleep(x * 5);
    return x;
  }, { concurrency: 3 });
  assert.deepEqual(result, [3, 1, 2]);
});

test('asyncMap respects concurrency limit', async () => {
  const running = [];
  let maxConcurrent = 0;

  await asyncMap([1, 2, 3, 4, 5], async (x) => {
    running.push(x);
    maxConcurrent = Math.max(maxConcurrent, running.length);
    await sleep(10);
    running.pop();
    return x;
  }, { concurrency: 2 });

  assert.ok(maxConcurrent <= 2, `exceeded concurrency: ${maxConcurrent}`);
});

test('asyncMap throws TypeError for non-array input', async () => {
  await assert.rejects(() => asyncMap('not-array', async (x) => x), TypeError);
});

test('asyncMap throws TypeError for non-function mapper', async () => {
  await assert.rejects(() => asyncMap([1], 'not-fn'), TypeError);
});


test('asyncMapCallback calls back with mapped results', async () => {
  const result = await new Promise((resolve, reject) => {
    asyncMapCallback(
      [1, 2, 3],
      (x, _i, _arr, cb) => cb(null, x * 10),
      (err, res) => (err ? reject(err) : resolve(res)),
    );
  });
  assert.deepEqual(result, [10, 20, 30]);
});

test('asyncMapCallback passes error to final callback', async () => {
  const err = await new Promise((resolve) => {
    asyncMapCallback(
      [1],
      (_x, _i, _arr, cb) => cb(new Error('boom')),
      (e) => resolve(e),
    );
  });
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'boom');
});


test('asyncFilterMap includes non-skipped values', async () => {
  const result = await asyncFilterMap([1, 2, 3, 4], async (x) =>
    x % 2 === 0 ? x * 10 : asyncFilterMap.skip,
  );
  assert.deepEqual(result, [20, 40]);
});

test('asyncFilterMap skips items returning { skip: true }', async () => {
  const result = await asyncFilterMap([1, 2, 3], async (x) =>
    x === 2 ? { skip: true } : x,
  );
  assert.deepEqual(result, [1, 3]);
});



test('asyncFind returns first matching element', async () => {
  const result = await asyncFind([1, 2, 3, 4], async (x) => x > 2);
  assert.equal(result, 3);
});

test('asyncFind returns undefined when no match', async () => {
  const result = await asyncFind([1, 2, 3], async (x) => x > 10);
  assert.equal(result, undefined);
});

test('asyncFind stops at first match (sequential)', async () => {
  let checks = 0;
  await asyncFind([1, 2, 3, 4, 5], async (x) => {
    checks += 1;
    return x === 2;
  });
  assert.equal(checks, 2);
});

test('asyncFind works with async predicate', async () => {
  const result = await asyncFind(['a', 'bb', 'ccc'], async (s) => {
    await sleep(1);
    return s.length === 2;
  });
  assert.equal(result, 'bb');
});


test('asyncMap aborts when signal is cancelled', async () => {
  const ctrl = createAsyncController();

  const promise = asyncMap([1, 2, 3, 4, 5], async (x) => {
    await sleep(20);
    return x;
  }, { concurrency: 1, signal: ctrl.signal });

  setTimeout(() => ctrl.cancel(), 30);

  await assert.rejects(promise, (err) => err.name === 'AbortError');
});

test('createAsyncController auto-aborts after timeout', async () => {
  const ctrl = createAsyncController(30);

  const promise = asyncMap([1, 2, 3], async (x) => {
    await sleep(50);
    return x;
  }, { concurrency: 1, signal: ctrl.signal });

  await assert.rejects(promise, (err) => err.name === 'AbortError');
});

test('cancelled controller marks signal as aborted', () => {
  const ctrl = createAsyncController();
  assert.equal(ctrl.aborted, false);
  ctrl.cancel();
  assert.equal(ctrl.aborted, true);
});

// перевіряли що concurrency=1 справді не запускає елементи паралельно —
// підозра була що Promise.all може все одно ігнорувати ліміт при малих масивах
test('asyncMap with concurrency=1 runs strictly sequentially', async () => {
  const log = [];
  await asyncMap([30, 5, 15], async (x) => {
    log.push(`start:${x}`);
    await sleep(x);
    log.push(`end:${x}`);
  }, { concurrency: 1 });
  assert.equal(log[0], 'start:30');
  assert.equal(log[1], 'end:30');
  assert.equal(log[2], 'start:5');
});
