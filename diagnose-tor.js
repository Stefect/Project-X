/**
 * Діагностика модуля tor-manager.js
 * Перевірка цілісності та функціональності
 */

const torManager = require('./src/modules/tor-manager');
const privacyGuard = require('./src/modules/privacy-guard');

console.log('=== 🔧 TOR MANAGER MODULE DIAGNOSTICS ===\n');

// Перевірка 1: Експорти модуля
console.log('📋 Check 1: Module Exports');
const expectedExports = ['startTor', 'toggleTor', 'getTorStatus', 'isTorEnabled', 'stopTor'];
const actualExports = Object.keys(torManager);

console.log('Expected exports:', expectedExports);
console.log('Actual exports:', actualExports);

expectedExports.forEach(exp => {
  if (actualExports.includes(exp)) {
    console.log(`  ✅ ${exp} - exported`);
  } else {
    console.log(`  ❌ ${exp} - MISSING!`);
  }
});

// Перевірка додаткових експортів
const extraExports = actualExports.filter(e => !expectedExports.includes(e));
if (extraExports.length > 0) {
  console.log('  ℹ️ Extra exports:', extraExports);
}

// Перевірка 2: Типи функцій
console.log('\n📋 Check 2: Function Types');
expectedExports.forEach(exp => {
  if (torManager[exp]) {
    const type = typeof torManager[exp];
    if (type === 'function') {
      console.log(`  ✅ ${exp} - is a function`);
    } else {
      console.log(`  ❌ ${exp} - is ${type}, not a function!`);
    }
  }
});

// Перевірка 3: Privacy Guard
console.log('\n📋 Check 3: Privacy Guard Module');
const privacyExports = Object.keys(privacyGuard);
console.log('Privacy Guard exports:', privacyExports);

const expectedPrivacyExports = [
  'initializePrivacyProtection',
  'enablePrivacyMode',
  'disablePrivacyMode',
  'isPrivacyModeEnabled',
  'checkPrivacyLeaks',
  'injectPrivacyScriptToAllTabs'
];

expectedPrivacyExports.forEach(exp => {
  if (privacyExports.includes(exp)) {
    console.log(`  ✅ ${exp} - exported`);
  } else {
    console.log(`  ⚠️ ${exp} - not found`);
  }
});

// Перевірка 4: Tor Binary
console.log('\n📋 Check 4: Tor Binary');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const torBinary = isWindows ? 'tor.exe' : 'tor';
const torPath = path.join(__dirname, 'bin', 'tor', torBinary);

if (fs.existsSync(torPath)) {
  console.log(`  ✅ Tor binary found: ${torPath}`);
  
  const stats = fs.statSync(torPath);
  console.log(`  ℹ️ Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ℹ️ Modified: ${stats.mtime.toISOString()}`);
  
  // Перевіряємо права на виконання (Unix)
  if (!isWindows) {
    const mode = stats.mode;
    const isExecutable = !!(mode & parseInt('111', 8));
    if (isExecutable) {
      console.log('  ✅ Binary is executable');
    } else {
      console.log('  ⚠️ Binary is NOT executable! Run: chmod +x bin/tor/tor');
    }
  }
} else {
  console.log(`  ❌ Tor binary NOT FOUND: ${torPath}`);
  console.log('  💡 Download from: https://www.torproject.org/download/tor/');
}

// Перевірка 5: Tor Data Files
console.log('\n📋 Check 5: Tor Data Files');
const dataFiles = ['geoip', 'geoip6', 'torrc-defaults'];

dataFiles.forEach(file => {
  const filePath = path.join(__dirname, 'bin', 'data', file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`  ✅ ${file} - ${(stats.size / 1024).toFixed(2)} KB`);
  } else {
    console.log(`  ⚠️ ${file} - NOT FOUND`);
  }
});

// Перевірка 6: Tor Data Directory
console.log('\n📋 Check 6: Tor Data Directory');
const torDataDir = path.join(__dirname, 'bin', 'tor', 'data');

if (fs.existsSync(torDataDir)) {
  console.log(`  ✅ Data directory exists: ${torDataDir}`);
  
  const files = fs.readdirSync(torDataDir);
  console.log(`  ℹ️ Files: ${files.length}`);
  
  if (files.length > 0) {
    console.log('  ℹ️ Contents:');
    files.slice(0, 10).forEach(file => {
      const filePath = path.join(torDataDir, file);
      const stats = fs.statSync(filePath);
      const type = stats.isDirectory() ? '[DIR]' : '[FILE]';
      console.log(`    - ${type} ${file}`);
    });
    
    if (files.length > 10) {
      console.log(`    ... and ${files.length - 10} more`);
    }
  }
} else {
  console.log('  ℹ️ Data directory will be created on first run');
}

// Перевірка 7: Pluggable Transports (Bridges)
console.log('\n📋 Check 7: Pluggable Transports');
const ptDir = path.join(__dirname, 'bin', 'tor', 'pluggable_transports');

if (fs.existsSync(ptDir)) {
  console.log(`  ✅ PT directory exists`);
  
  const ptBinaries = isWindows 
    ? ['lyrebird.exe', 'conjure-client.exe']
    : ['lyrebird', 'conjure-client'];
  
  ptBinaries.forEach(binary => {
    const binaryPath = path.join(ptDir, binary);
    if (fs.existsSync(binaryPath)) {
      console.log(`  ✅ ${binary} - found`);
    } else {
      console.log(`  ⚠️ ${binary} - not found`);
    }
  });
  
  const ptConfig = path.join(ptDir, 'pt_config.json');
  if (fs.existsSync(ptConfig)) {
    console.log('  ✅ pt_config.json - found');
    try {
      const config = JSON.parse(fs.readFileSync(ptConfig, 'utf8'));
      const bridgeTypes = Object.keys(config.bridges || {});
      console.log(`  ℹ️ Bridge types: ${bridgeTypes.join(', ')}`);
    } catch (err) {
      console.log('  ⚠️ pt_config.json - invalid JSON');
    }
  } else {
    console.log('  ⚠️ pt_config.json - not found');
  }
} else {
  console.log('  ⚠️ PT directory not found');
}

// Перевірка 8: Network Ports
console.log('\n📋 Check 8: Network Ports');
const net = require('net');

function checkPort(port, name) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`  ⚠️ Port ${port} (${name}) - IN USE`);
        resolve(false);
      } else {
        console.log(`  ✅ Port ${port} (${name}) - available`);
        resolve(true);
      }
    });
    
    server.once('listening', () => {
      server.close();
      console.log(`  ✅ Port ${port} (${name}) - available`);
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

(async () => {
  await checkPort(9050, 'SOCKS');
  await checkPort(9051, 'Control');
  
  // Підсумок
  console.log('\n=== 📊 DIAGNOSTIC SUMMARY ===\n');
  
  const issues = [];
  
  if (!fs.existsSync(torPath)) {
    issues.push('❌ Tor binary not found');
  }
  
  if (!actualExports.includes('startTor')) {
    issues.push('❌ startTor function not exported');
  }
  
  if (issues.length === 0) {
    console.log('✅ ALL CHECKS PASSED!');
    console.log('💡 Tor module is ready to use\n');
  } else {
    console.log('⚠️ ISSUES FOUND:');
    issues.forEach(issue => console.log(`  ${issue}`));
    console.log('\n💡 Fix these issues before running Tor\n');
  }
  
  console.log('=== END OF DIAGNOSTICS ===\n');
})();
