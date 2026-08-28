<!-- develop freshness preflight 留痕模板；A/B 共用。只记当前核对结果，不写开发过程叙事。 -->
---
task_id: ic-b-003
source: bug
timing: retroactive
started_at: 2026-08-28T08:59:23Z
completed_at: 2026-08-28T09:01:00Z
base_ref: 159fc610229c772b07ae9c952d0675db6f6d3ec7
base_tree: 70605df535a1055fb56a39fc4a8e681d5330a11b
result: pass
spec_minutes: 2
---

## 核对结果（retroactive 说明）

本任务的代码修复（`createUniqueConstraint` → `createIndex({isUnique:true})`）是在
backlog 迁移验证欠账（真实 MySQL 首次实测）过程中当场发现 bug 并当场修复的，
先有修复后补的任务包，故本 preflight 为 retroactive（事后核对），如实标注，不伪装成写代码前已过。

| 面 | 证据锚 | 结论 |
|---|---|---|
| files / reference | 唯一改动文件 `1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts` 存在，改动位置（`revertPolicyRecordV1Shape()`）与任务包描述一致 | current |
| upstream mechanism / contract | 改动不涉及任何上游服务/接口契约，纯 migration 内部 DDL 语句 API 替换 | N/A |
| intent / oracle / example | AC 描述的两条上游路径（空库/已有 V0 表）均已用真实 MySQL 8.0.36 实测验证，过程见 known-risks | current |
| do-not / escalate-if / owner | 未见冲突 | current |
| supersedes / retirement | supersedes: [] | N/A |

## 路由

```yaml
findings: []
```
