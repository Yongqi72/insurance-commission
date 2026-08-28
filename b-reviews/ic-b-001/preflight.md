<!-- develop freshness preflight 留痕模板；A/B 共用。只记当前核对结果，不写开发过程叙事。 -->
---
task_id: ic-b-001
source: optimization
timing: before-code
started_at: 2026-08-28T06:10:00Z
completed_at: 2026-08-28T06:11:00Z
base_ref: b885bd9f8516cde0a4c78211c806586023055b4f
base_tree: f0951b633ebb7a8d81e0f0a4d57818f0407eb883
result: pass
spec_minutes: 1
---

## 核对结果

| 面 | 证据锚 | 结论 |
|---|---|---|
| files / reference | `common/oss/oss-key.util.ts` 不存在（待新建）；`import.service.ts:80`/`commission-report.service.ts:161` 现状确认为 `imports/${batchId}/${Date.now()}-${fileName}` / `exports/${batchId}/${Date.now()}-${fileName}`，与任务包描述一致 | current |
| upstream mechanism / contract | 本包不改动 `OssClient` 本身、不新增/改动后端接口契约，纯内部 key 拼接方式变更，无上游依赖 | N/A |
| intent / oracle / example | 3 条 AC 引用的旧 key 拼接位置/函数签名设想均可在当前代码定位，无漂移 | current |
| do-not / escalate-if / owner | 未见冲突 | current |
| supersedes / retirement | 旧 key 格式（按 batchId 分层）将被新格式完全取代，非并存；本次为纯代码改动，无历史已归档文件需要处理（do-not 已声明不做迁移） | current |

## 路由

```yaml
findings: []
```
