---
task_id: ic-v1-010
round: 1
mode: full
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-010/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 65ec00d2b28501c6d6c38c0b15a28219b65049e3
reviewed_base: d9601c7230932222117bc7669e5197fe91c33d2a
reviewed_head: 0461ff81b5cfa0b1891b6feef911594b8246643d
diff_sha256: 6d3db278b31ea1ae0818842e349c2c9e14c3e5994ba493237b96f1f652b592c6
changed_files:
  - frontend/.stylelintrc.json
  - frontend/src/api/commission-batch.ts
  - frontend/src/api/policy-record.ts
  - frontend/src/components/PolicyRecordHistoryDrawer.vue
  - frontend/src/components/PolicyRecordTable.vue
  - frontend/src/views/BatchDetailView.vue
started_at: 2026-08-28T03:23:45Z
completed_at: 2026-08-28T03:32:11Z
elapsed_minutes: 9
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples: []
affected_regressions: []
changed_surface_allowed:
  - frontend/.stylelintrc.json
  - frontend/src/api/commission-batch.ts
  - frontend/src/api/policy-record.ts
  - frontend/src/components/PolicyRecordHistoryDrawer.vue
  - frontend/src/components/PolicyRecordTable.vue
  - frontend/src/views/BatchDetailView.vue
```

- 独立重算 `git diff d9601c7230932222117bc7669e5197fe91c33d2a 0461ff81b5cfa0b1891b6feef911594b8246643d -- <6 files>` 落盘后 `sha256sum` = `6d3db278b31ea1ae0818842e349c2c9e14c3e5994ba493237b96f1f652b592c6`，与派发值逐字符一致，未 blocked。工作区 `git status --short` 与固定 diff 文件集合一致（另有本轮审查产生的 `code-reviews/ic-v1-010/` 及无关未跟踪文件，不计入）。

## 逐维度分析

### contract

- **AC-05**：`fetchBatchPolicyRecords` 透传 `keyword`/`fillStatus`；后端 `PolicyRecordQueryService.findPage`（`backend/src/commission-batch/policy-record-query.service.ts:44-70`）以 `order: { createdAt: 'ASC' }` 返回，前端 `PolicyRecordTable.vue` 直接 `list.value = result.list` 不做二次排序（api 层注释明确"后端已按 createdAt 升序返回，前端不再排序"）。keyword 对 `workOrderNo`/`policyNo`/`customerName` 三字段 OR 模糊匹配且与 `fillStatus`/`batchId` AND 复合（`KEYWORD_FIELDS.map(field => ({...baseWhere, [field]: Like(...)}))`），与 oracle"复合生效"一致。空态文案 `empty-text="暂无保单记录，请上传 Excel 导入"` 与 oracle/prototype `#empty-record-list` 逐字一致。四态经 `DataStateWrapper` 承接。无发现。
- **AC-06**：`handleStartFill` 无条件在 try 成功分支执行 `ElMessage.success(`回填完成，${result.unmatchedCount} 条待人工补录`)`，不判断 `matchedCount`/`unmatchedCount` 是否为 0，随后 `resetExpandState()` + `await loadData()` 刷新列表，与 oracle 逐字对应；后端 `fill()`（`policy-record-query.service.ts:81-135`）在地址未配置/调用异常/超时/返回结构不符时均不抛错、按未命中处理，操作视为成功，与 TRD 契约一致。无发现。
- **AC-07**：`FILL_STATUS_OPTIONS` 四项 `value` 严格为 `'all'`/`'unmatched'`/`'system'`/`'manual'`，无空字符串；`fillStatusFilter` 默认 `'all'`；`loadData()` 中 `fillStatus: fillStatusFilter.value === 'all' ? undefined : fillStatusFilter.value`——已用 `axios.getUri({url:'/x', params:{a:1,b:undefined,c:'all'}})` 独立实测，`undefined` 参数被序列化跳过（结果 `/x?a=1&c=all`），确认选 `all` 时确实不传该 query 参数。后端 `QueryPolicyRecordDto.fillStatus` 为 `@IsOptional() @IsIn(['unmatched','system','manual'])`，与前端三值枚举字面量逐一对齐。无发现。
- **AC-08（sensitive 核心）**：见下方 sensitive-boundaries 小节的完整反例推演；结论为无发现，包括"同一时刻最多展开一行"在快速切换场景下的可达性核实、`PATCH /api/policy-records/:id/sales-name` 参数正确、成功后行内 `salesName`/`salesFillSource` 就地更新、`system`/`manual` 记录允许覆盖且前端未额外设阻拦逻辑。
- **AC-09**：`handleViewHistory` 设置 `historyRecordId`/`historyWorkOrderNo` 后打开抽屉，`@open="loadLogs"` 触发 `GET /api/policy-records/:id/sales-fill-logs`；后端 `findSalesFillLogs`（`policy-record.service.ts:76-92`）按 `changedAt: 'DESC'` 排序、前端不二次排序；渲染 `销售人员：{oldValue||'空'} → {newValue}` + `{operator} · {formatDateTime(changedAt)}`，空数组时 `status='empty'`、`empty-text="该记录暂无人工修改记录"`，与 prototype `#drawer-record-history`/`#record-history-body`/`#empty-record-history` 内容结构（含标题"修改历史 · 工作单号 {no}"、log-item 的 old/new/meta 布局）逐项对应。无发现。
- **技术 AC（失败反馈/loading 状态）**：见 standards 小节 FE-ASYNC-01 分析——`catch` 分支为空但有明确注释说明依赖 `request.ts` 拦截器统一弹 `ElMessage.error(envelope.msg || '请求失败')`（已读 `request.ts:37-64` 确认该拦截器对本次两个写请求均未设置 `suppressToastForCodes`，会无条件触发），效果等价于 oracle 要求；`filling`/`savingId` 均在 `finally` 重置，对应按钮 `:loading` 绑定使 Element Plus 自动禁用，满足"请求进行中按钮禁用防重复提交"。无发现。

