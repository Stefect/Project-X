// ai-feed.js
// Модуль для генерації нескінченної стрічки новин з AI обробкою

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Список безкоштовних джерел (API, які повертають JSON) с категоріями
const NEWS_SOURCES = [
    // Технології
    { name: 'Reddit Tech', url: 'https://www.reddit.com/r/technology/new.json?limit=10', type: 'reddit', categories: ['tech', 'all'] },
    { name: 'Reddit Programming', url: 'https://www.reddit.com/r/programming/new.json?limit=10', type: 'reddit', categories: ['tech', 'programming', 'all'] },
    { name: 'Dev.to', url: 'https://dev.to/api/articles?per_page=10', type: 'devto', categories: ['tech', 'programming', 'all'] },
    { name: 'Hacker News', url: 'https://hacker-news.firebaseio.com/v0/newstories.json?limitToFirst=10', type: 'hackernews', categories: ['tech', 'all'] },
    
    // Наука
    { name: 'Reddit Science', url: 'https://www.reddit.com/r/science/new.json?limit=10', type: 'reddit', categories: ['science', 'all'] },
    { name: 'Reddit Space', url: 'https://www.reddit.com/r/space/new.json?limit=10', type: 'reddit', categories: ['science', 'all'] },
    { name: 'Reddit Physics', url: 'https://www.reddit.com/r/Physics/new.json?limit=10', type: 'reddit', categories: ['science', 'all'] },
    
    // Новини світу
    { name: 'Reddit World News', url: 'https://www.reddit.com/r/worldnews/new.json?limit=10', type: 'reddit', categories: ['news', 'all'] },
    { name: 'Reddit News', url: 'https://www.reddit.com/r/news/new.json?limit=10', type: 'reddit', categories: ['news', 'all'] },
    
    // Ігри
    { name: 'Reddit Gaming', url: 'https://www.reddit.com/r/gaming/new.json?limit=10', type: 'reddit', categories: ['gaming', 'all'] },
    { name: 'Reddit PC Gaming', url: 'https://www.reddit.com/r/pcgaming/new.json?limit=10', type: 'reddit', categories: ['gaming', 'all'] },
    { name: 'Reddit Games', url: 'https://www.reddit.com/r/Games/new.json?limit=10', type: 'reddit', categories: ['gaming', 'all'] },
    
    // Штучний інтелект
    { name: 'Reddit Machine Learning', url: 'https://www.reddit.com/r/MachineLearning/new.json?limit=10', type: 'reddit', categories: ['ai', 'tech', 'all'] },
    { name: 'Reddit Artificial', url: 'https://www.reddit.com/r/artificial/new.json?limit=10', type: 'reddit', categories: ['ai', 'tech', 'all'] },
    { name: 'Reddit Local LLaMA', url: 'https://www.reddit.com/r/LocalLLaMA/new.json?limit=10', type: 'reddit', categories: ['ai', 'tech', 'all'] },
    
    // Криптовалюта
    { name: 'Reddit Crypto', url: 'https://www.reddit.com/r/CryptoCurrency/new.json?limit=10', type: 'reddit', categories: ['crypto', 'all'] },
    { name: 'Reddit Bitcoin', url: 'https://www.reddit.com/r/Bitcoin/new.json?limit=10', type: 'reddit', categories: ['crypto', 'all'] },
    { name: 'Reddit Ethereum', url: 'https://www.reddit.com/r/ethereum/new.json?limit=10', type: 'reddit', categories: ['crypto', 'all'] },
    
    // Бізнес та економіка
    { name: 'Reddit Business', url: 'https://www.reddit.com/r/business/new.json?limit=10', type: 'reddit', categories: ['business', 'all'] },
    { name: 'Reddit Economics', url: 'https://www.reddit.com/r/Economics/new.json?limit=10', type: 'reddit', categories: ['business', 'all'] },
    { name: 'Reddit Entrepreneur', url: 'https://www.reddit.com/r/Entrepreneur/new.json?limit=10', type: 'reddit', categories: ['business', 'all'] },
    
    // Україна
    { name: 'Reddit Ukraine', url: 'https://www.reddit.com/r/ukraine/new.json?limit=10', type: 'reddit', categories: ['ukraine', 'news', 'all'] },
    { name: 'Reddit Ukraine Conflict', url: 'https://www.reddit.com/r/UkrainianConflict/new.json?limit=10', type: 'reddit', categories: ['ukraine', 'news', 'all'] },
    
    // Українські новинні агентства (через rss2json API)
    { name: 'Suspilne News', url: 'https://api.rss2json.com/v1/api.json?rss_url=https://suspilne.media/rss/', type: 'rss2json', categories: ['ukraine', 'news', 'all'] },
    { name: 'Ukrainska Pravda', url: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.pravda.com.ua/rss/', type: 'rss2json', categories: ['ukraine', 'news', 'all'] },
    { name: 'Kyiv Independent', url: 'https://api.rss2json.com/v1/api.json?rss_url=https://kyivindependent.com/feed/', type: 'rss2json', categories: ['ukraine', 'news', 'all'] },
    
    // Розваги
    { name: 'Reddit Movies', url: 'https://www.reddit.com/r/movies/new.json?limit=10', type: 'reddit', categories: ['entertainment', 'all'] },
    { name: 'Reddit Music', url: 'https://www.reddit.com/r/Music/new.json?limit=10', type: 'reddit', categories: ['entertainment', 'all'] },
    { name: 'Reddit Television', url: 'https://www.reddit.com/r/television/new.json?limit=10', type: 'reddit', categories: ['entertainment', 'all'] },
    
    // Спорт
    { name: 'Reddit Sports', url: 'https://www.reddit.com/r/sports/new.json?limit=10', type: 'reddit', categories: ['sports', 'all'] },
    { name: 'Reddit Soccer', url: 'https://www.reddit.com/r/soccer/new.json?limit=10', type: 'reddit', categories: ['sports', 'all'] },
    { name: 'Reddit NBA', url: 'https://www.reddit.com/r/nba/new.json?limit=10', type: 'reddit', categories: ['sports', 'all'] },
    
    // Здоров'я
    { name: 'Reddit Health', url: 'https://www.reddit.com/r/Health/new.json?limit=10', type: 'reddit', categories: ['health', 'all'] },
    { name: 'Reddit Fitness', url: 'https://www.reddit.com/r/Fitness/new.json?limit=10', type: 'reddit', categories: ['health', 'all'] },
    { name: 'Reddit Nutrition', url: 'https://www.reddit.com/r/nutrition/new.json?limit=10', type: 'reddit', categories: ['health', 'all'] }
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

// Функція для отримання списку всіх джерел
function getAllSources() {
    return NEWS_SOURCES.map(source => ({
        name: source.name,
        type: source.type,
        categories: source.categories
    }));
}

// Функція для фільтрації джерел за назвами
function filterSourcesByNames(sources, selectedNames) {
    if (!selectedNames || selectedNames.length === 0) {
        return sources; // Якщо нічого не обрано, повертаємо всі
    }
    return sources.filter(source => selectedNames.includes(source.name));
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
        console.log(`🔍 Завантажую з ${source.name} (${source.type})...`);
        const response = await fetch(source.url);
        
        if (!response.ok) {
            console.error(`❌ HTTP помилка ${response.status} для ${source.name}`);
            return null;
        }
        
        const data = await response.json();
        
        if (source.type === 'reddit') {
            const posts = data.data?.children;
            if (posts && posts.length > 0) {
                const randomPost = posts[Math.floor(Math.random() * posts.length)].data;
                console.log(`✅ Reddit: ${randomPost.title.substring(0, 50)}...`);
                return { 
                    title: randomPost.title, 
                    url: randomPost.url, 
                    source: source.name,
                    id: randomPost.id
                };
            } else {
                console.warn(`⚠️ Reddit ${source.name}: немає постів`);
            }
        } else if (source.type === 'devto') {
            if (data && data.length > 0) {
                const randomPost = data[Math.floor(Math.random() * data.length)];
                console.log(`✅ Dev.to: ${randomPost.title.substring(0, 50)}...`);
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
                if (item && item.title) {
                    console.log(`✅ HackerNews: ${item.title.substring(0, 50)}...`);
                    return {
                        title: item.title,
                        url: item.url || `https://news.ycombinator.com/item?id=${randomId}`,
                        source: source.name,
                        id: randomId
                    };
                }
            }
        } else if (source.type === 'rss2json') {
            // Українські джерела через RSS2JSON API
            console.log(`🇺🇦 RSS2JSON відповідь:`, data.status);
            if (data && data.status === 'ok' && data.items && data.items.length > 0) {
                const randomItem = data.items[Math.floor(Math.random() * data.items.length)];
                console.log(`✅ ${source.name}: ${randomItem.title.substring(0, 50)}...`);
                return {
                    title: randomItem.title,
                    url: randomItem.link,
                    source: source.name,
                    id: randomItem.guid || randomItem.link
                };
            } else {
                console.warn(`⚠️ ${source.name}: немає статей або помилка RSS`, data.message);
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
async function* infiniteArticleGenerator(categories = ['all'], sourceNames = []) {
    // Конвертуємо в масив, якщо передано одну категорію
    if (!Array.isArray(categories)) {
        categories = [categories];
    }
    
    // Спочатку фільтруємо за категоріями
    let sources = getSourcesByCategories(categories);
    
    // Потім фільтруємо за обраними джерелами (якщо вказано)
    sources = filterSourcesByNames(sources, sourceNames);
    
    if (sources.length === 0) {
        console.log('⚠️ Немає доступних джерел з обраними фільтрами!');
        return;
    }
    
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

module.exports = { infiniteArticleGenerator, getSourcesByCategory, getSourcesByCategories, getAllSources };
