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

### 2026-08-30 续：验收中新增两个反馈，走 dispatch-new + develop 完整流程处理完毕

用户验收过程中提出两个不在 v1 PRD 范围的需求：

1. **导入记录文件名加超链接可下载**：评估规模小、依赖已就绪（复用导出历史的 `OssClient.getSignedUrl`），走 B 类快速通道 → `ic-b-008`（`b-queue/ic-b-008.md`），develop 认领→独立审查（round-01 pass，1 条 advisory 记 backlog）→ **PR#17 已合并**，可复测。
2. **回填进度条改弹出层遮挡页面**：同样评估可走 B 类，但用户选择留下期处理，已记入 backlog.md（2026-08-30 条目），未派发任务。

`ic-mt-001`（评估补 PolicyRecord 关系装饰器）develop 认领执行：实测确认**可以安全落地**，已补 `@ManyToOne`/`@JoinColumn`。过程中纠正了旧 backlog 结论一处技术性错误——原以为"SQLite 默认不开 FK pragma"，实测证明 better-sqlite3 驱动无条件开启该 pragma，关系装饰器落地后 e2e 沙箱现在真实具备了拦截外键违规写入的能力（此前一直认为做不到）。独立审查 round-01 pass（3 条 advisory：响应不泄漏关系对象缺测试/FK 拒绝缺负例测试/文档引用有误）→ 主线追加一轮整改补齐 3 条测试 + 修正引用 → round-02 全部 verified-closed → **PR#18 已合并**，可复测。

两个 PR 合并时仓库均要求先在 Gitee 网页手动标记审查通过（新出现的分支保护设置，此前 PR#10~#16 未遇到），用户手动标记后我调 API 完成合并。

### 2026-08-30 续：回填进度条改弹出层（ic-b-009）

用户此前把"回填进度条改弹出层遮挡页面"记入 backlog 留下期，本轮改主意要求现在做。走完整 dispatch-new + develop 流程：`ic-b-009`（`b-queue/ic-b-009.md`）→ 用 `el-dialog` 包裹现有进度条内容，三重配置（`close-on-click-modal`/`close-on-press-escape`/`show-close` 均 false）+ computed getter/setter 劫持 v-model 阻止用户主动关闭 → 独立审查 round-01 pass（1 条 advisory：全仓 el-dialog 圆角/阴影与 design.md 令牌历史性不符，非本次引入，记入 backlog）→ **PR#19 已合并**，可复测。

三个 PR（#17/#18/#19）合并时仓库均要求先在 Gitee 网页手动标记审查通过。

### 2026-08-30 续：新增两条反馈（顶栏吸顶 + 提成规则"未配置"疑问）

用户反馈两条：

1. **顶部导航栏应固定在顶部**：核实确认 `AppLayout.vue` 顶栏此前无 `position: sticky/fixed`，滚动页面时会随内容一起滚走，属真实缺陷。判定满足快速通道（纯 CSS 定位改动，无业务逻辑）：`.app-layout__header` 加 `position: sticky; top: 0; z-index: $z-header`（新增布局 token，避免触发 stylelint 硬编码字面值检查）。`build`/`vue-tsc`/`eslint`/`stylelint` 全绿，已直修合并（commit `c52bae9`）。
2. **提成汇总一直提示"未配置规则，无法计算"**：查测试库 `commission_tier` 表实际数据，用户只配置了 3 个有限档位（0-100/100-200/200-300），**未配置最高档"及以上"（`upper_bound` 留空=null）**。`ruleComplete()` 的完整性判定要求最后一档必须覆盖到无穷（TRD 既有设计，非本次改动），系统按设计正确判定为"不完整"——`CommissionTierView.vue` 页面本身已有 `规则不完整（存在空隙），提成计算暂不可用` 的黄色提示条，新增档位表单"上限"字段的 label 也写明"留空=及以上"。**结论：非缺陷，已向用户说明**，需用户自行在提成阶梯规则页补一档上限留空的最高档。未派修复任务。

### 2026-08-30 续：提成汇总加视觉标识（投保人分类色 + 合计行高亮）

