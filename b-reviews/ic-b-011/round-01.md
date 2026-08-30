---
task_id: ic-b-011
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-011/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 08d0e315d51e455def6228e76ef2c0037aa263ac
reviewed_base: 1317b9fa8842c98c3277126e53d0113c80f16e65
reviewed_head: 4549f42ad513b061e63c9607d85c8614f1a361ec
diff_sha256: c50f75d4421fd96ddcf6a48ce0f607e9e4322bd742b66b99a35d17553f85e106
changed_files: [frontend/src/components/ImportPanel.vue]
started_at: 2026-08-30T07:53:38Z
completed_at: 2026-08-30T07:58:45Z
elapsed_minutes: 6
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - 打开批次详情页，视口宽度设为 500px~768px 之间任意值（如 700px），选中与已有导入记录同名的文件点击
    "开始导入"：新增的"文件名重复"确认框以默认 el-message-box 宽度（max-width 420px）渲染，而不是
    design.md 规定且同组件 handleDeleteImport() 已实现的 95vw；同一视口下点"删除"触发的"删除该次导入"
    确认框会撑到 ~665px（0.95*700），两个同属本组件、同为 ElMessageBox.confirm 的弹窗在同一视口下宽度
    相差近 250px，视觉不一致且不符合 design.md:168。
  - 点击"开始导入"→ 命中同名 → 弹确认框 → 点"取消"：断点在 handleStartImport() 的 try/catch，catch
    分支立即 return，此时 importing.value 未被置 true、selectedFile.value 未被清空、未调用
    importExcel()。人工用 grep 逐行核对，确认 catch 分支之后没有任何清空 selectedFile 的语句，且
    catch 位于 importing.value = true 之前，未命中反例——此路径符合 oracle。
  - 未命中同名文件路径：isDuplicateFileName 为 false 时整个 if 块被跳过，直接进入
    importing.value = true 分支，行为与改动前一致——未命中反例。
changed_surface_allowed:
  - frontend/src/components/ImportPanel.vue
