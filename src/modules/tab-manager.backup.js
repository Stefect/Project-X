

const { BrowserView, Menu, MenuItem, session } = require('electron');
const path = require('path');
const fs = require('fs');
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;
let topbarHeight = 100;


function initFirstTab(browserView, startUrl) {
  tabs = [{
    id: 1,
    browserView: browserView,
    url: startUrl,
    title: 'New tab',
    navigationHistory: [],
    currentIndex: 0
  }];
  activeTabId = 1;
  nextTabId = 2;
  console.log('[TAB] First tab initialized');
}


function createTab(mainWindow, url = null, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const bounds = mainWindow.getContentBounds();
  const targetUrl = url || `file://${path.join(__dirname, '..', '..', 'public', 'newtab.html')}`;
  
  const newBrowserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      session: session.defaultSession
    }
  });
  registerWindowOpenHandler(newBrowserView, mainWindow);
  
  newBrowserView.setBackgroundColor('#ffffff');
  newBrowserView.setBounds({ 
    x: 0, 
    y: topbarHeight,
    width: bounds.width - sidebarWidth,
    height: bounds.height - topbarHeight 
  });
  
  newBrowserView.setAutoResize({ 
    width: false,
    height: true 
  });
  
  const newTab = {
    id: nextTabId++,
    browserView: newBrowserView,
    url: url,
    title: 'Loading...',
    navigationHistory: [],
    currentIndex: 0
  };
  
  tabs.push(newTab);
  setupTabEventHandlers(newTab, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel });
  mainWindow.setBrowserView(newBrowserView);
  activeTabId = newTab.id;
  
  newBrowserView.webContents.loadURL(targetUrl);
  
  console.log('[TAB] Created tab:', newTab.id);
  return { id: newTab.id, url: targetUrl, title: newTab.title };
}


