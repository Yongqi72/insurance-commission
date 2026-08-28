---
task_id: ic-v1-008
round: 1
mode: full
risk: standard
review_profile: iterations/v1/code-reviews/ic-v1-008/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 27ce803208fbbde016daa77791e4b9059abf7c23
reviewed_base: f5a48911d1a3e3b6e045ef5d3da0911ea0dbca6b
reviewed_head: d67447495cf865d1b68f7301398b50d8a3ed0f3a
diff_sha256: 1ef250c404f17c8d5f82f6148c9e1d47327fc314a3074d6c63b90b82ed7ff776
changed_files:
  - frontend/src/api/commission-batch.ts
  - frontend/src/layouts/AppLayout.vue
  - frontend/src/router/index.ts
  - frontend/src/views/BatchListView.vue
started_at: 2026-08-28T01:40:01Z
completed_at: 2026-08-28T01:50:19Z
elapsed_minutes: 11
escalate_to_full: false
conclusion: revise
---

## 本轮范围

```yaml
counterexamples:
  - "router.push({ name: 'batch-detail', params: { id } }) 在当前工作区路由表下用 vue-router@5.2.0 实测：Promise 被 reject（'No match for {\"name\":\"batch-detail\",...}'），currentRoute 保持不变（复现脚本见下方 F001 evidence）"
affected_regressions: []
changed_surface_allowed:
  - frontend/src/api/commission-batch.ts
  - frontend/src/layouts/AppLayout.vue
  - frontend/src/router/index.ts
  - frontend/src/views/BatchListView.vue
```

- 工作区实际改动（`git status --short` 只含上述 4 个文件的 A/M）与固定 diff 一致；对固定 diff 重算 `sha256sum` = `1ef250c404f17c8d5f82f6148c9e1d47327fc314a3074d6c63b90b82ed7ff776`，与派发值一致，未 blocked。

## 逐维度分析

### contract

- AC-01（新建批次弹窗提交→跳转详情）：`#input-batch-name` 必填校验、`POST /api/commission-batches` 提交、成功后 `router.push({ name: 'batch-detail', params: { id: batch.id } })` 均按 oracle 落地（`BatchListView.vue:263-284`）。但任务包 `do-not` 原文="不实现批次详情页任何内容……**本包路由中的 batch-detail 组件占位**不含具体页面逻辑"，以及 `context` 原文="`frontend/src/router/index.ts` 在 AppLayout children 下新增……与 `{ path: 'commission-batches/:id', name: 'batch-detail' }`（占位指向，实体组件由 ic-v1-009 提供）"——两处均确认本包（router/index.ts 在本包 files 清单内）应在路由表新增一个 `batch-detail` 占位路由（组件可以是空壳，但**路由项本身**须存在）。实际 diff 中 `router/index.ts` 只新增了 `batch-list` 一条路由，未新增 `batch-detail`。见 **F001（阻断）**。
- AC-05（列表倒序渲染 + 四态经 `DataStateWrapper`）：`fetchBatchPage` 调用 `GET /api/commission-batches`，不做前端排序，`status` 由 `list.length===0` 派生，四态经 `DataStateWrapper` 承接，与 `PolicyRecordListView.vue` 范式（`loadData`/`status`/`errorMessage` 命名与结构）逐行一致。功能层面满足 oracle；但 prototype-map.md 定义的 `#empty-batch-list` 具名锚点未落地，见 **F002（建议）**。
- 技术 AC「点击任一行跳转详情」：`@row-click="handleRowClick"` → `router.push({ name: 'batch-detail', params: { id } })`，同一根因（`batch-detail` 未注册）导致该 AC 与 AC-01 一样当前不可达，归入 **F001**。
- 技术 AC「分页」：`el-pagination` 双向绑定 `page`/`pageSize`，`size-change`/`current-change` 均触发 `loadData`，与 `PolicyRecordListView.vue` 完全同构。无发现。
- 技术 AC「创建失败可见反馈」：`createBatch` 的 `catch` 分支不重复弹窗（依赖 `request.ts` 拦截器统一 toast，已在同文件注释说明），`submitting` 在 `finally` 重置；未见按钮卡死路径。无发现。
- 技术 AC「顶部导航新增入口」：`AppLayout.vue` 新增 `<router-link :to="{ name: 'batch-list' }">提成批次</router-link>`，未新增"提成阶梯规则"入口，符合 do-not。无发现。
- 次要：`CommissionBatch` 接口声明 `updatedAt: string` 为必有字段，但 TRD §POST/GET 两个接口的响应体均只列 `{ id, name, status, createdAt }`，未含 `updatedAt`；该字段在 `BatchListView.vue` 全程未被读取，属于类型比实际契约宽松的无害冗余。见 **F005（建议，极低优先级）**。

