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

## Можливі помилки та їх вирішення

| Помилка | Рішення |
|---------|---------|
| `Cannot find module 'electron'` | `npm install` |
| `GROQ_API_KEY not found` | Створити `src/config.js` з API ключем |
| `CSS не завантажується` | `npm run build:css` |
| `Tor не працює` | Перевірити `bin/tor/` папку |
| `Feed не працює` | Перевірити інтернет-з'єднання |

## Структура проекту (Task 2: Project Setup)

```
browserx/
├── package.json        # Конфігурація проекту
├── LICENSE             # MIT ліцензія
├── .gitignore          # Ігноровані файли
├── src/
│   ├── main.js         # Головний процес Electron
│   ├── preload.js      # Preload скрипт
│   ├── config.js       # Конфігурація (API ключі)
│   └── modules/        # Модулі (Task 1 код)
│       ├── ai-feed.js      # Генератори (Task 1)
│       ├── ai-handlers.js  # Ітератор з таймаутом (Task 1)
│       ├── tab-manager.js
│       ├── storage.js
│       └── ...
├── public/             # HTML сторінки
└── bin/                # Tor integration
```

## Ліцензія

MIT © ІМ-55
