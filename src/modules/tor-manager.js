

import { spawn, execSync } from 'child_process';
import { session, app } from 'electron';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as privacyGuard from './privacy-guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let torProcess = null;
let isTorActive = false;
let isTorReady = false;
let pendingExitCountry = null;
let bootstrapProgress = 0;
let bootstrapStatus = 'Not started';
let socksPort = 9050;
let mainWindowRef = null;


function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}


function parseBootstrapLine(line) {
  const match = line.match(/Bootstrapped (\d+)%(?:\s*\(([^)]+)\))?:?\s*(.*)/);
  if (match) {
    const oldProgress = bootstrapProgress;
    bootstrapProgress = parseInt(match[1], 10);
    bootstrapStatus = match[3] || match[2] || 'Connecting...';
    
    if (mainWindowRef && mainWindowRef.webContents) {
      mainWindowRef.webContents.send('tor-bootstrap-progress', {
        progress: bootstrapProgress,
        status: bootstrapStatus,
        ready: bootstrapProgress === 100
      });
    }
    
    return bootstrapProgress;
  }
  return null;
}


function startTor(exitCountry = null, options = {}) {
  const { mainWindow } = options;
  if (mainWindow) {
    mainWindowRef = mainWindow;
  }
  
  pendingExitCountry = exitCountry;
  const isWindows = process.platform === 'win32';
  const torBinary = isWindows ? 'tor.exe' : 'tor';
  const torPath = path.join(__dirname, '..', '..', 'tor', torBinary);
  if (!fs.existsSync(torPath)) {
    console.error(`Tor binary not found: ${torPath}`);
    console.error('Download Tor Expert Bundle and place binary in tor/ folder');
    return;
  }
  if (!isWindows) {
    try {
      fs.chmodSync(torPath, 0o755);
    } catch (err) {
      console.error('Failed to set execution permissions:', err.message);
    }
  }
  
  console.log(`Starting Tor (${process.platform}):`, torPath);
  
  const geoipPath = path.join(__dirname, '..', '..', 'data', 'geoip');
  const geoip6Path = path.join(__dirname, '..', '..', 'data', 'geoip6');

  const torDataDir = path.join(app.getPath('userData'), 'tor-data');
  if (!fs.existsSync(torDataDir)) {
    fs.mkdirSync(torDataDir, { recursive: true });
  }
  
  const torArgs = [
    '--DataDirectory', torDataDir,
    '--GeoIPFile', geoipPath,
    '--GeoIPv6File', geoip6Path
  ];
  
  const spawnOptions = {
    cwd: path.join(__dirname, '..', '..', 'tor')
  };
  if (isWindows) {
    spawnOptions.windowsHide = true;
  }
  
  torProcess = spawn(torPath, torArgs, spawnOptions);

  let stdoutBuf = '';
  torProcess.stdout.on('data', (data) => {
    stdoutBuf += data.toString('utf8');
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      console.log('Tor:', line);
      parseBootstrapLine(line);
      if (bootstrapProgress === 100 && !isTorReady) {
        isTorReady = true;
        bootstrapStatus = 'Connected';
        console.log('Tor connected and ready');
        if (mainWindowRef && mainWindowRef.webContents) {
          mainWindowRef.webContents.send('tor-ready', true);
        }
      }
    }
  });
  
  let stderrBuf = '';
  torProcess.stderr.on('data', (data) => {
    stderrBuf += data.toString('utf8');
    const lines = stderrBuf.split('\n');
    stderrBuf = lines.pop();
    for (const line of lines) {
      if (line.includes('[err]') || line.includes('ERROR')) {
        console.error('Tor Error:', line);
      }
    }
  });
  
  torProcess.on('close', (code) => {
    console.log('Tor process exited, code:', code);
    
    if (code === 1) {
      console.error('Tor exit code 1: check DataDirectory permissions or configuration');
    }
    
    torProcess = null;
    isTorReady = false;
    bootstrapProgress = 0;
    bootstrapStatus = 'Stopped';
  });
}


