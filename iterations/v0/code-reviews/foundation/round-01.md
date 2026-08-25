---
task_id: foundation
round: 1
mode: full
risk: sensitive
review_profile: foundation-review/v1
prior_report: null
target_finding_ids: []
base_ref: b7f237a4061091f5e6be3a075da39dffec3944a3
reviewed_base: 82cdd3a7e7eeaf117cff623fbbca541974fe4ab8
reviewed_head: eedc94f3a0714f011b29050bd17fd9d0a8c34a6f
diff_sha256: c6541972f61b37a34e50ff87d774f45ae8d081d828af2261bf481cee2033620b
changed_files:
  - backend/.env.example
  - backend/.eslintrc.js
  - backend/.gitignore
  - backend/.prettierrc
  - backend/README.md
  - backend/data/.gitkeep
  - backend/nest-cli.json
  - backend/package-lock.json
  - backend/package.json
  - backend/src/app.module.ts
  - backend/src/auth/auth.controller.ts
  - backend/src/auth/auth.module.ts
  - backend/src/auth/auth.service.spec.ts
  - backend/src/auth/auth.service.ts
  - backend/src/auth/dto/login.dto.ts
  - backend/src/common/constants/error-code.enum.ts
  - backend/src/common/decorators/public.decorator.ts
  - backend/src/common/dto/page-query.dto.spec.ts
  - backend/src/common/dto/page-query.dto.ts
  - backend/src/common/dto/page-result.dto.ts
  - backend/src/common/filters/all-exceptions.filter.ts
  - backend/src/common/guards/jwt-auth.guard.spec.ts
  - backend/src/common/guards/jwt-auth.guard.ts
  - backend/src/common/interceptors/success.interceptor.ts
  - backend/src/common/transformers/decimal.transformer.ts
  - backend/src/common/transformers/numeric-id.transformer.ts
  - backend/src/config/typeorm.config.ts
  - backend/src/main.ts
  - backend/src/policy-record/dto/query-policy-record.dto.ts
  - backend/src/policy-record/policy-record.controller.ts
  - backend/src/policy-record/policy-record.entity.ts
  - backend/src/policy-record/policy-record.module.ts
  - backend/src/policy-record/policy-record.service.ts
  - backend/test/jest-e2e.json
  - backend/test/jest-e2e.setup.ts
  - backend/test/policy-record.e2e-spec.ts
  - backend/tsconfig.build.json
  - backend/tsconfig.json
  - frontend/.env.development
  - frontend/.gitignore
  - frontend/.stylelintignore
  - frontend/.stylelintrc.json
  - frontend/.vscode/extensions.json
  - frontend/README.md
  - frontend/eslint.config.js
  - frontend/index.html
  - frontend/package-lock.json
  - frontend/package.json
  - frontend/src/App.vue
  - frontend/src/api/auth.ts
  - frontend/src/api/policy-record.ts
  - frontend/src/api/request.ts
  - frontend/src/components/DataStateWrapper.vue
  - frontend/src/constants/storage.ts
  - frontend/src/layouts/AppLayout.vue
  - frontend/src/main.ts
  - frontend/src/router/index.ts
  - frontend/src/stores/auth.ts
  - frontend/src/styles/index.scss
  - frontend/src/styles/variables.scss
  - frontend/src/types/enums.ts
  - frontend/src/utils/format.ts
  - frontend/src/views/LoginView.vue
  - frontend/src/views/PolicyRecordListView.vue
  - frontend/tsconfig.app.json
  - frontend/tsconfig.json
  - frontend/tsconfig.node.json
  - frontend/vite.config.ts
started_at: 2026-08-25T09:29:20Z
completed_at: 2026-08-25T09:42:00Z
elapsed_minutes: 13
escalate_to_full: false
conclusion: revise
---

## 本轮范围

