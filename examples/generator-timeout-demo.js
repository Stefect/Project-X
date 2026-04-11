const {
  incrementalCounterGenerator,
  dayCycleGenerator,
  randomNumberGenerator,
  consumeGeneratorWithTimeout
} = require('../src/modules/ai-feed');

async function runCounterDemo() {
  const counter = incrementalCounterGenerator(7, 3);
  const seen = [];

  await consumeGeneratorWithTimeout(counter, 200, (value, iteration) => {
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
  const dayIterator = dayCycleGenerator('Friday');
  const days = [];

  await consumeGeneratorWithTimeout(dayIterator, 100, (value, iteration) => {
    days.push(value);
    if (iteration >= 10) {
      return false;
    }
    return true;
  });

  return days;
}

async function runRandomDemo() {
  const randomIterator = randomNumberGenerator(10, 20);
  const values = [];

  await consumeGeneratorWithTimeout(randomIterator, 120, (value, iteration) => {
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
