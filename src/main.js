const { app, BrowserWindow, BrowserView, ipcMain, Menu, MenuItem, session, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const Groq = require('groq-sdk');
const EventEmitter = require('events');

console.log('[CONSOLE] Starting BrowserX...');

// Модуль збереження даних (історія, закладки, сесія)
const storage = require('./modules/storage');
const { infiniteArticleGenerator } = require('./modules/ai-feed');

// Увеличиваем лимит слушателей событий для избежания предупреждений
EventEmitter.defaultMaxListeners = 20;

// ==================== REACTIVE EVENTS (LIVE DASHBOARD) ====================
const REACTIVE_EVENT_LIMIT = 50;
const reactiveEventBus = new EventEmitter();
const reactiveEventBuffer = [];

const trackerHostMarkers = [
  'doubleclick.net',
  'google-analytics.com',
  'googletagmanager.com',
  'adservice.google.com',
  'adsystem.com',
  'facebook.net',
  'connect.facebook.net',
  'pixel.facebook.com',
  'stats.g.doubleclick.net',
  'analytics.twitter.com',
  'static.ads-twitter.com',
  'snap.licdn.com'
];

const trackerPathMarkers = ['/collect', '/g/collect', '/tr', '/pixel', '/adsct'];
const trackerEmitCooldownMs = 5000;
const trackerLastEmitted = new Map();

function getHostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return '';
  }
}

function isLikelyTrackerUrl(url) {
  const host = getHostFromUrl(url);
  if (!host) return false;

  const matchesHost = trackerHostMarkers.some(marker => host === marker || host.endsWith(`.${marker}`));
  if (matchesHost) return true;

  const lowerUrl = url.toLowerCase();
  return trackerPathMarkers.some(marker => lowerUrl.includes(marker));
}

function shouldEmitTrackerEvent(host) {
  if (!host) return false;
  const lastTime = trackerLastEmitted.get(host) || 0;
  const now = Date.now();
  if (now - lastTime < trackerEmitCooldownMs) return false;
  trackerLastEmitted.set(host, now);
  return true;
}

function formatUrlLabel(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch (error) {
    return url;
  }
}

function emitReactiveEvent(payload) {
  const event = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now(),
    ...payload
  };

  reactiveEventBuffer.unshift(event);
  if (reactiveEventBuffer.length > REACTIVE_EVENT_LIMIT) {
    reactiveEventBuffer.length = REACTIVE_EVENT_LIMIT;
  }

  reactiveEventBus.emit('event', event);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reactive-event', event);
  }

  return event;
}

function setupReactiveNetworkEvents() {
  if (!session || !session.defaultSession) return;

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url || '';
    const isMainFrame = details.resourceType === 'mainFrame';
    const isLocal = url.startsWith('file://') || url.startsWith('devtools://');

    if (!isLocal && !isMainFrame && isLikelyTrackerUrl(url)) {
      const host = getHostFromUrl(url);
      if (shouldEmitTrackerEvent(host)) {
        emitReactiveEvent({
          type: 'tracker-blocked',
          title: 'Заблоковано трекер',
          detail: host || 'Невідомий домен'
        });
      }
      callback({ cancel: true });
      return;
    }

    callback({});
  });

  session.defaultSession.on('will-download', (event, item) => {
    const filename = item.getFilename();

    emitReactiveEvent({
      type: 'download-start',
      title: 'Download started',
      detail: filename
    });

    item.once('done', (_event, state) => {
      if (state === 'completed') {
        emitReactiveEvent({
          type: 'download-complete',
          title: 'Download completed',
          detail: filename
        });
      } else {
        emitReactiveEvent({
          type: 'download-failed',
          title: 'Download interrupted',
          detail: filename
        });
      }
    });
  });
}

// Очищаємо кеш config при кожному запуску
delete require.cache[require.resolve('../config')];
const config = require('../config');

let mainWindow;
let browserView;
let groqClient;
let torProcess;
let isTorActive = false;

// Система управління вкладками
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;
let sidebarWidth = 0; // За замовчуванням sidebar згорнутий

// Глобальні налаштування теми (синхронізуються з UI)
let themeSettings = {
  mode: 'dark',
  bg: '#1a1b26',
  accent: '#3b82f6',
  wallpaper: 'none'
};

