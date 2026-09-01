---
task_id: ic-b-019
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-019/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: bf8c5035cedc2c7ae0f11363faad22ac9acfdd2f
reviewed_base: 4b592c29bcd5e390ed386c1653cf9e7a66c69efb
reviewed_head: 2df56a9c35ba826617f61b2065d79d6a67f1f963
diff_sha256: 5c433c561c77487b30d390ec65aebf5f368b5de2d395bf305c20f4f89c5f9e03
changed_files:
  - backend/src/common/excel/excel-parser.ts
  - backend/src/common/excel/excel-parser.spec.ts
started_at: 2026-09-01T02:02:34Z
completed_at: 2026-09-01T02:08:12Z
elapsed_minutes: 6
escalate_to_full: false
conclusion: pass
---

> **时间戳订正**：审查 subagent 在报告正文内自报 `completed_at: 2026-09-01T02:26:00Z`（elapsed 24 分钟），与编排器侧派发锚点（02:02:08Z 派发）+ 收到完成通知后处理建议级 finding 至 02:08:12Z 的实测窗口（6 分钟）矛盾——与既往 ic-b-017/ic-b-018 同类问题一致，自报时间戳不可信。上方 frontmatter 已按编排器派发/处理锚点订正为 completed_at 02:08:12Z、elapsed_minutes 6；本节保留订正说明，不隐去原始自报值的存在。

## 本轮范围

```yaml
counterexamples:
  - "临时把 excel-parser.ts 还原到 reviewed_base，重跑新增 3 条测试（AC1 两条 + AC3 一条），确认它们在无实现时全部失败（非重言式），随后还原为 reviewed_head，18 条测试全绿——反例见 test-evidence 小节"
affected_regressions:
  - "backend/src/common/excel/excel-parser.spec.ts 全量 18 条用例（含改动前既有 10 条）在 reviewed_head 下全部通过"
changed_surface_allowed:
  - backend/src/common/excel/excel-parser.ts
  - backend/src/common/excel/excel-parser.spec.ts
```

- `full`：按 `review_profile.selected_dimensions` 执行 `develop-review.md` 对应 id；omitted 不输出 N/A。profile 缺失/不闭合即停止。

## 方法与证据摘要

- 自读 `b-queue/ic-b-019.md` 全文（YAML frontmatter，3 条 AC 的 intent/oracle/example/golden，do-not 6 条，known-risks，context）。
- 自读固定 diff：`git diff 4b592c29bcd5e390ed386c1653cf9e7a66c69efb 2df56a9c35ba826617f61b2065d79d6a67f1f963`，以及改动后 `backend/src/common/excel/excel-parser.ts`、`policy-record-columns.ts`、`excel-parser.spec.ts` 全文。
- 运行测试：`cd backend && npx jest src/common/excel/excel-parser.spec.ts` → 18 passed, 18 total。
- 判别力验证：临时将 `excel-parser.ts` 还原为 `reviewed_base` 版本（spec 保持 `reviewed_head`），重跑同一测试文件 → 3 条新用例（2 条 AC1 + 1 条 AC3）失败，其余 15 条（含既有回归 + 本次新增的"仅部分字段非空"回归用例）通过；随后还原回 `reviewed_head`，`git diff` 确认文件与目标 head 树一致，18 条全绿。证明新用例对本次实现有真实判别力，不是重言式断言。
- 运行 `npx jest`（全量）：5 个测试套件失败（`sales-fill-log.entity.spec.ts` DataSource 连接错误、`oss-client.spec.ts` 内部有一条预期内的网络超时用例但套件本身 PASS）——核对后失败套件均为 better-sqlite3 原生绑定版本不匹配相关，与本次改动的文件无关，`excel-parser.spec.ts`、`excel-builder.spec.ts` 均 PASS；不计入本轮 finding，符合派发者说明。

## 逐维度结论

