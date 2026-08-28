---
task_id: ic-v1-011
round: 2
mode: targeted
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-011/profile-round-01.json
prior_report: iterations/v1/code-reviews/ic-v1-011/round-01.md
target_finding_ids: [ic-v1-011-F001, ic-v1-011-F002, ic-v1-011-F003]
base_ref: 1d52013aa7123faa650ba5e4faea8367d10596bb
reviewed_base: 31674bbd0bf72c4be62e01f7f172cdc8065a3ac7
reviewed_head: 4d85ece576b3e46dae5199b39ca82fc3ba45feb3
diff_sha256: 12f76e4b38ca5fdeaf4b940bb54c618ec64a5b7343ff47a6d5f2e7eb195af6f6
changed_files:
  - frontend/src/api/request.ts
  - frontend/src/types/enums.ts
  - frontend/src/views/BatchDetailView.vue
  - frontend/src/api/commission-report.ts
  - frontend/src/components/CommissionSummaryPanel.vue
  - frontend/src/components/ExportHistoryDrawer.vue
started_at: 2026-08-28T04:56:48Z
completed_at: 2026-08-28T04:58:46Z
elapsed_minutes: 2
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples: []
affected_regressions: []
changed_surface_allowed:
  - frontend/src/api/request.ts（F001 修复：blob 错误分支新增 401 状态码判断）
  - frontend/src/types/enums.ts（F002 修复：注释去除任务号字面量）
  - frontend/src/components/CommissionSummaryPanel.vue（F003 修复：删除 loadBatchName/fetchBatchDetail，改用 prop）
  - frontend/src/views/BatchDetailView.vue（F003 配套：新增 :batch-name prop 传递）
