import { ipcMain } from 'electron';
import { fetchNewsArticles, CATEGORIES, SOURCES } from './news-fetcher.js';

function registerNewsHandlers() {
  ipcMain.handle('get-news-categories', () => CATEGORIES);

  ipcMain.handle('get-news-sources', (_event, category) =>
    category ? SOURCES.filter(s => s.category === category) : SOURCES
  );

  ipcMain.handle('fetch-news', async (_event, { categories, count } = {}) => {
    const cats = Array.isArray(categories) && categories.length ? categories : Object.keys(CATEGORIES);
    return fetchNewsArticles(cats, count || 15);
  });
}

export { registerNewsHandlers };
