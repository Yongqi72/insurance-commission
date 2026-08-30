---
task_id: ic-b-008
round: 1
mode: full
risk: standard
review_profile: b-reviews/ic-b-008/profile-round-01.json
prior_report: null
target_finding_ids: []
base_ref: b4ca68b7d3738d3a1b8dd083df2dc770f5a87e9d
reviewed_base: 8f06180d433a370a3b2d8b7951ed0ca1d872a233
reviewed_head: fb8d5adac79c6ed3dfe7a8474ff8360efb95e6ab
diff_sha256: 19f3aa7f35964d63a6795472f58b6d4188916b7ad9668ffd1463327f4b66bd06
changed_files:
  - backend/src/commission-batch/import.service.ts
  - backend/test/commission-batch-import.e2e-spec.ts
  - frontend/src/api/commission-batch.ts
  - frontend/src/components/ImportPanel.vue
started_at: 2026-08-30T05:15:38Z
completed_at: 2026-08-30T05:21:09Z
elapsed_minutes: 6
escalate_to_full: false
conclusion: pass
---

## 本轮范围

```yaml
counterexamples:
  - "假设 downloadUrl 被误赋值为其它已存在的非空字符串字段（如 item.fileName）而非
    OssClient.getSignedUrl(item.ossKey) 的返回值：读取 backend/src/commission-batch/import.service.ts:166
    确认实际实现是 `downloadUrl: await this.ossClient.getSignedUrl(item.ossKey)`，反例不成立——
    生产代码正确；但 e2e 测试对该字段只断言 typeof/length，未断言其值来自 mock 的
    getSignedUrl 返回值，也未断言 getSignedUrl 被以 item.ossKey 调用，见 test-evidence 维度记录。"
  - "假设前端未真正触发新标签页下载（如漏加 target=_blank 导致同页跳转丢失当前批次详情页）：
    ImportPanel.vue:176-178 的 handleDownloadImport 复用 frontend/src/api/commission-report.ts:162-170
    的 triggerUrlDownload，该函数内部创建 <a target=\"_blank\" rel=\"noopener\"> 并 click()，
    与 ExportHistoryDrawer.vue 的既有『重新下载』完全同一路径——反例不成立。"
  - "假设 SH-API-02 因新增字段引入了未登记的错误码：读取 diff 未新增任何错误码分支，
    getSignedUrl 失败时沿用 OssClient.getSignedUrl 已有的 throw + 全局异常处理（5000），
    与 commission-report.service.ts:189 同款既有路径一致，applies-if（新增错误场景需要
    区分前端处理分支）未真实命中——反例不成立。"
changed_surface_allowed:
  - backend/src/commission-batch/import.service.ts（ImportFileListItemDto + listImports()）
  - backend/test/commission-batch-import.e2e-spec.ts
  - frontend/src/api/commission-batch.ts（ImportRecord 接口）
  - frontend/src/components/ImportPanel.vue（文件名列 + handleDownloadImport）
```

- `full` 模式，按 `review_profile.selected_dimensions`（13 项，omitted 为空）逐项执行。

## 维度逐项

**1. contract**：intent（点击文件名下载原始 Excel）已实现。后端 `listImports()` 每条记录新增
`downloadUrl: await this.ossClient.getSignedUrl(item.ossKey)`（backend/src/commission-batch/import.service.ts:161-167），
与 reference 指定的 commission-report.service.ts:189 同一方法、同一调用形状。前端
`ImportPanel.vue:11-17` 把文件名列从纯文本改为 `<el-button link type="primary">` 触发
`handleDownloadImport` → `triggerUrlDownload(row.downloadUrl)`（frontend/src/components/ImportPanel.vue:175-178）。
任务包 files/do-not 字面写的是 `<a :href target="_blank">`，但同一份 do-not 明确要求
「与导出历史保持同一实现方式」，而导出历史（ExportHistoryDrawer.vue:7-9,61-63）本身用的
正是 `el-button link` + `triggerUrlDownload`（而非模板里字面 `<a>`）。已读 `triggerUrlDownload`
实现（frontend/src/api/commission-report.ts:162-170）：动态创建 `<a href target="_blank" rel="noopener">`
并 click，功能上完全等价于 oracle 描述的『新标签页打开签名 URL 完成下载』。判定：files/do-not
里的 `<a>` 字样是对既有模式的不准确转述（example-error），真正的规范性要求（同导出历史一致）
已满足，不构成 contract-drift。已有字段 id/fileName/importedAt/successCount/failCount 的值和类型
在 diff 中未被触碰。oracle 无发现。

