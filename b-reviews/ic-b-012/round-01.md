---
task_id: ic-b-012
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-012/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: c2c6bea78b7a91c803ede8895121c49781730a10
reviewed_base: 085643962857193f9adb3f366c710b7b2d1e1970
reviewed_head: a868283721380ebab39cef39797ce02b8449a642
diff_sha256: 0719ffaa58a39d5eeb1993aa19ad27806cc963ffc3da217c1f0ac71fbf283a96
changed_files:
  - frontend/src/components/PolicyRecordTable.vue
started_at: 2026-08-30T08:34:56Z
completed_at: 2026-08-30T08:40:00Z
elapsed_minutes: 6
escalate_to_full: false
conclusion: revise
---

## 本轮范围

```yaml
counterexamples:
  - "打开批次 A 详情页（未匹配 5 条），直接在地址栏把 URL 改成批次 B（未匹配 0 条），
     或从其它入口（书签/外部链接）在同一 PolicyRecordTable 实例上把 batchId 从 A 切到 B：
     组件不重新挂载，既有 watch(() => props.batchId, ...) 只调用 loadData()/resetExpandState()，
     不调用 loadUnmatchedCount()；工具栏提示继续显示批次 A 的『⚠ 有 5 条未获取到销售记录』，
     与批次 B 的真实未匹配总量（0）不符，直到用户点『开始回填』或宿主调用 refresh() 为止。"
affected_regressions: []
changed_surface_allowed:
  - frontend/src/components/PolicyRecordTable.vue
```

- `git diff 085643962857193f9adb3f366c710b7b2d1e1970 a868283721380ebab39cef39797ce02b8449a642` 的 sha256
  经核对与派发者给定 `diff_sha256` 一致（0719ffaa58a39d5eeb1993aa19ad27806cc963ffc3da217c1f0ac71fbf283a96）。
- `git status --porcelain` 除本任务改动文件外，仅有与本任务无关的会话产物
  （`_meta/sessions/*.md`、`_meta/input/*.Zone.Identifier`、本轮 `b-reviews/ic-b-012/`），未见其它代码改动越界。
- `changed_files` 与任务包 `files` 完全一致，仅 `frontend/src/components/PolicyRecordTable.vue` 一个文件。

### 自跑校验

- `npm run build`（vue-tsc -b && vite build）：通过，无类型错误。
- `npm run lint:check`（eslint + 路由结构校验）：通过。
- `npm run stylelint:check`：通过，无告警。

## 逐维度结论

**1. contract**：核心行为对齐 oracle——`unmatchedCount` 只在 `onMounted`、宿主 `refresh()`、`handleStartFill()` 的
`finally` 三处触发查询；`v-if="unmatchedCount > 0"` 保证 0 值不展示；文案字面量与 oracle 一致；
`.policy-record-table__filter-wrap` 旁挂载位置正确；`handlePageChange`/`handleFilterChange`/`scheduleSearch`/
`handleSearchClear` 均只调用 `loadData()`，未触碰 `loadUnmatchedCount()`，与筛选/搜索/分页解耦的要求成立。
但存在一处遗漏——见 `ic-b-012-F001`：组件既有的 `watch(() => props.batchId, ...)`（`loadData()` 已在其内做了 batchId
切换时的重新加载，属改动前既有代码）未被这次改动同步接入 `loadUnmatchedCount()`，导致 batchId 原地切换（同一
组件实例复用，不重新挂载）场景下提示计数会串批次。`BatchDetailView.vue` 自身也有对称的
`watch(batchId, () => loadDetail())`，说明"同一路由记录下 `:id` 变化、组件不重新挂载"是本仓库已知会真实发生、
需要显式处理的路径，不是假设性场景。

**2. scope-and-secrets**：diff 只改动 `PolicyRecordTable.vue`，未新增文件、未新增接口/字段（严格复用
`fetchBatchPolicyRecords` 与 `handleStartFill()` 里同一查询手法），未触碰搜索/筛选/分页逻辑本身、
未影响展开编辑/开始回填等既有功能；未见明文密钥/token。无发现。