### scope-and-secrets

- `files:` 清单声明 5 个文件（`PolicyRecordTable.vue`/`PolicyRecordHistoryDrawer.vue`/`BatchDetailView.vue`/`commission-batch.ts`/`policy-record.ts`），实际改动多出 `frontend/.stylelintrc.json` 一个文件——**已独立核实为有正当理由，非违规改动**，证据见下方"已知偏离核查"第 1 项。
- `do-not` 三项边界：① 未见任何多选框/批量操作 UI（`grep -n "type=\"selection\"\|checkbox\|批量" PolicyRecordTable.vue` 无命中）；② 前端未直接对接第三方接口，只调用己方后端 `POST .../policy-records/fill`；③ 未改动 `router/index.ts`/顶部导航（`BatchDetailView.vue` diff 仅在既有挂载点内插入组件引用，无路由/导航改动）。三项均未触碰。
- 明文密钥/token 扫描：6 个改动文件 grep `token\|secret\|password\|api[_-]?key\|-----BEGIN` 均无命中。
- 无发现（`.stylelintrc.json` 改动见下方专项核查，结论为有正当理由，不计入本维度 finding）。

### test-evidence

- 复核确认本仓前端无测试框架（`frontend/package.json` 无 test script，无 vitest/@vue/test-utils 依赖；`find frontend -iname "*.spec.ts" -o -iname "*.test.ts"` 为空），与 ic-v1-007/008/009/012 已确立的项目惯例一致。机械证据以 `vue-tsc -b && vite build`、`eslint .`、`stylelint` 三项替代。
- 三项命令均已在 `0461ff81b5cfa0b1891b6feef911594b8246643d` 树（当前工作区，与固定 diff 一致）上实测：`npm run build`（`vue-tsc -b && vite build`）成功产出 `dist/assets/BatchDetailView-*.js`；`npm run lint:check` 0 输出；`npm run stylelint:check` 0 输出。
- 反证补强：临时删除 `PolicyRecordTable.vue` 内全部 5 处 `eslint-disable-next-line no-undef` 后重跑 `npx eslint`，产生 5 个 `no-undef`（`setTimeout`/`clearTimeout` 未在 `eslint.config.js` globals 登记）错误，证明这些禁用注释是必要的而非滥用；已还原文件，`git diff --stat` 复核该文件无残留改动。
- 后端契约侧（`GET/POST .../policy-records[/fill]`、`PATCH .../sales-name`、`GET .../sales-fill-logs`）有既有 e2e 测试覆盖（`backend/test/policy-record.e2e-spec.ts`、`backend/test/commission-batch-policy-records.e2e-spec.ts`），但后端文件不在本任务 `changed_files` 内，不重复审查其测试证据。
- 功能性行为断言（单行展开互斥、四态切换、筛选复合）只能靠代码走查 + 上述机械证据覆盖，同惯例下不作为独立 blocker。无发现。

