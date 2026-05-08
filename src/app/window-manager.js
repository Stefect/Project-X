import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { BrowserWindow, Menu, session } from 'electron';
import Groq from 'groq-sdk';
import * as storage from '../modules/storage.js';
import * as reactiveEvents from '../modules/reactive-events.js';
import * as tabManager from '../modules/tab-manager.js';
import * as themeManager from '../modules/theme-manager.js';
import { infiniteArticleGenerator } from '../modules/ai-feed.js';
import { registerAIHandlers } from '../modules/ai-handlers.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Глобальний стан: посилання на вікна, ініціалізація Groq і AI-обробників
let mainWindow = null;
let splashWindow = null;
let groqClient = null;
let aiHandlersRegistered = false;

function getMainWindow() {
  return mainWindow;
}

function getSplashWindow() {
  return splashWindow;
}

function injectUnifiedT9() {
}

// Створює splash-екран — показується поки завантажується основне вікно
function createSplashWindow() {
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

  const splashPath = path.join(__dirname, '..', '..', 'public', 'splash.html');
  splashWindow.loadFile(splashPath);
  splashWindow.center();
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

// Створює основне вікно браузера: ініціалізує Groq, реєструє AI-обробники,
// застосовує проксі-налаштування сесії, створює BrowserWindow та меню
async function createWindow() {
  try {
    if (!config.GROQ_API_KEY || config.GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
      console.error('GROQ_API_KEY not set — AI features will be unavailable');
    } else {
      // Ініціалізація клієнта Groq API для AI-функцій
      groqClient = new Groq({ apiKey: config.GROQ_API_KEY });
    }
  } catch (error) {
    console.error('[ERROR] Groq initialization error:', error.message);
  }

  // Реєструємо AI IPC-обробники лише один раз (захист від двойної реєстрації)
  if (!aiHandlersRegistered) {
    registerAIHandlers(groqClient, infiniteArticleGenerator, tabManager);
    aiHandlersRegistered = true;
  }

  // Скидаємо проксі для основної сесії та webview-сесії (запити йдуть безпосередньо)
  const defaultSes = session.defaultSession;
  const webviewSes = session.fromPartition('persist:main');
  await Promise.all([
    defaultSes.setProxy({ mode: 'direct' }),
    webviewSes.setProxy({ mode: 'direct' })
  ]);

  // Створюємо головне вікно: без рамки, з підтримкою webview-тегів
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

  // Після завантаження інтерфейсу — закриваємо splash і показуємо основне вікно
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
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

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
  tabManager.init(mainWindow);

  // Під час закриття основного вікна — зберігаємо сесію вкладок
  mainWindow.on('close', () => {
    const sessionTabs = tabManager.getSessionData();
    const activeTabId = tabManager.getActiveTabId();
    storage.saveSession(sessionTabs, activeTabId);
  });
}

// Відновлює попередню сесію: завантажує збережені вкладки і активну вкладку
function restoreSessionSmart() {
  try {
    const savedSession = storage.getSession();
    tabManager.restoreSession(
      savedSession,
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

export { getMainWindow, getSplashWindow, createSplashWindow, createWindow, restoreSessionSmart, injectUnifiedT9 };
