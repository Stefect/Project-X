# BrowserX - лабораторний проєкт Task 1-5

Це не просто набір шаблонних рішень. Кожен таск інтегровано у практичний Electron-проєкт так, щоб код виглядав і поводився як робочий інструмент, а не як "відповідь з генератора".

## Task 1: Generators and Iterators

Основний файл: src/modules/ai-feed.js

Що реалізовано:
- cycleGenerator(items, startIndex) для нескінченних циклів по будь-якому списку.
- roundRobinSourceGenerator(sources) для обходу джерел новин.
- incrementalCounterGenerator(start, step) для числового потоку.
- dayCycleGenerator(startDay) для циклу днів тижня.
- randomNumberGenerator(min, max) для нескінченної вибірки випадкових значень.
- consumeGeneratorWithTimeout(iterator, timeoutMs, processItem) для споживання ітератора з часовим обмеженням і ранньою зупинкою.

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

## Task 4: Bi-Directional Priority Queue

Основний файл: src/utils/priority-queue.js

Що реалізовано:
- enqueue(item, priority)
- peek(mode) і dequeue(mode), де mode: highest, lowest, oldest, newest
- peekEntry і dequeueEntry для отримання item разом з metadata
- removeWhere(predicate) для практичного очищення черги за умовою

Інтеграція:
- src/modules/ai-task-scheduler.js

Демо:
- node examples/priority-queue-demo.js

## Task 5: Async Array Variants

Основний файл: src/utils/async-array.js

Promise API:
- asyncMap
- asyncFilter
- asyncFilterMap
- asyncFind
- asyncFindIndex
- asyncSome
- asyncReduce

Callback API:
- asyncMapCallback
- asyncFilterCallback
- asyncFilterMapCallback
- asyncFindCallback
- asyncFindIndexCallback
- asyncSomeCallback
- asyncReduceCallback

Додатково:
- createAsyncController(timeoutMs) для abortable-процесів.
- Паралелізм через опцію concurrency.
- Опція ignorePredicateErrors для find/findIndex.

Демо:
- node src/utils/async-array-examples.js

Окрема нотатка інтеграції:
- ASYNC_ARRAY_INTEGRATION.md

## Корисні команди

- npm run demo:task1
- npm run demo:task3
- npm run demo:task4
- npm run demo:task5

## Примітка

Для AI-функцій потрібен валідний ключ у .env.

Автор: Stefect | ІМ-55