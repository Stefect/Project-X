# BrowserX — Підготовка до захисту

---

## ВСТУПНА ЧАСТИНА — говорити це першим

> *"Ідея проєкту — браузер, у якому анонімність є вбудованою, а не плагіном. Більшість людей ставлять розширення або платять за VPN. Ми написали браузер, який сам керує мережею Tor, сам блокує DNS-витоки, WebRTC і Geolocation — без жодних сторонніх сервісів, яким треба довіряти. Паралельно реалізовано набір алгоритмічних структур: черга з пріоритетами, кеш із витісненням, асинхронна обробка масивів із concurrency-контролем та HTTP-клієнт на базі патерну Proxy."*

---

## 1. Мета проєкту

**BrowserX** — повноцінний desktop-браузер власної розробки на Electron.

Три ключові цілі:
1. **Приватність без компромісів** — Tor, блокування DNS/WebRTC/Geolocation витоків
2. **AI-продуктивність** — T9 автодоповнення адреси, пріоритетний планувальник запитів до LLM
3. **Демонстрація алгоритмів** — Priority Queue, Memoize, AsyncArray, Proxy Pattern, Stream Processing — власна реалізація, без бібліотек

---

## 2. Стек технологій

| Компонент | Технологія | Навіщо |
|---|---|---|
| Оточення виконання | **Electron 40 + Node.js** | Desktop-додаток з доступом до ОС |
| Рушій рендерингу | **Chromium (через webview tag)** | Відображення вебсторінок |
| Мова | **JavaScript ESM** | Сучасний стандарт, Tree-shaking |
| Стилі | **Tailwind CSS + PostCSS** | Утилітарні класи, компіляція |
| AI | **Groq API (Llama 3)** | Хмарний LLM з низькою затримкою |
| Анонімність | **Tor Expert Bundle** | SOCKS5 проксі, ретрансляція через Tor |
| Збірка | **electron-builder** | `.exe` інсталятор + Portable |

---

## 3. Архітектура — три ізольовані процеси

Electron — це **три окремі JS-середовища**, що спілкуються виключно через IPC (Inter-Process Communication). Це не одна програма, це три:

```
┌─────────────────────────────────────────────────────────┐
│  MAIN PROCESS  (src/main.js)                            │
│  Node.js + Electron API                                 │
│  • Tor керування          • Завантаження файлів         │
│  • Сесії, проксі          • Меню, вікна                 │
│  • Збереження даних       • Планувальник AI задач       │
│  Повний доступ до ОС                                    │
└──────────────┬──────────────────────────┬───────────────┘
               │ IPC (ipcMain/ipcRenderer) │
               ▼                          ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  RENDERER PROCESS        │  │  WEBVIEW / PRELOAD        │
│  (public/index.html)     │  │  (src/preload.cjs)        │
│  UI, вкладки, панелі     │  │  Ізольований контекст     │
│  Лише DOM, без ОС API    │  │  contextBridge            │
│                          │  │  window.api / window.     │
│                          │  │  browserStorage           │
└──────────────────────────┘  └──────────────────────────┘
```

**Де це в коді:**
- Splash window (ізольований) → `main.js:57-58` — `nodeIntegration: false`, `contextIsolation: true`
- Main browser window → `main.js:108-110` — `nodeIntegration: true`, `webviewTag: true`
- IPC-маршрутизація Tor → `main.js:528-533` — `ipcMain.handle('toggle-tor')`, `ipcMain.handle('get-tor-status')`
- Запуск після app.ready → `main.js:215` — `app.whenReady().then(async () => {`
- Захист від другого екземпляра → `main.js:206` — `app.requestSingleInstanceLock()`

**Ключовий принцип:** Renderer не має прямого доступу до ОС. Він надсилає іменований IPC-запит — Main перевіряє і виконує.

---

## 4. Як працює Tor — детально з посиланнями на код

### Що таке Tor?

**Tor** (The Onion Router) — мережа анонімізації. Трафік шифрується у **3 шари** і проходить через 3 незалежних вузли-релея:

```
 Ваш комп'ютер
       │  шифрується 3 рази
       ▼
 [Вхідний вузол — знає ТІЛЬКИ вашу IP]
       │  знімається 1 шар
       ▼
 [Середній вузол — не знає ані відправника, ані куди]
       │  знімається ще 1 шар
       ▼
 [Вихідний вузол — знає ТІЛЬКИ кінцевий сайт]
       │
       ▼
   Сайт (бачить IP вихідного вузла, не вашу)
```

