import * as asyncArray from './async-array.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function demoPromiseMapWithConcurrency() {
  const jobs = ['feed', 'search', 'translate', 'summary', 'bookmarks'];
  const startedAt = Date.now();

  return asyncArray.asyncMap(
    jobs,
    async (job, index) => {
      const lag = 80 + Math.floor(Math.random() * 160);
      await wait(lag);
      return {
        job,
        slot: index,
        lag,
        finishedAt: Date.now() - startedAt
      };
    },
    { concurrency: 2 }
  );
}

async function demoFilterMap() {
  const items = [
    { title: 'AI Safety', quality: 9 },
    { title: 'Rumor Thread', quality: 2 },
    { title: 'Node.js 22', quality: 8 },
    { title: 'Ad Banner', quality: 1 }
  ];

  return asyncArray.asyncFilterMap(items, async (item) => {
    await wait(20);
    if (item.quality < 5) {
      return asyncArray.asyncFilterMap.skip;
    }

    return `${item.title} (${item.quality}/10)`;
  });
}

async function demoFindWithAbort() {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  const control = asyncArray.createAsyncController(140);

  try {
    const found = await asyncArray.asyncFind(
      words,
      async (word) => {
        await wait(60);
        return word.startsWith('d');
      },
      { signal: control.signal }
    );

    control.clearTimeout();
    return { found, aborted: false };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { found: undefined, aborted: true };
    }
    throw error;
  }
}

function demoCallbackBatch(done) {
  const numbers = [1, 2, 3, 4, 5, 6];

  asyncArray.asyncMapCallback(
    numbers,
    (value, index, _array, callback) => {
      const delay = 15 + index * 10;
      setTimeout(() => callback(null, value * value), delay);
    },
    done,
    { concurrency: 3 }
  );
}

async function runAllDemos() {
  console.log('Task 5 Demo: Promise map with limited concurrency');
  console.table(await demoPromiseMapWithConcurrency());

  console.log('\nTask 5 Demo: filterMap');
  console.log(await demoFilterMap());

  console.log('\nTask 5 Demo: find with abort controller');
  console.log(await demoFindWithAbort());

  console.log('\nTask 5 Demo: callback API');
  await new Promise((resolve, reject) => {
    demoCallbackBatch((err, result) => {
      if (err) {
        reject(err);
        return;
      }
      console.log(result);
      resolve();
    });
  });
}

if (require.main === module) {
  runAllDemos().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  demoPromiseMapWithConcurrency,
  demoFilterMap,
  demoFindWithAbort,
  demoCallbackBatch,
  runAllDemos
};
