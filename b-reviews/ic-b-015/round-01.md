---
task_id: ic-b-015
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-015/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 774fabcf03de69b8c86819086a1cbd65df4e7ee0
reviewed_base: a3062a48acc192b147feb7a9e56a503b85913dcb
reviewed_head: bd5dc17cd5ccdb291835a17439eb11a7dd5a16b4
diff_sha256: c6cbd6a83e68002d95cf107a4ab9905488ffc83a5ceec0bcd9bc92c2c265707b
changed_files:
  - backend/src/common/excel/policy-record-columns.ts
  - backend/src/common/excel/excel-parser.ts
  - backend/src/common/excel/excel-parser.spec.ts
  - backend/test/commission-batch-import.e2e-spec.ts
started_at: 2026-08-30T09:47:02Z
completed_at: 2026-08-30T09:50:26Z
elapsed_minutes: 4
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "尝试反证 insuredAmount 是否也被标记 optional：policy-record-columns.ts 逐列核对，仅 premiumAmount 行有 optional: true，其余 7 列均无该字段 → 反证失败，isolation 成立"
  - "尝试反证 premiumAmount 非空非数字是否被 optional 分支吞掉：excel-parser.ts 第 98-107 行 isEmptyValue 分支只在值为空时提前 return，非空值继续走第 109 行 numeric 分支 → 反证失败，数字校验路径未被绕过，新增测试 'optional 不豁免数字校验' 实测通过"
  - "尝试反证 null 是否在落库前被兜底成 0：import.service.ts 第 146-160 行 manager.create(PolicyRecord, {...}) 透传 row.premiumAmount，diff 未触碰该文件 → 反证失败，e2e 测试实测 records[0].premiumAmount 为 null"
affected_regressions: []
changed_surface_allowed:
  - backend/src/common/excel/policy-record-columns.ts
  - backend/src/common/excel/excel-parser.ts
  - backend/src/common/excel/excel-parser.spec.ts
  - backend/test/commission-batch-import.e2e-spec.ts
