---
task_id: ic-b-003
round: 2
mode: full
risk: sensitive
review_profile: b-reviews/ic-b-003/profile-round-02.json
prior_report: b-reviews/ic-b-003/round-01.md
target_finding_ids: []
base_ref: 159fc610229c772b07ae9c952d0675db6f6d3ec7
reviewed_base: 70605df535a1055fb56a39fc4a8e681d5330a11b
reviewed_head: 497233e252a4cfca07b0ce92122f926b6fdff6ed
diff_sha256: d4020f461b2a3e93afff6110e5fc2d9086ef6dbc6fe65571602a74af6849202d
changed_files:
  - backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts
started_at: 2026-08-28T09:08:40Z
completed_at: 2026-08-28T09:24:15Z
elapsed_minutes: 16
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts:504-518 — 新增 assertNoDuplicatesForRevert() 用 GROUP BY ... HAVING COUNT(*)>1 检测重复值；在空表/单行表/全部不同值场景下人工推演该 SQL 均返回空结果集，不误报（policy_no/work_order_no 建表时均未标 isNullable，NOT NULL，NULL 分组导致误判的边界不可达）"
  - "down() 顶部（:267-272）确认两次 assertNoDuplicatesForRevert 调用先于第一条 dropTable('export_record',...)（:276）执行，检测失败时 down() 在做任何 DDL 之前即 throw，F001 描述的『半回滚状态』路径被切断"
  - "TOCTOU 反例：assertNoDuplicatesForRevert 检查与 revertPolicyRecordV1Shape 里实际的 dropColumns/createIndex 之间存在时间窗口，若另一条并发连接在检查通过后、ADD UNIQUE INDEX 执行前对 policy_record 插入了重复 policy_no/work_order_no，仍会遇到 F001 描述的同一失败模式——已记为新 finding ic-b-003-F003（conditional，advisory）"
affected_regressions:
  - "backend/test/commission-report.e2e-spec.ts:353 golden AC-15 用例失败（旧 OSS key 断言 'exports/{id}/'，实际为改造后的 'bill/export/YYYY/YYYYMM/YYYYMMDD/...' 路径），与 known-risks 记录的 ic-b-001 遗留问题一致，非本次改动引入"
changed_surface_allowed:
  - "down() 顶部新增两行 assertNoDuplicatesForRevert 调用 + 说明注释"
  - "新增私有方法 assertNoDuplicatesForRevert(queryRunner, columnName: 'policy_no' | 'work_order_no')"
  - "顶部 import 移除已不再使用的 TableUnique（round-01 遗留改动，未被本轮回退）"
