/**
 * Tab Manager - Система управління вкладками
 * Створення, перемикання, закриття, відновлення сесій
 */

const { BrowserView, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');

// Стан вкладок
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;
let topbarHeight = 100; // Динамічна висота топбара (40px tabs + 60px toolbar)

/**
 * Ініціалізує першу вкладку
 */
function initFirstTab(browserView, startUrl) {
  tabs = [{
    id: 1,
    browserView: browserView,
    url: startUrl,
    title: 'New tab'
  }];
  activeTabId = 1;
  nextTabId = 2;
  console.log('[TAB] First tab initialized');
}

/**
 * Створює нову вкладку
 */
function createTab(mainWindow, url = null, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const bounds = mainWindow.getContentBounds();
  const targetUrl = url || `file://${path.join(__dirname, '..', '..', 'public', 'newtab.html')}`;
  
  const newBrowserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js')
    }
  });
  
  // Реєструємо обробник window.open
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
    title: 'Loading...'
  };
  
  tabs.push(newTab);
  
  // Обробники подій для нової вкладки
  setupTabEventHandlers(newTab, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel });
  
  // Встановлюємо як активну
  mainWindow.setBrowserView(newBrowserView);
  activeTabId = newTab.id;
  
  newBrowserView.webContents.loadURL(targetUrl);
  
  console.log('[TAB] Created tab:', newTab.id);
  return { id: newTab.id, url: targetUrl, title: newTab.title };
}

/**
 * Налаштовує обробники подій для вкладки
 */
function setupTabEventHandlers(tab, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel }) {
  const { browserView, id } = tab;
  
  // Завантаження завершено
  browserView.webContents.on('did-finish-load', () => {
    const currentUrl = browserView.webContents.getURL();

    if (!currentUrl.includes('newtab.html')) {
      emitReactiveEvent({
        type: 'page-load',
        title: 'Завантаження завершено',
        detail: formatUrlLabel(currentUrl)
      }, mainWindow);
    }
    
    // Інжектуємо теми або T9
    if (currentUrl.includes('newtab.html')) {
      themeManager.injectThemeToNewtab(browserView);
    } else {
      injectUnifiedT9(browserView);
    }
    
    // Оновлюємо інформацію про вкладку
    const title = browserView.webContents.getTitle();
    mainWindow.webContents.send('update-tab-info', id, title, currentUrl);
  });
  
  // Навігація
  browserView.webContents.on('did-navigate', () => {
    const currentUrl = browserView.webContents.getURL();
    const title = browserView.webContents.getTitle();
    
    // Зберігаємо в історію
    try {
      const favicon = new URL(currentUrl).origin + '/favicon.ico';
      storage.addToHistory(currentUrl, title, favicon);
    } catch (err) {
      storage.addToHistory(currentUrl, title);
    }
    
    mainWindow.webContents.send('update-tab-info', id, title, currentUrl);
    
    // Оновлюємо URL bar якщо це активна вкладка
    if (id === activeTabId) {
      mainWindow.webContents.send('update-url-bar', currentUrl);
    }
  });
  
  // Навігація всередині сторінки
  browserView.webContents.on('did-navigate-in-page', (event, url) => {
    if (id === activeTabId) {
      mainWindow.webContents.send('update-url-bar', url);
    }
    injectUnifiedT9(browserView);
  });
  
  // Помилка завантаження
  browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      console.error(`[TAB ${id}] Load error: ${errorDescription} (code: ${errorCode})`);
      console.error(`[TAB ${id}] URL: ${validatedURL}`);
    }
  });
  
  // Оновлення заголовку
  browserView.webContents.on('page-title-updated', (event, title) => {
    const tabData = tabs.find(t => t.id === id);
    if (tabData) {
      tabData.title = title;
      mainWindow.webContents.send('update-tab-title', { tabId: id, title });
    }
  });
  
  // Контекстне меню
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
        label: '📝 Додати в конспект',
        click: () => {
          mainWindow.webContents.send('add-to-notes', selectedText);
        }
      }));
      
      menu.popup();
    }
  });
  
  // Console messages
  browserView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const logPrefix = sourceId.includes('history.html') ? '[HISTORY]' : '[WEB]';
    const levelMap = { 0: 'LOG', 1: 'WARN', 2: 'ERROR' };
    const levelName = levelMap[level] || 'LOG';
    
    if (level >= 1) {
      console.log(`${logPrefix} [${levelName}] ${message} (${sourceId}:${line})`);
    }
  });
}

/**
 * Реєструє обробник window.open для вкладки
 */
function registerWindowOpenHandler(browserView, mainWindow) {
  if (!browserView || !browserView.webContents || browserView.webContents.isDestroyed()) return;
  browserView.webContents.setWindowOpenHandler(({ url }) => {
    mainWindow.webContents.send('open-in-new-tab', url);
    return { action: 'deny' };
  });
}

/**
 * Перемикає на вкладку за ID
 */
