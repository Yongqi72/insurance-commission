# SalesFillApi · 销售人员回填查询接口

保险佣金系统（ic-b-007）的第三方回填接口服务端：以 **IIS 子应用**形式挂到现有外网可访问的网站下，按工作单号批量查询内部库中的销售人员姓名，供外网的保险佣金系统通过网络调用。

```
保险佣金系统（外网） ──POST JSON + X-Fill-Token──▶ SalesFill.ashx（现有网站下的 IIS 子应用） ──SQL──▶ 内部库（SQL Server）
```

## 技术形态

- VB.NET 通用处理程序（ASHX），.NET Framework 4.0，VS2015 可打开（`SalesFillApi.sln`）
- 数据访问复用 `Fcl.WSOP.sqldbop`（与内部系统 FalCode 一致），参数化 `?` 占位查询
- 代码规范对齐 `F:\Qoder\Projects\FalCode`：匈牙利命名（ls/ln/ldt/lws）

## 接口契约（与后端调用方固定，勿单方面变更）

| 项 | 约定 |
|---|---|
| 请求 | `POST`，`Content-Type: application/json`，body：`{ "workOrderNos": ["WO001", ...] }` |
| 响应 | 纯 JSON 对象 `{"WO001":"张三"}`，未命中的工作单号**不带 key** |
| 状态码 | 200 正常；401 密钥错误/缺失；400 请求体非法或超过 2000 个单号；405 非 POST；500 内部异常 |
| 安全 | 请求头 `X-Fill-Token` 须与 Web.config 的 `FillApiToken` 完全一致 |
| 性能 | 须在 5 秒内返回（调用方超时阈值，超时则调用方按全部未匹配处理） |

## 开发准备（一次性）

1. 从 `D:\Projects\Tools` 复制以下配套版本组件到本项目 `lib/` 目录（`lib/` 已在 .gitignore，不入库）：
   - `Fcl.WSOP.dll`（8.2.1.0，数据访问组件）
   - `Fcl.DataAccess.dll`（8.3.0.0，`SqlBuilder` 所在程序集，编译必需）
   - `Fcl.DataWork.dll`（8.3.2.0，service 模式运行时必需）
   - 注意：不要从 FalCode 的 `Fal\bin\Debug` 取，版本不配套会导致服务器运行异常
2. `Fcl.WSOP.lic`（授权文件，部署时要放进站点 `bin/`）从 `F:\Qoder\Projects\FalCode\Fal\bin\Debug` 复制
3. VS2015 打开 `SalesFillApi.sln`，编译应通过（生成 `bin/SalesFillApi.dll`）

## 部署前必改的占位项

| 位置 | 占位内容 | 替换为 |
|---|---|---|
| `Web.config` → `FillApiToken` | `change-me-to-a-random-token` | 高强度随机串（与后端 `SALES_FILL_API_TOKEN` 环境变量同值） |
| `Web.config` → `DbAccessMode` | `direct` | 服务器部署改为 `service`（本机直连开发保持 `direct`） |
| direct 模式：`InternalDbConnectionString` | `127.0.0.1/change-me` | 内部 SQL Server 真实地址、账号（仅 SELECT 权限）、库名 |
| service 模式：`SqlDbServiceUrl` / `SqlDbServiceUser` / `SqlDbServicePassword` / `SqlDbServiceSerial` | `change-me` | 环境的真实服务地址与凭据（与 FalCode `sqldbop(服务地址)` + `Init(用户, 加密密码, 序列号)` 用法一致） |

> 占位密钥带 `change-me` 前缀时接口会一律返回 401，属预期防呆行为。
>
> 数据访问双模式：本机开发直连内部库（`direct`）；服务器无法直连时切换 `service`，
> 经 Fcl.WSOP 的 `sqldbservice.asmx` 中转查库，查询逻辑与返回契约不变。
>
> 查询 SQL 已由任务发起人提供并落地到 `BuildSalesSql`：按 `job_no` 从 `m_job` 查出
> `sales` 编码，经 `d_user` 翻译为销售姓名（结果列 `job_no`/`sales_name`）。
> 若后续内部库表结构变化，仅需调整该函数内的 SELECT 语句。

## IIS 部署步骤（挂到现有外网可访问网站下，作为子应用）

1. 现有网站服务器需已安装 .NET Framework 4.0（及以上），且该服务器能连通内部库所在
   SQL Server（部署前先确认这一点：它既要被外网的后端访问，又要能查内部库）
2. 服务器上建发布目录（如 `D:\sites\salesfill\`），放入：
   - `SalesFill.ashx`、`Web.config`（Web.config 已替换占位项）
   - `bin/SalesFillApi.dll`、`bin/Fcl.WSOP.dll`、`bin/Fcl.DataAccess.dll`、`bin/Fcl.DataWork.dll`（发布产物，service 模式必须含 Fcl.DataWork.dll）
   - `bin/Fcl.WSOP.lic`（授权文件，与 DLL 同目录，FalCode 同款做法）
3. IIS → 现有网站右键「添加应用程序」：别名如 `salesfill`，物理路径指向发布目录；
   应用程序池选 .NET CLR v4.0、托管管道「集成」（若父站点池版本不符则为本应用单独建池）
4. 访问地址即 `http://{现有网站域名}/salesfill/SalesFill.ashx`
5. 冒烟验证：浏览器 GET 访问应返回 `{"error":"method not allowed"}`（405）；
   带正确密钥的 POST 空数组应返回 `{}`
   （若报配置继承冲突，检查父站 Web.config 是否向子应用下渗了不兼容配置节）

## 联调步骤（部署完成后）

1. 保险佣金系统后端 `.env` 配置：
   - `SALES_FILL_API_URL=http://{现有网站域名}/salesfill/SalesFill.ashx`
   - `SALES_FILL_API_TOKEN={与 Web.config FillApiToken 相同}`
2. 重启后端，导入含真实工作单号的账单 → 批次详情点「开始回填」
3. 验证：命中记录 `销售人员` 有值且回填状态为「系统回填」，未命中保持「未匹配」，回填统计数正确

## 排错

| 现象 | 排查 |
|---|---|
| 回填全部未匹配 | 后端日志看第三方调用报错；确认网络可达、密钥一致（密钥不符返回 401，调用方按未命中处理） |
| 500 + `internal error` | 服务器事件查看器 → 应用程序日志，来源 `SalesFillApi`，含具体异常 |
| 连接内部库失败 | 核对连接串、账号权限（只需 SELECT）、SQL Server 是否允许该机器连接 |
| Fcl.WSOP 授权异常 | 确认站点 `bin/` 目录里有 `Fcl.WSOP.lic`（与 DLL 同级）；仍异常则升级确认授权方案（任务包 escalate-if） |
