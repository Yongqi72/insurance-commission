---
task_id: ic-b-005
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-005/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 569e9f53ae55e58853061b5610671cfce1dc59c1
reviewed_base: 7cd64279f9c10938b71fb0c5e4b14c5f0b434fcf
reviewed_head: e6512d4c7011023e5d9c803f0120384ec3adda2d
diff_sha256: 323572f4fa938010c6a9564926fc67787ba2b33b16a4594b1560f6d0da4ddfa9
changed_files:
  - backend/src/commission-batch/policy-record-query.service.ts
  - backend/test/commission-batch-policy-records.e2e-spec.ts
  - backend/test/policy-record.e2e-spec.ts
started_at: 2026-08-28T09:43:00Z
completed_at: 2026-08-28T09:51:04Z
elapsed_minutes: 9
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "old-code repro: unescaped Like('%WO_2026_001%') on sqlite matches both 'WO_2026_001' and 'WOX2026X001' (2 rows) — confirms new e2e test is discriminative, not vacuous"
  - "TypeORM+better-sqlite3 instrumented probe: 3x Raw() clauses in one OR'd where[] all named :keyword/:escapeChar compile to positional '?' placeholders with correctly duplicated bound values per occurrence — no param-name collision"
affected_regressions: []
changed_surface_allowed:
  - backend/src/commission-batch/policy-record-query.service.ts
  - backend/test/commission-batch-policy-records.e2e-spec.ts
  - backend/test/policy-record.e2e-spec.ts
