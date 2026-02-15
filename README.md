# 美股分析系统

一个可部署在阿里云香港服务器（宝塔面板）的美股分析网站。用户访问 `aistock.mxkj517.com` 后输入公司名称/股票代码，系统调用 Gemini 生成 Markdown 报告，结果保存在本地 SQLite，并在新页面中查看历史报告。

## 功能

- 首页金融风格界面，标题为“美股分析系统”。
- 输入公司名称/股票代码，点击“确定”触发分析。
- 后端使用固定提示词调用 Gemini。
- 报告保存到数据库，支持历史查询与详情展示。
- 报告详情页面为独立界面，可新开窗口访问。

## 目录结构

```text
.
├── app.py
├── requirements.txt
├── .env.example
├── templates/
│   ├── index.html
│   └── reports.html
└── static/
    ├── style.css
    ├── main.js
    └── reports.js
```

## 本地运行

1. 创建虚拟环境并安装依赖：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. 配置环境变量：

```bash
cp .env.example .env
# 编辑 .env，填写 GEMINI_API_KEY
```

3. 启动服务：

```bash
python app.py
```

4. 浏览器访问：`http://127.0.0.1:8000`

---

## 阿里云香港 + 宝塔部署（域名：aistock.mxkj517.com）

> 目标架构：Nginx（宝塔）反代到 Gunicorn(127.0.0.1:8000)，HTTPS 域名访问。

### 0. 前置准备

- 已有阿里云香港 ECS（Ubuntu/CentOS 均可）。
- 已安装宝塔面板，并可登录。
- 域名 `mxkj517.com` 已解析。
- 拥有 Gemini API Key。

### 1. 域名解析

在域名服务商控制台添加 A 记录：

- 主机记录：`aistock`
- 记录值：你的 ECS 公网 IP
- TTL：默认

等待解析生效（可用 `ping aistock.mxkj517.com` 验证）。

### 2. 宝塔安装运行环境

在宝塔软件商店安装：

- `Nginx`
- `Python项目管理器`（或 `uWSGI/Gunicorn` 运行能力）
- `MySQL` 非必需（本项目使用 SQLite）

### 3. 上传项目代码

方式任选：

- Git 拉取到 `/www/wwwroot/aistock`
- 或本地打包后上传到该目录解压

建议目录：

```text
/www/wwwroot/aistock
```

### 4. 创建 Python 虚拟环境并安装依赖

SSH 登录服务器执行：

```bash
cd /www/wwwroot/aistock
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
nano .env
```

在 `.env` 中填写：

```env
GEMINI_API_KEY=你的真实key
GEMINI_MODEL=gemini-2.0-flash
```

### 5. 使用 Gunicorn 启动

先手动验证：

```bash
cd /www/wwwroot/aistock
source .venv/bin/activate
gunicorn -w 2 -b 127.0.0.1:8000 app:app
```

若正常，再用宝塔「Python 项目」创建守护项目：

- 项目路径：`/www/wwwroot/aistock`
- 启动方式：`gunicorn`
- 启动命令：`gunicorn -w 2 -b 127.0.0.1:8000 app:app`
- Python 解释器：`/www/wwwroot/aistock/.venv/bin/python`
- 自动重启：开启

### 6. 宝塔网站与反向代理配置

1. 在宝塔「网站」新增站点：`aistock.mxkj517.com`，根目录可设为 `/www/wwwroot/aistock`。
2. 打开站点设置 → 反向代理：
   - 代理名称：`aistock_proxy`
   - 目标 URL：`http://127.0.0.1:8000`
   - 发送域名：`$host`
3. 保存并启用。

### 7. SSL 证书

1. 站点设置 → SSL。
2. 选择 Let’s Encrypt，申请证书。
3. 勾选“强制 HTTPS”。

### 8. 放行防火墙

阿里云安全组与系统防火墙放行：

- 80（HTTP）
- 443（HTTPS）
- 22（SSH）

Gunicorn 仅监听 127.0.0.1:8000，不对外开放。

### 9. 验证

- 打开 `https://aistock.mxkj517.com`
- 输入如 `NVDA` 并点击确定
- 页面提示“分析完成”并自动新开报告页
- 在 `/reports` 可查看历史分析记录

### 10. 常用运维命令

```bash
# 查看 gunicorn 进程
ps -ef | grep gunicorn

# 测试本机接口
curl http://127.0.0.1:8000/api/reports

# 查看宝塔 Nginx 配置测试
nginx -t

# 重载 Nginx
nginx -s reload
```

## 注意事项

- 本系统不会伪造数据，提示词要求“不可编造数字”；输出质量依赖 Gemini 与可访问数据源。
- 若 API Key 无效或额度不足，前端会显示后端错误信息。
- SQLite 文件位于 `instance/reports.db`，请定期备份。