Жоден вузол не знає одночасно і хто ви, і куди ви йдете — **математично доведена анонімність**.

---

### Крок 1 — Запуск процесу Tor

📄 **`src/modules/tor-manager.js`, рядки 66–116**

```js
// рядок 66
function startTor(exitCountry = null, options = {}) {
  // рядок 108 — spawn: запускаємо tor.exe як окремий процес ОС
  torProcess = spawn(torPath, [
    '--DataDirectory', torDataDir,  // рядок 103 — ізольована папка ТІЛЬКИ у userData
    '--GeoIPFile', geoipPath,       // база IP→країна для вибору вузлів
    '--GeoIPv6File', geoip6Path
  ], {
    windowsHide: true               // рядок 112 — tor.exe без консолі на Windows
  });
}
```

**Чому `--DataDirectory` важливо:** без нього Tor записує ключі та кеш у директорію бінарника або CWD — потенційно у папку встановлення. Ми вказуємо `%APPDATA%/BrowserX/tor-data/` — ізольоване місце з правами поточного користувача.

---

### Крок 2 — Bootstrap: чекаємо поки Tor знайде ланцюжок

📄 **`src/modules/tor-manager.js`, рядки 44–63**

```js
// рядок 44 — парсимо кожен рядок stdout Tor
function parseBootstrapLine(line) {
  const match = line.match(/Bootstrapped (\d+)%(?:\s*\(([^)]+)\))?:?\s*(.*)/);
  // рядок 48 — зберігаємо прогрес
  bootstrapProgress = parseInt(match[1], 10);
  // рядок 53 — надсилаємо прогрес-бар у UI через IPC
  mainWindowRef.webContents.send('tor-bootstrap-progress', {
    progress: bootstrapProgress,
    status: bootstrapStatus,
    ready: bootstrapProgress === 100  // рядок 56
  });
}
```

📄 **`src/modules/tor-manager.js`, рядки 118–136**

```js
// рядок 118 — буферизація: chunk може розірватись посередині рядка!
let stdoutBuf = '';
torProcess.stdout.on('data', (data) => {
  stdoutBuf += data.toString('utf8');
  const lines = stdoutBuf.split('\n');
  stdoutBuf = lines.pop(); // рядок 122 — незавершений рядок лишаємо в буфері
  for (const line of lines) {
    parseBootstrapLine(line);
    if (bootstrapProgress === 100 && !isTorReady) {
      isTorReady = true;  // тільки тут Tor вважається готовим
    }
  }
});
```

**Bootstrap** — Tor встановлює ланцюжок вузлів (circuit). Займає 10–30 секунд. **Не вмикаємо проксі** поки `bootstrapProgress < 100`.

---

### Крок 3 — Верифікація: перевіряємо чи порт реально слухає

📄 **`src/modules/tor-manager.js`, рядки 25–41 та 223–231**

```js
// рядок 25 — перевіряємо net.Server, а не просто ping
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      resolve(err.code === 'EADDRINUSE' ? false : true);
      // EADDRINUSE = порт зайнятий = Tor слухає = ОК
    });
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
  });
}

// рядок 223 — при ввімкненні Tor перевіряємо порт 9050
const portAvailable = await checkPortAvailable(socksPort);
if (portAvailable) {
  // порт ВІЛЬНИЙ = Tor насправді НЕ слухає = щось пішло не так
  return { status: false, message: 'Помилка: Tor процес не відповідає' };
}
```

---

### Крок 4 — Очищення cookies та кешу

📄 **`src/modules/tor-manager.js`, рядки 237–252**

```js
// рядок 237 — ПЕРЕД активацією проксі очищуємо всі сесійні дані
await Promise.all([
  defaultSes.clearStorageData({ storages: [
    'cookies', 'localstorage', 'indexdb', 'cachestorage', 'filesystem', ...
  ]}),
  webviewSes.clearStorageData({ storages: storageTypes })  // і webview-сесія теж
]);
```

**Чому:** якщо зайти на сайт БЕЗ Tor → він збереже cookie → потім ввімкнути Tor → той самий cookie піде у запиті → сайт вас ідентифікує. Очищення рве цей зв'язок.

---

### Крок 5 — Активація SOCKS5 проксі

📄 **`src/modules/tor-manager.js`, рядки 255–266**

