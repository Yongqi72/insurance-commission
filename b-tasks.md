# B 类任务总账 · insurance-commission

| task-id | target-source | urgency | title | 状态 | 日期 |
|---------|--------------|---------|-------|------|------|
| ic-b-001 | optimization | normal | OSS 归档路径改为按日期分层 | merged（PR#10） | 2026-08-28 |
| ic-b-002 | optimization | normal | 清理运行时注释里的任务号 | merged（PR#11） | 2026-08-28 |
| ic-b-003 | bug | high | 修复 migration down() 在真实 MySQL 上无法回滚的 bug | merged（PR#12） | 2026-08-28 |
| ic-b-004 | bug | normal | 修复 commission-tier remove() 删除与变更日志非事务写入的不一致风险 | merged（PR#13） | 2026-08-28 |
| ic-b-005 | bug | normal | 修复保单记录关键词搜索的 LIKE 通配符转义缺失 + 补测试覆盖 | merged（PR#14） | 2026-08-28 |
| ic-b-006 | optimization | normal | 收敛重复实现 ensureBatchExists/extractOperator + 补装 @types/multer | merged（PR#15） | 2026-08-28 |
| ic-b-007 | integration | normal | 第三方销售人员回填接口对接 | merged（PR#16） | 2026-08-29 |
| ic-b-008 | optimization | normal | 导入记录文件名加超链接，可下载原始 Excel | merged（PR#17） | 2026-08-30 |
| ic-b-009 | optimization | normal | 回填进度指示改弹出层，遮挡页面并阻断其他操作 | merged（PR#19） | 2026-08-30 |
| ic-b-010 | optimization | normal | 导入记录历史失败原因可查看 | merged（PR#20） | 2026-08-30 |
| ic-b-011 | optimization | normal | 同批次同名文件导入前二次确认 | [可取] | 2026-08-30 |
