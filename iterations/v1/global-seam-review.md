# 全局接缝独立审查 · v1

- 审查日期：2026-08-28
- 覆盖任务 id：ic-v1-001 ~ ic-v1-012（全部已 `[merged]`）
- 审查方法：`../hact-method-lab/templates/review-briefs/global-seam-review.md`；只查五类组合缺陷，不重审单包 AC 忠实性/代码风格/测试品类/design 保真

## 自读输入

- `iterations/v1/prd.md`、`iterations/v1/trd.md`（intent/接口/状态契约）
- `iterations/v1/sprint.md`、`iterations/v1/queue/ic-v1-001.md`~`ic-v1-012.md`（title/depends_on/do-not/context/supersedes/api-contract）
- 项目根 `status.yml`（本期 12 个任务的 code_reviews 历史 finding，仅作背景，未重审已 closed 项）
- `reusables.md`、`backlog.md`（已登记欠账核对，避免重复报告）
- 合并后代码树实测：`frontend/src/api/request.ts`、`commission-batch.ts`、`commission-report.ts`、`commission-tier.ts`、`policy-record.ts`；`frontend/src/layouts/AppLayout.vue`；`frontend/src/views/BatchDetailView.vue`；`frontend/src/components/*.vue`；`frontend/.stylelintrc.json`；后端 `commission-batch.module.ts`/`app.module.ts`/各 controller 路由前缀/`rule-complete.util.ts`/`calc-commission.ts`/`error-code.enum.ts`
- 可执行验证：`npm run build`、`npm run lint:check`、`npm run stylelint:check`（前端）均全绿；`nest build`（后端）通过

## 五类结论

### 1. 两个包互相写"不在本包"，或能力没有真实 owner

**发现 1 项（见 findings SEAM-F001）**：`ImportPanel.vue`（ic-v1-009）暴露的 `records-changed` 事件是专为下游"消费方"预留的接口（ic-v1-009 known-risks 原文："删除导入触发的记录变更信号在 ic-v1-010 落地前暂无消费方，属预留接口"），但 ic-v1-010（`PolicyRecordTable.vue`）与 ic-v1-011（`CommissionSummaryPanel.vue`）均未在各自任务包的 AC/context 中声明要消费该信号，`BatchDetailView.vue`（三包共同编辑的宿主）也未绑定 `@records-changed` 监听。该信号目前全仓零消费方——不是两包互相声称"对方做"，而是没有任何一包声明"我来接"，导致"导入/删除导入后同页明细区实时刷新"这个能力落空。

其余检查点（AppLayout 两个导航入口各自归属明确、BatchDetailView 两个挂载点分别归属 ic-v1-010/011、批次 CRUD vs 导入 vs 保单记录查询三个 Controller 边界清晰）均未发现互相甩锅或能力真空。

### 2. 后端接口/字段已交付，但调用方仍无法完成 intent

未发现新增问题。逐一核对前端实际调用的接口路径/字段名与后端实际暴露的完全匹配：
- `commission-batch.ts` 全部 9 个函数（`createBatch`/`fetchBatchPage`/`fetchBatchDetail`/`updateBatchStatus`/`listImports`/`importExcel`/`deleteImport`/`fetchBatchPolicyRecords`/`triggerSalesFill`）路径与方法均对应后端 `commission-batch.controller.ts`/`import.controller.ts`/`policy-record-query.controller.ts` 实际路由。
- `policy-record.controller.ts` 前缀由 `policy-records` 改为 `api/policy-records`（ic-v1-004 改动）后，前端 `policy-record.ts`（V0 遗留文件）已同步为 `/api/policy-records` 前缀，未发现前端仍调旧路径的残留。
- `commission-report.ts`/`commission-tier.ts` 的响应字段类型（`ruleComplete`/`groups`/`tiers`/`beforeSnapshot`/`afterSnapshot` 等）与 TRD 接口设计、后端实际 DTO 一致。
- 未发现前端假设了后端未交付的字段或端点。

### 3. 被取代实现零调用方却仍注册、暴露或被测试维护

未发现。`foundation.md` 登记的三项 V0 期明确延后到 V1 的关注点（提成阶梯规则/导入批次边界查询级/投保人→分站映射）在 V0 阶段从未实际建出代码（`foundation-F003` 已核实"全仓无 calcCommission 实现"），因此不存在"V0 占位实现需要退役"的情形，V1 是从零落地而非替换。检查 `common/excel`、`common/oss`、`rule-complete.util.ts`、`calc-commission.ts` 均只有 ic-v1-001/005/006 交付的单一实现，无重复/废弃版本共存。

### 4. 跨包共享类型、枚举、错误码或状态各自长出第二定义