```

- 本轮为首次审查（round 1），按 `review_profile.selected_dimensions`（13 项）逐一执行，无 omitted 维度。

## 专项复核

**1. contract**：intent/oracle 的四条分支（命中同名→确认→确定→照常导入；命中同名→确认→取消→中止
且不清空；未命中→直接导入；判重用 `list.value`）均在 `handleStartImport()`（ImportPanel.vue:191-227）
逐一核实通过，见上方 counterexamples 两条边界路径实测未命中反例。`file` 变量在 if 块前从
`selectedFile.value` 取快照并全程复用（191-192, 219），避免了确认框等待期间对 `selectedFile` 的潜在
重新赋值造成的不一致，属于比 oracle 字面要求更稳健的实现，未发现问题。

**2. scope-and-secrets**：diff 仅改动 `frontend/src/components/ImportPanel.vue` 一个文件，与任务包
`files` 清单一致；`git diff --stat` 全量范围（base_ref→reviewed_head）复核同为此单文件，无越权改动。
do-not 四条逐一核对：① 判重之外的导入行为（解析/容错/OSS/落库）零改动；② 无新增后端接口/字段，
diff 未触及任何 backend 文件；③ 未对已有导入记录做任何 delete/update；④ `handleImportDialogClosed()`
（ImportPanel.vue:175-183）在 diff 中零改动，函数体逐字未变。diff 内无明文密钥/token/密码。无发现。

**3. test-evidence**：本仓 frontend 全仓无 vitest/vue-test-utils 等单测基础设施（`package.json`
devDependencies 中无 vitest/@vue/test-utils，全仓 `find` 未发现任何 frontend `*.spec.ts`/`*.test.ts`），
`integration-tests/` 目录下也未见针对 ImportPanel 的既有 Playwright 脚本；这是本仓既有约定（同类纯前端
B 任务 ic-b-009 的 round-01 审查已确认并采纳同一标准）。本次改动的等价机械证据是
`npm run build`（vue-tsc + vite build 全绿）、`npm run lint`（eslint --fix + 路由结构校验通过，
且 `git status` 确认 --fix 未产生任何改动）、`npm run stylelint:check`（全绿）三项均已本轮实测复核，
叠加上方 contract 维度对三条分支的源码级反例排查（均未命中反例）。任务包 known-risks 提到的
"如何发现：新增测试断言同名/不同名两条路径"未被落实为自动化测试，但鉴于本仓前端无测试基础设施的
既有约定，不单独作为本任务的阻断项处理；本条判为不阻断，随专项复核方法本身不产出独立 finding。

**4. comment-hygiene**：新增注释仅一处（ImportPanel.vue:200 "同批次已存在同名文件的历史导入记录：仅
软提示，不去重，确认后仍走下方原有导入逻辑。"），未夹带任务号/迭代号，是描述性说明而非"不得/禁止 X"
式禁止性声明，不适用"须写成立前提"的要求。无发现。

**5. standards**：任务包 `relevant-standards: []`，无命中规则 id 需要核对。无发现。

**6. enforcement**：本任务未新增/修改任何规则检查器、机械化 enforcement 或测试基础设施本身，纯业务
交互改动。无发现。

**7. design-fidelity**：发现 1 条问题，见下 ic-b-011-F001——新增确认框未复用
`handleDeleteImport()` 既有的 `customClass` 移动端宽度覆盖（`.import-panel__delete-confirm` +
`@media (width <= $breakpoint-mobile) { width: 95vw; max-width: 95vw; }`，ImportPanel.vue:371-376），
不符合 design.md:168"移动端弹窗宽度：95vw"，也未落实任务包 oracle 原文"仿照现有删除导入记录的交互
模式"这一具体要求。

**8. input-provenance**：本次 diff 未新增/修改任何请求 DTO，`importExcel(props.batchId, file)` 的调用
参数与改动前完全一致（第二参数从 `selectedFile.value` 改为局部变量 `file`，值等价，非字段面变化）。
DTO 文件：无；字段数 N=0；本表行数=0，穷举完毕。

**9. query-performance**：判重逻辑 `list.value.some((record) => record.fileName === file.name)`
是对已通过既有 `listImports()` 加载到内存的数组做同步 `Array.prototype.some` 线性扫描，未发起任何新
网络请求，不构成 N+1。无发现，不适用。

**10. concurrency**：本次改动无写入/事务/唯一性 surface（纯前端展示层判断 + 弹窗交互），不适用。

**11. logging-privacy**：diff 未新增任何 console/日志输出，无凭据/PII/请求体写日志的 surface。无发现。

**12. maintainability**：新增的 `ElMessageBox.confirm()` 调用结构与 `handleDeleteImport()` 保持同一
调用风格（未重新发明二次确认机制），除 F001 指出的 `customClass` 遗漏外，未见重复实现或不必要的复杂度
扩张。

**13. sensitive-boundaries**：有效 risk 为 standard，且本任务不涉及权限/认证/数据隔离/不可逆操作/金额
计费/外部副作用（纯前端软提示，取消/确认两个分支均不触发任何后端调用之外的其他行为）。无发现，不适用。

## Findings

```yaml
findings:
  - id: ic-b-011-F001
    dimension: design-fidelity
    severity: advisory
    type: contract-drift
    reachability: current
    evidence: >
      ImportPanel.vue:197-213 新增的"文件名重复"ElMessageBox.confirm() 调用只传了
      type/confirmButtonText/cancelButtonText，未传 customClass；对照同组件
      handleDeleteImport()（ImportPanel.vue:240-255）的既有确认框，其调用带
      customClass: 'import-panel__delete-confirm'，并在 ImportPanel.vue:368-377 的非
      scoped style 块里用 @media (width <= $breakpoint-mobile) { width: 95vw; max-width: 95vw; }
      强制移动端宽度。el-message-box 默认样式（node_modules/element-plus/theme-chalk 确认）是
      max-width: 420px + width: 100%，在容器宽度显著大于 420px 时（如任意视口宽度 >~454px 直到
      768px 断点）会被 420px 上限锁死，不会自然逼近 95vw。反例：视口宽度设为 700px，触发"文件名
      重复"确认框，宽度被 420px 上限锁定；同一视口触发"删除该次导入"确认框，宽度被覆盖为
      0.95*700=665px——同组件两个同类弹窗在同一视口下宽度相差约 245px。
    impact: >
      移动端/平板宽度（约 454px~768px 区间）下，新确认框比 design.md:168 规定的 95vw 明显窄，
      且与同组件内其他确认框（删除确认）宽度不一致，视觉不统一；不影响功能正确性（确认/取消两条
      分支行为均正确，见 contract 维度复核），任务包 oracle 原文"仿照现有删除导入记录的交互模式"
      在移动端宽度这一点上未被完整落实。
    action: fix-code
  - dimension: contract
    status: 无发现
  - dimension: scope-and-secrets
    status: 无发现
  - dimension: test-evidence
    status: 无发现（详见专项复核第 3 条，等价机械证据充分）
  - dimension: comment-hygiene
    status: 无发现
  - dimension: standards
    status: 无发现（relevant-standards 为空）
  - dimension: enforcement
    status: 无发现
  - dimension: input-provenance
    status: 无发现，不适用（N=0）
  - dimension: query-performance
    status: 无发现，不适用
  - dimension: concurrency
    status: 无发现，不适用
  - dimension: logging-privacy
    status: 无发现
  - dimension: maintainability
    status: 无发现（除 F001 已单独列出）
  - dimension: sensitive-boundaries
    status: 无发现，不适用
```
