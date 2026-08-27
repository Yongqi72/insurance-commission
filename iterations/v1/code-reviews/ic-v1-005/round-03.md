---
task_id: ic-v1-005
round: 3
mode: targeted
risk: sensitive
review_profile: iterations/v1/code-reviews/ic-v1-005/profile-round-01.json
prior_report: iterations/v1/code-reviews/ic-v1-005/round-02.md
target_finding_ids: [ic-v1-005-F001]
base_ref: 5852fcdd3b72d9cec55568419fac86e321d7b275
reviewed_base: a6b8640c464835cede1e9dcd0dedb70ad006cbdf
reviewed_head: 31d87f6aa6ab32b530425689edbd3b05e059475e
diff_sha256: 2c586334ac0269bfb129d629a3cc1190c9896cb92f402170a966e3d8c421528a
changed_files:
  - backend/src/commission-tier/commission-tier.service.ts
started_at: 2026-08-26T22:00:00Z
completed_at: 2026-08-26T22:30:00Z
elapsed_minutes: 30
escalate_to_full: false
conclusion: pass
---

## 本轮范围

targeted 复审 round-02 对 `ic-v1-005-F001` 的唯一残留 evidence-gap：`create()`/`update()` 的 `this.dataSource.transaction()` 未显式钉死隔离级别，隐含依赖 MySQL 服务端默认值（REPEATABLE READ），若服务端配置为 READ COMMITTED 会让间隙锁失效、竞态窗口重新打开。本轮固定 diff 只有两处改动：`create()`/`update()` 的 `this.dataSource.transaction(async (manager) => {...})` 均改为 `this.dataSource.transaction('SERIALIZABLE', async (manager) => {...})`，附注释说明理由。只核这一具体改动是否结构性消除残留 gap，不重跑 profile 其余维度。

## 独立验证过程

### 1. 两个驱动的 `supportedIsolationLevels` 是否都包含 `'SERIALIZABLE'`（独立读源码，非采信执行者转述）

- `backend/node_modules/typeorm/driver/mysql/MysqlDriver.js:28-33`：
  ```
  static { this.supportedIsolationLevels = [
      "READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE",
  ]; }
  ```
  mysql 驱动四级隔离全支持，`'SERIALIZABLE'` 在列。
- `backend/node_modules/typeorm/driver/sqlite-abstract/AbstractSqliteDriver.js:23-26`：
  ```
  static { this.supportedIsolationLevels = [
      "READ UNCOMMITTED", "SERIALIZABLE",
  ]; }
  ```
  sqlite（含 better-sqlite3）只支持这两级，`'SERIALIZABLE'` 在列。已确认 `backend/node_modules/typeorm/driver/better-sqlite3/BetterSqlite3Driver.js:15` 为 `class BetterSqlite3Driver extends AbstractSqliteDriver`，未重新定义 `supportedIsolationLevels`，继承上述数组，本地/测试实际使用的正是这一驱动（与 `typeorm.config.ts` 测试分支一致）。
- 校验路径：`backend/node_modules/typeorm/driver/validate-isolation-level.js:12-21` 的 `validateIsolationLevel(supported, isolationLevel)` 逻辑为 `!supported.includes(isolationLevel)` 才抛 `TypeORMError`；两个驱动的 `startTransaction()`（`AbstractSqliteQueryRunner.js:54-56`、`MysqlQueryRunner.js:84-86`）都在设置事务前先调用这个校验函数。`'SERIALIZABLE'` 在两个驱动的白名单里，因此两侧均不会抛错——代码阅读层面已确认，不依赖真实 MySQL。

结论：执行者注释里"mysql/sqlite 两种驱动均支持 SERIALIZABLE"这一说法核实为真，且这是唯一同时被两个驱动支持的非空隔离级别（`REPEATABLE READ`/`READ COMMITTED` 在 sqlite 侧完全不支持，若误选这两者会导致本地/CI 测试直接抛 `TypeORMError`）——这也解释了为什么选 `SERIALIZABLE` 而非其他更"标准"的隔离级别是必然选择，不是随意选择。