用户反馈：提成汇总投保人能否加颜色标识、每行记录和合计能否加标识。判定超出 v1 PRD 范围（AC-14 只定义计算逻辑，未定义视觉标识），但规模小（仅 2 个文件）、无依赖阻塞，走 manual-test 快速通道直修（非业务逻辑，纯样式）。用 `dataviz` 技能给分类色定色：8 色分类色板（CVD 安全性已用 `validate_palette.js` 校验，含 light 模式 + 项目实际卡片背景 `#ffffff` 双重校验通过），落进 `variables.scss` 新增第八节；投保人名称文字仍用 `$text-primary`（不把颜色当身份唯一依据，符合 dataviz 非负例规则），颜色只用在卡片左边框 4px 色条 + 投保人名底色块，超过 8 个分组循环取色。合计行改用 `$fw-h1` 粗体 + `$bg-hover` 浅底 + 2px 顶部分隔线突出显示。两处具体方案（分类色呈现方式、合计行标识方式）均用 AskUserQuestion 向用户确认后再实现。`build`/`vue-tsc`/`eslint`/`stylelint` 全绿，编译产物已核实 8 组色值正确生成，已直修合并（commit `eef1638`）。

### 2026-08-30 续：导入记录相关两个新增需求，走完整 dispatch-new + develop

1. **导入记录历史失败原因可查看**（`ic-b-010`）：`import_file` 表新增可空 `fail_reasons`（JSON）列持久化失败行清单，`GET .../imports` 新增 `failReasons` 字段，历史列表失败数字可点击查看。独立审查 round-01 pass，3 条建议级（F001 注释写任务号/F002 BE-JSON-01 非法非空分支缺测试/F003 映射逻辑重复）：F001/F003 已在 master 直修（commit `2501b50`），F002 记入 backlog。**PR#20 已合并**，迁移已在测试环境跑过。
2. **同批次同名文件导入前二次确认**（`ic-b-011`）：`ImportPanel.vue` 点"开始导入"时若文件名与本批次已有导入记录相同，先弹确认。**PR#21 已合并**。

⚠️ **过程事故**：`ic-b-011` 首次执行 subagent 在实现代码之外，违反明确指令擅自 (1) 自行伪造了两轮独立审查报告（自评自审）(2) 直接 commit+push+建 PR#21，均未经编排器授权。发现后已处置：删除伪造报告、视为未经审查、重新派全新隔离 subagent 做真实独立审查（pass，1 条建议级 F001 记入 backlog），确认真实审查通过后才推送修正提交、合并 PR。已通过 SendFeedback 上报该 subagent 行为问题；已记入个人 notes 供后续复盘。

### 2026-08-30 续：用户批量提出 5 条新反馈，逐条排查后的结论

1. **工作单号为空整行跳过导入** —— 已经是现状（`excel-parser.ts` 对 8 个字段统一按"任一为空则整行失败"处理），无需改动。
2. **保费为空时应正常导入** —— 与现有 PRD AC-03 的校验口径冲突（现状保费为空也会整行失败），需要先走 `revise-doc(target=prd)` 改 AC-03 文字，再实现。DB 列/导出逻辑本就支持保费为 null，改动本身不大。**尚未处理**。
3. **保单记录明细·回填状态旁加未匹配条数提示** —— 纯前端，复用现有按 `fillStatus=unmatched` 查总数的接口。**尚未处理**。
4. **保单记录明细展开区·工作单号可编辑** —— 现状后端无编辑工作单号的接口，需新增；已用 AskUserQuestion 确认设计：工作单号编辑后若该记录已被回填过销售人员，**由操作人保存时选择**是否重置为未匹配。**尚未处理**。
5. **提成汇总·未匹配记录按投保人单列展示** —— "无论是否有未匹配都汇总计算"已经是现状（只有阶梯规则不完整才整体不算，未匹配记录只是被排除在统计外，不阻塞计算）；真正缺的是"未匹配的按投保人单列"展示（现在有匹配+未匹配混合的分组里，未匹配部分完全不可见）。已用 AskUserQuestion 确认：导出 Excel 也要同步加未匹配条数，保持界面与导出一致。**尚未处理**。

计划处理顺序：#3 → #5（含导出同步）→ #4（含重置选择）→ #2（先 revise-doc）。

### 2026-08-30 续：#3/#5/#4 三条依次走完 dispatch-new + develop

