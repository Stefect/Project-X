# 🌊 AI Infinite Feed - Документація

## Опис
AI Infinite Feed - це унікальна фіча браузера Project-X, яка використовує **генератори та ітератори** для створення нескінченної стрічки новин з автоматичною AI обробкою.

## 🎯 Реалізовані завдання

### 1.1 Round Robin Generator
**Файл:** `src/modules/ai-feed.js`

```javascript
function* roundRobinSourceGenerator(sources) {
    let index = 0;
    while (true) {
        yield sources[index];
        index = (index + 1) % sources.length;
    }
}
```

Цей генератор нескінченно проходить по масиву джерел новин по колу:
- Reddit Tech → Reddit Programming → Dev.to → Hacker News → Reddit Tech...

### 1.2 Timeout Iterator Consumer
**Файл:** `src/main.js` (рядки ~1990-2020)

```javascript
const summary = await Promise.race([
    summarizeArticle(article.title),
    new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI_TIMEOUT')), 3000)
    )
]);
```

Використовує `Promise.race()` для обмеження часу очікування відповіді AI:
- Якщо AI відповідає менше ніж за 3 секунди → стаття додається до стрічки
- Якщо AI "думає" більше 3 секунд → стаття пропускається

## 🚀 Як користуватися

### Запуск стрічки новин

1. **Відкрити сторінку feed:**
   ```
   file://ШЛЯХ_ДО_ПРОЕКТУ/public/feed.html
   ```

2. **Або створити нову вкладку в браузері:**
   - Натисни "+" для нової вкладки
   - Введи URL: `file:///.../public/feed.html`

3. **Натисни кнопку "Запустити Потік"**

### Що відбувається:
1. Генератор починає збирати новини з різних джерел (Round Robin)
2. Для кожної статті AI створює короткий самарі (українською)
3. Якщо AI думає >3 сек → стаття пропускається
4. Стрічка поповнюється в реальному часі

## 📁 Структура файлів

```
Project-X/
├── src/
│   ├── main.js              # IPC обробники (start/stop feed)
│   ├── preload.js           # API для renderer процесу
│   └── modules/
│       └── ai-feed.js       # Генератори + Round Robin
└── public/
    └── feed.html            # UI стрічки новин
```

## 🔧 Технічні деталі

### Джерела новин
- **Reddit Tech** - r/technology (JSON API)
- **Reddit Programming** - r/programming
- **Dev.to** - DevCommunity API
- **Hacker News** - Firebase API

### AI обробка
- **Модель:** Groq Llama 3 (8B параметрів)
- **Таймаут:** 3 секунди
- **Мова:** Українська
- **Довжина:** До 15 слів

### Генератори
1. `roundRobinSourceGenerator()` - нескінченний цикл джерел
2. `infiniteArticleGenerator()` - асинхронний генератор статей

## 🎨 Features

✅ Красивий градієнтний дизайн  
✅ Анімації slide-in для карток  
✅ Статистика завантажених статей  
✅ Автоматичне видалення повідомлень про таймаут  
✅ Відкриття статей у новій вкладці  
✅ Адаптивний скролл  

## 🔮 Можливості розширення

1. **Додати більше джерел:**
   ```javascript
   const NEWS_SOURCES = [
       // ... існуючі
       { name: 'GitHub Trending', url: '...', type: 'github' }
   ];
   ```

2. **Змінити таймаут AI:**
   ```javascript
   setTimeout(() => reject(new Error('AI_TIMEOUT')), 5000) // 5 секунд
   ```

3. **Додати фільтри:**
   - За категоріями (Tech, Science, Gaming)
   - За мовою
   - За популярністю

## 🎓 Навчальна цінність

Цей проект демонструє:
- **Генератори** в JavaScript (function*)
- **Ітератори** (for await...of)
- **Promise.race()** для таймаутів
- **IPC** в Electron
- **Асинхронні генератори**
- **Event-driven архітектуру**

---

**Автор:** Student Project  
**Дата:** 2026  
**Ліцензія:** MIT
