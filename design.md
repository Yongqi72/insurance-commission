# 视觉规格 · insurance-commission

> 本文件是全项目视觉实现的唯一参照，由 `draft-ux` Step 1.3（首次 UX 时）生成初稿、逐迭代维护。
> 填写后由前端开发在 `src/styles/variables.scss` 中定义对应 SCSS 变量。

---

## 〇、视觉冒烟锚点（机械断言，供 generate-integration-tests 实测比对）

下列地基不变量在联调**完整档**由 pinchtab/JS **实测比对**（不符即 `[阻断]`）——把"靠人眼"的视觉地基从 manual-test 末端前移成自动校验。值随下方各系统填好后在此登记：

| 锚点 | 实测方式 | 期望值（填写后登记） |
|------|---------|---------------------|
| 主色已覆盖 UI 库 | `getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary')`（按本项目 UI 库主色变量名调整） | == `#1677FF`（见「一、色彩系统」`$primary`） |
| 目标视口无横向外溢 | 主要页面、目标视口宽下 `document.documentElement.scrollWidth - window.innerWidth <= 0` | ≤ 0 |
| 关键容器尺寸 | 顶栏高等的实测 `offsetWidth`/`offsetHeight` | == `56px`（见「六、布局规范」顶部导航高度） |

> 锚点只覆盖**少数确定可断言**的地基不变量（主色 / 外溢 / 关键容器），不追求逐像素；逐像素与字号字重观感仍由 manual-test 人工走查。

---

## 一、色彩系统

### 主色

| 变量 | 色值 | 用途 |
|------|------|------|
| `$primary` | `#1677FF` | 主按钮、选中状态、强调元素 |
| `$primary-light` | `#E8F3FF` | 选中背景、hover 状态 |
| `$primary-dark` | `#0E56D9` | 按钮 hover |

### 背景色

| 变量 | 色值 | 用途 |
|------|------|------|
| `$bg-page` | `#F5F7FA` | 页面背景 |
| `$bg-card` | `#FFFFFF` | 卡片背景 |
| `$bg-hover` | `#F5F7FA` | 悬停背景 |

### 文字色

| 变量 | 色值 | 用途 |
|------|------|------|
| `$text-primary` | `#1F2329` | 主要文字 |
| `$text-secondary` | `#646A73` | 次要文字 |
| `$text-hint` | `#8F959E` | 辅助文字、占位文字 |

### 边框色

| 变量 | 色值 | 用途 |
|------|------|------|
| `$border-color` | `#E4E7ED` | 统一边框 |

### 状态色

| 变量 | 色值 | 用途 |
|------|------|------|
| `$color-success` | `#52C41A` | 成功 |
| `$color-warning` | `#FAAD14` | 警告 |
| `$color-danger` | `#F53F3F` | 危险/删除 |
| `$color-danger-dark` | `#D9342F` | 危险按钮 hover |
| `$color-disabled` | `#C9CDD4` | 禁用/已完成 |
| `$color-info` | `#909399` | 链接、进度 |

### 状态标签（浅底深字，标签/徽标类小面积状态展示用；大面积按钮/图标仍用上方状态色本体）

| 变量 | 色值 | 用途 |
|------|------|------|
| `$color-warning-bg` | `#FFF3D6` | 警告类标签背景 |
| `$color-warning-text` | `#92600A` | 警告类标签文字 |
| `$color-success-bg` | `#E4F7DE` | 成功类标签背景 |
| `$color-success-text` | `#2C7A16` | 成功类标签文字 |

---

## 二、字体系统

### 字体家族

| 用途 | 字体栈 |
|------|------|
| 基础 | `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif` |
| 数据/数字 | 同基础字体栈，附加 `font-variant-numeric: tabular-nums`（表格数字等宽对齐） |

### 字号与行高

> 变量名前缀 `$fs-`（如 `$fs-h1`）；实现中所有字号声明须引用此六级之一，禁止另造字号字面值。