function requestOpenInNewTab(url) {
  if (!url || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('open-in-new-tab', url);
}

function registerWindowOpenHandler(targetView) {
  if (!targetView || !targetView.webContents || targetView.webContents.isDestroyed()) return;
  targetView.webContents.setWindowOpenHandler(({ url }) => {
    requestOpenInNewTab(url);
    return { action: 'deny' };
  });
}

// Функція запуску Tor
function startTor() {
  // Визначаємо платформу для вибору правильного бінарника
  const isWindows = process.platform === 'win32';
  const torBinary = isWindows ? 'tor.exe' : 'tor';
  const torPath = path.join(__dirname, '..', 'bin', 'tor', torBinary);
  const fs = require('fs');
  
  // Перевіряємо чи існує tor
  if (!fs.existsSync(torPath)) {
    console.log(`[TOR] Tor not found at path: ${torPath}`);
    console.log('[TOR] Download Tor Expert Bundle and place binary in bin/tor/ folder');
    console.log(`   Windows: tor.exe | macOS/Linux: tor`);
    return;
  }
  
  // Для Unix систем встановлюємо права на виконання
  if (!isWindows) {
    try {
      fs.chmodSync(torPath, 0o755);
      console.log('[TOR] Set execution permissions for Tor');
    } catch (err) {
      console.error('[TOR] Failed to set execution permissions:', err.message);
    }
  }
  
  console.log(`[TOR] Starting Tor (${process.platform}):`, torPath);
  
  const geoipPath = path.join(__dirname, '..', 'bin', 'data', 'geoip');
  const geoip6Path = path.join(__dirname, '..', 'bin', 'data', 'geoip6');
  
  const torArgs = [
    '--GeoIPFile', geoipPath,
    '--GeoIPv6File', geoip6Path
  ];
  
  const spawnOptions = {
    cwd: path.join(__dirname, '..', 'bin', 'tor')
  };
  
  // Приховуємо консольне вікно тільки на Windows
  if (isWindows) {
    spawnOptions.windowsHide = true;
  }
  
  torProcess = spawn(torPath, torArgs, spawnOptions);
  
  torProcess.stdout.on('data', (data) => {
    const output = data.toString('utf8');
    console.log('Tor:', output);
    
    // Перевіряємо чи Tor готовий
    if (output.includes('Bootstrapped 100%')) {
      console.log('[TOR] Tor successfully connected!');
      if (mainWindow) {
        mainWindow.webContents.send('tor-ready', true);
      }
    }
  });
  
  torProcess.stderr.on('data', (data) => {
    const output = data.toString('utf8');
    // Tor виводить багато інформації в stderr - це нормально
    // Показуємо тільки справжні помилки
    if (output.includes('[err]') || output.includes('ERROR')) {
      console.error('Tor Error:', output);
    }
  });
  
  torProcess.on('close', (code) => {
    console.log('[TOR] Tor process exited with code:', code);
  });
}

function createWindow() {
  // Ініціалізуємо Groq AI (швидше за Gemini!)
  try {
    if (!config.GROQ_API_KEY || config.GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
      console.error('[ERROR] API key not configured in config.js');
    } else {
      groqClient = new Groq({ apiKey: config.GROQ_API_KEY });
      console.log('[OK] Groq AI initialized with key:', config.GROQ_API_KEY.substring(0, 10) + '...');
    }
  } catch (error) {
    console.error('[ERROR] Groq initialization error:', error.message);
  }

  // Створюємо головне вікно (без рамок, як Chrome)
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Вимикаємо стандартні рамки Windows
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Створюємо меню з DevTools (відкривати через F12)
  const template = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            if (browserView && browserView.webContents) {
              if (browserView.webContents.isDevToolsOpened()) {
                browserView.webContents.closeDevTools();
              } else {
                browserView.webContents.openDevTools();
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

  // Завантажуємо UI браузера
  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

  // Створюємо BrowserView для веб-контенту
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  registerWindowOpenHandler(browserView);
  mainWindow.setBrowserView(browserView);
  
  // Встановлюємо білий фон для BrowserView
  browserView.setBackgroundColor('#ffffff');
  
  // Позіціонуємо BrowserView (залишаємо місце для адресного рядка, вкладок)
  // Sidebar згорнутий за замовчуванням, тому займаємо всю ширину
  const bounds = mainWindow.getContentBounds();
  browserView.setBounds({ 
    x: 0, 
    y: 100, // 40px tabs + 60px toolbar
    width: bounds.width, // Вся ширина - sidebar згорнутий за замовчуванням
    height: bounds.height - 100 
  });
  
  browserView.setAutoResize({ 
    width: false, // Вимикаємо авто-ресайз, щоб не конфліктувало з боковою панеллю
    height: true 
  });

  // Завантажуємо стартову сторінку (нова вкладка)
  const startUrl = `file://${path.join(__dirname, '../public/newtab.html')}`;
  browserView.webContents.loadURL(startUrl);
  
  // Додаємо першу вкладку до масиву
  tabs.push({
    id: 1,
    browserView: browserView,
    url: startUrl,
    title: 'New tab'
  });

  // Інжектуємо скрипт для відслідковування виділення тексту + Code Mate + Link X-Ray + Translator + Unified T9
  browserView.webContents.on('did-finish-load', () => {
    const currentUrl = browserView.webContents.getURL();

    if (!currentUrl.includes('newtab.html')) {
      emitReactiveEvent({
        type: 'page-load',
        title: 'Завантаження завершено',
        detail: formatUrlLabel(currentUrl)
      });
    }
    
    // Якщо це newtab - інжектуємо налаштування теми
    if (currentUrl.includes('newtab.html')) {
      injectThemeToNewtab(browserView);
    } else {
      // Інжектуємо модулі тільки для звичайних сайтів (не для newtab)
      injectSelectionListener(browserView);
      injectCodeMate(browserView);
      injectLinkXRay(browserView);
      injectUnifiedT9(browserView); // Єдина оптимізована T9 система
    }
  });

  browserView.webContents.on('did-navigate', () => {
    const currentUrl = browserView.webContents.getURL();
    const title = browserView.webContents.getTitle();
    
    // Зберігаємо в історію з favicon
    try {
      const favicon = new URL(currentUrl).origin + '/favicon.ico';
      storage.addToHistory(currentUrl, title, favicon);
    } catch (err) {
      storage.addToHistory(currentUrl, title);
    }
  });

  // Obrobka pomylok zavantazhennya
  browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) { // -3 tse cancelled (norma pry navigatsii)
      console.error(`[LOAD ERROR] Pomylka zavantazhennya: ${errorDescription} (kod: ${errorCode})`);
      console.error(`[LOAD ERROR] URL: ${validatedURL}`);
    }
  });

  // Додаємо контекстне меню для виділеного тексту
  browserView.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    // Якщо користувач виділив текст, показуємо опції
    if (params.selectionText) {
      const selectedText = params.selectionText;
      
      // 1. Копіювати
      menu.append(new MenuItem({
        label: 'Копіювати',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          require('electron').clipboard.writeText(selectedText);
        }
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
      
      // 2. AI Помічник
      menu.append(new MenuItem({
        label: '🤖 AI Помічник',
        click: async () => {
          const result = await getAIExplanation(selectedText);
          browserView.webContents.executeJavaScript(`
            window.postMessage({ 
              type: 'AI_ASSISTANT_RESULT', 
              answer: ${JSON.stringify(result)},
              originalText: ${JSON.stringify(selectedText)}
            }, '*');
          `).catch(err => console.error('AI error:', err));
        }
      }));
      
      // 3. Переклад
      menu.append(new MenuItem({
        label: '🌐 Перекласти',
        click: async () => {
          const result = await translateText(selectedText, 'uk');
          if (result.success) {
            browserView.webContents.executeJavaScript(`
              window.postMessage({ 
                type: 'TRANSLATION_RESULT', 
                translation: ${JSON.stringify(result.translation)},
                originalText: ${JSON.stringify(selectedText)}
              }, '*');
            `).catch(err => console.error('Translation error:', err));
          }
        }
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
      
      // 4. Додати в нотатки
      menu.append(new MenuItem({
        label: 'Додати в конспект',
        click: () => {
          mainWindow.webContents.send('add-to-notes', selectedText);
        }
      }));
      
      menu.popup();
    }
  });

  browserView.webContents.on('did-navigate-in-page', () => {
    injectSelectionListener(browserView);
    injectCodeMate(browserView);
    injectLinkXRay(browserView);
    injectUnifiedT9(browserView); // Єдина оптимізована T9 система
  });

  // Оновлюємо назву вкладки при зміні
  browserView.webContents.on('page-title-updated', (event, title) => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
      activeTab.title = title;
      mainWindow.webContents.send('update-tab-title', { tabId: activeTabId, title });
    }
  });

  // Оновлюємо URL в адресній строці
  browserView.webContents.on('did-navigate', (event, url) => {
    mainWindow.webContents.send('update-url-bar', url);
  });

  browserView.webContents.on('did-navigate-in-page', (event, url) => {
    mainWindow.webContents.send('update-url-bar', url);
  });

  // Перехоплюємо console.log з веб-сторінки
  browserView.webContents.on('console-message', async (event, level, message, line, sourceId) => {
    // Виводимо всі консольні повідомлення для діагностики
    const logPrefix = sourceId.includes('history.html') ? '[HISTORY PAGE]' : '[WEB]';
    const levelMap = { 0: 'LOG', 1: 'WARN', 2: 'ERROR' };
    const levelName = levelMap[level] || 'LOG';
    
    if (level >= 1) { // Warn або Error
      console.log(`${logPrefix} [${levelName}] ${message} (${sourceId}:${line})`);
    }
    
    // Обробка запитів на аналіз коду (Code Mate)
    if (message.startsWith('AI_CODE_REQUEST:')) {
      try {
        const data = JSON.parse(message.replace('AI_CODE_REQUEST:', ''));
        emitReactiveEvent({
          type: 'ai-start',
          title: 'AI аналіз коду',
          detail: 'Запит на пояснення'
        });
        const explanation = await getAIExplanation(data.prompt);
        
        // Відправляємо пояснення назад у браузер
        browserView.webContents.executeJavaScript(`
          if (typeof window.showCodeExplanation === 'function') {
            window.showCodeExplanation(${JSON.stringify(explanation)});
          }
        `).catch(err => console.error('Error showing code explanation:', err));

        emitReactiveEvent({
          type: 'ai-complete',
          title: 'AI completed analysis',
          detail: 'Explanation ready'
        });
      } catch (error) {
        console.error('[CODE MATE] Error processing code analysis request:', error);
        emitReactiveEvent({
          type: 'ai-failed',
          title: 'AI error',
          detail: 'Failed to analyze code'
        });
      }
    }
    
    // Обробка X-Ray запитів (сканування посилань)
    if (message.startsWith('XRAY_REQUEST:')) {
      const url = message.replace('XRAY_REQUEST:', '').trim();
      try {
        emitReactiveEvent({
          type: 'ai-start',
          title: 'AI link analysis',
          detail: formatUrlLabel(url)
        });
        const result = await xrayLink(url);
        browserView.webContents.executeJavaScript(`
          if (typeof window._showXRayResult === 'function') {
            window._showXRayResult(${JSON.stringify(result)});
          }
        `).catch(err => console.error('Error showing X-Ray:', err));

        emitReactiveEvent({
          type: 'ai-complete',
          title: 'AI completed analysis',
          detail: formatUrlLabel(url)
        });
      } catch (error) {
        console.error('X-Ray error:', error);
        emitReactiveEvent({
          type: 'ai-failed',
          title: 'AI error',
          detail: formatUrlLabel(url)
        });
      }
    }
    
    // Обробка запитів до AI помічника (натискання K на виділений текст)
    if (message.startsWith('AI_ASSISTANT_REQUEST:')) {
      try {
        const data = JSON.parse(message.replace('AI_ASSISTANT_REQUEST:', ''));
        const result = await getAIExplanation(data.text);
        
        browserView.webContents.executeJavaScript(`
          window.postMessage({ 
            type: 'AI_ASSISTANT_RESULT', 
            answer: ${JSON.stringify(result)},
            originalText: ${JSON.stringify(data.text)}
          }, '*');
        `).catch(err => console.error('Error showing AI response:', err));
      } catch (error) {
        console.error('AI assistant error:', error);
      }
    }
    
    // Обробка запитів на переклад
    if (message.startsWith('TRANSLATE_REQUEST:')) {
      try {
        const data = JSON.parse(message.replace('TRANSLATE_REQUEST:', ''));
        const result = await translateText(data.text, data.targetLanguage);
        
        if (result.success) {
          browserView.webContents.executeJavaScript(`
            window.postMessage({ 
              type: 'TRANSLATION_RESULT', 
              translation: ${JSON.stringify(result.translation)},
              originalText: ${JSON.stringify(data.text)}
            }, '*');
          `).catch(err => console.error('Error showing translation:', err));
        }
      } catch (error) {
        console.error('Translation error:', error);
      }
    }
  });

  // Оновлюємо розміри при зміні розміру вікна
  mainWindow.on('resize', () => {
    updateBrowserViewBounds();
  });
  
  // Оновлюємо розміри при максимізації
  mainWindow.on('maximize', () => {
    updateBrowserViewBounds();
  });
  
  // Оновлюємо розміри при відновленні
  mainWindow.on('unmaximize', () => {
    updateBrowserViewBounds();
  });
  
  // Функція для оновлення розмірів BrowserView
  function updateBrowserViewBounds() {
    const bounds = mainWindow.getContentBounds();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.browserView) {
      activeTab.browserView.setBounds({ 
        x: 0, 
        y: 100, // 40px tabs + 60px toolbar
        width: bounds.width - sidebarWidth,
        height: bounds.height - 100 
      });
    }
  }
  
  // Автоматичне збереження сесії при закритті вікна
  mainWindow.on('close', () => {
    const sessionTabs = tabs
      .map(tab => ({
        url: tab.browserView?.webContents?.getURL() || '',
        title: tab.browserView?.webContents?.getTitle() || 'Нова вкладка'
      }))
      .filter(tab => !tab.url.includes('newtab.html')); // НЕ зберігаємо newtab
    
    storage.saveSession(sessionTabs);
    console.log('[SESSION] Auto-save on close:', sessionTabs.length, 'tabs');
  });
}

