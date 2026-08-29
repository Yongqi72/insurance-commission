## manual-test 进度 · v1

### 本轮已处理（backlog 快速通道，直接 commit 到 master，无独立 develop 任务包）

用户在验收会话中要求"全部解决"当时清点出的 23 条 backlog 开放欠账。逐条核实/评估后：

- **20 条已解决**（快速通道直修 / 管理性关账），提交记录：
  `1b3ba4c` `cbb6524` `0474dd5` `ba78593` `a758231` `db72572` `ee5d9ec` `ff90b4a` `2ea2ec2`
  （均已推送 master；每条 backlog.md 对应条目已标 `[x]` 并附结论）
- **3 条评估后决定不做**，保持 backlog `[ ]` 开放，理由已写入 backlog.md 对应条目：
  - 销售人员回填第三方接口（外部依赖阻塞，接口由朱敏提供，尚未就绪）
  - `PolicyRecord` 实体补关系装饰器（会破坏隔离单测 + SQLite 默认不开 FK pragma，起不到实际效果）
  - migration `down()` 自动化测试基建（沙箱无 Docker/MySQL，属 CI 基础设施投入决策）

全量验证：backend `build`/`lint`/`test`(53)/`test:e2e`(100) 全绿；frontend `build`/`lint`/`stylelint` 全绿；
Playwright 走查登录+批次列表+批次详情+保单记录+阶梯规则四页无控制台报错、无 5xx。

### 当前状态

用户尚未明确说"验收通过"。等待用户继续走查前端功能或明确验收结论。