### scope-and-secrets

- 改动文件严格等于 profile 的 4 个文件，无超范围改动。
- 未触碰 `do-not` 明令的两项禁区（"提成阶梯规则"导航、批次详情页内容）。
- 全文 grep 未见明文 token/密码/密钥。
- 无发现。

### test-evidence

- 独立核实：`frontend/package.json` 的 `scripts` 中确无任何测试运行器命令（只有 `dev/build/preview/lint/stylelint`），`devDependencies` 无 `vitest`/`jest`/`@vue/test-utils` 等；`find frontend -iname "*.spec.ts" -o -iname "*.test.ts"` 结果为空。实现者关于"仓库无测试基建"的陈述属实，非本任务引入的新缺口。
- AC-01（弹窗提交跳转）、AC-05（分页+四态）本质是交互/视觉验收，且在零测试基建的仓库现状下无法用测试机械证明，走人工走查（manual-test）合理，不构成本任务的 blocking test-evidence gap。
- 检查是否有可测的纯逻辑分支被跳过：`statusLabel()`（doing/done 映射）、`syncDialogWidth()`（matchMedia.matches 派生宽度）均为极简单值映射，且同样受限于仓库无测试运行器这一系统性约束，非本任务刻意规避测试。未发现应测未测的独立可测分支。
- 机械证据替代：`npm run lint:check`、`npm run stylelint:check`、`npm run build`（`vue-tsc -b && vite build`）均干净通过（见本报告 F 系列之外的验证记录），构成本任务可得到的最佳机械证据。
- 无阻断发现。

### comment-hygiene

- 对 4 个改动文件执行 `grep -nE 'ic-v[0-9]+-[0-9]+|-b-[0-9]+'`，命中 0 处——本项目连续 6 次复现的"注释点名任务号"问题本轮**未复现**。
- `commission-batch.ts` 新增注释引用了 "AC-01"/"AC-05"（PRD 验收标准编号，非任务号/迭代号），属于业务语言描述范畴，不属于被禁止的模式。
- 无发现。

### standards

- FE-DESIGN-01（禁止硬编码视觉字面值）：`BatchListView.vue`/`AppLayout.vue` 样式块内颜色/间距/字号/圆角全部引用 `variables.scss` 变量（`$space-*`/`$fs-*`/`$color-*`/`$radius-*`/`$primary`/`$text-*`），无字面量。已用探针验证该 stylelint 规则本身对字面量 fail-closed（见下方独立验证记录）。无发现。
- FE-ASYNC-01/02/03：`catch` 分支不重复 toast（读请求失败交给 `DataStateWrapper`，写请求失败交给 `request.ts` 拦截器）；表单校验用 `await formRef.value.validate()` + try/catch；创建成功后 `ElMessage.success('创建成功')`；`submitting` 在 `finally` 重置。全部符合。无发现。
- FE-RESPONSIVE-01（弹窗移动端降级）：`el-dialog` 通过 `dialogWidth` 响应式变量在 `<768px` 时切到 `95vw`，桌面端 `480px`，逻辑上与 design.md §六一致。见下方 F003/F004 的边界补充说明。
- FE-RESPONSIVE-02（横向内容 overflow wrapper）：`.batch-list__table-wrapper { overflow-x: auto }` 包裹 `el-table`，无 Flex 祖先设置 `overflow: hidden`。无发现。
- FE-RESPONSIVE-03（触屏尺寸基线，输入框移动端字号 ≥16px）：新增 `#input-batch-name`（`el-input`）未覆盖 Element Plus 默认 `--el-font-size-base`（14px），全仓库（含本次改动）都没有对该 CSS 变量做移动端覆盖。该规则 applies-if 命中"新增表单输入框"，本任务新增了一个未覆盖字号的输入框。见 **F003（建议）**。
- FE-EP-01（统一 UI 组件库）：仅用 Element Plus 组件，无第三方 UI 库引入。无发现。
- FE-EP-02（el-dialog 必须显式 align-center）：`<el-dialog ... align-center ...>` 已显式声明。无发现。
- FE-COMP-01（SFC 区块顺序）：`template → script setup → style` 顺序正确；已用 eslint 探针确认 `vue/block-order` 规则对本区块顺序 fail-closed（本次改动未违反，无需 --fix）。无发现。
- FE-COMP-02（组件文件 PascalCase）：`BatchListView.vue` 为 PascalCase。无发现。
- FE-COMP-03（路由组件路径大小写一致）：`router/index.ts` 引用 `@/views/BatchListView.vue`，与磁盘实际文件名（`ls` 核对）大小写完全一致。无发现。
- FE-COMP-04（类型定义归属去重）：`commission-batch.ts` 复用 `policy-record.ts` 导出的 `PageQuery`/`PageResult`（未重复定义），`CommissionBatch`/`CommissionBatchStatus` 在 `commission-batch.ts` 顶部 export，符合"跨组件类型提取到 `@/api/*.ts` 文件顶部"的要求。轻微观察：让批次域的分页类型依赖另一个业务域文件（`policy-record.ts`）而非中立的共享位置，属于可接受但不算最优的耦合方式，未达到 finding 门槛（规则未禁止跨域复用，且确实做到了去重）。无阻断发现。
- FE-SCSS-01（SCSS 引入方式）：两个改动文件的 `<style>` 块均为 `@use '@/styles/variables.scss' as *`，无 `@import`。无发现。

