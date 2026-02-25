# BrowserX

<div align="center">

**AI-Powered Privacy Browser with Smart Features**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-40.1.0-blue.svg)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-18+-green.svg)](https://nodejs.org/)

</div>

## 📋 Overview

BrowserX is a modern, privacy-focused web browser built on Electron with integrated AI capabilities. It combines powerful browsing features with intelligent automation, privacy protection, and smart content discovery.

## ✨ Key Features

### 🤖 AI-Powered Features
- **AI Content Feed** - Infinite scroll news feed with AI-curated content from multiple sources (Reddit, Dev.to, Hacker News, etc.)
- **Smart T9 Autocomplete** - VS Code-style IntelliSense for text inputs with hybrid local dictionary + AI suggestions
- **Link X-Ray** - Hover over any link for 1 second to get AI-powered page preview
- **AI Translation** - Built-in translation support for multiple languages

### 🔒 Privacy & Security
- **Tor Integration** - Built-in Tor support for anonymous browsing
- **Tracker Blocking** - Real-time tracking protection with live dashboard
- **Ad Blocking** - Integrated ad-blocking capabilities
- **WebRTC Protection** - Optional WebRTC disabling to prevent IP leaks

### 🚀 Browsing Features
- **Multi-Tab Management** - Advanced tab system with drag-and-drop reordering
- **Tab Organization** - AI-powered automatic tab organization
- **Session Management** - Save and restore browsing sessions
- **History & Bookmarks** - Full browsing history and bookmark management
- **Custom News Sources** - Add and manage your own RSS/JSON news feeds

### 🎨 Customization
- **Theme System** - Multiple built-in themes with customization options
- **Responsive UI** - Modern, adaptive interface built with Tailwind CSS
- **Sidebar Navigation** - Collapsible sidebar with quick access to features

## 🛠️ Technology Stack

- **Framework:** Electron 40.1.0
- **UI:** HTML5, CSS3, Tailwind CSS 4.1.18
- **AI Integration:** Groq SDK, Google Generative AI
- **Data Parsing:** RSS Parser, Axios
- **Privacy:** Tor Expert Bundle

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- Git

### Step 1: Clone the Repository

```bash
git clone https://github.com/Stefect/Project-X.git
cd Project-X
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure API Keys

1. Copy the configuration template:
   ```bash
   cp config.js.example config.js
   ```

2. Edit `config.js` and add your API keys:
   ```javascript
   module.exports = {
     groq: {
       apiKey: 'YOUR_GROQ_API_KEY'
     },
     google: {
       apiKey: 'YOUR_GOOGLE_API_KEY'
     }
   };
   ```

### Step 4: Install Tor (Optional, for Anonymous Browsing)

Follow the instructions in [bin/README.md](bin/README.md) to install Tor for your platform.

### Step 5: Run the Application

```bash
npm start
```

For development with hot CSS reload:
```bash
npm run dev
```

## 🏗️ Build

### Build for Windows

```bash
# Build installer
npm run build

# Build portable version
npm run build:portable

# Build all formats
npm run build:all
```

Built applications will be located in the `dist/` directory.

## 📚 Usage Guide

### Basic Navigation
1. Launch BrowserX
2. Enter URL or search query in the address bar
3. Press Enter or click Go

### Creating Tabs
- **New Tab:** Click the "+" button or `Ctrl+T`
- **Close Tab:** Click the X on the tab or `Ctrl+W`
- **Switch Tabs:** Click on tab or `Ctrl+Tab`
- **Reorder Tabs:** Drag and drop tabs to rearrange

### AI Features

#### AI Content Feed
1. Click the **Feed** button in the toolbar
2. Browse through AI-curated articles and news
3. Select category filters (Tech, Science, Gaming, etc.)
4. Add custom RSS sources in settings

#### T9 Autocomplete
1. Click on any text input field on a webpage
2. Start typing (minimum 2 characters for local suggestions, 5 for AI)
3. Use `Arrow Keys` to navigate suggestions
4. Press `Tab` or `Enter` to accept suggestion
5. Press `Escape` to close suggestions

#### Link X-Ray
1. Hover mouse over any link for 1 second
2. View AI-generated preview of the page content
3. Move mouse away to dismiss the preview

### Privacy Features

#### Tor Mode
1. Click **Tor: OFF** button in toolbar
2. Wait for Tor connection (button changes to **Tor: ON**)
3. All traffic now routes through Tor network
4. Click again to disable Tor mode

#### Tracker Dashboard
1. Click **Events** button to view reactive live dashboard
2. See blocked trackers, requests, and events in real-time
3. Monitor privacy protection metrics

### Session Management
1. **Save Session:** Settings → Sessions → Save Current
2. **Load Session:** Settings → Sessions → Select saved session
3. **Auto-restore:** Enable in settings to restore last session on startup

### History & Bookmarks
- **View History:** Click History button or `Ctrl+H`
- **Add Bookmark:** Click star icon or `Ctrl+D`
- **Manage Bookmarks:** Settings → Bookmarks

## 📂 Project Structure

```
Project-X/
├── src/                      # Source code
│   ├── main.js              # Main Electron process
│   ├── preload.js           # Preload script for security
│   ├── config.js            # API configuration (gitignored)
│   └── modules/             # Feature modules
│       ├── ai-feed.js       # AI content feed
│       ├── unified-t9.js    # T9 autocomplete
│       ├── link-xray.js     # Link preview
│       ├── storage.js       # Data persistence
│       ├── code-injector.js # Script injection
│       └── inject.js        # Content injection
├── public/                   # Frontend files
│   ├── index.html           # Main UI
│   ├── feed.html            # AI feed page
│   ├── history.html         # History page
│   ├── newtab.html          # New tab page
│   ├── settings.html        # Settings page
│   └── css/                 # Stylesheets
├── bin/                      # Binary files
│   ├── tor/                 # Tor bundle
│   └── data/                # GeoIP data
├── build/                    # Build resources (icons)
├── dist/                     # Built applications
├── package.json             # Project metadata
├── tailwind.config.js       # Tailwind configuration
└── postcss.config.js        # PostCSS configuration
```

## 🔧 Configuration

### API Keys

The application requires API keys for AI features:

- **Groq API** - For fast AI inference (autocomplete, link analysis)
- **Google Generative AI** - Alternative AI provider

Get your keys:
- Groq: https://console.groq.com/
- Google AI: https://makersuite.google.com/app/apikey

### Custom News Sources

Add custom RSS/JSON feeds in Settings → Feed Sources:
1. Click "Add Custom Source"
2. Enter name and URL
3. Select categories
4. Save

## 🎓 Development

### Project Architecture

BrowserX follows a modular architecture:
- **Main Process** (`main.js`) - Application lifecycle, window management, IPC handlers
- **Renderer Process** (HTML/CSS/JS) - User interface and interactions
- **Modules** - Isolated features that can be injected into web pages
- **Storage Layer** - LocalStorage-based data persistence

### Adding New Features

1. Create module in `src/modules/`
2. Export functionality from module
3. Import in `main.js` or inject into pages
4. Add IPC handlers if needed
5. Update UI in `public/`

### Code Style

- Use modern JavaScript (ES6+)
- Follow modular design patterns
- Keep functions focused and small
- Document complex logic with comments
- Use meaningful variable names

### Building CSS

```bash
# Build once
npm run build:css

# Watch mode
npm run build:css:watch
```

## 📖 API Reference

### IPC Events (Renderer → Main)

```javascript
// Navigation
ipcRenderer.send('navigate', url);
ipcRenderer.send('go-back');
ipcRenderer.send('go-forward');
ipcRenderer.send('reload');

// Tabs
ipcRenderer.invoke('create-tab', url);
ipcRenderer.send('close-tab', tabId);
ipcRenderer.send('switch-tab', tabId);
ipcRenderer.send('reorder-tabs', newOrder);
ipcRenderer.invoke('organize-tabs');

// Window
ipcRenderer.send('window-minimize');
ipcRenderer.send('window-maximize');
ipcRenderer.send('window-close');

// Features
ipcRenderer.invoke('translate-text', text, targetLanguage);
ipcRenderer.handle('get-reactive-events');
```

### Storage API

```javascript
const storage = require('./modules/storage');

// History
storage.addToHistory(url, title);
const history = storage.getHistory();
storage.clearHistory();

// Bookmarks
storage.addBookmark(url, title);
const bookmarks = storage.getBookmarks();
storage.deleteBookmark(url);

// Sessions
storage.saveSession(name, tabs);
const sessions = storage.getSessions();
storage.loadSession(name);
```

### AI Feed API

```javascript
const { infiniteArticleGenerator } = require('./modules/ai-feed');

// Fetch articles
const articles = await infiniteArticleGenerator.fetchArticles(category);

// Categories: 'all', 'tech', 'science', 'news', 'gaming', 'ai', 'crypto', 'business'
```

## 🧪 Testing

Run the application in development mode:

```bash
npm run dev
```

Open DevTools: `Ctrl+Shift+I` or `F12`

## 🐛 Troubleshooting

### Common Issues

**Application won't start:**
- Ensure Node.js 18+ is installed
- Delete `node_modules` and run `npm install` again
- Check for error logs in `bx-err.log`

**AI features not working:**
- Verify API keys in `config.js`
- Check internet connection
- Review console for API errors

**Tor connection fails:**
- Ensure Tor binary is installed in `bin/tor/`
- Check firewall settings
- Verify GeoIP data files exist in `bin/data/`

**Build fails:**
- Run `npm run build:css` separately first
- Check for syntax errors: `npm run start`
- Verify build resources in `build/` folder

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Standards
- Write clean, readable code
- Add comments for complex logic
- Test your changes thoroughly
- Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Stefect**

## 🙏 Acknowledgments

- Electron team for the framework
- Tor Project for privacy tools
- Groq for AI infrastructure
- All open-source contributors

## 📞 Support

- **Issues:** https://github.com/Stefect/Project-X/issues
- **Discussions:** https://github.com/Stefect/Project-X/discussions

## 🔄 Changelog

See commit history for detailed changes: https://github.com/Stefect/Project-X/commits/main

---

**Built with ❤️ for privacy and productivity**
