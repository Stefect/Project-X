// Простий тест мемоізації
const memoize = require('../src/utils/memoize');

function slowFunction(x) {
    console.log('   Computing for:', x);
    let result = 0;
    for(let i = 0; i < 1000000; i++) {
        result += i;
    }
    return result + x;
}

console.log('=== LRU тест ===');
const memoizedLRU = memoize(slowFunction, { maxSize: 3, policy: 'lru' });

console.log('1:', memoizedLRU(5));
console.log('2:', memoizedLRU(5)); // має бути з кешу
console.log('3:', memoizedLRU(10));
console.log('4:', memoizedLRU(15));
console.log('5:', memoizedLRU(20)); // має витіснити перший
console.log('6:', memoizedLRU(5)); // має знову обчислитись

console.log('\n=== LFU тест ===');
const memoizedLFU = memoize(slowFunction, { maxSize: 3, policy: 'lfu' });

console.log('1:', memoizedLFU(100));
console.log('2:', memoizedLFU(100)); // +1 виклик
console.log('3:', memoizedLFU(200));
console.log('4:', memoizedLFU(300));
console.log('5:', memoizedLFU(400)); // має витіснити найменш використаний

console.log('\n=== TIME тест ===');
const memoizedTime = memoize(slowFunction, {
    maxSize: 10,
    policy: 'time',
    ttl: 2000
});

console.log('1:', memoizedTime(1000));
console.log('2:', memoizedTime(1000)); // з кешу

setTimeout(() => {
    console.log('3 (через 3 сек):', memoizedTime(1000)); // має перерахувати
}, 3000);