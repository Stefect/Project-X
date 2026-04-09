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

module.exports = { asyncMap, asyncMapCallback };
