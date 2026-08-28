---
task_id: ic-v1-008
round: 2
mode: targeted
risk: standard
review_profile: iterations/v1/code-reviews/ic-v1-008/profile-round-01.json
prior_report: iterations/v1/code-reviews/ic-v1-008/round-01.md
target_finding_ids: [ic-v1-008-F001]
base_ref: 27ce803208fbbde016daa77791e4b9059abf7c23
reviewed_base: d67447495cf865d1b68f7301398b50d8a3ed0f3a
reviewed_head: 15b938d3f032184133f0412a29fb63912fa4cb08
diff_sha256: 2f373998e1c49736c589af251fbfb1ea1efeabd097f8a3b6ca71287b512d07c7
changed_files:
  - frontend/src/api/commission-batch.ts
  - frontend/src/layouts/AppLayout.vue
  - frontend/src/router/index.ts
  - frontend/src/views/BatchListView.vue
started_at: 2026-08-28T01:52:26Z
completed_at: 2026-08-28T01:56:10Z
elapsed_minutes: 4
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "（已闭合）router.push({ name: 'batch-detail', params: { id } }) 此前在 reviewed_head=d674474 会 reject；本轮对 reviewed_head=15b938d 用 vue-router@5.2.0 独立复现，改为 resolve OK（见 F001 verified-closed evidence）"
affected_regressions: []
changed_surface_allowed:
  - frontend/src/api/commission-batch.ts
  - frontend/src/layouts/AppLayout.vue
  - frontend/src/router/index.ts
  - frontend/src/views/BatchListView.vue
```

- 固定 diff 复核：对 `reviewed_base`(f5a4891)→`reviewed_head`(15b938d)、限定本任务包 4 个文件重新执行 `git diff` 并 `sha256sum`，得到 `2f373998e1c49736c589af251fbfb1ea1efeabd097f8a3b6ca71287b512d07c7`，与派发值完全一致，未 blocked。
- 增量核对：`git diff d674474(round-01 reviewed_head) 15b938d(round-02 reviewed_head) -- <4 个文件>` 只有 `frontend/src/router/index.ts` 一处改动（`1 file changed, 5 insertions(+)`），`frontend/src/api/commission-batch.ts`、`frontend/src/layouts/AppLayout.vue`、`frontend/src/views/BatchListView.vue` 三个文件在两个 `reviewed_head` 之间字节级无差异（diffstat 未列出，确认零改动）。
- 全仓库无路径限制的 `git diff d674474 15b938d --stat` 额外显示 `backlog.md`（+4 行），核对内容为 `docs(backlog): 记录 F002/F003/F004/F005 欠账` 的文档记账，与本轮修复的代码路径无关、不在本任务包 `changed_files` 范围内，不构成 scope 越界，不触发 `escalate_to_full`。
- 工作区当前实际文件（`git status --short`）与 `reviewed_head=15b938d` 完全一致（`git diff 15b938d -- <4 个文件>` 为空）。

## 逐维度分析（仅复核 target_finding_ids，其余维度沿用 round-01 结论，不重跑）

### contract — ic-v1-008-F001 复核

1. **独立复现反例是否闭合**：用与工作区一致的 `vue-router@5.2.0`，在 `frontend/` 目录下（保证 node 模块解析能命中项目安装的 `vue-router`）新建临时探针脚本，路由表逐条复制自当前 `frontend/src/router/index.ts`（含本轮新增的 `batch-detail` 占位路由），懒加载组件替换为等价的内联占位组件（不影响命名路由匹配逻辑）。执行结果：
   - `router.resolve({ name: 'batch-detail', params: { id: 'abc' } })` → `matched.name = 'batch-detail'`，`fullPath = '/commission-batches/abc'`（非空匹配，此前 round-01 反例复现时是"No match for..."）。
   - `await router.push({ name: 'batch-detail', params: { id: 'abc' } })` → **resolved**（不再 reject），`router.currentRoute.value.name === 'batch-detail'`，`path === '/commission-batches/abc'`。
   - 探针脚本执行后已删除（`rm -f`），`git status --short` 复核工作区无残留新增文件。
2. **调用点核对**：`BatchListView.vue:132`（`handleRowClick`，点击行跳转）与 `BatchListView.vue:158`（`handleSubmit` 创建成功后跳转）均为 `router.push({ name: 'batch-detail', params: { id: ... } })` 形态，与探针验证的调用形态一致——round-01 记录的"AC-01 不可达"与"点击行跳转不可达"两条 AC 路径均由同一根因（`batch-detail` 未注册）导致，现根因已消除，两条 AC 路径均随之恢复可达。
3. **占位组件是否违反 do-not**：`router/index.ts:36-39` 新增路由的 `component: { template: '<div />' }` 为纯空模板，无 `setup`/无数据获取/无业务渲染逻辑，符合任务包 `do-not` 原文"占位不含具体页面逻辑"的要求；行内注释"占位组件，无具体页面逻辑；实体组件由 ic-v1-009 落地替换"准确描述占位性质，不构成过度分析空间——结论明确，无需进一步展开。
4. **改动范围**：本轮增量 diff 只新增 5 行（一个路由对象），未引入新文件、新依赖、新组件文件、新机制（未用到任何本仓库此前未用过的 vue-router API，`component` 内联对象写法在同一文件的 `login`/其他路由中已是常规写法的直接变体）。`escalate_to_full` 判定为 `false`。

**结论：ic-v1-008-F001 已修复，反例不再复现，判定 `verified-closed`。**

其余 round-01 已过审维度（scope-and-secrets / test-evidence / comment-hygiene / standards / enforcement / design-fidelity / logging-privacy / maintainability）与其余 advisory findings（F002/F003/F004/F005）不在本轮 `target_finding_ids` 内，未重跑，结论沿用 round-01 报告原文（且已在 `backlog.md` 完成欠账记账，见上文"本轮范围"核对）。

## Findings

```yaml
findings:
  - id: ic-v1-008-F001
    dimension: contract
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: >
      round-01 反例（reviewed_head=d674474）：router.push({ name: 'batch-detail', params: { id: 'abc' } }) reject，
      "No match for {...}"。本轮对 reviewed_head=15b938d 独立复现：router/index.ts 新增
      { path: 'commission-batches/:id', name: 'batch-detail', component: { template: '<div />' } }
      （占位组件，AppLayout children 下紧跟 batch-list 之后）。用 vue-router@5.2.0（与工作区一致）重建同构路由表验证：
      router.resolve({ name: 'batch-detail', params: { id: 'abc' } }) 匹配成功（fullPath=/commission-batches/abc）；
      router.push(同参数) 不再 reject，currentRoute.value.name 变为 batch-detail。BatchListView.vue:132（handleRowClick）
      与 :158（handleSubmit）两处调用点形态与验证一致。增量 diff（d674474→15b938d，限定 4 个文件）仅
      "1 file changed, 5 insertions(+)"，只改 router/index.ts，其余 3 个文件字节级无差异；占位组件为纯空模板，
      不含具体页面逻辑，符合 do-not 要求。
    impact: >
      修复后：新建批次提交成功、点击列表行均可正常跳转到 /commission-batches/:id（当前渲染为空白占位页，
      符合本任务包"占位指向，实体组件由 ic-v1-009 提供"的预期分工），不再出现未捕获 Promise rejection，
      AC-01 与"点击行跳转详情"技术 AC 均恢复可达。
    action: fix-code
    status: verified-closed
```
