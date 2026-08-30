---
task_id: ic-b-008
source: optimization
timing: before-code
started_at: 2026-08-30T05:09:50Z
completed_at: 2026-08-30T05:10:08Z
base_ref: b4ca68b7d3738d3a1b8dd083df2dc770f5a87e9d
base_tree: 8f06180d433a370a3b2d8b7951ed0ca1d872a233
result: pass
spec_minutes: 1
---

## 核对结果

| 面 | 证据锚 | 结论 |
|---|---|---|
| files / reference | `backend/src/commission-batch/import.service.ts:39`（`ImportFileListItemDto`）/`:150`（`listImports()`）现状确认无 downloadUrl 字段 | current |
| files / reference | `backend/src/commission-batch/import-file.entity.ts:27-31`（`ossKey` 字段，注释即写"用于经 OssClient 生成签名 URL 下载原始文件"）| current |
| upstream mechanism / contract | `backend/src/commission-report/commission-report.service.ts:186-191`（`downloadUrl: await this.ossClient.getSignedUrl(record.ossKey)` 既有可复用模式）| current |
| files / reference | `backend/test/commission-batch-import.e2e-spec.ts:272/281/292`（GET .../imports 既有用例位置）| current |
| files / reference | `frontend/src/api/commission-batch.ts:48`（`ImportRecord` 接口）、`frontend/src/components/ImportPanel.vue:11`（文件名列渲染）| current |
| intent / oracle / example | 唯一 AC：GET 响应加 downloadUrl + 前端超链接，任务包 example 可按当前接口/组件现状直接复算 | current |
| do-not / escalate-if / owner | do-not 边界（不改导入/删除逻辑、不改已有字段、不建下载代理接口）与当前代码结构无冲突；escalate-if 为空 | current |
| supersedes / retirement | 任务包 `supersedes: []` | N/A |

## 路由

```yaml
findings: []
```