```yaml
counterexamples:
  - 新增未标注 @Public() 的 ProbeController，探测全局 JwtAuthGuard 是否默认拦截（构造级验证：通过）
  - login 请求体附加未声明字段 isAdmin，探测 ValidationPipe forbidNonWhitelisted 是否真拒绝（构造级验证：通过）
  - PolicyRecord 重复 work_order_no 直接走 Repository.save() 插入，探测 DB 唯一约束是否真生效（构造级验证：通过）
  - .vue 组件内写裸色值/裸间距，探测 stylelint 是否真红（机械级验证：通过）
  - .vue 组件内写 body 选择器，探测全局选择器限制是否真红（机械级验证：通过）
  - router/index.ts 顶层新增一条不嵌套在 AppLayout children 下的路由，探测"业务路由无法绕开外壳"是否真被挡（构造级验证：未挡，build/lint/type-check 全绿）
  - frontend 新增文件直接 axios.create() 建第二个实例，探测"唯一 Axios 实例"是否真被挡（构造级验证：未挡，build/lint/type-check 全绿）
affected_regressions: []
changed_surface_allowed: [backend/, frontend/]
```

- 本轮为 Foundation 首轮 `full`：按 brief 逐类穷举执行，未做维度裁剪。
- 所有探针均写在项目外/临时改动，验证后已还原；`git write-tree` 复核改动后的 tree 仍等于 `eedc94f3a0714f011b29050bd17fd9d0a8c34a6f`，未污染 commit。

## 一、强制边达标（逐关注点穷举）

`foundation.md`「二」表共 **14 行已填实关注点**（含"数据隔离/作用域"1 行"不适用"），下表逐行穷举，**N=14，本表行数=14，覆盖率闭合**。

| # | 关注点 | 应有档 | 实际形式（代码在哪） | 反例验证（撞了什么·结果） | 实测档 | 结论 |
|---|--------|--------|----------------------|--------------------------|--------|------|
| 1 | 数据隔离/作用域 | 不适用 | 无作用域 base repo，`PolicyRecordService` 直接用标准 `Repository`（`backend/src/policy-record/policy-record.service.ts:12-17`） | 不适用，无需反例 | 不适用 | 达标 |
| 2 | 鉴权/越权 | 机械级（登录门可选）；实际选型构造级 | 全局 `JwtAuthGuard`（`APP_GUARD` 注册，`backend/src/app.module.ts:25`），`@Public()` 显式 opt-out（`backend/src/common/decorators/public.decorator.ts`） | 新建 `ProbeController`（无 `@Public()`）注入 `AppModule`，未带 token 请求 → 实测 401（`code:1002`）；探针已还原 | 构造级 | 达标（超出应有档，符合"能上不停"） |
| 3 | 错误信封/异常处理 | 构造级 | 全局 `AllExceptionsFilter`（`APP_FILTER`，`@Catch()`，`backend/src/common/filters/all-exceptions.filter.ts`） | e2e 测试覆盖 401/400 均返回 `{code,msg,data:null}`（`backend/test/policy-record.e2e-spec.ts`），亲自 `npm run test:e2e` 复跑全绿 | 构造级 | 达标（未测 `@Res()` 逃生口，见下方说明，不计入本行阻断） |
| 4 | 请求管道/响应包装 | 构造级 | 全局 `SuccessInterceptor`（`APP_INTERCEPTOR`，`backend/src/common/interceptors/success.interceptor.ts`） | 同上 e2e：登录成功/列表查询均见 `{code:0,msg:'success',data}` | 构造级 | 达标（同 `@Res()` 逃生口说明） |
| 5 | 入参校验 | 构造级 | 全局 `ValidationPipe({whitelist:true, forbidNonWhitelisted:true})`（`backend/src/main.ts:8-14`） | login 请求体附加 `isAdmin:true` 未声明字段 → 实测 400；探针已删除 | 构造级 | 达标 |
| 6 | 分页/列表协议 | 机械级 | `PageQueryDto`/`PageResultDto`（`backend/src/common/dto/page-{query,result}.dto.ts`），声明本身已注明"无编译期强制" | 前后端字段名核对一致（`page/pageSize/list/total`），`page-query.dto.spec.ts` 覆盖默认值/类型转换/边界校验 | 机械级 | 达标 |
| 7 | 序列化格式 | 机械级 | 时间：`Date` 默认 JSON 序列化即 ISO 8601；金额：`decimalTransformer` 统一转 `number`；ID：`numericIdTransformer` 统一转 `string` | 前端 `PolicyRecord` 接口类型与后端字段类型逐一核对一致 | 机械级 | 达标 |
| 8 | 页面外壳（导航/布局） | **构造级** | `AppLayout` 挂路由外壳层，业务路由嵌套 `children`（`frontend/src/router/index.ts`） | 在 `routes` 数组顶层新增一条不嵌套于 `AppLayout children` 的路由 → `vue-tsc -b`、`eslint`、`stylelint` 均 0 退出码，无一拦截；探针已还原 | **强约定（机械级-缺 lint）** | **未达应有档，见 F001** |
| 9 | 视觉地基（reset+主题+token 接线） | 机械级（lint 禁裸值） | 唯一入口 `main.ts` 单次 `import '@/styles/index.scss'`；`.stylelintrc.json` 接入 `stylelint-declaration-strict-value` + `selector-disallowed-list` | 组件内写 `color:#ff0000` → 实测红（`scale-unlimited/declaration-strict-value`）；组件内写裸 `body{}` → 实测红（`selector-disallowed-list`）；探针已删除 | 机械级 | 达标（优于 standards-frontend.md 中"计划中"的表述，已真接线） |
| 10 | 状态四态（加载/空/错/成） | 机械级 | `DataStateWrapper.vue`，`status` prop 类型收窄为 4 态联合类型，`PolicyRecordListView.vue` 引入复用 | prop 类型由 TS 编译期收窄校验；"是否所有列表页都必须用它"本身即声明为"约定用法"，未虚报为强制 | 机械级 | 达标（声明措辞与实测机制一致，未过度承诺） |
| 11 | HTTP 单例（拦截器注入 token/作用域） | **构造级** | 唯一实例 `frontend/src/api/request.ts`，请求/响应拦截器统一注入 token、统一处理 401 | 新建文件 `axios.create()` 建第二个实例（不经过拦截器）→ `vue-tsc -b`、`eslint` 均 0 退出码，无拦截；探针已删除 | **强约定（机械级-缺 lint）** | **未达应有档，见 F002** |
| 12 | 提成阶梯规则 | 机械级（V1 落地时） | 未建（`grep calcCommission` 全仓无匹配） | 不适用（V0 未到落地时点） | 未建，范围外 | 非阻断，见 F003 |
| 13 | 导入批次边界 | 机械级（V1 落地时） | 仅字段级立柱：`PolicyRecord.importBatchId`（bigint + `numericIdTransformer`，`backend/src/policy-record/policy-record.entity.ts:57-65`）；`WHERE/GROUP BY` 统计查询机制未建（尚无统计功能） | 不适用（无统计查询可撞） | 字段级已建，查询级机制范围外 | 非阻断，见 F003 |
| 14 | 投保人→分站映射 | 人审级（V1 落地时） | 未建（无映射表/规则代码，仅实体注释提及"分站"域名词） | 不适用 | 未建，范围外 | 非阻断，见 F003 |

