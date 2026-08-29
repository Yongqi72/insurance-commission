# TRD · v1 · insurance-commission

## 技术选型变更

- `exceljs`（^4.4）：解析导入 Excel「账单」sheet + 生成导出报表 Excel；选型理由：读写一体（避免拆两个库两套依赖），原生支持多 sheet 生成与流式写入，社区维护活跃，NestJS/Node 生态兼容良好。
- `ali-oss`（^6.20）：阿里云 OSS 官方 Node SDK；选型理由：账单原始文件归档、私有 Bucket 签名 URL 生成的官方标准实现，无需自行拼接鉴权签名。

## 数据库设计

### 表：提成批次
- 实际表名：`commission_batch`
- 字段：`id`（bigint，自增主键，经 `numericIdTransformer` 序列化为 string——与 `保单记录.import_batch_id`（V0 已建 bigint 列）类型对齐；测试/开发/生产环境统一 MySQL，不再有 SQLite 沙箱兼容顾虑）/ `name`（varchar 128，批次名称）/ `status`（varchar 16，枚举 `doing`|`done`，默认 `doing`）/ `created_at`（datetime，自动生成）/ `updated_at`（datetime，自动生成）
- 约束 / 索引 / 外键 / 唯一性：`name` 无唯一约束（允许重名）；`created_at` 建索引（支撑批次列表默认倒序）

### 表：导入文件记录
- 实际表名：`import_file`
- 字段：`id`（int，自增主键）/ `batch_id`（bigint，外键→提成批次.id）/ `file_name`（varchar 255）/ `oss_key`（varchar 512，OSS 对象 key，用于生成签名 URL）/ `imported_at`（datetime）/ `success_count`（int）/ `fail_count`（int）
- 约束 / 索引 / 外键 / 唯一性：`batch_id` 外键约束 + 索引（支撑按批次查导入记录列表）

### 表：保单记录
- 实际表名：`policy_record`（V0 已建 `PolicyRecord`，本期变更如下）
- 字段：V0 已建字段不变，本期新增/变更如下——
  - 新增 `premium_amount`（decimal(14,2)，经 `decimalTransformer`，保费，对应账单 Excel「保险金额」与「保单号」之间的无表头列）
  - 新增 `import_file_id`（int，可空，外键→导入文件记录.id；V0 遗留数据此字段为空）
  - 新增 `sales_fill_source`（varchar 16，枚举 `unmatched`|`system`|`manual`，默认 `unmatched`；替代原先仅靠 `sales_name` 是否为空判断回填状态）
  - `work_order_no`（varchar 64）：移除 `unique: true`，改建**普通（非唯一）索引**，保留搜索/回填查询性能，但不再约束唯一——真实数据中同一工作单号可对应多条保单
  - `policy_no`（varchar 64）：同上，移除唯一约束，改建普通索引
- 约束 / 索引 / 外键 / 唯一性：`import_file_id` 外键约束（可空）；`import_batch_id`（V0 已建 bigint 字段，本期启用，与「提成批次」`id` 类型一致）建索引支撑批次维度查询；需新建正式 migration 文件落地本次结构变更（含唯一约束移除），替代 V0 遗留的 `synchronize` 建表方式

### 表：销售人员补录日志
- 实际表名：`sales_fill_log`
- 字段：`id`（int，自增主键）/ `policy_record_id`（int，外键→保单记录.id）/ `operator`（varchar 64，操作人，取自当前登录管理员）/ `changed_at`（datetime）/ `old_value`（varchar 64，可空）/ `new_value`（varchar 64）
- 约束 / 索引 / 外键 / 唯一性：`policy_record_id` 外键约束 + 索引（支撑按记录查历史）；只增不改不删，无 update/delete 入口

### 表：提成阶梯规则
- 实际表名：`commission_tier`
- 字段：`id`（int，自增主键）/ `lower_bound`（int，下限票数，≥0）/ `upper_bound`（int，可空，上限票数；空表示"及以上"）/ `unit_price`（decimal(10,2)，经 `decimalTransformer`）/ `created_at`（datetime）/ `updated_at`（datetime）
- 约束 / 索引 / 外键 / 唯一性：`lower_bound` 建索引（支撑按下限排序展示 + 冲突校验查询）；应用层校验 `unit_price > 0` 且 `lower_bound >= 0`