function setupTabEventHandlers(tabOrId, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel }) {
  const id = typeof tabOrId === 'object' ? tabOrId.id : tabOrId;
  const getTab = () => tabs.find(t => t.id === id);
  
  const initialTab = getTab();
  if (!initialTab || !initialTab.browserView) {
    console.error('[TAB] Cannot setup handlers - tab not found:', id);
    return;
  }
  
  const browserView = initialTab.browserView;
  browserView.webContents.on('did-finish-load', () => {
    const tab = getTab();
    if (!tab) return;
    
    const currentUrl = browserView.webContents.getURL();
    const title = browserView.webContents.getTitle();
    tab.url = currentUrl;
    tab.title = title;
    try {
      const navHistory = browserView.webContents.navigationHistory;
      if (navHistory && (!tab.navigationHistory || tab.navigationHistory.length <= 1)) {
        tab.currentIndex = navHistory.getActiveIndex();
      }
    } catch (e) {
    }

    if (!currentUrl.includes('newtab.html')) {
      emitReactiveEvent({
        type: 'page-load',
        title: 'Завантаження завершено',
        detail: formatUrlLabel(currentUrl)
      }, mainWindow);
    }
    if (currentUrl.includes('newtab.html')) {
      themeManager.injectThemeToNewtab(browserView);
    } else {
      injectUnifiedT9(browserView);
    }
    mainWindow.webContents.send('update-tab-info', id, title, currentUrl);
  });
  browserView.webContents.on('did-navigate', () => {
    const tab = getTab();
    if (!tab) return;
    
    const currentUrl = browserView.webContents.getURL();
    const title = browserView.webContents.getTitle();
    
    console.log(`[TAB.did-navigate] ${id}: BEFORE - currentIndex=${tab.currentIndex}, navHistory.length=${tab.navigationHistory?.length || 0}`);
    console.log(`[TAB.did-navigate] ${id}: URL=${currentUrl}, _skipHistoryUpdate=${tab._skipHistoryUpdate}, _isRestoringHistory=${tab._isRestoringHistory}`);
    tab.url = currentUrl;
    tab.title = title;
    if (tab._skipHistoryUpdate) {
      console.log(`[TAB.did-navigate] ${id}: SKIP - navigating saved history, keeping currentIndex=${tab.currentIndex}`);
      tab._skipHistoryUpdate = false;
      mainWindow.webContents.send('update-tab-info', id, title, currentUrl);
      if (id === activeTabId) {
        mainWindow.webContents.send('update-url-bar', currentUrl);
      }
      return;
    }
    if (!tab.navigationHistory) {
      tab.navigationHistory = [];
      tab.currentIndex = 0;
    }
    if (tab._isRestoringHistory) {
      console.log(`[TAB.did-navigate] ${id}: RESTORING - keeping currentIndex=${tab.currentIndex}`);
      tab._isRestoringHistory = false;
      try {
        const favicon = new URL(currentUrl).origin + '/favicon.ico';
        storage.addToHistory(currentUrl, title, favicon);
      } catch (err) {
        storage.addToHistory(currentUrl, title);
      }
      
      mainWindow.webContents.send('update-tab-info', id, title, currentUrl);
      if (id === activeTabId) {
        mainWindow.webContents.send('update-url-bar', currentUrl);
      }
      return;
    }
    try {
      const navHistory = browserView.webContents.navigationHistory;
      if (navHistory) {
        const entries = navHistory.getAllEntries();
        const activeIndex = navHistory.getActiveIndex();
        
        console.log(`[TAB] WebContents history: ${entries.length} entries, active index: ${activeIndex}`);
        if (tab.navigationHistory.length === 0 && entries.length > 0) {
          tab.navigationHistory = entries.map(entry => ({
            url: entry.url,
            title: entry.title || entry.url
          }));
          tab.currentIndex = activeIndex;
          console.log(`[TAB] Initialized from webContents: ${tab.navigationHistory.length} entries`);
          return;
        }
      }
    } catch (e) {
      console.log('[TAB] Could not sync with webContents history:', e.message);
    }
    tab.navigationHistory = tab.navigationHistory.slice(0, tab.currentIndex + 1);
    const lastUrl = tab.navigationHistory[tab.navigationHistory.length - 1]?.url;
    if (lastUrl !== currentUrl) {
      tab.navigationHistory.push({ url: currentUrl, title: title });
      tab.currentIndex = tab.navigationHistory.length - 1;
      console.log(`[TAB] History updated: ${tab.currentIndex + 1} entries`);
    }
    const MAX_HISTORY_SIZE = 50;
    if (tab.navigationHistory.length > MAX_HISTORY_SIZE) {
      const excess = tab.navigationHistory.length - MAX_HISTORY_SIZE;
      tab.navigationHistory = tab.navigationHistory.slice(excess);
      tab.currentIndex = Math.max(0, tab.currentIndex - excess);
      console.log(`[TAB] History trimmed to ${MAX_HISTORY_SIZE} entries`);
    }
    try {
      const favicon = new URL(currentUrl).origin + '/favicon.ico';
      storage.addToHistory(currentUrl, title, favicon);
    } catch (err) {
      storage.addToHistory(currentUrl, title);
    }
    
    mainWindow.webContents.send('update-tab-info', id, title, currentUrl);
    if (id === activeTabId) {
      mainWindow.webContents.send('update-url-bar', currentUrl);
    }
  });
  browserView.webContents.on('did-navigate-in-page', (event, url) => {
    const tab = getTab();
    if (!tab) return;
    tab.url = url;
    
    if (id === activeTabId) {
      mainWindow.webContents.send('update-url-bar', url);
    }
    injectUnifiedT9(browserView);
  });
  browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      console.error(`[TAB ${id}] Load error: ${errorDescription} (code: ${errorCode})`);
      console.error(`[TAB ${id}] URL: ${validatedURL}`);
      
      if (errorCode === -130) {
        console.error('[TAB] Tor proxy connection failed! Make sure Tor is running.');
      }
    }
  });
  browserView.webContents.on('page-title-updated', (event, title) => {
    const tabData = tabs.find(t => t.id === id);
    if (tabData) {
      tabData.title = title;
      mainWindow.webContents.send('update-tab-title', { tabId: id, title });
    }
  });
  browserView.webContents.on('context-menu', (event, params) => {
    if (params.selectionText) {
      const menu = new Menu();
      const selectedText = params.selectionText;
      
      menu.append(new MenuItem({
        label: '📋 Копіювати',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          require('electron').clipboard.writeText(selectedText);
        }
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
      
      menu.append(new MenuItem({
        label: 'Додати в конспект',
        click: () => {
          mainWindow.webContents.send('add-to-notes', selectedText);
        }
      }));
      
      menu.popup();
    }
  });
  browserView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const logPrefix = sourceId.includes('history.html') ? '[HISTORY]' : '[WEB]';
    const levelMap = { 0: 'LOG', 1: 'WARN', 2: 'ERROR' };
    const levelName = levelMap[level] || 'LOG';
    
    if (level >= 1) {
      console.log(`${logPrefix} [${levelName}] ${message} (${sourceId}:${line})`);
    }
  });
}


