---
task_id: ic-v1-009
round: 1
mode: full
risk: standard
review_profile: iterations/v1/code-reviews/ic-v1-009/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 27ce803208fbbde016daa77791e4b9059abf7c23
reviewed_base: 15b938d3f032184133f0412a29fb63912fa4cb08
reviewed_head: 324727919bb6bfb4b38f13f7b8cf7b9f9c796265
diff_sha256: 1578181babc7592bced5891501d00adbf753d5c699e4097057f9144ea3ccc49f
changed_files: [frontend/src/api/commission-batch.ts, frontend/src/components/ImportPanel.vue, frontend/src/router/index.ts, frontend/src/views/BatchDetailView.vue]
started_at: 2026-08-28T02:07:48Z
completed_at: 2026-08-28T02:52:00Z
elapsed_minutes: 45
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "handleDeleteImport 成功分支未调用 GET /api/commission-batches/:id/imports（仅本地数组 filter），与技术 AC-03 oracle 逐字冲突（ImportPanel.vue:189-196）"
  - "eslint.config.js globals 未登记 File/FormData/Event/HTMLInputElement：去掉本包全部 eslint-disable-next-line no-undef 后 npm run lint:check 实测复现 6 处 no-undef error（api/commission-batch.ts:87,88；ImportPanel.vue:116,118,145,146）"
  - "ElMessageBox 删除确认自定义宽度：.el-message-box 基类 max-width:420px(--el-messagebox-width) 未被 customClass 覆盖，viewport 442px~768px 区间内 95vw 声明被 max-width 钳制为恒定 420px，未达成'收窄至 95vw'"
affected_regressions: []
changed_surface_allowed: [frontend/src/api/commission-batch.ts, frontend/src/components/ImportPanel.vue, frontend/src/router/index.ts, frontend/src/views/BatchDetailView.vue]
```

- `full`：按 `review_profile.selected_dimensions` 执行 `develop-review.md` 对应 id；omitted 不输出 N/A。
- 固定 diff 已用 `git diff 15b938d3f032184133f0412a29fb63912fa4cb08 324727919bb6bfb4b38f13f7b8cf7b9f9c796265 -- <files>` 复核，`--stat` 全仓对比确认仅 4 个 changed_files 有变动，`sha256sum` 复核与派发值一致；`ic-v1-008` 的 `AppLayout.vue`/`BatchListView.vue` 在两 tree 间零变化。

### 逐维度小结

**contract**：AC-02（状态切换不影响导入/删除可用性）、AC-03（导入提交/成功渲染/1001 分支）、AC-04（二次确认文案与流程）、批次不存在 1004 走 error 态、两个具名挂载点与 `batchId` 顶层声明均对照 oracle 逐条核实通过；仅 1 处偏离（见 F004：删除成功后未按 oracle 重新 GET 拉取列表）。
**scope-and-secrets**：`git diff --stat` 确认改动只落在任务包 `files:` 声明的 4 个文件，未触碰 `eslint.config.js`；模板内无保单明细表格/回填筛选/人工补录/提成汇总/导出等 do-not 禁止内容，仅两个空挂载点 `div`；未发现明文密钥/token。无发现。
**test-evidence**：本仓前端无单元测试框架（未装 vitest/@vue/test-utils，`grep` 全仓无 `*.spec.ts`/`*.test.ts`），与 ic-v1-007/008 已确立的项目惯例一致，机械证据以 `vue-tsc -b && vite build`、`eslint .`、`stylelint` 三项替代；三项均已在 `324727919b` 树上实测通过（见下方命令记录）。功能性行为断言只能靠代码走查覆盖，同惯例下不作为独立 blocker。
**comment-hygiene**：见 F001（第 7 次同根复现，两处非 oracle 强制的运行时注释点名任务号）；`BatchDetailView.vue:22/25` 的挂载点注释点名 `ic-v1-010`/`ic-v1-011` 属技术 AC oracle 原文明确要求的标注（"上方注释标注供 ic-v1-010/ic-v1-011 插入 ..."），不算违规。
**standards**：见 F005（FE-DESIGN-01，`.batch-detail__status-dot` 8px 硬编码）；FE-EP-02/FE-EP-03/FE-COMP-01~04/FE-SCSS-01/FE-RESPONSIVE-01/02 均核实合规（细节见下）。
**enforcement**：见 F002（eslint globals 系统性缺口，行内 disable 注释为合理最小化处理但未修复根因）。
**design-fidelity**：见 F006（ElMessageBox 自定义宽度被 max-width 钳制）；`#modal-import` 的 el-dialog 响应式宽度（无 max-width 冲突，inline `:width` 生效）、字号/字重/间距/圆角/阴影 token 使用（`$fs-h3`/`$fw-h3`/`$space-*`/`$radius-md`/`$border-color`/`$bg-page`/`$bg-hover`/`$color-danger`）与 design.md 逐项比对一致，删除确认文案与 `prototype.html` `#modal-confirm-delete-import` 逐字一致。
**logging-privacy**：新增文件无 `console.*` 调用，无请求体/文件内容写日志。无发现。
**maintainability**：见 F003（响应式弹窗宽度样板代码与 `BatchListView.vue` 重复，backlog 已预判本次落地应提炼 composable）。