// Розумне відновлення сесії - перша вкладка завжди newtab, потім решта
function restoreSessionSmart() {
  try {
    const session = storage.getSession();
    const sessionTabs = session.tabs || [];
    
    console.log('[SESSION] Found saved tabs:', sessionTabs.length);
    
    // Перша вкладка вже є (newtab), відновлюємо тільки інші
    if (sessionTabs.length === 0) {
      console.log('[SESSION] No tabs to restore - showing only newtab');
      return;
    }
    
    console.log('[SESSION] Restoring', sessionTabs.length, 'tabs...');
    
    // НЕ закриваємо newtab - вона залишається першою
    // Додаємо відновлені вкладки після неї
    
    // Відновлюємо кожну вкладку
    sessionTabs.forEach((tab, index) => {
      if (tab.url && tab.url.trim() !== '') {
        // Створюємо новий BrowserView для вкладки
        const tabView = new BrowserView({
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
          }
        });
        registerWindowOpenHandler(tabView);
        
        const tabData = {
          id: nextTabId,
          browserView: tabView,
          url: tab.url,
          title: tab.title || 'Loading...'
        };
        
        tabs.push(tabData);
        
        // Завантажуємо URL
        tabView.webContents.loadURL(tab.url).catch(err => {
          console.log('[ERROR] Failed to load tab:', tab.url);
        });
        
        // Додаємо обробники для відновленої вкладки
        tabView.webContents.on('did-finish-load', () => {
          const currentUrl = tabView.webContents.getURL();
          if (!currentUrl.includes('newtab.html')) {
            emitReactiveEvent({
              type: 'page-load',
              title: 'Page loaded',
              detail: formatUrlLabel(currentUrl)
            });
          }
          if (!currentUrl.includes('newtab.html')) {
            injectSelectionListener(tabView);
            injectCodeMate(tabView);
            injectLinkXRay(tabView);
            injectUnifiedT9(tabView); // Єдина оптимізована T9 система
          }
        });
        
        tabView.webContents.on('page-title-updated', (event, title) => {
          const tab = tabs.find(t => t.id === tabData.id);
          if (tab) {
            tab.title = title;
            mainWindow.webContents.send('update-tab-title', { tabId: tabData.id, title });
          }
        });
        
        // Відправляємо на UI щоб показати вкладку
        mainWindow.webContents.send('tab-restored', {
          tabId: nextTabId,
          url: tab.url,
          title: tab.title
        });
        
        nextTabId++;
      }
    });
    
    // Активуємо першу вкладку
    if (tabs.length > 0) {
      activeTabId = tabs[0].id;
      mainWindow.setBrowserView(tabs[0].browserView);
      
      const bounds = mainWindow.getContentBounds();
      tabs[0].browserView.setBounds({
        x: 0,
        y: 100,
        width: bounds.width - sidebarWidth,
        height: bounds.height - 100
      });
      
      mainWindow.webContents.send('tab-activated', activeTabId);
    }
    
    console.log('[SESSION] Session restored successfully!');
  } catch (error) {
    console.error('[ERROR] Session restore error:', error.message);
  }
}

app.whenReady().then(() => {
  startTor(); // Запускаємо Tor у фоні
  setupReactiveNetworkEvents();
  
  createWindow();
  
  // Відновлюємо сесію з розумною логікою
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      restoreSessionSmart();
    }, 500);
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

// Вбиваємо процес Tor при закритті
app.on('will-quit', () => {
  if (torProcess) {
    console.log('Closing Tor...');
    torProcess.kill();
  }
});

// ========== Керування вікном (для frameless) ==========
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
  console.log('Window close command received');
  if (mainWindow) {
    mainWindow.close();
  }
  app.quit();
});

// Simple settings window removed - functionality replaced by in-app theme panel

// Застосування теми
ipcMain.on('apply-theme', (event, theme) => {
  console.log('[THEME] Applying theme:', theme.name);
  
  // Відправляємо тему на головне вікно
  mainWindow.webContents.send('theme-changed', theme);
});

ipcMain.handle('get-reactive-events', () => {
  return reactiveEventBuffer.slice(0, 20);
});

// Функція для показу popup з перекладом
// Обробка перекладу тексту
async function translateText(text, targetLanguage) {
  try {
    console.log('Translation to', targetLanguage + ':', text.substring(0, 50) + '...');

    if (!groqClient) {
      return { 
        success: false, 
        message: ' AI не ініціалізовано. Перевірте API ключ у config.js' 
      };
    }

    // Визначаємо назву мови
    const languageNames = {
      'uk': 'українську',
      'en': 'англійську',
      'ru': 'російську',
      'de': 'німецьку',
      'fr': 'французьку',
      'es': 'іспанську',
      'it': 'італійську',
      'pl': 'польську',
      'ja': 'японську',
      'zh': 'китайську'
    };

    const targetLangName = languageNames[targetLanguage] || targetLanguage;

    // Формуємо промпт для перекладу
    const prompt = `Переклади наступний текст на ${targetLangName} мову. Поверни ТІЛЬКИ переклад без додаткових коментарів.

Текст для перекладу:
${text}`;

    console.log('Translating via Groq AI...');

    // Питаємо Groq AI
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1000
    });

    const translation = completion.choices[0]?.message?.content?.trim();

    if (!translation) {
      return { 
        success: false, 
        message: ' Помилка перекладу' 
      };
    }

    console.log('Translation ready');
    return { 
      success: true, 
      translation: translation 
    };

  } catch (error) {
    console.error('Translation error:', error);
    return { 
      success: false, 
      message: ` ${error.message}` 
    };
  }
}

ipcMain.handle('translate-text', async (event, text, targetLanguage) => {
  return await translateText(text, targetLanguage);
});

// Обробка зміни мови перекладу
ipcMain.on('change-translation-language', (event, language) => {
  console.log('Translation language changed to:', language);
  
  // Відправляємо повідомлення всім вкладкам
  tabs.forEach(tab => {
    tab.browserView.webContents.executeJavaScript(`
      window.postMessage({ type: 'SET_TRANSLATION_LANGUAGE', language: '${language}' }, '*');
    `).catch(err => console.error('Language change error:', err));
  });
});