### 2. 这不是走回头路：SERIALIZABLE 是否强于/不弱于 REPEATABLE READ，是否会重新打开 round-01 已修复的窗口

- SQL 标准隔离级别强度序：`READ UNCOMMITTED < READ COMMITTED < REPEATABLE READ < SERIALIZABLE`，`SERIALIZABLE` 是最强级别，在 InnoDB 具体实现上是 `REPEATABLE READ` 的严格超集（间隙锁/next-key 锁完整保留，额外把同一事务内的普通 `SELECT`（非 `SELECT ... FOR UPDATE`）也隐式转换为 `SELECT ... LOCK IN SHARE MODE`）。因此округ-01 依赖的"`FOR UPDATE` + REPEATABLE READ 下的 gap lock"保护在 `SERIALIZABLE` 下只增不减，不存在钉死更强隔离级别反而弱化保护的可能。
- 额外发现一个附带收益（非本轮必查项，但顺带记录）：`update()` 里 `manager.findOne(CommissionTier, {where:{id}})`（读被编辑记录本身）是一条没有走 `setLock('pessimistic_write')` 的普通 `SELECT`。在原先隐含 `REPEATABLE READ` 下这条读不加锁；钉死 `SERIALIZABLE` 后，mysql 分支这条普通 `SELECT` 也会被 InnoDB 隐式转换为共享锁读，额外收窄了一个 round-02 未点名的更细粒度窗口（对同一条正在被编辑记录的并发读）。这是本次改动在"结构上不弱于原保护"之外的加分项，不构成新 finding。
- 因此本次改动是纯粹的加强，不是同一层面的权衡取舍，round-01 已验证修复的部分不会因为这次改动而退化。

### 3. sqlite 收到 `'SERIALIZABLE'` 是否会抛错——独立跑 e2e 验证（不只信静态代码分析）

静态代码分析（`AbstractSqliteQueryRunner.js:54-80`）显示：`startTransaction(isolationLevel)` 校验通过后，若 `isolationLevel` 存在且不等于 `"READ UNCOMMITTED"`，只是执行 `PRAGMA read_uncommitted = false`（sqlite 本身没有 `SET TRANSACTION ISOLATION LEVEL` 的等价 DDL，`SERIALIZABLE`/`REPEATABLE READ` 等级别在 sqlite 语境下都归约为"不开启 read uncommitted"这一个开关），随后正常 `BEGIN TRANSACTION`——不会因为传了 `'SERIALIZABLE'` 而走任何特殊/报错分支。

独立运行验证（未采信静态分析，实测跑了 e2e）：

```
cd backend
npx tsc --noEmit                              → 通过，零错误
npm run lint                                   → 通过，零告警
npm run test:e2e -- commission-tier.e2e-spec   → 26/26 通过
npm run test:e2e（全量）                        → 5 个测试文件、76 个用例全部通过
```

26 个用例含 round-02 新增的 2 个并发用例，均通过，证实本地 better-sqlite3 驱动收到 `'SERIALIZABLE'` 参数后事务能正常开启/提交/回滚，未抛出 `TypeORMError` 或任何其他异常，也未导致既有用例行为变化（`tsc`/`lint`/全量回归零差异）。

### 4. mysql 分支：`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` 是否真正独立于服务器配置（本轮判断的关键点）

读 `backend/node_modules/typeorm/driver/mysql/MysqlQueryRunner.js:84-105`：

```js
async startTransaction(isolationLevel) {
    isolationLevel ??= this.dataSource.options.isolationLevel;
    validateIsolationLevel(this.driver.supportedIsolationLevels, isolationLevel);
    ...
    if (this.transactionDepth === 0) {
        if (isolationLevel) {
            await this.query("SET TRANSACTION ISOLATION LEVEL " + isolationLevel);
        }
        await this.query("START TRANSACTION");
    }
    ...
}
```

