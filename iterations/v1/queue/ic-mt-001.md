---
task-id: ic-mt-001
sprint_id: null
layers: [backend]
source: manual-test
task_type: dev-backend
urgency: normal
risk: standard
risk-note: 命中「migration」启发词是因描述提到 migration SQL 已建立的 FK 约束作背景对比，本任务不改任何 migration 文件，只改 Entity 关系声明
title: 评估补 PolicyRecord 关系装饰器
status: 可取
description: PolicyRecord 实体的 import_batch_id/import_file_id 目前只是普通 @Column，未用 @ManyToOne 声明关系；生产 MySQL 的 FK 约束已由 migration SQL 建立，但 e2e 走 sqlite synchronize:true，缺关系声明导致 e2e 库不会生成 FK 约束，无法在测试环境复现依赖数据库外键约束的并发异常场景（pr3-hotfix round-01 独立审查 F001 发现，backlog.md 2026-08-27 条目）→ 期望：确认能否在不破坏现有隔离单测的前提下补上关系声明，能补则落地，不能补则给出具体理由和替代方案
depends_on: []
files:
  - backend/src/policy-record/policy-record.entity.ts   # 评估/新增 @ManyToOne(import_batch_id → CommissionBatch, import_file_id → ImportFile)
  - backend/src/policy-record/policy-record.entity.spec.ts   # 若改动需同步的隔离单测
supersedes: []
ac-format: intent-oracle-v1
acceptance-criteria:
  - |-
    (技术)
    intent: 确认补关系装饰器是否会破坏现有隔离单测（sqlite e2e 默认不开 FK 强校验，装饰器本身可能引入循环加载/序列化副作用）
    oracle: 分别对 import_batch_id、import_file_id 尝试加 @ManyToOne + @JoinColumn（保持列名/类型/nullable 不变，不新增级联删除行为），跑 backend 全量 `npm run test` + `npm run test:e2e`；全绿则视为不破坏，非全绿需定位具体失败原因（关系导致的循环序列化/查询膨胀/断言变化等），不得因为"红了就回退"而不说明红在哪
    example: 若 policy-record.controller e2e 断言依赖 JSON.stringify(record) 的字段顺序或不含关系字段，加 relation 后 class-transformer 默认序列化行为可能新增字段导致断言失配——需确认是否发生、如何处理（如 @Exclude 关系字段）
    golden: false
  - |-
    (技术)
    intent: 若确认不能安全补关系装饰器，backlog.md 2026-08-27 条目需要有明确的技术结论收尾，而不是无限期挂起
    oracle: 不能补时，在 backlog.md 对应条目补充实测证据（跑出的具体失败/副作用）+ 结论"维持不做"或给出替代方案（如仅补一个方向的关系、或在 sqlite DataSource 显式打开 foreign_keys pragma 并手工验证约束生效），并将该条目状态改为 [x]（不再是无结论的开放项）
    example: 无
    golden: false
  - |-
    (技术)
    intent: 若确认可以安全补关系装饰器，实际落地且不改变现有 API 响应契约
    oracle: 补关系后 GET /api/commission-batches/:batchId/policy-records 等既有接口响应字段/结构与改动前一致（关系对象不应意外出现在响应 DTO 里）；backend build/lint/test/test:e2e 全绿
    example: 无
    golden: false
relevant-standards:
  - BE-TYPEORM-02 · standards-backend.md §BIGINT 字段序列化约定
  - SH-API-02 · standards-shared.md §错误码约定
reference:
  - backend/src/policy-record/policy-record.entity.ts §class PolicyRecord（现状：import_batch_id/import_file_id 均为普通 @Column）
  - iterations/v1/trd.md §表：保单记录（L20-L21，import_batch_id/import_file_id 外键契约来源）
  - backlog.md 2026-08-27 条目「PolicyRecord 实体未用关系装饰器声明外键」（本任务的评估/落地对象）
context: |-
  本条目此前在 manual-test 阶段评估结论是"不做"（理由：会破坏隔离单测 + sqlite 默认不开 FK pragma 起不到实际效果）。
  用户在本轮验收要求重新评估落地。任务边界：只处理 import_batch_id/import_file_id 两个外键关系，
  不涉及其余表的关系建模；若评估后仍判定不做，必须把技术理由写实（不是重复引用旧结论），backlog 条目相应关账。
known-risks:
  - 加 @ManyToOne 可能触发 TypeORM 默认 eager 查询或序列化行为变化，需显式关闭（lazy: true 或不设 eager）避免性能/契约意外
do-not:
  - 不改列名、列类型、nullable 语义
  - 不新增级联删除/更新行为（onDelete 保持与 migration SQL 的 RESTRICT 语义等价，不设为 CASCADE）
escalate-if:
  - 若发现改动会导致既有 API 响应契约变化且前端有依赖，需与用户确认是否接受契约变化，不得自行决定
---
