# 🔍 Виправлення "Білого екрану" при увімкненні Tor

## 🎯 Проблема

Після натискання кнопки **"Tor: ON"** ви бачите **білий екран** замість контенту. Це класичний симптом того що браузер намагається завантажити сторінку через Tor проксі до того як Tor процес встиг підключитися до мережі.

---

## ✅ Що було виправлено

### 1. **Bootstrap Progress Monitoring** 📊

Тепер браузер відстежує прогрес підключення Tor у реальному часі:

```
[TOR] Bootstrap: 5% - Connecting to directory server
[TOR] Bootstrap: 10% - Finishing handshake with directory server
[TOR] Bootstrap: 45% - Establishing a Tor circuit
[TOR] Bootstrap: 80% - Connecting to the Tor network
[TOR] Bootstrap: 100% - Done
[TOR] ✓ Tor successfully connected and ready!
```

### 2. **UI Індикатор завантаження** ⏳

Кнопка Tor тепер показує прогрес:
- **"Tor: 5%"** - підключається
- **"Tor: 45%"** - будує circuit
- **"Tor: 100%"** → **"Tor: OFF"** - готовий

Plus тост-повідомлення з прогресбаром:
```
⏳ Підключення до Tor...
45% - Establishing circuits
[████████░░] 45%
```

### 3. **Блокування передчасного увімкнення** 🚫

Якщо натиснути "Tor: ON" коли Tor ще не готовий:
```javascript
{
  status: false,
  message: "Tor підключається... 45%",
  bootstrapProgress: 45,
  bootstrapStatus: "Establishing circuits"
}
```

Кнопка залишається **disabled** і показує відсоток.

### 4. **Перевірка порту 9050** 🔌

Додаткова перевірка що SOCKS5 прослуховується:
```javascript
const portAvailable = await checkPortAvailable(9050);
if (portAvailable) {
  console.error('[TOR] ❌ SOCKS port is not listening!');
  return { status: false, message: 'Помилка: Tor процес не відповідає' };
}
```

### 5. **Затримка після setProxy** ⏱️

Після застосування проксі чекаємо 500ms щоб конфігурація точно застосувалась:
```javascript
await ses.setProxy({ ... });
await new Promise(resolve => setTimeout(resolve, 500));
```

---

## 🚀 Як це працює тепер

### Початкове завантаження (при запуску браузера)

1. **app.whenReady()** → Створюємо вікно
2. **startTor('DE', { mainWindow })** → Запускаємо Tor у фоні
3. Tor відправляє прогрес в UI через IPC:
   ```javascript
   mainWindow.webContents.send('tor-bootstrap-progress', {
     progress: 45,
     status: 'Establishing circuits',
     ready: false
   });
   ```
4. UI показує: **"Tor: 45%"** + Toast з прогресбаром
5. Коли прогрес = 100%:
   ```javascript
   mainWindow.webContents.send('tor-ready', true);
   ```
6. Кнопка стає: **"Tor: OFF"** (готовий до увімкнення)

### Увімкнення Tor (після завантаження)

Користувач натискає **"Tor: OFF"**:

```javascript
const result = await ipcRenderer.invoke('toggle-tor');

if (!isTorReady) {
  return {
    status: false,
    message: `Tor підключається... ${bootstrapProgress}%`
  };
}

// Tor готовий - застосовуємо проксі
await session.setProxy({ proxyRules: 'socks5://127.0.0.1:9050' });
await new Promise(resolve => setTimeout(resolve, 500)); // Чекаємо
isTorActive = true;

return { status: true, message: 'Tor увімкнено!' };
```

---

## 🧪 Як перевірити що працює

### 1. Запустіть браузер
```bash
npm start
```

### 2. Відкрийте Dev Tools (F12)

Подивіться на логи:
```
[TOR] Starting Tor (win32): E:\Project-X\bin\tor\tor.exe
[TOR] ✓ Tor process spawned successfully
[TOR] Bootstrap: 5% - Connecting to directory server
[TOR] Bootstrap: 10% - Finishing handshake
...
[TOR] Bootstrap: 100% - Done
[TOR] ✓ Tor successfully connected and ready!
```

### 3. Почекайте поки кнопка стане "Tor: OFF"

Це означає що Tor готовий. Зазвичай займає **30-60 секунд**.

### 4. Натисніть "Tor: OFF" → "Tor: ON"

Має з'явитись:
- ✅ Зелений toast: "✓ Tor увімкнено! Перегляд анонімний."
- ✅ Кнопка стає фіолетова: **"Tor: ON"**
- ✅ З'являється селектор країни виходу

### 5. Спробуйте відкрити сайт

