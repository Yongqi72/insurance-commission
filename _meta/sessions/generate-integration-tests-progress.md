## generate-integration-tests 进度 · v1

### 档位
完整档（已完成，全绿）。`pinchtab` 技能在本会话不可用，改用 Playwright + Chromium 补齐前端场景 + 视觉冒烟断言。

### 修复任务
- ic-b-001（OSS 归档路径改为按日期分层，用户联调中直接提出的需求变更，非缺陷）：[merged]，PR #10，已复测 flow1/flow5 全绿

### 状态
Step 6 三条件已满足：
- 后端 5 条穿透流 + 前端 11 组场景（30 项断言）+ 3 条视觉冒烟，全部通过，主流程无阻断
- 契约对账已做：发现 1 处 `updatedAt` 字段未在 trd.md 文档化，已记 backlog 待 revise-doc
- `[不阻断]` 问题（buildDatedOssKey 缺单测、OSS key 碰撞域扩大等）均已分级记入 backlog.md

前端测试脚本：`integration-tests/frontend/v1-run-all.js`（Playwright，`node v1-run-all.js` 直接跑），沙箱环境关键点已记入 `feedback.md`（Chromium 必须显式 proxy+bypass，不能用 direct://）。

下一步：manual-test（人工验收）。
