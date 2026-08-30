---
task_id: ic-b-014
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-014/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: d9b0f7220bca1452c3bfd65ffb1070d8a057f55f
reviewed_base: 79cad27c294d969c0c3ab6396b0ff8c9523a092b
reviewed_head: a83176fe55f1eeb397874799ef90d76a722b9207
diff_sha256: 1d45c36c09a70bc58cd6dd1c6dd62b51578a5f241c638673cb0ec4b9270317ea
changed_files:
  - backend/src/migrations/1788080880239-AddFieldNameToSalesFillLog.ts
  - backend/src/policy-record/dto/update-work-order-no.dto.ts
  - backend/src/policy-record/policy-record.controller.ts
  - backend/src/policy-record/policy-record.service.ts
  - backend/src/policy-record/sales-fill-log.entity.ts
  - backend/test/policy-record.e2e-spec.ts
  - frontend/src/api/policy-record.ts
  - frontend/src/components/PolicyRecordHistoryDrawer.vue
  - frontend/src/components/PolicyRecordTable.vue
started_at: 2026-08-30T09:13:24Z
completed_at: 2026-08-30T09:22:32Z
elapsed_minutes: 10
escalate_to_full: false
conclusion: revise
---

## 本轮范围

```yaml
counterexamples:
  - "两个近乎并发的 PATCH 请求命中同一条 policy_record（工作单号勾选重置 + 销售人员补录），
     后提交的重置事务基于陈旧读取值把刚提交的销售人员改动静默覆盖回 null/unmatched，
     且 sales_fill_log 里销售人员那条改动日志与最终行状态不一致（见 ic-b-014-F001）"
affected_regressions: []
changed_surface_allowed:
  - backend/src/migrations/1788080880239-AddFieldNameToSalesFillLog.ts
  - backend/src/policy-record/dto/update-work-order-no.dto.ts
  - backend/src/policy-record/policy-record.controller.ts
  - backend/src/policy-record/policy-record.service.ts
  - backend/src/policy-record/sales-fill-log.entity.ts
  - backend/test/policy-record.e2e-spec.ts
  - frontend/src/api/policy-record.ts
  - frontend/src/components/PolicyRecordHistoryDrawer.vue
  - frontend/src/components/PolicyRecordTable.vue
```

`git diff 79cad27c294d969c0c3ab6396b0ff8c9523a092b a83176fe55f1eeb397874799ef90d76a722b9207` 的 sha256 已核对与派发者给定值一致；实际变更文件集合与任务包 `files` 声明的 9 个文件逐一对应，无越界改动，无未声明的漂移文件。

## 维度逐项结论

**contract**：`updateWorkOrderNo()` 单次调用下的行为与 oracle 逐句核对一致——事务内先读旧值→更新 `workOrderNo`→写一条 `fieldName='workOrderNo'` 日志→`resetFillStatus===true` 且更新前 `salesFillSource!=='unmatched'` 时才连带清空 `salesName`/`salesFillSource`；`resetFillStatus` 判断读取的是 mutate 前捕获的 `wasUnmatched`（`sales-record.service.ts:103`），不是已被本次更新改写后的值，条件本身没有写反。响应体、`GET .../sales-fill-logs` 返回形状均与任务包 `api-contract` 一致（`fieldName`/`oldValue`/`newValue`/`operator`/`changedAt` 齐全）。局部更新（不整表刷新）、复用既有 `sales-name-changed` 事件（未发明新事件名）均确认成立。单请求维度无发现；跨请求并发维度见 concurrency 维度的阻断项。

**scope-and-secrets**：`do-not` 四条边界逐条核实：① `updateSalesName()` 除显式传 `fieldName:'salesName'` 外无其他行为改动（对比新增前后 diff，只多了一行）；② `UpdateWorkOrderNoDto` 用 `@IsNotEmpty()+@IsString()`，e2e 用例验证空字符串触发 1001；③ 改动文件集合与任务包 `files` 完全对应，无越界；④ `updateWorkOrderNo()` 事务体内只有一处 `manager.save(SalesFillLog, ...)` 调用（`policy-record.service.ts:111-120`），reset 分支和非 reset 分支共享同一条日志写入路径，物理上不可能产生第二条日志——do-not 边界未被触破。diff 中未发现明文密钥/token/密码。无发现。

**test-evidence**：新增 6 个 work-order-no 端点 e2e 用例（不勾选/勾选重置+已回填/空值 1001/已 unmatched 时勾选重置为 no-op/记录不存在 1004/未登录 401）+ 2 个历史查询用例（纯 salesName 历史标注 fieldName、混合历史按 changedAt 倒序）。均为有辨别力断言（精确匹配响应体字段与日志条数），非泛泛的状态码断言。实测运行：`policy-record.e2e-spec.ts` 单测 42/42 通过；backend 全量单测 56/56、全量 e2e 6 套 116/116 均通过（含 commission-batch-policy-records/commission-tier/commission-report 等触碰 `PolicyRecord`/日志相关实体的套件，未见回归）。无发现。

