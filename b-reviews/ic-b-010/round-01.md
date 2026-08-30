<!-- develop 独立证据审查逐轮报告模板；首次 full，整改后默认 targeted。 -->
---
task_id: ic-b-010
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-010/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 31dd7a00e0c10bc331006f56df01ea2e61680693
reviewed_base: 8942004c4914dec21b4f86a9a5ef7f4bfaedca48
reviewed_head: 4d72909081dcdeeee1f1f2b58e72119e881ed7b4
diff_sha256: e1658b4cc895eaac7b9198ff8767a3195672d7fdbaf208be97dd31fb4abed542
changed_files:
  - backend/src/commission-batch/commission-batch.entity.spec.ts
  - backend/src/commission-batch/import-file.entity.ts
  - backend/src/commission-batch/import.service.ts
  - backend/src/migrations/1788074308866-AddFailReasonsToImportFile.ts
  - backend/test/commission-batch-import.e2e-spec.ts
  - frontend/src/api/commission-batch.ts
  - frontend/src/components/ImportPanel.vue
started_at: 2026-08-30T07:22:10Z
completed_at: 2026-08-30T07:31:00Z
elapsed_minutes: 9
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "backend/src/commission-batch/commission-batch.entity.spec.ts 中删去手写 CREATE TABLE 里的 fail_reasons 列后，重跑 jest 单测：ImportFile.batchId 用例即报 SqliteError: table import_file has no column named fail_reasons — 证实该越 files 清单的改动是真实必要的最小修复，非附带夹带"
  - "backend/src/commission-batch/import.service.ts 中临时删去 importExcel() 内 failReasons 的持久化赋值后，重跑 e2e：commission-batch-import.e2e-spec.ts 中 “该行计入 failRows” 用例即失败（listedItem.failReasons 为 [] 而非预期 2 条），证实新增的 round-trip 断言有真实辨别力"
  - "临时把 toFailReasonsDto() 改成直接 `return raw as ImportFailRowDto[]`（去掉类型守卫）后重跑 e2e：“历史记录 fail_reasons 为 null …降级为空数组” 用例即失败（收到 null 而非 []），证实 BE-JSON-01 类型守卫分支本身是有效且被测试覆盖的"
affected_regressions: []
changed_surface_allowed:
  - backend/src/commission-batch/commission-batch.entity.spec.ts
  - backend/src/commission-batch/import-file.entity.ts
  - backend/src/commission-batch/import.service.ts
  - backend/src/migrations/1788074308866-AddFailReasonsToImportFile.ts
  - backend/test/commission-batch-import.e2e-spec.ts
  - frontend/src/api/commission-batch.ts
  - frontend/src/components/ImportPanel.vue
```

- `full`：按 `review_profile.selected_dimensions` 执行 `develop-review.md` 对应 id；omitted 不输出 N/A。profile 缺失/不闭合即停止。

## 方法论纪要

- diff 哈希核对：`git diff 8942004…4d72909…` 通过 sha256sum 得 `e1658b4c…4abed542`，与派发值逐字一致，确认审查对象无误。
- `git status --porcelain -uall` 核对：暂存区改动 = 上述 7 个文件，与 profile `changed_files` 完全一致；未见清单外改动或额外未纳入 diff 的漂移。
- 实测执行：`backend` `npm run build`（通过）、`npm run lint`（`--fix` 后 `git status` 无新增改动，确认已是干净状态）、`npx jest`（56/56 通过）、`npx jest --config test/jest-e2e.json`（106/106 全量 e2e 通过，含新增 3 条 ic-b-010 用例）；`frontend` `npm run build`（vue-tsc + vite 通过）、`npm run lint:check`（通过）、`npm run stylelint:check`（通过）。
- 对三处关键行为做了「反向破坏再验证」（见上方 counterexamples）：确认（a）commission-batch.entity.spec.ts 的越界改动确有必要、（b）持久化-回读 round-trip 断言、（c）BE-JSON-01 null 分支断言均有真实反例杀伤力，不是摆设/rubber-stamp。

## 维度逐项结论

**1. contract**：无发现。intent 三点（可查看完整清单/历史记录无入口/其余字段不变）均已实现并被 e2e 验证；oracle 五条逐条核对：JSON 列已加（migration+entity）、`importExcel()` 写入的 `failReasons` 与响应体 `failRows` 同源同次 `parseResult.failRows`（未重新解析，见 `import.service.ts:136-141` 与 `:173-176` 均取自同一个 `failRows` 变量）、`listImports()` 新增 `failReasons` 字段且 null 时降级为 `[]`（e2e 实测验证）、前端仅在 `failCount>0 && failReasons.length` 时可点击（`ImportPanel.vue:27`）、既有 6 个响应字段值/类型未变（diff 中原字段行未改动，且全量 106 个既有 e2e 用例无一因此改动受影响）。`example` 为 `golden:false`，不要求字面 1:1，e2e 用例覆盖的是同一机制的不同取值，符合口径。

**2. scope-and-secrets**：无发现。`do-not` 四条边界核对：未改动 `excelParser`/逐行容错规则（`ExcelParser` 未在 changed_files 中）；未改动 `#import-result` 即时弹窗展示逻辑/触发时机（diff 未触及该 `<div id="import-result">` 块）；未改动 `deleteImport()` 级联删除逻辑（diff 未触及该方法）；既有响应字段值/类型未变（见上）。改动文件集合与 profile `changed_files` 逐字一致，无清单外改动。`commission-batch.entity.spec.ts` 虽在任务包原始 `files` 清单外，但已用反向删除实测证实是必要的最小修复（见上方 counterexamples 第一条），非夹带。未见明文密钥/凭证。

