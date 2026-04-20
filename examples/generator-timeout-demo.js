const BROWSER_WORKWEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function* browserSessionCounter(start = 7, step = 3) {
  let value = Number.isFinite(Number(start)) ? Number(start) : 0;
  const strideRaw = Number(step);
  const stride = Number.isFinite(strideRaw) && strideRaw !== 0 ? strideRaw : 1;

  while (true) {
    yield value;
    value += stride;
  }
}

function* browserWorkdayTicker(startDay = 'Monday') {
  const normalizedStart = String(startDay || '').toLowerCase();
  const startIndex = BROWSER_WORKWEEK.findIndex((day) => day.toLowerCase() === normalizedStart);
  let index = startIndex === -1 ? 0 : startIndex;

  while (true) {
    yield BROWSER_WORKWEEK[index];
    index = (index + 1) % BROWSER_WORKWEEK.length;
  }
}

function* browserLatencyPulse(min = 0, max = 1) {
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : 0;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : 1;
  const low = Math.min(safeMin, safeMax);
  const high = Math.max(safeMin, safeMax);

  while (true) {
    yield Math.random() * (high - low) + low;
  }
}

function toIterator(streamLike) {
  if (typeof streamLike === 'function') {
    return toIterator(streamLike());
  }

  if (streamLike && typeof streamLike[Symbol.asyncIterator] === 'function') {
    return streamLike[Symbol.asyncIterator]();
  }

  if (streamLike && typeof streamLike[Symbol.iterator] === 'function') {
    return streamLike[Symbol.iterator]();
  }

  throw new TypeError('Expected generator, iterator, or iterator factory');
}

async function collectFromStreamForWindow(streamLike, timeoutMs, onItem) {
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  if (timeout === 0) {
    return [];
  }

  const iterator = toIterator(streamLike);
  const stopAt = Date.now() + timeout;
  const collected = [];
  let iteration = 0;

  try {
    while (Date.now() < stopAt) {
      const next = await iterator.next();
      if (next.done) {
        break;
      }

      const value = next.value;
      collected.push(value);
      iteration += 1;

      if (typeof onItem === 'function') {
        const shouldContinue = await onItem(value, iteration);
        if (shouldContinue === false) {
          break;
        }
      }
    }
  } finally {
    if (typeof iterator.return === 'function') {
      try {
        await iterator.return();
      } catch (_error) {
      }
    }
  }

  return collected;
}

async function runCounterDemo() {
  const counter = browserSessionCounter(7, 3);
  const seen = [];

  await collectFromStreamForWindow(counter, 200, (value, iteration) => {
    seen.push(value);
    if (iteration >= 12) {
      return false;
    }
    return true;
  });

  const total = seen.reduce((sum, value) => sum + value, 0);
  return { seen, total };
}

async function runDayDemo() {
  const dayIterator = browserWorkdayTicker('Friday');
  const days = [];

  await collectFromStreamForWindow(dayIterator, 100, (value, iteration) => {
    days.push(value);
    if (iteration >= 10) {
      return false;
    }
    return true;
  });

  return days;
}

async function runRandomDemo() {
  const randomIterator = browserLatencyPulse(10, 20);
  const values = [];

  await collectFromStreamForWindow(randomIterator, 120, (value, iteration) => {
    values.push(Number(value.toFixed(2)));
    if (iteration >= 8) {
      return false;
    }
    return true;
  });

  return values;
}

async function main() {
  const counterResult = await runCounterDemo();
  const dayResult = await runDayDemo();
  const randomResult = await runRandomDemo();

  console.log('Task 1 demo: incremental generator + timeout iterator');
  console.log('sequence:', counterResult.seen.join(', '));
  console.log('sum:', counterResult.total);

  console.log('\nTask 1 demo: day cycle generator');
  console.log(dayResult.join(' -> '));

  console.log('\nTask 1 demo: random stream snapshot');
  console.log(randomResult.join(', '));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
