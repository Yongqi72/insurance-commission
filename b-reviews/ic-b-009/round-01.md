---
task_id: ic-b-009
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-009/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 9c2ab613af3a2bd4e5f5e22813b51ac2a91928db
reviewed_base: 6d3a157293d36ae2fa1ade8e96017ce41b00b65e
reviewed_head: 97d8530c1bd007fe59d5ef37f17d3c0db0d87475
diff_sha256: 60ce834c806bfcc0e34ba4e39d7f987e60ab1cfade540e88e7a33e1398ffac89
changed_files:
  - frontend/src/components/PolicyRecordTable.vue
started_at: 2026-08-30T06:25:24Z
completed_at: 2026-08-30T06:32:58Z
elapsed_minutes: 8
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "追踪 el-dialog 内部 close() 的三条触发源（onModalClick/onCloseRequested/close 按钮）均被
     close-on-click-modal=false / close-on-press-escape=false / show-close=false 硬性拦截，
     源码级确认无法在不改 fillProgress 状态的前提下让弹窗消失"
  - "确认 fillDialogVisible computed 的 set() 为空函数而非缺失 setter：Vue 不会因此报
     writable-computed 警告，且即便 el-dialog 内部 emit('update:modelValue', false)，
     父层状态也不会被写回，弹窗可见性只由 fillProgress 单向派生"
  - "全仓 grep z-index 结果为空，AppLayout.vue 顶栏为普通文档流定位（非 fixed/sticky），
     el-overlay 采用 position:fixed + inset:0 + 动态 z-index（PopupManager 起始 2000），
     结构上必然覆盖顶栏和页面其余一切元素"
affected_regressions: []
changed_surface_allowed:
  - frontend/src/components/PolicyRecordTable.vue
```

- `full` 模式，按 `review_profile.selected_dimensions`（13/13）逐项执行。

## 自绿证据复核

在当前固定 diff 树上重新执行（未消费执行者的自评/总结，只信自己跑出的退出码）：
- `npm run build`（`vue-tsc -b && vite build`）：通过，`✓ built in 786ms`，无 TS 报错。
- `npm run lint`（`eslint . --fix` + 路由结构校验）：通过，无 ESLint 报错，路由结构校验输出"✅ 页面外壳构造级校验通过"。
- `npm run stylelint:check`：通过，无输出即无报警。

## 专项复核：回填期间是否真的堵死所有用户操作

针对派发者提出的三个怀疑点逐一读 Element Plus 源码（`frontend/node_modules/element-plus/es/components/dialog/src/use-dialog.mjs`、`dialog.vue_vue_type_script_setup_true_lang.mjs`、`dialog-content.vue_vue_type_script_setup_true_lang.mjs`、`overlay.mjs`/`overlay.scss`）验证：

1. **三个 dialog prop 组合能否堵死内部关闭路径**：`handleClose()` 只有三个调用入口——`onModalClick`（受 `closeOnClickModal` 门控）、`onCloseRequested`（ESC/焦点陷阱释放，受 `closeOnPressEscape` 门控）、header 关闭按钮（`__props.showClose ? ... : createCommentVNode(...)`，`showClose=false` 时该 `<button>` 根本不会被创建到 DOM，无从点击）。三者在本次 diff 里全部显式设为 `false`，无第四条内部关闭路径（未设 `beforeClose`，组件也未拿到 `<el-dialog>` 的模板 ref 去手动调用暴露出来的 `handleClose`）。结论：Element Plus 侧确无法在不改变 `fillProgress` 的前提下把弹窗关掉。
2. **`fillDialogVisible` 的 get/set 是否真能做到"只能由状态驱动，用户无法置为 false"**：`get: () => fillProgress.value !== null` / `set: () => {}`。因为提供了（哪怕是空的）setter，Vue 不会对这个 writable computed 报 `[Vue warn]: Write operation failed: computed value is readonly` 之类警告；即便 el-dialog 内部某处真的 `emit('update:modelValue', false)`，也只是调用这个空 setter，`fillProgress` 状态不受影响，下一次渲染 `fillDialogVisible` 的 get 仍返回原值——不存在"父层 prop 值卡在 true 但弹窗内部 visible 已经跑到 false 导致的显示/状态不一致"问题，因为唯一能让内部 `close()` 触发的三条路径本来就被禁用，压根不会走到这个 emit。设计上是双重保险而非单点依赖，验证通过。
3. **遮罩层级是否高于页面所有元素（含顶部导航栏）**：`el-overlay.scss` 定义 `.el-overlay { position: fixed; top/right/bottom/left: 0; z-index: 2000; }`，`overlay.mjs` 的 z-index 由 `useZIndex()`/`PopupManager.nextZIndex()` 动态递增分配（起点通常即 2000 附近，任何后续弹层只会更高不会更低）。全仓 `grep -rn "z-index" frontend/src/` 结果为空——项目里没有任何组件自定义过 z-index。读 `frontend/src/layouts/AppLayout.vue`，顶部 `<header class="app-layout__header">` 只有 `height`/`padding`/`background-color`/`box-shadow`，未设置 `position: fixed`/`sticky`，是普通文档流元素。`el-overlay` 通过 Teleport 挂到 `body` 末尾，`position: fixed` + 高 z-index，结构上必然浮在包括顶栏在内的所有页面内容之上，遮罩范围覆盖整个视口（不随滚动条位置产生缺口）。未发现"遮罩之外的角落"。

**范围之外、不算本任务回归的观察**：浏览器返回/直接改 URL 触发的路由导航会整体卸载 `PolicyRecordTable.vue`（连同 Teleport 出去的弹窗 DOM），这是 Vue Router 的组件卸载行为，与 el-dialog 的三个 prop 无关；`handleStartFill` 里进行中的 `triggerSalesFill` 请求不会被路由跳转打断（无 `AbortController`），会在后台继续跑完再静默调用已卸载组件闭包里的 `loadData()`（no-op，不会报错）。这个盲区在本次改动之前（行内 `<div v-if>` 版本）同样存在、同样不受当时任何机制约束，diff 未使域面变化，任务 oracle 与 do-not 也都没有要求处理跨路由/跨页面的操作阻断，故未计入 finding，仅记录供后续视情况另开任务。

## Findings

```yaml
findings:
  - id: ic-b-009-F001
    dimension: design-fidelity
    severity: advisory
    type: contract-drift
    reachability: current
    evidence: >
      任务包 reference 字段声明"design.md §设计令牌（$radius-lg/$shadow-lg 用于弹窗，Element Plus
      el-dialog 默认样式已全局接线，不需要额外自定义）"。实测：frontend/src/styles/index.scss 只
      覆盖了 --el-color-primary* 与 --el-border-radius-base（取值 $radius-sm=2px，见
      frontend/src/styles/variables.scss:72），未覆盖 --el-box-shadow；而 Element Plus
      el-dialog.css 定义 --el-dialog-border-radius: var(--el-border-radius-base)、
      --el-dialog-box-shadow: var(--el-box-shadow)。即弹窗实际圆角落在 $radius-sm(2px)而非
      design.md 要求弹窗使用的 $radius-lg(8px)，阴影落在 Element Plus 默认值而非 $shadow-lg。
    impact: >
      新增的回填进度弹窗视觉圆角/阴影与 design.md §设计令牌表要求的弹窗规格不符；但这是全仓性
      pre-existing gap——同样未做覆盖的 ImportPanel.vue（导入 Excel 弹窗）、
      CommissionTierEditModal.vue、BatchListView.vue 三处既有 el-dialog 早已是同样表现，
      不是本次 diff 新引入的回归，也未被 do-not/oracle 要求本任务顺带修。
    action: backlog
    status: open