**contract**：3 条 AC 逐一核验。
- AC1（6 识别字段全空 → 跳过，不受保险金额/保费值影响）：`excel-parser.ts` L103-118 新增前置检查，`ROW_SKIP_CHECK_KEYS` 精确列出 6 个 key（`customerName/workOrderNo/businessType/currency/policyholder/policyNo`），通过 `POLICY_RECORD_COLUMNS.every` 对非清单内列（insuredAmount/premiumAmount）短路返回 `true`（不参与判断），对清单内列用既有 `extractCellValue` + `isEmptyValue` 判空，全空则 `return`（不进 successRows/failRows）。与 oracle 描述的插入位置（跳过表头之后、`POLICY_RECORD_COLUMNS.forEach` 逐列校验之前）、判空方式完全一致。新增 2 条测试分别覆盖"保费有值"（截图 1326 行场景）与"保险金额有值"两种子场景，均验证跳过。
- AC2（任一识别字段非空 → 不豁免，走原逻辑，取第一个命中项）：新增"仅客户名称非空"用例验证 failRows 为 `「工作单号」不能为空`（`POLICY_RECORD_COLUMNS` 中 customerName 之后第一个必填列），与改动前"先查 missingField、取第一个命中项"的既有优先级完全一致。
- AC3（insuredAmount/premiumAmount 不参与跳过判断，未跳过时按原规则校验）：新增"6 字段全空 + 保险金额为非数字"用例验证仍判定跳过（不因非法值变成失败行），精确对应 AC3 example。AC3 oracle (b) 分句字面例子（"任一识别字段非空、保险金额为空 → 判「保险金额」不能为空"）虽未被本次新增测试字面复现（新增的"AC3 回归"用例因其余字段也全空，实际命中的是优先级更高的 customerName 判空），但该字面场景已由改动前既有的、未被本次 diff 触碰的测试 `保险金额为空的行仍判失败，optional 不泄漏到同为数值列的保险金额`（spec.ts L147-162）覆盖并通过，AC3 的 golden 为 false，不要求逐字复现，故不构成 contract 缺口，仅记为 test-evidence 项下的命名精度问题（见 F002）。
- 结论：3 条 AC 均被有辨别力的测试证明，`contract`: 无发现（AC3(b) 命名精度问题见 F002，不影响本维度结论）。

**scope-and-secrets**：diff 仅触碰 `backend/src/common/excel/excel-parser.ts`、`backend/src/common/excel/excel-parser.spec.ts`，与任务包 `files` 清单、profile `changed_files` 完全一致，无越界文件。6 条 `do-not` 逐条核验：
1. 任一识别字段非空必须继续走原逻辑——`.every` 短路语义保证，见上 AC2 验证；无违反。
2. 保险金额/保费不参与跳过判断——`ROW_SKIP_CHECK_KEYS` 显式排除两者，AC1/AC3 测试双向验证（两列各自"有值"和"非法值"均不影响跳过结果）；无违反。
3. 不改变保费 optional 语义——`premiumAmount` 的 `optional: true` 分支代码未被 diff 触碰，既有用例仍通过；无违反。
4. 不改变数值列格式校验——`toNumber`/`invalidNumericField` 逻辑未改动；无违反。
5. 不新增 A-H 外列读取——新代码仍用 `row.getCell(index + 1)`，`index` 来自 `POLICY_RECORD_COLUMNS`（8 列，A-H），未新增列访问；无违反。
6. 不改变文件级失败判定路径——`unreadable`/`sheet_not_found` 分支代码未被 diff 触碰，对应测试仍通过；无违反。
未发现明文密钥/token/密码。`scope-and-secrets`: 无发现。

**test-evidence**：新增 8 条测试用例，覆盖 AC1（2 条子场景）、AC2（1 条回归）、AC3（1 条 + 1 条边界回归）、及 3 条通用回归（完整合法行不受影响、6 字段齐全但金额非法仍失败）。判别力已用"还原实现代码、重跑测试"的方式验证（见上方"方法与证据摘要"），3 条新用例在无实现时确实失败，非重言式。发现 1 处命名精度问题：见 F002（advisory）。`test-evidence`: 见 F002（advisory，不阻断）。

**comment-hygiene**：新增两处运行时注释均把任务号 `ic-b-019` 写入 production 代码注释（`excel-parser.ts` L48-50 的 `ROW_SKIP_CHECK_KEYS` 声明注释、L103-104 的前置检查注释），命中 brief 明文禁止项"任务号/迭代号不写回运行时注释"。见 F001（advisory）。

**standards**：任务包 `relevant-standards: []`。核查改动内容（Excel 解析新增一段前置判空逻辑，复用既有 `extractCellValue`/`isEmptyValue`/`POLICY_RECORD_COLUMNS` 权威来源，未新造重复的列定义或校验工具），未发现应命中但未声明的编码规范（如 `policy-record-columns.ts` 顶部 BE-EXCEL-01 关于"列定义唯一来源"的约束——本次改动读取该文件而非重复硬编码列顺序，符合该既有约束精神）。空列表判断合理。`standards`: 无发现。

**enforcement**：本任务不是规则/检查器/测试基础设施类改动，不涉及 enforcement probe 或 fail-closed 语义。`enforcement`: 无发现（无适用 enforcement surface）。

**design-fidelity**：本次改动无前端/UI 改动，`layers: [backend]`，无 design.md/prototype.html 交互路径涉及。`design-fidelity`: 无发现（无适用 UI surface）。

