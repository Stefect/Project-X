// Скрипт для інжектування в веб-сторінки
(function() {
  // Функція для показу popup
  window.showAIPopup = function(text) {
    const oldPopup = document.getElementById('ai-explanation-popup');
    if (oldPopup) oldPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'ai-explanation-popup';
    popup.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      max-width: 350px;
      padding: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      animation: slideIn 0.3s ease-out;
    `;

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

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '';
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
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
    `;
    closeBtn.onclick = () => popup.remove();

    const content = document.createElement('div');
    content.style.paddingRight = '20px';
    content.textContent = text;
    
    const header = document.createElement('div');
    header.innerHTML = '<strong> AI Помічник:</strong><br><br>';
    content.insertBefore(header.firstChild, content.firstChild);

    popup.appendChild(closeBtn);
    popup.appendChild(content);
    document.body.appendChild(popup);

    setTimeout(() => {
      if (popup.parentNode) {
        popup.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => popup.remove(), 300);
      }
    }, 10000);
  };
})();
