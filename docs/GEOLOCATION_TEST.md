# Тестування блокування геолокації

## Як перевірити чи працює блокування

### Метод 1: Через DevTools Console

1. Відкрийте DuckDuckGo Maps або будь-який сайт що використовує геолокацію
2. Увімкніть Tor (кнопка "Tor: OFF" → "Tor: ON")
3. Натисніть `F12` щоб відкрити DevTools
4. Перейдіть на вкладку **Console**
5. Вставте цей код:

```javascript
navigator.geolocation.getCurrentPosition(console.log, console.error)
```

### Очікуваний результат (Tor увімкнений):
```
❌ GeolocationPositionError
   code: 1
   message: "User denied Geolocation"
   PERMISSION_DENIED: 1
```

### Якщо видає координати:
```
⚠️ ПРОБЛЕМА! Геолокація не заблокована!
   latitude: 50.xxxxx
   longitude: 30.xxxxx
```

---

## Метод 2: Автоматизований тест

1. Відкрийте файл `test-geolocation-block.js`
2. Скопіюйте весь його вміст
3. Вставте в Console вкладки з сайтом
4. Подивіться результати 4 тестів

---

## Рівні захисту

### ✅ Рівень 1: Chromium Flags
- `disable-features=Geolocation` - вимикає API на рівні движка

### ✅ Рівень 2: Permission Handler
- `setPermissionRequestHandler` - блокує системні запити дозволів
- Працює для defaultSession та всіх custom sessions

### ✅ Рівень 3: JavaScript Injection
- Підміна `navigator.geolocation` на fake об'єкт
- Автоматично інжектується в кожну нову вкладку через `web-contents-created`

### ✅ Рівень 4: Storage Cleanup
- Очищення localStorage, cookies, cache при увімкненні Tor
- Видаляє закешовані геодані з попередніх сесій

---

## Перевірка в логах

Після увімкнення Tor ви маєте побачити в консолі:

```
[PRIVACY] ✓ DNS leak protection enabled
[PRIVACY] ✓ WebRTC leak protection enabled
[PRIVACY] ✓ Global web-contents-created handler registered
[PRIVACY] ✓ Global session-created handler registered

[TOR] ✅ Tor enabled successfully

[PRIVACY] ✓ Cleared ALL storage types for Tor session
[PRIVACY] 🔒 Privacy mode ENABLED
[PRIVACY] - Geolocation API: BLOCKED
[PRIVACY] - WebRTC UDP: BLOCKED
[PRIVACY] - DNS queries: Via Tor SOCKS5
```

При спробі доступу до геолокації:
```
[PRIVACY] ❌ BLOCKED geolocation request from: https://duckduckgo.com
[PRIVACY] Reason: Tor is active, geolocation would reveal real location
```

---

## Що робити якщо блокування не працює

### 1. Перевірте чи Tor увімкнений
Кнопка має показувати: **Tor: ON** (фіолетовий колір)

### 2. Перезапустіть браузер
```bash
npm start
```

### 3. Перевірте версію Electron
У `package.json` має бути `electron >= 40.x.x`

### 4. Очистіть весь кеш вручну
В DevTools → Application → Clear storage → Clear site data

### 5. Перевірте чи інжектується скрипт
В Console має з'явитися при завантаженні сторінки:
```
[PRIVACY GUARD] ✓ Geolocation API has been disabled
```

---

## DuckDuckGo Maps специфіка

Якщо синя крапка все одно з'являється, це може бути:

1. **Кеш браузера** - DuckDuckGo зберігає останню локацію в localStorage
   - Рішення: Очистіть localStorage вручну або перезапустіть браузер з Tor вже увімкнутим

2. **IP Geolocation** - визначення міста по IP (не точна адреса)
   - Це нормально - Tor Exit Node може бути в іншій країні
   - Синя крапка буде в країні Exit Node, а не вашій реальній локації

3. **Мова браузера** - `Accept-Language: uk-UA` дає підказку про Україну
   - DuckDuckGo може центрувати карту на Україні за замовчуванням
   - Але точної адреси (синьої крапки) НЕ буде

---

## Успішне блокування виглядає так:

- ❌ Немає синьої крапки з вашою точною адресою
- ✅ Карта показує загальну зону (країну/регіон) по Tor Exit Node IP
- ✅ Console видає помилку при спробі `getCurrentPosition()`
- ✅ Логи показують блокування запитів геолокації

---

## Додаткові тести

### Перевірка WebRTC leak:
```javascript
// Має повернути порожній масив або undefined
new RTCPeerConnection().getLocalStreams()
```

### Перевірка IP:
Натисніть кнопку "🔍 IP" в топ-барі браузера
- Має показати IP вихідного Tor вузла (не ваш реальний IP)
- Країна: як правило Germany (DE) або інша, залежно від Exit Node

### Перевірка DNS:
```bash
# У DevTools Console
fetch('https://api.ipify.org?format=json')
  .then(r => r.json())
  .then(console.log)
```
- Має показати IP Tor Exit Node, не ваш ISP IP
