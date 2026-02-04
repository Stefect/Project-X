const { app, BrowserWindow, BrowserView, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const Groq = require('groq-sdk');

// Очищаємо кеш config при кожному запуску
delete require.cache[require.resolve('./config')];
const config = require('./config');

let mainWindow;
let browserView;
let groqClient;

// Система управління вкладками
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;
let sidebarWidth = 0; // За замовчуванням sidebar згорнутий

function createWindow() {
  // Ініціалізуємо Groq AI (швидше за Gemini!)
  try {
    if (!config.GROQ_API_KEY || config.GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
      console.error('✗ API ключ не налаштовано в config.js');
    } else {
      groqClient = new Groq({ apiKey: config.GROQ_API_KEY });
      console.log('✓ Groq AI ініціалізовано з ключем:', config.GROQ_API_KEY.substring(0, 10) + '...');
    }
  } catch (error) {
    console.error('✗ Помилка ініціалізації Groq:', error.message);
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

  // Створюємо меню з DevTools
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
  mainWindow.loadFile('index.html');

  // Створюємо BrowserView для веб-контенту
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
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

  // Завантажуємо стартову сторінку
  browserView.webContents.loadURL('https://www.google.com');
  
  // Додаємо першу вкладку до масиву
  tabs.push({
    id: 1,
    browserView: browserView,
    url: 'https://www.google.com',
    title: 'Нова вкладка'
  });

  // Інжектуємо скрипт для відслідковування виділення тексту + Code Mate + Link X-Ray + Translator
  browserView.webContents.on('did-finish-load', () => {
    injectLightTheme(browserView);
    injectSelectionListener(browserView);
    injectCodeMate(browserView);
    injectLinkXRay(browserView);
    injectTranslator(browserView);
  });

  browserView.webContents.on('did-navigate', () => {
    injectLightTheme(browserView);
    injectSelectionListener(browserView);
    injectCodeMate(browserView);
    injectLinkXRay(browserView);
    injectTranslator(browserView);
  });

  // Додаємо контекстне меню для збереження виділеного тексту
  browserView.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    // Якщо користувач виділив текст, показуємо опцію
    if (params.selectionText) {
      menu.append(new MenuItem({
        label: '📌 Додати в конспект',
        click: () => {
          // Відправляємо виділений текст у головне вікно
          mainWindow.webContents.send('add-to-notes', params.selectionText);
        }
      }));
      
      menu.popup();
    }
  });

  browserView.webContents.on('did-navigate-in-page', () => {
    injectLightTheme(browserView);
    injectSelectionListener(browserView);
    injectCodeMate(browserView);
    injectLinkXRay(browserView);
  });

  // Перехоплюємо console.log з веб-сторінки (оновлений синтаксис без deprecated)
  browserView.webContents.on('console-message', async (event) => {
    const message = event.message;
    
    // Обробка виділеного тексту
    if (message.startsWith('AI_SELECTED_TEXT:')) {
      const text = message.replace('AI_SELECTED_TEXT:', '').trim();
      ipcMain.emit('text-selected', null, text);
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
        console.error('Помилка обробки запиту на аналіз коду:', error);
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
    const bounds = mainWindow.getContentBounds();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.browserView) {
      activeTab.browserView.setBounds({ 
        x: 0, 
        y: 100, // 40px tabs + 60px toolbar
        width: bounds.width - sidebarWidth, // Використовуємо поточну ширину sidebar
        height: bounds.height - 100 
      });
    }
  });
}

app.whenReady().then(() => {
  createWindow();

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
  mainWindow.close();
});

// Обробка перекладу тексту
async function translateText(text, targetLanguage) {
  try {
    console.log('🌐 Переклад на', targetLanguage + ':', text.substring(0, 50) + '...');

    if (!groqClient) {
      return { 
        success: false, 
        message: '⚠️ AI не ініціалізовано. Перевірте API ключ у config.js' 
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

    console.log('🤔 Перекладаю через Groq AI...');

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
        message: '❌ Помилка перекладу' 
      };
    }

    console.log('✓ Переклад готовий');
    return { 
      success: true, 
      translation: translation 
    };

  } catch (error) {
    console.error('Помилка перекладу:', error);
    return { 
      success: false, 
      message: `❌ ${error.message}` 
    };
  }
}

ipcMain.handle('translate-text', async (event, text, targetLanguage) => {
  return await translateText(text, targetLanguage);
});

// Обробка зміни мови перекладу
ipcMain.on('change-translation-language', (event, language) => {
  console.log('🌐 Мова перекладу змінена на:', language);
  
  // Відправляємо повідомлення всім вкладкам
  tabs.forEach(tab => {
    tab.browserView.webContents.executeJavaScript(`
      window.postMessage({ type: 'SET_TRANSLATION_LANGUAGE', language: '${language}' }, '*');
    `).catch(err => console.error('Помилка зміни мови:', err));
  });
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
  
  console.log(`📐 Панель ${isCollapsed ? 'згорнуто' : 'розгорнуто'}, ширина браузера: ${bounds.width - sidebarWidth}px`);
});