**comment-hygiene**：新增/改动注释未出现任务号/迭代号（已 grep 全部改动文件确认无 `ic-b-014`/`IC-B-014` 字样）；"本任务"是描述性用语非任务编号，符合豁免。未发现新增"不得/禁止 X"式注释缺成立前提的情况（新增注释均是"为什么这样做"的说明句，非新增强制声明）。无发现。

**standards（BE-DB-03）**：迁移文件 `up()` 用单条 `queryRunner.addColumn` 加 `field_name varchar(16) NOT NULL DEFAULT 'salesName'`，未依赖 `synchronize:true`，是正式落库的 migration；`down()` 对称 `dropColumn`。已在真实 MySQL（开发库 `insurance_commission`）验证：`SHOW COLUMNS` 确认列存在且默认值生效，`migrations` 表含该条记录，唯一历史行已正确回填 `field_name='salesName'`；另在全新建库 `ic_b014_race_check` 上从零跑通全部 3 个迁移（含本迁移）无报错，交叉印证迁移本身与既有迁移链兼容、非只在"已手工修过"的库上侥幸成功。无发现。

**enforcement**：本任务未新增规则/检查器/CI 门禁类基础设施（DTO 校验走的是既有全局 `ValidationPipe(whitelist+forbidNonWhitelisted+transform)` 管道，非本任务新增机制），无相关改动面可核。无发现。

**design-fidelity**：新增的"工作单号"输入框/保存按钮/勾选项在模板结构上与既有"销售人员"字段 1:1 复用同一 `policy-record-table__field` 布局类、同一 `el-input`/`el-button type="primary" size="small"` 规格，未新增任何自定义样式规则（本次 diff 未触碰 `<style>` 块）。`design.md` 未对 checkbox 有专门规格约束，沿用 Element Plus 默认样式与既有页面其他控件间距（`gap: $space-md`）一致。历史抽屉的字段标签泛化（`FIELD_NAME_LABEL`）只替换文案来源，未改动既有视觉结构。无发现。

**input-provenance**：DTO 文件 `backend/src/policy-record/dto/update-work-order-no.dto.ts`，class `UpdateWorkOrderNoDto`，可提交字段数 N=2，本表行数=2（覆盖率满足 N=2）。

| 字段名 | service 消费位置 | 是否被覆盖 | 结论 |
|---|---|---|---|
| `workOrderNo` | `policy-record.service.ts:104`（`record.workOrderNo = dto.workOrderNo`）+ `:117`（写入日志 `newValue`） | 否，直接采用前端提交值 | 正常 |
| `resetFillStatus` | `policy-record.service.ts:105`（`if (dto.resetFillStatus && !wasUnmatched)` 条件消费） | 否，条件消费 | 正常 |

无发现。

**query-performance**：`updateWorkOrderNo()` 每次调用固定 1 次 `findOne` + 1 次 `save`（record）+ 1 次 `save`（log），无循环查询、无 N+1、无分页后补查。`findSalesFillLogs()` 沿用既有单次 `find` 查询模式，未引入新的查询面。无发现。

**concurrency**：见下方 Findings，**阻断项 ic-b-014-F001**。

**logging-privacy**：本次改动未新增任何 `Logger`/`console` 输出，不涉及生产日志面。无发现。

**maintainability**：`updateWorkOrderNo()` 与 `updateSalesName()` 的"读旧值→更新→写一条日志"事务结构高度相似（重复度中等），但任务包 `reference` 明确要求"参照同一结构"，且该结构在代码库里已是 `updateSalesName()` 的既定写法（未被判定为需要抽公共 helper 的规模，两处均 <20 行，字段语义不同）。未发现重造已有 service/工具/类型的情况（`SalesFillLogFieldName` 类型被复用于 controller/service/前端接口层，未重复定义）。不判定为阻断级问题，不强行要求抽象化（会与任务本身"只处理已明确的两类字段，不做面向未知字段的抽象设计"的 known-risks 声明相悖）。无发现。

**sensitive-boundaries**：本维度因元数据不完整被 profile 兜底选中；未发现该维度下独立于 concurrency 的新反例。concurrency 维度构造的反例（ic-b-014-F001）恰好命中"影响下游提成归属计算"这一敏感面（`salesFillSource`/`salesName` 是提成归属的直接依据），已计入该 finding，不在本维度重复计一条新 id。

