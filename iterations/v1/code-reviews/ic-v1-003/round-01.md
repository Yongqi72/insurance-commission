---
task_id: ic-v1-003
round: 1
mode: full
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-003/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 5852fcdd3b72d9cec55568419fac86e321d7b275
reviewed_base: e31be08da0d12234fb8a2c7fb3de4bf860248ce8
reviewed_head: 5625a8b24a42dd561af6b1bc72f291e1ef51c8ad
diff_sha256: 384ecd4194bb7cac6ab84397c0b8accba7efd6a672d7e1975d50ad433092bd7a
changed_files:
  - backend/src/commission-batch/import.controller.ts
  - backend/src/commission-batch/import.service.ts
  - backend/src/commission-batch/commission-batch.module.ts
  - backend/test/commission-batch-import.e2e-spec.ts
started_at: 2026-08-27T03:11:00Z
completed_at: 2026-08-27T03:26:00Z
elapsed_minutes: 15
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "latin1→utf8 中文文件名转换必要性/副作用双向验证：在隔离 scratch 脚本（独立 express+multer+supertest，不接触工作区任何被审文件）中分别用中文文件名「账单.xlsx」与 ASCII 文件名「bill.xlsx」发起 multipart 上传：不加转换时 multer 给出的 originalname 对中文文件名确实是乱码 'è´¦å.xlsx'（hex 反查证实是 UTF-8 字节被当 latin1 逐字节拆开的经典 mojibake），加 Buffer.from(x,'latin1').toString('utf8') 转换后正确还原为「账单.xlsx」；ASCII 文件名转换前后均为 'bill.xlsx' 无变化——必要性与无副作用两侧均已复现证实，非采信执行者自述"
  - "级联删除顺序必要性：核对 migration（1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts:151 sales_fill_log→policy_record FK onDelete:'CASCADE'；:369/:444 policy_record→import_file FK onDelete:'RESTRICT'）证实：deleteImport 必须先删 policy_record 再删 import_file——若顺序反转，RESTRICT 约束会在仍有子行引用 import_file 时拒绝删除父行；代码实现顺序（先删 PolicyRecord 再删 ImportFile）与该约束方向一致，且被 e2e 用例实际跑通验证（非仅代码走读）"
