# 可复用资产 · insurance-commission

> draft-tech-design 前读取，了解已有资产再做共享组件建议。
> develop 过程中发现新资产随时追加。

## 已落地资产

### 前端工具层

| 资产 | 性质 | 路径 | 适用场景 |
|------|------|------|---------|
| `request.ts` Axios 单例 | 参考实现/活文档 | `frontend/src/api/request.ts` | 新增 API 模块统一复用，禁止另建 `axios.create()` |
| `format.ts` 日期格式化 | 参考实现 | `frontend/src/utils/format.ts` | 组件内需要格式化 `Date`/时间字符串时复用（FE-UTIL-01） |
| `storage.ts` localStorage key 常量 | 参考实现 | `frontend/src/constants/storage.ts` | 新增持久化字段先在此登记（FE-CONST-01） |

### 前端组件层（已接入页面）

| 资产 | 性质 | 路径 | 适用场景 |
|------|------|------|---------|
| `AppLayout.vue` | 参考实现/活文档，新页面照此骨架样式做 | `frontend/src/layouts/AppLayout.vue` | 所有业务页面路由的外壳，新增页面嵌套在其 `children` 下 |
| `DataStateWrapper.vue` | 参考实现，新数据页照此接入 | `frontend/src/components/DataStateWrapper.vue` | 表格/详情等数据页封装加载/空/错/成四态 |
| `PolicyRecordListView.vue` + `policy-record.ts`（API 模块） | **标杆模块**，新列表页照此范本质量做 | `frontend/src/views/PolicyRecordListView.vue` / `frontend/src/api/policy-record.ts` | 分页列表页的命名/分层/四态接入范例 |

### 前端组件层（已就绪，待接入）

| 资产 | 性质 | 路径 | 适用场景 |
|------|------|------|---------|
|（首期为空）| | | |

### 后端公共层

| 资产 | 性质 | 路径 | 适用场景 |
|------|------|------|---------|
| `JwtAuthGuard` + `@Public()` | 参考实现/活文档 | `backend/src/common/guards/jwt-auth.guard.ts`、`backend/src/common/decorators/public.decorator.ts` | 全局鉴权，新增接口默认受保护，免鉴权需显式加 `@Public()` |
| `AllExceptionsFilter` | 参考实现/活文档 | `backend/src/common/filters/all-exceptions.filter.ts` | 全局错误信封，新模块无需重复处理异常返回格式 |
| `SuccessInterceptor` | 参考实现/活文档 | `backend/src/common/interceptors/success.interceptor.ts` | 全局响应包装，Controller 直接 `return` 业务数据即可 |
| `PageQueryDto` / `PageResultDto` | 参考实现 | `backend/src/common/dto/page-query.dto.ts`、`backend/src/common/dto/page-result.dto.ts` | 新增分页列表接口统一复用 |
| `decimal.transformer.ts` / `numeric-id.transformer.ts` | 参考实现 | `backend/src/common/transformers/` | 金额/ID 字段序列化格式统一复用 |
| `auth` 模块 + `policy-record` 模块 | **标杆模块**，新后端模块照此范本质量做 | `backend/src/auth/`、`backend/src/policy-record/` | Controller/Service/DTO 分层、命名规范、错误路径覆盖的参考范例，含 e2e 测试写法（`backend/test/policy-record.e2e-spec.ts`） |

## 建议已拒绝

> 归档约定：本表只保存仍可能影响当前共享组件取舍的拒绝理由；当拒绝建议超过 20 条时，将纯历史或已不再影响当前判断的条目剪切到同目录 `reusables-history.md`（沿用同表头），本表保留活跃判断并留一行索引指针。上方「已落地资产」不归档：资产下线时直接删行。

| 资产建议 | 拒绝原因 | 日期 |
|---------|---------|------|
|（首期为空）| | |
