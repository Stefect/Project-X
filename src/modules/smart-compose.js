(function() {
    let activeInput = null;
    let ghostBox = null;
    let debounceTimer = null;
    let currentSuggestion = "";

    // 1. Створюємо "Примарне вікно" для підказки
    function createGhostUI() {
        ghostBox = document.createElement('div');
        Object.assign(ghostBox.style, {
            position: 'absolute',
            display: 'none',
            pointerEvents: 'none', // Щоб крізь нього можна було клікати
            zIndex: '999999',
            fontFamily: 'monospace',
            fontSize: '12px',
            backgroundColor: '#222',
            color: '#a5d6a7', // Приємний зелений колір
            padding: '4px 8px',
            borderRadius: '4px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            whiteSpace: 'pre'
        });
        // Додаємо текст "Tab" щоб користувач знав, що тиснути
        ghostBox.innerHTML = '<span style="opacity:0.5; font-size:10px">[Tab]</span> ';
        document.body.appendChild(ghostBox);
    }
    
    createGhostUI();

    // 2. Функція позиціонування підказки
    function positionGhost(targetInput) {
        const rect = targetInput.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        // Показуємо підказку трохи вище поля вводу (щоб не перекривати текст)
        ghostBox.style.top = (rect.top + scrollTop - 30) + 'px';
        ghostBox.style.left = (rect.left + scrollLeft) + 'px';
        ghostBox.style.display = 'block';
    }

    // 3. Слухаємо введення тексту
    document.addEventListener('input', (e) => {
        const target = e.target;
        // Працюємо тільки з текстовими полями
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

        activeInput = target;
        ghostBox.style.display = 'none'; // Ховаємо стару підказку поки друкуємо
        currentSuggestion = "";

        const text = target.value;
        
        // Скидаємо таймер (якщо користувач продовжує друкувати)
        clearTimeout(debounceTimer);

        // Якщо тексту мало, не чіпаємо ШІ
        if (text.length < 5) return;

        // ЗАПУСКАЄМО ТАЙМЕР (чекаємо 0.6 секунди тиші)
        debounceTimer = setTimeout(async () => {
            // Питаємо Groq
            // (Передбачається, що у тебе налаштований міст window.api)
            if (window.api && window.api.invoke) {
                const suggestion = await window.api.invoke('predict-completion', text);
                
                if (suggestion && suggestion.length > 0) {
                    currentSuggestion = suggestion;
                    
                    // Оновлюємо текст у вікні
                    ghostBox.innerHTML = `<span style="opacity:0.5; font-size:10px; margin-right:5px;">TAB ↹</span> ${suggestion}`;
                    positionGhost(target);
                }
            }
        }, 600); 
    });

    // 4. Обробка натискання TAB
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && ghostBox.style.display === 'block' && currentSuggestion) {
            e.preventDefault(); // Забороняємо перехід фокусу на інший елемент
            
            // Вставляємо текст
            if (activeInput) {
                activeInput.value += " " + currentSuggestion; // Додаємо пробіл і підказку
                
                // Створюємо подію, щоб React/Vue сайти зрозуміли, що текст змінився
                activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Ховаємо підказку
            ghostBox.style.display = 'none';
            currentSuggestion = "";
        }
    });

    // Ховаємо, якщо клікнули десь інде
    document.addEventListener('click', (e) => {
        if (e.target !== activeInput) {
            ghostBox.style.display = 'none';
        }
    });

})();