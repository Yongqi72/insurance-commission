<!-- develop 独立证据审查逐轮报告模板；首次 full，整改后默认 targeted。 -->
---
task_id: ic-v1-012
round: 1
mode: full
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-012/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 27ce803208fbbde016daa77791e4b9059abf7c23
reviewed_base: 646a3dba3e6fcbeb930844549208283e72c65075
reviewed_head: 3a5d7f6650849a9ca613f5fa2657871894e7d067
diff_sha256: a5ad90fb655b497c5dd698957dbdbd2e177f32bf91176d31fe918f6b735f6486
changed_files:
  - frontend/src/api/commission-tier.ts
  - frontend/src/components/CommissionTierEditModal.vue
  - frontend/src/components/CommissionTierHistoryDrawer.vue
  - frontend/src/composables/useResponsiveDialogWidth.ts
  - frontend/src/layouts/AppLayout.vue
  - frontend/src/router/index.ts
  - frontend/src/views/CommissionTierView.vue
started_at: 2026-08-28T02:37:02Z
completed_at: 2026-08-28T02:45:13Z
elapsed_minutes: 9
escalate_to_full: false
conclusion: revise
---

## 本轮范围

```yaml
counterexamples:
  - "POST/PATCH /api/commission-tiers 命中 1005（区间重叠）或 1001（字段非法）时，request.ts 全局响应拦截器无条件对所有非 SUCCESS 错误码调用 ElMessage.error(envelope.msg)，与 CommissionTierEditModal.vue 弹窗内 #error-tier-conflict 字段级展示同时触发，违反 AC-11 oracle 明文『不用全局 toast 掩盖具体字段』"
affected_regressions: []
changed_surface_allowed:
  - frontend/src/api/commission-tier.ts
  - frontend/src/components/CommissionTierEditModal.vue
  - frontend/src/components/CommissionTierHistoryDrawer.vue
  - frontend/src/composables/useResponsiveDialogWidth.ts (超出任务包 files 清单，已独立核实为正当扩展，见下方说明)
  - frontend/src/layouts/AppLayout.vue
  - frontend/src/router/index.ts
  - frontend/src/views/CommissionTierView.vue
```

diff_sha256 已复核一致：对 `changed_files` 固定 diff 执行 `git diff 646a3dba3e6fcbeb930844549208283e72c65075 3a5d7f6650849a9ca613f5fa2657871894e7d067 -- <7 files> | sha256sum` 得到 `a5ad90fb655b497c5dd698957dbdbd2e177f32bf91176d31fe918f6b735f6486`，与派发值一致。`git diff --stat` 全量确认两 tree 间只有这 7 个文件产生变化（666 insertions / 0 deletions，全为新增/小幅编辑，无删除行），ic-v1-008/ic-v1-009 的 `commission-batch.ts`/`ImportPanel.vue`/`BatchDetailView.vue`/`BatchListView.vue` 四个文件在两 tree 间 diff 输出为空，确认零变化。

## 已知偏离核实结论：`useResponsiveDialogWidth.ts`

独立核实结论：**该文件确系纯样板提炼，未引入新机制/新依赖，正当**。

