---
task_id: ic-b-003
round: 1
mode: full
risk: sensitive
review_profile: b-reviews/ic-b-003/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 159fc610229c772b07ae9c952d0675db6f6d3ec7
reviewed_base: 70605df535a1055fb56a39fc4a8e681d5330a11b
reviewed_head: 19e6d16a1d079e1ee3f41e12bef65e8f386b372c
diff_sha256: 888a652968ddef90742d7b32817be5f71300faa54619b364253c38a06fa7dba6
changed_files:
  - backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts
started_at: 2026-08-28T09:01:29Z
completed_at: 2026-08-28T09:05:20Z
elapsed_minutes: 4
escalate_to_full: false
conclusion: evidence-needed
---

## 本轮范围

```yaml
counterexamples:
  - "node_modules/typeorm/driver/mysql/MysqlQueryRunner.js:1240-1242 — createUniqueConstraint 在 mysql 驱动上无条件 throw TypeORMError('MySql does not support unique constraints. Use unique index instead.')，实测确认任务包描述的 bug 成因属实（修复前 down() 必然在此步骤失败）"
  - "iterations/v1/trd.md:26-27 明确授权 work_order_no/policy_no 在 V1 允许重复（'真实数据中同一工作单号可对应多条保单'）；revertPolicyRecordV1Shape() 修复后用 createIndex(isUnique:true) 试图在这两列上恢复唯一索引——若届时表中已存在符合 TRD 预期的重复值，MySQL 的 ALTER TABLE ... ADD UNIQUE INDEX 会报重复键错误而失败，与 up() 的 API 是否正确无关（即便 createUniqueConstraint 本身受支持也会遇到同样的重复键失败），任务包 example 只用 1 条种子数据验证，未覆盖这一 TRD 明确授权的真实数据形态"
affected_regressions: []
changed_surface_allowed:
  - "down() 内 revertPolicyRecordV1Shape(): queryRunner.createUniqueConstraint(...TableUnique) → queryRunner.createIndex(...TableIndex({isUnique:true}))，对象名/columnNames 不变"
  - "顶部 import 移除已不再使用的 TableUnique"
```

- `full`：按 `review_profile.selected_dimensions`（全部 13 个，因 `metadata_incomplete` fail-safe 全选）逐项执行。
- 已核对：`git diff 70605df535a1 19e6d16a1d0` 整棵 tree 只涉及本文件（`git diff --stat` 1 file changed, 6 insertions(+), 5 deletions(-)）；对该文件单独 diff 的 sha256 = `888a652968ddef90742d7b32817be5f71300faa54619b364253c38a06fa7dba6`，与派发参数给定值完全一致；`git show <reviewed_base>` / `git show <reviewed_head>` 逐行核对，改动恰好落在 down() 的 API 替换 + 顶部 import 清理两处 hunk，其余字节级不变；工作区当前该文件内容与 `reviewed_head` 版本逐字节 diff 为空。

## 逐维度记录

1. **contract**：intent（修复 down() 在真实 MySQL 上无法回滚）已实现——`createUniqueConstraint`+`TableUnique` 替换为 `createIndex`+`TableIndex({isUnique:true})`，与 up() 里其余索引创建风格一致；经查 `node_modules/typeorm/driver/mysql/MysqlQueryRunner.js:1240-1242` 确认修复前 API 在 mysql 驱动上必然 throw，修复思路成立。oracle 要求的两条路径（空库 / 已有 V0 表）已由任务执行者在真实 MySQL 上人工验证通过（见 test-evidence 维度的证据缺口记录，不在此重复扣分）。但 oracle/example 的验证场景（1 条种子数据、无重复值）未覆盖 TRD 明确授权的「policy_no/work_order_no 可重复」真实数据形态，见 F001（归类到 sensitive-boundaries，因为它是不可逆 schema 回滚的安全边界问题而非本次 diff 引入的行为偏差）。
2. **scope-and-secrets**：diff 未触碰 up()、未涉及 `commission-report.e2e-spec.ts`；未新增超出 `files` 清单的改动；未发现任何明文 host/账号/密码/token（`context` 中提到的真实 MySQL 凭据未出现在任何跟踪文件里，`git grep -n "123456\|172.22.224"` 未在本次改动范围内命中）。无发现。
3. **test-evidence**：见 F002（evidence-gap，无自动化测试覆盖 down()，advisory）。
4. **comment-hygiene**：本次 diff 未新增/改动任何注释（两处 hunk 均为纯代码替换与 import 删除，`revertPolicyRecordV1Shape` 上方既有 JSDoc 未被触碰）。无发现。
5. **standards**：任务包 `relevant-standards: []`，无命中规则可审。无发现。
6. **enforcement**：本任务不改动任何规则/检查器/测试基础设施。无发现。
7. **design-fidelity**：纯 backend migration 文件改动，无前端/设计面。无发现。
8. **input-provenance**：fixed diff 内无 DTO、无 controller/service 入参面；本任务改动范围内 DTO 可提交字段数 N=0，本表行数 0，覆盖率闭合。无发现。
9. **query-performance**：migration 的索引创建/删除是一次性 DDL，非请求期查询路径，无 N+1/fan-out 面。无发现。
10. **concurrency**：已构造反例见 F001（迁移执行期间/执行前如存在重复 policy_no/work_order_no，`ADD UNIQUE INDEX` 会失败），但该风险是「向已放宽约束的表重新收紧唯一性」这一操作本身固有的（即便 up() 用的 API 完全受支持也会遇到同样失败），并非本次 diff 从「总是 100% 失败」变为「总是成功」时新引入的并发缺陷，本次只是把它从 F001 描述的角度记录为 sensitive-boundaries 证据缺口，不在此重复计数。
11. **logging-privacy**：本文件不产生任何运行时日志，diff 不涉及日志语句。无发现。
12. **maintainability**：替换后的 `createIndex` 调用与文件内其余索引创建代码风格完全一致，未见重复实现或不必要复杂度；`TableUnique` import 清理正确（不再被引用）。无发现。
13. **sensitive-boundaries**：见 F001（evidence-gap，阻断，request-evidence）。

