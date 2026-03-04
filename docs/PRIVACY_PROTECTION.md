# 🔒 Захист конфіденційності - Privacy Protection

Цей документ описує механізми захисту конфіденційності в BrowserX, які запобігають витоку реальної геолокації та IP-адреси при використанні Tor.

---

## 📋 Вектори витоку інформації

Навіть з увімкненим Tor, сайти можуть визначити вашу реальну локацію через **три основні вектори**:

### 1. 📍 Витік через Geolocation API
**Проблема:** JavaScript може викликати `navigator.geolocation.getCurrentPosition()`, який звертається безпосередньо до операційної системи (Windows/macOS/Linux). ОС визначає локацію через:
- Сусідні Wi-Fi мережі
- GPS (якщо є)
- IP-based геолокацію

**Tor тут не допомагає** - запит іде не через інтернет, а через системний API.

**Наше рішення:**
```javascript
// Автоматично блокуємо геолокацію коли Tor увімкнений
navigator.geolocation.getCurrentPosition = function(success, error) {
  console.warn('[PRIVACY] Geolocation blocked - Tor mode active');
  error({ code: 1, message: 'User denied Geolocation' });
};
```

---

### 2. 🌐 Витік через WebRTC
**Проблема:** WebRTC (Web Real-Time Communication) використовується для відеодзвінків та P2P з'єднань. Його архітектура **ігнорує системні проксі** та відправляє UDP пакети напряму, розкриваючи:
- Реальну публічну IP-адресу
- Локальну IP-адресу (192.168.x.x)

**Тест витоку:** https://browserleaks.com/webrtc

**Наше рішення:**
```javascript
// Chromium аргументи при старті app
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
```

Це **блокує всі UDP з'єднання** що обходять проксі, залишаючи лише безпечні TCP через Tor.

---

### 3. 🔍 Витік через DNS (DNS Leak)
**Проблема:** Навіть якщо HTTP трафік йде через Tor, **DNS запити** (перетворення доменів на IP) можуть йти через вашого інтернет-провайдера. Якщо сайт бачить український DNS, він зрозуміє ваш регіон.

**Тест витоку:** https://dnsleaktest.com/

**Наше рішення:**
```javascript
// Форсуємо всі DNS запити через Tor SOCKS5
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
```

Це **змушує Chromium** резолвити DNS виключно через SOCKS5 проксі (Tor), а не через системний DNS.

---

## 🛡️ Механізм захисту

### Автоматична активація

Privacy Mode **автоматично активується** при увімкненні Tor:

```
[TOR] Tor enabled - traffic via SOCKS5 proxy
[TOR] DNS resolution: Via Tor SOCKS5 (no DNS leak)
[PRIVACY] 🔒 Privacy mode ENABLED
[PRIVACY] - Geolocation API: BLOCKED
[PRIVACY] - WebRTC UDP: BLOCKED
[PRIVACY] - DNS queries: Via Tor SOCKS5
```

### Що захищається

| Вектор витоку | Без Tor | З Tor | Захист |
|---------------|---------|-------|--------|
| **Geolocation API** | OS визначає | ❌ Блоковано | `navigator.geolocation` підміняється |
| **WebRTC Leak** | Показує реальну IP | ❌ Блоковано | `disable_non_proxied_udp` |
| **DNS Leak** | Через провайдера | ✅ Через Tor | `host-resolver-rules` |
| **HTTP/HTTPS** | Пряме з'єднання | ✅ Через Tor | SOCKS5 proxy |

---

## 🧪 Тестування витоків

### Через JavaScript API

```javascript
const { ipcRenderer } = require('electron');

// Перевірити статус Privacy Mode
const status = await ipcRenderer.invoke('get-privacy-status');
console.log(status);
// { privacyModeActive: true, torActive: true }

// Запустити повну перевірку витоків
const leaks = await ipcRenderer.invoke('check-privacy-leaks');
console.log(leaks);
/*
{
  webrtcLeak: false,      // ✓ WebRTC захищено
  geolocationLeak: false, // ✓ Геолокація заблокована
  dnsLeak: false,         // ✓ DNS через Tor
  timestamp: "2026-03-04T12:00:00.000Z"
}
*/
```

### Через онлайн сервіси

**з увімкненим Tor:**

1. **IP Address Test**
   - Сайт: https://check.torproject.org/
   - Очікуваний результат: "Congratulations. This browser is configured to use Tor."

2. **WebRTC Leak Test**
   - Сайт: https://browserleaks.com/webrtc
   - Очікуваний результат: Не показує вашу реальну IP

3. **DNS Leak Test**
   - Сайт: https://dnsleaktest.com/
   - Очікуваний результат: DNS через Tor exit node, не ваш провайдер

4. **Geolocation Test**
   - Сайт: https://browserleaks.com/geo
   - Очікуваний результат: "Permission denied" або Tor exit node локація

---

## 🔧 Архітектура захисту

### Компоненти

