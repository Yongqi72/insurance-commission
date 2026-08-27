---
task_id: ic-v1-002
round: 1
mode: full
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-002/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 5852fcdd3b72d9cec55568419fac86e321d7b275
reviewed_base: e31be08da0d12234fb8a2c7fb3de4bf860248ce8
reviewed_head: 951d1453081399c2ac808ecd2c511d6028979ddb
diff_sha256: a2adb14030e928e0a9eca03e25c4cafc14780710f4bc7e7dbf707b2898849d41
changed_files:
  - backend/src/app.module.ts
  - backend/src/commission-batch/commission-batch.controller.ts
  - backend/src/commission-batch/commission-batch.entity.ts
  - backend/src/commission-batch/commission-batch.module.ts
  - backend/src/commission-batch/commission-batch.service.ts
  - backend/src/commission-batch/dto/create-commission-batch.dto.ts
  - backend/src/commission-batch/dto/update-commission-batch-status.dto.ts
  - backend/test/commission-batch.e2e-spec.ts
started_at: 2026-08-27T02:56:00Z
completed_at: 2026-08-27T03:10:00Z
elapsed_minutes: 14
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "commission-batch.entity.ts PrimaryColumn type 'bigint'→'int'：反转回 'bigint' 后在独立 git worktree 中重跑 e2e，12/12 全部因 SqliteError: AUTOINCREMENT is only allowed on an INTEGER PRIMARY KEY 而失败，证实修复前该问题确实可复现（阻断任何依赖 AppModule 整体启动的 sqlite e2e/本地开发）；改回 'int'（reviewed_head 原状）后 12/12 全绿——双向反例均已验证"
affected_regressions: []
changed_surface_allowed: [backend/**]
```

`full`：按 `profile-round-01.json` 的 `selected_dimensions` 执行 `develop-review.md` 对应 id（contract / scope-and-secrets / test-evidence / comment-hygiene / standards / enforcement / input-provenance / query-performance / concurrency / logging-privacy / maintainability / sensitive-boundaries）。审查员独立执行 `tsc --noEmit`（通过）、`npm run lint`（通过，无告警）、`npm run test -- commission-batch`（2/2 通过）、`npm run test:e2e -- commission-batch.e2e-spec`（12/12 通过），并额外用 `git commit-tree` 从 reviewed_head tree 建立一个不挂载任何分支的临时 detached commit，`git worktree add` 出一个与主工作区完全隔离的副本，在该副本内把 `commission-batch.entity.ts` 的 `PrimaryColumn.type` 改回 `'bigint'` 重跑 e2e 复现执行者所称的 sqlite 报错，验证完毕后 `git worktree remove` 清理，全程未触碰派发者要求保留的主工作区固定 diff。未采信执行者自报的任何叙事。

## 本轮重点核查结论（sensitive 升档原因）

针对 risk-note 指出的 `commission-batch.entity.ts` 主键列 `type: 'bigint'→'int'` 越界改动，逐项独立核实：

1. **migration 硬编码 bigint**：`backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts:35` 内 `commission_batch` 表 `id` 列显式声明 `type: 'bigint', isGenerated: true, generationStrategy: 'increment'`，与 Entity 装饰器改动无关、未被本次 diff 触碰——独立读取确认为真。
2. **mysql 分支 synchronize:false**：`backend/src/config/typeorm.config.ts` 第 27 行，`dbType === 'mysql'` 分支返回对象 `synchronize: false`（sqlite 分支第 34 行为 `synchronize: true`）——独立读取确认为真。
3. **其余 5 个新表实体的主键 type**：`grep -rn "PrimaryColumn" --include=*.entity.ts` 全库结果显示 `import-file.entity.ts`、`export-record.entity.ts`、`commission-tier.entity.ts`、`commission-tier-change-log.entity.ts`、`sales-fill-log.entity.ts`（以及既有的 `policy-record.entity.ts`）的 `PrimaryColumn` 均为 `type: 'int'`——本次改动是"对齐既有多数模式"，不是"引入新的不一致"；反而修复前的 `commission_batch.entity.ts`（`'bigint'`）才是当时唯一的离群写法。
4. **numericIdTransformer 对 'int'/'bigint' 的运行时行为**：读取 `common/transformers/numeric-id.transformer.ts` 源码，`to`/`from` 两个钩子函数体完全不读取、不依赖 TypeORM 传入的 `type` 参数，只对驱动返回值做 `String(value)` 序列化；`type` 参数只影响 TypeORM 生成建表 DDL 时选择的列物理类型，不改变该 transformer 在 JS 层的任何行为。且 `commission-batch.entity.spec.ts`（属 ic-v1-001 既有文件，本次 diff 未改动——已用 `git diff reviewed_base reviewed_head -- 该文件` 确认为空）的文档注释早已独立记载"bigint 主键 + generated:increment 在 sqlite 驱动下用 synchronize:true 建表会报错"这一限制，并为此专门改用 `synchronize:false` + 手写 SQL 建表来规避——这是与本次改动完全独立的、来自更早任务的旁证。
5. **独立复现实验（本轮新增证据）**：在隔离 worktree 中把 `type` 改回 `'bigint'`，`npm run test:e2e -- commission-batch.e2e-spec` 12 个用例全部失败，日志确认报错为 `SqliteError: AUTOINCREMENT is only allowed on an INTEGER PRIMARY KEY`，与执行者所述报错文字完全一致；改回 `'int'`（即 reviewed_head 原状）后同一命令 12/12 全绿。

**结论**：执行者的原因说明与影响面声明均已独立证实为真，非"看似合理"。该装饰器 `type` 值在当前代码路径下确实不可达生产环境（mysql 分支 synchronize 恒为 false，DDL 完全由 migration 独立控制，与 Entity 装饰器解耦），且该值也不影响 JS 侧任何运行时行为（transformer 不读取该参数）。此改动是必要且已验证安全的越界修复，唯一遗留问题是它超出了任务包 `files:` 声明清单——risk-note 已就地记录并升档，未被隐瞒，判定为 advisory 级 scope-gap（见 F001），不构成阻断。

## Findings

```yaml
findings:
  - id: ic-v1-002-F001
    dimension: sensitive-boundaries
    severity: advisory
    type: scope-gap
    reachability: unreachable
    evidence: "commission-batch.entity.ts 不在任务包 files: 清单内却被修改（PrimaryColumn.type 'bigint'→'int'）；已独立核实（见上节 1-5）：migration 硬编码 bigint 建表、mysql 分支 synchronize:false、其余 5 个新表实体主键 type 均已是 'int'、numericIdTransformer 不读取 type 参数、独立 worktree 双向反例复现（bigint→12/12 失败于 SqliteError AUTOINCREMENT，int→12/12 通过）"
    impact: "对生产 MySQL schema 无任何影响（DDL 完全由 migration 控制）；对 JS 运行时行为无任何影响（transformer 序列化逻辑不依赖该参数）；唯一影响是让 sqlite synchronize 建表与全量 e2e/本地开发得以跑通，且顺带消除了 commission_batch 曾是 6 个新表实体中唯一 'bigint' 离群写法的不一致"
    action: backlog
    status: verified-closed
  - id: ic-v1-002-F002
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: "commission-batch.entity.ts:18 注释含「（ic-v1-002 修复）」、create-commission-batch.dto.ts:5 注释含「（ic-v1-002 任务包）」，均在运行时注释中点名任务号，与 ic-v1-001-F003 同类问题（该轮已判违反'运行时注释不留任务号'规则，advisory/backlog）"
    impact: "不影响当前行为，长期可维护性略有损耗（读者需查 sprint.md 理解任务号含义）；与 ic-v1-001-F003 同根问题在后续任务包中反复出现，值得团队层面提醒"
    action: backlog
    status: open
```

- `contract`: 无发现。POST/GET(list)/GET(:id)/PATCH(status) 四条 AC 的 oracle（1001/1004 错误码、分页信封、created_at 倒序、状态切换无副作用）均由 `test/commission-batch.e2e-spec.ts` 的 12 个用例逐条覆盖，且经独立重跑全部通过；example 与 oracle 一致，无冲突。
- `scope-and-secrets`: 无新增发现（entity.ts 越界改动已在 F001/风险升档中处理）；diff 内无明文密钥/token/密码；改动文件与 profile `changed_files` 逐一比对一致，无隐藏改动。
- `test-evidence`: 无发现。`commission-batch.entity.spec.ts` 2/2、`commission-batch.e2e-spec.ts` 12/12 独立重跑全绿；`tsc --noEmit`、`npm run lint` 均通过；测试对 oracle 有辨别力（如排序用例显式写入不同 `createdAt` 断言相对顺序而非依赖真实创建耗时，避免 flaky）。
- `comment-hygiene`: 见 F002。
- `standards`:
  - BE-LAYER-01：Controller（`commission-batch.controller.ts`）只做参数接收转发，业务逻辑全在 Service，未直接操作 Repository——符合。
  - BE-LAYER-02：全局 `grep -rn "@Controller"` 核对，`api/commission-batches` 前缀与既有 `auth`、`policy-records` 无冲突，无静默遮蔽风险。
  - BE-VALID-01：`CreateCommissionBatchDto`（`@IsString`+`@IsNotEmpty`）、`UpdateCommissionBatchStatusDto`（`@IsString`+`@IsIn`）均有完整 class-validator 装饰器，无漏装饰器字段。
  - BE-TEST-01：单测/e2e 文件位置与命名（`*.entity.spec.ts` 同目录、`test/*.e2e-spec.ts`）、运行命令均符合约定。
  - SH-API-01：Controller 未手动包装响应，交由全局 `SuccessInterceptor`；e2e 断言 `{code, msg, data}` 信封结构。
  - SH-API-02：`NotFoundException` → 404 → `AllExceptionsFilter.mapStatusToCode` → 1004；`ValidationPipe` 400 → 1001，均已由 e2e 验证命中正确错误码。
  - SH-AUTH-01：Controller 未标 `@Public()`，走全局 Guard 默认受保护；e2e 首个用例验证未登录访问返回 401/1002。
  - 无发现。
- `enforcement`: 无发现。新增 e2e 对四个接口的正反例均有区分度（合法值通过、非法值/不存在 id 均命中对应错误码），且本轮独立复现实验证明测试基础设施（AppModule 全量启动 + sqlite synchronize）确实会在底层约束被破坏时整体翻红（fail-closed），不是形同虚设的探针。
- `input-provenance`:
  - DTO 1：`backend/src/commission-batch/dto/create-commission-batch.dto.ts` class `CreateCommissionBatchDto`，字段数 N=1
    - `name` | `commission-batch.service.ts:24 name: dto.name` | 否，未覆盖，原样写入 | 正常
  - DTO 2：`backend/src/commission-batch/dto/update-commission-batch-status.dto.ts` class `UpdateCommissionBatchStatusDto`，字段数 N=1
    - `status` | `commission-batch.service.ts:56 batch.status = dto.status` | 否，未覆盖，原样写入 | 正常
  - DTO 3（本任务 GET 列表接口复用的既有公共 DTO）：`backend/src/common/dto/page-query.dto.ts` class `PageQueryDto`，字段数 N=2
    - `page` | `commission-batch.service.ts:31 const { page, pageSize } = query` 用于 `skip` 计算与响应体 `page` 回填 | 否，未覆盖（缺省值来自 DTO 装饰器默认值，非 service 覆盖） | 正常
    - `pageSize` | 同上 `:31`，用于 `take` 与响应体 `pageSize` 回填 | 否 | 正常
  - 覆盖率自证：3 个 DTO 文件，共 4 个可提交字段（N=1+1+2=4），本表共 4 行，行数=N，枚举完成。全部结论为「正常」，无 finding。
- `query-performance`: 无发现。`findPage` 用 `findAndCount` 一次性查询 + `skip/take` 分页，无循环查询、无 N+1、无分页后补查。
- `concurrency`: 无发现。`create`/`updateStatus` 均为单行写入，无唯一约束竞争场景（name 允许重复，do-not 明确排除）；`updateStatus` 为 findOne→save 的读改写，未加锁——但 do-not 明确禁止为状态切换附加锁定/前置条件，当前实现未违反该边界，末次写入生效的竞争结果与 oracle（纯字段更新、无副作用）不冲突。
- `logging-privacy`: 无发现。本次 diff 未新增任何日志输出语句，无凭据/PII/跨租户数据落日志的路径。
- `maintainability`: 无发现。`commission-batch.service.ts` 的 `findPage` 与既有 `policy-record.service.ts` 的 `findPage` 写法（`findAndCount` + `PageResultDto`）风格完全一致，未重造已有分页机制；Controller 结构对齐 `policy-record.controller.ts` 范本。
- `sensitive-boundaries`: 见 F001（本轮重点核查）；无其他新增高危面（无权限分层变更、无不可逆数据操作、无金额/计费逻辑、无外部副作用）。

## 处理说明

- F001：核实结论已写入本报告「本轮重点核查结论」一节，判定越界改动确认安全、不影响生产 schema、不引入运行时行为差异；记入项目根 `backlog.md`（[欠账]）建议后续把 `commission-batch.entity.ts` 补录进 `iterations/v1/queue/ic-v1-002.md` 的 `files:` 清单以对齐实际改动范围（纯文档性，不影响代码），不阻塞本次合并。verified-closed。
- F002：记入 `backlog.md`（[欠账]），与 ic-v1-001-F003 同根问题，建议团队层面在下一轮 develop 会话启动前重申"运行时注释不留任务号"约定；不阻塞本次合并。
- 无 `fix-code`/`fix-mechanism` 级 blocking finding，`conclusion: pass`，进入末端。
