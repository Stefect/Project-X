# BrowserX - лабораторні роботи

тут 3 таски які треба було зробити для курсу

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

## Структура

```
Project-X/
├── src/
│   ├── modules/
│   │   ├── ai-feed.js        # Task 1 генератори
│   │   └── ai-handlers.js    # Task 3 мемоізація тут
│   └── utils/
│       └── memoize.js        # Task 3 основна функція
├── examples/
│   └── memoize-test.js       # Task 3 тести
└── package.json              # Task 2 налаштування
```

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