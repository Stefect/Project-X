/**
 * Tab Manager - Система управління вкладками (WEBVIEW VERSION)
 * Створення, перемикання, закриття, відновлення сесій
 * Використовує <webview> HTML теги замість BrowserView
 */

const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_TAB_TITLE = 'New tab';
const SEARCH_ENGINES = {
  tor: 'https://duckduckgo.com/?q=',
  regular: 'https://www.google.com/search?q='
};

// Стан вкладок
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;
let mainWindowRef = null;

function getTabById(tabId) {
  return tabs.find(tab => tab.id === tabId);
}

function getActiveTabSafe() {
  return getTabById(activeTabId);
}

function sendToRenderer(channel, payload) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return false;
  mainWindowRef.webContents.send(channel, payload);
  return true;
}

function isLikelyAddress(value) {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^localhost([:/]|$)/i.test(value)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}([:/?#]|$)/.test(value)) return true;
  return value.includes('.') && !value.includes(' ');
}

function resolveNavigationTarget(rawInput, isTorActive) {
  const input = String(rawInput || '').trim();

  if (isLikelyAddress(input)) {
    if (/^https?:\/\//i.test(input)) return input;
    return `https://${input}`;
  }

  const searchBase = isTorActive ? SEARCH_ENGINES.tor : SEARCH_ENGINES.regular;
  return `${searchBase}${encodeURIComponent(input)}`;
}

function isRestorableUrl(url) {
  return Boolean(
    url
      && url !== 'about:blank'
      && !url.startsWith('file://')
      && !url.startsWith('app://')
  );
}

function buildTabState(id, url, title = null) {
  return {
    id,
    url,
    title: title || (url ? 'Loading...' : DEFAULT_TAB_TITLE),
    navigationHistory: [],
    currentIndex: 0
  };
}

/**
 * Ініціалізує систему вкладок
 */
function init(mainWindow) {
  mainWindowRef = mainWindow;
  console.log('[TAB] Webview tab manager initialized');
}

/**
 * Створює HTML елемент <webview> для вкладки
 */
function createWebviewElement(tabId, url) {
  // Визначаємо inline стилі залежно від того, чи це активна вкладка
  const isActive = tabId === activeTabId;
  // Порожні вкладки (без URL) завжди приховані — показується native new tab
  const hasUrl = url && url !== 'about:blank';
  const displayStyle = (isActive && hasUrl) ? 'flex' : 'none';

  // Для порожніх вкладок використовуємо data URI замість about:blank
  // щоб ініціалізувати guest-процес (потрібно для preload) без ERR_ABORTED
  const srcValue = hasUrl ? url : 'data:text/html,';

  return `
    <webview
      id="webview-${tabId}"
      src="${srcValue}"
      preload="${pathToFileURL(path.join(__dirname, '..', 'preload.js')).href}"
      partition="persist:main"
      class="${isActive ? 'active' : ''}"
      webpreferences="contextIsolation=yes, nodeIntegration=no"
      style="display: ${displayStyle}; border: none; background: transparent;"
    ></webview>
  `;
}

/**
 * Ініціалізує першу вкладку
 */
function initFirstTab(browserView, startUrl) {
  // Більше не використовуємо browserView, створюємо webview через HTML
  tabs = [buildTabState(1, startUrl, DEFAULT_TAB_TITLE)];
  activeTabId = 1;
  nextTabId = 2;
  
  // Відправляємо команду на створення webview елемента
  const webviewHTML = createWebviewElement(1, startUrl);
  sendToRenderer('create-webview', { tabId: 1, html: webviewHTML, url: startUrl });
  
  console.log('[TAB] First tab initialized');
}

/**
 * Створює нову вкладку
 */
function createTab(mainWindow, url = null, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const targetUrl = url || null;

  const newTab = buildTabState(nextTabId, targetUrl);
  
  tabs.push(newTab);
  
  // Встановлюємо як активну ПЕРЕД створенням HTML (щоб отримала клас "active")
  activeTabId = newTab.id;
  
  // Створюємо HTML елемент webview
  const webviewHTML = createWebviewElement(newTab.id, targetUrl);
  
  // Відправляємо на UI для створення
  mainWindow.webContents.send('create-webview', { 
    tabId: newTab.id,
    html: webviewHTML,
    url: targetUrl
  });
  
  // Активуємо webview (на випадок якщо HTML створився без класу)
  mainWindow.webContents.send('switch-webview', { tabId: newTab.id });
  
  // Налаштовуємо обробники подій
  setupTabEventHandlers(newTab, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel });
  
  console.log('[TAB] Created tab:', newTab.id);
  
  nextTabId++;
  return { id: newTab.id, url: targetUrl, title: newTab.title };
}

/**
 * Налаштовує обробники подій для вкладки
 * Для webview події приходять через IPC з renderer process
 */
function setupTabEventHandlers(tabOrId, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel }) {
  const id = typeof tabOrId === 'object' ? tabOrId.id : tabOrId;
  
  // Обробники налаштовуються через IPC events в main.js
  // Тут просто зберігаємо посилання на callbacks
  console.log('[TAB] Handlers are managed in renderer for tab:', id);
}

