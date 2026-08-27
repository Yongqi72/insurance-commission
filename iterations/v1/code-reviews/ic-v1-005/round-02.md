---
task_id: ic-v1-005
round: 2
mode: targeted
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-005/profile-round-01.json
prior_report: iterations/v1/code-reviews/ic-v1-005/round-01.md
target_finding_ids: [ic-v1-005-F001]
base_ref: 5852fcdd3b72d9cec55568419fac86e321d7b275
reviewed_base: 67b7c256b1361c1d452e39b11b5cf12e3cb22bd3
reviewed_head: a6b8640c464835cede1e9dcd0dedb70ad006cbdf
diff_sha256: a2bcdbe984f8a3f2ca1d9095f1aa5c04550efbc89c1ea97bc8b92c7d9b8f2f1e
changed_files:
  - backend/src/commission-tier/commission-tier.service.ts
  - backend/test/commission-tier.e2e-spec.ts
started_at: 2026-08-27T04:14:00Z
completed_at: 2026-08-27T04:52:00Z
elapsed_minutes: 38
escalate_to_full: false
conclusion: evidence-needed
---

## 本轮范围

targeted 复审 `ic-v1-005-F001`（concurrency：create/update 缺事务/行锁保护）。只核本轮固定 diff（2 文件）、prior round-01 报告与本 finding 相关反例，不重跑 profile 其余维度。

## 独立验证过程

### 1. 事务边界完整性（逐行核对，未采信执行者自评）

`commission-tier.service.ts:95-157`：

- `create()`：`assertBoundsOrdered(dto)` 在事务外（:99），但它是纯函数只读 `dto` 本身、不读其余档位、无 DB 依赖，放在事务外不影响原子性。进入 `this.dataSource.transaction(async (manager) => {...})` 后，`others = await this.loadTiersForConflictCheck(manager)` → `assertNoConflict` → `manager.create()` → `saved = await manager.save(tier)` → `await this.writeChangeLog(manager, 'create', ...)` 全部使用传入的事务 `manager`，无一处退回到构造函数注入的 `this.commissionTierRepository`/`this.changeLogRepository`（那两个 repository 绑定的是非事务连接，若被误用则不在事务保护范围内——本次未出现这个典型坑）。整条"读其余档位→冲突校验→save→写日志"序列确认在同一事务临界区内，无遗漏的 await 跑到事务外。
- `update()`：与 round-01 版本的一个关键差异——旧版先调用 `this.findOneOrFail(id)`（用非事务 repository）取得 `existing`，本版改为在事务回调内 `manager.findOne(CommissionTier, {where:{id}})` 并手写 `NotFoundException`。这个改动是必要且正确的：若沿用 `this.findOneOrFail` 会用非事务连接读取，`existing` 就不在本次事务的读一致性范围内。之后 `assertBoundsOrdered` → `others = await this.loadTiersForConflictCheck(manager, id)` → `assertNoConflict` → 字段赋值 → `saved = await manager.save(existing)` → `await this.writeChangeLog(manager, 'update', ...)`，同样全程用 `manager`，序列完整在事务内。
- `remove()`（本任务未改动，且不在 F001 范围内）：round-01 已核实其无跨记录状态依赖，本轮未重审。

**结论**：事务边界覆盖了 round-01 evidence 里点名的"find→冲突校验→save"整段，且往前延伸覆盖到了 `writeChangeLog`（round-01 原代码里 `writeChangeLog` 甚至都不在同一事务概念下，因为当时压根没有事务）。未发现遗漏的 await 跑到临界区外。

### 2. 驱动分支判断与 TypeORM 锁语义（独立读源码，未采信执行者转述）

- `this.dataSource.options.type === 'mysql'`：读 `backend/src/config/typeorm.config.ts:17-40` 确认生产分支字面量正是 `type: 'mysql'`，测试/本地分支字面量是 `type: 'better-sqlite3'`（非 `'sqlite'`），二者互斥、判断字符串精确匹配，无第三态漏判。
- `setLock('pessimistic_write')` 语义：直接读 `backend/node_modules/typeorm/query-builder/SelectQueryBuilder.js:1632-1647`（已安装的 typeorm 1.1.0 源码，非查文档臆测）。确认 `pessimistic_write` 在 `DriverUtils.isMySQLFamily(driver)` 为真时生成 SQL 后缀 `" FOR UPDATE"`，即 `SELECT ... FOR UPDATE`。这与执行者的说明字面一致，非自证。
- `SELECT ... FOR UPDATE` 在 InnoDB + 默认 REPEATABLE READ 隔离级别下的标准行为：对全表扫描（`create()` 的无 WHERE 查询）会对扫描到的所有记录及其间隙加 next-key 锁，从而阻塞其他事务对该表任意位置的并发 INSERT（这是业界公认的、用于在无 DB 唯一约束时防止"幻读式并发插入"的合法手段，尤其适合本表这种个位数到十位数行的小表）；`update()` 里 `tier.id != :excludeId` 不是可走索引等值/范围裁剪的条件，InnoDB 对其仍会做近似全表扫描并对扫描到的记录加锁（不会因为 WHERE 里排除了某行就跳过对该行的扫描与加锁），锁覆盖面与 `create()` 基本一致。据此判断：mysql 分支的加锁语义确实等价于"把该表当前状态锁成一个临界区"，另一个并发事务对同一批行做 `FOR UPDATE` 时会阻塞到第一个事务提交/回滚——功能上足以堵住 round-01 描述的 TOCTOU 窗口。

