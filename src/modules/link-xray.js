// AI Link X-Ray - Рентген Посилань 
// Наведи мишку на посилання на 1 секунду - отримай AI-опис сторінки

(function() {
  // Перевіряємо чи вже ініціалізовано
  if (window._linkXRayEnabled) return;
  window._linkXRayEnabled = true;

  console.log(' Link X-Ray активовано');

  // Створюємо елемент підказки (Tooltip)
  const tooltip = document.createElement('div');
  tooltip.id = 'xray-tooltip';
  Object.assign(tooltip.style, {
    position: 'fixed',
    display: 'none',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '10px',
    fontSize: '13px',
    maxWidth: '280px',
    zIndex: '2147483647',
    pointerEvents: 'none',
    boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    lineHeight: '1.4',
    backdropFilter: 'blur(10px)'
  });
  document.body.appendChild(tooltip);

  let hoverTimer = null;
  let currentLink = null;
  const processedLinks = new WeakSet();

  // Функція для показу тултіпа
  function showTooltip(e, text) {
    tooltip.innerText = text;
    tooltip.style.display = 'block';
    
    // Позиціонуємо біля курсора
    let x = e.clientX + 15;
    let y = e.clientY + 15;
    
    // Перевіряємо, чи не виходить за межі екрану
    const rect = tooltip.getBoundingClientRect();
    if (x + 280 > window.innerWidth) {
      x = e.clientX - 295;
    }
    if (y + rect.height > window.innerHeight) {
      y = e.clientY - rect.height - 15;
    }
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  // Функція для приховування тултіпа
  function hideTooltip() {
    tooltip.style.display = 'none';
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    currentLink = null;
  }

  // Функція для сканування посилання
  async function scanLink(url, e) {
    showTooltip(e, ' Сканую...');
    
    try {
      // Відправляємо запит через console.log (перехоплюємо в main.js)
      console.log('XRAY_REQUEST:' + url);
      
      // Очікуємо відповідь через глобальну функцію
      // (буде встановлена з main.js)
      if (typeof window._xrayCallback === 'function') {
        const result = await window._xrayCallback(url);
        if (currentLink) {
          showTooltip(e, result);
        }
      }
    } catch (error) {
      if (currentLink) {
        showTooltip(e, ' Помилка сканування');
      }
    }
  }

  // Обробники подій
  function handleMouseEnter(e) {
    const link = e.target.closest('a');
    if (!link) return;
    
    const url = link.href;
    
    // Ігноруємо невалідні посилання
    if (!url || 
        url.startsWith('javascript') || 
        url.startsWith('#') ||
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url === window.location.href) {
      return;
    }
    
    currentLink = link;
    
    // Запускаємо таймер на 1 секунду
    hoverTimer = setTimeout(() => {
      scanLink(url, e);
    }, 1000);
  }

  function handleMouseLeave(e) {
    const link = e.target.closest('a');
    if (link === currentLink) {
      hideTooltip();
    }
  }

  function handleMouseMove(e) {
    if (tooltip.style.display === 'block') {
      let x = e.clientX + 15;
      let y = e.clientY + 15;
      
      if (x + 280 > window.innerWidth) {
        x = e.clientX - 295;
      }
      if (y + 100 > window.innerHeight) {
        y = e.clientY - 100;
      }
      
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }
  }

  // Використовуємо делегування подій (ефективніше)
  document.addEventListener('mouseover', handleMouseEnter, true);
  document.addEventListener('mouseout', handleMouseLeave, true);
  document.addEventListener('mousemove', handleMouseMove, true);

  // Ховаємо при кліку
  document.addEventListener('click', hideTooltip, true);

  // Функція для отримання результату X-Ray
  window._showXRayResult = function(result) {
    if (currentLink && tooltip.style.display === 'block') {
      tooltip.innerText = result;
    }
  };

})();