- 逐行比对 `BatchListView.vue`（旧 `dialogWidth`/`mobileMediaQuery`/`syncDialogWidth`，`MOBILE_BREAKPOINT_QUERY='(max-width: 768px)'`，onMounted 里 `matchMedia` + `addEventListener('change', ...)`，onBeforeUnmount 里 `removeEventListener`）与 `ImportPanel.vue`（同名变量、同一套逻辑，backlog.md 已记录为「字节级相同」的复制）：两处旧实现与 `useResponsiveDialogWidth.ts` 的 `sync()`/`onMounted`/`onBeforeUnmount` 逻辑在断点值、事件监听/清理时机、返回值语义上完全一致，只是把 `ref` 换成组合式函数返回值、并新增了 `mobileWidth` 可配参数（`CommissionTierHistoryDrawer.vue` 传 `'100%'` 覆盖默认 `'95vw'`，用于抽屉；`CommissionTierEditModal.vue` 用默认值 `'95vw'` 服务弹窗）——这个参数化正是 backlog `ic-v1-008-F004` 原文建议的形态，不是新机制。
- `git diff --stat` 已确认 `BatchListView.vue`/`ImportPanel.vue` 零改动，实现者说的「没有回头改造旧代码」属实——两处旧样板仍原样保留，重复仍然存在，只是没有再长出第三份重复。
- backlog.md 中 `ic-v1-008-F004`/`ic-v1-009-F003` 两条欠账：**判定为维持原样（未解决），不应标记已消解**。这两条欠账描述的具体对象是 `BatchListView.vue`/`ImportPanel.vue` 内联样板代码本身的重复，本次改动完全没有触碰这两个文件，重复代码依然存在；新增的 composable 只是为「以后回头清理」准备好了目标，backlog.md 本身也未在本次 diff 中被更新（`git diff ... -- backlog.md` 为空）。建议后续清理旧代码或收尾 iteration 时，在 backlog.md 该两条追加一行"消费方 composable 已就绪于 `useResponsiveDialogWidth.ts`"，但这不是本任务 files 清单内的义务，不作为本轮阻断项。
- 该文件虽不在任务包 `files:` 六项清单内，但改动范围极窄（32 行纯样板抽取）、无新依赖、仅服务本任务新增的两个组件、且有 backlog 先例明确预判并建议此改动，判定为"有正当理由"的清单外改动，不计入 scope-and-secrets 阻断。

## 逐维度审查

### contract

- AC-10（独立请求，不整表保存）：`CommissionTierView.vue` 新增走 `openAddModal`→`CommissionTierEditModal.vue`→`POST /api/commission-tiers`；编辑走 `openEditModal`→同弹窗→`PATCH /api/commission-tiers/:id`；删除走行内“删除”按钮→`ElMessageBox.confirm`→`DELETE /api/commission-tiers/:id`。三者均为独立请求。成功后 `handleSaved()`/`handleDelete()` 均调用 `loadTiers({ quiet: true })`，该函数在 `quiet=true` 时不把 `status` 打回 `'loading'`（不产生骨架闪烁），也不会在失败时把已渲染内容替换为错误态——只是重新 GET 一次全表渲染，不存在"要求其余档位重新提交"的行为。核对通过，无发现。
- AC-11（关键 AC）：见下方独立小节「AC-11 深挖」——**发现阻断项 ic-v1-012-F001**。
- AC-12（排序 + ruleComplete + 空态）：
  - 排序：后端 `commission-tier.service.ts:88-93` `findAll()` 用 `order: { lowerBound: 'ASC' }` 查询，前端 `CommissionTierView.vue` 直接渲染 `tiers.value = result.tiers`，未做二次排序，完全依赖后端顺序——与 TRD"按 `lowerBound` 升序（GET /api/commission-tiers）"一致，前端未重复实现排序逻辑，无发现。
  - `ruleComplete` 字段名逐字核对：`frontend/src/api/commission-tier.ts:11-14` `CommissionTierListResult { tiers, ruleComplete }`；后端 `commission-tier.service.ts:17-20` 同名接口 `CommissionTierListResult { tiers: CommissionTier[]; ruleComplete: boolean }`，`findAll()` 返回 `{ tiers, ruleComplete: ruleComplete(tiers) }`（`rule-complete.util.ts` 三条件判定，逐字与 TRD 描述一致）。字段名前后端完全一致，known-risks 提示的风险点未命中。
  - 空态与不完整提示互斥性核对：`CommissionTierView.vue` `loadTiers()` 里 `status.value = result.tiers.length === 0 ? 'empty' : 'success'`；不完整提示 `<el-alert v-if="status === 'success' && !ruleComplete">` 仅在 `status==='success'` 时可能出现。当 0 档位时 `status` 必为 `'empty'`（不可能是 `'success'`），提示天然不会与空态同时出现；当 ≥1 档位且 `ruleComplete=false`（有空隙）时 `status='success'` 且提示显示；`ruleComplete=true` 时提示不显示。三态互斥、正确，无发现。
