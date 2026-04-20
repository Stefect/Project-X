const ABORT_MESSAGE = 'Операцію скасовано';
const FILTER_MAP_SKIP = Symbol('asyncFilterMap.skip');

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

function callNodeIterator(iteratorFn, args) {
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
      iteratorFn(...args, done);
    } catch (error) {
      done(error);
    }
  });
}

async function runWithWorkerPool(length, concurrency, worker) {
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, length) },
    async () => {
      while (cursor < length) {
        const index = cursor;
        cursor += 1;
        await worker(index);
      }
    }
  );

  await Promise.all(workers);
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

  const result = new Array(array.length);

  const runOne = async (index) => {
    throwIfAborted(signal);
    result[index] = await mapper(array[index], index, array);
  };

  if (concurrency === Infinity || concurrency >= array.length) {
    await Promise.all(array.map((_, index) => runOne(index)));
    return result;
  }

  await runWithWorkerPool(array.length, concurrency, runOne);
  return result;
}

function asyncMapCallback(arr, asyncFn, callback, options = {}) {
  const mapper = toFunctionOrThrow(asyncFn, 'asyncFn');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncMap(
    arr,
    (value, index, array) => callNodeIterator(mapper, [value, index, array]),
    options
  );

  bridgePromiseToCallback(promise, cb);
}

async function asyncFilter(arr, asyncPredicate, options = {}) {
  const array = toArrayOrThrow(arr);
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');

  const marks = await asyncMap(array, predicate, options);
  throwIfAborted(options.signal);

  return array.filter((_, index) => Boolean(marks[index]));
}

function asyncFilterCallback(arr, asyncPredicate, callback, options = {}) {
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const cb = toFunctionOrThrow(callback, 'callback');

  asyncMapCallback(
    arr,
    predicate,
    (err, marks) => {
      if (err) {
        cb(err);
        return;
      }

      const array = toArrayOrThrow(arr);
      cb(null, array.filter((_, index) => Boolean(marks[index])));
    },
    options
  );
}

async function asyncFilterMap(arr, asyncMapper, options = {}) {
  const array = toArrayOrThrow(arr);
  const mapper = toFunctionOrThrow(asyncMapper, 'asyncMapper');

  const mapped = await asyncMap(array, mapper, options);
  throwIfAborted(options.signal);

  const compact = [];
  for (const value of mapped) {
    if (value === FILTER_MAP_SKIP) {
      continue;
    }

    if (value && typeof value === 'object' && value.skip === true) {
      continue;
    }

    compact.push(value);
  }

  return compact;
}

asyncFilterMap.skip = FILTER_MAP_SKIP;

function asyncFilterMapCallback(arr, asyncMapper, callback, options = {}) {
  const mapper = toFunctionOrThrow(asyncMapper, 'asyncMapper');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncFilterMap(
    arr,
    (value, index, array) => callNodeIterator(mapper, [value, index, array]),
    options
  );

  bridgePromiseToCallback(promise, cb);
}

async function asyncFindIndex(arr, asyncPredicate, options = {}) {
  const array = toArrayOrThrow(arr);
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const { signal } = options;
  const ignorePredicateErrors = options.ignorePredicateErrors !== false;

  for (let i = 0; i < array.length; i += 1) {
    throwIfAborted(signal);

    try {
      if (await predicate(array[i], i, array)) {
        return i;
      }
    } catch (error) {
      if (!ignorePredicateErrors) {
        throw error;
      }
    }
  }

  return -1;
}

function asyncFindIndexCallback(arr, asyncPredicate, callback, options = {}) {
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncFindIndex(
    arr,
    (value, index, array) => callNodeIterator(predicate, [value, index, array]),
    options
  );

  bridgePromiseToCallback(promise, cb);
}

async function asyncFind(arr, asyncPredicate, options = {}) {
  const array = toArrayOrThrow(arr);
  const index = await asyncFindIndex(array, asyncPredicate, options);
  return index === -1 ? undefined : array[index];
}

function asyncFindCallback(arr, asyncPredicate, callback, options = {}) {
  const predicate = toFunctionOrThrow(asyncPredicate, 'asyncPredicate');
  const cb = toFunctionOrThrow(callback, 'callback');

  const promise = asyncFind(
    arr,
    (value, index, array) => callNodeIterator(predicate, [value, index, array]),
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
    (value, index, array) => callNodeIterator(predicate, [value, index, array]),
    options
  );

  bridgePromiseToCallback(promise, cb);
}

async function asyncReduce(arr, asyncFn, initialValue, options = {}) {
  const array = toArrayOrThrow(arr);
  const reducer = toFunctionOrThrow(asyncFn, 'asyncFn');
  const { signal } = options;

  let accumulator = initialValue;
  for (let i = 0; i < array.length; i += 1) {
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
      return callNodeIterator(reducer, [accumulator, value, index, array]);
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
  ABORT_MESSAGE,
  asyncMap,
  asyncMapCallback,
  asyncFilterMap,
  asyncFind,
  createAsyncController
};