```

- `full`：因改动面新增一个方法（不只是 round-01 的 API 替换），按派发指示以 full 模式重跑 `review_profile.selected_dimensions`（全部 13 个）。
- 已核对：`git diff 70605df535a1055fb56a39fc4a8e681d5330a11b 497233e252a4cfca07b0ce92122f926b6fdff6ed -- backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts` 的 sha256 = `d4020f461b2a3e93afff6110e5fc2d9086ef6dbc6fe65571602a74af6849202d`，与派发参数逐字符一致；对同一对 tree 跑不带路径限制的 `git diff --stat` 确认全仓只有这一个文件变化（1 file changed, 28 insertions(+), 5 deletions(-)），do-not 边界（不改 up()、不碰 e2e 断言、不写入真实凭据）均未被触碰（`grep -n "123456\|172.22.224\|password\|PASSWORD"` 对 diff 文本零命中；`up()` 方法体、`commission-report.e2e-spec.ts` 均不在改动范围内）。

## 逐维度记录

1. **contract**：intent（修复 down() 在真实 MySQL 上无法干净回滚）本轮进一步强化——不仅替换了不受支持的 API（round-01），还新增 fail-fast 前置校验直接堵住 F001 描述的反例。oracle 两条路径（空库/已有 V0 表）逻辑未变，新增校验只在存在重复值时才会阻断，正常路径（无重复值）行为与 round-01 一致，不影响 oracle 判定。见 F001 verified-closed、F003（新发现的窄反例）。
2. **scope-and-secrets**：diff 仍只涉及该一个文件；`up()`、`commission-report.e2e-spec.ts` 未被触碰；diff 文本中未发现任何明文凭据/host/token。无发现。
3. **test-evidence**：`assertNoDuplicatesForRevert` 与 `revertPolicyRecordV1Shape` 一样缺乏自动化测试覆盖（`grep -rn "assertNoDuplicatesForRevert" backend/test backend/src` 除定义/调用处外无命中）；根因与 F002 相同（sqlite 测试路径 synchronize:true 不跑 migration，mysql-only CLI 路径无 CI 覆盖），已并入 F002 evidence 更新，不另开 id。见 F002（保持 open/backlog）。
4. **comment-hygiene**：新增注释（down() 顶部三行说明为何要在 DDL 前做校验）解释的是"为什么这么写"的技术前提（MySQL 不支持事务性 DDL），不是任务号/迭代号考古，符合"新增禁止性描述须写成立前提"的要求（明确点出"V1 允许 policy_no/work_order_no 重复"这一前提）。无发现。
5. **standards**：任务包 `relevant-standards: []`，无命中规则。无发现。
6. **enforcement**：本任务不改动任何规则/检查器/测试基础设施本身；新增的是业务逻辑内的运行时前置校验，不属于本维度审查对象。无发现。
7. **design-fidelity**：纯 backend migration 改动，无前端/设计面。无发现。
8. **input-provenance**：fixed diff 内无 DTO/controller/service 入参面；`assertNoDuplicatesForRevert` 的 `columnName` 参数不是前端可提交字段，而是 down() 内部硬编码传入的两个字面量常量，不适用本维度枚举对象。DTO 可提交字段数 N=0，本表行数 0，覆盖率闭合。无发现。
9. **query-performance**：新增的 `SELECT ... GROUP BY ... HAVING COUNT(*) > 1 LIMIT 1` 是 migration:revert 执行期间的一次性扫描（非请求期路径），且 `LIMIT 1` 已避免拉取全部重复组，`policy_record` 表规模在迁移场景下可控。无 N+1/fan-out。无发现。
10. **concurrency**：已构造反例见 F003（TOCTOU 窗口：检查通过后、DROP/ADD UNIQUE INDEX 执行前的并发插入仍可导致同一失败模式），已记为新增 conditional finding，非本轮新引入的 100% 必然失败缺陷，而是把"必然失败"收窄为"窄并发窗口内才可能失败"的显著改善。
11. **logging-privacy**：新增 Error message 包含具体重复值（如 `policy_no` 的实际业务值），会在抛出后经由调用方（TypeORM CLI / migration runner）向终端/日志输出；`policy_no`/`work_order_no` 是业务单据号，不属于个人敏感信息（姓名/手机号/身份证等 PII）范畴，且该错误只会在真实运维人员手动执行 `migration:revert` 时于其本地终端触发，不进入生产请求日志或跨租户可见的持久化日志。风险可接受，不构成 finding；供参考记录。
12. **maintainability**：新方法职责单一、与文件内既有 `dropExistingUniqueIndex`（同样是"运行时探测数据库实际状态"的辅助私有方法）风格一致，未见重复实现。列名通过字面量联合类型限定为两个硬编码值，未过度设计成任意列名的通用工具（避免了不必要的抽象扩张）。无发现。
13. **sensitive-boundaries**：见 F001（verified-closed）与新发现 F003（open，advisory，conditional）。

## 分维度详细验证证据（针对派发方重点关注的 4 点）

- **SQL 注入面**：`assertNoDuplicatesForRevert(queryRunner: QueryRunner, columnName: 'policy_no' | 'work_order_no')` —— 参数类型是字面量联合类型，TypeScript 编译期只允许传入这两个字符串字面量，`tsc`/`nest build` 已验证通过（见下方证据）；down() 内仅有的两处调用点（:271-272）均直接传字面量 `'policy_no'`/`'work_order_no'`，非本 diff 范围内无第三方调用该私有方法。字符串是通过模板字面量反引号拼进 SQL（`` `SELECT \`${columnName}\` ...` ``），但因类型系统排除了非枚举值输入，注入面已被静态类型系统封死，不构成 SQL 注入风险。
- **逻辑正确性**：`SELECT \`col\` AS value, COUNT(*) AS count FROM \`policy_record\` GROUP BY \`col\` HAVING COUNT(*) > 1 LIMIT 1` 是标准 SQL 重复检测写法。空表→GROUP BY 无分组→空结果集；单行表→每个分组恰好 1 行，不满足 `COUNT(*)>1`→空结果集；全部值互不相同→每个分组恰好 1 行→空结果集。三种场景均正确返回空结果、不误报。`policy_no`/`work_order_no` 建表定义（:302-313 附近）均未设 `isNullable: true`，即 NOT NULL 列，NULL 值可能导致的"多个 NULL 被误判为重复"边界在当前 schema 下不可达。
- **位置正确性**：已在文件读取中逐行核对，两次 `assertNoDuplicatesForRevert` 调用位于 `down()` 方法体最开头（:271-272），先于 `dropTable('export_record', ...)`（:276）等全部破坏性 DDL；一旦检测到重复值即 throw，此时尚未对数据库做任何改动，不存在"检测失败但已删了几张表"的半回滚状态。位置正确。
- **错误信息质量**：`` `无法回滚：policy_record.${columnName} 存在重复值 "${duplicates[0].value}"（V1 明确允许该列重复，回滚需要恢复唯一索引）。请先人工核对/清理重复数据后再执行 migration:revert。` `` —— 包含哪一列、具体哪个重复值、为什么会失败（V1 允许重复但回滚要唯一索引，二者冲突）、下一步该怎么做（人工核对/清理后再 revert），信息完整，运维人员据此可直接定位问题，不是裸 SQL 报错。质量达标。
- **F001 论证是否站得住**：本次修复没有、也不可能让 MySQL 支持事务性 DDL；论证的核心是把"重复值检测"从"最后一步、且已执行过其他 DDL"移到"第一步、任何 DDL 之前"，从而使得"检测到冲突"这条路径不再依赖事务回滚也能保证零副作用——这个论证成立，因为 JS 单线程执行 + await 顺序保证了 down() 方法体内检查早于任何 `dropTable`/`dropForeignKey`/`dropColumns` 调用。**但存在一个论证未覆盖的反例**：检查本身只保证"检查那一刻"表内无重复值，不保证"检查之后到 ADD UNIQUE INDEX 真正执行之间"表内始终无重复值——如果 migration:revert 执行期间恰好有另一个数据库连接（例如仍在运行的应用进程、或另一个人工操作）在检查通过后插入了重复 policy_no/work_order_no，则后续的 `createIndex(isUnique:true)` 仍会遇到 F001 原本描述的失败，且此时前面的 dropForeignKey/dropIndex/dropColumns 已经执行，同样会停在半回滚状态。这是一个真实存在但需要精确时机的并发反例，记为 F003（conditional，advisory）。

