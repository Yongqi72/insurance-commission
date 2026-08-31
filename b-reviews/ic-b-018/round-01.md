<!-- develop 独立证据审查逐轮报告模板；首次 full，整改后默认 targeted。 -->
---
task_id: ic-b-018
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-018/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: e8bc985d04ab3e8294cbfc7f2775670aa9f5d21e
reviewed_base: 6dd39a8ba4fd784c94a786c28e68653164bc5935
reviewed_head: f1cf011ed1d350e13950a30b4783c1c93d218d0a
diff_sha256: da19db8902b1770251cdfe3a500df412fde2912fa96381290dc2477df4186876
changed_files: [frontend/index.html, frontend/public/bgimgloxson.jpg, frontend/public/logoimgloxson.png, frontend/public/tabimgloxson.png, frontend/src/views/LoginView.vue]
started_at: 2026-08-31T01:47:25Z
completed_at: 2026-08-31T01:51:28Z
elapsed_minutes: 5
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples: []
affected_regressions: []
changed_surface_allowed:
  - frontend/index.html
  - frontend/public/bgimgloxson.jpg
  - frontend/public/logoimgloxson.png
  - frontend/public/tabimgloxson.png
  - frontend/src/views/LoginView.vue
```

审查方法：自读 `b-queue/ic-b-018.md` 权威 frontmatter（intent/oracle/do-not/files）、`profile-round-01.json` 的 `selected_dimensions`（本任务全部 13 个维度均被选中，`omitted_dimensions: []`）、固定 diff `6dd39a8b..f1cf011e`；自己重跑 `npm run build` / `vue-tsc -b`（含在 build 内）/ `eslint . && check-router-structure.js` / `stylelint`；用 `sha256sum` 独立核对三个图片文件；独立复现 stylelint-disable 豁免的必要性（临时移除注释重跑 stylelint，再原样恢复，`git diff` 确认恢复后与 `f1cf011e` 树的该文件内容完全一致，工作区无残留改动）。未接收、未采信执行者自评。

## 逐维度结论

1. **contract**：AC 的 intent/oracle 逐条核对通过。三素材文件已复制到 `frontend/public/`、`index.html` 新增 favicon link、`LoginView.vue` 改为左右分栏（左 62% 品牌背景图 / 右白底面板，logo→标题→账号→密码→记住账号+忘记密码行→登录按钮，顺序与参照图一致）。标题文案为"保单提成管理系统"，未照抄参照图"金蝶AI星瀚账号登录"；无"简体中文"语言切换。`background-size: cover`/`background-position: center` 与 AC 字面要求一致，宽度 `flex: 0 0 62%` 落在 AC 要求的 60~65% 区间。`build`/`vue-tsc`/`eslint`/`stylelint` 均独立重跑通过（见下方证据）。无发现。
2. **scope-and-secrets**：`git diff --stat` 确认改动文件与任务包 `files` 清单五个文件一一对应，无越界改动，无明文密钥/token。`do-not` 六条逐条核实：
   - "记住账号"仅绑定新增 `const rememberAccount = ref(false)`，全文件搜索确认该变量只在 `<script setup>` 声明处与 `<template>` 的 `v-model` 绑定处各出现一次，未被 `handleSubmit()`/`login()` 参数/任何 localStorage API 引用——纯 UI 状态，未违反。
   - "忘记密码"是 `<span class="login-view__forgot">忘记密码</span>`，无 `@click`、无 `<a>`/`to`/`href`，CSS 设 `cursor: default`（非 `pointer`）——纯装饰文本，未违反。
   - `<script setup>` 与改版前逐行 diff：仅新增一行 icon import（`import { User, Lock } from '@element-plus/icons-vue'`）与一行 `rememberAccount` ref 声明+注释；`form`/`rules`/`handleSubmit()`/`authStore.setToken()`/`router.push()`/错误处理逻辑字符级未改动（已用 `git show <base>:...` 与当前文件逐段比对确认）。
   - 标题、语言切换两条如上已核实未违反。
   无发现。
3. **test-evidence**：本任务是纯视觉改版，无新增业务行为，AC oracle 本身即以 `build`/`vue-tsc`/`eslint`/`stylelint` 全绿为机械证据（非单元测试）。独立重跑结果：
   - `npm run build`（含 `vue-tsc -b && vite build`）：成功，`LoginView-*.js`/`.css` 正常产出，仅有与本任务无关的既有 chunk-size 警告。
   - `npm run lint:check`（`eslint . && check-router-structure.js`，用 `:check` 变体避免 `--fix` 污染工作区）：通过。
   - `npm run stylelint:check`：通过，0 problems。
   `<script setup>` 逻辑零改动，行为层面无需新增测试。无发现。
4. **comment-hygiene**：新增两处注释均将任务号写入了运行时/源码注释——① `<script setup>` 内 `rememberAccount` 声明处注释"…（见 ic-b-018 do-not）"；② CSS 内 `stylelint-disable` 说明"…ic-b-018 AC 明确要求…固定取值"。按维度纪律"任务号/迭代号考古应留在 git/decisions，不写回运行时注释"，这两处属于该边界的轻微越界，但注释本身是解释性质（说明为何这样写/为何豁免），不是可执行的强制声明，且该维度本身为建议级。→ **建议级 finding（ic-b-018-F001）**，不阻断。
5. **standards**：任务包 `relevant-standards: []`，无命中规则 id，本维度无可核对目标。无发现。
6. **enforcement**：本次 diff 未新增/修改任何规则、检查器或测试基础设施本身（唯一涉及的是复用既有 stylelint 规则 `scale-unlimited/declaration-strict-value` 的行内豁免，见下方专项核实）。无发现。
7. **design-fidelity**：已用 Read 工具查看 `_meta/input/20260831-092725.jpg`（参照排版）与 `_meta/input/logoimgloxson.png`（品牌 logo）建立视觉认知。实现的模块顺序（logo→标题→账号(带人形图标)→密码(带锁图标)→"记住账号"复选框(左)+"忘记密码"文本(右)同一行→登录按钮）与参照图一致；样式全部复用 `variables.scss` 既有 token（`$bg-page`/`$text-primary`/`$text-secondary`/`$fs-h3`/`$fs-caption`/`$fw-h1`/`$space-lg`/`$space-xl`/`$breakpoint-mobile`），未硬编码新色值/间距，符合 AC "尽量复用而非硬编码新值"的要求。左栏宽度 62% 落在 AC 明确要求的 60~65% 区间内（不要求与参照图像素级比例一致，AC 已声明该区间为准）。logo `max-width: 200px` + `object-fit: contain` 避免拉伸。无发现。
8. **input-provenance**：固定 diff 不含任何后端文件或请求 DTO（`changed_files` 全部是前端静态资源与一个纯前端 Vue 组件），无字段可穷举。覆盖率自证：DTO 文件 = 无，字段数 N = 0，本表行数 = 0，穷举完整。
9. **query-performance**：diff 不含任何查询/数据读取 surface（无 API 调用改动）。无发现。
10. **concurrency**：diff 不含任何写入/事务/唯一性 surface。无发现。
11. **logging-privacy**：diff 未新增任何 `console.*`/日志/埋点代码，无生产日志 surface 变化。无发现。
12. **maintainability**：新增 CSS 复用既有 BEM 命名与 token，未见重复实现或不必要的复杂度扩张；icon 引入方式与 `ImportPanel.vue` 既有先例一致（`@element-plus/icons-vue` 具名导入）。无发现。
13. **sensitive-boundaries**：本任务不涉及权限/认证/数据隔离/不可逆操作/金额/外部副作用（`<script setup>` 鉴权与提交逻辑逐行未改，已在 scope-and-secrets 维度核实）。无发现。

## stylelint-disable 豁免专项核实

执行者报告为 `background-repeat`/`background-position`/`background-size` 三行加了 `stylelint-disable scale-unlimited/declaration-strict-value` 局部豁免。独立核实：

- 读取 `frontend/.stylelintrc.json`：该规则的 `properties` 列表含正则 `/^background/`，会命中所有 `background*` 属性名（包括 `background-image`/`background-repeat`/`background-position`/`background-size`/`background-color`），`ignoreValues` 白名单为 `["0","none","inherit","initial","unset","transparent","currentColor","auto","100%","50%"]`，且设置了 `"ignoreFunctions": true`。规则的错误消息声明其意图是"禁止硬编码视觉字面值（FE-DESIGN-01），请引用 variables.scss 中定义的变量"——即防止色值/尺寸类字面量绕过设计 token。
- `background-image: url('/bgimgloxson.jpg')` 的值是函数调用形式，被 `ignoreFunctions: true` 天然豁免，diff 中该行确实没有加 disable 注释，与规则实际行为一致（未过度豁免）。
- `no-repeat`/`center`/`cover` 是纯关键字字面量，不在 `ignoreValues` 白名单内，也不是函数调用，确实会被规则命中——这三个值是排版/裁切行为的结构性关键字，不是色值或量纲数值，`variables.scss` 中也确实不存在对应 token（已用 `grep` 核对该文件全部变量定义，无匹配项）。
- **反向验证**：临时用脚本移除 diff 中的 `stylelint-disable`/`stylelint-enable` 注释块，重跑 `npm run stylelint:check`，结果精确命中 3 个 error，行号（104/105/106）与被豁免的 `background-repeat`/`background-position`/`background-size` 三行一一对应，无其他行受影响；随后已将文件还原，`git diff f1cf011e -- frontend/src/views/LoginView.vue` 确认与被审查树内容完全一致，工作区无残留改动。
- **豁免范围精确性**：`stylelint-disable` 与 `stylelint-enable` 之间只包裹了这 3 行声明，`background-image` 行在 disable 范围之外（也不需要豁免）；`&__logo`/`&__title` 等其他新增声明块均不在豁免范围内。

**结论：豁免理由站得住脚，范围精确，未扩大化**——命中的确实是规则设计意图之外的结构性关键字（非色值/非量纲），且任务包 AC 字面要求了这三个固定取值，`variables.scss` 无对应 token 可替代；反向验证证明豁免只覆盖了必要的 3 行，没有多豁免或少豁免。

## 图片文件完整性核实

`sha256sum` 逐一比对 `frontend/public/{bgimgloxson.jpg,logoimgloxson.png,tabimgloxson.png}` 与 `_meta/input/` 下同名原始文件：三个文件哈希完全一致（byte-identical），确认是直接复制而非重新导出/压缩/转码。

## 移动端降级核实

`<768px` 断点下 `&__brand { display: none }`、`&__panel { flex: 1; width: 100% }`、`&__panel-inner { max-width: 100%; padding: $space-lg }`，与 `AppLayout.vue` 现有断点处理手法（同样用 `@media (width <= $breakpoint-mobile)` 收缩 padding/gap）风格一致。背景图完全隐藏、面板占满宽度、内边距收窄为 `$space-lg`（24px），未见会导致横向溢出的固定宽度/固定 `min-width` 声明，表单元素（`el-input`/`el-checkbox`/`el-button`）均为流式布局，不会被压缩到不可用。无发现。

## Findings

```yaml
findings:
  - id: ic-b-018-F001
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      frontend/src/views/LoginView.vue 新增两处注释将任务号写入源码注释：
      script setup 内 "// 纯 UI 状态…（见 ic-b-018 do-not）"（约第 54-56 行）；
      CSS 内 "/* stylelint-disable … ic-b-018 AC 明确要求… */"（约第 105-107 行）。
      按 comment-hygiene 维度纪律，任务号/迭代号考古应留在 git/decisions，不写回运行时注释。
    impact: >
      不影响当前行为；长期看任务包归档后，未来读者不带上下文时该引用会失去意义，
      注释本身的解释内容（"为何这是纯 UI 状态"/"为何豁免这条规则"）仍然自洽可读，
      只是引用了一个外部会过期的任务号。
    action: backlog
    status: advisory
```
