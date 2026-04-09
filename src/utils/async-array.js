async function asyncMap(arr, asyncFn, options = {}) {
  const { signal, concurrency = Infinity } = options;

  if (concurrency === Infinity) {
    return Promise.all(arr.map((val, idx, array) => asyncFn(val, idx, array)));
  }

  const results = new Array(arr.length);
  const inProgress = new Set();

  for (let i = 0; i < arr.length; i++) {
    const idx = i;
    
    const task = (async () => {
      const result = await asyncFn(arr[idx], idx, arr);
      results[idx] = result;
      inProgress.delete(task);
      return result;
    })();

    inProgress.add(task);

    if (inProgress.size >= concurrency) {
      await Promise.race(inProgress);
    }

    if (signal?.aborted) throw new Error('Операцію скасовано');
  }

  if (inProgress.size > 0) {
    await Promise.all(inProgress);
  }
  
  return results;
}

function asyncMapCallback(arr, asyncFn, callback, options = {}) {
  const { signal, concurrency = Infinity } = options;
  const results = new Array(arr.length);
  let completedCount = 0;
  let errored = false;

  if (arr.length === 0) return callback(null, results);

  const processItem = (index) => {
    if (errored || signal?.aborted) return;

    asyncFn(arr[index], index, arr, (err, result) => {
      if (err) {
        if (!errored) {
          errored = true;
          callback(err);
        }
        return;
      }

      results[index] = result;
      completedCount++;

      if (completedCount === arr.length) {
        callback(null, results);
      }
    });
  };

  if (concurrency === Infinity) {
    arr.forEach((_, idx) => setImmediate(() => processItem(idx)));
  } else {
    let started = 0;
    const startNext = () => {
      while (started < arr.length && !errored) {
        processItem(started);
        started++;
        if (started - (started - concurrency) >= concurrency) break;
      }
    };
    startNext();
  }
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
    if (finished || signal?.aborted) return;

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
      
      if (err) {
        completed++;
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

module.exports = { asyncMap, asyncMapCallback, asyncFilter, asyncFilterCallback, asyncFind, asyncFindCallback, asyncSome, asyncSomeCallback, asyncReduce, asyncReduceCallback };
