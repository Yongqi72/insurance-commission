---
task_id: ic-b-007
round: 1
mode: full
risk: sensitive
review_profile: b-reviews/ic-b-007/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 49a5ded07133bd2b8057af5334dd8fd7fc3db0e1
reviewed_base: 4d380f395b46396d9b885c34f7b6e86f0468257e
reviewed_head: 52f871210fc3cea65ec86fba3c1f90b613c72ed9
diff_sha256: d2292f03f1f4092770557b82f9e2f7839dfaeec0a47788cd6aa0616d9e4dd7dc
changed_files:
  - sales-fill-api/SalesFillApi.sln
  - sales-fill-api/SalesFillApi.vbproj
  - sales-fill-api/SalesFill.ashx
  - sales-fill-api/SalesFill.ashx.vb
  - sales-fill-api/Web.config
  - sales-fill-api/My Project/AssemblyInfo.vb
  - sales-fill-api/.gitignore
  - sales-fill-api/README.md
  - backend/.env.example
  - backend/src/commission-batch/policy-record-query.service.ts
  - backend/test/commission-batch-policy-records.e2e-spec.ts
started_at: 2026-08-29T09:33:00Z
completed_at: 2026-08-29T09:41:00Z
elapsed_minutes: 8
escalate_to_full: false
conclusion: pass
---

## 本轮范围（retroactive full review）

任务已在 develop 流程外完成开发+自行合并（朱敏独立开发），本轮为事后补的独立审查，
由全新隔离 subagent 自读任务包+diff+VB.NET 源码+联调记录+实跑测试，不接受开发者自评。

### 审查方法

- 自读 `b-queue/ic-b-007.md` 全文 frontmatter（AC/do-not/known-risks/escalate-if）
- 通读 `sales-fill-api/SalesFill.ashx.vb`（210 行全读）、`Web.config`、`.vbproj`、`.gitignore`、`README.md`
- 用 `git show af4dc6e -- backend/src/commission-batch/policy-record-query.service.ts` 隔离出本任务对该文件的唯一真实改动，排除同文件其他任务（ic-b-005）的无关 diff
- 实跑 `cd backend && npx jest --config ./test/jest-e2e.json commission-batch-policy-records.e2e-spec.ts`（19/19 通过，含新增密钥请求头用例）
- 用 `git log --all -p -- sales-fill-api/` 扫描全部历史 diff，核对真实密钥/连接串/DLL 二进制是否入库
- 核对完整提交时间线（含任务包 `merged` 标记之后追加的 service 模式改动 `ba5f57f`~`b45ab94`）
- 协调者已在生产地址 `http://58.210.163.18:8085/salesfill/SalesFill.ashx` 用真实 curl 请求复算 golden 场景（真实单号 `SHGYLSE260200924` 命中"周晶"、`NOT-EXIST-001` 正确不出现在响应中），响应耗时 1.68s（5s 阈值内）

## 逐条 AC 核对

- **AC1（POST+JSON 契约，命中返回姓名/未命中不带 key）**：`ParseWorkOrderNos` 校验请求体结构，`QuerySalesNames` 过滤空值/空白值不入映射——代码核对 + 生产环境实测双重验证通过
- **AC2（Token 校验+不暴露内部细节）**：`VerifyToken` 对空 token/`change-me` 前缀双重防呆，避免"配置密钥为空且请求头也为空"的典型绕过点；异常兜底返回通用 JSON，但发现 `Web.config` 配置项语义理解反了（见 F001）
- **AC3（服务自身异常不影响主流程）**：`ProcessRequest` 全程 `Try/Catch`，解析失败/SQL 异常均返回合法 JSON；`policy-record-query.service.ts` 侧 `callFillApi` 对超时/异常/非对象响应均已有防御，不受影响
- **AC4（Token 请求头透传）**：`git show af4dc6e` 隔离 diff 确认改动范围精确（仅新增 `apiToken` 参数透传+条件性请求头），e2e 新增用例覆盖"配置携带/未配置不携带"两种行为，实跑通过

## do-not 边界核查

- 不改后端既有回填主流程：✅ 隔离 diff 确认未触碰超时/异常处理/统计口径
- 不提交真实数据库连接串/密钥/DLL 二进制：✅ 全历史扫描 `sales-fill-api/` 下所有提交，`Web.config` 连接串/密钥自始至终为占位值，未发现 DLL/lic 提交
- 不用字符串拼接 SQL：✅ `BuildSalesSql` 全程 `?` 占位 + 参数数组绑定

## Findings

```yaml
findings:
  - id: ic-b-007-F001
    dimension: sensitive-boundaries
    severity: 一般
    type: defense-in-depth-gap
    reachability: confirmed-occurred-in-production-once
    action: fix-code
    status: closed
  - id: ic-b-007-F002
    dimension: scope-and-secrets
    severity: 一般
    type: undocumented-scope-drift
    reachability: confirmed
    action: backlog
  - id: ic-b-007-F003
    dimension: test-evidence
    severity: 建议
    type: evidence-gap
    reachability: confirmed
    action: revise-doc
    status: closed
  - id: ic-b-007-F004
    dimension: sensitive-boundaries
    severity: 建议
    type: transport-security
    reachability: "confirmed(production URL)"
    action: backlog
```

- **ic-b-007-F001**：`Web.config` 的 `<customErrors mode="Off" />` 注释写"关闭默认错误页避免返回HTML"，语义理解是反的——`Off` 对逃出应用自身 `Catch` 的异常（落到 ASP.NET/IIS 管道层）会向**远程用户**展示详细错误页，`RemoteOnly` 才是"远程通用页、本机可看详情"。`_meta/sessions/manual-test-progress.md`（`45e8bfd`）记录的那次生产环境 500（返回 IIS 原生 HTML 页而非应用 JSON）与此吻合。**已修复**：本轮改为 `mode="RemoteOnly"`（协调者直接改的仓库文件，需朱敏重新发布这版 Web.config 才对线上生效）。
- **ic-b-007-F002**：任务包 `files:`/`known-risks` 未覆盖后来追加的 service 模式代码（`Web.config` 新增 `DbAccessMode`/`SqlDbServiceUrl`/`SqlDbServiceUser`/`SqlDbServicePassword`/`SqlDbServiceSerial` 五个 key、新依赖 `Fcl.DataWork.dll`）。已按同等标准审查该部分代码（复用同一个 `BuildSalesSql`、同一套 Try/Finally 释放、同一个外层 Catch），未发现结构性问题，仅记文档口径滞后，记入 backlog，不阻断。
- **ic-b-007-F003**：协调者本轮生产环境复测成功结果已写回 `backlog.md`/`_meta/sessions/manual-test-progress.md`（本次提交一并完成），verified-closed。
- **ic-b-007-F004**：生产地址为明文 HTTP，token+销售姓名（个人信息）明文传输，理论有中间人风险；AC 未要求 TLS，不作为验收缺陷，记入 backlog 供后续评估（如确认该 IP 是否真公网可达、是否需要加固）。

## 总体结论

0 阻断级 finding，`conclusion: pass`。
