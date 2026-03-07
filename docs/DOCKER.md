# 🐳 Docker - Контейнеризація BrowserX

## Огляд

BrowserX може працювати в Docker контейнері з підтримкою GUI через VNC сервер. Це дозволяє:
- Запускати браузер на серверах без GUI
- Ізолювати середовище виконання
- Легке розгортання на різних платформах
- Консистентне середовище для тестування

## Архітектура

```
Docker Container
├── Xvfb (Virtual X Server) :99
├── Fluxbox (Window Manager)
├── x11vnc (VNC Server) :5900
└── BrowserX (Electron App)
```

## Швидкий старт

### 1. Налаштування API ключа

```bash
# Створіть .env файл з API ключем
cp .env.example .env

# Відредагуйте .env та додайте свій Groq API key
nano .env
```

### 2. Збілдіть образ

```bash
docker-compose build
```

### 3. Запустіть контейнер

```bash
docker-compose up -d
```

### 4. Підключіться через VNC

Використовуйте VNC клієнт для підключення до `localhost:5900`:

**Windows:**
- [RealVNC Viewer](https://www.realvnc.com/en/connect/download/viewer/)
- [TightVNC](https://www.tightvnc.com/)
- [UltraVNC](https://uvnc.com/)

**macOS:**
- Вбудований Screen Sharing: `vnc://localhost:5900`
- [RealVNC Viewer](https://www.realvnc.com/en/connect/download/viewer/)

**Linux:**
```bash
vncviewer localhost:5900
```

## Команди Docker

### Базові операції

```bash
# Запустити контейнер
docker-compose up -d

# Зупинити контейнер
docker-compose down

# Переглянути логи
docker-compose logs -f

# Перезапустити
docker-compose restart

# Зупинити та видалити volumes
docker-compose down -v
```

### Білд та оновлення

```bash
# Перебілдити образ після змін коду
docker-compose build --no-cache

# Запустити з перебілдом
docker-compose up --build
```

### Debugging

```bash
# Увійти в контейнер
docker-compose exec browserx bash

# Переглянути статус процесів
docker-compose exec browserx ps aux

# Перевірити X сервер
docker-compose exec browserx echo $DISPLAY

# Тестувати VNC
docker-compose exec browserx x11vnc -display :99 -bg -nopw -xkb
```

## Dockerfile - Пояснення

### Базовий образ

```dockerfile
FROM node:20-bullseye
```
Використовуємо Node.js 20 на Debian Bullseye для стабільності.

### Системні залежності

- **Electron**: `libgtk-3-0`, `libnss3`, `libxss1`, etc.
- **X11**: `xvfb` (віртуальний фреймбуфер), `x11vnc` (VNC сервер)
- **Window Manager**: `fluxbox` (легкий WM)
- **Tor**: `libssl1.1`, `libevent-2.1-7`, `zlib1g`

### Entrypoint

```bash
#!/bin/bash
# Запускає Xvfb → Fluxbox → VNC → BrowserX
```

## docker-compose.yml - Конфігурація

### Порти

```yaml
ports:
  - "5900:5900"  # VNC доступ до GUI
```

Щоб змінити порт:
```yaml
ports:
  - "6900:5900"  # Тепер доступ через localhost:6900
```

### Zmінні середовища

```yaml
environment:
  - GROQ_API_KEY=${GROQ_API_KEY}  # З .env файлу
  - DISPLAY=:99                   # X Display
  - NODE_ENV=production
```

### Volumes

```yaml
volumes:
  - tor-data:/app/bin/tor/data           # Tor кеш та стан
  - app-data:/root/.config/BrowserX      # Speed Dial, налаштування
```

**Видалити всі дані:**
```bash
docker-compose down -v
```

### Обмеження ресурсів

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'      # Максимум 2 CPU ядра
      memory: 4G       # Максимум 4GB RAM
```

Налаштуйте під свою систему.

### Security

```yaml
cap_add:
  - SYS_ADMIN             # Потрібно для Chrome sandbox
security_opt:
  - seccomp:unconfined    # Дозволити всі system calls
shm_size: '2gb'           # Shared memory для Chrome
```

## Продакшн розгортання

### 1. Збілдіть production образ

```bash
docker build -t browserx:1.0.0 .
```

### 2. Запушіть на Docker Hub

```bash
docker tag browserx:1.0.0 yourusername/browserx:1.0.0
docker push yourusername/browserx:1.0.0
```

### 3. Розгорніть на сервері

```bash
docker pull yourusername/browserx:1.0.0
docker run -d \
  -p 5900:5900 \
  -e GROQ_API_KEY=your_key \
  --name browserx \
  yourusername/browserx:1.0.0
```

## Troubleshooting

### Проблема: "Cannot connect to X server"

**Рішення:**
```bash
# Перевірте чи працює Xvfb
docker-compose exec browserx ps aux | grep Xvfb

# Перезапустіть контейнер
docker-compose restart
```

### Проблема: VNC показує чорний екран

**Рішення:**
```bash
# Перевірте логи
docker-compose logs browserx

# Перезапустіть Window Manager
docker-compose exec browserx fluxbox &
```

### Проблема: Electron не запускається

**Рішення:**
```bash
# Переконайтеся що є SYS_ADMIN capability
docker-compose exec browserx cat /proc/1/status | grep Cap

# Запустіть з --no-sandbox
# Додайте в package.json start script: --no-sandbox
```

### Проблема: Tor не підключається

**Рішення:**
```bash
# Перевірте Tor binary
docker-compose exec browserx ls -la bin/tor/

# Перевірте права
docker-compose exec browserx ./bin/tor/tor --version

# Встановіть права
docker-compose exec browserx chmod +x bin/tor/tor
```

### Проблема: "Permission denied" для Tor data

**Рішення:**
```bash
# Видаліть volume та створіть заново
docker-compose down -v
docker-compose up -d
```

## Альтернативи VNC

### noVNC (Web-based VNC)

Додайте до `docker-compose.yml`:

```yaml
services:
  novnc:
    image: geek1011/easy-novnc
    environment:
      - DISPLAY_NUM=99
      - WIDTH=1920
      - HEIGHT=1080
    ports:
      - "8080:8080"
    depends_on:
      - browserx
    volumes_from:
      - browserx
```

Доступ через браузер: `http://localhost:8080`

### X11 Forwarding (Linux host)

```bash
# Дозволити локальний доступ
xhost +local:docker

# Запустити з X11 forwarding
docker run -it --rm \
  -e DISPLAY=$DISPLAY \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  browserx:latest
```

## Оптимізація розміру образу

### Multi-stage build (майбутня оптимізація)

```dockerfile
# Stage 1: Build
FROM node:20-bullseye as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build:css

# Stage 2: Production
FROM node:20-bullseye-slim
# Копіюємо тільки необхідне з builder
COPY --from=builder /app /app
```

### Зменшити розмір image

```bash
# Поточний розмір
docker images browserx

# Очистити кеш
docker builder prune -a
```

## Моніторинг

### Resource usage

```bash
# CPU та память
docker stats browserx

# Disk usage
docker system df
```

### Логи

```bash
# Real-time logs
docker-compose logs -f

# Останні 100 рядків
docker-compose logs --tail=100

# Логи конкретного сервісу
docker-compose logs browserx
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Build Docker Image

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Build Docker image
        run: docker build -t browserx:${{ github.sha }} .
      
      - name: Push to registry
        run: docker push browserx:${{ github.sha }}
```

## Додаткові ресурси

- [Docker Documentation](https://docs.docker.com/)
- [Electron in Docker](https://github.com/electron/electron/issues/17972)
- [VNC Server Setup](https://www.digitalocean.com/community/tutorials/how-to-install-and-configure-vnc-on-ubuntu-20-04)

## Підтримка

Проблеми з Docker? Створіть issue на GitHub:
https://github.com/Stefect/Project-X/issues