- AC-13（变更历史抽屉）：
  - 排序：后端 `findChangeLogs()` 用 `order: { changedAt: 'DESC' }`；前端 `CommissionTierHistoryDrawer.vue` 直接渲染 `logs.value = await fetchCommissionTierChangeLogs()`，未二次排序，依赖后端顺序，与 TRD 一致。
  - 渲染字段完整性：`describeLog()` 对 `create`/`delete`/`update` 三种 `operationType` 分别渲染操作类型（"新增档位"/"删除档位"/"编辑档位 A → B"）+ 变更前→变更后（`beforeSnapshot`/`afterSnapshot` 快照的区间与单价），并在模板里额外渲染 `{{ log.operator }} · {{ formatDateTime(log.changedAt) }}`（操作人/时间）。四要素齐全，无发现。
  - 空态：`logs.value.length === 0` 时 `status='empty'`，`DataStateWrapper` 用 `empty-text="暂无变更记录"` 渲染，与 oracle 一致。
- 技术 AC（dirty + 离开二次确认）：见「dirty 时机深挖」小节，无发现（逻辑正确）。
- 技术 AC（删除二次确认）：`CommissionTierView.vue.handleDelete()` 先 `await ElMessageBox.confirm(...)`，`catch { return }` 分支在用户取消/关闭确认框时直接 `return`，不会执行到下方 `deleteCommissionTier(row.id)`；只有 confirm 的 Promise resolve（点击"确定删除"）才会继续发起 DELETE。核对通过，无发现。

#### AC-11 深挖（1005/1001 展示机制）

- 后端字段/错误码核对（逐字）：
  - `commission-tier.service.ts:257-263` `assertNoConflict()` 命中重叠时抛 `ConflictException`；`all-exceptions.filter.ts:66-67` 把 HTTP 409 映射为 `ErrorCode.CONFLICT`（`error-code.enum.ts` 中 `CONFLICT = 1005`）——与 TRD "1005（区间重叠）" 一致。
  - `assertBoundsOrdered()`（下限≥上限）与 DTO 校验（`upsert-commission-tier.dto.ts` 的 `@IsInt`/`@Min(0)`/`@IsPositive` 触发 Nest 默认 `ValidationPipe`）均抛 `BadRequestException`，HTTP 400 → `ErrorCode.VALIDATION_FAILED = 1001`——与 TRD "1001（单价非正数/下限≥上限）" 一致。
  - 前端 `frontend/src/types/enums.ts` `ErrorCode.CONFLICT=1005`/`VALIDATION_FAILED=1001`，与后端 `error-code.enum.ts` 数值完全一致；`CommissionTierEditModal.vue:245-250` 的判断 `code === ErrorCode.CONFLICT || code === ErrorCode.VALIDATION_FAILED` 覆盖两个码，写入同一个 `conflictError`（在 `#error-tier-conflict` 展示），两个码不会互相混淆（用同一展示位置、同一处理逻辑属于 oracle 允许的"同样以字段级展示"，不是缺陷）。
  - "不关闭弹窗"核对：`handleSave()` 的 `catch` 分支只设置 `conflictError.value`，不调用 `closeDialog()`；`finally` 只复位 `submitting`，弹窗保持打开。核对通过。
- **发现（ic-v1-012-F001，阻断）**：见下方 Findings。全局 toast 与字段级错误同时出现，字面违反 AC-11 "不用全局 toast 掩盖具体字段"的明确指示。

#### dirty 时机深挖（技术 AC）

- `CommissionTierEditModal.vue` 用 `initializing` 标志防止编辑弹窗打开回填初始值时被误判为已修改：`watch(visible, ...)` 在 `value===true` 时先置 `initializing=true`，同步写入 `form.lowerBound`/`form.upperBound`/`form.unitPrice`/`conflictError`/`dirty=false`，随后用 `nextTick(() => { formRef.value?.clearValidate(); initializing=false })` 延迟复位。另一个 `watch(form, ..., {deep:true})` 在 `initializing===true` 时直接 `return`，不置 `dirty=true`。
- 追踪 Vue 3 调度顺序：三次表单字段赋值触发的 `form` deep watcher任务，与触发它的 `visible` watcher 同属一次响应式 flush（默认 `flush:'pre'`，触发的新任务会被加入同一次 `flushJobs()` 循环内处理），而 `nextTick()` 的回调是在 `flushJobs()` 整体执行完毕后才通过 `currentFlushPromise.then()` 触发。因此 `form` deep watcher 一定在 `initializing` 被复位为 `false` 之前运行，此时其内部判断为真、直接 `return`，不会误置 `dirty=true`。逻辑在这套调度语义下是正确的（无自动化测试佐证，见 test-evidence 维度）。