affected_regressions: []
changed_surface_allowed: [backend/**]
```

`full`：按 `profile-round-01.json` 的 `selected_dimensions` 执行 `develop-review.md` 对应 id（contract / scope-and-secrets / test-evidence / comment-hygiene / standards / enforcement / input-provenance / query-performance / concurrency / logging-privacy / maintainability / sensitive-boundaries）。审查范围严格限定在派发者指定的 4 个文件（`git diff -- <4 files>` 单独取证），未审查 diff 中同时出现但属 ic-v1-002（已 pass）的 `commission-batch.controller.ts`/`.service.ts`/`.entity.ts`/`dto/*`/`app.module.ts`/`commission-batch.e2e-spec.ts`；对 `commission-batch.module.ts` 只评价本任务新增的 `ImportController`/`ImportService`/`ImportFile`/`PolicyRecord`/`OssModule` 注册部分。

独立执行 `npx tsc --noEmit`（通过，0 错误）、`npm run lint`（通过，`--fix` 未产生任何新增改动，`git status`/`git diff --stat` 核对 staged diff 未被触碰）、`npm run test:e2e -- commission-batch-import.e2e-spec`（12/12 通过）、`npm run test:e2e` 全量（3 个 suite / 29 个用例全部通过，`commission-batch.e2e-spec` 与 `policy-record.e2e-spec` 均无回归）。

## 本轮重点核查结论

1. **不可逆数据操作边界（DELETE 级联硬删除）**：`import.service.ts:282-285` `deleteImport` 用 `this.dataSource.transaction(async (manager) => { manager.delete(PolicyRecord, {importFileId}); manager.delete(ImportFile, {id}); })`——单一 `manager` 贯穿两次 delete，属同一 DB 事务，任一步抛错都会整体回滚（TypeORM `DataSource.transaction` 标准语义，代码结构上不存在跨连接/手动 commit 等会破坏原子性的写法）。删除顺序（先 policy_record 后 import_file）不仅匹配 oracle 文字要求，且是**必需**的——已读取 `backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts` 证实 `policy_record.import_file_id → import_file.id` 外键为 `onDelete: 'RESTRICT'`（非 CASCADE），顺序反转会被数据库拒绝；`sales_fill_log.policy_record_id → policy_record.id` 为 `onDelete: 'CASCADE'`（:151），印证 known-risks 所述"依赖 ic-v1-001 迁移里的 CASCADE 设置"确实成立，本包无需手动清理 `sales_fill_log`。导入记录不存在返回 1004（`findOne` 未命中 → `NotFoundException`）：e2e 覆盖并通过。OSS 原文件不删除：`deleteImport` 全程未调用 `ossClient` 任何方法，读代码 + e2e（`DELETE 成功撤销导入`用例未 mock/断言任何 OSS 删除调用）均确认。
2. **文件解析失败路径**：`importExcel` 内顺序为「`ensureBatchExists` → 校验 file 非空 → `ossClient.upload`（先归档）→ `excelParser.parse`（后解析）」，解析失败（`ok === false`）时直接 `throw BadRequestException`，不再写入 `ImportFile` 记录，且已上传的 OSS 对象无任何删除/回滚调用——与 oracle "两种失败场景均不建立导入文件记录，但已上传至 OSS 的原文件不删除"字面一致。e2e 用例分别覆盖"文件无法解析（非 xlsx）"与"未找到「账单」sheet"两种 1001 场景，且都断言 `ossUploadMock` 被调用 1 次、`importFileRepository.count()` 前后不变。
3. **中文文件名 latin1→utf8 转换**：见上文「本轮范围」counterexamples 第一条，必要性（不转换会乱码）与安全性（ASCII 文件名无副作用）均已独立复现证实，非采信执行者注释里的自述。
4. **类型安全缺口（`@types/multer` 未装）**：属实——`node_modules/@types` 下无 `multer` 目录，`tsconfig.json:16 noImplicitAny: false` 是该写法能编译通过的前提。对比 ic-v1-001 曾为 `ali-oss` 补装 `@types/ali-oss`（`package.json:48`）的先例，本次选择手写最小接口 `UploadedExcelFile { originalname, buffer }` 而非补类型包，是工程纪律上的不一致，且隐含一个真实的未来脆弱点：一旦 `noImplicitAny` 被后续任务收紧为 `true`，`import { memoryStorage } from 'multer'` 会立刻产生 TS7016 编译错误。当前无 `relevant-standards` 明确要求为第三方 SDK 补装类型包（`BE-EXT-02` 只管对象存储访问收敛，不管类型声明来源），故判 advisory 而非阻断，见 F002。
5. **BE-EXT-02**：`import.service.ts` 只 `import { OssClient } from '../common/oss/oss-client'`，未出现 `ali-oss` 直接 import；`OssClient.upload` 是唯一调用点。符合。
6. **BE-EXCEL-01**：`import.service.ts` 只 `import { ExcelParser } from '../common/excel/excel-parser'`，未重新实现任何解析逻辑（列顺序/表头判断全部委托 `ExcelParser`/`policy-record-columns.ts`）。符合。
7. **3 条 AC 的 oracle 逐条核对**：见下方 `contract` 小节，12 个 e2e 用例覆盖全部分支（1001 两种子场景、1004 三处、failRows 行号+原因、批次可重复上传、列表倒序、空列表非报错、级联硬删除后记录消失且 OSS 不受影响），已独立重跑全绿。
8. **运行时注释点名任务号**：`commission-batch.module.ts:14-15` 注释原文含"ic-v1-003 在本文件追加自己的 Controller/Service"与"不覆盖 ic-v1-002 已注册的"，直接点名两个任务号，与 ic-v1-001-F003 / ic-v1-002-F002 同根问题重复出现，见 F001。

## Findings

```yaml
findings:
  - id: ic-v1-003-F001
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: "commission-batch.module.ts:14-15 运行时注释原文：「controllers/providers 用数组形式声明：ic-v1-003 在本文件追加自己的 Controller/Service 注册（导入相关接口），追加方式为向数组 push 新项，不覆盖 ic-v1-002 已注册的 CommissionBatch 相关项」——同时点名 ic-v1-003 与 ic-v1-002 两个任务号，与 ic-v1-001-F003（首次判定）、ic-v1-002-F002（同根重现）属同一违规模式的第三次重现"
    impact: "不影响当前行为；任务号语义只在 sprint.md 内可查，长期可维护性随任务号在运行时注释里持续堆积而递减；已连续三个任务包（ic-v1-001/002/003）复现，值得在下一轮 develop 会话启动前对执行者重申约定，而非继续逐任务零星记 advisory"
    action: backlog
    status: open
  - id: ic-v1-003-F002
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: "backend/node_modules/@types 下无 multer 子目录（未装 @types/multer），import.controller.ts 顶部注释与 import.service.ts:127-130 注释均如实自报此事：靠 tsconfig.json:16 的 noImplicitAny:false 才使 `import { memoryStorage } from 'multer'` 免于 TS7016 编译错误，并用手写最小接口 `UploadedExcelFile { originalname, buffer }` 代替 `Express.Multer.File`。对比 ic-v1-001 已为结构相似的第三方 SDK 缺类型问题补装 `@types/ali-oss`（package.json:48）的先例，本次未同等处理，是同一类问题在工程纪律上的不一致处理"
    impact: "当前不影响编译与运行（已验证 tsc --noEmit 通过、12/12 e2e 通过）；条件性未来风险：若后续任务把 tsconfig 的 noImplicitAny 收紧为 true（常见的渐进式类型加固动作），本文件的 multer 具名导入会立即编译失败；此外手写的 2 字段最小接口只覆盖当前用到的字段，后续若需要 file.mimetype/file.size 等其他 multer 字段会被迫继续手工扩展接口而非直接用标准类型"
    action: backlog
    status: open
findings_meta:
  blocking_count: 0
```

- `contract`：无发现。三条 AC 的 oracle 逐一被有辨别力的 e2e 用例证明：
  - AC「上传解析入库归档」：非 xlsx→1001+"无法解析"（不建记录，OSS 已传）；无「账单」sheet→1001+"账单"提示（不建记录，OSS 已传）；批次不存在→1004 且不调 OSS；全字段齐全 2 行→successCount=2/failCount=0，落库 `importBatchId`/`salesFillSource`断言逐条核对；部分字段缺失/金额非数字→failRows 精确到行号+原因（`row:2 「客户名称」不能为空`、`row:3 「保险金额」必须为数字`），且仅失败行被跳过、其余行仍成功入库；同一批次重复上传两份文件互不干扰（两个 importFileId 不同、各自 1 条 import 记录）。
  - AC「导入历史列表」：批次不存在→1004；空历史→`data:[]`非报错；两次导入后手动改写 `importedAt` 制造确定性时间差（去 flaky 化）验证倒序返回。
  - AC「撤销导入」：导入记录不存在→1004；成功撤销后 policy_record 两行消失、import_file 记录本身查询为 null、且不再出现在 GET 列表里。
  - example 与 oracle 无冲突（PRD 示例文件名"7月账单.xlsx"/"6月账单.xlsx"等均在测试或注释中体现，未发现字面不一致）。
- `scope-and-secrets`：无发现。改动文件与 profile `changed_files`（4 个）逐一比对一致，无隐藏改动，未触碰 `do-not` 禁止的批次 CRUD/回填/人工补录接口；diff 内无明文密钥/token/密码（OSS 凭证仍走 `ConfigService` 环境变量，本任务未新增任何凭证相关代码）。
- `test-evidence`：无发现。12/12 e2e 独立重跑全绿，`tsc --noEmit`/`lint` 均通过；全量 `test:e2e`（3 suite/29 用例）无回归。测试对 oracle 有辨别力（如 failRows 用具体行号+具体错误文案精确匹配，而非仅断言 `failCount>0`；排序用例显式改写 `importedAt` 避免真实请求间隔导致的 flaky）。
- `comment-hygiene`：见 F001。
- `standards`：
  - BE-LAYER-01：`ImportController` 三个方法均只做 `@Param`/`@UploadedFile` 接收 + 转发给 `ImportService`，无业务判断、无直接操作 Repository。符合。
  - BE-LAYER-02：全局 `grep -rn "@Controller("` 核对，`api/commission-batches/:batchId/imports`（3 段）与既有 `api/commission-batches`（1 段）、`api/commission-batches/:id`（2 段）、`auth`、`policy-records` 均无路径冲突，Express 路由按段数精确匹配不会互相截获（与 ic-v1-002 已记录的路由风格结论一致）。
  - BE-EXT-02：见「本轮重点核查结论」第 5 点，符合。
  - BE-EXCEL-01：见「本轮重点核查结论」第 6 点，符合。
  - BE-LOG-01：`import.service.ts:200-202` 解析失败时 `this.logger.warn` 记录了具体 `reason`/`fileName`/`ossKey`；本任务改动内无裸 `console.log`/`console.error`；未新增会吞掉错误上下文的 `try/catch`（唯一涉及异常处理的路径是 `ossClient.upload` 内部——属 ic-v1-001 交付的 `OssClient` 自身职责，非本次改动）。符合。
  - BE-TEST-01：`commission-batch-import.e2e-spec.ts` 位于 `test/` 目录，命名 `*.e2e-spec.ts`，运行命令 `npm run test:e2e` 符合约定。
  - SH-API-01：Controller 未手动包装响应，交由全局 `SuccessInterceptor`；e2e 断言 `{code, msg, data}` 信封结构（如 `code:0, msg:'success'`、DELETE 成功 `data:null`）。
  - SH-API-02：`BadRequestException`→400→1001（`AllExceptionsFilter.mapStatusToCode`）、`NotFoundException`→404→1004，均由 e2e 逐一验证命中正确错误码。
  - SH-AUTH-01：`ImportController` 未标 `@Public()`，走全局 Guard 默认受保护；e2e 首个用例验证未登录访问 POST 返回 401/1002。
  - 无发现（类型声明缺口不属于本次命中的 standards 条目，改列入 maintainability 维度 F002）。
- `enforcement`：无发现。e2e 对三个接口的正反例均有区分度（1001 两种子场景分别断言不同 msg 关键字、1004 三处分别覆盖 POST/GET/DELETE、失败行断言精确到行号+原因文案），测试基础设施（AppModule 全量启动 + 真实 SQLite 事务）在本轮独立重跑中真实翻绿/翻红（对照全量 e2e 无回归），非形同虚设的探针。
- `input-provenance`：本任务无 `@Body()` + class-validator 校验的 DTO class（POST 用 `@UploadedFile()` 接收 multipart 文件，非 JSON DTO；GET/DELETE 仅消费路径参数 `batchId`/`importId`，均只用于查找匹配，不落库为业务字段）。DTO 文件数 = 0，字段数 N = 0，本表行数 = 0，覆盖率自证成立（无 DTO 即无需枚举）。唯一的外部可控输入是上传文件的 `originalname`（用户可任意命名）：其流向为 `latin1→utf8` 解码后原样写入 `ImportFile.fileName`（varchar(255)）与拼入 `ossKey`（varchar(512)）——与既有 `CreateCommissionBatchDto.name`（`@IsString+@IsNotEmpty`，同样无 `@MaxLength`，ic-v1-002 round-01 对此未判 finding）属同一类"无长度上限校验"模式，非本任务新引入的更严重问题，按既有先例不单独立 finding，仅记录以保持跨轮判定口径一致。
- `query-performance`：无发现。`listImports` 用 `find({where, order})` 一次查询完成排序，无循环查询；`importExcel` 的批量插入用 `manager.save(policyRecords)` 对数组一次调用（非逐行 await 循环），无 N+1；`deleteImport` 两次 `manager.delete` 均为条件删除，无先查后删的补查模式。
- `concurrency`：无发现。`importExcel`/`deleteImport` 的写入均在 `dataSource.transaction` 单一 `manager` 内完成，具备原子性（结构上无跨连接/手动 commit 分裂写入的可能）。构造反例：两个并发 DELETE 请求同时命中同一 `importId`——`findOne` 存在 TOCTOU 窗口，理论上第二个请求可能在第一个事务提交前也通过存在性检查，其自身事务内的两次 `delete` 会因目标行已被前一事务删除而影响 0 行、不抛错——最终数据状态与串行执行完全一致（无孤儿行、无重复删除副作用），仅有"第二个请求本该 1004 却返回了 200 空结果"的极端边界，不产生数据不一致，且二次确认本就声明是前端职责（oracle 原文），故不判 finding。`importExcel` 同一批次并发上传两份文件互不冲突（各自建立独立 `ImportFile`+`PolicyRecord` 行，无唯一约束竞争，工作单号/保单号不做唯一校验属既定设计）。
- `logging-privacy`：无发现。本次 diff 唯一的日志输出（`import.service.ts:200` 的 `logger.warn`）只记录 `batchId`/`reason`/`fileName`/`ossKey`，不含凭据、完整请求体或跨批次/跨客户数据；`fileName` 来自用户上传文件名而非保单业务数据，非 PII 泄露路径。
- `maintainability`：见 F002；其余部分无发现——`OssClient`/`ExcelParser` 均直接复用 ic-v1-001 交付的封装，未重造已有机制；`import.service.ts`/`import.controller.ts` 的分层与命名风格与 `commission-batch.service.ts`/`.controller.ts`（ic-v1-002）保持一致。
- `sensitive-boundaries`：见「本轮重点核查结论」第 1 点（DELETE 级联硬删除的事务原子性与顺序必要性，已用 migration FK 方向 + e2e 双重验证）；未发现权限分层变更、金额/计费逻辑改动、或未声明的不可撤销外部副作用（OSS 只增不删，与 oracle 一致）。

## 处理说明

- F001：记入项目根 `backlog.md`（[欠账]），与 ic-v1-001-F003、ic-v1-002-F002 同根，已连续三个任务包复现——建议下一轮 develop 会话启动前在会话内对执行者重申"运行时注释不留任务号"约定，而非继续逐任务零星记 advisory；不阻塞本次合并。
- F002：记入 `backlog.md`（[欠账]），建议后续统一决定"未装类型声明的第三方包"处理策略（补装 `@types/*` 或明确允许 `noImplicitAny:false` 兜底），避免同类问题在不同任务包间随意选择、standards 无明文覆盖；不阻塞本次合并。
- 无 `fix-code`/`fix-mechanism` 级 blocking finding，`conclusion: pass`，进入末端。