**3. test-evidence**：前端项目未配置任何单测框架（`package.json` 无 test script，仓库内无
`frontend/**/*.spec.ts`；单测基础设施只存在于 `backend/`），这是项目既有约定而非本任务引入的缺口。
以 `vue-tsc` 类型检查 + `vite build` + eslint + stylelint 全绿，以及本轮对代码路径的逐行人工走查
（含对 `refresh()` 调用方 `BatchDetailView.vue` 的交叉核对）作为等价机械证据。无发现（在项目现有测试
基线下）。

**4. comment-hygiene**：新增注释均为行为/动机说明（如"与 handleStartFill() 内...同一查询手法"、
"静默失败：不影响主表格数据展示..."），未写入任务号/迭代号，未见需要前置条件说明的"禁止 X"表述。无发现。

**5. standards**：任务包 `relevant-standards: []`，无命中规则需要核对。无发现。

**6. enforcement**：本任务不涉及规则/检查器/测试基础设施改动。无发现。

**7. design-fidelity**：`&__unmatched-hint` 复用 `design.md` 已定义的 `$color-warning-bg`(`#FFF3D6`)/
`$color-warning-text`(`#92600A`) 及既有 `$radius-sm`/`$space-xs`/`$space-sm`/`$fs-small` token
（与同文件内既有 `&__fill-tag--unmatched` 使用的是同一对 token），未引入新硬编码色值。
`iterations/v1/prototype.html` 早于本次需求（未匹配提示是 manual-test 验收会话后追加的 B 类需求），
未包含对应元素，无可比对的原型基准。工具栏容器 `flex-wrap: wrap` + `gap: $space-sm`，新 `span` 作为
第三个 flex 子项、`white-space: nowrap`，窄屏下会整体换行而非与筛选框重叠，未见破版风险。无发现。

**8. input-provenance**：本次 diff 未新增/改动任何后端 DTO 或可提交字段，只读复用既有
`GET .../policy-records?page&pageSize&fillStatus` 端点（与 `handleStartFill()` 内既有调用同构），
无新 DTO 字段需要穷举。不适用（无发现）。

**9. query-performance**：`loadUnmatchedCount()` 是单次查询（`pageSize:1`），无循环、无逐项 fan-out、
无分页后补查模式。`handleStartFill()` 的 `finally` 里在已有 `totalUnmatchedAfter`（回填循环内累加得出）
的情况下仍额外发一次网络请求取 `unmatchedCount`，属可优化点但不构成 N+1/fan-out（详见 F002，归入
maintainability 而非本维度）。无发现。

**10. concurrency**：本次 surface 是纯只读查询，无写入/事务/唯一性约束需要核对。但按派发者要求专门核对了
"多个 `loadUnmatchedCount()` 调用是否可能乱序覆盖"：`onMounted` 触发的首次查询与 `handleStartFill()` 完成后
触发的查询之间没有请求序号/取消机制，理论上若首次查询的网络响应异常延迟晚于回填完成后的查询响应到达，
旧值会覆盖新值；但两次调用之间存在因果时序（回填流程本身至少含一次 `triggerSalesFill` 网络往返，通常远慢于
轻量计数查询），正常网络条件下前者几乎必然先于后者完成，实际触发概率低。记为 F003（advisory/future-risk）。

**11. logging-privacy**：无新增日志输出；`catch {}` 静默吞错，不打印/上报任何内容，无 PII/凭据泄露面。无发现。

**12. maintainability**：`loadUnmatchedCount()`（新增，PolicyRecordTable.vue:251-262）与
`handleStartFill()` 里查询 `initialUnmatched` 的那段（PolicyRecordTable.vue:316-320）逐字重复同一份
`{ page: 1, pageSize: 1, fillStatus: 'unmatched' }` 查询参数字面量，两处各自维护一份。记为 F002
（advisory，建议抽成一个共享 helper，例如 `fetchUnmatchedTotal(batchId)`，被两处复用）。

