# 前端编码规范 · insurance-commission

> 当前稳定默认规则表，V0 首期播种，原地更新当前真值，不追加版本史。加载规则见 `../hact-method-lab/templates/standards/schema.md`。
> 技术栈：Vue 3 + Element Plus + Pinia + Vite + SCSS。视觉具体 token（色值/圆角/阴影/断点/控件尺寸等）以 `design.md` 为唯一权威，本文件只定义强制写法与默认实现约束，不重复具体数值。
> API 信封、错误码、鉴权模型（token 存 `localStorage`）等跨层事实见 `standards-shared.md`，本文件不重复。

---

### FE-DESIGN-01 · 禁止硬编码视觉字面值

- applies-if：新增/修改任意 `<style>` 块、`.scss` 文件或组件内联样式
- rule：颜色、间距、字号、圆角、阴影、过渡时长等视觉数值禁止字面量硬编码（如 `color: #333`、`margin: 20px`），统一引用 `src/styles/variables.scss`（或等价单一变量文件）中定义的变量；变量取值以 `design.md` 为准
- grade：机械级
- enforcement：stylelint-no-literal-values（计划中，stylelint 自定义规则禁止颜色/长度字面量）
- override：确需一次性例外（如第三方组件库不可控的内联样式）须在代码注释中说明原因，不可批量豁免
- superseded-when：—

---

### FE-DESIGN-02 · UI 库主题覆盖，禁用库默认主色

- applies-if：引入或使用 Element Plus 组件
- rule：必须用 `design.md` 定义的设计主色覆盖 Element Plus 主题变量（`--el-color-primary` 等），覆盖集中在全局样式入口或单一主题文件；禁止让页面呈现 Element Plus 默认主题色
- grade：机械级
- enforcement：visual-smoke-anchor（`design.md` §0 视觉冒烟锚点「主色已覆盖 UI 库」，联调完整档由 generate-integration-tests 实测比对 `--el-color-primary` 计算值）
- override：不可覆盖，须先修 Foundation（视觉地基已判定机械级，见 `foundation.md`）
- superseded-when：—

---

### FE-DESIGN-03 · 单一全局样式入口

- applies-if：新增/修改任何影响全局的样式（reset、`html`/`body`/`*` 基线样式、UI 库主题变量覆盖）
- rule：全局样式只能在唯一入口（应用入口文件单次 `import` 的全局样式文件）声明；禁止在业务组件或多个位置各自声明 `body`/`html`/`*` 一类全局选择器
- grade：机械级
- enforcement：stylelint-global-selector-restriction（计划中，stylelint `overrides` 限定 `html`/`body`/`*` 选择器仅允许出现在全局样式入口文件）
- override：不可覆盖，须先修 Foundation
- superseded-when：—

---

### FE-ASYNC-01 · 异步请求失败必须有用户可见反馈

- applies-if：组件/composable 中发起写操作（新增/编辑/删除/导入等提交类请求）
- rule：catch 分支必须给出用户可见反馈（`ElMessage.error`，优先透传后端 `msg`，为空时用兜底文案），禁止只写 `finally` 不写 `catch`；loading/submitting 状态统一在 `finally` 中重置。列表/详情类**读**请求的失败反馈由 `DataStateWrapper` 错误态承接，不在组件内重复弹 toast
- grade：人审级
- enforcement：code-review
- override：批量/静默操作经产品明确要求可豁免，须在 TRD 或任务包中登记
- superseded-when：项目引入统一请求处理 composable（如 `useRequest`）后由该 composable 承接，机制升级为机械级

---

### FE-ASYNC-02 · 表单校验统一 Promise 式

- applies-if：使用 `el-form` 做表单校验提交
- rule：统一 `await formRef.value.validate()` + try/catch/finally 处理，校验失败落入 catch 分支；禁止使用回调式 `validate((valid) => {...})`
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：—

---

### FE-ASYNC-03 · 写操作成功后必须有用户可见反馈