```

### 派发前置核验

- `diff_sha256`：对 `reviewed_base`→`reviewed_head` 限定这三个文件重算 `git diff | sha256sum`，得到
  `323572f4fa938010c6a9564926fc67787ba2b33b16a4594b1560f6d0da4ddfa9`，与派发参数完全一致。
- 整棵 tree 的 `git diff reviewed_base reviewed_head --stat`（不加路径限制）确认只有这三个文件变化
  （service.ts +24/-4，commission-batch-policy-records e2e +80，policy-record e2e +7/-4，共 3 files changed），
  未触碰 `commission-report.e2e-spec.ts`，`do-not` 边界未被打穿。
- **重要环境说明**：当前工作区（非 review 用的固定 tree）在核验过程中处于脏状态，混有与本任务无关的
  其他改动（`import.service.ts`、`commission-report.service.ts` 被修改，新增未纳入 diff 的
  `ensure-batch-exists.util.ts`、`common/utils/extract-operator.util.ts`）——判断是同仓库里另一个并行
  任务的在制品，与 ic-b-005 无关。为避免用被污染的工作区跑 build/lint/test 得出误导性结论，本轮所有
  build/lint/e2e 验证改用 `git commit-tree e6512d4c... -p 569e9f5...` 生成一个仅用于隔离检出的临时提交，
  在 `git worktree add --detach` 出的独立目录（符号链接复用 `node_modules`）里执行，跑完即
  `git worktree remove --force` 清理，未污染、未依赖主工作区的漂移状态。

## 逐维度审查

### 1. contract（core）

三条 AC 逐条核对：

- AC1（keyword 转义避免过度匹配）：`escapeLikeKeyword()` 转义 `\`/`%`/`_`，`Raw()` 生成
  `LIKE :keyword ESCAPE :escapeChar`。用 node 直接跑该正则验证多组边界输入（含 keyword 本身带反斜杠
  `"a\\b_c"` → 转义为 `"a\\\\b\\_c"`），并用 better-sqlite3 实测 `LIKE ... ESCAPE ?` 参数绑定确实按预期
  只做字面量匹配（见下方 test-evidence 小节的 SQL/参数捕获）。AC 声明的 example（"WO_2026_001" vs
  "WOX2026X001"，total=1）与新增 e2e 用例 `commission-batch-policy-records.e2e-spec.ts:166-189` 字面一致
  且实测通过。
- AC2（空列表断言恢复）：`policy-record.e2e-spec.ts` diff 精确把 `expect.any(Array)`/`expect.any(Number)`
  改回 `list: []`/`total: 0`，并新增解释性注释说明"文件内首个查询该表用例"。逐行核对文件内 `it()`
  声明顺序（第 100 行的目标用例先于第 150 行起的 `createRecord()` 调用），确认该断言时刻表内确定为空
  （详见 test-evidence 小节）。
- AC3（keyword+fillStatus AND 组合）：新增用例构造 3 条记录（2 条命中 keyword 但 fillStatus 不同、
  1 条命中 fillStatus 但不命中 keyword），断言 total=1 且命中的是"两者都满足"的那条——若实现退化成 OR
  语义，该断言会得到 total=3 而不是 1，是有辨别力的反例设计，非平凡恒真断言。

无发现。

### 2. scope-and-secrets（core）

- 固定 diff 仅涉及派发声明的 3 个文件，无超出 `files` 清单的改动。
- `do-not` 三条逐一核验：① `baseWhere.salesFillSource = fillStatus` 赋值逻辑字符不差保留；
  ② `KEYWORD_FIELDS` 数组的三个字段（`workOrderNo`/`policyNo`/`customerName`）及顺序未变；
  ③ `commission-report.e2e-spec.ts` 未出现在 diff 中，未被顺带修复。
- diff 内容通读未见明文 PAT / token / 密码 / 私钥 / API key。

无发现。

### 3. test-evidence（core）

**转义正确性（node REPL 直接验证 `escapeLikeKeyword` 正则）**：

```
"WO_2026_001" -> "WO\\_2026\\_001"
"a\\b_c"      -> "a\\\\b\\_c"      // keyword 自带反斜杠的边界情况，转义符自身也被正确转义
"100%off"     -> "100\\%off"
"__"          -> "\\_\\_"
"%%"          -> "\\%\\%"
```
正则 `/[\\%_]/g` 对三类字符全覆盖，替换函数逐字符前插转义符，无遗漏、无重复转义。

**ESCAPE 子句参数绑定在 better-sqlite3 下确实生效（核心声明的实测证据，非理论推导）**：直接用
`better-sqlite3` 跑 `SELECT v FROM t WHERE v LIKE ? ESCAPE ?`，绑定 `('%WO\_2026\_001%', '\')`，
只返回 `WO_2026_001`，不误命中 `WOX2026X001`；再测 keyword 自带字面反斜杠场景（`a\b_c`）同样精确匹配。

**旧代码正对照（证明新增用例确有辨别力，不是摆设）**：用同一份数据、旧的
`Like(\`%${keyword}%\`)`（不带 ESCAPE）在 sqlite 上跑，`keyword="WO_2026_001"` 会同时匹配
`WO_2026_001` 与 `WOX2026X001`（返回 2 行）——证实若这次修复被回退，新增的下划线转义 e2e 用例
（断言 total=1）会失败翻红，不是恒真断言。

**Raw() 在 OR 数组里三次复用相同具名参数 `keyword`/`escapeChar` 是否产生绑定错乱**：这是 brief 里点名
要查的陷阱，用真实 `DataSource`（better-sqlite3 + 实际 `PolicyRecord`/`CommissionBatch` entity）+
自定义 `logger.logQuery` 捕获生成的 SQL 与参数数组，复现服务里的 `where` 构造逻辑，跑了三组场景：

- keyword="WO2026" 命中三字段中三条不同记录（workOrderNo/policyNo/customerName 各命中一条）：
  生成 SQL 为 `... WHERE (((batchId=? AND workOrderNo LIKE ? ESCAPE ?)) OR ((batchId=? AND policyNo LIKE ? ESCAPE ?)) OR ((batchId=? AND customerName LIKE ? ESCAPE ?)))`，
  参数数组为 `['1','%WO2026%','\\','1','%WO2026%','\\','1','%WO2026%','\\']`——TypeORM 把具名参数
  `:keyword`/`:escapeChar` 编译成三组独立的位置化 `?` 占位符，各自携带正确的值，**不存在同名参数互相覆盖
  的问题**；查询结果 total=3，与预期完全一致。
- keyword="WOCOMBO" + fillStatus="unmatched" 组合：同样生成 3 段 OR 分支，每段都叠加
  `sales_fill_source=?` 精确匹配，total=1（只有真正同时满足两个条件的记录），与 AC3 期望一致。
- keyword 含下划线："WO_2026_001" 转义后的模式 `%WO\_2026\_001%` 正确出现在生成 SQL 的参数里，
  只命中 1 条记录。

三组场景的生成 SQL 与实际查询结果一致互证，**Raw() 具名参数在同一 where 数组内重复使用不会产生绑定
错乱**，此前担心的陷阱不成立。

**空列表断言不会 flaky 的证据链**：
- `policy-record.e2e-spec.ts` 用 `beforeAll`（非 `beforeEach`）建单一共享 `app`/`policyRecordRepository`
  实例（第 21-44 行），且该文件走 `better-sqlite3` `:memory:`（`src/config/typeorm.config.ts` 第 35-36
  行，`NODE_ENV=test` 时固定内存库），每个测试文件的 `Test.createTestingModule` 各自持有独立的内存库
  连接，`commission-batch-policy-records.e2e-spec.ts` 与 `policy-record.e2e-spec.ts` 是两个不同的
  spec 文件、各自独立的内存库实例，不会跨文件互相污染同一张表。
- 文件内部逐行核对 `it()` 声明顺序：第 68/81/91/100/139 行五个用例（含目标用例，第 100 行）均在第 150
  行 `describe('PATCH .../sales-name')` 块之前，而全文件唯一的数据写入点 `createRecord()` 首次调用
  出现在第 150 行之后（`golden：salesName 为空的记录首次补录` 用例）。目标用例先于所有 `createRecord()`
  执行，此刻表内确定为空，断言 `list:[]`/`total:0` 是真实基线，不是巧合下的空态。
- Jest 默认按声明顺序（非随机）串行执行同文件内的 `it()`，未见项目 jest 配置开启测试随机化。

**运行结果**（均在按固定 tree SHA 隔离出的干净 worktree 里跑，避免被主工作区无关 WIP 污染）：
- `npm run build`：通过，无 TS 报错。
- `npm run lint`：`eslint ... --fix` 全绿，跑完后 `git status` 对比未见对被审文件产生新增改动（无
  隐藏的自动修复偏离已审内容）。
- `npx jest --config test/jest-e2e.json commission-batch-policy-records policy-record.e2e`：
  2 个 suite、**30 项全部通过**（19 + 11，与派发预期一致）。
- `npm run test:e2e`（全量）：6 个 suite / 98 项，**97 passed / 1 failed**；唯一失败为
  `commission-report.e2e-spec.ts:353`（OSS key 旧格式断言，`exports/${batchId}/` vs 实际
  `bill/export/...` 路径），与本次改动的文件、行为完全无关，是任务包 `known-risks` 里已登记的既有
  欠账（ic-b-001 遗留），未引入新增失败用例。

无发现。

### 4. comment-hygiene（core，轻量）

新增/改动注释逐条过（`escapeLikeKeyword` 函数头注释、`Raw()` 选型原因注释、e2e 用例里"若被当通配符
会误命中"解释性注释、"空列表基线"解释性注释）：均为解释代码为什么这样写的技术性说明，未夹带任务号/
迭代号/考古式历史引用，也没有"禁止/不得 X"式规则性声明（更没有缺前提的版本）。

无发现。

### 5. standards

任务包 `relevant-standards: []`，无命中规则 id 需要核对。

无发现。

### 6. enforcement

本任务不是新增规则/检查器/CI 门禁类任务，没有声明覆盖某类语法/调用面的 enforcement 机制；相关的
"回归检测能力"已在 test-evidence 维度用正反控（旧代码复现会翻红、新代码通过）验证过。

无发现。

### 7. design-fidelity

本任务改动面（`backend/src/commission-batch/policy-record-query.service.ts` 及两个 e2e 测试文件）
不涉及任何前端/UI 代码，diff 中无样式、布局、交互相关改动，项目根 `design.md`/`prototype.html`
在本次改动面上无可比对对象。

无发现。

### 8. input-provenance（穷举式）

DTO 文件：`backend/src/commission-batch/dto/query-policy-record.dto.ts`，class
`QueryPolicyRecordDto extends PageQueryDto`（`PageQueryDto` 定义于
`backend/src/common/dto/page-query.dto.ts`）。可提交字段合计 **N=4**：`page`、`pageSize`
（继承自 `PageQueryDto`）、`keyword`、`fillStatus`（自身声明）。本次改动的方法 `findPage()` 是这
4 个字段的唯一消费点，本表行数=4，与 N 一致。

| 字段 | service 消费位置 | 是否被覆盖 | 结论 |
|---|---|---|---|
| `page` | `policy-record-query.service.ts:91`（`skip: (page - 1) * pageSize`） | 否 | 正常 |
| `pageSize` | `policy-record-query.service.ts:91-92`（`skip`/`take`） | 否 | 正常 |
| `keyword` | `policy-record-query.service.ts:75-86`（构造 `Raw()` LIKE 条件，OR 三字段） | 否（本次改动核心：转义后原样参与匹配） | 正常 |
| `fillStatus` | `policy-record-query.service.ts:65-67`（`baseWhere.salesFillSource = fillStatus`） | 否（未受本次改动影响，`do-not` 明令保留原逻辑） | 正常 |

覆盖率自证：DTO 文件 `query-policy-record.dto.ts`，class `QueryPolicyRecordDto`，字段数 N=4，本表行数=4。

无发现。

### 9. query-performance

`findPage()` 改动前后都是单次 `findAndCount()` 调用，只是 `Like()` 换成 `Raw()`，未引入循环查询、
未受控 fan-out 或分页后补查。查询结构（OR 数组 × baseWhere 前缀条件）本身是改动前既有设计，未在本次
diff 中劣化。

无发现。

### 10. concurrency

本次 diff 未触碰任何写入/事务/唯一性 surface——`findPage()` 是只读查询方法，`fill()`（含并发删除防护
的 `update()` 写入逻辑）在这次改动里完全未变动（只有 import 语句与 `findPage()` 内部逻辑被改）。

无发现。

### 11. logging-privacy

本次 diff 未新增任何日志语句，也未改动现有 `this.logger.*` 调用；keyword 原始值/转义后的值均未被
写入日志。

无发现。

### 12. maintainability

`escapeLikeKeyword(keyword)` 在 `KEYWORD_FIELDS.map()` 回调里对同一个 `keyword` 值重复调用三次
（三个字段各算一次，结果完全相同），属于可避免的重复计算，但 `KEYWORD_FIELDS` 固定长度为 3、
函数体是一次正则 `replace`，量级可忽略不计，不构成实质性能或复杂度问题，未达到"明显重复实现/无必要
复杂度扩张"的报告门槛，不作为 finding 记录。除此之外未见重复造轮子或绕开既有 service/util 的情况。

无发现。

### 13. sensitive-boundaries

本次改动不涉及权限/认证判断、租户数据隔离、不可逆操作或金额/计费计算——`findPage()` 是只读查询，
唯一变化是 LIKE 匹配语义从"误将通配符解释"修正为"字面量匹配"，不改变可访问的数据范围边界（仍然是
同一 `batchId` 下、按更严格/更精确的条件过滤，收窄而非放宽匹配范围）。

无发现。

## Findings

```yaml
findings: []
```

## 结论

`pass`。三条 AC 均有可失败、有辨别力的测试证明（含旧代码正对照复现 bug、TypeORM 参数绑定的实测 SQL/
参数捕获），`do-not` 边界与文件范围均未越界，build/lint 全绿，目标 e2e（30 项）与全量 e2e
（97/98，1 个已登记在案且与本任务无关的既有失败）均符合预期。13 个 selected dimension 均无阻断或
建议级 finding。