### comment-hygiene

- 对 6 个改动文件执行 `grep -nE 'ic-v[0-9]+-[0-9]+|-b-[0-9]+'`，命中 0 处——本项目历史多次复现的"注释点名任务号"问题**本轮未复现**。
- 新增"不得/禁止 X"类注释均带成立前提，例如 `policy-record.ts` "已是 system/manual 状态的记录同样允许再次覆盖"、`PolicyRecordTable.vue` 中"整行点击处理跳过展开列本身，只处理'点击整行其余区域展开'"及其原因说明（避免同一次点击被切换两次）。均属解释性说明而非裸命令式禁止。
- `eslint-disable-next-line no-undef` 系列注释均写明触发前提（"eslint.config.js globals 未登记"），非无理由抑制。
- 无发现。

### standards

- **FE-TABLE-01**：整行点击（非展开列本身）触发 `toggleRowExpansion`；`expand-change` 回调中若 `expandedRows.length > 1` 则对非当前行调用 `toggleRowExpansion(expandedRow, false)`，强制同一时刻最多一行展开。已读 Element Plus 源码 `node_modules/element-plus/es/components/table/src/table-body/render-helper.mjs:93-108` 确认：`preserveExpandedContent` 默认 `false` 时，未展开行的展开内容**完全不渲染进 DOM**（不是 CSS 隐藏），故任意时刻 DOM 中至多存在一份展开面板；结合 Vue 响应式批量更新（`toggleRowExpansion(A,false)` 与展开 B 同步发生在同一 tick，浏览器只会绘制收敛后的最终状态），不存在"短暂同时出现两个展开面板/重复 DOM id"的可观察窗口。三个字段以下即用整行展开而非弹窗，符合规则文本。无发现。
- **FE-EP-06**：`PolicyRecordHistoryDrawer.vue` 用 `el-drawer`（非 `el-dialog`）承载只读历史，倒序时间线列表 + 空态文案，与 `CommissionTierHistoryDrawer.vue`（既有抽屉基准）结构、命名风格高度一致。无发现。
- **FE-ASYNC-01/03**：见 contract 小节技术 AC 分析；写请求失败依赖 `request.ts` 统一拦截器（已核实对本次两个端点均未设 `suppressToastForCodes`，会无条件 toast），成功分支均有 `ElMessage.success`。此模式与 ic-v1-008/009/012 审查中已明确认可的"读请求交 DataStateWrapper、写请求交 request.ts 拦截器"惯例一致（见 `iterations/v1/code-reviews/ic-v1-008/round-01.md` 第 76 行同类结论），非本任务独创的降级处理。无发现。
- **FE-RESPONSIVE-02**：`.policy-record-table__table-wrapper { width:100%; overflow-x:auto }` 包裹 `el-table`；核对 `BatchDetailView.vue` 及其祖先无 `overflow:hidden` 的 Flex 容器。无发现。
- **FE-EP-04（重点）**：见下方"已知偏离核查"第 1 项完整推演。结论：`:deep()` 使用范围精确（仅 `.el-input`/`.el-select`，`grep -rn ':deep(' src/` 全仓只有这 2 处，均在 `PolicyRecordTable.vue` 的 wrapper div 内），`el-select` option `value` 无空字符串，符合规则原文列举的两个禁忌点。stylelint 配置改动范围精确（只白名单 `deep` 一个伪类），已用探针验证规则本身仍对其他未知伪类 fail-closed。无发现。
- **FE-COMP-01/02**：两个新文件区块顺序均为 `template → script setup lang="ts" → style scoped lang="scss"`；文件名 `PolicyRecordTable.vue`/`PolicyRecordHistoryDrawer.vue` 均 PascalCase。无发现。
- **FE-COMP-04**：`SalesFillSource` 仅在 `policy-record.ts` 定义一次，`commission-batch.ts`/`PolicyRecordTable.vue` 均以 `import type` 引用，无重复定义；`PolicyRecordQuery`/`FillResult` 定义在其唯一消费方 `commission-batch.ts`；`SalesFillLog` 定义在 `policy-record.ts`（api 层，与既有 `CommissionTierChangeLog` 归属模式一致），单一消费方 `PolicyRecordHistoryDrawer.vue` 通过 `import type` 引用。无重复定义已在 store/api/enums 导出的类型。无发现。

