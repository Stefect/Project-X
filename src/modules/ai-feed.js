import { BaseHttpClient } from '../http/base-client.js';
import { RateLimitProxy } from '../http/proxies/rate-limit-proxy.js';

const httpClient = new RateLimitProxy(
  new BaseHttpClient(),
  { requestsPerInterval: 60, intervalMs: 60000 }
);

const FEED_LOOP_DELAY_MS = 1800;
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

function createFeedSourceRotationIterator(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('Feed sources must be a non-empty array');
  }

  let index = 0;

  return {
    next() {
      const current = sources[index];
      index = (index + 1) % sources.length;
      return { value: current, done: false };
    }
  };
}

async function fetchJson(url, options = {}) {
  const res = await httpClient.request({ url, headers: options.headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.data;
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

function createFeedCategoryMatcher(categories = ['all']) {
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

function rememberSeenFeedArticle(seenKeys, seenOrder, key) {
  seenKeys.add(key);
  seenOrder.push(key);

  if (seenOrder.length > MAX_SEEN_ARTICLES) {
    const oldestKey = seenOrder.shift();
    seenKeys.delete(oldestKey);
  }
}

async function* infiniteArticleGenerator(categories = ['all']) {
  const sources = NEWS_SOURCES;
  const sourceIterator = createFeedSourceRotationIterator(sources);
  const shouldIncludeCategory = createFeedCategoryMatcher(categories);

  const seenKeys = new Set();
  const seenOrder = [];

  while (true) {
    const source = sourceIterator.next().value;
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

      rememberSeenFeedArticle(seenKeys, seenOrder, articleKey);
      yield article;
    }

    await sleep(FEED_LOOP_DELAY_MS);
  }
}

export {
  NEWS_SOURCES,
  infiniteArticleGenerator
};