```

diff 与固定 `reviewed_base`/`reviewed_head` 生成的内容 sha256 校验一致（`c6cbd6a83e68002d95cf107a4ab9905488ffc83a5ceec0bcd9bc92c2c265707b`），改动文件集合与任务包 `files` 及 profile `changed_files` 完全一致，`git status --short` 未见任何越界改动（仅本任务无关的 `_meta/sessions/*` 与本审查目录自身为未跟踪文件）。

自跑证据：
- `npm run build`：通过
- `npm run test`（全量单测）：13 suites / 60 tests 全部通过（含本任务新增 4 条 excel-parser.spec.ts 用例）
- `npm run test:e2e`（全量 e2e）：6 suites / 117 tests 全部通过（含本任务新增 1 条 commission-batch-import.e2e-spec.ts 用例）
- `npm run lint`：无输出，无违规

## 逐维度结论

- **contract**：`policy-record-columns.ts` 仅 `premiumAmount` 列定义新增 `optional: true`；`excel-parser.ts` 第 96-107 行遇 `isEmptyValue(raw)` 为真时，`column.optional` 为真则 `values[column.key] = null` 并 `return`（forEach 回调内 return = 跳到下一列，不影响同行其余列继续处理，与 oracle 描述的"继续处理下一列"语义一致），非 optional 保持原 "记 missingField 并 return" 不变。数值校验（第 109-116 行）在 isEmptyValue 分支之后，premiumAmount 非空但非数字仍会进入 `invalidNumericField` 分支判失败。`PolicyRecordParsedRow.premiumAmount` 类型收紧为 `number | null`，落库调用点 `import.service.ts` 透传不变（该文件确未被本 diff 触碰）。与 PRD `iterations/v1/prd.md` §AC-03（commit `62e758d` 已修订文字："`保费`为空时视为该行保费缺失，允许正常导入（落库为 null）"）逐字对照一致。无发现。
- **scope-and-secrets**：diff 精确限定在任务包 `files` 声明的 4 个文件，无越界改动；`do-not` 四条逐条核实——① 其余 7 字段必填口径：columns.ts 中 7 列定义字面未改；② 保险金额必填+数字双重校验：`insuredAmount` 无 `optional` 标记，数字分支未改；③ 文件级失败判定（unreadable/sheet_not_found）：excel-parser.ts 第 57-80 行完全未改动；④ import.service.ts 落库逻辑：确认未出现在 diff 中，且其对 `premiumAmount` 的透传写法本就兼容 `number | null`。diff 中无明文密钥/token/密码痕迹。无发现。
- **test-evidence**：新增测试对 premium 本身的三种状态（空/有效数字/非数字）与"optional 不泄漏到 workOrderNo 列"均有可失败的断言，e2e 新增用例验证落库真实为 `null`（非字符串"null"或 0）。但发现一处覆盖缺口，见 Findings（`ic-b-015-F001`，advisory）。
- **comment-hygiene**：本次新增注释仅 `PolicyRecordColumnDef.optional` 字段上一行 JSDoc，无任务号/迭代号考古内容，"当前仅 premiumAmount"已写成立前提（非绝对化"禁止"声明）。无发现。
- **standards**：任务包 `relevant-standards: []`，无命中规则 id 需要核对。无发现。
- **enforcement**：本次改动不涉及规则/检查器/enforcement 基础设施。无发现。
- **design-fidelity**：`layers: [backend]`，无前端改动，无 design.md/prototype.html 交互面需要核对。无发现。
- **input-provenance**：本次改动的两个入口（Excel 逐列解析、e2e 走的是 multipart 文件上传接口）均无可提交字段的请求 DTO 需要穷举；`import.controller.ts` 该路由无 body DTO。无发现。
- **query-performance**：改动为内存中 `forEach` 逐列赋值，无数据库查询/循环查询新增。无发现。
- **concurrency**：`import.service.ts`（含事务/写入逻辑）未被本 diff 触碰，本次改动不涉及写入/唯一性面。无发现。
- **logging-privacy**：diff 未新增任何日志语句，不涉及凭据/PII 写日志。无发现。
- **maintainability**：`optional` 字段的加法式设计与既有 `numeric` 字段模式一致，未引入重复实现或新机制；改动量精简（+8/-3 行生产代码）。无发现。
- **sensitive-boundaries**：`premiumAmount` 未参与提成计算（提成计算面 grep 未见 `insuredAmount`/`commissionAmount` 与 `premiumAmount` 同现于同一计算逻辑，提成基于 `insuredAmount`，该字段未受影响）；`premiumAmount` 唯一下游消费点 `commission-report.service.ts:131` 早已有 `?? 0` 兜底（本 diff 未改该文件，属既有防御，非本次新增风险）。无发现。

## Findings

```yaml
findings:
  - id: ic-b-015-F001
    dimension: test-evidence
    severity: advisory
    type: future-risk
    reachability: unreachable
    evidence: >-
      excel-parser.spec.ts 与 commission-batch-import.e2e-spec.ts 中，"某字段为空仍判失败"
      的用例只覆盖了 customerName（两处既有用例，未改动）与本次新增的 workOrderNo
      （excel-parser.spec.ts:147，纯文本列）；insuredAmount——premiumAmount 唯一的数值型
      同类字段——在本次改动前后均没有任何"为空仍判失败"的专项用例（唯一相关的既有用例
      excel-parser.spec.ts:76"保险金额/保费非数字的行进入 failRows"测的是非空非数字场景，
      与"为空"分支互斥，不经过本次改动的 isEmptyValue optional 分支）。任务包自身
      known-risks 把"optional 误加到其他字段"列为最坏情况，并将"excel-parser.spec.ts
      新增用例逐字段核对哪些仍然必填"列为发现手段，但交付的新增用例未覆盖 insuredAmount
      这一风险最高（同为数值列、代码路径最相邻）的字段。
    impact: >-
      当前代码经人工读码核实 insuredAmount 未被标记 optional（policy-record-columns.ts
      第 28 行无 optional 字段），因此当前无可观察的错误行为。但若未来有改动误将
      optional: true 加到 insuredAmount 列定义上，现有全部测试（单测+e2e）均不会翻红，
      因为没有任何用例断言"insuredAmount 为空的行仍应进 failRows"。
    action: backlog
    status: advisory
```
