---
task_id: ic-mt-001
source: manual-test
timing: before-code
started_at: 2026-08-30T05:44:26Z
completed_at: 2026-08-30T05:46:00Z
base_ref: 6cdcc22dac084eaad6d3448ec5480ee4400d9509
base_tree: 961f3f64a23d9a2eba5be6b7521eab44eca4b378
result: pass
spec_minutes: 2
---

## 核对结果

| 面 | 证据锚 | 结论 |
|---|---|---|
| files / reference | `backend/src/policy-record/policy-record.entity.ts:74`（`importBatchId`）/`:96`（`importFileId`）现状确认仍为普通 `@Column`，未变 | current |
| files / reference | `backend/src/policy-record/policy-record.entity.spec.ts`：确认现状为隔离 `:memory:` DataSource，`entities: [PolicyRecord]` 只注册单实体 | current |
| upstream mechanism / contract | `backlog.md` 2026-08-27 条目已有更详细的既往评估结论（比任务包 context 引用的摘要更具体）：① 隔离单测按当前 `entities: [PolicyRecord]` 加关系装饰器会在 `initialize()` 阶段因找不到关联实体元数据报错；② SQLite 默认不开 `PRAGMA foreign_keys`，即使加了装饰器 e2e 也不会真正拦截违规写入 | current，且比任务包写作时掌握的信息更充分，非过期漂移 |
| upstream mechanism / contract | 核实无 `ClassSerializerInterceptor` 全局拦截器，`policy-record-query.service.ts` 直接返回 entity 对象包在 `PageResultDto` 里；若关系不设 `eager: true` 且查询不显式 `relations: [...]`，关系属性值为 `undefined`，JSON.stringify 会自然丢弃该 key，不会意外出现在响应里——technical premise：只要不设 eager/不在现有查询加 relations，响应契约不受影响 | current，任务包 AC 里"不改变响应契约"这条可达成 |
| intent / oracle / example | 任务包唯一技术判断依赖"实测 npm run test + test:e2e 是否全绿"作为 oracle，backlog 既往结论是**分析性预判**（未见实测记录直接证实"会报错"），需要按 AC 要求真正跑一次而非照抄旧结论 | current，AC 要求的实测尚未执行，任务仍需推进 |
| do-not / escalate-if / owner | do-not（不改列名/类型/nullable、不新增级联行为）与当前 schema 无冲突 | current |
| supersedes / retirement | 任务包 `supersedes: []` | N/A |

## 路由

```yaml
findings: []
```

补充说明：backlog.md 既有结论提供了有价值的风险预判（隔离单测的 entities 数组需要连带扩展），
本任务按 AC 走"实测验证"路径复核该预判是否成立、以及是否只需扩展 `entities: [PolicyRecord, CommissionBatch, ImportFile]`
这样的小范围调整即可解决，而非如 backlog 原文暗示的"连带重构"。