// ========== Система управління вкладками ==========

// Створити нову вкладку
ipcMain.handle('create-tab', async (event, url = 'https://www.google.com') => {
  const bounds = mainWindow.getContentBounds();
  // Використовуємо глобальну змінну sidebarWidth (не оголошуємо локальну!)
  
  const newBrowserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
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
    injectLightTheme(newBrowserView);
    injectSelectionListener(newBrowserView);
    injectCodeMate(newBrowserView);
    injectLinkXRay(newBrowserView);
    injectTranslator(newBrowserView);
    
    // Оновлюємо заголовок вкладки
    const title = newBrowserView.webContents.getTitle();
    const currentUrl = newBrowserView.webContents.getURL();
    mainWindow.webContents.send('update-tab-info', newTab.id, title, currentUrl);
  });
  
  newBrowserView.webContents.on('did-navigate', () => {
    injectLightTheme(newBrowserView);
    injectSelectionListener(newBrowserView);
    injectCodeMate(newBrowserView);
    injectLinkXRay(newBrowserView);
    injectTranslator(newBrowserView);
    const title = newBrowserView.webContents.getTitle();
    const currentUrl = newBrowserView.webContents.getURL();
    mainWindow.webContents.send('update-tab-info', newTab.id, title, currentUrl);
  });
  
  newBrowserView.webContents.on('did-navigate-in-page', () => {
    injectLightTheme(newBrowserView);
    injectSelectionListener(newBrowserView);
    injectCodeMate(newBrowserView);
    injectLinkXRay(newBrowserView);
    injectTranslator(newBrowserView);
  });
  
  // Контекстне меню
  newBrowserView.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();
    if (params.selectionText) {
      menu.append(new MenuItem({
        label: '📌 Додати в конспект',
        click: () => {
          mainWindow.webContents.send('add-to-notes', params.selectionText);
        }
      }));
      menu.popup();
    }
  });
  
  // Console message handler
  newBrowserView.webContents.on('console-message', async (event) => {
    const message = event.message;
    
    if (message.startsWith('AI_SELECTED_TEXT:')) {
      const text = message.replace('AI_SELECTED_TEXT:', '').trim();
      ipcMain.emit('text-selected', null, text);
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
  
  newBrowserView.webContents.loadURL(url);
  
  return { id: newTab.id, url: url, title: newTab.title };
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
  
  console.log('🔄 Перемкнуто на вкладку:', tabId);
});

// Закрити вкладку
ipcMain.on('close-tab', (event, tabId) => {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;
  
  const tab = tabs[tabIndex];
  
  // Якщо це остання вкладка, закриваємо браузер
  if (tabs.length <= 1) {
    console.log('🚪 Закриття останньої вкладки - закриваємо браузер');
    mainWindow.close();
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
  
  console.log('❌ Закрито вкладку:', tabId, '| Залишилось вкладок:', tabs.length);
});

// Оновити URL активної вкладки
ipcMain.on('navigate', (event, url) => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  activeTab.browserView.webContents.loadURL(url);
});

// Навігація активної вкладки
ipcMain.on('go-back', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView.webContents.navigationHistory.canGoBack()) {
    activeTab.browserView.webContents.navigationHistory.goBack();
  }
});

ipcMain.on('go-forward', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.browserView.webContents.navigationHistory.canGoForward()) {
    activeTab.browserView.webContents.navigationHistory.goForward();
  }
});

ipcMain.on('reload', () => {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    activeTab.browserView.webContents.reload();
  }
});

