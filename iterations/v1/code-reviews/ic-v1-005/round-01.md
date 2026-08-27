---
task_id: ic-v1-005
round: 1
mode: full
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-005/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 5852fcdd3b72d9cec55568419fac86e321d7b275
reviewed_base: e31be08da0d12234fb8a2c7fb3de4bf860248ce8
reviewed_head: 67b7c256b1361c1d452e39b11b5cf12e3cb22bd3
diff_sha256: f8e4238d44355e4631c8dfa0be89f3e47f19079b5f810fe845544bd3d55bbcbc
changed_files:
  - backend/src/app.module.ts
  - backend/src/commission-tier/commission-tier.controller.ts
  - backend/src/commission-tier/commission-tier.module.ts
  - backend/src/commission-tier/commission-tier.service.ts
  - backend/src/commission-tier/dto/upsert-commission-tier.dto.ts
  - backend/src/commission-tier/rule-complete.util.ts
  - backend/test/commission-tier.e2e-spec.ts
started_at: 2026-08-27T03:55:00Z
completed_at: 2026-08-27T04:14:00Z
elapsed_minutes: 19
escalate_to_full: false
conclusion: evidence-needed
---

## 本轮范围

```yaml
counterexamples:
  - "ruleComplete() 独立单测（不信执行者 e2e 断言，自写探针脚本直接 import 源文件调用）：空数组→false；单档 (0,null]→true；(0,50],(50,null]→true；(0,50],(60,null]（空隙）→false；(0,50],(30,80]（重叠非法输入）→false 且不抛异常——全部与承诺行为一致"
  - "assertNoConflict() 边界反例（独立重实现同一公式验证）：新档 lowerBound 恰好等于某档 upperBound（相邻，从上方）→不冲突；新档 upperBound 恰好等于某档 lowerBound（相邻，从下方）→不冲突；新档完全包含另一档→冲突；新档被另一档完全包含→冲突；两者皆开放上界（null）重叠→冲突；开放上界与恰好相邻→不冲突——六例全部与左开右闭语义吻合"
  - "并发反例（本轮新增证据，见下节）：两个几乎同时的重叠区间 POST 请求（Promise.all 并发发起），在当前测试环境（better-sqlite3 同步驱动）下未能复现出真实交叠——第一个请求的 find→create→save 链路在事件循环让出给第二个请求之前已完整跑完，第二个请求随后基于已提交状态检测出冲突并 409。已确认这是测试驱动的同步语义掩盖了问题，而非代码本身具备并发保护（见 F001）"
affected_regressions: []
changed_surface_allowed: [backend/**]
```

`full`：按 `profile-round-01.json` 的 `selected_dimensions` 执行 `develop-review.md` 对应 id（contract / scope-and-secrets / test-evidence / comment-hygiene / standards / enforcement / input-provenance / query-performance / concurrency / logging-privacy / maintainability / sensitive-boundaries）。审查员独立执行 `npx tsc --noEmit`（通过，零错误）、`npm run lint`（通过，零告警）、`npm run test:e2e -- commission-tier.e2e-spec`（24/24 通过）、`npm run test:e2e` 全量回归（5 个测试文件、74 个用例全部通过，与 ic-v1-002/003/004 累计用例无冲突）。额外自写三份独立探针脚本（不使用执行者代码/断言）：① 直接 `import` `rule-complete.util.ts` 源文件跑 7 组边界用例；② 独立重新实现 `assertNoConflict` 的判定公式跑 6 组区间边界反例；③ 在 `backend/test/` 下临时新建一份并发探针 e2e 用例（`Promise.all` 并发发两个重叠区间的 POST），运行后立即删除，工作区未留痕（`git status --short backend/test/` 核对与派发前一致）。

## 本轮重点核查结论（sensitive 升档原因）

