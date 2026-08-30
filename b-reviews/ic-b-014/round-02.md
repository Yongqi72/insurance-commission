---
task_id: ic-b-014
round: 2
mode: targeted
risk: standard
review_profile: b-reviews/ic-b-014/profile-round-01.json
prior_report: b-reviews/ic-b-014/round-01.md
target_finding_ids: [ic-b-014-F001]
base_ref: d9b0f7220bca1452c3bfd65ffb1070d8a057f55f
reviewed_base: a83176fe55f1eeb397874799ef90d76a722b9207
reviewed_head: 39f46db93ed7d2932981dee72aa53756c7cce364
diff_sha256: f95ba3861d79c06b2d258b54c36b6730169d557f905ef088723907d8378123b2
changed_files:
  - backend/src/policy-record/policy-record.service.ts
started_at: 2026-08-30T09:28:29Z
completed_at: 2026-08-30T09:32:52Z
elapsed_minutes: 5
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "两个近乎并发的 PATCH 请求命中同一条 policy_record（工作单号勾选重置 + 销售人员补录），
     后提交的重置事务基于陈旧读取值把刚提交的销售人员改动静默覆盖回 null/unmatched，
     且 sales_fill_log 里销售人员那条改动日志与最终行状态不一致（ic-b-014-F001）"
affected_regressions: []
changed_surface_allowed:
  - backend/src/policy-record/policy-record.service.ts