// Розумний Організатор Вкладок (Tab Zen Master)
ipcMain.handle('organize-tabs', async (event) => {
  try {
    console.log('Organizing tabs via AI...');

    if (!groqClient) {
      return { 
        success: false, 
        message: ' AI не ініціалізовано. Перевірте API ключ у config.js' 
      };
    }

    if (tabs.length < 2) {
      return { 
        success: false, 
        message: ' Занадто мало вкладок для організації (потрібно хоча б 2)' 
      };
    }

    // Збираємо інформацію про всі вкладки
    const tabsData = await Promise.all(tabs.map(async (tab) => {
      try {
        const title = tab.browserView.webContents.getTitle() || 'Без назви';
        const url = tab.browserView.webContents.getURL() || '';
        return {
          id: tab.id,
          title: title,
          url: url
        };
      } catch (error) {
        return {
          id: tab.id,
          title: 'Load error',
          url: ''
        };
      }
    }));

    const tabsListString = tabsData.map(t => `ID: ${t.id}, Title: "${t.title}", URL: "${t.url}"`).join('\n');

    // Формуємо промпт для AI
    const prompt = `Ти — менеджер вкладок браузера. Я дам тобі список відкритих вкладок.
Твоє завдання: згрупувати їх за змістом та тематикою.

ВАЖЛИВО: Поверни відповідь ТІЛЬКИ у форматі JSON, без markdown, пояснень та зайвого тексту.

Формат відповіді:
{
  "groups": [
    { "name": "Назва групи українською (Навчання, Робота, YouTube, Соцмережі, Кодинг, Новини, Розваги тощо)", "tabIds": [1, 5, 7] },
    { "name": "Інша група", "tabIds": [2, 3] }
  ]
}

Правила:
- Кожна вкладка має бути в якійсь групі
- Назви груп пиши українською
- Групуй за змістом: навчання разом, розваги разом, новини разом тощо
- Якщо вкладка не підходить нікуди - створи групу "Інше"

Список вкладок:
${tabsListString}`;

    console.log('Analyzing tabs via Groq AI...');

    // Питаємо Groq AI
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
      max_tokens: 1000
    });

    let responseText = completion.choices[0]?.message?.content?.trim();

    if (!responseText) {
      return { 
        success: false, 
        message: ' Помилка отримання відповіді від AI' 
      };
    }

    // Чистимо відповідь від можливих markdown тегів
    responseText = responseText.replace(/```json|```/g, '').trim();

    let groupsData;
    try {
      groupsData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parsing error:', responseText);
      return { 
        success: false, 
        message: ' AI повернув некоректний формат відповіді' 
      };
    }

    console.log('Organization ready:', groupsData);
    return { 
      success: true, 
      groups: groupsData.groups,
      tabsData: tabsData
    };

  } catch (error) {
    console.error('Tab organization error:', error);
    return { 
      success: false, 
      message: ` ${error.message}` 
    };
  }
});

// Обробка навігації

// Це замінено на нові обробники вище в блоці "Система управління вкладками"
// ipcMain.on('navigate', ...) - тепер обробляє активну вкладку
// ipcMain.on('go-back', ...) - тепер обробляє активну вкладку
// ipcMain.on('go-forward', ...) - тепер обробляє активну вкладку
// ipcMain.on('reload', ...) - тепер обробляє активну вкладку

// Обробка toggle бокової панелі
ipcMain.on('sidebar-toggled', (event, isCollapsed) => {
  const bounds = mainWindow.getContentBounds();
  sidebarWidth = isCollapsed ? 0 : 320; // Оновлюємо глобальну змінну
  
  // Оновлюємо розміри активної вкладки
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView) {
    activeTab.browserView.setBounds({ 
      x: 0, 
      y: 100, // 40px tabs + 60px toolbar
      width: bounds.width - sidebarWidth,
      height: bounds.height - 100 
    });
  }
  
  console.log(`Sidebar ${isCollapsed ? 'collapsed' : 'expanded'}, browser width: ${bounds.width - sidebarWidth}px`);
});

// Обробка відкриття/закриття меню
ipcMain.on('menu-toggled', (event, isOpen) => {
  const bounds = mainWindow.getContentBounds();
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  if (activeTab && activeTab.browserView) {
    if (isOpen) {
      // Зсуваємо BrowserView праворуч коли меню відкрите
      activeTab.browserView.setBounds({ 
        x: 330, // Ширина меню + відступ
        y: 100,
        width: bounds.width - sidebarWidth - 330,
        height: bounds.height - 100 
      });
    } else {
      // Повертаємо нормальні розміри
      activeTab.browserView.setBounds({ 
        x: 0, 
        y: 100,
        width: bounds.width - sidebarWidth,
        height: bounds.height - 100 
      });
    }
  }
  console.log(`Menu ${isOpen ? 'opened' : 'closed'}`);
});

// Обробник для панелі налаштувань (Chrome-style settings)
ipcMain.on('settings-panel-toggled', (event, isOpen) => {
  const bounds = mainWindow.getContentBounds();
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  if (activeTab && activeTab.browserView) {
    if (isOpen) {
      // Зсуваємо BrowserView ліворуч коли панель налаштувань відкрита (панель справа)
      activeTab.browserView.setBounds({ 
        x: 0,
        y: 100,
        width: bounds.width - sidebarWidth - 400, // 400px - ширина панелі налаштувань
        height: bounds.height - 100 
      });
    } else {
      // Повертаємо нормальні розміри
      activeTab.browserView.setBounds({ 
        x: 0, 
        y: 100,
        width: bounds.width - sidebarWidth,
        height: bounds.height - 100 
      });
    }
  }
  console.log(`Settings panel ${isOpen ? 'opened' : 'closed'}`);
});

// ========== Синхронізація налаштувань теми ==========

// Отримуємо оновлення налаштувань теми з UI
ipcMain.on('update-theme-settings', (event, settings) => {
  themeSettings = { ...themeSettings, ...settings };
  console.log('Theme settings updated:', themeSettings);
  
  // Оновлюємо всі відкриті newtab сторінки
  tabs.forEach(tab => {
    const url = tab.browserView.webContents.getURL();
    if (url.includes('newtab.html')) {
      injectThemeToNewtab(tab.browserView);
    }
  });
});

// Інжектуємо налаштування теми в newtab
function injectThemeToNewtab(browserView) {
  const script = `
    (function() {
      const settings = ${JSON.stringify(themeSettings)};
      
      // Застосовуємо режим
      document.body.classList.remove('light-mode', 'dark-mode');
      if (settings.mode === 'light') {
        document.body.classList.add('light-mode');
      } else {
        document.body.classList.add('dark-mode');
      }
      
      // Застосовуємо акцентний колір
      document.documentElement.style.setProperty('--accent-color', settings.accent);
      
      // Застосовуємо фон
      if (settings.bg) {
        document.body.style.backgroundColor = settings.bg;
      }
      
      // Застосовуємо шпалери
      if (settings.wallpaper && settings.wallpaper !== 'none') {
        const wallpaperGradients = {
          'abstract1': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          'abstract2': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          'abstract3': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          'abstract4': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
          'abstract5': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          'abstract6': 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)'
        };
        
        if (settings.wallpaper.startsWith('data:') || settings.wallpaper.startsWith('http')) {
          document.body.style.backgroundImage = 'url(' + settings.wallpaper + ')';
        } else if (wallpaperGradients[settings.wallpaper]) {
          document.body.style.backgroundImage = wallpaperGradients[settings.wallpaper];
        }
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
      } else {
        document.body.style.backgroundImage = 'none';
      }
      
      console.log('Theme applied to newtab:', settings);
    })();
  `;
  
  browserView.webContents.executeJavaScript(script).catch(err => {
    console.log('Theme injection error:', err.message);
  });
}

// ========== Система управління вкладками ==========

// URL для нової вкладки
const getNewTabUrl = () => {
  return `file://${path.join(__dirname, '../public/newtab.html')}`;
};

