# Browser Automation Scripts

Examples of automating common browsing tasks in BrowserX.

## Examples Included

1. Auto-login script
2. Form auto-fill
3. Bulk link collector
4. Screenshot automation
5. Page monitor (detect changes)

---

## 1. Auto-Login Script

Automatically fill and submit login forms:

```javascript
// auto-login.js

function autoLogin(config) {
  const { username, password, usernameSelector, passwordSelector, submitSelector } = config;
  
  // Find form fields
  const usernameField = document.querySelector(usernameSelector || 'input[type="email"], input[type="text"]');
  const passwordField = document.querySelector(passwordSelector || 'input[type="password"]');
  const submitButton = document.querySelector(submitSelector || 'button[type="submit"]');
  
  if (!usernameField || !passwordField) {
    console.error('[AutoLogin] Form fields not found');
    return false;
  }
  
  // Fill fields
  usernameField.value = username;
  passwordField.value = password;
  
  // Trigger events (some sites require this)
  ['input', 'change'].forEach(eventType => {
    usernameField.dispatchEvent(new Event(eventType, { bubbles: true }));
    passwordField.dispatchEvent(new Event(eventType, { bubbles: true }));
  });
  
  // Submit form
  if (submitButton) {
    setTimeout(() => submitButton.click(), 500);
    console.log('[AutoLogin] Form submitted');
    return true;
  }
  
  // Fallback: submit the form directly
  const form = usernameField.closest('form');
  if (form) {
    setTimeout(() => form.submit(), 500);
    console.log('[AutoLogin] Form submitted (fallback)');
    return true;
  }
  
  return false;
}

// Usage example
const loginConfig = {
  username: 'user@example.com',
  password: 'your_password',
  // Optional custom selectors
  usernameSelector: '#email',
  passwordSelector: '#pass',
  submitSelector: '#login-button'
};

autoLogin(loginConfig);
```

---

## 2. Form Auto-Fill

Smart form filling with predefined data:

```javascript
// form-autofill.js

const userProfile = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '+1234567890',
  address: '123 Main St',
  city: 'New York',
  zip: '10001',
  country: 'USA'
};

function autoFillForm() {
  // Mapping of field names to user data
  const fieldMap = {
    'first.*name|fname|firstname': userProfile.firstName,
    'last.*name|lname|lastname': userProfile.lastName,
    'email|e-mail|mail': userProfile.email,
    'phone|tel|mobile': userProfile.phone,
    'address|street': userProfile.address,
    'city|town': userProfile.city,
    'zip|postal.*code': userProfile.zip,
    'country|nation': userProfile.country
  };
  
  // Find all input fields
  const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]');
  
  inputs.forEach(input => {
    const name = (input.name || input.id || input.placeholder || '').toLowerCase();
    
    // Try to match field
    for (const [pattern, value] of Object.entries(fieldMap)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(name)) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        console.log(`[AutoFill] Filled: ${input.name || input.id}`);
        break;
      }
    }
  });
  
  console.log('[AutoFill] Form filling complete');
}

// Keyboard shortcut: Ctrl+Shift+A
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    autoFillForm();
  }
});
```

---

## 3. Bulk Link Collector

Extract and organize all links from a page:

```javascript
// link-collector.js

function collectAllLinks() {
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map(a => ({
      url: a.href,
      text: a.textContent.trim(),
      title: a.title,
      target: a.target
    }))
    .filter(link => link.url.startsWith('http'));
  
  // Remove duplicates
  const uniqueLinks = Array.from(
    new Map(links.map(link => [link.url, link])).values()
  );
  
  // Categorize links
  const categorized = {
    internal: [],
    external: [],
    social: [],
    media: []
  };
  
  const currentHost = window.location.hostname;
  const socialDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com'];
  const mediaDomains = ['youtube.com', 'vimeo.com', 'twitch.tv'];
  
  uniqueLinks.forEach(link => {
    const linkHost = new URL(link.url).hostname;
    
    if (linkHost === currentHost) {
      categorized.internal.push(link);
    } else if (socialDomains.some(domain => linkHost.includes(domain))) {
      categorized.social.push(link);
    } else if (mediaDomains.some(domain => linkHost.includes(domain))) {
      categorized.media.push(link);
    } else {
      categorized.external.push(link);
    }
  });
  
  return { all: uniqueLinks, categorized };
}

// Export links as CSV
function exportLinksAsCSV() {
  const { all } = collectAllLinks();
  
  const csv = [
    ['URL', 'Text', 'Title'].join(','),
    ...all.map(link => [
      `"${link.url}"`,
      `"${link.text.replace(/"/g, '""')}"`,
      `"${link.title || ''}"`
    ].join(','))
  ].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `links-${window.location.hostname}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  console.log(`[LinkCollector] Exported ${all.length} links`);
}

// Usage
const links = collectAllLinks();
console.log('Link summary:', {
  total: links.all.length,
  internal: links.categorized.internal.length,
  external: links.categorized.external.length,
  social: links.categorized.social.length,
  media: links.categorized.media.length
});

// Export
exportLinksAsCSV();
```

