// Повідомлення про скасування та символ для пропуску елемента в asyncFilterMap
const ABORT_MESSAGE = 'Операцію скасовано';
const FILTER_MAP_SKIP = Symbol('asyncFilterMap.skip');

// Створює помилку типу AbortError для зупинки асинхронних операцій
function createAbortError() {
  const error = new Error(ABORT_MESSAGE);
  error.name = 'AbortError';
  return error;
}

// Викидає AbortError, якщо сигнал скасування вже активовано
function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw createAbortError();
  }
}

// Валідація: викидає TypeError, якщо значення не є масивом
function toArrayOrThrow(arr) {
  if (!Array.isArray(arr)) {
    throw new TypeError('Expected an array');
  }
  return arr;
}

// Валідація: викидає TypeError, якщо значення не є функцією
function toFunctionOrThrow(fn, name) {
  if (typeof fn !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
  return fn;
}

// Нормалізує ліміт одночасності: Infinity — необмежена, число — мінімум 1
function normalizeConcurrency(concurrency) {
  if (concurrency === Infinity) return Infinity;
  if (!Number.isFinite(concurrency)) return Infinity;
  return Math.max(1, Math.floor(concurrency));
}

// Асинхронно перетворює елементи масиву через asyncFn з контролем одночасності та підтримкою AbortSignal
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

  // Запуск з обмеженою кількістю вороночно активних завдань
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

// Варіант asyncMap з callback-стилем (Node.js-сумісність з помилкою у першому аргументі)
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

// Перетворює і одночасно фільтрує елементи: пропускає ті, що повернули FILTER_MAP_SKIP або { skip: true }
async function asyncFilterMap(arr, asyncMapper, options = {}) {
  const array = toArrayOrThrow(arr);
  const mapper = toFunctionOrThrow(asyncMapper, 'asyncMapper');

  const mapped = await asyncMap(array, mapper, options);
  throwIfAborted(options.signal);

  const compact = [];
  for (const value of mapped) {
    // Пропуск через Symbol-маркер (asyncFilterMap.skip)
    if (value === FILTER_MAP_SKIP) {
      continue;
    }
    // Пропуск через об'єкт-маркер { skip: true }
    if (value && typeof value === 'object' && value.skip === true) {
      continue;
    }

    compact.push(value);
  }

  return compact;
}

asyncFilterMap.skip = FILTER_MAP_SKIP;

// Повертає індекс першого елементу, одякового предикату, або -1 якщо не знайдено
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

// Повертає перший елемент, одяковий предикату, або undefined
async function asyncFind(arr, asyncPredicate, options = {}) {
  const array = toArrayOrThrow(arr);
  const index = await asyncFindIndex(array, asyncPredicate, options);
  return index === -1 ? undefined : array[index];
}

// Створює AbortController з опціональним таймаутом:
// повертає { controller, signal, cancel, clearTimeout, aborted }
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