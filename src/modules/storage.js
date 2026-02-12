// Модуль для збереження даних браузера (історія, закладки, сесія, налаштування)
// Використовуємо вбудований fs для JSON storage (electron-store має проблеми з ESM)
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Шлях до файлу даних
const getDataPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'browserx-data.json');
};

// Дефолтні дані
const defaultData = {
  history: [],
  bookmarks: [],
  session: { tabs: [], activeTabIndex: 0 },
  settings: {
    theme: {
      mode: 'dark',
      bg: '#1a1b26',
      accent: '#3b82f6',
      wallpaper: 'none'
    },
    homepage: 'newtab',
    searchEngine: 'google',
    restoreSession: false // Вимкнено за замовчуванням, щоб завжди показувати нативну стартову сторінку
  },
  notes: [],
  downloads: []
};

// Завантажуємо дані
function loadData() {
  try {
    const dataPath = getDataPath();
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      return { ...defaultData, ...data };
    }
  } catch (error) {
    console.error('Помилка читання даних:', error);
  }
  return { ...defaultData };
}

// Зберігаємо дані
function saveData(data) {
  try {
    const dataPath = getDataPath();
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Помилка збереження даних:', error);
  }
}

// Кеш даних в пам'яті
let dataCache = null;

function getData() {
  if (!dataCache) {
    dataCache = loadData();
  }
  return dataCache;
}

function setData(key, value) {
  const data = getData();
  data[key] = value;
  dataCache = data;
  saveData(data);
}

// ==================== ІСТОРІЯ ====================
function addToHistory(url, title, favicon = '') {
  // Не зберігаємо newtab та порожні URL
  if (!url || url.includes('newtab.html') || url.startsWith('file://')) return;
  
  const data = getData();
  let history = data.history || [];
  
  // Видаляємо дублікат якщо є
  history = history.filter(h => h.url !== url);
  
  // Додаємо на початок
  history.unshift({
    url,
    title: title || url,
    favicon,
    visitedAt: Date.now()
  });
  
  // Обмежуємо до 1000 записів
  setData('history', history.slice(0, 1000));
}

function getHistory(limit = 100) {
  const data = getData();
  const history = data.history || [];
  return history.slice(0, limit);
}

function searchHistory(query) {
  const data = getData();
  const history = data.history || [];
  const lowerQuery = query.toLowerCase();
  return history.filter(h => 
    h.url.toLowerCase().includes(lowerQuery) || 
    (h.title && h.title.toLowerCase().includes(lowerQuery))
  );
}

function clearHistory() {
  setData('history', []);
}

function deleteHistoryItem(url) {
  const data = getData();
  const history = data.history || [];
  setData('history', history.filter(h => h.url !== url));
}

// ==================== ЗАКЛАДКИ ====================
function addBookmark(url, title, favicon = '', folder = 'Загальні') {
  const data = getData();
  const bookmarks = data.bookmarks || [];
  
  // Перевіряємо чи вже є така закладка
  if (bookmarks.some(b => b.url === url)) {
    return false; // Вже існує
  }
  
  bookmarks.push({
    id: Date.now().toString(),
    url,
    title: title || url,
    favicon,
    folder,
    createdAt: Date.now()
  });
  
  setData('bookmarks', bookmarks);
  return true;
}

function removeBookmark(url) {
  const data = getData();
  const bookmarks = data.bookmarks || [];
  setData('bookmarks', bookmarks.filter(b => b.url !== url));
}

function getBookmarks() {
  const data = getData();
  return data.bookmarks || [];
}

function isBookmarked(url) {
  const data = getData();
  const bookmarks = data.bookmarks || [];
  return bookmarks.some(b => b.url === url);
}

// ==================== СЕСІЯ ====================
function saveSession(tabs) {
  const sessionTabs = tabs.map(tab => ({
    url: tab.url || '',
    title: tab.title || 'Нова вкладка'
  })).filter(t => t.url && !t.url.includes('newtab.html'));
  
  setData('session', {
    tabs: sessionTabs,
    activeTabIndex: 0,
    savedAt: Date.now()
  });
}

function getSession() {
  const data = getData();
  return data.session || { tabs: [], activeTabIndex: 0 };
}

function clearSession() {
  setData('session', { tabs: [], activeTabIndex: 0 });
}

// ==================== НАЛАШТУВАННЯ ====================
function getSetting(key) {
  const data = getData();
  const settings = data.settings || {};
  return settings[key];
}

function setSetting(key, value) {
  const data = getData();
  const settings = data.settings || {};
  settings[key] = value;
  setData('settings', settings);
}

function getAllSettings() {
  const data = getData();
  return data.settings || {};
}

function setAllSettings(settings) {
  setData('settings', settings);
}

// ==================== НОТАТКИ ====================
function addNote(text, url = '') {
  const data = getData();
  const notes = data.notes || [];
  notes.unshift({
    id: Date.now().toString(),
    text,
    url,
    createdAt: Date.now()
  });
  setData('notes', notes.slice(0, 500)); // Обмежуємо до 500
}

function getNotes() {
  const data = getData();
  return data.notes || [];
}

function deleteNote(id) {
  const data = getData();
  const notes = data.notes || [];
  setData('notes', notes.filter(n => n.id !== id));
}

function clearNotes() {
  setData('notes', []);
}

// ==================== ЕКСПОРТ ====================
module.exports = {
  // Історія
  addToHistory,
  getHistory,
  searchHistory,
  clearHistory,
  deleteHistoryItem,
  
  // Закладки
  addBookmark,
  removeBookmark,
  getBookmarks,
  isBookmarked,
  
  // Сесія
  saveSession,
  getSession,
  clearSession,
  
  // Налаштування
  getSetting,
  setSetting,
  getAllSettings,
  setAllSettings,
  
  // Нотатки
  addNote,
  getNotes,
  deleteNote,
  clearNotes,
  
  // Прямий доступ
  getData,
  setData
};
