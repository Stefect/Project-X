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
    title: 'New tab',
    navigationHistory: [],
    currentIndex: 0
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
    title: 'Loading...',
    navigationHistory: [],
    currentIndex: 0
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
function setupTabEventHandlers(tabOrId, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel }) {
  // Отримуємо ID вкладки
  const id = typeof tabOrId === 'object' ? tabOrId.id : tabOrId;
  
  // Функція для отримання актуального посилання на вкладку з масиву
  const getTab = () => tabs.find(t => t.id === id);
  
  const initialTab = getTab();
  if (!initialTab || !initialTab.browserView) {
    console.error('[TAB] Cannot setup handlers - tab not found:', id);
    return;
  }
  
  const browserView = initialTab.browserView;
  
  // Завантаження завершено
  browserView.webContents.on('did-finish-load', () => {
    const tab = getTab(); // Отримуємо актуальне посилання
    if (!tab) return;
    
    const currentUrl = browserView.webContents.getURL();
    const title = browserView.webContents.getTitle();
    
    // Оновлюємо URL та title в об'єкті вкладки для збереження сесії
    tab.url = currentUrl;
    tab.title = title;
    
    // Оновлюємо поточний індекс в історії на основі реальної історії webContents
    // ТІЛЬКИ якщо немає збереженої навігаційної історії з сесії
    // (після рестарту webContents знає лише про 1 завантажений URL, activeIndex=0,
    // що перезаписує правильний currentIndex з відновленої сесії)
    try {
      const navHistory = browserView.webContents.navigationHistory;
      if (navHistory && (!tab.navigationHistory || tab.navigationHistory.length <= 1)) {
        tab.currentIndex = navHistory.getActiveIndex();
      }
    } catch (e) {
      // Ігноруємо помилки
    }

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
    mainWindow.webContents.send('update-tab-info', id, title, currentUrl);
  });
  
  // Навігація
  browserView.webContents.on('did-navigate', () => {
    const tab = getTab(); // Отримуємо актуальне посилання
    if (!tab) return;
    
    const currentUrl = browserView.webContents.getURL();
    const title = browserView.webContents.getTitle();
    
    console.log(`[TAB.did-navigate] ${id}: BEFORE - currentIndex=${tab.currentIndex}, navHistory.length=${tab.navigationHistory?.length || 0}`);
    console.log(`[TAB.did-navigate] ${id}: URL=${currentUrl}, _skipHistoryUpdate=${tab._skipHistoryUpdate}, _isRestoringHistory=${tab._isRestoringHistory}`);
    
    // Оновлюємо URL в об'єкті вкладки для збереження сесії
    tab.url = currentUrl;
    tab.title = title;
    
    // Якщо це навігація по нашій збереженій історії, просто скидаємо флаг
    if (tab._skipHistoryUpdate) {
      console.log(`[TAB.did-navigate] ${id}: SKIP - navigating saved history, keeping currentIndex=${tab.currentIndex}`);
      tab._skipHistoryUpdate = false;
      mainWindow.webContents.send('update-tab-info', id, title, currentUrl);
      if (id === activeTabId) {
        mainWindow.webContents.send('update-url-bar', currentUrl);
      }
      return;
    }
    
    // Оновлюємо нашу збережену історію для нової/нормальної навігації
    if (!tab.navigationHistory) {
      tab.navigationHistory = [];
      tab.currentIndex = 0;
    }
    
    // ВАЖЛИВО: При першому завантаженні з восстановленої історії, не перезаписуємо
    if (tab._isRestoringHistory) {
      console.log(`[TAB.did-navigate] ${id}: RESTORING - keeping currentIndex=${tab.currentIndex}`);
      tab._isRestoringHistory = false; // Скидаємо прапорець після першого разу
      
      // Просто оновлюємо глобальну історію
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
    
    // Синхронізуємо з webContents історією ТІЛЬКИ якщо наша історія порожня
    // (якщо є збережена історія з сесії, вона має пріоритет, бо webContents
    // після рестарту накопичує loadURL виклики в неправильному порядку)
    try {
      const navHistory = browserView.webContents.navigationHistory;
      if (navHistory) {
        const entries = navHistory.getAllEntries();
        const activeIndex = navHistory.getActiveIndex();
        
        console.log(`[TAB] WebContents history: ${entries.length} entries, active index: ${activeIndex}`);
        
        // Беремо історію з webContents тільки якщо наша порожня
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
    
    // Якщо webContents синхронізація не вдалась, або її немає, використовуємо нашу логіку
    // Видаляємо всі записи після поточного індексу
    // (якщо користувач вернувся і почав багатити що-то нове)
    tab.navigationHistory = tab.navigationHistory.slice(0, tab.currentIndex + 1);
    
    // Додаємо нову сторінку, тільки якщо це не та сама сторінка
    const lastUrl = tab.navigationHistory[tab.navigationHistory.length - 1]?.url;
    if (lastUrl !== currentUrl) {
      tab.navigationHistory.push({ url: currentUrl, title: title });
      tab.currentIndex = tab.navigationHistory.length - 1;
      console.log(`[TAB] History updated: ${tab.currentIndex + 1} entries`);
    }
    
    // Обмежуємо розмір історії до 50 записів
    const MAX_HISTORY_SIZE = 50;
    if (tab.navigationHistory.length > MAX_HISTORY_SIZE) {
      const excess = tab.navigationHistory.length - MAX_HISTORY_SIZE;
      tab.navigationHistory = tab.navigationHistory.slice(excess);
      tab.currentIndex = Math.max(0, tab.currentIndex - excess);
      console.log(`[TAB] History trimmed to ${MAX_HISTORY_SIZE} entries`);
    }
    
    // Зберігаємо в глобальну історію браузера
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
    const tab = getTab(); // Отримуємо актуальне посилання
    if (!tab) return;
    
    // Оновлюємо URL в об'єкті вкладки
    tab.url = url;
    
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
        label: 'Додати в конспект',
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
  if (!activeTab) return;
  
  console.log('[TAB.goBack] canGoBack:', activeTab.browserView.webContents.canGoBack());
  console.log('[TAB.goBack] navigationHistory:', activeTab.navigationHistory?.length || 0);
  console.log('[TAB.goBack] currentIndex:', activeTab.currentIndex ?? 0);
  
  // Спочатку перевіряємо нашу збережену історію (критично для відновлених сесій,
  // бо webContents після рестарту знає лише про нещодавно завантажені URL)
  if (activeTab.navigationHistory && activeTab.navigationHistory.length > 1) {
    const currentIndex = activeTab.currentIndex ?? 0;
    console.log(`[TAB] goBack: currentIndex=${currentIndex}, historyLength=${activeTab.navigationHistory.length}`);
    
    if (currentIndex > 0) {
      activeTab.currentIndex = currentIndex - 1;
      const prevUrl = activeTab.navigationHistory[activeTab.currentIndex].url;
      
      console.log(`[TAB] Going back to: ${prevUrl}`);
      
      // Перевіряємо чи webContents може обробити навігацію нативно
      // (краще зберігає стан сторінки: scroll, форми тощо)
      try {
        const navHistory = activeTab.browserView.webContents.navigationHistory;
        if (navHistory) {
          const entries = navHistory.getAllEntries();
          const wcActiveIndex = navHistory.getActiveIndex();
          // Якщо webContents має повну історію і попередній запис відповідає нашому
          if (wcActiveIndex > 0 && entries[wcActiveIndex - 1]?.url === prevUrl) {
            activeTab._skipHistoryUpdate = true;
            activeTab.browserView.webContents.goBack();
            console.log('[TAB] Back (webContents, synced)');
            return;
          }
        }
      } catch (e) { /* fallback to loadURL */ }
      
      // Флаг, щоб не перезаписувати історію при завантаженні
      activeTab._skipHistoryUpdate = true;
      
      activeTab.browserView.webContents.loadURL(prevUrl).then(() => {
        console.log(`[TAB] Navigated back to index ${activeTab.currentIndex}`);
      }).catch(err => {
        console.error('[TAB] Failed to navigate back:', err.message);
        // Повертаємо індекс назад якщо помилка
        activeTab.currentIndex = currentIndex;
      }).finally(() => {
        // Скидаємо флаг після завантаження
        setTimeout(() => { activeTab._skipHistoryUpdate = false; }, 100);
      });
    } else {
      console.log('[TAB] Already at the beginning of history');
    }
    return;
  }
  
  // Фолбек: якщо нашої історії немає, використовуємо webContents
  if (activeTab.browserView.webContents.canGoBack()) {
    activeTab.browserView.webContents.goBack();
    console.log('[TAB] Back (webContents fallback)');
  } else {
    console.log('[TAB] No history available');
  }
}

/**
 * Навігація вперед
 */
function goForward() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  // Спочатку перевіряємо нашу збережену історію (критично для відновлених сесій)
  if (activeTab.navigationHistory && activeTab.navigationHistory.length > 1) {
    const currentIndex = activeTab.currentIndex ?? 0;
    console.log(`[TAB] goForward: currentIndex=${currentIndex}, historyLength=${activeTab.navigationHistory.length}`);
    
    if (currentIndex < activeTab.navigationHistory.length - 1) {
      activeTab.currentIndex = currentIndex + 1;
      const nextUrl = activeTab.navigationHistory[activeTab.currentIndex].url;
      
      console.log(`[TAB] Going forward to: ${nextUrl}`);
      
      // Перевіряємо чи webContents може обробити навігацію нативно
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
      } catch (e) { /* fallback to loadURL */ }
      
      // Флаг, щоб не перезаписувати історію при завантаженні
      activeTab._skipHistoryUpdate = true;
      
      activeTab.browserView.webContents.loadURL(nextUrl).then(() => {
        console.log(`[TAB] Navigated forward to index ${activeTab.currentIndex}`);
      }).catch(err => {
        console.error('[TAB] Failed to navigate forward:', err.message);
        // Повертаємо індекс назад якщо помилка
        activeTab.currentIndex = currentIndex;
      }).finally(() => {
        // Скидаємо флаг після завантаження
        setTimeout(() => { activeTab._skipHistoryUpdate = false; }, 100);
      });
    } else {
      console.log('[TAB] Already at the end of history');
    }
    return;
  }
  
  // Фолбек: якщо нашої історії немає, використовуємо webContents
  if (activeTab.browserView.webContents.canGoForward()) {
    activeTab.browserView.webContents.goForward();
    console.log('[TAB] Forward (webContents fallback)');
  } else {
    console.log('[TAB] No history available');
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
    .map(tab => {
      // Використовуємо збережений tab.url як основний джерело, webContents як фолбек
      let url = tab.url || '';
      let title = tab.title || 'Нова вкладка';
      let navigationHistory = tab.navigationHistory || [];
      let currentIndex = tab.currentIndex || 0;
      
      console.log(`[SESSION.save] Tab ${tab.id}: currentIndex=${currentIndex}, navHistory.length=${navigationHistory.length}`);
      
      // Спробувати отримати актуальну історію навігації з webContents
      try {
        if (tab.browserView?.webContents && !tab.browserView.webContents.isDestroyed()) {
          url = tab.browserView.webContents.getURL() || url;
          title = tab.browserView.webContents.getTitle() || title;
          
          // Отримуємо історію навігації
          const navHistory = tab.browserView.webContents.navigationHistory;
          if (navHistory) {
            const entries = navHistory.getAllEntries();
            const activeIndexWC = navHistory.getActiveIndex();
            
            console.log(`[SESSION.save] WebContents: ${entries.length} entries, activeIndex=${activeIndexWC}`);
            
            // Якщо є записи в webContents історії, перевіримо чи потрібно оновити
            if (entries.length > 0) {
              // Якщо наша історія порожна, беремо з webContents як фолбек
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
        // webContents може бути знищений при закритті або API недоступний
        console.log('[SESSION.save] Could not get navigation history:', e.message);
      }
      
      // Обмежуємо історію до останніх 20 записів для економії місця
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
        title: tab.title || 'Loading...',
        navigationHistory: tab.navigationHistory || [],
        currentIndex: tab.currentIndex || 0,
        _isRestoringHistory: tab.navigationHistory && tab.navigationHistory.length > 0 // Флаг для першого did-navigate
      };
      
      console.log(`[SESSION.restore] Tab ${nextTabId}: url=${tab.url}, currentIndex=${tab.currentIndex}, navHistory.length=${tab.navigationHistory?.length || 0}, _isRestoringHistory=${tabData._isRestoringHistory}`);
      
      tabs.push(tabData);
      
      // Налаштовуємо обробники
      setupTabEventHandlers(tabData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel });
      
      // Завантажуємо тільки поточний URL (швидко!)
      // Історія навігації зберігається в tabData і використовується функціями goBack/goForward
      tabView.webContents.loadURL(tab.url).catch(err => {
        console.error('[TAB] Failed to load:', tab.url);
      });
      
      console.log(`[TAB] Restored with history: ${tab.navigationHistory?.length || 0} entries, current: ${tab.currentIndex || 0}`);
      
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