### enforcement

- 本任务未新增/修改任何 lint 规则、stylelint 规则或测试基础设施本身；"enforcement"入选原因是 relevant-standards 命中的机械级规则（FE-DESIGN-01/FE-COMP-01 等）需要核实其声明的检查器是否真的 fail-closed，而不是仅凭标准文档字面"计划中"的表述。
- 独立正控验证：临时在 `frontend/src/views/` 下写入一个探针 `.vue` 文件（`.probe { color: #ff0000; margin: 17px; }`），跑 `npx stylelint`，规则 `scale-unlimited/declaration-strict-value`（对应 FE-DESIGN-01）对两处字面量均报错，验证完毕后已删除探针文件（工作区无残留，`git status` 复核干净）。
- 独立验证 `:deep()` 伪类：另建临时探针 `.vue` 文件写入 `:deep(.el-dialog) { width: 95vw }` 及一段 `@media (max-width: 768px) { :deep(...) {...} }`，`npx stylelint` 报 `Unknown pseudo-class selector ":deep"`（`selector-pseudo-class-no-unknown`，来自 `stylelint-config-standard-scss`）以及 `media-feature-range-notation`（要求 `(width <= …)` 写法，与仓库内 `LoginView.vue` 已用写法一致）。验证完毕已删除探针文件。**结论：实现者关于"`stylelint-config-standard-scss` 会拒绝 `:deep()`，因此改用 `window.matchMedia`"的判断属实**，非借口。
- `eslint.config.js` 中 `vue/block-order` 规则（对应 FE-COMP-01）已实际配置（非"计划中"占位），本次改动的区块顺序本身也确实正确，构成一次真实的正控通过而非规则缺失导致的假阴性。
- `npm run lint:check` / `npm run stylelint:check` / `npm run build`（`vue-tsc -b && vite build`）对当前工作区全部无错误退出，机械证据完整。
- 无发现。

### design-fidelity