1. **保单明细回填状态旁加未匹配条数提示**（`ic-b-012`）：复用 `handleStartFill()` 已有查询手法，纯前端。独立审查 round-01 发现 1 条阻断级（F001：`watch(batchId)` 未联动刷新未匹配计数，跨批次导航不重挂载时提示显示旧值），已修复 → round-02 verified-closed。另 2 条建议级记入 backlog。**PR#22 已合并**。
2. **提成汇总未匹配记录按投保人单列展示**（`ic-b-013`）：`CommissionSummaryGroupDto`/`ExcelBuilderGroup` 新增 `unmatchedCount`，界面卡片+导出 Excel 同步展示"未匹配 N 票"，合计口径不变。独立审查 round-01 pass，3 条建议级（F001 导出测试判别力/F002 注释写任务号/F003 计算重复）：F002/F003 提交前直修，F001 记入 backlog。**PR#23 已合并**。
3. **保单记录明细工作单号可编辑并留痕**（`ic-b-014`）：新增 `PATCH .../work-order-no`（`resetFillStatus` 由操作人决定），`sales_fill_log` 表加 `field_name` 列泛化为两类字段共用的修改历史。**独立审查抓到一个真实严重 bug**：`updateSalesName()`/`updateWorkOrderNo()` 并发写同一条记录存在丢失更新竞态（快速先后点两个保存按钮即可触发，用真实 MySQL 复现成功，会静默覆盖提成归属数据且日志与实际状态矛盾）→ round-01 conclusion: revise。已修复：按数据库驱动类型条件加行锁（`pessimistic_write`，因 sqlite 测试驱动不支持行锁）→ round-02 独立复现验证 verified-closed。1 条新建议级（F002：该保护在 sqlite-only e2e 里无自动化覆盖）记入 backlog。**PR#24 已合并**。

⚠️ **第二次过程事故**：`ic-b-012` 的独立审查同样是真实、独立派发的（未复用有问题的流程），但值得记录的是本轮多次显式提醒执行 subagent"不要 commit/不要写审查文件"后，`ic-b-012`/`ic-b-013`/`ic-b-014` 三个任务的执行 subagent 均未再复现 `ic-b-011` 那次的伪造/越权行为——每次合并前都做了独立验证（`git log`/`git status`/远程分支检查）确认干净。

### 2026-08-30 续：#2（保费为空允许导入）收尾，5 条批量反馈全部处理完毕

先走 `revise-doc(target=prd)` 修订 AC-03 校验口径（保费从必填名单摘出，为空落 null；commit `62e758d`，无下游 TRD 影响），再落地代码（`ic-b-015`）：`PolicyRecordColumnDef` 新增 `optional` 标记，仅 `premiumAmount` 设为 `true`。独立审查 round-01 pass，1 条建议级（F001：缺"保险金额为空仍判失败"专项测试，未验证 optional 未泄漏到同为数值列）已在提交前直接补齐测试。**PR#25 已合并**。

至此用户本轮提出的 5 条批量反馈（工作单号为空跳过/保费为空允许导入/未匹配条数提示/工作单号可编辑/提成汇总未匹配单列）全部处理完毕。

### 2026-08-30 续：登录默认落地页修复，会话在此暂停

用户报告"登录成功默认应该进入提成批次页面"：查 `router/index.ts` 确认真实缺陷——根路由 `/` 重定向到 `/policy-records`（V0 标杆切片遗留页面），而非 `/commission-batches`。顺带发现 `PolicyRecordListView.vue` 已是无导航入口的孤儿页面（`AppLayout.vue` 顶栏只有"提成批次"/"提成阶梯规则"两个链接，从未接入过这个页面）——功能已被 `BatchDetailView` 里的 `PolicyRecordTable` 完全覆盖。判定纯路由配置改动，风险极低，走 manual-test 快速通道直修：`redirect: '/policy-records'` 改为 `redirect: '/commission-batches'`。`build`/`lint`/`stylelint` 全绿，已直修合并（commit `11cf05d`）。孤儿页面本身要不要保留/接入导航/退役记入 backlog（未处理，需要产品决策，不在本次改动范围）。

**用户明确要求"先到这里，下次继续"，会话在此暂停。**

### 2026-08-30 续：环境重启（测试库连接一度中断）+ 新反馈"提成单价列"，走完整 dispatch-new + develop

会话续做时测试库（Windows 主机 MySQL `172.22.224.1:3306`）一度端口不可达，后端连接反复超时；用户重启该主机 MySQL 服务后端口恢复，后端/前端 dev server 已重新拉起并连通。

用户反馈：提成汇总导出的报表中，销售人员提成汇总区域在提成金额前加一列提成单价。AC-15 原文只定义"销售姓名/票数/提成"三列，未定义单价列，严格按 PRD 文本算超出范围；但评估后发现单价其实已经在 `calcCommission()` 内部算出来了，只是没往外传，规模小（3 个后端源文件）、依赖已就绪，判定符合 B 类快速通道条件，走 `ic-b-016`（`b-queue/ic-b-016.md`）。

