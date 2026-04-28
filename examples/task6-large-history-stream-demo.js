import fs from 'fs';
import os from 'os';
import path from 'path';
import { once } from 'events';

import {
  analyzeHistoryNdjsonFile,
  batchAsyncIterator,
  readNdjsonFile
} from '../src/utils/large-data-stream.js';

const DEFAULT_ROWS = 120000;
const SOURCE_DOMAINS = [
  'news.ycombinator.com',
  'github.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'dev.to',
  'reddit.com',
  'electronjs.org',
  'nodejs.org'
];

function toMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function randomDomain() {
  const index = Math.floor(Math.random() * SOURCE_DOMAINS.length);
  return SOURCE_DOMAINS[index];
}

async function writeLine(stream, line) {
  if (stream.write(line)) {
    return;
  }

  await once(stream, 'drain');
}

async function generateLargeNdjson(filePath, rows = DEFAULT_ROWS) {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });

  try {
    for (let i = 0; i < rows; i += 1) {
      const domain = randomDomain();
      const row = {
        id: i + 1,
        url: `https://${domain}/article/${i + 1}`,
        title: `Article ${i + 1}`,
        visitedAt: Date.now() - i * 1000
      };

      await writeLine(stream, `${JSON.stringify(row)}\n`);
    }
  } finally {
    stream.end();
    await once(stream, 'close');
  }
}

async function main() {
  const totalRows = Number(process.argv[2]) || DEFAULT_ROWS;
  const filePath = path.join(os.tmpdir(), `browserx-history-${Date.now()}.ndjson`);

  console.log('Task 6 demo: incremental processing for large dataset');
  console.log(`Temporary dataset: ${filePath}`);
  console.log(`Rows to generate: ${totalRows}`);

  const heapBefore = process.memoryUsage().heapUsed;
  await generateLargeNdjson(filePath, totalRows);
  const heapAfterGenerate = process.memoryUsage().heapUsed;

  const summary = await analyzeHistoryNdjsonFile(filePath, {
    topN: 5,
    reportEvery: Math.max(10000, Math.floor(totalRows / 5)),
    onProgress: ({ processedRows, uniqueDomains }) => {
      console.log(`processed: ${processedRows}, unique domains: ${uniqueDomains}`);
    }
  });

  console.log('\nTop domains (stream analysis):');
  console.table(summary.topDomains);

  let firstBatchSize = 0;
  for await (const batch of batchAsyncIterator(readNdjsonFile(filePath), 5000)) {
    firstBatchSize = batch.length;
    break;
  }

  console.log(`First streamed batch size: ${firstBatchSize}`);
  console.log(`Heap before generate: ${toMb(heapBefore)} MB`);
  console.log(`Heap after generate: ${toMb(heapAfterGenerate)} MB`);
  console.log(`Heap after analysis: ${toMb(process.memoryUsage().heapUsed)} MB`);

  fs.unlinkSync(filePath);
  console.log('Temporary file deleted');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});