**关于「错误信封/响应包装」的 `@Res()` 说明**：NestJS 的 `@Res()` 逃生口会同时跳过全局 `ExceptionFilter` 的响应改写与 `SuccessInterceptor` 的包装，这是框架级、对任何 Nest 应用都成立的固有特性，本次改动未引入、也未使用（`grep -rn "@Res(" backend/src` 无匹配）；"顺手写"的自然路径（直接 `return` 数据/抛异常）完全落在构造级保护内，不判 finding。

## 二、命门自检（逐关注点）

对每个 ≥机械级关注点复问"图省事的人顺手写会合规吗"：

- 鉴权：新 Controller 不写任何东西默认受保护 → 合规。
- 错误信封/响应包装/入参校验：正常 `return`/抛异常即被统一处理 → 合规。
- 页面外壳：顺手法是复制已有页面模式（在 `children` 数组里加一条）→ 合规；但**存在同样顺手、且更省事**的备选写法（直接在顶层 `routes` 数组加一条，连缩进层级都不用改）不被任何检查拦截 → 命门有裂缝，对应 F001。
- HTTP 单例：顺手法是照抄 `api/auth.ts`/`api/policy-record.ts` 已有模式引入 `request` → 合规；但直接 `import axios` 现开一个实例同样顺手且不被拦截 → 命门有裂缝，对应 F002。
- 视觉地基：裸值/裸选择器写完直接红，顺手写就是合规路径 → 合规，命门稳。
- 状态四态：组件已提供，接入是最省事路径；未接入不会報错但也不是"更省事的错误做法"（因为不用四态组件反而要自己手写 loading/empty 分支，更费事）→ 合规。

