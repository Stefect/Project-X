// read-later.js - Read Later Module for BrowserX
// Saves articles for later reading

(function() {
  'use strict';

  if (window._readLaterEnabled) return;
  window._readLaterEnabled = true;

  console.log('[ReadLater] Module initialized');

  // Create floating button
  const button = document.createElement('button');
  button.id = 'read-later-button';
  button.innerHTML = '📖';
  button.title = 'Save for later reading';
  button.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 56px;
    height: 56px;
    padding: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999998;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  // Hover effects
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.1)';
    button.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  });

  document.body.appendChild(button);

  // Check if current page is already saved
  function isPageSaved() {
    const readLater = JSON.parse(localStorage.getItem('readLater') || '[]');
    return readLater.some(item => item.url === window.location.href);
  }

  // Update button appearance based on saved status
  function updateButtonState() {
    if (isPageSaved()) {
      button.innerHTML = '✓';
      button.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)';
      button.title = 'Already saved';
    } else {
      button.innerHTML = '📖';
      button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      button.title = 'Save for later reading';
    }
  }

  updateButtonState();

  // Save/unsave article
  button.addEventListener('click', () => {
    const url = window.location.href;
    const title = document.title || url;
    
    let readLater = JSON.parse(localStorage.getItem('readLater') || '[]');
    
    // Check if already saved
    const existingIndex = readLater.findIndex(item => item.url === url);
    
    if (existingIndex >= 0) {
      // Remove if already saved
      readLater.splice(existingIndex, 1);
      showNotification('Removed from Read Later', 'info');
    } else {
      // Add new item
      readLater.unshift({
        url: url,
        title: title,
        savedAt: Date.now(),
        favicon: document.querySelector('link[rel*="icon"]')?.href || '',
        description: document.querySelector('meta[name="description"]')?.content || ''
      });
      
      showNotification('Saved to Read Later!', 'success');
    }
    
    // Save to localStorage
    localStorage.setItem('readLater', JSON.stringify(readLater));
    
    // Update button
    updateButtonState();
  });

  // Show notification
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 30px;
      background: ${type === 'success' ? '#48bb78' : '#4299e1'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(400px)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Keyboard shortcut: Ctrl+Shift+S
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      button.click();
    }
  });

})();
