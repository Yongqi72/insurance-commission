---
task_id: ic-v1-006
round: 1
mode: full
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-006/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 45de3a1e1cc23b3fcae0c498ad7bc9033e8987c2
reviewed_base: 508cb389ae241559b21a745e9759ba6133891b73
reviewed_head: b75e0f14dca7acce7a1cab0535f04569477de39b
diff_sha256: a4a413cf941533f0914b084afaa1191bec56de74260e83d8f225f084421a8bbf
changed_files:
  - backend/src/app.module.ts
  - backend/src/commission-report/calc-commission.ts
  - backend/src/commission-report/commission-report.controller.ts
  - backend/src/commission-report/commission-report.module.ts
  - backend/src/commission-report/commission-report.service.ts
  - backend/src/common/constants/error-code.enum.ts
  - backend/src/common/excel/excel-builder.spec.ts
  - backend/src/common/excel/excel-builder.ts
  - backend/src/common/filters/all-exceptions.filter.ts
  - backend/test/commission-report.e2e-spec.ts
started_at: 2026-08-27T10:01:24Z
completed_at: 2026-08-27T10:09:20Z
elapsed_minutes: 8
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "calcCommission() 边界反例：区间 (0,50]=2、(50,100]=2.2，票数=50→100（落 (0,50]），票数=51→112.2（落 (50,100]）；末档 upperBound=null 覆盖任意大票数；票数落不进任何区间时抛错而非静默返回 0（均由 e2e 内嵌的技术 AC 用例验证，独立复算数值无误）"
  - "ruleComplete() 分区完整性反证：读取 backend/src/commission-tier/rule-complete.util.ts 源码确认三条件（首档 lowerBound=0、末档 upperBound=null、相邻档首尾相接）合取为真时构成 [0,+∞) 上的严格分区（左开右闭、无缝无重叠）；据此论证只要分组内票数 ≥1（buildSummaryItems 只在遇到匹配记录时才把 salesName 计入分组，不会出现 ticketCount=0 调用 calcCommission），calcCommission 内部 find() 必恰好命中一档，不存在'规则声称完整但仍漏算抛错'的缺口"
  - "单一权威反例：全文 grep lowerBound/upperBound/unitPrice，命中仅 calc-commission.ts 内部与 service.ts 里 loadTiers() 的排序 order 子句，controller/service 无第二份阶梯匹配/乘法逻辑"
  - "2002 路径反例：阶梯不完整时人工构造场景（只建 1 档不封顶），独立运行 e2e 断言 ossUploadMock 未被调用、exportRecordRepository.count() 前后不变、HTTP 422/code=2002——确认无部分上传/无孤儿导出记录"
  - "路由唯一性反例：grep 全部 @Controller 前缀，确认 api/commission-batches/:id/{commission-summary,commission-report,exports} 与既有 api/commission-batches[/:id[/status]]、api/commission-batches/:batchId/{imports*,policy-records*} 均无相同段数+相同字面量组合，不存在 Nest 路由静默遮蔽"
  - "BE-EXCEL-01 反例：确认 POLICY_RECORD_COLUMNS（ExcelParser 唯一消费源）未被本次改动触碰，DETAIL_COLUMNS 只是在其基础上 slice+插入构造的衍生数组；ExcelParser 全文档只 import POLICY_RECORD_COLUMNS，不感知 DETAIL_COLUMNS，故导入/导出共享定义的真实保证未被打破"
  - "并发反例：ossKey = exports/{batchId}/{Date.now()}-{fileName}，fileName 由批次名固定推导，同批次两次导出在同一毫秒内均调用 Date.now() 时会产生同一 ossKey；export-record.entity.ts 未对 ossKey 建唯一约束，OssClient.upload 走 put()（覆盖写语义），故该极窄时间窗口下可造成后一次上传覆盖前一次内容、但两条 export_record 各自持有该 key（见 F003，advisory）"
  - "并发反例：exportReport() 先 ossClient.upload() 后 exportRecordRepository.save()，若 save() 失败（如连接抖动），buffer 已上传的 OSS 对象无对应 export_record，成为孤儿对象；但 controller 只在 service Promise resolve 后才 res.send()，故失败路径下客户端不会看到'伪成功'，只造成存储层面的孤儿对象（见 F004，advisory）"
