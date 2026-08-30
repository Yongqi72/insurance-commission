---
task_id: ic-mt-001
round: 2
mode: targeted
risk: standard
review_profile: iterations/v1/code-reviews/ic-mt-001/profile-round-01.json
prior_report: iterations/v1/code-reviews/ic-mt-001/round-01.md
target_finding_ids: [ic-mt-001-F001, ic-mt-001-F002, ic-mt-001-F003]
base_ref: 6cdcc22dac084eaad6d3448ec5480ee4400d9509
reviewed_base: def3ec01ab5d6d8edd88768a2569301506bc541a
reviewed_head: d7453bb6bdd7fb38c65c865be44dfbd060070a55
diff_sha256: f14e5405759a27962e43f46b45e3c95705f17e16c3e701403903d543c0072ad9
changed_files:
  - backend/src/policy-record/policy-record.entity.spec.ts
  - backlog.md
started_at: 2026-08-30T06:02:13Z
completed_at: 2026-08-30T06:07:50Z
elapsed_minutes: 6
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples: []
affected_regressions: []
changed_surface_allowed:
  - backend/src/policy-record/policy-record.entity.spec.ts
  - backlog.md
```

先核对增量边界：`git write-tree`（本轮固定的暂存区）= `d7453bb6bdd7fb38c65c865be44dfbd060070a55`，与派发的 `current_reviewed_tree` 逐位一致；`git diff def3ec01ab5d6d8edd88768a2569301506bc541a d7453bb6bdd7fb38c65c865be44dfbd060070a55 | sha256sum` = `f14e5405...0072ad9`，与派发的 `diff_sha256` 逐位一致。实际改动只有 `policy-record.entity.spec.ts`（+78/-4）与 `backlog.md`（1 处文件名替换），未越出 round-01 允许的整改范围；`git status` 里另外两处 `M`（`policy-record.entity.ts`、`sales-fill-log.entity.spec.ts`）经核对是 round-01 就已固化进 `previous_reviewed_tree` 的既有改动，本轮未再触碰（两文件不在增量 diff 里）。未发现 changed surface 越界，不升 full。

### ic-mt-001-F002（enforcement，负例测试）

`policy-record.entity.spec.ts` 新增两条用例：`importBatchId 引用不存在的 CommissionBatch id 时被 FK 约束拒绝`、`importFileId 引用不存在的 ImportFile id 时被 FK 约束拒绝`，均用 `repo.save(...)` + `expect(...).rejects.toThrow(/FOREIGN KEY/i)`。

- 实测：`npx jest policy-record.entity.spec.ts` 7/7 通过（原 4 条 + 本轮新增 3 条）。
- 判别力验证：临时把 `policy-record.entity.ts` 里两处 `@ManyToOne`/`@JoinColumn` 装饰器连同关系属性整块注释掉（保留列定义不变），重跑该 spec：两条新负例用例应声变红——`Received promise resolved instead of rejected`（`save()` 因为没有真实 FK 约束而正常落库，`rejects.toThrow()` 断言失败），其余 5 条（含 F001 的不泄漏用例）保持绿。验证后 `git checkout -- backend/src/policy-record/policy-record.entity.ts` 还原，`git write-tree` 复核仍为 `d7453bb6bdd7fb38c65c865be44dfbd060070a55`，与改前逐位一致，无残留。
- 结论：两条负例测试是真探针，不是摆设，会在 FK 约束被移除时真实翻红。**verified-closed**。

### ic-mt-001-F001（不泄漏进响应）

`policy-record.entity.spec.ts` 新增用例 `查询结果不显式 relations 时，commissionBatch/importFile 不作为 own property 出现（不泄漏进响应序列化）`：先落一条无关系数据的 `PolicyRecord`，`findOneByOrFail` 查回后：
1. 断言 `Object.prototype.hasOwnProperty.call(found, 'commissionBatch')` 与 `'importFile'` 均为 `false`（覆盖了 round-01 finding 里点名的"是否作为 own property 出现"）；
2. 额外对 `JSON.parse(JSON.stringify(found))` 结果重复同样两条断言（覆盖了 round-01 finding 里点名的"是否也验证 JSON.stringify 序列化路径"）。

两点均在 diff 里字面存在，且该用例本身随 F002 的判别力验证一起被独立跑过一次（移除关系装饰器场景下该用例本就该继续为 true——关系属性不存在，`hasOwnProperty` 自然仍为 `false`，属于正常表现而非探针失效，与预期一致）。round-01 指出的"没有能在未来误加 `relations:[...]`" 场景在当前测试口径下无法反向构造（因为要让它翻红需要真的加 `relations:[...]` 或全局 `ClassSerializerInterceptor` 之后再验证测试是否变红，超出本轮"核已交付内容"的范围），但这属于测试本身的固有局限，不是本轮改动的缺陷；round-01 finding 明确要求的两条断言（own property + JSON.stringify）均已如实沉淀。**verified-closed**。

### ic-mt-001-F003（文档引用修正）

- `backlog.md`：`node_modules/typeorm/driver/better-sqlite3/BetterSqlite3DataSource.js` → `BetterSqlite3Driver.js`。
- `policy-record.entity.spec.ts` 注释：`TypeORM AbstractSqliteDriver 固定行为` → `TypeORM BetterSqlite3Driver.createDatabaseConnection() 固定行为，见该类源码`。

实测核对 `backend/node_modules/typeorm/driver/better-sqlite3/`：目录下确实是 `BetterSqlite3Driver.js`（无 `BetterSqlite3DataSource.js` 这个文件——`BetterSqlite3DataSourceOptions.js` 是另一个仅管选项类型的文件，不要混淆）；`grep -n "createDatabaseConnection"` 命中该文件第 87 行 `async createDatabaseConnection()`；`grep -n "foreign_keys"` 命中第 110 行 `databaseConnection.pragma("foreign_keys = ON")`；`grep -n "class BetterSqlite3Driver"` 确认类名为 `BetterSqlite3Driver`（继承自 `AbstractSqliteDriver`，二者并非同一个类）。两处修正后的引用均与源码实指一致，无新的失实。**verified-closed**。

## 回归证据

- `npx jest policy-record.entity.spec.ts`：7/7 通过。
- `npm run build`：无输出，成功。
- `npm run lint`：无输出，成功。
- `npm run test`：13 suites / 56 tests 全绿（较 round-01 的 53 增加 3，与本轮新增 3 条用例一致）。
- `npm run test:e2e`：6 suites / 104 tests 全绿，与 round-01 数字一致，未受影响。

## Findings

```yaml
findings:
  - id: ic-mt-001-F001
    dimension: test-evidence
    severity: advisory
    type: scope-gap
    reachability: current
    evidence: >-
      backend/src/policy-record/policy-record.entity.spec.ts 新增用例
      "查询结果不显式 relations 时，commissionBatch/importFile 不作为 own
      property 出现（不泄漏进响应序列化）"，同时断言 hasOwnProperty 与
      JSON.parse(JSON.stringify(...)) 两条路径均不含这两个 key，字面满足
      round-01 finding 要求。
    impact: 已沉淀为回归探针，未来误删 nullable/onDelete 等配置不影响此用例判断力；oracle 有测试兜底。
    action: fix-code
    status: verified-closed
  - id: ic-mt-001-F002
    dimension: enforcement
    severity: advisory
    type: scope-gap
    reachability: current
    evidence: >-
      新增两条负例用例对 importBatchId/importFileId 分别引用不存在 id，断言
      rejects.toThrow(/FOREIGN KEY/i)；本轮独立验证：临时移除
      policy-record.entity.ts 的 @ManyToOne/@JoinColumn 后重跑，两条用例均
      从绿转红（Received promise resolved instead of rejected），其余 5
      条不受影响，验证后已用 git checkout 还原且 git write-tree 复核与
      current_reviewed_tree 逐位一致。
    impact: 探针真实具备判别力，非摆设；后续误删关系装饰器或误改 onDelete 语义会被此测试捕获。
    action: fix-code
    status: verified-closed
  - id: ic-mt-001-F003
    dimension: comment-hygiene
    severity: advisory
    type: example-error
    reachability: unreachable
    evidence: >-
      backlog.md 与 policy-record.entity.spec.ts 注释均已把文件名/类名改为
      BetterSqlite3Driver.js / BetterSqlite3Driver.createDatabaseConnection()；
      本轮实测 grep node_modules/typeorm/driver/better-sqlite3/ 确认文件名、
      createDatabaseConnection() 行号（87）、pragma 调用行号（110）、类名
      均与修正后的引用一致，无第三处遗留错误引用。
    impact: 文档引用与源码实指一致，不再有考古式错误指称。
    action: revise-doc
    status: verified-closed
```
