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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

console.log('[CONSOLE] Starting BrowserX...');

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
  registerDownloadHandlers(getMainWindow);
  createSplashWindow();
  await new Promise(resolve => setTimeout(resolve, 500));
  privacyGuard.initializePrivacyProtection();
  app.on('web-contents-created', (event, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        const isTorEnabled = torManager.isTorEnabled();
        
        if (isTorEnabled) {
          const url = webContents.getURL();
          console.log(`[PRIVACY] BLOCKED geolocation request from: ${url}`);
          console.log('[PRIVACY] Reason: Tor is active, geolocation would reveal real location');
          callback(false);
          return;
        } else {
          console.log('[PRIVACY] Geolocation request (Tor OFF, allowing)');
        }
      }
      callback(true);
    });
    contents.on('did-finish-load', () => {
      if (torManager.isTorEnabled()) {
        privacyGuard.injectGeolocationBlockToContents(contents);
      }
    });
  });
  
  console.log('[PRIVACY] Global web-contents-created handler registered');
  app.on('session-created', (customSession) => {
    console.log('[PRIVACY] New session created, applying permission handler...');
    
    customSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        const isTorEnabled = torManager.isTorEnabled();
        
        if (isTorEnabled) {
          const url = webContents.getURL();
          console.log(`[PRIVACY] BLOCKED geolocation in custom session from: ${url}`);
          callback(false);
          return;
        }
      }
      callback(true);
    });
  });
  
  console.log('[PRIVACY] Global session-created handler registered');
  
  await createWindow();
  console.log('[TOR] Tor auto-start DISABLED. User will enable manually via button.');

  const mainWindow = getMainWindow();
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
  console.log('[WINDOW] Close command received');
  const win = getMainWindow();
  if (win) win.close();
  app.quit();
});

registerContextMenu(getMainWindow);

ipcMain.on('apply-theme', (event, theme) => {
  console.log('[THEME] Applying:', theme.name);
  getMainWindow().webContents.send('theme-changed', theme);
});

ipcMain.on('update-theme-settings', (event, settings) => {
  themeManager.updateThemeSettings(settings);
  const win = getMainWindow();
  if (win) {
    win.webContents.send('update-newtab-themes', settings);
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
  console.log('[IPC] Received close-tab request for tabId:', tabId);
  const shouldClose = tabManager.closeTab(tabId, getMainWindow());
  console.log('[IPC] Tab manager returned shouldClose:', shouldClose);
  if (shouldClose) {
    console.log('[TAB] Last tab closed - quitting application');
    app.quit();
  } else {
    console.log('[TAB] Tab closed successfully, continuing');
  }
});

ipcMain.on('reorder-tabs', (event, newOrder) => {
  tabManager.reorderTabs(newOrder);
});

ipcMain.on('navigate', (event, input) => {
  console.log('[ДІАГНОСТИКА MAIN] Отримано IPC navigate від renderer');
  console.log('[ДІАГНОСТИКА MAIN] Input URL:', input);
  console.log('[ДІАГНОСТИКА MAIN] Tor enabled:', torManager.isTorEnabled());
  console.log('[ДІАГНОСТИКА MAIN] Викликаємо tabManager.navigate()...');
  
  tabManager.navigate(input, torManager.isTorEnabled());
  
  console.log('[ДІАГНОСТИКА MAIN] tabManager.navigate() виконано');
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
ipcHandlers.registerStorageHandlers(storage, tabManager);
ipcHandlers.registerAISchedulerHandlers(aiScheduler);
registerNewsHandlers();

// IPC: знайдено на сторінці — пробрасуємо результат з webview в renderer
ipcMain.on('found-in-page-result', (event, result) => {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('found-in-page', result);
  }
});

console.log('[CONSOLE] BrowserX main process initialized');

function handleAppUrl(url) {
  console.log('[PROTOCOL] Handling app:// URL:', url);
  const mainWindow = getMainWindow();
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
