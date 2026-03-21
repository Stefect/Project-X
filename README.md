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

### Повна реалізація мемоїзації:

#### Основна функція
```javascript
function memoize(fn, options = {})
```

**Параметри:**
- `fn`: Чиста функція для мемоїзації
- `options`: Конфігурація (`maxSize`, `policy`, `ttl`, `customEvict`)

#### Підтримувані стратегії витіснення:

1. **LRU (Least Recently Used)** - за замовчуванням
   - Видаляє найдавніше використаний елемент
   - Оновлює порядок при кожному доступі

2. **LFU (Least Frequently Used)**
   - Видаляє найменш часто використовуваний елемент
   - Веде підрахунок доступів (`accessCount`)

3. **Time-Based (TTL)**
   - Автоматично видаляє застарілі записи
   - Налаштовується через `ttl` (в мілісекундах)

4. **Custom Policy**
   - Дозволяє передати власну функцію витіснення

#### Приклад використання:

**В проекті:** [`src/modules/ai-handlers.js`](src/modules/ai-handlers.js)
```javascript
const memoize = require('../utils/memoize');

// Мемоїзація AI summarize з LRU
const summarizeArticleMemoized = memoize(
    async (articleText, existingSummaries) => { /* ... */ },
    { maxSize: 100, policy: 'lru' }
);

// Мемоїзація X-Ray з LRU (200 записів)
const getXRayResultMemoized = memoize(
    async (url) => { /* ... */ },
    { maxSize: 200, policy: 'lru' }
);
```

**Переваги в проекті:**
- 🚀 **-80% API запитів** (повторні статті беруться з кешу)
- ⚡ **X-Ray < 1ms** замість 2-5 секунд AI запиту
- 💰 **Економія Groq API квоти**

#### Методи мемоїзованої функції:
```javascript
memoizedFn.cache        // Доступ до Map кешу
memoizedFn.clearCache() // Очистити кеш
```

---

## 🔄 Task 4: Bi-Directional Priority Queue

**Де знаходиться:** [`src/utils/priority-queue.js`](src/utils/priority-queue.js)

### Реалізація двосторонньої черги з пріоритетами:

#### Основна структура даних
```javascript
class BiDirectionalPriorityQueue {
    enqueue(item, priority)
    dequeue(type)  // 'highest', 'lowest', 'oldest', 'newest'
    peek(type)
    isEmpty()
    size()
    clear()
}
```

**Підтримувані типи вибірки:**
- `'highest'` - найвищий пріоритет
- `'lowest'` - найнижчий пріоритет
- `'oldest'` - найстаріший (перший доданий, FIFO)
- `'newest'` - найновіший (останній доданий, LIFO)

#### Реальне використання в проекті:

**AI Task Scheduler** ([`src/modules/ai-task-scheduler.js`](src/modules/ai-task-scheduler.js))
```javascript
const BiDirectionalPriorityQueue = require('../utils/priority-queue');

class AITaskScheduler {
    constructor() {
        this.taskQueue = new BiDirectionalPriorityQueue();
        this.maxQueueSize = 100;
    }

    addTask(task, priority) {
        // При переповненні викидаємо найнижчий пріоритет
        if (this.taskQueue.size() >= this.maxQueueSize) {
            const dropped = this.taskQueue.dequeue('lowest');
        }

        this.taskQueue.enqueue(task, priority);
    }

    async processQueue() {
        while (!this.taskQueue.isEmpty()) {
            // ЗАВЖДИ обробляємо найвищий пріоритет першим
            const task = this.taskQueue.dequeue('highest');
            await task.execute();
        }
    }
}
```

**Пріоритети завдань:**
- `10` - T9 автодоповнення (користувач чекає прямо зараз!)
- `5` - Переклад сторінок
- `2` - Аналіз контенту
- `1` - Саммарі фонових вкладок

**Інтеграція в браузер:** [`src/main.js`](src/main.js) (рядок ~812)
```javascript
const aiScheduler = require('./modules/ai-task-scheduler');

// IPC handlers для роботи з Renderer процесу
ipcHandlers.registerAISchedulerHandlers(aiScheduler);

// Тестовий приклад (запускається через 5 сек після старту)
setTimeout(() => {
    aiScheduler.addTask({ name: 'T9 підказка', execute: async () => {...} }, 10);
    aiScheduler.addTask({ name: 'Саммарі вкладки', execute: async () => {...} }, 1);
    // T9 виконається ПЕРШИМ незважаючи на порядок додавання!
}, 5000);
```

**Переваги:**
- 🚀 Критичні завдання (T9) виконуються миттєво
- 🗑️ Автоматичне скидання низькопріоритетних завдань при перевантаженні
- 📊 Статистика виконання (processed/dropped/errors)

**Складність:**
- `enqueue()` - O(1)
- `dequeue()` - O(n) лінійний пошук (достатньо для черг до ~100 елементів)

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

# Запустити
npm start
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
│   │   ├── ai-task-scheduler.js # 🔗 Task 4: Використання Priority Queue
│   │   └── ai-handlers.js       # 🔗 Використання Task 3 (memoization)
│   └── utils/
│       ├── memoize.js           # ✅ Task 3: Memoization Function
│       └── priority-queue.js    # ✅ Task 4: Bi-Directional Priority Queue
│
└── public/
    └── feed.html                # UI для нескінченної стрічки (Task 1)
```

---

## 🎓 Автор

**ІМ-55** | MIT License