---

## 4. Screenshot Automation

Automatically capture screenshots at intervals or on events:

```javascript
// screenshot-automation.js (main process)

const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// Capture screenshot of current page
async function captureScreenshot(view, filename) {
  try {
    const image = await view.webContents.capturePage();
    const screenshotPath = path.join(__dirname, '../screenshots', filename || `screenshot-${Date.now()}.png`);
    
    // Ensure directory exists
    const dir = path.dirname(screenshotPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(screenshotPath, image.toPNG());
    console.log('[Screenshot] Saved:', screenshotPath);
    return screenshotPath;
  } catch (error) {
    console.error('[Screenshot] Error:', error);
    return null;
  }
}

// Auto-capture on specific events
function enableAutoScreenshot(view) {
  // Capture when page finishes loading
  view.webContents.on('did-finish-load', () => {
    const url = new URL(view.webContents.getURL());
    const filename = `${url.hostname}-${Date.now()}.png`;
    captureScreenshot(view, filename);
  });
}

// IPC handler for manual capture
ipcMain.handle('capture-screenshot', async (event, filename) => {
  const view = getCurrentView(); // Your function to get active view
  return await captureScreenshot(view, filename);
});

// Usage from renderer
// ipcRenderer.invoke('capture-screenshot', 'my-capture.png');
```

---

## 5. Page Monitor (Detect Changes)

Monitor a webpage for changes and notify:

```javascript
// page-monitor.js

class PageMonitor {
  constructor(checkInterval = 60000) {
    this.checkInterval = checkInterval;
    this.lastContent = '';
    this.timer = null;
  }
  
  // Get page content signature
  getContentSignature() {
    // Monitor specific elements or entire body
    const content = document.body.innerText;
    const links = Array.from(document.querySelectorAll('a')).length;
    const images = Array.from(document.querySelectorAll('img')).length;
    
    return JSON.stringify({ content: content.substring(0, 1000), links, images });
  }
  
  // Start monitoring
  start(onChange) {
    this.lastContent = this.getContentSignature();
    console.log('[PageMonitor] Started monitoring');
    
    this.timer = setInterval(() => {
      const newContent = this.getContentSignature();
      
      if (newContent !== this.lastContent) {
        console.log('[PageMonitor] Page changed!');
        this.lastContent = newContent;
        
        if (onChange) onChange();
        
        // Show notification
        this.showNotification('Page content has changed!');
      }
    }, this.checkInterval);
  }
  
  // Stop monitoring
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[PageMonitor] Stopped monitoring');
    }
  }
  
  // Show notification
  showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Page Monitor', {
        body: message,
        icon: window.location.origin + '/favicon.ico'
      });
    }
    
    // Also show in-page notification
    const div = document.createElement('div');
    div.textContent = message;
    div.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4299e1;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(div);
    
    setTimeout(() => div.remove(), 5000);
  }
}

// Usage
const monitor = new PageMonitor(30000); // Check every 30 seconds

monitor.start(() => {
  console.log('Page was updated!');
  // Custom action on change
  playSound();
  // or send notification
  // or auto-refresh
});

// Stop monitoring when leaving page
window.addEventListener('beforeunload', () => {
  monitor.stop();
});

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}
```

---

## 6. Bulk Task Automation

Run multiple automation tasks in sequence:

