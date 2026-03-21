/**
 * IPC Handlers - Центральні обробники IPC повідомлень
 * Історія, Закладки, Сесії, Налаштування, Нотатки
 */

const { ipcMain, shell, BrowserWindow } = require('electron');
const path = require('path');

/**
 * Реєструє всі IPC handlers для storage та утиліт
 */
function registerStorageHandlers(storage, tabManager) {
  // ==================== ІСТОРІЯ ====================
  
  ipcMain.handle('get-history', (event, limit) => {
    return storage.getHistory(limit || 100);
  });

  ipcMain.handle('search-history', (event, query) => {
    return storage.searchHistory(query);
  });

  ipcMain.on('clear-history', () => {
    storage.clearHistory();
    console.log('[HISTORY] Cleared');
  });

  ipcMain.on('delete-history-item', (event, url) => {
    storage.deleteHistoryItem(url);
    console.log('[HISTORY] Deleted:', url);
  });

  ipcMain.on('add-to-history', (event, { url, title, favicon }) => {
    storage.addToHistory(url, title, favicon || '');
  });

  ipcMain.on('open-url-from-history', (event, url) => {
    console.log('[HISTORY] Opening:', url);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('webview-navigate', { tabId: tabManager.getActiveTabId(), url });
    }
  });

  ipcMain.on('open-history', async (event) => {
    console.log('[HISTORY] Opening history page');
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('webview-navigate', {
        tabId: tabManager.getActiveTabId(),
        url: 'app://localhost/history.html'
      });
    }
  });

  // ==================== ЗАКЛАДКИ ====================
  
  ipcMain.handle('get-bookmarks', () => {
    return storage.getBookmarks();
  });

  ipcMain.handle('add-bookmark', (event, { url, title, favicon }) => {
    const added = storage.addBookmark(url, title, favicon);
    console.log(added ? '[BOOKMARK] Added:' : '[BOOKMARK] Already exists:', url);
    return added;
  });

  ipcMain.on('remove-bookmark', (event, url) => {
    storage.removeBookmark(url);
    console.log('[BOOKMARK] Removed:', url);
  });

  ipcMain.handle('is-bookmarked', (event, url) => {
    return storage.isBookmarked(url);
  });

  // ==================== СЕСІЯ ====================
  
  ipcMain.on('save-session', () => {
    const sessionTabs = tabManager.getSessionData();
    const activeTabId = tabManager.getActiveTabId();
    storage.saveSession(sessionTabs, activeTabId);
    console.log('[SESSION] Saved:', sessionTabs.length, 'tabs');
  });

  ipcMain.handle('get-session', () => {
    return storage.getSession();
  });

  ipcMain.on('update-tab-url', (event, { tabId, url, title }) => {
    tabManager.updateTabInfo(tabId, url, title);
  });

  // ==================== НАЛАШТУВАННЯ ====================
  
  ipcMain.handle('get-settings', () => {
    return storage.getAllSettings();
  });

  ipcMain.on('save-settings', (event, settings) => {
    storage.setAllSettings(settings);
    console.log('[SETTINGS] Saved');
  });

  // ==================== НОТАТКИ ====================
  
  ipcMain.on('save-note', (event, { text, url }) => {
    storage.addNote(text, url);
    console.log('[NOTES] Saved');
  });

  ipcMain.handle('get-notes', () => {
    return storage.getNotes();
  });

  ipcMain.on('delete-note', (event, id) => {
    storage.deleteNote(id);
    console.log('[NOTES] Deleted:', id);
  });

  ipcMain.on('update-note', (event, { id, text }) => {
    storage.updateNote(id, text);
    console.log('[NOTES] Updated:', id);
  });

  ipcMain.on('clear-notes', () => {
    storage.clearNotes();
    console.log('[NOTES] Cleared');
  });

  // ==================== УТИЛІТИ ====================
  
  ipcMain.handle('open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('[SHELL] External open error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-in-browser', async (event, url) => {
    try {
      console.log('[BROWSER] Opening in new tab:', url);
      // Відправляємо команду до головного вікна (не до event.sender - sidebar)
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('open-in-new-tab', url);
      }
      return { success: true };
    } catch (error) {
      console.error('[BROWSER] Open error:', error);
      return { success: false, error: error.message };
    }
  });

  // Навігація активної вкладки до URL
  ipcMain.handle('navigate-url', async (event, url) => {
    try {
      // Convert file:// URLs for internal pages to app:// so webviews can load them.
      // Webviews block file:// navigation (especially on paths with non-ASCII chars).
      let targetUrl = url;
      if (url && url.startsWith('file://')) {
        const lower = url.toLowerCase();
        if (lower.includes('newtab.html')) targetUrl = 'app://localhost/newtab.html';
        else if (lower.includes('history.html')) targetUrl = 'app://localhost/history.html';
      }
      console.log('[NAVIGATE] Navigating to:', targetUrl);
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('webview-navigate', { tabId: tabManager.getActiveTabId(), url: targetUrl });
      }
      return { success: true };
    } catch (error) {
      console.error('[NAVIGATE] Error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Storage handlers registered');
}

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

  console.log('[IPC] AI Scheduler handlers registered');
}

module.exports = {
  registerStorageHandlers,
  registerAISchedulerHandlers
};
