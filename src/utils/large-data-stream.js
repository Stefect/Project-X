import fs from 'fs';
import readline from 'readline';
import { createAbortError, throwIfAborted } from './async-array.js';

function toFinitePositiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.floor(numeric));
}

function toHostname(rawUrl) {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(String(rawUrl));
    return parsed.hostname.toLowerCase();
  } catch (_error) {
    return null;
  }
}

async function* readNdjsonFile(filePath, options = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new TypeError('filePath must be a non-empty string');
  }

  const {
    signal,
    skipInvalidLines = true,
    highWaterMark = 64 * 1024
  } = options;

  throwIfAborted(signal);

  const stream = fs.createReadStream(filePath, {
    encoding: 'utf8',
    highWaterMark
  });

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;

  try {
    for await (const line of rl) {
      throwIfAborted(signal);
      lineNumber += 1;

      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        yield JSON.parse(trimmed);
      } catch (error) {
        if (skipInvalidLines) {
          continue;
        }

        error.message = `Invalid JSON at line ${lineNumber}: ${error.message}`;
        throw error;
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}

async function* batchAsyncIterator(source, batchSize = 1000, options = {}) {
  const size = toFinitePositiveInt(batchSize, 1000);
  const { signal } = options;

  let batch = [];

  for await (const item of source) {
    throwIfAborted(signal);
    batch.push(item);

    if (batch.length >= size) {
      yield batch;
      batch = [];
    }
  }

  if (batch.length > 0) {
    yield batch;
  }
}

async function analyzeHistoryNdjsonFile(filePath, options = {}) {
  const {
    topN = 10,
    signal,
    reportEvery = 50000,
    onProgress = null,
    skipInvalidLines = true
  } = options;

  const topLimit = toFinitePositiveInt(topN, 10);
  const reportStep = toFinitePositiveInt(reportEvery, 50000);

  const visitsByDomain = new Map();
  let totalRows = 0;
  let validUrlRows = 0;
  let invalidUrlRows = 0;

  // Переходимо по всіх рядках, накопичуємо кількість візитів за кожним доменом
  for await (const row of readNdjsonFile(filePath, { signal, skipInvalidLines })) {
    throwIfAborted(signal);
    totalRows += 1;

    const hostname = toHostname(row.url || row.targetUrl || row.link);
    if (!hostname) {
      invalidUrlRows += 1;
      continue;
    }

    validUrlRows += 1;
    visitsByDomain.set(hostname, (visitsByDomain.get(hostname) || 0) + 1);

    if (typeof onProgress === 'function' && totalRows % reportStep === 0) {
      onProgress({
        processedRows: totalRows,
        uniqueDomains: visitsByDomain.size
      });
    }
  }

  // Сортуємо домени за спаданням відвідувань і беремо топ-N
  const topDomains = Array.from(visitsByDomain.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topLimit)
    .map(([domain, visits]) => ({ domain, visits }));

  return {
    totalRows,
    validUrlRows,
    invalidUrlRows,
    uniqueDomains: visitsByDomain.size,
    topDomains
  };
}

export {
  createAbortError,
  readNdjsonFile,
  batchAsyncIterator,
  analyzeHistoryNdjsonFile
};