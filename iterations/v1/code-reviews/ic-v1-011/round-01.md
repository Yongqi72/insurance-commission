---
task_id: ic-v1-011
round: 1
mode: full
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-011/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 1d52013aa7123faa650ba5e4faea8367d10596bb
reviewed_base: 258119a320c5ce13cde48dd486fd4a9dd9f3ce76
reviewed_head: 31674bbd0bf72c4be62e01f7f172cdc8065a3ac7
diff_sha256: 3c85d3a390f9914fbe68af490010675a1eabf338cb5d8e8baf42c7330fe61b13
changed_files:
  - frontend/src/api/commission-report.ts
  - frontend/src/api/request.ts
  - frontend/src/components/CommissionSummaryPanel.vue
  - frontend/src/components/ExportHistoryDrawer.vue
  - frontend/src/types/enums.ts
  - frontend/src/views/BatchDetailView.vue
started_at: 2026-08-28T04:45:20Z
completed_at: 2026-08-28T04:52:12Z
elapsed_minutes: 7
escalate_to_full: false
conclusion: revise
---

## 本轮范围

```yaml
counterexamples:
  - ic-v1-011-F001: 令牌过期后点击 #btn-export，request.ts 的 blob 错误分支短路跳过 handleBusinessError，localStorage 令牌不清、不跳转 /login
affected_regressions: []
changed_surface_allowed:
  - frontend/src/api/request.ts（不在任务包 files 清单，已核实：仅对 responseType==='blob' 生效，不影响 suppressToastForCodes 等既有机制，属必要配套改动）
  - frontend/src/types/enums.ts（不在任务包 files 清单，已核实：RULE_INCOMPLETE=2002 与后端 common/constants/error-code.enum.ts 数值一致，属补齐登记而非引入新定义）
```

- `diff_sha256` 复核：对 profile 列出的 6 个文件执行 `git diff 258119a3...31674bb... -- <changed_files> | sha256sum`，结果 `3c85d3a390f9914fbe68af490010675a1eabf338cb5d8e8baf42c7330fe61b13`，与派发值一致。
- `git diff --stat` 确认改动范围恰好等于 profile `changed_files` 六个文件，无越界改动；`grep -inE "csv|pdf|password|secret|token=|apikey|access_key|snapshot"` 全 diff 无命中。
- 本地执行 `npm run build`（`vue-tsc -b && vite build`）、`npm run lint:check`、`npm run stylelint:check` 均通过，无告警/报错（构造级机械证据，项目当前无前端单测惯例，`find frontend/src -iname "*.spec.ts" -o -iname "*.test.ts"` 为空，与既有其余组件一致，非本任务独有缺口）。

## 两处已知偏离核实结论

### 1. `frontend/src/api/request.ts` 的 blob 旁路

**不加旁路确会误判**：`responseType:'blob'` 时 `response.data`/`error.response.data` 均为 `Blob` 实例。原拦截器成功分支 `const envelope = response.data as ApiEnvelope<unknown>; if (envelope.code !== ErrorCode.SUCCESS)`——`Blob` 对象没有 `code` 属性，`undefined !== 0` 恒真，会把每次导出成功的二进制响应误判为业务错误并 `Promise.reject`，进而触发 `handleExport` 的 catch 分支——即"每次成功导出都会弹错误 toast"的描述属实、可复现（逻辑层面已验证，无需额外脚本）。错误分支同理，`error.response.data` 是不可读的 `Blob`，`handleBusinessError` 会把它当 envelope 处理，`envelope.msg` 为 `undefined`，退化为固定文案"请求失败"，且 2002 分支永远命中不到（`envelope.code` 恒为 `undefined`）。

**旁路范围精确**：`request.ts:42-44`（成功分支）与 `request.ts:55-57`（错误分支）均以 `responseType === 'blob'` 为门槛，只对本任务新增的 `exportCommissionReport` 命中；`suppressToastForCodes` 机制（`request.ts:19-21`、`handleBusinessError` 内 `suppressToastForCodes?.includes(...)`）未被触碰，非 blob 请求的既有行为不受影响——已读非 blob 分支逻辑确认无改动。

