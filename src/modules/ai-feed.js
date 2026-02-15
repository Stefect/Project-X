// ai-feed.js
// Модуль для генерації нескінченної стрічки новин з AI обробкою

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Список безкоштовних джерел (API, які повертають JSON) с категоріями
const NEWS_SOURCES = [
    { name: 'Reddit Tech', url: 'https://www.reddit.com/r/technology/new.json?limit=10', type: 'reddit', categories: ['tech', 'all'] },
    { name: 'Reddit Programming', url: 'https://www.reddit.com/r/programming/new.json?limit=10', type: 'reddit', categories: ['tech', 'programming', 'all'] },
    { name: 'Dev.to', url: 'https://dev.to/api/articles?per_page=10', type: 'devto', categories: ['tech', 'programming', 'all'] },
    { name: 'Hacker News', url: 'https://hacker-news.firebaseio.com/v0/newstories.json?limitToFirst=10', type: 'hackernews', categories: ['tech', 'all'] },
    { name: 'Reddit Science', url: 'https://www.reddit.com/r/science/new.json?limit=10', type: 'reddit', categories: ['science', 'all'] },
    { name: 'Reddit Space', url: 'https://www.reddit.com/r/space/new.json?limit=10', type: 'reddit', categories: ['science', 'all'] },
    { name: 'Reddit World News', url: 'https://www.reddit.com/r/worldnews/new.json?limit=10', type: 'reddit', categories: ['news', 'all'] },
    { name: 'Reddit Gaming', url: 'https://www.reddit.com/r/gaming/new.json?limit=10', type: 'reddit', categories: ['gaming', 'all'] }
];

// Функція для фільтрації джерел за категорією
function getSourcesByCategory(category) {
    if (!category || category === 'all') {
        return NEWS_SOURCES;
    }
    return NEWS_SOURCES.filter(source => source.categories.includes(category));
}

// Функція для фільтрації джерел за множинними категоріями
function getSourcesByCategories(categories) {
    // Якщо categories - не масив, конвертуємо в масив
    if (!Array.isArray(categories)) {
        categories = [categories];
    }
    
    // Якщо порожній масив або містить 'all', повертаємо всі джерела
    if (categories.length === 0 || categories.includes('all')) {
        return NEWS_SOURCES;
    }
    
    // Фільтруємо джерела, які мають хоча б одну з обраних категорій
    return NEWS_SOURCES.filter(source => 
        source.categories.some(cat => categories.includes(cat))
    );
}

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
async function* infiniteArticleGenerator(categories = ['all']) {
    // Конвертуємо в масив, якщо передано одну категорію
    if (!Array.isArray(categories)) {
        categories = [categories];
    }
    
    const sources = getSourcesByCategories(categories);
    const sourceGen = roundRobinSourceGenerator(sources);
    
    console.log(`📰 Генератор запущено для категорій: ${categories.join(', ')}, джерел: ${sources.length}`);
    
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

module.exports = { infiniteArticleGenerator, getSourcesByCategory, getSourcesByCategories };
