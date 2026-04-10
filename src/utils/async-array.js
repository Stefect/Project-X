const ABORT_MESSAGE = 'Операцію скасовано';

function createAbortError() {
  const error = new Error(ABORT_MESSAGE);
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw createAbortError();
  }
}

function toArrayOrThrow(arr) {
  if (!Array.isArray(arr)) {
    throw new TypeError('Expected an array');
  }
  return arr;
}

function toFunctionOrThrow(fn, name) {
  if (typeof fn !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
  return fn;
}

function normalizeConcurrency(concurrency) {
  if (concurrency === Infinity) return Infinity;
  if (!Number.isFinite(concurrency)) return Infinity;
  return Math.max(1, Math.floor(concurrency));
}

function bridgePromiseToCallback(promise, callback) {
  let settled = false;
  const done = (err, value) => {
    if (settled) return;
    settled = true;
    callback(err, value);
  };

  promise
    .then((value) => done(null, value))
    .catch((error) => done(error));
}

function callIteratorWithNodeCallback(iteratorFn, value, index, array) {
  return new Promise((resolve, reject) => {
    let finished = false;

    const done = (err, result) => {
      if (finished) return;
      finished = true;
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    };

    try {
      iteratorFn(value, index, array, done);
    } catch (error) {
      done(error);
    }
  });
}

function callReduceIteratorWithNodeCallback(iteratorFn, accumulator, value, index, array) {
  return new Promise((resolve, reject) => {
    let finished = false;

    const done = (err, result) => {
      if (finished) return;
      finished = true;
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    };

    try {
      iteratorFn(accumulator, value, index, array, done);
    } catch (error) {
      done(error);
    }
  });
}

async function asyncMap(arr, asyncFn, options = {}) {
  const array = toArrayOrThrow(arr);
  const mapper = toFunctionOrThrow(asyncFn, 'asyncFn');
  const { signal } = options;
  const concurrency = normalizeConcurrency(options.concurrency ?? Infinity);

  throwIfAborted(signal);

  if (array.length === 0) {
    return [];
  }

  const results = new Array(array.length);

  if (concurrency === Infinity || concurrency >= array.length) {
    await Promise.all(
      array.map(async (value, index) => {
        throwIfAborted(signal);
        results[index] = await mapper(value, index, array);
      })
    );
    return results;
  }

  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, array.length) },
    async () => {
      while (nextIndex < array.length) {
        throwIfAborted(signal);
        const index = nextIndex++;
        results[index] = await mapper(array[index], index, array);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

function asyncMapCallback(arr, asyncFn, callback, options = {}) {
  const iterator = toFunctionOrThrow(asyncFn, 'asyncFn');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncMap(
    arr,
    (value, index, array) => callIteratorWithNodeCallback(iterator, value, index, array),
    options
  );

  bridgePromiseToCallback(promise, cb);
}

async function asyncFilter(arr, asyncPredicate, options = {}) {
  const array = toArrayOrThrow(arr);
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');

  const markers = await asyncMap(array, predicate, options);
  throwIfAborted(options.signal);
  return array.filter((_, index) => Boolean(markers[index]));
}

function asyncFilterCallback(arr, asyncPredicate, callback, options = {}) {
  toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const cb = toFunctionOrThrow(callback, 'callback');

  asyncMapCallback(
    arr,
    asyncPredicate,
    (err, markers) => {
      if (err) {
        cb(err);
        return;
      }

      const array = toArrayOrThrow(arr);
      cb(null, array.filter((_, index) => Boolean(markers[index])));
    },
    options
  );
}

async function asyncFind(arr, asyncPredicate, options = {}) {
  const array = toArrayOrThrow(arr);
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const { signal } = options;

  for (let i = 0; i < array.length; i++) {
    throwIfAborted(signal);

    try {
      if (await predicate(array[i], i, array)) {
        return array[i];
      }
    } catch (_error) {
      // Зберігаємо попередню поведінку: пропускаємо помилковий елемент
      // і продовжуємо пошук.
    }
  }

  return undefined;
}

function asyncFindCallback(arr, asyncPredicate, callback, options = {}) {
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncFind(
    arr,
    (value, index, array) => callIteratorWithNodeCallback(predicate, value, index, array),
    options
  );

  bridgePromiseToCallback(promise, cb);
}

async function asyncFindIndex(arr, asyncPredicate, options = {}) {
  const array = toArrayOrThrow(arr);
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const { signal } = options;

  for (let i = 0; i < array.length; i++) {
    throwIfAborted(signal);

    try {
      if (await predicate(array[i], i, array)) {
        return i;
      }
    } catch (_error) {
      // Поведінка аналогічна asyncFind: помилки елемента не валять весь пошук.
    }
  }

  return -1;
}

function asyncFindIndexCallback(arr, asyncPredicate, callback, options = {}) {
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncFindIndex(
    arr,
    (value, index, array) => callIteratorWithNodeCallback(predicate, value, index, array),
    options
  );

  bridgePromiseToCallback(promise, cb);
}

async function asyncSome(arr, asyncPredicate, options = {}) {
  const index = await asyncFindIndex(arr, asyncPredicate, options);
  return index !== -1;
}

function asyncSomeCallback(arr, asyncPredicate, callback, options = {}) {
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncSome(
    arr,
    (value, index, array) => callIteratorWithNodeCallback(predicate, value, index, array),
    options
  );

  bridgePromiseToCallback(promise, cb);
}

async function asyncReduce(arr, asyncFn, initialValue, options = {}) {
  const array = toArrayOrThrow(arr);
  const reducer = toFunctionOrThrow(asyncFn, 'asyncFn');
  const { signal } = options;

  let accumulator = initialValue;

  for (let i = 0; i < array.length; i++) {
    throwIfAborted(signal);
    accumulator = await reducer(accumulator, array[i], i, array);
  }

  return accumulator;
}

function asyncReduceCallback(arr, asyncFn, initialValue, callback, options = {}) {
  const reducer = toFunctionOrThrow(asyncFn, 'asyncFn');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncReduce(
    arr,
    (accumulator, value, index, array) => {
      return callReduceIteratorWithNodeCallback(
        reducer,
        accumulator,
        value,
        index,
        array
      );
    },
    initialValue,
    options
  );

  bridgePromiseToCallback(promise, cb);
}

function createAsyncController(timeoutMs = null) {
  const controller = new AbortController();
  let timeoutId = null;

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
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
    clearTimeout: () => {
      if (!timeoutId) return;
      clearTimeout(timeoutId);
      timeoutId = null;
    },
    get aborted() {
      return controller.signal.aborted;
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
  asyncFindIndex,
  asyncFindIndexCallback,
  asyncSome,
  asyncSomeCallback,
  asyncReduce,
  asyncReduceCallback,
  createAsyncController
};