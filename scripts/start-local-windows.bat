@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请先安装 Node.js 22 LTS。
  pause
  exit /b 1
)
where corepack >nul 2>nul
if errorlevel 1 (
  echo 未找到 Corepack。请使用包含 Corepack 的 Node.js 22 安装包。
  pause
  exit /b 1
)
where docker >nul 2>nul
if errorlevel 1 (
  echo 未找到 Docker。请先安装并启动 Docker Desktop。
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo 已创建 .env。请把 AUTH_SECRET 改为随机密钥后重新运行本脚本。
  echo 可运行：node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
  pause
  exit /b 1
)

set SERVICE_MODE=web
docker compose -f docker-compose.yml -f compose.local.yml up -d postgres redis
if errorlevel 1 exit /b 1

corepack pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1
corepack pnpm db:migrate
if errorlevel 1 exit /b 1
corepack pnpm dev
endlocal