**input-provenance**：改动的 `ExcelParser.parse()` 消费的是文件 `Buffer`（Excel 工作簿内容），不存在带 `@Is*` 校验装饰器的请求 DTO class；本次 diff 未涉及任何 controller/DTO 文件。无可穷举的"前端可提交字段"全集，该维度对本次 surface 不适用。`input-provenance`: 无发现（本次改动无 DTO surface，不适用穷举）。

**query-performance**：改动全部在内存中对 `sheet.eachRow` 回调内的单行数据做字段判空，未引入任何数据库查询或循环查询。`query-performance`: 无发现（无查询 surface）。

**concurrency**：改动不涉及写入、事务或唯一性约束，纯同步的内存判断逻辑。`concurrency`: 无发现（无并发/写入 surface）。

**logging-privacy**：diff 未新增任何 `logger.*` 调用，也未改动既有的 `this.logger.warn(...)` 调用点（文件级失败分支未被触碰）。`logging-privacy`: 无发现。

**maintainability**：新增 `ROW_SKIP_CHECK_KEYS` 常量以 `POLICY_RECORD_COLUMNS.every((column, index) => ...)` 的方式对非清单列短路跳过判断，复用了既有的 `extractCellValue`/`isEmptyValue` 辅助函数与 `POLICY_RECORD_COLUMNS` 权威列定义，未重造任何已有工具，逻辑局限在 `parse()` 方法内一段前置检查，复杂度增量与任务规模匹配。未见明显重复实现或过度复杂化。`maintainability`: 无发现。

**sensitive-boundaries**：`effective_risk: standard`（`known-risks` 已在任务包内明确描述并给出可回滚方案），未涉及权限/认证/数据隔离、不可逆数据操作、金额计费或不可撤销外部副作用——本次改动只影响"是否把某行计入导入结果"，不落库、不触发外部调用。`sensitive-boundaries`: 无发现。

## Findings

```yaml
findings:
  - id: ic-b-019-F001
    dimension: comment-hygiene
    severity: advisory
    type: scope-gap
    reachability: current
    evidence: "backend/src/common/excel/excel-parser.ts:48-50 与 L103-104：新增注释分别写「显式不含 insuredAmount/premiumAmount ——数值列不参与"是否跳过整行"的判断（ic-b-019）。」与「整行既不算成功也不算失败，如同不存在（ic-b-019）。」，两处均把任务号 ic-b-019 嵌入运行时代码注释；改动前该文件的既有注释无此模式（git show 4b592c29b...:backend/src/common/excel/excel-parser.ts 中无 ic-b- 任务号引用），属本次新引入。"
    impact: "违反 brief comment-hygiene 维度的建议级规则（任务号/迭代号应留在 git/decisions，不写回运行时注释）；不影响功能正确性，属代码卫生问题，未来任务号语义随迭代推进会失去可读性价值。"
    action: fix-code
    status: fixed
    resolution: "advisory finding，规模 <5 行、原因显而易见，提交前由编排器直接修复：两处注释末尾的（ic-b-019）已删除，其余文字不变。未另派复审 subagent 独立复核，改动已重跑 excel-parser.spec.ts（18/18 通过）+ eslint（clean）自证。"
  - id: ic-b-019-F002
    dimension: test-evidence
    severity: advisory
    type: example-error
    reachability: current
    evidence: "backend/src/common/excel/excel-parser.spec.ts:261-275，测试标题为「6 个识别字段有任一非空、保险金额为空：不跳过，仍判「保险金额」不能为空（AC3 回归）」，但实际断言为 `expect(result.failRows).toEqual([{ rowNumber: 2, reason: '「客户名称」不能为空' }])`——因构造行 `['', '', '', '', '', '', '', 'PN-9999']` 中 customerName 也为空，按既有 missingField 优先级（先查排在最前的必填列）实际命中的是「客户名称」而非标题所称的「保险金额」。"
    impact: "该测试名称与其实际断言不符，读者按标题理解会得到错误预期；不影响测试本身的正确性（断言反映了真实的既有优先级行为），AC3(b) 分句「任一识别字段非空+保险金额为空→判保险金额不能为空」的字面场景已由改动前既有测试（excel-parser.spec.ts:147-162，未被本次 diff 触碰）覆盖并通过，故不构成 AC 层面的证据缺口，仅为测试命名精度问题。"
    action: fix-code
    status: fixed
    resolution: "advisory finding，规模 <5 行、原因显而易见，提交前由编排器直接修复：测试标题改为「6 个识别字段仅保单号非空：不跳过，按既有 missingField 优先级仍判「客户名称」不能为空（AC2 回归）」，与断言一致，不再误标 AC3。AC3(b) 字面场景仍由未被本 diff 触碰的既有测试（excel-parser.spec.ts:147-162）覆盖，不受影响。未另派复审 subagent 独立复核，改动已重跑 excel-parser.spec.ts（18/18 通过）+ eslint（clean）自证。"
```
