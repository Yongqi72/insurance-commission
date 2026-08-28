<!-- develop 独立证据审查逐轮报告模板；首次 full，整改后默认 targeted。 -->
---
task_id: ic-v1-012
round: 2
mode: targeted
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-012/profile-round-01.json
prior_report: iterations/v1/code-reviews/ic-v1-012/round-01.md
target_finding_ids: [ic-v1-012-F001, ic-v1-012-F002]
base_ref: 27ce803208fbbde016daa77791e4b9059abf7c23
reviewed_base: 3a5d7f6650849a9ca613f5fa2657871894e7d067
reviewed_head: 1e8df04a9a1985b57fb0a3d8db2649d70a1b389e
diff_sha256: fd79bfb6507862475962fe31e2748e6d8d7f6c831c1621699f6bf7e267d221d8
changed_files:
  - frontend/src/api/commission-tier.ts
  - frontend/src/components/CommissionTierEditModal.vue
  - frontend/src/components/CommissionTierHistoryDrawer.vue
  - frontend/src/composables/useResponsiveDialogWidth.ts
  - frontend/src/views/CommissionTierView.vue
  - frontend/src/router/index.ts
  - frontend/src/layouts/AppLayout.vue
  - frontend/src/api/request.ts
started_at: 2026-08-28T02:50:48Z
completed_at: 2026-08-28T02:54:09Z
elapsed_minutes: 4
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "POST/PATCH /api/commission-tiers 命中 1005（区间重叠）或 1001（字段非法）时，request.ts 全局响应拦截器无条件对所有非 SUCCESS 错误码调用 ElMessage.error(envelope.msg)，与 CommissionTierEditModal.vue 弹窗内 #error-tier-conflict 字段级展示同时触发，违反 AC-11"
affected_regressions:
  - "修复引入的 suppressToastForCodes 机制若实现不当，可能导致其余未预期错误码（如后端 500 或非 1001/1005 的业务码）静默无 toast 反馈，违反 FE-ASYNC-01"
changed_surface_allowed:
  - frontend/src/api/request.ts（本轮新增变更文件；新增 axios 模块增强声明 + handleBusinessError 第二参数）
  - frontend/src/api/commission-tier.ts（createCommissionTier/updateCommissionTier 传入 suppressToastForCodes）
  - frontend/src/composables/useResponsiveDialogWidth.ts（F002 注释改写，去除 backlog 编号字面量）
```

sha256 复核：对 `reviewed_base`（646a3dba3e6fcbeb930844549208283e72c65075）→ `reviewed_head`（1e8df04a9a1985b57fb0a3d8db2649d70a1b389e）8 个 `changed_files` 固定 diff 执行 `git diff ... | sha256sum` 得到 `fd79bfb6507862475962fe31e2748e6d8d7f6c831c1621699f6bf7e267d221d8`，与派发值一致。

Changed surface 复核：`git diff --stat` 对比 round-01 `reviewed_head`（3a5d7f6650849a9ca613f5fa2657871894e7d067）与本轮 `reviewed_head`，本轮增量**只涉及 3 个文件**——`frontend/src/api/commission-tier.ts`（+9/-2）、`frontend/src/api/request.ts`（+14/-2）、`frontend/src/composables/useResponsiveDialogWidth.ts`（+6/-3），共 22 insertions / 7 deletions。`CommissionTierEditModal.vue`、`CommissionTierHistoryDrawer.vue`、`CommissionTierView.vue`、`router/index.ts`、`AppLayout.vue` 五个文件在两次 `reviewed_head` 之间 diff 为空，未被触碰。`escalate_to_full: false` 成立——本轮改动未引入新机制/新依赖/新根因，只是在既有共享请求层加了一个按请求可选的抑制开关，符合任务清单声明的修复范围。

## F001 复核（fix-mechanism）

- **改动机制**：`request.ts` 新增 `declare module 'axios' { interface AxiosRequestConfig { suppressToastForCodes?: number[] } }`，为 axios 请求配置扩展一个可选字段（类型声明合并，非运行时代码）；响应错误拦截器改为 `handleBusinessError(envelope, error.config?.suppressToastForCodes)`；`handleBusinessError` 新增第二参数，逻辑顺序为：① `UNAUTHORIZED` 分支最先判断，命中即 toast + `router.push('/login')` 并 `return`，不经过任何后续判断；② 非 UNAUTHORIZED 时若 `suppressToastForCodes?.includes(envelope.code)` 为真则直接 `return`（跳过 toast）；③ 否则执行原有 `ElMessage.error(envelope.msg || '请求失败')`。`commission-tier.ts` 的 `createCommissionTier`/`updateCommissionTier` 在 `request.post`/`request.patch` 第三参数传入 `{ suppressToastForCodes: [ErrorCode.CONFLICT, ErrorCode.VALIDATION_FAILED] }`。
- **1005/1001 不再弹全局 toast**：独立模拟验证（临时脚本跑完即删，未留痕）——`handleBusinessError({code:CONFLICT}, [CONFLICT,VALIDATION_FAILED])` 与 `handleBusinessError({code:VALIDATION_FAILED}, [...])` 均不触发 `ElMessage.error`，只有字段级 `#error-tier-conflict` 展示生效。核对通过。
- **其余错误码 toast 不受影响（本轮验证重点）**：同一独立脚本验证 `handleBusinessError({code:INTERNAL_ERROR}, [CONFLICT,VALIDATION_FAILED])`（模拟后端 500 或任何不在抑制列表内的码）仍正常调用 `ElMessage.error`，未因新增机制变得静默。逻辑上 `suppressToastForCodes` 是**白名单式**抑制（`includes` 判断，只匹配显式传入的码），而不是"命中即整体跳过 toast"的黑洞式改法，天然不会波及未预期错误码，符合 FE-ASYNC-01。核对通过，未发现新回归。
- **UNAUTHORIZED 不受影响**：代码顺序上 `UNAUTHORIZED` 分支在函数最前面且无条件 `return`，晚于它的 `suppressToastForCodes` 判断永远不会执行到；脚本额外验证即便假设性地把 `UNAUTHORIZED` 塞进抑制列表，toast + 跳转仍照常触发，证明该分支的独立性不依赖调用方是否传参。核对通过。
- **未被扩大的调用方**：`grep -rn "suppressToastForCodes"` 全仓库结果只有 `request.ts`（声明+读取）与 `commission-tier.ts` 的两处写操作，`fetchCommissionTiers`/`deleteCommissionTier`/`fetchCommissionTierChangeLogs` 三个函数的 `request.get`/`request.delete` 调用均未传第三参数，其错误路径 `error.config?.suppressToastForCodes` 为 `undefined`，`undefined?.includes(...)` 短路为 `undefined`（falsy），走原有全局 toast 分支。核对通过。
- **其他调用方零行为变化**：`commission-batch.ts`/`policy-record.ts`/`auth.ts` 三个文件在 round-01→round-02 之间 diff 为空（未在本轮改动之列），且它们的 `request.xxx()` 调用同样不传该字段，行为与改动前完全一致。核对通过。
- **类型声明合并正确性**：`cd frontend && npx vue-tsc -b` 全量类型检查，零输出零报错，`declare module 'axios'` 的接口合并未产生类型冲突或未使用变量告警；`npx eslint src/api/request.ts src/api/commission-tier.ts src/composables/useResponsiveDialogWidth.ts` 同样零报错。
- **结论**：F001 修复机制正确、完整覆盖反例场景，且未引入新的静默失败回归，判定 `status: verified-closed`。

