/**
 * Tab Manager - Система управління вкладками (WEBVIEW VERSION)
 * Створення, перемикання,закриття, відновлення сесій
 * Використовує <webview> HTML теги замість BrowserView
 */

const{ session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Стан вкладок
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;
let mainWindowRef = null;

/**
 * Ініціалізує систему вкладок
 */
function init(mainWindow) {
  mainWindowRef = mainWindow;
  console.log('[TAB-WEBVIEW] System initialized');
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
  tabs = [{
    id: 1,
    url: startUrl,
    title: 'New tab',
    navigationHistory: [],
    currentIndex: 0
  }];
  activeTabId = 1;
  nextTabId = 2;
  
  // Відправляємо команду на створення webview елемента
  if (mainWindowRef) {
    const webviewHTML = createWebviewElement(1, startUrl);
    mainWindowRef.webContents.send('create-webview', { tabId: 1, html: webviewHTML, url: startUrl });
  }
  
  console.log('[TAB-WEBVIEW] First tab initialized');
}

/**
 * Створює нову вкладку
 */
function createTab(mainWindow, url = null, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const targetUrl = url || null;

  const newTab = {
    id: nextTabId,
    url: targetUrl,
    title: url ? 'Loading...' : 'New tab',
    navigationHistory: [],
    currentIndex: 0
  };
  
  tabs.push(newTab);
  
  // Встановлюємо як активну ПЕРЕД створенням HTML (щоб отримала клас "active")
  activeTabId = newTab.id;
  
  // Створюємо HTML елемент webview
  const webviewHTML = createWebviewElement(nextTabId, targetUrl);
  
  // Відправляємо на UI для створення
  mainWindow.webContents.send('create-webview', { 
    tabId: nextTabId, 
    html: webviewHTML,
    url: targetUrl
  });
  
  // Активуємо webview (на випадок якщо HTML створився без класу)
  mainWindow.webContents.send('switch-webview', { tabId: nextTabId });
  
  // Налаштовуємо обробники подій
  setupTabEventHandlers(newTab, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel });
  
  console.log('[TAB-WEBVIEW] Created tab:', nextTabId);
  
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
  console.log('[TAB-WEBVIEW] Handlers setup for tab:', id);
}

/**
 * Реєструє обробник window.open (не потрібен для webview)
 */
function registerWindowOpenHandler(browserView, mainWindow) {
  // Webview має власну логіку обробки нових вікон через атрибут 'new-window'
  // Обробляється на стороні renderer process
  console.log('[TAB-WEBVIEW] Window open handler (handled by webview natively)');
}

/**
 * Перемикає на вкладку за ID
 */
function switchTab(tabId, mainWindow, sidebarWidth) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) {
    console.error('[TAB-WEBVIEW] Tab not found:', tabId);
    return false;
  }
  
  activeTabId = tabId;
  
  // Відправляємо команду на UI для перемикання класу .active
  mainWindow.webContents.send('switch-webview', { tabId });
  
  // Оновлюємо URL bar
  mainWindow.webContents.send('update-url-bar', tab.url);
  
  console.log('[TAB-WEBVIEW] Switched to tab:', tabId);
  return true;
}

/**
 * Закриває вкладку
 */
function closeTab(tabId, mainWindow) {
  console.log('[TAB-MANAGER] 🗑️ closeTab called with tabId:', tabId);
  console.log('[TAB-MANAGER] Current tabs count:', tabs.length);
  console.log('[TAB-MANAGER] Current tabs:', tabs.map(t => t.id));
  
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  console.log('[TAB-MANAGER] Tab index found:', tabIndex);
  
  if (tabIndex === -1) {
    console.warn('[TAB-MANAGER] ⚠️ Tab not found in tabs array');
    return false;
  }
  
  // Якщо це остання вкладка - повертаємо true
  if (tabs.length <= 1) {
    console.log('[TAB-MANAGER] 🚪 Closing last tab - returning true to quit app');
    return true;
  }
  
  // Якщо це активна вкладка, перемкнемось на іншу
  if (activeTabId === tabId) {
    console.log('[TAB-MANAGER] 🔄 Closing active tab, switching to another...');
    const newActiveTab = tabs[tabIndex + 1] || tabs[tabIndex - 1];
    if (newActiveTab) {
      console.log('[TAB-MANAGER] Switching to tab:', newActiveTab.id);
      switchTab(newActiveTab.id, mainWindow, 0);
    }
  }
  
  // Видаляємо webview елемент з DOM
  console.log('[TAB-MANAGER] 📤 Sending remove-webview to renderer...');
  mainWindow.webContents.send('remove-webview', { tabId });
  
  // Видаляємо з масиву
  tabs.splice(tabIndex, 1);
  
  console.log('[TAB-MANAGER] ✅ Tab closed. Remaining tabs:', tabs.length);
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
    console.log('[TAB-WEBVIEW] Reordered successfully');
    return true;
  } catch (error) {
    console.error('[TAB-WEBVIEW] Reorder error:', error);
    return false;
  }
}

/**
 * Навігує активну вкладку до URL
 */