### 3. 独立发现的残余假设（执行者自评未提及）

上述结论成立有一个隐含前提：MySQL 会话的事务隔离级别是 REPEATABLE READ（InnoDB 默认）。若隔离级别被服务端/连接池配置成 READ COMMITTED，InnoDB 会关闭间隙锁（gap lock），此时对空表或"未命中现有行"的 `SELECT ... FOR UPDATE` 不会锁住任何间隙，两个并发 CREATE 之间的幻读窗口就会重新打开——即 round-01 e2e 反例里"表为空、两个重叠区间同时 POST"这一具体场景，在 READ COMMITTED 下无法被这个锁保护。

全仓 `grep` 确认代码里没有任何地方显式设置隔离级别（`dataSource.transaction()` 调用未传 isolation level 参数，`typeorm.config.ts` 的 mysql 分支也未配置），即该修复默认信赖 MySQL 服务端的出厂默认值（REPEATABLE READ）。这是一个未在代码里显式钉死、也未在 known-risks 里记录的环境前提，且当前沙箱没有真实 MySQL 可验证服务端实际隔离级别配置——不构成"逻辑漏洞"（因为默认值确实是 REPEATABLE READ，属合理假设），但是本轮独立评审新发现的、比"能不能连上真 MySQL 跑测试"更具体的一层残余风险，值得记入证据缺口的具体内容，而不仅仅是笼统的"沙箱没有 MySQL"。

### 4. 独立测试

```
npx tsc --noEmit         → 通过，零错误
npm run lint              → 通过，零告警
npm run test:e2e -- commission-tier.e2e-spec  → 26/26 通过（24 原有 + 2 新增并发用例）
npm run test:e2e（全量）  → 5 个测试文件、76 个用例全部通过
```

### 5. 新增并发测试的断言质量与独立反证实验

两个新用例（`backend/test/commission-tier.e2e-spec.ts` 新增 describe 块）：

- 断言排序后的状态码数组恰为 `[201, 409]` / `[200, 409]`（不是"至少一个失败"或"两个都可能成功"的弱断言），并进一步在第一个用例里断言 `listRes.body.data.tiers` 长度恰为 1（不是"事后看似没冲突"，是直接查库计数）。这两点断言设计合理，确实在检验"恰好一个成功"而非仅仅"测试没检测到两个都成功"。

- **但独立反证实验证实这两个用例在当前 sqlite 测试基础设施下对本次修复没有区分度**：本审查员在临时 scratch 目录（未触碰当前工作区/索引）里搭建了一份混合树——`src/commission-tier/commission-tier.service.ts` 取自 round-01 的 `reviewed_head`（`67b7c256...`，即修复前、完全没有事务/锁的版本），`test/commission-tier.e2e-spec.ts` 取自本轮 `reviewed_head`（`a6b8640...`，含新增并发用例），其余文件/`node_modules` 软链原样。连续跑 5 次 `npx jest --config ./test/jest-e2e.json commission-tier.e2e-spec -t "并发"`，**5/5 次两个新增用例仍然全部通过**。这与执行者自己的说明一致：better-sqlite3 单一同步连接把两个并发请求的 DB 操作串行化，测试环境下无论有没有事务/锁包裹，冲突校验都能正确检测到重叠——这两个新用例验证的是"409 冲突路径在几乎同时到达时依然正确工作"这个功能性质，而不是"事务+悲观锁确实防住了竞态窗口"这个本次修复要证明的性质。它们对 F001 本身是零区分度的回归测试，但断言写法本身没有缺陷，是环境（sqlite 驱动）导致其失去甄别力，不是测试代码的逻辑错误。

## 结论

**F001 判定：downgraded（非 verified-closed，也非与 round-01 完全相同的 open）**

