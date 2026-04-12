# BrowserX - лабораторний проєкт Task 1-5

Ці таски підключені до реального потоку BrowserX: модулі використовуються у runtime, а демо-скрипти показують поведінку на практичних сценаріях.

## Task 1: Generators and Iterators

Основний файл: src/modules/ai-feed.js

Що реалізовано:
- infiniteArticleGenerator(categories, customSources) для безперервного потоку новин.
- Ротація джерел новин у round-robin режимі без дублювання статей.
- Фільтрація по категоріях для AI feed у BrowserX.
- Локальна оптимізація пам'яті через обмежений буфер already-seen елементів.

Демо:
- node examples/generator-timeout-demo.js

## Task 2: Project Setup

Структура проєкту:
- src для модулів і утиліт.
- public для renderer-частини.
- examples для запуску локальних демо.
- docs для робочої документації.

Опис налаштування:
- docs/TASK2_PROJECT_SETUP.md

Базовий запуск:
- npm install
- npm start

## Task 3: Memoization Function

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

## Task 4: BrowserX Task Queue

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

## Task 5: Async Array Variants

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

Окрема нотатка інтеграції:
- ASYNC_ARRAY_INTEGRATION.md

## Корисні команди

- npm run demo:task1
- npm run demo:task3
- npm run demo:task4
- npm run demo:task5
- npm run test:edge

## Примітка

Для AI-функцій потрібен валідний ключ у .env.