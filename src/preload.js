// Preload script для інжекту в веб-сторінки
const { contextBridge, ipcRenderer } = require('electron');

// Безпечно експонуємо API для сторінки
contextBridge.exposeInMainWorld('aiHelper', {
  sendSelectedText: (text) => ipcRenderer.send('text-selected', text),
  onExplanation: (callback) => ipcRenderer.on('show-explanation', (event, explanation) => callback(explanation))
});

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

// API для AI-автозаповнення (T9 на стероїдах)
contextBridge.exposeInMainWorld('aiAutocomplete', {
  predict: (text) => ipcRenderer.invoke('predict-text', text)
});

// API для Smart Compose (розумного помічника тексту)
contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    const validChannels = ['predict-completion', 'predict-text'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.resolve(null);
  }
});