// Створити нову вкладку
ipcMain.handle('create-tab', async (event, url = null) => {
  const bounds = mainWindow.getContentBounds();
  // Використовуємо глобальну змінну sidebarWidth (не оголошуємо локальну!)
  
  // Якщо URL не вказано - відкриваємо нову вкладку
  const targetUrl = url || getNewTabUrl();
  
  const newBrowserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  registerWindowOpenHandler(newBrowserView);
  
  newBrowserView.setBackgroundColor('#ffffff');
  newBrowserView.setBounds({ 
    x: 0, 
    y: 100, // 40px tabs + 60px toolbar
    width: bounds.width - sidebarWidth,
    height: bounds.height - 100 
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
  
  // Інжектуємо скрипти після завантаження
  newBrowserView.webContents.on('did-finish-load', () => {
    const currentUrl = newBrowserView.webContents.getURL();

    if (!currentUrl.includes('newtab.html')) {
      emitReactiveEvent({
        type: 'page-load',
        title: 'Завантаження завершено',
        detail: formatUrlLabel(currentUrl)
      });
    }
    
    // Якщо це newtab - інжектуємо налаштування теми
    if (currentUrl.includes('newtab.html')) {
      injectThemeToNewtab(newBrowserView);
    } else {
      // Інжектуємо модулі тільки для звичайних сайтів
      injectSelectionListener(newBrowserView);
      injectCodeMate(newBrowserView);
      injectLinkXRay(newBrowserView);
      injectUnifiedT9(newBrowserView); // Єдина оптимізована T9 система
    }
    
    // Оновлюємо заголовок вкладки
    const title = newBrowserView.webContents.getTitle();
    mainWindow.webContents.send('update-tab-info', newTab.id, title, currentUrl);
  });
  
  newBrowserView.webContents.on('did-navigate', () => {
    const currentUrl = newBrowserView.webContents.getURL();
    const title = newBrowserView.webContents.getTitle();
    
    // Зберігаємо в історію з favicon
    try {
      const favicon = new URL(currentUrl).origin + '/favicon.ico';
      storage.addToHistory(currentUrl, title, favicon);
    } catch (err) {
      storage.addToHistory(currentUrl, title);
    }
    
    mainWindow.webContents.send('update-tab-info', newTab.id, title, currentUrl);
  });

  // Obrobka pomylok zavantazhennya dlya novykh vkladok
  newBrowserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) { // -3 tse cancelled (norma pry navigatsii)
      console.error(`[LOAD ERROR] [TAB ${newTab.id}] Pomylka zavantazhennya: ${errorDescription} (kod: ${errorCode})`);
      console.error(`[LOAD ERROR] [TAB ${newTab.id}] URL: ${validatedURL}`);
    }
  });

  // Оновлюємо назву вкладки при зміні
  newBrowserView.webContents.on('page-title-updated', (event, title) => {
    const tab = tabs.find(t => t.id === newTab.id);
    if (tab) {
      tab.title = title;
      mainWindow.webContents.send('update-tab-title', { tabId: newTab.id, title });
    }
  });

  // Оновлюємо URL для цієї вкладки
  newBrowserView.webContents.on('did-navigate', (event, url) => {
    const tab = tabs.find(t => t.id === newTab.id);
    if (tab && tab.id === activeTabId) {
      mainWindow.webContents.send('update-url-bar', url);
    }
  });

  newBrowserView.webContents.on('did-navigate-in-page', (event, url) => {
    const tab = tabs.find(t => t.id === newTab.id);
    if (tab && tab.id === activeTabId) {
      mainWindow.webContents.send('update-url-bar', url);
    }
  });
  
  // Контекстне меню для виділеного тексту
  newBrowserView.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();
    if (params.selectionText) {
      const selectedText = params.selectionText;
      
      // 1. Копіювати
      menu.append(new MenuItem({
        label: ' Копіювати',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          require('electron').clipboard.writeText(selectedText);
        }
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
      
      // 2. AI Помічник
      menu.append(new MenuItem({
        label: '🤖 AI Помічник',
        click: async () => {
          const result = await getAIExplanation(selectedText);
          newBrowserView.webContents.executeJavaScript(`
            window.postMessage({ 
              type: 'AI_ASSISTANT_RESULT', 
              answer: ${JSON.stringify(result)},
              originalText: ${JSON.stringify(selectedText)}
            }, '*');
          `).catch(err => console.error('AI error:', err));
        }
      }));
      
      // 3. Переклад
      menu.append(new MenuItem({
        label: '🌐 Перекласти',
        click: async () => {
          const result = await translateText(selectedText, 'uk');
          if (result.success) {
            newBrowserView.webContents.executeJavaScript(`
              window.postMessage({ 
                type: 'TRANSLATION_RESULT', 
                translation: ${JSON.stringify(result.translation)},
                originalText: ${JSON.stringify(selectedText)}
              }, '*');
            `).catch(err => console.error('Translation error:', err));
          }
        }
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
      
      // 4. Додати в нотатки
      menu.append(new MenuItem({
        label: ' Додати в конспект',
        click: () => {
          mainWindow.webContents.send('add-to-notes', selectedText);
        }
      }));
      
      menu.popup();
    }
  });
  
  // Console message handler
  newBrowserView.webContents.on('console-message', async (event, level, message, line, sourceId) => {
    // Виводимо всі консольні повідомлення для діагностики
    const logPrefix = sourceId.includes('history.html') ? '[HISTORY PAGE]' : '[WEB]';
    const levelMap = { 0: 'LOG', 1: 'WARN', 2: 'ERROR' };
    const levelName = levelMap[level] || 'LOG';
    
    if (level >= 1) { // Warn або Error
      console.log(`${logPrefix} [${levelName}] ${message} (${sourceId}:${line})`);
    }
    
    if (message.startsWith('AI_CODE_REQUEST:')) {
      try {
        const data = JSON.parse(message.replace('AI_CODE_REQUEST:', ''));
        emitReactiveEvent({
          type: 'ai-start',
          title: 'AI аналіз коду',
          detail: 'Запит на пояснення'
        });
        const explanation = await getAIExplanation(data.prompt);
        
        newBrowserView.webContents.executeJavaScript(`
          if (typeof window.showCodeExplanation === 'function') {
            window.showCodeExplanation(${JSON.stringify(explanation)});
          }
        `).catch(err => console.error('Error showing code explanation:', err));

        emitReactiveEvent({
          type: 'ai-complete',
          title: 'AI completed analysis',
          detail: 'Explanation ready'
        });
      } catch (err) {
        console.error('AI request processing error:', err);
        emitReactiveEvent({
          type: 'ai-failed',
          title: 'AI error',
          detail: 'Failed to analyze code'
        });
      }
    }
    
    // Обробка X-Ray запитів (сканування посилань)
    if (message.startsWith('XRAY_REQUEST:')) {
      const url = message.replace('XRAY_REQUEST:', '').trim();
      try {
        emitReactiveEvent({
          type: 'ai-start',
          title: 'AI аналіз посилання',
          detail: formatUrlLabel(url)
        });
        const result = await xrayLink(url);
        newBrowserView.webContents.executeJavaScript(`
          if (typeof window._showXRayResult === 'function') {
            window._showXRayResult(${JSON.stringify(result)});
          }
        `).catch(err => console.error('Error showing X-Ray:', err));

        emitReactiveEvent({
          type: 'ai-complete',
          title: 'AI completed analysis',
          detail: formatUrlLabel(url)
        });
      } catch (error) {
        console.error('X-Ray error:', error);
        emitReactiveEvent({
          type: 'ai-failed',
          title: 'AI error',
          detail: formatUrlLabel(url)
        });
      }
    }
    
    // Обробка запитів до AI помічника (натискання K на виділений текст)
    if (message.startsWith('AI_ASSISTANT_REQUEST:')) {
      try {
        const data = JSON.parse(message.replace('AI_ASSISTANT_REQUEST:', ''));
        const result = await getAIExplanation(data.text);
        
        newBrowserView.webContents.executeJavaScript(`
          window.postMessage({ 
            type: 'AI_ASSISTANT_RESULT', 
            answer: ${JSON.stringify(result)},
            originalText: ${JSON.stringify(data.text)}
          }, '*');
        `).catch(err => console.error('Error showing AI response:', err));
      } catch (error) {
        console.error('AI assistant error:', error);
      }
    }
    
    // Обробка запитів на переклад
    if (message.startsWith('TRANSLATE_REQUEST:')) {
      try {
        const data = JSON.parse(message.replace('TRANSLATE_REQUEST:', ''));
        const result = await translateText(data.text, data.targetLanguage);
        
        if (result.success) {
          newBrowserView.webContents.executeJavaScript(`
            window.postMessage({ 
              type: 'TRANSLATION_RESULT', 
              translation: ${JSON.stringify(result.translation)},
              originalText: ${JSON.stringify(data.text)}
            }, '*');
          `).catch(err => console.error('Error showing translation:', err));
        }
      } catch (error) {
        console.error('Translation error:', error);
      }
    }
  });
  
  // Встановлюємо новий BrowserView як активний
  mainWindow.setBrowserView(newBrowserView);
  activeTabId = newTab.id;
  
  newBrowserView.webContents.loadURL(targetUrl);
  
  return { id: newTab.id, url: targetUrl, title: newTab.title };
});

// Перемикнути на вкладку
ipcMain.on('switch-tab', (event, tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) {
    console.error('Tab not found:', tabId);
    return;
  }
  
  activeTabId = tabId;
  mainWindow.setBrowserView(tab.browserView);
  
  // Оновлюємо розміри для активної вкладки
  const bounds = mainWindow.getContentBounds();
  tab.browserView.setBounds({
    x: 0,
    y: 100, // 40px tabs + 60px toolbar
    width: bounds.width - sidebarWidth,
    height: bounds.height - 100
  });
  
  // Оновлюємо URL bar
  const url = tab.browserView.webContents.getURL();
  mainWindow.webContents.send('update-url-bar', url);
  
  console.log('Switched to tab:', tabId);
});

// Закрити вкладку
ipcMain.on('close-tab', (event, tabId) => {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;
  
  const tab = tabs[tabIndex];
  
  // Якщо це остання вкладка, закриваємо браузер
  if (tabs.length <= 1) {
    console.log('Closing last tab - closing browser');
    app.quit();
    return;
  }
  
  // Якщо це активна вкладка, перемкнемось на іншу
  if (activeTabId === tabId) {
    // Перемкнемось на сусідню вкладку
    const newActiveTab = tabs[tabIndex + 1] || tabs[tabIndex - 1];
    if (newActiveTab) {
      mainWindow.setBrowserView(newActiveTab.browserView);
      activeTabId = newActiveTab.id;
      mainWindow.webContents.send('update-url-bar', newActiveTab.browserView.webContents.getURL());
    }
  }
  
  // Видаляємо BrowserView
  tab.browserView.webContents.destroy();
  tabs.splice(tabIndex, 1);
  
  console.log('Tab closed:', tabId, '| Remaining tabs:', tabs.length);
});

// Оновити URL активної вкладки
ipcMain.on('navigate', (event, input) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  let url = input.trim();
  
  // Перевіряємо чи це URL чи пошуковий запит
  const isURL = (str) => {
    // Якщо вже є протокол
    if (str.startsWith('http://') || str.startsWith('https://')) {
      return true;
    }
    // Якщо виглядає як домен (має крапку і не має пробілів)
    if (str.includes('.') && !str.includes(' ')) {
      return true;
    }
    // Якщо localhost
    if (str.startsWith('localhost')) {
      return true;
    }
    return false;
  };
  
  if (isURL(url)) {
    // Це URL - додаємо https:// якщо немає протоколу
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
  } else {
    // Це пошуковий запит - вибираємо пошукову систему залежно від Tor
    if (isTorActive) {
      // З Tor - використовуємо DuckDuckGo (privacy-friendly)
      url = 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
    } else {
      // Без Tor - використовуємо Google
      url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
    }
  }
  
  console.log('Navigation:', input, '→', url);
  activeTab.browserView.webContents.loadURL(url);
});

