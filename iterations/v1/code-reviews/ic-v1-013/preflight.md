<!-- develop freshness preflight 留痕模板；A/B 共用。只记当前核对结果，不写开发过程叙事。 -->
---
task_id: ic-v1-013
source: sprint
timing: before-code
started_at: 2026-08-28T05:17:00Z
completed_at: 2026-08-28T05:19:00Z
base_ref: 74f0cd97c3aac17d4d6dfd2237e0f5ed4cc5cdbd
base_tree: 29e8d95dc8071308ff9e634a5c372516a841e481
result: pass
spec_minutes: 2
---

## 核对结果

| 面 | 证据锚 | 结论 |
|---|---|---|
| files / reference | `BatchDetailView.vue`/`ImportPanel.vue`/`PolicyRecordTable.vue`/`CommissionSummaryPanel.vue` 均存在；实测确认 `ImportPanel.vue` 目前仅 `handleDeleteImport` 分支 emit `records-changed`，`handleStartImport` 未 emit；`PolicyRecordTable.vue`/`CommissionSummaryPanel.vue` 均无 `defineExpose`；`BatchDetailView.vue` 的 `<ImportPanel :batch-id="batchId" />` 未绑定任何事件监听——与任务包 description/context 描述的当前状态完全一致，无漂移 | current |
| upstream mechanism / contract | 本包不新增/不调用任何后端接口，纯前端组件间事件桥接 | N/A |
| intent / oracle / example | 3 条 AC 引用的函数名（`handleSaveSalesName`/`handleStartImport`/`handleDeleteImport`/`loadData`/`loadSummary`）均可在当前代码定位，无漂移 | current |
| do-not / escalate-if / owner | 未见冲突；不引入 Pinia/全局状态的约束与当前项目现状（仅 auth store）一致 | current |
| supersedes / retirement | supersedes: [] | N/A |

## 路由

```yaml
findings: []
```
