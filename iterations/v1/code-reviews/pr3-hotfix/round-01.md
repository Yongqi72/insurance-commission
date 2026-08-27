---
task_id: pr3-hotfix
round: 1
mode: full
risk: sensitive
base_ref: 5ef8bdaa5d2c286299ec5f0e21261a64421ea3bb
reviewed_base: 5ef8bdaa5d2c286299ec5f0e21261a64421ea3bb
reviewed_head: a61e6709c6c349504d1f52c9221ca661eb50efdb
diff_sha256: 26072955583b925a828e0b2530bfd850ec073711ed4c2a9d224d8fa16b9dbee2
changed_files:
  - backend/src/commission-tier/commission-tier.service.ts
  - backend/src/commission-batch/policy-record-query.service.ts
  - backend/test/commission-tier.e2e-spec.ts
  - backend/test/commission-batch-policy-records.e2e-spec.ts
started_at: 2026-08-26T22:25:00Z
completed_at: 2026-08-26T23:03:00Z
elapsed_minutes: 38
escalate_to_full: false
conclusion: pass
---

## 本轮范围

已推送 Gitee PR #3（ic-v1-002~005 批次实现）上，独立 `/code-review` 发现的 2 个 correctness bug 的修复验证轮，非常规 develop per-task 审查，按 sensitive risk 同等严格度独立核实：不采信执行者自评，自己独立读 TypeORM 源码确认修复前提、自己独立跑测试、自己独立重新构造更贴近生产的复现场景。

`reviewed_head`（a61e6709...）为暂存区 tree 对象（本轮固定 diff 已 `git add`，未 commit），`git diff <base_ref> <reviewed_head>` 可直接对 commit 与 tree 求 diff，取值符合预期（177 行，4 文件，+112/-16）。

## Bug 1：`assertBoundsOrdered` null/undefined 判断

**独立验证结论：verified-closed。**

1. 读 `backend/src/commission-tier/commission-tier.service.ts:234-242`：修复后 `dto.upperBound !== undefined && dto.upperBound !== null && dto.lowerBound >= dto.upperBound`，短路顺序正确——`null`/`undefined` 均在到达 `>=` 比较前被排除，不会再被 JS 隐式转换成 0 参与比较。
2. 独立在隔离 worktree（见下）里把该方法还原为修复前版本（`dto.upperBound !== undefined && dto.lowerBound >= dto.upperBound`），保留修复后新增的 e2e 用例重跑：新用例（`upperBound: null` 显式传）确定性失败，返回 400 而非期望的 201——证明该用例对本缺陷有真实区分度，不是巧合通过。修复后代码重跑同一用例通过（201，`upperBound` 落库为 `null`，见 `backend/test/commission-tier.e2e-spec.ts:164-173` 的独立重跑输出）。
3. `upperBound=0` 这类 falsy-but-legal 边界值：`0 !== undefined && 0 !== null` 均为 `true`，不会被误判提前跳过；后续 `lowerBound >= 0` 的比较行为未变，与修复前一致，未引入新问题。
4. 排查同类判断点：`assertNoConflict`（`:252` `dto.upperBound ?? Infinity`）与 `create`/`update`（`:113`/`:148` `dto.upperBound ?? null`）均使用 `??`（仅对 `null`/`undefined` 生效，不受 `0` 影响），本身语义已正确，此前不受这个 bug 影响；全文 `grep upperBound` 未发现其余漏判点，本次修复未遗漏同类逻辑。

## Bug 2：`fill()` 与 `deleteImport()` 并发下外键违反

**独立验证结论：verified-closed（根因层面），但发现测试环境本身存在一个值得记录的 gap（非阻断，见下）。**