**`commission-report.ts` 的 blob 错误解析基本正确，但有遗漏**（见下方 F001）：`contentType.includes('application/json')` 正确区分了 JSON 错误信封与真实 Excel 二进制（成功响应 `Content-Type` 固定为 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`，不含 `application/json`，不会被误当错误尝试解析）；对 2002 的识别路径（`envelope?.code === ErrorCode.RULE_INCOMPLETE` → 抛 `CommissionReportRuleIncompleteError`）验证正确、与其余错误码文案区分展示，满足 AC-15 字面要求。但这一遗漏（旁路使 1002 未登录场景跳过全局登出跳转）不在已知风险清单内，是本轮新发现，见 F001。

### 2. `frontend/src/types/enums.ts` 新增 `RULE_INCOMPLETE: 2002`

已读 `backend/src/common/constants/error-code.enum.ts:13`：`RULE_INCOMPLETE = 2002`，与前端新增数值完全一致，属前端登记补齐，非引入新定义或不一致。已核实全局异常过滤器 `backend/src/common/filters/all-exceptions.filter.ts:68` 将 `HttpStatus.UNPROCESSABLE_ENTITY`（`RuleIncompleteException` 使用的状态码）映射到 `ErrorCode.RULE_INCOMPLETE`，链路自洽。

注释点名任务号问题属实，且不止 `enums.ts` 一处，见 F002（`comment-hygiene`）。

## AC 逐条核对

- **AC-14**：`CommissionSummaryPanel.vue` 挂载/`batchId` 变化时调用 `fetchCommissionSummary`（`onMounted`+`watch`）；`ruleComplete=false` 展示 `#commission-unconfigured` 且 `v-else-if` 分支下不渲染 `#grid-commission-summary`；`ruleComplete=true` 按 `groups`/`items`/`subtotal` 渲染，`commission`/`subtotal` 直接展示后端字段（`.toFixed(2)`），未在前端重新计算——与后端 `CommissionSummaryItemDto`/`CommissionSummaryGroupDto` 字段名精确对应，示例场景（常熟¥80.00/太仓¥40.00）逻辑成立。无发现。
- **AC-15**：`#btn-export` 触发 `exportCommissionReport`（`responseType:'blob'`），文件名优先 `Content-Disposition`（`extractFileName` 正确兼容 `filename*=UTF-8''...` 与后端 `commission-report.controller.ts:44-47` 实际发出的头格式），取不到兜底"{批次名}-提成报表.xlsx"；成功 `ElMessage.success('导出成功')`（FE-ASYNC-03）；2002 走专用 `CommissionReportRuleIncompleteError` 展示、与其余错误码不混淆（FE-ASYNC-01）。字面 oracle 满足，但见 F001（同一实现路径下 1002 未登录场景的次生问题）。
- **AC-16**：空 `items` 分组展示"当前没有已确认销售人员的记录"（与原型 `#card-commission-empty` 文案一致）；`v-if="group.items.length === 0"` 分支不展示 `subtotal`，不会出现误导性合计；导出按钮无任何基于分组/规则状态的 `:disabled` 绑定，不因空分组禁用。id 分配策略核实：`firstEmptyPolicyholder` 仅给首个空分组挂 `id="card-commission-empty"`，其余空分组仍走同一 `v-if` 分支和同一 class 渲染相同文案，只是没有具名 id——后端 `groupByPolicyholder`（`commission-report.service.ts`）按 `Map` 去重，`groups` 内 `policyholder` 天然唯一，不会出现 id 误配到错误分组的情况；HTML id 本身要求页面内唯一，"只给第一个具名"是合理且必要的处理，未违反 oracle 意图（oracle 只要求空态文案展示，未要求逐个空分组都有专属 id）。无发现。
- **AC-17**：`ExportHistoryDrawer.vue` 用 `el-drawer`（FE-EP-06），视觉/结构与 `PolicyRecordHistoryDrawer.vue` 高度一致（`useResponsiveDialogWidth('480px','100%')`、`DataStateWrapper` 四态、`formatDateTime` 复用）；不依赖前端排序，直接展示后端已按 `exportedAt` 倒序的结果；"重新下载"用 `record.downloadUrl` 直接 `triggerUrlDownload`，未调用导出计算接口；空态用 `DataStateWrapper` 的 `empty-text="暂无导出记录"`。新增 id（`drawer-export-history`/`export-history-body`）为自行设计，未冒充 prototype.html 已有锚点，符合 do-not 约束。无发现。
- **技术 AC**：`CommissionSummaryPanel.vue` `.commission-summary-panel__grid` 用 `@media (width <= $breakpoint-mobile)` 降单列，`$breakpoint-mobile: 768px`（`variables.scss:89`），与 `LoginView.vue`/`ImportPanel.vue` 既有写法一致；抽屉宽度 <768px 变 100% 同上验证。无发现。

