const { app, BrowserWindow, BrowserView, ipcMain, Menu, MenuItem, session } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const Groq = require('groq-sdk');
const EventEmitter = require('events');

console.log('[CONSOLE] Starting BrowserX...');

// Модуль збереження даних (історія, закладки, сесія)
const storage = require('./modules/storage');

// Увеличиваем лимит слушателей событий для избежания предупреждений
EventEmitter.defaultMaxListeners = 20;

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
    title: 'Нова вкладка'
  });

  // Інжектуємо скрипт для відслідковування виділення тексту + Code Mate + Link X-Ray + Translator + T9 + AI-T9
  browserView.webContents.on('did-finish-load', () => {
    const currentUrl = browserView.webContents.getURL();
    
    // Якщо це newtab - інжектуємо налаштування теми
    if (currentUrl.includes('newtab.html')) {
      injectThemeToNewtab(browserView);
    } else {
      // Інжектуємо модулі тільки для звичайних сайтів (не для newtab)
      injectSelectionListener(browserView);
      injectCodeMate(browserView);
      injectLinkXRay(browserView);
      injectT9(browserView);
      injectAIT9(browserView); // AI-автозаповнення з Groq
      injectSmartCompose(browserView); // Новий Smart Compose згідно з інструкціями
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
          `).catch(err => console.error('Помилка AI:', err));
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
            `).catch(err => console.error('Помилка перекладу:', err));
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
    injectT9(browserView);
    injectSmartCompose(browserView); // Додаємо і тут
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
        const explanation = await getAIExplanation(data.prompt);
        
        // Відправляємо пояснення назад у браузер
        browserView.webContents.executeJavaScript(`
          if (typeof window.showCodeExplanation === 'function') {
            window.showCodeExplanation(${JSON.stringify(explanation)});
          }
        `).catch(err => console.error('Помилка показу пояснення коду:', err));
      } catch (error) {
        console.error('[CODE MATE] Error processing code analysis request:', error);
      }
    }
    
    // Обробка X-Ray запитів (сканування посилань)
    if (message.startsWith('XRAY_REQUEST:')) {
      const url = message.replace('XRAY_REQUEST:', '').trim();
      try {
        const result = await xrayLink(url);
        browserView.webContents.executeJavaScript(`
          if (typeof window._showXRayResult === 'function') {
            window._showXRayResult(${JSON.stringify(result)});
          }
        `).catch(err => console.error('Помилка показу X-Ray:', err));
      } catch (error) {
        console.error('Помилка X-Ray:', error);
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
        `).catch(err => console.error('Помилка показу AI відповіді:', err));
      } catch (error) {
        console.error('Помилка AI помічника:', error);
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
          `).catch(err => console.error('Помилка показу перекладу:', err));
        }
      } catch (error) {
        console.error('Помилка перекладу:', error);
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
    
    console.log('[SESSION] Знайдено збережених вкладок:', sessionTabs.length);
    
    // Перша вкладка вже є (newtab), відновлюємо тільки інші
    if (sessionTabs.length === 0) {
      console.log('[SESSION] Немає вкладок для відновлення - показуємо тільки newtab');
      return;
    }
    
    console.log('[SESSION] Відновлюю', sessionTabs.length, 'вкладок...');
    
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
        
        const tabData = {
          id: nextTabId,
          browserView: tabView,
          url: tab.url,
          title: tab.title || 'Завантаження...'
        };
        
        tabs.push(tabData);
        
        // Завантажуємо URL
        tabView.webContents.loadURL(tab.url).catch(err => {
          console.log('[ERROR] Не вдалося завантажити вкладку:', tab.url);
        });
        
        // Додаємо обробники для відновленої вкладки
        tabView.webContents.on('did-finish-load', () => {
          const currentUrl = tabView.webContents.getURL();
          if (!currentUrl.includes('newtab.html')) {
            injectSelectionListener(tabView);
            injectCodeMate(tabView);
            injectLinkXRay(tabView);
            injectT9(tabView);
            injectAIT9(tabView); // AI-автозаповнення
            injectSmartCompose(tabView); // Smart Compose 
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
    
    console.log('[SESSION] Сесію відновлено успішно!');
  } catch (error) {
    console.error('[ERROR] Помилка відновлення сесії:', error.message);
  }
}

app.whenReady().then(() => {
  startTor(); // Запускаємо Tor у фоні
  
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
    console.log('Закриваємо Tor...');
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
  console.log(' Отримано команду закриття вікна');
  if (mainWindow) {
    mainWindow.close();
  }
  app.quit();
});

// Simple settings window removed - functionality replaced by in-app theme panel

// Застосування теми
ipcMain.on('apply-theme', (event, theme) => {
  console.log('[THEME] Застосовується тема:', theme.name);
  
  // Відправляємо тему на головне вікно
  mainWindow.webContents.send('theme-changed', theme);
});

// Функція для показу popup з перекладом
function showTranslationPopup(browserView, translation, originalText) {
  const popupCode = `
    (function() {
      // Видаляємо попередній popup
      const oldPopup = document.getElementById('browserx-translation-popup');
      if (oldPopup) oldPopup.remove();
      
      const popup = document.createElement('div');
      popup.id = 'browserx-translation-popup';
      popup.innerHTML = \`
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          max-width: 400px;
          min-width: 280px;
          background: linear-gradient(135deg, #1a1b26 0%, #24283b 100%);
          border: 1px solid #3b82f6;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(59, 130, 246, 0.2);
          z-index: 999999;
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #fff;
          overflow: hidden;
        ">
          <div style="
            padding: 14px 18px;
            background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
            display: flex;
            align-items: center;
            justify-content: space-between;
          ">
            <span style="font-weight: 600; font-size: 14px;">Переклад</span>
            <button onclick="this.closest('#browserx-translation-popup').remove()" style="
              background: rgba(255,255,255,0.2);
              border: none;
              color: white;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              cursor: pointer;
              font-size: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
            ">×</button>
          </div>
          <div style="padding: 16px;">
            <div style="
              font-size: 12px;
              color: #888;
              margin-bottom: 8px;
            ">Оригінал:</div>
            <div style="
              font-size: 13px;
              color: #a0a0a0;
              margin-bottom: 12px;
              padding: 10px;
              background: rgba(0,0,0,0.3);
              border-radius: 8px;
              max-height: 60px;
              overflow-y: auto;
            ">\${${JSON.stringify(originalText)}.substring(0, 200)}...</div>
            <div style="
              font-size: 12px;
              color: #888;
              margin-bottom: 8px;
            ">Переклад:</div>
            <div style="
              font-size: 15px;
              line-height: 1.6;
              color: #fff;
              padding: 12px;
              background: rgba(59, 130, 246, 0.1);
              border-radius: 8px;
              border-left: 3px solid #3b82f6;
            ">\${${JSON.stringify(translation)}}</div>
          </div>
        </div>
      \`;
      document.body.appendChild(popup);
      
      // Автоматично закриваємо через 15 секунд
      setTimeout(() => popup.remove(), 15000);
    })();
  `;
  
  browserView.webContents.executeJavaScript(popupCode).catch(err => {
    console.error('Помилка показу popup перекладу:', err);
  });
}

// Функція для показу popup з відповіддю AI
function showAIPopup(browserView, result, originalText) {
  const isError = result.includes('[WARNING]') || result.includes('[ERROR]');
  const popupCode = `
    (function() {
      // Видаляємо попередній popup
      const oldPopup = document.getElementById('browserx-ai-popup');
      if (oldPopup) oldPopup.remove();
      
      const popup = document.createElement('div');
      popup.id = 'browserx-ai-popup';
      popup.innerHTML = \`
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          max-width: 450px;
          min-width: 300px;
          background: linear-gradient(135deg, #1a1b26 0%, #24283b 100%);
          border: 1px solid #8b5cf6;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(139, 92, 246, 0.2);
          z-index: 999999;
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #fff;
          overflow: hidden;
        ">
          <div style="
            padding: 14px 18px;
            background: linear-gradient(90deg, #8b5cf6 0%, #ec4899 100%);
            display: flex;
            align-items: center;
            justify-content: space-between;
          ">
            <span style="font-weight: 600; font-size: 14px;">AI Помічник</span>
            <button onclick="this.closest('#browserx-ai-popup').remove()" style="
              background: rgba(255,255,255,0.2);
              border: none;
              color: white;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              cursor: pointer;
              font-size: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
            ">×</button>
          </div>
          <div style="padding: 16px;">
            <div style="
              font-size: 12px;
              color: #888;
              margin-bottom: 8px;
            ">Запит:</div>
            <div style="
              font-size: 13px;
              color: #a0a0a0;
              margin-bottom: 12px;
              padding: 10px;
              background: rgba(0,0,0,0.3);
              border-radius: 8px;
              max-height: 60px;
              overflow-y: auto;
            ">\${${JSON.stringify(originalText)}.substring(0, 200)}...</div>
            <div style="
              font-size: 12px;
              color: #888;
              margin-bottom: 8px;
            ">Відповідь:</div>
            <div style="
              font-size: 14px;
              line-height: 1.6;
              color: #fff;
              padding: 12px;
              background: rgba(139, 92, 246, 0.1);
              border-radius: 8px;
              border-left: 3px solid #8b5cf6;
              max-height: 250px;
              overflow-y: auto;
            ">\${${JSON.stringify(result)}}</div>
          </div>
        </div>
      \`;
      document.body.appendChild(popup);
      
      // Автоматично закриваємо через 30 секунд
      setTimeout(() => popup.remove(), 30000);
    })();
  `;
  
  browserView.webContents.executeJavaScript(popupCode).catch(err => {
    console.error('Помилка показу AI popup:', err);
  });
}

// Обробка перекладу тексту
async function translateText(text, targetLanguage) {
  try {
    console.log(' Переклад на', targetLanguage + ':', text.substring(0, 50) + '...');

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

    console.log(' Перекладаю через Groq AI...');

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

    console.log(' Переклад готовий');
    return { 
      success: true, 
      translation: translation 
    };

  } catch (error) {
    console.error('Помилка перекладу:', error);
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
  console.log(' Мова перекладу змінена на:', language);
  
  // Відправляємо повідомлення всім вкладкам
  tabs.forEach(tab => {
    tab.browserView.webContents.executeJavaScript(`
      window.postMessage({ type: 'SET_TRANSLATION_LANGUAGE', language: '${language}' }, '*');
    `).catch(err => console.error('Помилка зміни мови:', err));
  });
});

// Розумний Організатор Вкладок (Tab Zen Master)
ipcMain.handle('organize-tabs', async (event) => {
  try {
    console.log(' Організовую вкладки через AI...');

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
          title: 'Помилка завантаження',
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

    console.log(' Аналізую вкладки через Groq AI...');

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
      console.error('Помилка парсингу JSON:', responseText);
      return { 
        success: false, 
        message: ' AI повернув некоректний формат відповіді' 
      };
    }

    console.log(' Організація готова:', groupsData);
    return { 
      success: true, 
      groups: groupsData.groups,
      tabsData: tabsData
    };

  } catch (error) {
    console.error('Помилка організації вкладок:', error);
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
  
  console.log(` Панель ${isCollapsed ? 'згорнуто' : 'розгорнуто'}, ширина браузера: ${bounds.width - sidebarWidth}px`);
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
  console.log(` Меню ${isOpen ? 'відкрито' : 'закрито'}`);
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
  console.log(` Панель налаштувань ${isOpen ? 'відкрита' : 'закрита'}`);
});

// ========== Синхронізація налаштувань теми ==========

// Отримуємо оновлення налаштувань теми з UI
ipcMain.on('update-theme-settings', (event, settings) => {
  themeSettings = { ...themeSettings, ...settings };
  console.log(' Налаштування теми оновлено:', themeSettings);
  
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
      
      console.log(' Тема застосована до newtab:', settings);
    })();
  `;
  
  browserView.webContents.executeJavaScript(script).catch(err => {
    console.log('Помилка інжекту теми:', err.message);
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
    title: 'Завантаження...'
  };
  
  tabs.push(newTab);
  
  // Інжектуємо скрипти після завантаження
  newBrowserView.webContents.on('did-finish-load', () => {
    const currentUrl = newBrowserView.webContents.getURL();
    
    // Якщо це newtab - інжектуємо налаштування теми
    if (currentUrl.includes('newtab.html')) {
      injectThemeToNewtab(newBrowserView);
    } else {
      // Інжектуємо модулі тільки для звичайних сайтів
      injectSelectionListener(newBrowserView);
      injectCodeMate(newBrowserView);
      injectLinkXRay(newBrowserView);
      injectT9(newBrowserView);
      injectAIT9(newBrowserView); // AI-автозаповнення
      injectSmartCompose(newBrowserView); // Smart Compose
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
          `).catch(err => console.error('Помилка AI:', err));
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
            `).catch(err => console.error('Помилка перекладу:', err));
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
        const explanation = await getAIExplanation(data.prompt);
        
        newBrowserView.webContents.executeJavaScript(`
          if (typeof window.showCodeExplanation === 'function') {
            window.showCodeExplanation(${JSON.stringify(explanation)});
          }
        `).catch(err => console.error('Помилка показу пояснення коду:', err));
      } catch (err) {
        console.error('Помилка обробки AI запиту:', err);
      }
    }
    
    // Обробка X-Ray запитів (сканування посилань)
    if (message.startsWith('XRAY_REQUEST:')) {
      const url = message.replace('XRAY_REQUEST:', '').trim();
      try {
        const result = await xrayLink(url);
        newBrowserView.webContents.executeJavaScript(`
          if (typeof window._showXRayResult === 'function') {
            window._showXRayResult(${JSON.stringify(result)});
          }
        `).catch(err => console.error('Помилка показу X-Ray:', err));
      } catch (error) {
        console.error('Помилка X-Ray:', error);
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
        `).catch(err => console.error('Помилка показу AI відповіді:', err));
      } catch (error) {
        console.error('Помилка AI помічника:', error);
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
          `).catch(err => console.error('Помилка показу перекладу:', err));
        }
      } catch (error) {
        console.error('Помилка перекладу:', error);
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
    console.error('Вкладку не знайдено:', tabId);
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
  
  console.log(' Перемкнуто на вкладку:', tabId);
});

// Закрити вкладку
ipcMain.on('close-tab', (event, tabId) => {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;
  
  const tab = tabs[tabIndex];
  
  // Якщо це остання вкладка, закриваємо браузер
  if (tabs.length <= 1) {
    console.log(' Закриття останньої вкладки - закриваємо браузер');
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
  
  console.log(' Закрито вкладку:', tabId, '| Залишилось вкладок:', tabs.length);
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
  
  console.log(' Навігація:', input, '→', url);
  activeTab.browserView.webContents.loadURL(url);
});

// Навігація активної вкладки
ipcMain.on('go-back', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView.webContents.canGoBack()) {
    activeTab.browserView.webContents.goBack();
    console.log(' Назад');
  }
});

ipcMain.on('go-forward', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView.webContents.canGoForward()) {
    activeTab.browserView.webContents.goForward();
    console.log(' Вперед');
  }
});

ipcMain.on('reload', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    activeTab.browserView.webContents.reload();
    console.log(' Оновлено');
  }
});

// ========== AI Link X-Ray (Рентген Посилань) ==========
// Функція для сканування посилань через AI
async function xrayLink(url) {
  try {
    console.log(' X-Ray сканування:', url);
    
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
    
    const result = completion.choices[0]?.message?.content || 'Не вдалося проаналізувати';
    console.log(' X-Ray результат:', result);
    return result;
    
  } catch (error) {
    console.error(' X-Ray помилка:', error.message);
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

    console.log(' Отримано запит на узагальнення нотаток...');
    
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile', // Оновлена найрозумніша модель Groq
      temperature: 0.7,
      max_tokens: 2048
    });
    
    const text = completion.choices[0]?.message?.content || 'Помилка: не отримано відповідь';
    console.log(' Відповідь отримана від Groq (блискавично!)');
    return text;
  } catch (error) {
    console.error(' Помилка Groq API:', error);
    throw new Error(`Не вдалося отримати відповідь від AI: ${error.message}`);
  }
});

// Обробник розумного пошуку
ipcMain.handle('smart-search', async (event, query) => {
  try {
    console.log(' Розумний пошук:', query);

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

    console.log(' Аналізую сенс через Groq AI...');

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

    console.log(' Знайдено фразу:', cleanQuote);

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
    console.error(' Помилка розумного пошуку:', error);
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
  `).catch(err => console.error('Помилка показу popup:', err));
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
      console.log(' Світла тема активована');
    })
    .catch(err => {
      console.error('Помилка інжекту світлої теми:', err);
    });
}