### 表：提成阶梯规则变更日志
- 实际表名：`commission_tier_change_log`
- 字段：`id`（int，自增主键）/ `operation_type`（varchar 16，枚举 `create`|`update`|`delete`）/ `operator`（varchar 64）/ `changed_at`（datetime）/ `before_snapshot`（text，JSON 字符串，结构 `{lowerBound, upperBound, unitPrice}`，可空——`create` 时为空）/ `after_snapshot`（text，JSON 字符串，同结构，可空——`delete` 时为空）；API 层返回时统一解析为对象（非原始字符串），供前端直接取字段渲染
- 约束 / 索引 / 外键 / 唯一性：`changed_at` 建索引（支撑倒序列表）；只增不改不删

### 表：导出记录
- 实际表名：`export_record`
- 字段：`id`（int，自增主键）/ `batch_id`（bigint，外键→提成批次.id）/ `oss_key`（varchar 512，OSS 对象 key，用于生成签名 URL）/ `exported_at`（datetime）
- 约束 / 索引 / 外键 / 唯一性：`batch_id` 外键约束 + 索引（支撑按批次查导出历史）；只增不改不删

## 接口设计

### 接口：POST /api/commission-batches
- 请求体：`{ name: string }`
- 响应体：`{ id, name, status, createdAt, updatedAt }`
- 错误码：`1001`（`name` 为空）
- 服务流程：校验 `name` 非空 → 插入提成批次记录，`status` 初始值固定 `doing` → 返回
# 满足 AC：AC-01

### 接口：GET /api/commission-batches
- 请求体：Query `PageQueryDto`（`page`/`pageSize`）
- 响应体：`PageResultDto<{ id, name, status, createdAt, updatedAt }>`
- 错误码：无
- 服务流程：分页查询，按 `created_at` 倒序；列表为空时前端展示空态（AC-05）
# 满足 AC：AC-05

### 接口：GET /api/commission-batches/:id
- 请求体：无
- 响应体：`{ id, name, status, createdAt, updatedAt }`
- 错误码：`1004`（批次不存在）
- 服务流程：按 `id` 查询，不存在返回 `1004`；供批次详情页头部展示批次名/当前状态，是 AC-02 状态切换操作的前提读取
# 满足 AC：AC-02

### 接口：PATCH /api/commission-batches/:id/status
- 请求体：`{ status: 'doing' | 'done' }`
- 响应体：更新后的批次
- 错误码：`1001`（`status` 非法值）、`1004`（批次不存在）
- 服务流程：校验 `status` ∈ `{doing, done}` → 更新 → 返回；状态切换不触发/不限制其他任何操作
# 满足 AC：AC-02

### 接口：POST /api/commission-batches/:id/imports
- 请求体：`multipart/form-data`，字段 `file`（Excel 文件）
- 响应体：`{ importFileId, fileName, successCount, failCount, failRows: [{ row, reason }] }`
- 错误码：`1001`（文件无法解析 / 未找到「账单」sheet——两种失败共用 `1001`，前端不需按类型分支处理，仅透传 `msg` 文本区分）、`1004`（批次不存在）
- 服务流程：
  1. 原始文件上传至 OSS（私有 Bucket），记录返回的 `oss_key`
  2. `exceljs` 读取 workbook；非 Excel 格式/损坏/加密 → `1001`；查找名为「账单」的 sheet，不存在 → `1001`（整份文件失败，不建导入文件记录，但 OSS 上传的文件保留不删）
  3. 跳过表头行，逐数据行按顺序解析 8 列（客户名称/工作单号/业务类型/币种/投保人/保险金额/保费/保单号），在内存中分成成功行与失败行（`failRows`：行号 + 原因），不立即写库
  4. 先插入导入文件记录（`batch_id`/`oss_key`/`file_name`/`imported_at`/`success_count`/`fail_count`），取得其 `id`
  5. 成功行批量插入保单记录（`import_batch_id` = 当前批次、`import_file_id` = 上一步导入文件记录 id、`sales_fill_source` = `unmatched`，工作单号/保单号不做唯一校验）
  6. 返回结果
# 满足 AC：AC-03

### 接口：GET /api/commission-batches/:id/imports
- 请求体：无
- 响应体：`[{ id, fileName, importedAt, successCount, failCount }]`，按 `imported_at` 倒序
- 错误码：`1004`（批次不存在）
- 服务流程：按 `batch_id` 查询该批次全部导入文件记录；批次详情页每次打开/刷新都调用本接口渲染"导入记录"表格（`POST .../imports` 的即时返回值只用于本次操作后的成功/失败提示，不是列表数据来源）
# 满足 AC：AC-03

### 接口：DELETE /api/commission-batches/:id/imports/:importId
- 请求体：无
- 响应体：无（`data` 为空）
- 错误码：`1004`（导入记录不存在）
- 服务流程：事务内删除该 `import_file_id` 关联的全部保单记录，再删除导入文件记录本身（硬删除）；OSS 上的原始文件不删除
# 满足 AC：AC-04

