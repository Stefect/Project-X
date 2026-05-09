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
- Node.js (ESM)
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
  modules/                модулі доменної логіки
  utils/                  загальні утиліти
  http/                   http-клієнт та проксі-шари
  app/                    вікна, меню, контекст

public/
  index.html              основний UI
  js/                     renderer-скрипти
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
  mainWindow.webContents.send('webview-create', { tabId: nextTabId, html: webviewHTML, url: targetUrl });
  mainWindow.webContents.send('webview-switch', { tabId: nextTabId });
  nextTabId++;
  return { id: newTab.id, url: targetUrl, title: newTab.title };
}
```

## Що Застосовувалося

У розробці використовувались такі підходи і технології:

- Electron + Node.js (ESM) для desktop-runtime
- чіткий поділ на `main process` і `renderer`
- IPC-контракти через `ipcMain.handle/on` і `ipcRenderer.invoke/on`
- утилітарний шар у `src/utils/` для перевикористовуваних алгоритмів
- PostCSS + Tailwind для UI-стилів
- поетапний рефакторинг через маленькі логічні коміти

## Як Йшла Розробка

Розробка рухалась ітеративно, від базової функціональності до більш складних сценаріїв:

1. Базовий браузерний shell: вікно, вкладки, навігація, адресний рядок.
2. Стан і продуктивність: історія, сесії, локальні модулі зберігання.
3. Приватність: інтеграція Tor, захист від витоків, окремі перевірочні скрипти.
4. AI-функції: стрічка, узагальнення контенту, асинхронний pipeline обробки.
5. Утиліти: memoization, черга пріоритетів, async-array API, reactive events.
6. Поліровка: cleanup коду, зменшення шуму логів/коментарів, структурні рефактори.

## Технічні Аспекти

### 1. IPC І Ролі Процесів

- `main` відповідає за вікна, мережеві політики, Tor, файловий і системний доступ.
- `renderer` відповідає за DOM, панелі, взаємодію користувача.
- обмін робиться через `ipcMain.handle/on` і `ipcRenderer.invoke/on`.

### 2. Модульність

- Домени винесені в `src/modules/`.
- Алгоритми і утиліти - у `src/utils/`.
- UI-логіка сегментована у `public/js/`.

### 3. Асинхронність І Потокова Обробка

- Для feed-завдань використані async generators і `for await`.
- Для масивів створені Promise і callback варіанти з підтримкою скасування.

### 4. Реактивна Модель Подій

- Події мережі/завантажень буферизуються і транслюються в UI.
- Є механізми `subscribe`, `unsubscribe`, лічильник підписників та cleanup.