## F002 复核（revise-doc）

- `useResponsiveDialogWidth.ts:6-11` 新注释：`grep -nE "ic-v1-0[0-9]+|F[0-9]+"` 对该文件执行，零命中——不再包含任何 `ic-v1-0\d+`/`F\d+` 形式的任务或 finding 编号字面量。
- 注释内容改写为纯业务语言："多处弹窗/抽屉都需要监听同一断点、在移动端与桌面端宽度之间切换，此前各处各自手写了一份字节级相同的 matchMedia 监听样板代码；提炼为共享 composable 后，后续新增弹窗/抽屉直接复用，不再重复实现"，仍清楚说明了该 composable 的提炼动机与用途，未损失可读性。
- **结论**：F002 修复到位，判定 `status: verified-closed`。

## Findings

```yaml
findings:
  - id: ic-v1-012-F001
    dimension: contract
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: >
      frontend/src/api/request.ts 新增 declare module 'axios' 扩展 AxiosRequestConfig.suppressToastForCodes，
      handleBusinessError 新增第二参数并在 UNAUTHORIZED 分支之后、默认 toast 之前插入
      `if (suppressToastForCodes?.includes(envelope.code)) { return }`；
      frontend/src/api/commission-tier.ts 的 createCommissionTier/updateCommissionTier 传入
      `suppressToastForCodes: [ErrorCode.CONFLICT, ErrorCode.VALIDATION_FAILED]`。
      独立模拟脚本验证：命中 CONFLICT/VALIDATION_FAILED 时 ElMessage.error 不再触发（字段级展示保留）；
      命中未在列表内的码（如 INTERNAL_ERROR）时 ElMessage.error 仍正常触发；UNAUTHORIZED 分支
      因位于函数最前且无条件 return，不受本次改动影响。fetchCommissionTiers/deleteCommissionTier/
      fetchCommissionTierChangeLogs 及 commission-batch.ts/policy-record.ts/auth.ts 均未传该字段，
      行为与改动前完全一致。npx vue-tsc -b 与 eslint 对三个改动文件全部零报错。
    impact: >
      已消除：1005/1001 不再与字段级错误同时弹全局 toast，且未引入"其余错误码静默无反馈"的新回归。
    action: fix-mechanism
    status: verified-closed
  - id: ic-v1-012-F002
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      frontend/src/composables/useResponsiveDialogWidth.ts:6-11 注释改写为纯业务语言描述提炼动机，
      grep -nE "ic-v1-0[0-9]+|F[0-9]+" 对该文件零命中，不再包含 backlog 任务/finding 编号字面量。
    impact: >
      已消除：注释不再存在脱离上下文后变成死引用的风险，且仍清楚说明该 composable 的用途。
    action: revise-doc
    status: verified-closed
```