function registerWindowOpenHandler(browserView, mainWindow) {
  if (!browserView || !browserView.webContents || browserView.webContents.isDestroyed()) return;
  browserView.webContents.setWindowOpenHandler(({ url }) => {
    mainWindow.webContents.send('open-in-new-tab', url);
    return { action: 'deny' };
  });
}


function switchTab(tabId, mainWindow, sidebarWidth) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) {
    console.error('[TAB] Tab not found:', tabId);
    return false;
  }
  
  activeTabId = tabId;
  mainWindow.setBrowserView(tab.browserView);
  const bounds = mainWindow.getContentBounds();
  tab.browserView.setBounds({
    x: 0,
    y: topbarHeight,
    width: bounds.width - sidebarWidth,
    height: bounds.height - topbarHeight
  });
  const url = tab.browserView.webContents.getURL();
  mainWindow.webContents.send('update-url-bar', url);
  
  console.log('[TAB] Switched to tab:', tabId);
  return true;
}


function closeTab(tabId, mainWindow) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return false;
  
  const tab = tabs[tabIndex];
  if (tabs.length <= 1) {
    console.log('[TAB] Closing last tab');
    return true;
  }
  if (activeTabId === tabId) {
    const newActiveTab = tabs[tabIndex + 1] || tabs[tabIndex - 1];
    if (newActiveTab) {
      switchTab(newActiveTab.id, mainWindow, 0);
    }
  }
  tab.browserView.webContents.destroy();
  tabs.splice(tabIndex, 1);
  
  console.log('[TAB] Closed:', tabId, '| Remaining:', tabs.length);
  return false;
}


function reorderTabs(newOrder) {
  try {
    const reorderedTabs = [];
    newOrder.forEach(tabId => {
      const tab = tabs.find(t => t.id === tabId);
      if (tab) reorderedTabs.push(tab);
    });
    
    tabs = reorderedTabs;
    console.log('[TAB] Reordered successfully');
    return true;
  } catch (error) {
    console.error('[TAB] Reorder error:', error);
    return false;
  }
}


function navigate(input, isTorActive) {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  let url = input.trim();
  
  const isURL = (str) => {
    if (str.startsWith('http://') || str.startsWith('https://')) return true;
    if (str.includes('.') && !str.includes(' ')) return true;
    if (str.startsWith('localhost')) return true;
    return false;
  };
  
  if (isURL(url)) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
  } else {
    url = isTorActive 
      ? 'https://duckduckgo.com/?q=' + encodeURIComponent(url)
      : 'https://www.google.com/search?q=' + encodeURIComponent(url);
  }
  
  console.log('[TAB] Navigation:', input, '→', url);
  activeTab.browserView.webContents.loadURL(url);
}


function goBack() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  console.log('[TAB.goBack] canGoBack:', activeTab.browserView.webContents.canGoBack());
  console.log('[TAB.goBack] navigationHistory:', activeTab.navigationHistory?.length || 0);
  console.log('[TAB.goBack] currentIndex:', activeTab.currentIndex ?? 0);
  if (activeTab.navigationHistory && activeTab.navigationHistory.length > 1) {
    const currentIndex = activeTab.currentIndex ?? 0;
    console.log(`[TAB] goBack: currentIndex=${currentIndex}, historyLength=${activeTab.navigationHistory.length}`);
    
    if (currentIndex > 0) {
      activeTab.currentIndex = currentIndex - 1;
      const prevUrl = activeTab.navigationHistory[activeTab.currentIndex].url;
      
      console.log(`[TAB] Going back to: ${prevUrl}`);
      try {
        const navHistory = activeTab.browserView.webContents.navigationHistory;
        if (navHistory) {
          const entries = navHistory.getAllEntries();
          const wcActiveIndex = navHistory.getActiveIndex();
          if (wcActiveIndex > 0 && entries[wcActiveIndex - 1]?.url === prevUrl) {
            activeTab._skipHistoryUpdate = true;
            activeTab.browserView.webContents.goBack();
            console.log('[TAB] Back (webContents, synced)');
            return;
          }
        }
      } catch (e) {  }
      activeTab._skipHistoryUpdate = true;
      
      activeTab.browserView.webContents.loadURL(prevUrl).then(() => {
        console.log(`[TAB] Navigated back to index ${activeTab.currentIndex}`);
      }).catch(err => {
        console.error('[TAB] Failed to navigate back:', err.message);
        activeTab.currentIndex = currentIndex;
      }).finally(() => {
        setTimeout(() => { activeTab._skipHistoryUpdate = false; }, 100);
      });
    } else {
      console.log('[TAB] Already at the beginning of history');
    }
    return;
  }
  if (activeTab.browserView.webContents.canGoBack()) {
    activeTab.browserView.webContents.goBack();
    console.log('[TAB] Back (webContents fallback)');
  } else {
    console.log('[TAB] No history available');
  }
}


