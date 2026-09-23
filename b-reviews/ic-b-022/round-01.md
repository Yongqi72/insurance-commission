---
task_id: ic-b-022
round: 1
mode: full
risk: sensitive
review_profile: b-reviews/ic-b-022/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 3e0b654b4c5f16f2b95a8f5b03840b737d71b2f3
reviewed_base: 1f4c31a8cbf9072afc60673c63607389787136b6
reviewed_head: 8631f9883240e9f2f9b9948daf8cbce38dd3f414
diff_sha256: 6d3a13b36dd399d829b2eeb0b3c308fd0a58922f6b84034d9b5f2cd31895e9f4
changed_files: [backend/package.json, backend/package-lock.json, backend/src/auth/auth.module.ts, backend/src/auth/auth.controller.ts, backend/test/auth-throttle.e2e-spec.ts]
started_at: 2026-09-23T01:23:12Z
completed_at: 2026-09-23T01:29:27Z
elapsed_minutes: 7
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples: []
affected_regressions:
  - "cd backend && npm run test:e2e -- auth-throttle 独立重跑：2/2 通过（同一 IP 前5次 401/201，第6次 429，密码比对不执行）"
  - "cd backend && npm run test:e2e（全量）独立重跑：7 suites / 119 tests 全部通过，无回归"
  - "cd backend && npm test（全量单元测试）独立重跑：13 suites / 69 tests 全部通过，auth.service.spec.ts 未受影响"
  - "npm audit：@nestjs/throttler 本身未出现在漏洞列表中；既有 moderate 级漏洞为改动前既存问题，与本次 diff 无关"
changed_surface_allowed: [backend/package.json, backend/package-lock.json, backend/src/auth/auth.module.ts, backend/src/auth/auth.controller.ts, backend/test/auth-throttle.e2e-spec.ts]
```

按 `profile-round-01.json` 的 `selected_dimensions`（13/13 全选）逐项执行，risk=sensitive 审查更严格。

## 维度覆盖

1. **contract**：核心 oracle 子句（60 秒窗口最多 5 次、第 6 次 429、限流在密码比对之前生效、`auth.service.ts`
   逻辑未改动）均被 e2e 证明且独立重跑通过；2 条子句（窗口重置、跨 IP 隔离）缺自动化实证，见 F002。
2. **scope-and-secrets**：无发现。diff 只涉及 profile 列出的 5 个文件，无明文凭据。
3. **test-evidence**：无阻断发现。e2e 断言精确到状态码序列，`beforeEach` 每用例新建 app 实例避免跨用例污染。
4. **comment-hygiene**：见 F001。
5. **standards**：无发现（relevant-standards: []）。
6. **enforcement**：无发现。`ThrottlerGuard` fail-closed 已读源码核实（`throttler.guard.js` L119-136）。
7. **design-fidelity**：不适用，backend-only。
8. **input-provenance**：无发现，本次 diff 未触碰 `LoginDto`。
9. **query-performance**：无发现，无查询面。
10. **concurrency**：无发现，限流状态委托给 @nestjs/throttler 官方默认实现。
11. **logging-privacy**：无发现，无新增日志语句。
12. **maintainability**：无发现，局部 guard 写法是官方推荐标准写法。
13. **sensitive-boundaries**：逐条核实 do-not 四条均合规（不做账号级永久锁定、auth.service.ts 未改动、
    响应体结构未变、未对其他接口新增限流）；全局 JwtAuthGuard 先于局部 ThrottlerGuard 执行，
    `@Public()` 与限流互不冲突，无鉴权绕过、无误拦截。2 条子句证据缺口见 F002。

## Findings

```yaml
findings:
  - id: ic-b-022-F001
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      auth.controller.ts/auth.module.ts 新增注释含"（ic-b-022）"；auth-throttle.e2e-spec.ts 文件头
      注释含"(ic-b-022)"。三处均把任务号写入运行时/测试代码注释。
    impact: 不影响运行行为；长期维护时新读者可能误以为需要回查任务包才能理解注释含义。
    action: backlog
    status: advisory
  - id: ic-b-022-F002
    dimension: contract
    severity: advisory
    type: evidence-gap
    reachability: conditional
    evidence: >
      oracle 的"60 秒窗口滑动过后同一 IP 恢复可正常请求"与"不同 IP 之间互不影响"两条子句，测试文件
      未验证（前者需真实等待 60s，后者需多 IP 场景），目前只依赖 @nestjs/throttler 库自身默认实现担保。
    impact: >
      unknown（最坏情况是过度限流影响合法用户正常登录节奏，非鉴权绕过/密码暴力破解可行，不构成新安全漏洞）。
    action: request-evidence
    status: advisory
```

## 结论

`conclusion: pass`。核心 oracle 与 do-not 四条均有可复现证据，独立重跑 e2e/单测/npm audit 全部通过。
2 条 advisory finding 均非阻断，路由 backlog / request-evidence，不需要本任务返工。