1. **`ruleComplete(tiers)` 签名与实现**：`backend/src/commission-tier/rule-complete.util.ts:16` 精确为 `export function ruleComplete(tiers: TierBoundary[]): boolean`，其中 `TierBoundary = { lowerBound: number; upperBound: number | null }`（同文件 `:11-14` 单独 `export`），与任务包承诺的内联类型结构等价（TS 结构化类型，ic-v1-006 按承诺形状 import 调用不受影响）。函数体不含任何 `import` 数据库/Repository 相关模块，仅做数组排序与遍历比较，纯函数、无副作用——核实为真。独立探针脚本 7 组用例（空数组/单档/首尾相接/留空隙/重叠非法输入）全部通过，且重叠非法输入不抛异常、按"排序后检查相邻是否首尾相接"的朴素逻辑给出确定性结果（false），未在遇到非法输入时 crash。
2. **区间冲突判定**：独立重新实现 `commission-tier.service.ts:174-190` 的判定公式（未直接复制执行者代码），构造 6 组边界反例（含"恰好相邻"两个方向、"完全包含"两个方向、"双开放上界重叠"、"开放上界恰好相邻"），结果与源码逐行推导完全一致，左开右闭语义无偏差。AC-11 golden example（含冲突分支与成功分支）在 e2e 用例中逐字覆盖且独立重跑通过。
3. **变更日志快照**：`writeChangeLog`（`commission-tier.service.ts:192-206`）create 时 `before=null`、delete 时 `after=null`、update 两者皆有——与调用点逐一核对一致；`operationType` 由各自调用处硬编码传入（`'create'/'update'/'delete'`），与实际操作严格对应，无从别处推断的间接逻辑。`GET change-logs`（`:140-151`）经 `parseSnapshot` → `isTierSnapshot` 类型守卫解析为对象后返回；`isTierSnapshot`（`:37-47`）用逐字段 `typeof` 校验（`lowerBound`/`unitPrice` 为 `number`，`upperBound` 为 `number` 或 `null`），不是简单 `as` 断言，满足 BE-JSON-01；`JSON.parse` 失败或结构不符时 `parseSnapshot` 返回 `null` 而非抛异常或让脏值流入下游——符合"格式异常不进入下游逻辑"。e2e 用例对 create→delete 与 update 两条链路均以对象字面量断言 `beforeSnapshot`/`afterSnapshot`，实测证实返回的确是解析后的对象而非原始字符串。
4. **DELETE 无字段校验**：Controller `@Delete(':id')` 无 `@Body()`，Service `remove()` 只接收 `id`；删除后产生空隙不做完整性前置阻止（e2e"删除中间档位"用例证实 `ruleComplete` 由 true 变 false 但删除操作本身 200 成功）——与 oracle 一致。
5. **`unit_price` decimalTransformer**：`commission-tier.entity.ts`（ic-v1-001 交付、本任务未改动）第 `unitPrice` 列 `type:'decimal', transformer: decimalTransformer`，显式引用公共 `common/transformers/decimal.transformer.ts`，未裸用 TypeORM 默认行为——核实为真（虽然 Entity 文件不在本任务 changed_files 内，但任务明确要求核实该字段确实走 transformer，故读取确认）。
6. **do-not 边界**：全库 `grep` 确认 `commission-tier/` 目录内无 `calcCommission`/`commission-summary`/`commission-report` 的任何实现（仅 `rule-complete.util.ts` 顶部注释提到这两个下游接口名，属文档性说明，非实现）；无按分站/业务类型差异化定价字段；无历史版本回滚接口。三项 do-not 均未越界。
7. **并发/TOCTOU（本轮新增独立验证，构成本报告唯一 blocking finding）**：`create()`/`update()` 均是"先 `find()` 读全量其余档位做冲突校验，再 `save()`"两步非原子操作，中间无事务包裹、无 `SELECT ... FOR UPDATE`、DB 层也无唯一/排他约束防止区间重叠（`migrations/1787735505276-...ts` 内 `commission_tier` 表仅有 `lower_bound` 上的普通 `TableIndex`，非唯一约束）。本地测试库为 `better-sqlite3`（同步驱动，`typeorm.config.ts:34-40`），本轮自建并发探针发现两个并发重叠 POST 请求在该驱动下未能触发真实交叠（第一个请求的整条 `find→create→save` 链路在 Node 事件循环让出给第二个宏任务之前就已跑完，属驱动同步语义的副作用，不是代码有意保护）；生产驱动为 MySQL（真实网络 I/O，`typeorm.config.ts:17-31`），`find()`/`save()` 之间是真实的异步让出点，两个几乎同时到达的重叠区间提交请求存在都读到"提交前"状态、都通过冲突校验、都被持久化的窗口，会破坏本模块存在的核心不变式（阶梯表内区间不重叠）。当前测试基础设施（sqlite 同步驱动）无法产出该场景下的可复现失败用例，故按 sensitive risk 的证据不足处理原则，判定为 blocking evidence-gap，不伪装成已证实的 behavior-bug。