关键事实：TypeORM 在 mysql 分支下，会在 `START TRANSACTION` 之前对当前连接显式执行一条 SQL 语句 `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`。按 MySQL 官方语义，不带 `SESSION`/`GLOBAL` 关键字的 `SET TRANSACTION ISOLATION LEVEL` 只对**紧接着的下一个事务**生效，与该连接的 session 默认值、服务器的 global 默认值（`transaction_isolation`/`tx_isolation`）无关——即无论 DBA 把 MySQL 服务器/连接池配置成 `READ COMMITTED`、`REPEATABLE READ` 还是任何其他默认值，这条显式 SQL 语句都会在每次 `create()`/`update()` 事务开始前把**这一个事务**强制钉死为 `SERIALIZABLE`。

这与 round-02 指出的问题（"代码未传隔离级别参数，隐含依赖服务器默认值不被覆盖"）形成精确对应的闭环：round-02 的 gap 是"代码没有主动声明，听天由命"；本次修复是"代码主动发送 SQL 显式声明，与服务器配置完全解耦"。这个结论是读 TypeORM 源码 + MySQL 官方 `SET TRANSACTION` 语义就能确认的**结构性事实**，不需要连上真实 MySQL 才能验证——因为验证的对象是"代码是否显式发送了覆盖服务器配置的 SQL 语句"，而不是"服务器实际配置成了什么值"。round-02 当初判 `evidence-needed` 的原因是"该依赖能否被打破只能连真实 MySQL 才能证实"，而现在的修复已经把问题转化成了纯粹的、可静态验证的"TypeORM 是否真的会发送这条 SQL"的问题，答案是确定的 yes。

### 5. 反面检查：是否存在让这个判断打折扣的漏洞

按任务要求认真找反例，而非因为"看起来解决了"就轻易放行：

- **MySQL 版本/兼容引擎差异**：`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` 是标准 SQL-92 语法，MySQL 自 4.0 起原生支持，未发现本仓有使用 MySQL 协议兼容但行为不同的替代引擎（如 TiDB/PolarDB）的迹象（`typeorm.config.ts` 里驱动类型字面量为 `'mysql'`，未见自定义驱动）。不构成本轮 blocking 顾虑，但如果生产实际部署在非原生 MySQL 的兼容数据库上，这条 SQL 的行为需要该数据库自身保证——这是环境层面的假设，不属于代码缺陷，且已经不是"隐含依赖默认值"这个原始问题的范畴。
- **性能/死锁权衡**：`SERIALIZABLE` 会让同一事务内所有普通 `SELECT` 也隐式加共享锁，比 `REPEATABLE READ` 更容易在高并发写场景下出现锁等待甚至死锁。但结合 round-01/round-02 已确认的事实——`commission_tier` 表行数量级为"个位数到十位数"、操作方是低频的后台管理员配置动作（非高并发业务路径）——这个代价在当前场景下可忽略，且代码注释已经显式记录了选择 `SERIALIZABLE` 的理由，不是无意识的过度设计。判断为可接受的权衡，不构成新 finding，仅作为 advisory 记录以备将来该表并发量级发生数量级变化时重新评估。
- **是否只是"看起来钉死了"而实际上被某处覆盖**：全文 `grep 'isolationLevel\|transaction('` 确认 `commission-tier.service.ts` 内只有这两处 `transaction()` 调用，均已带 `'SERIALIZABLE'` 参数，且 `typeorm.config.ts` 未在 `DataSourceOptions` 上配置全局 `isolationLevel`（若配置了，两者不冲突，因为调用时传参优先于 `dataSource.options.isolationLevel` 的 `??=` 兜底）；未发现任何会让这次显式钉死被静默忽略的路径。
- **`loadTiersForConflictCheck` 里 mysql 分支的 `pessimistic_write` 逻辑是否因为改用 SERIALIZABLE 而变得多余/冲突**：不冲突。`FOR UPDATE` 显式锁与事务隔离级别是两个独立机制，`SERIALIZABLE` 不会让显式锁失效或产生语义矛盾，二者叠加只会让保护更强（见第 2 点）。