contract: 无发现（intent 唯一要求——用 el-dialog 包裹现有进度条内容并遮挡阻断操作、回填结束自动
  关闭且已展示最新明细、分批/进度计算/完成提示文案不变——逐项核对 diff 与
  frontend/src/components/PolicyRecordTable.vue 全文，均满足；handleStartFill 内 try 块顺序
  仍是"await loadData() 先于 finally 里 fillProgress=null"，弹窗关闭前明细已刷新完成，与本次容器
  替换前的时序一致）
scope-and-secrets: 无发现（diff 只改了 files 清单里唯一列出的
  frontend/src/components/PolicyRecordTable.vue；未触碰 do-not 三条中的任何一条——分批调用逻辑
  FILL_CHUNK_SIZE/游标分页/进度计算公式、ElMessage.success 文案、以及未新增任何可手动关闭弹窗的
  入口；未见明文密钥/token/密码）
test-evidence: 无发现（该组件及全仓 frontend 均无 vitest/单测基础设施——find 未发现任何
  *.spec.ts/*.test.ts，package.json scripts 里也没有 test 命令，属项目既有约定；本次改动的等价
  机械证据是 build/lint/stylelint 全绿 + 上面"专项复核"一节对不变式的源码级反例排查，未发现可以
  失败却没被排查到的路径）
comment-hygiene: 无发现（新增注释未写入任务号/迭代号；对"不允许用户主动关闭"这条禁止性声明补充了
  成立前提——即 close-on-click-modal/close-on-press-escape/show-close 已堵死内部触发源，setter
  留空只是兜底，符合"新增'不得/禁止 X'须写成立前提"的要求）
standards: 无发现（relevant-standards 为空，无命中规则需要核）
enforcement: 无发现（本任务不涉及新增校验器/enforcement 机制）
input-provenance: 本次 diff 未新增/改动任何请求 DTO（triggerSalesFill/fetchBatchPolicyRecords
  等既有接口调用参数均未变化），无可枚举字段，DTO 文件 N/A，行数 0/0
query-performance: 无发现（未改动任何查询/数据读取 surface，回填分批游标分页逻辑本次未触碰）
concurrency: 无发现（未改动任何写入/事务/唯一性 surface）
logging-privacy: 无发现（无新增日志输出）
maintainability: 无发现（宽度响应式逻辑复用既有 useResponsiveDialogWidth composable，未重新手写
  matchMedia；移除的行内 Transition/fade 相关 CSS 已随容器替换一并清理，无死代码残留）
sensitive-boundaries: 无发现（无权限/认证/数据隔离/不可逆操作/金额计费变更）
```
