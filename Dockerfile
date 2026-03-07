# BrowserX - Dockerfile
# Electron browser з Tor та AI інтеграцією

FROM node:20-bullseye

# Встановлюємо системні залежності для Electron та GUI
RUN apt-get update && apt-get install -y \
    # Electron залежності
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libxcb-dri3-0 \
    libasound2 \
    # X11 для GUI
    xvfb \
    x11vnc \
    fluxbox \
    # Tor залежності
    libssl1.1 \
    libevent-2.1-7 \
    zlib1g \
    # Утиліти
    wget \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Встановлюємо робочу директорію
WORKDIR /app

# Копіюємо package файли для кешування npm install
COPY package*.json ./

# Встановлюємо Node.js залежності
RUN npm ci --production=false

# Копіюємо весь проект
COPY . .

# Копіюємо config.js.example якщо config.js не існує
RUN if [ ! -f src/config.js ]; then \
      cp config.js.example src/config.js; \
    fi

# Білдимо CSS (якщо потрібно)
RUN npm run build:css || true

# Встановлюємо права на виконання для Tor binary
RUN if [ -f bin/tor/tor ]; then chmod +x bin/tor/tor; fi
RUN if [ -f bin/tor/tor.exe ]; then chmod +x bin/tor/tor.exe; fi

# Створюємо директорії для VNC та Xvfb
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# Експонуємо порти
EXPOSE 5900

# Змінні середовища
ENV DISPLAY=:99
ENV NODE_ENV=production

# Створюємо entrypoint скрипт
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Запускаємо Xvfb (віртуальний X сервер)\n\
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &\n\
XVFB_PID=$!\n\
\n\
# Чекаємо поки Xvfb запуститься\n\
sleep 2\n\
\n\
# Запускаємо window manager\n\
fluxbox &\n\
\n\
# Запускаємо VNC сервер для доступу до GUI\n\
x11vnc -display :99 -forever -nopw -shared -rfbport 5900 &\n\
VNC_PID=$!\n\
\n\
echo "==========================================="\n\
echo "BrowserX Docker Container Started"\n\
echo "==========================================="\n\
echo "VNC Server: localhost:5900"\n\
echo "Connect with VNC client to see the browser"\n\
echo "==========================================="\n\
\n\
# Запускаємо BrowserX\n\
npm start\n\
\n\
# При завершенні - зупиняємо процеси\n\
kill $XVFB_PID $VNC_PID 2>/dev/null || true\n\
' > /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Точка входу
ENTRYPOINT ["/app/docker-entrypoint.sh"]
