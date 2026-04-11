const axios = require('axios');
const RSSParser = require('rss-parser');

const rssParser = new RSSParser({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrowserX/2.0)' }
});

const CATEGORIES = {
  tech:    '💻 Технології',
  ai:      '🤖 ШІ',
  science: '🔬 Наука',
  gaming:  '🎮 Ігри',
  ukraine: '🇺🇦 Україна',
  crypto:  '₿ Крипто',
};

const SOURCES = [
  { id: 'reddit-tech',        category: 'tech',    label: 'r/technology',      type: 'reddit',     url: 'https://www.reddit.com/r/technology/hot.json?limit=15' },
  { id: 'reddit-programming', category: 'tech',    label: 'r/programming',     type: 'reddit',     url: 'https://www.reddit.com/r/programming/hot.json?limit=15' },
  { id: 'hackernews',         category: 'tech',    label: 'Hacker News',       type: 'hackernews', url: 'https://hacker-news.firebaseio.com/v0/topstories.json' },
  { id: 'devto',              category: 'tech',    label: 'Dev.to',            type: 'devto',      url: 'https://dev.to/api/articles?top=7&per_page=10' },
  { id: 'reddit-ai',          category: 'ai',      label: 'r/artificial',      type: 'reddit',     url: 'https://www.reddit.com/r/artificial/hot.json?limit=10' },
  { id: 'reddit-ml',          category: 'ai',      label: 'r/MachineLearning', type: 'reddit',     url: 'https://www.reddit.com/r/MachineLearning/hot.json?limit=10' },
  { id: 'reddit-science',     category: 'science', label: 'r/science',         type: 'reddit',     url: 'https://www.reddit.com/r/science/hot.json?limit=10' },
  { id: 'reddit-gaming',      category: 'gaming',  label: 'r/gaming',          type: 'reddit',     url: 'https://www.reddit.com/r/gaming/hot.json?limit=10' },
  { id: 'reddit-games',       category: 'gaming',  label: 'r/Games',           type: 'reddit',     url: 'https://www.reddit.com/r/Games/hot.json?limit=10' },
  { id: 'reddit-ukraine',     category: 'ukraine', label: 'r/ukraine',         type: 'reddit',     url: 'https://www.reddit.com/r/ukraine/hot.json?limit=10' },
  { id: 'reddit-crypto',      category: 'crypto',  label: 'r/CryptoCurrency',  type: 'reddit',     url: 'https://www.reddit.com/r/CryptoCurrency/hot.json?limit=10' },
  { id: 'reddit-bitcoin',     category: 'crypto',  label: 'r/Bitcoin',         type: 'reddit',     url: 'https://www.reddit.com/r/Bitcoin/hot.json?limit=10' },
];

function formatTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} д тому`;
  if (h > 0) return `${h} год тому`;
  if (m > 0) return `${m} хв тому`;
  return 'Щойно';
}

async function fetchFromSource(source) {
  try {
    if (source.type === 'reddit') {
      const res = await axios.get(source.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrowserX/2.0)' },
        timeout: 8000
      });
      return (res.data?.data?.children || [])
        .filter(p => !p.data.stickied && p.data.title)
        .slice(0, 5)
        .map(p => ({
          title:    p.data.title,
          url:      p.data.url.startsWith('https://www.reddit.com') ? `https://reddit.com${p.data.permalink}` : p.data.url,
          source:   source.label,
          category: source.category,
          time:     formatTime(p.data.created_utc * 1000)
        }));
    }

    if (source.type === 'hackernews') {
      const idsRes = await axios.get(source.url, { timeout: 6000 });
      const ids = idsRes.data.slice(0, 10);
      const settled = await Promise.allSettled(
        ids.map(id => axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 }))
      );
      return settled
        .filter(r => r.status === 'fulfilled' && r.value.data?.title)
        .map(r => ({
          title:    r.value.data.title,
          url:      r.value.data.url || `https://news.ycombinator.com/item?id=${r.value.data.id}`,
          source:   source.label,
          category: source.category,
          time:     formatTime(r.value.data.time * 1000)
        }));
    }

    if (source.type === 'devto') {
      const res = await axios.get(source.url, { timeout: 8000 });
      return (res.data || []).slice(0, 5).map(a => ({
        title:    a.title,
        url:      a.url,
        source:   source.label,
        category: source.category,
        time:     formatTime(new Date(a.published_at).getTime())
      }));
    }

    if (source.type === 'rss') {
      const feed = await rssParser.parseURL(source.url);
      return (feed.items || []).slice(0, 5).map(item => ({
        title:    item.title,
        url:      item.link,
        source:   source.label,
        category: source.category,
        time:     item.pubDate ? formatTime(new Date(item.pubDate).getTime()) : 'Нещодавно'
      }));
    }
  } catch (e) {
    console.warn(`[NEWS] Source "${source.id}" failed: ${e.message}`);
  }
  return [];
}

async function fetchNewsArticles(selectedCategories, count = 15) {
  const sources = SOURCES.filter(s => selectedCategories.includes(s.category));
  if (!sources.length) return [];

  const results = await Promise.allSettled(sources.map(fetchFromSource));
  const all = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.slice(0, count);
}

module.exports = { fetchNewsArticles, CATEGORIES, SOURCES };