## Findings

```yaml
findings:
  - id: ic-v1-005-F001
    dimension: concurrency
    severity: 阻断
    type: evidence-gap
    reachability: conditional
    evidence: "commission-tier.service.ts create()/update()（:94-131）为 find()→冲突校验→save() 两步非原子写入，无事务/行锁/DB 唯一约束兜底（migrations/1787735505276-...ts 内 commission_tier 表仅 lower_bound 普通索引，非唯一/排他约束）；本轮自建并发探针（Promise.all 并发两个重叠区间 POST）在当前 sqlite 测试驱动下未复现交叠（第一请求链路在事件循环让出前已提交完毕），但生产驱动为 MySQL（真实异步网络 I/O），find()/save() 之间存在真实让出点，理论上两个近乎同时到达的重叠提交可各自通过校验并均落库，产生数据库层面实际重叠的两条 commission_tier 记录"
    impact: "若在生产环境触发，将破坏本模块唯一的核心不变式（阶梯区间不重叠），且该表无版本快照、直接驱动全集团实时提成计算——一旦出现重叠记录，后续查询/计算行为（含 ic-v1-006 消费方）在存在多条匹配区间时的取值顺序未定义，属未覆盖场景；当前测试环境驱动特性掩盖了该窗口，无法在本仓现有 CI/测试基础设施上产出确定性复现用例"
    action: request-evidence
    status: open
```

