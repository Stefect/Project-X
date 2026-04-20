const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app, BrowserWindow, ipcMain, Menu, session, net, protocol, clipboard } = require('electron');
if (protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);
}
const fs = require('fs');
const Groq = require('groq-sdk');
const storage = require('./modules/storage');
const reactiveEvents = require('./modules/reactive-events');
const torManager = require('./modules/tor-manager');
const themeManager = require('./modules/theme-manager');
const tabManager = require('./modules/tab-manager');
const ipcHandlers = require('./modules/ipc-handlers');
const privacyGuard = require('./modules/privacy-guard');
const { registerNewsHandlers } = require('./modules/news-handlers');
const aiScheduler = require('./modules/ai-task-scheduler');
const { infiniteArticleGenerator } = require('./modules/ai-feed');
const { registerAIHandlers } = require('./modules/ai-handlers');

console.log('[CONSOLE] Starting BrowserX...');
delete require.cache[require.resolve('./config')];
const config = require('./config');
let mainWindow;
let splashWindow;
let groqClient;
let aiHandlersRegistered = false;
let splashStartTime = 0;


function createSplashWindow() {
  console.log('[SPLASH] Creating splash window...');
  splashStartTime = Date.now();
  
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


function injectUnifiedT9(webviewId) {
  console.log('[T9] Injection requested for webview:', webviewId);
}


async function createWindow() {
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

  if (!aiHandlersRegistered) {
    registerAIHandlers(groqClient, infiniteArticleGenerator, tabManager);
    aiHandlersRegistered = true;
    console.log('[IPC] AI handlers wired in createWindow()');
  }
  console.log('[PROXY] Setting direct connection (no proxy) on startup...');
  const defaultSes = session.defaultSession;
  const webviewSes = session.fromPartition('persist:main');
  await Promise.all([
    defaultSes.setProxy({ mode: 'direct' }),
    webviewSes.setProxy({ mode: 'direct' })
  ]);
  console.log('[PROXY] ✅ Direct connection enabled for both sessions');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#1a1b26',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[MAIN] All resources loaded (did-finish-load)');
    setTimeout(() => {
      console.log('[MAIN] App fully initialized, closing splash');
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }, 800);
  });
  mainWindow.on('closed', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow = null;
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[ERROR] Main window failed to load:', errorDescription);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });
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
          label: 'Toggle WebView DevTools',
          accelerator: 'Ctrl+Shift+I',
          click: () => {
            mainWindow.webContents.send('toggle-webview-devtools');
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
  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
  tabManager.init(mainWindow);
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
}


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
        formatUrlLabel: reactiveEvents.formatUrlLabel
      }
    );
  } catch (error) {
    console.error('[ERROR] Session restore error:', error.message);
  }
}
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[PROTOCOL] Another instance is already running, quitting...');
  app.quit();
} else {
  console.log('[PROTOCOL] Single instance lock acquired');
}

