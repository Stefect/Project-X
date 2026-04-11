const fetch = require('node-fetch');

const FEED_LOOP_DELAY_MS = 1800;
const MAX_SEEN_ARTICLES = 1500;
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const NEWS_SOURCES = [
  {
    name: 'HackerNews',
    url: 'https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=10'
  },
  {
    name: 'DevTo',
    url: 'https://dev.to/api/articles?per_page=10'
  },
  {
    name: 'Reddit',
    url: 'https://www.reddit.com/r/programming.json?limit=10'
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSourceList(customSources = []) {
  if (!Array.isArray(customSources) || customSources.length === 0) {
    return NEWS_SOURCES;
  }

  const sanitized = customSources.filter((source) => {
    return source && typeof source.name === 'string' && typeof source.url === 'string';
  });

  return sanitized.length > 0 ? sanitized : NEWS_SOURCES;
}

function* cycleGenerator(items, startIndex = 0) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Items must be a non-empty array');
  }

  const length = items.length;
  let index = ((Math.floor(Number(startIndex) || 0) % length) + length) % length;

  while (true) {
    yield items[index];
    index = (index + 1) % length;
  }
}

function* roundRobinSourceGenerator(sources) {
  yield* cycleGenerator(sources);
}

function* incrementalCounterGenerator(start = 0, step = 1) {
  let value = Number.isFinite(Number(start)) ? Number(start) : 0;
  const strideRaw = Number(step);
  const stride = Number.isFinite(strideRaw) && strideRaw !== 0 ? strideRaw : 1;

  while (true) {
    yield value;
    value += stride;
  }
}

function* dayCycleGenerator(startDay = 'Monday') {
  const normalized = String(startDay || '').toLowerCase();
  const startIndex = WEEK_DAYS.findIndex((day) => day.toLowerCase() === normalized);
  const safeStartIndex = startIndex === -1 ? 0 : startIndex;

  yield* cycleGenerator(WEEK_DAYS, safeStartIndex);
}

function* randomNumberGenerator(min = 0, max = 1) {
  const minValue = Number(min);
  const maxValue = Number(max);

  const safeMin = Number.isFinite(minValue) ? minValue : 0;
  const safeMax = Number.isFinite(maxValue) ? maxValue : 1;
  const low = Math.min(safeMin, safeMax);
  const high = Math.max(safeMin, safeMax);

  while (true) {
    yield Math.random() * (high - low) + low;
  }
}

function normalizeIteratorSource(iteratorLike) {
  if (typeof iteratorLike === 'function') {
    return normalizeIteratorSource(iteratorLike());
  }

  if (iteratorLike && typeof iteratorLike[Symbol.asyncIterator] === 'function') {
    return iteratorLike[Symbol.asyncIterator]();
  }

  if (iteratorLike && typeof iteratorLike[Symbol.iterator] === 'function') {
    return iteratorLike[Symbol.iterator]();
  }

  throw new TypeError('Expected an iterator, async iterator, or generator function');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchHackerNews() {
  try {
    const data = await fetchJson(NEWS_SOURCES[0].url);
    return (data.hits || []).map((hit) => ({
      title: hit.title,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      source: 'HackerNews',
      category: 'tech'
    }));
  } catch (_error) {
    return [];
  }
}

async function fetchDevTo() {
  try {
    const data = await fetchJson(NEWS_SOURCES[1].url);
    return (data || []).map((article) => ({
      title: article.title,
      url: article.url,
      source: 'DevTo',
      category: article.tag_list?.[0] || 'tech'
    }));
  } catch (_error) {
    return [];
  }
}

async function fetchReddit() {
  try {
    const data = await fetchJson(NEWS_SOURCES[2].url, {
      headers: { 'User-Agent': 'BrowserX/2.0' }
    });

    return (data.data?.children || []).map((post) => ({
      title: post.data.title,
      url: post.data.url,
      source: 'Reddit',
      category: 'programming'
    }));
  } catch (_error) {
    return [];
  }
}

const SOURCE_FETCHERS = {
  HackerNews: fetchHackerNews,
  DevTo: fetchDevTo,
  Reddit: fetchReddit
};

function createCategoryMatcher(categories = ['all']) {
  const categorySet = new Set(
    (Array.isArray(categories) ? categories : [categories])
      .map((value) => String(value || '').toLowerCase())
  );

  const allowAll = categorySet.has('all') || categorySet.size === 0;

  return (article) => {
    if (allowAll) return true;
    return categorySet.has(String(article.category || '').toLowerCase());
  };
}

function rememberArticleKey(seenKeys, seenOrder, key) {
  seenKeys.add(key);
  seenOrder.push(key);

  if (seenOrder.length > MAX_SEEN_ARTICLES) {
    const oldestKey = seenOrder.shift();
    seenKeys.delete(oldestKey);
  }
}

async function* infiniteArticleGenerator(categories = ['all'], customSources = []) {
  const sources = normalizeSourceList(customSources);
  const sourceGenerator = roundRobinSourceGenerator(sources);
  const shouldIncludeCategory = createCategoryMatcher(categories);

  const seenKeys = new Set();
  const seenOrder = [];

  while (true) {
    const source = sourceGenerator.next().value;
    const fetcher = SOURCE_FETCHERS[source.name];

    if (!fetcher) {
      await sleep(FEED_LOOP_DELAY_MS);
      continue;
    }

    const articles = await fetcher();

    for (const article of articles) {
      const articleKey = article.url || `${source.name}-${article.title}`;

      if (seenKeys.has(articleKey)) {
        continue;
      }

      if (!shouldIncludeCategory(article)) {
        continue;
      }

      rememberArticleKey(seenKeys, seenOrder, articleKey);
      yield article;
    }

    await sleep(FEED_LOOP_DELAY_MS);
  }
}

async function consumeGeneratorWithTimeout(iteratorLike, timeoutMs, processItem = null) {
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  if (timeout === 0) {
    return [];
  }

  const iterator = normalizeIteratorSource(iteratorLike);
  const deadline = Date.now() + timeout;
  const collected = [];
  let iteration = 0;

  try {
    while (Date.now() < deadline) {
      const nextState = await iterator.next();
      if (nextState.done) {
        break;
      }

      const value = nextState.value;
      collected.push(value);
      iteration += 1;

      if (typeof processItem === 'function') {
        const hookResult = await processItem(value, iteration);
        if (hookResult === false) {
          break;
        }
      }

      if (iteration % 250 === 0) {
        await Promise.resolve();
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

module.exports = {
  NEWS_SOURCES,
  cycleGenerator,
  roundRobinSourceGenerator,
  incrementalCounterGenerator,
  dayCycleGenerator,
  randomNumberGenerator,
  infiniteArticleGenerator,
  consumeGeneratorWithTimeout
};