import { ipcMain } from 'electron';
import { fetchNewsArticles, CATEGORIES, SOURCES } from './news-fetcher.js';

function registerNewsHandlers() {
  ipcMain.handle('get-news-categories', () => CATEGORIES);

  ipcMain.handle('get-news-sources', (_event, category) =>
    category ? SOURCES.filter(s => s.category === category) : SOURCES
  );

  ipcMain.handle('fetch-news', async (_event, { categories, count } = {}) => {
    const cats = Array.isArray(categories) && categories.length ? categories : Object.keys(CATEGORIES);
    try {
      const articles = await Promise.race([
        fetchNewsArticles(cats, count || 15),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
      ]);
      return articles;
    } catch (e) {
      console.warn('[NEWS] fetch-news error/timeout:', e.message);
      return [];
    }
  });
}

export { registerNewsHandlers };