// ========== AI Link X-Ray (Рентген Посилань) ==========
// Функція для сканування посилань через AI
async function xrayLink(url) {
  try {
    console.log('🦴 X-Ray сканування:', url);
    
    if (!groqClient) {
      return '⚠️ AI не ініціалізовано';
    }
    
    // Використовуємо вбудований fetch (Node.js 18+)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 сек таймаут
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
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
Якщо це схоже на спам, продаж або клікбейт — почни з ⚠️.
Якщо це корисний контент — почни з ✅.

Текст: ${cleanText}` 
      }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 100
    });
    
    const result = completion.choices[0]?.message?.content || 'Не вдалося проаналізувати';
    console.log('✓ X-Ray результат:', result);
    return result;
    
  } catch (error) {
    console.error('❌ X-Ray помилка:', error.message);
    if (error.name === 'AbortError') {
      return '⏱️ Таймаут - сторінка завантажується занадто довго';
    }
    return '❌ Не вдалося просканувати';
  }
}

// IPC handler для X-Ray (для зворотної сумісності)
ipcMain.handle('xray-link', async (event, url) => {
  return await xrayLink(url);
});

// Обробка виділеного тексту та AI пояснення
ipcMain.on('text-selected', async (event, selectedText) => {
  try {
    // Показуємо індикатор завантаження
    showPopupInBrowser('⏳ Завантаження...');
    
    // Викликаємо Google Gemini API
    const explanation = await getAIExplanation(selectedText);
    
    // Відправляємо пояснення назад у веб-вміст
    showPopupInBrowser(explanation);
  } catch (error) {
    console.error('Помилка при отриманні пояснення:', error);
    showPopupInBrowser('❌ Помилка: Перевірте API ключ у файлі config.js');
  }
});

// Обробник для узагальнення нотаток через Groq
ipcMain.handle('ask-gemini', async (event, prompt) => {
  try {
    if (!groqClient) {
      throw new Error('AI не ініціалізовано. Перевірте API ключ у config.js');
    }

    console.log('📝 Отримано запит на узагальнення нотаток...');
    
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile', // Оновлена найрозумніша модель Groq
      temperature: 0.7,
      max_tokens: 2048
    });
    
    const text = completion.choices[0]?.message?.content || 'Помилка: не отримано відповідь';
    console.log('✓ Відповідь отримана від Groq (блискавично!)');
    return text;
  } catch (error) {
    console.error('❌ Помилка Groq API:', error);
    throw new Error(`Не вдалося отримати відповідь від AI: ${error.message}`);
  }
});

// Обробник розумного пошуку
ipcMain.handle('smart-search', async (event, query) => {
  try {
    console.log('🔍 Розумний пошук:', query);

    if (!groqClient) {
      return { 
        success: false, 
        message: '⚠️ AI не ініціалізовано. Перевірте API ключ у config.js' 
      };
    }

    // Отримуємо текст сторінки
    const pageText = await browserView.webContents.executeJavaScript('document.body.innerText');
    
    if (!pageText || pageText.trim().length === 0) {
      return { 
        success: false, 
        message: '❌ Сторінка порожня або не завантажилась' 
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

    console.log('🤔 Аналізую сенс через Groq AI...');

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
        message: '❌ Нічого схожого не знайшов. Спробуйте інший запит.' 
      };
    }

    // Очищаємо цитату від лапок
    const cleanQuote = exactQuote.replace(/^["']|["']$/g, '').trim();

    console.log('✓ Знайдено фразу:', cleanQuote);

    // Використовуємо вбудований пошук Chromium
    const requestId = await browserView.webContents.findInPage(cleanQuote, {
      findNext: false
    });

    return { 
      success: true, 
      message: '✅ Знайдено! Підсвічено на сторінці.',
      quote: cleanQuote 
    };

  } catch (error) {
    console.error('❌ Помилка розумного пошуку:', error);
    return { 
      success: false, 
      message: `❌ Помилка: ${error.message}` 
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

// Функція для інжектування перекладача
function injectTranslator(targetView = null) {
  const fs = require('fs');
  const translatorScript = fs.readFileSync(path.join(__dirname, 'translator.js'), 'utf8');
  const view = targetView || browserView;
  
  view.webContents.executeJavaScript(translatorScript)
    .then(() => {
      console.log('✓ Translator інжектовано');
    })
    .catch(err => {
      console.error('Помилка інжекту translator:', err);
    });
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
      console.log('✓ Світла тема активована');
    })
    .catch(err => {
      console.error('Помилка інжекту світлої теми:', err);
    });
}

// Функція для інжектування слухача виділення тексту
function injectSelectionListener(targetView = null) {
  const fs = require('fs');
  const injectScript = fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8');
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
    const codeInjectorScript = fs.readFileSync(path.join(__dirname, 'code-injector.js'), 'utf8');
    
    view.webContents.executeJavaScript(codeInjectorScript)
      .then(() => {
        console.log('✓ Code Mate активовано на сторінці');
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
    const linkXRayScript = fs.readFileSync(path.join(__dirname, 'link-xray.js'), 'utf8');
    
    view.webContents.executeJavaScript(linkXRayScript)
      .then(() => {
        console.log('✓ Link X-Ray активовано на сторінці');
      })
      .catch(err => {
        console.error('Помилка інжекту Link X-Ray:', err);
      });
  } catch (error) {
    console.error('Не вдалося прочитати link-xray.js:', error);
  }
}

// Функція для отримання пояснення від Groq AI
async function getAIExplanation(text) {
  const apiKey = config.GROQ_API_KEY;
  
  if (apiKey === 'YOUR_GROQ_API_KEY_HERE' || !apiKey) {
    return '⚠️ API ключ не налаштовано!\n\n1. Відкрийте https://console.groq.com/keys\n2. Натисніть "Create API Key"\n3. Скопіюйте ключ у файл config.js';
  }

  if (!groqClient) {
    return '❌ AI не ініціалізовано.\n\nПеревірте що:\n1. API ключ правильний\n2. Groq API активовано';
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
      return `❌ API ключ невірний!\n\n1. Перейдіть на https://console.groq.com/keys\n2. Створіть новий ключ\n3. Оновіть config.js`;
    }
    
    return `❌ Помилка AI: ${error.message}`;
  }
}
