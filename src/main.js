/**
 * BrowserX Main Process
 * Координатор модулів та app lifecycle
 */

// Завантажуємо змінні середовища
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app, BrowserWindow, BrowserView, ipcMain, Menu, session } = require('electron');
const fs = require('fs');
const Groq = require('groq-sdk');

// Модулі
const storage = require('./modules/storage');
const { infiniteArticleGenerator } = require('./modules/ai-feed');
const reactiveEvents = require('./modules/reactive-events');
const torManager = require('./modules/tor-manager');
const themeManager = require('./modules/theme-manager');
const tabManager = require('./modules/tab-manager');
const ipcHandlers = require('./modules/ipc-handlers');
const aiHandlers = require('./modules/ai-handlers');
const privacyGuard = require('./modules/privacy-guard');

console.log('[CONSOLE] Starting BrowserX...');

// Очищаємо кеш config
delete require.cache[require.resolve('./config')];
const config = require('./config');

// Глобальні змінні
let mainWindow;
let browserView;
let groqClient;
let sidebarWidth = 0;

/**
 * Інжектує unified-t9 скрипт у BrowserView
 */
function injectUnifiedT9(targetBrowserView = browserView) {
  try {
    const unifiedT9Script = fs.readFileSync(
      path.join(__dirname, 'modules', 'unified-t9.js'), 
      'utf8'
    );
    
    targetBrowserView.webContents.executeJavaScript(unifiedT9Script)
      .then(() => console.log('[T9] Autocomplete ready'))
      .catch(err => console.error('[T9] Injection error:', err));
  } catch (error) {
    console.error('[T9] Failed to read unified-t9.js:', error);
  }
}

/**
 * Створює головне вікно браузера
 */
function createWindow() {
  // Ініціалізуємо Groq AI
  console.log('[GROQ] Starting initialization...');
  console.log('[GROQ] config.GROQ_API_KEY:', config.GROQ_API_KEY ? `EXISTS (${config.GROQ_API_KEY.substring(0, 15)}...)` : 'NOT FOUND');
  
  try {
    if (!config.GROQ_API_KEY || config.GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
      console.error('[ERROR] API key not configured in .env file');
    } else {
      groqClient = new Groq({ apiKey: config.GROQ_API_KEY });
      console.log('[OK] Groq AI initialized');
      console.log('[OK] groqClient is:', typeof groqClient);
    }
  } catch (error) {
    console.error('[ERROR] Groq initialization error:', error.message);
  }

  // Реєструємо AI handlers після ініціалізації groqClient
  aiHandlers.registerAIHandlers(groqClient, infiniteArticleGenerator, tabManager);

  // Створюємо вікно (frameless)
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Створюємо меню (F12 для DevTools)
  const template = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Main Window DevTools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow.webContents.isDevToolsOpened()) {
              mainWindow.webContents.closeDevTools();
            } else {
              mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
          }
        },
        {
          label: 'Toggle BrowserView DevTools',
          accelerator: 'Ctrl+Shift+I',
          click: () => {
            if (browserView && browserView.webContents) {
              if (browserView.webContents.isDevToolsOpened()) {
                browserView.webContents.closeDevTools();
              } else {
                browserView.webContents.openDevTools({ mode: 'detach' });
              }
            }
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Завантажуємо UI
  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

  // Створюємо BrowserView
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      session: session.defaultSession // КРИТИЧНО: використовуємо defaultSession з Tor проксі
    }
  });
  
  tabManager.registerWindowOpenHandler(browserView, mainWindow);
  mainWindow.setBrowserView(browserView);
  browserView.setBackgroundColor('#ffffff');
  
  // Позіціонуємо BrowserView
  const bounds = mainWindow.getContentBounds();
  browserView.setBounds({ 
    x: 0, 
    y: 100,
    width: bounds.width,
    height: bounds.height - 100 
  });
  
  browserView.setAutoResize({ 
    width: false,
    height: true 
  });

  // Завантажуємо стартову сторінку
  const startUrl = `file://${path.join(__dirname, '..', 'public', 'newtab.html')}`;
  browserView.webContents.loadURL(startUrl);
  
  // Ініціалізуємо першу вкладку
  tabManager.initFirstTab(browserView, startUrl);

  // Налаштовуємо обробники для першої вкладки
  tabManager.setupTabEventHandlers(
    { id: 1, browserView }, 
    mainWindow, 
    { 
      storage, 
      themeManager, 
      injectUnifiedT9, 
      emitReactiveEvent: (payload) => reactiveEvents.emitReactiveEvent(payload, mainWindow),
      formatUrlLabel: reactiveEvents.formatUrlLabel 
    }
  );

  // Оновлюємо розміри при зміні вікна
  mainWindow.on('resize', () => updateBrowserViewBounds());
  mainWindow.on('maximize', () => updateBrowserViewBounds());
  mainWindow.on('unmaximize', () => updateBrowserViewBounds());

  // Автозбереження сесії при закритті
  mainWindow.on('close', () => {
    const sessionTabs = tabManager.getSessionData();
    console.log('[SESSION] Before save:');
    sessionTabs.forEach((tab, i) => {
      console.log(`  Tab ${i}: url=${tab.url}, currentIndex=${tab.currentIndex}, navHistory.length=${tab.navigationHistory?.length || 0}`);
    });
    const activeTabId = tabManager.getActiveTabId();
    storage.saveSession(sessionTabs, activeTabId);
    console.log('[SESSION] Auto-saved on close');
  });

  function updateBrowserViewBounds() {
    tabManager.updateActiveTabBounds(mainWindow, sidebarWidth);
  }
}

