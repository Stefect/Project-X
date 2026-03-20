function memoize(fn, options = {}) {
    const cache = new Map();
    const maxSize = options.maxSize || Infinity;
    const policy = options.policy || 'lru';
    const ttl = options.ttl || 60000;
    const customEvict = options.customEvict || null;

    const generateKey = (args) => JSON.stringify(args);

    const evict = () => {
        if (cache.size <= maxSize) return;

        let keyToRemove = null;

        if (policy === 'custom' && typeof customEvict === 'function') {
            keyToRemove = customEvict(cache);
        } else if (policy === 'lru') {
            keyToRemove = cache.keys().next().value;
        } else if (policy === 'lfu') {
            let minAccess = Infinity;
            for (const [key, meta] of cache.entries()) {
                if (meta.accessCount < minAccess) {
                    minAccess = meta.accessCount;
                    keyToRemove = key;
                }
            }
        } else if (policy === 'time') {
            keyToRemove = cache.keys().next().value;
        }

        if (keyToRemove) cache.delete(keyToRemove);
    };

    return function (...args) {
        const key = generateKey(args);
        const now = Date.now();

        if (cache.has(key)) {
            const meta = cache.get(key);

            if (policy === 'time' && (now - meta.timestamp > ttl)) {
                cache.delete(key);
            } else {
                meta.accessCount += 1;
                meta.timestamp = now;

                if (policy === 'lru') {
                    cache.delete(key);
                    cache.set(key, meta);
                }

                return meta.value;
            }
        }

        const value = fn.apply(this, args);

        cache.set(key, {
            value: value,
            accessCount: 1,
            timestamp: now
        });

        evict();

        return value;
    };
}

memoize.clearCache = function(memoizedFn) {
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
