const { createLogDecorator } = require('../src/utils/log-decorator');

const log = createLogDecorator({
  level: 'INFO',
  sink: (formatted) => console.log(formatted),
  formatter: (entry) => JSON.stringify(entry)
});

function add(a, b) {
  return a + b;
}

async function fetchProfile(name) {
  return { name, status: 'ready' };
}

const loggedAdd = log(add, { label: 'add' });
const loggedFetchProfile = log(fetchProfile, { label: 'fetchProfile' });

async function main() {
  console.log('Sync result:', loggedAdd(2, 3));
  console.log('Async result:', await loggedFetchProfile('octocat'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});