1. **TypeORM `update()` 语义**：直接读已安装版本源码（`typeorm@1.1.0`，`node_modules/typeorm/entity-manager/EntityManager.js:443-468`）：`Repository.update()`/`EntityManager.update()` 注释明确写着 "Executes fast and efficient UPDATE query. Does not check if entity exist in the database."，内部固定走 `createQueryBuilder().update(target).set(...).where(...)`，只会生成纯 `UPDATE ... WHERE`，不存在"找不到就退化成 INSERT"的路径（`upsert` 是另一个独立方法 `UpsertOptions.js`，`update()` 完全不触碰）。确认修复的前提成立。
2. **`Promise.allSettled` 隔离**：`policy-record-query.service.ts:111-127` 每条记录各自 `update()` 独立 await、包进各自的 async 函数，`allSettled` 保证一条 reject 不影响其余 promise 继续 settle，也不会让整体请求抛出未处理异常（rejected 分支单独 catch 并记录日志，按未命中处理）。核实正确。
3. **响应契约（AC-06）**：`total` 取自回填开始时刻查到的 `unmatchedRecords.length`（含即将被并发删除的那条），`matchedCount` 只在 `update()` 实际 `affected>0` 时才计数，被并发删除的记录 `affected===0` 归入 `total-matchedCount`（即 unmatchedCount），不会被误计成 matched——语义合理，未发现明显不合理之处。
4. **是否有遗漏的"假设记录必然存在"之处**：通读 `fill()` 全函数，`update()` 调用前后均未再对该记录做二次读取或访问任何懒加载关联；`sales_fill_log`（人工补录审计表）只在 `policy-record.service.ts`（人工补录接口）里写入，`fill()`（第三方批量回填）这条路径本来就不写审计日志，本次改动未新增该类遗漏。
5. **独立跑测**（均为本次独立执行，非采信执行者数值）：
   - `npx tsc --noEmit`：0 错误
   - `npm run lint`：`eslint --fix` 后 `git status`/`git diff --stat` 均无变化，0 告警
   - `npm run test:e2e -- commission-tier.e2e-spec`：27/27 通过
   - `npm run test:e2e -- commission-batch-policy-records.e2e-spec`：15/15 通过
   - `npm run test:e2e` 全量回归：5 个测试文件、**78/78 通过**
6. **测试区分度验证（隔离 worktree，参照 ic-v1-005 那轮做法）**：`git worktree add` 到 `base_ref`（纯净 pre-fix 代码），软链接现有 `node_modules`，把修复后的两个测试文件复制进去重跑：
   - Bug 1 新用例：pre-fix 下确定性失败（400 vs 期望 201）——区分度成立。
   - Bug 2 新用例：pre-fix 下**同样失败**，但失败形态与代码注释描述的"外键约束异常导致整个请求 500"不同——实际返回 201，`matchedCount:2/unmatchedCount:0`（本该被并发删除的记录被 `save()` **静默复活**并计成 matched），而不是抛异常。区分度依然成立（pre-fix 失败、post-fix 通过），但不是通过"复现 500"来证明，而是通过"复现数据被错误复活/错误计数"证明。
7. **深挖：为什么 pre-fix 没有触发 FK 异常，反而是静默复活**：额外独立写了一份更贴近生产的复现脚本（`fk-repro.e2e-spec.ts`，验证后已删除，未留痕于工作区），不用测试用例里简化的"只删 policy_record 本身"，而是完整复刻 `import.service.ts#deleteImport()` 的真实级联路径（同一事务内先 `delete(PolicyRecord, {importFileId})` 再 `delete(ImportFile, {id})`，且记录预先设置了真实存在的 `import_file_id`）。开 TypeORM `logging:true` 观察实际 SQL：pre-fix 下 `save()` 对已删除行确实退化成 `INSERT INTO policy_record(... import_file_id ...) VALUES (..., '1', ...)`（`import_file_id` 指向一个此时已被删除的 `import_file.id=1`），但这条 INSERT **并未报外键错误**，请求仍 201。
   根因：`PolicyRecord` 实体（`policy-record.entity.ts`）里 `import_file_id`/`import_batch_id` 都是普通 `@Column`，并未用 `@ManyToOne`/`@JoinColumn` 声明关系；e2e 测试库走 `synchronize: true`（`typeorm.config.ts:39`）按实体元数据自动建表，没有关系装饰器就不会生成任何 `FOREIGN KEY` 约束——`CREATE TABLE "policy_record" (...)` 的实际 SQL 里确认无 FK 子句。代码注释里提到的 `ON DELETE RESTRICT` 外键只存在于 `src/migrations/1787735505276-...ts` 的原生 SQL 里，只对生产 MySQL（走 migration）生效，对 sqlite 测试库（走 `synchronize`）不生效。
   用同一份 `fk-repro` 脚本对 post-fix 代码重跑：`matchedCount:0/unmatchedCount:1`，正确地把并发删除的记录判定为未命中，不会静默复活。
   **结论**：这是当前仓库测试基础设施的一个既有、非本次改动引入的盲区（sqlite `synchronize:true` 建表不带 FK 约束，只有 MySQL 生产库经 migration 才有），导致"外键异常导致 500"这个具体症状在本仓 e2e 环境里**无法被真实复现**，本次新增的 e2e 用例实际验证的是同一根因的另一个可观测症状（记录被静默复活+错误计数），且该症状在 pre-fix 下确定性出现、post-fix 下确定性消失，区分度是真实的，不是巧合。代码层面的修复（改用 `update()`）从原理上对两种症状（生产 MySQL 下的 FK 异常、sqlite 下的静默复活）都成立，因为它从根本上避免了"对已被物理删除的行调用 entity-based `save()`"这条路径，不依赖某个具体数据库的 FK 是否生效。
   该发现记为一条非阻断的记录性 finding（PF001），供后续参考，不影响本轮 pass 结论。

