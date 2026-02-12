# Інструкція для встановлення Tor (Cross-Platform)

## Windows

### Крок 1: Завантаження Tor Expert Bundle

1. Відкрийте офіційний сайт Tor Project: https://www.torproject.org/download/tor/
2. Завантажте **Tor Expert Bundle** для Windows
3. Це буде файл на кшталт: `tor-win64-0.x.x.x.zip`

### Крок 2: Витягнення файлів

1. Розпакуйте завантажений ZIP архів
2. Знайдіть файл `tor.exe` всередині папки `Tor/`
3. Скопіюйте `tor.exe` в папку `bin/tor/`

## macOS

### Встановлення через Homebrew (рекомендовано)

```bash
brew install tor
# Скопіюйте бінарник
cp /opt/homebrew/bin/tor bin/tor/tor
# або для Intel Mac
cp /usr/local/bin/tor bin/tor/tor
```

### Ручне встановлення

1. Завантажте Tor Expert Bundle для macOS: https://www.torproject.org/download/tor/
2. Розпакуйте архів і знайдіть бінарник `tor` (без розширення)
3. Скопіюйте його в `bin/tor/tor`
4. Встановіть права на виконання: `chmod +x bin/tor/tor`

## Linux

### Ubuntu/Debian

```bash
sudo apt-get install tor
cp /usr/bin/tor bin/tor/tor
chmod +x bin/tor/tor
```

### Arch Linux

```bash
sudo pacman -S tor
cp /usr/bin/tor bin/tor/tor
chmod +x bin/tor/tor
```

### Fedora/RHEL

```bash
sudo dnf install tor
cp /usr/bin/tor bin/tor/tor
chmod +x bin/tor/tor
```

## Перевірка структури

Після встановлення структура повинна виглядати так:

```
проект/
├── bin/
│   ├── tor/
│   │   ├── tor.exe       ← Windows
│   │   ├── tor           ← macOS/Linux
│   │   └── ...
│   ├── data/
│   │   ├── geoip
│   │   └── geoip6
│   └── README.md
├── src/
├── public/
└── ...
```

## Використання

- Після запуску BrowserX, Tor автоматично запуститься у фоні
- Натисніть кнопку "Tor: OFF" в toolbar для активації анонімного режиму
- Коли Tor увімкнено (кнопка "Tor: ON"), весь трафік іде через мережу Tor
- Для вимкнення просто натисніть кнопку ще раз

## Примітка про безпеку

- Tor забезпечує анонімність, але сповільнює з'єднання
- Не вводьте особисті дані на сайтах при використанні Tor
- WebRTC може розкрити вашу справжню IP - рекомендуємо вимкнути його в налаштуваннях
