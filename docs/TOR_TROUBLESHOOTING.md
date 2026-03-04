# 🔧 Усунення проблем з підключенням Tor

Цей документ описує типові проблеми з підключенням до мережі Tor та їх вирішення.

> **⚠️ ВАЖЛИВО:** Навіть з увімкненим Tor, можливі **витоки локації** через Geolocation API, WebRTC та DNS. Див. [розділ 7](#7-витоки-конфіденційності-geolocation-webrtc-dns) та [PRIVACY_PROTECTION.md](PRIVACY_PROTECTION.md).

---

## 📋 Зміст

1. [Застарілий бінарник Tor](#1-застарілий-бінарник-tor)
2. [Зависання на стадії Bootstrap](#2-зависання-на-стадії-bootstrap)
3. [Зламані або заблоковані мости](#3-зламані-або-заблоковані-мости)
4. [Права доступу до Data Directory](#4-права-доступу-до-data-directory)
5. [Конфлікт портів (зомбі-процеси)](#5-конфлікт-портів-зомбі-процеси)
6. [Як використовувати мости](#6-як-використовувати-мости)
7. **[Витоки конфіденційності (Geolocation, WebRTC, DNS)](#7-витоки-конфіденційності-geolocation-webrtc-dns)** ⭐ НОВИЙ

---

## 1. Застарілий бінарник Tor

### 🔴 Проблема
Мережа Tor регулярно оновлює протоколи консенсусу та відхиляє старі версії клієнтів з міркувань безпеки. Якщо ваш браузер постачається з вбудованим `tor.exe` (або `tor` для Linux/macOS), який давно не оновлювався, вузли Directory Authorities просто відкидатимуть його запити.

### ✅ Рішення
Браузер **автоматично перевіряє версію Tor** при запуску та виводить попередження у консоль:

```
[TOR] Detected Tor version: 0.4.6.10
[TOR] ⚠️ WARNING: Tor version is outdated! Network may reject connections.
[TOR] Please update to Tor 0.4.7.0 or newer.
```

**Як оновити Tor:**
1. Завантажте останню версію [Tor Expert Bundle](https://www.torproject.org/download/tor/)
2. Розпакуйте і замініть файл `bin/tor/tor.exe` (Windows) або `bin/tor/tor` (Linux/macOS)
3. Перезапустіть браузер

**Мінімальна рекомендована версія:** Tor 0.4.7.0 або новіша

---

## 2. Зависання на стадії Bootstrap

### 🔴 Проблема
Tor розбиває процес підключення на відсотки (0-100%). Браузер **автоматично моніторить** прогрес bootstrap і діагностує проблеми.

### 📊 Як відстежувати прогрес

Відкрийте Developer Tools (F12) і подивіться на логи:

```
[TOR] Bootstrap: 5% - Connecting to directory server
[TOR] Bootstrap: 10% - Finishing handshake with directory server
[TOR] Bootstrap: 45% - Establishing a Tor circuit
[TOR] Bootstrap: 100% - Done
[TOR] ✓ Tor successfully connected and ready!
```

### 🛠️ Діагностика проблем

#### Зависає на 5%-10%: Не вдається підключитися до Directory Authorities

**Симптоми:**
```
[TOR] Bootstrap: 5% - Connecting...
[TOR] ⚠️ Stuck at 5-10%: Cannot connect to Directory Authorities
[TOR] Check: 1) Network connection 2) Firewall 3) ISP blocking
```

**Причини:**
- Жорстке блокування провайдером на рівні мережі
- Застарілі IP-адреси каталогів (оновіть Tor)
- Блокування файрволом

**Рішення:**
1. Перевірте інтернет-з'єднання
2. Вимкніть файрвол тимчасово для тесту
3. **Використайте мости (bridges)** - див. розділ 6

---

#### Зависає на ~45%: Не вдається побудувати ланцюжок (circuit)

**Симптоми:**
```
[TOR] Bootstrap: 45% - Establishing a Tor circuit
[TOR] ⚠️ Stuck at ~45%: Cannot build circuits
[TOR] Consider: 1) Using bridges 2) Checking pluggable transports
```

**Причини:**
- Мережа блокує всі відомі relay Tor
- Країна з жорсткою цензурою (Китай, Іран, Туркменістан)

**Рішення:**
1. **Увімкніть мости (bridges)** - див. розділ 6
2. Використайте Pluggable Transports (obfs4, snowflake)
3. Спробуйте інший тип мосту

---

## 3. Зламані або заблоковані мости

### 🔴 Проблема
Вбудовані мости в `bin/tor/pluggable_transports/pt_config.json` можуть бути застарілими або заблокованими вашим провайдером.

### ✅ Автоматична перевірка

Браузер **автоматично перевіряє наявність PT бінарників**:

```
[TOR] ✓ Found PT binary: lyrebird.exe
[TOR] ✓ Found PT binary: conjure-client.exe
```

Якщо бінарники відсутні:
```
[TOR] ⚠️ Missing PT binary: lyrebird.exe
```

### 📦 Встановлення Pluggable Transports

1. Завантажте бінарники з [Tor Browser Bundle](https://www.torproject.org/download/)
2. Розпакуйте:
   - `lyrebird.exe` (obfs4, snowflake, meek)
   - `conjure-client.exe` (conjure)
3. Помістіть у `bin/tor/pluggable_transports/`

---

## 4. Права доступу до Data Directory

### 🔴 Проблема
Tor параноїдально ставиться до безпеки. Якщо директорія даних `bin/tor/data` має занадто широкі права (доступна для читання іншим користувачам), процес Tor тихо впаде з **Exit Code 1**.

### ✅ Автоматичне виправлення

Браузер **автоматично створює Data Directory** з правильними правами:

**Windows:**
```
[TOR] Created data directory: E:\Project-X\bin\tor\data
[TOR] Set directory permissions (Windows)
```

**Linux/macOS:**
```
[TOR] Created data directory: /path/to/bin/tor/data
[TOR] Set directory permissions to 700 (Unix)
```

### 🛠️ Ручне виправлення

**Linux/macOS:**
```bash
chmod 700 bin/tor/data
```

**Windows (PowerShell):**
```powershell
icacls "bin\tor\data" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"
```

---

## 5. Конфлікт портів (зомбі-процеси)

### 🔴 Проблема
Під час тестування попередній процес Tor міг не закритися коректно при закритті програми. Якщо у фоні висить завислий `tor.exe`, новий запуск не зможе забіндити порти SOCKS (9050) та Control (9051).

### ✅ Автоматична перевірка

Браузер **автоматично виконує перевірку**:

1. **Вбиває зомбі-процеси** перед запуском:
```
[TOR] Checking for zombie processes...
[TOR] Killed zombie Tor processes (Windows)
```

2. **Перевіряє доступність портів**:
```
[TOR] Checking port availability...
[TOR] ✓ Ports are available
```

Якщо порти зайняті:
```
[TOR] ❌ SOCKS port 9050 is already in use!
[TOR] A Tor process may still be running. Check Task Manager.
```

### 🛠️ Ручне виправлення

**Windows (Task Manager):**
1. Ctrl+Shift+Esc
2. Знайдіть процес `tor.exe`
3. Завершіть процес

**Windows (PowerShell):**
```powershell
taskkill /F /IM tor.exe
```

**Linux/macOS:**
```bash
pkill -9 tor
```

### 🔧 Програмне виправлення

Ви можете викликати функцію з Developer Tools:
```javascript
const { ipcRenderer } = require('electron');
// Код для виклику killZombieProcesses через IPC
```

---

## 6. Як використовувати мости

### 📖 Що таке мости?

**Bridges (мости)** - це приватні relay вузли Tor, які не публікуються в загальному каталозі. Вони допомагають обійти блокування в країнах з цензурою.

**Pluggable Transports** - це додаткові протоколи, які маскують Tor-трафік під звичайний HTTPS/HTTP.

### 🌉 Типи мостів

| Тип | Опис | Рекомендовано для |
|-----|------|-------------------|
| **obfs4** | Обфусцирує трафік, найпопулярніший | Загальне використання, стабільний |
| **snowflake** | Використовує волонтерські proxy через WebRTC | Китай, Іран, високий рівень цензури |
| **meek** | Тунелює через CDN (імітує Azure/Amazon) | Екстремальна цензура |
| **conjure** | Новий протокол з Refraction Networking | Експериментальний |

### 🚀 Увімкнення мостів

#### Через API (JavaScript):
```javascript
// У вашому коді:
const { ipcRenderer } = require('electron');

// Увімкнути obfs4 мости
await ipcRenderer.invoke('set-tor-bridges', true, 'obfs4');

// Увімкнути snowflake мости
await ipcRenderer.invoke('set-tor-bridges', true, 'snowflake');

// Вимкнути мости
await ipcRenderer.invoke('set-tor-bridges', false);
```

#### Через налаштування (коли буде UI):
1. Відкрийте Settings → Tor
2. Увімкніть "Use Bridges"
3. Оберіть тип: obfs4 / snowflake / meek / conjure
4. Tor автоматично перезапуститься

### 📋 Логи при використанні мостів

```
[TOR] Enabling bridges with transport: obfs4
[TOR] Loaded pluggable transports configuration
[TOR] ✓ Found PT binary: lyrebird.exe
[TOR] Added bridge: obfs4 37.218.245.14:38224...
[TOR] Added bridge: obfs4 209.148.46.65:443...
[TOR] ✓ Enabled obfs4 bridges (7 bridges)
```

### ⚠️ Якщо мости не працюють

1. **Оновіть список мостів**:
   - Отримайте нові мости через [BridgeDB](https://bridges.torproject.org/)
   - Або через Telegram: [@GetBridgesBot](https://t.me/GetBridgesBot)
   - Оновіть `bin/tor/pluggable_transports/pt_config.json`

2. **Спробуйте інший тип мосту**:
   - obfs4 → snowflake → meek → conjure

3. **Перевірте логи** на помилки PT:
```
[TOR] Failed to start pluggable transport...
```

---

## 7. Витоки конфіденційності (Geolocation, WebRTC, DNS)

### 🔴 Найнебезпечніша проблема

**Симптом:** Сайти визначають мою реальну локацію (Україна, Київ) навіть коли Tor увімкнений і показує IP з Німеччини.

**Приклад:**
- Відкриваєте DuckDuckGo з увімкненим Tor
- Exit node: Німеччина (IP показує Frankfurt)
- Але карта на сайті показує Київ 🇺🇦

### 🕵️ Три вектори витоку

#### 1. 📍 Geolocation API Leak (Найімовірніше)

**Проблема:**
```javascript
// Сайт викликає:
navigator.geolocation.getCurrentPosition((position) => {
  console.log(position.coords.latitude, position.coords.longitude);
  // Отримує РЕАЛЬНУ локацію з ОС (Wi-Fi, GPS)
});
```

Запит **НЕ ЙДЕ через інтернет** → Tor не допомагає. ОС визначає локацію через:
- Сусідні Wi-Fi точки доступу (найточніше)
- GPS (якщо є)
- Системна база даних геолокацій

**✅ Наше рішення:**

BrowserX **автоматично блокує** Geolocation API коли Tor увімкнений:

```
[PRIVACY] 🔒 Privacy mode ENABLED
[PRIVACY] - Geolocation API: BLOCKED
[PRIVACY] ❌ Blocked geolocation request from: https://duckduckgo.com
```

**Перевірка:**
```javascript
navigator.geolocation.getCurrentPosition(
  (pos) => console.log('✓ Allowed:', pos),
  (err) => console.log('✗ Blocked:', err.message)
);
// Результат з Tor: "✗ Blocked: User denied Geolocation"
```

---

#### 2. 🌐 WebRTC IP Leak

**Проблема:**

WebRTC (відеодзвінки, P2P) **обходить проксі** та відправляє UDP пакети напряму, розкриваючи:
- Вашу реальну публічну IP
- Локальну IP (192.168.x.x)

**Тест:** https://browserleaks.com/webrtc

**✅ Наше рішення:**

BrowserX блокує непроксійовані UDP з'єднання:

```
[PRIVACY] ✓ WebRTC leak protection enabled
[PRIVACY] Policy: disable_non_proxied_udp (blocks direct UDP connections)
```

Chromium аргумент:
```javascript
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
```

**Що це робить:**
- ✅ Дозволяє WebRTC через Tor (TCP)
- ❌ Блокує прямі UDP з'єднання
- ✅ Не розкриває реальну IP

---

#### 3. 🔍 DNS Leak

**Проблема:**

HTTP трафік йде через Tor, але **DNS запити** (перетворення `google.com` → IP) йдуть через вашого провайдера. Сайт бачить український DNS → розуміє регіон.

**Тест:** https://dnsleaktest.com/

**✅ Наше рішення:**

Всі DNS запити **форсуються через Tor SOCKS5**:

```
[TOR] DNS resolution: Via Tor SOCKS5 (no DNS leak)
```

Chromium аргумент:
```javascript
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
```

**Що це робить:**
- ❌ Блокує системний DNS resolver
- ✅ Всі DNS йдуть через SOCKS5 (Tor)
- ✅ Провайдер не бачить які сайти ви відвідуєте

---

### 📊 Таблиця захисту

| Вектор витоку | Без BrowserX | З BrowserX + Tor | Статус |
|---------------|--------------|------------------|--------|
| **HTTP/HTTPS трафік** | Пряме з'єднання | ✅ Через Tor | 🔒 Захищено |
| **DNS запити** | Через провайдера | ✅ Через Tor | 🔒 Захищено |
| **Geolocation API** | Реальна локація | ❌ Заблокована | 🔒 Захищено |
| **WebRTC UDP** | Реальна IP | ❌ Заблоковано | 🔒 Захищено |

---

### 🧪 Як перевірити захист

#### Метод 1: Онлайн тести (рекомендовано)

1. **Увімкніть Tor** в BrowserX
2. Відкрийте тести:

| Тест | URL | Очікуваний результат |
|------|-----|----------------------|
| Tor Check | https://check.torproject.org/ | "Congratulations. This browser is configured to use Tor." |
| IP Address | https://whatismyipaddress.com/ | IP з країни exit node (не ваша) |
| DNS Leak | https://dnsleaktest.com/ | DNS через Tor, не ваш провайдер |
| WebRTC Leak | https://browserleaks.com/webrtc | Не показує вашу реальну IP |
| Geolocation | https://browserleaks.com/geo | "Permission denied" або локація exit node |

#### Метод 2: Developer Console

```javascript
// Відкрийте Dev Tools (F12) → Console

// 1. Перевірка статусу
const { ipcRenderer } = require('electron');
const status = await ipcRenderer.invoke('get-privacy-status');
console.log(status);
// { privacyModeActive: true, torActive: true }

// 2. Повна діагностика витоків
const leaks = await ipcRenderer.invoke('check-privacy-leaks');
console.log(leaks);
/*
{
  webrtcLeak: false,      // ✓ Захищено
  geolocationLeak: false, // ✓ Захищено
  dnsLeak: false,         // ✓ Захищено
  timestamp: "2026-03-04T12:00:00Z"
}
*/

// 3. Тест Geolocation API
navigator.geolocation.getCurrentPosition(
  (pos) => console.log('❌ LEAK! Geolocation allowed:', pos),
  (err) => console.log('✓ PROTECTED! Geolocation blocked:', err.message)
);
```

---

### 🛠️ Що робити якщо тести показують витік

#### ❌ DuckDuckGo показує Київ з увімкненим Tor

**Діагностика:**
```
1. Developer Tools (F12) → Console
2. Виконайте:
   navigator.geolocation.getCurrentPosition(
     () => console.log('Leak!'),
     () => console.log('Protected!')
   )
3. Якщо "Leak!" → Privacy Mode не активний
```

**Рішення:**
```javascript
// Перевірте логи:
[PRIVACY] 🔒 Privacy mode ENABLED  // ← Має бути!

// Якщо немає - перезапустіть Tor:
await ipcRenderer.invoke('toggle-tor'); // Off
await ipcRenderer.invoke('toggle-tor'); // On
```

#### ❌ WebRTC показує реальну IP

**Діагностика:**
- Відкрийте https://browserleaks.com/webrtc
- Якщо бачите вашу справжню IP → WebRTC leak

**Рішення:**
1. Перевірте startup логи:
```
[PRIVACY] ✓ WebRTC leak protection enabled
[PRIVACY] Policy: disable_non_proxied_udp
```

2. Якщо немає - перезапустіть BrowserX (параметр встановлюється при старті)

#### ❌ DNS Leak тест показує вашого провайдера

**Діагностика:**
- Відкрийте https://dnsleaktest.com/
- Натисніть "Extended test"
- Якщо бачите свого провайдера (Kyivstar, Vodafone) → DNS leak

**Рішення:**
1. Перевірте логи:
```
[TOR] DNS resolution: Via Tor SOCKS5 (no DNS leak)
```

2. Якщо немає - перевірте проксі:
```javascript
const { session } = require('electron');
const proxy = await session.defaultSession.resolveProxy('https://google.com');
console.log(proxy); // Має бути "SOCKS5 127.0.0.1:9050"
```

---

### 📚 Детальна документація

Повний технічний опис захисту конфіденційності:
**[PRIVACY_PROTECTION.md](PRIVACY_PROTECTION.md)**

Включає:
- Архітектура захисту
- Потоки даних
- Код для розробників
- Відомі обмеження

---

## 📊 Моніторинг статусу Tor

### Отримання повного статусу

```javascript
const status = await ipcRenderer.invoke('get-tor-status');

console.log(status);
/*
{
  active: true,              // Чи активний проксі
  processRunning: true,      // Чи працює процес Tor
  ready: true,               // Чи готовий до використання
  bootstrapProgress: 100,    // Прогрес підключення (0-100)
  bootstrapStatus: "Connected", // Статус: "Connecting...", "Connected", etc.
  version: "0.4.7.13",       // Версія Tor
  socksPort: 9050,           // SOCKS5 проксі порт
  controlPort: 9051,         // Control Port
  exitCountry: "DE",         // Країна виходу
  useBridges: true,          // Чи використовуються мости
  bridgeType: "obfs4"        // Тип мосту
}
*/
```

---

## 🆘 Додаткова допомога

### Корисні посилання

- **Tor Project:** https://www.torproject.org/
- **Tor Expert Bundle:** https://www.torproject.org/download/tor/
- **Отримати мости:** https://bridges.torproject.org/
- **Telegram бот для мостів:** [@GetBridgesBot](https://t.me/GetBridgesBot)
- **Документація Tor:** https://tb-manual.torproject.org/

### Логи для діагностики

Всі важливі події логуються у Developer Console (F12):
- `[TOR]` - події Tor
- `[TOR] ✓` - успіх
- `[TOR] ⚠️` - попередження
- `[TOR] ❌` - критична помилка

### Повідомлення про баги

Якщо ви знайшли проблему, яка не описана тут:
1. Відкрийте Developer Tools (F12)
2. Збережіть логи з префіксом `[TOR]`
3. Створіть issue на GitHub з описом та логами

---

**Версія документа:** 1.0  
**Останнє оновлення:** Березень 2026
