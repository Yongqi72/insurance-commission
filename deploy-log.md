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

## 2026-09-01 10:53 · test · yongqi.liu
- 包含内容：B 类 ic-b-019（导入时跳过 Excel 尾部合计/说明行，backend）+ ic-b-020（批量回填完成后提成汇总未刷新，frontend），master `f464464` → `b09c8c0`，共 8 个 commit（其余为 docs/dispatch/status 记录，无实质代码）
- 构建结果：成功。本地机器本次缺 `make`/`g++`（不像首次部署时可用 `nvm` 切版本后顺带具备编译工具链），复现了与首次部署相同的"服务器无 swap、npm ci 编译原生模块有 OOM 风险"顾虑，但绕过路径与首次不同：
  - `npm ci --ignore-scripts` 跳过所有原生模块的编译/安装脚本（backend 生产依赖唯二涉及原生绑定的是 `better-sqlite3` 与 `bcrypt`）
  - `bcrypt`（登录鉴权实际依赖，@6.0.0，`node-gyp-build` + 包内自带 `prebuilds/linux-x64/bcrypt.glibc.node` 等多平台预编译产物）用 `node -e "require('node-gyp-build')(...)"` 单独触发，直接加载包内预编译二进制，全程无需本机编译器；打包前后各验证一次 `bcrypt.hash()`/`compare()` 真实可用
  - `better-sqlite3` 保持未编译状态——生产环境 `DB_TYPE=mysql`，TypeORM `DriverFactory` 按 `type` 字段惰性 `require`，`better-sqlite3` 分支代码只在 `type: 'better-sqlite3'` 时才会被触碰（`typeorm.config.ts` 内 sqlite 分支仅用于本地开发/自动化测试），已用 `npm run build`（本地构建产物打包前）+ 本机起服务指向不可达 MySQL 地址做冒烟验证，确认应用完整启动（TypeOrmModule/AuthModule 等全部初始化成功）且只在真实连库阶段报 `ECONNREFUSED`，无任何原生模块加载错误
  - `npm ci --omit=dev --ignore-scripts` 精简出生产依赖 node_modules（313 个包，177M），backend `dist`（`nest build`）与 frontend `dist`（`vite build`）均本地构建，三者打包为两个 tar（backend 28M / frontend 1.4M）scp 上传，服务器侧原地解包替换（先建临时目录、mv 置换、成功后删旧目录，全程无编译）
- 数据库迁移：`node_modules/.bin/typeorm migration:run -d dist/config/data-source.js`（绕开 `package.json` 里默认走 `ts-node` 的 `migration:run` 脚本，改用编译产物直接跑 typeorm CLI，避免 ts-node 在服务器上的额外内存开销）——`No migrations are pending`（本次两个任务均未改表结构，符合预期）
- 健康检查：通过。外部 `http://47.96.22.19:8090/` 200；`/auth/login`（空 body）400（非 500，鉴权链路正常）；`/api/commission-tiers`（未带 token）401；pm2 进程 `insurance-commission-backend` 重启后 online，0 次异常重启（`↺` 计数仅本次手动 restart 的 1 次），日志内全部路由正常挂载、`Nest application successfully started`，无原生模块/连库错误；重启前后宿主机内存占比稳定在 47%~50% 区间，无 OOM 迹象
- 备注：
  - 服务器内存隐患（1.8G 无 swap）仍未处理，本次同样全程避免在服务器上执行任何编译型 `npm ci`，风险敞口未扩大也未收敛，仍待用户决定是否加 swap / 升配
  - 本地机器本次触发了一个新发现：`better-sqlite3` 在本机（WSL2，无编译工具链）本就装不上，与"服务器 OOM 顾虑"是两条独立的原因分别导向同一个解法（跳过原生编译、只按需激活 `bcrypt` 预编译产物）
