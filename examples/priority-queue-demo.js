import BrowserXTaskQueue from '../src/utils/priority-queue.js';

function main() {
  const queue = new BrowserXTaskQueue();

  queue.enqueue({ id: 'sync-settings' }, 4);
  queue.enqueue({ id: 'open-history' }, 2);
  queue.enqueue({ id: 'render-feed' }, 9);
  queue.enqueue({ id: 'save-session' }, 6);

  console.log('Task 4 demo: queue snapshot');
  console.table(queue.toArray());

  console.log('peek highest:', queue.peek('highest'));
  console.log('peek lowest:', queue.peek('lowest'));
  console.log('peek oldest:', queue.peek('oldest'));
  console.log('peek newest:', queue.peek('newest'));

  console.log('\ndequeue highest:', queue.dequeue('highest'));
  console.log('dequeue lowest:', queue.dequeue('lowest'));

  console.log('\nremaining queue');
  console.table(queue.toArray());
}

main();
