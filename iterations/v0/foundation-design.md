# 走骨架设计 · v0

> 由 `draft-foundation` 产出，供 `develop(source=foundation)` 按本文件建地基件 + 标杆切片。只立承重墙，不装修。

## 一、地基件清单（develop 要建的承重墙）

### 后端

| 名称 | 形式 | 关键契约 |
|------|------|---------|
| 鉴权卫士 | 全局 `AuthGuard` + `APP_GUARD` 注册；`@Public()` 装饰器显式 opt-out | 未登录请求默认 401；登录接口本身标 `@Public()`；session/JWT 校验通过后 `request.user` 挂管理员标识 |
| 错误信封 | 全局 `ExceptionFilter`（`APP_FILTER`，`@Catch()`） | 统一返回 `{ code: number, msg: string, data: null }`（`code` 非 0 = 业务/系统错误，见 `standards-shared.md` 错误码约定）；HTTP 状态码随异常类型映射（400/401/404/500） |
| 响应包装 | 全局 `SuccessInterceptor`（`APP_INTERCEPTOR`） | 统一返回 `{ code: 0, msg: 'success', data: T }`；已被拦截器包装过的返回值不重复包装 |
| 入参校验 | 全局 `ValidationPipe`（`whitelist: true, forbidNonWhitelisted: true`） | 所有 DTO 必须有 class-validator 装饰器；校验失败走错误信封 400 |
| 分页协议 | 共享 `PageQueryDto`（`page`/`pageSize`）+ `PageResultDto<T>`（`list`/`total`/`page`/`pageSize`） | 列表类接口统一用该信封，字段名跨前后端一致 |
| 序列化格式 | 共享类型约定 | 时间：ISO 8601 字符串；金额：`number`（元，两位小数）；ID：`string` |
| 认证接口 | `POST /auth/login`（账号+密码）→ 返回 token | 管理员账号密码写入配置/种子数据，非注册开放 |
| 保单记录模块 | `PolicyRecord` Entity + Repository + Service + Controller | 字段：客户名称、工作单号、业务类型、币种、投保人、保险金额、保单号、销售人员姓名（可空）、`import_batch_id`；`GET /policy-records` 分页查询 |

### 前端

| 名称 | 形式 | 关键契约 |
|------|------|---------|
| AppLayout | 顶部导航 + 内容区，登录后路由统一挂在其 `router-view` 下 | 未登录访问业务路由 → 路由守卫重定向 `/login` |
| 全局样式入口 | `main.ts` 唯一 `import '@/styles/index.scss'` | 内含 reset + Element Plus 主题变量覆盖（`--el-color-primary` 等），token 见 `design.md`（V0 阶段先占位默认色，正式视觉由 draft-ux 补） |
| 状态四态脚手架 | `<DataStateWrapper>` 组件，封装 loading/empty/error/success 四态 | 数据页统一引入，四态切换靠传入 `status` prop |
| HTTP 单例 | `api/request.ts` 唯一 Axios 实例 | 请求拦截器注入 `Authorization: Bearer {token}`；响应拦截器识别错误信封 `code !== '0'` 统一 toast + 401 跳转登录 |
| 登录页 | `LoginView.vue` | 账号密码表单 → 调 `/auth/login` → token 存 `localStorage` → 跳首页 |
| 保单记录列表页 | `PolicyRecordListView.vue` | 表格 + 分页，接入 `DataStateWrapper` 四态，调 `GET /policy-records` |

## 二、贯穿作用域的构造级落地

**不适用**：foundation.md 已判定数据隔离/作用域不适用（无多租户边界，管理员可见全量数据），故无需作用域 base repo，Service 直接用 TypeORM 标准 Repository。

## 三、标杆穿透切片

- **切片**：保单记录列表查询（核心实体「保单记录」的最简读操作——登录后查看已导入的保单记录）
- **端到端路径**：登录页（AppLayout 外）→ 登录成功进 AppLayout → 保单记录列表页 → HTTP 单例（携带 token）→ 后端鉴权 Guard → 全局校验管道（分页查询参数）→ Controller → Service → TypeORM Repository → MySQL `policy_record` 表 → 响应经 SuccessInterceptor 包装（分页信封）→ 前端 `DataStateWrapper` 渲染四态（V0 阶段无数据即渲染空态，验证四态而非真实业务数据）
- **它同时是标杆模块**：登录 + 保单记录列表按范本质量建（DTO 校验、分页信封、四态、异常路径均覆盖），`develop` 收尾登记进 `reusables.md` 供后续列表页照抄。

> V0 走骨架不含 Excel 导入、第三方接口回填、提成阶梯计算——这些是 V1 功能范畴，仅在此验证架构闭环；`calcCommission()` 单一权威函数的骨架（空实现 + 单测占位）可选择性搭出但不接真实规则，具体由 develop 按最小承重原则取舍。