## 编译/测试证据

- `cd backend && npm run build`：通过，无 TypeScript 编译错误（`columnName: 'policy_no' | 'work_order_no'` 字面量联合类型检查通过，间接印证类型限制在编译期生效）。
- `cd backend && npm run lint`：通过（`eslint --fix`），运行后 `git status --porcelain` 未额外产生对被审文件的修改。
- `cd backend && npm run test:e2e`：`Test Suites: 1 failed, 5 passed, 6 total`；`Tests: 1 failed, 94 passed, 95 total`。唯一失败用例为 `test/commission-report.e2e-spec.ts:353`（golden AC-15，断言 `ossUploadMock.mock.calls[0][1]` 包含 `exports/{id}/`，实际收到改造后的 `bill/export/2026/202608/20260828/...` 路径），与任务包 `known-risks` 第二条描述的 ic-b-001 遗留旧 OSS key 格式问题完全一致，失败数（1）、失败用例名与描述一致，非本次改动引入的新失败。

## Findings

```yaml
findings:
  - id: ic-b-003-F001
    dimension: sensitive-boundaries
    severity: blocking
    type: evidence-gap
    reachability: conditional
    evidence: >
      round-01 记录的反例：down() 修复后用 createIndex(isUnique:true) 在 policy_no/work_order_no 上重建
      唯一索引，若表中已存在 TRD 授权的合法重复值，ADD UNIQUE INDEX 会失败，且因 MySQL 不支持事务性 DDL，
      会停在此前已执行的 DROP 之后的半回滚状态。本轮修复在 down() 方法体最开头（1787735505276-...ts:271-272）
      新增两次 assertNoDuplicatesForRevert() 调用，先于文件内第一条破坏性 DDL（:276 的 dropTable('export_record')）
      执行；该方法用 GROUP BY...HAVING COUNT(*)>1 检测重复值，检测到重复即在做任何表改动之前 throw Error 并中止
      整个 down()。已逐行核对调用顺序、SQL 空表/单行/全不同值场景下的正确性（均不误报）、错误信息内容（含列名/
      具体重复值/原因/下一步建议），以及 columnName 参数受字面量联合类型限制、无 SQL 注入面（详见本轮报告
      "分维度详细验证证据"节）。这条反例路径（半回滚状态、无提示信息、依赖事务回滚兜底）已被本次修复堵住：
      检测失败时数据库处于与 revert 前完全一致的状态，不存在半途改动。
    impact: >
      已消除——检测到重复值时 down() 在任何 DDL 之前即失败退出，不产生半回滚状态；运维人员会收到明确的
      错误信息（列名+具体重复值+处理建议），而不是遭遇隐蔽的 schema 损坏。
    action: fix-code
    status: verified-closed
  - id: ic-b-003-F002
    dimension: test-evidence
    severity: advisory
    type: evidence-gap
    reachability: current
    evidence: >
      round-01 记录：全仓无任何自动化测试覆盖 down()（sqlite 测试路径 synchronize:true 不走 migration，
      mysql-only CLI 路径不进 CI）。本轮新增的 assertNoDuplicatesForRevert() 私有方法同样未被覆盖
      （grep -rn "assertNoDuplicatesForRevert" backend/test backend/src 除定义处 :504 与调用处 :271-272 外
      无其他命中），根因与 F002 完全相同，未构成新的独立缺陷，故不另开 id，直接在此 id 下补充证据。
    impact: >
      当前无回归风险（本次新增逻辑已通过 build/lint 全绿人工验证，且是 fail-fast 纯前置判断，逻辑简单），
      但该 down() 分支（含新增校验）今后若被误改仍无自动化防线拦截，只能靠人工 real-MySQL 验证兜底。
    action: backlog
    status: open
  - id: ic-b-003-F003
    dimension: concurrency
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: >
      assertNoDuplicatesForRevert() 的检查与 revertPolicyRecordV1Shape() 内实际的 dropColumns/createIndex
      之间存在一段真实的时间窗口（中间还要执行 dropForeignKey ×2、dropIndex ×3 等多条 DDL）。若在
      migration:revert 执行期间，另一条数据库连接（例如仍在运行的应用进程或另一名操作者）在
      assertNoDuplicatesForRevert 检查通过之后、对应列的 ADD UNIQUE INDEX 真正执行之前，向 policy_record
      插入了新的重复 policy_no/work_order_no 行，则 createIndex(isUnique:true) 仍会遇到 F001 原本描述的
      Duplicate entry 失败，且此时 dropForeignKey/dropIndex/dropColumns 均已执行完毕，会停在与 F001 完全
      相同的半回滚状态。这是一个真实存在的 TOCTOU 反例，但触发窗口窄（需要精确时机的并发写入，且
      migration:revert 通常在维护窗口内、应用已下线或只读的场景下执行），不是"任意时候执行都会必然复现"
      的确定性缺陷。
    impact: >
      unknown（未在真实并发写入场景下实测；若生产运维流程未强制要求 revert 期间停止写流量，这条窗口
      理论上可复现半回滚状态，概率随窗口内写入量与并发度上升）
    action: backlog
    status: open
```
