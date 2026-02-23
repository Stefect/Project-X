// ai-feed.js
// Модуль для генерації нескінченної стрічки новин з AI обробкою

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const Parser = require('rss-parser');
const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    },
    timeout: 10000,
    customFields: {
        item: ['description', 'content:encoded']
    }
});

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
    
    // Українські новинні агентства - ТИМЧАСОВО ВІДКЛЮЧЕНІ (RSS feeds return 404)
    // { name: 'Suspilne News', url: 'https://suspilne.media/rss/', type: 'rss', categories: ['ukraine', 'news', 'all'] },
    // { name: 'Ukrainska Pravda', url: 'https://www.pravda.com.ua/rss/', type: 'rss', categories: ['ukraine', 'news', 'all'] },
    // { name: 'Kyiv Independent', url: 'https://kyivindependent.com/feed/', type: 'rss', categories: ['ukraine', 'news', 'all'] },
    
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
    console.log('[FILTER DEBUG] selectedNames:', JSON.stringify(selectedNames));
    console.log('[FILTER DEBUG] sources before filter:', sources.map(s => s.name));
    
    if (!selectedNames || selectedNames.length === 0) {
        console.log('[FILTER DEBUG] Empty array - returning all sources');
        return sources; // Якщо нічого не обрано, повертаємо всі
    }
    
    const filtered = sources.filter(source => {
        const match = selectedNames.includes(source.name);
        console.log(`[FILTER DEBUG] Checking "${source.name}": ${match}`);
        return match;
    });
    
    console.log('[FILTER DEBUG] Filtered sources:', filtered.map(s => s.name));
    return filtered;
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
        console.log(`[LOADING] ${source.name} (${source.type})...`);
        
        // For RSS sources use rss-parser
        if (source.type === 'rss') {
            try {
                console.log(`[RSS] Parsing: ${source.url}`);
                const feed = await parser.parseURL(source.url);
                console.log(`[RSS] Feed received:`, feed.title, `Items:`, feed.items?.length);
                if (feed && feed.items && feed.items.length > 0) {
                    const randomItem = feed.items[Math.floor(Math.random() * feed.items.length)];
                    console.log(`[OK] RSS: ${randomItem.title.substring(0, 50)}...`);
                    return {
                        title: randomItem.title,
                        url: randomItem.link,
                        source: source.name,
                        id: randomItem.guid || randomItem.link
                    };
                } else {
                    console.warn(`[WARNING] ${source.name}: RSS feed is empty`);
                    return null;
                }
            } catch (rssError) {
                console.error(`[RSS ERROR] ${source.name}:`, rssError.message);
                return null;
            }
        }
        
        // Для інших джерел використовуємо fetch
        const response = await fetch(source.url);
        
        if (!response.ok) {
            console.error(`[HTTP ERROR] Status ${response.status} for ${source.name}`);
            return null;
        }
        
        const data = await response.json();
        
        if (source.type === 'reddit') {
            const posts = data.data?.children;
            if (posts && posts.length > 0) {
                const randomPost = posts[Math.floor(Math.random() * posts.length)].data;
                console.log(`[OK] Reddit: ${randomPost.title.substring(0, 50)}...`);
                return { 
                    title: randomPost.title, 
                    url: randomPost.url, 
                    source: source.name,
                    id: randomPost.id
                };
            } else {
                console.warn(`[WARNING] Reddit ${source.name}: no posts`);
            }
        } else if (source.type === 'devto') {
            if (data && data.length > 0) {
                const randomPost = data[Math.floor(Math.random() * data.length)];
                console.log(`[OK] Dev.to: ${randomPost.title.substring(0, 50)}...`);
                return { 
                    title: randomPost.title, 
                    url: randomPost.url, 
                    source: source.name,
                    id: randomPost.id
                };
            }
        } else if (source.type === 'hackernews') {
            if (data && data.length > 0) {
                // Limit to first 30 stories to avoid huge response
                const limitedData = data.slice(0, 30);
                const randomId = limitedData[Math.floor(Math.random() * limitedData.length)];
                const itemResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${randomId}.json`);
                const item = await itemResponse.json();
                if (item && item.title) {
                    console.log(`[OK] HackerNews: ${item.title.substring(0, 50)}...`);
                    return {
                        title: item.title,
                        url: item.url || `https://news.ycombinator.com/item?id=${randomId}`,
                        source: source.name,
                        id: randomId
                    };
                }
            }
        } else if (source.type === 'rss2json') {
            // Українські джерела через RSS2JSON API (застаріле)
            console.log(`[RSS2JSON] Response:`, data.status);
            if (data && data.status === 'ok' && data.items && data.items.length > 0) {
                const randomItem = data.items[Math.floor(Math.random() * data.items.length)];
                console.log(`[OK] ${source.name}: ${randomItem.title.substring(0, 50)}...`);
                return {
                    title: randomItem.title,
                    url: randomItem.link,
                    source: source.name,
                    id: randomItem.guid || randomItem.link
                };
            } else {
                console.warn(`[WARNING] ${source.name}: no articles or RSS error`, data.message);
            }
        }
        return null;
    } catch (error) {
        console.error(`[ERROR] Failed to load from ${source.name}:`, error.message);
        return null;
    }
}

