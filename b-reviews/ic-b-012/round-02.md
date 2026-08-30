---
task_id: ic-b-012
round: 2
mode: targeted
risk: standard
review_profile: b-reviews/ic-b-012/profile-round-01.json
prior_report: b-reviews/ic-b-012/round-01.md
target_finding_ids: [ic-b-012-F001]
base_ref: c2c6bea78b7a91c803ede8895121c49781730a10
reviewed_base: a868283721380ebab39cef39797ce02b8449a642
reviewed_head: 7b1abe6e76d4edb01a16355e91103fb4d3ef00c8
diff_sha256: f69c52f0d0c4ea2ca2494e228c9b2e8e73571244d6e37ae8fc9acfaef0fa7a86
changed_files:
  - frontend/src/components/PolicyRecordTable.vue
started_at: 2026-08-30T08:41:39Z
completed_at: 2026-08-30T08:43:00Z
elapsed_minutes: 2
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "复核 round 1 反例：打开批次 A（未匹配 5 条）详情页 → 提示显示『⚠ 有 5 条未获取到销售记录』→
     地址栏把 URL 从 /commission-batches/A 改成 /commission-batches/B（未匹配 0 条），或书签/外链
     直接跳转 → 同一路由记录、组件不重新挂载 → 核实 watch(() => props.batchId, ...) 是否现在同时
     触发 loadUnmatchedCount()，使工具栏提示随 batchId 切换同步刷新，不再停留在批次 A 的旧值。"
affected_regressions:
  - "本轮增量是否在 watch 回调之外引入新的调用路径/时序问题（如与 onMounted 重复触发、与 refresh()
     冲突、请求乱序覆盖）——重点核查改动没有放大 round 1 已记录的 F003（无请求序号保护）之外的新问题。"
changed_surface_allowed:
  - frontend/src/components/PolicyRecordTable.vue
