

// Допоміжні функції для отримання поточного вікна браузера
import { ipcMain, shell, BrowserWindow, app } from 'electron';
import path from 'path';
import { analyzeHistoryNdjsonFile } from '../utils/large-data-stream.js';

// Повертає посилання на перше наявне вікно Electron
function getMainWindow() {
  return BrowserWindow.getAllWindows()[0] || null;
}

// Надсилає навігацію активної вкладки на заданий URL через IPC
function navigateActiveTab(tabManager, url) {
  const mainWindow = getMainWindow();
  if (!mainWindow) return false;

  mainWindow.webContents.send('webview-navigate', {
    tabId: tabManager.getActiveTabId(),
    url
  });

  return true;
}

// Перетворює файлові URL (внутрішні сторінки) на внутрішню схему app://
function toInternalAppUrl(url) {
  if (!url || !url.startsWith('file://')) return url;

  const lower = url.toLowerCase();
  if (lower.includes('newtab.html')) return 'app://localhost/newtab.html';
  if (lower.includes('history.html')) return 'app://localhost/history.html';
  if (lower.includes('settings.html')) return 'app://localhost/settings.html';

  return url;
}


// Реєструє усі IPC-обробники сховища: історія, закладки, нотатки, налаштування, сесія
function registerStorageHandlers(storage, tabManager) {
  
  // Обробники історії перегляду (отримання, пошук, очищення, видалення)
  ipcMain.handle('get-history', (event, limit) => {
    return storage.getHistory(limit || 100);
  });

  ipcMain.handle('search-history', (event, query) => {
    return storage.searchHistory(query);
  });

  ipcMain.on('clear-history', () => {
    storage.clearHistory();
  });

  ipcMain.on('delete-history-item', (event, url) => {
    storage.deleteHistoryItem(url);
  });

  ipcMain.on('add-to-history', (event, { url, title, favicon }) => {
    storage.addToHistory(url, title, favicon || '');
  });

  ipcMain.on('open-url-from-history', (event, url) => {
    navigateActiveTab(tabManager, url);
  });

  ipcMain.on('open-history', async (event) => {
    navigateActiveTab(tabManager, 'app://localhost/history.html');
  });
  
  // Обробники закладок (отримання, додавання, видалення, перевірка)
  ipcMain.handle('get-bookmarks', () => {
    return storage.getBookmarks();
  });

  ipcMain.handle('add-bookmark', (event, { url, title, favicon }) => {
    const added = storage.addBookmark(url, title, favicon);
    return added;
  });

  ipcMain.on('remove-bookmark', (event, url) => {
    storage.removeBookmark(url);
  });

  ipcMain.handle('is-bookmarked', (event, url) => {
    return storage.isBookmarked(url);
  });
  
  // Обробники сесії (збереження/отримання вкладок, оновлення URL вкладки)
  ipcMain.on('save-session', () => {
    const sessionTabs = tabManager.getSessionData();
    const activeTabId = tabManager.getActiveTabId();
    storage.saveSession(sessionTabs, activeTabId);
  });

  ipcMain.handle('get-session', () => {
    return storage.getSession();
  });

  ipcMain.on('update-tab-url', (event, { tabId, url, title }) => {
    tabManager.updateTabInfo(tabId, url, title);
  });
  
  // Обробники налаштувань (отримання і збереження усіх налаштувань)
  ipcMain.handle('get-settings', () => {
    return storage.getAllSettings();
  });

  ipcMain.on('save-settings', (event, settings) => {
    storage.setAllSettings(settings);
  });
  
  // Обробники нотаток (створення, витягування, видалення, редагування, очищення)
  ipcMain.on('save-note', (event, { text, url }) => {
    storage.addNote(text, url);
  });

  ipcMain.handle('get-notes', () => {
    return storage.getNotes();
  });

  ipcMain.on('delete-note', (event, id) => {
    storage.deleteNote(id);
  });

  ipcMain.on('update-note', (event, { id, text }) => {
    storage.updateNote(id, text);
  });

  ipcMain.on('clear-notes', () => {
    storage.clearNotes();
  });
  
  // Безпечне відкриття зовнішніх URL: перевіряємо протокол перед відкриттям
  ipcMain.handle('open-external', async (event, url) => {
    const ALLOWED_PROTOCOLS = ['http:', 'https:'];
    try {
      const parsed = new URL(String(url));
      if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        console.warn('[SHELL] Blocked open-external — disallowed protocol:', parsed.protocol);
        return { success: false, error: 'Protocol not allowed' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('[SHELL] External open error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-in-browser', async (event, url) => {
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('open-in-new-tab', url);
      }
      return { success: true };
    } catch (error) {
      console.error('[BROWSER] Open error:', error);
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle('navigate-url', async (event, url) => {
    try {
      const targetUrl = toInternalAppUrl(url);
      navigateActiveTab(tabManager, targetUrl);
      return { success: true };
    } catch (error) {
      console.error('[NAVIGATE] Error:', error);
      return { success: false, error: error.message };
    }
  });

  // Потоковий аналіз NDJSON-історії: віддає топ-N доменів з найбільшою кількістю відвідувань
  ipcMain.handle('analyze-history-stream', async (_event, payload = {}) => {
    try {
      const { topN = 10 } = payload;
      const filePath = path.join(app.getPath('userData'), 'history.ndjson');
      const stats = await analyzeHistoryNdjsonFile(filePath, { topN });
      return { success: true, stats };
    } catch (error) {
      console.error('[STREAM] analyze-history-stream error:', error.message);
      return { success: false, error: error.message };
    }
  });
}

// Реєструє IPC-обробники AI Task Scheduler: додавання завдань, статус, очищення
function registerAISchedulerHandlers(aiScheduler) {
  ipcMain.handle('ai-add-task', async (event, { task, priority }) => {
    try {
      aiScheduler.addTask(task, priority);
      return { success: true };
    } catch (error) {
      console.error('[AI Scheduler] Error adding task:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai-get-status', () => {
    return aiScheduler.getStatus();
  });

  ipcMain.on('ai-clear-queue', () => {
    aiScheduler.clearQueue();
  });
}

export {
  registerStorageHandlers,
  registerAISchedulerHandlers
};