// ---------------------------------------------------------
// Infinite article stream generator
// ---------------------------------------------------------
async function* infiniteArticleGenerator(categories = ['all'], customSources = []) {
    // Convert to array if single category passed
    if (!Array.isArray(categories)) {
        categories = [categories];
    }
    
    console.log('[FILTER] Received categories:', categories);
    console.log('[FILTER] Received custom sources length:', customSources.length);
    console.log('[FILTER] Custom sources data:', JSON.stringify(customSources));
    
    let sources;
    
    // If custom sources provided (from feed.html with full URL objects), use them
    if (customSources && customSources.length > 0) {
        // Check if it's an object with url property
        if (customSources[0] && typeof customSources[0] === 'object' && customSources[0].url) {
            sources = customSources;
            console.log('[FILTER] Using custom sources (objects):', sources.map(s => s.name).join(', '));
        }
        // Check if it's just strings (legacy)
        else if (typeof customSources[0] === 'string') {
            sources = getSourcesByCategories(categories);
            sources = filterSourcesByNames(sources, customSources);
            console.log('[FILTER] Using filtered built-in sources:', sources.map(s => s.name).join(', '));
        }
        // Unknown format
        else {
            console.error('[FILTER ERROR] Unknown sources format:', customSources[0]);
            sources = getSourcesByCategories(categories);
        }
    } else {
        // No custom sources - use built-in
        sources = getSourcesByCategories(categories);
        console.log('[FILTER] Using built-in sources:', sources.length, 'sources');
    }
    
    console.log('[FILTER] Final sources list:', sources.map(s => s.name).join(', '));
    
    if (sources.length === 0) {
        console.log('[WARNING] No available sources with selected filters!');
        return;
    }
    
    const sourceGen = roundRobinSourceGenerator(sources);
    
    // Track consecutive errors per source to skip broken sources
    const sourceErrors = new Map();
    const MAX_CONSECUTIVE_ERRORS = 3;
    const skippedSources = new Set();
    
    console.log(`[GENERATOR] Started for categories: ${categories.join(', ')}, sources: ${sources.length}`);
    
    while (true) {
        const currentSource = sourceGen.next().value; // Get next source (Round Robin)
        
        // Skip if source has too many errors
        if (skippedSources.has(currentSource.name)) {
            continue;
        }
        
        const article = await fetchOneArticle(currentSource);
        
        if (article) {
            // Reset error counter on success
            sourceErrors.set(currentSource.name, 0);
            yield article; // Return article
        } else {
            // Increment error counter
            const errorCount = (sourceErrors.get(currentSource.name) || 0) + 1;
            sourceErrors.set(currentSource.name, errorCount);
            
            // Skip source if too many consecutive errors
            if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
                console.error(`[SKIP] Source "${currentSource.name}" has ${errorCount} consecutive errors, skipping...`);
                skippedSources.add(currentSource.name);
                
                // If all sources are skipped, stop generator
                if (skippedSources.size >= sources.length) {
                    console.error('[FATAL] All sources have failed, stopping feed...');
                    return;
                }
            }
        }
        
        // Маленька пауза, щоб не заспамити API
        await new Promise(res => setTimeout(res, 2000));
    }
}

module.exports = { infiniteArticleGenerator, getSourcesByCategory, getSourcesByCategories, getAllSources };
