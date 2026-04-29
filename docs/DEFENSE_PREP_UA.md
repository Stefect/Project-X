# Захист BrowserX: читабельний план

Це компактний документ для підготовки до захисту з фокусом на код.
Мета: говорити структуровано, показувати конкретні місця в коді, тримати чіткий тайминг.

## Як користуватися документом

1. Якщо маєш 10-12 хв: проходь розділ 1 повністю.
2. Якщо маєш 5-7 хв: бери тільки розділи 1.1, 1.3, 1.4, 1.6, 1.8.
3. Якщо маєш 60-90 сек: використовуй розділ 3.

---

## 1. Основний сценарій захисту (10-12 хв)

### 1.1 Вступ (30-40 сек)

Що сказати:
BrowserX я проєктував як інженерну систему, а не лише як UI-демо. У фокусі три речі: безпека внутрішніх ресурсів, приватність у Tor-режимі та стабільність AI-функцій через memoization.

Ключовий меседж:
Кожна теза нижче має пряме підтвердження у коді.

---

### 1.2 Архітектура і межі відповідальності (1.5-2 хв)

Що показати:
1. Main process як центр керування вікном/сесіями/IPC.
2. Preload як контрольований bridge.
3. Єдиний реєстр IPC-каналів.

Опорні місця в коді:
[Preload API](../src/preload.js#L4-L26)
[Expose у window](../src/preload.js#L43-L44)
[IPC-константи](../src/shared/ipc-channels.js#L1)
[TOR-канали](../src/shared/ipc-channels.js#L48-L58)
[AI-канали](../src/shared/ipc-channels.js#L110-L119)

Рядки коду для показу:
~~~js
const browserStorageAPI = {
  getHistory: (limit) => ipcRenderer.invoke(IPC.HISTORY.GET, limit),
  addBookmark: (url, title, favicon) => ipcRenderer.invoke(IPC.BOOKMARKS.ADD, { url, title, favicon }),
  saveNote: (text, url) => ipcRenderer.send(IPC.NOTES.SAVE, { text, url })
};

contextBridge.exposeInMainWorld('browserStorage', browserStorageAPI);
contextBridge.exposeInMainWorld('api', mainAPI);
~~~

Переходна фраза:
Далі покажу, як ця архітектура працює в критичних сценаріях безпеки та приватності.

---

### 1.3 Безпека внутрішніх ресурсів (1.5-2 хв)

Що сказати:
1. Для internal-сторінок використовується app:// протокол.
2. Є перевірка шляху, яка блокує вихід за межі public.
3. Для webview-партиції реєструється той самий протокол.

Опорні місця в коді:
[Privileged схема app://](../src/main.js#L8-L17)
[appProtocolHandler](../src/main.js#L223-L233)
[Реєстрація в main session](../src/main.js#L233)
[Реєстрація в persist:main](../src/main.js#L235)

Рядки коду для показу:
~~~js
const appProtocolHandler = (request) => {
  const { pathname } = new URL(request.url);
  const resolved = path.resolve(path.join(publicDir, pathname));
  if (!resolved.startsWith(publicDir + path.sep) && resolved !== publicDir) {
    return new Response('Not Found', { status: 404 });
  }
  return net.fetch('file://' + resolved);
};
~~~

Важливий коментар (чесно для комісії):
У головному BrowserWindow зараз компромісні налаштування для MVP.
[webPreferences main window](../src/main.js#L107-L110)

---

### 1.4 Приватність і Tor pipeline (2-2.5 хв)

Що сказати:
1. Tor вмикається не прапорцем, а через послідовний pipeline перевірок.
2. Перед SOCKS5 є валідація готовності Tor і санітизація storage.
3. Геолокація блокується у два шари: permission + runtime patch.

Опорні місця в коді:
[toggleTor вхідна точка](../src/modules/tor-manager.js#L176)
[Перевірка isTorReady](../src/modules/tor-manager.js#L220-L228)
[Перевірка порту 9050](../src/modules/tor-manager.js#L232-L239)
[Очищення storage двох сесій](../src/modules/tor-manager.js#L263-L264)
[SOCKS5 в обох сесіях](../src/modules/tor-manager.js#L273-L278)
[Permission gate geolocation](../src/main.js#L245-L259)
[Geolocation patch script](../src/main.js#L265-L306)
[Інʼєкція patch](../src/main.js#L308-L309)

Рядки коду для показу:
~~~js
await Promise.all([
  defaultSes.clearStorageData({ storages: storageTypes }),
  webviewSes.clearStorageData({ storages: storageTypes })
]);

await Promise.all([
  defaultSes.setProxy({ proxyRules: 'socks5://127.0.0.1:9050', proxyBypassRules: '<local>' }),
  webviewSes.setProxy({ proxyRules: 'socks5://127.0.0.1:9050', proxyBypassRules: '<local>' })
]);
~~~

Рядки коду для показу (геолокація):
~~~js
if (permission === 'geolocation') {
  const isTorEnabled = torManager.isTorEnabled();
  if (isTorEnabled) {
    callback(false);
    return;
  }
}
callback(true);
~~~

Переходна фраза:
Після безпеки і приватності покажу, як вирішено продуктивність AI-функцій.

---

### 1.5 Мемоізація в AI-флоу (1.5-2 хв)

Що сказати:
1. Є універсальна memoize-функція з policy/ttl/statistics.
2. Мемоізація реально підключена до AI feed і describe-url.
3. Це зменшує дублікати AI-викликів і покращує latency.

Опорні місця в коді:
[memoize: policy і ttl](../src/utils/memoize.js#L10-L11)
[memoize: eviction logic](../src/utils/memoize.js#L54-L79)
[memoize: hit/miss](../src/utils/memoize.js#L102-L116)
[memoize: stats](../src/utils/memoize.js#L131)
[cachedSummarizeArticle](../src/modules/ai/feed-handlers.js#L66-L69)
[cachedSummarizeArticle у race](../src/modules/ai/feed-handlers.js#L93-L96)
[cachedDescribeUrl](../src/modules/ai/describe-url-handler.js#L83-L93)

Рядки коду для показу:
~~~js
const policy = typeof options.policy === 'string' ? options.policy.toLowerCase() : 'lru';
const ttl = Number.isFinite(options.ttl) && options.ttl > 0 ? options.ttl : 60000;
const stats = { hits: 0, misses: 0, evictions: 0 };
~~~

Рядки коду для показу (інтеграція):
~~~js
const cachedSummarizeArticle = memoize(
  (title) => summarizeArticle(title, groqClient),
  { maxSize: 100, policy: 'lru' }
);

const result = await Promise.race([
  cachedSummarizeArticle(article.title),
  new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 5000))
]);
~~~

---

### 1.6 Async-ітератори і контроль росту памʼяті (1-1.5 хв)

Що сказати:
1. Стрічка статей працює через async generator.
2. Джерела обходяться round-robin.
3. Є дедуплікація і обмеження розміру відстежуваного набору URL.

Опорні місця в коді:
[roundRobinSourceGenerator](../src/modules/ai-feed.js#L22-L30)
[infiniteArticleGenerator](../src/modules/ai-feed.js#L99-L168)
[MAX_TRACKED_ARTICLE_URLS](../src/modules/ai-feed.js#L11)
[Dedup + cleanup](../src/modules/ai-feed.js#L112-L154)
[consumeGeneratorWithTimeout](../src/modules/ai-feed.js#L169-L195)

Рядки коду для показу:
~~~js
const fetchedArticles = new Set();
const fetchedOrder = [];

if (fetchedArticles.has(articleKey)) continue;

fetchedArticles.add(articleKey);
fetchedOrder.push(articleKey);

if (fetchedOrder.length > MAX_TRACKED_ARTICLE_URLS) {
  const staleKey = fetchedOrder.shift();
  if (staleKey) fetchedArticles.delete(staleKey);
}
~~~

---

### 1.7 Дані і цілісність сесії (40-60 сек)

Що сказати:
1. Є зрозуміла модель даних у storage-модулі.
2. Internal URL не записуються в history.
3. Сесія зберігається з timestamp і відновлюваною навігацією.

Опорні місця в коді:
[defaultData](../src/modules/storage.js#L10-L24)
[Фільтр internal URL в history](../src/modules/storage.js#L67-L69)
[saveSession](../src/modules/storage.js#L150-L166)

Рядок коду для показу:
~~~js
if (!url || url.includes('newtab.html') || url.startsWith('file://') || url.startsWith('app://')) return;
~~~

---

### 1.8 Live-демо (2 хв)

Послідовність:
1. Старт застосунку і вкладки.
2. Tor ON, дочекатися bootstrap, показати IP-check.
3. Показати блокування geolocation при Tor.
4. Запустити AI feed, згадати роль кешу.

Фраза після демо:
Безпека, приватність і AI тут не окремі фічі, а взаємоповʼязаний runtime-pipeline.

---

### 1.9 Ризики і roadmap (40-60 сек)

Що сказати:
1. У main window є компромісні security-настройки для MVP.
2. JSON storage достатній для MVP, але наступний крок — SQLite.
3. Потрібно розширення e2e-тестів для Tor/AI-сценаріїв.

---

### 1.10 Завершення (20-30 сек)

Готовий текст:
У BrowserX критичні нефункціональні вимоги реалізовані в коді: контрольований доступ до internal-ресурсів, багатошарова приватність у Tor-режимі та стабілізація AI-функцій через memoization і async-ітератори. Це створює технічну основу для подальшого production-розвитку.

---

## 2. Q&A шпаргалка

1. Чому Electron?
   Для MVP важливі швидка ітерація і єдина кросплатформена кодова база.

2. Де головний security-ризик?
   Поточні налаштування webPreferences в main window. Це явно зафіксовано як наступний етап hardening.

3. Як довести, що Tor реально працює?
   Є bootstrap-статус, перевірка порту 9050, застосування SOCKS5 до двох сесій і IP-check.

4. Навіщо memoization тут, якщо є timeout?
   Timeout захищає від зависань, а memoization прибирає повторні запити і знижує середню затримку.

5. Чому не SQLite одразу?
   Обрано простоту для MVP; storage централізований, тому міграція буде локалізованою.

6. Як контролюється ріст стрічки?
   Dedup через Set плюс обмеження MAX_TRACKED_ARTICLE_URLS.

---

## 3. Версія на 60-90 секунд

Доброго дня. BrowserX я будував як інженерний браузерний MVP із фокусом на безпеку, приватність і стабільність AI.
Перше: безпека internal-ресурсів — власний app:// протокол і перевірка шляхів, що блокує вихід за межі public.
Друге: приватність — Tor вмикається через pipeline перевірок, очищення storage і застосування SOCKS5 до обох сесій; геолокація блокується на рівні permission та runtime patch.
Третє: продуктивність AI — memoization у feed і describe-url зменшує дублікати викликів і latency, а async-ітератори з дедупом контролюють ріст стрічки.
Підсумок: у BrowserX ключові нефункціональні вимоги реалізовані в коді, що дає стійку базу для production-наступних кроків.

---

## 4. Чекліст перед захистом

1. Перевірити запуск: npm install, npm start.
2. Перевірити .env і GROQ_API_KEY.
3. Перевірити наявність Tor binary у bin/tor.
4. Підготувати fallback-демо без AI (на випадок API-збою).
5. Відкрити наперед вкладки з ключовими файлами:
   [src/main.js](../src/main.js)
   [src/modules/tor-manager.js](../src/modules/tor-manager.js)
   [src/utils/memoize.js](../src/utils/memoize.js)
   [src/modules/ai/feed-handlers.js](../src/modules/ai/feed-handlers.js)
   [src/modules/ai-feed.js](../src/modules/ai-feed.js)
