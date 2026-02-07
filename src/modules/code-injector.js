// code-injector.js - Інжектор AI кнопок для блоків коду

(function() {
  // Функція, яка додає кнопки до блоків коду
  function injectCodeButtons() {
    // Шукаємо всі блоки коду (зазвичай вони в тегах <pre> або <code>)
    const codeBlocks = document.querySelectorAll('pre, code.hljs, div.highlight, div.code-block, .markdown-body pre');

    codeBlocks.forEach((block) => {
      // Пропускаємо дуже маленькі блоки (ймовірно це inline код)
      if (block.innerText.trim().length < 20) return;
      
      // Перевіряємо, чи ми вже не додали кнопку сюди
      if (block.querySelector('.my-ai-code-btn')) return;

      // Створюємо кнопку
      const btn = document.createElement('button');
      btn.innerText = " Пояснити";
      btn.className = 'my-ai-code-btn';
      btn.title = "Отримати AI пояснення цього коду";
      
      // Стилізація кнопки
      Object.assign(btn.style, {
        position: 'absolute',
        top: '5px',
        right: '5px',
        zIndex: '1000',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: '12px',
        fontFamily: 'sans-serif',
        fontWeight: '600',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.2s',
        opacity: '0.9'
      });

      // Ефект наведення
      btn.onmouseenter = () => {
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      };
      
      btn.onmouseleave = () => {
        btn.style.opacity = '0.9';
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      };

      // Робимо батьківський блок relative, щоб кнопка позиціонувалась відносно нього
      const originalPosition = window.getComputedStyle(block).position;
      if (originalPosition === 'static') {
        block.style.position = 'relative';
      }
      
      block.appendChild(btn);

      // Обробка кліку
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const originalText = btn.innerText;
        btn.innerText = " Думаю...";
        btn.disabled = true;
        btn.style.cursor = 'wait';
        
        try {
          const codeText = block.innerText.replace(btn.innerText, '').trim();
          
          // Промпт для ШІ
          const prompt = `Проаналізуй цей код коротко українською мовою:
          
1. Що робить цей код?
2. Які основні функції/методи використовуються?
3. Чи є потенційні помилки або покращення?

Код:
\`\`\`
${codeText}
\`\`\`

Відповідай структуровано і лаконічно (максимум 5-6 речень).`;
          
          // Відправляємо через console.log з префіксом (головний процес перехопить)
          console.log('AI_CODE_REQUEST:', JSON.stringify({ code: codeText, prompt: prompt }));
          
        } catch (err) {
          console.error('Помилка аналізу коду:', err);
          btn.innerText = " Помилка";
          setTimeout(() => {
            btn.innerText = originalText;
            btn.disabled = false;
            btn.style.cursor = 'pointer';
          }, 2000);
        }
      });
    });
  }

  // Функція для показу відповіді AI
  window.showCodeExplanation = function(explanation, buttonElement) {
    // Знаходимо кнопку і відновлюємо її стан
    const buttons = document.querySelectorAll('.my-ai-code-btn');
    buttons.forEach(btn => {
      if (btn.innerText === " Думаю...") {
        btn.innerText = " Пояснити";
        btn.disabled = false;
        btn.style.cursor = 'pointer';
      }
    });
    
    // Показуємо popup з поясненням
    if (typeof window.showAIPopup === 'function') {
      window.showAIPopup(explanation);
    } else {
      // Якщо функція недоступна, створюємо простий alert
      alert(" AI Аналіз коду:\n\n" + explanation);
    }
  };

  // Запускаємо функцію, коли сторінка завантажилась
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCodeButtons);
  } else {
    injectCodeButtons();
  }

  // Запускаємо перевірку періодично для динамічних сайтів (GitHub, StackOverflow)
  if (!window.codeInjectorInterval) {
    window.codeInjectorInterval = setInterval(injectCodeButtons, 2000);
  }
})();
