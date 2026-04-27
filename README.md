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

## Таски 1-7 І Куски Коду З Проєкту

### Task 1. Generators and Iterators

Де: `src/modules/ai-feed.js`

```javascript
function* roundRobinSourceGenerator(sources) {
  let index = 0;
  while (true) {
    yield sources[index];
    index = (index + 1) % sources.length;
  }
}

async function* infiniteArticleGenerator(categories = ['all'], customSources = []) {
  // ... безперервне отримання і yield статей
}
```

### Task 2. Project Setup

Де: `.gitignore`, `package.json`, `LICENSE`, `src/utils/*`, `examples/*`

```json
{
  "name": "browserx",
  "scripts": {
    "start": "npm run build:css && electron .",
    "build": "npm run build:css && electron-builder --win"
  },
  "author": "Stefect",
  "license": "MIT"
}
```

### Task 3. Memoization Function

Де: `src/utils/memoize.js`

```javascript
const POLICY = { LRU: 'lru', LFU: 'lfu', TIME: 'time', CUSTOM: 'custom' };

function memoized(...args) {
  const key = makeKey(args);
  const now = Date.now();
  clearExpired(now);
  if (cache.has(key)) {
    const meta = cache.get(key);
    if (policy === POLICY.LRU) {
      cache.delete(key);
      cache.set(key, meta);
    }
    return meta.value;
  }
  const value = fn.apply(this, args);
  cache.set(key, { value, accessCount: 1, timestamp: now });
  evictIfNeeded();
  return value;
}
```

### Task 4. Bi-Directional Priority Queue

Де: `src/utils/priority-queue.js`

```javascript
const MODE = Object.freeze({ HIGHEST: 'highest', LOWEST: 'lowest', OLDEST: 'oldest', NEWEST: 'newest' });

peek(type = MODE.HIGHEST) {
  const index = this._findIndex(type);
  return index !== -1 ? this.items[index].item : null;
}

dequeue(type = MODE.HIGHEST) {
  const index = this._findIndex(type);
  return index !== -1 ? this.items.splice(index, 1)[0].item : null;
}
```

### Task 5. Async Array Function Variants

Де: `src/utils/async-array.js`

```javascript
async function asyncMap(arr, asyncFn, options = {}) {
  const { signal, concurrency = Infinity } = options;
  const limit = normalizeLimit(concurrency, arr.length);
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      ensureNotAborted(signal, 'asyncMap');
      const index = nextIndex++;
      if (index >= arr.length) return;
      results[index] = await asyncFn(arr[index], index, arr);
    }
  });
  await Promise.all(workers);
  return results;
}
```

### Task 6. Large Data Processing (Streams / Async Iterators)

Де: `src/modules/ai-feed.js`, `src/modules/ai/feed-handlers.js`

```javascript
for await (const article of currentFeedGenerator) {
  if (!isFeedRunning) break;
  // інкрементальна обробка елемента
}
```

### Task 7. Reactive Communication (EventEmitter)

Де: `src/modules/reactive-events.js`, `public/js/app/reactive-events.js`

```javascript
function subscribeReactiveEvents(listener) {
  reactiveEventBus.on(REACTIVE_BUS_EVENT, listener);
  return () => reactiveEventBus.off(REACTIVE_BUS_EVENT, listener);
}

function unsubscribeReactiveEvents(listener) {
  reactiveEventBus.off(REACTIVE_BUS_EVENT, listener);
  return true;
}
```

## Актуальний Підсумок

BrowserX виріс із базового Electron-шаблону до модульного браузера з:

- керуванням вкладками через webview
- приватним режимом і Tor-інтеграцією
- AI-пайплайнами та інкрементальною обробкою даних
- набором алгоритмічних утиліт, які можна використовувати окремо від UI

README вище описує не абстрактну архітектуру, а конкретно те, що вже реалізовано у поточному коді репозиторію.