- 颜色：状态标签 `--doing`/`--done` 分别使用 `$color-warning-bg`/`$color-warning-text` 与 `$color-success-bg`/`$color-success-text`，与 design.md §一「状态标签」表逐值对应（已核对 `variables.scss` 中两组变量的十六进制值与 design.md 一致）。字号/间距/圆角同样全部来自 §二/§三/§四对应级别（`$fs-h2`/`$fs-small`、`$space-*`、`$radius-sm`）。无发现。
- 交互 vs prototype.html：`#btn-new-batch`/`#table-batch-list`/`#modal-new-batch`/`#input-batch-name`/`#btn-submit-new-batch` 五个锚点 id 均逐一落地在 `BatchListView.vue` 对应元素上。唯独 `#empty-batch-list`（prototype-map.md §前端 AC 覆盖明确将其列为 AC-05 的锚点之一）未落地为具名 DOM 节点——空态改由共享组件 `DataStateWrapper`（未改动、不在本任务 files 清单）内部的 `el-empty` 承接，没有任何具名 id。
  - 已读 `DataStateWrapper.vue` 全文确认：其 `empty` 分支只渲染 `<el-empty :description="emptyText" class="data-state-wrapper__empty" />`，组件 props 未开放透传自定义 id 的机制。
  - AC-05 oracle 原文本身写的是"经 `DataStateWrapper` 切到 empty 态，展示……及新建入口按钮"，并未要求具名 id `#empty-batch-list`；这与 prototype-map.md 的锚点清单构成一次 reference 与 oracle 的不一致（oracle 权威更高）。
  - 同一模式在更早落地的 `PolicyRecordListView.vue`（AC-05 同源，prototype-map.md 同样为其登记了 `#table-record-list`/`#empty-record-list`）中已存在且未见此前被判定为阻断——说明这是一个先于本任务存在的系统性缺口，不是 ic-v1-008 独有回归。
  - 下游风险仍然真实：若 generate-integration-tests/pinchtab 脚本按 prototype-map.md 字面断言 `#empty-batch-list` 存在，会在两个页面（批次列表、保单记录列表）同时落空。计入 **F002（建议，非阻断——reachability 为 conditional，触发条件是未来的联调脚本按字面锚点断言，当前不可观察）**。
- "新建" 按钮 `#btn-new-batch` 在空态与非空态下始终可见（在 `.batch-list__head` 常驻，而非像 prototype 里空态专属再放一个"+新建批次"按钮），实际效果满足 AC-05 intent（"空态时展示引导新建的入口"，入口始终存在等价于满足），不算偏离。

### logging-privacy

- 改动代码中无 `console.log`/日志埋点，`catch` 分支不打印完整请求体/响应体，无 PII/凭据写入日志的路径。
- 无发现。

### maintainability

- `commission-batch.ts` 正确复用 `policy-record.ts` 的 `PageQuery`/`PageResult`、`request.ts` 的 `ApiEnvelope`，未重复造轮子；函数签名（`createBatch(name)`/`fetchBatchPage(query)`）与 `policy-record.ts` 的 `fetchPolicyRecordPage(query)` 范式一致。
- `BatchListView.vue` 的 `loadData`/状态四态/分页逻辑与 `PolicyRecordListView.vue` 高度同构，这是任务包明确要求的范式复用，不算不必要重复。
- 观察：`dialogWidth`/`mobileMediaQuery`/`syncDialogWidth` 这套"用 `matchMedia` 驱动 `el-dialog` 响应式宽度"的写法是本仓库第一个 `el-dialog`，目前只有一份实现，尚不构成重复。但 ic-v1-009（导入弹窗）、ic-v1-011（阶梯规则编辑弹窗）等后续任务大概率还会各自新增 `el-dialog`，若都各自手写一份相同的 `matchMedia` 监听样板，会在 2-3 个任务后出现明显重复。建议在第二个 `el-dialog` 落地时把这段逻辑提炼成共享 composable（如 `useResponsiveDialogWidth`）。见 **F004（建议，backlog）**。

## Findings

