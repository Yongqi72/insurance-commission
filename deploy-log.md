# deploy-log · insurance-commission

## 2026-08-31 12:06 · test · yongqi.liu
- 包含内容：master 全量（A 类 v1 全部 sprint 任务 + B 类 ic-b-001~ic-b-018 全部 [merged] 改动），首次部署
- 构建结果：成功（本地构建 + 手工打包上传产物，绕开服务器构建——服务器仅 1.8GB 内存无 swap，`npm ci` 原生模块编译触发 OOM killer 杀掉进程；改为本地用 nvm 切到与服务器一致的 Node 20.20.2 构建 backend 生产依赖 + dist，frontend 单独构建，均以 tar 包传至服务器解包，服务器侧全程无需编译）
- 健康检查：通过（外部 `http://47.96.22.19:8090/` 前端页面正常返回；`/auth/login`、`/api/commission-tiers` 经 nginx 反代到后端均正常响应；pm2 进程 online，0 次重启，无异常日志）
- 备注：
  - 服务器（47.96.22.19）首次部署，之前无 Node.js/npm/git/pm2，均已安装（Node 20 LTS via NodeSource，git/g++ via dnf，pm2 via npm -g）
  - 服务器 `:80` 已被既有"loxson-salary"系统（Java + nginx default_server）占用，本系统改用独立端口 `:8090`（nginx 新增 `/etc/nginx/conf.d/insurance-commission.conf`，反代 `/api/`、`/auth/` 到后端 `:3001`，未改动 salary 系统现有配置）
  - 独立 MySQL 库 `insurance_commission_test` + 专用账号（不与 salary 系统共用凭据），3 条 migration 已执行
  - `connections.yml`/`deployment.config` 首次铺设，`~/.hact/secrets.env` 补充服务器专属的 DB 密码与 JWT 密钥（均为新生成，不与本地/其他环境复用）；管理员账号密码沿用本地测试环境（同一套登录，方便验收）
  - 阿里云安全组新增放行 TCP 8090（用户操作）
  - 已知：服务器长期存在 OOM 问题（`dmesg` 可见 salary 系统 Java 进程与 MySQL 均有历史 OOM 记录，与本次部署无关，属预先存在的服务器资源紧张问题，未处理，仅记录供参考）
  - 访问地址：`http://47.96.22.19:8090/`
