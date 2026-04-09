async function asyncMap(arr, asyncFn, options = {}) {
  const { signal, concurrency = Infinity } = options;

  if (concurrency === Infinity) {
    return Promise.all(arr.map((val, idx, array) => asyncFn(val, idx, array)));
  }

  const limit = Number.isFinite(concurrency) && concurrency > 0
    ? Math.floor(concurrency)
    : 1;
  const results = new Array(arr.length);
  const inProgress = new Set();

  for (let i = 0; i < arr.length; i++) {
    if (signal?.aborted) throw new Error('Операцію скасовано');

    const idx = i;
    const task = (async () => {
      try {
        const result = await asyncFn(arr[idx], idx, arr);
        results[idx] = result;
        return result;
      } finally {
        inProgress.delete(task);
      }
    })();

    inProgress.add(task);

    if (inProgress.size >= limit) {
      await Promise.race(inProgress);
    }
  }

  if (inProgress.size > 0) {
    await Promise.all(inProgress);
  }
  
  return results;
}

function asyncMapCallback(arr, asyncFn, callback, options = {}) {
  const { signal, concurrency = Infinity } = options;
  const results = new Array(arr.length);
  const limit = concurrency === Infinity
    ? arr.length
    : Math.max(1, Math.floor(concurrency) || 1);
  let active = 0;
  let nextIndex = 0;
  let completedCount = 0;
  let settled = false;

  const done = (err, data) => {
    if (settled) return;
    settled = true;
    callback(err, data);
  };

  if (arr.length === 0) return callback(null, results);

  const startNext = () => {
    if (settled) return;
    if (signal?.aborted) return done(new Error('Операцію скасовано'));

    while (active < limit && nextIndex < arr.length && !settled) {
      const index = nextIndex++;
      active++;

      asyncFn(arr[index], index, arr, (err, result) => {
        active--;
        if (settled) return;
        if (signal?.aborted) return done(new Error('Операцію скасовано'));
        if (err) return done(err);

        results[index] = result;
        completedCount++;

        if (completedCount === arr.length) {
          return done(null, results);
        }

        startNext();
      });
    }
  };

  startNext();
}

async function asyncFilter(arr, asyncPredicate, options = {}) {
  const { signal } = options;
  
  const predicates = await Promise.all(
    arr.map((val, idx, array) => asyncPredicate(val, idx, array))
  );
  
  if (signal?.aborted) throw new Error('Операцію скасовано');
  
  return arr.filter((_, idx) => predicates[idx]);
}

function asyncFilterCallback(arr, asyncPredicate, callback, options = {}) {
  const { signal } = options;
  const predicates = new Array(arr.length);
  let completed = 0;
  let hasError = false;

  if (arr.length === 0) return callback(null, []);

  arr.forEach((val, idx) => {
    asyncPredicate(val, idx, arr, (err, result) => {
      if (hasError) return;
      if (signal?.aborted) {
        hasError = true;
        return callback(new Error('Операцію скасовано'));
      }
      
      if (err) {
        hasError = true;
        return callback(err);
      }

      predicates[idx] = result;
      completed++;

      if (completed === arr.length) {
        const filtered = arr.filter((_, i) => predicates[i]);
        callback(null, filtered);
      }
    });
  });
}

async function asyncFind(arr, asyncPredicate, options = {}) {
  const { signal } = options;

  for (let i = 0; i < arr.length; i++) {
    if (signal?.aborted) throw new Error('Операцію скасовано');
    
    try {
      const match = await asyncPredicate(arr[i], i, arr);
      if (match) return arr[i];
    } catch (e) {
      continue;
    }
  }

  return undefined;
}

function asyncFindCallback(arr, asyncPredicate, callback, options = {}) {
  const { signal } = options;
  let currentIndex = 0;
  let finished = false;

  const searchNext = () => {
    if (finished) return;
    if (signal?.aborted) return callback(new Error('Операцію скасовано'));

    if (currentIndex >= arr.length) {
      return callback(null, undefined);
    }

    const idx = currentIndex++;
    asyncPredicate(arr[idx], idx, arr, (err, match) => {
      if (finished) return;
      
      if (err) {
        searchNext();
        return;
      }

      if (match) {
        finished = true;
        callback(null, arr[idx]);
      } else {
        searchNext();
      }
    });
  };

  searchNext();
}

async function asyncSome(arr, asyncPredicate, options = {}) {
  const { signal } = options;

  for (let i = 0; i < arr.length; i++) {
    if (signal?.aborted) throw new Error('Операцію скасовано');
    
    const match = await asyncPredicate(arr[i], i, arr);
    if (match) return true;
  }

  return false;
}

function asyncSomeCallback(arr, asyncPredicate, callback, options = {}) {
  const { signal } = options;
  let completed = 0;
  let found = false;

  if (!arr.length) return callback(null, false);

  arr.forEach((val, idx) => {
    if (found) return;

    asyncPredicate(val, idx, arr, (err, result) => {
      if (found) return;
      if (signal?.aborted) {
        found = true;
        return callback(new Error('Операцію скасовано'));
      }
      
      if (err) {
        found = true;
        return callback(err);
      } else if (result) {
        found = true;
        return callback(null, true);
      } else {
        completed++;
      }

      if (completed === arr.length && !found) {
        callback(null, false);
      }
    });
  });
}

async function asyncReduce(arr, asyncFn, initialValue, options = {}) {
  const { signal } = options;
  let accumulator = initialValue;

  for (let i = 0; i < arr.length; i++) {
    if (signal?.aborted) throw new Error('Операцію скасовано');
    
    accumulator = await asyncFn(accumulator, arr[i], i, arr);
  }

  return accumulator;
}

function asyncReduceCallback(arr, asyncFn, initialValue, callback, options = {}) {
  const { signal } = options;
  let index = 0;
  let accumulator = initialValue;

  const reduceNext = () => {
    if (signal?.aborted) {
      return callback(new Error('Операцію скасовано'));
    }

    if (index >= arr.length) {
      return callback(null, accumulator);
    }

    const currentIdx = index++;
    asyncFn(accumulator, arr[currentIdx], currentIdx, arr, (err, result) => {
      if (err) return callback(err);

      accumulator = result;
      process.nextTick(() => reduceNext());
    });
  };

  reduceNext();
}

function createAsyncController(timeoutMs = null) {
  const controller = new AbortController();
  let timeoutId;
  
  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
  }

  return {
    controller,
    signal: controller.signal,
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      controller.abort();
    },
    get aborted() {
      return controller.signal.aborted;
    },
    clearTimeout: () => {
      if (!timeoutId) return;
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
}

module.exports = {
  asyncMap,
  asyncMapCallback,
  asyncFilter,
  asyncFilterCallback,
  asyncFind,
  asyncFindCallback,
  asyncSome,
  asyncSomeCallback,
  asyncReduce,
  asyncReduceCallback,
  createAsyncController
};