function switchTab(tabId, mainWindow, sidebarWidth) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) {
    console.error('[TAB] Tab not found:', tabId);
    return false;
  }
  
  activeTabId = tabId;
  mainWindow.setBrowserView(tab.browserView);
  
  // Оновлюємо розміри
  const bounds = mainWindow.getContentBounds();
  tab.browserView.setBounds({
    x: 0,
    y: topbarHeight,
    width: bounds.width - sidebarWidth,
    height: bounds.height - topbarHeight
  });
  
  // Оновлюємо URL bar
  const url = tab.browserView.webContents.getURL();
  mainWindow.webContents.send('update-url-bar', url);
  
  console.log('[TAB] Switched to tab:', tabId);
  return true;
}

/**
 * Закриває вкладку
 */
function closeTab(tabId, mainWindow) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return false;
  
  const tab = tabs[tabIndex];
  
  // Якщо це остання вкладка - повертаємо true (браузер має закритись)
  if (tabs.length <= 1) {
    console.log('[TAB] Closing last tab');
    return true;
  }
  
  // Якщо це активна вкладка, перемкнемось на іншу
  if (activeTabId === tabId) {
    const newActiveTab = tabs[tabIndex + 1] || tabs[tabIndex - 1];
    if (newActiveTab) {
      switchTab(newActiveTab.id, mainWindow, 0);
    }
  }
  
  // Видаляємо BrowserView
  tab.browserView.webContents.destroy();
  tabs.splice(tabIndex, 1);
  
  console.log('[TAB] Closed:', tabId, '| Remaining:', tabs.length);
  return false;
}

/**
 * Перевпорядковує вкладки
 */
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

/**
 * Навігує активну вкладку до URL
 */
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
    // Пошуковий запит
    url = isTorActive 
      ? 'https://duckduckgo.com/?q=' + encodeURIComponent(url)
      : 'https://www.google.com/search?q=' + encodeURIComponent(url);
  }
  
  console.log('[TAB] Navigation:', input, '→', url);
  activeTab.browserView.webContents.loadURL(url);
}

/**
 * Навігація назад
 */
function goBack() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView.webContents.canGoBack()) {
    activeTab.browserView.webContents.goBack();
    console.log('[TAB] Back');
  }
}

/**
 * Навігація вперед
 */
function goForward() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView.webContents.canGoForward()) {
    activeTab.browserView.webContents.goForward();
    console.log('[TAB] Forward');
  }
}

/**
 * Перезавантаження активної вкладки
 */
function reload() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    activeTab.browserView.webContents.reload();
    console.log('[TAB] Reloaded');
  }
}

/**
 * Оновлює розміри активної вкладки
 */
function updateActiveTabBounds(mainWindow, sidebarWidth, offsetRight = 0) {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  const bounds = mainWindow.getContentBounds();
  activeTab.browserView.setBounds({
    x: 0,
    y: topbarHeight,
    width: bounds.width - sidebarWidth - offsetRight,
    height: bounds.height - topbarHeight
  });
}

/**
 * Встановлює висоту топбара
 */
function setTopbarHeight(height) {
  topbarHeight = height;
  console.log('[TAB] Topbar height set to:', height);
}

/**
 * Отримує дані для збереження сесії
 */
function getSessionData() {
  return tabs
    .map(tab => ({
      url: tab.browserView?.webContents?.getURL() || '',
      title: tab.browserView?.webContents?.getTitle() || 'Нова вкладка',
      isActive: tab.id === activeTabId
    }))
    .filter(tab => !tab.url.includes('newtab.html'));
}

/**
 * Відновлює сесію зі збережених вкладок
 */
function restoreSession(sessionData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const sessionTabs = sessionData.tabs || [];
  const savedActiveIndex = sessionData.activeTabIndex || 0;
  
  console.log('[SESSION] Found saved tabs:', sessionTabs.length);
  
  if (sessionTabs.length === 0) {
    console.log('[SESSION] No tabs to restore');
    return;
  }
  
  // Видаляємо початкову newtab вкладку
  if (tabs.length > 0 && tabs[0].url.includes('newtab.html')) {
    const newtabView = tabs[0].browserView;
    mainWindow.removeBrowserView(newtabView);
    if (newtabView && newtabView.webContents) {
      newtabView.webContents.close();
    }
    tabs.shift();
  }
  
  // Відновлюємо кожну вкладку
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
        title: tab.title || 'Loading...'
      };
      
      tabs.push(tabData);
      
      // Налаштовуємо обробники
      setupTabEventHandlers(tabData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel });
      
      // Завантажуємо URL
      tabView.webContents.loadURL(tab.url).catch(err => {
        console.error('[TAB] Failed to load:', tab.url);
      });
      
      // Відправляємо на UI
      mainWindow.webContents.send('tab-restored', {
        tabId: nextTabId,
        url: tab.url,
        title: tab.title || 'Loading...'
      });
      
      nextTabId++;
    }
  });
  
  // Активуємо відновлену вкладку
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

/**
 * Отримує всі вкладки
 */
function getAllTabs() {
  return tabs;
}

/**
 * Отримує активну вкладку
 */
function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

/**
 * Отримує ID активної вкладки
 */
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