### 关键命令记录

```
$ cd frontend && npm run build   # vue-tsc -b && vite build → 成功，dist 产出含 BatchDetailView chunk
$ npm run lint:check             # 0 errors（含全部 eslint-disable-next-line no-undef 生效）
$ npm run stylelint:check        # 0 errors
# 反证：临时删除本包全部 eslint-disable-next-line no-undef 后重跑 lint:check
#   → 6 处 no-undef error（api/commission-batch.ts:87/88，ImportPanel.vue:116/118/145/146），已还原文件
```

## Findings

```yaml
findings:
  - id: ic-v1-009-F001
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      ImportPanel.vue:96 注释"删除导入产生的"记录变更信号"（context 约定）：ic-v1-010 落地保单记录明细表格后可监听本事件"
      与 BatchDetailView.vue:50 注释"batchId 在此顶层声明为响应式值，供 ic-v1-010/ic-v1-011 直接复用"
      均点名了具体任务号；两处均非任务包 oracle 原文强制要求的写法（对比 BatchDetailView.vue:22/25
      的挂载点注释，那两处是技术 AC oracle 逐字要求"上方注释标注供 ic-v1-010/ic-v1-011 插入 ..."，
      本 F001 只指后两处非强制注释）。backlog.md 记录该模式已在 ic-v1-001~004 连续复现 6 次
      （ic-v1-001-F003/ic-v1-002-F002/ic-v1-003-F001/ic-v1-004 两条），本次是第 7 次同根复现。
    impact: 纯运行时注释可读性问题，不影响功能；任务号会在未来重构/任务归档后失去上下文含义。
    action: revise-doc
    status: open
  - id: ic-v1-009-F002
    dimension: enforcement
    severity: advisory
    type: enforcement-claim
    reachability: current
    evidence: >
      frontend/eslint.config.js 两处 `languageOptions.globals`（`**/*.{ts,tsx,vue}` 块与 `**/*.ts` 块）
      均只登记 window/document/localStorage/console/import，未登记 File/FormData/Event/HTMLInputElement 等
      浏览器内置全局类型。已实测复现：临时删除 api/commission-batch.ts:87-89、ImportPanel.vue:116-149
      的全部 `eslint-disable-next-line no-undef` 后执行 `npm run lint:check`，实际报错
      `'File' is not defined no-undef` × 2、`'HTMLInputElement' is not defined` × 2、
      `'Event' is not defined` × 1（commission-batch.ts:87-88，ImportPanel.vue:116/118/145/146）；
      恢复原文件后 0 error。实现者用逐处 `eslint-disable-next-line` 而非编辑 `eslint.config.js`
      ——核实这是合理的最小化处理：`eslint.config.js` 不在本任务 `files:` 清单内，且改动被限定在
      新增浏览器 API 调用点，未掩盖其他潜在错误。但该缺口是系统性的（任何未来文件引入
      File/FormData/Blob/HTMLElement 等都会重复触发同一问题，需要重复补 disable 注释），
      与 backlog.md 已有的 FE-RESPONSIVE-03"系统性未覆盖，待一次性修复而非逐组件补丁"是同类模式。
    impact: 当前无功能性影响（build/lint 均通过）；未来每个新增浏览器全局类型调用点都需重复相同工作量的 disable 注释，属维护成本累积。
    action: global-gap-review
    status: open
  - id: ic-v1-009-F003
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      ImportPanel.vue:102-107,209-211,215（`MOBILE_BREAKPOINT_QUERY`/`dialogWidth`/`mobileMediaQuery`/
      `syncDialogWidth`/onMounted 注册/onBeforeUnmount 清理）与 BatchListView.vue:89-94,168-170,174
      的对应代码逐行比对为字节级完全相同的样板代码（唯一差异是缩进上下文，实测 diff 输出确认）。
      backlog.md 2026-08-28 条目（源：develop v1 ic-v1-008-F004）已明确预判
      "ic-v1-009/ic-v1-011 后续会各自新增 el-dialog，若都各自手写同一段监听逻辑会形成明显重复，
      建议第二个 el-dialog 落地时提炼为共享 composable（如 useResponsiveDialogWidth）"——
      ic-v1-009 正是该预判所指的"第二个 el-dialog"，但本次落地未提炼 composable，直接复制。
    impact: 已知重复被再次实现，未来第三处（ic-v1-011）大概率继续复制，维护成本随落地次数线性增长。
    action: backlog
    status: open
  - id: ic-v1-009-F004
    dimension: contract
    severity: advisory
    type: contract-drift
    reachability: current
    evidence: >
      任务包技术 AC（第 3 条）oracle 原文："组件挂载及每次成功导入/删除导入后调用
      GET /api/commission-batches/:id/imports 重新拉取并渲染 #table-import-list"。
      实际 ImportPanel.vue:172-199 的 `handleDeleteImport` 成功分支为：
      `await deleteImport(...)` → `ElMessage.success(...)` → `list.value = list.value.filter(...)`
      → `emit('records-changed')`，全程未调用 `loadImports()`，即未发起该 GET 请求
      （对比同文件 handleStartImport:157-168 导入成功分支确有 `await loadImports()`，
      以及 handleImportDialogClosed:126-133 关闭弹窗时也调用 `loadImports()`——删除路径是
      三个"应刷新"触发点中唯一未落地 GET 重新拉取的一条）。
    impact: >
      当前单管理员、无并发写入场景下，本地 filter 产生的列表状态与重新 GET 拉取的结果在数据上等价
      （TRD 中 DELETE 只删除该条导入及其关联保单记录，不影响其余导入记录字段），未发现当前可观察的
      错误数据；但字面上确定性地不满足 oracle 要求的"删除后重新拉取"机制，可通过浏览器 Network
      面板直接复现（点击删除确认后无新增 GET .../imports 请求）。
    action: fix-code
    status: open
  - id: ic-v1-009-F005
    dimension: standards
    severity: advisory
    type: contract-drift
    reachability: current
    evidence: >
      FE-DESIGN-01（禁止硬编码视觉字面值，override 需注释说明例外）：BatchDetailView.vue:154-155
      `.batch-detail__status-dot { width: 8px; height: 8px; }` 为字面量硬编码，未引用
      `variables.scss` 中数值相同的 `$space-sm`（8px）等 token，且无豁免注释说明原因。
      `stylelint:check` 当前对此类字面量不报错（该规则 enforcement 标注为"计划中"，
      当前仅人审级实际生效），故未被机械工具拦截。
    impact: 视觉数值与设计稿一致（8px 圆点直径），非视觉缺陷；纯粹是"未过 token 中转"的规范执行缺口。
    action: fix-code
    status: open
  - id: ic-v1-009-F006
    dimension: design-fidelity
    severity: advisory
    type: contract-drift
    reachability: current
    evidence: >
      任务包技术 AC（第 6 条）oracle 要求"弹窗宽度按 design.md §六「响应式规则」在 <768px 收窄至
      95vw"，涵盖"删除确认弹窗"。ImportPanel.vue:172-184 的删除确认用
      `ElMessageBox.confirm(..., { customClass: 'import-panel__delete-confirm' })`，
      对应样式 ImportPanel.vue:291-293：`.import-panel__delete-confirm { @media (width <= $breakpoint-mobile)
      { width: 95vw; } }`。经查 element-plus 源码
      `node_modules/element-plus/es/components/message-box/src/index.mjs:38-43`，`customClass`
      确实会附加到与 `.el-message-box` 同一个根节点，类名叠加生效；但
      `node_modules/element-plus/theme-chalk/el-message-box.css` 中 `.el-message-box` 规则本身含
      `max-width:var(--el-messagebox-width)`（`--el-messagebox-width: 420px`），且本次改动未覆盖
      `max-width`。CSS 级联下最终宽度 = clamp(0, 95vw, 420px)：当 viewport 宽度 > 442px（
      420÷0.95）时，95vw 的计算值会超过 420px 而被 `max-width` 钳死为恒定 420px；
      也就是说，在 "<768px" 定义的移动断点区间中，442px~768px 这一段（覆盖多数横屏手机/竖屏平板）
      实际渲染宽度并非 95vw，而是被钳制的 420px（与桌面态实际观感一致，并未真正"收窄至 95vw"）。
      对比同一文件的 `#modal-import`（el-dialog，`:width="dialogWidth"` 走 inline style，
      `.el-dialog` 基类无 `max-width`），该窄化在 el-dialog 路径上是有效的，问题只发生在
      ElMessageBox 路径。
    impact: >
      在 442px~768px 宽度设备上，删除确认弹窗不会按 oracle 声明收窄到 95vw，而是维持 420px
      （仍小于设备宽度，不会溢出/不可用，只是未达到 oracle 声明的具体数值）；<442px 的手机上
      95vw 与钳制值均小于 420px，效果基本符合预期。
    action: fix-code
    status: open
```
