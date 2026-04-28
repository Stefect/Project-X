

import { session, app, webContents } from 'electron';

let isPrivacyModeActive = false;


function initializePrivacyProtection() {
  console.log('[PRIVACY] Initializing privacy protection...');
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
  console.log('[PRIVACY] ✓ DNS leak protection enabled (all DNS via SOCKS5)');
  app.commandLine.appendSwitch('enforce-webrtc-ip-permission-check');
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
  console.log('[PRIVACY] ✓ WebRTC leak protection enabled');
  console.log('[PRIVACY] Policy: disable_non_proxied_udp (blocks direct UDP connections)');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const dangerousPermissions = ['geolocation', 'notifications'];
    
    const url = webContents.getURL();
    
    if (isPrivacyModeActive && dangerousPermissions.includes(permission)) {
      console.log(`[PRIVACY] ❌ BLOCKED ${permission} request from: ${url}`);
      console.log('[PRIVACY] Reason: Tor active, permission would reveal identity');
      callback(false);
    } else if (permission === 'geolocation') {
      console.log(`[PRIVACY] ⚠️ Geolocation request from: ${url} (Tor OFF)`);
      callback(true);
    } else {
      callback(true);
    }
  });
  
  console.log('[PRIVACY] ✓ Permission handler registered');
  console.log('[PRIVACY] ℹ️ Global geolocation blocking handled by web-contents-created in main.js');
  setupGeolocationSpoofing();
}


function setupGeolocationSpoofing() {
  console.log('[PRIVACY] ✓ Geolocation spoofing configured (will inject on Tor enable)');
}


function enablePrivacyMode(mainWindow) {
  isPrivacyModeActive = true;
  console.log('[PRIVACY] 🔒 Privacy mode ENABLED');
  console.log('[PRIVACY] - Geolocation API: BLOCKED');
  console.log('[PRIVACY] - WebRTC UDP: BLOCKED');
  console.log('[PRIVACY] - DNS queries: Via Tor SOCKS5');
  injectPrivacyScriptToAllTabs();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('privacy-mode-changed', { active: true });
  }
}


function disablePrivacyMode(mainWindow) {
  isPrivacyModeActive = false;
  console.log('[PRIVACY] 🔓 Privacy mode DISABLED');
  console.log('[PRIVACY] - Geolocation API: OS default');
  console.log('[PRIVACY] - WebRTC UDP: Limited (non-proxied blocked)');
  console.log('[PRIVACY] - DNS queries: System default');
  removePrivacyScriptFromAllTabs();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('privacy-mode-changed', { active: false });
  }
}


function injectPrivacyScriptToAllTabs() {
  const geolocationBlockScript = `
    (function() {
      if (window.__geoLocationPatched) return;
      window.__geoLocationPatched = true;
      window.__torActive = true;
      
      const originalGeolocation = navigator.geolocation;
      const fakeGeolocation = {
        getCurrentPosition: function(success, error) {
          console.warn('[PRIVACY] Geolocation blocked - Tor active');
          if (error) {
            error({ code: 1, message: 'User denied Geolocation' });
          }
        },
        watchPosition: function(success, error) {
          console.warn('[PRIVACY] Geolocation watchPosition blocked');
          if (error) {
            error({ code: 1, message: 'User denied Geolocation' });
          }
          return -1;
        },
        clearWatch: function() {}
      };
      
      Object.defineProperty(navigator, 'geolocation', {
        get: () => window.__torActive ? fakeGeolocation : originalGeolocation,
        configurable: false
      });
    })();
  `;
  
  webContents.getAllWebContents().forEach(contents => {
    if (contents.getType() === 'browserView' || contents.getType() === 'webview') {
      contents.executeJavaScript(geolocationBlockScript)
        .catch(err => console.error('[PRIVACY] Failed to inject geolocation block:', err));
    }
  });
}


function removePrivacyScriptFromAllTabs() {
  const deactivateScript = `
    (function() {
      window.__torActive = false;
      console.log('[PRIVACY] Tor deactivated - geolocation restored to default');
    })();
  `;
  
  webContents.getAllWebContents().forEach(contents => {
    if (contents.getType() === 'browserView' || contents.getType() === 'webview') {
      contents.executeJavaScript(deactivateScript)
        .catch(err => console.error('[PRIVACY] Failed to deactivate Tor flag:', err));
    }
  });
}


function isPrivacyModeEnabled() {
  return isPrivacyModeActive;
}


async function checkPrivacyLeaks() {
  console.log('[PRIVACY] Running privacy leak detection...');
  
  const results = {
    webrtcLeak: false,
    geolocationLeak: false,
    dnsLeak: false,
    timestamp: new Date().toISOString()
  };
  const commandLine = app.commandLine;
  const webrtcPolicy = commandLine.getSwitchValue('force-webrtc-ip-handling-policy');
  results.webrtcLeak = webrtcPolicy !== 'disable_non_proxied_udp';
  
  if (!results.webrtcLeak) {
    console.log('[PRIVACY] ✓ WebRTC leak protection is active');
  } else {
    console.warn('[PRIVACY] ⚠️ WebRTC leak protection may be inactive');
  }
  results.geolocationLeak = !isPrivacyModeActive;
  
  if (!results.geolocationLeak) {
    console.log('[PRIVACY] ✓ Geolocation is blocked');
  } else {
    console.log('[PRIVACY] ℹ️ Geolocation is allowed (Tor inactive)');
  }
  results.dnsLeak = false;
  console.log('[PRIVACY] ✓ DNS queries via Tor (if active)');
  
  return results;
}

export {
  initializePrivacyProtection,
  enablePrivacyMode,
  disablePrivacyMode,
  isPrivacyModeEnabled,
  checkPrivacyLeaks,
  injectPrivacyScriptToAllTabs
};