### enforcement

- 本任务改动了 `.stylelintrc.json` 一条 lint 规则配置（新增 `selector-pseudo-class-no-unknown` 的 `ignorePseudoClasses`），因此该维度重点核实这条规则改动本身是否 fail-closed、范围是否精确，而非只看"计划中"的文档声明。
- 独立正控：临时写入探针文件 `.probe { &:unknown-pseudo { color: red; } }`，`npx stylelint` 报错 `selector-pseudo-class-no-unknown`（连同一条 `scale-unlimited/declaration-strict-value` 硬编码色值报错），证明该规则并未被整体关闭，只有 `deep` 一个伪类被放行；探针文件已删除。
- 独立正控：对真实改动文件 `PolicyRecordTable.vue`/`PolicyRecordHistoryDrawer.vue` 单独跑 `npx stylelint`，0 报错，确认 `:deep(.el-input)`/`:deep(.el-select)` 两处用法被正确放行。
- 独立反证：临时移除 `PolicyRecordTable.vue` 内 5 处 `eslint-disable-next-line no-undef`，`npx eslint` 报 5 个 `no-undef`（`setTimeout`/`clearTimeout`），证明这些禁用注释不是滥用式静默，而是针对 `eslint.config.js` 真实存在的 globals 缺口的精确抑制；已还原文件并核对 `git diff --stat` 无残留。
- `npm run lint:check`/`npm run stylelint:check`/`npm run build` 对当前工作区全部零错误退出。
- 无发现。

### design-fidelity

- 颜色/字号/间距/圆角：`PolicyRecordTable.vue`/`PolicyRecordHistoryDrawer.vue` 两个 `<style>` 块全部通过 `@use '@/styles/variables.scss' as *` 引用 `$fs-h3`/`$fw-h3`/`$fs-caption`/`$fs-small`/`$space-*`/`$radius-sm`/`$text-primary`/`$text-secondary`/`$text-hint`/`$primary-light`/`$primary-dark`/`$color-warning-bg`/`$color-warning-text`/`$bg-hover`/`$border-color`/`$input-width-lg`/`$input-width-md` 等既定 token，逐一核对 `variables.scss` 中对应字面量与 `design.md` 一致，无硬编码字面值（`stylelint:check` 零报错佐证）。
- 交互路径 vs `prototype.html`：`#btn-start-fill`/`#input-search-record`/`#select-fill-status-filter`/`#table-record-list`/`#btn-view-record-history`/`#drawer-record-history`/`#record-history-body`/`#empty-record-history`/`#empty-record-list` 均落地为对应 DOM 节点；抽屉标题"修改历史 · 工作单号 {no}"格式与 prototype `#drawer-record-history` 的 `<h3>修改历史 · 工作单号 CSAE260508551</h3>` 逐字对应（详见下方"已知偏离核查"第 2 项，`workOrderNo` prop 实为忠于原型所需，非范围外增强）；历史条目"销售人员：{old} → {new}"+"{operator} · {datetime}"格式与 prototype `.log-item`/`.log-change`/`.log-meta` 结构一致。
- 见 **F001（建议）**：展开行的视觉呈现与 `prototype.html` 存在两处非阻断性差异——① `<el-table-column type="expand">` 会渲染一个 prototype 没有的可点击箭头图标列（prototype 表头固定 9 列，`colspan="9"`，无展开列；Vue 实现表头为 9 数据列 + 1 展开列，DOM 层面多一列，展开逻辑本身不受影响，见 standards/FE-TABLE-01 分析）；② 展开面板 `.policy-record-table__expand-panel` 未设置背景色，而 prototype `.expand-row td { background: var(--bg-hover); }` 用背景色区分展开区域与普通行，Vue 实现的 `&__expand-panel` 只有 `padding`，无 `background-color: $bg-hover`。两处均为纯视觉呈现差异，不影响任何 AC 的功能性 oracle（点击展开/编辑/保存/查看历史均可达），design.md 本身未对"展开行背景色/是否显式展开列"作规范性要求（仅 prototype 体现），故判 advisory 而非 blocking。

