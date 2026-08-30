---
task_id: ic-mt-001
round: 1
mode: full
risk: standard
review_profile: iterations/v1/code-reviews/ic-mt-001/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 6cdcc22dac084eaad6d3448ec5480ee4400d9509
reviewed_base: 961f3f64a23d9a2eba5be6b7521eab44eca4b378
reviewed_head: def3ec01ab5d6d8edd88768a2569301506bc541a
diff_sha256: b6703110a5df113efa4eadf81f11482e52dc3013dc049689871007ba86e05630
changed_files:
  - backend/src/policy-record/policy-record.entity.ts
  - backend/src/policy-record/policy-record.entity.spec.ts
  - backend/src/policy-record/sales-fill-log.entity.spec.ts
  - backlog.md
started_at: 2026-08-30T05:52:14Z
completed_at: 2026-08-30T05:59:28Z
elapsed_minutes: 8
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples: []
affected_regressions: []
changed_surface_allowed:
  - backend/src/policy-record/policy-record.entity.ts
  - backend/src/policy-record/policy-record.entity.spec.ts
  - backend/src/policy-record/sales-fill-log.entity.spec.ts
  - backlog.md
```

任务包 intent 是"评估能否安全给 PolicyRecord 补 @ManyToOne 关系装饰器，能补则落地，不能补则说明理由"。执行者判断"可以安全落地"并已实现。本轮对该技术判断做独立验证（不采信执行者自评/backlog 叙事），逐项复核 profile 的 11 个 selected dimensions。

**独立验证方法**（均为本轮审查自行构造，不依赖 diff 自带的证据）：
1. 用临时 spec 文件（验证后已删除，未进入 git 状态）分别对 `import_batch_id`、`import_file_id` 各插入一条引用不存在 id 的 `PolicyRecord`，确认 sqlite `:memory:` 沙箱下均抛 `SqliteError: FOREIGN KEY constraint failed`，并查询 `PRAGMA foreign_keys` 确认值为 1。
2. 用临时 spec 文件验证 `findAndCount()`（未传 `relations`）返回的实体对象上 `commissionBatch`/`importFile` 均非 own property，`JSON.parse(JSON.stringify(entity))` 后同样不含这两个 key。
3. 读 `node_modules/typeorm/driver/better-sqlite3/BetterSqlite3Driver.js` 源码，确认 `createDatabaseConnection()` 无条件执行 `databaseConnection.pragma("foreign_keys = ON")`（对 `:memory:` 库同样生效，未见目录判断绕过该行）。
4. 临时把 `sales-fill-log.entity.spec.ts` 还原到 base 版本（只注册 `[PolicyRecord, SalesFillLog]`）单独跑一遍，复现 `TypeORMError: Entity metadata for PolicyRecord#commissionBatch was not found`；验证后已还原为与 `reviewed_head` 逐字节一致（`diff` 确认 `IDENTICAL`）。
5. 全仓 `grep -rn "entities:\s*\["` 确认除本次已改的两个文件外，无第三个独立 DataSource 同时注册 `PolicyRecord` 而漏注册 `CommissionBatch`/`ImportFile`。
6. 全仓 grep 确认无处对 `PolicyRecord`/`CommissionBatch`/`ImportFile` 使用 `relations: [...]`、`leftJoinAndSelect` 或 `ClassSerializerInterceptor`，且所有 e2e 用 `imports: [AppModule]`（非隔离 entities 数组）。
7. 独立跑 `npx jest policy-record.entity.spec.ts sales-fill-log.entity.spec.ts`、`npm run build`、`npm run lint`、`npm run test`、`npm run test:e2e`，均为亲眼所见的当次真实运行结果（非采信执行者转述）。

**结果**：build/lint 无输出（干净），`npm run test` 13 suites / 53 tests 全绿，`npm run test:e2e` 6 suites / 104 tests 全绿——与 backlog.md 条目里给出的数字（53/53、104/104、13 个/6 个 suite）完全一致，未发现夸大或失实。技术判断"可以安全落地"经独立复现成立。

---

### 1. contract — 无发现

三条 AC 中，本次执行者选择的分支是"确认可以安全补 → 落地"（intent 3），intent 2（"不能补"分支的 backlog 收尾）不适用于本次结论方向，不构成缺口。
- intent 1（是否破坏隔离单测）：独立复现验证方法 4，确认破坏点存在且被针对性修复（`sales-fill-log.entity.spec.ts` 补 entities 数组），全量 test/test:e2e 独立跑绿，成立。
- intent 3（可安全落地 + 不改变响应契约）：独立复现验证方法 1/2/3/6，`onDelete: 'RESTRICT'` 与 migration `FK_policy_record_import_batch_id`/`FK_policy_record_import_file_id` 的 `onDelete: 'RESTRICT'`（`backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts:374/381/446/456`）语义一致，未引入 CASCADE；build/lint/test/test:e2e 全绿，成立。