function navigate(input, isTorActive) {
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] ══════════════════════════════════════');
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] navigate() викликано');
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] Input:', input);
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] isTorActive:', isTorActive);
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] activeTabId:', activeTabId);
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] Всього вкладок:', tabs.length);
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] Список вкладок:', tabs.map(t => `id:${t.id}`).join(', '));
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] Знайдена активна вкладка:', !!activeTab);
  if (activeTab) {
    console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] Активна вкладка ID:', activeTab.id);
    console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] Поточний URL:', activeTab.url);
  }
  
  if (!activeTab) {
    console.error('❌ [TAB-WEBVIEW] No active tab to navigate');
    console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] ══════════════════════════════════════');
    return;
  }
  
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
  
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] ──────────────────────────────────────');
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] Фінальний URL:', url);
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] Відправка команди webview-navigate');
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] tabId:', activeTabId);
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] mainWindowRef:', !!mainWindowRef);
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] mainWindowRef.webContents:', !!mainWindowRef?.webContents);
  console.log('[TAB-WEBVIEW] Navigation:', input, '→', url);
  
  // Відправляємо команду на webview для навігації
  mainWindowRef.webContents.send('webview-navigate', { tabId: activeTabId, url });
  
  console.log('✅ [ДІАГНОСТИКА TAB-MANAGER] Команда webview-navigate відправлена!');
  console.log('🌐 [ДІАГНОСТИКА TAB-MANAGER] ══════════════════════════════════════');
}

/**
 * Навігація назад
 */
function goBack() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  console.log('[TAB-WEBVIEW.goBack] navigationHistory:', activeTab.navigationHistory?.length || 0);
  console.log('[TAB-WEBVIEW.goBack] currentIndex:', activeTab.currentIndex ?? 0);
  
  // Відправляємо команду webview
  mainWindowRef.webContents.send('webview-go-back', { tabId: activeTabId });
}

/**
 * Навігація вперед
 */
function goForward() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  // Відправляємо команду webview
  mainWindowRef.webContents.send('webview-go-forward', { tabId: activeTabId });
}

/**
 * Перезавантаження активної вкладки
 */
function reload() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    mainWindowRef.webContents.send('webview-reload', { tabId: activeTabId });
    console.log('[TAB-WEBVIEW] Reloaded');
  }
}

/**
 * Оновлює розміри активної вкладки (не потрібно для webview - CSS handled)
 */
function updateActiveTabBounds(mainWindow, sidebarWidth, offsetRight = 0) {
  // Webview розміри керуються через CSS, не потрібно вручну
  console.log('[TAB-WEBVIEW] Bounds update (CSS handled)');
}

/**
 * Встановлює висоту топбара (не потрібно для webview - CSS handled)
 */
function setTopbarHeight(height) {
  console.log('[TAB-WEBVIEW] Topbar height (CSS handled):', height);
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
    .filter(tab => tab.url && tab.url !== 'about:blank' && !tab.url.startsWith('file://') && !tab.url.startsWith('app://'));
}

/**
 * Відновлює сесію зі збережених вкладок
 */
function restoreSession(sessionData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const sessionTabs = sessionData.tabs || [];
  const savedActiveIndex = sessionData.activeTabIndex || 0;
  
  console.log('[TAB-WEBVIEW SESSION] Found saved tabs:', sessionTabs.length);
  
  if (sessionTabs.length === 0) {
    console.log('[TAB-WEBVIEW SESSION] No tabs to restore, initializing first tab');
    // Використовуємо initFirstTab щоб id=1 збігався з хардкодним DOM-елементом
    initFirstTab(null, null);
    return;
  }
  
  // Очищуємо початкову вкладку
  tabs = [];
  
  // Відновлюємо кожну вкладку
  sessionTabs.forEach((tab, index) => {
    if (tab.url && tab.url.trim() !== '') {
      const tabData = {
        id: nextTabId,
        url: tab.url,
        title: tab.title || 'Loading...',
        navigationHistory: tab.navigationHistory || [],
        currentIndex: tab.currentIndex || 0
      };
      
      tabs.push(tabData);
      
      // Створюємо webview елемент
      const webviewHTML = createWebviewElement(nextTabId, tab.url);
      mainWindow.webContents.send('create-webview', {
        tabId: nextTabId,
        html: webviewHTML,
        url: tab.url
      });
      
      // Налаштовуємо обробники
      setupTabEventHandlers(tabData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel });
      
      // Відправляємо на UI
      mainWindow.webContents.send('tab-restored', {
        tabId: nextTabId,
        url: tab.url,
        title: tab.title || 'Loading...'
      });
      
      console.log(`[TAB-WEBVIEW] Restored tab ${nextTabId} with history: ${tab.navigationHistory?.length || 0} entries`);
      
      nextTabId++;
    }
  });
  
  // Активуємо відповідну вкладку
  if (tabs.length > 0) {
    const activeIndex = Math.min(savedActiveIndex, tabs.length - 1);
    activeTabId = tabs[activeIndex].id;
    mainWindow.webContents.send('switch-webview', { tabId: activeTabId });
    mainWindow.webContents.send('tab-activated', activeTabId);
  }
  
  console.log('[TAB-WEBVIEW SESSION] Restored successfully!');
}

/**
 * Оновлює інформацію про вкладку (викликається з IPC)
 */
function updateTabInfo(tabId, url, title) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.url = url;
    tab.title = title;
    console.log(`[TAB-WEBVIEW] Updated tab ${tabId}: ${title}`);
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
  return tabs.find(t => t.id === activeTabId);
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
