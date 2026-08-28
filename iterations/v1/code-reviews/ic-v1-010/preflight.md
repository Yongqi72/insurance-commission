<!-- develop freshness preflight 留痕模板；A/B 共用。只记当前核对结果，不写开发过程叙事。 -->
---
task_id: ic-v1-010
source: sprint
timing: before-code
started_at: 2026-08-28T03:08:00Z
completed_at: 2026-08-28T03:10:00Z
base_ref: 65ec00d2b28501c6d6c38c0b15a28219b65049e3
base_tree: d9601c7230932222117bc7669e5197fe91c33d2a
result: pass
spec_minutes: 2
---

## 核对结果

| 面 | 证据锚 | 结论 |
|---|---|---|
| files / reference | `PolicyRecordTable.vue`/`PolicyRecordHistoryDrawer.vue` 待新建；`BatchDetailView.vue` 的 `#policy-record-panel-mount` 挂载点存在（ic-v1-009 已交付）；`commission-batch.ts`/`policy-record.ts` 均存在，`PolicyRecord` 接口尚无 `premiumAmount`/`salesFillSource` 字段，与任务包描述一致 | current |
| upstream mechanism / contract | `GET/POST .../policy-records`（`policy-record-query.controller.ts`）、`PATCH/GET /api/policy-records/:id/...`（`policy-record.controller.ts`）均实测存在，路径与任务包 oracle 一致；`SalesFillSource = 'unmatched' \| 'system' \| 'manual'`（`policy-record.entity.ts:12`）与任务包 AC-07 三态筛选值逐字一致，known-risks 提示的对齐风险未命中 | current |
| intent / oracle / example | AC-05~AC-09 引用的接口路径、错误码、字段名均可在当前后端代码定位，无漂移 | current |
| do-not / escalate-if / owner | 未见冲突；不新增路由/导航的约束与当前路由现状一致 | current |
| supersedes / retirement | supersedes: [] | N/A |

## 路由

```yaml
findings: []
```
