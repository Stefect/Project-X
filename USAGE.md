# BrowserX Usage Examples

This document provides detailed examples of how to use all BrowserX features and APIs.

## Table of Contents

1. [Basic Browser Features](#basic-browser-features)
2. [AI Features](#ai-features)
3. [Privacy & Security](#privacy--security)
4. [Tab Management](#tab-management)
5. [Module Development](#module-development)
6. [Custom Integrations](#custom-integrations)

---

## Basic Browser Features

### Navigation

```javascript
// Navigate to URL
ipcRenderer.send('navigate', 'https://example.com');

// Go back
ipcRenderer.send('go-back');

// Go forward
ipcRenderer.send('go-forward');

// Reload page
ipcRenderer.send('reload');
```

### History Management

```javascript
const storage = require('./modules/storage');

// Add page to history
storage.addToHistory('https://example.com', 'Example Domain');

// Get all history
const history = storage.getHistory();
console.log(history);
// Output: [{ url: 'https://example.com', title: 'Example Domain', timestamp: 1234567890 }]

// Search history
const results = history.filter(item => 
  item.title.toLowerCase().includes('example')
);

// Clear history
storage.clearHistory();
```

### Bookmarks

```javascript
const storage = require('./modules/storage');

// Add bookmark
storage.addBookmark('https://github.com', 'GitHub');

// Get all bookmarks
const bookmarks = storage.getBookmarks();
console.log(bookmarks);
// Output: [{ url: 'https://github.com', title: 'GitHub', addedAt: 1234567890 }]

// Check if URL is bookmarked
const isBookmarked = bookmarks.some(b => b.url === 'https://github.com');

// Remove bookmark
storage.deleteBookmark('https://github.com');
```

### Session Management

```javascript
const storage = require('./modules/storage');

// Save current session
const currentTabs = [
  { url: 'https://example.com', title: 'Example' },
  { url: 'https://github.com', title: 'GitHub' }
];
storage.saveSession('work-session', currentTabs);

// Get all sessions
const sessions = storage.getSessions();

// Load session
const loadedSession = storage.loadSession('work-session');
loadedSession.tabs.forEach(tab => {
  ipcRenderer.invoke('create-tab', tab.url);
});

// Delete session
storage.deleteSession('work-session');
```

---

## AI Features

### AI Content Feed

```javascript
const { infiniteArticleGenerator } = require('./modules/ai-feed');

// Fetch articles by category
const techArticles = await infiniteArticleGenerator.fetchArticles('tech');
console.log(techArticles);
// Output: [{ title: '...', description: '...', link: '...', source: '...', timestamp: ... }]

// Available categories
const categories = ['all', 'tech', 'science', 'news', 'gaming', 'ai', 'crypto', 'business'];

// Fetch from all sources
const allNews = await infiniteArticleGenerator.fetchArticles('all');

// Add custom news source
localStorage.setItem('customNewsSources', JSON.stringify([
  {
    name: 'My Blog',
    url: 'https://myblog.com/rss',
    type: 'rss',
    categories: ['tech', 'all']
  }
]));
```

### T9 Autocomplete Integration

The T9 autocomplete is automatically injected into all web pages. To use it programmatically:

```javascript
// The module is injected via code-injector.js
// Users simply type in any input field and suggestions appear

// Configuration is set in unified-t9.js
const CONFIG = {
  minCharsForLocal: 2,    // Min chars for local suggestions
  minCharsForAI: 5,       // Min chars for AI suggestions
  debounceDelay: 400,     // Delay before request (ms)
  maxSuggestions: 5,      // Max number of suggestions
  aiTimeout: 3000,        // AI request timeout (ms)
};
```

### Link X-Ray

```javascript
// Link X-Ray is automatically active on all pages
// To use: hover over any link for 1 second

// Custom implementation example:
const url = 'https://example.com';
console.log('XRAY_REQUEST:' + url);

// The main process will handle the request and return AI analysis
// Result is displayed in a tooltip automatically
```

### Translation

```javascript
// Translate text
const translatedText = await ipcRenderer.invoke('translate-text', 
  'Hello world', 
  'uk' // target language: 'uk', 'ru', 'en', 'es', 'fr', 'de'
);

console.log(translatedText); // Output: "Привіт світ"

// Change translation language
ipcRenderer.send('change-translation-language', 'es');
```

---

## Privacy & Security

### Tor Integration

```javascript
// Check Tor status (in renderer process)
const torButton = document.querySelector('#tor-toggle');

// Enable Tor programmatically (handled in main.js)
// User clicks button → Tor process starts → Proxy configured

// Verify Tor connection
fetch('https://check.torproject.org/api/ip')
  .then(r => r.json())
  .then(data => {
    console.log('Using Tor:', data.IsTor);
  });
```

### Tracker Blocking

```javascript
// Get reactive events (blocked trackers)
const events = await ipcRenderer.invoke('get-reactive-events');

events.forEach(event => {
  console.log(`${event.type}: ${event.label}`);
  // Example output:
  // blocked: doubleclick.net
  // blocked: google-analytics.com
});

// Events are emitted in real-time via 'reactive-event' channel
ipcRenderer.on('reactive-event', (event, data) => {
  console.log('New event:', data);
});
```

### WebRTC Protection

```javascript
// WebRTC can leak real IP even with VPN/Tor
// Disable in settings or programmatically:

session.defaultSession.webRequest.onBeforeRequest(
  { urls: ['*://*.webrtc.*'] },
  (details, callback) => {
    callback({ cancel: true });
  }
);
```

---

## Tab Management

### Creating and Managing Tabs

```javascript
// Create new tab
const tabId = await ipcRenderer.invoke('create-tab', 'https://example.com');
console.log('Created tab:', tabId);

// Create empty tab
const emptyTab = await ipcRenderer.invoke('create-tab');

// Switch to tab
ipcRenderer.send('switch-tab', tabId);

// Close tab
ipcRenderer.send('close-tab', tabId);

// Get all tabs (from main process context)
console.log(tabs); // Array of tab objects
```

### Tab Reordering

```javascript
// Drag and drop is built-in
// Programmatic reordering:

const newOrder = [3, 1, 2, 4]; // New order of tab IDs
ipcRenderer.send('reorder-tabs', newOrder);
```

### AI Tab Organization

```javascript
// Automatically organize tabs by similarity
await ipcRenderer.invoke('organize-tabs');

// This uses AI to analyze tab content and group similar tabs together
```

---

## Module Development

### Creating a Custom Module

#### Example: Weather Module

Create `src/modules/weather.js`:

```javascript
// weather.js - Show weather widget on web pages

(function() {
  'use strict';

  if (window._weatherEnabled) return;
  window._weatherEnabled = true;

  console.log('[Weather] Module loaded');

  // Create weather widget
  const widget = document.createElement('div');
  widget.id = 'weather-widget';
  widget.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    background: rgba(255, 255, 255, 0.95);
    padding: 15px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    z-index: 999999;
    font-family: sans-serif;
    font-size: 14px;
    min-width: 200px;
  `;
  
  document.body.appendChild(widget);

  // Fetch weather data
  async function fetchWeather(city = 'Kyiv') {
    try {
      const response = await fetch(`https://wttr.in/${city}?format=j1`);
      const data = await response.json();
      
      const current = data.current_condition[0];
      widget.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">${city}</div>
        <div>${current.temp_C}°C - ${current.weatherDesc[0].value}</div>
        <div style="font-size: 12px; color: #666; margin-top: 5px;">
          Humidity: ${current.humidity}%
        </div>
      `;
    } catch (error) {
      widget.innerHTML = '<div>Weather unavailable</div>';
    }
  }

  // Initialize
  fetchWeather();

  // Update every 30 minutes
  setInterval(() => fetchWeather(), 30 * 60 * 1000);

  // Allow user to change city
  widget.addEventListener('click', () => {
    const city = prompt('Enter city name:', 'Kyiv');
    if (city) fetchWeather(city);
  });

})();
```

#### Inject the Module

In `src/main.js`:

```javascript
const weatherModule = fs.readFileSync(
  path.join(__dirname, 'modules', 'weather.js'),
  'utf-8'
);

view.webContents.executeJavaScript(weatherModule);
```

### Module Best Practices

1. **Wrap in IIFE** - Avoid global scope pollution
2. **Check for duplicates** - Use flag like `window._moduleEnabled`
3. **Clean up** - Remove elements when unloading
4. **Error handling** - Always wrap async code in try-catch
5. **Performance** - Debounce expensive operations

---

## Custom Integrations

### Adding Custom Keyboard Shortcuts

In `src/main.js`:

```javascript
// Register global shortcut
const { globalShortcut } = require('electron');

app.whenReady().then(() => {
  // Example: Ctrl+Shift+N for incognito tab
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    createTab(null, { incognito: true });
  });
});
```

### Custom Context Menu

```javascript
// Add custom menu item
view.webContents.on('context-menu', (e, params) => {
  const menu = new Menu();
  
  // Add custom action
  menu.append(new MenuItem({
    label: 'Analyze with AI',
    click: () => {
      const selectedText = params.selectionText;
      analyzeTextWithAI(selectedText);
    }
  }));
  
  menu.popup();
});
```

### Custom CSS Injection

```javascript
// Inject custom styles into web pages
const customCSS = `
  body {
    font-family: 'Your Custom Font' !important;
  }
  
  img {
    border-radius: 10px;
  }
`;

view.webContents.insertCSS(customCSS);
```

### Creating Custom Themes

Edit theme in settings or create programmatically:

```javascript
const customTheme = {
  name: 'Ocean Blue',
  primaryColor: '#0077be',
  backgroundColor: '#001f3f',
  textColor: '#ffffff',
  accentColor: '#00a8ff'
};

ipcRenderer.send('apply-theme', customTheme);
```

### External API Integration Example

```javascript
// Example: Integrate with Notion API
async function saveToNotion(url, title) {
  const NOTION_TOKEN = 'your_notion_token';
  const DATABASE_ID = 'your_database_id';
  
  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { database_id: DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: title } }] },
        URL: { url: url }
      }
    })
  });
  
  return response.json();
}

// Add button to save current page to Notion
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 's') {
    saveToNotion(window.location.href, document.title);
  }
});
```

---

## Advanced Examples

### Building a Custom Feed Parser

```javascript
// Example: Parse custom JSON feed
async function parseCustomFeed(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    return data.articles.map(article => ({
      title: article.headline,
      description: article.summary,
      link: article.url,
      source: 'Custom Source',
      timestamp: new Date(article.published).getTime()
    }));
  } catch (error) {
    console.error('Feed parsing failed:', error);
    return [];
  }
}

// Usage
const articles = await parseCustomFeed('https://api.example.com/feed');
```

### Creating Smart Browser Automation

```javascript
// Example: Auto-login script
function autoLogin(username, password) {
  const usernameField = document.querySelector('input[type="text"], input[type="email"]');
  const passwordField = document.querySelector('input[type="password"]');
  const submitButton = document.querySelector('button[type="submit"]');
  
  if (usernameField && passwordField && submitButton) {
    usernameField.value = username;
    passwordField.value = password;
    
    // Trigger change events
    usernameField.dispatchEvent(new Event('input', { bubbles: true }));
    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Submit
    setTimeout(() => submitButton.click(), 500);
  }
}

// Run automation
autoLogin('user@example.com', 'password123');
```

### Custom Link Analysis

```javascript
// Example: Extract all links and analyze with AI
async function analyzePageLinks() {
  const links = Array.from(document.querySelectorAll('a'))
    .map(a => ({ url: a.href, text: a.textContent.trim() }))
    .filter(link => link.url.startsWith('http'));
  
  console.log(`Found ${links.length} links`);
  
  // Analyze with X-Ray
  for (const link of links.slice(0, 5)) { // First 5 only
    console.log('XRAY_REQUEST:' + link.url);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Run analysis
analyzePageLinks();
```

### Smart Form Filling with T9

```javascript
// T9 autocomplete is automatic, but here's how to trigger suggestions manually:

// Focus on input field
const input = document.querySelector('input[type="text"]');
input.focus();

// Type programmatically (triggers T9)
input.value = 'Hello ';
input.dispatchEvent(new Event('input', { bubbles: true }));

// Suggestions appear automatically if T9 is enabled
```

---

## Reactive Events Dashboard

### Listening to Real-time Events

```javascript
// In renderer process
ipcRenderer.on('reactive-event', (event, data) => {
  console.log('Event received:', data);
  
  /*
  Event structure:
  {
    id: 'unique-id',
    time: 1234567890,
    type: 'blocked' | 'request' | 'navigation',
    label: 'tracker-url.com',
    details: 'Additional info'
  }
  */
  
  // Update UI with event
  updateDashboard(data);
});

// Fetch all buffered events
const allEvents = await ipcRenderer.invoke('get-reactive-events');
console.log(`Total events: ${allEvents.length}`);
```

### Custom Event Filtering

```javascript
// Filter events by type
const blockedTrackers = allEvents.filter(e => e.type === 'blocked');
const requests = allEvents.filter(e => e.type === 'request');

// Group by domain
const groupedByDomain = blockedTrackers.reduce((acc, event) => {
  const domain = event.label;
  acc[domain] = (acc[domain] || 0) + 1;
  return acc;
}, {});

console.log('Top blocked domains:', groupedByDomain);
// Output: { 'doubleclick.net': 15, 'google-analytics.com': 8 }
```

---

## Tor Usage Examples

### Starting Tor Programmatically

```javascript
// Tor is started automatically when button is clicked
// In main process context:

const torProcess = spawn(torPath, ['-f', torConfigFile]);

torProcess.stdout.on('data', (data) => {
  if (data.toString().includes('Bootstrapped 100%')) {
    console.log('Tor connected successfully');
    // Configure proxy
    session.defaultSession.setProxy({
      proxyRules: 'socks5://127.0.0.1:9050'
    });
  }
});
```

### Checking Tor Connection

```javascript
// Verify you're using Tor
async function checkTorConnection() {
  try {
    const response = await fetch('https://check.torproject.org/api/ip');
    const data = await response.json();
    
    if (data.IsTor) {
      console.log('✓ Connected via Tor');
      console.log('Exit IP:', data.IP);
    } else {
      console.log('✗ Not using Tor');
    }
  } catch (error) {
    console.error('Connection check failed:', error);
  }
}

checkTorConnection();
```

---

## Theme Customization Examples

### Applying Built-in Themes

```javascript
// Available themes
const themes = {
  light: {
    background: '#ffffff',
    text: '#000000',
    primary: '#0066cc'
  },
  dark: {
    background: '#1a1a1a',
    text: '#ffffff',
    primary: '#3399ff'
  },
  ocean: {
    background: '#001f3f',
    text: '#ffffff',
    primary: '#0077be'
  }
};

// Apply theme
ipcRenderer.send('apply-theme', themes.ocean);
```

### Creating Dynamic Themes

```javascript
// Generate theme based on time of day
function getTimeBasedTheme() {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 12) {
    // Morning - warm colors
    return {
      background: '#fff8dc',
      text: '#333333',
      primary: '#ff8c00'
    };
  } else if (hour >= 12 && hour < 18) {
    // Afternoon - bright colors
    return {
      background: '#f0f8ff',
      text: '#000000',
      primary: '#4169e1'
    };
  } else if (hour >= 18 && hour < 22) {
    // Evening - cool colors
    return {
      background: '#2c2c54',
      text: '#ffffff',
      primary: '#5f27cd'
    };
  } else {
    // Night - dark colors
    return {
      background: '#000000',
      text: '#ffffff',
      primary: '#1e90ff'
    };
  }
}

// Apply time-based theme
ipcRenderer.send('apply-theme', getTimeBasedTheme());

// Update every hour
setInterval(() => {
  ipcRenderer.send('apply-theme', getTimeBasedTheme());
}, 60 * 60 * 1000);
```

---

## Window Management Examples

### Creating Multiple Windows

```javascript
// In main process
const { BrowserWindow } = require('electron');

function createSecondaryWindow(url) {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  win.loadURL(url);
  return win;
}

// Usage
const popupWindow = createSecondaryWindow('https://example.com');
```

### Window Control from Renderer

```javascript
// Minimize
ipcRenderer.send('window-minimize');

// Maximize/Restore
ipcRenderer.send('window-maximize');

// Close
ipcRenderer.send('window-close');
```

---

## Performance Optimization Examples

### Debounced Search

```javascript
// Implement efficient search with debouncing
let debounceTimer;

function debouncedSearch(query) {
  clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(async () => {
    const results = await searchHistory(query);
    displayResults(results);
  }, 300);
}

// Usage
searchInput.addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
});
```

### Lazy Loading History

```javascript
// Load history in chunks for better performance
function* lazyLoadHistory(chunkSize = 50) {
  const fullHistory = storage.getHistory();
  
  for (let i = 0; i < fullHistory.length; i += chunkSize) {
    yield fullHistory.slice(i, i + chunkSize);
  }
}

// Usage
const historyLoader = lazyLoadHistory();

function loadMoreHistory() {
  const { value, done } = historyLoader.next();
  if (!done) {
    appendHistoryToUI(value);
  }
}

// Load on scroll
window.addEventListener('scroll', () => {
  if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 100) {
    loadMoreHistory();
  }
});
```

---

## Testing Examples

### Testing Module Loading

```javascript
// Test if module is properly loaded
function testModuleLoading() {
  const tests = [
    { name: 'T9 Autocomplete', flag: window._t9AutocompleteEnabled },
    { name: 'Link X-Ray', flag: window._linkXRayEnabled },
    { name: 'AI Feed', flag: window._aiFeedEnabled }
  ];
  
  tests.forEach(test => {
    console.log(`${test.name}: ${test.flag ? '✓' : '✗'}`);
  });
}

testModuleLoading();
```

### Testing Storage

```javascript
// Test storage functionality
function testStorage() {
  const storage = require('./modules/storage');
  
  // Test history
  storage.addToHistory('https://test.com', 'Test Page');
  const history = storage.getHistory();
  console.assert(history.length > 0, 'History should not be empty');
  
  // Test bookmarks
  storage.addBookmark('https://bookmark.com', 'Bookmark');
  const bookmarks = storage.getBookmarks();
  console.assert(bookmarks.some(b => b.url === 'https://bookmark.com'), 'Bookmark should exist');
  
  // Cleanup
  storage.clearHistory();
  console.log('Storage tests passed ✓');
}

testStorage();
```

---

## Complete Integration Example

### Building a Read Later Feature

```javascript
// 1. Create module: src/modules/read-later.js

(function() {
  'use strict';

  if (window._readLaterEnabled) return;
  window._readLaterEnabled = true;

  // Create "Read Later" button
  const button = document.createElement('button');
  button.textContent = '📖 Read Later';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: #5a67d8;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    transition: transform 0.2s;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
  });
  
  button.addEventListener('click', async () => {
    const url = window.location.href;
    const title = document.title;
    
    // Save to localStorage
    const readLater = JSON.parse(localStorage.getItem('readLater') || '[]');
    readLater.push({ url, title, savedAt: Date.now() });
    localStorage.setItem('readLater', JSON.stringify(readLater));
    
    // Show confirmation
    button.textContent = '✓ Saved!';
    button.style.background = '#48bb78';
    
    setTimeout(() => {
      button.textContent = '📖 Read Later';
      button.style.background = '#5a67d8';
    }, 2000);
  });
  
  document.body.appendChild(button);

})();

// 2. Inject module in main.js
const readLaterModule = fs.readFileSync(
  path.join(__dirname, 'modules', 'read-later.js'),
  'utf-8'
);

view.webContents.executeJavaScript(readLaterModule);

// 3. Create UI to view saved articles (in settings.html)
function loadReadLater() {
  const items = JSON.parse(localStorage.getItem('readLater') || '[]');
  const container = document.querySelector('#read-later-list');
  
  container.innerHTML = items.map(item => `
    <div class="read-later-item">
      <a href="${item.url}" target="_blank">${item.title}</a>
      <span>${new Date(item.savedAt).toLocaleDateString()}</span>
      <button onclick="deleteReadLater('${item.url}')">Delete</button>
    </div>
  `).join('');
}

function deleteReadLater(url) {
  let items = JSON.parse(localStorage.getItem('readLater') || '[]');
  items = items.filter(item => item.url !== url);
  localStorage.setItem('readLater', JSON.stringify(items));
  loadReadLater();
}
```

---

## Debugging Tips

### Enable Verbose Logging

```javascript
// In main.js, add at the top
process.env.DEBUG = 'browserx:*';

// Then use throughout code
console.log('[DEBUG]', 'Tab created:', tabId);
console.log('[INFO]', 'Tor connected');
console.error('[ERROR]', 'Failed to fetch:', error);
```

### Inspect Injected Scripts

```javascript
// Check loaded modules in DevTools console
console.log({
  t9: window._t9AutocompleteEnabled,
  xray: window._linkXRayEnabled,
  feed: window._aiFeedEnabled
});

// View all global listeners
console.log(getEventListeners(document));
```

### Memory Profiling

```javascript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log(`Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
}, 5000);
```

---

## Quick Reference

### Essential Commands

```bash
# Development
npm start                 # Start application
npm run dev              # Start with CSS watch mode

# Building
npm run build:css        # Build Tailwind CSS
npm run build           # Build Windows installer
npm run build:portable  # Build portable version

# Testing
npm test                # Run tests (if configured)
```

### Important IPC Channels

| Channel | Type | Description |
|---------|------|-------------|
| `create-tab` | invoke | Create new tab |
| `close-tab` | send | Close tab by ID |
| `navigate` | send | Navigate to URL |
| `translate-text` | invoke | Translate text with AI |
| `organize-tabs` | invoke | AI tab organization |
| `get-reactive-events` | invoke | Get event buffer |
| `apply-theme` | send | Apply custom theme |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+L` | Focus address bar |
| `Ctrl+R` | Reload page |
| `F5` | Reload page |
| `F12` | Open DevTools |
| `Ctrl+H` | Open history |
| `Ctrl+D` | Add bookmark |

---

## More Examples

For more examples and code samples, visit:
- [GitHub Repository](https://github.com/Stefect/Project-X)
- [Examples Directory](./examples/)
- [API Documentation](./docs/API.md)

## Support

If you need help or have questions:
- Open an issue: https://github.com/Stefect/Project-X/issues
- Check documentation: https://github.com/Stefect/Project-X/wiki

---

**Happy Browsing! 🚀**