### 接口：GET /api/commission-batches/:id/policy-records
- 请求体：Query `PageQueryDto` + `keyword`（可选，模糊匹配工作单号/保单号/客户名称）+ `fillStatus`（可选，枚举 `unmatched`|`system`|`manual`）
- 响应体：`PageResultDto<{ id, customerName, workOrderNo, businessType, currency, policyholder, salesName, salesFillSource, insuredAmount, premiumAmount, policyNo }>`
- 错误码：`1004`（批次不存在）
- 服务流程：按 `batchId` + 关键词（三字段 OR LIKE）+ `fillStatus` 过滤，默认按 `created_at` 升序分页返回；结果为空时前端展示空态（AC-05）
# 满足 AC：AC-05, AC-07

### 接口：POST /api/commission-batches/:id/policy-records/fill
- 请求体：无；Query 可选 `limit`（1~500）、`afterId`（游标，配合 `limit` 使用）
- 响应体：`{ total, matchedCount, unmatchedCount, nextAfterId, hasMore }`
- 错误码：`1004`（批次不存在）；第三方接口未配置/失败不算业务错误，操作本身视为成功完成
- 服务流程：省略 `limit` 时查询该批次内 `sales_fill_source = 'unmatched'` 的全部记录（旧行为，`nextAfterId` 恒为 `null`、`hasMore` 恒为 `false`）；传 `limit` 时改为按 `id` 升序游标分页——只取 `id > afterId`（未传 `afterId` 则从最小 id 开始）的前 `limit` 条，返回本批处理到的游标 `nextAfterId` 与是否还有更多待处理记录 `hasMore`，供调用方分批调用、每批推进一次进度（前端约定：每 100 条一批，见 `BatchDetailView` 开始回填交互）。按工作单号批量调用可配置的第三方接口（请求：工作单号数组；响应：工作单号→销售人员姓名映射；接口地址读取环境变量 `SALES_FILL_API_URL`）；地址未配置、请求超时（超时阈值 5s）、或调用异常 → 涉及记录保持 `unmatched`；有返回且命中映射的记录 → 更新 `sales_name` = 返回值、`sales_fill_source` = `system`；返回统计。游标而非"还剩多少 unmatched"计数分页：第三方查不到的记录永远停留在 `unmatched`，按计数分页会无限重试同一批查不到的记录，游标保证每批总是处理 id 更大的新记录
# 满足 AC：AC-06

### 接口：PATCH /api/policy-records/:id/sales-name
- 请求体：`{ salesName: string }`
- 响应体：更新后的保单记录
- 错误码：`1001`（`salesName` 为空）、`1004`（记录不存在）
- 服务流程：事务内读取旧值 → 更新保单记录 `sales_name` = 新值、`sales_fill_source` = `manual` → 插入销售人员补录日志（`operator` = 当前登录管理员、`old_value` = 旧值、`new_value` = 新值）→ 返回；已是 `system`/`manual` 状态的记录允许再次覆盖，逻辑相同
# 满足 AC：AC-08

### 接口：GET /api/policy-records/:id/sales-fill-logs
- 请求体：无
- 响应体：`[{ operator, changedAt, oldValue, newValue }]`，按 `changedAt` 倒序
- 错误码：`1004`（记录不存在）
- 服务流程：按 `policy_record_id` 查询销售人员补录日志；无记录时前端展示空态（AC-09）
# 满足 AC：AC-09

### 接口：GET /api/commission-tiers
- 请求体：无
- 响应体：`{ tiers: [{ id, lowerBound, upperBound, unitPrice }], ruleComplete: boolean }`（按 `lowerBound` 升序）
- 错误码：无
- 服务流程：查询全部档位，按 `lower_bound` 升序；计算完整性 `ruleComplete`：排序后首档 `lowerBound === 0`，末档 `upperBound === null`，且相邻档位首尾相接（前一档 `upperBound === 后一档 lowerBound`）——三条同时满足才为 `true`；无任何档位时 `tiers` 为空数组、`ruleComplete` 为 `false`，前端据此展示对应空态/不完整提示；该判定逻辑抽为共享函数，供 `commission-summary`/`commission-report` 接口复用，字段名统一为 `ruleComplete`
# 满足 AC：AC-12