## Findings

```yaml
findings:
  - id: ic-b-014-F001
    dimension: concurrency
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: |
      `updateSalesName()`（backend/src/policy-record/policy-record.service.ts:51-82）与
      `updateWorkOrderNo()`（同文件:91-124）各自开独立事务，读同一条 PolicyRecord 后局部
      mutate 再 `manager.save(record)`。当二者对同一条记录近乎同时发起（前端两个保存按钮
      互不禁用对方，UI 层面无锁：frontend/src/components/PolicyRecordTable.vue 里
      `savingId`/`savingWorkOrderNoId` 只各自控制自己按钮的 loading 态，不互斥另一个按钮的
      可点击性），且 workOrderNo 一侧勾选了"同时清空原销售人员回填结果"时：

      若 updateWorkOrderNo 的读发生在 updateSalesName 提交之前（读到 wasUnmatched=false，
      因为此刻记录仍是 system/manual 状态），但其自身的 save 提交发生在 updateSalesName
      提交之后，则 updateWorkOrderNo 内被显式赋值为 `null`/`'unmatched'` 的 salesName/
      salesFillSource 会作为该事务自身"相对于其读取快照的真实改动"被写回，直接覆盖掉
      updateSalesName 已经提交的新销售人员值——即便这个新值是在 updateWorkOrderNo 读取
      之后才产生的。

      已用真实 MySQL + 未修改的 PolicyRecordService 源码复现（临时脚本，仅在独立建的
      scratch 库 ic_b014_race_check 上执行，未触碰任何任务包声明之外的文件，复现完毕已
      DROP DATABASE 清理，未在开发库 insurance_commission 留任何痕迹——已重新查询
      insurance_commission.sales_fill_log 确认仍只有实现方留下的那 1 行）：
        1. 记录初始 salesFillSource='system'，salesName='张三'。
        2. Tx B = updateWorkOrderNo({workOrderNo:'WO-RACE2-02', resetFillStatus:true})
           先发起，读取完成后人为暂停（模拟并发窗口，未改动方法体本身逻辑，只在
           dataSource.transaction 外层包一层可控延迟）。
        3. 50ms 后 Tx A = updateSalesName({salesName:'李四(纠正)'}) 发起并立即跑完提交。
        4. Tx B 恢复并提交。
        5. 最终行状态：salesName=null, salesFillSource='unmatched', workOrderNo=
           'WO-RACE2-02'——Tx A 提交的"李四(纠正)"被静默吞掉。
        6. sales_fill_log 里仍然躺着一条 `fieldName='salesName', oldValue='张三',
           newValue='李四(纠正)'` 的"成功"日志，与最终行状态（null）自相矛盾——
           操作人打开"查看修改历史"会看到一条看似生效的销售人员变更，但实际字段值
           已经是空，历史记录本身失去可信度。
    impact: |
      当前可观察后果：(a) 一次刚提交的人工销售人员补录/修改可能被同一时刻的工作单号
      重置操作静默覆盖为 unmatched/null，操作人不会收到任何错误提示（两个 PATCH 各自
      返回 200，各自的响应体对自己那次请求而言都是"正确"的）；(b) `sales_fill_log`
      表出现与当前行状态矛盾的历史记录，破坏"查看修改历史"作为审计留痕的可信度；
      (c) known-risks 里已明确指出 salesFillSource/salesName 是"下游提成归属计算"的
      直接依据，这类静默覆盖会导致提成报表把本该算给某销售的保单错误算作未匹配。
      不要求两个恶意用户协作，一个操作员先后快速点击"保存"（销售人员）和"保存"
      （工作单号，勾选重置）两个按钮、中间网络延迟造成请求乱序完成即可触发，是
      现有 UI 交互结构下的常规可达路径，不是刻意构造的极端场景。
    action: fix-code
    status: open
```

## 说明

- 本轮 `full`，按 profile 的全部 13 个 selected_dimensions 逐项执行，未省略任何维度，未对已选维度输出 N/A。
- 除 concurrency 维度的 F001 外，其余 12 个维度均无发现（含 core 四项）。
- 建议修复方向（仅供实现方参考，非本报告强制指定手段）：`updateWorkOrderNo()` 与 `updateSalesName()` 在决定是否改写 salesName/salesFillSource 前，应基于同一事务内、写入前的"新鲜读取"（例如把 `wasUnmatched` 的判定放到即将写入前再读一次，或用乐观锁/`SELECT ... FOR UPDATE` 保证读-判断-写在同一原子窗口内完成），而不是仅凭事务开始时的一次性读取来决定分支；两个端点若要长期共存，也可以考虑让二者对同一记录的写互斥（行级锁）。
