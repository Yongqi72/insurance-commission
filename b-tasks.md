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
| ic-b-011 | optimization | normal | 同批次同名文件导入前二次确认 | merged（PR#21） | 2026-08-30 |
| ic-b-012 | optimization | normal | 保单明细回填状态旁加未匹配条数提示 | merged（PR#22） | 2026-08-30 |
| ic-b-013 | optimization | normal | 提成汇总未匹配记录按投保人单列展示 | merged（PR#23） | 2026-08-30 |
| ic-b-014 | optimization | normal | 保单记录明细工作单号可编辑并留痕 | merged（PR#24） | 2026-08-30 |
| ic-b-015 | bug | normal | 导入时保费为空应允许正常导入 | merged（PR#25） | 2026-08-30 |
| ic-b-016 | optimization | normal | 提成汇总导出报表新增提成单价列 | merged（PR#26） | 2026-08-30 |
| ic-b-017 | optimization | normal | 批次详情页提成汇总加显提成单价 | merged（PR#27） | 2026-08-30 |
| ic-b-018 | optimization | normal | 登录页改版为品牌方视觉 | merged（PR#28） | 2026-08-30 |
| ic-b-019 | bug | normal | 导入时跳过 Excel 尾部合计/说明行 | merged（PR#29） | 2026-09-01 |
| ic-b-020 | bug | normal | 批量回填完成后提成汇总未刷新 | [可取] | 2026-09-01 |