```javascript
// bulk-automation.js

class BrowserAutomation {
  constructor() {
    this.tasks = [];
    this.currentTaskIndex = 0;
  }
  
  // Add task
  addTask(name, action, delay = 1000) {
    this.tasks.push({ name, action, delay });
    return this;
  }
  
  // Run all tasks
  async run() {
    console.log(`[Automation] Running ${this.tasks.length} tasks...`);
    
    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i];
      console.log(`[${i + 1}/${this.tasks.length}] ${task.name}`);
      
      try {
        await task.action();
        await this.sleep(task.delay);
      } catch (error) {
        console.error(`[Automation] Task "${task.name}" failed:`, error);
      }
    }
    
    console.log('[Automation] All tasks completed');
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Example usage
const automation = new BrowserAutomation();

automation
  .addTask('Navigate to page', async () => {
    window.location.href = 'https://example.com';
  }, 2000)
  
  .addTask('Fill username', async () => {
    document.querySelector('#username').value = 'testuser';
  }, 500)
  
  .addTask('Fill password', async () => {
    document.querySelector('#password').value = 'password123';
  }, 500)
  
  .addTask('Submit form', async () => {
    document.querySelector('button[type="submit"]').click();
  }, 2000)
  
  .addTask('Verify login', async () => {
    const loggedIn = document.querySelector('.user-profile') !== null;
    console.log('Login successful:', loggedIn);
  }, 1000);

// Run automation
automation.run();
```

---

## 7. Data Scraper

Extract structured data from web pages:

```javascript
// data-scraper.js

class DataScraper {
  // Scrape table data
  scrapeTable(tableSelector) {
    const table = document.querySelector(tableSelector);
    if (!table) return [];
    
    const headers = Array.from(table.querySelectorAll('th'))
      .map(th => th.textContent.trim());
    
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      const rowData = {};
      
      cells.forEach((cell, index) => {
        const header = headers[index] || `column_${index}`;
        rowData[header] = cell.textContent.trim();
      });
      
      return rowData;
    });
  }
  
  // Scrape list data
  scrapeList(listSelector, itemSelector) {
    const list = document.querySelector(listSelector);
    if (!list) return [];
    
    return Array.from(list.querySelectorAll(itemSelector))
      .map(item => ({
        text: item.textContent.trim(),
        html: item.innerHTML,
        link: item.querySelector('a')?.href || null
      }));
  }
  
  // Scrape product data (e-commerce)
  scrapeProducts() {
    const products = [];
    
    // Common selectors for products
    const productSelectors = [
      '.product',
      '.product-card',
      '[data-product]',
      '.item'
    ];
    
    for (const selector of productSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          products.push({
            name: el.querySelector('.product-name, .title, h2, h3')?.textContent.trim(),
            price: el.querySelector('.price, .product-price')?.textContent.trim(),
            image: el.querySelector('img')?.src,
            link: el.querySelector('a')?.href
          });
        });
        break;
      }
    }
    
    return products.filter(p => p.name);
  }
  
  // Export as JSON
  exportJSON(data, filename = 'scraped-data.json') {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // Export as CSV
  exportCSV(data, filename = 'scraped-data.csv') {
    if (!data.length) return;
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Usage
const scraper = new DataScraper();

// Scrape table
const tableData = scraper.scrapeTable('table.data-table');
console.log('Table data:', tableData);
scraper.exportCSV(tableData, 'table-data.csv');

// Scrape products
const products = scraper.scrapeProducts();
console.log('Products:', products);
scraper.exportJSON(products, 'products.json');
```

---

## 8. Batch URL Opener

Open multiple URLs with delay:

```javascript
// batch-url-opener.js

async function openURLsInSequence(urls, delay = 2000) {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] Opening: ${url}`);
    
    // Create new tab
    await ipcRenderer.invoke('create-tab', url);
    
    // Wait before opening next
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log('[BatchOpen] Completed');
}

// Usage example
const urlsToOpen = [
  'https://github.com',
  'https://stackoverflow.com',
  'https://reddit.com',
  'https://news.ycombinator.com'
];

openURLsInSequence(urlsToOpen, 3000); // 3 second delay between tabs
```

---

## 9. Cookie Manager

Manage cookies programmatically:

```javascript
// cookie-manager.js (main process)

const { session } = require('electron');

