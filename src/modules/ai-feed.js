// ai-feed.js
// Модуль для генерації нескінченної стрічки новин з AI обробкою

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Список безкоштовних джерел (API, які повертають JSON)
const NEWS_SOURCES = [
    { name: 'Reddit Tech', url: 'https://www.reddit.com/r/technology/new.json?limit=10', type: 'reddit' },
    { name: 'Reddit Programming', url: 'https://www.reddit.com/r/programming/new.json?limit=10', type: 'reddit' },
    { name: 'Dev.to', url: 'https://dev.to/api/articles?per_page=10', type: 'devto' },
    { name: 'Hacker News', url: 'https://hacker-news.firebaseio.com/v0/newstories.json?limitToFirst=10', type: 'hackernews' }
];

// ---------------------------------------------------------
// 1. ЗАВДАННЯ 1.1: Round Robin Generator
// Цей генератор нескінченно ходить по масиву джерел по колу
// ---------------------------------------------------------
function* roundRobinSourceGenerator(sources) {
    let index = 0;
    while (true) {
        yield sources[index];
        index = (index + 1) % sources.length;
    }
}

// Функція для "витягування" однієї випадкової статті з джерела
async function fetchOneArticle(source) {
    try {
        const response = await fetch(source.url);
        const data = await response.json();
        
        if (source.type === 'reddit') {
            const posts = data.data.children;
            if (posts && posts.length > 0) {
                const randomPost = posts[Math.floor(Math.random() * posts.length)].data;
                return { 
                    title: randomPost.title, 
                    url: randomPost.url, 
                    source: source.name,
                    id: randomPost.id
                };
            }
        } else if (source.type === 'devto') {
            if (data && data.length > 0) {
                const randomPost = data[Math.floor(Math.random() * data.length)];
                return { 
                    title: randomPost.title, 
                    url: randomPost.url, 
                    source: source.name,
                    id: randomPost.id
                };
            }
        } else if (source.type === 'hackernews') {
            if (data && data.length > 0) {
                const randomId = data[Math.floor(Math.random() * data.length)];
                const itemResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${randomId}.json`);
                const item = await itemResponse.json();
                return {
                    title: item.title,
                    url: item.url || `https://news.ycombinator.com/item?id=${randomId}`,
                    source: source.name,
                    id: randomId
                };
            }
        }
        return null;
    } catch (error) {
        console.error(`❌ Помилка завантаження з ${source.name}:`, error.message);
        return null;
    }
}

// ---------------------------------------------------------
// Асинхронний генератор нескінченного потоку статей
// ---------------------------------------------------------
async function* infiniteArticleGenerator() {
    const sourceGen = roundRobinSourceGenerator(NEWS_SOURCES);
    
    while (true) {
        const currentSource = sourceGen.next().value; // Беремо наступне джерело (Round Robin)
        const article = await fetchOneArticle(currentSource);
        
        if (article) {
            yield article; // "Випльовуємо" статтю
        }
        
        // Маленька пауза, щоб не заспамити API
        await new Promise(res => setTimeout(res, 2000));
    }
}

module.exports = { infiniteArticleGenerator };
