# BrowserX

BrowserX — експериментальний desktop-браузер на Electron з акцентом на приватність, керування вкладками та додаткові інструменти для щоденної роботи.

## Що всередині

- Кастомне вікно браузера з власним top bar і sidebar
- Вкладки на базі webview
- Історія, нотатки, закладки, збереження сесії
- Перемикання маршрутизації через Tor
- Легка новинна стрічка за категоріями
- Теми й персоналізація нової вкладки

## Поточний стек

- Electron
- Node.js (CommonJS)
- PostCSS + Tailwind

## Швидкий старт

```bash
npm install
npm start
```

Скрипт npm start запускає збірку стилів і потім Electron.

## Корисні команди

```bash
npm run build:css
npm run build:css:watch
npm run dev
npm run build
npm run build:portable
```

## Конфігурація

1. Створіть файл .env у корені проєкту.
2. Додайте ключ:

```env
GROQ_API_KEY=your_key_here
```

У разі відсутнього ключа застосунок запускається, але частина AI-обробників буде недоступна.

## Ключові директорії

```text
src/
  main.js                 main process
  preload.js              bridge між renderer і main
  shared/ipc-channels.js  централізовані IPC-канали
  modules/                модулі доменної логіки
  utils/                  загальні утиліти

public/
  index.html              основний UI
  js/app/                 модульний renderer-код
  css/                    стилі
```

## Нотатки по запуску

- Під Windows рекомендується PowerShell 7+.
- Якщо npm run dev не стартує через shell-особливості, запускайте двома командами в окремих терміналах:

```bash
npm run build:css:watch
npm start
```

## Збірка релізу

Проєкт використовує electron-builder.

```bash
npm run build
```

Артефакти зʼявляються у директорії dist.

## Статус

Репозиторій у стані активного розвитку: базові модулі стабільні, паралельно йде поступова шліфовка структури, логування та документації.

## Коміт-Структура

Лабораторні таски 8 і 9 розбиті на окремі логічні кроки: ядро, демо-обгортки та наступні доведення історії комітів до читабельного вигляду.

## З Чого Починалося

Проєкт стартував як ідея зробити практичний desktop-браузер на Electron з акцентом на:

- контроль над вкладками через `webview`
- приватність і Tor-маршрутизацію
- модульну архітектуру main/renderer замість моноліту

Початковий каркас будувався навколо `src/main.js`, `src/modules/tab-manager.js` і `public/index.html`.

Приклад ядра керування вкладками, з якого починалась логіка інтерфейсу:

```javascript
function createTab(mainWindow, url = null) {
  const targetUrl = url || null;
  const newTab = { id: nextTabId, url: targetUrl, title: url ? 'Loading...' : 'New tab', navigationHistory: [], currentIndex: 0 };
  tabs.push(newTab);
  activeTabId = newTab.id;
  const webviewHTML = createWebviewElement(nextTabId, targetUrl);
  mainWindow.webContents.send(IPC.WEBVIEW.CREATE, { tabId: nextTabId, html: webviewHTML, url: targetUrl });
  mainWindow.webContents.send(IPC.WEBVIEW.SWITCH, { tabId: nextTabId });
  nextTabId++;
  return { id: newTab.id, url: targetUrl, title: newTab.title };
}
```

## Що Застосовувалося

У розробці використовувались такі підходи і технології:

- Electron + Node.js (CommonJS) для desktop-runtime
- чіткий поділ на `main process` і `renderer`
- IPC-контракти через `src/shared/ipc-channels.js`
- утилітарний шар у `src/utils/` для перевикористовуваних алгоритмів
- PostCSS + Tailwind для UI-стилів
- поетапний рефакторинг через маленькі логічні коміти

## Як Йшла Розробка

Розробка рухалась ітеративно, від базової функціональності до більш складних сценаріїв:

1. Базовий браузерний shell: вікно, вкладки, навігація, адресний рядок.
2. Стан і продуктивність: історія, сесії, локальні модулі зберігання.
3. Приватність: інтеграція Tor, захист від витоків, окремі перевірочні скрипти.
4. AI-функції: стрічка, узагальнення контенту, асинхронний pipeline обробки.
5. Алгоритмічні таски: memoization, двостороння черга пріоритетів, async-array API, reactive events.
6. Поліровка: cleanup коду, зменшення шуму логів/коментарів, структурні рефактори.

## Технічні Аспекти

### 1. IPC І Ролі Процесів

- `main` відповідає за вікна, мережеві політики, Tor, файловий і системний доступ.
- `renderer` відповідає за DOM, панелі, взаємодію користувача.
- обмін робиться через `ipcMain.handle/on` і `ipcRenderer.invoke/on` за централізованими каналами.

### 2. Модульність

- Домени винесені в `src/modules/`.
- Алгоритми і утиліти - у `src/utils/`.
- UI-логіка сегментована у `public/js/app/`.

### 3. Асинхронність І Потокова Обробка

- Для feed-завдань використані async generators і `for await`.
- Для масивів створені Promise і callback варіанти з підтримкою скасування.