// Навігація активної вкладки
ipcMain.on('go-back', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView.webContents.canGoBack()) {
    activeTab.browserView.webContents.goBack();
    console.log('Back');
  }
});

ipcMain.on('go-forward', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView.webContents.canGoForward()) {
    activeTab.browserView.webContents.goForward();
    console.log('Forward');
  }
});

ipcMain.on('reload', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    activeTab.browserView.webContents.reload();
    console.log('Reloaded');
  }
});

// ========== AI Link X-Ray (Рентген Посилань) ==========
// Функція для сканування посилань через AI
async function xrayLink(url) {
  try {
    console.log('X-Ray scanning:', url);
    
    if (!groqClient) {
      return ' AI не ініціалізовано';
    }
    
    // Використовуємо вбудований fetch (Node.js 18+)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 сек таймаут
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'uk,en;q=0.9'
      },
      redirect: 'follow'
    });
    const html = await response.text();
    clearTimeout(timeout);
    
    // Вирізаємо HTML теги, залишаємо тільки текст
    const cleanText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Видаляємо скрипти
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Видаляємо стилі
      .replace(/<[^>]*>/g, ' ') // Видаляємо теги
      .replace(/\s+/g, ' ') // Прибираємо зайві пробіли
      .substring(0, 2000); // Перші 2000 символів
    
    // Питаємо Groq AI
    const completion = await groqClient.chat.completions.create({
      messages: [{ 
        role: 'user', 
        content: `Проаналізуй цей текст веб-сторінки (це перегляд посилання).
Напиши ДУЖЕ коротко (максимум 10-15 слів) про що ця сторінка.
Якщо це схоже на спам, продаж або клікбейт — почни з .
Якщо це корисний контент — почни з .

Текст: ${cleanText}` 
      }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 100
    });
    
    const result = completion.choices[0]?.message?.content || 'Analysis failed';
    console.log('X-Ray result:', result);
    return result;
    
  } catch (error) {
    console.error('X-Ray error:', error.message);
    if (error.name === 'AbortError') {
      return ' Таймаут - сторінка завантажується занадто довго';
    }
    return ' Не вдалося просканувати';
  }
}

// IPC handler для X-Ray (для зворотної сумісності)
ipcMain.handle('xray-link', async (event, url) => {
  return await xrayLink(url);
});

// Обробник для узагальнення нотаток через Groq
ipcMain.handle('ask-gemini', async (event, prompt) => {
  try {
    if (!groqClient) {
      throw new Error('AI не ініціалізовано. Перевірте API ключ у config.js');
    }

    console.log('Received notes summary request...');
    
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile', // Оновлена найрозумніша модель Groq
      temperature: 0.7,
      max_tokens: 2048
    });
    
    const text = completion.choices[0]?.message?.content || 'Error: no response received';
    console.log('Response received from Groq (lightning fast!)');
    return text;
  } catch (error) {
    console.error('Groq API error:', error);
    throw new Error(`Не вдалося отримати відповідь від AI: ${error.message}`);
  }
});

// Обробник розумного пошуку
ipcMain.handle('smart-search', async (event, query) => {
  try {
    console.log('Smart search:', query);

    if (!groqClient) {
      return { 
        success: false, 
        message: ' AI не ініціалізовано. Перевірте API ключ у config.js' 
      };
    }

    // Отримуємо текст сторінки
    const pageText = await browserView.webContents.executeJavaScript('document.body.innerText');
    
    if (!pageText || pageText.trim().length === 0) {
      return { 
        success: false, 
        message: ' Сторінка порожня або не завантажилась' 
      };
    }

    // Обрізаємо текст, якщо дуже довгий (Groq має ліміти)
    const cleanText = pageText.substring(0, 30000);

    // Формуємо промпт для AI
    const prompt = `Я дам тобі текст веб-сторінки і пошуковий запит.
Твоє завдання: знайти у тексті ОДНЕ речення або коротку фразу (максимум 10-15 слів), яка найкраще відповідає на запит.
Поверни ТІЛЬКИ цю фразу точнісінько так, як вона написана в тексті (щоб я міг знайти її через Ctrl+F).
Якщо відповіді немає, напиши "NOT_FOUND".

Запит користувача: "${query}"

Текст сторінки:
${cleanText}`;

    console.log('Analyzing meaning via Groq AI...');

    // Питаємо Groq AI
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile', // Найрозумніша модель
      temperature: 0.3, // Низька температура для точності
      max_tokens: 100
    });

    const exactQuote = completion.choices[0]?.message?.content?.trim() || 'NOT_FOUND';

    if (exactQuote.includes('NOT_FOUND') || exactQuote.length < 5) {
      return { 
        success: false, 
        message: ' Нічого схожого не знайшов. Спробуйте інший запит.' 
      };
    }

    // Очищаємо цитату від лапок
    const cleanQuote = exactQuote.replace(/^["']|["']$/g, '').trim();

    console.log('Phrase found:', cleanQuote);

    // Використовуємо вбудований пошук Chromium
    const requestId = await browserView.webContents.findInPage(cleanQuote, {
      findNext: false
    });

    return { 
      success: true, 
      message: ' Знайдено! Підсвічено на сторінці.',
      quote: cleanQuote 
    };

  } catch (error) {
    console.error('Smart search error:', error);
    return { 
      success: false, 
      message: ` Помилка: ${error.message}` 
    };
  }
});

