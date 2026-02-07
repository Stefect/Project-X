// T9 UI - интерфейс для отображения подсказок
(function() {
  'use strict';

  let currentInput = null;
  let suggestionBox = null;
  let selectedIndex = -1;
  let currentSuggestions = [];

  // Создание бокса с подсказками
  function createSuggestionBox() {
    if (suggestionBox) return suggestionBox;

    suggestionBox = document.createElement('div');
    suggestionBox.id = 't9-suggestion-box';
    suggestionBox.style.cssText = `
      position: absolute;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      z-index: 2147483647;
      display: none;
      min-width: 200px;
      max-width: 350px;
      padding: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      backdrop-filter: blur(10px);
    `;

    document.body.appendChild(suggestionBox);
    return suggestionBox;
  }

  // Позиционирование бокса
  function positionSuggestionBox(input) {
    const rect = input.getBoundingClientRect();
    const box = createSuggestionBox();
    
    // Получаем позицию каретки для более точного позиционирования
    let top = rect.bottom + window.scrollY + 5;
    let left = rect.left + window.scrollX;

    // Проверяем, не выходит ли за пределы экрана
    if (left + box.offsetWidth > window.innerWidth) {
      left = window.innerWidth - box.offsetWidth - 10;
    }

    if (top + box.offsetHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - box.offsetHeight - 5;
    }

    box.style.top = `${top}px`;
    box.style.left = `${left}px`;
  }

  // Отображение подсказок
  function showSuggestions(input, suggestions) {
    if (!suggestions || suggestions.length === 0) {
      hideSuggestions();
      return;
    }

    currentInput = input;
    currentSuggestions = suggestions;
    selectedIndex = -1;

    const box = createSuggestionBox();
    box.innerHTML = '';

    // Добавляем заголовок
    const header = document.createElement('div');
    header.textContent = ' T9 Подсказки';
    header.style.cssText = `
      color: white;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 6px;
      padding: 4px 8px;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    box.appendChild(header);

    // Добавляем каждую подсказку
    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 't9-suggestion-item';
      item.textContent = suggestion;
      item.style.cssText = `
        padding: 10px 12px;
        cursor: pointer;
        color: white;
        border-radius: 6px;
        margin-bottom: 4px;
        transition: all 0.2s ease;
        font-size: 14px;
        background: rgba(255,255,255,0.1);
      `;

      // Подсветка при наведении
      item.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSelection();
      });

      // Вставка при клике
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        insertSuggestion(suggestion);
      });

      box.appendChild(item);
    });

    positionSuggestionBox(input);
    box.style.display = 'block';

    // Анимация появления
    box.style.opacity = '0';
    box.style.transform = 'translateY(-10px)';
    requestAnimationFrame(() => {
      box.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      box.style.opacity = '1';
      box.style.transform = 'translateY(0)';
    });
  }

  // Обновление выделения
  function updateSelection() {
    const items = suggestionBox?.querySelectorAll('.t9-suggestion-item');
    if (!items) return;

    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.style.background = 'rgba(255,255,255,0.25)';
        item.style.transform = 'scale(1.02)';
        item.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      } else {
        item.style.background = 'rgba(255,255,255,0.1)';
        item.style.transform = 'scale(1)';
        item.style.boxShadow = 'none';
      }
    });
  }

  // Скрытие подсказок
  function hideSuggestions() {
    if (suggestionBox) {
      suggestionBox.style.display = 'none';
      currentInput = null;
      currentSuggestions = [];
      selectedIndex = -1;
    }
  }

  // Вставка подсказки
  function insertSuggestion(suggestion) {
    if (!currentInput) return;

    const value = currentInput.value;
    const cursorPos = currentInput.selectionStart;
    
    // Находим начало текущего слова
    let wordStart = cursorPos;
    while (wordStart > 0 && /\S/.test(value[wordStart - 1])) {
      wordStart--;
    }

    // Заменяем текущее слово на подсказку
    const before = value.substring(0, wordStart);
    const after = value.substring(cursorPos);
    currentInput.value = before + suggestion + after;

    // Устанавливаем курсор после вставленного текста
    const newPos = wordStart + suggestion.length;
    currentInput.setSelectionRange(newPos, newPos);

    // Запоминаем слово
    if (window.T9Engine) {
      window.T9Engine.learnWord(suggestion);
    }

    // Генерируем событие input для совместимости с React и другими фреймворками
    const event = new Event('input', { bubbles: true });
    currentInput.dispatchEvent(event);

    hideSuggestions();
    currentInput.focus();
  }

  // Обработка навигации клавиатурой
  function handleKeyDown(e) {
    if (!suggestionBox || suggestionBox.style.display === 'none') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
        updateSelection();
        break;

      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelection();
        break;

      case 'Enter':
      case 'Tab':
        if (selectedIndex >= 0 && selectedIndex < currentSuggestions.length) {
          e.preventDefault();
          insertSuggestion(currentSuggestions[selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        hideSuggestions();
        break;
    }
  }

  // Получение текущего слова
  function getCurrentWord(input) {
    const value = input.value;
    const cursorPos = input.selectionStart;
    
    let wordStart = cursorPos;
    while (wordStart > 0 && /\S/.test(value[wordStart - 1])) {
      wordStart--;
    }

    return value.substring(wordStart, cursorPos);
  }

  // Обработка ввода
  function handleInput(e) {
    const input = e.target;
    const currentWord = getCurrentWord(input);

    if (currentWord.length >= 1) {
      let suggestions = [];

      // Получаем предложения слов
      if (window.T9Engine) {
        suggestions = window.T9Engine.getSuggestions(currentWord, 5);
        
        // Если нет предложений слов, пробуем фразы
        if (suggestions.length === 0) {
          const phraseSuggestions = window.T9Engine.getPhraseSuggestions(input.value);
          suggestions = phraseSuggestions;
        }
      }

      showSuggestions(input, suggestions);
    } else {
      hideSuggestions();
    }
  }

  // Запоминание завершенного слова
  function handleWordComplete(input) {
    const value = input.value;
    const cursorPos = input.selectionStart;
    
    // Находим последнее завершенное слово (перед пробелом или концом)
    let wordEnd = cursorPos - 1;
    while (wordEnd > 0 && /\s/.test(value[wordEnd])) {
      wordEnd--;
    }

    if (wordEnd > 0) {
      let wordStart = wordEnd;
      while (wordStart > 0 && /\S/.test(value[wordStart - 1])) {
        wordStart--;
      }

      const word = value.substring(wordStart, wordEnd + 1).trim();
      if (word.length >= 2 && window.T9Engine) {
        window.T9Engine.learnWord(word);
      }
    }
  }

  // Инициализация T9 для всех текстовых полей
  function initT9() {
    // Обрабатываем уже существующие поля
    const inputs = document.querySelectorAll('input[type="text"], input[type="search"], textarea');
    inputs.forEach(input => {
      if (!input.hasAttribute('data-t9-enabled')) {
        input.setAttribute('data-t9-enabled', 'true');
        input.addEventListener('input', handleInput);
        input.addEventListener('keydown', handleKeyDown);
        
        // Запоминаем слова при вводе пробела
        input.addEventListener('keydown', (e) => {
          if (e.key === ' ') {
            setTimeout(() => handleWordComplete(input), 50);
          }
        });
        
        input.addEventListener('blur', () => {
          setTimeout(hideSuggestions, 200);
        });
      }
    });

    // Следим за динамически добавляемыми полями
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.matches && node.matches('input[type="text"], input[type="search"], textarea')) {
              if (!node.hasAttribute('data-t9-enabled')) {
                node.setAttribute('data-t9-enabled', 'true');
                node.addEventListener('input', handleInput);
                node.addEventListener('keydown', handleKeyDown);
                node.addEventListener('keydown', (e) => {
                  if (e.key === ' ') {
                    setTimeout(() => handleWordComplete(node), 50);
                  }
                });
                node.addEventListener('blur', () => {
                  setTimeout(hideSuggestions, 200);
                });
              }
            }

            const nestedInputs = node.querySelectorAll?.('input[type="text"], input[type="search"], textarea');
            nestedInputs?.forEach(input => {
              if (!input.hasAttribute('data-t9-enabled')) {
                input.setAttribute('data-t9-enabled', 'true');
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
            });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Запуск при загрузке страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initT9);
  } else {
    initT9();
  }

  // Периодическая проверка новых полей (для SPA)
  setInterval(initT9, 2000);

  // Экспорт API
  window.T9UI = {
    show: showSuggestions,
    hide: hideSuggestions,
    init: initT9
  };

  console.log(' T9 UI загружен и активирован');
})();
