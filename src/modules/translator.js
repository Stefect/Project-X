// Translator - швидкий переклад виділеного тексту
(function() {
    console.log('🌐 Translator активовано');
    
    let selectedText = '';
    let targetLanguage = 'uk'; // За замовчуванням українська
    
    // Слухаємо зміну мови з main process
    window.addEventListener('message', (event) => {
        if (event.data.type === 'SET_TRANSLATION_LANGUAGE') {
            targetLanguage = event.data.language;
            console.log('🌐 Мова перекладу змінена на:', targetLanguage);
        }
    });
    
    // Відслідковуємо виділення тексту
    document.addEventListener('mouseup', function(e) {
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            
            if (text && text.length > 0 && text.length < 5000) {
                selectedText = text;
                
                // Автоматично запускаємо переклад при виділенні
                console.log('TRANSLATE_REQUEST:' + JSON.stringify({
                    text: selectedText,
                    targetLanguage: targetLanguage
                }));
                
                // Показуємо індикатор завантаження
                showTranslatingIndicator(e.pageX, e.pageY);
            }
        }, 10);
    });
    
    // Показуємо індикатор перекладу
    function showTranslatingIndicator(x, y) {
        // Видаляємо попередній індикатор
        const existing = document.getElementById('translating-indicator');
        if (existing) existing.remove();
        
        const indicator = document.createElement('div');
        indicator.id = 'translating-indicator';
        indicator.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y + 20}px;
            background: linear-gradient(135deg, #3b82f6, #1e40af);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-family: 'Segoe UI', sans-serif;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            pointer-events: none;
            animation: pulse 1s infinite;
        `;
        indicator.textContent = '🌐 Перекладаю...';
        
        // Додаємо анімацію
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(indicator);
        
        // Видаляємо через 10 секунд якщо не прийшла відповідь
        setTimeout(() => {
            if (document.getElementById('translating-indicator')) {
                indicator.remove();
            }
        }, 10000);
    }
    
    // Отримуємо переклад з main process
    window.addEventListener('message', (event) => {
        if (event.data.type === 'TRANSLATION_RESULT') {
            // Видаляємо індикатор завантаження
            const indicator = document.getElementById('translating-indicator');
            if (indicator) indicator.remove();
            
            showTranslationPopup(event.data.translation, event.data.originalText);
        }
    });
    
    // Показуємо popup з перекладом
    function showTranslationPopup(translation, originalText) {
        // Видаляємо попередній popup
        const existing = document.getElementById('translation-popup');
        if (existing) existing.remove();
        
        const popup = document.createElement('div');
        popup.id = 'translation-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #3b82f6;
            border-radius: 12px;
            padding: 20px;
            max-width: 600px;
            max-height: 400px;
            overflow-y: auto;
            z-index: 1000000;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            font-family: 'Segoe UI', sans-serif;
        `;
        
        popup.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #1e40af; font-size: 18px;">🌐 Переклад</h3>
                <button id="close-translation-popup" style="
                    background: #ef4444;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                ">✕</button>
            </div>
            
            <div style="margin-bottom: 15px; padding: 12px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <div style="font-size: 12px; color: #64748b; margin-bottom: 5px; font-weight: 600;">Оригінал:</div>
                <div style="color: #334155; line-height: 1.6;">${escapeHtml(originalText)}</div>
            </div>
            
            <div style="padding: 12px; background: #dbeafe; border-radius: 8px; border-left: 4px solid #1e40af;">
                <div style="font-size: 12px; color: #1e40af; margin-bottom: 5px; font-weight: 600;">Переклад:</div>
                <div style="color: #1e3a8a; line-height: 1.6; font-size: 15px;">${escapeHtml(translation)}</div>
            </div>
        `;
        
        document.body.appendChild(popup);
        
        // Закриття popup
        document.getElementById('close-translation-popup').addEventListener('click', () => {
            popup.remove();
        });
        
        // Закриття по кліку поза popup
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                popup.remove();
            }
        });
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();