/**
 * Реєструє обробник window.open (не потрібен для webview)
 */
function registerWindowOpenHandler(browserView, mainWindow) {
  // Webview має власну логіку обробки нових вікон через атрибут 'new-window'
  // Обробляється на стороні renderer process
  console.log('[TAB] window.open is handled by renderer/webview');
}

/**
 * Перемикає на вкладку за ID
 */
function switchTab(tabId, mainWindow, sidebarWidth) {
  const tab = getTabById(tabId);
  if (!tab) {
    console.error('[TAB] Tab not found:', tabId);
    return false;
  }
  
  activeTabId = tabId;

  // Відправляємо команду на UI для перемикання класу .active
  mainWindow.webContents.send('switch-webview', { tabId });
  mainWindow.webContents.send('tab-activated', tabId);

  // Оновлюємо URL bar
  mainWindow.webContents.send('update-url-bar', tab.url || '');
  
  console.log('[TAB] Switched to tab:', tabId);
  return true;
}

/**
 * Закриває вкладку
 */
function closeTab(tabId, mainWindow) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  
  if (tabIndex === -1) {
    console.warn('[TAB] Tried to close unknown tab:', tabId);
    return false;
  }
  
  // Якщо це остання вкладка - повертаємо true
  if (tabs.length <= 1) {
    console.log('[TAB] Last tab closed, app can quit');
    return true;
  }

  let fallbackTabId = null;
  
  // Якщо це активна вкладка, перемкнемось на іншу
  if (activeTabId === tabId) {
    const newActiveTab = tabs[tabIndex + 1] || tabs[tabIndex - 1];
    if (newActiveTab) {
      fallbackTabId = newActiveTab.id;
    }
  }
  
  // Видаляємо webview елемент з DOM
  mainWindow.webContents.send('remove-webview', { tabId });
  
  // Видаляємо з масиву
  tabs.splice(tabIndex, 1);

  if (fallbackTabId) {
    switchTab(fallbackTabId, mainWindow, 0);
  }
  
  console.log(`[TAB] Closed tab ${tabId}. Remaining: ${tabs.length}`);
  return false;
}

/**
 * Перевпорядковує вкладки
 */