```

- `diff_sha256` 复核：`git diff 258119a3...4d85ece5... -- <6个 changed_files> | sha256sum` = `12f76e4b38ca5fdeaf4b940bb54c618ec64a5b7343ff47a6d5f2e7eb195af6f6`，与派发值一致。
- `git diff --stat`（reviewed_base→reviewed_head，6 文件）与 round-01 完全一致（`commission-report.ts` +164、`request.ts` +18、`CommissionSummaryPanel.vue` +234、`ExportHistoryDrawer.vue` +104、`enums.ts` +2、`BatchDetailView.vue` +6/-2），本轮增量仅落在上面 4 个文件内；`git diff 31674bbd...4d85ece5... -- frontend/src/api/commission-report.ts frontend/src/components/ExportHistoryDrawer.vue` 为空，确认 `commission-report.ts`/`ExportHistoryDrawer.vue` 本轮未改动，changed surface 未越界。
- 本地执行 `npm run build`（`vue-tsc -b && vite build`）、`npm run lint:check`、`npm run stylelint:check` 均通过，无告警/报错。

## Target findings 复核

### F001（blocking → verified-closed）

`git diff 31674bbd...4d85ece5... -- frontend/src/api/request.ts` 增量：

```ts
if (error.config?.responseType === 'blob') {
  if (error.response?.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    ElMessage.error('登录状态已失效，请重新登录')
    router.push('/login')
  }
  return Promise.reject(error)
}
```

逐项核实：

1. **401 命中登出+跳转**：`error.response?.status === 401` 为真时，依次执行 `localStorage.removeItem(TOKEN_KEY)`、`ElMessage.error(...)`、`router.push('/login')`，随后仍 `Promise.reject(error)`——与非 blob 路径 `handleBusinessError()` 的 `UNAUTHORIZED` 分支（`request.ts:76-81`：`removeItem`+`ElMessage.error`+`router.push('/login')`+`return`）行为等价，均为清 token + 提示 + 跳转登录页，达成 SH-AUTH-01 一致性。提示文案由 `envelope.msg` 改为硬编码"登录状态已失效，请重新登录"，因 blob 场景无法同步读出 envelope，属该场景下的合理等价替代，不影响登出跳转这一核心诉求。
2. **非 401（如 2002）不触发登出**：`error.response?.status === 401` 为假时跳过整个 if 块，直接 `Promise.reject(error)`，`localStorage`/`ElMessage`/`router.push` 均不执行；已读 `commission-report.ts:97-119` 确认其自身 catch 会按 `content-type` + `Blob.text()` 异步解析出 `envelope.code`，`RULE_INCOMPLETE(2002)` 走专用 `CommissionReportRuleIncompleteError`，其余走通用错误——该解析路径完全保留，不受本次改动影响。
3. **blob 成功响应不受影响**：成功分支（`request.ts:38-51`）本轮 diff 只改了一行注释文字（删除"ic-v1-011："前缀），逻辑代码零改动，`responseType === 'blob'` 时仍原样 `return response`。
4. **判断依据是同步可读的 HTTP status，未引入对 blob 响应体的同步解析**：新增代码只读 `error.response?.status`（axios 同步暴露的 HTTP 状态码），未出现任何 `.text()`/`.json()`/`instanceof Blob` 等针对 `error.response.data`（Blob 实例）的同步访问；新增注释也明确写明"HTTP 状态码同步可读、无需解析 blob 响应体"，与实现一致。真正需要读 Blob body（区分 JSON 错误信封 vs 二进制文件、解析 2002）的逻辑仍在 `commission-report.ts` 里用 `await responseData.text()` 异步完成，两处职责边界清晰、未混淆。

结论：F001 修复达成预期，逻辑闭环、无新引入的副作用路径。**观察项（非新 finding，供参考）**：401 命中时，`request.ts` 拦截器与 `commission-report.ts` 的 catch 会先后各自处理一次同一个 error（前者做登出+跳转，后者异步 parse 出 1002 后走通用错误分支，冒泡到 `CommissionSummaryPanel.vue` 的 `handleExport` catch 再弹一次 `ElMessage.error`），可能出现两条提示先后出现；但 `router.push('/login')` 是同步调用，先于 `commission-report.ts` 的异步 `Blob.text()` 完成，用户观感上已被带离当前页，且第二条提示不影响 token 已清除、路由已跳转的核心安全结果，不构成新的 blocking 问题，不影响本 finding 判定为 closed。

### F002（advisory → verified-closed）

`grep -rniE "ic-v1-0[0-9]+" frontend/src/api/request.ts frontend/src/types/enums.ts frontend/src/components/CommissionSummaryPanel.vue frontend/src/views/BatchDetailView.vue frontend/src/api/commission-report.ts frontend/src/components/ExportHistoryDrawer.vue` 无命中（exit code 1）。

- `request.ts:39` 注释由"// ic-v1-011：responseType 'blob' 的成功响应体是 Blob..."改为"// responseType 'blob' 的成功响应体是 Blob..."，去除任务号前缀，业务语义完整保留。
- `enums.ts` 注释由"...ic-v1-011 补齐前端登记，后端 error-code.enum.ts 已有）。"改为"...后端 error-code.enum.ts 已有此码，此处补齐前端登记）。"，同样去除任务号，语义不变且更通顺。

两处均确认不再包含任务号字面量，注释仍清楚说明用途。

### F003（advisory → verified-closed）

`git diff 31674bbd...4d85ece5... -- frontend/src/components/CommissionSummaryPanel.vue` 确认：

- 删除 `import { fetchBatchDetail } from '@/api/commission-batch'`、删除 `loadBatchName()` 函数及其在 `onMounted`/`watch(batchId)` 中的调用、删除 `const batchName = ref('')`。
- `props` 由 `{ batchId: string }` 扩展为 `{ batchId: string; batchName?: string }`。
- `handleExport()` 内 `fallbackFileName` 由 `` `${batchName.value || props.batchId}-提成报表.xlsx` `` 改为 `` `${props.batchName || props.batchId}-提成报表.xlsx` ``——兜底文件名逻辑语义完全不变（值来源从内部 ref 换成同名 prop，`||` 短路兜底行为一致）。

`BatchDetailView.vue` 对应改动：`<CommissionSummaryPanel :batch-id="batchId" />` → `<CommissionSummaryPanel :batch-id="batchId" :batch-name="batch?.name" />`，`batch.value.name` 在 `loadDetail()`（既有代码，本轮未改）中已获取，父组件向下透传，不再产生子组件独立的 `GET /api/commission-batches/:id` 重复请求。

`grep -n "fetchBatchDetail" frontend/src/components/CommissionSummaryPanel.vue` 无命中，确认彻底移除。

## 结论

三项 target finding 均已闭环，changed surface 未越界（`commission-report.ts`/`ExportHistoryDrawer.vue` 本轮零改动），无新增 blocking 问题，`escalate_to_full: false`，`conclusion: pass`。

## Findings

```yaml
findings:
  - id: ic-v1-011-F001
    dimension: sensitive-boundaries
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: |
      frontend/src/api/request.ts:57-63（错误拦截器 blob 分支）新增：
        if (error.response?.status === 401) {
          localStorage.removeItem(TOKEN_KEY); ElMessage.error('登录状态已失效，请重新登录'); router.push('/login')
        }
        return Promise.reject(error)
      验证：401 命中时执行登出+跳转（与非 blob 路径 handleBusinessError 的 UNAUTHORIZED 分支行为等价）；
      非 401（如 2002）时跳过该块，交由 commission-report.ts 异步解析 Blob body 处理，未受影响；
      成功分支（blob 正常导出）逻辑零改动；判断依据是同步可读的 error.response?.status，未对 Blob
      响应体做任何同步解析（真正需要读 body 的 2002 判定仍在 commission-report.ts 用 await
      responseData.text() 异步完成）。build/lint/stylelint 均通过。
    impact: 修复后 1002/未登录场景下导出请求与其余请求路径行为一致，SH-AUTH-01 登出跳转机制不再被绕开。
      观察项：401 命中时 commission-report.ts 的 catch 仍会异步 parse 出 1002 并走通用错误分支，
      冒泡到 CommissionSummaryPanel.vue 弹出第二条提示，可能与拦截器的登出提示先后出现；但
      router.push('/login') 同步先行，不影响 token 已清除、路由已跳转的核心结果，不构成新的
      blocking 问题。
    action: fix-code
    status: verified-closed
  - id: ic-v1-011-F002
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: |
      grep -rniE "ic-v1-0[0-9]+" 对 request.ts/enums.ts/CommissionSummaryPanel.vue/
      BatchDetailView.vue/commission-report.ts/ExportHistoryDrawer.vue 无命中。
      request.ts:39 与 enums.ts 的两处注释均已去除任务号前缀，业务语义（blob 响应体特殊性说明、
      RULE_INCOMPLETE 补齐登记说明）完整保留。
    impact: 注释不再随任务号推进过时，可读性问题已消除。
    action: revise-doc
    status: verified-closed
  - id: ic-v1-011-F003
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: current
    evidence: |
      CommissionSummaryPanel.vue 已删除 loadBatchName()/fetchBatchDetail 调用及 batchName ref，
      props 新增 batchName?: string，handleExport() 的 fallbackFileName 改读 props.batchName，
      || 兜底语义不变。BatchDetailView.vue 改为 :batch-name="batch?.name" 传入已有的
      batch.value.name（loadDetail() 既有代码，本轮未改）。grep "fetchBatchDetail"
      CommissionSummaryPanel.vue 无命中，确认重复请求已消除。
    impact: 每次打开批次详情页不再多产生一次可避免的重复网络请求。
    action: backlog
    status: verified-closed
```
