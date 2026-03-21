# BrowserX - Локалізація навчальних тасок

Цей проект містить реалізації трьох навчальних завдань. Нижче описано, де знаходиться код кожної таски.

---

## 📋 Task 1: Generators and Iterators

**Де знаходиться:** [`src/modules/ai-feed.js`](src/modules/ai-feed.js)

### Реалізовані генератори:

#### 1. Round Robin Generator (рядок ~141)
```javascript
function* roundRobinSourceGenerator(sources)
```
**Що робить:** Циклічно перебирає джерела новин у нескінченному циклі (Round Robin патерн).

**Використання:**
- Рівномірно розподіляє запити між різними джерелами (Reddit, Dev.to, HackerNews)
- Запобігає перевантаженню одного джерела

#### 2. Infinite Article Generator (рядок ~261)
```javascript
async function* infiniteArticleGenerator(categories = ['all'], customSources = [])
```
**Що робить:** Створює нескінченний потік статей з різних джерел.

**Особливості:**
- Асинхронний generator (`async function*`)
- Використовує `yield` для повернення статей по одній
- Працює з таймаутами через timeout iterator wrapper
- Фільтрує статті по категоріях (tech, science, gaming, AI, crypto тощо)

#### 3. Timeout Iterator Wrapper
**Функціональність:** Обробляє генератори з таймаутом, споживає iterator протягом заданого часу.

**Приклад використання:**
```javascript
// Споживати статті протягом 30 секунд
const articles = [];
for await (const article of infiniteArticleGenerator(['tech', 'ai'])) {
    articles.push(article);
    if (/* timeout reached */) break;
}
```

---

## 📦 Task 2: Project Setup

**Де знаходиться:** Кореневі файли проекту

### Компоненти:

#### 1. Git Repository
```bash
git log  # Перевірити історію комітів
```
- Ініціалізовано репозиторій
- Підключено до GitHub: `https://github.com/Stefect/Project-X.git`

#### 2. .gitignore файл
**Розташування:** [`.gitignore`](.gitignore)
```
node_modules/
src/config.js
.env
*.log
build/
release/
...
```

#### 3. Package Configuration
**Розташування:** [`package.json`](package.json)
- **Назва проекту:** `browserx`
- **Версія:** `2.2.0`
- **Автор:** Stefect
- **Ліцензія:** MIT (див. [`LICENSE`](LICENSE))
- **Опис:** Privacy-focused browser with AI features

#### 4. Dependencies
```json
"dependencies": {
  "electron": "^40.1.0",
  "groq-sdk": "^0.9.0",
  "node-fetch": "^3.3.2",
  ...
}
```

#### 5. Приклад використання бібліотеки
**Проект демонструє як використовувати:**
- Electron (основа браузера)
- Groq SDK (AI функції)
- Node-Fetch (HTTP запити)

**Як запустити:**
```bash
# Встановити залежності
npm install

# Запустити проект
npm start
```

---

## 🧠 Task 3: Memoization Function

**Де знаходиться:** [`src/utils/memoize.js`](src/utils/memoize.js)

### Реалізовані компоненти:

#### 1. Основна функція мемоізації
```javascript
function memoize(fn, options = {})
```

**Параметри:**
- `fn`: Функція для мемоізації
- `options`: Налаштування (`maxSize`, `policy`, `ttl`, `customEvict`)

#### 2. Чотири політики витіснення:

**LRU (Least Recently Used)** - за замовчуванням
```javascript
const cached = memoize(slowFn, { maxSize: 100, policy: 'lru' });
```

**LFU (Least Frequently Used)** - підрахунок використань
```javascript
const cached = memoize(slowFn, { maxSize: 50, policy: 'lfu' });
```

**TIME (Time-based expiry)** - автоматичне видалення по часу
```javascript
const cached = memoize(slowFn, { maxSize: 30, policy: 'time', ttl: 60000 });
```

**CUSTOM** - власна логіка витіснення
```javascript
const cached = memoize(slowFn, {
    policy: 'custom',
    customEvict: (cache) => cache.keys().next().value
});
```

#### 3. AI інтеграція в проекті
**Файл:** [`src/modules/ai-handlers.js`](src/modules/ai-handlers.js)

```javascript
// Кешування AI резюме статей (LRU, 100 записів)
const cachedSummarizeArticle = memoize(
    (title) => summarizeArticle(title, groqClient),
    { maxSize: 100, policy: 'lru' }
);

// Кешування X-Ray URL опису (LRU, 200 записів)
const cachedDescribeURL = memoize(describeURL, {
    maxSize: 200,
    policy: 'lru'
});
```

#### 4. Тестування та демонстрація
**Файл:** [`examples/memoize-test.js`](examples/memoize-test.js)

```bash
# Запустити тести всіх політик
node examples/memoize-test.js
```

**Тест показує:**
- LRU витіснення при перевищенні розміру
- LFU підрахунок частоти використання
- TIME автоматичне видалення застарілих записів
- Різниці в швидкості (з кешу vs без кешу)

#### 5. Методи та API
```javascript
const cached = memoize(fn, options);

cached.cache           // Map з кешованими значеннями
cached.clearCache()    // Очистити весь кеш
cached(args...)        // Виклик з мемоізацією
```

#### 6. Переваги в проекті
- ⚡ **Прискорення AI запитів** - повторні статті з кешу < 1мс
- 💰 **Економія API квоти** - менше запитів до Groq
- 🚀 **Оптимізація UI** - швидше завантаження X-Ray інформації

---

## 🚀 Швидкий старт

```bash
# Клонувати репозиторій
git clone https://github.com/Stefect/Project-X.git
cd Project-X

# Встановити залежності
npm install

# Налаштувати API ключ (потрібний для AI функцій)
cp config.js.example src/config.js
# Відредагувати src/config.js та додати GROQ_API_KEY

# Запустити браузер
npm start

# Або протестувати мемоізацію окремо
node examples/memoize-test.js
```

---

## 📁 Структура проекту

```
Project-X/
├── 📄 package.json              # Task 2: Конфігурація проекту
├── 📄 LICENSE                   # Task 2: MIT ліцензія
├── 📄 .gitignore                # Task 2: Git ignore rules
│
├── src/
│   ├── modules/
│   │   ├── ai-feed.js           # ✅ Task 1: Generators & Iterators
│   │   └── ai-handlers.js       # 🔗 Task 3 інтеграція (AI + memoization)
│   └── utils/
│       └── memoize.js           # ✅ Task 3: Memoization Function
│
├── examples/
│   └── memoize-test.js          # 🧪 Task 3: Тести мемоізації
│
└── public/
    └── feed.html                # UI для нескінченної стрічки (Task 1)
```

---

## 🎓 Автор

**ІМ-55** | MIT License

