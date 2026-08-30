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

### 前端视觉打磨（用户后续追加要求"美化"，本轮一并处理）

- 落实 design.md 已定义但未充分应用的卡片/最大宽度规范（`.surface-card`/`.data-table` 全局工具类）
- 顶栏改主色蓝底 + 白字导航
- 修复批次详情页顶栏"提成批次"导航项不高亮的 bug（batch-detail 与 batch-list 路由平级，vue-router 默认判定不覆盖）
- 修复移动端（<768px）顶栏标题+导航+退出登录挤成一行导致逐字断行的预先存在 bug
- 导入 Excel 弹窗的原生 `<input type="file">` 换成风格化触发器
- 提交记录：`d2adc1d` `66d086f` `32998aa` `33cfb4d`；全程 Playwright 复测三条视觉冒烟锚点通过，后端全量测试保持绿

### 2026-08-29：第三方回填接口进展

朱敏交付了 ic-b-007（PR #16，已合并 master）：VB.NET ASHX 接口 + Token 校验 + 本系统侧 `X-Fill-Token` 请求头透传，本地用真实内部库数据联调通过（见 `_meta/sessions/ic-b-007-integration-result.md`）。核实发现两点缺口：
1. **缺独立审查**——`node scripts/check-sprint.js --review ic-b-007` 报无 `code_reviews[]` 条目，与其余 6 个 B 类任务不同；该任务 `risk: sensitive`
2. **未部署到可从本环境访问的地址**——目前只能连朱敏本机 `http://localhost/salesfill/...`，`sales-fill-api/README.md` 里"挂现成外网网站 IIS 子应用"的正式部署步骤尚未执行，本环境 `backend/.env` 也未配置 `SALES_FILL_API_URL`

已把这两点报告给用户，**用户明确选择：等正式部署完成后，把独立审查和全量测试一起做，不提前拆开处理**。

### 2026-08-29 二次更新：正式部署后实测发现阻断级 bug

接口已部署至 `http://58.210.163.18:8085/salesfill/SalesFill.ashx`，`.env` 已配置好 URL/Token。实测：
- GET / 错误 token / 空数组三条不查库路径均正常（405 / 401 / 200 `{}`）
- **一旦命中真正查库路径（`QuerySalesNames`）就返回 IIS 原生 HTML 500 错误页，不是应用自己该返回的 JSON 错误体**——异常没被 `ProcessRequest` 的 `Catch ex As Exception` 接住，比普通业务异常更底层
- 高度吻合任务包 `known-risks` 预判的 `Fcl.WSOP.lic` 授权异常；已整理复现步骤 + 排查方向反馈给朱敏（用户负责转达）

### 2026-08-29 三次更新：500 已修复，独立审查通过

朱敏确认根因：新服务器无法直连内部库，改造为经 `sqldbservice.asmx` 中转的 `service` 模式（`Web.config` 新增 `DbAccessMode` 开关），补齐运行时依赖 `Fcl.DataWork.dll`。协调者复测生产地址 `http://58.210.163.18:8085/salesfill/SalesFill.ashx`：

| 测试 | 结果 |
|---|---|
| GET | ✅ 405 |
| 错误 token | ✅ 401 |
| 空数组 | ✅ 200 `{}` |
| 真实单号 `SHGYLSE260200924` + 不存在单号 `NOT-EXIST-001` | ✅ 200 `{"SHGYLSE260200924":"周晶"}`（命中给姓名，未命中的正确不出现在响应里） |
| 响应耗时 | 1.68s（5s 阈值内） |

随后补的 ic-b-007 独立审查（sensitive 档，全新 subagent 自读任务包+diff+VB.NET 源码+跑 e2e）结论 **pass**，0 阻断，4 条一般/建议级发现：
1. `Web.config` `customErrors mode="Off"` 注释理解反了——实际语义是让逃逸异常向远程用户展示详细错误页（而非关闭它），与之前那次 500 观察到的"IIS 原生错误页"现象吻合；已改为 `RemoteOnly` 修复（本地已改，需朱敏那边重新发布这版 Web.config 才对线上生效）
2. 任务包 `b-queue/ic-b-007.md` 未覆盖后来追加的 service 模式改动（已按同等标准审查，未见结构性问题，仅文档口径滞后）
3. 本次生产环境复测结果之前没写回仓库（本次已补写 backlog.md/本文件）
4. 生产地址是明文 HTTP 非 HTTPS，token+姓名明文传输——建议级观察项，非本任务验收缺陷

结论已写入 `status.yml` `code_reviews[]`，`b-queue/ic-b-007.md` 状态确认为 `merged` 且独立审查通过。

### 2026-08-29 四次更新：分批回填 + 真实进度条已实现

用户提出新需求并已落地：批次详情页"开始回填"无论明细多少条，每 100 条调一次第三方接口，前端展示真实进度条。