/**
 * Розумне відновлення сесії
 */
function restoreSessionSmart() {
  try {
    const session = storage.getSession();
    
    tabManager.restoreSession(
      session, 
      mainWindow, 
      { 
        storage, 
        themeManager, 
        injectUnifiedT9, 
        emitReactiveEvent: (payload) => reactiveEvents.emitReactiveEvent(payload, mainWindow),
        formatUrlLabel: reactiveEvents.formatUrlLabel,
        sidebarWidth 
      }
    );
  } catch (error) {
    console.error('[ERROR] Session restore error:', error.message);
  }
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(async () => {
  // Ініціалізуємо захист конфіденційності ПЕРЕД запуском Tor
  privacyGuard.initializePrivacyProtection();
  
  createWindow(); // Створюємо вікно
  
  // Запускаємо Tor з передачею mainWindow для відправки прогресу
  await torManager.startTor('DE', { mainWindow });
  reactiveEvents.setupReactiveNetworkEvents(mainWindow);
  
  // Відновлюємо сесію
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => restoreSessionSmart(), 500);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  torManager.stopTor();
});

// ==================== WINDOW IPC HANDLERS ====================

ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  console.log('[WINDOW] Close command received');
  if (mainWindow) mainWindow.close();
  app.quit();
});

// ==================== THEME IPC HANDLERS ====================

ipcMain.on('apply-theme', (event, theme) => {
  console.log('[THEME] Applying:', theme.name);
  mainWindow.webContents.send('theme-changed', theme);
});

ipcMain.on('update-theme-settings', (event, settings) => {
  themeManager.updateThemeSettings(settings);
  
  // Оновлюємо всі newtab сторінки
  tabManager.getAllTabs().forEach(tab => {
    const url = tab.browserView.webContents.getURL();
    if (url.includes('newtab.html')) {
      themeManager.injectThemeToNewtab(tab.browserView);
    }
  });
});

// ==================== UI LAYOUT IPC HANDLERS ====================

ipcMain.on('sidebar-toggled', (event, isCollapsed) => {
  sidebarWidth = isCollapsed ? 0 : 320;
  tabManager.updateActiveTabBounds(mainWindow, sidebarWidth);
  console.log(`[UI] Sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`);
});

ipcMain.on('menu-toggled', (event, isOpen) => {
  const offset = isOpen ? 330 : 0;
  tabManager.updateActiveTabBounds(mainWindow, sidebarWidth, offset);
  console.log(`[UI] Menu ${isOpen ? 'opened' : 'closed'}`);
});

ipcMain.on('settings-panel-toggled', (event, isOpen) => {
  const offset = isOpen ? 400 : 0;
  tabManager.updateActiveTabBounds(mainWindow, sidebarWidth, offset);
  console.log(`[UI] Settings panel ${isOpen ? 'opened' : 'closed'}`);
});

ipcMain.on('topbar-height-changed', (event, height) => {
  tabManager.setTopbarHeight(height);
  tabManager.updateActiveTabBounds(mainWindow, sidebarWidth);
  console.log(`[UI] Topbar height changed to: ${height}px`);
});

// ==================== TAB IPC HANDLERS ====================

ipcMain.handle('create-tab', async (event, url = null) => {
  return tabManager.createTab(mainWindow, url, {
    storage,
    themeManager,
    injectUnifiedT9,
    emitReactiveEvent: (payload) => reactiveEvents.emitReactiveEvent(payload, mainWindow),
    formatUrlLabel: reactiveEvents.formatUrlLabel,
    sidebarWidth
  });
});

ipcMain.on('switch-tab', (event, tabId) => {
  tabManager.switchTab(tabId, mainWindow, sidebarWidth);
});

ipcMain.on('close-tab', (event, tabId) => {
  const shouldClose = tabManager.closeTab(tabId, mainWindow);
  if (shouldClose) {
    console.log('[TAB] Last tab closed - quitting');
    app.quit();
  }
});

ipcMain.on('reorder-tabs', (event, newOrder) => {
  tabManager.reorderTabs(newOrder);
});

// ==================== NAVIGATION IPC HANDLERS ====================

ipcMain.on('navigate', (event, input) => {
  tabManager.navigate(input, torManager.isTorEnabled());
});

ipcMain.on('go-back', () => {
  tabManager.goBack();
});

ipcMain.on('go-forward', () => {
  tabManager.goForward();
});

ipcMain.on('reload', () => {
  tabManager.reload();
});

// ==================== REACTIVE EVENTS ====================

ipcMain.handle('get-reactive-events', () => {
  return reactiveEvents.getReactiveEventBuffer();
});

// ==================== TOR IPC HANDLERS ====================

ipcMain.handle('toggle-tor', async () => {
  return await torManager.toggleTor(mainWindow);
});

ipcMain.handle('get-tor-status', () => {
  return torManager.getTorStatus();
});

// ==================== REGISTER MODULE HANDLERS ====================

// Реєструємо IPC handlers з модулів
ipcHandlers.registerStorageHandlers(storage, tabManager);
// AI handlers реєструються всередині createWindow() після ініціалізації groqClient

console.log('[CONSOLE] BrowserX main process initialized');
