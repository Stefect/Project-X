// Скрипт для інжектування в веб-сторінки
(function() {
  // Додаємо стилі для анімації
  if (!document.getElementById('ai-popup-styles')) {
    const style = document.createElement('style');
    style.id = 'ai-popup-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // Функція для показу AI popup
  window.showAIPopup = function(text, originalText = '') {
    const oldPopup = document.getElementById('browserx-ai-popup');
    if (oldPopup) oldPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'browserx-ai-popup';
    popup.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 450px;
        min-width: 300px;
        background: linear-gradient(135deg, #1a1b26 0%, #24283b 100%);
        border: 1px solid #8b5cf6;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(139, 92, 246, 0.2);
        z-index: 2147483647;
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #fff;
        overflow: hidden;
        animation: slideIn 0.3s ease-out;
      ">
        <div style="
          padding: 14px 18px;
          background: linear-gradient(90deg, #8b5cf6 0%, #ec4899 100%);
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <span style="font-weight: 600; font-size: 14px;">🤖 AI Помічник</span>
          <button onclick="this.closest('#browserx-ai-popup').remove()" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">×</button>
        </div>
        <div style="padding: 16px;">
          ${originalText ? `
            <div style="font-size: 12px; color: #888; margin-bottom: 8px;">Запит:</div>
            <div style="
              font-size: 13px;
              color: #a0a0a0;
              margin-bottom: 12px;
              padding: 10px;
              background: rgba(0,0,0,0.3);
              border-radius: 8px;
              max-height: 60px;
              overflow-y: auto;
            ">${originalText.substring(0, 200)}${originalText.length > 200 ? '...' : ''}</div>
            <div style="font-size: 12px; color: #888; margin-bottom: 8px;">Відповідь:</div>
          ` : ''}
          <div style="
            font-size: 14px;
            line-height: 1.6;
            color: #fff;
            padding: 12px;
            background: rgba(139, 92, 246, 0.1);
            border-radius: 8px;
            border-left: 3px solid #8b5cf6;
            max-height: 250px;
            overflow-y: auto;
          ">${text}</div>
        </div>
      </div>
    `;
    document.body.appendChild(popup);

    setTimeout(() => {
      if (popup && popup.parentNode) {
        popup.remove();
      }
    }, 30000);
  };

  // Функція для показу перекладу
  window.showTranslationPopup = function(translation, originalText = '') {
    const oldPopup = document.getElementById('browserx-translation-popup');
    if (oldPopup) oldPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'browserx-translation-popup';
    popup.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 400px;
        min-width: 280px;
        background: linear-gradient(135deg, #1a1b26 0%, #24283b 100%);
        border: 1px solid #3b82f6;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(59, 130, 246, 0.2);
        z-index: 2147483647;
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #fff;
        overflow: hidden;
        animation: slideIn 0.3s ease-out;
      ">
        <div style="
          padding: 14px 18px;
          background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <span style="font-weight: 600; font-size: 14px;">🌐 Переклад</span>
          <button onclick="this.closest('#browserx-translation-popup').remove()" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">×</button>
        </div>
        <div style="padding: 16px;">
          ${originalText ? `
            <div style="font-size: 12px; color: #888; margin-bottom: 8px;">Оригінал:</div>
            <div style="
              font-size: 13px;
              color: #a0a0a0;
              margin-bottom: 12px;
              padding: 10px;
              background: rgba(0,0,0,0.3);
              border-radius: 8px;
              max-height: 60px;
              overflow-y: auto;
            ">${originalText.substring(0, 200)}${originalText.length > 200 ? '...' : ''}</div>
            <div style="font-size: 12px; color: #888; margin-bottom: 8px;">Переклад:</div>
          ` : ''}
          <div style="
            font-size: 15px;
            line-height: 1.6;
            color: #fff;
            padding: 12px;
            background: rgba(59, 130, 246, 0.1);
            border-radius: 8px;
            border-left: 3px solid #3b82f6;
          ">${translation}</div>
        </div>
      </div>
    `;
    document.body.appendChild(popup);

    setTimeout(() => {
      if (popup && popup.parentNode) {
        popup.remove();
      }
    }, 15000);
  };

  // Слухач для повідомлень від головного процесу
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type) {
      if (event.data.type === 'AI_ASSISTANT_RESULT') {
        window.showAIPopup(event.data.answer, event.data.originalText || '');
      } else if (event.data.type === 'TRANSLATION_RESULT') {
        window.showTranslationPopup(event.data.translation, event.data.originalText || '');
      }
    }
  });
})();
