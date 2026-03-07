## Налаштування Groq API Key

Для запуску проекту необхідно створити файл `.env` у корені репозиторію та додати туди ваш Groq API Key:

```
GROQ_API_KEY=ваш_ключ_сюди
```

Без цього ключа проект не буде працювати. Не додавайте файл `.env` у репозиторій — він має бути локальним і приватним.

### Кроки:
1. Створіть файл `.env` у корені проекту.
2. Додайте рядок з вашим Groq API Key.
3. Збережіть файл.
4. Запустіть проект.

> **Увага:** Не розміщуйте секрети у публічних файлах чи репозиторії.
# BrowserX

**Privacy-focused browser з AI функціями**

## Швидкий старт

```bash
# 1. Клонувати репозиторій
git clone https://github.com/Stefect/Project-X.git
cd Project-X

# 2. Встановити залежності
npm install

# 3. Налаштувати API ключ
cp config.js.example src/config.js
# Відредагувати src/config.js та вставити GROQ_API_KEY

# 4. Запустити
npm start
```

## � Docker

BrowserX підтримує запуск в Docker з GUI через VNC:

```bash
# 1. Налаштуйте .env файл
cp .env.example .env
# Додайте свій GROQ_API_KEY

# 2. Запустіть контейнер
docker-compose up -d

# 3. Підключіться через VNC
# VNC Client → localhost:5900
```

**Докладніше:** [`docs/DOCKER.md`](docs/DOCKER.md)

## �🚀 Оптимізація: Мемоїзація

BrowserX використовує систему мемоїзації для оптимізації дорогих операцій:

**Що кешується:**
- ✅ AI резюмування статей (LRU, 100 записів)
- ✅ X-Ray опис посилань (LRU, 200 записів)
- 📚 Детальніше: [`docs/MEMOIZATION.md`](docs/MEMOIZATION.md)

**Тестування:**
```bash
node examples/memoize-examples.js
```

**Переваги:**
- 🚀 -80% Groq API запитів (повторні статті з кешу)
- ⚡ X-Ray < 1ms (vs 2-5s AI запиту)
- 💰 Економія API квоти

## Можливі помилки та їх вирішення

| Помилка | Рішення |
|---------|---------|
| `Cannot find module 'electron'` | `npm install` |
| `GROQ_API_KEY not found` | Створити `src/config.js` з API ключем |
| `CSS не завантажується` | `npm run build:css` |
| `Tor не працює` | Перевірити `bin/tor/` папку |
| `Feed не працює` | Перевірити інтернет-з'єднання |

## Структура проекту

```
browserx/
├── package.json           # Конфігурація проекту
├── LICENSE                # MIT ліцензія
├── .gitignore             # Ігноровані файли
│
├── 🐳 Docker
│   ├── Dockerfile         # Docker образ з Xvfb + VNC
│   ├── docker-compose.yml # Docker Compose конфігурація
│   ├── .dockerignore      # Виключення для Docker
│   ├── .env.example       # Приклад environment variables
│   ├── docker-test.sh     # Тест скрипт (Linux/macOS)
│   └── docker-test.ps1    # Тест скрипт (Windows)
│
├── src/
│   ├── main.js            # Головний процес Electron
│   ├── preload.js         # Preload скрипт
│   ├── config.js          # Конфігурація (API ключі)
│   ├── modules/           # Модулі браузера
│   │   ├── ai-feed.js         # Генератори нескінченної стрічки
│   │   ├── ai-handlers.js     # AI IPC handlers + мемоїзація
│   │   ├── tab-manager.js     # Управління вкладками
│   │   ├── storage.js         # localStorage обгортка
│   │   └── tor-manager.js     # Tor інтеграція
│   └── utils/             # Утиліти
│       └── memoize.js         # Система мемоїзації (LRU/LFU/TTL)
│
├── public/                # HTML сторінки
│   ├── index.html         # Головне вікно браузера
│   ├── feed.html          # AI нескінченна стрічка
│   ├── settings.html      # Налаштування
│   └── css/               # Стилі
│
├── docs/                  # Документація
│   ├── DOCKER.md          # Docker guide
│   ├── MEMOIZATION.md     # Мемоїзація guide
│   └── ...
│
├── examples/              # Приклади використання
│   └── memoize-examples.js
│
└── bin/                   # Tor binaries
    └── tor/
```

## Ліцензія

MIT © ІМ-55
