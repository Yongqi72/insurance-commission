# Backlog · insurance-commission

> 条目格式：
> - `- [ ] {日期} | [偏离] {描述} | {原因}`
> - `- [ ] {日期} | [不阻断] {描述} | {来源：联调/验收}`
> - `- [ ] {日期} | [欠账] {描述} | 源：{来源} {迭代} {task-id}`（本期该有而没人做的功能/能力缺口；`manual-test` 会话启动读本期条目，验收前过一遍）
> - `- [修订] {日期} | target={prd/trd/standards} | {改了什么} | 原因：{reason}`

- [ ] 2026-08-26（原 2026-08-25，ic-v1-001 部分兑现后更新）| [欠账] 正式 migration 文件已由 ic-v1-001 交付（`backend/src/migrations/1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts`），但沙箱仍无 Docker/MySQL，`migration:run`/`migration:revert` 从未在真实 MySQL 上执行验证（round-01 独立审查 ic-v1-001-F001，evidence-gap，阻断级但走 request-evidence 不进代码整改）；生产部署 / 联调阶段有真实 MySQL 后必须补跑一次全链路验证，通过前不得视为 AC1/AC2 已证实 | 源：develop v1 ic-v1-001
- [ ] 2026-08-25 | [欠账] 「页面外壳」「HTTP 单例」两项地基件实测仅达"强约定"（机械级-缺 lint），未到 foundation.md 声明的构造级：反例（顶层新增不嵌套路由 / 另建 axios 实例）未被 lint/类型系统拦截，见 `iterations/v0/code-reviews/foundation/round-01.md` F001/F002；待补路由结构 lint 或 `no-restricted-imports` 类规则封死出口 | 源：develop v0 foundation
- [ ] 2026-08-25 | [欠账] 「销售人员回填」第三方接口本期未提供，V1 只搭调用骨架（配置化地址，验收走"未匹配→人工补录"路径）；待对方接口就绪后需另建 develop 任务做真实联调 | 源：draft-prd v1
- [修订] 2026-08-26 | target=prd | 功能「提成报表导出」：删除"导出结果不落库存档"排除项，改为导出文件同步上传 OSS 存档 + 记录导出记录（批次/OSS 地址/时间），新增 AC-17「查看导出历史」（右侧抽屉，可重新下载），涉及实体新增"导出记录" | 原因：plan-sprint 阶段用户明确要求导出报表也要能核对（此前"纯实时不落快照"的决定不变，只是新增文件本身的存档能力）
- [修订] 2026-08-26 | target=trd | 级联上一条 PRD 修订：新增表「导出记录」（`export_record`），`GET .../commission-report` 服务流程追加上传 OSS + 插入导出记录，新增接口 `GET .../exports`（导出历史，回链 AC-17） | 原因：PRD revise-doc 影响 TRD 数据结构与接口，级联修订
- [ ] 2026-08-26 | [欠账] `OssClient.upload`/`getSignedUrl` 本期只有 mock 级单测（沙箱无真实阿里云 OSS 测试凭证），未做真实网络上传 + 签名 URL 下载一致性验证（round-01 独立审查 ic-v1-001-F004，建议级 evidence-gap）；ic-v1-003 落地导入功能后，联调/集成测试阶段需用真实测试 Bucket 补一次验证 | 源：develop v1 ic-v1-001
- [ ] 2026-08-26 | [欠账] `excel-builder.ts`/`excel-parser.ts`/migration 文件内新增运行时注释里点名了任务号（ic-v1-001/003/006），违反注释卫生规则（任务号不留在运行时注释）（round-01 独立审查 ic-v1-001-F003，建议级 future-risk）；待清理为纯业务语言描述，不阻塞当前合并 | 源：develop v1 ic-v1-001