未发现新的第二定义。逐一核对：
- `ErrorCode`：前端 `frontend/src/types/enums.ts`（const 对象，因 tsconfig `erasableSyntaxOnly` 不能用运行时 enum）与后端 `backend/src/common/constants/error-code.enum.ts`（TS enum）两侧数值完全一致（0/1001/1002/1003/1004/1005/2001/2002/5000），前端文件头注释明确标注"须与后端保持一致"，属有意的按语言各自声明同步维护，非漂移。
- `SalesFillSource`：前端 `frontend/src/api/policy-record.ts` 与后端 `policy-record.entity.ts` 均为 `'unmatched' | 'system' | 'manual'`，字面值一致。
- `ruleComplete()`：仅 `backend/src/commission-tier/rule-complete.util.ts` 一处实现，`commission-report.service.ts` 直接 import 复用，未见任何模块（含前端）自行重算完整性——前端 `CommissionTierView.vue`/`CommissionSummaryPanel.vue` 均只读取后端返回的 `ruleComplete` 字段渲染，不重算。
- `calcCommission()`：仅 `backend/src/commission-report/calc-commission.ts` 一处实现，`commission-summary`/`commission-report` 两个接口共用同一调用。
- `suppressToastForCodes` 机制：仅在 `request.ts` 声明一次（`declare module 'axios'` 扩展 + `handleBusinessError` 读取），无第二套实现；调用方仅 `commission-tier.ts` 的 `createCommissionTier`/`updateCommissionTier` 使用。
- **`useResponsiveDialogWidth` 响应式弹窗宽度**：backlog 中记录的"ic-v1-008/009 各自手写同一段 matchMedia 样板代码"问题，实测已被提炼为 `frontend/src/composables/useResponsiveDialogWidth.ts` 共享 composable，`ImportPanel.vue`/`BatchListView.vue`/`CommissionTierEditModal.vue`/`CommissionTierHistoryDrawer.vue`/`ExportHistoryDrawer.vue`/`PolicyRecordHistoryDrawer.vue` 六处组件均已收敛为同一实现，未见残留的第二份重复定义。

### 5. 单包 AC 均满足，但组合后的必需终态/入口/选项不可达

**发现 1 项（与第 1 类同一根因，见 SEAM-F001）**：PRD AC-14 oracle 明确"数据现查现算，随记录变化/规则变更实时变"，TRD §交互技术方案也明确"提成汇总为现查现算…批次详情页每次打开/相关数据变化后重新请求"。但实测 `CommissionSummaryPanel.vue` 仅在组件挂载和 `props.batchId` 变化时请求 `GET .../commission-summary`，`PolicyRecordTable.vue` 内的人工补录保存成功（AC-08，本期最核心的销售人员数据来源路径，因第三方回填本期恒为未匹配）、`开始回填`成功、以及 `ImportPanel.vue` 的导入/删除导入成功，均不会触发 `CommissionSummaryPanel.vue` 重新拉取。用户在批次详情页同一屏内完成"人工补录销售人员"后，右侧/下方的提成汇总卡片不会实时更新，需离开该页面再返回（或手动刷新整个页面）才能看到新数字，与 PRD"实时变"的产品承诺不符。

逐一核对其余组合终态：AppLayout 两个导航入口（"提成批次"/"提成阶梯规则"）均存在且路由正确、互不覆盖；BatchDetailView 两个具名挂载点（`#policy-record-panel-mount`/`#commission-summary-panel-mount`）均已被替换为对应组件，骨架头部（批次名+状态标签）与返回入口未被破坏；批次列表→详情页的路由跳转链路完整可达（ic-v1-008-F001 的占位路由缺失问题已在 round-02 修复并经本次 `npm run build` 复验）。

## 特别关注点核实结论