```js
// рядок 255 — застосовуємо до defaultSession (main process запити)
await defaultSes.setProxy({
  proxyRules: 'socks5://127.0.0.1:9050',  // рядок 258
  proxyBypassRules: '<local>'              // рядок 259 — 192.168.x.x без Tor
});
// рядок 262 — і до webview-сесії (сторінки у вкладках)
await webviewSes.setProxy({
  proxyRules: 'socks5://127.0.0.1:9050',
  proxyBypassRules: '<local>'
});
```

**Дві сесії — критично:** Electron має окрему сесію для main process і для webview. Якщо встановити проксі лише в одну — частина трафіку все одно піде напряму.

---

### Крок 6 — Вимкнення: повернення до прямого з'єднання

📄 **`src/modules/tor-manager.js`, рядки 170–178**

```js
if (isTorActive) {
  await Promise.all([
    defaultSes.setProxy({ mode: 'direct' }),  // рядок 172 — системне з'єднання
    webviewSes.setProxy({ mode: 'direct' })   // рядок 173
  ]);
  isTorActive = false;  // рядок 175
}
```

📄 **`src/main.js`, рядок 343**
```js
app.on('will-quit', () => {
  torManager.stopTor();  // вбиваємо tor.exe при закритті браузера
});
```

---

## 5. Захист від витоків — де в коді

### 5.1 DNS Leak

**Проблема:** HTTP-проксі не захищає DNS. Браузер сам питає системний DNS → провайдер бачить усі домени.

**Рішення:** SOCKS5 передає hostname всередину тунелю. Tor сам резолвить DNS через вихідний вузол.

📄 **`src/modules/privacy-guard.js`, рядок 10**
```js
// Додатковий захист: усі DNS через Tor (крім localhost)
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
```

---

### 5.2 WebRTC Leak

**Проблема:** WebRTC встановлює peer-to-peer UDP з'єднання, **обходячи** SOCKS5 проксі. Сайт може отримати вашу реальну IP через `RTCPeerConnection`.

📄 **`src/modules/privacy-guard.js`, рядки 12–13**
```js
app.commandLine.appendSwitch('enforce-webrtc-ip-permission-check');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
// рядок 15 — логуємо підтвердження
// '[PRIVACY] Policy: disable_non_proxied_udp (blocks direct UDP connections)'
```

Це Chromium-флаг: усі UDP з'єднання, що не йдуть через проксі — заблоковані на рівні рушія.

---

### 5.3 Geolocation Leak

**Проблема:** `navigator.geolocation.getCurrentPosition()` — сайт отримує GPS/WiFi координати незалежно від Tor.

📄 **`src/modules/privacy-guard.js`, рядки 71–98**
```js
const geolocationBlockScript = `
  (function() {
    if (window.__geoLocationPatched) return;  // захист від подвійного виклику
    const fakeGeolocation = {
      getCurrentPosition: function(success, error) {
        error({ code: 1, message: 'User denied Geolocation' });  // PERMISSION_DENIED
      },
      watchPosition: function(success, error) { return -1; }
    };
    Object.defineProperty(navigator, 'geolocation', {  // рядок 95
      get: () => fakeGeolocation,
      configurable: false   // рядок 97 — сайт не може перезаписати!
    });
  })();
`;
// рядок 102 — ін'єктуємо в КОЖЕН webview при ввімкненні Tor
webContents.getAllWebContents().forEach(contents => {
  contents.executeJavaScript(geolocationBlockScript);  // рядок 104
});
```

---

### 5.4 Трекери

📄 **`src/modules/reactive-events.js`, рядки 13–47 та 135–142**
```js
// рядок 13 — список відомих трекерів
const trackerHostMarkers = [
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'facebook.net', 'connect.facebook.net', 'pixel.facebook.com', ...
];

// рядок 135 — перехоплюємо КОЖЕН мережевий запит webview
function setupReactiveNetworkEvents(mainWindow) {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    // рядок 142 — якщо це трекер-домен → відправляємо подію в UI
    if (!isLocal && !isMainFrame && isLikelyTrackerUrl(url)) {
      // повідомлення "Виявлено трекер" у sidebar
    }
    callback({ cancel: false });  // не блокуємо, лише сповіщаємо
  });
}
```

---

### 5.5 IPC безпека (OWASP A01/A03)

