# Changelog

All notable changes to BrowserX will be documented in this file.

## [2.4.0] - 2026-02-25

### Modularization 🏗️
- **Major Architecture Refactoring** - Split monolithic main.js into focused modules
  - Created 6 new modules for better code organization
  - Reduced main.js from 1623 to 307 lines (-81% coordinator complexity)
  - Each module follows Single Responsibility Principle
  
#### New Modules:
- `reactive-events.js` (150 lines) - Live tracker dashboard & network event monitoring
- `tor-manager.js` (153 lines) - Tor process lifecycle & proxy configuration
- `theme-manager.js` (114 lines) - Theme injection & visual customization
- `tab-manager.js` (490 lines) - Complete tab lifecycle management & navigation
- `ipc-handlers.js` (136 lines) - Storage IPC (history, bookmarks, notes, settings)
- `ai-handlers.js` (220 lines) - AI features (summarization, organization, feed)

#### Benefits:
- ✅ **Better Testability** - Modules can be unit tested independently
- ✅ **Improved Maintainability** - Clear separation of concerns
- ✅ **Easier Debugging** - Issues isolated to specific modules
- ✅ **Scalability** - New features can be added as new modules
- ✅ **Code Readability** - Max ~500 lines per file, clear purpose
- ✅ **Reduced Cognitive Load** - main.js is now just a coordinator

#### Architecture:
```
main.js (307 lines)
  ├── App Lifecycle (ready, quit, activate)
  ├── Window Management (create, resize, close)
  └── IPC Routing (delegates to modules)

modules/ (9 files, 2229 lines total)
  ├── Core Features
  │   ├── unified-t9.js (374) - Autocomplete engine
  │   ├── ai-feed.js (333) - Content generation
  │   └── storage.js (259) - Data persistence
  ├── Tab System
  │   └── tab-manager.js (490) - Complete tab lifecycle
  ├── AI Features  
  │   └── ai-handlers.js (220) - IPC for AI operations
  ├── Infrastructure
  │   ├── ipc-handlers.js (136) - Storage IPC routing
  │   ├── reactive-events.js (150) - Network monitoring
  │   ├── tor-manager.js (153) - Privacy layer
  │   └── theme-manager.js (114) - Visual customization
```

### Code Metrics 📊
- **Before modularization:** 1623 lines in main.js
- **After modularization:** 307 lines in main.js + 1263 lines in new modules
- **Coordinator reduction:** -81% (1623 → 307)
- **Total codebase:** 2536 lines (organized vs 1623 monolithic)
- **Module count:** 3 → 9 modules
- **Average module size:** ~248 lines (manageable)

## [2.3.0] - 2026-02-25

### Major Refactoring 🔨
- **Removed unused AI features** to focus on core functionality
  - ❌ Removed Code Mate (AI code assistance buttons)
  - ❌ Removed Link X-Ray (link hover preview)
  - ❌ Removed AI Translation feature
  - ❌ Removed selection-based AI assistant
  - ✅ Kept Unified T9 autocomplete (VS Code IntelliSense style) - PRIMARY FEATURE
  - ✅ Kept AI Content Feed with summaries
  - ✅ Kept Notes summarization
  - ✅ Kept AI tab organization

### Code Cleanup 🧹
- Removed 3 module files: `code-injector.js`, `inject.js`, `link-xray.js`
- Reduced `main.js` from 2346 to 1481 lines (-37% code reduction)
- Cleaned up `preload.js` API surface (-30% surface area)
- Removed 7+ unused IPC handlers
- Removed 4+ unused functions
- Cleaned context menus from removed features
- Fixed orphaned code blocks

### Infrastructure Improvements 🏗️
- **Environment Variables**: Migrated from hardcoded config to `.env` file
  - Added `dotenv` package for secure configuration
  - Created `.env.example` template
  - Updated `.gitignore` to exclude `.env`
  - API keys no longer hardcoded in repository
- **Configuration**: Simplified config.js to read from environment variables
- **Documentation**: Updated README.md to reflect current feature set

### Architecture 📐
- Streamlined to 3 core modules: `unified-t9.js`, `ai-feed.js`, `storage.js`
- Cleaner IPC architecture with focused handlers
- Improved code maintainability and readability

## [2.2.0] - 2024-XX-XX

### Added
- AI-powered infinite content feed
- VS Code-style T9 autocomplete
- Tor integration for anonymous browsing
- Tab management with drag-and-drop
- History and bookmarks system
- Custom theme support

[2.3.0]: https://github.com/Stefect/Project-X/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/Stefect/Project-X/releases/tag/v2.2.0
