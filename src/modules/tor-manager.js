/**
 * Tor Manager - Інтеграція з Tor для анонімного перегляду
 * Керує процесом Tor і проксі налаштуваннями
 */

const { spawn, execSync } = require('child_process');
const { session, app } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

// Privacy Guard для блокування витоків
let privacyGuard = null;
try {
  privacyGuard = require('./privacy-guard');
} catch (err) {
  console.warn('[TOR] Privacy guard not available:', err.message);
}

let torProcess = null;
let isTorActive = false;
let isTorReady = false;
let pendingExitCountry = null;
let bootstrapProgress = 0;
let bootstrapStatus = 'Not started';
let socksPort = 9050;
let mainWindowRef = null;

/**
 * Перевіряє чи порт доступний
 */
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

/**
 * Парсить рядок Bootstrap з логів Tor
 */
function parseBootstrapLine(line) {
  const match = line.match(/Bootstrapped (\d+)%(?:\s*\(([^)]+)\))?:?\s*(.*)/);
  if (match) {
    const oldProgress = bootstrapProgress;
    bootstrapProgress = parseInt(match[1], 10);
    bootstrapStatus = match[3] || match[2] || 'Connecting...';
    
    console.log(`[TOR] Bootstrap: ${bootstrapProgress}% - ${bootstrapStatus}`);
    
    // Відправляємо прогрес в UI
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

/**
 * Запускає процес Tor
 */
function startTor(exitCountry = null, options = {}) {
  const { mainWindow } = options;
  
  // Зберігаємо посилання на mainWindow
  if (mainWindow) {
    mainWindowRef = mainWindow;
  }
  
  pendingExitCountry = exitCountry;
  const isWindows = process.platform === 'win32';
  const torBinary = isWindows ? 'tor.exe' : 'tor';
  const torPath = path.join(__dirname, '..', '..', 'bin', 'tor', torBinary);
  
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
  
  const geoipPath = path.join(__dirname, '..', '..', 'bin', 'data', 'geoip');
  const geoip6Path = path.join(__dirname, '..', '..', 'bin', 'data', 'geoip6');
  
  const torArgs = [
    '--GeoIPFile', geoipPath,
    '--GeoIPv6File', geoip6Path
  ];
  
  const spawnOptions = {
    cwd: path.join(__dirname, '..', '..', 'bin', 'tor')
  };
  
  // Приховуємо консольне вікно тільки на Windows
  if (isWindows) {
    spawnOptions.windowsHide = true;
  }
  
  torProcess = spawn(torPath, torArgs, spawnOptions);
  
  torProcess.stdout.on('data', (data) => {
    const output = data.toString('utf8');
    console.log('Tor:', output);
    
    // Парсимо Bootstrap прогрес
    parseBootstrapLine(output);
    
    // Перевіряємо чи Tor готовий
    if (bootstrapProgress === 100) {
      isTorReady = true;
      bootstrapStatus = 'Connected';
      console.log('[TOR] ✓ Tor successfully connected and ready!');
      
      // Сповіщаємо UI що Tor готовий
      if (mainWindowRef && mainWindowRef.webContents) {
        mainWindowRef.webContents.send('tor-ready', true);
      }
    }
  });
  
  torProcess.stderr.on('data', (data) => {
    const output = data.toString('utf8');
    // Tor виводить багато інформації в stderr - це нормально
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

/**
 * Перемикає Tor режим
 */
async function toggleTor(mainWindow, tabManager = null) {
  const ses = session.defaultSession;
  
  if (isTorActive) {
    // Вимикаємо Tor - пряме підключення
    await ses.setProxy({ mode: 'direct' });
    isTorActive = false;
    console.log('[TOR] Tor disabled - regular connection');
    
    // Вимикаємо Privacy Mode
    if (privacyGuard) {
      privacyGuard.disablePrivacyMode(mainWindow);
    }
    
    // Оновлюємо placeholder адресної строки
    if (mainWindow) {
      mainWindow.webContents.send('update-search-engine', 'Google');
      mainWindow.webContents.send('tor-active', false); // ВИПРАВЛЕНО: false коли вимикаємо
    }
    
    return { 
      status: false, 
      message: 'Tor вимкнено. Пошук: Google' 
    };
  } else {
    // Перевіряємо чи Tor готовий
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
    
    // Додаткова перевірка: чи слухається порт 9050
    const portAvailable = await checkPortAvailable(socksPort);
    if (portAvailable) {
      // Порт ВІЛЬНИЙ - це погано, означає що Tor НЕ слухає
      console.error('[TOR] ❌ SOCKS port is not listening! Tor process may have crashed.');
      console.error('[TOR] Bootstrap was 100% but port is not responding.');
      return {
        status: false,
        message: 'Помилка: Tor процес не відповідає'
      };
    }
    
    console.log('[TOR] ✅ Port 9050 is listening (Tor ready)');
    console.log('[TOR] Applying SOCKS5 proxy configuration...');
    
    // Очищаємо ВСІ типи кешу перед підключенням до Tor
    // Це запобігає fingerprinting та витоку даних з попередньої сесії
    // КРИТИЧНО: localStorage може містити закешовану геолокацію!
    try {
      await ses.clearStorageData({
        storages: [
          'appcache',       // Application cache
          'cookies',        // Cookies
          'filesystem',     // FileSystem API
          'indexdb',        // IndexedDB
          'localstorage',   // LocalStorage (КРИТИЧНО для геолокації!)
          'shadercache',    // Shader cache
          'websql',         // WebSQL
          'serviceworkers', // Service Workers
          'cachestorage'    // Cache Storage API
        ]
      });
      console.log('[PRIVACY] ✓ Cleared ALL storage types for Tor session (cookies, localStorage, cache, etc.)');
    } catch (err) {
      console.warn('[PRIVACY] Failed to clear storage:', err.message);
    }
    
    // Вмикаємо Tor - SOCKS5 proxy з DNS через Tor
    await ses.setProxy({
      proxyRules: 'socks5://127.0.0.1:9050',
      proxyBypassRules: '<local>' // Тільки локальні адреси без проксі
    });
    
    console.log('[TOR] ✅ SOCKS5 proxy applied: socks5://127.0.0.1:9050');
    console.log('[TOR] ✅ DNS resolution: Via Tor SOCKS5 (no DNS leak)');
    
    // Чекаємо 500ms щоб proxy точно застосувався
    await new Promise(resolve => setTimeout(resolve, 500));
    
    isTorActive = true;
    console.log('[TOR] ✅ Tor enabled successfully');
    
    // Вмикаємо Privacy Mode (блокує геолокацію та небезпечні дозволи)
    if (privacyGuard) {
      privacyGuard.enablePrivacyMode(mainWindow);
    }
    
    // Оновлюємо placeholder адресної строки
    if (mainWindow) {
      mainWindow.webContents.send('update-search-engine', 'DuckDuckGo');
      mainWindow.webContents.send('tor-active', true); // ВИПРАВЛЕНО: true коли увімкнено
    }
    
    return { 
      status: true, 
      message: 'Tor увімкнено! Пошук: DuckDuckGo',
      ready: true
    };
  }
}

/**
 * Отримує статус Tor
 */
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

/**
 * Перевіряє чи активний Tor для вибору пошукової системи
 */
function isTorEnabled() {
  return isTorActive;
}

/**
 * Зупиняє процес Tor
 */
function stopTor() {
  if (torProcess) {
    console.log('[TOR] Closing Tor...');
    torProcess.kill();
    torProcess = null;
    isTorReady = false;
  }
}

module.exports = {
  startTor,
  toggleTor,
  getTorStatus,
  isTorEnabled,
  stopTor
};