Наприклад DuckDuckGo:
```
https://duckduckgo.com/
```

**Має завантажитись БЕЗ білого екрану!**

---

## ⚠️ Якщо білий екран все ще з'являється

### Діагностика

1. **Перевірте логи:**
   ```
   [TOR] ✓ Tor enabled - traffic via SOCKS5 proxy
   [TOR] ✓ DNS resolution: Via Tor SOCKS5 (no DNS leak)
   [TOR] ✓ Proxy configuration applied successfully
   ```

2. **Перевірте що порт слухає (Windows CMD):**
   ```cmd
   netstat -an | find "9050"
   ```
   
   Має бути:
   ```
   TCP    127.0.0.1:9050         0.0.0.0:0              LISTENING
   ```

3. **Перевірте статус через console:**
   ```javascript
   const status = await ipcRenderer.invoke('get-tor-status');
   console.log(status);
   ```
   
   Очікується:
   ```javascript
   {
     active: true,
     ready: true,
     bootstrapProgress: 100,
     bootstrapStatus: "Connected"
   }
   ```

### Можливі проблеми

#### ❌ Tor процес не запустився
**Симптоми:** Кнопка показує "Tor: 0%" і не змінюється

**Рішення:**
1. Перевірте що `bin/tor/tor.exe` існує
2. Перевірте антивірус (може блокувати)
3. Запустіть вручну через термінал:
   ```bash
   cd bin/tor
   tor.exe
   ```

#### ❌ Завис на 5-10%
**Симптоми:** Прогрес зупинився на 5-10%

**Причина:** Не може підключитися до Directory Authorities

**Рішення:**
1. Перевірте інтернет-з'єднання
2. Спробуйте увімкнути bridges:
   ```javascript
   await ipcRenderer.invoke('set-tor-bridges', true, 'obfs4');
   ```

#### ❌ Завис на 45%
**Симптоми:** Прогрес зупинився на ~45%

**Причина:** Не може побудувати circuit

**Рішення:**
- Використайте snowflake bridges:
  ```javascript
  await ipcRenderer.invoke('set-tor-bridges', true, 'snowflake');
  ```

#### ❌ Білий екран ПІСЛЯ увімкнення Tor
**Симптоми:** Tor ON, але сайти не завантажуються

**Рішення:**
1. Перезапустіть браузер (повністю)
2. Перевірте що DNS leak fix активний:
   ```
   [TOR] ✓ DNS resolution: Via Tor SOCKS5 (no DNS leak)
   ```
3. Спробуйте вимкнути/увімкнути Tor знову

---

## 📚 Додаткова інформація

- [TOR_TROUBLESHOOTING.md](docs/TOR_TROUBLESHOOTING.md) - повний гайд з усунення проблем
- [PRIVACY_PROTECTION.md](docs/PRIVACY_PROTECTION.md) - захист конфіденційності

---

## 🎓 Технічні деталі (для розробників)

### Потік подій

```
1. app.whenReady()
   ↓
2. createWindow() → UI готове
   ↓
3. startTor('DE', { mainWindow })
   ↓
4. torProcess.spawn() → Tor процес запущений
   ↓
5. stdout parsing → parseBootstrapLine()
   ↓
6. mainWindow.send('tor-bootstrap-progress', { progress: 45 })
   ↓
7. UI: "Tor: 45%" + Toast
   ↓
8. Bootstrap 100% → isTorReady = true
   ↓
9. mainWindow.send('tor-ready', true)
   ↓
10. UI: "Tor: OFF" (готовий до увімкнення)
    ↓
11. User clicks "Tor: OFF"
    ↓
12. toggleTor() → Check isTorReady
    ↓
13. if (!ready) return { message: "45%..." }
    ↓
14. if (ready) → session.setProxy()
    ↓
15. Wait 500ms → isTorActive = true
    ↓
16. UI: "Tor: ON" + Toast "✓ Увімкнено"
```

### Ключові зміни в коді

1. **tor-manager.js:**
   - Додано `mainWindowRef` для відправки прогресу
   - `parseBootstrapLine()` тепер відправляє IPC події
   - `toggleTor()` перевіряє порт 9050 та чекає 500ms
   - Додано детальні статуси у return values

2. **main.js:**
   - `startTor()` отримує `{ mainWindow }` параметр
   - Вікно створюється ПЕРЕД startTor

3. **index.html:**
   - Додано обробник `tor-bootstrap-progress`
   - Toast з прогресбаром
   - Disabled кнопка під час завантаження
   - Покращена обробка помилок

---

**Версія:** 1.0  
**Дата:** Березень 2026  
**Автор:** BrowserX Team
