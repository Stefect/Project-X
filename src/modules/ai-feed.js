const fetch = require('node-fetch');

const FEED_LOOP_DELAY_MS = 2000;
const MAX_SEEN_ARTICLES = 1500;

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

function* roundRobinSourceGenerator(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('Source list must contain at least one source');
  }

  let index = 0;
  while (true) {
    yield sources[index % sources.length];
    index += 1;
  }
}
function* incrementalCounterGenerator(start = 0, step = 1) {
  let value = Number(start) || 0;
  const stride = Number(step) || 1;

  while (true) {
    yield value;
    value += stride;
  }
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

async function consumeGeneratorWithTimeout(generator, timeoutMs, processItem = null) {
  if (!generator || typeof generator[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('Expected an async iterator');
  }

  const timeout = Math.max(0, Number(timeoutMs) || 0);
  if (timeout === 0) {
    return [];
  }

  const startedAt = Date.now();
  const collected = [];

  let iteration = 0;
  for await (const value of generator) {
    if (Date.now() - startedAt >= timeout) {
      break;
    }

    collected.push(value);
    iteration += 1;

    if (typeof processItem === 'function') {
      await processItem(value, iteration);
    }
  }

  return collected;
}

module.exports = {
  NEWS_SOURCES,
  roundRobinSourceGenerator,
  incrementalCounterGenerator,
  infiniteArticleGenerator,
  consumeGeneratorWithTimeout
};