## 三、走骨架完整 + 薄（双向）

**缺件检查**：`foundation-design.md`「一、地基件清单」后端 8 项、前端 6 项逐条核对，**全部建齐**（鉴权卫士/错误信封/响应包装/入参校验/分页协议/序列化格式/认证接口/保单记录模块；AppLayout/全局样式入口/状态四态脚手架/HTTP 单例/登录页/保单记录列表页），且串成前端外壳→HTTP 单例→鉴权→校验管道→Service→Repository→DB 的完整穿透链（`backend/test/policy-record.e2e-spec.ts` 实测通过）。

**过度建造检查**：未见投机框架或完整 CRUD 全家桶——保单记录模块只有 `GET` 分页读接口，无增删改；未提前搭 `calcCommission()` 骨架（`foundation-design.md` 明确标注可选，做了取舍不做）；无未使用的额外模块/依赖。判定：无过度建造。

结论：无发现。

## 四、标杆穿透切片

`foundation-design.md`「三、标杆穿透切片」定义的路径——登录页→AppLayout→保单记录列表页→HTTP 单例（带 token）→后端鉴权 Guard→ValidationPipe→Controller→Service→TypeORM Repository→DB→`SuccessInterceptor`包装→前端 `DataStateWrapper` 渲染——由 `backend/test/policy-record.e2e-spec.ts` 端到端实测（真实 NestJS 应用 + supertest + SQLite，非 mock Repository），覆盖：

- 未登录访问 → 401 + 错误信封 ✓
- 密码错误 → 401，不签发 token ✓
- 登录请求体缺字段 → 400 参数校验失败 ✓
- 登录成功→带 token 查列表 → 200 + 成功信封 + 分页结构（空态，`list:[]`, `total:0`，与设计"V0 无数据验证空态"一致）✓
- 失效 token → 401 ✓

亲自复跑 `npm run test:e2e`：5/5 通过。范本质量：分层清晰（DTO 校验、Service/Controller 分离、Entity 注释齐全）、命名规范一致、错误路径全覆盖、前端四态接入完整、注释显式标注对应 standards 条目——达到可照抄样板水准。

结论：无发现。

## 五、自绿 + 标准合规

**审查员亲自在干净环境执行**（`node_modules` 已存在，按 brief 指引跳过重装；`npm run lint`/`stylelint` 执行后 `git status` 确认无文件被 `--fix` 改动，即当前代码本身已是干净状态）：

| 命令 | 结果 |
|------|------|
| `cd backend && npm run build` | 0 退出码，`dist/` 正常产出 |
| `cd backend && npm run lint` | 0 退出码，无违规 |
| `cd backend && npm run test` | 3 套件 / 13 用例全通过 |
| `cd backend && npm run test:e2e` | 1 套件 / 5 用例全通过（标杆切片） |
| `cd frontend && npm run build`（`vue-tsc -b && vite build`） | 0 退出码；仅有非阻断的 chunk-size 体积提示（`index-*.js` 1MB+，Vite 建议 code-split，V0 单页应用可接受，非违规） |
| `cd frontend && npm run lint:check` | 0 退出码，无违规 |
| `cd frontend && npm run stylelint:check` | 0 退出码，无违规 |

**环境特性说明**：数据源驱动实际为 SQLite（`better-sqlite3`），非声明的生产 MySQL——`backend/src/config/typeorm.config.ts` 按 `DB_TYPE` 环境变量切驱动，MySQL 分支配置字段齐全（host/port/username/password/database）且与 SQLite 分支共用同一套 Entity；`package.json` 同时声明 `mysql2` 依赖。主键未用 `bigint`（`policy-record.entity.ts:19-24`）是因 SQLite 的 `AUTOINCREMENT` 只允许出现在 `INTEGER PRIMARY KEY` 上，`numeric-id.transformer.ts` 注释已如实说明原因，且该列本来就不属于 `BE-TYPEORM-02`（该规则管的是 BIGINT 列，不含自增主键选型），未见因环境降级而弱化任何鉴权/校验/隔离类强制边。判定：环境特性，不阻断，MySQL 切换路径存在且形态正确。

