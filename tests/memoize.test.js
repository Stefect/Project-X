import test from 'node:test';
import assert from 'node:assert/strict';
import memoize from '../src/utils/memoize.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


test('memoize caches synchronous results', () => {
  let calls = 0;
  const fn = memoize((x) => { calls += 1; return x * 2; });
  assert.equal(fn(3), 6);
  assert.equal(fn(3), 6);
  assert.equal(calls, 1);
});

test('memoize caches different args separately', () => {
  let calls = 0;
  const fn = memoize((x) => { calls += 1; return x * 2; });
  assert.equal(fn(2), 4);
  assert.equal(fn(3), 6);
  assert.equal(fn(2), 4);
  assert.equal(calls, 2);
});

test('memoize with maxSize=0 never caches', () => {
  let calls = 0;
  const fn = memoize((x) => { calls += 1; return x; }, { maxSize: 0 });
  fn(1); fn(1); fn(1);
  assert.equal(calls, 3);
});


test('LRU eviction removes least-recently-used entry', async () => {
  const fn = memoize((x) => x, { maxSize: 2, policy: 'lru' });
  fn('a');
  fn('b');
  // Невелика затримка гарантує, що кеш-хіт fn('a') встановить lastAccessAt > b.lastAccessAt
  await new Promise((r) => setTimeout(r, 2));
  fn('a'); // оновлення 'a' — 'b' тепер є LRU
  fn('c'); // викликає витіснення 'b'
  assert.equal(fn.has('b'), false);
  assert.equal(fn.has('a'), true);
  assert.equal(fn.has('c'), true);
});


test('LFU eviction removes least-frequently-used entry', () => {
  const fn = memoize((x) => x, { maxSize: 2, policy: 'lfu' });
  fn('a'); fn('a'); fn('a'); // 3 звернення
  fn('b');                   // 1 звернення — LFU
  fn('c');                   // викликає витіснення 'b'
  assert.equal(fn.has('b'), false);
  assert.equal(fn.has('a'), true);
});

test('TIME eviction removes oldest-by-creation entry', () => {
  const fn = memoize((x) => x, { maxSize: 2, policy: 'time' });
  fn('a');
  fn('b');
  fn('c'); // 'a' was created first — should be evicted
  assert.equal(fn.has('a'), false);
  assert.equal(fn.has('b'), true);
  assert.equal(fn.has('c'), true);
});


test('CUSTOM eviction policy calls customEvict to pick key', () => {
  const fn = memoize((x) => x, {
    maxSize: 2,
    policy: 'custom',
    customEvict: (cache) => cache.keys().next().value, // завжди витіснює найстаріший запис
  });
  fn('a');
  fn('b');
  fn('c'); // витісняє 'a' (перший доданий)
  assert.equal(fn.has('a'), false);
  assert.equal(fn.has('b'), true);
  assert.equal(fn.has('c'), true);
});


test('expired entries are removed on next call', async () => {
  const fn = memoize((x) => x, { ttl: 30 });
  fn('hello');
  assert.equal(fn.has('hello'), true);
  await sleep(50);
  fn('trigger'); // ініціює видалення прострочених записів
  assert.equal(fn.has('hello'), false);
});


test('async function result is cached (single underlying call)', async () => {
  let calls = 0;
  const fn = memoize(async (x) => { calls += 1; await sleep(5); return `${x}!`; });
  const [a, b] = await Promise.all([fn('hi'), fn('hi')]);
  assert.equal(a, 'hi!');
  assert.equal(b, 'hi!');
  assert.equal(calls, 1);
});

test('rejected promise removes entry so next call retries', async () => {
  let calls = 0;
  const fn = memoize(async () => { calls += 1; throw new Error('fail'); });
  await assert.rejects(() => fn('x'), /fail/);
  await assert.rejects(() => fn('x'), /fail/);
  assert.equal(calls, 2);
});

test('delete() removes a specific entry', () => {
  const fn = memoize((x) => x);
  fn(42);
  assert.equal(fn.has(42), true);
  fn.delete(42);
  assert.equal(fn.has(42), false);
});


test('stats() tracks hits, misses and size', () => {
  const fn = memoize((x) => x);
  fn('a'); fn('a'); fn('b');
  const s = fn.stats();
  assert.equal(s.hits, 1);
  assert.equal(s.misses, 2);
  assert.equal(s.size, 2);
});

test('stats() reports evictions after LRU overflow', () => {
  const fn = memoize((x) => x, { maxSize: 1, policy: 'lru' });
  fn('a');
  fn('b'); // витісняє 'a'
  assert.equal(fn.stats().evictions, 1);
});


test('custom keyResolver groups calls by derived key', () => {
  let calls = 0;
  const fn = memoize(
    (obj) => { calls += 1; return obj.id; },
    { keyResolver: (args) => String(args[0].id) },
  );
  fn({ id: 1, noise: 'a' });
  fn({ id: 1, noise: 'b' }); // той самий похідний ключ
  assert.equal(calls, 1);
});

test('memoize throws TypeError for non-function argument', () => {
  assert.throws(() => memoize(42), TypeError);
  assert.throws(() => memoize(null), TypeError);
});

// натрапили на це при інтеграції з AI handlers: undefined-аргумент мав кешуватися
// окремо від виклику без аргументу, інакше перший виклик ламав другий
test('undefined arg is cached independently', () => {
  let calls = 0;
  const fn = memoize((x) => { calls++; return x === undefined ? 'undef' : x; });
  fn(undefined);
  fn(undefined);
  assert.equal(calls, 1);
  assert.equal(fn(undefined), 'undef');
});

test('null and 0 are not treated as the same cache key', () => {
  let calls = 0;
  const fn = memoize((x) => { calls++; return typeof x; });
  fn(null);
  fn(0);
  assert.equal(calls, 2);
});
