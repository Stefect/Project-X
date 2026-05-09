import {
  asyncMap,
  asyncFilterMap,
  asyncFind,
  asyncMapCallback,
  createAsyncController
} from '../src/utils/async-array.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Promise-based map with concurrency limit ---
async function demoPromiseMap() {
  const jobs = ['feed', 'search', 'translate', 'summary', 'bookmarks'];
  const startedAt = Date.now();

  const results = await asyncMap(
    jobs,
    async (job, index) => {
      const lag = 80 + Math.floor(Math.random() * 160);
      await wait(lag);
      return { job, slot: index, lag, finishedAt: Date.now() - startedAt };
    },
    { concurrency: 2 }
  );

  console.log('Task 5 demo: Promise-based asyncMap (concurrency=2)');
  console.table(results);
}

// --- filterMap: skip low-quality items ---
async function demoFilterMap() {
  const items = [
    { title: 'AI Safety', quality: 9 },
    { title: 'Rumor Thread', quality: 2 },
    { title: 'Node.js 22', quality: 8 },
    { title: 'Ad Banner', quality: 1 }
  ];

  const results = await asyncFilterMap(items, async (item) => {
    await wait(20);
    return item.quality < 5 ? asyncFilterMap.skip : `${item.title} (${item.quality}/10)`;
  });

  console.log('\nTask 5 demo: asyncFilterMap (skip low-quality)');
  console.log(results);
}

// --- async/await: find with AbortController timeout ---
async function demoFindWithAbort() {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  const control = createAsyncController(140);

  try {
    const found = await asyncFind(
      words,
      async (word) => {
        await wait(60);
        return word.startsWith('d');
      },
      { signal: control.signal }
    );
    control.clearTimeout();
    console.log('\nTask 5 demo: asyncFind with async/await');
    console.log('found:', found, '| aborted:', false);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('\nTask 5 demo: asyncFind aborted by timeout');
      console.log('found: undefined | aborted:', true);
    } else {
      throw error;
    }
  }
}


// --- Callback-based version ---
function demoCallback() {
  return new Promise((resolve, reject) => {
    const numbers = [1, 2, 3, 4, 5, 6];

    asyncMapCallback(
      numbers,
      (value, index, _array, callback) => {
        const delay = 15 + index * 10;
        setTimeout(() => callback(null, value * value), delay);
      },
      (err, result) => {
        if (err) { reject(err); return; }
        console.log('\nTask 5 demo: callback-based asyncMapCallback');
        console.log('squares:', result);
        resolve();
      },
      { concurrency: 3 }
    );
  });
}

// --- Abortable map: cancel mid-flight ---
async function demoAbortMidFlight() {
  const items = [10, 20, 30, 40, 50];
  const control = createAsyncController(80);

  try {
    await asyncMap(
      items,
      async (value) => {
        await wait(40);
        return value * 2;
      },
      { signal: control.signal }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('\nTask 5 demo: asyncMap aborted mid-flight');
      console.log('AbortError caught as expected');
    } else {
      throw error;
    }
  }
}

async function main() {
  await demoPromiseMap();
  await demoFilterMap();
  await demoFindWithAbort();
  await demoCallback();
  await demoAbortMidFlight();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