### 4. Реактивна Модель Подій

- Події мережі/завантажень буферизуються і транслюються в UI.
- Є механізми `subscribe`, `unsubscribe`, лічильник підписників та cleanup.

## Реалізація всіх 9 тасок

### Task 1 — Generators and Iterators

**Файл:** `src/modules/ai-feed.js`

Sync iterator для ротації джерел і async generator для нескінченної новинної стрічки. Генератор ітерує по джерелах по колу, отримує статті, фільтрує вже бачені через `Set` і `yield`-ить по одній без завантаження всіх одразу.

```javascript
// Sync iterator — ротує джерела по колу
function createFeedSourceRotationIterator(sources) {
  let index = 0;
  return {
    next() {
      const current = sources[index];
      index = (index + 1) % sources.length;
      return { value: current, done: false };
    }
  };
}

// Async generator — нескінченна стрічка, yield по одній статті
async function* infiniteArticleGenerator(categories = ['all']) {
  const sourceIterator = createFeedSourceRotationIterator(NEWS_SOURCES);
  const seenKeys = new Set();
  while (true) {
    const source = sourceIterator.next().value;
    const articles = await SOURCE_FETCHERS[source.name]();
    for (const article of articles) {
      const key = article.url || `${source.name}-${article.title}`;
      if (!seenKeys.has(key) && matchesCategory(article)) {
        seenKeys.add(key);
        yield article;
      }
    }
    await sleep(1800);
  }
}
```

**Де використовується:** `main.js` передає генератор у `registerAIHandlers`, де він споживається через `for await` в IPC-хендлері `start-feed` і поштучно відправляє статті в renderer.

---

### Task 2 — Project Setup

**Файли:** `package.json`, `.gitignore`, `LICENSE`, `src/utils/`, `examples/`

Інфраструктура проекту: скрипти збірки, electron-builder конфіг, ліцензія MIT, `.env` для `GROQ_API_KEY`. Модульна структура `src/modules/` + `src/utils/` + `src/http/` закладена тут.

```json
{
  "name": "browserx",
  "scripts": {
    "start": "npm run build:css && electron .",
    "build": "npm run build:css && electron-builder --win",
    "demo:lab8": "node examples/lab8-auth-proxy-demo.js",
    "demo:lab9": "node examples/lab9-logging-decorator-demo.js"
  },
  "author": "Stefect",
  "license": "MIT"
}
```

---

### Task 3 — Memoization Function

**Файл:** `src/utils/memoize.js`

Чотири стратегії витіснення: **LRU** (найдавніший використаний), **LFU** (найрідше використаний), **TIME** (по TTL), **CUSTOM** (своя функція-компаратор). Key resolver не `JSON.stringify` — використовує `WeakMap` для об'єктів щоб уникнути витоків пам'яті.

```javascript
const POLICY = Object.freeze({ LRU: 'lru', LFU: 'lfu', TIME: 'time', CUSTOM: 'custom' });

function memoized(...args) {
  const key = makeKey(args);
  const now = Date.now();
  clearExpired(now);
  if (cache.has(key)) {
    const meta = cache.get(key);
    meta.accessCount += 1;
    if (policy === POLICY.LRU) { cache.delete(key); cache.set(key, meta); }
    return meta.value;
  }
  const value = fn.apply(this, args);
  cache.set(key, { value, accessCount: 1, timestamp: now });
  evictIfNeeded();
  return value;
}
```

**Де використовується:** `src/modules/ai-handlers.js` — мемоізує `summarizeArticle` щоб не дублювати Groq-запити для однакових заголовків статей (LRU, maxSize: 100).

---

### Task 4 — Bi-Directional Priority Queue

**Файл:** `src/utils/priority-queue.js`

Черга з чотирма режимами вибірки: `HIGHEST` / `LOWEST` (по значенню пріоритету), `OLDEST` / `NEWEST` (по порядку вставки). Кожен елемент зберігає `{ item, priority, order }` де `order` — монотонний лічильник вставок.

```javascript
class BrowserXTaskQueue {
  static MODES = Object.freeze({
    HIGHEST: 'highest', LOWEST: 'lowest',
    OLDEST: 'oldest',   NEWEST: 'newest'
  });

  enqueue(item, priority = 0) {
    this.items.push({ item, priority: Number(priority), order: this.insertCounter++ });
    return this.items.length;
  }

  dequeue(type = BrowserXTaskQueue.MODES.HIGHEST) {
    const index = this._findIndex(type);
    return index !== -1 ? this.items.splice(index, 1)[0].item : null;
  }
}
```

**Де використовується:** `src/modules/ai-task-scheduler.js` — планувальник AI-задач. Термінові задачі (переклад статті яку відкрив юзер) йдуть з вищим пріоритетом, фонові фонові завдання — нижчим.

---

### Task 5 — Async Array Function Variants

**Файл:** `src/utils/async-array.js`

`asyncMap`, `asyncFilter`, `asyncReduce`, `asyncFilterMap` — кожна в трьох варіантах: **Promise**, **callback** (Node.js-стиль), **async generator**. Підтримка `AbortSignal` для скасування та параметр `concurrency` для контролю паралельності.

