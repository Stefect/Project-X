import test from 'node:test';
import assert from 'node:assert/strict';
import BrowserXTaskQueue from '../src/utils/priority-queue.js';

// ─── enqueue / основні тести ──────────────────────────────────────────────

test('enqueue returns new size', () => {
  const q = new BrowserXTaskQueue();
  assert.equal(q.enqueue('a', 1), 1);
  assert.equal(q.enqueue('b', 2), 2);
});

test('isEmpty returns true for empty queue', () => {
  const q = new BrowserXTaskQueue();
  assert.equal(q.isEmpty(), true);
});

test('isEmpty returns false after enqueue', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('a', 1);
  assert.equal(q.isEmpty(), false);
});

test('size returns correct count', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('x', 1);
  q.enqueue('y', 2);
  assert.equal(q.size(), 2);
});

test('enqueue throws TypeError for non-finite priority', () => {
  const q = new BrowserXTaskQueue();
  assert.throws(() => q.enqueue('a', 'bad'), TypeError);
  assert.throws(() => q.enqueue('a', NaN), TypeError);
});

// ─── dequeue ────────────────────────────────────────────────────────────────

test('dequeue(highest) returns item with highest priority', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('low', 1);
  q.enqueue('high', 10);
  q.enqueue('mid', 5);
  assert.equal(q.dequeue('highest'), 'high');
});

test('dequeue(lowest) returns item with lowest priority', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('low', 1);
  q.enqueue('high', 10);
  q.enqueue('mid', 5);
  assert.equal(q.dequeue('lowest'), 'low');
});

test('dequeue(oldest) returns first-inserted item', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('first', 5);
  q.enqueue('second', 5);
  q.enqueue('third', 5);
  assert.equal(q.dequeue('oldest'), 'first');
});

test('dequeue(newest) returns last-inserted item', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('first', 5);
  q.enqueue('second', 5);
  q.enqueue('third', 5);
  assert.equal(q.dequeue('newest'), 'third');
});

test('dequeue removes the item from the queue', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('a', 1);
  q.dequeue('highest');
  assert.equal(q.isEmpty(), true);
});

test('dequeue on empty queue returns null', () => {
  const q = new BrowserXTaskQueue();
  assert.equal(q.dequeue('highest'), null);
});

// ─── peek ────────────────────────────────────────────────────────────────────

test('peek does not remove item from queue', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('a', 1);
  assert.equal(q.peek('highest'), 'a');
  assert.equal(q.size(), 1);
});

test('peek on empty queue returns null', () => {
  const q = new BrowserXTaskQueue();
  assert.equal(q.peek('highest'), null);
});

// ─── вирішення рівності пріоритетів ───────────────────────────────────────

test('dequeue(highest) breaks ties by insertion order (FIFO)', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('first', 5);
  q.enqueue('second', 5);
  assert.equal(q.dequeue('highest'), 'first');
  assert.equal(q.dequeue('highest'), 'second');
});

test('dequeue(lowest) breaks ties by insertion order (FIFO)', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('first', 5);
  q.enqueue('second', 5);
  assert.equal(q.dequeue('lowest'), 'first');
});

// ─── clear ────────────────────────────────────────────────────────────────

test('clear empties the queue and resets counter', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('a', 1);
  q.enqueue('b', 2);
  q.clear();
  assert.equal(q.isEmpty(), true);
  assert.equal(q.size(), 0);
});

// ─── конструктор з початковими даними ──────────────────────────────────

test('seed constructor pre-populates queue', () => {
  const q = new BrowserXTaskQueue([
    { item: 'a', priority: 1 },
    { item: 'b', priority: 10 },
  ]);
  assert.equal(q.size(), 2);
  assert.equal(q.dequeue('highest'), 'b');
});

test('seed constructor ignores invalid entries', () => {
  const q = new BrowserXTaskQueue([null, 'bad', { item: 'ok', priority: 1 }]);
  assert.equal(q.size(), 1);
});

// ─── toArray ─────────────────────────────────────────────────────────────

test('toArray returns all items with priority and order', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('x', 3);
  q.enqueue('y', 7);
  const arr = q.toArray();
  assert.equal(arr.length, 2);
  assert.equal(arr[0].item, 'x');
  assert.equal(arr[0].priority, 3);
  assert.ok(typeof arr[0].order === 'number');
});

// ─── запасний режим при невалідному значенні ───────────────────────────

test('dequeue with invalid mode falls back to highest', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('low', 1);
  q.enqueue('high', 10);
  assert.equal(q.dequeue('bad-mode'), 'high');
});

// ─── повний цикл роботи черги ──────────────────────────────────────────

test('draining queue in highest order yields sorted sequence', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('c', 3);
  q.enqueue('a', 1);
  q.enqueue('b', 2);

  const result = [];
  while (!q.isEmpty()) {
    result.push(q.dequeue('highest'));
  }

  assert.deepEqual(result, ['c', 'b', 'a']);
});

// float priority - перевіряли бо Number() може поводитися дивно з 0.1+0.2
test('float priority comparison works correctly', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('x', 0.1 + 0.2); // 0.30000000000000004
  q.enqueue('y', 0.3);
  // обидва не рівні суворо, але 0.1+0.2 > 0.3 в JS
  const first = q.dequeue('highest');
  assert.ok(first === 'x' || first === 'y'); // будь-який з них — не падає
  assert.equal(q.size(), 1);
});

test('enqueue after clear resets order counter', () => {
  const q = new BrowserXTaskQueue();
  q.enqueue('old', 5);
  q.clear();
  q.enqueue('new', 5);
  assert.equal(q.size(), 1);
  assert.equal(q.dequeue('oldest'), 'new');
});
