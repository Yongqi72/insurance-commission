# Sprint v1 · insurance-commission

| task-id | title | layers | 依赖 | 状态 | PR | 交付 |
|---------|-------|--------|------|------|----|------|
| ic-v1-001 | 后端基础设施 | backend | — | [merged] | #2 | 串行 |
| ic-v1-002 | 批次管理与状态 | backend | ic-v1-001 | [merged] | #3 | 可并行 |
| ic-v1-003 | Excel 导入与归档 | backend | ic-v1-001 | [merged] | #3 | 可并行 |
| ic-v1-004 | 保单记录查询与回填补录 | backend | ic-v1-001 | [merged] | #3 | 可并行 |
| ic-v1-005 | 提成阶梯规则管理 | backend | ic-v1-001 | [merged] | #3 | 可并行 |
| ic-v1-006 | 提成汇总与导出 | backend | ic-v1-001, ic-v1-005 | [merged] | #4 | 串行 |
| ic-v1-007 | 视觉地基包 | frontend | — | [merged] | #5 | 串行 |
| ic-v1-008 | 批次列表页 | frontend | ic-v1-007, ic-v1-002 | [merged] | #6 | 可并行 |
| ic-v1-009 | 批次详情页骨架+导入区 | frontend | ic-v1-007, ic-v1-003 | [merged] | #6 | 可并行 |
| ic-v1-010 | 批次详情·明细回填补录 | frontend | ic-v1-007, ic-v1-009, ic-v1-004 | [merged] | #7 | 串行 |
| ic-v1-011 | 批次详情·汇总导出历史 | frontend | ic-v1-007, ic-v1-009, ic-v1-006 | [merged] | #8 | 串行 |
| ic-v1-012 | 提成阶梯规则页 | frontend | ic-v1-007, ic-v1-005 | [merged] | #6 | 可并行 |

## 依赖说明

- ic-v1-002（可并行）blocked-by ic-v1-001（串行）：批次表结构与迁移由 ic-v1-001 交付，必须先合并 master 才有表可用
- ic-v1-003（可并行）blocked-by ic-v1-001（串行）：导入文件表、OssClient、ExcelParser 由 ic-v1-001 交付
- ic-v1-004（可并行）blocked-by ic-v1-001（串行）：保单记录 V1 扩展字段、销售人员补录日志表由 ic-v1-001 交付
- ic-v1-005（可并行）blocked-by ic-v1-001（串行）：阶梯规则表、变更日志表由 ic-v1-001 交付
- ic-v1-006（串行）blocked-by ic-v1-001、ic-v1-005：导出记录表由 ic-v1-001 交付；提成完整性判定函数 `ruleComplete()` 由 ic-v1-005 导出，ic-v1-006 直接 import，编译期依赖，ic-v1-005 必须先合并
- ic-v1-008/009（可并行）blocked-by ic-v1-007（串行）：`design.md` 真值接入的 token 由 ic-v1-007 交付，其余前端任务都要用
- ic-v1-008（可并行）额外 blocked-by ic-v1-002（可并行）：批次列表/创建接口由 ic-v1-002 交付
- ic-v1-009（可并行）额外 blocked-by ic-v1-003（可并行）：导入/删除导入接口由 ic-v1-003 交付
- ic-v1-010（串行）blocked-by ic-v1-009：往 ic-v1-009 建的 `BatchDetailView` 骨架挂载点插入组件，骨架必须先合并；额外 blocked-by ic-v1-004：保单记录查询/回填/补录接口由其交付
- ic-v1-011（串行）blocked-by ic-v1-009：同上，往骨架挂载点插组件；额外 blocked-by ic-v1-006：提成汇总/导出接口由其交付
- ic-v1-012（可并行）blocked-by ic-v1-005（可并行）：阶梯规则接口由其交付
