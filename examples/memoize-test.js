const memoize = require('../src/utils/memoize');

function expensiveScore(seed) {
    console.log('  -> calculate for', seed);
    let score = 0;
    for (let i = 0; i < 900000; i++) {
        score += (i % 7);
    }
    return score + seed;
}

function printStats(label, fn) {
    const stats = fn.stats();
    console.log(`${label}:`, stats);
}

console.log('=== LRU demo ===');
const lruMemoized = memoize(expensiveScore, { maxSize: 3, policy: 'lru' });
console.log('A', lruMemoized(5));
console.log('B', lruMemoized(5), '(from cache)');
console.log('C', lruMemoized(10));
console.log('D', lruMemoized(15));
console.log('E', lruMemoized(20), '(should evict oldest)');
console.log('F', lruMemoized(5), '(recomputed if evicted)');
printStats('LRU stats', lruMemoized);

console.log('\n=== LFU demo ===');
const lfuMemoized = memoize(expensiveScore, { maxSize: 3, policy: 'lfu' });
console.log('A', lfuMemoized(100));
console.log('B', lfuMemoized(100));
console.log('C', lfuMemoized(200));
console.log('D', lfuMemoized(300));
console.log('E', lfuMemoized(400), '(should evict least used)');
printStats('LFU stats', lfuMemoized);

console.log('\n=== TIME demo ===');
const timeMemoized = memoize(expensiveScore, {
    maxSize: 10,
    policy: 'time',
    ttl: 2000
});

console.log('A', timeMemoized(1000));
console.log('B', timeMemoized(1000), '(from cache)');

setTimeout(() => {
    console.log('C after 3s', timeMemoized(1000), '(should expire and recalc)');
    printStats('TIME stats', timeMemoized);
}, 3000);

console.log('\n=== CUSTOM demo ===');
const customMemoized = memoize(expensiveScore, {
    maxSize: 2,
    policy: 'custom',
    customEvict(cache) {
        const keys = [...cache.keys()].sort();
        return keys[keys.length - 1];
    }
});

console.log('A', customMemoized(1));
console.log('B', customMemoized(2));
console.log('C', customMemoized(3), '(custom eviction should run)');
printStats('CUSTOM stats', customMemoized);