# Windows 正式服务器发布步骤

本页记录当前正式服务器的手动发布方式。项目目录为 `C:\apps\insurance-commission`；后端监听 `6001`；Caddy 监听 `6080`，直接提供前端静态文件，并将 `/auth/*`、`/api/*` 转发到后端。

前端构建输出在 `frontend/dist`，Caddy 实际读取 `frontend/dist-proxy`。**不需要启动 `npm run preview`**；它若占用 `6080`，浏览器的登录请求就不会经过 Caddy。

## 1. 停止现有进程并拉取代码

在后端和 Caddy 各自的 PowerShell 窗口按 `Ctrl+C`。然后在服务器的新 PowerShell 窗口逐条执行：

```powershell
cd C:\apps\insurance-commission
git branch --show-current
git status --short
git pull --ff-only origin master
git rev-parse --short HEAD
```

分支应为 `master`。如果 `git status --short` 有输出，或拉取失败，先处理原因，不要继续构建。发布前应确认待发布代码已经合并到远端 `master`。

## 2. 构建后端和前端

逐条执行；任一命令失败就停下：

```powershell
cd C:\apps\insurance-commission\backend
npm.cmd ci
npm.cmd run build

cd C:\apps\insurance-commission\frontend
npm.cmd ci
npm.cmd run build
```

保留服务器现有的 `backend/.env` 和前端环境配置；不要用本机配置覆盖它们。若版本包含新的数据库迁移，先备份正式 MySQL，再于启动后端前在 `backend` 目录执行 `npm.cmd run migration:run`。2026-09-28 的分段提成发布没有新增迁移。

## 3. 更新 Caddy 提供的前端文件

```powershell
New-Item -ItemType Directory -Force 'C:\apps\insurance-commission\frontend\dist-proxy' | Out-Null
Copy-Item 'C:\apps\insurance-commission\frontend\dist\*' 'C:\apps\insurance-commission\frontend\dist-proxy\' -Recurse -Force
```

## 4. 启动后端

新开一个 PowerShell 窗口，执行后保持窗口打开：

```powershell
cd C:\apps\insurance-commission\backend
$env:PORT = '6001'
npm.cmd run start:prod
```

确认日志显示 `Application is running on: http://localhost:6001`。

## 5. 启动 Caddy

再开一个 PowerShell 窗口，执行后保持窗口打开：

```powershell
cd C:\apps\caddy
.\caddy.exe validate --config .\Caddyfile --adapter caddyfile
.\caddy.exe run --config .\Caddyfile --adapter caddyfile
```

看到 `serving initial configuration` 表示 Caddy 已启动，无须等待命令返回。当前后端和 Caddy 都在前台运行，关闭对应窗口就会停止服务。Caddyfile 格式提示及 HTTP/2、HTTP/3 因未启用 TLS 而跳过的提示不影响当前 HTTP 站点。

## 6. 验证

访问 `http://218.244.154.219:6080/`，按 `Ctrl+F5` 刷新并登录，确认阶梯设置、提成汇总和报表导出可用。也可在服务器检查路由：

```powershell
curl.exe -i http://127.0.0.1:6080/
curl.exe -i -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:6080/auth/login
```

首页应返回 `200`。空账号登录返回后端的 `400` JSON 属于预期，说明 Caddy 已将请求转发到后端。如果登录请求返回空白的 `404`，先检查是否误将前端预览服务启动在 `6080`。

### 2026-09-28 分段提成发布补充

若正式库仍是旧档位 `0–10`、`10–20`、`20 及以上`，登录后在阶梯设置页先把最高档改为 `21 及以上`，再把中间档改为 `11–20`；首档保持 `0–10`。确认规则完整后，再核对汇总和导出。票数为 25、三档单价为 20/30/40 时，分段合计应为 700 元。