function goForward() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  if (activeTab.navigationHistory && activeTab.navigationHistory.length > 1) {
    const currentIndex = activeTab.currentIndex ?? 0;
    console.log(`[TAB] goForward: currentIndex=${currentIndex}, historyLength=${activeTab.navigationHistory.length}`);
    
    if (currentIndex < activeTab.navigationHistory.length - 1) {
      activeTab.currentIndex = currentIndex + 1;
      const nextUrl = activeTab.navigationHistory[activeTab.currentIndex].url;
      
      console.log(`[TAB] Going forward to: ${nextUrl}`);
      try {
        const navHistory = activeTab.browserView.webContents.navigationHistory;
        if (navHistory) {
          const entries = navHistory.getAllEntries();
          const wcActiveIndex = navHistory.getActiveIndex();
          if (wcActiveIndex < entries.length - 1 && entries[wcActiveIndex + 1]?.url === nextUrl) {
            activeTab._skipHistoryUpdate = true;
            activeTab.browserView.webContents.goForward();
            console.log('[TAB] Forward (webContents, synced)');
            return;
          }
        }
      } catch (e) {  }
      activeTab._skipHistoryUpdate = true;
      
      activeTab.browserView.webContents.loadURL(nextUrl).then(() => {
        console.log(`[TAB] Navigated forward to index ${activeTab.currentIndex}`);
      }).catch(err => {
        console.error('[TAB] Failed to navigate forward:', err.message);
        activeTab.currentIndex = currentIndex;
      }).finally(() => {
        setTimeout(() => { activeTab._skipHistoryUpdate = false; }, 100);
      });
    } else {
      console.log('[TAB] Already at the end of history');
    }
    return;
  }
  if (activeTab.browserView.webContents.canGoForward()) {
    activeTab.browserView.webContents.goForward();
    console.log('[TAB] Forward (webContents fallback)');
  } else {
    console.log('[TAB] No history available');
  }
}


function reload() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    activeTab.browserView.webContents.reload();
    console.log('[TAB] Reloaded');
  }
}


function updateActiveTabBounds(mainWindow, sidebarWidth, offsetRight = 0) {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  const bounds = mainWindow.getContentBounds();
  activeTab.browserView.setBounds({
    x: sidebarWidth,
    y: topbarHeight,
    width: bounds.width - sidebarWidth - offsetRight,
    height: bounds.height - topbarHeight
  });
}


function setTopbarHeight(height) {
  topbarHeight = height;
  console.log('[TAB] Topbar height set to:', height);
}