### 2. scope-and-secrets — 无发现

- `do-not` 两条：列名/类型/nullable 均未改（`policy-record.entity.ts` diff 只新增两个 `@ManyToOne`+`@JoinColumn` 属性块，未触碰原 `@Column` 定义）；`onDelete: 'RESTRICT'` 与 migration 语义一致，未新增级联。均未违反。
- `sales-fill-log.entity.spec.ts` 不在任务包 `files:` 清单内，但独立复现验证方法 4 证明：一旦 `PolicyRecord` 声明了指向 `CommissionBatch`/`ImportFile` 的关系，任何独立注册 `PolicyRecord` 而未连带注册这两个关系目标实体的 `:memory:` DataSource 都会在 `initialize()` 阶段硬报错——这是本次实体改动的直接、必然、机械后果，不是随意扩大范围的功能顺带修改，判定为有正当理由（technical necessity）。
- `backlog.md` 不在 `files:` 字面清单，但任务描述本身要求"backlog 条目相应关账"，属于任务边界内的收尾产出，不算越界。
- diff 全文 grep 未发现明文密码/token/私钥/API key（唯一命中的 "token" 关键字出自 backlog.md 一条无关的既有历史条目，指 `crypto.randomUUID()` 生成的随机片段，非凭据）。

### 3. test-evidence — 建议级发现 ic-mt-001-F001

见 Findings。核心行为已被独立验证为真（见上文独立验证方法 1/2），但**diff 自带的测试没有覆盖"验证关系对象不泄漏进响应"这条 AC 明文要求的行为**：现有 e2e 全部用 `expect.objectContaining(...)` 做宽松断言（如 `backend/test/policy-record.e2e-spec.ts:106/125/158`），新增关系属性不会让这些断言变红；`policy-record.entity.spec.ts`/`sales-fill-log.entity.spec.ts` 本次改动也只覆盖了"FK 约束下如何正确落一条真实数据"，未新增任何断言校验 `commissionBatch`/`importFile` 不作为 own property 出现。intent 3 的 oracle 因此目前只靠人工独立验证成立，代码库里没有能在未来回归（如误加 `relations:[...]` 或全局 `ClassSerializerInterceptor`）时自动翻红的探针。

### 4. comment-hygiene — 建议级发现 ic-mt-001-F002

未见任务号/迭代号写入运行时注释（新增注释引用的是 "backlog.md 2026-08-27 条目/2026-08-30 更新"这一业务历史条目，而非 `ic-mt-001` 任务号，边界性可接受，不单独判违规）；但发现两处对 TypeORM 内部源码位置的引用有实指性错误，见 Findings。

### 5. standards — 无发现

- BE-TYPEORM-02（applies-if：新增/修改对应 BIGINT 列的字段）：本次改动的两个 `@Column` 外键列（`importBatchId`/`importFileId`）本身未被触碰，仍是 `string` + `numericIdTransformer`；新增的 `commissionBatch`/`importFile` 是关系对象属性而非标量 BIGINT 字段，不在该规则 applies-if 范围内。无违反。
- SH-API-02（错误码约定）：本次 diff 未新增/修改任何错误抛出或错误码逻辑，规则不适用，现状保持合规。

### 6. enforcement — 建议级发现 ic-mt-001-F003

见 Findings：diff 自带的测试里没有任何一条是"故意构造违规输入，断言其被拒绝"的负向探针——`policy-record.entity.spec.ts` 改动后的用例只是把原来写死的不存在占位 id `'7'` 换成一条真实落库的 `ImportFile.id`，验证的是"合法引用能正常存取"，而不是"非法引用会被 FK 拦截"。本任务的立项动机（backlog 原文）恰恰是"e2e 环境无法真实复现依赖数据库外键约束的并发异常场景"，即需要的正是一个会在违规时翻红的探针；本轮审查用临时测试独立证明了该探针**可以**做到翻红（见独立验证方法 1），但 diff 本身没有把这个探针沉淀下来。

### 7. input-provenance — 无发现（DTO 字段数 = 0，本表行数 = 0，覆盖率自证成立）

本次 diff 未新增/修改任何请求 DTO 文件（`git diff --stat -- '**/*dto*'` 无输出），受影响的两个 controller（`policy-record-query.controller.ts`、`policy-record.controller.ts`）均未改动，穷举表天然为空。

### 8. query-performance — 无发现

全仓 grep 确认无处对 `PolicyRecord` 使用 `relations: [...]` 或 `leftJoinAndSelect`；新增的两个 `@ManyToOne` 均未设 `eager: true`（`policy-record.entity.ts:84/112`），`policy-record-query.service.ts`/`policy-record.service.ts`/`commission-report.service.ts` 里所有 `find`/`findAndCount`/`findOne` 调用均未变更查询形状，不会因本次改动产生新的关系 JOIN 或 N+1。

