const POLICY = Object.freeze({
    LRU: 'lru',
    LFU: 'lfu',
    TIME: 'time',
    CUSTOM: 'custom'
});

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

function memoize(fn, options = {}) {
    if (typeof fn !== 'function') {
        throw new TypeError('memoize: first argument must be a function');
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
            const keyToDelete = pickEvictionKey(cache, policy, customEvict);
            if (keyToDelete === undefined) break;
            cache.delete(keyToDelete);
            stats.evictions += 1;
        }
    };

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