- applies-if：新增/编辑/删除/导入等写操作请求成功返回后
- rule：成功分支必须给用户可见反馈（`ElMessage.success`，或专用结果展示区域/面板承接同等信息，如导入结果的成功/失败行统计），禁止成功后无任何提示、只依赖页面数据静默变化
- grade：人审级
- enforcement：code-review
- override：批量/静默操作经产品明确要求可豁免，须在 TRD 或任务包中登记
- superseded-when：项目引入统一请求处理 composable 后由该 composable 承接，机制升级为机械级

---

### FE-RESPONSIVE-01 · 弹窗/抽屉/多列布局移动端降级

- applies-if：新增/修改 `el-dialog`、右侧抽屉或 Flex/Grid 多列布局
- rule：弹窗、抽屉、多列布局必须有对应的移动端降级（弹窗/抽屉收窄或改为满宽、多列改单列），具体宽度取值以 `design.md` §六「响应式规则」为准，禁止只实现桌面端固定尺寸
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：—

---

### FE-RESPONSIVE-02 · 横向内容必须 overflow wrapper 包裹

- applies-if：新增/修改宽表格或任何可能超出视口宽度的横向内容
- rule：宽表格等横向内容必须用 `overflow-x: auto` 的 wrapper 包裹；该 wrapper 的 Flex 祖先禁止设置 `overflow: hidden`（会吞掉横向滚动，导致内容不可访问或整页横向溢出）
- grade：机械级
- enforcement：visual-smoke-anchor（`design.md` §0 视觉冒烟锚点「目标视口无横向外溢」，联调完整档实测 `scrollWidth - innerWidth <= 0`）
- override：—
- superseded-when：—

---

### FE-RESPONSIVE-03 · 触屏交互尺寸基线

- applies-if：新增/修改可点击控件（按钮、图标按钮）或表单输入框
- rule：输入框字号移动端不得低于 16px（避免 iOS 自动放大页面）；可点击元素最小热区 44×44px，禁止用负 `margin` 缩小视觉尺寸的方式变相扩大点击区域
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：—

---

### FE-STORE-01 · 跨刷新状态持久化

- applies-if：新增 Pinia store 字段，且该字段需要在页面刷新后保留
- rule：该字段初始化时从 `localStorage` 读取作为初始值，写入（action 或 watch）时同步写回 `localStorage`；key 命名遵循统一常量引用（见 FE-CONST-01）
- grade：人审级
- enforcement：code-review
- override：TRD 可指定统一持久化 composable（如 `usePersistedState`）承接，机制建成后升级为机械级
- superseded-when：项目引入统一持久化 composable 或等价插件后，由该机制承接

---

### FE-STORE-02 · 退出登录重置全部业务 store

- applies-if：修改登出逻辑，或新增业务 Pinia store
- rule：`logout()` 除清除鉴权 store 外，必须调用所有业务 store 的 `reset()`；新增业务 store 必须提供 `reset()` action 并在登出流程中注册，防止脏数据残留到下次登录
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：项目引入 store 注册表机制（登出自动遍历重置所有已注册 store）后升级为机械级

---

### FE-UTIL-01 · 日期格式化统一走工具模块

- applies-if：组件/composable 中需要把 `Date` 或时间字符串格式化展示
- rule：统一使用 `@/utils/format.ts`（或等价格式化工具模块）导出的函数；模块内没有所需格式时先补充导出再引用，禁止在组件内拼接日期字符串
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：—

---

### FE-CONST-01 · localStorage key 统一常量引用

- applies-if：路由守卫、composable、工具函数中读写 `localStorage`（含 token、持久化 store 字段）
- rule：禁止在各处硬编码 key 字符串，必须引用统一定义的常量（如 `TOKEN_KEY`）；新增持久化字段先在常量模块登记再引用，key 变更只改一处
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：项目引入 lint 规则禁止裸字符串访问 `localStorage` 后升级为机械级

---

### FE-CLEAN-01 · 禁止提交未完成标记与调试残留

