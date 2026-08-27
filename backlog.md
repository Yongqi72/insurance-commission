# Backlog · insurance-commission

> 条目格式：
> - `- [ ] {日期} | [偏离] {描述} | {原因}`
> - `- [ ] {日期} | [不阻断] {描述} | {来源：联调/验收}`
> - `- [ ] {日期} | [欠账] {描述} | 源：{来源} {迭代} {task-id}`（本期该有而没人做的功能/能力缺口；`manual-test` 会话启动读本期条目，验收前过一遍）
> - `- [修订] {日期} | target={prd/trd/standards} | {改了什么} | 原因：{reason}`

- [ ] 2026-08-26（原 2026-08-25，ic-v1-001 部分兑现后更新）| [欠账] 正式 migration 文件已由 ic-v1-001 交付（`backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts`），但沙箱仍无 Docker/MySQL，`migration:run`/`migration:revert` 从未在真实 MySQL 上执行验证（round-01 独立审查 ic-v1-001-F001，evidence-gap，阻断级但走 request-evidence 不进代码整改）；生产部署 / 联调阶段有真实 MySQL 后必须补跑一次全链路验证，通过前不得视为 AC1/AC2 已证实 | 源：develop v1 ic-v1-001
- [ ] 2026-08-25 | [欠账] 「页面外壳」「HTTP 单例」两项地基件实测仅达"强约定"（机械级-缺 lint），未到 foundation.md 声明的构造级：反例（顶层新增不嵌套路由 / 另建 axios 实例）未被 lint/类型系统拦截，见 `iterations/v0/code-reviews/foundation/round-01.md` F001/F002；待补路由结构 lint 或 `no-restricted-imports` 类规则封死出口 | 源：develop v0 foundation
- [ ] 2026-08-25 | [欠账] 「销售人员回填」第三方接口本期未提供，V1 只搭调用骨架（配置化地址，验收走"未匹配→人工补录"路径）；待对方接口就绪后需另建 develop 任务做真实联调 | 源：draft-prd v1
- [修订] 2026-08-26 | target=prd | 功能「提成报表导出」：删除"导出结果不落库存档"排除项，改为导出文件同步上传 OSS 存档 + 记录导出记录（批次/OSS 地址/时间），新增 AC-17「查看导出历史」（右侧抽屉，可重新下载），涉及实体新增"导出记录" | 原因：plan-sprint 阶段用户明确要求导出报表也要能核对（此前"纯实时不落快照"的决定不变，只是新增文件本身的存档能力）
- [修订] 2026-08-26 | target=trd | 级联上一条 PRD 修订：新增表「导出记录」（`export_record`），`GET .../commission-report` 服务流程追加上传 OSS + 插入导出记录，新增接口 `GET .../exports`（导出历史，回链 AC-17） | 原因：PRD revise-doc 影响 TRD 数据结构与接口，级联修订
- [ ] 2026-08-26 | [欠账] `OssClient.upload`/`getSignedUrl` 本期只有 mock 级单测（沙箱无真实阿里云 OSS 测试凭证），未做真实网络上传 + 签名 URL 下载一致性验证（round-01 独立审查 ic-v1-001-F004，建议级 evidence-gap）；ic-v1-003 落地导入功能后，联调/集成测试阶段需用真实测试 Bucket 补一次验证 | 源：develop v1 ic-v1-001
- [ ] 2026-08-26 | [欠账] `excel-builder.ts`/`excel-parser.ts`/migration 文件内新增运行时注释里点名了任务号（ic-v1-001/003/006），违反注释卫生规则（任务号不留在运行时注释）（round-01 独立审查 ic-v1-001-F003，建议级 future-risk）；待清理为纯业务语言描述，不阻塞当前合并 | 源：develop v1 ic-v1-001
- [ ] 2026-08-27 | [欠账] `commission-batch.entity.ts` 不在 `ic-v1-002` 任务包 `files:` 清单内却被修改（主键 `PrimaryColumn.type` 'bigint'→'int'，修复 sqlite synchronize 建表报错）；round-01 独立审查（ic-v1-002-F001）已核实对生产 MySQL schema/运行时行为均无影响、verified-closed，不阻塞合并；待补录进任务包 `files:` 清单以对齐实际改动范围（纯文档性） | 源：develop v1 ic-v1-002
- [ ] 2026-08-27 | [欠账] `commission-batch.entity.ts`/`create-commission-batch.dto.ts` 新增运行时注释里点名了任务号（ic-v1-002），与 ic-v1-001-F003 同根问题（round-01 独立审查 ic-v1-002-F002，建议级 future-risk）；待清理为纯业务语言描述，不阻塞当前合并 | 源：develop v1 ic-v1-002
- [ ] 2026-08-27 | [欠账] `commission-batch.module.ts` 运行时注释再次点名任务号（ic-v1-002/ic-v1-003），已是第三次出现同一模式（ic-v1-001-F003/ic-v1-002-F002/ic-v1-003-F001）；建议下一轮 develop 会话启动前重申"运行时注释不留任务号"约定，而非逐次记录 | 源：develop v1 ic-v1-003
- [ ] 2026-08-27 | [欠账] 仓库未装 `@types/multer`（对比 ic-v1-001 曾为 `ali-oss` 补装 `@types/ali-oss` 的先例），`import.service.ts`/`import.controller.ts` 靠 `tsconfig` `noImplicitAny:false` + 手写最小接口 `UploadedExcelFile` 编译通过；若未来收紧 `noImplicitAny` 会失败，待补装类型包 | 源：develop v1 ic-v1-003
- [ ] 2026-08-27 | [欠账] `policy-record.module.ts`（注册 SalesFillLog repository）不在 ic-v1-004 任务包 `files:` 清单内且未在执行者 `deviations` 字段披露；round-01 独立审查（ic-v1-004-F001）已用隔离 worktree 反证：还原该改动会导致 `UnknownDependenciesException` 启动失败，确认技术上必要且无更小方案，判定为报告纪律缺口而非代码问题，verified-closed，不阻塞合并；待补录进任务包 `files:` 清单 | 源：develop v1 ic-v1-004
- [ ] 2026-08-27 | [欠账] 运行时/测试注释第 4 次点名任务号（`commission-batch.module.ts`/`policy-record.e2e-spec.ts` 含 ic-v1-002/003/004），累计已在 ic-v1-001~004 四个任务中出现同一模式；强烈建议下一轮 develop 会话启动前在执行 subagent 的公共 prompt 模板里重申约定，而非逐任务记录 | 源：develop v1 ic-v1-004
- [ ] 2026-08-27 | [欠账] `GET .../policy-records` 缺少 keyword+fillStatus 同时传入的 e2e 用例（round-01 独立审查 ic-v1-004-F003 已额外探测确认 AND/OR SQL 组合本身正确，纯覆盖率缺口非缺陷）；待补一条组合筛选用例 | 源：develop v1 ic-v1-004
- [ ] 2026-08-27 | [欠账] `commission-tier.service.ts` `remove()` 的删除与写变更日志是两条非事务语句，与 `create()`/`update()`（已包 SERIALIZABLE 事务）不一致，中途崩溃会出现"档位已删但无日志"；已提交合并前修复的是 assertBoundsOrdered null 判断与 fill() 并发删除两个 correctness bug，本条未纳入本次修复范围 | 源：/code-review PR#3
- [ ] 2026-08-27 | [欠账] `policy-record-query.service.ts` keyword 搜索用 `Like('%keyword%')` 未转义 `%`/`_`，工作单号含下划线时被当通配符导致过度匹配 | 源：/code-review PR#3
- [ ] 2026-08-27 | [欠账] `policy-record.e2e-spec.ts` 原有"空列表"断言被替换成 `expect.any(Array)`，丢失基线校验 | 源：/code-review PR#3
- [ ] 2026-08-27 | [欠账] `ensureBatchExists`（findOne+1004）在 `import.service.ts`/`policy-record-query.service.ts`/`commission-batch.service.ts` 三处重复实现；`extractOperator(request)` 在 `commission-tier.controller.ts`/`policy-record.controller.ts` 重复；均可收敛为共享工具函数/装饰器 | 源：/code-review PR#3
- [ ] 2026-08-27 | [欠账] `import.service.ts` OSS 上传与 Excel 解析互不依赖却顺序 await，可 `Promise.all` 并行降延迟；`fill()` 未分批加载批次全部未匹配记录，大批次下有内存/请求体积风险；latin1→utf8 文件名兼容处理写在单个 service 内联，未收敛为共享上传配置 | 源：/code-review PR#3
- [ ] 2026-08-27 | [欠账] `PolicyRecord` 实体未用关系装饰器声明 `import_file_id`/`import_batch_id` 外键，sqlite e2e 库靠 `synchronize:true` 建表不会生成 FK 约束（生产 FK 只在 MySQL migration SQL 里存在）；导致本仓 e2e 环境无法真实复现依赖数据库外键约束的并发异常场景（pr3-hotfix round-01 独立审查 F001 发现），待评估是否需要在 Entity 层补关系装饰器以便测试环境复现真实约束 | 源：/code-review PR#3 + pr3-hotfix round-01
- [ ] 2026-08-27 | [欠账] develop 末端补写 ic-v1-002~005 审计留痕（`status.yml code_reviews[]`）时发现 `ic-v1-005` round-02/round-03 报告的墙钟时间戳早于 round-01（且 round-02 `elapsed_minutes` 为空），说明当次会话未按规范"编排器在事件发生时取 ISO-8601 时间"当场记录，而是事后填了占位值；已按 round-01→02→03 的固定 diff 链顺序改回内部一致的时间戳（技术结论/finding 内容未改动），仅是审计元数据修复，非代码问题；建议后续 develop 会话对多轮 targeted 复审强调"每轮 dispatch/completion 当场写时间戳，不得事后估算" | 源：develop v1（本次末端状态更新会话）
- [ ] 2026-08-27 | [欠账] `commission-report.service.ts` `buildUniqueSheetName()` 的非法字符替换/截断至 31 字符/截断后重名追加 `~N` 后缀三条分支无测试覆盖（e2e 用例的 policyholder 均为短字符串，未触发这些分支）；不影响提成金额计算，仅影响 sheet 显示名，若正则/截断逻辑回归只能在生产环境用真实长/特殊字符投保人名触发时发现（ic-v1-006 round-01 独立审查 F002） | 源：develop v1 ic-v1-006
- [ ] 2026-08-27 | [欠账] `commission-report.service.ts` `ossKey = exports/{batchId}/{Date.now()}-{fileName}`，未加额外唯一性/DB 唯一约束，OSS `put()` 为覆盖写语义——同一批次在同一毫秒内两次并发导出理论上会互相覆盖 OSS 对象内容（窄可达，真实概率极低）；待评估是否需要加随机后缀/UUID 提高 ossKey 唯一性（ic-v1-006 round-01 独立审查 F003） | 源：develop v1 ic-v1-006
- [ ] 2026-08-27 | [欠账] `commission-report.service.ts` `exportReport()` 先 `ossClient.upload()` 后 `exportRecordRepository.save()`，两步无事务/补偿——若 save() 失败会产生孤儿 OSS 对象（不会向客户端返回"伪成功"，顺序本身与任务包 oracle 原文一致）；待评估是否需要失败时清理已上传对象或记录待清理队列（ic-v1-006 round-01 独立审查 F004） | 源：develop v1 ic-v1-006