### 接口：POST /api/commission-tiers
- 请求体：`{ lowerBound: number, upperBound?: number, unitPrice: number }`
- 响应体：新建的档位
- 错误码：`1001`（`unitPrice` 非正数 / `lowerBound < 0` / `lowerBound >= upperBound`）、`1005`（与已有档位区间重叠）
- 服务流程：校验字段 → 查询全部现有档位，判定重叠（`新lowerBound < 其upperBound(空视为+∞) 且 其lowerBound < 新upperBound(空视为+∞)`），命中 → `1005` 并在错误信息中指出冲突档位 → 无冲突则插入 → 插入规则变更日志（`operation_type='create'`、`after_snapshot`=新档位）→ 返回
# 满足 AC：AC-10, AC-11

### 接口：PATCH /api/commission-tiers/:id
- 请求体：同上
- 响应体：更新后的档位
- 错误码：`1001`（同上，含 `lowerBound < 0`）、`1004`（档位不存在）、`1005`（同上，比较时排除自身）
- 服务流程：同新增校验逻辑（排除自身 id）→ 更新 → 插入规则变更日志（`operation_type='update'`、`before_snapshot`=原档位、`after_snapshot`=新档位）→ 返回
# 满足 AC：AC-10, AC-11

### 接口：DELETE /api/commission-tiers/:id
- 请求体：无
- 响应体：无
- 错误码：`1004`（档位不存在）
- 服务流程：删除该档位 → 插入规则变更日志（`operation_type='delete'`、`before_snapshot`=被删档位）；删除后可能与相邻档位产生空隙，不阻止本操作
# 满足 AC：AC-10

### 接口：GET /api/commission-tiers/change-logs
- 请求体：无
- 响应体：`[{ operationType, operator, changedAt, beforeSnapshot, afterSnapshot }]`，按 `changedAt` 倒序
- 错误码：无
- 服务流程：查询规则变更日志全量列表；无记录时前端展示空态（AC-13）
# 满足 AC：AC-13

### 接口：GET /api/commission-batches/:id/commission-summary
- 请求体：无
- 响应体：`{ ruleComplete: boolean, groups: [{ policyholder, items: [{ salesName, ticketCount, commission }], subtotal }] }`
- 错误码：`1004`（批次不存在）；规则不完整时 `ruleComplete=false`、`groups=[]`，前端展示"未配置规则，无法计算"，不算错误
- 服务流程：先查阶梯规则完整性（复用 `GET /api/commission-tiers` 同一判定逻辑）；不完整 → 直接返回 `ruleComplete=false`；完整则查询该批次内 `sales_fill_source != 'unmatched'` 的全部记录，按投保人分组，组内再按销售人员分组计数（局部票数）；每个 (投保人, 销售人员) 组合调用 `calcCommission(ticketCount, tiers)` 得单价与提成；投保人分组即使组内为空（该投保人下全部未匹配）也要出现在 `groups` 里（`items` 为空数组），供前端展示 AC-16 的提示
# 满足 AC：AC-14, AC-16

### 接口：GET /api/commission-batches/:id/commission-report
- 请求体：无
- 响应体：二进制文件流（`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`，`Content-Disposition: attachment; filename="{批次名}-提成报表.xlsx"`）
- 错误码：`1004`（批次不存在）、`2002`（阶梯规则不完整，无法导出——新增错误码，与 `1005`"操作冲突"语义不同，本期在 `standards-shared.md` 一并登记）
- 服务流程：先查阶梯规则完整性，不完整 → `2002`，不生成文件；完整则查询该批次全部保单记录（含未匹配），按投保人值分组，`ExcelBuilder` 为每个投保人生成一个 sheet：sheet 上方写明细行（客户名称/工作单号/业务类型/币种/投保人/销售[未匹配留空]/保险金额/保费/保单号），下方写销售汇总（销售姓名/票数/提成，计算复用 `calcCommission()`，与 `commission-summary` 接口同一份实现）+ 末行合计；生成 buffer 后先上传至 OSS（私有 Bucket，经 `OssClient`），插入一条导出记录（`batch_id`/`oss_key`/`exported_at`），再把同一份 buffer 流式返回前端下载（提成汇总本身仍现查现算，不做计算结果快照——归档的是"当次导出的文件"，不是把计算过程改成落库）
# 满足 AC：AC-15, AC-16

### 接口：GET /api/commission-batches/:id/exports
- 请求体：无
- 响应体：`[{ id, exportedAt, downloadUrl }]`，按 `exportedAt` 倒序，`downloadUrl` 为请求时现生成的 OSS 签名 URL（非持久链接）
- 错误码：`1004`（批次不存在）
- 服务流程：查询该批次全部导出记录，逐条用 `OssClient` 生成签名 URL 拼入响应；无记录时前端展示空态"暂无导出记录"；点击 `downloadUrl` 即拿到当时导出的原始文件，不重新计算
# 满足 AC：AC-17