理由：
1. round-01 的核心证据是"create/update 完全没有任何事务/锁/DB 约束保护，find→save 之间是彻底裸奔的两步"。这一点在本轮已被结构性、可独立验证地推翻——事务边界确认完整覆盖了原始 evidence 点名的整段序列，不依赖任何数据库特定行为，这部分是**已验证为真**的代码改进，与驱动无关。
2. mysql 专属的悲观锁分支，经独立读 TypeORM 1.1.0 源码确认其 SQL 生成语义（`FOR UPDATE`）与执行者说明一致，且从 InnoDB 标准文档行为推导，其对本任务这种小表场景在 REPEATABLE READ（MySQL/InnoDB 默认隔离级别）下确实能提供符合预期的串行化保护——这是"结构上合理"的判断，不是"看起来对"。
3. 但本沙箱确实没有真实 MySQL，无法端到端跑通该分支；且本轮独立发现一个执行者自评未提及、比"沙箱没有 MySQL"更具体的残余假设——修复未显式钉死事务隔离级别，隐含依赖服务端默认值不被覆盖为 READ COMMITTED。这个假设合理但未被代码或 known-risks 显式记录，也不可能在本仓当前测试基础设施上产出确定性证据。
4. 按 review brief 对 `risk: sensitive` 的路由规则："证据不足但涉及安全边界时可阻断推进，但 type 必须是 `evidence-gap`、action 必须是 `request-evidence`；证据补齐前不得伪装成已证实的 behavior bug"——即使代码改进已经很扎实，只要缺乏真实 MySQL 环境下的直接证据，就不能判定为 `verified-closed`。同时，鉴于本沙箱环境的这个限制是结构性的、不会随复审轮次增加而改善（不是"再想想就能测出来"的问题），继续无限期挂起在"阻断"状态对流程没有增量价值。参照 round-01 处理说明里给出的两条闭环路径（补证据 或 由权威方明确接受残余风险并记入 known-risks），本轮建议：**由后续 deploy/manual-test 阶段在真实 MySQL 环境跑一次本文件新增的两个并发用例的等价验证（或直接验证 `SHOW VARIABLES LIKE 'transaction_isolation'` 确认服务端为 REPEATABLE READ）作为上线前置条件之一，并将该依赖显式记入 known-risks；不要求本轮再对代码做进一步改动**。

## Findings（本轮更新）

```yaml
findings:
  - id: ic-v1-005-F001
    dimension: concurrency
    severity: 阻断
    type: evidence-gap
    reachability: conditional
    evidence: "commission-tier.service.ts create()/update() 已用 this.dataSource.transaction() 包裹「读其余档位→冲突校验→save→写变更日志」整段（独立逐行核对，manager 全程一致使用，无遗漏 await 跑到事务外）；仅 mysql 驱动（this.dataSource.options.type === 'mysql'，与 typeorm.config.ts 生产分支字面量精确匹配）走 setLock('pessimistic_write')，经读 typeorm 1.1.0 源码（SelectQueryBuilder.js:1632-1647）确认生成 'FOR UPDATE'，语义上对小表全表/近全表扫描能在 InnoDB 默认 REPEATABLE READ 隔离级别下阻塞并发 INSERT/UPDATE 直至前一事务提交——结构性合理。残余证据缺口：①沙箱无真实 MySQL，该分支从未被实际执行过；②修复未显式钉死事务隔离级别，隐含依赖 MySQL 服务端默认值（REPEATABLE READ）未被运维/云厂商配置覆盖为 READ COMMITTED，后者会关闭间隙锁、重新打开空表/新档位场景下的幻读窗口——此依赖未记入 known-risks。新增的 2 个并发 e2e 用例经审查员独立反证（用 round-01 修复前的 service.ts + 本轮新测试重跑 5 次，5/5 仍通过）确认对本次修复零区分度，系 sqlite 单连接同步语义所致，非测试断言设计缺陷。"
    impact: "若生产 MySQL 会话隔离级别恰为 REPEATABLE READ（出厂默认，未被显式覆盖），修复应可按预期堵住原窗口；若被覆盖为 READ COMMITTED 且无人知晓这一隐含依赖，原 TOCTOU 窗口的一个子场景（表为空或新档位不与任何现有行重叠时的并发插入）会不受保护地重新出现，且当前测试基础设施无法检测到这一退化——影响面与 round-01 原始 impact 一致（阶梯表重叠不变式被打穿），但触发条件从"完全没有保护"收窄为"保护存在但隐含前提被打破"，概率显著降低"
    action: request-evidence
    status: open
```

- `f001_status: downgraded`——代码层面的核心缺陷（完全无事务/无锁）已用可独立验证的方式确认修复；残余为更窄的、真实 MySQL 环境下才能证实/证伪的证据缺口，且是本轮独立新发现的隐含前提（隔离级别），非执行者自评已覆盖的内容。
- 建议处理路径：不再要求本轮继续改代码；建议在 known-risks 显式记录"该并发保护依赖 MySQL 默认 REPEATABLE READ 隔离级别"，并把"真实 MySQL 环境下跑通两个并发用例的等价验证"列为部署前（deploy/manual-test 阶段）的一项前置检查项，而非继续在 develop 阶段的代码复审循环里空转。
- 无新根因、无 changed surface 越界——`escalate_to_full: false`。