```
┌─────────────────────────────────────────────────────┐
│                   BrowserX App                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌───────────────┐         ┌──────────────────┐    │
│  │  main.js      │────────▶│  privacy-guard   │    │
│  │  (app start)  │         │  .js             │    │
│  └───────────────┘         └──────────────────┘    │
│         │                           │               │
│         ▼                           ▼               │
│  ┌───────────────┐         ┌──────────────────┐    │
│  │ tor-manager   │────────▶│  Захист:         │    │
│  │ .js           │         │  - Geolocation   │    │
│  └───────────────┘         │  - WebRTC        │    │
│         │                  │  - DNS           │    │
│         │                  └──────────────────┘    │
│         ▼                                           │
│  ┌───────────────────────────────────────────┐     │
│  │   Electron Session (SOCKS5 proxy)         │     │
│  │   127.0.0.1:9050 → Tor Network            │     │
│  └───────────────────────────────────────────┘     │
│                     │                               │
└─────────────────────┼───────────────────────────────┘
                      ▼
              🌐 Internet (через Tor)
```

### Потік даних

1. **Startup:**
   ```
   app.whenReady()
   → privacyGuard.initializePrivacyProtection()
   → app.commandLine.appendSwitch('force-webrtc-ip-handling-policy')
   → session.setPermissionRequestHandler()
   ```

2. **Tor ON:**
   ```
   toggleTor(true)
   → session.setProxy({ proxyRules: 'socks5://127.0.0.1:9050' })
   → app.commandLine.appendSwitch('host-resolver-rules', ...)
   → privacyGuard.enablePrivacyMode()
   → Inject geolocation spoofing script
   ```

3. **Page Load:**
   ```
   did-finish-load
   → Check if privacyModeEnabled
   → executeJavaScript(privacyScript)
   → navigator.geolocation patched
   ```

---

## 📊 Логування

Всі дії Privacy Guard логуються з префіксом `[PRIVACY]`:

### Startup logs:
```
[PRIVACY] Initializing privacy protection...
[PRIVACY] ✓ WebRTC leak protection enabled
[PRIVACY] Policy: disable_non_proxied_udp (blocks direct UDP connections)
[PRIVACY] ✓ Permission handler registered
```

### Tor ON logs:
```
[TOR] DNS resolution: Via Tor SOCKS5 (no DNS leak)
[PRIVACY] 🔒 Privacy mode ENABLED
[PRIVACY] - Geolocation API: BLOCKED
[PRIVACY] - WebRTC UDP: BLOCKED
[PRIVACY] - DNS queries: Via Tor SOCKS5
```

### Blocked requests:
```
[PRIVACY] ❌ Blocked geolocation request from: https://duckduckgo.com
[PRIVACY] Reason: Tor is active, geolocation would reveal real location
[PRIVACY] Geolocation blocked - Tor mode
```

---

## 🛠️ Налаштування для розробників

### Ручна активація Privacy Mode

```javascript
const privacyGuard = require('./modules/privacy-guard');
const { BrowserWindow } = require('electron');

// Увімкнути
privacyGuard.enablePrivacyMode(BrowserWindow.getFocusedWindow());

// Вимкнути
privacyGuard.disablePrivacyMode(BrowserWindow.getFocusedWindow());

// Перевірити стан
const isActive = privacyGuard.isPrivacyModeEnabled();
```

### Тестування витоків

```javascript
const leaks = await privacyGuard.checkPrivacyLeaks();

if (leaks.webrtcLeak) {
  console.error('⚠️ WebRTC leak detected!');
}
if (leaks.geolocationLeak) {
  console.error('⚠️ Geolocation not blocked!');
}
if (leaks.dnsLeak) {
  console.error('⚠️ DNS leak detected!');
}
```

### Інжекція в нові вкладки

Privacy скрипт **автоматично інжектується** в кожну нову сторінку через `tab-manager.js`:

```javascript
// В did-finish-load обробнику
if (privacyGuard.isPrivacyModeEnabled()) {
  browserView.webContents.executeJavaScript(privacyScript);
}
```

---

## ⚠️ Обмеження

### Що НЕ захищається

1. **Canvas Fingerprinting** - потрібен окремий модуль
2. **Font Fingerprinting** - потрібен окремий модуль  
3. **Screen Resolution** - можна підміняти через `window.screen`
4. **Timezone** - UTC рекомендовано
5. **Language/Locale** - `en-US` рекомендовано для анонімності

### Відомі проблеми

- **Flash/Java плагіни:** Не підтримуються, повністю відключені в Chromium
- **System fonts:** Можуть розкрити ОС (вимагає font spoofing)

---

## 📚 Додаткові ресурси

### Документація Tor
- https://2019.www.torproject.org/docs/browser-design.html.en
- https://support.torproject.org/

### Тестові сервіси
- https://check.torproject.org/
- https://browserleaks.com/
- https://dnsleaktest.com/
- https://ipleak.net/

### Безпека браузерів
- https://privacytests.org/
- https://coveryourtracks.eff.org/

---

**Версія документа:** 1.0  
**Останнє оновлення:** Березень 2026  
**Автор:** BrowserX Team
