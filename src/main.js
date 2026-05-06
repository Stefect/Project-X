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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
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
  registerDownloadHandlers(getMainWindow);
  createSplashWindow();
  await new Promise(resolve => setTimeout(resolve, 500));
  privacyGuard.initializePrivacyProtection();
  app.on('web-contents-created', (event, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        const isTorEnabled = torManager.isTorEnabled();
        
        if (isTorEnabled) {
          callback(false);
          return;
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
  const win = getMainWindow();
  if (win) win.close();
  app.quit();
});

registerContextMenu(getMainWindow);

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

ipcMain.on('found-in-page-result', (event, result) => {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('found-in-page', result);
  }
});

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