📄 **`src/modules/ipc-handlers.js`, рядки 136–145**
```js
ipcMain.handle('open-external', async (event, url) => {
  const ALLOWED_PROTOCOLS = ['http:', 'https:'];  // рядок 137
  const parsed = new URL(String(url));
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    // рядок 141 — 'file://', 'javascript:', 'data:' — заблоковано
    return { success: false, error: 'Protocol not allowed' };
  }
  await shell.openExternal(url);
});
```

📄 **`src/preload.js`, рядки 29–38**
```js
// рядок 29 — лише явні методи, НЕ generic invoke(channel, ...)
predictCompletion: (text) => ipcRenderer.invoke('predict-completion', text),

// рядок 37-38 — контрольований список через contextBridge
contextBridge.exposeInMainWorld('browserStorage', browserStorageAPI);
contextBridge.exposeInMainWorld('api', mainAPI);
```

---

## 6. Паттерни — де в коді

### Proxy Pattern
📄 `src/http/base-client.js` → `src/http/proxies/logging-proxy.js` → `src/http/proxies/rate-limit-proxy.js` → `src/http/proxies/auth-proxy.js`
Кожен клас має метод `request()` — той самий інтерфейс. Клієнт не знає, скільки шарів проксі.

### Priority Queue + AI Scheduler
📄 `src/utils/priority-queue.js` → `src/modules/ai-task-scheduler.js`
Черга з 4 режимами деqueue. Scheduler — максимум 100 задач, при переповненні видаляє найменш пріоритетну.

### Memoize LRU/LFU
📄 `src/utils/memoize.js`
4 стратегії витіснення. LRU — O(1) через Map (insertion order).

### AsyncArray з concurrency
📄 `src/utils/async-array.js`
`asyncMap(arr, fn, { concurrency: 5, signal })` — паралельна обробка з AbortSignal.

### Stream Processing
📄 `src/utils/large-data-stream.js`
NDJSON читається рядково через `readline` — O(1) по пам'яті незалежно від розміру файлу.

---

## 7. Відповіді на питання викладача

**Q: Чим Tor відрізняється від VPN?**
> VPN — один сервер, якому треба довіряти. Провайдер VPN бачить весь трафік. Tor — три незалежних вузли, жоден не знає водночас хто ви і куди ви йдете. Математично: навіть якщо зловмисник контролює вхідний та вихідний вузол одночасно — timing-кореляція вимагає величезних ресурсів і не є тривіальною.

**Q: Чому SOCKS5, а не HTTP-проксі?**
> HTTP-проксі: браузер сам резолвить DNS через системний сервер → DNS leak. SOCKS5: браузер передає hostname у тунель, Tor сам робить DNS через вихідний вузол. Крім того SOCKS5 працює для будь-якого TCP-протоколу, не тільки HTTP.

**Q: Що таке bootstrap у контексті Tor?**
> Bootstrap — процес побудови circuit (ланцюжка). Tor завантажує список ретрансляторів, вибирає 3 вузли в різних країнах, встановлює зашифровані з'єднання по черзі. Лише після 100% браузер починає направляти трафік через цей circuit.

**Q: Що таке WebRTC leak і як ви його блокуєте?**
> WebRTC — API для відеодзвінків. Щоб встановити peer-to-peer з'єднання, він надсилає STUN-запити напряму через UDP, обходячи SOCKS5. Відповідь STUN-сервера містить реальну IP. Ми застосовуємо Chromium-флаг `disable_non_proxied_udp` — усі UDP-пакети, що не йдуть через проксі, блокуються на рівні рушія. Код: `privacy-guard.js:13`.

**Q: Що таке contextIsolation?**
> Без нього renderer (вебсторінка) має прямий доступ до Node.js API — `require('fs')`, `require('child_process')`. Це критична вразливість: XSS у браузері = повний доступ до ОС. `contextIsolation: true` + `contextBridge` ізолює контексти: вебсторінка бачить лише явно виставлені методи.

**Q: Чому дві сесії Electron?**
> `session.defaultSession` — трафік main process (IPC, фонові запити). `session.fromPartition('persist:main')` — трафік webview (сайти у вкладках). Якщо встановити проксі лише в одну, частина запитів піде напряму. Встановлюємо в обидві: `tor-manager.js:255–266`.

**Q: Що таке Priority Queue і навіщо для AI?**
> AI-запити до Groq API асинхронні і повільні. Якщо користувач набирає текст — генеруються десятки запитів. Без черги вони виконуються хаотично і у FIFO-порядку. З Priority Queue: термінові задачі (priority=10) виконуються першими, фонові (priority=1) — витісняються при переповненні.
