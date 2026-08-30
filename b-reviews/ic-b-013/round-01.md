---
task_id: ic-b-013
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-013/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: 0024173edef456212a709a87bda1f3f2b7bdc870
reviewed_base: ddcc18bb8c0302686c986ba5c5ab62c7a8be372e
reviewed_head: 3c9c3d400764eff3c217888617bac832d85e92aa
diff_sha256: 941fdbc9118e7ff02c87c5391f6a9c271f08555f2ec9b7b050f4e43178651b72
changed_files:
  - backend/src/commission-report/commission-report.service.ts
  - backend/src/common/excel/excel-builder.ts
  - backend/test/commission-report.e2e-spec.ts
  - frontend/src/api/commission-report.ts
  - frontend/src/components/CommissionSummaryPanel.vue
started_at: 2026-08-30T08:54:09Z
completed_at: 2026-08-30T08:58:03Z
elapsed_minutes: 4
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples: []
affected_regressions: []
changed_surface_allowed:
  - backend/src/commission-report/commission-report.service.ts
  - backend/src/common/excel/excel-builder.ts
  - backend/test/commission-report.e2e-spec.ts
  - frontend/src/api/commission-report.ts
  - frontend/src/components/CommissionSummaryPanel.vue
```

`git diff ddcc18bb8c0302686c986ba5c5ab62c7a8be372e 3c9c3d400764eff3c217888617bac832d85e92aa` sha256 verified to match `941fdbc9118e7ff02c87c5391f6a9c271f08555f2ec9b7b050f4e43178651b72` before review. Diff touches exactly the 5 declared files, no extras. `git status` shows only these 5 tracked files modified (untracked files are unrelated review/session artifacts, not part of this diff).

Verification runs (all green, no lint autofix drift after run — confirmed via `git status --short` post-lint):
- `backend`: `npm run build` OK; `npm run lint` OK (no changes); `npm run test` — 13 suites / 56 tests pass; `npm run test:e2e -- commission-report.e2e-spec.ts` — 1 suite / 20 tests pass, including both new `ic-b-013` cases.
- `frontend`: `npm run build` OK (`vue-tsc -b && vite build`); `npm run lint:check` OK; `npm run stylelint:check` OK. No frontend unit-test framework exists in this repo (confirmed no `*.spec.ts`/`*.test.ts` under `frontend/src`, no vitest dependency) — this is a pre-existing project convention, not a gap introduced by this task.

## Dimension-by-dimension notes

- **contract**: `CommissionSummaryGroupDto`/`CommissionSummaryGroup` (frontend) both add a required (non-optional) `unmatchedCount: number`, matching `api-contract` in the task package field-for-field (name, type, nesting, non-optional). `ExcelBuilderGroup.unmatchedCount?` is intentionally optional (internal builder type, not part of the public JSON contract) — reasonable. `getSummary()` and `exportReport()` compute `unmatchedCount` from the same `groupRecords` array produced by the shared `groupByPolicyholder()`, using the identical filter predicate `record.salesFillSource === 'unmatched'` in both places (`commission-report.service.ts:94-96` and `:137-139`) — no divergence between the two implementations. `totalRow` (export) is still `items.reduce(...)` only (`:150-156`, unchanged shape), and the live `subtotal` is still `items.reduce(...)` only (`:93`) — unmatched records never enter either sum; verified by reading the code, not just trusting the comment. `ExcelBuilder.build()` appends the unmatched row after `summaryRows.forEach` and before the empty-row + `合计` row (`excel-builder.ts:94-109`) — correct position, and it writes `[UNMATCHED_ROW_LABEL, group.unmatchedCount, 0]` i.e. commission column is literal `0`, which is sensible (not blank — keeps the sheet numeric-typed and matches how `合计` column reads). Frontend "未匹配 N 票" row (`CommissionSummaryPanel.vue:45-51`) is inside the `v-else` (non-empty) branch and gated only on `group.unmatchedCount > 0`, independent of `items.length` — renders whether items is empty or non-empty, matching oracle's "不论该分组是否还有其他已匹配的销售行，都要展示". Empty-hint fallback correctly narrowed to `items.length === 0 && unmatchedCount === 0` (`:33`). The companion `firstEmptyPolicyholder`/`#card-commission-empty` id-adjustment (`:95-99`) is genuinely necessary, not scope creep: that id is consumed by `iterations/v1/prototype-map.md`'s AC-16 mapping and represents the "空态文案" card; without narrowing the condition, a group with `items.length===0` but `unmatchedCount>0` (which now shows "未匹配 N 票", not the empty-hint text) would incorrectly receive that id. Verified no other file references `#card-commission-empty`.
  `contract`: 无发现。

