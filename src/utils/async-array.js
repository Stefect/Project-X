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

  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, array.length) }, async () => {
      while (cursor < array.length) {
        const index = cursor++;
        await runOne(index);
      }
    })
  );
  return result;
}

function asyncMapCallback(arr, asyncFn, callback, options = {}) {
  const mapper = toFunctionOrThrow(asyncFn, 'asyncFn');
  const cb = toFunctionOrThrow(callback, 'callback');

  asyncMap(
    arr,
    (value, index, array) => new Promise((resolve, reject) => {
      try {
        mapper(value, index, array, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    }),
    options
  ).then((result) => cb(null, result)).catch((err) => cb(err));
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

async function asyncFind(arr, asyncPredicate, options = {}) {
  const array = toArrayOrThrow(arr);
  const index = await asyncFindIndex(array, asyncPredicate, options);
  return index === -1 ? undefined : array[index];
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

export {
  ABORT_MESSAGE,
  createAbortError,
  throwIfAborted,
  asyncMap,
  asyncMapCallback,
  asyncFilterMap,
  asyncFind,
  createAsyncController
};