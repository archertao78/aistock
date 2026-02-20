# 美股分析系统（Gemini via OpenRouter）

当前后端支持两种模式：
- `GEMINI_BASE_URL=https://openrouter.ai/api/v1`：通过 OpenRouter 调 Gemini
- `GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta`：直连 Google Gemini

## 运行

```bash
npm install
cp .env.example .env
```

编辑 `.env`（OpenRouter 示例）：

```env
PORT=3000
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=google/gemini-2.0-flash-001
GEMINI_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_REFERER=
OPENROUTER_TITLE=aistock
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me
ADMIN_TOKEN_SECRET=change_me_to_a_long_random_secret
ADMIN_SESSION_HOURS=24
ADMIN_COOKIE_SECURE=false
CRYPTO_MONITOR_INTERVAL_MS=1800000
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_API_BASE=https://api.telegram.org
```

启动：

```bash
npm start
```

## PM2

```bash
cd /www/wwwroot/aistock
npm install
pm2 restart aistock --update-env || pm2 start src/server.js --name aistock
pm2 save
```

## 健康检查

```bash
curl http://127.0.0.1:3000/api/health
```

## API

- `POST /api/analyze`
- `GET /api/reports?limit=30`
- `GET /api/reports/:id`
- `GET /report/:id`
- `GET /api/crypto/monitor`
- `POST /api/crypto/monitor`
- `DELETE /api/crypto/monitor/:monitorId`

## Telegram 推送（盯盘）

配置 `.env` 后，盯盘任务默认每 30 分钟检查一次并推送最新指标到 Telegram：

- `TELEGRAM_BOT_TOKEN`: BotFather 创建机器人的 token
- `TELEGRAM_CHAT_ID`: 接收消息的聊天 ID（私聊或群）
- `TELEGRAM_API_BASE`: 默认 `https://api.telegram.org`
- `CRYPTO_MONITOR_INTERVAL_MS`: 轮询间隔（毫秒），默认 `1800000`（30 分钟）

前端也支持在“数字货币盯盘”表单里直接输入 `Telegram Bot Token` 和 `Telegram Chat ID`，
每个盯盘任务会绑定自己的 Telegram 参数，支持不同用户并行使用。

## 后台管理

- 统一入口：`/manage`（会跳转到后台登录）
- 登录页：`/admin/login`
- 管理页：`/admin`
- 编辑页：`/admin/edit/:id`

后台 API（需登录）：
- `GET /api/admin/me`
- `GET /api/admin/reports`
- `GET /api/admin/reports/:id`
- `PUT /api/admin/reports/:id`
- `DELETE /api/admin/reports/:id`