```

- `git diff a868283721380ebab39cef39797ce02b8449a642 7b1abe6e76d4edb01a16355e91103fb4d3ef00c8` 的 sha256
  经核对与派发者给定 `diff_sha256` 一致（`f69c52f0d0c4ea2ca2494e228c9b2e8e73571244d6e37ae8fc9acfaef0fa7a86`）。
- 增量 diff 确认只有一行改动：`frontend/src/components/PolicyRecordTable.vue` 第 415-423 行的既有
  `watch(() => props.batchId, ...)` 回调体内新增一行 `loadUnmatchedCount()`（紧跟既有 `loadData()` 之后），
  无其它文件、无其它行改动，`1 file changed, 1 insertion(+)`。
- `git status --porcelain` 除本任务改动文件外，仅有与本任务无关的会话产物
  （`_meta/sessions/*.md`、`_meta/input/*.Zone.Identifier`、`b-reviews/ic-b-012/`），未见越界改动。
- `changed_files` 与本轮派发给出的清单完全一致，仅 `PolicyRecordTable.vue` 一个文件——changed surface
  未扩张，不触发 `escalate_to_full`。

### 自跑校验

- `npm run build`（vue-tsc -b && vite build）：通过，无类型错误（仅既有的 chunk 体积告警，与本次改动无关）。
- `npm run lint:check`（eslint + 路由结构校验）：通过。
- `npm run stylelint:check`：通过，无告警。

## F001 复核

独立读取当前 `frontend/src/components/PolicyRecordTable.vue:415-423`：

```
watch(
  () => props.batchId,
  () => {
    page.value = 1
    resetExpandState()
    loadData()
    loadUnmatchedCount()
  },
)
```

逐点核实（不采信执行方自评，自行走查代码）：

1. **位置正确**：新增调用落在 `props.batchId` 的 `watch` 回调体内，与 `loadData()` 并列，是 round 1 反例
   指认的唯一缺口位置——不是加在别处、也不是加在无关的另一个 watch/生命周期钩子里。
2. **每次 batchId 变化都会触发**：该 `watch` 未传 `{ immediate: true }`，语义与改动前一致——只在
   `props.batchId` 变化时触发，不影响 `onMounted`（`PolicyRecordTable.vue:425-428`，本身已含
   `loadData()` + `loadUnmatchedCount()`）覆盖的首次挂载路径；两者合起来覆盖了"首次挂载"与"挂载后
   batchId 原地切换"两种场景，未重叠也未遗漏。
3. **`loadUnmatchedCount()` 读的是新值**：函数体（`PolicyRecordTable.vue:251-262`）内部直接读
   `props.batchId`（未通过参数传入旧闭包值）；Vue 的 `watch` getter `() => props.batchId` 在回调触发前
   已求值为新 batchId，回调体执行时 `props.batchId` 已经是新值，因此 `fetchBatchPolicyRecords(props.batchId, ...)`
   会打给新批次，不会用旧批次 id 查询。
4. **复现 round 1 反例场景**：批次 A→B 地址栏直切（同路由记录、`BatchDetailView.vue` 未给
   `<PolicyRecordTable>` 绑 `:key`，组件不重新挂载，此前提未变）→ `watch` 触发 → `loadData()` 把主表格
   切到批次 B 数据 → 新增的 `loadUnmatchedCount()` 同步把 `unmatchedCount.value` 更新为批次 B 的真实
   未匹配总量（示例场景为 0）→ `v-if="unmatchedCount > 0"`（模板既有条件，未改动）让提示随之隐藏，
   不再停留在批次 A 的『⚠ 有 5 条未获取到销售记录』。反例路径被实际闭合。
5. **回归面检查**：改动只新增一行函数调用，未新增变量、未改 `loadUnmatchedCount()` 本身、未碰
   `handleStartFill()`/`refresh()`/其余 `handlePageChange`/`handleFilterChange`/`scheduleSearch`/
   `handleSearchClear` 等其它调用点——round 1 已确认这些筛选/搜索/分页路径本就不应触碰
   `loadUnmatchedCount()`，本轮增量未破坏这条隔离。唯一新增的执行路径是"batchId 变化时多发一次
   `fetchBatchPolicyRecords(..., pageSize:1)`"，与 `onMounted`/`refresh()` 已有的同款调用同构，未引入
   新的网络调用模式或新的乱序风险类别——`watch` 触发的 `loadUnmatchedCount()` 与同一 tick 内的
   `loadData()` 之间仍无请求序号保护，但这与 round 1 已记录的 F003（onMounted vs handleStartFill 之间
   同样无序号保护）是同一根因、同一严重程度，不构成本轮新增的回归，无需另开 finding。

结论：`ic-b-012-F001` 的修复落点精确（同一个、也是唯一需要改的 watch 回调），且实测语义覆盖了 round 1
反例描述的直接切换 batchId 场景，判定为真正修复，非只是"加了个函数调用"的表面改动。

## Findings

```yaml
findings:
  - id: ic-b-012-F001
    dimension: contract
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: |
      修复前：frontend/src/components/PolicyRecordTable.vue:415-422（round 1 时）watch(() => props.batchId, ...)
      回调只调用 loadData()/resetExpandState()，未调用 loadUnmatchedCount()。
      修复后（本轮独立复核，reviewed_head 7b1abe6e）：同一 watch 回调（现 415-423 行）新增
      loadUnmatchedCount() 调用，与 loadData() 并列执行；loadUnmatchedCount() 内部直接读 props.batchId
      （非闭包旧值），watch 触发时该值已是新 batchId。逐行走查 + 追踪 round 1 反例场景（批次 A→B 地址栏
      直切，组件不重挂载）确认 unmatchedCount 会随 batchId 变化同步刷新为新批次真实值，
      v-if="unmatchedCount > 0" 随之正确隐藏/显示提示。
    impact: 工具栏未匹配提示不再在 batchId 原地切换（不重新挂载）场景下停留于旧批次的计数，
      与 oracle "该计数...始终反映整个批次的未匹配总量" 的要求一致。
    action: fix-code
    status: verified-closed
  - id: ic-b-012-F002
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: current
    evidence: |
      frontend/src/components/PolicyRecordTable.vue:251-262（loadUnmatchedCount）与
      frontend/src/components/PolicyRecordTable.vue:316-320（handleStartFill 内 initialUnmatched 查询）
      仍各自内联同一份 `{ page: 1, pageSize: 1, fillStatus: 'unmatched' }` 查询参数字面量，
      本轮增量未改动这两处，重复未消除也未恶化。
    impact: 目前两处行为一致，无功能性问题；后续若其中一处的查询参数被单独改动而漏改另一处，
      两个"未匹配总数"查询会静默产生不一致结果。
    action: backlog
    status: advisory
  - id: ic-b-012-F003
    dimension: concurrency
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: |
      loadUnmatchedCount() 的调用点间（现为 onMounted、watch(batchId)、handleStartFill 的 finally、
      refresh()，本轮新增的 watch 调用点同样未带请求序号/取消保护）仍无 AbortController 或等价机制；
      纯按网络响应到达顺序写 unmatchedCount.value。本轮增量未引入新的保护机制，也未扩大该风险面的
      严重度（新增调用点与既有调用点是同一根因、同一类风险，未单独构成新 finding）。
    impact: 仅在网络异常延迟等非常规条件下，才会出现旧响应覆盖新响应、短暂显示错误计数的情况；
      正常使用路径下概率极低。
    action: backlog
    status: advisory
```
