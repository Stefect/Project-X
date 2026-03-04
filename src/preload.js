// Preload script для інжекту в веб-сторінки
const { contextBridge, ipcRenderer } = require('electron');

// API для роботи з пам'яттю браузера
contextBridge.exposeInMainWorld('browserStorage', {
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
});

// API для Infinite Feed (нескінченна стрічка новин) + X-Ray + AI
contextBridge.exposeInMainWorld('api', {
  startFeed: (categories, sourceNames) => ipcRenderer.invoke('start-infinite-feed', categories, sourceNames),
  stopFeed: () => ipcRenderer.invoke('stop-infinite-feed'),
  onNewFeedItem: (callback) => ipcRenderer.on('new-feed-item', (_event, data) => callback(data)),
  onFeedSkip: (callback) => ipcRenderer.on('feed-timeout-skip', (_event, source) => callback(source)),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openInBrowser: (url) => ipcRenderer.invoke('open-in-browser', url),
  
  // X-Ray: опис посилань при наведенні
  describeUrl: (url, linkText, context) => ipcRenderer.invoke('describe-url', url, linkText, context),
  
  // AI утиліти
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // Слухаємо події Tor теми
  onTorTheme: (callback) => ipcRenderer.on('tor-theme', (_event, data) => callback(data))
});
