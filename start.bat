@echo off
chcp 65001 > nul
title 人才培养方案审核系统 - 一键启动

echo ========================================
echo  人才培养方案审核系统 - 一键启动
echo ========================================
echo.

:: 检查 node
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ 
  pause
  exit /b 1
)

:: 第一次启动：安装依赖 + 初始化数据库
if not exist "backend\node_modules" (
  echo [1/4] 安装后端依赖...
  call npm install --prefix backend
  if errorlevel 1 goto :err
)

if not exist "frontend\node_modules" (
  echo [2/4] 安装前端依赖...
  call npm install --prefix frontend
  if errorlevel 1 goto :err
)

if not exist "backend\prisma\data.db" (
  echo [3/4] 初始化数据库与预置数据...
  call npx prisma db push --schema=backend\prisma\schema.prisma
  if errorlevel 1 goto :err
  call node backend\prisma\seed.js
  if errorlevel 1 goto :err
)

echo [4/4] 启动后端与前端服务...
echo.

:: 后端
start "后端服务 :3001" cmd /k "cd /d %~dp0backend && npm run dev"

:: 前端
start "前端服务 :5173" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ✅ 启动完成
echo    后端: http://localhost:3001
echo    前端: http://localhost:5173
echo.
echo 按任意键关闭此窗口（服务将继续在后台运行）
pause > nul
exit /b 0

:err
echo.
echo [启动失败] 请检查上方错误信息
pause
exit /b 1