class CookieManager {
  // Get all cookies
  async getAllCookies() {
    const cookies = await session.defaultSession.cookies.get({});
    return cookies;
  }
  
  // Get cookies for specific domain
  async getCookiesForDomain(domain) {
    const cookies = await session.defaultSession.cookies.get({ domain });
    return cookies;
  }
  
  // Set cookie
  async setCookie(cookie) {
    await session.defaultSession.cookies.set({
      url: cookie.url || 'https://example.com',
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      secure: cookie.secure || false,
      httpOnly: cookie.httpOnly || false,
      expirationDate: cookie.expirationDate
    });
  }
  
  // Delete cookie
  async deleteCookie(name, url = 'https://example.com') {
    await session.defaultSession.cookies.remove(url, name);
  }
  
  // Clear all cookies
  async clearAllCookies() {
    const cookies = await this.getAllCookies();
    for (const cookie of cookies) {
      await session.defaultSession.cookies.remove(
        `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`,
        cookie.name
      );
    }
  }
  
  // Export cookies to file
  async exportCookies(filename = 'cookies.json') {
    const cookies = await this.getAllCookies();
    fs.writeFileSync(filename, JSON.stringify(cookies, null, 2));
    console.log(`[Cookies] Exported ${cookies.length} cookies to ${filename}`);
  }
  
  // Import cookies from file
  async importCookies(filename = 'cookies.json') {
    const cookies = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    
    for (const cookie of cookies) {
      await this.setCookie(cookie);
    }
    
    console.log(`[Cookies] Imported ${cookies.length} cookies`);
  }
}

// Usage
const cookieManager = new CookieManager();

// Export cookies
await cookieManager.exportCookies('backup-cookies.json');

// Clear cookies
await cookieManager.clearAllCookies();

// Import cookies
await cookieManager.importCookies('backup-cookies.json');
```

---

## 10. Advanced Keyboard Shortcuts

Create custom keyboard shortcuts:

```javascript
// keyboard-shortcuts.js

class KeyboardShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.init();
  }
  
  init() {
    document.addEventListener('keydown', (e) => {
      const key = this.getKeyCombo(e);
      const action = this.shortcuts.get(key);
      
      if (action) {
        e.preventDefault();
        action(e);
      }
    });
  }
  
  getKeyCombo(event) {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    parts.push(event.key.toUpperCase());
    return parts.join('+');
  }
  
  register(keyCombo, action) {
    this.shortcuts.set(keyCombo, action);
    console.log(`[Shortcuts] Registered: ${keyCombo}`);
  }
  
  unregister(keyCombo) {
    this.shortcuts.delete(keyCombo);
  }
}

// Usage
const shortcuts = new KeyboardShortcutManager();

// Custom shortcuts
shortcuts.register('Ctrl+Shift+S', () => {
  console.log('Save to Read Later');
  // Save current page
});

shortcuts.register('Ctrl+Shift+D', () => {
  console.log('Download page');
  // Trigger download
});

shortcuts.register('Alt+X', () => {
  console.log('Open X-Ray for all links');
  // Analyze all links
});

shortcuts.register('Ctrl+K', () => {
  // Quick command palette
  showCommandPalette();
});
```

---

## Running These Examples

### Method 1: Inject via DevTools

1. Open DevTools (F12)
2. Copy and paste the script
3. Press Enter

### Method 2: Create Module File

1. Save script as `.js` file in `src/modules/`
2. Load in `main.js`
3. Inject into pages

### Method 3: Bookmarklet

Convert to bookmarklet for quick access:

```javascript
javascript:(function(){/* your code here */})();
```

## Best Practices

1. **Always check for existing elements** before creating
2. **Clean up event listeners** on page unload
3. **Use try-catch** for error handling
4. **Respect rate limits** when making API calls
5. **Test thoroughly** before deploying

## Security Notes

⚠️ **Warning:** Be careful with automation scripts:
- Never store passwords in plain text
- Use secure credential management
- Respect website terms of service
- Don't automate CAPTCHAs or anti-bot measures

## More Resources

- [BrowserX Documentation](../../README.md)
- [Module Development Guide](../../USAGE.md#module-development)
- [API Reference](../../USAGE.md#api-reference)

---

**Happy Automating! 🤖**
