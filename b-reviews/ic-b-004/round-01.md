---
task_id: ic-b-004
round: 1
mode: full
risk: sensitive
review_profile: b-reviews/ic-b-004/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 40701e55a22ad8c685df0a345f0d91bd983434d2
reviewed_base: 2e102a6fab5066c1113ec5f890d2c03c0b231917
reviewed_head: 960410efd1cfead9152bd7be11080f6defbfb222
diff_sha256: 7edbcdcd5ce38262a5b59c4a97a59303567f469e9a71e4932508fe5aaf75de8e
changed_files:
  - backend/src/commission-tier/commission-tier.service.ts
started_at: 2026-08-28T02:28:54-07:00
completed_at: 2026-08-28T02:31:31-07:00
elapsed_minutes: 3
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "writeChangeLog 内部抛异常时，remove() 事务是否真的回滚（未构造失败注入测试，见 F001）"
  - "manager.remove 在真实数据库（mysql）下是否可能因外键约束失败但 sqlite 测试不可见——核对 entity 定义后确认 commission_tier / commission_tier_change_log 间无 FK 关系，反例不成立"
affected_regressions:
  - "backend/test/commission-tier.e2e-spec.ts 全 27 用例（含 DELETE 三用例与 change-logs delete golden 用例）"
  - "backend/test/commission-report.e2e-spec.ts:353（已知基线失败，与本次改动无关）"
changed_surface_allowed:
  - "backend/src/commission-tier/commission-tier.service.ts：remove() 方法体重写 + 删除死代码 findOneOrFail()"
```

- 已核对 diff 恰好落在 `remove()` 方法体与 `findOneOrFail` 私有方法删除两个 hunk，`create()`/`update()`/其余方法字节级不变（`git show` 取前后完整文件比对 + `git diff` 逐 hunk 核对）。
- `git diff <reviewed_base> <reviewed_head> -- backend/src/commission-tier/commission-tier.service.ts | sha256sum` = `7edbcdcd5ce38262a5b59c4a97a59303567f469e9a71e4932508fe5aaf75de8e`，与派发值一致。
- 不加路径限制的整棵 tree diff（`git diff --stat`/`--name-only`）确认本次改动只涉及这一个文件，`do-not` 边界（controller/DTO、create()/update()、commission-report.e2e-spec.ts）均未被触碰。
- 工作区当前内容与 `reviewed_head` 逐字节一致（`git diff 960410ef... -- <文件>` 为空）。

## Findings

```yaml
findings:
  - id: ic-b-004-F001
    dimension: test-evidence
    severity: advisory
    type: evidence-gap
    reachability: conditional
    evidence: >
      本次未新增/修改任何测试文件（backend/test/commission-tier.e2e-spec.ts 与 base 相比零差异，
      git diff 2e102a6...960410e -- backend/test/ 无输出）。oracle 明确要求"任一步骤抛异常时整个
      事务回滚"，但现有 27 个用例只覆盖了 happy path（删除成功）和"档位不存在→1004"两条路径，
      没有用例强制 writeChangeLog（或其内部 manager.save）在 manager.remove 之后失败，因此
      "删除已提交但日志写入失败时是否真的回滚（档位应仍存在）"这条 oracle 核心承诺目前只靠
      "与 create()/update() 用同一 dataSource.transaction() 机制、TypeORM 事务语义保证原子性"的
      类比论证，未被可执行测试直接证伪/证实。writeChangeLog 当前唯一可能失败点是
      JSON.stringify(before)，而 before 恒为 {lowerBound, upperBound, unitPrice} 三个简单数值字段
      的普通对象，实践中确实不可能抛错，故不要求补做失败注入测试，仅记录为已知证据缺口。
    impact: unknown（当前代码路径下 writeChangeLog 实际失败概率极低，无可观察的当前风险；仅是
      oracle 原子性承诺缺少直接的失败注入证据）
    action: backlog
    status: open