// Функція для інжектування слухача виділення тексту
function injectSelectionListener(targetView = null) {
  const fs = require('fs');
  const injectScript = fs.readFileSync(path.join(__dirname, 'modules', 'inject.js'), 'utf8');
  const view = targetView || browserView;
  
  view.webContents.executeJavaScript(injectScript)
    .catch(err => {
      console.error('Помилка інжекту скрипта:', err);
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
        console.log(' Code Mate активовано на сторінці');
      })
      .catch(err => {
        console.error('Помилка інжекту Code Mate:', err);
      });
  } catch (error) {
    console.error('Не вдалося прочитати code-injector.js:', error);
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
        console.log(' Link X-Ray активовано на сторінці');
      })
      .catch(err => {
        console.error('Помилка інжекту Link X-Ray:', err);
      });
  } catch (error) {
    console.error('Не вдалося прочитати link-xray.js:', error);
  }
}

// Функція для інжектування T9 (предиктивний ввод тексту)
function injectT9(targetBrowserView = browserView) {
  const fs = require('fs');
  try {
    // Загружаємо движок T9
    const t9EngineScript = fs.readFileSync(path.join(__dirname, 'modules', 't9-engine.js'), 'utf8');
    const t9UIScript = fs.readFileSync(path.join(__dirname, 'modules', 't9-ui.js'), 'utf8');
    
    // Інжектуємо обидва скрипти послідовно
    targetBrowserView.webContents.executeJavaScript(t9EngineScript)
      .then(() => {
        return targetBrowserView.webContents.executeJavaScript(t9UIScript);
      })
      .then(() => {
        console.log(' T9 предиктивний ввод активовано на сторінці');
      })
      .catch(err => {
        console.error('Помилка інжекту T9:', err);
      });
  } catch (error) {
    console.error('Не вдалося прочитати T9 скрипти:', error);
  }
}