### logging-privacy

- 6 个改动文件 grep `console\.` 全部无命中；`catch` 分支不打印完整请求体/响应体；无 PII（销售人员姓名/操作人）写入日志的路径（日志写入是后端 `Logger.error/warn`，仅记录 URL/HTTP 状态码/异常 message，不含 `workOrderNos`/`salesName` 等具体数据，且后端不在本次 changed_files 范围）。
- 无发现。

### maintainability

- `PolicyRecordTable.vue`/`PolicyRecordHistoryDrawer.vue` 复用既有 `DataStateWrapper`、`useResponsiveDialogWidth`、`formatDateTime` 等共享机制，未重复造轮子；`PolicyRecordHistoryDrawer.vue` 的抽屉骨架（`visible` 本地代理、`watch` 双向同步、`loadLogs`/`status`/`errorMessage` 命名）与 `CommissionTierHistoryDrawer.vue` 逐段同构，是既定范式复用而非不必要重复。
- 搜索防抖（`scheduleSearch`/`searchDebounceTimer`）是本仓库第一次出现的防抖样板；未见既有可复用的防抖 composable，故非重复实现；若未来出现第二处防抖需求，可比照 `useResponsiveDialogWidth` 的先例提炼为共享 composable，当前不构成 finding。
- `tableResetKey` 通过改变 `:key` 强制整表重新挂载来清空展开态，是应对 known-risks"分页/搜索/筛选切换需主动收起展开行"的直接有效手段，未见更简单的等价替代被放弃。
- 无发现。

### sensitive-boundaries

本任务 risk 为 sensitive，核心风险点是"人工修改销售人员归属"是否真的被审计、以及"允许覆盖已回填记录"是否可能被前端逻辑滥用绕过后端保护。逐项构造反例：

- **审计日志是否真正被触发**：前端 `handleSaveSalesName` 调用 `updateSalesName(row.id, trimmed)` → `PATCH /api/policy-records/:id/sales-name`。已读后端 `PolicyRecordController.updateSalesName`（`backend/src/policy-record/policy-record.controller.ts:34-43`）与 `PolicyRecordService.updateSalesName`（`policy-record.service.ts:44-73`）全文：整个操作包在 `dataSource.transaction` 内，先读旧值 → `save(record)` 更新 `salesName`+`salesFillSource='manual'` → `manager.save(manager.create(SalesFillLog, {...}))` 写入日志，四步在同一事务中，无条件分支会跳过日志写入（不存在"某些取值下不写日志"的路径）。`operator` 取自 `request.user.username`（`JwtAuthGuard` 挂载），非前端可控字段——前端 `updateSalesName(id, salesName)` 函数签名里没有 `operator` 参数，无法在请求体中伪造操作人。前端调用链完整、无绕过日志写入的路径。
- **"允许覆盖已回填记录"是否可能被滥用**：前端展开面板对任意 `salesFillSource`（`unmatched`/`system`/`manual`）的行都展示相同的输入框+保存按钮，没有额外的前端侧禁用逻辑——这与后端设计意图完全一致：后端 `updateSalesName` 本身就不检查当前 `salesFillSource`，无条件允许覆盖（backend 注释明确"已是 system/manual 的记录允许反复覆盖（do-not 未限制，known-risks 已记录该设计会改变下游提成归属，非本包缺陷）"）。前端没有添加会与后端行为冲突的额外拦截，也没有引入后端没有的"绕过"路径（例如没有额外的批量/静默端点）；唯一的写入口径仍是同一个 `PATCH .../sales-name`，其审计与业务规则由后端统一把关，前端只是体验层这一判断成立。
- **前端本地拦截空姓名是否规避了后端 1001 校验路径**：`handleSaveSalesName` 在调用 API 前对 `editingSalesName.value.trim()` 为空时提前 `return` 并本地提示"请填写销售人员姓名"，不发起请求。这是可达路径下的一处提前拦截，使得后端 `UpdateSalesNameDto` 的 `@IsNotEmpty()` 1001 校验分支在此 UI 入口下不会被触发（用户无法从这条路径构造出空 `salesName` 的请求）。但该拦截不构成安全绕过——它只是缩小了前端可达的错误面，后端校验仍然存在且对任何非本 UI 的调用方（如直接 HTTP 请求）依然生效；`api/policy-record.ts` 的函数注释也明确"本函数不做提前拦截（交由调用方按需做 UX 优化）"，说明这是有意识的 UX 选择而非误导性隐藏。不判定为 finding。
- 结论：审计链路完整可达、无绕过路径；覆盖修改的宽松策略是后端既定设计，前端未引入额外风险；未见需要 `evidence-gap` 阻断的证据缺口。无发现。