// Функція для показу popup в браузері
function showPopupInBrowser(text) {
  // Знаходимо активну вкладку
  const activeTab = tabs.find(t => t.id === activeTabId);
  const targetView = activeTab ? activeTab.browserView : browserView;
  
  targetView.webContents.executeJavaScript(`
    if (typeof window.showAIPopup === 'function') {
      window.showAIPopup(${JSON.stringify(text)});
    }
  `).catch(err => console.error('Popup display error:', err));
}

// Функція для інжектування світлої теми
function injectLightTheme(targetView = null) {
  const view = targetView || browserView;
  
  const lightThemeCSS = `
    html {
      filter: invert(1) hue-rotate(180deg) !important;
      background-color: #ffffff !important;
    }
    
    img, picture, video, canvas, svg, iframe {
      filter: invert(1) hue-rotate(180deg) !important;
    }
    
    * {
      background-color: inherit !important;
      scrollbar-color: #888 #f1f1f1 !important;
    }
  `;
  
  view.webContents.insertCSS(lightThemeCSS)
    .then(() => {
      console.log('Light theme activated');
    })
    .catch(err => {
      console.error('Light theme injection error:', err);
    });
}

// Функція для інжектування слухача виділення тексту
function injectSelectionListener(targetView = null) {
  const fs = require('fs');
  const injectScript = fs.readFileSync(path.join(__dirname, 'modules', 'inject.js'), 'utf8');
  const view = targetView || browserView;
  
  view.webContents.executeJavaScript(injectScript)
    .catch(err => {
      console.error('Script injection error:', err);
    });
}

// Функція для інжектування Code Mate (автоматичні AI кнопки для коду)
function injectCodeMate(targetView = null) {
  const fs = require('fs');
  const view = targetView || browserView;
  try {
    const codeInjectorScript = fs.readFileSync(path.join(__dirname, 'modules', 'code-injector.js'), 'utf8');
    
    view.webContents.executeJavaScript(codeInjectorScript)
      .then(() => {
        console.log('Code Mate activated on page');
      })
      .catch(err => {
        console.error('Code Mate injection error:', err);
      });
  } catch (error) {
    console.error('Failed to read code-injector.js:', error);
  }
}

// Функція для інжектування Link X-Ray (AI сканування посилань)
function injectLinkXRay(targetView = null) {
  const fs = require('fs');
  const view = targetView || browserView;
  try {
    const linkXRayScript = fs.readFileSync(path.join(__dirname, 'modules', 'link-xray.js'), 'utf8');
    
    view.webContents.executeJavaScript(linkXRayScript)
      .then(() => {
        console.log('Link X-Ray activated on page');
      })
      .catch(err => {
        console.error('Link X-Ray injection error:', err);
      });
  } catch (error) {
    console.error('Failed to read link-xray.js:', error);
  }
}

// Unified T9 Autocomplete (VS Code IntelliSense style)
function injectUnifiedT9(targetBrowserView = browserView) {
  const fs = require('fs');
  try {
    const unifiedT9Script = fs.readFileSync(path.join(__dirname, 'modules', 'unified-t9.js'), 'utf8');
    
    targetBrowserView.webContents.executeJavaScript(unifiedT9Script)
      .then(() => {
        console.log('[T9] Autocomplete system ready (VS Code style)');
      })
      .catch(err => {
        console.error('[T9] Injection error:', err);
      });
  } catch (error) {
    console.error('[T9] Failed to read unified-t9.js:', error);
  }
}

// Функція для отримання пояснення від Groq AI
async function getAIExplanation(text) {
  const apiKey = config.GROQ_API_KEY;
  
  if (!apiKey || apiKey === 'YOUR_GROQ_API_KEY_HERE' || apiKey === 'REPLACE_WITH_YOUR_GROQ_KEY') {
    return ' API ключ не налаштовано!\n\n1. Відкрийте https://console.groq.com/keys\n2. Натисніть "Create API Key"\n3. Скопіюйте ключ у файл config.js';
  }

  if (!groqClient) {
    return ' AI не ініціалізовано.\n\nПеревірте що:\n1. API ключ правильний\n2. Groq API активовано';
  }

  try {
    // Визначаємо тип запиту (чи це код, чи просто текст)
    const isCodeAnalysis = text.includes('```') || text.includes('Проаналізуй цей код');
    
    let prompt, model, maxTokens;
    
    if (isCodeAnalysis) {
      // Для аналізу коду використовуємо розумнішу модель
      prompt = text;
      model = 'llama-3.3-70b-versatile'; // Оновлена найрозумніша модель для коду
      maxTokens = 500;
    } else {
      // Для простих пояснень використовуємо швидку модель
      prompt = `Поясни цей термін або текст дуже коротко і просто українською мовою (максимум 2-3 речення): "${text}"`;
      model = 'llama-3.1-8b-instant'; // Швидка модель для миттєвих підказок
      maxTokens = 200;
    }
    
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: model,
      temperature: 0.5,
      max_tokens: maxTokens
    });
    
    return completion.choices[0]?.message?.content || 'Error: no response received';
  } catch (error) {
    console.error('API Error:', error);
    
    if (error.message.includes('404') || error.message.includes('not found')) {
      return ` API ключ невірний!\n\n1. Перейдіть на https://console.groq.com/keys\n2. Створіть новий ключ\n3. Оновіть config.js`;
    }
    
    return ` Помилка AI: ${error.message}`;
  }
}

// ==================== IPC HANDLERS ДЛЯ STORAGE ====================

// Історія
ipcMain.handle('get-history', (event, limit) => {
  return storage.getHistory(limit || 100);
});

ipcMain.handle('search-history', (event, query) => {
  return storage.searchHistory(query);
});

ipcMain.on('clear-history', () => {
  storage.clearHistory();
  console.log('History cleared');
});

ipcMain.on('delete-history-item', (event, url) => {
  storage.deleteHistoryItem(url);
  console.log('[HISTORY] Record deleted:', url);
});

ipcMain.on('open-url-from-history', (event, url) => {
  console.log('[HISTORY] Opening URL from history:', url);
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView) {
    activeTab.browserView.webContents.loadURL(url).catch(err => {
      console.error('[HISTORY] URL load error:', err.message);
    });
    console.log('[HISTORY] URL opened:', url);
  } else {
    console.error('[HISTORY] Active tab not found');
  }
});

ipcMain.on('open-history', async () => {
  console.log('[HISTORY] Opening history page...');
  const historyUrl = `file://${path.join(__dirname, '../public/history.html')}`;
  console.log('[HISTORY] History URL:', historyUrl);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView) {
    try {
      await activeTab.browserView.webContents.loadURL(historyUrl);
      console.log('[HISTORY] History page loaded successfully');
    } catch (err) {
      console.error('[HISTORY] History load error:', err.message);
    }
  } else {
    console.error('[HISTORY] Active tab not found');
  }
});

// Закладки
ipcMain.handle('get-bookmarks', () => {
  return storage.getBookmarks();
});

ipcMain.handle('add-bookmark', (event, { url, title, favicon }) => {
  const added = storage.addBookmark(url, title, favicon);
  console.log(added ? '[BOOKMARK] Bookmark added:' : '[BOOKMARK] Bookmark already exists:', url);
  return added;
});

ipcMain.on('remove-bookmark', (event, url) => {
  storage.removeBookmark(url);
  console.log('[BOOKMARK] Bookmark removed:', url);
});

ipcMain.handle('is-bookmarked', (event, url) => {
  return storage.isBookmarked(url);
});

// Сесія (вкладки)
ipcMain.on('save-session', () => {
  const sessionTabs = tabs
    .map(tab => ({
      url: tab.browserView?.webContents?.getURL() || '',
      title: tab.browserView?.webContents?.getTitle() || 'Нова вкладка'
    }))
    .filter(tab => !tab.url.includes('newtab.html')); // НЕ зберігаємо newtab
  
  storage.saveSession(sessionTabs);
  console.log('Session saved:', sessionTabs.length, 'tabs');
});

ipcMain.handle('get-session', () => {
  return storage.getSession();
});

// Налаштування
ipcMain.handle('get-settings', () => {
  return storage.getAllSettings();
});

ipcMain.on('save-settings', (event, settings) => {
  storage.setAllSettings(settings);
  console.log('Settings saved');
});