**2. scope-and-secrets**：改动文件与任务包 `files` 清单四个文件逐一对应，无越界改动。未新建
后端下载代理接口（do-not 命中项）。未改动导入/删除导入的既有业务逻辑（解析规则、行级容错、
删除二次确认路径均未触及，diff 只涉及 listImports 的返回值组装）。未发现明文密钥/token/密码。
无发现。

**3. test-evidence**：`commission-batch-import.e2e-spec.ts` 新增断言（第 330-334 行）验证
GET .../imports 返回的每条记录 `downloadUrl` 为非空字符串；已实测运行
`npx jest --config test/jest-e2e.json commission-batch-import.e2e-spec.ts`，12/12 通过（含该断言所在
`GET .../imports 按 imported_at 倒序返回` 用例）。
但该断言判别力有限：mock 里 `getSignedUrl: jest.fn().mockResolvedValue('https://mock-oss.example.com/signed-url')`
未像同文件里的 `ossUploadMock` 那样提升为可断言的具名变量，测试既未断言 `downloadUrl` 的值
等于 mock 返回值、也未断言 `getSignedUrl` 被以每条记录的 `ossKey` 调用——只要实现返回任意非空
字符串（例如误写成 `item.fileName`）该断言同样会通过。该断言仍能捕获『忘记 await 导致
downloadUrl 变成 Promise 对象（typeof !== 'string'）』这一类回归，故非完全空判别，但对『取错字段 /
未真正走 getSignedUrl』这一类回归无区分力。当前生产代码本身经读码确认是正确的
（`await this.ossClient.getSignedUrl(item.ossKey)`），故这是面向未来回归的判别力缺口，不是当前
可复现的行为缺陷。记为 1 条建议级 finding（见下）。前端未新增任何针对 ImportPanel.vue 的单测/组件测试，
但项目里 ExportHistoryDrawer.vue 等同类下载交互组件同样没有对应前端单测（已检索确认），是既有
测试基线常态而非本任务引入的新缺口，不单独记 finding。

**4. comment-hygiene**：新增注释共两处——service 层测试注释「downloadUrl：每条记录都应附带
OssClient.getSignedUrl 生成的签名下载地址（本任务新增字段）」、前端注释「点击文件名下载该次导入
上传的原始 Excel（与导出历史"重新下载"AC-13 同一套签名 URL 交互）」。均未写入任务号/迭代号
（`ic-b-008` 未出现在运行时注释里），AC-13 是 PRD 既有验收编号、用于解释交互来源而非本任务的
迁移考古，与同文件里既有的 `AC-03`/`FE-EP-03` 注释风格一致。无新增“禁止/不得 X”类断言。无发现。

**5. standards**（SH-API-02·错误码约定）：applies-if 是「新增错误场景需要区分前端处理分支」。
本次 diff 未新增任何错误码或错误分支——`getSignedUrl` 失败时复用 `OssClient.getSignedUrl` 内部
既有的 `throw`（backend/src/common/oss/oss-client.ts:104-112），走全局异常处理落到既有 5000，
与 commission-report.service.ts 现有下载 URL 生成路径完全同款，不是本任务新引入的错误场景。
applies-if 未真实命中，规则本身不需要核。无发现。

**6. enforcement**：本任务未新增/改动任何规则检查器、lint 规则或测试基础设施；不适用规则覆盖面
的核验。无发现。

**7. design-fidelity**：新的 `.btn-download-import` 未附加任何自定义 CSS，直接复用
`el-button link type="primary"` 的 Element Plus 默认观感，与同文件里已有的
`.btn-delete-import`（link type="danger"）、以及 ExportHistoryDrawer.vue 的『重新下载』按钮
（同款 `el-button link type="primary"`）视觉模式一致，间接对齐 design.md 的 `$primary` 主色规范
（链接类小面积可点击元素用主色，未引入设计系统外的字面量色值/字号/间距）。项目当前迭代
（V1，已过 V0 骨架）未见 `prototype.html` 交互基准文件覆盖本组件路径，故只核可核的静态 token 项。
无发现。