## 已知偏离核查

### 1. `frontend/.stylelintrc.json` 改动（超出 `files:` 清单）

- **历史背景独立核实**：`iterations/v1/code-reviews/ic-v1-008/round-01.md` 第 92 行记录了该轮审查员的独立探针结果——`:deep(.el-dialog) { width: 95vw }` 在当时的 `stylelint-config-standard-scss`（未加白名单）下被判 `Unknown pseudo-class selector ":deep"`（规则 `selector-pseudo-class-no-unknown`）。这证明 ic-v1-008/009/012 放弃 `:deep()`、改用 `useResponsiveDialogWidth`（`matchMedia`）composable 的原因属实，不是借口。
- **FE-EP-04 原文核对**：`standards-frontend.md:253` 的 `applies-if` 列举五个场景——"使用 `el-select`/`el-input` 等设置宽度、控制 Element Plus 组件显隐、用 `el-dropdown` 作触发器、设置 `el-dialog` 的 `title`、定义 `el-select` option 的 `value`"。**其中不包含"el-dialog/el-drawer 的 width/size prop"**；`el-dialog`/`el-drawer` 的宽度通过组件自带、文档化的 `width`/`size` prop（配合 JS 变量）设置，属于组件公开 API 用法，不落入"用 inline style/class 直接设置宽度"这一被禁止的手法。因此 ic-v1-008/009/012 的弹窗/抽屉宽度场景**原本就不需要 `:deep()`**（它们改用 `matchMedia` 是为了驱动 `:size`/`:width` prop 的响应式取值，与 stylelint 是否放行 `:deep()` 无关），与本任务"el-select/el-input 必须靠 wrapper + `:deep()` 设宽度"是两个不同场景，不构成自相矛盾。
- **本次 `:deep()` 用法范围核实**：`grep -rn ':deep(' frontend/src` 全仓库只命中 `PolicyRecordTable.vue` 两处，分别是 `.policy-record-table__search-wrap { :deep(.el-input) { width: 100%; } }` 与 `.policy-record-table__filter-wrap { :deep(.el-select) { width: 100%; } }`，精确对应 FE-EP-04 明确允许的"el-select/el-input 设置宽度→外层 wrapper + `:deep()`"场景，无滥用到其他不需要 `:deep()` 的地方。
- **本次配置改动精确性核实**：`.stylelintrc.json` diff 只新增了一条 `selector-pseudo-class-no-unknown` 规则显式配置（默认已由 `stylelint-config-standard-scss` 启用，本次是补充 `ignorePseudoClasses: ["deep"]`），未触碰/未关闭其他任何规则。已用探针 `:unknown-pseudo` 实测该规则仍 fail-closed（见 enforcement 小节）。
- **结论**：两次改动服务于不同场景（弹窗宽度用组件 prop，无需 `:deep()`；表单控件宽度用 wrapper+`:deep()`，是 FE-EP-04 唯一允许手段），本次 lint 配置改动是首次真正触发该冲突后的最小化必要开口，不是重复造轮子，也不是对已确立规范的违反。不判定为 scope 违规。

### 2. `PolicyRecordHistoryDrawer.vue` 新增 `workOrderNo` 可选 prop