- **scope-and-secrets**: diff stays within the 5 declared `files`; no `do-not` item touched — matched-record calc/display logic (`ticketCount`/`commission`/`calcCommission()`/`ruleComplete()`) untouched, `totalRow`/`subtotal` untouched in value, existing GET fields (`ruleComplete`/`policyholder`/`items`/`subtotal`) unchanged in type/value (pure addition), Excel detail-row building block untouched. No credentials/tokens/keys in diff.
  `scope-and-secrets`: 无发现。

- **test-evidence**: New e2e cases exercise both endpoints with a group that mixes 3 matched + 2 unmatched records, asserting `unmatchedCount`, `items`/`subtotal` unaffected, the exported unmatched row's exact values, and the export `合计` row unaffected (`commission-report.e2e-spec.ts:98-128`, `:144-179`). The pre-existing all-unmatched AC-16 case was updated in place to assert `unmatchedCount: 10` (`:88-93`). These have real discriminating power for the correctness properties named in `known-risks` (totalRow not inflated by unmatched). One gap: `findRowValues()` (`:34-49`) matches by row-content equality scanned across the whole sheet, not by row index, so the export assertions don't pin *ordering* (unmatched row strictly between summary rows and `合计`) nor is there a negative case proving no unmatched row is emitted when `unmatchedCount === 0` on a mixed-group sheet — a regression that duplicated or mis-ordered the row could still pass these specific assertions. I read `excel-builder.ts:94-109` directly and confirmed the actual ordering/gating is correct, so this is a test-strength gap, not a live bug. See ic-b-013-F001.
  `test-evidence`: see ic-b-013-F001 (advisory).

- **comment-hygiene**: Several new comments embed the task id `ic-b-013` directly in runtime code comments rather than leaving it to git history: `commission-report.service.ts:9` ("AC ic-b-013"), `excel-builder.ts:53` ("AC ic-b-013"), `frontend/src/api/commission-report.ts:16` ("ic-b-013"), `CommissionSummaryPanel.vue:93,253` ("ic-b-013"). Grepped the rest of `backend/src`/`frontend/src` for other `ic-b-0*`/`ic-v1-0*` task-id literals — none found, so this is not an established codebase convention (pre-existing `AC-16`-style acceptance-criteria citations are a different, already-established pattern and are not flagged). Advisory per dimension rules. See ic-b-013-F002.
  `comment-hygiene`: see ic-b-013-F002 (advisory).

- **standards**: `relevant-standards: []` in the task package — no rule ids to check.
  `standards`: 无发现（无命中规则）。

- **enforcement**: Diff adds no new rule/checker/test-infrastructure mechanism (no eslint rule, no CI gate, no new test harness) — nothing in this diff's surface falls under this dimension.
  `enforcement`: 无发现。

- **design-fidelity**: New `.commission-summary-panel__row--unmatched { color: $text-hint; }` uses an existing design.md token (`$text-hint` = `#8F959E`, documented as "辅助文字、占位文字"), already used elsewhere in this same file (`__empty-hint`, `__unconfigured`, `__no-data`) — consistent, no hardcoded hex/literal introduced, and it matches the oracle's own suggested treatment ("如置灰/次要文字色"). No new markup deviates from `design.md`'s grid/spacing/typography tokens (all new markup reuses `$space-*`/`$fs-caption` classes already in the file). `iterations/v1/prototype.html`/`prototype-map.md` predate this optimization task and don't model the unmatched row, so there's no prototype interaction path to diff against for this specific addition.
  `design-fidelity`: 无发现。

- **input-provenance**: The two touched endpoints (`GET .../commission-summary`, `GET .../commission-report`) take no request body — controller methods only take the existing, unrelated `@Param('id')` (`commission-report.controller.ts:30,42`). No request DTO exists or was added in this diff's surface. DTO file/class: none in scope; field count N = 0; table rows = 0 (covers N).
  `input-provenance`: 无发现（本次改动无请求 DTO 可枚举）。

