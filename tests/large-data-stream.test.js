import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createAbortError,
  readNdjsonFile,
  batchAsyncIterator,
  analyzeHistoryNdjsonFile,
} from '../src/utils/large-data-stream.js';

function writeTempNdjson(lines) {
  const file = path.join(os.tmpdir(), `ndjson-test-${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson`);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return file;
}

// ─── createAbortError ────────────────────────────────────────────────────────

test('createAbortError returns an Error with name=AbortError', () => {
  const err = createAbortError();
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'AbortError');
});

// ─── readNdjsonFile ──────────────────────────────────────────────────────────

test('readNdjsonFile yields parsed objects', async () => {
  const file = writeTempNdjson([
    JSON.stringify({ url: 'https://a.com', title: 'A' }),
    JSON.stringify({ url: 'https://b.com', title: 'B' }),
  ]);

  const results = [];
  for await (const row of readNdjsonFile(file)) {
    results.push(row);
  }
  fs.unlinkSync(file);

  assert.equal(results.length, 2);
  assert.equal(results[0].url, 'https://a.com');
  assert.equal(results[1].title, 'B');
});

test('readNdjsonFile skips blank lines', async () => {
  const file = writeTempNdjson([
    JSON.stringify({ url: 'https://a.com' }),
    '',
    '   ',
    JSON.stringify({ url: 'https://b.com' }),
  ]);

  const results = [];
  for await (const row of readNdjsonFile(file)) {
    results.push(row);
  }
  fs.unlinkSync(file);

  assert.equal(results.length, 2);
});

test('readNdjsonFile skips invalid JSON by default (skipInvalidLines=true)', async () => {
  const file = writeTempNdjson([
    JSON.stringify({ url: 'https://valid.com' }),
    'NOT { valid } JSON',
    JSON.stringify({ url: 'https://also-valid.com' }),
  ]);

  const results = [];
  for await (const row of readNdjsonFile(file)) {
    results.push(row);
  }
  fs.unlinkSync(file);

  assert.equal(results.length, 2);
});

test('readNdjsonFile throws SyntaxError when skipInvalidLines=false', async () => {
  const file = writeTempNdjson(['INVALID JSON']);

  await assert.rejects(async () => {
    for await (const _ of readNdjsonFile(file, { skipInvalidLines: false })) { /* drain */ }
  }, SyntaxError);

  fs.unlinkSync(file);
});

test('readNdjsonFile throws TypeError for empty filePath', async () => {
  await assert.rejects(async () => {
    for await (const _ of readNdjsonFile('')) { /* drain */ }
  }, TypeError);
});

test('readNdjsonFile throws TypeError for non-string filePath', async () => {
  await assert.rejects(async () => {
    for await (const _ of readNdjsonFile(null)) { /* drain */ }
  }, TypeError);
});

// ─── batchAsyncIterator ──────────────────────────────────────────────────────

test('batchAsyncIterator groups items into batches of given size', async () => {
  async function* gen() {
    for (let i = 0; i < 7; i += 1) yield i;
  }

  const batches = [];
  for await (const batch of batchAsyncIterator(gen(), 3)) {
    batches.push(batch);
  }

  assert.deepEqual(batches, [[0, 1, 2], [3, 4, 5], [6]]);
});

test('batchAsyncIterator handles exact multiple of batch size', async () => {
  async function* gen() {
    for (let i = 0; i < 6; i += 1) yield i;
  }

  const batches = [];
  for await (const batch of batchAsyncIterator(gen(), 3)) {
    batches.push(batch);
  }

  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 3);
});

test('batchAsyncIterator with single large batch', async () => {
  async function* gen() {
    for (let i = 0; i < 5; i += 1) yield i;
  }

  const batches = [];
  for await (const batch of batchAsyncIterator(gen(), 100)) {
    batches.push(batch);
  }

  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], [0, 1, 2, 3, 4]);
});

// ─── analyzeHistoryNdjsonFile ────────────────────────────────────────────────

test('analyzeHistoryNdjsonFile counts domains and finds top domains', async () => {
  const rows = [
    { url: 'https://github.com/a' },
    { url: 'https://github.com/b' },
    { url: 'https://google.com/search' },
    { url: 'not-a-valid-url' },
  ];
  const file = writeTempNdjson(rows.map((r) => JSON.stringify(r)));
  const result = await analyzeHistoryNdjsonFile(file, { topN: 5 });
  fs.unlinkSync(file);

  assert.equal(result.totalRows, 4);
  assert.equal(result.validUrlRows, 3);
  assert.equal(result.invalidUrlRows, 1);
  assert.equal(result.topDomains[0].domain, 'github.com');
  assert.equal(result.topDomains[0].visits, 2);
});

test('analyzeHistoryNdjsonFile supports targetUrl and link fields', async () => {
  const rows = [
    { targetUrl: 'https://example.com/page1' },
    { link: 'https://example.com/page2' },
  ];
  const file = writeTempNdjson(rows.map((r) => JSON.stringify(r)));
  const result = await analyzeHistoryNdjsonFile(file);
  fs.unlinkSync(file);

  assert.equal(result.validUrlRows, 2);
  assert.equal(result.topDomains[0].domain, 'example.com');
});

test('analyzeHistoryNdjsonFile respects topN limit', async () => {
  const rows = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'].map((d) =>
    JSON.stringify({ url: `https://${d}/` }),
  );
  const file = writeTempNdjson(rows);
  const result = await analyzeHistoryNdjsonFile(file, { topN: 3 });
  fs.unlinkSync(file);

  assert.equal(result.topDomains.length, 3);
});

test('analyzeHistoryNdjsonFile calls onProgress at reportEvery interval', async () => {
  const rows = Array.from({ length: 4 }, (_, i) =>
    JSON.stringify({ url: `https://site${i}.com/` }),
  );
  const file = writeTempNdjson(rows);

  const progressUpdates = [];
  await analyzeHistoryNdjsonFile(file, {
    reportEvery: 2,
    onProgress: (info) => progressUpdates.push(info),
  });
  fs.unlinkSync(file);

  assert.ok(progressUpdates.length > 0);
  assert.ok(typeof progressUpdates[0].processedRows === 'number');
  assert.ok(typeof progressUpdates[0].uniqueDomains === 'number');
});

test('analyzeHistoryNdjsonFile returns zero counts for empty file', async () => {
  const file = writeTempNdjson([]);
  const result = await analyzeHistoryNdjsonFile(file);
  fs.unlinkSync(file);

  assert.equal(result.totalRows, 0);
  assert.equal(result.uniqueDomains, 0);
  assert.deepEqual(result.topDomains, []);
});
