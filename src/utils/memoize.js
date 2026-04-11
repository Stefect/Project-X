const POLICY = {
    LRU: 'lru',
    LFU: 'lfu',
    TIME: 'time',
    CUSTOM: 'custom'
};

function normalizeMaxSize(rawMaxSize) {
    if (rawMaxSize === undefined || rawMaxSize === null) return Infinity;
    if (!Number.isFinite(rawMaxSize)) return Infinity;
    return Math.max(0, Math.floor(rawMaxSize));
}

function normalizePolicy(rawPolicy) {
    const policy = String(rawPolicy || POLICY.LRU).toLowerCase();
    return Object.values(POLICY).includes(policy) ? policy : POLICY.LRU;
}

function defaultKeyResolver(args) {
    return JSON.stringify(args);
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
    return now - entry.createdAt > ttlMs;
}

function selectEvictionKey(cache, policy, customEvict) {
    if (cache.size === 0) return undefined;

    if (policy === POLICY.CUSTOM && typeof customEvict === 'function') {
        return customEvict(cache);
    }

    let selectedKey;
    let selectedEntry;

    for (const [key, entry] of cache.entries()) {
        if (!selectedEntry) {
            selectedKey = key;
            selectedEntry = entry;
            continue;
        }

        if (policy === POLICY.LRU) {
            if (entry.lastAccessAt < selectedEntry.lastAccessAt) {
                selectedKey = key;
                selectedEntry = entry;
            }
            continue;
        }

        if (policy === POLICY.LFU) {
            const lessFrequent = entry.accessCount < selectedEntry.accessCount;
            const sameFrequencyOlder = entry.accessCount === selectedEntry.accessCount
                && entry.lastAccessAt < selectedEntry.lastAccessAt;

            if (lessFrequent || sameFrequencyOlder) {
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
        }
    }

    return selectedKey;
}

function memoize(fn, options = {}) {
    if (typeof fn !== 'function') {
        throw new TypeError('memoize очікує функцію як перший аргумент');
    }

    const cache = new Map();
    const maxSize = normalizeMaxSize(options.maxSize);
    const policy = normalizePolicy(options.policy);
    const customEvict = options.customEvict;
    const keyResolver = typeof options.keyResolver === 'function'
        ? options.keyResolver
        : defaultKeyResolver;
    const ttlMs = Number.isFinite(options.ttl)
        ? Math.max(0, Number(options.ttl))
        : (policy === POLICY.TIME ? 60000 : Infinity);

    const stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        expirations: 0
    };

    const removeExpiredEntries = (now) => {
        if (!Number.isFinite(ttlMs)) return;

        for (const [key, entry] of cache.entries()) {
            if (isExpired(entry, now, ttlMs)) {
                cache.delete(key);
                stats.expirations += 1;
            }
        }
    };

    const enforceMaxSize = () => {
        if (!Number.isFinite(maxSize)) return;

        while (cache.size > maxSize) {
            const keyToRemove = selectEvictionKey(cache, policy, customEvict);
            if (keyToRemove === undefined) break;
            cache.delete(keyToRemove);
            stats.evictions += 1;
        }
    };

    const memoizedFn = function (...args) {
        if (maxSize === 0) {
            stats.misses += 1;
            return fn.apply(this, args);
        }

        const key = keyResolver(args);
        const now = Date.now();

        removeExpiredEntries(now);

        if (cache.has(key)) {
            const entry = cache.get(key);
            entry.accessCount += 1;
            entry.lastAccessAt = now;
            stats.hits += 1;
            return entry.value;
        }

        stats.misses += 1;
        const value = fn.apply(this, args);
        if (value && typeof value.then === 'function') {
            const guarded = value.catch((error) => {
                cache.delete(key);
                throw error;
            });

            cache.set(key, createEntry(guarded, now));
            enforceMaxSize();
            return guarded;
        }

        cache.set(key, createEntry(value, now));
        enforceMaxSize();
        return value;
    };

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

    memoizedFn.stats = () => ({
        ...stats,
        size: cache.size,
        maxSize,
        policy,
        ttlMs: Number.isFinite(ttlMs) ? ttlMs : null
    });

    return memoizedFn;
}

memoize.clearCache = function (memoizedFn) {
    if (memoizedFn && memoizedFn._cache) {
        memoizedFn._cache.clear();
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = memoize;
}

if (typeof window !== 'undefined') {
    window.memoize = memoize;
}