// Функція для інжектування AI-T9 Autocomplete (Groq-powered автозаповнення)
function injectAIT9(targetBrowserView = browserView) {
  const fs = require('fs');
  try {
    const aiT9Script = fs.readFileSync(path.join(__dirname, 'modules', 'ai-t9.js'), 'utf8');
    
    targetBrowserView.webContents.executeJavaScript(aiT9Script)
      .then(() => {
        console.log(' AI-T9 автозаповнення активовано на сторінці');
      })
      .catch(err => {
        console.error('Помилка інжекту AI-T9:', err);
      });
  } catch (error) {
    console.error('Не вдалося прочитати ai-t9.js:', error);
  }
}

// Функція для інжектування Smart Compose (розумний помічник тексту згідно з інструкціями)
function injectSmartCompose(targetBrowserView = browserView) {
  const fs = require('fs');
  try {
    const smartComposeScript = fs.readFileSync(path.join(__dirname, 'modules', 'smart-compose.js'), 'utf8');
    
    targetBrowserView.webContents.executeJavaScript(smartComposeScript)
      .then(() => {
        console.log(' Smart Compose активовано на сторінці');
      })
      .catch(err => {
        console.error('Помилка інжекту Smart Compose:', err);
      });
  } catch (error) {
    console.error('Не вдалося прочитати smart-compose.js:', error);
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
    
    return completion.choices[0]?.message?.content || 'Помилка: не отримано відповідь';
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
  console.log(' Історію очищено');
});