### scope-and-secrets

- Do-not 边界核对：
  - "不支持回滚到历史某版本"：`CommissionTierHistoryDrawer.vue` 全文无任何"应用此历史版本"/"回滚"按钮或交互，`describeLog()` 只做只读文案渲染，无发现越界。
  - "不支持多套规则并存/差异化定价"：全部改动只针对单一 `/api/commission-tiers` 端点操作单一阶梯表，无按分站/业务类型筛选或切换规则集的 UI/参数，无发现越界。
  - "不做整表统一保存"：无"保存全部"按钮，无本地缓存多档待提交的机制，`form`/`dirty` 状态只属于当前弹窗编辑的单个档位。无发现越界。
- Files 清单核对：`git diff --stat` 确认改动文件正好是 profile `changed_files` 的 7 个文件，无清单外改动（`useResponsiveDialogWidth.ts` 虽不在任务包原始 6 文件清单内，但已在独立小节判定为有正当理由的清单外扩展，不计入本维度阻断）。
- 明文密钥/凭据扫描：`grep -n "token\|secret\|password\|AKIA\|-----BEGIN"`（人工通读 7 个文件全文）未发现任何硬编码凭据/密钥；`localStorage` 只在既有 `request.ts`（未改动）中读取 token，本任务改动文件未直接接触凭据。
- 结论：无发现。

### test-evidence

- 本仓库前端目前无任何测试基础设施：`frontend/package.json` 无 `test` script、无 `vitest`/`@vue/test-utils` 依赖，全仓库 `find . -iname "*.spec.ts"` 为空（不止本任务，ic-v1-008/009 等既有已批准任务同样没有单测）。这是仓库级已知现状，不是本任务新引入的缺口。
- 按本仓库 `templates/checklists/frontend-checklist.md` 的三段式约定，机械项归 lint/type-check/stylelint（已实测：`npm run lint:check`、`npm run stylelint:check`、`npx vue-tsc -b` 三项全部零输出、零报错，见下方 enforcement 小节），视觉/交互留人工走查（manual-test/pinchtab 兜底），"可测逻辑写测试"一档在本仓库目前对新增前端模块普遍未落地（历史遗留缺口，非本任务独有）。
- 本任务里"可测逻辑"程度最高的两处（`toNumberOrNull`/校验规则的边界判断、`initializing`/`dirty` 时序）目前只有源码可读性佐证与本轮人工推导的调度顺序论证，没有可回归的机械测试；鉴于这是仓库级系统性缺口而非本任务独有引入，且已有的 lint/type-check/stylelint 全绿，不单独判定本任务的阻断项，作为过程观察记录，不列 finding（不重复审查已被架构接受的仓库级现状）。

### comment-hygiene

- **发现（ic-v1-012-F002，建议）**：见下方 Findings。`useResponsiveDialogWidth.ts:9` 注释点名了 `ic-v1-008-F004`/`ic-v1-009-F003` 两个 backlog 任务编号。
- 其余 6 个文件通读未发现点名任务号/迭代号的注释；"不得/禁止 X"类注释（如 `commission-tier.ts` 的"调用方需在弹窗内字段级展示，不当作全局错误处理"、`commission-tier.entity.ts` 风格的前提说明）均带成立前提，无裸命令式禁止语句。

### standards

