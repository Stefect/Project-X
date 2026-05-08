import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { app, BrowserWindow, ipcMain, session, net, protocol } from 'electron';
import * as storage from './modules/storage.js';
import * as reactiveEvents from './modules/reactive-events.js';
import * as torManager from './modules/tor-manager.js';
import * as themeManager from './modules/theme-manager.js';
import * as tabManager from './modules/tab-manager.js';
import * as ipcHandlers from './modules/ipc-handlers.js';
import * as privacyGuard from './modules/privacy-guard.js';
import { registerNewsHandlers } from './modules/news-handlers.js';
import aiScheduler from './modules/ai-task-scheduler.js';
import { getMainWindow, createSplashWindow, createWindow, restoreSessionSmart, injectUnifiedT9 } from './app/window-manager.js';
import { registerContextMenu } from './app/context-menu.js';
import { registerDownloadHandlers } from './modules/download-handlers.js';
import { checkIp } from './modules/ip-checker.js';

// Емуляція __dirname для ESM-модулів (в ESM ця змінна відсутня за замовчуванням)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Реєстрація кастомної схеми 'app://' як привілейованої до старту Electron
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

// Гарантуємо запуск лише одного екземпляру програми
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

app.whenReady().then(async () => {
  // Шлях до статичних файлів інтерфейсу
  const publicDir = path.resolve(path.join(__dirname, '..', 'public'));
  // Обробник кастомного протоколу app:// — захист від path traversal та обслуговування файлів
  const appProtocolHandler = (request) => {
    const { pathname } = new URL(request.url);
    const resolved = path.resolve(path.join(publicDir, pathname));
    // Блокуємо вихід за межі публічної директорії (path traversal)
    if (!resolved.startsWith(publicDir + path.sep) && resolved !== publicDir) {
      return new Response('Not Found', { status: 404 });
    }
    return net.fetch('file://' + resolved);
  };
  // Реєструємо протокол для основної сесії та webview-сесії
  protocol.handle('app', appProtocolHandler);
  session.fromPartition('persist:main').protocol.handle('app', appProtocolHandler);
  registerDownloadHandlers(getMainWindow);
  createSplashWindow();
  await new Promise(resolve => setTimeout(resolve, 500));
  // Ініціалізація захисту приватності (блокування трекерів тощо)
  privacyGuard.initializePrivacyProtection();
  // Блокуємо геолокацію у всіх webContents при увімкненому Tor
  app.on('web-contents-created', (event, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        const isTorEnabled = torManager.isTorEnabled();
        // Якщо Tor увімкнений — забороняємо доступ до геолокації
        if (isTorEnabled) {
          callback(false);
          return;
        }
      }
      callback(true);
    });
    // Після завантаження сторінки — додаємо JS-блокування геолокації для Tor
    contents.on('did-finish-load', () => {
      if (torManager.isTorEnabled()) {
        privacyGuard.injectGeolocationBlockToContents(contents);
      }
    });
  });
  
  app.on('session-created', (customSession) => {
    customSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        const isTorEnabled = torManager.isTorEnabled();
        
        if (isTorEnabled) {
          callback(false);
          return;
        }
      }
      callback(true);
    });
  });

  await createWindow();

  const mainWindow = getMainWindow();
  // Підписка на мережеві події (онлайн/офлайн, зміна IP)
  reactiveEvents.setupReactiveNetworkEvents(mainWindow);
  // Відновлення попередньої сесії (вкладки) після завантаження інтерфейсу
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => restoreSessionSmart(), 500);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Закриваємо застосунок при закритті всіх вікон (крім macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Зупиняємо процес Tor перед виходом
app.on('will-quit', () => {
  torManager.stopTor();
});

// IPC-обробники керування вікном (мінімізація, максимізація, закриття)
ipcMain.on('window-minimize', () => {
  getMainWindow().minimize();
});

ipcMain.on('window-maximize', () => {
  const win = getMainWindow();
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on('window-close', () => {
  const win = getMainWindow();
  if (win) win.close();
  app.quit();
});

registerContextMenu(getMainWindow);

// IPC-обробники теми та налаштувань відображення
ipcMain.on('apply-theme', (event, theme) => {
  getMainWindow().webContents.send('theme-changed', theme);
});

ipcMain.on('update-theme-settings', (event, settings) => {
  themeManager.updateThemeSettings(settings);
  const win = getMainWindow();
  if (win) {
    win.webContents.send('update-newtab-themes', settings);
  }
});

ipcMain.on('topbar-height-changed', (event, height) => {
  tabManager.setTopbarHeight(height);
});

// IPC-обробники управління вкладками
ipcMain.handle('create-tab', async (event, url = null) => {
  const mainWindow = getMainWindow();
  return tabManager.createTab(mainWindow, url, {
    storage,
    themeManager,
    injectUnifiedT9,
    emitReactiveEvent: (payload) => reactiveEvents.emitReactiveEvent(payload, mainWindow),
    formatUrlLabel: reactiveEvents.formatUrlLabel
  });
});

ipcMain.on('switch-tab', (event, tabId) => {
  tabManager.switchTab(tabId, getMainWindow(), 0);
});

ipcMain.on('close-tab', (event, tabId) => {
  const shouldClose = tabManager.closeTab(tabId, getMainWindow());
  if (shouldClose) {
    app.quit();
  }
});

ipcMain.on('reorder-tabs', (event, newOrder) => {
  tabManager.reorderTabs(newOrder);
});

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

// Реактивні події мережі (для відображення статусу у UI)
ipcMain.handle('get-reactive-events', () => {
  return reactiveEvents.getReactiveEventBuffer();
});

// IPC-обробники Tor (увімкнення/вимкнення, статус, перевірка IP)
ipcMain.handle('toggle-tor', async () => {
  return await torManager.toggleTor(getMainWindow(), tabManager);
});

ipcMain.handle('get-tor-status', () => {
  return torManager.getTorStatus();
});

ipcMain.handle('is-tor-enabled', () => {
  return torManager.isTorEnabled();
});

ipcMain.handle('check-ip', async () => {
  return checkIp(torManager);
});
// Реєстрація обробників сховища (history, bookmarks, notes, settings) та AI-планувальника
ipcHandlers.registerStorageHandlers(storage, tabManager);
ipcHandlers.registerAISchedulerHandlers(aiScheduler);
registerNewsHandlers();

ipcMain.on('found-in-page-result', (event, result) => {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('found-in-page', result);
  }
});

// Обробка deep link URL типу app:// (наприклад, при відкритті з командного рядка)
function handleAppUrl(url) {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    const { pathname } = new URL(url);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('handle-app-url', pathname);
  }
}
if (process.argv.length >= 2) {
  const possibleUrl = process.argv.find(arg => arg.startsWith('app://'));
  if (possibleUrl) {
    app.whenReady().then(() => {
      setTimeout(() => handleAppUrl(possibleUrl), 1000);
    });
  }
}
// Якщо запущено другий екземпляр — відновлюємо фокус на існуючому вікні
app.on('second-instance', (event, commandLine, workingDirectory) => {
  const url = commandLine.find(arg => arg.startsWith('app://'));
  if (url) {
    handleAppUrl(url);
  }
  const mainWindow = getMainWindow();
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
