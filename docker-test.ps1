# BrowserX Docker Quick Test Script (PowerShell)
# Швидке тестування Docker контейнера на Windows

Write-Host "🐳 BrowserX Docker Test Script" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Перевіряємо чи встановлено Docker
try {
    $dockerVersion = docker --version 2>$null
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Host "✅ Docker встановлено: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker не встановлено!" -ForegroundColor Red
    Write-Host "   Завантажте Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Перевіряємо чи Docker запущено
try {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Host "✅ Docker запущено" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker не запущено!" -ForegroundColor Red
    Write-Host "   Запустіть Docker Desktop та спробуйте знову" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Перевіряємо .env файл
if (-not (Test-Path .env)) {
    Write-Host "⚠️  .env файл не знайдено" -ForegroundColor Yellow
    Write-Host "   Створюємо з .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "📝 Відредагуйте .env та додайте свій GROQ_API_KEY" -ForegroundColor Yellow
    Write-Host "   Потім запустіть цей скрипт знову" -ForegroundColor Yellow
    exit 1
}

# Перевіряємо чи є Groq API key
$envContent = Get-Content .env -Raw
if ($envContent -match "your_groq_api_key_here") {
    Write-Host "⚠️  GROQ_API_KEY не налаштовано в .env" -ForegroundColor Yellow
    Write-Host "   Відредагуйте .env файл та додайте свій ключ" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ .env налаштовано" -ForegroundColor Green
Write-Host ""

# Білдимо образ
Write-Host "🔨 Білд Docker образу..." -ForegroundColor Cyan
docker-compose build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Білд failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Білд успішний" -ForegroundColor Green
Write-Host ""

# Запускаємо контейнер
Write-Host "🚀 Запуск контейнера..." -ForegroundColor Cyan
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Не вдалося запустити контейнер" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Контейнер запущено" -ForegroundColor Green
Write-Host ""

# Чекаємо поки контейнер повністю запуститься
Write-Host "⏳ Чекаємо запуску сервісів (10 секунд)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Перевіряємо статус
Write-Host ""
Write-Host "📊 Статус контейнера:" -ForegroundColor Cyan
docker-compose ps

Write-Host ""
Write-Host "📝 Логи (останні 20 рядків):" -ForegroundColor Cyan
docker-compose logs --tail=20

Write-Host ""
Write-Host "==============================" -ForegroundColor Green
Write-Host "✅ BrowserX запущено в Docker!" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green
Write-Host ""
Write-Host "📺 VNC доступ: localhost:5900" -ForegroundColor Yellow
Write-Host "   Підключіться через VNC клієнт:" -ForegroundColor Yellow
Write-Host "   - RealVNC Viewer: https://www.realvnc.com/download/viewer/" -ForegroundColor Gray
Write-Host "   - TightVNC: https://www.tightvnc.com/" -ForegroundColor Gray
Write-Host "   - UltraVNC: https://uvnc.com/" -ForegroundColor Gray
Write-Host ""
Write-Host "Команди:" -ForegroundColor Cyan
Write-Host "  docker-compose logs -f                     # Переглядати логи" -ForegroundColor Gray
Write-Host "  docker-compose restart                     # Перезапустити" -ForegroundColor Gray
Write-Host "  docker-compose down                        # Зупинити" -ForegroundColor Gray
Write-Host "  docker-compose exec browserx bash          # Увійти в контейнер" -ForegroundColor Gray
Write-Host ""