```

## 逐维度记录

- **contract**：`remove()` 新实现与 oracle 逐句核对一致——`manager.findOne` 查档位、不存在抛 `NotFoundException('阶梯档位不存在')`（1004）、`manager.remove` 删除、`writeChangeLog(manager, 'delete', operator, before, null)` 写日志，四步全部在 `this.dataSource.transaction('SERIALIZABLE', ...)` 回调内，与 `create()`/`update()` 已验证过的写法字面一致。example 描述的"golden：新增一档后又删除该档→两条记录，delete 在前"用例未改动、仍通过，符合"修复只改原子性保证、不改可观察行为"的声明。无发现（核心承诺的失败路径证据缺口见 F001）。
- **scope-and-secrets**：do-not 三条边界（不改 create()/update()、不改 controller/DTO、不碰 commission-report.e2e-spec.ts）均未被触碰，见上方"本轮范围"核对说明；diff 内无超出 `files` 清单的改动；未发现明文密钥/token/密码。无发现。
- **test-evidence**：`npx jest --config test/jest-e2e.json commission-tier` 实测 27/27 通过（含 DELETE 三用例："删除成功""删除中间档位产生空隙""档位不存在→1004"，以及 change-logs 的 delete golden 用例），与任务包声明的用例数一致。`npm run test:e2e` 实测 95 项、1 项失败（`commission-report.e2e-spec.ts:353`，OSS key 旧格式断言），与已知基线（ic-b-001 遗留、已记 backlog）完全吻合，未引入新失败。唯一缺口见 F001（advisory，backlog）。
- **comment-hygiene**：新增注释（remove() 方法头部三行说明事务动机与隔离级别选择理由）未出现任务号/迭代号考古式表述；未新增"不得/禁止 X"类断言。无发现。
- **standards**：任务包 `relevant-standards: []`，无命中规则需要核对。无发现。
- **enforcement**：本任务不是 enforcement/检查器/测试基础设施任务，无对应 surface。无发现。
- **design-fidelity**：纯 backend service 内部实现修复，无前端/UI 改动，无 `design.md`/`prototype.html` 对应交互路径需要核对。无发现。
- **input-provenance**：`remove(id, operator)` 不消费任何请求 DTO——`id` 来自路由参数 `@Param('id')`，`operator` 来自 controller 端 `extractOperator(request)` 从已鉴权 `request.user.username` 服务端派生（`commission-tier.controller.ts:64-72`，本次未改动，仅读取确认）。本次改动的 changed surface 不含任何 DTO class，无字段可穷举。无发现。
- **query-performance**：`remove()` 事务内固定为 1 次 `findOne` + 1 次 `remove`（DELETE）+ 1 次 `writeChangeLog`（INSERT），无循环查询、无未受控 fan-out、无分页后补查；查询数与修复前一致（原实现同样是 3 次操作，只是不在同一事务内）。无发现。
- **concurrency**：核对新事务确实覆盖"查找→删除→写日志"全程（`manager.findOne`/`manager.remove`/`writeChangeLog(manager,...)` 三步全在 `dataSource.transaction()` 回调参数 `manager` 上执行，无任何一步逃出事务用 `this.commissionTierRepository`/`this.changeLogRepository` 直连），修复前原实现里"删除"与"写日志"是两条独立语句，本次改动消除了两者之间的非原子窗口，是对既有并发/原子性问题的正向修复而非引入新问题。`manager.findOne`/`manager.remove` 均为 TypeORM `EntityManager` 上下文中真实存在且用法正确的 API（与 `update()` 里已验证过的 `manager.findOne`/`manager.save` 同构），`NotFoundException` 在事务回调内抛出后由 `dataSource.transaction()`（TypeORM 内部实现，非本次改动代码）负责捕获、回滚并向上抛出——`update()` 早已用同一路径抛同一异常且有"档位不存在→1004"用例通过，remove() 复用同一底层机制，本轮实测 e2e"档位不存在→1004"用例通过，未观察到连接泄漏或未处理 rejection 的信号。剩余未被直接测试证实的失败回滚场景记入 F001。
- **logging-privacy**：本次改动未新增任何 `console.*`/logger 调用，`writeChangeLog` 写入的 `beforeSnapshot`/`afterSnapshot` 只含 `{lowerBound, upperBound, unitPrice}` 数值字段，无凭据/PII/完整请求体/跨租户数据。无发现。
- **maintainability**：新写法与 `create()`/`update()` 同构复用同一事务 + `EntityManager` 惯用法，删除了因此变为死代码的 `findOneOrFail`（已用 `grep -rn "findOneOrFail" backend/src backend/test` 确认全仓无其他调用点），未引入新依赖/新抽象，复杂度未扩张。无发现。
- **sensitive-boundaries**：数据一致性/审计可信度修复，已构造并验证的反例：①原子性覆盖范围——三步操作是否真的全部在事务回调内执行（已核实，见 concurrency 段）；②档位不存在时事务内抛异常是否会产生"部分副作用"（无从 findOne 之后未执行任何写操作，NotFoundException 在第一次数据库读之后、任何 write 之前抛出，无副作用可回滚，`update()` 同结构已有通过用例佐证底层事务机制可靠）；③FK 约束反例——检查 `commission-tier.entity.ts`/`commission-tier-change-log.entity.ts`，两表之间无 `@ManyToOne`/`@OneToMany` 等关系映射，change log 只存 JSON 快照不存外键，故"mysql 下因 FK 约束删除失败但 sqlite 测试不可见"这一反例路径不成立。唯一未被直接测试覆盖、需要证据的场景是"writeChangeLog 步骤本身失败时是否真的回滚"，因该步骤当前实践中失败概率极低（简单数值对象的 JSON.stringify），已在 test-evidence 维度记为 F001（evidence-gap → backlog），未阻断本轮通过。