**3. test-evidence**：1 条建议级发现（见下 F002）。核心路径（持久化-回读 round-trip、null 历史记录降级）均有真实反例杀伤力的 e2e 断言（已用反向破坏实测验证，见方法论纪要）；`toFailReasonsDto()`/`isImportFailRow()` 的 null 分支被测试覆盖，但"非 null 但结构不合法"（如非数组、或数组内元素 `row`/`reason` 类型不对）这一分支只有代码层面的静态实现（已读代码确认逻辑正确），未见对应的专项测试用例断言其行为——按 F002 记为建议级。

**4. comment-hygiene**：1 条建议级发现（见下 F001）。新增注释未见"不得/禁止 X"缺前提的写法；但 4 处新增运行时注释把任务号 `ic-b-010` 写入了生产代码/测试代码注释本体（而非留在 git/decisions），按规范属于建议级问题。

**5. standards**：无发现（BE-DB-03、BE-JSON-01 均逐条核实通过，见下方专项说明）。

**6. enforcement**：无发现。本次改动未新增/修改任何规则检查器、机械化 enforcement 或测试基础设施本身；两条命中的 Standards（BE-DB-03/BE-JSON-01）均为"人审级"，enforcement 手段就是本轮 code-review，无额外机制需要核查覆盖面。

**7. design-fidelity**：无发现。新 dialog（`#modal-fail-reasons`）复用既有 `.import-panel__fail-list` class（继承 `$color-danger`/`$fs-small` token，未新增硬编码视觉字面量）；`:width="dialogWidth"` + `align-center` 与既有 `#modal-import` 一致，符合 `design.md` 移动端弹窗 95vw + align-center 的要求（design.md:168）。该交互（历史列表失败数字可点击）是本任务通过两轮 AskUserQuestion 新确认的交互，`iterations/v1/prototype.html` 未覆盖此路径（在其编写时间点该功能尚不存在），无可比对基线，不构成不一致。

**8. input-provenance**：无发现，不适用。本次改动的唯一相关接口 `GET /api/commission-batches/:id/imports` 无请求体、无可提交查询参数（`api-contract.request: {}`），diff 中也未新增/修改任何带 `@Is*` 校验装饰的请求 DTO class。DTO 文件：无；字段数 N=0；本表行数=0，穷举完毕。

**9. query-performance**：无发现。`listImports()` 内新增的 `toFailReasonsDto(item.failReasons)` 是对已从同一次 `find()` 查询取回的实体字段做纯同步 JS 计算，不产生额外查询，不构成 N+1；唯一的每条记录异步调用（`ossClient.getSignedUrl`）是本次改动之前就存在的既有模式，未被本次改动放大。

**10. concurrency**：无发现。`failReasons` 的写入落在 `importExcel()` 既有的 `dataSource.transaction()` 内，与 `ImportFile` 行本身的 insert 同一事务、同一原子性边界，不存在新的部分失败窗口；该列无唯一约束，不引入新的并发冲突面。

**11. logging-privacy**：无发现。未新增任何把 `failReasons`/`fail_reasons` 内容写入日志的代码；既有的 `logger.warn`（解析失败场景）未被本次改动触及或放大记录内容。

**12. maintainability**：1 条建议级发现（见下 F003）。

**13. sensitive-boundaries**：无发现。本次改动不涉及权限/认证/数据隔离变更，不涉及金额/计费，不新增不可逆外部副作用；既有的硬删除级联行为（`deleteImport()`）未被触及。`effective_risk: standard` 与改动实际内容相符。

## Standards 专项核实（BE-DB-03 / BE-JSON-01）