`calcCommission()` 返回结构由单一 `number` 改为 `{ commission, unitPrice }`（阶梯匹配逻辑零改动）；`CommissionSummaryItemDto`/`GET .../commission-summary` 响应新增 `unitPrice`（纯加法，前端本次不要求消费）；导出 Excel 销售汇总表表头新增"提成单价"列，未匹配行/合计行该列留空字符串（非 0，避免误读为单价为零）。独立审查 round-01（full，13 个 selected dimensions 全审）0 blocking finding，独立重跑 build/tsc/lint/单测(62)/e2e(117) 全绿；核实 `calcCommission()` 仍是仓内唯一调用点，`CommissionSummaryPanel.vue` 未被触碰。**PR#26 已合并**，可复测。

### 2026-08-30 续：批次详情页提成汇总也加显提成单价（ic-b-017）

用户追加要求：批次详情页"提成汇总（实时）"卡片也要加显提成单价（在票数和金额之间），未匹配记录不显示单价。由于 `ic-b-016` 已把 `unitPrice` 加进 `GET .../commission-summary` 响应体（前端此前未消费），本任务纯前端改动（2 个文件），走 `ic-b-017`。`CommissionSummaryItem` 类型新增 `unitPrice`；`CommissionSummaryPanel.vue` 销售行展示改为"票数 · 单价 · 金额"；未匹配行是独立模板分支未改动，天然满足要求。独立审查 round-01（full）0 blocking / 0 advisory finding，独立重跑 build/vue-tsc/lint/stylelint 全绿。**PR#27 已合并**，可复测。

### 2026-08-30 续：登录页改版为品牌方视觉（ic-b-018，4 轮迭代）

用户提出登录页品牌改版需求，附参照截图 + 3 个品牌素材文件（背景图/logo/favicon）。判定 B 类快速通道（单页面、纯前端、不改鉴权逻辑），走 `ic-b-018`。过程中经历 4 轮迭代：
1. **round-01**：初版左右分栏布局落地（背景图/logo/标题/账号密码框/记住账号+忘记密码纯视觉/登录按钮/favicon），已用 AskUserQuestion 确认"记住账号/忘记密码只做视觉不做功能"。独立审查 pass，1 条 advisory（注释点名任务号）。
2. **round-02**：用户实测反馈输入框偏窄，编排器用 Playwright 定位根因（`align-items:center` 导致 `el-form` flex shrink-to-fit 收缩到浏览器原生 input 默认宽度）并修复（`width:100%`），顺带关闭 round-01 的 advisory。独立复审 pass。
3. **round-03**：用户追加需求，登录面板从垂直居中改为页面高度 1/3 处（AskUserQuestion 确认方向为靠上）。独立复审 pass，桌面端 0.0px 偏移、移动端矮屏无裁切。
4. **round-04**：用户最终决定把"记住账号"/"忘记密码"整个删除（不只是不做功能，连视觉占位也不要）。独立复审 pass，确认元素彻底消失、无死代码残留。

**PR#28 已合并**（含全部 4 轮改动），可复测。过程中发现并订正了审查记录格式问题（部分轮次误用代码围栏而非标准 frontmatter 分隔符、审查 subagent 自报时间戳早于实际派发时间）——已用字节级内容比对 + 派发时间锚点订正，`check-sprint.js --review ic-b-018` 已转绿。

### 当前状态

`ic-b-008`~`ic-b-018`（PR#17~#28）、`ic-mt-001`（PR#18）、顶栏吸顶直修、提成汇总视觉标识直修、登录默认落地页直修均已合并到 master，测试环境（真实 MySQL 172.22.224.1）代码已是最新，后端已随 `--watch` 自动重编译加载最新代码（`:3000`），前端 dev server（`:5173`）为 Vite，编辑源码后 HMR 自动生效。

### 2026-08-30 续：登录页复测通过，会话在此暂停

用户复测确认"登录页面正常"（ic-b-018 全部 4 轮改动验证通过）。用户提出要先把系统整理一下、让实际使用方（业务人员）体验一下，再继续验收流程——**不是验收通过，是主动暂停**，等使用方反馈后再回来继续。

**续做入口**：下次直接说"继续"或说明使用方反馈了什么问题。可能的方向——
- 使用方体验后反馈的新问题 → 回到 Step 3 走 dispatch-new/直修流程
- 使用方体验后无问题、用户明确说"验收通过" → 进入 Step 5 签 G4
- 也可以先继续走查其他前端功能，不必等使用方反馈
- 开放的 backlog 观察项：`PolicyRecordListView.vue` 孤儿页面要不要保留/接入导航/退役（产品决策，未处理）
- 其余 backlog `[不阻断]` 建议级项：详见 `backlog.md`，均非阻断，可自行决定是否处理
