/**
 * BrowserX Main Process
 * Координатор модулів та app lifecycle
 */

// Завантажуємо змінні середовища
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app, BrowserWindow, BrowserView, ipcMain, Menu, session, net } = require('electron');
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
let splashWindow; // Вікно заставки
let browserView;
let groqClient;
let sidebarWidth = 40; // Завжди залишаємо 40px для стрілки
let splashStartTime = 0; // Час показу splash

/**
 * Створює splash screen (заставку при завантаженні)
 */
function createSplashWindow() {
  console.log('[SPLASH] Creating splash window...');
  splashStartTime = Date.now(); // Запам’ятовуємо час старту
  
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  const splashPath = path.join(__dirname, '..', 'public', 'splash.html');
  console.log('[SPLASH] Loading splash from:', splashPath);
  
  splashWindow.loadFile(splashPath);
  splashWindow.center();
  
  splashWindow.once('ready-to-show', () => {
    console.log('[SPLASH] Splash window ready to show');
    splashWindow.show();
  });
  
  console.log('[SPLASH] Splash screen created');
}

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

  // Створюємо вікно (frameless, але спочатку невидиме)
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    show: false, // ВАЖЛИВО: ховаємо до повного завантаження
    backgroundColor: '#1a1b26', // Фон щоб не було білого спалаху
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Коли головне вікно готове - закриваємо splash і показуємо браузер
  mainWindow.once('ready-to-show', () => {
    console.log('[MAIN] Main window ready');
    
    // Визначаємо скільки часу минуло з показу splash
    const splashElapsed = Date.now() - splashStartTime;
    const minSplashDuration = 2000; // 2 секунди мінімум
    const remainingTime = Math.max(0, minSplashDuration - splashElapsed);
    
    console.log(`[MAIN] Splash shown for ${splashElapsed}ms, waiting ${remainingTime}ms more`);
    
    // Чекаємо мінімальний час показу
    setTimeout(() => {
      console.log('[MAIN] Closing splash and showing main window');
      
      // Плавне закриття splash
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      
      // Показуємо головне вікно
      mainWindow.show();
      mainWindow.focus();
    }, remainingTime);
  });

  // Обробник закриття головного вікна
  mainWindow.on('closed', () => {
    // Якщо splash чомусь ще відкритий - закриваємо його
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow = null;
  });

  // На випадок помилки завантаження - все одно закриваємо splash
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[ERROR] Main window failed to load:', errorDescription);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show(); // Показуємо навіть з помилкою
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
    x: sidebarWidth, // Залишаємо місце для sidebar
    y: 100,
    width: bounds.width - sidebarWidth,
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
  // Спочатку показуємо splash screen
  createSplashWindow();
  
  // Невелика затримка перед ініціалізацією важких компонентів
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Ініціалізуємо захист конфіденційності ПЕРЕД запуском Tor
  privacyGuard.initializePrivacyProtection();
  
  // Глобальне блокування геолокації для ВСІХ вкладок (BrowserView, webview, etc.)
  app.on('web-contents-created', (event, contents) => {
    // Перехоплюємо запити дозволів для кожного нового webContents
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        const isTorEnabled = torManager.isTorEnabled();
        
        if (isTorEnabled) {
          const url = webContents.getURL();
          console.log(`[PRIVACY] ❌ BLOCKED geolocation request from: ${url}`);
          console.log('[PRIVACY] Reason: Tor is active, geolocation would reveal real location');
          callback(false); // Жорстка відмова
          return;
        } else {
          console.log('[PRIVACY] ⚠️ Geolocation request (Tor OFF, allowing)');
        }
      }
      callback(true); // Дозволяємо інші дозволи
    });
    
    // Інжектуємо блокування геолокації через JavaScript для кожної нової вкладки
    contents.on('did-finish-load', () => {
      const isTorEnabled = torManager.isTorEnabled();
      if (isTorEnabled) {
        const geolocationBlockScript = `
          (function() {
            if (window.__geoLocationBlocked) return;
            window.__geoLocationBlocked = true;
            
            const fakeGeolocation = {
              getCurrentPosition: function(success, error) {
                console.warn('[PRIVACY GUARD] Geolocation blocked - Tor is active');
                if (error) {
                  error({ 
                    code: 1, 
                    message: 'User denied Geolocation',
                    PERMISSION_DENIED: 1
                  });
                }
              },
              watchPosition: function(success, error) {
                console.warn('[PRIVACY GUARD] Geolocation watchPosition blocked');
                if (error) {
                  error({ 
                    code: 1, 
                    message: 'User denied Geolocation',
                    PERMISSION_DENIED: 1
                  });
                }
                return -1;
              },
              clearWatch: function() {}
            };
            
            try {
              Object.defineProperty(navigator, 'geolocation', {
                get: () => fakeGeolocation,
                configurable: false,
                enumerable: true
              });
              console.log('[PRIVACY GUARD] ✓ Geolocation API has been disabled');
            } catch (e) {
              console.error('[PRIVACY GUARD] Failed to block geolocation:', e);
            }
          })();
        `;
        
        contents.executeJavaScript(geolocationBlockScript)
          .catch(err => console.error('[PRIVACY] Failed to inject geolocation block:', err.message));
      }
    });
  });
  
  console.log('[PRIVACY] ✓ Global web-contents-created handler registered');
  
  // Глобальний обробник для ВСІХ нових сесій (включно з кастомними)
  app.on('session-created', (customSession) => {
    console.log('[PRIVACY] New session created, applying permission handler...');
    
    customSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        const isTorEnabled = torManager.isTorEnabled();
        
        if (isTorEnabled) {
          const url = webContents.getURL();
          console.log(`[PRIVACY] ❌ BLOCKED geolocation in custom session from: ${url}`);
          callback(false);
          return;
        }
      }
      callback(true);
    });
  });
  
  console.log('[PRIVACY] ✓ Global session-created handler registered');
  
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
  sidebarWidth = isCollapsed ? 40 : 260; // 40px для стрілки, 260px для відкритого sidebar
  tabManager.updateActiveTabBounds(mainWindow, sidebarWidth);
  console.log(`[UI] Sidebar ${isCollapsed ? 'collapsed' : 'expanded'}, width: ${sidebarWidth}`);
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
  return await torManager.toggleTor(mainWindow, tabManager);
});

