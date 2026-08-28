---
task_id: ic-b-001
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-001/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: b885bd9f8516cde0a4c78211c806586023055b4f
reviewed_base: f0951b633ebb7a8d81e0f0a4d57818f0407eb883
reviewed_head: 0eb414d53219c4ca2b10591235007043323076ce
diff_sha256: 90e6198aa7802a77701e09b9a7b4b8a4ac6123965e13961d6893180334597de5
changed_files:
  - backend/src/common/oss/oss-key.util.ts
  - backend/src/commission-batch/import.service.ts
  - backend/src/commission-report/commission-report.service.ts
started_at: 2026-08-28T06:14:39Z
completed_at: 2026-08-28T06:20:00Z
elapsed_minutes: 6
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "buildDatedOssKey('upload','a.xlsx', new Date(2026,0,1,10,0,0)) → bill/upload/2026/202601/20260101/1767290400000-a.xlsx（1 月单位数月份，验证零补位正确，非 2026/20261/2026101）"
  - "buildDatedOssKey('upload','a.xlsx', new Date(2026,0,15,10,0,0)) → bill/upload/2026/202601/20260115/1768500000000-a.xlsx（单位数月份+两位数日期）"
  - "buildDatedOssKey('export','a.xlsx', new Date(2026,10,5,10,0,0)) → bill/export/2026/202611/20261105/1793901600000-a.xlsx（两位数月份+单位数日期，验证日零补位）"
  - "buildDatedOssKey('upload','7月账单.xlsx', new Date(2026,7,28,10,0,0)) → bill/upload/2026/202608/20260828/1787936400000-7月账单.xlsx（与任务包给出的用户原始需求示例逐字符匹配）"
  - "buildDatedOssKey('export','a.xlsx', new Date(2026,11,31,10,0,0)) → bill/export/2026/202612/20261231/1798740000000-a.xlsx（12 月 31 日边界）"
affected_regressions:
  - "cd backend && npm run build（exit=0，nest build 无报错）"
  - "cd backend && npm run lint（exit=0，eslint --fix 无告警）"
changed_surface_allowed:
  - backend/src/common/oss/oss-key.util.ts
  - backend/src/commission-batch/import.service.ts
  - backend/src/commission-report/commission-report.service.ts
