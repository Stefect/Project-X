// Hotkeys - керування гарячими клавішами для AI та перекладу
(function() {
    console.log('⌨️ Hotkeys модуль активовано');
    
    // Дефолтні біндинги (можна змінювати через налаштування)
    let hotkeys = {
        aiAssistant: 'k', // K для AI помічника
        translator: 'l',  // L для перекладу
        modifiers: {
            aiAssistant: [], // без модифікаторів
            translator: []   // без модифікаторів
        }
    };
    
    // Завантажуємо збережені біндинги з localStorage
    try {
        const savedHotkeys = localStorage.getItem('browserx_hotkeys');
        if (savedHotkeys) {
            hotkeys = JSON.parse(savedHotkeys);
            console.log('⌨️ Завантажено збережені hotkeys:', hotkeys);
        }
    } catch (e) {
        console.error('❌ Помилка завантаження hotkeys:', e);
    }
    
    // Слухаємо оновлення біндингів з settings
    window.addEventListener('message', (event) => {
        if (event.data.type === 'UPDATE_HOTKEYS') {
            hotkeys = event.data.hotkeys;
            localStorage.setItem('browserx_hotkeys', JSON.stringify(hotkeys));
            console.log('⌨️ Hotkeys оновлено:', hotkeys);
        }
        
        // Показуємо AI відповідь
        if (event.data.type === 'AI_ASSISTANT_RESULT') {
            showAIResult(event.data.answer, event.data.originalText);
        }
    });
    
    // Показуємо AI відповідь у popup
    function showAIResult(answer, originalText) {
        // Видаляємо попередній результат
        const existing = document.getElementById('ai-result-popup');
        if (existing) existing.remove();
        
        const popup = document.createElement('div');
        popup.id = 'ai-result-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            max-width: 600px;
            max-height: 80vh;
            background: linear-gradient(135deg, #1a1b26 0%, #24283b 100%);
            color: #c0caf5;
            padding: 24px;
            border-radius: 16px;
            font-size: 14px;
            font-family: 'Segoe UI', sans-serif;
            z-index: 999999;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid #3b82f6;
            overflow-y: auto;
            animation: popupSlideIn 0.3s ease-out;
        `;
        
        popup.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #3b82f6; font-size: 18px;">🤖 AI Помічник</h3>
                <button id="close-ai-popup" style="background: none; border: none; color: #c0caf5; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px;">×</button>
            </div>
            <div style="background: rgba(59, 130, 246, 0.1); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 3px solid #3b82f6;">
                <div style="font-size: 12px; color: #7aa2f7; margin-bottom: 4px;">Ваш запит:</div>
                <div style="color: #c0caf5;">${originalText.length > 200 ? originalText.substring(0, 200) + '...' : originalText}</div>
            </div>
            <div style="line-height: 1.6; white-space: pre-wrap;">${answer}</div>
        `;
        
        // Додаємо анімацію
        if (!document.getElementById('ai-popup-style')) {
            const style = document.createElement('style');
            style.id = 'ai-popup-style';
            style.textContent = `
                @keyframes popupSlideIn {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -48%);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%);
                    }
                }
                #ai-result-popup::-webkit-scrollbar {
                    width: 8px;
                }
                #ai-result-popup::-webkit-scrollbar-track {
                    background: rgba(65, 72, 104, 0.3);
                    border-radius: 4px;
                }
                #ai-result-popup::-webkit-scrollbar-thumb {
                    background: #3b82f6;
                    border-radius: 4px;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(popup);
        
        // Закриття popup
        const closeBtn = document.getElementById('close-ai-popup');
        closeBtn.onclick = () => {
            popup.style.opacity = '0';
            popup.style.transform = 'translate(-50%, -48%)';
            popup.style.transition = 'all 0.2s';
            setTimeout(() => popup.remove(), 200);
        };
        
        // Закриття при кліку поза popup
        setTimeout(() => {
            document.addEventListener('click', function closeOnOutside(e) {
                if (!popup.contains(e.target)) {
                    closeBtn.click();
                    document.removeEventListener('click', closeOnOutside);
                }
            });
        }, 100);
    }
    
    // Глобальний слухач клавіатури
    document.addEventListener('keydown', function(e) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        // Якщо немає виділеного тексту - пропускаємо
        if (!selectedText || selectedText.length === 0) {
            return;
        }
        
        // Перевіряємо, чи не в полі вводу
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return; // Ігноруємо в полях вводу
        }
        
        const key = e.key.toLowerCase();
        
        // AI Assistant (K)
        if (key === hotkeys.aiAssistant && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            console.log('AI_ASSISTANT_REQUEST:' + JSON.stringify({
                text: selectedText
            }));
            showHotkeyFeedback('🤖 Запитую AI...', e.clientX, e.clientY);
        }
        
        // Translator (L)
        else if (key === hotkeys.translator && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            console.log('TRANSLATE_REQUEST:' + JSON.stringify({
                text: selectedText,
                targetLanguage: 'uk'
            }));
            showHotkeyFeedback('🌐 Перекладаю...', e.clientX, e.clientY);
        }
    });
    
    // Показуємо feedback при натисканні hotkey
    function showHotkeyFeedback(text, x, y) {
        // Видаляємо попередній feedback
        const existing = document.getElementById('hotkey-feedback');
        if (existing) existing.remove();
        
        const feedback = document.createElement('div');
        feedback.id = 'hotkey-feedback';
        feedback.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y + 20}px;
            background: linear-gradient(135deg, #3b82f6, #1e40af);
            color: white;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-family: 'Segoe UI', sans-serif;
            z-index: 999999;
            box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
            pointer-events: none;
            animation: slideIn 0.2s ease-out;
        `;
        feedback.textContent = text;
        
        // Додаємо анімацію
        if (!document.getElementById('hotkey-feedback-style')) {
            const style = document.createElement('style');
            style.id = 'hotkey-feedback-style';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(feedback);
        
        // Видаляємо через 2 секунди
        setTimeout(() => {
            feedback.style.opacity = '0';
            feedback.style.transition = 'opacity 0.3s';
            setTimeout(() => feedback.remove(), 300);
        }, 2000);
    }
    
    // Експортуємо API для налаштувань
    window.BrowserXHotkeys = {
        get: () => hotkeys,
        set: (newHotkeys) => {
            hotkeys = newHotkeys;
            localStorage.setItem('browserx_hotkeys', JSON.stringify(hotkeys));
            console.log('⌨️ Hotkeys збережено:', hotkeys);
        }
    };
})();
