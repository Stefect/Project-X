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

module.exports = { asyncMap, asyncMapCallback, asyncFilter, asyncFilterCallback };