app.whenReady().then(async () => {
  const publicDir = path.resolve(path.join(__dirname, '..', 'public'));
  const appProtocolHandler = (request) => {
    const { pathname } = new URL(request.url);
    const resolved = path.resolve(path.join(publicDir, pathname));
    if (!resolved.startsWith(publicDir + path.sep) && resolved !== publicDir) {
      return new Response('Not Found', { status: 404 });
    }
    return net.fetch('file://' + resolved);
  };
  protocol.handle('app', appProtocolHandler);
  session.fromPartition('persist:main').protocol.handle('app', appProtocolHandler);
  console.log('[PROTOCOL] app:// protocol registered for internal pages');
  createSplashWindow();
  await new Promise(resolve => setTimeout(resolve, 500));
  privacyGuard.initializePrivacyProtection();
  app.on('web-contents-created', (event, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        const isTorEnabled = torManager.isTorEnabled();
        
        if (isTorEnabled) {
          const url = webContents.getURL();
          console.log(`[PRIVACY] ❌ BLOCKED geolocation request from: ${url}`);
          console.log('[PRIVACY] Reason: Tor is active, geolocation would reveal real location');
          callback(false);
          return;
        } else {
          console.log('[PRIVACY] ⚠️ Geolocation request (Tor OFF, allowing)');
        }
      }
      callback(true);
    });
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
  
  await createWindow();
  console.log('[TOR] Tor auto-start DISABLED. User will enable manually via button.');
  
  reactiveEvents.setupReactiveNetworkEvents(mainWindow);
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

ipcMain.on('show-context-menu', (event, params) => {
  const { tabId, selectionText, linkURL, linkText, srcURL, mediaType, isEditable, pageURL } = params;
  const template = [];
  if (selectionText) {
    const label = selectionText.length > 30 ? selectionText.substring(0, 30) + '…' : selectionText;
    if (isEditable) {
      template.push({ label: 'Вирізати', click: () => mainWindow.webContents.send('context-menu-action', { action: 'cut', tabId }) });
    }
    template.push({ label: 'Копіювати', click: () => mainWindow.webContents.send('context-menu-action', { action: 'copy', tabId }) });
    template.push({ type: 'separator' });
    template.push({
      label: `Знайти: "${label}"`,
      click: () => mainWindow.webContents.send('context-menu-action', { action: 'search', tabId, text: selectionText })
    });
    template.push({
      label: `Перекласти: "${label}"`,
      click: () => mainWindow.webContents.send('context-menu-action', { action: 'translate', tabId, text: selectionText })
    });
  }
  if (isEditable) {
    template.push({ label: 'Вставити', click: () => mainWindow.webContents.send('context-menu-action', { action: 'paste', tabId }) });
    template.push({ label: 'Виділити все', click: () => mainWindow.webContents.send('context-menu-action', { action: 'select-all', tabId }) });
  }
  if (linkURL) {
    if (template.length > 0) template.push({ type: 'separator' });
    template.push({
      label: 'Відкрити посилання в новій вкладці',
      click: () => mainWindow.webContents.send('context-menu-action', { action: 'open-link-new-tab', tabId, url: linkURL })
    });
    template.push({
      label: 'Копіювати адресу посилання',
      click: () => clipboard.writeText(linkURL)
    });
    if (linkText) {
      template.push({
        label: 'Копіювати текст посилання',
        click: () => clipboard.writeText(linkText)
      });
    }
  }
  if (mediaType === 'image' && srcURL) {
    if (template.length > 0) template.push({ type: 'separator' });
    template.push({
      label: 'Відкрити зображення в новій вкладці',
      click: () => mainWindow.webContents.send('context-menu-action', { action: 'open-link-new-tab', tabId, url: srcURL })
    });
    template.push({
      label: 'Копіювати адресу зображення',
      click: () => clipboard.writeText(srcURL)
    });
    template.push({
      label: 'Зберегти зображення як…',
      click: () => mainWindow.webContents.send('context-menu-action', { action: 'save-image', tabId, url: srcURL })
    });
  }
  if (template.length > 0) template.push({ type: 'separator' });
  template.push({ label: 'Назад',    click: () => tabManager.goBack()   });
  template.push({ label: 'Вперед',  click: () => tabManager.goForward() });
  template.push({ label: 'Оновити', click: () => tabManager.reload()    });

  template.push({ type: 'separator' });
  template.push({
    label: 'Копіювати адресу сторінки',
    click: () => clipboard.writeText(pageURL)
  });
  template.push({
    label: 'Переглянути вихідний код',
    click: () => mainWindow.webContents.send('context-menu-action', { action: 'view-source', tabId, url: pageURL })
  });
  template.push({
    label: 'Інструменти розробника',
    click: () => mainWindow.webContents.send('toggle-webview-devtools')
  });

  Menu.buildFromTemplate(template).popup({ window: mainWindow });
});

ipcMain.on('apply-theme', (event, theme) => {
  console.log('[THEME] Applying:', theme.name);
  mainWindow.webContents.send('theme-changed', theme);
});

ipcMain.on('update-theme-settings', (event, settings) => {
  themeManager.updateThemeSettings(settings);
  if (mainWindow) {
    mainWindow.webContents.send('update-newtab-themes', settings);
  }
});

ipcMain.on('sidebar-toggled', (event, isCollapsed) => {
  console.log(`[UI-WEBVIEW] Sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`);
});

ipcMain.on('menu-toggled', (event, isOpen) => {
  console.log(`[UI-WEBVIEW] Menu ${isOpen ? 'opened' : 'closed'}`);
});

ipcMain.on('settings-panel-toggled', (event, isOpen) => {
  console.log(`[UI-WEBVIEW] Settings panel ${isOpen ? 'opened' : 'closed'}`);
});

ipcMain.on('topbar-height-changed', (event, height) => {
  tabManager.setTopbarHeight(height);
  console.log(`[UI-WEBVIEW] Topbar height changed to: ${height}px`);
});

ipcMain.handle('create-tab', async (event, url = null) => {
  return tabManager.createTab(mainWindow, url, {
    storage,
    themeManager,
    injectUnifiedT9,
    emitReactiveEvent: (payload) => reactiveEvents.emitReactiveEvent(payload, mainWindow),
    formatUrlLabel: reactiveEvents.formatUrlLabel
  });
});

ipcMain.on('switch-tab', (event, tabId) => {
  tabManager.switchTab(tabId, mainWindow, 0);
});

ipcMain.on('close-tab', (event, tabId) => {
  console.log('[IPC] 📨 Received close-tab request for tabId:', tabId);
  const shouldClose = tabManager.closeTab(tabId, mainWindow);
  console.log('[IPC] Tab manager returned shouldClose:', shouldClose);
  if (shouldClose) {
    console.log('[TAB] 🚪 Last tab closed - quitting application');
    app.quit();
  } else {
    console.log('[TAB] ✅ Tab closed successfully, continuing');
  }
});

ipcMain.on('reorder-tabs', (event, newOrder) => {
  tabManager.reorderTabs(newOrder);
});

ipcMain.on('navigate', (event, input) => {
  console.log('📨 [ДІАГНОСТИКА MAIN] Отримано IPC navigate від renderer');
  console.log('📨 [ДІАГНОСТИКА MAIN] Input URL:', input);
  console.log('📨 [ДІАГНОСТИКА MAIN] Tor enabled:', torManager.isTorEnabled());
  console.log('📨 [ДІАГНОСТИКА MAIN] Викликаємо tabManager.navigate()...');
  
  tabManager.navigate(input, torManager.isTorEnabled());
  
  console.log('✅ [ДІАГНОСТИКА MAIN] tabManager.navigate() виконано');
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

ipcMain.handle('get-reactive-events', () => {
  return reactiveEvents.getReactiveEventBuffer();
});

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
    try {
      const torData = await fetchWithProxy('https://check.torproject.org/api/ip', true);
      ip = torData.IP;
      responseTime = Date.now() - startTime;
      console.log('[IP CHECK] ✓ Got IP from Tor Project API:', ip);
    } catch (err1) {
      console.warn('[IP CHECK] Tor Project API failed:', err1.message);
      
      try {
        ip = await fetchWithProxy('https://ident.me/', false);
        responseTime = Date.now() - startTime;
        console.log('[IP CHECK] ✓ Got IP from ident.me:', ip);
      } catch (err2) {
        console.warn('[IP CHECK] ident.me failed:', err2.message);
        ip = await fetchWithProxy('https://icanhazip.com/', false);
        responseTime = Date.now() - startTime;
        console.log('[IP CHECK] ✓ Got IP from icanhazip.com:', ip);
      }
    }
    
    if (!ip) {
      throw new Error('Не вдалося отримати IP адресу');
    }
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
      if (geoResult && geoResult.country_name) {
        geoData = geoResult;
        console.log('[IP CHECK] ✓ Got geo data:', geoData.country_name, geoData.city);
      } else {
        console.log('[IP CHECK] → Using default geo data for Tor');
      }
    } catch (geoErr) {
      console.warn('[IP CHECK] Geo lookup exception:', geoErr.message);
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
ipcHandlers.registerStorageHandlers(storage, tabManager);
ipcHandlers.registerAISchedulerHandlers(aiScheduler);
registerNewsHandlers();
setTimeout(() => {
  console.log('\n[TEST] 🧪 Демонстрація AI Task Scheduler...\n');
  aiScheduler.addTask({
    name: 'Саммарі фонової вкладки #1',
    type: 'summary',
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('   📝 Саммарі готовий');
    }
  }, 1);

  aiScheduler.addTask({
    name: 'Саммарі фонової вкладки #2',
    type: 'summary',
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('   📝 Саммарі готовий');
    }
  }, 1);
  aiScheduler.addTask({
    name: 'Переклад сторінки',
    type: 'translation',
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('   🌐 Переклад завершено');
    }
  }, 5);
  aiScheduler.addTask({
    name: 'T9 Автодоповнення тексту',
    type: 't9',
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
      console.log('   ⚡ T9 підказка готова');
    }
  }, 10);

  aiScheduler.addTask({
    name: 'Аналіз контенту',
    type: 'analysis',
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 1200));
      console.log('   🔍 Аналіз завершено');
    }
  }, 2);

  console.log('[TEST] ✅ Завдання додані. Виконання за пріоритетом.\n');
}, 5000);

console.log('[CONSOLE] BrowserX main process initialized');
function handleAppUrl(url) {
  console.log('[PROTOCOL] Handling app:// URL:', url);

  if (mainWindow) {
    const { pathname } = new URL(url);
    console.log('[PROTOCOL] Loading:', pathname);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('handle-app-url', pathname);
  }
}
if (process.argv.length >= 2) {
  const possibleUrl = process.argv.find(arg => arg.startsWith('app://'));
  if (possibleUrl) {
    console.log('[PROTOCOL] Found app:// URL in startup args:', possibleUrl);
    app.whenReady().then(() => {
      setTimeout(() => handleAppUrl(possibleUrl), 1000);
    });
  }
}
app.on('second-instance', (event, commandLine, workingDirectory) => {
  console.log('[PROTOCOL] Second instance detected');

  const url = commandLine.find(arg => arg.startsWith('app://'));
  if (url) {
    handleAppUrl(url);
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('app://')) {
    handleAppUrl(url);
  }
});