## 测试环境约定

| 项 | 值 |
|----|-----|
| 后端地址 | `http://localhost:3000` |
| 前端访问方式 | Vite dev server `http://localhost:5173`，接口经 Vite proxy 转发至后端 |
| 数据库 | MySQL 独立测试库（测试/开发/生产环境统一 MySQL，V0 阶段沙箱用 SQLite 的临时方案本期结束），禁止指向生产库 |
| OSS | 使用真实阿里云 OSS 测试账号；Bucket/AccessKey 经环境变量注入（`OSS_BUCKET`/`OSS_ACCESS_KEY_ID`/`OSS_ACCESS_KEY_SECRET`/`OSS_REGION`/`OSS_ENDPOINT`），禁止硬编码；测试 Bucket 与生产 Bucket 隔离 |
| 第三方回填接口 | 本期未提供，`SALES_FILL_API_URL` 环境变量留空，联调时验证"未配置→全部未匹配"路径，不模拟真实调用 |
| 禁止在联调中触发的操作 | 不得使用真实生产 OSS Bucket；不得对生产数据库执行导入/删除操作 |

## 交互技术方案

- Excel 导入为同步阻塞处理（HTTP 请求内完成解析+入库，不用异步任务队列）：「账单」sheet 实测规模约 1300~1500 行，处理耗时可接受，本期不做进度条/轮询。
- 提成汇总为现查现算（`GET commission-summary`），批次详情页每次打开/相关数据变化后重新请求，不做 WebSocket/长连接推送。
- 阶梯档位逐档独立提交（POST/PATCH/DELETE 各自一次请求即时生效），非整表批量提交；前端弹窗内"未保存离开确认"为纯前端行为（草稿态判断），无对应后端交互。
- 无跨模块共享状态需求（单一管理员账号，无需广播/多端同步）。

## 模块拆分

**后端**：
- `commission-batch` 模块：批次 CRUD + 状态切换 + 导入（含调用 `common/oss`、`common/excel`）+ 删除导入 + 保单记录明细查询（复用 `policy-record` 仓储）+ 触发回填
- `policy-record` 模块（V0 已建，本期扩展）：新增字段迁移；新增人工补录接口 + 补录历史查询接口
- `commission-tier` 模块：阶梯规则 CRUD + 冲突/完整性判定 + 变更日志
- `commission-report` 模块：实时汇总计算（内含单一权威 `calcCommission()`）+ 导出 Excel（复用汇总计算 + `common/excel`）
- `common/oss`：`OssClient` 封装（上传 + 签名 URL）
- `common/excel`：`ExcelParser`（账单 sheet 解析）+ `ExcelBuilder`（报表生成），两处调用方共用同一套列定义

**前端**：
- `views/BatchListView.vue`：批次列表（对接批次管理接口）
- `views/BatchDetailView.vue`：导入 + 明细 + 回填 + 补录 + 提成汇总 + 导出（对接除阶梯规则外的全部接口）
- `views/CommissionTierView.vue`：阶梯规则管理（对接 `commission-tier` 接口）
- `api/commission-batch.ts` / `api/commission-tier.ts` / `api/commission-report.ts`：对应 API 模块

## 共享组件建议

| 资产 | 层 | 说明 |
|------|----|----|
| `DataStateWrapper.vue` | 前端 | 已有，建议复用于批次列表/保单明细/阶梯规则表四态接入 |
| `request.ts` Axios 单例 | 前端 | 已有，建议复用，新增 API 模块统一走此实例 |
| `PageQueryDto` / `PageResultDto` | 后端 | 已有，建议复用于批次列表、保单记录明细分页 |
| `decimal.transformer.ts` | 后端 | 已有，建议复用于 `premium_amount`/`unit_price` 等金额字段序列化 |
| `numeric-id.transformer.ts` | 后端 | 已有，建议复用于新表整型主键/外键序列化为 string |
| `OssClient`（新建议） | 后端 | `backend/src/common/oss/oss-client.ts`，封装 `ali-oss` 上传 + 签名 URL 生成，供导入文件归档复用 |
| `ExcelParser`/`ExcelBuilder`（新建议） | 后端 | `backend/src/common/excel/`，导入解析与导出生成共用同一套列定义，避免字段顺序两处各写一份 |
| `calcCommission()`（新建议） | 后端 | `backend/src/commission-report/calc-commission.ts`，`foundation.md` 已登记的单一权威提成计算函数，本期真正落地；`commission-summary` 与 `commission-report` 两个接口调用同一实现，禁止另外重复实现阶梯逻辑 |