```

`git diff a83176fe55f1eeb397874799ef90d76a722b9207 39f46db93ed7d2932981dee72aa53756c7cce364` 的 sha256 = `f95ba3861d79c06b2d258b54c36b6730169d557f905ef088723907d8378123b2`，与派发者给定值逐字节一致；实际改动文件集合（仅 `backend/src/policy-record/policy-record.service.ts` 一处）与 brief 声明的 `changed_files` 完全对应，无越界改动。

## 独立核实过程

**1. 变更本身**：新增私有 `findOneForUpdate(manager, id)`；`this.dataSource.options.type === 'mysql'` 时走 `manager.findOne(PolicyRecord, { where:{id}, lock:{mode:'pessimistic_write'} })`，否则退化为普通 `findOne`。`updateSalesName()`（policy-record.service.ts:78）与 `updateWorkOrderNo()`（同文件:119）均已把各自原来的内联 `manager.findOne(...)` 替换为 `this.findOneForUpdate(manager, id)`——不是只改了一处，两个调用点都改了。两个方法体内除这一行读取语句外，其余 mutate/save/日志写入逻辑与 round-01 审查过的版本逐行相同（未引入其他行为改动）。

**2. 驱动判定是否可靠**：核对 `backend/src/config/typeorm.config.ts`——`dbType==='mysql'` 时返回 `{ type: 'mysql', ... }`，否则返回 `{ type: 'better-sqlite3', ... }`；即项目本身构造 `DataSourceOptions` 时把 mysql 场景的 `type` 字段硬编码为字符串 `'mysql'`，与 `findOneForUpdate()` 里 `dataSource.options.type === 'mysql'` 的判断完全对应，不是猜测的字符串。核对 `backend/.env`：`DB_TYPE=mysql`，即本仓实际使用的开发库（`insurance_commission`，host `172.22.224.1`）走的正是这条加锁分支；`backend/test/jest-e2e.setup.ts` 强制 `process.env.DB_TYPE='sqlite'`，即自动化 e2e 套件走的是无锁分支——brief 对这一点的描述准确。

**3. 独立复现（未采信 brief 转述的手工验证，自行用真实 MySQL 开发库重新构造反例）**：直接实例化真实的 `PolicyRecordService`（非 mock，非重写逻辑）对着一条一次性 scratch 行（id=3969，`customerName='lock-fix-verify'`，`work_order_no` 前缀 `WO-LOCKFIX-INDEP-`）跑两个重叠事务：

- Tx B = `updateWorkOrderNo` 语义（`resetFillStatus` 分支），先发起，`findOneForUpdate` 读到 `salesFillSource='system'` 后人为 sleep 800ms 才 save+commit（不改方法体本身，只在读之后、save 之前插入延迟，模拟并发窗口）。
- Tx A = `updateSalesName` 语义，在 Tx B sleep 期间（B 开始后 150ms）发起，直接调用同一个 `findOneForUpdate`。

实测时间线（毫秒级 epoch，节选）：
```
B: read record, salesFillSource=system         @ ...4661
B: about to sleep before save                  @ ...4661
A: begin                                        @ ...4818   ← A 在 B 持锁期间发起读
B: waking, saving now                           @ ...5462
B: committed                                    @ ...5472
A: read record (blocked until here)             @ ...5474   ← A 的读比 B 提交晚 2ms 才返回
A: committed                                    @ ...5481
```
A 从「begin」到「读返回」跨越了 656ms（4818→5474），且这段等待的结束时间点（5474）紧贴在 B 的提交时间点（5472）之后 2ms，而不是 A 发起后按正常无锁 `findOne` 应有的毫秒级即时返回——这就是 `SELECT ... FOR UPDATE` 真实阻塞并在锁释放后才返回的可观测证据，不是巧合的调度延迟。

且 A 在解除阻塞后读到的是 B **提交后**的最新行状态（`salesFillSource='unmatched', salesName=null`），不是 A 发起时刻（`system`/`张三`）的陈旧快照——证明第二个事务读到的是新鲜数据，不是行为不变只是延迟。

最终结果：`workOrderNo='WO-LOCKFIX-INDEP-02'`（B 写入的字段）、`salesName='李四(纠正)'`、`salesFillSource='manual'`（A 写入且最后提交，按提交顺序生效）；`sales_fill_log` 两条记录（`workOrderNo` 从 01→02，`salesName` 从 张三→李四(纠正)）与最终行状态完全一致——不再出现 round-01 反例里"日志显示改动成功但行状态自相矛盾"的情况。复现完毕后已删除 scratch 行（id=3969）与其 2 条日志，独立重新查询 `insurance_commission.policy_record`/`sales_fill_log` 均已确认无残留（`WO-LOCKFIX-%` 与 `lock-fix-verify` 均 0 条）。

**4. 原始 F001 反例是否还可达**：round-01 的反例依赖"B 事务的 mutate 分支判断（`wasUnmatched`）built 在事务开始时的一次性读取上，B 提交时携带的是这个过期判断结果，从而覆盖掉 A 期间提交的新值"。加锁后，B 若先持锁，A 的读会阻塞到 B 提交后才返回，A 此后的判断天然基于 B 提交后的新状态，不存在"用过期快照覆盖新提交值"的路径；若 A 先持锁，则对称地 B 会阻塞到 A 提交后才读，`wasUnmatched` 判断同样基于最新状态。两种交织顺序下，最终结果都由"谁最后提交"决定且这一判断始终基于最新已提交数据——原 F001 描述的路径已不可达。

**5. `findSalesFillLogs()` 是否需要一并加锁**：该方法是只读查询（`GET .../sales-fill-logs`），不参与"读-判断-写"的写写竞争，F001 是写写竞争问题，不涉及只读路径的锁保护范围；未发现新的反例。

**6. 驱动 fallback 本身的风险评估**：`typeorm.config.ts` 头部注释明确"生产/正式部署走 MySQL，本地开发与自动化测试走 SQLite"（且当前 `.env` 已把本地开发环境也切到 `DB_TYPE=mysql`，注释里的 sqlite 默认值仅覆盖"当前沙箱环境无 Docker/MySQL 服务"时的权宜场景），即该项目的生产与开发路径都命中加锁分支，sqlite 无锁分支只在自动化测试驱动下触发。检查 `backend/test/policy-record.e2e-spec.ts` 未发现任何 `Promise.all`/并发/竞态类断言（grep 无命中），也没有找到 `policy-record.service.spec.ts`（该 service 无独立单测文件）——即本次加的锁全仓没有任何自动化测试真正在跑并发场景，无论跑没跑都不会让 CI 变红或变绿。这是测试基础设施的固有限制（sqlite 驱动本身不支持行锁，会抛 `LockNotSupportedOnGivenDriverError`），不是本次改动引入的新缺陷，但确实是一个值得记录的可观测事实：未来如果有人不慎改动/移除 `findOneForUpdate()` 里的加锁分支，不会有任何自动化测试失败去捕获这个回归。计入下方 `ic-b-014-F002`（advisory，非阻断）。

**7. 加锁机制本身是否兼容当前安装的 typeorm 版本**：本仓实际安装 `typeorm@1.1.0`（`node_modules/typeorm/package.json` 确认，非 nestjs/typeorm 的版本）。核对 `node_modules/typeorm/query-builder/SelectQueryBuilder.js` 源码：`pessimistic_write` 分支对 `DriverUtils.isMySQLFamily(driver)` 的情况生成 `" FOR UPDATE"`，其余不支持的驱动抛 `LockNotSupportedOnGivenDriverError`——与 brief 描述的"better-sqlite3 会抛错，因此需要驱动判断"完全对应，加锁机制在当前实际安装的库版本下是真实生效的（不是死代码/不兼容的 API 调用）。

## 回归扫描

`build`/`test`（unit）/`test:e2e`（全部 6 套）/`lint` 全部本地重新跑通：

- `npm run build`：无输出即成功，无编译错误。
- `npm run test`：13 个 suite / 56 个用例全部通过（含预期内的 mock 错误日志，非失败）。
- `npm run test:e2e`：6 个 suite / 116 个用例全部通过（`policy-record.e2e-spec.ts` 含在内，回填/工作单号/历史记录相关用例无回归）。
- `npm run lint`：无报错、无警告输出。

未发现本轮 diff 引入的新回归。

真实 MySQL 开发库（`insurance_commission`，`backend/.env` 同一套凭证）独立查询确认：`policy_record` 表中 `work_order_no LIKE 'WO-LOCKFIX-%'` 与 `customer_name/sales_name = 'lock-fix-verify'` 均 0 条命中；`sales_fill_log` 表同样按等价条件 0 条命中；表内 `sales_fill_log` 总行数=1（与 round-01 报告记录的"仅实现方留下的那 1 行"一致，未新增任何遗留脚本痕迹）。

## Findings

```yaml
findings:
  - id: ic-b-014-F001
    dimension: concurrency
    severity: blocking
    type: behavior-bug
    reachability: current
    evidence: |
      round-01 反例的可达路径依赖 updateSalesName()/updateWorkOrderNo() 各自基于事务开始时的
      一次性 findOne 快照做写入判断。当前修复后两者共用 findOneForUpdate()，mysql 驱动下走
      `lock:{mode:'pessimistic_write'}` → TypeORM 生成 `SELECT ... FOR UPDATE`（已读
      node_modules/typeorm/query-builder/SelectQueryBuilder.js 确认对 mysql family 生成该
      SQL）。已用真实 PolicyRecordService（非 mock）对 MySQL 开发库一次性 scratch 行独立复现：
      Tx A 的 findOneForUpdate 调用在 Tx B 持锁期间发起，实测阻塞 656ms，直到 Tx B 提交
      （epoch 5472ms）后 2ms 才返回（epoch 5474ms），且返回的是 B 提交后的最新行状态而非
      A 发起时刻的陈旧快照；最终行状态与 sales_fill_log 两条日志完全一致，不再出现日志与
      行状态矛盾。scratch 行（id=3969）与其日志已清理，独立重新查询开发库确认无残留。
    impact: |
      原反例描述的静默覆盖路径（后提交事务基于过期快照覆盖已提交的新值，同时留下与最终
      状态矛盾的审计日志）已不可复现；两个写路径的交织结果现在由真实提交顺序决定，且各自
      的写入判断始终基于最新已提交数据。
    action: fix-code
    status: verified-closed
  - id: ic-b-014-F002
    dimension: concurrency
    severity: advisory
    type: future-risk
    reachability: conditional
    evidence: |
      findOneForUpdate() 的加锁分支仅在 dataSource.options.type==='mysql' 时生效；本仓
      e2e 测试固定用 better-sqlite3 驱动（test/jest-e2e.setup.ts 强制
      process.env.DB_TYPE='sqlite'，与 backend/.env 实际配置的 mysql 无关），该驱动不支持
      行锁（会抛 LockNotSupportedOnGivenDriverError），因此加锁分支只能退化为无锁读。已
      grep backend/test/policy-record.e2e-spec.ts 确认无任何并发/竞态类断言，且该 service
      无独立单测文件（policy-record.service.spec.ts 不存在）——即全仓当前没有任何自动化
      测试真正在验证这把锁，加锁分支被移除或写错也不会让任何 CI 步骤变红。
    impact: |
      当前不影响生产/开发环境正确性（.env 中 DB_TYPE=mysql，真实场景确实加锁；本轮已用
      真实 MySQL 独立复现验证）。风险仅在于：未来有人改动 findOneForUpdate() 或其调用点
      时，若无意中破坏了加锁逻辑（例如误改判断条件、误删 lock 选项），不会有任何自动化
      测试失败去捕获这个回归——这是本项目"生产用 MySQL、自动化测试用 sqlite"这一既有测试
      基础设施选择的固有限制，不是本次改动新引入的缺陷，也不构成需要立即处理的阻断项。
    action: backlog
    status: advisory
