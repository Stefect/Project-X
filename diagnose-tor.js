
import fs from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as torManager from './src/modules/tor-manager.js';
import * as privacyGuard from './src/modules/privacy-guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('=== TOR MANAGER MODULE DIAGNOSTICS ===\n');

console.log('Check 1: Module Exports');
const expectedExports = ['startTor', 'toggleTor', 'getTorStatus', 'isTorEnabled', 'stopTor'];
const actualExports = Object.keys(torManager);

console.log('  expected:', expectedExports);
console.log('  actual:  ', actualExports);

expectedExports.forEach(exp => {
  const ok = actualExports.includes(exp);
  console.log(`  [${ok ? 'OK' : 'MISSING'}] ${exp}`);
});
const extraExports = actualExports.filter(e => !expectedExports.includes(e));
if (extraExports.length > 0) {
  console.log('  extra exports:', extraExports);
}

console.log('\nCheck 2: Function Types');
expectedExports.forEach(exp => {
  if (torManager[exp]) {
    const type = typeof torManager[exp];
    const ok = type === 'function';
    console.log(`  [${ok ? 'OK' : 'WARN'}] ${exp} — ${type}`);
  }
});

console.log('\nCheck 3: Privacy Guard Module');
const privacyExports = Object.keys(privacyGuard);
console.log('  exports:', privacyExports);

const expectedPrivacyExports = [
  'initializePrivacyProtection',
  'enablePrivacyMode',
  'disablePrivacyMode',
  'isPrivacyModeEnabled',
  'checkPrivacyLeaks',
  'injectPrivacyScriptToAllTabs'
];

expectedPrivacyExports.forEach(exp => {
  const ok = privacyExports.includes(exp);
  console.log(`  [${ok ? 'OK' : 'WARN'}] ${exp}`);
});

console.log('\nCheck 4: Tor Binary');
const isWindows = process.platform === 'win32';
const torBinary = isWindows ? 'tor.exe' : 'tor';
const torPath = path.join(__dirname, 'bin', 'tor', torBinary);

if (fs.existsSync(torPath)) {
  const stats = fs.statSync(torPath);
  console.log(`  [OK] binary found: ${torPath}`);
  console.log(`       size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`       modified: ${stats.mtime.toISOString()}`);
  if (!isWindows) {
    const isExecutable = !!(stats.mode & parseInt('111', 8));
    console.log(`  [${isExecutable ? 'OK' : 'WARN'}] executable: ${isExecutable}`);
    if (!isExecutable) {
      console.log('       fix: chmod +x bin/tor/tor');
    }
  }
} else {
  console.log(`  [MISSING] ${torPath}`);
  console.log('  download from: https://www.torproject.org/download/tor/');
}

console.log('\nCheck 5: Tor Data Files');
const dataFiles = ['geoip', 'geoip6', 'torrc-defaults'];
dataFiles.forEach(file => {
  const filePath = path.join(__dirname, 'bin', 'data', file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`  [OK] ${file} — ${(stats.size / 1024).toFixed(2)} KB`);
  } else {
    console.log(`  [MISSING] ${file}`);
  }
});

console.log('\nCheck 6: Tor Data Directory');
const torDataDir = path.join(__dirname, 'bin', 'tor', 'data');
if (fs.existsSync(torDataDir)) {
  const files = fs.readdirSync(torDataDir);
  console.log(`  [OK] ${torDataDir} — ${files.length} files`);
  files.slice(0, 10).forEach(file => {
    const filePath = path.join(torDataDir, file);
    const type = fs.statSync(filePath).isDirectory() ? '[DIR]' : '[FILE]';
    console.log(`    ${type} ${file}`);
  });
  if (files.length > 10) {
    console.log(`    ... and ${files.length - 10} more`);
  }
} else {
  console.log('  data directory will be created on first run');
}

console.log('\nCheck 7: Pluggable Transports');
const ptDir = path.join(__dirname, 'bin', 'tor', 'pluggable_transports');
if (fs.existsSync(ptDir)) {
  console.log('  [OK] PT directory found');
  const ptBinaries = isWindows
    ? ['lyrebird.exe', 'conjure-client.exe']
    : ['lyrebird', 'conjure-client'];

  ptBinaries.forEach(binary => {
    const binaryPath = path.join(ptDir, binary);
    console.log(`  [${fs.existsSync(binaryPath) ? 'OK' : 'WARN'}] ${binary}`);
  });

  const ptConfig = path.join(ptDir, 'pt_config.json');
  if (fs.existsSync(ptConfig)) {
    console.log('  [OK] pt_config.json');
    try {
      const config = JSON.parse(fs.readFileSync(ptConfig, 'utf8'));
      console.log('  bridge types:', Object.keys(config.bridges || {}).join(', '));
    } catch {
      console.log('  [WARN] pt_config.json — invalid JSON');
    }
  } else {
    console.log('  [WARN] pt_config.json not found');
  }
} else {
  console.log('  [WARN] PT directory not found');
}

console.log('\nCheck 8: Network Ports');

function checkPort(port, name) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      const label = err.code === 'EADDRINUSE' ? 'IN USE' : 'available';
      console.log(`  [${label === 'available' ? 'OK' : 'WARN'}] port ${port} (${name}) — ${label}`);
      resolve(err.code !== 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close();
      console.log(`  [OK] port ${port} (${name}) — available`);
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

(async () => {
  await checkPort(9050, 'SOCKS');
  await checkPort(9051, 'Control');

  console.log('\n=== DIAGNOSTIC SUMMARY ===\n');

  const issues = [];
  if (!fs.existsSync(torPath)) {
    issues.push('Tor binary not found');
  }
  if (!actualExports.includes('startTor')) {
    issues.push('startTor function not exported');
  }

  if (issues.length === 0) {
    console.log('All checks passed — Tor module is ready.\n');
  } else {
    console.log('Issues found:');
    issues.forEach(issue => console.log(`  - ${issue}`));
    console.log('');
  }

  console.log('=== END OF DIAGNOSTICS ===\n');
})();
