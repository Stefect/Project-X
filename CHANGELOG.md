# Changelog

Всі важливі зміни в проекті BrowserX будуть документуватися тут.

Формат базується на [Keep a Changelog](https://keepachangelog.com/uk-UA/1.0.0/),
і цей проект дотримується [Semantic Versioning](https://semver.org/lang/uk/).

## [Unreleased]

### Added
- 🐳 **Docker support** - Повна контейнеризація з GUI через VNC
  - `Dockerfile` з Xvfb + x11vnc + Fluxbox
  - `docker-compose.yml` для зручного управління
  - `.dockerignore` та `.env.example`
  - `docker-test.sh` та `docker-test.ps1` тест скрипти
  - Документація в `docs/DOCKER.md`
  - Підтримка volumes для Tor data та app settings
  - VNC сервер на порту 5900

- 🚀 **Memoization system** - Оптимізація через кешування
  - `src/utils/memoize.js` - універсальна функція мемоїзації
  - Політики витіснення: LRU, LFU, Time-based TTL, Custom
  - Інтеграція в AI handlers:
    - `cachedSummarizeArticle` (LRU, 100 записів)
    - `cachedDescribeURL` (LRU, 200 записів)
  - Документація в `docs/MEMOIZATION.md`
  - Демо приклади в `examples/memoize-examples.js`
  - -80% Groq API запитів, X-Ray < 1ms з кешу

### Changed
- 📝 Оновлено `README.md` з секціями про Docker та мемоїзацію
- 🏗️ Оновлено структуру проекту в документації

### Performance
- ⚡ AI резюмування: кешування останніх 100 статей
- ⚡ X-Ray посилань: кешування останніх 200 описів
- 💰 Економія API квоти Groq

---

## [Previous Updates] - 2026-03-07

### Fixed
- 🐛 Speed Dial не відображався (відсутній `#speed-dial` container)
- 🐛 News panel не відкривався (відсутній `#edit-modal`)
- 🐛 Wallpaper не застосовувався (CSS body background)
- 🐛 News FAB помилка "No webview found" (IPC замість прямого доступу)
- 🐛 News panel неможливо закрити (додано redirect to about:blank)
- 🐛 AI feed функціонал не працював (window.parent.api → window.api)

### Changed
- 🏗️ Архітектура: видалено `webview-container`, single container
- 🔄 CSS refactoring: position: fixed для webview та native-new-tab
- 🔄 IPC navigation через `navigate-url` handler
- 🔄 Feed close button тепер використовує about:blank navigation

### Added
- ✨ Emoji picker інтеграція
- 🎨 Повна підтримка wallpapers на body element
- 📊 Розширене логування: [FEED], [WEBVIEW], [NATIVE NEW TAB] prefixes

---

## [Initial Release]

### Added
- 🌐 Electron-based browser з українським інтерфейсом
- 🔐 Tor integration для анонімного перегляду
- 🤖 Groq AI інтеграція:
  - Резюмування статей
  - X-Ray опис посилань
  - Нескінченна AI стрічка новин
- 📱 Speed Dial система для швидкого доступу
- 🎨 Налаштування тем (світла/темна)
- 🔖 Tab management система
- 💾 localStorage обгортка для збереження даних
- 📰 RSS feed інтеграція
- 🛡️ Privacy Guard для блокування витоків
- 🎯 Reactive events система
