const { ipcMain } = require('electron');
const { fetchNewsArticles, CATEGORIES, SOURCES } = require('./news-fetcher');

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

module.exports = { registerNewsHandlers };