- FE-EP-05（编辑弹窗未保存二次确认）：`dirty` 标志 + `handleBeforeClose`/`handleCancel` 均走 `confirmLeaveIfDirty()`，符合。
- FE-EP-06（只读历史用右侧抽屉不用弹窗）：`CommissionTierHistoryDrawer.vue` 用 `el-drawer`，符合。
- FE-EP-03（删除二次确认）：`ElMessageBox.confirm` 前置，符合。
- FE-EP-02（el-dialog 显式 align-center）：`CommissionTierEditModal.vue` 的 `el-dialog` 标签带 `align-center`，符合。
- FE-ASYNC-01（异步失败必须有用户可见反馈）：全局拦截器保证所有失败请求都有 toast，符合（但展示机制的精细化要求见 F001）。
- FE-ASYNC-02（表单校验统一 Promise 式）：`await formRef.value.validate()` + try/catch，符合。
- FE-ASYNC-03（写操作成功后必须有用户可见反馈）：`ElMessage.success('保存成功...')`/`ElMessage.success('删除成功...')`，符合。
- FE-RESPONSIVE-01（弹窗/抽屉/多列布局移动端降级）：`useResponsiveDialogWidth` 断点 768px，弹窗降级 95vw、抽屉降级 100%，符合 design.md §六。
- 结论：无发现（F001 记在 contract 维度，不重复计入 standards）。

### enforcement

- 实测 `npm run lint:check`（eslint）、`npm run stylelint:check`（stylelint）、`npx vue-tsc -b`（类型检查）三项命令对本次 7 个改动文件全部零输出、零报错，确认既有的 硬编码设计字面值 stylelint 规则、事件监听配对 eslint 规则、类型契约检查均对新文件生效（fail-closed 覆盖到位，不是新文件绕过了检查配置）。
- 结论：无发现。

### design-fidelity

- 字号/间距/颜色：`CommissionTierView.vue`/`CommissionTierEditModal.vue`/`CommissionTierHistoryDrawer.vue` 三个 `<style>` 块全部通过 `@use '@/styles/variables.scss' as *` 引用 `$fs-h2`/`$fs-caption`/`$fs-small`/`$space-xs/sm/md`/`$text-primary`/`$text-hint`/`$color-danger`/`$border-color`/`$input-width-sm` 等既定 token，无字面值（stylelint 零报错佐证）。
- 交互路径核对 prototype.html：`#btn-add-tier`→新增弹窗、`#btn-view-rule-history`→变更历史抽屉、`#error-tier-conflict`→字段级冲突提示位、`#modal-rule-edit`（对应 `el-dialog`）下限/上限/单价三字段、`#empty-rule-list`（经既有 `DataStateWrapper` 空态承接，与 ic-v1-008/009 已批准的空态实现模式一致，非本任务新引入的差异）——交互流程与原型 S10~S12 一致。
- 响应式：弹窗 95vw、抽屉 100%，移动端断点 768px，与 design.md §六一致。
- 结论：无发现（id 命名以语义 class + 少量锚点 id 混合实现，与既有已批准组件风格一致，不重复审查已接受的仓库级模式）。

### logging-privacy

- 7 个改动文件全文 grep `console.` 无命中，无生产日志面输出 PII/凭据/完整请求体的风险。
- 结论：无发现。

### maintainability

- 复用既有 `DataStateWrapper.vue`（四态承接）、`utils/format.ts` 的 `formatDateTime`、`api/request.ts` 的 `ApiEnvelope`/`ErrorCode`，无重复实现同类基础设施。
- `useResponsiveDialogWidth.ts` 是对已被 backlog 记录为"字节级重复"的样板代码的正当提炼（见上方独立小节），不是重复造轮子，反而是消除重复的动作（尽管尚未回填到旧两处）。
- 结论：无发现。

### sensitive-boundaries

