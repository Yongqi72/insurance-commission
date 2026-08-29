## ic-b-007 第三方销售回填接口 · 本地联调记录 · 2026-08-29

### 联调环境

- 服务端：`SalesFill.ashx` 部署于本机 IIS 子应用 `http://localhost/salesfill/SalesFill.ashx`（发布产物来自本仓 `sales-fill-api/bin`，含 `Fcl.WSOP.dll`/`Fcl.DataAccess.dll`/`Fcl.WSOP.lic`）
- 调用方：本仓后端本地启动（`npm run start`，3000 端口，SQLite），`.env` 已配
  `SALES_FILL_API_URL=http://localhost/salesfill/SalesFill.ashx`、`SALES_FILL_API_TOKEN` 与 Web.config `FillApiToken` 同值
- 数据来源：内部库真实数据（工单表 `m_job` → `d_user` 翻译销售姓名）

### 阶段一 · 接口独立验证（不依赖后端）

| # | 测试 | 结果 |
|---|------|------|
| 1 | GET 请求 | ✅ 405 `method not allowed` |
| 2 | POST + 错误密钥 | ✅ 401 `unauthorized` |
| 3 | POST + 正确密钥 + 真实单号 `SHGYLSE260200924` | ✅ 200 `{"SHGYLSE260200924":"周晶"}` |
| 4 | 同批传入不存在单号 `NOT-EXIST-001` | ✅ 不出现在响应对象中（契约：未命中不带 key） |

中文姓名以 UTF-8 返回无乱码；参数化 `?` 占位绑定正常。

### 阶段二/三 · 后端对接 + 真实回填

1. 登录 `POST /auth/login`（admin）→ 创建批次 `POST /api/commission-batches`（batchId=1）✅
2. SQLite 直插 2 条保单记录（真实单号 `SHGYLSE260200924` + 不存在单号 `NOT-EXIST-001`，均 unmatched）
3. 触发回填 `POST /api/commission-batches/1/policy-records/fill`：
   ✅ 返回 `total=2 matched=1 unmatched=1`（后端经 `X-Fill-Token` 请求头真实调用了 ASHX）
4. 复查明细 `GET /api/commission-batches/1/policy-records`：
   - ✅ `SHGYLSE260200924` → `salesName=周晶`、`salesFillSource=system`
   - ✅ `NOT-EXIST-001` → `salesName=null`、`salesFillSource=unmatched`

### 结论

外网调用方 → ASHX（Token 校验 + 参数化 SQL）→ 内部库 的全链路真实数据联调通过；
既有回填主流程行为（未命中保持未匹配、接口整体返回 200 统计）与设计一致。

### 遗留（不阻塞）

- 正式部署：同一套发布文件挂到现成外网网站做 IIS 子应用（步骤见 `sales-fill-api/README.md`），后端 `.env` 的 `SALES_FILL_API_URL` 换成正式域名
- 完整业务流程（导入→回填）依赖 OSS 凭证，留待正式环境验证
- PR #16 已合并（2026-08-29）；测试数据仅存在于本地开发库 `backend/data/dev.sqlite`

---

## 补充留痕 · service 模式（服务器无法直连场景）· 2026-08-29

### 背景

服务器无法直连内部库，接口程序增加 `DbAccessMode` 开关：`direct`（本机直连）/
`service`（经 Fcl.WSOP 的 `sqldbservice.asmx` 中转，用法与 FalCode `Main.vb` 一致）。

### 验证结果

| # | 测试 | 结果 |
|---|------|------|
| 1 | 直调诊断：`sqldbop(服务地址)` 构造 + `Init(用户, 加密密码, 序列号)` + `GetTable` | ✅ 全通（抓到并修复缺失依赖 `Fcl.DataWork.dll`，缺失时接口 500） |
| 2 | 接口 POST（service 模式）+ 服务库真实单号 | ✅ 200 `{"80003":"操作"}`，中文正常 |
| 3 | 本机 `falservice` 指向库与业务库对比 | ⚠️ 本机服务连的是演示库（`m_job` 仅 803 行），查不到业务单号——属本机服务配置问题，非接口问题 |

### 结论与前置确认

- 接口代码在两种模式下均验证通过；正式服务器 `falservice` 指向业务库已由任务发起人确认（2026-08-29），正式部署后可直接查到真实数据
- 发布产物清单补充 `Fcl.DataWork.dll`（service 模式运行时必需），已同步 `lib/`、`publish/bin/`、README
- 相关提交：service 模式与开关（`ba5f57f`）、配置值 Trim 容错（`a188c86`）、依赖清单（`f164e3e`）

