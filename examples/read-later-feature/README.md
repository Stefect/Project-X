# Read Later Feature

A complete implementation of a "Read Later" feature for BrowserX.

## Overview

This example shows how to build a full-featured "Read Later" system with:
- Save articles with one click
- View saved articles in a dedicated page
- Manage and organize saved content
- Export/import reading list

## Files

- `read-later.js` - Content script module
- `read-later.html` - Reading list UI page
- `integration.js` - Integration code for main.js

## Installation

### Step 1: Add Module

Copy `read-later.js` to `src/modules/read-later.js`

### Step 2: Add UI Page

Copy `read-later.html` to `public/read-later.html`

### Step 3: Integrate with Main Process

Add this to `src/main.js`:

```javascript
const fs = require('fs');
const path = require('path');

// Load read-later module
const readLaterModule = fs.readFileSync(
  path.join(__dirname, 'modules', 'read-later.js'),
  'utf-8'
);

// Inject into pages after load
view.webContents.on('did-finish-load', () => {
  view.webContents.executeJavaScript(readLaterModule).catch(err => {
    console.error('[ReadLater] Injection failed:', err);
  });
});

// Add IPC handler for opening read-later page
ipcMain.handle('open-read-later', async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  win.loadFile(path.join(__dirname, '../public/read-later.html'));
  return win.id;
});
```

### Step 4: Add Toolbar Button

In `public/index.html`, add button:

```html
<button id="read-later-btn" class="toolbar-btn" title="Read Later">
  📖 Read Later
</button>

<script>
document.getElementById('read-later-btn').addEventListener('click', () => {
  ipcRenderer.invoke('open-read-later');
});
</script>
```

## Usage

### Save Article

1. Navigate to any article/page
2. Click the floating "📖 Read Later" button in bottom-right
3. Article is saved to local storage

### View Saved Articles

1. Click "📖 Read Later" in toolbar
2. Browse saved articles
3. Click to open in new tab
4. Delete unwanted items

### Export Reading List

```javascript
// In DevTools console or script
const readLater = JSON.parse(localStorage.getItem('readLater') || '[]');
const json = JSON.stringify(readLater, null, 2);

// Copy to clipboard
navigator.clipboard.writeText(json);

// Or download as file
const blob = new Blob([json], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'reading-list.json';
a.click();
```

### Import Reading List

```javascript
// From JSON file
const imported = JSON.parse(jsonString);
const current = JSON.parse(localStorage.getItem('readLater') || '[]');
const merged = [...current, ...imported];
localStorage.setItem('readLater', JSON.stringify(merged));
```

## Features

✅ One-click saving  
✅ Persistent storage  
✅ Clean UI for management  
✅ Export/import support  
✅ Search and filter (extendable)  
✅ Lightweight and fast  

## Future Enhancements

- Tags and categories
- Full-text search
- Reading time estimation
- Sync across devices
- Offline reading mode

## License

MIT - Same as BrowserX
