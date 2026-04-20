BrowserX - лабораторний проєкт Task 1-6

Ці таски підключені до реального потоку BrowserX: модулі використовуються у runtime, а демо-скрипти показують поведінку на практичних сценаріях.

Оновлення по Task 6:
- Task 6 інтегровано в проєкт і доступно для локального запуску.
- Основа: потокова обробка NDJSON через async iterators.
- Інтеграція: IPC метод window.api.analyzeHistoryStream(...).
- Демо запуск: npm run demo:task6.

Статус виконання:
- [x] Task 1: Генератори - завершено
- [x] Task 2: Налаштування проекту - завершено
- [x] Task 3: Мемоізація - завершено
- [x] Task 4: Таб-менеджер - завершено
- [x] Task 5: Асинхронні функції для масивів - завершено
- [x] Task 6: Потокова обробка великих даних - завершено

Task 1: Generators and Iterators

Основний файл: src/modules/ai-feed.js

Що реалізовано:
- infiniteArticleGenerator(categories) для безперервного потоку новин.
- Ротація джерел новин у round-robin режимі без дублювання статей.
- Фільтрація по категоріях для AI feed у BrowserX.
- Локальна оптимізація пам'яті через обмежений буфер already-seen елементів.

Демо:
- node examples/generator-timeout-demo.js

Task 2: Project Setup

Базовий запуск:
- npm install
- npm start

Структура проєкту:
- src для модулів і утиліт.
- public для renderer-частини.
- examples для запуску локальних демо.

Task 3: Memoization Function

Основний файл: src/utils/memoize.js

Що вміє memoize:
- Робота з sync та async функціями.
- Кешування in-flight Promise, щоб паралельні однакові виклики не дублювали обчислення.
- Політики витіснення: lru, lfu, time, custom.
- TTL для time-based сценаріїв.
- Метрики hits, misses, evictions, expirations.
- API керування кешем: clear, has, delete, peek, stats.

Демо:
- node examples/memoize-test.js

Task 4: BrowserX Task Queue

Основний файл: src/utils/priority-queue.js

Що реалізовано:
- enqueue(item, priority)
- peek(mode) і dequeue(mode), де mode: highest, lowest, oldest, newest
- size, isEmpty, clear, toArray для керування життєвим циклом черги
- Стабільна поведінка для однакового priority через порядок вставки

Інтеграція:
- src/modules/ai-task-scheduler.js

Демо:
- node examples/priority-queue-demo.js

Task 5: Async Array Variants

Основний файл: src/utils/async-array.js

Promise API:
- asyncMap
- asyncFilterMap
- asyncFind

Callback API:
- asyncMapCallback

Додатково:
- createAsyncController(timeoutMs) для abortable-процесів.
- Паралелізм через опцію concurrency.
- Вузький публічний API тільки для активних BrowserX-сценаріїв.

Демо:
- node src/utils/async-array-examples.js

Task 6: Large Data Processing with Streams / Async Iterators

Основний файл:
- src/utils/large-data-stream.js

Що реалізовано:
- Потокове читання NDJSON через async iterator без завантаження всього файлу у пам'ять.
- Інкрементальна агрегація великих журналів історії (top domains, валідні/невалідні рядки).
- Пакетна обробка через batchAsyncIterator.
- IPC інтеграція для виклику з renderer: window.api.analyzeHistoryStream(...).

Демо:
- node examples/task6-large-history-stream-demo.js

Корисні команди

- npm run demo:task1
- npm run demo:task3
- npm run demo:task4
- npm run demo:task5
- npm run demo:task6
- npm run test:edge

Примітка

Для AI-функцій потрібен валідний ключ у .env.