- `contract`：AC-10~AC-13、技术 AC（DTO 校验完整性）共 5 条 intent 均已实现且 oracle 有辨别力测试覆盖（24 个 e2e 用例逐条对应错误码/状态码/响应体），独立重跑全部通过；AC-11 唯一 `golden: true` 用例（含冲突分支 1005 与成功分支 ruleComplete=true）字面 1:1 覆盖，且已用独立探针脚本交叉验证判定公式与 `ruleComplete()` 本身正确性，与源码非同一份实现。
- `scope-and-secrets`：diff 仅触及本轮声明的 7 个文件（`git diff --stat` 核对与 profile `changed_files` 逐一比对一致，`app.module.ts` 改动只含 `CommissionTierModule` 的 import 与注册两行，未触碰其余模块注册行）；未触碰 policy-record/commission-batch 模块（do-not 边界确认无违反）；diff 内无明文密钥/token/密码（e2e 用例中的 `e2e-Test-Only-Pwd` 为既有测试专用固定占位符，与本仓其余 e2e 文件用法一致，非真实凭证）。
- `test-evidence`：24 个新增 e2e 用例对本包全部行为分支有区分度（鉴权 401、DTO 校验各字段 1001、冲突 1005、不存在 1004、成功路径、change-logs 快照结构），独立重跑全绿；`tsc --noEmit`/`lint` 通过；全量回归 74/74 通过，与 ic-v1-002/003/004 无冲突。唯一未直接测试的分支是 `isTierSnapshot` 守卫在真正遇到脏 JSON 时的行为（正常读写路径不会产生脏值），但该函数本身经代码阅读确认为真实 `typeof` 运行时校验而非 `as` 断言，已在"本轮重点核查结论"第 3 点独立核实，不构成 finding。
- `comment-hygiene`：本次新增/改动注释中未出现任何任务号/迭代号点名（`grep -niE "ic-v1-00|iteration"` 命中为 0），与前四个任务（ic-v1-001~004）产生的同类 advisory 问题不同，本任务无此问题；"do-not"相关注释（如 rule-complete.util.ts 顶部"不得各自重复实现"）均写成了前提说明，非空泛禁止性断言。无发现。
- `standards`：
  - BE-LAYER-01：Controller 只做 `@Body()`/`@Param()`/`@Req()` 接收与转发，业务判断（边界校验、冲突判定、快照写入）全部在 Service；未见 Controller 直接操作 Repository。符合。
  - BE-LAYER-02：全局 `grep -rn "@Controller"` 核对，`api/commission-tiers` 前缀字面量与既有 `api/commission-batches*`、`api/policy-records*`、`auth` 均不重叠，无静默遮蔽。符合。
  - BE-VALID-01：`UpsertCommissionTierDto` 三字段（`lowerBound`/`upperBound`/`unitPrice`）均有完整 class-validator 装饰器（`@IsInt`+`@Min(0)`、`@IsOptional`+`@IsInt`+`@Min(0)`、`@IsNumber`+`@IsPositive`），无漏装饰器字段；全局 `ValidationPipe`（`whitelist/forbidNonWhitelisted/transform` 均为 true，`main.ts:9-14` 与 e2e 测试本地构造的 pipe 配置一致）实测拦截非法值（非数字/负数/缺失字段均返回 1001）。符合。
  - BE-TYPEORM-03：`unit_price` 列显式 `transformer: decimalTransformer`，未裸用默认行为（见"本轮重点核查结论"第 5 点）。符合。
  - BE-DB-03：`commission_tier`/`commission_tier_change_log` 两表结构变更由 ic-v1-001 交付的正式 migration 文件落地（`1787735505276-CreateCommissionTablesAndAlterPolicyRecord.ts`），本任务未新建表、未依赖 `synchronize:true` 生产路径。符合（本任务本身无新增表结构改动）。
  - BE-JSON-01：`isTierSnapshot` 为真实运行时类型守卫（逐字段 `typeof` 校验），非简单 `as` 断言；解析失败时返回 `null` 不进入下游。符合（详见"本轮重点核查结论"第 3 点）。
  - SH-API-01：Controller 未手动包装响应，交由全局 `SuccessInterceptor`；e2e 断言 `{code, msg, data}` 信封结构。符合。
  - SH-API-02：`BadRequestException`→400→1001，`NotFoundException`→404→1004，`ConflictException`→409→1005，均经 `AllExceptionsFilter.mapStatusToCode` 映射，e2e 逐一验证命中。符合。
  - SH-AUTH-01：Controller 五个路由均未标 `@Public()`，走全局 `JwtAuthGuard` 默认受保护；e2e 前两个用例验证未登录访问 GET/POST 均返回 401/1002。符合。
  - 无发现（除 F001 属 concurrency/sensitive-boundaries 维度，非本维度范畴）。
