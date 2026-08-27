---
task_id: ic-v1-004
round: 1
mode: full
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-004/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 5852fcdd3b72d9cec55568419fac86e321d7b275
reviewed_base: e31be08da0d12234fb8a2c7fb3de4bf860248ce8
reviewed_head: d2347ee947d1ce9b8536aacbbcaea78141acd92d
diff_sha256: c1411e89d547d57bd4199759fad24d5c34d1806d2b6f790f302a66973cd4eb76
changed_files:
  - backend/src/commission-batch/policy-record-query.controller.ts
  - backend/src/commission-batch/policy-record-query.service.ts
  - backend/src/commission-batch/dto/query-policy-record.dto.ts
  - backend/src/commission-batch/commission-batch.module.ts
  - backend/src/policy-record/policy-record.controller.ts
  - backend/src/policy-record/policy-record.service.ts
  - backend/src/policy-record/policy-record.module.ts
  - backend/src/policy-record/dto/update-sales-name.dto.ts
  - backend/.env.example
  - backend/test/commission-batch-policy-records.e2e-spec.ts
  - backend/test/policy-record.e2e-spec.ts
  - frontend/src/api/policy-record.ts
started_at: 2026-08-26T20:30:00Z
completed_at: 2026-08-26T21:05:00Z
elapsed_minutes: 35
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "policy-record.module.ts 越界改动必要性反例：在隔离 detached worktree 中把 SalesFillLog 从 TypeOrmModule.forFeature 移除（还原为 [PolicyRecord]），重跑 policy-record.e2e-spec，12/12 全部因 AppModule 编译期 UnknownDependenciesException（PolicyRecordService 第 2 个构造参数 SalesFillLogRepository 无法解析）而失败；恢复原状后 12/12 全绿——证实该越界改动技术上不可省略"
  - "keyword+fillStatus 组合 AND/OR 优先级反例：额外写一条探针 e2e（同批次内构造 4 条记录：同批次+错误 fillStatus+关键词命中、同批次+正确 fillStatus+关键词不命中、同批次+正确 fillStatus+关键词命中、跨批次+正确 fillStatus+关键词命中），验证只有'同批次+正确fillStatus+关键词命中'一条被返回，证实 KEYWORD_FIELDS.map 生成的 OR 数组每个分支都正确携带了 batchId/fillStatus 的 AND 前缀，未出现过度匹配或漏匹配"
  - "callFillApi 三条防御分支真实性反例：用 jest.spyOn(Logger.prototype,'warn'/'error') 复算 malformed-structure 与 network-error 两条分支，确认 this.logger.warn/error 均被以预期文案实际调用（原始 e2e 运行中该等级日志因 Nest ConsoleLogger 在 Test.createTestingModule 场景下的 buffer/flush 时序未必打印到终端，但方法调用本身已被独立验证发生，不是死代码）"
