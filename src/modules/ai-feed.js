const fetch = require('node-fetch');

const NEWS_SOURCES = [
    { name: 'HackerNews', url: 'https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=10' },
    { name: 'DevTo', url: 'https://dev.to/api/articles?per_page=10' },
    { name: 'Reddit', url: 'https://www.reddit.com/r/programming.json?limit=10' }
];

function* roundRobinSourceGenerator(sources) {
    let index = 0;
    while (true) {
        yield sources[index];
        index = (index + 1) % sources.length;
    }
}

async function fetchHackerNews() {
    try {
        const res = await fetch(NEWS_SOURCES[0].url);
        const data = await res.json();
        return data.hits.map(hit => ({
            title: hit.title,
            url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            source: 'HackerNews',
            category: 'tech'
        }));
    } catch (err) {
        return [];
    }
}

async function fetchDevTo() {
    try {
        const res = await fetch(NEWS_SOURCES[1].url);
        const data = await res.json();
        return data.map(article => ({
            title: article.title,
            url: article.url,
            source: 'DevTo',
            category: article.tag_list[0] || 'tech'
        }));
    } catch (err) {
        return [];
    }
}

async function fetchReddit() {
    try {
        const res = await fetch(NEWS_SOURCES[2].url, {
            headers: { 'User-Agent': 'BrowserX/2.0' }
        });
        const data = await res.json();
        return data.data.children.map(post => ({
            title: post.data.title,
            url: post.data.url,
            source: 'Reddit',
            category: 'programming'
        }));
    } catch (err) {
        return [];
    }
}

const SOURCE_FETCHERS = {
    'HackerNews': fetchHackerNews,
    'DevTo': fetchDevTo,
    'Reddit': fetchReddit
};

async function* infiniteArticleGenerator(categories = ['all'], customSources = []) {
    const sources = customSources.length > 0 ? customSources : NEWS_SOURCES;
    const sourceGen = roundRobinSourceGenerator(sources);

    const fetchedArticles = new Set();

    while (true) {
        const source = sourceGen.next().value;
        const fetcherFn = SOURCE_FETCHERS[source.name];

        if (!fetcherFn) continue;

        const articles = await fetcherFn();

        for (const article of articles) {
            const articleKey = `${article.url}`;

            if (fetchedArticles.has(articleKey)) continue;

            if (categories.includes('all') || categories.includes(article.category)) {
                fetchedArticles.add(articleKey);
                yield article;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

async function consumeGeneratorWithTimeout(generator, timeoutMs) {
    const articles = [];
    const startTime = Date.now();

    for await (const article of generator) {
        articles.push(article);

        if (Date.now() - startTime > timeoutMs) {
            break;
        }
    }

    return articles;
}

module.exports = {
    roundRobinSourceGenerator,
    infiniteArticleGenerator,
    consumeGeneratorWithTimeout,
    NEWS_SOURCES
};