- applies-if：提交前端代码变更
- rule：禁止包含 `// TODO`/`// FIXME` 未完成标记、未使用的 import、遗留的 `console.log`、注释掉的废弃代码块
- grade：机械级
- enforcement：eslint-clean-code-rules（计划中，`no-console` / `no-unused-vars` / `no-warning-comments`）
- override：联调期临时调试日志须在 PR 说明中标注并设定移除节点，不可静默合并
- superseded-when：—

---

### FE-COMP-01 · 单文件组件区块顺序

- applies-if：新增/修改 `.vue` 文件
- rule：区块顺序固定为 `<template>` → `<script setup lang="ts">` → `<style scoped lang="scss">`
- grade：机械级
- enforcement：eslint-vue-component-tags-order（计划中，`eslint-plugin-vue` `vue/component-tags-order`）
- override：—
- superseded-when：—

---

### FE-COMP-02 · 组件文件命名 PascalCase

- applies-if：新增 `.vue` 组件文件
- rule：统一 PascalCase 命名（如 `TaskDetail.vue`），禁止 kebab-case（如 `task-detail.vue`）
- grade：机械级
- enforcement：eslint-filename-case（计划中，文件名大小写规则）
- override：—
- superseded-when：—

---

### FE-COMP-03 · 路由组件路径大小写必须与文件名一致

- applies-if：在路由配置模块（如 `router/index.ts`）新增/修改路由指向的组件路径
- rule：路由配置中引用的组件文件路径大小写必须与实际文件名完全一致（PascalCase）；大小写不一致在大小写不敏感文件系统上本地开发不报错，但在大小写敏感的生产环境会因模块无法解析而崩溃，提交前必须核对
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：项目 CI 引入大小写敏感环境的构建检查后升级为机械级

---

### FE-COMP-04 · 类型定义归属与去重

- applies-if：新增/修改 TypeScript 类型定义（interface / type / 枚举）
- rule：仅单组件内使用的类型可定义在组件内；跨两个及以上组件使用的类型须提取到对应 `@/api/*.ts` 文件顶部并 export；全局通用枚举/常量放入 `@/types/enums.ts`；禁止在组件内重复定义已在 store/api/enums 中导出的类型
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：—

---

### FE-SCSS-01 · SCSS 模块引入方式

- applies-if：新增/修改包含 SCSS 的 `<style>` 块或独立 `.scss` 文件
- rule：统一使用 `@use '@/styles/variables.scss' as *`，禁止使用 `@import`；每个 `<style lang="scss">` 块（含 `scoped`）须在块内独立声明 `@use`，不依赖父级或隐式全局引入
- grade：机械级
- enforcement：stylelint-no-import（计划中，stylelint-scss 规则禁用 `@import`）
- override：—
- superseded-when：—

---

### FE-EP-01 · 统一 UI 组件库

- applies-if：新增页面/组件需要 UI 控件
- rule：统一使用 Element Plus，禁止引入其他第三方 UI 组件库
- grade：人审级
- enforcement：code-review
- override：TRD 可为 Element Plus 未覆盖的专项能力（如图表库、富文本编辑器）引入专项第三方库，不视为通用 UI 库替代
- superseded-when：项目发起技术栈迁移评审并由 Foundation 重新确认

---

### FE-EP-02 · el-dialog 必须显式 align-center

- applies-if：新增/修改 `el-dialog`
- rule：所有 `el-dialog` 必须显式添加 `align-center` 属性；未加时移动端默认贴顶，体验劣于居中弹层
- grade：人审级
- enforcement：code-review
- override：特殊全屏/侧边弹层等价交互经 UX 明确设计后可豁免，须在 TRD 或任务说明中登记
- superseded-when：项目封装统一 `<AppDialog>` 组件并默认带 `align-center` 后由组件本身承接，升级为机械级

---

### FE-EP-03 · 删除类操作必须二次确认

- applies-if：新增/修改会导致数据不可逆删除的操作入口（按钮/菜单项）
- rule：删除操作必须经 `ElMessageBox.confirm` 二次确认后才可提交请求；简单确认统一用 `type: 'warning'`
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：—