**13. sensitive-boundaries**：`effective_risk: standard`，本次改动无权限/认证/数据隔离/不可逆操作/金额计费
相关 surface，纯 UI 只读提示。无发现。

## Findings

```yaml
findings:
  - id: ic-b-012-F001
    dimension: contract
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: |
      frontend/src/components/PolicyRecordTable.vue:415-422（既有、非本次新增）：
        watch(() => props.batchId, () => { page.value = 1; resetExpandState(); loadData() })
      本次新增的 loadUnmatchedCount()（同文件 251-262 行）未被接入这个 watch。
      BatchDetailView.vue 中 <PolicyRecordTable :batch-id="batchId" .../> 没有 :key 绑定
      （frontend/src/views/BatchDetailView.vue:23-27），而 batchId 是响应式的
      `computed(() => route.params.id as string)`（BatchDetailView.vue:59）；
      路由表里 commission-batches/:id 是单个路由记录（frontend/src/router/index.ts:35-39），
      按 vue-router 默认行为，仅 :id 变化、同路由记录时组件实例被复用、不重新挂载
      （BatchDetailView.vue 自身对称地有 watch(batchId, () => loadDetail())，
      证明这条路径在本仓库是被认可、需要显式处理的真实场景，不是假设）。
      反例：打开批次 A（未匹配 5 条）详情页 → 提示显示"⚠ 有 5 条未获取到销售记录" →
      在地址栏把 URL 从 /commission-batches/A 改成 /commission-batches/B（未匹配 0 条，或书签/外链
      直接跳转）→ PolicyRecordTable 实例不重挂载，onMounted 不再触发，
      watch(batchId) 只调 loadData()（主表格数据正确切到批次 B）→ unmatchedCount 仍停留在批次 A 的
      旧值 5，提示继续显示"⚠ 有 5 条未获取到销售记录"，与批次 B 真实未匹配总量（0）不符。
    impact: |
      工具栏提示与当前显示的批次不一致，用户会被误导以为当前批次（B）还有未匹配记录需要处理，
      违反 oracle 明确要求的"该计数...始终反映整个批次的未匹配总量"。需等用户点击"开始回填"
      或宿主组件调用 refresh() 才会被动纠正。
    action: fix-code
  - id: ic-b-012-F002
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: current
    evidence: |
      frontend/src/components/PolicyRecordTable.vue:251-262（loadUnmatchedCount）与
      frontend/src/components/PolicyRecordTable.vue:316-320（handleStartFill 内 initialUnmatched 查询）
      各自内联同一份 `{ page: 1, pageSize: 1, fillStatus: 'unmatched' }` 查询参数字面量，
      未抽成共享 helper。
    impact: 目前两处行为一致，无功能性问题；后续若其中一处的查询参数被单独改动而漏改另一处，
      两个"未匹配总数"查询会静默产生不一致结果。
    action: backlog
  - id: ic-b-012-F003
    dimension: concurrency
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: |
      loadUnmatchedCount() 的两处调用点（onMounted 与 handleStartFill 的 finally）之间没有请求
      序号/取消（AbortController 或等价机制）保护；纯按网络响应到达顺序写 unmatchedCount.value。
      正常情况下 onMounted 触发的查询会先于回填流程完成后触发的查询完成（后者前置了至少一次
      triggerSalesFill 网络往返），但这只是因果时序上的偶然保证，代码本身未强制。
    impact: 仅在网络异常延迟（如 onMounted 的首次查询被人为/异常延迟到回填完成之后才返回）等
      非常规条件下，才会出现旧响应覆盖新响应、短暂显示错误计数的情况；正常使用路径下概率极低。
    action: backlog
```