```yaml
findings:
  - id: ic-v1-008-F001
    dimension: contract
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: >
      任务包 do-not 原文："本包路由中的 batch-detail 组件占位不含具体页面逻辑"；context 原文："frontend/src/router/index.ts
      在 AppLayout children 下新增 { path: 'commission-batches', name: 'batch-list', ... } 与
      { path: 'commission-batches/:id', name: 'batch-detail' }（占位指向，实体组件由 ic-v1-009 提供）"——
      两处均确认本包应在 router/index.ts 新增 batch-detail 占位路由。实际 git diff 只新增了 batch-list 一条路由，
      未新增 batch-detail。用与工作区一致的 vue-router@5.2.0 独立复现：
      router.push({ name: 'batch-detail', params: { id: 'abc' } }) 返回 rejected Promise
      "No match for {"name":"batch-detail","params":{"id":"abc"}}"，router.currentRoute 不变
      （探针脚本已在验证后删除，工作区无残留）。BatchListView.vue:278（handleSubmit 内 router.push）
      与 BatchListView.vue:252（handleRowClick 内 router.push）均未 await/catch 该调用，属同一根因的两处调用点。
    impact: >
      用户在批次列表页点击"+新建批次"→填写名称→点击"创建"：POST 请求成功、"创建成功"toast 弹出、弹窗关闭，
      但页面停留在批次列表，不会跳转到批次详情页（AC-01 example"跳转批次详情路由且头部状态标签显示'进行中'"不成立）；
      浏览器控制台出现未捕获的 Promise rejection。点击列表内任一已有行同样不会跳转（对应技术 AC"点击批次列表任一行跳转详情页"）。
    action: fix-code
    status: open
  - id: ic-v1-008-F002
    dimension: design-fidelity
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: >
      prototype-map.md §前端 AC 覆盖明确将 #empty-batch-list 登记为 AC-05 的 HTML 锚点；实际实现将空态渲染委托给
      未改动的共享组件 DataStateWrapper.vue（已读全文确认），其 el-empty 节点无任何 id，也未开放透传自定义 id 的 prop。
      AC-05 oracle 原文只要求"经 DataStateWrapper 切到 empty 态"，未提具名 id 要求，故当前实现不违反 oracle 本身；
      但与 prototype-map.md 的锚点清单不一致。同一缺口已先于本任务存在于 PolicyRecordListView.vue（AC-05 同源，
      对应 #empty-record-list 同样未落地），属系统性缺口而非 ic-v1-008 新引入。
    impact: >
      当前不可观察（AC-05 oracle 按 DataStateWrapper 机制验收即可通过人工走查）；若后续 generate-integration-tests/
      pinchtab 脚本按 prototype-map.md 字面断言 #empty-batch-list 存在，会在批次列表页与保单记录列表页同时判定失败。
    action: global-gap-review
    status: open
  - id: ic-v1-008-F003
    dimension: standards
    severity: advisory
    type: behavior-bug
    reachability: current
    evidence: >
      FE-RESPONSIVE-03 要求"输入框字号移动端不低于16px"，applies-if 命中"新增表单输入框"。新增的 #input-batch-name
      为 el-input，未覆盖 Element Plus 默认 --el-font-size-base（实测 el-input.css 默认 font-size: var(--el-font-size-base)，
      项目全局 src/styles/index.scss 只覆盖了 --el-color-primary/--el-border-radius-base 等，未覆盖 --el-font-size-base）。
      grep 全仓库确认没有任何针对该变量的移动端覆盖，含本次改动。
    impact: >
      iOS Safari 上聚焦 #input-batch-name 时，若字号低于16px会触发系统自动放大页面（体验劣化，非崩溃）。
      同一问题已系统性存在于 LoginView.vue 的用户名/密码输入框（更早任务遗留，未被本任务修复也未被本任务加重）。
    action: global-gap-review
    status: open
  - id: ic-v1-008-F004
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: >
      BatchListView.vue 新增 dialogWidth/mobileMediaQuery/syncDialogWidth 一套 matchMedia 驱动响应式弹窗宽度的样板代码，
      是本仓库第一个 el-dialog，目前无重复实例。ic-v1-009（导入弹窗）、ic-v1-011（阶梯规则编辑弹窗）后续大概率各自新增
      el-dialog，若各自重复手写同一段 matchMedia 监听逻辑会形成重复。
    impact: 当前无重复（只有一份实现），unknown 是否后续任务会各自重写；非当前可观察缺陷。
    action: backlog
    status: open
  - id: ic-v1-008-F005
    dimension: contract
    severity: advisory
    type: contract-drift
    reachability: unreachable
    evidence: >
      commission-batch.ts 中 CommissionBatch 接口声明 updatedAt: string 为必有字段，但 trd.md §接口
      （POST /api/commission-batches 与 GET /api/commission-batches）响应体均只列 { id, name, status, createdAt }，
      不含 updatedAt。BatchListView.vue 全文未读取 row.updatedAt。
    impact: 无可观察行为影响（字段未被使用）；类型声明比实际契约宽松，纯静态类型层面的轻微不一致。
    action: downgrade-claim
    status: open
```
