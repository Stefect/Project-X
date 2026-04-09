# BrowserX - лабораторні роботи

тут 5 задач які треба було зробити для курсу

## Task 1: Генератори

файл: `src/modules/ai-feed.js`

зробив генератори для новин:
- roundRobinSourceGenerator - перебирає джерела по колу
- infiniteArticleGenerator - нескінченна стрічка статей
- є таймаути щоб не зависало

```javascript
function* roundRobinSourceGenerator(sources) {
  let index = 0;
  while (true) {
    yield sources[index % sources.length];
    index++;
  }
}
```

генератори працюють з reddit, dev.to, hackernews

## Task 2: Налаштування проекту

зробив:
- git репозиторій
- package.json з залежностями
- .gitignore щоб не комітити зайве
- підключив до github

запуск:
```
npm install
npm start
```

треба config.js з API ключем для groq

## Task 3: Мемоізація

файл: `src/utils/memoize.js`

зробив функцію мемоізації з різними політиками:

```javascript
function memoize(fn, options) {
    const cache = new Map();
    // тут логіка кешування
}
```

політики витіснення:
- LRU - найстарший видаляється
- LFU - найрідше використовуваний видаляється
- TIME - по часу видаляється
- CUSTOM - можна свою функцію передати

використав мемоізацію в AI модулі:
```javascript
const cachedSummarizeArticle = memoize(summarizeArticle, { maxSize: 100, policy: 'lru' });
const cachedDescribeURL = memoize(describeURL, { maxSize: 200, policy: 'lru' });
```

тест: `node examples/memoize-test.js`

## Task 4: Таб-менеджер

файл: `src/modules/tab-manager.js`

зробив менеджер для управління вкладками браузера:

```javascript
class TabManager {
  constructor() {
    this.tabs = new Map();
    this.activeTab = null;
  }
  
  createTab(id, url)
  switchTab(id)
  closeTab(id)
  getTabs()
}
```

можливості:
- створення й закриття вкладок
- переключення між вкладками
- отримання списку активних вкладок
- управління історією вкладок

## Task 5: Асинхронні функції для масивів

файл: `src/utils/async-array.js`

реалізував утилітні функції для роботи з асинхронними операціями над масивами:

```javascript
async function asyncMap(arr, asyncFn, options = {})
async function asyncFilter(arr, asyncFn, options = {})
async function asyncFind(arr, asyncFn, options = {})
async function asyncSome(arr, asyncFn, options = {})
async function asyncReduce(arr, asyncFn, initial, options = {})
```

особливості:
- контроль паралельності (concurrency control)
- підтримка AbortController для скасування
- як Promise так і Callback варіанти
- використовуються в модулях: news-fetcher, privacy-guard, tab-manager, storage, ipc-handlers

приклади: `src/utils/async-array-examples.js`
документація: `ASYNC_ARRAY_INTEGRATION.md`

## Структура

```
Project-X/
├── src/
│   ├── modules/
│   │   ├── ai-feed.js             # Task 1 генератори
│   │   ├── tab-manager.js         # Task 4 таб-менеджер
│   │   └── ai-handlers.js         # Task 3 мемоізація
│   └── utils/
│       ├── memoize.js             # Task 3 основна функція
│       ├── async-array.js         # Task 5 асинхронні функції
│       └── async-array-examples.js # Task 5 приклади
├── examples/
│   └── memoize-test.js            # Task 3 тести
├── ASYNC_ARRAY_INTEGRATION.md     # Task 5 документація
└── package.json                   # Task 2 налаштування
```

## Статус

✅ Task 1: Генератори - завершено
✅ Task 2: Налаштування проекту - завершено  
✅ Task 3: Мемоізація - завершено
✅ Task 4: Таб-менеджер - завершено
✅ Task 5: Асинхронні функції для масивів - завершено

## Як запустити

```
git clone https://github.com/Stefect/Project-X.git
cd Project-X
npm install
npm start
```

для AI потрібен GROQ_API_KEY в config.js

---

автор: Stefect | ІМ-55