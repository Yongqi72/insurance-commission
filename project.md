# insurance-commission

## 产品层
> 由 draft-prd-vN 填写

**产品目标**（v1，2026-08-25）：用批次化的"导入 → 回填/人工补录（留痕）→ 阶梯提成实时计算 → 分投保人导出报表"流程，替代保单管理人员纯人工在 Excel 里核对提成。

**目标用户**：保单管理人员（1~几人，全集团数据可见）。

**功能边界（v1）**：批次管理与 Excel 导入（分多次导入、OSS 归档原始文件）、销售人员回填与人工补录（第三方接口骨架 + 人工补录留痕）、提成阶梯规则管理（可配置档位+变更历史）、提成报表导出（按投保人分 sheet，实时计算不落库快照）。不含：真实第三方接口联调（外部依赖阻塞）、多角色权限、导出文件归档、投保人名称归一化清洗、计算结果历史快照。

## 技术层
> 由 draft-tech-design 填写

**技术栈**（V0 draft-foundation 定，2026-08-25；v1 draft-tech-design 补充，2026-08-26）：
- 后端：NestJS + TypeORM，MySQL（测试/开发/生产环境统一 MySQL，V0 沙箱曾用 SQLite 的临时方案已结束）
- 前端：Vue3 + Element Plus + Pinia + Vite
- 鉴权：需要登录（单一管理员账号密码登录 + JWT Bearer Token 校验，全局 Guard opt-out 模型）
- 测试框架：后端 Jest（`npm run test` / `test:e2e` / `test:cov`）
- 文件存储：阿里云 OSS（私有 Bucket + 后端签名 URL），封装于 `OssClient`
- Excel 处理：`exceljs`（导入解析 + 导出生成共用列定义，封装于 `ExcelParser`/`ExcelBuilder`）

**数据库结构（v1 新增/变更，详见 `iterations/v1/trd.md`）**：
- 新建表：`commission_batch`（提成批次）、`import_file`（导入文件记录）、`sales_fill_log`（销售人员补录日志）、`commission_tier`（提成阶梯规则）、`commission_tier_change_log`（阶梯规则变更日志）
- 修改表：`policy_record`（新增 `premium_amount`/`import_file_id`/`sales_fill_source`；`work_order_no`/`policy_no` 唯一约束移除）
- 本次结构变更配套正式 migration 文件，替代 V0 遗留的 `synchronize` 建表方式

**模块划分**：
- 后端：`auth`（登录，V0）、`policy-record`（保单记录，V0 建列表查询，v1 扩展字段+补录接口）、`commission-batch`（v1 新增：批次/导入/回填触发）、`commission-tier`（v1 新增：阶梯规则）、`commission-report`（v1 新增：实时汇总+导出）、`common/oss`、`common/excel`（v1 新增共享封装）
- 前端：`AppLayout` 外壳（V0）、`LoginView`（V0）、`PolicyRecordListView`（V0）、`BatchListView`/`BatchDetailView`/`CommissionTierView`（v1 新增）

## 当前状态
V0 走骨架已完成。V1 开发与人工验收完成，G1–G4 已签（G4：2026-09-10），G5 未签；sprint 14 个任务全部合并，后续 B 类修复已合并，测试环境部署记录截至 2026-09-01。验收依据与环境限制见 `iterations/v1/acceptance-report.md`。下一步：`wrap-up-iteration`；生产部署需另行执行部署流程。上方产品与技术摘要保留设计阶段描述，后续 B 类交付差异待收尾同步。