```

## 说明

- 本轮 `targeted`，只核 `ic-b-014-F001` 及其对应反例、受影响回归与 `reviewed_base`→`reviewed_head` 的增量 diff（仅 `policy-record.service.ts` 一个文件），未重做 round-01 已过的其余 12 个维度。
- `ic-b-014-F001` 判定 `verified-closed`：独立复现（非采信实现方转述）证明加锁后第二个事务的读确实阻塞至第一个事务提交，且读到的是提交后的新鲜状态，原反例路径不可达；build/单测/e2e/lint 全绿，无回归；开发库无遗留 scratch 数据。
- 新增 `ic-b-014-F002`（advisory，不阻断本轮结论）：驱动 fallback 本身对本项目当前的生产/开发场景（均为 MySQL）没有削弱保护，但整把锁在自动化测试里是"测不到"的盲区，值得记录以防未来无声回归，不要求本轮改代码。
- diff surface 未超出声明范围（仅 1 个文件，无新机制/新依赖引入），不触发 `escalate_to_full`。
- round-01 已过的 contract / scope-and-secrets / test-evidence / comment-hygiene / standards / enforcement / design-fidelity / input-provenance / query-performance / logging-privacy / maintainability / sensitive-boundaries 十二个维度结论沿用不变，未在本轮重新审查。
