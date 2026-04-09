async function asyncMap(arr, asyncFn, options = {}) {
  const { signal, concurrency = Infinity } = options;

  if (concurrency === Infinity) {
    return Promise.all(arr.map((val, idx, array) => asyncFn(val, idx, array)));
  }

  const results = [];
  const pool = [];

  for (let i = 0; i < arr.length; i++) {
    const promise = (async () => {
      const result = await asyncFn(arr[i], i, arr);
      results[i] = result;
      return result;
    })();

    pool.push(promise);

    if (pool.length >= concurrency) {
      await Promise.race(pool);
      pool.splice(pool.indexOf(promise), 1);
    }

    if (signal?.aborted) throw new Error('╨Ю╨┐╨╡╤А╨░╤Ж╤Ц╤О ╤Б╨║╨░╤Б╨╛╨▓╨░╨╜╨╛');
  }

  await Promise.all(pool);
  return results;
}

function asyncMapCallback(arr, asyncFn, callback, options = {}) {
  const { signal, concurrency = Infinity } = options;
  const results = new Array(arr.length);
  let completed = 0;
  let hasError = false;

  if (arr.length === 0) return callback(null, results);

  const processItem = (index) => {
    if (hasError || signal?.aborted) return;

    asyncFn(arr[index], index, arr, (err, result) => {
      if (err || hasError) {
        hasError = true;
        return callback(err || new Error('╨Ю╨┐╨╡╤А╨░╤Ж╤Ц╤О ╤Б╨║╨░╤Б╨╛╨▓╨░╨╜╨╛'));
      }

      results[index] = result;
      completed++;

      if (completed === arr.length) {
        callback(null, results);
      }
    });
  };

  if (concurrency === Infinity) {
    arr.forEach((_, idx) => processItem(idx));
  } else {
    const queue = [];
    for (let i = 0; i < arr.length; i++) {
      queue.push(i);
    }

    const executeNext = () => {
      if (queue.length === 0) return;
      const idx = queue.shift();
      processItem(idx);
      if (queue.length > 0) {
        setTimeout(executeNext, 0);
      }
    };

    for (let i = 0; i < Math.min(concurrency, arr.length); i++) {
      executeNext();
    }
  }
}

async function asyncFilter(arr, asyncPredicate, options = {}) {
  const { signal } = options;
  const results = await Promise.all(arr.map((val, idx, array) => asyncPredicate(val, idx, array)));
  
  if (signal?.aborted) throw new Error('╨Ю╨┐╨╡╤А╨░╤Ж╤Ц╤О ╤Б╨║╨░╤Б╨╛╨▓╨░╨╜╨╛');
  
  return arr.filter((_, idx) => results[idx]);
}

function asyncFilterCallback(arr, asyncPredicate, callback, options = {}) {
  const { signal } = options;
  const results = new Array(arr.length);
  let completed = 0;
  let hasError = false;

  if (arr.length === 0) return callback(null, []);

  arr.forEach((val, idx, array) => {
    asyncPredicate(val, idx, array, (err, result) => {
      if (err || hasError) {
        hasError = true;
        return callback(err || new Error('╨Ю╨┐╨╡╤А╨░╤Ж╤Ц╤О ╤Б╨║╨░╤Б╨╛╨▓╨░╨╜╨╛'));
      }

      results[idx] = result ? val : undefined;
      completed++;

      if (completed === arr.length) {
        callback(null, results.filter(v => v !== undefined));
      }
    });
  });
}

async function asyncFind(arr, asyncPredicate, options = {}) {
  const { signal } = options;

  for (let i = 0; i < arr.length; i++) {
    if (signal?.aborted) throw new Error('╨Ю╨┐╨╡╤А╨░╤Ж╤Ц╤О ╤Б╨║╨░╤Б╨╛╨▓╨░╨╜╨╛');
    
    const match = await asyncPredicate(arr[i], i, arr);
    if (match) return arr[i];
  }

  return undefined;
}

function asyncFindCallback(arr, asyncPredicate, callback, options = {}) {
  const { signal } = options;
  let index = 0;
  let isFound = false;

  const checkNext = () => {
    if (isFound || signal?.aborted) return;

    if (index >= arr.length) {
      return callback(null, undefined);
    }

    const currentIndex = index;
    asyncPredicate(arr[index], index, arr, (err, match) => {
      if (err || isFound) {
        isFound = true;
        return callback(err);
      }

      if (match) {
        isFound = true;
        callback(null, arr[currentIndex]);
      } else {
        index++;
        checkNext();
      }
    });
  };

  checkNext();
}

async function asyncSome(arr, asyncPredicate, options = {}) {
  const { signal } = options;

  for (let i = 0; i < arr.length; i++) {
    if (signal?.aborted) throw new Error('╨Ю╨┐╨╡╤А╨░╤Ж╤Ц╤О ╤Б╨║╨░╤Б╨╛╨▓╨░╨╜╨╛');
    
    const match = await asyncPredicate(arr[i], i, arr);
    if (match) return true;
  }

  return false;
}

function asyncSomeCallback(arr, asyncPredicate, callback, options = {}) {
  const { signal } = options;
  let completed = 0;
  let found = false;

  if (arr.length === 0) return callback(null, false);

  arr.forEach((val, idx, array) => {
    if (found || signal?.aborted) return;

    asyncPredicate(val, idx, array, (err, result) => {
      if (err) return callback(err);

      if (result && !found) {
        found = true;
        callback(null, true);
      } else {
        completed++;
        if (completed === arr.length && !found) {
          callback(null, false);
        }
      }
    });
  });
}

async function asyncReduce(arr, asyncFn, initialValue, options = {}) {
  const { signal } = options;
  let accumulator = initialValue;

  for (let i = 0; i < arr.length; i++) {
    if (signal?.aborted) throw new Error('╨Ю╨┐╨╡╤А╨░╤Ж╤Ц╤О ╤Б╨║╨░╤Б╨╛╨▓╨░╨╜╨╛');
    
    accumulator = await asyncFn(accumulator, arr[i], i, arr);
  }

  return accumulator;
}

function asyncReduceCallback(arr, asyncFn, initialValue, callback, options = {}) {
  const { signal } = options;
  let index = 0;
  let accumulator = initialValue;

  const processNext = () => {
    if (signal?.aborted) return callback(new Error('╨Ю╨┐╨╡╤А╨░╤Ж╤Ц╤О ╤Б╨║╨░╤Б╨╛╨▓╨░╨╜╨╛'));

    if (index >= arr.length) {
      return callback(null, accumulator);
    }

    const currentIndex = index;
    asyncFn(accumulator, arr[index], index, arr, (err, result) => {
      if (err) return callback(err);

      accumulator = result;
      index++;
      processNext();
    });
  };

  processNext();
}

function createAsyncController(timeoutMs = null) {
  const controller = new AbortController();
  
  if (timeoutMs) {
    setTimeout(() => controller.abort(), timeoutMs);
  }

  return controller;
}

module.exports = { asyncMap, asyncMapCallback, asyncFilter, asyncFilterCallback, asyncFind, asyncFindCallback, asyncSome, asyncSomeCallback, asyncReduce, asyncReduceCallback, createAsyncController };
