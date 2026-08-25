# Backlog · insurance-commission

> 条目格式：
> - `- [ ] {日期} | [偏离] {描述} | {原因}`
> - `- [ ] {日期} | [不阻断] {描述} | {来源：联调/验收}`
> - `- [ ] {日期} | [欠账] {描述} | 源：{来源} {迭代} {task-id}`（本期该有而没人做的功能/能力缺口；`manual-test` 会话启动读本期条目，验收前过一遍）
> - `- [修订] {日期} | target={prd/trd/standards} | {改了什么} | 原因：{reason}`

- [ ] 2026-08-25 | [欠账] 后端 TypeORM 当前用 `synchronize` 建表（沙箱无 Docker/MySQL，V0 走骨架用 SQLite 验证），无正式 migration 文件；生产部署（MySQL）前必须补齐 migration，禁止在生产开 `synchronize` | 源：develop v0 foundation
- [ ] 2026-08-25 | [欠账] 「页面外壳」「HTTP 单例」两项地基件实测仅达"强约定"（机械级-缺 lint），未到 foundation.md 声明的构造级：反例（顶层新增不嵌套路由 / 另建 axios 实例）未被 lint/类型系统拦截，见 `iterations/v0/code-reviews/foundation/round-01.md` F001/F002；待补路由结构 lint 或 `no-restricted-imports` 类规则封死出口 | 源：develop v0 foundation