function reorderTabs(newOrder) {
  try {
    const byId = new Map(tabs.map(tab => [tab.id, tab]));
    const reorderedTabs = [];

    newOrder.forEach((tabId) => {
      const tab = byId.get(tabId);
      if (tab) {
        reorderedTabs.push(tab);
        byId.delete(tabId);
      }
    });

    // Якщо у newOrder чогось немає, не губимо вкладки.
    byId.forEach(tab => reorderedTabs.push(tab));

    tabs = reorderedTabs;
    console.log('[TAB] Tabs reordered');
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
  const activeTab = getActiveTabSafe();
  if (!activeTab) {
    console.error('[TAB] No active tab to navigate');
    return;
  }

  const url = resolveNavigationTarget(input, isTorActive);
  activeTab.url = url;
  activeTab.title = activeTab.title || 'Loading...';

  console.log('[TAB] Navigation:', input, '->', url);
  
  // Відправляємо команду на webview для навігації
  sendToRenderer('webview-navigate', { tabId: activeTabId, url });
  sendToRenderer('update-url-bar', url);
}

/**
 * Навігація назад
 */
function goBack() {
  const activeTab = getActiveTabSafe();
  if (!activeTab) return;

  // Відправляємо команду webview
  sendToRenderer('webview-go-back', { tabId: activeTabId });
}

/**
 * Навігація вперед
 */
function goForward() {
  const activeTab = getActiveTabSafe();
  if (!activeTab) return;
  
  // Відправляємо команду webview
  sendToRenderer('webview-go-forward', { tabId: activeTabId });
}

/**
 * Перезавантаження активної вкладки
 */
function reload() {
  const activeTab = getActiveTabSafe();
  if (activeTab) {
    sendToRenderer('webview-reload', { tabId: activeTabId });
    console.log('[TAB] Reloaded active tab');
  }
}

/**
 * Оновлює розміри активної вкладки (не потрібно для webview - CSS handled)
 */
function updateActiveTabBounds(mainWindow, sidebarWidth, offsetRight = 0) {
  // Webview розміри керуються через CSS, не потрібно вручну
}

/**
 * Встановлює висоту топбара (не потрібно для webview - CSS handled)
 */
function setTopbarHeight(height) {
  // Розміри webview керуються CSS у renderer process.
}

/**
 * Отримує дані для збереження сесії
 */
function getSessionData() {
  return tabs
    .map(tab => ({
      url: tab.url || '',
      title: tab.title || 'Нова вкладка',
      isActive: tab.id === activeTabId,
      navigationHistory: tab.navigationHistory || [],
      currentIndex: tab.currentIndex || 0
    }))
    .filter(tab => isRestorableUrl(tab.url));
}

/**
 * Відновлює сесію зі збережених вкладок
 */
function restoreSession(sessionData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const sessionTabs = Array.isArray(sessionData?.tabs) ? sessionData.tabs : [];
  const savedActiveIndex = Number.isInteger(sessionData?.activeTabIndex)
    ? sessionData.activeTabIndex
    : 0;

  console.log('[TAB] Restoring session. Saved tabs:', sessionTabs.length);

  tabs = [];
  activeTabId = 1;
  nextTabId = 1;

  const validTabs = sessionTabs.filter(tab => typeof tab?.url === 'string' && tab.url.trim() !== '');

  if (validTabs.length === 0) {
    initFirstTab(null, null);
    return;
  }

  validTabs.forEach((savedTab) => {
    const tabId = nextTabId;
    const tabData = {
      ...buildTabState(tabId, savedTab.url, savedTab.title || 'Loading...'),
      navigationHistory: Array.isArray(savedTab.navigationHistory) ? savedTab.navigationHistory : [],
      currentIndex: Number.isInteger(savedTab.currentIndex) ? savedTab.currentIndex : 0
    };

    tabs.push(tabData);

    const webviewHTML = createWebviewElement(tabId, savedTab.url);
    mainWindow.webContents.send('create-webview', {
      tabId,
      html: webviewHTML,
      url: savedTab.url
    });

    setupTabEventHandlers(tabData, mainWindow, {
      storage,
      themeManager,
      injectUnifiedT9,
      emitReactiveEvent,
      formatUrlLabel
    });

    mainWindow.webContents.send('tab-restored', {
      tabId,
      url: savedTab.url,
      title: tabData.title
    });

    nextTabId++;
  });

  const activeIndex = Math.max(0, Math.min(savedActiveIndex, tabs.length - 1));
  activeTabId = tabs[activeIndex].id;

  mainWindow.webContents.send('switch-webview', { tabId: activeTabId });
  mainWindow.webContents.send('tab-activated', activeTabId);
  mainWindow.webContents.send('update-url-bar', tabs[activeIndex].url || '');

  console.log('[TAB] Session restored successfully');
}

/**
 * Оновлює інформацію про вкладку (викликається з IPC)
 */
function updateTabInfo(tabId, url, title) {
  const tab = getTabById(tabId);
  if (tab) {
    if (url)   tab.url   = url;
    if (title) tab.title = title;
    console.log(`[TAB] Updated tab ${tabId}: url=${url || '-'} title=${title || '-'}`);
  }
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
  return getActiveTabSafe();
}

/**
 * Отримує ID активної вкладки
 */
function getActiveTabId() {
  return activeTabId;
}

module.exports = {
  init,
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
  updateTabInfo,
  getAllTabs,
  getActiveTab,
  getActiveTabId,
  setupTabEventHandlers,
  registerWindowOpenHandler
};