- 任务包 `files:` 清单未在 `PolicyRecordHistoryDrawer.vue` 一行提及此字段，PRD AC-09 oracle 原文也未提标题格式，实现者注释自称"纯 UX 辅助"。但独立核对 `iterations/v1/prototype.html:545`（任务包 `reference` 明确列出的权威交互基准）：`<h3>修改历史 · 工作单号 CSAE260508551</h3>`，即原型本身就把工作单号嵌入抽屉标题。实现的 `drawerTitle = computed(() => props.workOrderNo ? `修改历史 · 工作单号 ${props.workOrderNo}` : '修改历史')` 与原型格式逐字一致。
- **结论**：这不是范围外的行为变更/新契约，而是忠于任务包权威 `reference`（prototype.html）所需的最小信息，属于合理且必要的 design-fidelity 落地，不构成 scope-and-secrets 问题；若不加这个 prop 反而会与原型标题脱节。不判定为 finding。

## 验证记录（部分命令）

```
$ git diff d9601c7230932222117bc7669e5197fe91c33d2a 0461ff81b5cfa0b1891b6feef911594b8246643d -- <6 files> | sha256sum
6d3db278b31ea1ae0818842e349c2c9e14c3e5994ba493237b96f1f652b592c6  -   # 与派发值一致

$ cd frontend && npm run build      # vue-tsc -b && vite build → 成功
$ npm run lint:check                # 0 errors
$ npm run stylelint:check           # 0 errors

# 探针 1：验证 selector-pseudo-class-no-unknown 未被整体关闭
$ echo '<style scoped lang="scss">.probe{&:unknown-pseudo{color:red;}}</style>' > src/components/__ProbeStylelint.vue
$ npx stylelint src/components/__ProbeStylelint.vue
  ✖ selector-pseudo-class-no-unknown（对 :unknown-pseudo 仍报错，证明规则未被整体禁用）
$ rm src/components/__ProbeStylelint.vue

# 探针 2：反证 eslint-disable-next-line no-undef 的必要性
$ sed -i '/eslint-disable-next-line no-undef/d' src/components/PolicyRecordTable.vue
$ npx eslint src/components/PolicyRecordTable.vue
  5 errors（setTimeout/clearTimeout is not defined）
$ git checkout -- src/components/PolicyRecordTable.vue   # 还原，git diff --stat 复核无残留

# axios 参数序列化验证（AC-07 选 all 不传 fillStatus）
$ node -e "console.log(require('axios').getUri({url:'/x',params:{a:1,b:undefined,c:'all'}}))"
/x?a=1&c=all
```

## Findings

```yaml
findings:
  - id: ic-v1-010-F001
    dimension: design-fidelity
    severity: advisory
    type: contract-drift
    reachability: current
    evidence: >
      prototype.html 的保单记录明细表格表头固定 9 列（colspan="9"，见
      `<tr><th>客户名称</th>...<th>保单号</th></tr>`），无展开箭头列，交互提示文案为
      "点击整行展开编辑"；PolicyRecordTable.vue 使用 `<el-table-column type="expand">`
      作为第 1 列，Element Plus 会为该列渲染一个可独立点击的箭头图标（列数变为 10），
      与 prototype 的列结构不完全一致（功能上不受影响，见 standards/FE-TABLE-01 分析，
      handleRowClick 已正确跳过该列避免二次切换）。同时 prototype.html 的
      `.expand-row td { background: var(--bg-hover); padding: 14px 16px; }` 用背景色
      区分展开区域，而 PolicyRecordTable.vue 的 `&__expand-panel` 只设置了
      `padding: $space-sm`，未设置 `background-color: $bg-hover`。design.md 本身未对
      "是否需要展开箭头列/展开行背景色"作规范性要求，此差异仅体现在 prototype.html。
    impact: >
      纯视觉呈现差异：用户会多看到一个可点击的箭头图标列，展开面板背景与周围行同色而非
      原型设计的浅灰背景。不影响任何 AC 的功能性 oracle（展开/编辑/保存/查看历史均可达），
      manual-test 阶段人工走查即可确认是否需要按原型调整。
    action: backlog
    status: open
```
