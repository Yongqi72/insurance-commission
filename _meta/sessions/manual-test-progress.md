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

### 当前状态

**本轮验收仍暂停，且新增一个阻断级 bug 待朱敏排查**：接口部署了但查库这条路径实际不通（见上）。独立审查和全量测试都无法在这个状态下进行——测出来的只会是"接口炸了"，没有意义。等朱敏确认修复（服务器上真的能返回正确的 `{"工作单号":"姓名"}` 数据）后，再继续下面的流程。

**续做入口**：朱敏修好后，重新开会话说明"朱敏接口修好了，继续"，我会先用 curl 实测确认查库路径真的返回正确数据（不只是 405/401/空数组这三条容易过的），确认无误后再补 ic-b-007 的独立审查（读任务包+diff+联调记录，按 sensitive 档审），通过后跑全量测试，最后接续 manual-test 的「继续走查/反馈/签 G4」。