**8. input-provenance**：本任务接口 `GET /api/commission-batches/:id/imports` 的 `api-contract.request`
为 `{}`；核实 `import.controller.ts:51-54` 的 `findAll(@Param('batchId') batchId: string)` 无
`@Body()` DTO、无查询参数 DTO，本任务 diff 也未新增/改动任何请求 DTO class。
DTO 文件：无（该接口无可提交字段的 DTO class）。字段数 N=0，本表行数=0，覆盖率 0=0 完整。
无发现。

**9. query-performance**：`listImports()` 用 `Promise.all(imports.map(async item => ...))`
对每条记录调用一次 `ossClient.getSignedUrl(item.ossKey)`，形态上是循环内调用，但已读
`OssClient.getSignedUrl`（backend/src/common/oss/oss-client.ts:99-113）实现：内部是
`client.signatureUrl(ossKey, {...})`，ali-oss SDK 的 `signatureUrl` 是纯本地签名计算（不发起
网络请求），不是 DB 查询也不是外部 I/O fan-out；且与 commission-report.service.ts:186-191 完全
同款既有模式，不是本任务新引入的性能特征。无发现。

**10. concurrency**：本次 diff 只改动只读路径（`listImports()` 组装返回值），未涉及任何写入/
事务/唯一约束逻辑；`deleteImport`/导入落库路径均未触碰。无发现。

**11. logging-privacy**：diff 未新增任何 `logger.*` 调用；`downloadUrl`（签名 URL，含临时凭证参数）
未被写入任何日志语句。无发现。

**12. maintainability**：`listImports()` 里的 `Promise.all(imports.map(async item => ({...,
downloadUrl: await this.ossClient.getSignedUrl(item.ossKey)})))` 与
commission-report.service.ts:186-191 的 `exportRecords.map(async record => ({...,
downloadUrl: await this.ossClient.getSignedUrl(record.ossKey)}))` 结构高度重复。但任务包
do-not 明确要求「与导出历史保持同一实现方式」，且抽取公共 helper 会改动 files 清单外的文件、
超出本任务声明范围——这里的重复是既定复用同一模式的直接结果，不构成需要整改的代码坏味道。
无发现。

**13. sensitive-boundaries**：本任务不涉及鉴权/权限/数据隔离变更、不可逆数据操作或金额计算，
只是给既有只读列表接口追加一个签名下载 URL 字段（与已验收上线的导出历史下载同一机制）。
无发现。

## Findings

```yaml
findings:
  - id: ic-b-008-F001
    dimension: test-evidence
    severity: advisory
    type: future-risk
    reachability: unreachable
    evidence: >
      backend/test/commission-batch-import.e2e-spec.ts:330-334 对新增 downloadUrl 字段只断言
      `typeof item.downloadUrl === 'string'` 且 `length > 0`；mock（第 59-61 行 inline 的
      `getSignedUrl: jest.fn().mockResolvedValue('https://mock-oss.example.com/signed-url')`）
      未像同文件 `ossUploadMock` 一样提升为可断言变量，测试未断言 downloadUrl 的值等于该 mock
      的返回值，也未断言 getSignedUrl 被以每条记录的 item.ossKey 调用。若未来有人把
      `downloadUrl: await this.ossClient.getSignedUrl(item.ossKey)` 误改成任意其它非空字符串
      表达式（如 `item.fileName`），当前断言仍会通过，不会翻红。当前读码确认
      backend/src/commission-batch/import.service.ts:166 的生产实现是正确的，本 finding 面向
      的是回归判别力缺口，不是当前可复现的行为缺陷。
    impact: unknown（当前生产行为正确；缺口只在未来代码被错误改动时才会暴露，且当前不可复现）
    action: backlog
    status: open
```

`contract / scope-and-secrets / comment-hygiene / standards / enforcement / design-fidelity /
input-provenance / query-performance / concurrency / logging-privacy / maintainability /
sensitive-boundaries`：无发现。
