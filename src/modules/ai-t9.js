// AI-T9 Autocomplete Engine - Enhanced Version
// Інжектується на всі веб-сторінки для автозаповнення з Groq AI

(function() {
  console.log('🤖 AI-T9 Autocomplete завантажено');

  let activeInput = null;
  let suggestionBox = null;
  let ghostText = null;
  let debounceTimer = null;
  let lastSuggestion = "";
  let isProcessing = false;

  // Створюємо UI елементи
  function createSuggestionUI() {
    // Плаваюча підказка (коли не можемо накласти текст)
    suggestionBox = document.createElement('div');
    Object.assign(suggestionBox.style, {
      position: 'absolute',
      display: 'none',
      color: '#fff',
      backgroundColor: 'rgba(59, 130, 246, 0.95)',
      pointerEvents: 'none',
      fontSize: '12px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '4px 8px',
      borderRadius: '6px',
      zIndex: '999999',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      animation: 'fadeIn 0.2s ease-in'
    });
    document.body.appendChild(suggestionBox);

    // "Примарний" текст (накладається на поле)
    ghostText = document.createElement('div');
    Object.assign(ghostText.style, {
      position: 'absolute',
      display: 'none',
      color: 'rgba(128, 128, 128, 0.6)',
      pointerEvents: 'none',
      fontSize: '14px',
      fontFamily: 'inherit',
      zIndex: '999998',
      whiteSpace: 'pre-wrap',
      overflow: 'hidden'
    });
    document.body.appendChild(ghostText);

    // Додаємо анімацію
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);
  }

  createSuggestionUI();

  // Запит до AI з затримкою (debounce)
  function triggerAI(text, target) {
    clearTimeout(debounceTimer);

    if (isProcessing) return; // Не робимо одночасних запитів

    debounceTimer = setTimeout(async () => {
      isProcessing = true;
      suggestionBox.innerText = '⚡ Thinking...';
      suggestionBox.style.display = 'block';
      positionSuggestion(target);

      try {
        const suggestion = await window.aiAutocomplete.predict(text);
        
        if (suggestion && suggestion.trim().length > 0) {
          lastSuggestion = suggestion.trim();
          showSuggestion(target, lastSuggestion);
        } else {
          hideSuggestion();
        }
      } catch (error) {
        console.error('AI-T9 Error:', error);
        hideSuggestion();
      } finally {
        isProcessing = false;
      }
    }, 600); // Чекаємо 600ms після останнього натискання
  }

  // Позиціонування підказки
  function positionSuggestion(input) {
    const rect = input.getBoundingClientRect();
    suggestionBox.style.top = (rect.top + window.scrollY - 32) + 'px';
    suggestionBox.style.left = (rect.left + window.scrollX) + 'px';
  }

  // Показати підказку
  function showSuggestion(input, text) {
    positionSuggestion(input);
    
    // Якщо поле input або textarea - показуємо примарний текст
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      // Простий варіант - показуємо підказку над полем
      suggestionBox.innerHTML = `<span style="opacity: 0.7;">Tab:</span> <strong>${text}</strong>`;
      suggestionBox.style.display = 'block';
    } else {
      // Для contenteditable
      suggestionBox.innerHTML = `<span style="opacity: 0.7;">Tab:</span> <strong>${text}</strong>`;
      suggestionBox.style.display = 'block';
    }
  }

  // Сховати підказку
  function hideSuggestion() {
    suggestionBox.style.display = 'none';
    ghostText.style.display = 'none';
    lastSuggestion = "";
  }

  // Отримати значення поля (враховуючи contenteditable)
  function getInputValue(element) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element.value;
    } else if (element.isContentEditable) {
      return element.innerText || element.textContent;
    }
    return '';
  }

  // Встановити значення поля
  function setInputValue(element, value) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = value;
      // Тригеримо події для React/Vue
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.isContentEditable) {
      // Для contenteditable вставляємо в кінець
      const selection = window.getSelection();
      const range = document.createRange();
      element.focus();
      
      if (element.lastChild) {
        range.setStartAfter(element.lastChild);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      document.execCommand('insertText', false, value);
    }
  }

  // Слухаємо введення у всіх полях
  document.addEventListener('input', (e) => {
    const target = e.target;
    
    // Перевіряємо чи це поле вводу
    if (target.tagName !== 'INPUT' && 
        target.tagName !== 'TEXTAREA' && 
        !target.isContentEditable) {
      return;
    }

    activeInput = target;
    hideSuggestion(); // Ховаємо стару підказку
    
    const text = getInputValue(target);
    
    // Запускаємо AI тільки якщо є достатньо тексту
    if (text.length > 3) {
      triggerAI(text, target);
    }
  }, true); // Використовуємо capture для перехоплення у всіх елементах

  // Слухаємо Tab для прийняття підказки
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && lastSuggestion && activeInput) {
      // Перевіряємо чи підказка видима
      if (suggestionBox.style.display === 'block') {
        e.preventDefault();
        e.stopPropagation();

        // Вставляємо текст
        const currentValue = getInputValue(activeInput);
        setInputValue(activeInput, currentValue + lastSuggestion);
        
        // Ховаємо підказку
        hideSuggestion();
        
        console.log('AI-T9: Автозаповнення прийнято ✓');
      }
    }

    // Ховаємо при Escape
    if (e.key === 'Escape') {
      hideSuggestion();
    }
  }, true);

  // Ховаємо при втраті фокусу
  document.addEventListener('focusin', (e) => {
    if (e.target !== activeInput) {
      hideSuggestion();
    }
  });

  // Ховаємо при скролі
  let scrollTimer;
  window.addEventListener('scroll', () => {
    if (activeInput && suggestionBox.style.display === 'block') {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        positionSuggestion(activeInput);
      }, 50);
    }
  }, true);

  console.log('✅ AI-T9 готовий до роботи! Почніть друкувати...');

})();