```

- `full`：按 `profile-round-01.json` 的 `selected_dimensions` 执行 `develop-review.md` 对应 13 个维度（contract / scope-and-secrets / test-evidence / comment-hygiene / standards / enforcement / design-fidelity / input-provenance / query-performance / concurrency / logging-privacy / maintainability / sensitive-boundaries；均为 fail-safe 全选，无 omitted）。`git diff f0951b63 0eb414d5 -- <3 文件>` 单独取证，sha256 复核与派发一致（90e6198a...97de5）。独立执行 `npm run build`、`npm run lint`；独立写临时 node 脚本（`node_modules` 外、验证后已删除，`ls /tmp/claude-.../scratchpad` 核对无残留）复刻 `buildDatedOssKey` 逻辑跑 5 组边界日期，未采信实现者自评。

## 逐维度结论

- **contract**：3 条 AC 均已实现。AC1/AC2：`buildDatedOssKey` 返回格式 `bill/{category}/{yyyy}/{yyyyMM}/{yyyyMMdd}/{Date.now()}-{fileName}`（`oss-key.util.ts:54-63`），`import.service.ts:81` 调 `buildDatedOssKey('upload', fileName)`，`commission-report.service.ts:162` 调 `buildDatedOssKey('export', fileName)`；独立构造 2026-08-28 场景验证与任务包给出的用户原始需求示例（`bill/upload/2026/202608/20260828`）逐字符一致。AC3：两个调用方均已移除内联 `Date.now()`/字符串拼接，`git grep -n "Date.now()" backend/src/commission-batch/import.service.ts backend/src/commission-report/commission-report.service.ts` 在 reviewed_head 下均为空（未再出现于 key 拼接处）；`batchId` 已从两处 key 字符串中移除且未与新格式并存。无发现。
- **scope-and-secrets**：`git diff --stat` 只覆盖任务包声明的 3 个文件（新增 1、编辑 2），未超出 `files` 清单；`oss-client.ts`/`package.json`/`package-lock.json` 三份 do-not 关注文件与 reviewed_base 逐字节相同（`git diff` 为空），未新增第三方日期库依赖；diff 全文未见明文密钥/token/密码。无发现。
- **test-evidence**：见 Findings ic-b-001-F001（无自动化测试覆盖 `buildDatedOssKey`，含任务包自己标注为「最容易出错」的零补位分支）；本机独立构造反例证明当前实现行为正确，但该证据未沉淀为仓库内可失败测试。
- **comment-hygiene**：`oss-key.util.ts` 新增的函数级注释（3 行）未点名任务号/迭代号，且未包含需要前提说明的"禁止/不得"式断言。无发现。
- **standards**：BE-EXT-02（OSS 访问统一经 OssClient）——两处调用方 diff 中除新增 `import { buildDatedOssKey } from '../common/oss/oss-key.util'` 外未新增任何 import，仍只经 `this.ossClient.upload(...)` 写入，未直接 import `ali-oss`，符合。BE-COMP-04——独立 grep `standards-backend.md` 全文，仅存在 BE-EXT-02，无 BE-COMP-04 该 id（任务包自身也注明"若存在同名条目...无同名条目则按项目惯例"），故此项非真命中的强制规则，退化为项目惯例检查，已在 contract/AC3 中确认共享函数收敛到位，不重复计分。无发现。
- **enforcement**：本任务不产出规则/检查器/新测试基建，`relevant-standards` 命中的 BE-EXT-02 是既有规则、非本任务新增声明，无新增的语法/调用面需要核验其 fail-closed 性。无发现。
- **design-fidelity**：changed_files 全部为 `backend/src/**/*.ts`，与 `design.md`、`iterations/v1/prototype.html` 覆盖的前端/UI 面无交集（本任务未新增/修改任何 `.vue`/`.css`/前端文件）。无发现。
- **input-provenance**：`git diff --name-only` 确认本任务未新增/修改任何 `*.dto.ts` 文件，`buildDatedOssKey` 的三个参数（`category`/`fileName`/`now`）均由 service 内部代码传入（`'upload'`/`'export'` 字面量、既有 `fileName` 变量、`now` 用默认值未传），无一来自前端可提交的请求体字段。DTO 文件数 = 0，穷举表行数 = 0，覆盖率闭合（N=0，本表行数=0）。无发现。
- **query-performance**：本次改动只涉及字符串拼接，未修改任何数据库查询/循环读取路径（`ensureBatchExists`/`loadBatchRecords` 等既有查询语句未被触碰）。无发现。
- **concurrency**：见 Findings ic-b-001-F002（key 中移除 `batchId` 后，跨批次同名文件在同一毫秒并发导出时的覆盖碰撞面被 AC3 要求的改动客观放宽，为 ic-v1-006-F003 已挂账风险的同类扩大，非本任务引入的全新机制）。
- **logging-privacy**：`import.service.ts:90` 既有日志行 `` `批次 ${batchId} 导入文件解析失败：reason=..., fileName=..., ossKey=${ossKey}` `` 未被本次改动触碰（context 行，非 diff 行），日志内容语义不变，只是 `ossKey` 的取值格式变化，未引入新的凭据/PII 暴露面。无发现。
- **maintainability**：符合 AC3 意图——两处原本重复的内联拼接收敛为 `common/oss/oss-key.util.ts` 一个 15 行纯函数，无新增复杂度，未见可复用而未复用的既有工具。无发现。
- **sensitive-boundaries**：本任务不触碰鉴权/数据隔离/不可逆删除/金额计算逻辑，只改归档路径字符串生成；虽因元数据不完整被 fail-safe 选中，但未发现权限/计费/不可撤销外部副作用相关的可达反例。无发现。

## Findings

```yaml
findings:
  - id: ic-b-001-F001
    dimension: test-evidence
    severity: advisory
    type: evidence-gap
    reachability: current
    evidence: "backend/src/common/oss/oss-key.util.ts 新增的 buildDatedOssKey() 是本任务唯一的新生产代码路径，其零补位逻辑（getMonth()+1/getDate() 的 padStart(2,'0')）被任务包 known-risks 与派发指令本身明确标注为「最容易出错的地方」，但 reviewed_head 下无 backend/src/common/oss/oss-key.util.spec.ts 或任何新增/修改测试引用该函数（git diff --stat 对 *.spec.ts/*.test.ts 为空）；对照本仓 common/ 目录既有惯例（excel-builder.ts→excel-builder.spec.ts、excel-parser.ts→excel-parser.spec.ts、oss-client.ts→oss-client.spec.ts、page-query.dto.ts→page-query.dto.spec.ts 均一一配对单测），oss-key.util.ts 是 common/ 下唯一没有配套单测的带逻辑文件。审查员独立写临时 node 脚本复刻该函数跑 5 组边界日期（1 月 1 日/1 月 15 日/11 月 5 日/8 月 28 日/12 月 31 日）证明当前实现行为正确，但该证据未沉淀进仓库，未来对 padStart 参数、字符串拼接顺序的回归无法被自动化测试拦截"
    impact: "不影响当前行为正确性（已独立验证零补位逻辑正确）；但该分支目前无法失败的测试兜底，若后续任务或重构改动了 buildDatedOssKey 内部实现，零补位回归只能在生产环境用真实单位数月/日期触发才会被发现"
    action: backlog
    status: open
  - id: ic-b-001-F002
    dimension: concurrency
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: "commission-report.service.ts:162 改为 buildDatedOssKey('export', fileName)，fileName = `${batch.name}-提成报表.xlsx`（commission-report.service.ts:158，batch.name 来自 commission_batch.name 列，该列只有 varchar(128) 无 unique 约束，见 backend/src/commission-batch/commission-batch.entity.ts:31——两个不同 batchId 的批次允许同名，例如任务包 AC2 示例本身给出的通用名「2026年8月批次」）。旧格式 `exports/${batchId}/${Date.now()}-${fileName}` 中 batchId 是碰撞域的一部分，不同批次即使同名、同毫秒导出也不会撞 key；AC3 要求的新格式按 oracle 移除了 batchId，碰撞域收窄为「同日期+同 fileName+同毫秒 Date.now()」，即两个不同批次只要恰好同名、又恰好在同一毫秒内触发导出，OssClient.upload 走 ali-oss put() 覆盖写语义会导致后一次导出覆盖前一次已归档的对象内容，而两条 export_record 各自落库、都指向该被覆盖的 ossKey。该风险与已挂账的 ic-v1-006-F003（同批次重复导出同毫秒碰撞）同根同类，本次改动是 AC3 明确要求、do-not 明确禁止改动 OssClient 或引入加锁机制的必然结果，非实现偏离 oracle，故不判阻断"
    impact: "narrow race：需要两个不同批次恰好同名、且两次导出请求恰好落在同一毫秒，真实网络往返场景下概率很低；一旦发生，较早批次的 export_record 会指向被覆盖后、内容属于另一批次的文件（内容层面报表错配，非金额计算错误）。当前风险面相对 ic-v1-006-F003 有所扩大（不再要求同批次），建议与 F003 合并挂账、后续统一评估是否需要在 fileName 或 key 中补回可区分批次的标识"
    action: backlog
    status: open
```
