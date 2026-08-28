## generate-integration-tests 进度 · v1

### 档位
轻量档（已完成，全绿）。完整档（前端 pinchtab + 视觉冒烟）因环境限制未跑，已降级移交 manual-test，详见 `integration-tests/result-2026-08-28.md` §前端视觉基线判定。

### 修复任务
- ic-b-001（OSS 归档路径改为按日期分层，用户联调中直接提出的需求变更，非缺陷）：[merged]，PR #10

### 状态
Step 6 三条件（轻量档范围内）已满足：5 条后端穿透流全部通过、主流程无阻断、契约对账已做（发现 1 处 `updatedAt` 字段未文档化，已记 backlog 待 revise-doc）、`[不阻断]` 问题均已分级记入 backlog.md。

前端完整档遗留给 manual-test 会话补齐：
- pinchtab 前端场景（批次列表→详情→导入→回填→提成汇总→导出主链路 + 提成阶梯规则页）
- 视觉冒烟断言（主色 `--el-color-primary`==`#1677FF`、视口无横向外溢、顶栏高度 56px）

下一步：manual-test（人工验收），需在其会话启动时额外补做上述前端完整档遗留项。
