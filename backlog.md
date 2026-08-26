# Backlog · insurance-commission

> 条目格式：
> - `- [ ] {日期} | [偏离] {描述} | {原因}`
> - `- [ ] {日期} | [不阻断] {描述} | {来源：联调/验收}`
> - `- [ ] {日期} | [欠账] {描述} | 源：{来源} {迭代} {task-id}`（本期该有而没人做的功能/能力缺口；`manual-test` 会话启动读本期条目，验收前过一遍）
> - `- [修订] {日期} | target={prd/trd/standards} | {改了什么} | 原因：{reason}`

- [ ] 2026-08-25 | [欠账] 后端 TypeORM 当前用 `synchronize` 建表（沙箱无 Docker/MySQL，V0 走骨架用 SQLite 验证），无正式 migration 文件；生产部署（MySQL）前必须补齐 migration，禁止在生产开 `synchronize` | 源：develop v0 foundation
- [ ] 2026-08-25 | [欠账] 「页面外壳」「HTTP 单例」两项地基件实测仅达"强约定"（机械级-缺 lint），未到 foundation.md 声明的构造级：反例（顶层新增不嵌套路由 / 另建 axios 实例）未被 lint/类型系统拦截，见 `iterations/v0/code-reviews/foundation/round-01.md` F001/F002；待补路由结构 lint 或 `no-restricted-imports` 类规则封死出口 | 源：develop v0 foundation
- [ ] 2026-08-25 | [欠账] 「销售人员回填」第三方接口本期未提供，V1 只搭调用骨架（配置化地址，验收走"未匹配→人工补录"路径）；待对方接口就绪后需另建 develop 任务做真实联调 | 源：draft-prd v1
- [修订] 2026-08-26 | target=prd | 功能「提成报表导出」：删除"导出结果不落库存档"排除项，改为导出文件同步上传 OSS 存档 + 记录导出记录（批次/OSS 地址/时间），新增 AC-17「查看导出历史」（右侧抽屉，可重新下载），涉及实体新增"导出记录" | 原因：plan-sprint 阶段用户明确要求导出报表也要能核对（此前"纯实时不落快照"的决定不变，只是新增文件本身的存档能力）
- [修订] 2026-08-26 | target=trd | 级联上一条 PRD 修订：新增表「导出记录」（`export_record`），`GET .../commission-report` 服务流程追加上传 OSS + 插入导出记录，新增接口 `GET .../exports`（导出历史，回链 AC-17） | 原因：PRD revise-doc 影响 TRD 数据结构与接口，级联修订