- `enforcement`：本任务非专门的 enforcement/lint 基础设施任务，profile 选中该维度主要因测试面较大；24 个 e2e 用例对合法值/非法值、存在/不存在 id 均有区分度，运行时确认全局 `ValidationPipe`/`AllExceptionsFilter`/`JwtAuthGuard` 在违规输入下真实翻红（非形同虚设）。无发现。
- `input-provenance`：
  - DTO：`backend/src/commission-tier/dto/upsert-commission-tier.dto.ts` class `UpsertCommissionTierDto`，字段数 N=3
    - `lowerBound` | `commission-tier.service.ts:103 lowerBound: dto.lowerBound`（create）、`:125 existing.lowerBound = dto.lowerBound`（update）、`:165 assertBoundsOrdered` 读取参与跨字段校验、`:178-181 assertNoConflict` 读取参与冲突判定 | 否，未覆盖，原样写入/参与判定 | 正常
    - `upperBound` | `commission-tier.service.ts:104 dto.upperBound ?? null`（create）、`:126 同式`（update）、`:165`、`:178` 同上参与判定 | 否，未覆盖（`?? null` 是对"省略"的默认值处理，非覆盖用户提交值） | 正常
    - `unitPrice` | `commission-tier.service.ts:105 unitPrice: dto.unitPrice`（create）、`:127 existing.unitPrice = dto.unitPrice`（update） | 否，未覆盖，原样写入 | 正常
  - 覆盖率自证：1 个 DTO 文件，`UpsertCommissionTierDto` 共 3 个可提交字段（N=3），本表 3 行，行数=N，枚举完成。全部结论为「正常」，无 finding。
- `query-performance`：`findAll()`/`findChangeLogs()` 均为单次 `find()` 无关联加载、无循环查询；`create()`/`update()` 内的 `others = await this.commissionTierRepository.find()` 是对冲突校验必需的一次全量小表查询（阶梯档位数量级为个位数到十位数，非分页列表场景），不构成 N+1 或未受控 fan-out。无发现。
- `concurrency`：见 F001（本维度核心 blocking finding）。除 F001 外未见其他并发问题——`remove()`（`:133-138`）为 `findOneOrFail`→`remove()`→写日志，无跨记录状态依赖，重复删除同一 id 的第二次请求会在 `findOneOrFail` 处返回 404，非静默成功也非崩溃，行为合理。
- `logging-privacy`：本次 diff 未新增任何 `console.log`/`Logger` 输出；错误信息（如冲突提示 `与已有档位 (...) 区间重叠`）仅包含区间数值，不含凭据/PII/跨租户数据。无发现。
- `maintainability`：`decimalTransformer`/`numericIdTransformer` 复用既有公共 transformer，未重造；`writeChangeLog`/`toSnapshot`/`parseSnapshot`/`isTierSnapshot` 职责单一、无重复实现已有 service/工具；Controller/Service 分层与 `policy-record`/`commission-batch` 既有模块风格一致。无发现。
- `sensitive-boundaries`：见 F001。其余方面：鉴权确认全部路由默认受保护（无 `@Public()` 误标注）；DELETE 为不可逆操作但已在任务包 known-risks 中显式声明"无一键回滚、仅能手动改回"为已接受设计，本轮未发现超出该已知风险的新问题；金额字段（`unit_price`）读写路径统一走 `decimalTransformer`，未见裸浮点/字符串误用。

## 处理说明

- F001：并发 TOCTOU 窗口在当前 sqlite 测试驱动下无法产出确定性复现用例（已实测尝试，未能触发交叠），但代码路径本身（无事务/无行锁/无 DB 唯一约束）在生产 MySQL 驱动下的风险真实存在，且该表是"无版本快照、改动立即对全集团实时生效"的敏感配置源头。按 sensitive risk 处理原则判定为 blocking evidence-gap，action=request-evidence：建议执行者或后续任务在 `update()`/`create()`的 find+校验+save 序列外加一层保护（如数据库事务 + `SELECT ... FOR UPDATE` 悲观锁，或退化为应用层单例互斥锁，任一均可），或由权威方（TRD/PRD 责任人）明确评估"当前单管理员角色 + 低频操作场景下该并发窗口的实际业务概率可接受，暂不处理"并将该决策显式记入 known-risks，二选一皆可关闭本 finding；证据补齐或决策落地前不建议直接判定 pass。
- 无其他 blocking finding；除 F001 外全部 profile selected dimensions 均无发现。
- `conclusion: evidence-needed`（因存在一条 sensitive risk 下的 blocking evidence-gap，其余全部维度已通过独立证据核实为 pass，不构成 revise 级代码缺陷）。
