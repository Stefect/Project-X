

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
    
    console.log(`[TOR] Bootstrap: ${bootstrapProgress}% - ${bootstrapStatus}`);
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
  const torPath = path.join(__dirname, '..', '..', 'bin', 'tor', torBinary);
  if (!fs.existsSync(torPath)) {
    console.log(`[TOR] Tor not found at path: ${torPath}`);
    console.log('[TOR] Download Tor Expert Bundle and place binary in bin/tor/ folder');
    console.log(`   Windows: tor.exe | macOS/Linux: tor`);
    return;
  }
  if (!isWindows) {
    try {
      fs.chmodSync(torPath, 0o755);
      console.log('[TOR] Set execution permissions for Tor');
    } catch (err) {
      console.error('[TOR] Failed to set execution permissions:', err.message);
    }
  }
  
  console.log(`[TOR] Starting Tor (${process.platform}):`, torPath);
  
  const geoipPath = path.join(__dirname, '..', '..', 'bin', 'data', 'geoip');
  const geoip6Path = path.join(__dirname, '..', '..', 'bin', 'data', 'geoip6');
  
  const torArgs = [
    '--GeoIPFile', geoipPath,
    '--GeoIPv6File', geoip6Path
  ];
  
  const spawnOptions = {
    cwd: path.join(__dirname, '..', '..', 'bin', 'tor')
  };
  if (isWindows) {
    spawnOptions.windowsHide = true;
  }
  
  torProcess = spawn(torPath, torArgs, spawnOptions);
  
  torProcess.stdout.on('data', (data) => {
    const output = data.toString('utf8');
    console.log('Tor:', output);
    parseBootstrapLine(output);
    if (bootstrapProgress === 100) {
      isTorReady = true;
      bootstrapStatus = 'Connected';
      console.log('[TOR] ✓ Tor successfully connected and ready!');
      if (mainWindowRef && mainWindowRef.webContents) {
        mainWindowRef.webContents.send('tor-ready', true);
      }
    }
  });
  
  torProcess.stderr.on('data', (data) => {
    const output = data.toString('utf8');
    if (output.includes('[err]') || output.includes('ERROR')) {
      console.error('Tor Error:', output);
    }
  });
  
  torProcess.on('close', (code) => {
    console.log('[TOR] Tor process exited with code:', code);
    
    if (code === 1) {
      console.error('[TOR] ❌ Exit code 1: Check DataDirectory permissions or configuration');
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
    console.log('[TOR] ✅ Tor disabled - regular connection (both sessions)');
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
      console.log('[TOR] Tor process not running, starting now...');
      startTor('DE', { mainWindow });
      return {
        status: false,
        message: 'Запуск Tor... Зачекайте 10-30 секунд',
        bootstrapProgress: 0,
        bootstrapStatus: 'Starting Tor process...'
      };
    }
    if (!isTorReady) {
      console.warn('[TOR] Tor is not ready yet. Please wait for connection...');
      console.warn(`[TOR] Current bootstrap: ${bootstrapProgress}% - ${bootstrapStatus}`);
      return {
        status: false,
        message: `Tor підключається... ${bootstrapProgress}%`,
        bootstrapProgress: bootstrapProgress,
        bootstrapStatus: bootstrapStatus
      };
    }
    const portAvailable = await checkPortAvailable(socksPort);
    if (portAvailable) {
      console.error('[TOR] ❌ SOCKS port is not listening! Tor process may have crashed.');
      console.error('[TOR] Bootstrap was 100% but port is not responding.');
      return {
        status: false,
        message: 'Помилка: Tor процес не відповідає'
      };
    }
    
    console.log('[TOR] ✅ Port 9050 is listening (Tor ready)');
    console.log('[TOR] Applying SOCKS5 proxy configuration...');
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
      console.log('[PRIVACY] ✓ Cleared ALL storage for BOTH sessions (main + webview)');
    } catch (err) {
      console.warn('[PRIVACY] Failed to clear storage:', err.message);
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
    
    console.log('[TOR] ✅ SOCKS5 proxy applied to BOTH sessions: socks5://127.0.0.1:9050');
    console.log('[TOR] ✅ DNS resolution: Via Tor SOCKS5 (no DNS leak)');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    isTorActive = true;
    console.log('[TOR] ✅ Tor enabled successfully');
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
    console.log('[TOR] Closing Tor...');
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
