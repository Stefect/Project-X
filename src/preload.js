// Preload script для інжекту в веб-сторінки
const { contextBridge, ipcRenderer } = require('electron');

const browserStorageAPI = {
  // Історія
  getHistory: (limit) => ipcRenderer.invoke('get-history', limit),
  searchHistory: (query) => ipcRenderer.invoke('search-history', query),
  clearHistory: () => ipcRenderer.send('clear-history'),
  deleteHistoryItem: (url) => ipcRenderer.send('delete-history-item', url),
  openUrl: (url) => ipcRenderer.send('open-url-from-history', url),

  // Закладки
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (url, title, favicon) => ipcRenderer.invoke('add-bookmark', { url, title, favicon }),
  removeBookmark: (url) => ipcRenderer.send('remove-bookmark', url),
  isBookmarked: (url) => ipcRenderer.invoke('is-bookmarked', url),

  // Сесія
  saveSession: () => ipcRenderer.send('save-session'),
  getSession: () => ipcRenderer.invoke('get-session'),

  // Налаштування
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),

  // Нотатки
  saveNote: (text, url) => ipcRenderer.send('save-note', { text, url }),
  getNotes: () => ipcRenderer.invoke('get-notes'),
  deleteNote: (id) => ipcRenderer.send('delete-note', id),
  clearNotes: () => ipcRenderer.send('clear-notes')
};

const mainAPI = {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openInBrowser: (url) => ipcRenderer.invoke('open-in-browser', url),

  // X-Ray: опис посилань при наведенні
  describeUrl: (url, linkText, context) => ipcRenderer.invoke('describe-url', url, linkText, context),

  // AI утиліти
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // News
  fetchNews: (categories, count) => ipcRenderer.invoke('fetch-news', { categories, count }),
  getNewsCategories: () => ipcRenderer.invoke('get-news-categories'),

  // Слухаємо події Tor теми
  onTorTheme: (callback) => ipcRenderer.on('tor-theme', (_event, data) => callback(data))
};

// Спочатку пробуємо contextBridge (потрібен contextIsolation=true)
// Якщо кидає — fallback: встановлюємо напряму на window (contextIsolation=false)
try {
  contextBridge.exposeInMainWorld('browserStorage', browserStorageAPI);
  contextBridge.exposeInMainWorld('api', mainAPI);
} catch (e) {
  window.browserStorage = browserStorageAPI;
  window.api = mainAPI;
}
