# BrowserX - лабораторний проєкт (Task 1-5)

Проєкт робився як практичний набір задач із JavaScript/Node.js в реальному застосунку (Electron).
Нижче коротко, що саме реалізовано по кожному таску.

## Task 1: Generators + Iterator with timeout

Файл: `src/modules/ai-feed.js`

Що є:
- `roundRobinSourceGenerator(sources)` - нескінченний обхід джерел по колу.
- `incrementalCounterGenerator(start, step)` - окремий нескінченний числовий генератор.
- `infiniteArticleGenerator(categories, customSources)` - async-генератор стрічки новин.
- `consumeGeneratorWithTimeout(generator, timeoutMs, processItem?)` - споживання ітератора з обмеженням часу.

## Task 2: Project setup

Що налаштовано:
- git-репозиторій + `.gitignore`
- `package.json` зі скриптами запуску/білду
- структура `src/`, `public/`, `examples/`
- конфіг під Electron + Tailwind/PostCSS

Базовий запуск:

```bash
npm install
npm start
```

## Task 3: Memoization function

Файл: `src/utils/memoize.js`

Можливості:
- мемоізація довільної pure-функції
- політики витіснення: `lru`, `lfu`, `time`, `custom`
- контроль розміру кешу (`maxSize`)
- підтримка TTL (`ttl`) для time-based сценарію
- утиліти у memoized-функції: `.clear()`, `.has()`, `.delete()`, `.stats()`

Демо:

```bash
node examples/memoize-test.js
```

## Task 4: Bi-directional priority queue

Файл: `src/utils/priority-queue.js`

Підтримувані операції:
- `enqueue(item, priority)`
- `dequeue('highest' | 'lowest' | 'oldest' | 'newest')`
- `peek('highest' | 'lowest' | 'oldest' | 'newest')`

Queue використовується в `src/modules/ai-task-scheduler.js` для пріоритизації AI-задач.

## Task 5: Async array function variants

Файл: `src/utils/async-array.js`

Promise-варіанти:
- `asyncMap`, `asyncFilter`, `asyncFind`, `asyncFindIndex`, `asyncSome`, `asyncReduce`

Callback-варіанти:
- `asyncMapCallback`, `asyncFilterCallback`, `asyncFindCallback`, `asyncFindIndexCallback`, `asyncSomeCallback`, `asyncReduceCallback`

Додатково:
- `createAsyncController(timeoutMs)` для скасування через `AbortController`
- `concurrency` для контрольованого паралелізму в map/filter-потоках

Приклади:
- `src/utils/async-array-examples.js`

## Корисні файли

- `src/modules/ai-feed.js` - генератори та timeout-consumer
- `src/utils/memoize.js` - Task 3
- `src/utils/priority-queue.js` - Task 4
- `src/utils/async-array.js` - Task 5
- `examples/memoize-test.js` - швидкий локальний demo-run

## Примітка по AI

Для AI-функцій потрібен коректний ключ у конфігурації (`.env` / `config.js`, залежно від сценарію запуску).

---

Автор: Stefect | ІМ-55