async function toggleTor(mainWindow, tabManager = null) {
  const defaultSes = session.defaultSession;
  const webviewSes = session.fromPartition('persist:main');
  
  if (isTorActive) {
    await Promise.all([
      defaultSes.setProxy({ mode: 'direct' }),
      webviewSes.setProxy({ mode: 'direct' })
    ]);
    isTorActive = false;
    console.log('Tor disabled');
    if (privacyGuard) {
      privacyGuard.disablePrivacyMode(mainWindow);
    }
    if (mainWindow) {
      mainWindow.webContents.send('update-search-engine', 'Google');
      mainWindow.webContents.send('tor-active', false);
    }
    
    return { 
      status: false, 
      message: 'Tor вимкнено. Пошук: Google' 
    };
  } else {
    if (!torProcess || torProcess.exitCode !== null) {
      const isWindows = process.platform === 'win32';
      const torBinary = isWindows ? 'tor.exe' : 'tor';
      const torPath = path.join(__dirname, '..', '..', 'tor', torBinary);
      if (!fs.existsSync(torPath)) {
        console.warn('Tor binary not found:', torPath);
        return {
          status: false,
          message: 'Tor не встановлено. Завантажте Tor Expert Bundle і помістіть у tor/'
        };
      }
      
      startTor('DE', { mainWindow });
      return {
        status: false,
        message: 'Запуск Tor... Зачекайте 10-30 секунд',
        bootstrapProgress: 0,
        bootstrapStatus: 'Starting Tor process...'
      };
    }
    if (!isTorReady) {
      console.warn(`Tor not ready yet: ${bootstrapProgress}% - ${bootstrapStatus}`);
      return {
        status: false,
        message: `Tor підключається... ${bootstrapProgress}%`,
        bootstrapProgress: bootstrapProgress,
        bootstrapStatus: bootstrapStatus
      };
    }
    const portAvailable = await checkPortAvailable(socksPort);
    if (portAvailable) {
      console.error('SOCKS port not listening — Tor process may have crashed.');
      return {
        status: false,
        message: 'Помилка: Tor процес не відповідає'
      };
    }
    
    console.log('Tor SOCKS5 proxy active');
    try {
      const storageTypes = [
        'appcache',
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'websql',
        'serviceworkers',
        'cachestorage'
      ];
      
      await Promise.all([
        defaultSes.clearStorageData({ storages: storageTypes }),
        webviewSes.clearStorageData({ storages: storageTypes })
      ]);
      console.log('Cleared storage for Tor session');
    } catch (err) {
      console.warn('Failed to clear storage:', err.message);
    }
    await Promise.all([
      defaultSes.setProxy({
        proxyRules: 'socks5://127.0.0.1:9050',
        proxyBypassRules: '<local>'
      }),
      webviewSes.setProxy({
        proxyRules: 'socks5://127.0.0.1:9050',
        proxyBypassRules: '<local>'
      })
    ]);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    isTorActive = true;
    if (privacyGuard) {
      privacyGuard.enablePrivacyMode(mainWindow);
    }
    if (mainWindow) {
      mainWindow.webContents.send('update-search-engine', 'DuckDuckGo');
      mainWindow.webContents.send('tor-active', true);
    }
    
    return { 
      status: true, 
      message: 'Tor увімкнено! Пошук: DuckDuckGo',
      ready: true
    };
  }
}


function getTorStatus() {
  return { 
    active: isTorActive,
    processRunning: torProcess !== null && torProcess.exitCode === null,
    ready: isTorReady,
    bootstrapProgress: bootstrapProgress,
    bootstrapStatus: bootstrapStatus,
    exitCountry: pendingExitCountry
  };
}


function isTorEnabled() {
  return isTorActive;
}


function stopTor() {
  if (torProcess) {
    torProcess.kill();
    torProcess = null;
    isTorReady = false;
  }
}

export {
  startTor,
  toggleTor,
  getTorStatus,
  isTorEnabled,
  stopTor
};
