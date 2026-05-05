

import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_TAB_TITLE = 'New tab';
const SEARCH_ENGINES = {
  tor: 'https://duckduckgo.com/?q=',
  regular: 'https://www.google.com/search?q='
};
let tabs = [];
let activeTabId = 1;
let nextTabId = 2;
let mainWindowRef = null;

function getTabById(tabId) {
  return tabs.find(tab => tab.id === tabId);
}

function getActiveTabSafe() {
  return getTabById(activeTabId);
}

function sendToRenderer(channel, payload) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return false;
  mainWindowRef.webContents.send(channel, payload);
  return true;
}

function isLikelyAddress(value) {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^localhost([:/]|$)/i.test(value)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}([:/?#]|$)/.test(value)) return true;
  return value.includes('.') && !value.includes(' ');
}

function resolveNavigationTarget(rawInput, isTorActive) {
  const input = String(rawInput || '').trim();

  if (isLikelyAddress(input)) {
    if (/^https?:\/\//i.test(input)) return input;
    return `https://${input}`;
  }

  const searchBase = isTorActive ? SEARCH_ENGINES.tor : SEARCH_ENGINES.regular;
  return `${searchBase}${encodeURIComponent(input)}`;
}

function isRestorableUrl(url) {
  return Boolean(
    url
      && url !== 'about:blank'
      && !url.startsWith('file://')
      && !url.startsWith('app://')
  );
}

function buildTabState(id, url, title = null) {
  return {
    id,
    url,
    title: title || (url ? 'Loading...' : DEFAULT_TAB_TITLE),
    navigationHistory: [],
    currentIndex: 0
  };
}


function init(mainWindow) {
  mainWindowRef = mainWindow;
  console.log('[TAB] Webview tab manager initialized');
}


function createWebviewElement(tabId, url) {
  const isActive = tabId === activeTabId;
  const hasUrl = url && url !== 'about:blank';
  const displayStyle = (isActive && hasUrl) ? 'flex' : 'none';
  const srcValue = hasUrl ? url : 'data:text/html,';

  return `
    <webview
      id="webview-${tabId}"
      src="${srcValue}"
      preload="${pathToFileURL(path.join(__dirname, '..', 'preload.cjs')).href}"
      partition="persist:main"
      class="${isActive ? 'active' : ''}"
      webpreferences="contextIsolation=yes, nodeIntegration=no"
      style="display: ${displayStyle}; border: none; background: transparent;"
    ></webview>
  `;
}


function initFirstTab(browserView, startUrl) {
  tabs = [buildTabState(1, startUrl, DEFAULT_TAB_TITLE)];
  activeTabId = 1;
  nextTabId = 2;
  const webviewHTML = createWebviewElement(1, startUrl);
  sendToRenderer('create-webview', { tabId: 1, html: webviewHTML, url: startUrl });
  
  console.log('[TAB] First tab initialized');
}


function createTab(mainWindow, url = null, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const targetUrl = url || null;

  const newTab = buildTabState(nextTabId, targetUrl);
  
  tabs.push(newTab);
  activeTabId = newTab.id;
  const webviewHTML = createWebviewElement(newTab.id, targetUrl);
  mainWindow.webContents.send('create-webview', { 
    tabId: newTab.id,
    html: webviewHTML,
    url: targetUrl
  });
  mainWindow.webContents.send('switch-webview', { tabId: newTab.id });
  
  console.log('[TAB] Created tab:', newTab.id);
  
  nextTabId++;
  return { id: newTab.id, url: targetUrl, title: newTab.title };
}



function switchTab(tabId, mainWindow, sidebarWidth) {
  const tab = getTabById(tabId);
  if (!tab) {
    console.error('[TAB] Tab not found:', tabId);
    return false;
  }
  
  activeTabId = tabId;
  mainWindow.webContents.send('switch-webview', { tabId });
  mainWindow.webContents.send('tab-activated', tabId);
  mainWindow.webContents.send('update-url-bar', tab.url || '');
  
  console.log('[TAB] Switched to tab:', tabId);
  return true;
}


function closeTab(tabId, mainWindow) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  
  if (tabIndex === -1) {
    console.warn('[TAB] Tried to close unknown tab:', tabId);
    return false;
  }
  if (tabs.length <= 1) {
    console.log('[TAB] Last tab closed, app can quit');
    return true;
  }

  let fallbackTabId = null;
  if (activeTabId === tabId) {
    const newActiveTab = tabs[tabIndex + 1] || tabs[tabIndex - 1];
    if (newActiveTab) {
      fallbackTabId = newActiveTab.id;
    }
  }
  mainWindow.webContents.send('remove-webview', { tabId });
  tabs.splice(tabIndex, 1);

  if (fallbackTabId) {
    switchTab(fallbackTabId, mainWindow, 0);
  }
  
  console.log(`[TAB] Closed tab ${tabId}. Remaining: ${tabs.length}`);
  return false;
}


function reorderTabs(newOrder) {
  try {
    const byId = new Map(tabs.map(tab => [tab.id, tab]));
    const reorderedTabs = [];

    newOrder.forEach((tabId) => {
      const tab = byId.get(tabId);
      if (tab) {
        reorderedTabs.push(tab);
        byId.delete(tabId);
      }
    });
    byId.forEach(tab => reorderedTabs.push(tab));

    tabs = reorderedTabs;
    console.log('[TAB] Tabs reordered');
    return true;
  } catch (error) {
    console.error('[TAB] Reorder error:', error);
    return false;
  }
}


function navigate(input, isTorActive) {
  const activeTab = getActiveTabSafe();
  if (!activeTab) {
    console.error('[TAB] No active tab to navigate');
    return;
  }

  const url = resolveNavigationTarget(input, isTorActive);
  activeTab.url = url;
  activeTab.title = activeTab.title || 'Loading...';

  console.log('[TAB] Navigation:', input, '->', url);
  sendToRenderer('webview-navigate', { tabId: activeTabId, url });
  sendToRenderer('update-url-bar', url);
}


function goBack() {
  const activeTab = getActiveTabSafe();
  if (!activeTab) return;
  sendToRenderer('webview-go-back', { tabId: activeTabId });
}


function goForward() {
  const activeTab = getActiveTabSafe();
  if (!activeTab) return;
  sendToRenderer('webview-go-forward', { tabId: activeTabId });
}


function reload() {
  const activeTab = getActiveTabSafe();
  if (activeTab) {
    sendToRenderer('webview-reload', { tabId: activeTabId });
    console.log('[TAB] Reloaded active tab');
  }
}



function getSessionData() {
  return tabs
    .map(tab => ({
      url: tab.url || '',
      title: tab.title || 'Нова вкладка',
      isActive: tab.id === activeTabId,
      navigationHistory: tab.navigationHistory || [],
      currentIndex: tab.currentIndex || 0
    }))
    .filter(tab => isRestorableUrl(tab.url));
}


function restoreSession(sessionData, mainWindow, { storage, themeManager, injectUnifiedT9, emitReactiveEvent, formatUrlLabel, sidebarWidth }) {
  const sessionTabs = Array.isArray(sessionData?.tabs) ? sessionData.tabs : [];
  const savedActiveIndex = Number.isInteger(sessionData?.activeTabIndex)
    ? sessionData.activeTabIndex
    : 0;

  console.log('[TAB] Restoring session. Saved tabs:', sessionTabs.length);

  tabs = [];
  activeTabId = 1;
  nextTabId = 1;

  const validTabs = sessionTabs.filter(tab => typeof tab?.url === 'string' && tab.url.trim() !== '');

  if (validTabs.length === 0) {
    initFirstTab(null, null);
    return;
  }

  validTabs.forEach((savedTab) => {
    const tabId = nextTabId;
    const tabData = {
      ...buildTabState(tabId, savedTab.url, savedTab.title || 'Loading...'),
      navigationHistory: Array.isArray(savedTab.navigationHistory) ? savedTab.navigationHistory : [],
      currentIndex: Number.isInteger(savedTab.currentIndex) ? savedTab.currentIndex : 0
    };

    tabs.push(tabData);

    const webviewHTML = createWebviewElement(tabId, savedTab.url);
    mainWindow.webContents.send('create-webview', {
      tabId,
      html: webviewHTML,
      url: savedTab.url
    });

    mainWindow.webContents.send('tab-restored', {
      tabId,
      url: savedTab.url,
      title: tabData.title
    });

    nextTabId++;
  });

  const activeIndex = Math.max(0, Math.min(savedActiveIndex, tabs.length - 1));
  activeTabId = tabs[activeIndex].id;

  mainWindow.webContents.send('switch-webview', { tabId: activeTabId });
  mainWindow.webContents.send('tab-activated', activeTabId);
  mainWindow.webContents.send('update-url-bar', tabs[activeIndex].url || '');

  console.log('[TAB] Session restored successfully');
}


function updateTabInfo(tabId, url, title) {
  const tab = getTabById(tabId);
  if (tab) {
    if (url)   tab.url   = url;
    if (title) tab.title = title;
    console.log(`[TAB] Updated tab ${tabId}: url=${url || '-'} title=${title || '-'}`);
  }
}


function getAllTabs() {
  return tabs;
}


function getActiveTab() {
  return getActiveTabSafe();
}


function getActiveTabId() {
  return activeTabId;
}

export {
  init,
  initFirstTab,
  createTab,
  switchTab,
  closeTab,
  reorderTabs,
  navigate,
  goBack,
  goForward,
  reload,
  getSessionData,
  restoreSession,
  updateTabInfo,
  getAllTabs,
  getActiveTab,
  getActiveTabId
};
