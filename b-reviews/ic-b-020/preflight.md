---
task_id: ic-b-020
source: bug
timing: before-code
started_at: 2026-09-01T02:33:03Z
completed_at: 2026-09-01T02:33:30Z
base_ref: 99f51a446aa37a46c2eb86b8935b89a4bba13b8c
base_tree: f81ad88e9fdd45a3c487c893ae3f170cc8d739bd
result: pass
spec_minutes: 1
---

## 核对结果

| 面 | 证据锚 | 结论 |
|---|---|---|
| files / reference | `frontend/src/components/PolicyRecordTable.vue` §`handleStartFill()`（L344-393）、L196 `defineEmits`、L436/L467 既有 emit 调用；`frontend/src/views/BatchDetailView.vue` §L27、L119-121。写包与本次 preflight 相隔数分钟，同会话内直接读代码产出任务包，无中间提交 | current |
| upstream mechanism / contract | `sales-name-changed` 事件类型与 `handleSalesNameChanged()` → `commissionSummaryRef.value?.refresh()` 链路未变 | current |
| intent / oracle / example | AC 的 oracle 基于当前代码行号与结构撰写，可按当前代码复算 | current |
| do-not / escalate-if / owner | 无跨任务依赖 | current |
| supersedes / retirement | `supersedes: []`，N/A | N/A |

## 路由

```yaml
findings: []
```