- **BE-DB-03**：`applies-if` 命中（新增 `fail_reasons` 列）。`up()` 用 `queryRunner.addColumn(...)`、`down()` 用 `queryRunner.dropColumn(...)`；已读 `node_modules/typeorm/driver/mysql/MysqlQueryRunner.js` 源码确认这两个 API 在 MySQL 驱动下均有原生实现（`addColumn` 生成 `ALTER TABLE … ADD …`，`dropColumn` 生成 `ALTER TABLE … DROP COLUMN …`），与 ic-b-003 那次踩坑的 `createUniqueConstraint()`（MySQL 驱动不支持）是完全不同类别的 API——`addColumn`/`dropColumn` 是标准可移植操作，无索引/外键/唯一约束等需要额外镜像的副作用，`down()` 确实是 `up()` 的干净镜像。本环境无可用 Docker/真实 MySQL（`docker` 命令在本 WSL 发行版不可用），未能像 ic-b-003 那样做真实 MySQL 实测；但基于源码级别的静态核实，未发现该 migration 存在类似 ic-b-003 的机制性缺陷，不构成 blocking evidence-gap（`risk: standard`，未发现可达反例）。生产路径 `typeorm.config.ts` 确认 `synchronize: false` 且未设 `migrationsRun`，未违反"禁止只依赖 synchronize"。
- **BE-JSON-01**：`applies-if` 命中（读取 `ImportFile.failReasons` JSON 列）。`isImportFailRow()`/`toFailReasonsDto()` 对 `null`、非数组、数组内元素结构不对三类异常均降级为 `[]`，不透传给前端；已用反向删除类型守卫代码的方式实测确认该守卫是必要且生效的（见方法论纪要第三条反例）。Entity 侧 `failReasons: unknown`（非声明为 `ImportFailRowDto[]`），未制造编译时假安全感，符合规范强调的"不得只依赖编译时类型"。

## Findings

```yaml
findings:
  - id: ic-b-010-F001
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      本次新增的运行时注释里把任务号 ic-b-010 写入了生产/测试代码本体（而非留在 git 提交信息或
      decisions 记录）：backend/src/commission-batch/import-file.entity.ts:43（"失败行清单
      {row, reason}[]（ic-b-010，可空 JSON 列..."）、
      backend/src/commission-batch/import.service.ts:137（"（ic-b-010，任务包 do-not：..."）、
      backend/src/migrations/1788074308866-AddFailReasonsToImportFile.ts:5（"（ic-b-010，
      BE-DB-03；..."）、frontend/src/components/ImportPanel.vue:209（"（ic-b-010，与即时上传
      弹窗..."）。对照本仓已有代码：backend/src/migrations/1787735505276-...ts 同类历史 migration
      的头部注释未写任务号；仅 test/commission-report.e2e-spec.ts:357 有一处历史先例
      （"ic-b-001 起..."）把任务号写进测试注释，说明这不是本仓生产代码的既有惯例。
    impact: >
      不影响当前行为正确性；随着任务号增多，未来读代码的人需要额外去查任务包才能理解注释里
      "本任务上线前"这类相对时间表述的具体所指，属于长期可维护性的轻度技术债。
    action: backlog
    status: advisory

  - id: ic-b-010-F002
    dimension: test-evidence
    severity: advisory
    type: evidence-gap
    reachability: conditional
    evidence: >
      backend/src/commission-batch/import.service.ts 中 toFailReasonsDto()/isImportFailRow()
      对"fail_reasons 列内容非法但非 null"（如整列被手工改成非数组值，或数组内某元素
      row/reason 类型不对）这一分支的实现已读代码确认逻辑正确（Array.isArray 判断 +
      .every(isImportFailRow) 逐元素类型校验，不通过则整体降级为 []），但
      backend/test/commission-batch-import.e2e-spec.ts 目前只新增了 null 分支的专项用例
      （"历史记录 fail_reasons 为 null...降级为空数组"），未见针对"非 null 但结构损坏"这一
      BE-JSON-01 明确要求覆盖的场景（见任务包 known-risks 第三条）的专项断言。
    impact: >
      若该分支未来被无意间改坏（例如把 .every 误改成 .some，或把类型判断条件写反），当前测试
      矩阵不会捕获——只有回归到"列为 null"这一种异常输入时才会被发现，unknown 是否已有其他机制
      兜底。
    action: backlog
    status: advisory

  - id: ic-b-010-F003
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      backend/src/commission-batch/import.service.ts 的 importExcel() 内，同一份
      `failRows.map((row) => ({ row: row.rowNumber, reason: row.reason }))` 映射逻辑被写了
      两遍：一次用于构造持久化的 failReasons（约第 138-141 行），一次用于构造返回给调用方的
      failRows（约第 173-176 行），两处字面量完全相同。
    impact: >
      当前无功能性后果（两处结果始终一致，e2e 已验证）；但若未来两处口径需要出现差异（如响应体
      要脱敏、持久化要保留更多字段），维护者容易只改一处而遗漏另一处，产生响应与持久化数据的
      隐性不一致。
    action: backlog
    status: advisory
```

同一根因的调用语法/输入变体合并到同一 id 的 evidence，不按变体数增加 finding。`started_at/completed_at` 由编排器在事件发生时写入，`elapsed_minutes = ceil((completed-started)/60s)`，不得事后估算。