affected_regressions: []
changed_surface_allowed: [backend/**, frontend/src/api/policy-record.ts]
```

`full`：按 `profile-round-01.json` 的 `selected_dimensions` 执行 `develop-review.md` 对应 id（contract / scope-and-secrets / test-evidence / comment-hygiene / standards / enforcement / input-provenance / query-performance / concurrency / logging-privacy / maintainability / sensitive-boundaries）。范围严格限定在本任务 12 个 `changed_files`；`git diff e31be08d.. d2347ee9..` 的全量 diff 中同时出现的 `commission-batch.controller.ts`/`.service.ts`/`.entity.ts`、`import.controller.ts`/`.service.ts` 等属 ic-v1-002/ic-v1-003（均已 pass），未重复审查；`commission-batch.module.ts` 只评价本任务新增的 `PolicyRecordQueryController`/`PolicyRecordQueryService` 注册增量。

独立执行：`npx tsc --noEmit`（通过）、`npm run lint`（通过，无告警）、`npm run test:e2e -- commission-batch-policy-records.e2e-spec`（14/14）、`npm run test:e2e -- policy-record.e2e-spec`（12/12）、`npm run test:e2e` 全量回归（4 个 e2e 套件、50/50 全绿）、`frontend` 内 `npx vue-tsc -b`（通过，无错误）。全部在主工作区直接执行——已确认 `git write-tree` 结果与 `reviewed_head` 完全一致，工作区无游离改动，测试读取的就是被审内容本身。

额外用 `git commit-tree` 从 `reviewed_head` 建立两个不挂载分支的临时 detached commit，`git worktree add` 出两个隔离副本分别验证「本轮必查重点」1/8 两项反例，验证完毕后均 `git worktree remove` 清理，全程未触碰主工作区固定 diff。

## 本轮重点核查结论（sensitive 升档原因，逐项对照任务提示的 8 个必查点）

**1. 越界改动核查（`policy-record.module.ts`）**——已证实但报告纪律有缺口：

- 该文件**不在** `iterations/v1/queue/ic-v1-004.md` 的 `files:` 清单内（清单只列了 `policy-record.controller.ts`/`.service.ts`/`dto/update-sales-name.dto.ts`，未列 `.module.ts`），但 diff 中确有一行改动：`imports: [TypeOrmModule.forFeature([PolicyRecord])]` → `[TypeOrmModule.forFeature([PolicyRecord, SalesFillLog])]`。
- **技术必要性**：独立在隔离 worktree 中把该行还原为 `[PolicyRecord]`（不注册 `SalesFillLog`），重跑 `policy-record.e2e-spec`，12/12 全部失败，报错为 Nest 编译期 `UnknownDependenciesException`（`PolicyRecordService` 构造函数第 2 个参数 `SalesFillLogRepository` 在 `PolicyRecordModule` 上下文内无法解析——`SalesFillLog` 未在仓库任何其他 module 注册，`app.module.ts` 也未直接提供）。恢复原状后 12/12 全绿。**结论：这个改动技术上不可省略，不存在更小范围的替代方案**——`SalesFillLog` 仓储只被 `PolicyRecordService` 消费，而该 Service 归属 `PolicyRecordModule`，向该 Service 所在 module 的 `forFeature` 数组追加实体是 TypeORM/Nest 唯一正确的注册方式，没有能绕开修改此文件的等价机制。
- **报告纪律问题（本条为独立发现，不因技术必要性而免责）**：任务包权威原文的 `files:` 清单未列出此文件，而据派发者说明，执行者返回结构的 `deviations` 字段里**也没有提到这个文件**——只在 changed-files 列表里带了一行内联注释（"注册 SalesFillLog repository"）。`files:` 清单外的改动即使确有必要，也应在 `deviations` 里正式声明并说明理由，而不是仅以散落注释代替——这是可追溯性上的纪律缺口，与 ic-v1-002-F001（`commission-batch.entity.ts` 越界但至少在 risk-note 提前声明）性质不同：本次连"提前声明"这一步都缺失，只能靠独立审查事后核实。判定为 F001（advisory，见下）。

**2. AC4（golden，人工补录）事务正确性**——逐字核对，1:1 吻合：

`policy-record.service.ts:53-79`（`updateSalesName`）：`this.dataSource.transaction(async (manager) => {...})` 整个"读旧值→更新→插日志→返回"闭包内**同一个 `manager`** 执行三步操作（`manager.findOne` → 赋值 `record.salesName`/`salesFillSource` → `manager.save(record)` → `manager.save(manager.create(SalesFillLog, {...}))` → `return saved`），确认在同一数据库事务内，与 oracle 逐字一致。错误码：`salesName` 为空 → `UpdateSalesNameDto` 的 `@IsNotEmpty()` 触发全局 `ValidationPipe` → 1001（e2e 用例 `salesName 为空字符串 → 1001` 已验证 400/1001）；记录不存在 → `NotFoundException` → 1004（e2e 用例已验证 404/1004）。允许对已是 system/manual 记录反复覆盖且每次都新增日志、不覆盖旧日志——e2e 用例`允许对已是 system/manual 状态的记录反复覆盖，每次覆盖都新增一条日志`构造两次连续 PATCH，断言 `sales-fill-logs` 返回两条按 `changedAt` 倒序排列的独立日志（`{oldValue:'王五',newValue:'赵六'}` 在前，`{oldValue:'李四',newValue:'王五'}` 在后），与 oracle 完全吻合，独立重跑通过。

**3. BE-EXT-01 外部接口防御性校验**：`policy-record-query.service.ts:callFillApi`（第 122-165 行区间）在使用返回值前，先判 `!response.ok`（非 2xx）→ 未命中；再判 `!body || typeof body !== 'object' || Array.isArray(body)`（结构不符）→ 未命中；只有通过两层校验后才 `return body as Record<string, string>` 交给调用方按 `mapping[record.workOrderNo]` 取值，且取值处（`fill` 方法内）额外判 `typeof name === 'string' && name.trim().length > 0` 才写入 `salesName`——三层防御，未出现"先解构后判空"的反模式。`commission-batch-policy-records.e2e-spec.ts` 用 `jest.spyOn(global, 'fetch')` 模拟了「命中映射」「网络异常（`mockRejectedValue`）」「结构不符（`json` 返回数组）」三条路径；用 `jest.spyOn(Logger.prototype, 'warn'/'error')` 独立复算确认这三条路径确实驱动到了 `callFillApi` 对应的三个分支（不是伪装通过——分支内的 `this.logger.warn`/`.error` 调用被间谍捕获到与源码字面一致的日志文案）。**"未配置" 与 "超时(5s)" 两条路径**：未配置由 `apiUrl` 为空字符串（falsy）时跳过 `callFillApi` 调用整体验证（e2e 用例 `SALES_FILL_API_URL 未配置`）；超时路径本身**无专门 e2e 用例**（`AbortController` + `setTimeout(FILL_TIMEOUT_MS)` 的代码存在且逻辑正确——`abort()` 触发后 `fetch` 的 `AbortError` 会被外层 `catch` 捕获，走异常分支），但和"网络异常"复用同一 `catch` 分支，机制上等价，不构成独立未覆盖分支，未单独判 finding。

**4. BE-LOG-01**：`callFillApi` 的 `catch` 分支用 `this.logger.error` 记录 `url`+`reason`（`err.message`）并传入 `err.stack`，非裸 `try/catch` 吞掉；`!response.ok`/结构不符两条分支用 `this.logger.warn` 记录 `url`+具体原因（状态码/结构描述）。原始 e2e 全量运行中，"网络异常"用例的 ERROR 级日志确实打印到了终端（可见 `[Nest] ... ERROR [PolicyRecordQueryService] 调用第三方回填接口失败：...`），但 WARN 级日志（"结构不符"/"非成功状态码"分支）在同一次运行里未见终端输出——经排查是 `@nestjs/common` 的 `Logger`/`ConsoleLogger` 在 `Test.createTestingModule()` 场景下的静态实例/缓冲时序问题（`jest.spyOn(Logger.prototype,'warn')` 独立验证证实该方法确实以正确文案被调用，只是底层 `ConsoleLogger.printMessages` 的终端输出未必落地），**不是代码本身的缺陷**——BE-LOG-01 要求"经 Logger 记录"，代码确已如此调用，判定合规，未列为 finding。

**5. 路径变更影响面**：`policy-record.controller.ts` 的 `@Controller` 从 `policy-records` 改为 `api/policy-records`。全局 `grep -rn "@Controller"`（对 `reviewed_head` tree 下所有 controller 文件）核对结果：`auth`（`AuthController`）、`api/commission-batches`（`CommissionBatchController`）、`api/commission-batches/:batchId/imports`（`ImportController`）、`api/commission-batches/:batchId/policy-records`（`PolicyRecordQueryController`）、`api/policy-records`（`PolicyRecordController`）——5 个前缀字面量互不相同，无冲突、无遮蔽（BE-LAYER-02 通过）。`frontend/src/api/policy-record.ts:32` 的 `fetchPolicyRecordPage` 已同步改为 `/api/policy-records`；全局 `grep -rn "policy-records" frontend/src` 复核，除该文件外只有 `frontend/src/router/index.ts` 的两处命中，均为**前端路由路径**（`redirect: '/policy-records'`、`path: 'policy-records'`），与后端 HTTP 接口地址无关，不存在遗漏的旧路径硬编码调用点。

**6. operator 身份来源**：`policy-record.controller.ts:extractOperator` 从 `request.user.username` 取值。独立读取 `backend/src/common/guards/jwt-auth.guard.ts`：JWT 校验通过后 `(request as Request & { user?: unknown }).user = payload`；独立读取 `backend/src/auth/auth.service.ts:login`：签发 JWT 时 `this.jwtService.signAsync({ sub: adminUsername, username: adminUsername })`——payload 确实携带 `username` 字段。e2e 用例 `golden` 断言 `logsRes.body.data` 含 `operator: 'e2e-admin'`（等于 `jest-e2e.setup.ts` 里设置的 `ADMIN_USERNAME`），独立重跑通过，证实该字段确实存在且被正确填充，不是仅凭执行者转述采信。

**7. 运行时注释点名任务号**：见 F002。

**8. keyword OR + batchId/fillStatus AND 组合正确性**：`findPage` 用 `KEYWORD_FIELDS.map((field) => ({ ...baseWhere, [field]: Like(...) }))` 生成 `FindOptionsWhere[]` 数组（TypeORM 对数组 where 的语义是数组元素间 OR、单个元素内属性间 AND），`baseWhere` 已包含 `importBatchId`（及 `fillStatus` 存在时的 `salesFillSource`），被 spread 进每个数组元素——即 SQL 语义为 `(batchId=X AND fillStatus=Y AND field1 LIKE kw) OR (batchId=X AND fillStatus=Y AND field2 LIKE kw) OR (batchId=X AND fillStatus=Y AND field3 LIKE kw)`，AND/OR 优先级正确，不会过度匹配或漏匹配。独立写探针 e2e（4 条记录覆盖"同批次+错误状态+关键词命中" "同批次+正确状态+关键词不命中" "同批次+正确状态+关键词命中" "跨批次+正确状态+关键词命中"四种组合），验证只有目标一条被返回——反例通过。**唯一遗留点**：执行者自带的 e2e 用例里 `keyword` 与 `fillStatus` 两个筛选条件均只有各自独立测试（`keyword 对工作单号/保单号/客户名称三字段 OR 模糊匹配`、`fillStatus 按 sales_fill_source 精确过滤`），未有一条用例同时传两个参数验证组合，是 test-evidence 上的一个小覆盖缺口（代码本身经独立探针验证是正确的，非行为缺陷）——见 F003。

## Findings

```yaml
findings:
  - id: ic-v1-004-F001
    dimension: scope-and-secrets
    severity: advisory
    type: scope-gap
    reachability: current
    evidence: "backend/src/policy-record/policy-record.module.ts 的 `TypeOrmModule.forFeature` 数组新增 SalesFillLog 注册，不在任务包 files: 清单内，且据派发者说明执行者返回结构的 deviations 字段未提及此文件（只在 changed-files 列表带一行内联注释）；技术必要性已独立验证：隔离 worktree 中还原该行为 [PolicyRecord]，policy-record.e2e-spec 12/12 因 UnknownDependenciesException（PolicyRecordService 第 2 参数 SalesFillLogRepository 无法解析）全部失败，恢复后 12/12 全绿；且无更小范围替代方案（SalesFillLog 仅被归属 PolicyRecordModule 的 PolicyRecordService 消费，注册点只能在该 module）"
    impact: "改动本身安全、必要、无副作用；唯一问题是可追溯性——files 清单外的改动缺少 deviations 正式声明，审查只能靠独立复现事后补证，如果换一个风险等级更低、未被独立复审的任务包，这类未声明的越界改动可能长期不被发现"
    action: backlog
    status: verified-closed
  - id: ic-v1-004-F002
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: "backend/src/commission-batch/commission-batch.module.ts:16,18 运行时注释原文：「controllers/providers 用数组形式声明：ic-v1-003、ic-v1-004 各自在本文件追加自己的 Controller/Service 注册...不覆盖 ic-v1-002 已注册的 CommissionBatch 相关项」——同时点名三个任务号；backend/test/policy-record.e2e-spec.ts:12 测试文件顶部注释「本期（ic-v1-004）Controller 路径由 policy-records 改为 api/policy-records」——点名任务号。与 ic-v1-001-F003（首次判定）、ic-v1-002-F002（第二次重现）、ic-v1-003-F001（第三次重现，同一 commission-batch.module.ts 文件）属同一违规模式的第四次重现，且 commission-batch.module.ts 上的点名数量从 2 个任务号累积到 3 个"
    impact: "不影响当前行为；同根问题连续四个任务包复现，逐任务零星记 advisory 已不能阻止模式持续，长期可维护性损耗（读者需查 sprint.md 理解任务号含义）"
    action: backlog
    status: open
  - id: ic-v1-004-F003
    dimension: test-evidence
    severity: advisory
    type: contract-drift
    reachability: unreachable
    evidence: "commission-batch-policy-records.e2e-spec.ts 对 keyword 与 fillStatus 两个筛选参数只有各自独立的测试用例，没有一条用例同时传两者验证 AND/OR 组合优先级；本轮独立补写探针 e2e（4 条记录覆盖交叉组合）验证代码本身语义正确（batchId/fillStatus 作为 AND 前缀正确 spread 进 keyword 的每个 OR 分支），代码层面无缺陷"
    impact: "当前代码正确，探针已证实；风险在于未来若有人重构 findPage 的 where 构造逻辑，回归测试套件不会捕获 keyword+fillStatus 组合被意外破坏的情况（例如错把 AND 换成 OR）"
    action: backlog
    status: verified-closed
```

- `contract`：无发现。AC-05~AC-09 及"技术"条目共 6 条 oracle，逐条对照 `commission-batch-policy-records.e2e-spec.ts`（14 用例）与 `policy-record.e2e-spec.ts`（12 用例，含 golden 用例）均有对应测试且独立重跑全绿；example 与 oracle 无冲突。golden（AC-08）已逐字核对（见上节 2）。
- `scope-and-secrets`：见 F001。其余改动文件与 profile `changed_files` 逐一比对一致，无隐藏改动；diff 内无明文密钥/token/密码（`.env.example` 新增的 `SALES_FILL_API_URL=` 留空，符合"本期留空"约定）；do-not 三项（不支持批量补录/不做真实第三方联调/不做批次CRUD或Excel导入）均未被触碰——`PATCH :id/sales-name` 路径参数只接受单个 id，无批量入口；`callFillApi` 全部走 mock，未接入真实地址；本任务未修改 `commission-batch.controller.ts`/`.service.ts`/`import.*`。
- `test-evidence`：见 F003；其余无发现。`tsc --noEmit`、`lint`、`policy-record.e2e-spec`（12/12）、`commission-batch-policy-records.e2e-spec`（14/14）、全量 `test:e2e`（50/50）均独立重跑通过；前端 `vue-tsc -b` 通过。
- `comment-hygiene`：见 F002。
- `standards`：
  - BE-LAYER-01：`PolicyRecordQueryController`/`PolicyRecordController` 均只做参数接收转发，业务逻辑全在对应 Service，未见 Controller 直接操作 Repository——符合。
  - BE-LAYER-02：见上节「5. 路径变更影响面」，全局核对无冲突。
  - BE-VALID-01：`QueryPolicyRecordDto`（`keyword` `@IsOptional`+`@IsString`；`fillStatus` `@IsOptional`+`@IsIn(FILL_STATUS_VALUES)`）、`UpdateSalesNameDto`（`salesName` `@IsNotEmpty`+`@IsString`）均有完整装饰器，无漏装饰器字段。
  - BE-DB-03：本任务未新增/修改 Entity 引发表结构变更（`SalesFillLog`/`policy_record` V1 扩展字段均由 ic-v1-001 迁移交付），不适用新增 migration 义务，未违反。
  - BE-EXT-01：见上节「3」，符合。
  - BE-LOG-01：见上节「4」，符合。
  - SH-API-01：两个 Controller 均未手动包装响应，交由全局 `SuccessInterceptor`；e2e 断言 `{code, msg, data}` 信封结构。
  - SH-API-02：`NotFoundException`→404→1004、`ValidationPipe`→400→1001 均由 e2e 验证命中正确错误码；回填接口按 oracle 明确要求"不返回错误码"，全部走 200，未误用 2001（该码用于其他场景的第三方查询失败，本接口 oracle 已显式覆盖为"不报错"语义，不构成冲突）。
  - SH-AUTH-01：两个新 Controller 均未标 `@Public()`，走全局 Guard 默认受保护；e2e 对 4 个新/改路由均有"未登录 401/1002"用例并独立验证通过。
  - 无其他发现。
- `enforcement`：无发现。新增 e2e 对 4 个接口（含回填三条防御分支）的正反例均有区分度，且经独立 spy 验证防御分支确实被驱动到（非伪装通过）。
- `input-provenance`：
  - DTO 1：`backend/src/commission-batch/dto/query-policy-record.dto.ts` class `QueryPolicyRecordDto`（继承 `PageQueryDto`），字段数 N=4（含继承的 2 个）
    - `page` | `policy-record-query.service.ts:49 const { page, ... } = query` 用于 `skip` 计算（`:71`）与 `PageResultDto` 回填（`:75`） | 否，未覆盖，原样使用 | 正常
    - `pageSize` | 同上 `:49/:72/:75` | 否 | 正常
    - `keyword` | `policy-record-query.service.ts:49,62` 用于构造 `KEYWORD_FIELDS.map` 的 OR Like 条件 | 否 | 正常
    - `fillStatus` | `policy-record-query.service.ts:49,54 baseWhere.salesFillSource = fillStatus` | 否 | 正常
  - DTO 2：`backend/src/policy-record/dto/update-sales-name.dto.ts` class `UpdateSalesNameDto`，字段数 N=1
    - `salesName` | `policy-record.service.ts:61 record.salesName = dto.salesName`；同时用于日志 `newValue`（`:72`） | 否，未覆盖，原样写入；`salesFillSource='manual'`/`operator`/`changedAt`/`oldValue` 均为服务端设置的非-DTO 字段，不在本表枚举范围 | 正常
  - 覆盖率自证：2 个 DTO 文件，共 5 个可提交字段（N=4+1=5），本表共 5 行，行数=N，枚举完成。全部结论为「正常」，无 finding。
- `query-performance`：无发现。`findPage` 用 `findAndCount` 一次查询完成过滤+分页；`fill` 用一次 `find()` 取全部待处理记录、一次批量 `save(toSave)` 写回，第三方接口调用为单次批量请求（`workOrderNos` 数组一次性传入），无逐条循环调用第三方接口的 N+1 风险。
- `concurrency`：无阻断发现。`updateSalesName` 的"读旧值→更新→插日志"在同一事务内，但未对目标行加悲观锁（无 `SELECT ... FOR UPDATE`）——若同一保单记录被并发 PATCH，两次事务各自读到相同旧值、各自提交，最终 `salesName` 以后提交事务为准（最终状态一致，无数据损坏），但两条日志的 `oldValue` 可能都记录同一个"旧"值而非真实的链式变更序列。鉴于 SH-AUTH-01 明确"单一管理员角色，无角色分层"（系统级只有一个管理员账号），同一账号对同一条记录的并发双击/多标签页竞争概率低，且任务包 do-not/oracle 均未要求加锁；`fill` 批量回填内部对 `unmatchedRecords` 只做一次读、一次批量写，无循环查询产生的并发放大问题。判定不构成阻断，未列 finding（若后续多管理员/多角色场景引入，需重新评估）。
- `logging-privacy`：无发现。日志内容仅含第三方接口 URL（配置项，非用户凭证）、HTTP 状态码、错误 reason/stack，未见 PII、密码、token 或完整请求体写入日志。
- `maintainability`：无发现。`PolicyRecordQueryService`/`PolicyRecordService` 的分页写法与既有 `commission-batch.service.ts`（ic-v1-002）风格一致，未重造已有分页/仓储机制；`PolicyRecordQueryController` 独立文件的做法与 `import.controller.ts`（ic-v1-003）一致，理由在注释中说明（避免同文件并行编辑冲突），未引入不必要复杂度。
- `sensitive-boundaries`：见上节「本轮重点核查结论」1/2/6，以及 F001。人工补录允许覆盖 system/manual 记录并改变下游提成归属——已在任务包 known-risks 明确记为产品预期行为而非 bug，本次 diff 未额外收窄或放宽该边界（补录接口本身确未做"是否已参与过导出"之类的限制，与 known-risks 描述一致）；无权限分层变更、无不可逆删除操作。

## 处理说明

- F001：核实结论已写入本报告「本轮重点核查结论」第 1 条，判定越界改动技术必要且已验证安全，问题在于 `deviations` 未声明——记入项目根 `backlog.md`（[欠账]），建议：① 把 `policy-record.module.ts` 补录进 `iterations/v1/queue/ic-v1-004.md` 的 `files:` 清单以对齐实际改动范围；② 下一轮 develop 会话对执行者重申"files 清单外的必要改动必须在 deviations 字段正式声明，不能只留内联注释"。不阻塞本次合并。
- F002：记入 `backlog.md`（[欠账]），与 ic-v1-001-F003、ic-v1-002-F002、ic-v1-003-F001 同根，已连续四个任务包复现——建议下一轮 develop 会话启动前在会话内对执行者重申约定，作为流程性提醒而非继续逐任务零星记 advisory。不阻塞本次合并。
- F003：记入 `backlog.md`（[欠账]），建议后续为 `commission-batch-policy-records.e2e-spec.ts` 补一条 keyword+fillStatus 组合用例（本轮探针已验证代码正确，纯粹是测试覆盖面建议）。不阻塞本次合并。
- 无 `fix-code`/`fix-mechanism` 级阻断 finding，`conclusion: pass`，进入末端。