// Нотатки з пам'яттю
ipcMain.on('save-note', (event, { text, url }) => {
  storage.addNote(text, url);
  console.log('Note saved');
});

ipcMain.handle('get-notes', () => {
  return storage.getNotes();
});

ipcMain.on('delete-note', (event, id) => {
  storage.deleteNote(id);
});

ipcMain.on('update-note', (event, { id, text }) => {
  storage.updateNote(id, text);
  console.log('Note updated:', id);
});

ipcMain.on('clear-notes', () => {
  storage.clearNotes();
});

// Зберігаємо сесію перед закриттям (ВИМКНЕНО - завжди показуємо newtab)
app.on('before-quit', () => {
  // storage.saveSession(sessionTabs);
  // console.log(' Сесію автоматично збережено при закритті');
  console.log('Session NOT saved - always show newtab on startup');
});

// ==================== TOR INTEGRATION ====================

// Перемикач Tor
ipcMain.handle('toggle-tor', async () => {
  const ses = session.defaultSession;
  
  if (isTorActive) {
    // Вимикаємо Tor - пряме підключення
    await ses.setProxy({ mode: 'direct' });
    isTorActive = false;
    console.log('Tor disabled - regular connection');
    
    // Оновлюємо placeholder адресної строки
    mainWindow.webContents.send('update-search-engine', 'Google');
    
    return { 
      status: false, 
      message: 'Tor вимкнено. Пошук: Google' 
    };
  } else {
    // Вмикаємо Tor - SOCKS5 proxy
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: 'socks5://127.0.0.1:9050'
    });
    isTorActive = true;
    console.log('Tor enabled - traffic via SOCKS5 proxy');
    
    // Оновлюємо placeholder адресної строки
    mainWindow.webContents.send('update-search-engine', 'DuckDuckGo');
    
    return { 
      status: true, 
      message: 'Tor увімкнено! Пошук: DuckDuckGo' 
    };
  }
});

// Отримати статус Tor
ipcMain.handle('get-tor-status', () => {
  return { 
    active: isTorActive,
    processRunning: torProcess !== null && torProcess.exitCode === null
  };
});

// AI-автозаповнення з Groq
ipcMain.handle('predict-text', async (event, currentText) => {
  try {
    // Якщо тексту мало або немає Groq клієнта, не питаємо
    if (!currentText || currentText.length < 3 || !groqClient) return null;

    console.log('AI-T9: Autocomplete request for:', currentText.substring(0, 30) + '...');

    const completion = await groqClient.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an autocomplete engine. Your task is to complete the user's sentence. Return ONLY the missing part of the word or sentence. Do not repeat the input. Do not add quotes. If unsure, return empty string. Keep it under 5 words."
        },
        {
          role: "user",
          content: `Complete this text: "${currentText}"`
        }
      ],
      model: "llama-3.1-8b-instant", // Найшвидша модель Groq
      max_tokens: 15, // Обмежуємо для швидкості
      temperature: 0.1, // Мінімальна креативність для точності
      stop: ["\n", ".", "!", "?"] // Зупиняємось на кінці речення
    });

    const suggestion = completion.choices[0]?.message?.content?.trim() || "";
    console.log('AI-T9: Response:', suggestion);
    return suggestion;

  } catch (error) {
    console.error('AI-T9 Error:', error.message);
    return null;
  }
});

// T9 AI-автозаповнення згідно з інструкціями
ipcMain.handle('predict-completion', async (event, currentText) => {
    // Не витрачаємо ресурси, якщо тексту мало
    if (!currentText || currentText.length < 5) return null;

    try {
        const completion = await groqClient.chat.completions.create({
            messages: [
                {
                    role: "system",
                    // ЦЕ НАЙВАЖЛИВІШЕ: Інструкція для ШІ
                    content: "You are a precise autocomplete engine. Receive a text fragment and output ONLY the completion for the last sentence. Do not repeat the input. Do not start with a space. Keep it short (max 5-7 words). If unsure, return empty string."
                },
                {
                    role: "user",
                    content: currentText
                }
            ],
            // Використовуємо Llama 3.1 (вона дуже швидка)
            model: "llama-3.1-8b-instant",
            temperature: 0.1, // Мінімальна фантазія, максимальна точність
            max_tokens: 15,   // Обмежуємо довжину відповіді
        });

        const result = completion.choices[0]?.message?.content || "";
        return result.trim(); // Прибираємо зайві пробіли
    } catch (error) {
        console.error("Groq Error:", error);
        return null;
    }
});

// ---------------------------------------------------------
// 🌊 AI INFINITE FEED - Нескінченна стрічка новин з ШІ
// ---------------------------------------------------------

// Функція для створення AI самарі статті
async function summarizeArticle(title) {
    if (!groqClient) {
        // Якщо немає Groq, повертаємо просте самарі
        return `Стаття про: ${title.substring(0, 50)}...`;
    }
    
    try {
        const completion = await groqClient.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: "You are a news summarizer. Create ONE short sentence (max 15 words) summarizing the article title. Be concise and engaging. Answer in Ukrainian." 
                },
                { 
                    role: "user", 
                    content: `Summarize: ${title}` 
                }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.3,
            max_tokens: 50
        });
        return completion.choices[0]?.message?.content || `Аналіз: ${title.substring(0, 30)}...`;
    } catch (error) {
        console.error('❌ AI summary error:', error.message);
        return `${title.substring(0, 60)}...`;
    }
}

let isFeedRunning = false;
let currentFeedGenerator = null;

// Обробник запуску нескінченної стрічки
ipcMain.handle('start-infinite-feed', async (event, categories = ['all'], sourceNames = []) => {
    if (isFeedRunning) {
        console.log('[WARNING] Feed is already running');
        return { success: false, message: 'Feed is already active' };
    }
    
    // Convert to array if single category passed
    if (!Array.isArray(categories)) {
        categories = [categories];
    }
    
    isFeedRunning = true;
    currentFeedGenerator = infiniteArticleGenerator(categories, sourceNames);
    console.log(`[FEED START] Starting infinite news feed for categories: ${categories.join(', ')}...`);
    if (sourceNames && sourceNames.length > 0) {
        console.log(`[SOURCES] Selected sources: ${sourceNames.length}`);
        console.log(`[SOURCES] Sources list:`, sourceNames);
    } else {
        console.log(`[SOURCES] Using all available sources`);
    }

    // Async article processing loop
    (async () => {
        for await (const article of currentFeedGenerator) {
            if (!isFeedRunning) {
                console.log('[STOP] Feed stopped by user');
                break;
            }

            console.log(`[FEED] Received: ${article.title.substring(0, 50)}...`);

            try {
                // TASK 1.2: Timeout Iterator Consumer
                // Use Promise.race for 3 second timeout
                const summary = await Promise.race([
                    summarizeArticle(article.title),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('AI_TIMEOUT')), 3000)
                    )
                ]);

                // If AI finished - send to UI
                console.log(`[OK] AI processed: ${summary.substring(0, 30)}...`);
                event.sender.send('new-feed-item', { ...article, summary });

            } catch (error) {
                if (error.message === 'AI_TIMEOUT') {
                    console.log(`[TIMEOUT] AI stuck (>3 sec). Skipping from ${article.source}`);
                    event.sender.send('feed-timeout-skip', article.source);
                } else {
                    console.error('[ERROR] Processing error:', error.message);
                }
            }
        }
    })();
    
    return { success: true, message: 'Стрічка запущена' };
});

// Обробник зупинки стрічки
ipcMain.handle('stop-infinite-feed', () => {
    if (!isFeedRunning) {
        return { success: false, message: 'Стрічка не активна' };
    }
    
    isFeedRunning = false;
    currentFeedGenerator = null;
    console.log('🛑 Feed stopped');
    
    return { success: true, message: 'Стрічка зупинена' };
});

// Обробник відкриття посилання у зовнішньому браузері
ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        console.error('❌ Link open error:', error);
        return { success: false, error: error.message };
    }
});

// Обробник відкриття посилання у власному браузері (для новин)
ipcMain.handle('open-in-browser', async (event, url) => {
    try {
        console.log('[BROWSER] Opening URL in browser:', url);
    requestOpenInNewTab(url);
    return { success: true };
    } catch (error) {
        console.error('❌ Browser open error:', error);
        return { success: false, error: error.message };
    }
});