## do-not 边界核对

- 未见按其他维度分 sheet、导出 PDF/CSV 的代码或 UI（`grep` 全 diff 无 csv/pdf 命中）。
- 未见提成计算结果快照：前端不落地任何汇总/导出数字到 store/localStorage，只做一次性展示；后端 `commission-report.service.ts` 注释与实现也确认导出记录只存 `ossKey`/`exportedAt`，不存计算结果。
- AC-17 新 id 未冒充 prototype 锚点（见上）。

## 维度结论（selected_dimensions 逐项声明）

- `contract`：AC-14~AC-17 及技术 AC 逐条核对见上「AC 逐条核对」——无发现。
- `scope-and-secrets`：diff 未触碰 do-not 边界；改动文件集合恰好等于 profile `changed_files`（6 个，含 2 个不在任务包 `files` 清单内但已独立核实为必要配套改动，见上）；全 diff 未见明文密钥/token/密码。无发现。
- `test-evidence`：项目当前无前端单测惯例（`find frontend/src -iname "*.spec.ts" -o -iname "*.test.ts"` 全仓为空，非本任务独有缺口）；本任务的机械等价证据为 `npm run build`（`vue-tsc -b` 类型检查通过）、`npm run lint:check`、`npm run stylelint:check` 三者全绿，与项目现状一致。无发现。
- `comment-hygiene`：见 F002（新增注释点名任务号，2 处）。
- `standards`：FE-EP-06（抽屉范式）、FE-ASYNC-01/03（失败/成功反馈）、FE-RESPONSIVE-01（移动端降级）均逐条核对见上「AC 逐条核对」，均满足。无发现。
- `enforcement`：本任务未新增/修改任何检查器或机械强制机制本身；FE-DESIGN-01（stylelint）等既有机械检查在改动文件上实测通过（`npm run stylelint:check` 无告警），未见绕过或削弱既有 enforcement 覆盖面。无发现。
- `design-fidelity`：色彩/字号/圆角/阴影均引用 `variables.scss` 既有 token（`$fs-h3`/`$fw-h3`/`$space-*`/`$radius-md`/`$shadow-md`/`$border-color`/`$text-hint` 等），未见硬编码字面值；与 `prototype.html` 交互路径（`#btn-export`/`#grid-commission-summary`/`.summary-card`/`#card-commission-empty`/`#commission-unconfigured`）及 `PolicyRecordHistoryDrawer.vue` 抽屉视觉基准比对一致；prototype demo CSS 的字面 padding（`14px 16px`）被合理替换为 `$space-md` 等 token，属遵循 design.md 而非偏离。无发现。
- `logging-privacy`：diff 中未新增任何 `console.*`/日志调用；`loadBatchName()` 的 catch 静默吞错未打印，无敏感信息落日志风险面。无发现。
- `maintainability`：见 F003（`CommissionSummaryPanel.vue` 独立重新拉取批次名，与父组件已有数据重复）。
- `sensitive-boundaries`：见 F001（导出请求 401 场景绕开全局登出跳转）；金额/提成数字侧已核实前端只做展示转发，未见任何前端侧二次计算（详见「AC 逐条核对」AC-14/16）。