affected_regressions: []
changed_surface_allowed: [backend/commission-report/**, backend/common/excel/** (BE-EXCEL-01 声明的正当延伸), backend/common/constants/error-code.enum.ts + backend/common/filters/all-exceptions.filter.ts (SH-API-02 已登记 2002 的全局接线), backend/app.module.ts (追加注册)]
```

- `full`：按 `profile-round-01.json` 的 `selected_dimensions` 执行 `develop-review.md` 对应 12 个维度（contract / scope-and-secrets / test-evidence / comment-hygiene / standards / enforcement / input-provenance / query-performance / concurrency / logging-privacy / maintainability / sensitive-boundaries；`design-fidelity` 按 profile 声明 omitted，未执行）。
- 独立复核证据（不采信实现者自报的通过数字）：`git diff 508cb389ae241559b21a745e9759ba6133891b73 --cached` 落盘后 `sha256sum` 核对与派发的 `diff_sha256` 完全一致，方才继续；`npx tsc --noEmit`（零错误）；`npm run lint`（零告警，且 `--fix` 未改动任何文件，`git diff --stat` 为空）；`npm run test:e2e -- commission-report.e2e-spec`（17/17 通过）；`npm run test:e2e` 全量（6 个测试文件、95 个用例，与实现者自报数字一致）；`npx jest src`（11 个测试文件、39 个用例，与实现者自报数字一致）。

## Findings

```yaml
findings:
  - id: ic-v1-006-F001
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: "backend/src/commission-report/commission-report.service.ts:65 类级文档注释原文：「阶梯完整性判定复用 ic-v1-005 交付的 ruleComplete()，两者均不在本类重复实现」——运行时注释里点名任务号 ic-v1-005；与 ic-v1-001-F003（首次判定）、ic-v1-002-F002、ic-v1-003-F001、ic-v1-004-F003（三次重现）属同一违规模式的第五次重现。正向对照：本次实现在 excel-builder.ts 的 SalesSummaryRow 注释里把基线代码中原有的「本组内按销售人员小计（提成汇总，由 ic-v1-006 的 calcCommission() 计算后传入）」改写为去掉任务号的「由 calcCommission() 计算后传入」，说明实现者对该规则并非不知情，只是本处遗漏"
    impact: "不影响当前行为；同根问题连续五个任务包复现（ic-v1-001~ic-v1-004 已有 4 次同根 finding），逐任务零星记 advisory 已不能阻止模式持续，建议在下一次 develop 会话启动前对执行者重申约定而非继续逐任务记录"
    action: backlog
    status: open
  - id: ic-v1-006-F002
    dimension: test-evidence
    severity: advisory
    type: evidence-gap
    reachability: current
    evidence: "commission-report.service.ts:267-291 的 buildUniqueSheetName()（sheet 名非法字符替换 /[*?:\\/[\\]]/ → '_'、截断至 31 字符、截断后重名追加 ~N 后缀兜底）是本任务新增的生产代码路径，用于避免 exceljs addWorksheet() 在投保人名过长/含非法字符/截断后撞名时直接抛错导致整份报表生成失败；backend/test/commission-report.e2e-spec.ts 全部用例的 policyholder 均为短字符串（'常熟'/'太仓'/'XX保险'等），未出现 >31 字符、含 `*?:\\/[]`、或截断后重名的投保人，三条分支（sanitize/truncate/dedupe）均无测试覆盖，commission-report 目录下也没有针对 service 的单测文件"
    impact: "不影响提成金额计算正确性（该函数只影响 sheet 显示名，不影响明细行/汇总行数据本身）；但该分支目前无法失败的测试兜底，若正则或截断逻辑有回归，只能在生产环境用真实长/特殊字符投保人名触发时才会发现"
    action: backlog
    status: open
  - id: ic-v1-006-F003
    dimension: concurrency
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: "commission-report.service.ts:161 `ossKey = exports/${batchId}/${Date.now()}-${fileName}`，fileName 由批次名确定性推导（同批次恒定）；export-record.entity.ts 未对 ossKey 建唯一约束；OssClient.upload 走 ali-oss `client.put()`（覆盖写语义）。若同一批次在同一毫秒内发起两次 GET commission-report（例如同源两个并发请求恰好落在同一时间片），两次调用的 Date.now() 相同 → ossKey 相同 → 后一次 put() 覆盖前一次已上传的对象内容，但两条 export_record 各自落库、各自指向同一个（已被覆盖的）ossKey"
    impact: "narrow race：需要两个真正并发的 HTTP 请求恰好在同一毫秒内到达 upload 调用点，真实网络往返场景下概率极低；一旦发生，较早那条 export_record 的下载链接会指向较晚那次导出的文件内容（内容层面的报表错配，而非金额计算错误）"
    action: backlog
    status: open
  - id: ic-v1-006-F004
    dimension: concurrency
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: "commission-report.service.ts:161-169：先 `await this.ossClient.upload(buffer, ossKey)` 再 `await this.exportRecordRepository.save(...)`，两步之间无事务/补偿。若 save() 因数据库瞬时故障失败，buffer 已成功上传的 OSS 对象成为孤儿（无 export_record 指向它），但已验证 controller 只在 service 的 Promise resolve 后才 `res.send()`，失败路径下异常直接冒泡到 AllExceptionsFilter 走标准 5xx 错误信封，客户端不会收到'伪成功'响应"
    impact: "该顺序与任务包 oracle 原文（'先经 OssClient 上传...得 oss_key，插入一条 export_record...'）逐字一致，是任务包指定的顺序，非实现者自行选择；失败时只造成 OSS 存储层面的孤儿对象（无用户可见的错误后果、无金额/报表数字错误），known-risks 未将此类跨系统最终一致性列为需处理项"
    action: backlog
    status: open
```

## 各维度结论

- **contract**：5 条 AC 全部实现；两条 golden（AC-14/AC-15）逐字复算通过——AC-14 example（常熟/张三/40 票/阶梯 (0,50]=2、(50,100]=2.2 → 80 元）与 AC-15 example（常熟 40 票→80 元、太仓 20 票→40 元 + 新增一条导出记录）均在 e2e 中字面 1:1 断言且独立运行通过；AC-16（unmatched 分组仍出现、items=[]/subtotal=0，导出明细行销售列留空但行仍展示）、AC-17（导出历史倒序+现生成签名 URL、无记录返回空数组）、技术 AC（单一权威 calcCommission，见下）均有测试覆盖并通过。无发现。
- **scope-and-secrets**：改动文件集合与派发声明的 10 个文件完全一致（`git status --short` 核对）；未触碰 do-not 三项（未重新实现 ruleComplete、未做计算结果快照、未支持非投保人维度分 sheet 或 PDF/CSV）；未发现明文密码/密钥/token（e2e 里的 `e2e-Test-Only-Pwd` 与项目内其他 e2e-spec 一致，属测试专用凭据）。两处声明的偏离（excel-builder 改动、error-code/filter 改动）均独立验证为必要且未破坏其依附的标准保证，详见下方「偏离核查」。无发现。
- **test-evidence**：独立重跑全部测试，数字与实现者自报完全一致（e2e 6 套/95 例，单测 11 套/39 例，本任务专属 e2e 17/17）；golden AC 有字面断言；技术 AC（左开右闭边界、+∞ 末档、无匹配区间抛错）以直接函数调用形式独立验证。唯一缺口见 F002（sheet 名清洗/截断/去重分支无测试）。
- **comment-hygiene**：新增/改动注释中出现 1 处运行时注释点名任务号（F001，第五次重现同根问题）；未发现"禁止/不得 X"缺前提的写法。
- **standards**：BE-LAYER-01（Controller 只转发，业务在 Service，未见 Controller 直接操作 Repository）✓；BE-LAYER-02（独立 grep 全部 `@Controller` 前缀核对无路由遮蔽）✓；BE-DB-02（`loadBatchRecords`/`loadTiers` 各一次性查询，分组统计全部基于内存 Map，未见循环内查库）✓；BE-DB-03（本任务未新增/修改 Entity，不涉及表结构变更，N/A）；BE-EXT-02（service 只 import `OssClient`，未直接 import `ali-oss`）✓；BE-EXCEL-01（见下方「偏离核查」，共享定义的真实保证未被打破）✓；SH-API-01（commission-summary/exports 走 `SuccessInterceptor` 自动信封，commission-report 走原生 Response 但错误路径仍走全局 filter，e2e 已验证 1004/2002 走标准信封）✓；SH-API-02（2002 已在 standards-shared.md 登记为"本期新增"，本次改动是该登记的落地接线，非未声明改动）✓；SH-AUTH-01（三个路由均未标 `@Public()`，e2e 验证三者未登录均 401/1002）✓。无发现。
- **enforcement**：SH-API-02 的"共享错误码枚举"机制被正确扩展——`RULE_INCOMPLETE=2002` 加入枚举、`AllExceptionsFilter.mapStatusToCode` 新增 `UNPROCESSABLE_ENTITY→RULE_INCOMPLETE` 分支、`RuleIncompleteException` 抛 422，e2e 独立验证端到端确实产生 `{code:2002,...}`；独立 grep 全项目确认此前无任何代码路径使用 422/`UNPROCESSABLE_ENTITY`，新映射不与既有状态码映射冲突（无覆盖/遮蔽）。无发现。
- **input-provenance**：本任务 3 个接口（GET commission-summary/commission-report/exports）均无请求体、无查询参数，仅一个路径参数 `:id`（非 DTO class 字段，不适用 DTO 穷举表）；本次改动未新增任何 Request DTO 文件。覆盖率自证：DTO 文件数 = 0，可提交字段数 N = 0，本表行数 = 0（枚举对象为空集，视为完整覆盖）。无发现。
- **query-performance**：`loadBatchRecords`/`loadTiers` 各一次性加载，分组/统计在内存完成，无循环查库；`listExports` 对每条 `export_record` 各调用一次 `ossClient.getSignedUrl`（外部 OSS 调用而非 DB 查询），此 fan-out 由 AC-17 oracle 明确要求（"每条经 OssClient 现生成签名 URL"），非查询性能缺陷。无发现。
- **concurrency**：见 F003（ossKey 用 `Date.now()` 无额外唯一性，极窄时间窗口下同批次并发导出可能覆盖彼此的 OSS 对象内容）、F004（OSS 上传成功但 DB 插入失败时产生孤儿 OSS 对象，但已验证不会向客户端返回"伪成功"）。两者均为窄可达性的 advisory，非阻断。
- **logging-privacy**：新增文件（calc-commission.ts/commission-report.service.ts/commission-report.controller.ts）未引入任何 Logger/console 调用；`AllExceptionsFilter` 复用既有逻辑，422（本次新增分支命中的状态码）不触发 `logger.error`（只有 ≥500 才记录），不涉及新增日志面。无发现。
- **maintainability**：`calcCommission`/`ruleComplete` 均单点实现、正确复用，无重复；`buildUniqueSheetName` 为本任务合理新增（服务于 exceljs sheet 命名硬约束），未发现与既有代码重复实现；未见无必要的复杂度扩张。无发现（测试缺口已归入 F002/test-evidence，不在本维度重复计）。
- **sensitive-boundaries**：核心计费路径（calcCommission 边界语义、ruleComplete 复用非重实现、单一权威、2002 路径不产生任何 OSS 上传/DB 落库副作用、AC-16 未匹配记录不计入任何人提成且仍在明细/汇总中可见、鉴权覆盖三路由、不做计算结果快照）逐项独立反证通过，无阻断级发现；F003/F004 属该维度关注的"不可逆外部副作用"范畴但已确认影响面窄且不产生金额/信封层面的错误，判为 advisory 而非阻断（无 evidence-gap，均有完整可复现推导）。

## 偏离核查（Step 5 声明项独立验证）

1. **excel-builder.ts / excel-builder.spec.ts**：读取 base tree 原始文件确认 `PolicyRecordExportRow`/`ExcelBuilder` 在 ic-v1-006 开工前已由 ic-v1-001 交付（含 `summaryRows`/`totalRow` 等报表专属结构），仅缺"销售"列；`POLICY_RECORD_COLUMNS`（`policy-record-columns.ts`）作为 `ExcelParser` 唯一消费源，本次改动未触碰，`DETAIL_COLUMNS` 只是在其基础上 `slice(0,5)+插入+slice(5)` 派生的展示层数组，`ExcelParser` 全文档 grep 确认只 import `POLICY_RECORD_COLUMNS`，不感知 `DETAIL_COLUMNS`——BE-EXCEL-01 的真实保证（导入/导出共用 8 列账单字段定义单一来源）未被破坏。移除的往返测试（"ExcelBuilder 生成的表头可直接被 ExcelParser 识别并解析"）测的是"输出=8 列账单形状"，这一形状因新增"销售"列插入而不再成立属设计意图内变化，非回归；替换测试（表头顺序断言 + 未匹配行空白单元格断言）覆盖了变化后的真实行为，判定移除合理、非证据劣化。未发现更小改动半径的替代方案——不改 `ExcelBuilder` 直接在 service 里手工插列会违反 BE-LAYER-01（把渲染逻辑散落到 Service）且需要重新实现 exceljs 列/sheet 拼装，风险更高。
2. **error-code.enum.ts / all-exceptions.filter.ts**：`standards-shared.md` SH-API-02 原文已将 2002 登记为"本期新增"错误码，本次改动是该登记的接线落地，非未声明的新增；独立 grep 确认项目此前无任何 422/`UNPROCESSABLE_ENTITY` 使用，新映射不遮蔽/不与既有状态码分支冲突；e2e 独立验证 `RuleIncompleteException` 抛出后响应体确为 `{code:2002,...}`，HTTP 422。

## 结论

12 个 selected 维度逐项执行完毕，独立复核的测试/lint/类型检查全部通过，2 条 golden AC 逐字复算无误，单一权威/无快照/鉴权/2002 全链路等 sensitive 关注点均独立验证通过。4 条 advisory 级 finding（1 条注释规范重现、1 条边界分支测试缺口、2 条窄可达并发风险）均不构成阻断，`conclusion: pass`。