function getSessionData() {
  return tabs
    .map(tab => {
      let url = tab.url || '';
      let title = tab.title || 'Нова вкладка';
      let navigationHistory = tab.navigationHistory || [];
      let currentIndex = tab.currentIndex || 0;
      
      console.log(`[SESSION.save] Tab ${tab.id}: currentIndex=${currentIndex}, navHistory.length=${navigationHistory.length}`);
      try {
        if (tab.browserView?.webContents && !tab.browserView.webContents.isDestroyed()) {
          url = tab.browserView.webContents.getURL() || url;
          title = tab.browserView.webContents.getTitle() || title;
          const navHistory = tab.browserView.webContents.navigationHistory;
          if (navHistory) {
            const entries = navHistory.getAllEntries();
            const activeIndexWC = navHistory.getActiveIndex();
            
            console.log(`[SESSION.save] WebContents: ${entries.length} entries, activeIndex=${activeIndexWC}`);
            if (entries.length > 0) {
              if (navigationHistory.length === 0) {
                navigationHistory = entries.map(entry => ({
                  url: entry.url,
                  title: entry.title || entry.url
                }));
                currentIndex = activeIndexWC;
                console.log(`[SESSION.save] Updated from webContents (fallback): using activeIndex=${currentIndex}`);
              }
            }
          }
        }
      } catch (e) {
        console.log('[SESSION.save] Could not get navigation history:', e.message);
      }
      const MAX_SAVED_HISTORY = 20;
      if (navigationHistory.length > MAX_SAVED_HISTORY) {
        const excess = navigationHistory.length - MAX_SAVED_HISTORY;
        navigationHistory = navigationHistory.slice(excess);
        currentIndex = Math.max(0, currentIndex - excess);
      }
      
      console.log(`[SESSION.save] Final: currentIndex=${currentIndex}, navHistory.length=${navigationHistory.length}`);
      
      return {
        url,
        title,
        isActive: tab.id === activeTabId,
        navigationHistory,
        currentIndex
      };
    })
    .filter(tab => tab.url && !tab.url.includes('newtab.html'));
}


function restoreSession(sessionData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const sessionTabs = sessionData.tabs || [];
  const savedActiveIndex = sessionData.activeTabIndex || 0;
  
  console.log('[SESSION] Found saved tabs:', sessionTabs.length);
  
  if (sessionTabs.length === 0) {
    console.log('[SESSION] No tabs to restore');
    return;
  }
  if (tabs.length > 0 && tabs[0].url.includes('newtab.html')) {
    const newtabView = tabs[0].browserView;
    mainWindow.removeBrowserView(newtabView);
    if (newtabView && newtabView.webContents) {
      newtabView.webContents.close();
    }
    tabs.shift();
  }
  sessionTabs.forEach((tab) => {
    if (tab.url && tab.url.trim() !== '') {
      const tabView = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '..', 'preload.js')
        }
      });
      
      registerWindowOpenHandler(tabView, mainWindow);
      
      const tabData = {
        id: nextTabId,
        browserView: tabView,
        url: tab.url,
        title: tab.title || 'Loading...',
        navigationHistory: tab.navigationHistory || [],
        currentIndex: tab.currentIndex || 0,
        _isRestoringHistory: tab.navigationHistory && tab.navigationHistory.length > 0
      };
      
      console.log(`[SESSION.restore] Tab ${nextTabId}: url=${tab.url}, currentIndex=${tab.currentIndex}, navHistory.length=${tab.navigationHistory?.length || 0}, _isRestoringHistory=${tabData._isRestoringHistory}`);
      
      tabs.push(tabData);
      setupTabEventHandlers(tabData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel });
      tabView.webContents.loadURL(tab.url).catch(err => {
        console.error('[TAB] Failed to load:', tab.url);
      });
      
      console.log(`[TAB] Restored with history: ${tab.navigationHistory?.length || 0} entries, current: ${tab.currentIndex || 0}`);
      mainWindow.webContents.send('tab-restored', {
        tabId: nextTabId,
        url: tab.url,
        title: tab.title || 'Loading...'
      });
      
      nextTabId++;
    }
  });
  if (tabs.length > 0) {
    const activeIndex = Math.min(savedActiveIndex, tabs.length - 1);
    activeTabId = tabs[activeIndex].id;
    const activeView = tabs[activeIndex].browserView;
    
    if (activeView) {
      mainWindow.setBrowserView(activeView);
      
      const bounds = mainWindow.getContentBounds();
      activeView.setBounds({
        x: sidebarWidth,
        y: topbarHeight,
        width: bounds.width - sidebarWidth,
        height: bounds.height - topbarHeight
      });
    }
    
    mainWindow.webContents.send('tab-activated', activeTabId);
  }
  
  console.log('[SESSION] Restored successfully!');
}


function getAllTabs() {
  return tabs;
}


function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}


function getActiveTabId() {
  return activeTabId;
}

module.exports = {
  initFirstTab,
  createTab,
  switchTab,
  closeTab,
  reorderTabs,
  navigate,
  goBack,
  goForward,
  reload,
  updateActiveTabBounds,
  setTopbarHeight,
  getSessionData,
  restoreSession,
  getAllTabs,
  getActiveTab,
  getActiveTabId,
  setupTabEventHandlers,
  registerWindowOpenHandler
};