- 后端 `fill()` 新增可选 `limit`/`afterId` 分批参数，改用 id 升序游标分页（而非"还剩多少 unmatched"计数分页——第三方查不到的记录会永远停留 unmatched，计数分页会死循环重试同一批）；省略 `limit` 保持旧行为向后兼容。补 3 条新 e2e + 6 处既有断言更新，全量 53 单测 + 104 e2e 全绿
- 前端循环调用（每批 limit=100），每批推进一次真实进度条（条纹动画+百分比+已处理/总数文案）
- 用真实插入的 850+ 条测试数据经 Playwright 实测验证：9 次分批请求、游标严格递增不重叠（209→309→…→809）、进度条从 0/853 推进到 200/853、最终统计正确聚合；测试数据已清理
- TRD 同步更新新契约；提交 `cbbe555`

### 2026-08-29 五次更新：全量测试完成，含真实数据下发现并修复的超时问题

- 自动化回归：backend build/lint/53单测/104 e2e 全绿；frontend build/lint/stylelint 全绿
- **真实第三方接口发现阻断级问题**：约一成概率单次请求耗时 16~18s（同一批工作单号原地重测两次均复现），5s 超时下会把真实命中误判成未匹配；用户明确要求接口侧暂不推给朱敏，本系统后端先兼容——`FILL_TIMEOUT_MS` 从 5s 放宽到 30s，已修复并推送（`f630449`）
- 修复后用真实数据复测：150 条批次（第120条为真实可命中单号）分两批处理，第二批 17.4s 内正确返回 matchedCount=1，不再误判
- 前端真实场景走查：2 条记录（1 条真实可命中单号 + 1 条查不到的），点击开始回填后页面正确显示"周晶"（真实命中）与"未匹配"，Playwright 截图确认
- 所有测试数据（批次 4/5/6 及其保单记录）均已清理，不留痕迹

### 当前状态

**全量测试已完成，会话在此暂停**（用户明确要求"先到这里，下次继续"）。接口已就绪、独立审查已通过、分批回填功能已实现并用真实数据验证正确（含发现并修复超时问题）。工作区无未提交改动，master 已推到远端（`bc1e56d`）。

**续做入口**：下次直接说"继续"或说明具体想做什么。可能的方向——
- 回到 manual-test 主流程：继续走查前端功能（本期已知欠账清单见 backlog.md 里带 `[欠账]` 标记的条目，多数已解决，剩余开放项见下）、或用户直接说"验收通过"进入签 G4
- 那条间歇性超时问题（backlog.md 2026-08-29 条目）目前只是"本系统后端放宽超时兼容"，根因还没排查，如果后续发生频率变化或用户想升级给朱敏处理，可以再讨论
- 仍保持开放的 backlog 项：销售回填第三方接口相关的历史遗留（已解决大部分，仅超时问题新增一条待观察）、`PolicyRecord` FK 装饰器（评估后决定不做）、migration `down()` 自动化测试基建（沙箱无 MySQL，决定不做）

### 2026-08-30：续做验收，测试环境接入真实 Windows 主机 MySQL，3 条开放项全部处理

**测试环境**：本轮沙箱新接入 Windows 宿主机 MySQL 8.0.36（`172.22.224.1:3306`，WSL2 网关地址），`backend/.env` 已改 `DB_TYPE=mysql`（原为 sqlite 权宜方案）；新建 `insurance_commission` 库并跑 `migration:run` 建表。后端 `http://localhost:3000`、前端 `http://localhost:5173` 均已拉起。

用户对上轮遗留的 3 条开放 backlog 项表态"都解决"，逐条处理：

1. **PolicyRecord 关系装饰器**：不满足 manual-test 快速通道条件（需要判断是否会破坏隔离单测，非显而易见），写入 develop 任务包 `ic-mt-001`（`iterations/v1/queue/ic-mt-001.md`，`source: manual-test`，状态 `[可取]`），已同步 `status.yml`/`sprint.md`，commit+push（`e6fe8fd`）。任务范围：评估能否安全补 `import_batch_id`/`import_file_id` 的 `@ManyToOne`，能补则落地，不能补需给出实测证据而非重复引用旧结论。
2. **migration `down()` 自动化测试基建**：用户选择"现在用真实 MySQL 手动跑一次验证"而非另立 CI 自动化任务。已用新接入的 MySQL 完整验证两条上游路径（空库直建 / 已有 V0 表 ALTER），`migration:run`→`migration:revert` 全链路均通过，唯一索引正确恢复、测试数据完整保留、无半回滚状态；验证用数据已清理，库已恢复 v1 终态。backlog.md 对应条目标 `[x]`，注明"一次性人工验证，非 CI 覆盖，是当前决策下的预期状态，不再挂账"。
3. **第三方接口间歇性超时**：用户确认当前 30s 超时兼容方案已足够，不再升级给朱敏排查根因。backlog.md 对应条目标 `[x]` 关账。

### 当前状态

3 条开放项已全部按用户决定处理完毕（1 条转 develop 任务包待认领执行，2 条已直接关账）。测试环境仍在运行（真实 MySQL，非 sqlite），等待用户继续走查前端功能或说"验收通过"。
