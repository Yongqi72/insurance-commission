# SalesFillApi · 销售人员回填查询接口

保险佣金系统（ic-b-002）的第三方回填接口服务端：部署在**内网 IIS**，按工作单号批量查询内部库中的销售人员姓名，供外网的保险佣金系统通过网络调用。

```
保险佣金系统（外网） ──POST JSON + X-Fill-Token──▶ SalesFill.ashx（内网 IIS） ──SQL──▶ 内部库（SQL Server）
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

1. 从 `F:\Qoder\Projects\FalCode\Fal\bin\Debug` 复制 `Fcl.WSOP.dll` 到本项目 `lib/` 目录
   - 同目录若有 `Fcl.WSOP.lic` 一并复制（授权文件，`lib/` 已在 .gitignore，不入库）
2. VS2015 打开 `SalesFillApi.sln`，编译应通过
3. 若运行时报 Fcl.WSOP 授权异常：把 `Fcl.WSOP.lic` 加入项目作为嵌入资源后重新编译

## 部署前必改的三个占位项

| 位置 | 占位内容 | 替换为 |
|---|---|---|
| `SalesFill.ashx.vb` → `BuildSalesSql` | `SELECT ... FROM d_sales_workorder ...` | 任务发起人提供的真实 SQL（结果列须含 `work_order_no`、`sales_name`，列名不符时同步改 `QuerySalesNames` 取列处） |
| `Web.config` → `FillApiToken` | `change-me-to-a-random-token` | 高强度随机串（与后端 `SALES_FILL_API_TOKEN` 环境变量同值） |
| `Web.config` → `InternalDbConnectionString` | `127.0.0.1/change-me` | 内部 SQL Server 真实地址、账号（仅 SELECT 权限）、库名 |

> 占位密钥带 `change-me` 前缀时接口会一律返回 401，属预期防呆行为。

## IIS 部署步骤

1. 服务器需安装 .NET Framework 4.0（及以上）
2. IIS 新建应用程序池：.NET CLR v4.0，托管管道「集成」
3. 新建网站（或虚拟目录）指向发布目录，包含文件：
   - `SalesFill.ashx`、`SalesFill.ashx.vb`、`Web.config`
   - `bin/SalesFillApi.dll`、`bin/Fcl.WSOP.dll`（发布产物）
4. 确认保险佣金系统所在外网服务器能访问本机 HTTP 端口（防火墙放行）
5. 冒烟验证：浏览器 GET 访问 `SalesFill.ashx` 应返回 `{"error":"method not allowed"}`（405）；
   带正确密钥的 POST 空数组应返回 `{}`

## 联调步骤（部署完成后）

1. 保险佣金系统后端 `.env` 配置：
   - `SALES_FILL_API_URL=http://{内网服务器地址}/SalesFill.ashx`
   - `SALES_FILL_API_TOKEN={与 Web.config FillApiToken 相同}`
2. 重启后端，导入含真实工作单号的账单 → 批次详情点「开始回填」
3. 验证：命中记录 `销售人员` 有值且回填状态为「系统回填」，未命中保持「未匹配」，回填统计数正确

## 排错

| 现象 | 排查 |
|---|---|
| 回填全部未匹配 | 后端日志看第三方调用报错；确认网络可达、密钥一致（密钥不符返回 401，调用方按未命中处理） |
| 500 + `internal error` | 服务器事件查看器 → 应用程序日志，来源 `SalesFillApi`，含具体异常 |
| 连接内部库失败 | 核对连接串、账号权限（只需 SELECT）、SQL Server 是否允许该机器连接 |
| Fcl.WSOP 授权异常 | 按「开发准备」第 3 步处理授权文件 |
