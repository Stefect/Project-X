// Політики витіснення кешу: LRU, LFU, за часом створення, або довільна
const POLICY = Object.freeze({
    LRU: 'lru',
    LFU: 'lfu',
    TIME: 'time',
    CUSTOM: 'custom'
});

// Нормалізує maxSize: null/undefined/некінцеве → Infinity, інакше → ціле невід'ємне число
function normalizeMaxSize(rawMaxSize) {
    if (rawMaxSize === undefined || rawMaxSize === null) return Infinity;
    if (!Number.isFinite(rawMaxSize)) return Infinity;
    return Math.max(0, Math.floor(rawMaxSize));
}

// Нормалізує політику: якщо невідома або недійсна → повертає LRU за замовчуванням
function normalizePolicy(rawPolicy) {
    const policy = String(rawPolicy || POLICY.LRU).toLowerCase();
    return Object.values(POLICY).includes(policy) ? policy : POLICY.LRU;
}

// Серіалізує аргументи виклику у ключ кешу; JSON.stringify з фолбеком до String
function defaultKeyResolver(args) {
    try {
        return JSON.stringify(args);
    } catch (_) {
        return String(args);
    }
}

function createEntry(value, now) {
    return {
        value,
        createdAt: now,
        lastAccessAt: now,
        accessCount: 1
    };
}

function isExpired(entry, now, ttlMs) {
    if (!Number.isFinite(ttlMs)) return false;
    return now - entry.createdAt >= ttlMs;
}

function isPromiseLike(value) {
    return Boolean(value && typeof value.then === 'function');
}

// Обирає ключ для витіснення залежно від політики:
// LRU = найрідше використовуваний, LFU = найменш часто використовуваний, TIME = найстаріший
function pickEvictionKey(cache, policy, customEvict) {
    if (cache.size === 0) return undefined;

    if (policy === POLICY.LRU) {
        return cache.keys().next().value;
    }

    if (policy === POLICY.CUSTOM && typeof customEvict === 'function') {
        const chosen = customEvict(cache);
        if (cache.has(chosen)) {
            return chosen;
        }
    }

    let selectedKey;
    let selectedEntry;

    for (const [key, entry] of cache.entries()) {
        if (!selectedEntry) {
            selectedKey = key;
            selectedEntry = entry;
            continue;
        }

        if (policy === POLICY.LFU) {
            const fewerHits = entry.accessCount < selectedEntry.accessCount;
            const sameHitsOlder = entry.accessCount === selectedEntry.accessCount
                && entry.lastAccessAt < selectedEntry.lastAccessAt;
            if (fewerHits || sameHitsOlder) {
                selectedKey = key;
                selectedEntry = entry;
            }
            continue;
        }

        if (policy === POLICY.TIME) {
            if (entry.createdAt < selectedEntry.createdAt) {
                selectedKey = key;
                selectedEntry = entry;
            }
            continue;
        }

        if (entry.lastAccessAt < selectedEntry.lastAccessAt) {
            selectedKey = key;
            selectedEntry = entry;
        }
    }

    return selectedKey;
}

// Основна функція: обгортовує fn мемоізацією — кешує результати викликів (підтримує Promise)
function memoize(fn, options = {}) {
    if (typeof fn !== 'function') {
        throw new TypeError('memoize очікує функцію як перший аргумент');
    }

    const cache = new Map();
    const maxSize = normalizeMaxSize(options.maxSize);
    const policy = normalizePolicy(options.policy);
    const customEvict = options.customEvict;
    // Resolver перетворює args виклику на строковий ключ кешу
    const keyResolver = typeof options.keyResolver === 'function'
        ? options.keyResolver
        : defaultKeyResolver;
    // TTL: час життя запису кешу (для TIME-політики — 60 секунд за замовчуванням)
    const ttlMs = Number.isFinite(options.ttl)
        ? Math.max(0, Number(options.ttl))
        : (policy === POLICY.TIME ? 60000 : Infinity);

    // Статистика: потрапляння, промахи, витіснення, закінчення терміну діє
    const stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        expirations: 0
    };

    // Очищає закінчені записи кешу перед кожним зверненням
    const removeExpiredEntries = (now) => {
        if (!Number.isFinite(ttlMs)) return;

        for (const [key, entry] of cache.entries()) {
            if (isExpired(entry, now, ttlMs)) {
                cache.delete(key);
                stats.expirations += 1;
            }
        }
    };

    // Видаляє записи поки розмір кешу не вкладається у maxSize
    const enforceMaxSize = () => {
        if (!Number.isFinite(maxSize)) return;

        while (cache.size > maxSize) {
            const keyToDelete = pickEvictionKey(cache, policy, customEvict);
            if (keyToDelete === undefined) break;
            cache.delete(keyToDelete);
            stats.evictions += 1;
        }
    };

    // Обгортована функція: перевіряє кеш, повертає збережений результат або викликає fn
    const memoizedFn = function (...args) {
        if (maxSize === 0) {
            stats.misses += 1;
            return fn.apply(this, args);
        }

        const now = Date.now();
        const key = keyResolver(args);

        removeExpiredEntries(now);

        const cached = cache.get(key);
        if (cached) {
            // LRU: переміщуємо запис в кінець Map, щоб він вважався новішим
            if (policy === POLICY.LRU) {
                cache.delete(key);
                cache.set(key, cached);
            }
            cached.accessCount += 1;
            cached.lastAccessAt = now;
            stats.hits += 1;
            return cached.value;
        }

        stats.misses += 1;
        const produced = fn.apply(this, args);

        // Для Promise — кешуємо Promise, але видаляємо запис при режекції
        if (isPromiseLike(produced)) {
            const guardedPromise = Promise.resolve(produced).catch((error) => {
                cache.delete(key);
                throw error;
            });

            cache.set(key, createEntry(guardedPromise, now));
            enforceMaxSize();
            return guardedPromise;
        }

        cache.set(key, createEntry(produced, now));
        enforceMaxSize();
        return produced;
    };

    // Додаткові методи обгортованої функції: очищення, видалення, перевірка, перегляд, статистика
    memoizedFn._cache = cache;

    memoizedFn.clear = () => {
        cache.clear();
    };

    memoizedFn.delete = (...args) => {
        const key = keyResolver(args);
        return cache.delete(key);
    };

    memoizedFn.has = (...args) => {
        const key = keyResolver(args);
        return cache.has(key);
    };

    memoizedFn.peek = (...args) => {
        const key = keyResolver(args);
        return cache.get(key)?.value;
    };

    memoizedFn.stats = () => ({
        ...stats,
        size: cache.size,
        maxSize,
        policy,
        ttlMs: Number.isFinite(ttlMs) ? ttlMs : null
    });

    return memoizedFn;
}

export default memoize;