- **`request.ts` 的 `suppressToastForCodes` 与 `responseType==='blob'` 旁路组合**：实测两者调用方完全不重叠——`suppressToastForCodes` 仅被 `commission-tier.ts` 的非 blob 请求（`createCommissionTier`/`updateCommissionTier`）使用；blob 请求（`commission-report.ts` 的 `exportCommissionReport`）从不传 `suppressToastForCodes`，且响应拦截器对 blob 路径的处理（先判断 `responseType==='blob'` 直接短路，仅在其内部单独判断 HTTP 401 状态码执行登出）与非 blob 路径的 `handleBusinessError`（内部读取 `suppressToastForCodes`）是两条完全独立、不交叉执行的分支。不存在"blob 请求同时命中 401 且被 suppressToastForCodes 抑制登出"的组合场景，此前 round-02 修复的 401 登出逻辑不受 suppressToastForCodes 影响。
- **`commission-batch.ts` 三包累积**：实测文件包含全部 9 个预期函数，逐一核对无覆盖/重复定义，`npm run build`/`vue-tsc` 均通过。
- **`AppLayout.vue` 两个导航项**：均存在（`batch-list`、`commission-tier`），未见互相覆盖。
- **`BatchDetailView.vue` 三包累积**：头部、两个挂载点分别正确替换为 `PolicyRecordTable`/`CommissionSummaryPanel`，骨架其余部分完整。
- **`.stylelintrc.json` 的 `:deep` 白名单**：`selector-pseudo-class-no-unknown` 的 `ignorePseudoClasses: ["deep"]` 仍在，未被后续改动撤销，`npm run stylelint:check` 全绿。
- **`ruleComplete()` 单一权威**：前端全仓无自行重算完整性的代码，仅透传展示后端字段。
- **V0 占位视觉值退役**：`ic-v1-007` 已将 `variables.scss` 全量替换为 design.md 真值，未发现残留 V0 占位色值/尺寸的调用方。

## Findings

```yaml
findings:
  - id: SEAM-F001
    type: scope-gap
    severity: blocking
    reachability: current
    owners: []
    evidence: |
      ic-v1-009 在 ImportPanel.vue 建立 `records-changed` 事件（defineEmits），
      并在其任务包 known-risks 中明确标注"删除导入触发的记录变更信号在 ic-v1-010
      落地前暂无消费方，属预留接口，不影响本包自身验收"——即显式把"消费该信号"的
      职责甩给未来任务，但未指名具体哪一包必须接。ic-v1-010（PolicyRecordTable.vue）
      与 ic-v1-011（CommissionSummaryPanel.vue）的任务包 AC/context 均未提及消费该
      信号；实测 BatchDetailView.vue（三包共同编辑的宿主组件）模板中
      `<ImportPanel :batch-id="batchId" />` 未绑定 `@records-changed` 监听，全仓
      grep `records-changed` 仅命中 ImportPanel.vue 自身的定义与触发处，零消费方。
      进一步实测：CommissionSummaryPanel.vue 仅 watch `props.batchId` 触发重新请求
      `GET .../commission-summary`；PolicyRecordTable.vue 的人工补录保存成功
      （handleSaveSalesName）、开始回填成功（handleStartFill）均只刷新自身列表，
      不触发 CommissionSummaryPanel 刷新；ImportPanel 的导入/删除导入成功也不触发
      CommissionSummaryPanel 或强制 PolicyRecordTable 刷新。三个兄弟组件互相之间
      无任何数据变更通知机制，也无共享 store（仅有 auth store）。
    impact: |
      用户在批次详情页同一屏完成核心操作（人工补录销售人员姓名——本期因第三方
      接口未配置，是产生真实销售人员数据的唯一路径；或导入/删除导入）后，紧邻可见
      的提成汇总卡片区块（CommissionSummaryPanel）不会实时反映变化，需离开该页面
      再返回或手动刷新整页才能看到正确数字；同理，删除导入后同页可见的保单记录
      明细表也不会自动移除已被后端硬删除的行。这与 PRD AC-14 oracle 原文"数据现查
      现算，随记录变化/规则变更实时变"及 TRD §交互技术方案"批次详情页每次打开/
      相关数据变化后重新请求"的产品承诺相悖，且命中路径是本期最核心、最高频的
      日常操作（人工补录），当前即可稳定复现，非边缘场景。
    action: global-gap-review
  - id: SEAM-F002
    type: future-risk
    severity: advisory
    reachability: unreachable
    owners: []
    evidence: |
      frontend/src/views/PolicyRecordListView.vue（V0 交付，路由 `/policy-records`，
      为默认落地页 `/` 的重定向目标）与其对接的 `GET /api/policy-records`（不带
      batchId 过滤，跨批次全量列表）在 V1 全部 12 个任务包的 files/context/supersedes
      中均未被提及退役或改造，与 V1 新增的批次维度保单记录明细（`PolicyRecordTable.vue`
      + `GET /api/commission-batches/:id/policy-records`）功能上部分重叠但入口、
      查询范围不同，两者代码路径独立不冲突。
    impact: |
      当前无可观察的错误行为——PRD v1 未要求下线该页面，其仍是登录后默认落地页，
      功能本身正确可用；只是 V1 引入批次化工作流后，"全量跨批次列表"与"批次内
      明细列表"两个入口并存是否仍符合当前产品心智，PRD/TRD 均未显式表态，留待
      产品侧确认是否需要在后续迭代收编或调整默认落地页。不构成本期五类组合缺陷
      （非零调用方、非两包互甩、非必需终态不可达），仅记录供参考。
    action: backlog
```