- 前端校验（单价必须为正数、下限<上限）明确只是体验层拦截：后端 `UpsertCommissionTierDto`（`@IsInt`/`@Min(0)`/`@IsPositive`）+ `assertBoundsOrdered()`/`assertNoConflict()` 独立复核同一批约束，绕过前端校验（如直接调用 API）时后端仍会以 1001/1005 拒绝，未发现"前端校验即安全边界"的误用。
- 删除/编辑操作可追溯性：后端 `create`/`update`/`remove` 均在成功落库后调用 `writeChangeLog()` 写入操作人（`extractOperator` 取自 JWT `request.user.username`）+ 前后快照，前端 `CommissionTierHistoryDrawer.vue` 忠实拉取并渲染同一份 `GET /api/commission-tiers/change-logs` 数据（未做任何客户端过滤/裁剪），变更历史抽屉是真实审计视图，不是摆设。
- 删除操作前置确认存在（`ElMessageBox.confirm`，见上方 contract 小节），未发现"前端逻辑可能诱导误删/误改而无法追溯"的路径。
- 说明（非本任务范围内 finding，仅记录以供完整性参考）：`commission-tier.service.ts.remove()` 的 `commissionTierRepository.remove(existing)` 与随后的 `writeChangeLog()` 调用不在同一数据库事务内（不像 `create`/`update` 那样包在 `dataSource.transaction('SERIALIZABLE', ...)` 里），若两步之间进程崩溃理论上存在"已删除但漏记变更日志"的窗口。该文件不在本任务 `changed_files` 内、且属于既有已批准的后端实现（ic-v1-005 批次），不计入本轮 ic-v1-012 的 finding，仅供记录。
- 结论：无阻断项（Finding F001 虽与 AC-11 相关但根因是共享前端基础设施的展示机制而非权限/数据隔离/不可逆操作类安全边界问题，计入 contract 维度而非本维度）。

## Findings

```yaml
findings:
  - id: ic-v1-012-F001
    dimension: contract
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: >
      frontend/src/api/request.ts:39-58（未改动的既有共享文件）的响应拦截器错误分支
      `(error) => { const envelope = error.response?.data; if (envelope) { handleBusinessError(envelope) } ... }`
      对任意非 2xx 响应无条件调用 `handleBusinessError`，其内部对非 UNAUTHORIZED 码一律执行
      `ElMessage.error(envelope.msg || '请求失败')`（第 57 行），没有为 1001/1005 设置任何跳过/抑制分支。
      frontend/src/components/CommissionTierEditModal.vue:215-254 的 `handleSave()` 在
      `createCommissionTier`/`updateCommissionTier` 失败时进入 catch（第 242-250 行），仅在
      `axios.isAxiosError` 且 `code === ErrorCode.CONFLICT || code === ErrorCode.VALIDATION_FAILED`
      时把 `error.response?.data?.msg` 写入 `conflictError`（渲染进 `#error-tier-conflict`），
      但对全局拦截器已经在同一次请求失败时同步触发的 `ElMessage.error` 没有做任何拦截/抑制——
      两者是完全独立、互不知晓的两条通路。全仓库搜索未发现任何 "skipGlobalError"/"suppressError"
      类的按请求配置抑制机制，`request.ts` 自 V0 走骨架提交后未再修改（`git log --oneline -- frontend/src/api/request.ts`
      只有一条 foundation 提交），确认该问题在当前代码状态下对每一次命中 1001/1005 的提交都 100% 复现。
    impact: >
      每次新增/编辑档位命中区间冲突（1005）或字段非法值（1001）时，用户会同时看到一条约 2.4 秒后
      自动消失的全局错误 toast（`ElMessage.error`）与弹窗内持续展示的字段级错误提示（#error-tier-conflict），
      两者文案内容相同、不构成信息丢失，但字面上违反了任务包 AC-11 oracle 原文的明确指示
      "命中 1001...同样以字段级错误展示，不用全局 toast 掩盖具体字段"——该行为不是可选的解读，
      是一次每次都可复现的机制性冲突。
    action: fix-mechanism
    status: open
  - id: ic-v1-012-F002
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      frontend/src/composables/useResponsiveDialogWidth.ts:9 注释原文
      "提炼原因见 backlog.md ic-v1-008-F004/ic-v1-009-F003：BatchListView.vue、ImportPanel.vue
      已各自手写一份字节级相同的 matchMedia 监听样板代码"，把两个 backlog finding 编号
      永久写入运行时源码注释，而非留在 git 提交信息/decisions 记录里。
    impact: >
      backlog.md 条目未来被清理/编号变更/合并后，该注释会变成脱离上下文的死引用，
      增加后续阅读者查证成本；不影响当前功能正确性。
    action: revise-doc
    status: open
```