---

### FE-EP-04 · Element Plus 组件使用禁忌

- applies-if：使用 `el-select`/`el-input` 等设置宽度、控制 Element Plus 组件显隐、用 `el-dropdown` 作触发器、设置 `el-dialog` 的 `title`、定义 `el-select` option 的 `value`
- rule：禁止在 Element Plus 组件标签上用 inline `style` 或 CSS class 直接设置宽度，改用外层 `div` wrapper + `:deep()` 选择器；禁止用 CSS class/媒体查询控制 Element Plus 组件显隐，改用 `v-if`/`v-show`；禁止用 `el-dropdown` 作纯图标触发器，改用 `el-popover` 的 `#reference` slot；禁止将 `el-dialog` 的 `title` 设为空字符串（保留非空值，用 `.el-dialog__title { display: none }` 隐藏文字）；`el-select` option 的 `value` 禁止使用空字符串（空字符串会被识别为"未选择"而显示 placeholder，改用 `'all'` 等有意义字符串）
- grade：人审级
- enforcement：code-review
- override：—
- superseded-when：—

---

### FE-EP-05 · 编辑类弹窗存在未保存修改时关闭前需二次确认

- applies-if：新增/修改承载表单编辑（新增或修改单条数据）的 `el-dialog`，且弹窗内含"保存"动作与未保存状态
- rule：弹窗内维护"是否已修改（dirty）"标志，字段变更时置位，保存成功后复位；用户通过关闭按钮/遮罩/ESC 尝试关闭弹窗时，若 dirty 为真必须先弹二次确认（"有未保存的修改，确定要离开吗？"），确认放弃才真正关闭，否则回到编辑态；dirty 为假时直接关闭
- grade：人审级
- enforcement：code-review
- override：单字段极简表单（如仅一个必填输入框、误操作代价低）经产品/UX 明确评估后可豁免，须在 TRD 或任务说明中登记
- superseded-when：项目封装统一 `<AppDialog>`/`useDirtyGuard` 一类机制自动承接 dirty 追踪与离开确认后，由该机制承接，升级为机械级

---

### FE-EP-06 · 只读历史/日志类信息用右侧抽屉承载，不用弹窗

- applies-if：新增"查看修改历史"/"查看变更日志"一类只读、按时间倒序展示的历史记录入口
- rule：历史/日志类只读信息统一用右侧抽屉（`el-drawer`）承载，不使用 `el-dialog`；保留主页面/主表格在抽屉外可见，抽屉内容为按时间倒序的时间线列表，无记录时展示空态文案
- grade：人审级
- enforcement：code-review
- override：历史记录本身需要独立的筛选/分页等复杂交互时，TRD 可改为独立页面承载
- superseded-when：—

---

### FE-TABLE-01 · 单行少量字段编辑优先整行展开，不用弹窗

- applies-if：表格中需要对单行数据做 1~2 个字段的即时编辑（如状态、备注、单个文本字段）
- rule：优先采用点击整行展开一个内联编辑区（展开行）的交互，而非另开 `el-dialog` 承接同等编辑；同一时刻最多展开一行，展开新行前先收起已展开的行；三个及以上字段或字段间存在复杂校验/联动的编辑，改用弹窗
- grade：人审级
- enforcement：code-review
- override：TRD 可为特定场景（如需要弹窗承载额外上下文）指定改用弹窗，须登记理由
- superseded-when：—

---

### FE-BUILD-01 · 禁止在 ESM 项目中使用 CommonJS require()

- applies-if：新增/修改前端源码文件（`src/**`、`vite.config.ts` 等）
- rule：统一使用 ESM `import`/`export`，禁止使用 `require()`（Vite ESM 环境下 `require` 未定义，运行时抛出 `ReferenceError`）
- grade：机械级
- enforcement：eslint-no-commonjs（计划中，`import/no-commonjs` 或等价规则）
- override：仅 Node 脚本类工具（构建/CI 脚本，非应用运行时代码）经 TRD 说明后可豁免
- superseded-when：—