## Findings

```yaml
findings:
  - id: ic-v1-011-F001
    dimension: sensitive-boundaries
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: |
      frontend/src/api/request.ts:52-65（错误拦截器）：
        if (error.config?.responseType === 'blob') { return Promise.reject(error) }
      该短路发生在调用 handleBusinessError() 之前。handleBusinessError()（request.ts:68-79）是
      SH-AUTH-01「token 失效前端统一跳转 /login」的唯一实现点：
        if (envelope.code === ErrorCode.UNAUTHORIZED) {
          localStorage.removeItem(TOKEN_KEY); ElMessage.error(...); router.push('/login'); return
        }
      复现路径：管理员停留在批次详情页，JWT 过期（或被后端使其失效）后点击 #btn-export
      （CommissionSummaryPanel.vue handleExport → exportCommissionReport，responseType:'blob'）→
      后端返回 401，envelope {code:1002,...}，但因 responseType:'blob'，axios 仍把该 JSON 错误体
      解析为 Blob（commission-report.ts 自身注释也确认此行为，见 known-risks 原文）→
      request.ts:55-57 直接 reject，不调用 handleBusinessError → 冒泡至
      commission-report.ts exportCommissionReport 的 catch：contentType 含 application/json 且
      responseData instanceof Blob → parse 出 envelope，code=1002≠RULE_INCOMPLETE(2002) →
      走通用 `throw new Error(envelope?.msg || '导出失败，请稍后重试')` → CommissionSummaryPanel.vue
      handleExport 的 catch 只区分 CommissionReportRuleIncompleteError，其余一律
      `ElMessage.error(error.message)` → 用户看到一条提示消息，但 localStorage 中的失效 token
      未被清除、也未跳转 /login，与项目内其余所有非 blob 请求路径（如汇总/导出历史查询）在同样
      401 场景下的行为不一致。
    impact: |
      1002/未登录场景下，导出这一条请求路径绕开了全局登出跳转机制（SH-AUTH-01），用户停留在
      已失效会话的页面上，需自行刷新/导航才会被真正带回登录页；不会造成额外数据泄露（其余请求
      仍会各自触发相同 401，最终仍会登出），但属于本任务新增代码引入的、可复现的标准偏离。
    action: fix-code
  - id: ic-v1-011-F002
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: |
      frontend/src/api/request.ts:39（新增注释 "// ic-v1-011：responseType 'blob' 的成功响应体是 Blob..."）
      frontend/src/types/enums.ts（新增注释 "/** ...ic-v1-011 补齐前端登记，后端 error-code.enum.ts 已有）。 */"）
      两处新增注释均点名任务号，项目历史已多次复现同类问题（派发说明已预警）。
    impact: 任务号语义会随迭代推进过时，注释可读性随时间下降；不影响当前行为正确性。
    action: revise-doc
  - id: ic-v1-011-F003
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: current
    evidence: |
      CommissionSummaryPanel.vue 的 loadBatchName()（调用 fetchBatchDetail(props.batchId)）在
      onMounted/watch(batchId) 时与 loadSummary() 一起无条件触发，仅用于导出兜底文件名
      （batchName.value || props.batchId）。父组件 BatchDetailView.vue 已在 loadDetail()
      （BatchDetailView.vue:69-81）拉取过同一批次的 batch.value.name，且
      BatchDetailView.vue 本就在任务包 files 允许编辑范围内（用于插入本组件挂载点）——
      可以用一个 `:batch-name="batch?.name"` prop 把已有数据传下去，而不是让子组件对同一批次
      再发一次独立的 GET /api/commission-batches/:id 请求。
    impact: 每次打开批次详情页多产生一次可避免的重复网络请求（用于一个极少触发的兜底路径：
      仅当 Content-Disposition 头解析失败时才用得到该文件名），非功能性缺陷。
    action: backlog
```
