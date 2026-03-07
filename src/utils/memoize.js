/**
 * Універсальна функція мемоїзації з підтримкою стратегій витіснення.
 * 
 * @param {Function} fn - Чиста функція, яку треба мемоїзувати
 * @param {Object} options - Налаштування: { maxSize, policy, ttl, customEvict }
 * @returns {Function} - Мемоїзована версія функції
 */
function memoize(fn, options = {}) {
    const cache = new Map();
    const maxSize = options.maxSize || Infinity;
    const policy = options.policy || 'lru'; // 'lru', 'lfu', 'time', 'custom'
    const ttl = options.ttl || 60000; // Час життя для 'time' (в мілісекундах)
    const customEvict = options.customEvict || null;

    // Генератор ключів (простий варіант для серіалізованих аргументів)
    const generateKey = (args) => JSON.stringify(args);

    // Функція очищення кешу при переповненні
    const evict = () => {
        if (cache.size <= maxSize) return;

        let keyToRemove = null;

        if (policy === 'custom' && typeof customEvict === 'function') {
            keyToRemove = customEvict(cache);
        } else if (policy === 'lru') {
            // Map зберігає порядок. Перший елемент - найстаріший (Least Recently Used)
            keyToRemove = cache.keys().next().value;
        } else if (policy === 'lfu') {
            // Least Frequently Used: шукаємо елемент з найменшим accessCount
            let minAccess = Infinity;
            for (const [key, meta] of cache.entries()) {
                if (meta.accessCount < minAccess) {
                    minAccess = meta.accessCount;
                    keyToRemove = key;
                }
            }
        } else if (policy === 'time') {
            // Для time просто видаляємо найстаріший запис при переповненні
            keyToRemove = cache.keys().next().value;
        }

        if (keyToRemove) cache.delete(keyToRemove);
    };

    // Повертаємо обгорнуту функцію
    return function (...args) {
        const key = generateKey(args);
        const now = Date.now();

        // 1. Перевіряємо, чи є результат у кеші
        if (cache.has(key)) {
            const meta = cache.get(key);

            // Перевірка для Time-Based Expiry (Lazy Evaluation)
            if (policy === 'time' && (now - meta.timestamp > ttl)) {
                cache.delete(key);
                // Ідемо далі, щоб переобчислити
            } else {
                // Оновлюємо метадані при доступі (Hit)
                meta.accessCount += 1;
                meta.timestamp = now;

                if (policy === 'lru') {
                    // Щоб оновити "свіжість" в Map, видаляємо і додаємо в кінець
                    cache.delete(key);
                    cache.set(key, meta);
                }
                
                console.log(`[MEMOIZE] ⚡ Cache HIT for function: ${fn.name}`);
                return meta.value;
            }
        }

        // 2. Якщо в кеші немає (Miss) — обчислюємо
        console.log(`[MEMOIZE] 📡 Cache MISS for function: ${fn.name}, computing...`);
        const value = fn.apply(this, args);

        // 3. Зберігаємо в кеш з метаданими
        cache.set(key, {
            value: value,
            accessCount: 1,
            timestamp: now
        });

        // 4. Перевіряємо, чи не час щось видалити
        evict();

        return value;
    };
}

// Утиліта для очищення кешу (корисна для тестів або примусового скидання)
memoize.clearCache = function(memoizedFn) {
    if (memoizedFn && memoizedFn._cache) {
        memoizedFn._cache.clear();
        console.log('[MEMOIZE] Cache cleared');
    }
};

// Експортуємо для використання в Node.js / Electron
if (typeof module !== 'undefined' && module.exports) {
    module.exports = memoize;
}

// Експортуємо для використання в браузері (ES6 modules)
if (typeof window !== 'undefined') {
    window.memoize = memoize;
}