## Findings

```yaml
findings:
  - id: ic-b-003-F001
    dimension: sensitive-boundaries
    severity: blocking
    type: evidence-gap
    reachability: conditional
    evidence: >
      iterations/v1/trd.md:26-27 明确授权 policy_record.work_order_no/policy_no 在 V1 允许重复
      （"真实数据中同一工作单号可对应多条保单"），这是 V1 上线后预期会出现的正常数据形态，不是边缘假设。
      修复后的 revertPolicyRecordV1Shape()（1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts:480-495）
      用 queryRunner.createIndex(..., new TableIndex({ isUnique: true })) 试图在这两列上重新加唯一索引；
      MySQL 对 ALTER TABLE ... ADD UNIQUE INDEX 在列值存在重复时会直接报 Duplicate entry 错误并失败，这是
      MySQL 的确定性行为，与本次替换的 API（createUniqueConstraint vs createIndex）无关——即便原来的
      createUniqueConstraint 在 mysql 驱动上受支持，遇到同样的重复数据也会同样失败。任务包 acceptance-criteria
      的 example（"含 1 条种子数据"）与 known-risks 记录的实测过程均只验证了单行、无重复值的库，未覆盖
      TRD 明确授权、长期使用后大概率出现的重复 policy_no/work_order_no 场景。结合 context 中记录的
      "MySQL 不支持事务性 DDL、DDL 各自隐式提交" 已知风险，若在这种真实数据状态下运行 migration:revert，
      会在 dropColumns 之后、createIndex 抛错之前停在半回滚状态（3 个新列已删、FK/普通索引已删，但唯一
      索引恢复失败），与本任务 AC 的 intent "干净回滚，不留半途失败的 schema" 直接冲突。
    impact: >
      unknown（未在含重复 policy_no/work_order_no 的真实 MySQL 数据集上实测 migration:revert；一旦生产库
      已经积累 TRD 授权的重复数据后执行 revert，可达路径下会抛 Duplicate entry 错误并把 policy_record 留在
      半回滚状态，需要人工介入修复，且此前的实测（1 条种子数据）不能覆盖这一后果）
    action: request-evidence
    status: open
  - id: ic-b-003-F002
    dimension: test-evidence
    severity: advisory
    type: evidence-gap
    reachability: current
    evidence: >
      backend/test/ 与 backend/src/ 全仓搜索（grep "1787735505276|CreateCommissionTablesAndAlterPolicyRecord|
      revertPolicyRecordV1Shape"）未找到任何测试文件覆盖本 migration 的 down() 方法；backend/src/config/
      typeorm.config.ts:39 确认自动化测试（sqlite 分支）走 synchronize:true，不执行任何 migration 文件，
      backend/src/config/data-source.ts:17 确认 migration CLI 用的 DataSource type 为 'mysql'，两者路径完全
      不相交——这解释了为何此前该 bug 一直未被 CI 发现，也意味着本次修复之后，若未来再有人改动
      revertPolicyRecordV1Shape() 或误用其他 mysql 驱动不支持的 API，同样不会被现有自动化测试拦截，
      只能等到下一次人工连真实 MySQL 验证时才会暴露。
    impact: >
      当前无回归风险（本次修复本身已通过任务执行者的人工真实 MySQL 验证），但该 down() 逻辑今后对
      mysql-only API 误用/行为回归没有任何自动化防线，只能靠人工 real-MySQL 验证兜底
    action: backlog
    status: open
```
