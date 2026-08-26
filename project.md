# insurance-commission

## 产品层
> 由 draft-prd-vN 填写

**产品目标**（v1，2026-08-25）：用批次化的"导入 → 回填/人工补录（留痕）→ 阶梯提成实时计算 → 分投保人导出报表"流程，替代保单管理人员纯人工在 Excel 里核对提成。

**目标用户**：保单管理人员（1~几人，全集团数据可见）。

**功能边界（v1）**：批次管理与 Excel 导入（分多次导入、OSS 归档原始文件）、销售人员回填与人工补录（第三方接口骨架 + 人工补录留痕）、提成阶梯规则管理（可配置档位+变更历史）、提成报表导出（按投保人分 sheet，实时计算不落库快照）。不含：真实第三方接口联调（外部依赖阻塞）、多角色权限、导出文件归档、投保人名称归一化清洗、计算结果历史快照。

## 技术层
> 由 draft-tech-design 填写

**技术栈**（V0 draft-foundation 定，2026-08-25）：
- 后端：NestJS + TypeORM，MySQL
- 前端：Vue3 + Element Plus + Pinia + Vite
- 鉴权：需要登录（单一管理员账号密码登录 + JWT Bearer Token 校验，全局 Guard opt-out 模型）
- 测试框架：后端 Jest（`npm run test` / `test:e2e` / `test:cov`）

**模块划分**（V0 走骨架范围）：
- 后端：`auth`（登录）、`policy-record`（保单记录，V0 仅建列表查询，导入/回填/提成计算留待 V1）
- 前端：`AppLayout` 外壳、`LoginView`、`PolicyRecordListView`

## 当前状态
V0 走骨架完成（PR #1 已合并 master，2026-08-25）。地基件 14 项落地，标杆切片（登录→保单记录列表）端到端跑通。下一步：V1 `draft-prd-vN`。