未发现能推翻"结构性消除"这一判断的反例。

## 结论

**F001 判定：verified-closed**

理由：
1. round-02 唯一残留的具体问题——"事务未显式钉死隔离级别，隐含依赖 MySQL 服务器默认 REPEATABLE READ 配置"——已被本次修复从"隐含依赖"转变为"代码主动发送 SQL 显式覆盖"，这是通过读 TypeORM mysql 驱动源码（`SET TRANSACTION ISOLATION LEVEL` 语句会在每次事务开始前无条件执行）加上 MySQL 标准 SQL 语义（该语句只影响下一个事务，与服务器/会话默认配置解耦）即可确认的结构性事实，与是否连接真实 MySQL 无关——因此不再是"需要真实环境才能证实"的证据缺口，符合本轮任务要求的"读代码 + 读 TypeORM 源码就能确认"标准。
2. 独立验证了两个驱动（mysql、better-sqlite3）的 `supportedIsolationLevels` 均包含 `'SERIALIZABLE'`，且独立实测跑通全部 76 个 e2e 用例（含 round-02 新增的 2 个并发用例）证实 sqlite 侧收到该参数不抛错、行为不变。
3. 独立确认 `SERIALIZABLE` 在 InnoDB 语义下是 `REPEATABLE READ` 的严格超集，不会让 round-01 已修复的原始 TOCTOU 窗口重新打开，反而额外收紧了 `update()` 里此前未受 `FOR UPDATE` 覆盖的自身记录读取这一更细粒度窗口。
4. 认真核查了反例（兼容引擎差异、性能/死锁权衡、被覆盖的可能性、与既有 `pessimistic_write` 锁的交互），均未发现能推翻上述判断的漏洞；性能/死锁权衡在当前表规模与操作频率下判断为可接受，仅作 advisory 记录，不构成新 finding。

## Findings（本轮更新）

```yaml
findings:
  - id: ic-v1-005-F001
    dimension: concurrency
    severity: n/a
    type: n/a
    reachability: n/a
    evidence: "commission-tier.service.ts create()/update() 的 this.dataSource.transaction() 已改为 this.dataSource.transaction('SERIALIZABLE', ...)。独立读 TypeORM 源码确认：mysql 驱动（MysqlDriver.js:28-33）与 sqlite 驱动（AbstractSqliteDriver.js:23-26，better-sqlite3 继承未覆盖）的 supportedIsolationLevels 均包含 'SERIALIZABLE'，validateIsolationLevel 不会拒绝；mysql 侧 startTransaction()（MysqlQueryRunner.js:84-105）在 START TRANSACTION 前显式执行 SET TRANSACTION ISOLATION LEVEL SERIALIZABLE，该语句按 MySQL 标准语义只影响紧接着的下一个事务、与服务器/会话默认隔离级别配置完全解耦；SERIALIZABLE 在 InnoDB 下是 REPEATABLE READ 的严格超集，不会弱化 round-01 已验证的保护。独立跑通 tsc/lint/e2e（26/26 单文件、76/76 全量）确认 sqlite 侧接受该参数无异常、行为无回归。"
    impact: "round-02 指出的'隐含依赖服务器默认隔离级别配置'这一具体残留问题已被结构性消除——不再是等待真实 MySQL 环境才能证实/证伪的证据缺口，而是通过静态读码 + TypeORM/MySQL 标准语义即可确认成立的事实。"
    action: none
    status: closed
```

- `f001_status: verified-closed`——round-02 的残留 gap（隐含依赖服务器默认隔离级别）已被本轮修复结构性消除，且本轮判断依据是可静态验证的代码事实与 SQL 标准语义，不属于"看起来解决了"的轻率放行。
- 未发现新 finding；`escalate_to_full: false`（本轮改动范围与 round-02 建议的修复方向完全吻合，未越界）。
- `conclusion: pass`——F001 已闭合，本任务（ic-v1-005）自 round-01 以来的唯一 blocking finding 至此清零，其余 profile 维度在 round-01 已核实通过且本轮改动未触及。
