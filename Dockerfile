
FROM node:20-bullseye
RUN apt-get update && apt-get install -y \
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
    xvfb \
    x11vnc \
    fluxbox \
    libssl1.1 \
    libevent-2.1-7 \
    zlib1g \
    wget \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN if [ ! -f src/config.js ]; then \
      cp config.js.example src/config.js; \
    fi
RUN npm run build:css || true
RUN if [ -f bin/tor/tor ]; then chmod +x bin/tor/tor; fi
RUN if [ -f bin/tor/tor.exe ]; then chmod +x bin/tor/tor.exe; fi
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
EXPOSE 5900
ENV DISPLAY=:99
ENV NODE_ENV=production
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &\n\
XVFB_PID=$!\n\
\n\
sleep 2\n\
\n\
fluxbox &\n\
\n\
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
npm start\n\
\n\
kill $XVFB_PID $VNC_PID 2>/dev/null || true\n\
' > /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh
ENTRYPOINT ["/app/docker-entrypoint.sh"]
