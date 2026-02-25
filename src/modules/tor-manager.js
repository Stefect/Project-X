/**
 * Tor Manager - Інтеграція з Tor для анонімного перегляду
 * Керує процесом Tor і проксі налаштуваннями
 */

const { spawn } = require('child_process');
const { session } = require('electron');
const path = require('path');
const fs = require('fs');

let torProcess = null;
let isTorActive = false;

/**
 * Запускає процес Tor
 */
function startTor() {
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
    
    // Перевіряємо чи Tor готовий
    if (output.includes('Bootstrapped 100%')) {
      console.log('[TOR] Tor successfully connected!');
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
  });
}

/**
 * Перемикає Tor режим
 */
async function toggleTor(mainWindow) {
  const ses = session.defaultSession;
  
  if (isTorActive) {
    // Вимикаємо Tor - пряме підключення
    await ses.setProxy({ mode: 'direct' });
    isTorActive = false;
    console.log('Tor disabled - regular connection');
    
    // Оновлюємо placeholder адресної строки
    if (mainWindow) {
      mainWindow.webContents.send('update-search-engine', 'Google');
    }
    
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
    if (mainWindow) {
      mainWindow.webContents.send('update-search-engine', 'DuckDuckGo');
      mainWindow.webContents.send('tor-ready', true);
    }
    
    return { 
      status: true, 
      message: 'Tor увімкнено! Пошук: DuckDuckGo' 
    };
  }
}

/**
 * Отримує статус Tor
 */
function getTorStatus() {
  return { 
    active: isTorActive,
    processRunning: torProcess !== null && torProcess.exitCode === null
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
  }
}

module.exports = {
  startTor,
  toggleTor,
  getTorStatus,
  isTorEnabled,
  stopTor
};
