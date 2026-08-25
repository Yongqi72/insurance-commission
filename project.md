# insurance-commission

## 产品层
> 由 draft-prd-vN 填写

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
V0 地基设计中（draft-foundation）