```javascript
async function asyncMap(arr, asyncFn, options = {}) {
  const { signal, concurrency = Infinity } = options;
  const limit = normalizeConcurrency(concurrency);
  let nextIndex = 0;
  const results = new Array(arr.length);

  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (true) {
      throwIfAborted(signal);
      const index = nextIndex++;
      if (index >= arr.length) return;
      results[index] = await asyncFn(arr[index], index, arr);
    }
  });

  await Promise.all(workers);
  return results;
}
```

**Де використовується:** `src/modules/ai-task-scheduler.js` для паралельної обробки черги задач; приклади у `examples/`.

---

### Task 6 — Large Data Processing (Streams / Async Iterators)

**Файли:** `src/utils/large-data-stream.js`, `src/modules/ai-feed.js`

Два сценарії: нескінченний async generator новинної стрічки обробляє статті інкрементально через `for await` без буферизації всього масиву. `large-data-stream.js` стрімить великі NDJSON-файли шматками через `readline` — для аналізу historії без завантаження в пам'ять.

```javascript
// Стрімінг historії через readline
async function* readNdjsonLines(filePath) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

// Споживання нескінченного feed
for await (const article of currentFeedGenerator) {
  if (!isFeedRunning) break;
  const { translatedTitle, summary } = await cachedSummarizeArticle(article.title);
  mainWindow.webContents.send('feed-article', { ...article, translatedTitle, summary });
}
```

**Де використовується:** IPC-хендлер `analyze-history-stream` в `ipc-handlers.js` та `start-feed` в `ai-handlers.js`.

---

### Task 7 — Reactive Communication (EventEmitter)

**Файл:** `src/modules/reactive-events.js`

`EventEmitter` з буфером останніх 50 подій, дедуплікацією по хосту (cooldown 5 секунд), автоматичним `subscribe`/`unsubscribe` що повертає функцію відписки. Відстежує трекери та навантаження вкладок і пушить події через IPC в renderer.

```javascript
function subscribeReactiveEvents(listener) {
  reactiveEventBus.on(REACTIVE_BUS_EVENT, listener);
  return () => reactiveEventBus.off(REACTIVE_BUS_EVENT, listener);  // unsubscribe
}

// В main.js — підписка з автоматичним forwarding у renderer
const unsubscribe = subscribeReactiveEvents((event) => {
  mainWindow.webContents.send('reactive-event', event);
});
```

**Де використовується:** `main.js` ініціалізує і підписується, renderer отримує події через `ipcRenderer.on('reactive-event')` і оновлює UI лічильника трекерів.

---

### Task 8 — Auth Proxy (Proxy pattern + DI)

**Файли:** `src/http/base-client.js`, `src/http/proxies/`, `src/services/github-service.js`

Три незалежні шари де жоден не знає про конкретну реалізацію іншого. `BaseHttpClient` — обгортка `fetch`, нічого не знає про auth. Кожен проксі приймає `client` параметром і реалізує той самий інтерфейс `{ request(req) }`. `GitHubService` отримує клієнт через конструктор.

```javascript
// Складання ззовні — сервіс не знає що всередині
const github = new GitHubService(
  new RateLimitProxy(
    new LoggingProxy(
      new AuthProxy(new BaseHttpClient(), {
        strategy: 'oauth',           // або 'jwt', 'apiKey'
        credentials: { accessToken: process.env.GITHUB_TOKEN },
        refreshCredentials: async () => { /* refresh logic */ }
      })
    ),
    { requestsPerInterval: 30, intervalMs: 60000 }
  )
);
```

**Де використовується реально:** `src/modules/news-fetcher.js` — `LoggingProxy + RateLimitProxy` на запитах до Reddit/HackerNews/DevTo. `src/modules/ai-feed.js` — `RateLimitProxy` на нескінченному генераторі.

---

### Task 9 — Logging Decorator

**Файл:** `src/utils/log-decorator.js`

`createLogDecorator(options)` повертає функцію `decorate(fn, config)`. Рівні `DEBUG / INFO / ERROR`: при `level: 'ERROR'` мовчить на успіх і логує тільки виключення. Перевіряє `result.then` — якщо Promise, чекає async результат; якщо sync — логує одразу. Завжди ISO timestamp, не `Date.now()`.

```javascript
const log = createLogDecorator({
  level: 'DEBUG',
  formatter: (entry) =>
    `[AI] ${entry.event} ${entry.label}` +
    (entry.durationMs != null ? ` ${entry.durationMs}ms` : '') +
    (entry.error ? ` — ${entry.error.message}` : '')
});

// Обгортає і sync і async прозоро
const loggedFn = log(asyncFn, { label: 'summarize' });
// → [AI] return summarize 847ms
// → [AI] error summarize 3001ms — Request timeout
```

**Де використовується реально:** `src/modules/ai-handlers.js` — обгортає `summarizeArticle` перед передачею в `memoize`, щоб кожен реальний Groq-виклик логувався з точним часом.
