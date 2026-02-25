/**
 * IPC Handlers - Центральні обробники IPC повідомлень
 * History, Bookmarks, Sessions, Settings, Notes
 */

const { ipcMain, shell } = require('electron');
const path = require('path');

/**
 * Реєструє всі IPC handlers для storage та утиліт
 */
function registerStorageHandlers(storage, tabManager) {
  // ==================== HISTORY ====================
  
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

  ipcMain.on('open-url-from-history', (event, url) => {
    console.log('[HISTORY] Opening:', url);
    const activeTab = tabManager.getActiveTab();
    if (activeTab && activeTab.browserView) {
      activeTab.browserView.webContents.loadURL(url).catch(err => {
        console.error('[HISTORY] Load error:', err.message);
      });
    }
  });

  ipcMain.on('open-history', async (event) => {
    console.log('[HISTORY] Opening history page');
    const historyUrl = `file://${path.join(__dirname, '..', '..', 'public', 'history.html')}`;
    
    const activeTab = tabManager.getActiveTab();
    if (activeTab && activeTab.browserView) {
      try {
        await activeTab.browserView.webContents.loadURL(historyUrl);
        console.log('[HISTORY] Loaded successfully');
      } catch (err) {
        console.error('[HISTORY] Load error:', err.message);
      }
    }
  });

  // ==================== BOOKMARKS ====================
  
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

  // ==================== SESSION ====================
  
  ipcMain.on('save-session', () => {
    const sessionTabs = tabManager.getSessionData();
    const activeTabId = tabManager.getActiveTabId();
    storage.saveSession(sessionTabs, activeTabId);
    console.log('[SESSION] Saved:', sessionTabs.length, 'tabs');
  });

  ipcMain.handle('get-session', () => {
    return storage.getSession();
  });

  // ==================== SETTINGS ====================
  
  ipcMain.handle('get-settings', () => {
    return storage.getAllSettings();
  });

  ipcMain.on('save-settings', (event, settings) => {
    storage.setAllSettings(settings);
    console.log('[SETTINGS] Saved');
  });

  // ==================== NOTES ====================
  
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

  // ==================== UTILITIES ====================
  
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
      // Відправляємо команду на відкриття в новій вкладці
      if (event.sender) {
        event.sender.send('open-in-new-tab', url);
      }
      return { success: true };
    } catch (error) {
      console.error('[BROWSER] Open error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Storage handlers registered');
}

module.exports = {
  registerStorageHandlers
};