### 9. concurrency — 无发现

`import.service.ts:181-182` 的 `deleteImport()` 已经是"先删子表 PolicyRecord 再删父表 ImportFile"的正确顺序，不受新增 FK RESTRICT 语义影响；`policy-record-query.service.ts` 的 `fill()` 早已用 `update()` 而非 `save()` 应对"回填过程中记录被并发删除"的场景（见该文件 181-188 行注释），本次改动未触及该逻辑。sqlite 沙箱新增的真实 FK 约束是让测试环境更贴近生产（生产 MySQL FK 已存在且经既有 migration 验证），不构成新引入的并发风险；`npm run test:e2e` 中 `commission-batch-import.e2e-spec.ts` 独立跑绿，删除流程未受影响。

### 10. logging-privacy — 无发现

本次改动只涉及实体关系声明和测试代码，未新增任何日志调用，不涉及日志面。

### 11. maintainability — 无发现

新增的两个 `@ManyToOne`+`@JoinColumn` 代码块结构对称、注释各自独立说明用途，未见重复实现或不必要的复杂度扩张；未发现可复用而未复用的既有机制。

## Findings

```yaml
findings:
  - id: ic-mt-001-F001
    dimension: test-evidence
    severity: advisory
    type: scope-gap
    reachability: current
    evidence: >-
      backend/test/policy-record.e2e-spec.ts:106,125,158 等既有 e2e 断言均用
      expect.objectContaining(...)，新增关系属性不会使其翻红；
      backend/src/policy-record/policy-record.entity.spec.ts 本次改动只新增了
      "合法 importFileId 能正常存取"的用例，没有任何断言校验
      commissionBatch/importFile 不作为 own property 出现在查询结果里——
      本轮审查员独立写临时用例验证过该行为成立（PolicyRecord 返回对象上
      Object.prototype.hasOwnProperty.call(entity,'commissionBatch') 为
      false），但该用例未沉淀进 diff。
    impact: >-
      intent 3 oracle 明文要求的"关系对象不应意外出现在响应 DTO 里"目前只有
      本轮人工独立验证担保；未来若有人误给这两个 @ManyToOne 加上
      eager:true，或给应用加上 ClassSerializerInterceptor 全局拦截器，
      现有测试套件不会捕获这个回归。
    action: fix-code
  - id: ic-mt-001-F002
    dimension: enforcement
    severity: advisory
    type: scope-gap
    reachability: current
    evidence: >-
      backend/src/policy-record/policy-record.entity.spec.ts 改动后的用例
      （"premiumAmount 未提供时可空..."）只验证合法 importFileId 引用能正常
      存取，没有任何用例故意引用一个不存在的 id 断言其被 FK 拒绝。本轮审查
      员独立补的临时探针（对 import_batch_id、import_file_id 分别引用不存在
      id）均能稳定复现 SqliteError: FOREIGN KEY constraint failed，证明这个
      探针本身是可行、会在违规时翻红的，但没有被写进 diff。
    impact: >-
      本任务的立项理由（backlog.md 2026-08-27 条目）就是"e2e 环境无法真实
      复现依赖数据库外键约束的并发异常场景"；关系装饰器落地后这个能力已经
      具备，但没有任何一条测试把它当作正向交付物沉淀下来验证，能力交付了
      却没有回归保护，后续如有人误改 onDelete 语义或误删 @JoinColumn，
      现有测试不会发现。
    action: fix-code
  - id: ic-mt-001-F003
    dimension: comment-hygiene
    severity: advisory
    type: example-error
    reachability: unreachable
    evidence: >-
      backlog.md（本次新增段落）称验证依据是
      "node_modules/typeorm/driver/better-sqlite3/BetterSqlite3DataSource.js
      （createDatabaseConnection()）"；backend/src/policy-record/policy-record.entity.spec.ts
      新增注释称 "TypeORM AbstractSqliteDriver 固定行为"。经本轮审查读源码核实：
      该文件实际是 BetterSqlite3Driver.js（无 BetterSqlite3DataSource.js 这个
      文件），createDatabaseConnection() 定义在 BetterSqlite3Driver 类里而非
      其基类 AbstractSqliteDriver。两处对 TypeORM 内部实现位置的指称均有出入。
    impact: >-
      不影响代码行为——本轮审查独立验证过"better-sqlite3 驱动无条件执行
      pragma('foreign_keys = ON')"这条实质性技术结论是真的成立，只是两处
      文档引用把具体源码文件名/类名写错了，属于纯文档考古式引用不准确，
      不构成行为缺陷。
    action: revise-doc
```