ipcMain.on('delete-history-item', (event, url) => {
  storage.deleteHistoryItem(url);
  console.log('[HISTORY] Запис видалено:', url);
});

ipcMain.on('open-url-from-history', (event, url) => {
  console.log('[HISTORY] Відкриваємо URL з історії:', url);
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView) {
    activeTab.browserView.webContents.loadURL(url).catch(err => {
      console.error('[HISTORY] Помилка завантаження URL:', err.message);
    });
    console.log('[HISTORY] URL відкрито:', url);
  } else {
    console.error('[HISTORY] Активна вкладка не знайдена');
  }
});

ipcMain.on('open-history', async () => {
  console.log('[HISTORY] Відкриваємо сторінку історії...');
  const historyUrl = `file://${path.join(__dirname, '../public/history.html')}`;
  console.log('[HISTORY] URL історії:', historyUrl);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView) {
    try {
      await activeTab.browserView.webContents.loadURL(historyUrl);
      console.log('[HISTORY] Сторінка історії успішно завантажена');
    } catch (err) {
      console.error('[HISTORY] Помилка завантаження історії:', err.message);
    }
  } else {
    console.error('[HISTORY] Активна вкладка не знайдена');
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
  console.log(' Сесію збережено:', sessionTabs.length, 'вкладок');
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
  console.log(' Налаштування збережено');
});