## Findings

```yaml
findings:
  - id: pr3-hotfix-F001
    dimension: test-evidence
    severity: 提示
    type: test-environment-gap
    reachability: n/a
    evidence: "PolicyRecord 实体（backend/src/policy-record/policy-record.entity.ts）的 import_file_id/import_batch_id 均为普通 @Column，未用 @ManyToOne/@JoinColumn 声明关系；e2e 测试库走 synchronize:true 按实体元数据建表，不会生成 FOREIGN KEY 约束（已用 TypeORM logging 观测实际 CREATE TABLE 语句确认无 FK 子句）。代码注释描述的 import_file_id ON DELETE RESTRICT 外键只存在于 src/migrations/1787735505276-...ts 的原生迁移 SQL 中，仅对走 migration 的 MySQL 生产库生效"
    impact: "该 PR 声称修复的具体症状之一（fill() 并发下 save() 退化成 INSERT 触发外键异常导致整个请求 500）在本仓当前 e2e 测试环境（sqlite + synchronize）下无法被真实复现和验证——独立复现脚本证实 pre-fix 下该场景实际表现为记录被静默复活并错误计入 matchedCount，而非抛异常。这是测试基础设施的既有 gap（非本次改动引入，e2e 全套测试库均受影响），不影响本次修复本身的正确性（update() 从原理上同时避免了 FK 异常与静默复活两种症状），但意味着"生产 MySQL 下 FK 异常确实被堵住"这一具体断言目前只能靠读 TypeORM 源码语义 + 迁移 SQL 静态推导，缺乏可执行的端到端证据"
    action: none
    status: open
```

- `contract`：两处修复均对应 PR #3 独立 code-review 报告里描述的具体 bug 症状与建议方案，未偏离；新增 e2e 用例的断言点（201/upperBound=null 落库、201/matchedCount=1/unmatchedCount=1 且幸存记录正确回填）与 bug 描述的期望行为一致。
- `test-evidence`：见 Findings PF001；除该记录性 gap 外，两个新增用例均独立验证过对 pre-fix/post-fix 有真实区分度（隔离 worktree 重跑），非空断言、非同义反复。
- `standards`：未见新增违反 BE-EXT-01（第三方返回值仍先做 `typeof`/`trim` 校验）、BE-LOG-01（`allSettled` 的 reject 分支走 `this.logger.error` 记录，未裸吞）。
- `concurrency`：`Promise.allSettled` 用法正确，各记录更新互不阻塞、互不影响彼此结果；未引入新的竞态窗口。
- `maintainability`：新增注释准确描述了根因与修复动机，未见夸大或误导性表述；两处改动均局部、未扩散到声明外的文件。
- 无其他发现。

## 处理说明

- PF001 为提示级记录性发现（test-environment-gap），不构成 revise 理由：修复本身的正确性已通过读 TypeORM 源码 + 静态迁移 SQL 独立确认，且用替代症状（静默复活/错误计数）证明了新增用例的区分度是真实的。是否要为 sqlite 测试库补上关系装饰器/显式外键约束以便将来能真实复现 FK 类缺陷，留给项目后续视优先级决定，本轮不阻断合并。
- `conclusion: pass`。