| 级别 | 变量 | 字号 | 行高 | 字重 |
|------|------|------|------|------|
| H1 | `$fs-h1` | 32px | 1.4 | 700 |
| H2 | `$fs-h2` | 24px | 1.5 | 700 |
| H3 | `$fs-h3` | 18px | 1.6 | 500 |
| 正文 | `$fs-body` | 16px | 1.8 | 400 |
| 说明文字 | `$fs-caption` | 14px | 1.6 | 400 |
| 辅助文字 | `$fs-small` | 12px | 1.5 | 400 |

---

## 三、间距系统（8px 网格）

| 变量 | 值 | 常用场景 |
|------|----|---------|
| `$space-xs` | 4px | 紧凑内边距、图标间距 |
| `$space-sm` | 8px | 标签内边距、行内间距 |
| `$space-md` | 16px | 卡片内边距、表单行距 |
| `$space-lg` | 24px | 区块间距 |
| `$space-xl` | 32px | 页面区块间距 |
| `$space-xxl` | 48px | 大区块分隔 |

> 禁止使用以上列表之外的间距值。

---

## 四、圆角与阴影

### 圆角（硬朗风格，小圆角）

| 变量 | 值 | 用途 |
|------|----|------|
| `$radius-sm` | 2px | 标签、小型控件 |
| `$radius-md` | 4px | 卡片、按钮 |
| `$radius-lg` | 8px | 抽屉、弹窗 |
| `$radius-full` | 9999px | 胶囊形状 |

### 阴影

| 变量 | 值 | 用途 |
|------|----|----|
| `$shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | 列表悬浮 |
| `$shadow-md` | `0 2px 8px rgba(0,0,0,0.08)` | 卡片 |
| `$shadow-lg` | `0 4px 16px rgba(0,0,0,0.12)` | 弹窗、抽屉 |

---

## 五、过渡动效

| 变量 | 值 | 用途 |
|------|----|----|
| `$transition-fast` | `0.2s ease` | 颜色切换、hover |
| `$transition-base` | `0.3s ease` | 展开/收起 |
| `$transition-slow` | `0.4s ease-out` | 抽屉滑入 |

---

## 六、布局规范

### 结构常量

| 元素 | 值 |
|------|-----|
| 顶部导航高度 | 56px |
| 侧边栏宽度（展开） | 不适用（V0 已定页面外壳为顶部导航 + 内容区，无侧边栏） |
| 侧边栏宽度（收起） | 不适用 |
| 页面内容最大宽度 | 1440px（超宽屏居中，不铺满） |

### 响应式断点

| 断点 | 值 | 行为 |
|------|-----|------|
| Mobile | < 768px | 单列布局，弹窗/抽屉满宽 |
| Tablet（核心断点） | 768px – 1199px | 保留核心操作，次要信息收进抽屉/折叠 |
| Desktop | ≥ 1200px | 完整多列布局 |

### 响应式规则

- 移动端弹窗宽度：`95vw`，必须加 `align-center`
- 移动端右侧抽屉宽度：`100%`
- 输入框 `font-size` 移动端不低于 `16px`（iOS 会触发页面放大）
- 按钮最小点击区域：`44px × 44px`

---

## 七、控件尺寸规范（紧凑密度——管理员高频处理大量表格数据）

### 输入框宽度

| 变量 | 值 | 场景 |
|------|----|------|
| `$input-width-sm` | 120px | 短字段（如票数、单价） |
| `$input-width-md` | 240px | 常规字段（如批次名称、销售姓名） |
| `$input-width-lg` | 320px | 长字段（如筛选关键词） |
| `$input-width-full` | 100% | 满宽 |

### 按钮高度

| 变量 | 值 |
|------|----|
| `$btn-height-sm` | 28px |
| `$btn-height-md` | 32px |
| `$btn-height-lg` | 36px |
