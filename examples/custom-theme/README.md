# Custom Theme Example

Learn how to create and apply custom themes to BrowserX.

## Overview

BrowserX supports custom themes that can change the appearance of the browser UI. This example shows how to create beautiful themes and apply them.

## Theme Structure

```javascript
const theme = {
  name: 'Theme Name',
  type: 'dark' | 'light',
  colors: {
    primary: '#hexcolor',
    secondary: '#hexcolor',
    background: '#hexcolor',
    surface: '#hexcolor',
    text: '#hexcolor',
    textSecondary: '#hexcolor',
    border: '#hexcolor',
    accent: '#hexcolor',
    success: '#hexcolor',
    warning: '#hexcolor',
    error: '#hexcolor'
  }
};
```

## Example Themes

### Ocean Theme

```javascript
const oceanTheme = {
  name: 'Ocean',
  type: 'dark',
  colors: {
    primary: '#0077be',
    secondary: '#00a8e8',
    background: '#001f3f',
    surface: '#003554',
    text: '#ffffff',
    textSecondary: '#a0c4d9',
    border: '#005f8f',
    accent: '#00d9ff',
    success: '#00b894',
    warning: '#fdcb6e',
    error: '#d63031'
  }
};

// Apply theme
ipcRenderer.send('apply-theme', oceanTheme);
```

### Forest Theme

```javascript
const forestTheme = {
  name: 'Forest',
  type: 'dark',
  colors: {
    primary: '#2d8659',
    secondary: '#3cb371',
    background: '#1a2f23',
    surface: '#2d4a37',
    text: '#ffffff',
    textSecondary: '#a8d5ba',
    border: '#3d6b4a',
    accent: '#52c97a',
    success: '#27ae60',
    warning: '#f39c12',
    error: '#e74c3c'
  }
};
```

### Sunset Theme

```javascript
const sunsetTheme = {
  name: 'Sunset',
  type: 'light',
  colors: {
    primary: '#ff6b6b',
    secondary: '#ff8e53',
    background: '#fff5f5',
    surface: '#ffffff',
    text: '#2d3436',
    textSecondary: '#636e72',
    border: '#dfe6e9',
    accent: '#fd79a8',
    success: '#00b894',
    warning: '#fdcb6e',
    error: '#d63031'
  }
};
```

### Cyberpunk Theme

```javascript
const cyberpunkTheme = {
  name: 'Cyberpunk',
  type: 'dark',
  colors: {
    primary: '#ff00ff',
    secondary: '#00ffff',
    background: '#0a0a0a',
    surface: '#1a1a1a',
    text: '#00ff00',
    textSecondary: '#00cccc',
    border: '#ff00ff',
    accent: '#ffff00',
    success: '#00ff00',
    warning: '#ff9900',
    error: '#ff0066'
  }
};
```

## Applying Themes

### Method 1: From Settings UI

1. Open Settings
2. Go to Appearance tab
3. Select theme from dropdown
4. Or click "Custom Theme" to create your own

### Method 2: Programmatically

```javascript
// In renderer process (preload or injected script)
const { ipcRenderer } = require('electron');

ipcRenderer.send('apply-theme', oceanTheme);
```

### Method 3: Via DevTools Console

```javascript
// Open DevTools (F12) and paste:
const myTheme = {
  name: 'My Custom Theme',
  type: 'dark',
  colors: {
    primary: '#9b59b6',
    secondary: '#8e44ad',
    background: '#2c3e50',
    surface: '#34495e',
    text: '#ecf0f1',
    textSecondary: '#bdc3c7',
    border: '#7f8c8d',
    accent: '#e74c3c',
    success: '#2ecc71',
    warning: '#f39c12',
    error: '#e74c3c'
  }
};

// Apply
require('electron').ipcRenderer.send('apply-theme', myTheme);
```

## Dynamic Themes

### Time-Based Theme

```javascript
function getTimeBasedTheme() {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 12) {
    return morningTheme;
  } else if (hour >= 12 && hour < 18) {
    return afternoonTheme;
  } else if (hour >= 18 && hour < 22) {
    return eveningTheme;
  } else {
    return nightTheme;
  }
}

// Apply and update hourly
function applyTimeBasedTheme() {
  ipcRenderer.send('apply-theme', getTimeBasedTheme());
}

applyTimeBasedTheme();
setInterval(applyTimeBasedTheme, 60 * 60 * 1000);
```

### Theme Based on Website

```javascript
// Auto-theme based on current website
function getWebsiteTheme(hostname) {
  const themeMap = {
    'github.com': githubDarkTheme,
    'stackoverflow.com': soOrangeTheme,
    'youtube.com': youtubeRedTheme,
    'twitter.com': twitterBlueTheme
  };
  
  return themeMap[hostname] || defaultTheme;
}

// Listen for navigation
view.webContents.on('did-navigate', (event, url) => {
  const hostname = new URL(url).hostname;
  const theme = getWebsiteTheme(hostname);
  ipcRenderer.send('apply-theme', theme);
});
```

## Saving Custom Themes

```javascript
// Save theme to localStorage
function saveTheme(theme) {
  const savedThemes = JSON.parse(localStorage.getItem('customThemes') || '[]');
  
  // Avoid duplicates
  const existingIndex = savedThemes.findIndex(t => t.name === theme.name);
  if (existingIndex >= 0) {
    savedThemes[existingIndex] = theme;
  } else {
    savedThemes.push(theme);
  }
  
  localStorage.setItem('customThemes', JSON.stringify(savedThemes));
}

// Load saved themes
function loadSavedThemes() {
  return JSON.parse(localStorage.getItem('customThemes') || '[]');
}

// Delete theme
function deleteTheme(themeName) {
  let themes = loadSavedThemes();
  themes = themes.filter(t => t.name !== themeName);
  localStorage.setItem('customThemes', JSON.stringify(themes));
}
```

## Theme Gallery

Create a theme picker UI:

```html
<div id="theme-gallery">
  <!-- Themes will be populated here -->
</div>

<script>
function populateThemeGallery() {
  const themes = [oceanTheme, forestTheme, sunsetTheme, cyberpunkTheme];
  const gallery = document.getElementById('theme-gallery');
  
  gallery.innerHTML = themes.map(theme => `
    <div class="theme-preview" onclick="applyTheme('${theme.name}')">
      <div class="theme-colors">
        <span style="background: ${theme.colors.primary}"></span>
        <span style="background: ${theme.colors.secondary}"></span>
        <span style="background: ${theme.colors.accent}"></span>
      </div>
      <div class="theme-name">${theme.name}</div>
    </div>
  `).join('');
}

function applyTheme(themeName) {
  const theme = [oceanTheme, forestTheme, sunsetTheme, cyberpunkTheme]
    .find(t => t.name === themeName);
  
  if (theme) {
    ipcRenderer.send('apply-theme', theme);
  }
}

populateThemeGallery();
</script>
```

## CSS Variables Integration

Apply theme colors as CSS variables:

```javascript
function applyThemeAsCSS(theme) {
  const root = document.documentElement;
  
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });
}

// Then use in CSS:
// .button { background: var(--color-primary); }
```

## License

MIT
