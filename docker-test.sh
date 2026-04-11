#!/bin/bash

set -e

echo "🐳 BrowserX Docker Test Script"
echo "=============================="
echo ""
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не встановлено!"
    echo "   Завантажте Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi
if ! docker info &> /dev/null; then
    echo "❌ Docker не запущено!"
    echo "   Запустіть Docker Desktop та спробуйте знову"
    exit 1
fi

echo "✅ Docker встановлено та запущено"
echo ""
if [ ! -f .env ]; then
    echo "⚠️  .env файл не знайдено"
    echo "   Створюємо з .env.example..."
    cp .env.example .env
    echo "📝 Відредагуйте .env та додайте свій GROQ_API_KEY"
    echo "   Потім запустіть цей скрипт знову"
    exit 1
fi
if grep -q "your_groq_api_key_here" .env; then
    echo "⚠️  GROQ_API_KEY не налаштовано в .env"
    echo "   Відредагуйте .env файл та додайте свій ключ"
    exit 1
fi

echo "✅ .env налаштовано"
echo ""
echo "🔨 Білд Docker образу..."
docker-compose build

if [ $? -ne 0 ]; then
    echo "❌ Білд failed"
    exit 1
fi

echo "✅ Білд успішний"
echo ""
echo "🚀 Запуск контейнера..."
docker-compose up -d

if [ $? -ne 0 ]; then
    echo "❌ Не вдалося запустити контейнер"
    exit 1
fi

echo "✅ Контейнер запущено"
echo ""
echo "⏳ Чекаємо запуску сервісів (10 секунд)..."
sleep 10
echo ""
echo "📊 Статус контейнера:"
docker-compose ps

echo ""
echo "📝 Логи (останні 20 рядків):"
docker-compose logs --tail=20

echo ""
echo "=============================="
echo "✅ BrowserX запущено в Docker!"
echo "=============================="
echo ""
echo "📺 VNC SSH: localhost:5900"
echo "   Підключіться через VNC клієнт:"
echo "   - Windows: RealVNC, TightVNC, UltraVNC"
echo "   - macOS: vnc://localhost:5900"
echo "   - Linux: vncviewer localhost:5900"
echo ""
echo "Команди:"
echo "  docker-compose logs -f
echo "  docker-compose restart
echo "  docker-compose down
echo "  docker-compose exec browserx bash
echo ""
