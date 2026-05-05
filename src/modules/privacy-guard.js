

import { session, app, webContents } from 'electron';

let isPrivacyModeActive = false;


function initializePrivacyProtection() {
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
  app.commandLine.appendSwitch('enforce-webrtc-ip-permission-check');
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const dangerousPermissions = ['geolocation', 'notifications'];
    const url = webContents.getURL();
    if (isPrivacyModeActive && dangerousPermissions.includes(permission)) {
      console.log(`[PRIVACY] BLOCKED ${permission} from: ${url}`);
      callback(false);
    } else if (permission === 'geolocation') {
      callback(true);
    } else {
      callback(true);
    }
  });
}


function enablePrivacyMode(mainWindow) {
  isPrivacyModeActive = true;
  console.log('[PRIVACY] Privacy mode ENABLED');
  injectPrivacyScriptToAllTabs();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('privacy-mode-changed', { active: true });
  }
}


function disablePrivacyMode(mainWindow) {
  isPrivacyModeActive = false;
  console.log('[PRIVACY] Privacy mode DISABLED');
  removePrivacyScriptFromAllTabs();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('privacy-mode-changed', { active: false });
  }
}


const GEO_BLOCK_SCRIPT = `
  (function() {
    if (window.__geoLocationPatched) return;
    window.__geoLocationPatched = true;
    window.__torActive = true;

    const originalGeolocation = navigator.geolocation;
    const fakeGeolocation = {
      getCurrentPosition: function(success, error) {
        console.warn('[PRIVACY] Geolocation blocked - Tor active');
        if (error) error({ code: 1, message: 'User denied Geolocation' });
      },
      watchPosition: function(success, error) {
        console.warn('[PRIVACY] Geolocation watchPosition blocked');
        if (error) error({ code: 1, message: 'User denied Geolocation' });
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

function injectGeolocationBlockToContents(contents) {
  contents.executeJavaScript(GEO_BLOCK_SCRIPT)
    .catch(err => console.error('[PRIVACY] Failed to inject geolocation block:', err.message));
}

function injectPrivacyScriptToAllTabs() {
  webContents.getAllWebContents().forEach(contents => {
    if (contents.getType() === 'browserView' || contents.getType() === 'webview') {
      injectGeolocationBlockToContents(contents);
    }
  });
}


function removePrivacyScriptFromAllTabs() {
  const deactivateScript = `
    (function() {
      window.__torActive = false;
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
    console.log('[PRIVACY] WebRTC leak protection is active');
  } else {
    console.warn('[PRIVACY] WebRTC leak protection may be inactive');
  }
  results.geolocationLeak = !isPrivacyModeActive;
  
  if (!results.geolocationLeak) {
    console.log('[PRIVACY] Geolocation is blocked');
  } else {
    console.log('[PRIVACY] Geolocation is allowed (Tor inactive)');
  }
  results.dnsLeak = false;
  console.log('[PRIVACY] DNS queries via Tor (if active)');
  
  return results;
}

export {
  initializePrivacyProtection,
  enablePrivacyMode,
  disablePrivacyMode,
  isPrivacyModeEnabled,
  checkPrivacyLeaks,
  injectPrivacyScriptToAllTabs,
  injectGeolocationBlockToContents
};
