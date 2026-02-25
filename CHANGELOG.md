# Changelog

All notable changes to BrowserX will be documented in this file.

## [2.3.0] - 2025-01-XX

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