`standards-*` 合规核对：命名规范（kebab-case 后端文件、PascalCase 前端组件）、API 信封、错误码表、DTO 装饰器完整性、SCSS `@use` 写法、SFC 区块顺序等逐项核对与代码一致，未见违反。

结论：自绿通过，无阻断项。

---

## Findings

```yaml
findings:
  - id: foundation-F001
    dimension: foundation-enforcement
    severity: advisory
    type: claim-failure
    reachability: current
    evidence: >
      foundation.md「页面外壳」声明"业务页面路由统一嵌套在其 router-view 下，无法绕开（构造级）"。
      反例：在 frontend/src/router/index.ts 的 routes 数组顶层新增一条不嵌套于 AppLayout children
      的路由（新建 frontend/src/views/ProbeNoShell.vue 配套），执行 `npx vue-tsc -b`、
      `npx eslint src/router/index.ts`、`npx stylelint` 均 0 退出码，未见任何机制拦截；探针已还原，
      `git write-tree` 复核 tree 仍为 eedc94f3a0714f011b29050bd17fd9d0a8c34a6f。
    impact: >
      行为无变化——当前只有一根业务路由（policy-records），实际未发生绕开；但声明的"无法绕开"与实测
      机制不符：实测只到"强约定"（新增页面若沿用现有 children 嵌套模式即合规，但无 lint/类型系统
      拦截顶层平行路由），达不到"构造级"要求的"写不出违规代码"门槛。
    action: downgrade-claim
  - id: foundation-F002
    dimension: foundation-enforcement
    severity: advisory
    type: claim-failure
    reachability: current
    evidence: >
      foundation.md「HTTP 单例」声明"唯一 Axios 实例…（构造级）"。反例：新建
      frontend/src/api/probe-second-instance.ts 内 `axios.create()` 建第二个不经过
      request.ts 拦截器的实例，执行 `npx vue-tsc -b`、`npx eslint` 均 0 退出码，未见拦截；
      探针已删除，tree 复核一致。
    impact: >
      行为无变化——当前所有 API 调用（api/auth.ts、api/policy-record.ts）均正确复用了唯一实例；
      但声明的"唯一"是构造级用词，实测只到"强约定"（无 no-restricted-imports 类规则堵住裸
      `axios.create()`/`fetch()` 出口）。
    action: downgrade-claim
  - id: foundation-F003
    dimension: foundation-completeness
    severity: advisory
    type: claim-failure
    reachability: unreachable
    evidence: >
      foundation.md「二」表中"提成阶梯规则""导入批次边界""投保人→分站映射"三行的"实际形式·档"列
      填写的是完整目标形态（如"单一权威函数 calcCommission()…单测覆盖各档边界值"），但 V0 实际未建
      （全仓 grep calcCommission 无匹配；无统计查询；无分站映射代码）。这与 iterations/v0/
      foundation-design.md 第三节"V0 走骨架不含 Excel 导入、第三方接口回填、提成阶梯计算…calcCommission()
      单一权威函数的骨架…可选择性搭出但不接真实规则，具体由 develop 按最小承重原则取舍"的显式授权
      一致——develop 忠实执行了 foundation-design.md 界定的 V0 范围，未违反地基件清单。
    impact: >
      行为无变化——不是本次 develop 实现的缺陷。仅是 foundation.md 表格与 foundation-design.md
      两份文档对这三行"V0 是否要建"的措辞不完全对齐，可能让后续读表格的人误以为 V0 已建成这些机制。
    action: revise-doc
findings_narrative: |
  前四类（强制边逐关注点、命门自检、走骨架完整+薄、标杆穿透切片）与自绿类均无阻断项；
  F001/F002/F003 均为 advisory：F001/F002 是前端两处"构造级"声明目前只有"强约定"实测支撑
  （命门自检显示当前顺手路径仍合规，非当前风险，建议后续补 no-restricted-imports/router 结构
  重构类 lint 或将 foundation.md 声明降档）；F003 是文档表述口径问题，不涉及代码改动。
```

## 结论

`conclusion: revise` —— 无阻断项，但存在 3 条 advisory finding（F001/F002 声明档位与实测机制不符，建议降档或补机械边；F003 文档口径需对齐 foundation-design.md 的 V0 范围授权），建议在下一轮或后续任务中处理后即可视为完全达标。自绿全部通过，标杆切片端到端验证通过，走骨架无缺件无过度建造。
