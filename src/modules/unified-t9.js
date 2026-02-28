// Unified T9 Autocomplete - Inspired by VS Code IntelliSense
// Гібридна система: локальний словник (швидко) + AI (розумно)

(function() {
  'use strict';

  // ============= КОНФІГУРАЦІЯ =============
  const CONFIG = {
    minCharsForLocal: 2,    // Мін. символів для локальних підказок
    minCharsForAI: 5,       // Мін. символів для AI підказок
    debounceDelay: 400,     // Затримка перед запитом (мс)
    maxSuggestions: 5,      // Макс. к-сть підказок
    aiTimeout: 3000,        // Таймаут AI запиту (мс)
  };

  // ============= СЛОВНИК =============
  const DICTIONARY = {
    uk: ['привіт', 'дякую', 'будь ласка', 'вітаю', 'добрий', 'день', 'ранок', 'вечір', 
         'як', 'справи', 'що', 'де', 'коли', 'чому', 'хто', 'який', 'скільки',
         'зараз', 'потім', 'завтра', 'учора', 'сьогодні', 'завжди', 'ніколи', 'іноді',
         'робити', 'казати', 'думати', 'знати', 'бачити', 'розуміти', 'хотіти', 'могти',
         'великий', 'малий', 'новий', 'старий', 'гарний', 'поганий', 'красивий', 'розумний',
         'комп\'ютер', 'інтернет', 'програма', 'файл', 'документ', 'текст', 'повідомлення',
         'питання', 'відповідь', 'проблема', 'рішення', 'результат', 'інформація', 'дані'],
    
    en: ['hello', 'thanks', 'please', 'sorry', 'yes', 'no', 'maybe', 'good', 'bad',
         'the', 'be', 'to', 'of', 'and', 'in', 'that', 'have', 'it', 'for', 'not',
         'what', 'when', 'where', 'why', 'how', 'who', 'which',
         'today', 'tomorrow', 'yesterday', 'now', 'later', 'always', 'never', 'sometimes',
         'make', 'say', 'think', 'know', 'see', 'understand', 'want', 'can',
         'computer', 'internet', 'program', 'file', 'document', 'text', 'message',
         'question', 'answer', 'problem', 'solution', 'result', 'information', 'data'],
    
    ru: ['привет', 'спасибо', 'пожалуйста', 'извините', 'да', 'нет', 'может быть',
         'как', 'дела', 'что', 'где', 'когда', 'почему', 'кто', 'какой', 'сколько',
         'сейчас', 'потом', 'завтра', 'вчера', 'сегодня', 'всегда', 'никогда', 'иногда',
         'делать', 'говорить', 'думать', 'знать', 'видеть', 'понимать', 'хотеть', 'мочь']
  };

  // Історія введених слів користувачем
  let userHistory = [];
  const MAX_HISTORY = 50;

  // ============= СТАН =============
  let state = {
    activeInput: null,
    suggestionBox: null,
    suggestions: [],
    selectedIndex: 0,
    debounceTimer: null,
    isAIProcessing: false,
    lastAIQuery: ''
  };

  // ============= ВИЗНАЧЕННЯ МОВИ =============
  function detectLanguage(text) {
    const cyrillicUkPattern = /[ґєіїҐЄІЇ]/;
    const cyrillicPattern = /[а-яёА-ЯЁ]/;
    
    if (cyrillicUkPattern.test(text)) return 'uk';
    if (cyrillicPattern.test(text)) return 'ru';
    return 'en';
  }

  // ============= СТВОРЕННЯ UI =============
  function createSuggestionBox() {
    if (state.suggestionBox) return;

    const box = document.createElement('div');
    box.id = 'unified-t9-box';
    box.style.cssText = `
      position: fixed;
      background: #252526;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      z-index: 999999;
      display: none;
      min-width: 200px;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Consolas, monospace;
      font-size: 13px;
      overflow: hidden;
      color: #cccccc;
    `;
    
    document.body.appendChild(box);
    state.suggestionBox = box;
  }

  // ============= ПОЗИЦІОНУВАННЯ =============
  function positionBox(input) {
    if (!state.suggestionBox) return;

    const rect = input.getBoundingClientRect();
    const box = state.suggestionBox;
    
    let top = rect.bottom + window.scrollY + 4;
    let left = rect.left + window.scrollX;

    // Перевірка меж екрану
    const boxHeight = box.offsetHeight || 200;
    const boxWidth = box.offsetWidth || 300;

    if (top + boxHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - boxHeight - 4;
    }

    if (left + boxWidth > window.innerWidth) {
      left = window.innerWidth - boxWidth - 10;
    }

    box.style.top = `${top}px`;
    box.style.left = `${left}px`;
  }

  // ============= ВІДОБРАЖЕННЯ ПІДКАЗОК =============
  function showSuggestions(suggestions, source = 'local') {
    if (!suggestions || suggestions.length === 0) {
      hideSuggestions();
      return;
    }

    state.suggestions = suggestions.slice(0, CONFIG.maxSuggestions);
    state.selectedIndex = 0;

    const box = state.suggestionBox;
    box.innerHTML = '';

    state.suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'unified-t9-item';
      item.textContent = suggestion;
      
      item.style.cssText = `
        padding: 4px 8px;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: background 0.1s ease;
      `;

      if (index === state.selectedIndex) {
        item.style.background = '#094771';
        item.style.color = '#ffffff';
      } else {
        item.style.background = 'transparent';
        item.style.color = '#cccccc';
      }

      item.addEventListener('mouseenter', () => {
        state.selectedIndex = index;
        updateSelection();
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        insertSuggestion(suggestion);
      });

      box.appendChild(item);
    });

    positionBox(state.activeInput);
    box.style.display = 'block';
  }

  // ============= ОНОВЛЕННЯ ВИДІЛЕННЯ =============
  function updateSelection() {
    const items = state.suggestionBox?.querySelectorAll('.unified-t9-item');
    if (!items) return;

    items.forEach((item, index) => {
      if (index === state.selectedIndex) {
        item.style.background = '#094771';
        item.style.color = '#ffffff';
      } else {
        item.style.background = 'transparent';
        item.style.color = '#cccccc';
      }
    });
  }

  // ============= ПРИХОВАТИ ПІДКАЗКИ =============
  function hideSuggestions() {
    if (state.suggestionBox) {
      state.suggestionBox.style.display = 'none';
      state.suggestions = [];
      state.selectedIndex = 0;
    }
  }

  // ============= ОТРИМАТИ ПОТОЧНЕ СЛОВО =============
  function getCurrentWord(input) {
    const value = input.value;
    const cursorPos = input.selectionStart;
    
    let wordStart = cursorPos;
    while (wordStart > 0 && /\S/.test(value[wordStart - 1])) {
      wordStart--;
    }

    return {
      word: value.substring(wordStart, cursorPos),
      start: wordStart,
      end: cursorPos
    };
  }

  // ============= ЛОКАЛЬНИЙ ПОШУК =============
  function getLocalSuggestions(word) {
    if (word.length < CONFIG.minCharsForLocal) return [];

    const wordLower = word.toLowerCase();
    const lang = detectLanguage(word);
    const allWords = [...DICTIONARY[lang], ...userHistory];
    
    // Точні збіги (починається з)
    const exactMatches = allWords.filter(w => 
      w.toLowerCase().startsWith(wordLower) && w.toLowerCase() !== wordLower
    );

    return [...new Set(exactMatches)];
  }

  // ============= AI ПОШУК =============
  async function getAISuggestions(text) {
    if (!window.api?.invoke || text.length < CONFIG.minCharsForAI) return [];
    if (state.isAIProcessing || state.lastAIQuery === text) return [];

    state.isAIProcessing = true;
    state.lastAIQuery = text;

    try {
      const suggestion = await Promise.race([
        window.api.invoke('predict-completion', text),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI timeout')), CONFIG.aiTimeout)
        )
      ]);

      state.isAIProcessing = false;

      if (suggestion && suggestion.trim().length > 0) {
        return [suggestion.trim()];
      }
    } catch (error) {
      state.isAIProcessing = false;
      console.warn('AI T9 timeout or error:', error.message);
    }

    return [];
  }

  // ============= ВСТАВКА ПІДКАЗКИ =============
  function insertSuggestion(suggestion) {
    if (!state.activeInput) return;

    const input = state.activeInput;
    const value = input.value;
    const { start, end } = getCurrentWord(input);

    // Замінюємо поточне слово
    const newValue = value.substring(0, start) + suggestion + value.substring(end);
    input.value = newValue;

    // Курсор після вставленого тексту
    const newPos = start + suggestion.length;
    input.setSelectionRange(newPos, newPos);

    // Запам'ятовуємо слово
    learnWord(suggestion);

    // Тригеримо події для React/Vue
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    hideSuggestions();
    input.focus();
  }

  // ============= НАВЧАННЯ =============
  function learnWord(word) {
    if (word.length < 2) return;
    
    userHistory = userHistory.filter(w => w !== word);
    userHistory.unshift(word);
    
    if (userHistory.length > MAX_HISTORY) {
      userHistory = userHistory.slice(0, MAX_HISTORY);
    }
  }

  // ============= ОБРОБКА ВВЕДЕННЯ =============
  async function handleInput(e) {
    const input = e.target;
    state.activeInput = input;

    const { word } = getCurrentWord(input);
    
    clearTimeout(state.debounceTimer);

    if (word.length < CONFIG.minCharsForLocal) {
      hideSuggestions();
      return;
    }

    // Спочатку локальні підказки (миттєво)
    const localSuggestions = getLocalSuggestions(word);
    if (localSuggestions.length > 0) {
      showSuggestions(localSuggestions, 'local');
    }

    // Потім AI (з затримкою)
    if (word.length >= CONFIG.minCharsForAI) {
      state.debounceTimer = setTimeout(async () => {
        const fullText = input.value;
        const aiSuggestions = await getAISuggestions(fullText);
        
        if (aiSuggestions.length > 0) {
          // Комбінуємо локальні + AI (AI в кінці)
          const combined = [...new Set([...localSuggestions, ...aiSuggestions])];
          showSuggestions(combined, 'ai');
        }
      }, CONFIG.debounceDelay);
    }
  }

  // ============= НАВІГАЦІЯ КЛАВІАТУРОЮ =============
  function handleKeyDown(e) {
    if (!state.suggestionBox || state.suggestionBox.style.display === 'none') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        state.selectedIndex = Math.min(state.selectedIndex + 1, state.suggestions.length - 1);
        updateSelection();
        break;

      case 'ArrowUp':
        e.preventDefault();
        state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
        updateSelection();
        break;

      case 'Enter':
      case 'Tab':
        if (state.suggestions.length > 0) {
          e.preventDefault();
          insertSuggestion(state.suggestions[state.selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        hideSuggestions();
        break;
    }
  }

  // ============= ЗАПАМ'ЯТОВУВАННЯ СЛІВ =============
  function handleWordComplete(input) {
    const value = input.value;
    const words = value.split(/\s+/);
    const lastWord = words[words.length - 2]; // Передостаннє слово (останнє закінчене)
    
    if (lastWord && lastWord.length >= 2) {
      learnWord(lastWord);
    }
  }

  // ============= ІНІЦІАЛІЗАЦІЯ =============
  function attachToInput(input) {
    if (input.hasAttribute('data-unified-t9')) return;
    
    input.setAttribute('data-unified-t9', 'true');
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeyDown);
    input.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        setTimeout(() => handleWordComplete(input), 50);
      }
    });
    input.addEventListener('blur', () => {
      setTimeout(hideSuggestions, 200);
    });
  }

  function initT9() {
    // Існуючі поля
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="search"], input:not([type]), textarea'
    );
    inputs.forEach(attachToInput);

    // Динамічно додані поля
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.matches?.('input[type="text"], input[type="search"], input:not([type]), textarea')) {
              attachToInput(node);
            }
            node.querySelectorAll?.('input[type="text"], input[type="search"], input:not([type]), textarea')
              .forEach(attachToInput);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ============= ЗАПУСК =============
  createSuggestionBox();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initT9);
  } else {
    initT9();
  }

  // Періодична активація для SPA
  setInterval(initT9, 3000);

  // Глобальний API
  window.UnifiedT9 = {
    show: showSuggestions,
    hide: hideSuggestions,
    init: initT9,
    version: '1.0.0'
  };

  console.log('[UNIFIED-T9] Autocomplete system ready (VS Code style)');

  // ============================================================
  // X-RAY: Опис посилань при наведенні мишки
  // ============================================================
  (function initXRay() {
    if (window.__xrayInitialized) return;
    window.__xrayInitialized = true;

    const XRAY_DELAY = 400;        // Затримка перед запитом (мс)
    const XRAY_FADE_IN = 150;      // Анімація появи
    const XRAY_CACHE = new Map();  // Локальний кеш в контексті сторінки

    let xrayTimer = null;
    let xrayBox = null;
    let currentLink = null;

    // Створюємо тултіп
    function createXRayBox() {
      if (xrayBox) return;
      const box = document.createElement('div');
      box.id = 'xray-tooltip';
      box.style.cssText = `
        position: fixed;
        background: linear-gradient(135deg, #1e1f2e 0%, #252736 100%);
        border: 1px solid rgba(122, 162, 247, 0.3);
        border-radius: 10px;
        padding: 10px 14px;
        z-index: 2147483647;
        display: none;
        max-width: 340px;
        min-width: 180px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(122, 162, 247, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        pointer-events: none;
        opacity: 0;
        transition: opacity ${XRAY_FADE_IN}ms ease-in-out;
        backdrop-filter: blur(12px);
      `;
      document.body.appendChild(box);
      xrayBox = box;
    }

    function showXRay(link, data) {
      if (!xrayBox || currentLink !== link) return;

      const title = data.title || '';
      const desc = data.description || '';

      xrayBox.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:12px;opacity:0.6;">🔍</span>
          <span style="font-size:13px;font-weight:600;color:#7aa2f7;line-height:1.3;">${escapeHtml(title)}</span>
        </div>
        <div style="font-size:12px;color:#a9b1d6;line-height:1.4;">${escapeHtml(desc)}</div>
        <div style="font-size:10px;color:#565f89;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(truncateUrl(link.href))}</div>
      `;

      // Позиціонуємо біля курсора / посилання
      const rect = link.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left;

      // Якщо виходить за нижній край — показуємо зверху
      xrayBox.style.display = 'block';
      if (top + xrayBox.offsetHeight > window.innerHeight) {
        top = rect.top - xrayBox.offsetHeight - 6;
      }
      // Якщо виходить за правий край
      if (left + xrayBox.offsetWidth > window.innerWidth - 10) {
        left = window.innerWidth - xrayBox.offsetWidth - 10;
      }
      if (left < 5) left = 5;
      if (top < 5) top = 5;

      xrayBox.style.top = top + 'px';
      xrayBox.style.left = left + 'px';

      // Fade in
      requestAnimationFrame(() => {
        if (xrayBox) xrayBox.style.opacity = '1';
      });
    }

    function hideXRay() {
      clearTimeout(xrayTimer);
      xrayTimer = null;
      currentLink = null;
      if (xrayBox) {
        xrayBox.style.opacity = '0';
        setTimeout(() => {
          if (xrayBox) xrayBox.style.display = 'none';
        }, XRAY_FADE_IN);
      }
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function truncateUrl(url) {
      try {
        const u = new URL(url);
        const path = u.pathname.length > 40 ? u.pathname.substring(0, 40) + '…' : u.pathname;
        return u.hostname + path;
      } catch {
        return url.substring(0, 60);
      }
    }

    function isExternalLink(a) {
      if (!a.href) return false;
      const href = a.href;
      if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
      if (href.startsWith('file://')) return false;
      return true;
    }

    async function requestDescription(link) {
      const url = link.href;

      // Кеш?
      if (XRAY_CACHE.has(url)) {
        showXRay(link, XRAY_CACHE.get(url));
        return;
      }

      // Збираємо контекст зі сторінки
      const linkText = (link.textContent || link.innerText || '').trim().substring(0, 120);
      const linkTitle = (link.title || link.getAttribute('aria-label') || '').trim();
      
      // Оточуючий текст (батьківський елемент)
      let surroundingText = '';
      try {
        const parent = link.closest('p, li, td, div, article, section, h1, h2, h3, h4, h5, h6');
        if (parent && parent !== document.body) {
          surroundingText = (parent.textContent || '').trim().substring(0, 200);
        }
      } catch (e) {}

      // Збираємо контекст
      let context = '';
      if (linkTitle) context += linkTitle;
      if (surroundingText && surroundingText !== linkText) {
        context += (context ? '. ' : '') + surroundingText;
      }
      context = context.substring(0, 250);

      // Показуємо "завантаження"
      showXRay(link, { title: '⏳ Аналіз...', description: 'X-Ray сканує посилання...' });

      try {
        if (!window.api?.describeUrl) {
          const domain = new URL(url).hostname;
          const result = { title: linkText || domain, description: `Перейти на ${domain}` };
          XRAY_CACHE.set(url, result);
          showXRay(link, result);
          return;
        }

        const result = await Promise.race([
          window.api.describeUrl(url, linkText, context),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);

        if (result) {
          XRAY_CACHE.set(url, result);
          showXRay(link, result);
        } else {
          hideXRay();
        }
      } catch (err) {
        // Таймаут або помилка — просто показуємо домен
        try {
          const domain = new URL(url).hostname;
          const fallback = { title: domain, description: `Перейти на ${domain}` };
          XRAY_CACHE.set(url, fallback);
          showXRay(link, fallback);
        } catch {
          hideXRay();
        }
      }
    }

    // Делегування подій на document (працює з динамічно створеними посиланнями)
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a[href]');
      if (!link || !isExternalLink(link)) return;
      if (link === currentLink) return; // Вже обробляємо

      hideXRay(); // Ховаємо попередній
      currentLink = link;
      createXRayBox();

      xrayTimer = setTimeout(() => {
        if (currentLink === link) {
          requestDescription(link);
        }
      }, XRAY_DELAY);
    });

    document.addEventListener('mouseout', (e) => {
      const link = e.target.closest('a[href]');
      if (link && link === currentLink) {
        hideXRay();
      }
    });

    // Ховаємо при скролі
    window.addEventListener('scroll', hideXRay, { passive: true });

    console.log('[X-RAY] Link preview system ready');
  })();
})();