- **query-performance**: `unmatchedCount` in both `getSummary()` and `exportReport()` is computed via `Array.filter()` over the already-loaded `groupRecords` (produced once by `groupByPolicyholder()` from the single `loadBatchRecords()` query) — no new query, no per-iteration query, no N+1 introduced.
  `query-performance`: 无发现。

- **concurrency**: Diff has no write/transaction/uniqueness surface — both touched methods are read paths (`getSummary`) or an existing write path whose write logic (`exportRecordRepository.save`/OSS upload/cleanup) is untouched by this diff.
  `concurrency`: 无发现。

- **logging-privacy**: No new logging statements added in the diff.
  `logging-privacy`: 无发现。

- **maintainability**: The `unmatchedCount` filter (`groupRecords.filter((record) => record.salesFillSource === 'unmatched').length`) is duplicated verbatim between `getSummary()` (`:94-96`) and `exportReport()` (`:137-139`), whereas the existing pattern in this same class already extracts shared per-group computation into private helpers reused by both methods (`groupByPolicyholder()`, `buildSummaryItems()`). The two copies are currently identical (no drift today), so this is a minor, non-urgent duplication rather than a correctness issue. See ic-b-013-F003.
  `maintainability`: see ic-b-013-F003 (advisory).

- **sensitive-boundaries**: Selected via fail-safe (metadata incomplete), effective_risk is `standard`. Change is purely additive counts on an already-authenticated, already-existing read/export path (route-level auth unchanged); no permission/isolation/irreversible-operation/money-calculation logic touched (commission math itself is untouched, only a count of already-fetched excluded records is surfaced).
  `sensitive-boundaries`: 无发现。

## Findings

```yaml
findings:
  - id: ic-b-013-F001
    dimension: test-evidence
    severity: advisory
    type: evidence-gap
    reachability: unreachable
    evidence: >
      backend/test/commission-report.e2e-spec.ts's findRowValues() (line 34-49) matches by
      row-content equality scanned over the whole sheet, not by row index. The new export
      assertions (line 144-179) prove the unmatched row's values and the 合计 row's values
      each exist somewhere in the sheet, but do not pin that the unmatched row sits strictly
      between summaryRows and 合计 (oracle: "在既有销售行之后、合计行之前"), nor is there a
      negative-case assertion that no unmatched row appears when unmatchedCount === 0 on a
      mixed-group sheet. Read backend/src/common/excel/excel-builder.ts:94-109 directly and
      confirmed the actual build() ordering/gating is correct — this is a test-strength gap,
      not a live bug (reachability: unreachable, since the current code is correct).
    impact: unknown — a future regression that duplicates, mis-orders, or wrongly-gates the
      unmatched row would not necessarily fail these specific assertions.
    action: backlog
    status: advisory
  - id: ic-b-013-F002
    dimension: comment-hygiene
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      Task id "ic-b-013" is embedded literally in new runtime comments at
      backend/src/commission-report/commission-report.service.ts:9, backend/src/common/excel/excel-builder.ts:53,
      frontend/src/api/commission-report.ts:16, and frontend/src/components/CommissionSummaryPanel.vue:93,253.
      Grep of backend/src and frontend/src found no other ic-b-0*/ic-v1-0* task-id literals in
      source comments, so this is not an established codebase convention (unlike the pre-existing
      AC-16-style acceptance-criteria citations, which are a separate, already-used pattern).
    impact: none currently observable; matches the comment-hygiene dimension's own example of
      what should stay in git/decisions rather than runtime comments.
    action: backlog
    status: advisory
  - id: ic-b-013-F003
    dimension: maintainability
    severity: advisory
    type: future-risk
    reachability: current
    evidence: >
      backend/src/commission-report/commission-report.service.ts:94-96 and :137-139 both compute
      unmatchedCount via the identical literal
      `groupRecords.filter((record) => record.salesFillSource === 'unmatched').length`, duplicated
      rather than extracted into a shared private helper — inconsistent with this class's existing
      pattern of extracting shared per-group computation (groupByPolicyholder(), buildSummaryItems())
      into single reused private methods. The two copies are currently identical (no drift today).
    impact: none currently observable; risk is future drift between the two call sites if one is
      edited without the other.
    action: backlog
    status: advisory
```