ipcMain.handle('get-tor-status', () => {
  return torManager.getTorStatus();
});

ipcMain.handle('is-tor-enabled', () => {
  return torManager.isTorEnabled();
});

ipcMain.handle('check-ip', async () => {
  try {
    const startTime = Date.now();
    
    // Використовуємо net.request, який автоматично використовує session проксі
    const fetchWithProxy = (url, isJson = true) => {
      return new Promise((resolve, reject) => {
        const request = net.request({
          url: url,
          session: session.defaultSession
        });
        
        let data = '';
        
        request.on('response', (response) => {
          console.log(`[IP CHECK] Response status: ${response.statusCode} for ${url}`);
          
          response.on('data', (chunk) => {
            data += chunk.toString();
          });
          
          response.on('end', () => {
            try {
              if (isJson) {
                const jsonData = JSON.parse(data);
                resolve(jsonData);
              } else {
                resolve(data.trim());
              }
            } catch (err) {
              console.error('[IP CHECK] Parse error:', err.message);
              console.error('[IP CHECK] Received data:', data.substring(0, 200));
              reject(new Error(`Parse error: ${err.message}`));
            }
          });
          
          response.on('error', (err) => {
            reject(new Error(`Response error: ${err.message}`));
          });
        });
        
        request.on('error', (err) => {
          reject(new Error(`Request error: ${err.message}`));
        });
        
        request.end();
      });
    };
    
    let ip = null;
    let responseTime = 0;
    
    // Спробуємо кілька Tor-friendly API для отримання IP
    try {
      // Варіант 1: Tor Project API (найкраще для Tor)
      const torData = await fetchWithProxy('https://check.torproject.org/api/ip', true);
      ip = torData.IP;
      responseTime = Date.now() - startTime;
      console.log('[IP CHECK] ✓ Got IP from Tor Project API:', ip);
    } catch (err1) {
      console.warn('[IP CHECK] Tor Project API failed:', err1.message);
      
      try {
        // Варіант 2: ident.me (текстова відповідь)
        ip = await fetchWithProxy('https://ident.me/', false);
        responseTime = Date.now() - startTime;
        console.log('[IP CHECK] ✓ Got IP from ident.me:', ip);
      } catch (err2) {
        console.warn('[IP CHECK] ident.me failed:', err2.message);
        
        // Варіант 3: icanhazip.com
        ip = await fetchWithProxy('https://icanhazip.com/', false);
        responseTime = Date.now() - startTime;
        console.log('[IP CHECK] ✓ Got IP from icanhazip.com:', ip);
      }
    }
    
    if (!ip) {
      throw new Error('Не вдалося отримати IP адресу');
    }
    
    // Отримуємо геолокацію з graceful fallback
    const torStatus = torManager.getTorStatus();
    let geoData = {
      country_name: torStatus.active ? 'Tor Network' : 'Невідомо',
      city: torStatus.active ? 'Anonymous' : 'Невідомо',
      region: '',
      org: torStatus.active ? 'Tor Exit Node' : 'Невідомо',
      asn: ''
    };
    
    try {
      const geoRequest = net.request({
        url: `https://ipapi.co/${ip}/json/`,
        session: session.defaultSession
      });
      
      const geoResult = await new Promise((resolve, reject) => {
        let data = '';
        let statusCode = 0;
        
        geoRequest.on('response', (response) => {
          statusCode = response.statusCode;
          console.log(`[IP CHECK] Geo API response status: ${statusCode}`);
          
          response.on('data', (chunk) => {
            data += chunk.toString();
          });
          
          response.on('end', () => {
            // Перевіряємо чи успішна відповідь (200 OK)
            if (statusCode === 200) {
              try {
                const jsonData = JSON.parse(data);
                resolve(jsonData);
              } catch (err) {
                console.warn('[IP CHECK] Geo API повернув не-JSON:', data.substring(0, 100));
                resolve(null);
              }
            } else {
              console.warn(`[IP CHECK] Geo API заблокував запит (HTTP ${statusCode})`);
              if (statusCode === 403) {
                console.warn('[IP CHECK] Cloudflare блокує Tor трафік - використовуємо дефолтні значення');
              }
              resolve(null);
            }
          });
        });
        
        geoRequest.on('error', (err) => {
          console.warn('[IP CHECK] Geo request error:', err.message);
          resolve(null);
        });
        
        geoRequest.end();
      });
      
      // Якщо отримали геодані, використовуємо їх
      if (geoResult && geoResult.country_name) {
        geoData = geoResult;
        console.log('[IP CHECK] ✓ Got geo data:', geoData.country_name, geoData.city);
      } else {
        console.log('[IP CHECK] → Using default geo data for Tor');
      }
    } catch (geoErr) {
      console.warn('[IP CHECK] Geo lookup exception:', geoErr.message);
      // Лишаємо дефолтні значення
    }
    
    return {
      ip: ip,
      responseTime: responseTime,
      country: geoData.country_name || 'Невідомо',
      city: geoData.city || 'Невідомо',
      region: geoData.region || '',
      org: geoData.org || 'Невідомо',
      asn: geoData.asn || ''
    };
  } catch (error) {
    console.error('[IP CHECK] Error:', error);
    throw new Error(`Не вдалося перевірити IP: ${error.message}`);
  }
});

// ==================== REGISTER MODULE HANDLERS ====================

// Реєструємо IPC handlers з модулів
ipcHandlers.registerStorageHandlers(storage, tabManager);
// AI handlers реєструються всередині createWindow() після ініціалізації groqClient

console.log('[CONSOLE] BrowserX main process initialized');