// Нотатки з пам'яттю
ipcMain.on('save-note', (event, { text, url }) => {
  storage.addNote(text, url);
  console.log(' Нотатку збережено');
});

ipcMain.handle('get-notes', () => {
  return storage.getNotes();
});

ipcMain.on('delete-note', (event, id) => {
  storage.deleteNote(id);
});

ipcMain.on('clear-notes', () => {
  storage.clearNotes();
});

// Зберігаємо сесію перед закриттям (ВИМКНЕНО - завжди показуємо newtab)
app.on('before-quit', () => {
  // storage.saveSession(sessionTabs);
  // console.log(' Сесію автоматично збережено при закритті');
  console.log(' Сесію НЕ зберігаємо - завжди показуємо newtab при запуску');
});

// ==================== TOR INTEGRATION ====================

// Перемикач Tor
ipcMain.handle('toggle-tor', async () => {
  const ses = session.defaultSession;
  
  if (isTorActive) {
    // Вимикаємо Tor - пряме підключення
    await ses.setProxy({ mode: 'direct' });
    isTorActive = false;
    console.log('Tor вимкнено - звичайне підключення');
    
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
    console.log('Tor увімкнено - трафік через SOCKS5 proxy');
    
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

    console.log('AI-T9: Запит автозаповнення для:', currentText.substring(0, 30) + '...');

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
      model: "llama3-8b-8192", // Найшвидша модель Groq
      max_tokens: 15, // Обмежуємо для швидкості
      temperature: 0.1, // Мінімальна креативність для точності
      stop: ["\n", ".", "!", "?"] // Зупиняємось на кінці речення
    });

    const suggestion = completion.choices[0]?.message?.content?.trim() || "";
    console.log('AI-T9: Відповідь:', suggestion);
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
            // Використовуємо Llama 3 (вона дуже швидка)
            model: "llama3-8b-8192",
            temperature: 0.1, // Мінімальна фантазія, максимальна точність
            max_tokens: 15,   // Обмежуємо довжину відповіді
        });

        const result = completion.choices[0]?.message?.content || "";
        return result.trim(); // Прибираємо зайві пробіли
    } catch (error) {
        console.error("Groq Error:", error);
        return null;
    }});
