# 后端规范 · insurance-commission

> 当前稳定默认规则表，V0 首期播种，原地更新当前真值，不追加版本史。加载规则见 `../hact-method-lab/templates/standards/schema.md`。
> 与 `standards-shared.md` 分工：API 信封 `{code, msg, data}`、错误码表、鉴权模型（全局 Guard + `@Public()`）已在 shared 定义，本文件不重复。
> 提成阶梯计算、导入批次边界这类领域不变式已在 `foundation.md`「二、地基关注点登记」表登记（单一权威函数 `calcCommission()`、`import_batch_id` 查询边界），本文件涉及相关改动时只引用，不重复展开。
> V0 走骨架阶段代码尚未落地，以下 `enforcement` 多数指向计划中的机制（lint 规则 / CI 检查），尚未接入自动化检查的一律如实标注为人审级，不虚标更高档。

---

### BE-LAYER-01 · 分层职责边界

- applies-if：新增/修改 Controller、Service 或数据访问代码
- rule：Controller 只做请求接收与参数传递，禁止在路由层写业务判断；业务逻辑全部在 Service；禁止 Controller 直接操作 TypeORM Repository，必须经 Service
- grade：人审级
- enforcement：code-review
- override：TRD 可为特定薄接口（如纯转发）明确豁免，须在 TRD 写明理由
- superseded-when：引入分层边界 lint（如 `eslint-plugin-boundaries`）后升级为机械级

---

### BE-LAYER-02 · 路由路径唯一性核查

- applies-if：新增 Controller 或新增/修改其内路由路径
- rule：NestJS 路由冲突时静默使用先注册的 Controller，后注册者永不可达且无启动警告；新增路由前必须全局搜索该路径前缀是否已存在
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：—

---

### BE-VALID-01 · DTO 校验装饰器完整性

- applies-if：新增/修改接收请求体或查询参数的 DTO
- rule：`@Body()` / `@Query()` 对应的 class 必须有完整 class-validator 装饰器（必填用 `@IsNotEmpty()`/`@IsDefined()`，类型用 `@IsString()`/`@IsNumber()` 等）；plain class 不等于 DTO——一旦漏装饰器，全局校验管道对该字段静默放行，非法值直接进入下游转换（如 `new Date()` 产生 `NaN`），且无任何报错提示
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：引入自定义 lint 规则检测 `@Body()`/`@Query()` 参数 class 缺失装饰器后升级为机械级

---

### BE-TYPEORM-01 · upsert 统一走 save() + 唯一约束

- applies-if：新增/修改任何"存在则更新、不存在则插入"的写入逻辑
- rule：禁止使用 `repo.upsert()`——它绕过 TypeORM 生命周期钩子（`@BeforeInsert`/`@BeforeUpdate` 等）；统一先 `findOne()`判断，存在则更新字段，不存在则 `create()`，最后调用 `save()`
- grade：人审级
- enforcement：code-review
- override：TRD 可为明确不依赖生命周期钩子的表指定 `repo.upsert()`，须写明理由
- superseded-when：—

---

### BE-TYPEORM-02 · BIGINT 列对应字段类型声明为 string

- applies-if：新增/修改 Entity 中对应数据库 `BIGINT` 列的字段（自增主键、大整数外键等）
- rule：TypeORM 将 MySQL `bigint` 映射为 JS `string`；Entity 字段类型必须声明为 `string`，禁止声明为 `number`，否则数值比较会静默失败
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：—

---

### BE-TYPEORM-03 · 金额/decimal 字段统一走 decimalTransformer

- applies-if：新增/修改 Entity 中对应数据库 `DECIMAL` 列的金额类字段
- rule：TypeORM 读取 `decimal` 列默认可能返回 string；金额字段必须显式指定 `decimalTransformer` 统一序列化为 number，禁止让字段裸用 TypeORM 默认行为
- grade：人审级
- enforcement：code-review
- override：TRD 可为需要保留高精度字符串（如禁止浮点误差的场景）的字段指定另一套 transformer，须写明理由
- superseded-when：引入 Entity 字段级 lint（检测 decimal 列缺失 transformer）后升级为机械级

---

### BE-DB-01 · 唯一约束声明与生效核对

- applies-if：新增/修改带唯一性要求的字段（如工作单号、保单号）
- rule：Entity 层用 `unique: true` 声明，同时在对应迁移/建表脚本中确认数据库层 `UNIQUE KEY` 实际生效；不得只在应用层校验唯一性
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：迁移检查脚本自动比对 Entity 声明与库表约束后升级为机械级

---

### BE-DB-02 · 关联数据一次性加载

- applies-if：查询涉及关联实体且在循环/列表渲染中访问关联字段
- rule：禁止 N+1 查询；关联数据用 `relations` 选项或 `QueryBuilder` 一次性加载
- grade：人审级
- enforcement：code-review
- override：TRD 可为明确低频、小数据量场景豁免
- superseded-when：接入查询数量监控/慢查询告警后可补充为机械级探针

---

### BE-DB-03 · 表结构变更须配套正式 migration

- applies-if：新增/修改 Entity 引发数据库表结构变更（建表、加列、改列、加索引、加/删约束等）
- rule：禁止只依赖 TypeORM `synchronize: true` 让应用启动时静默同步表结构；结构变更必须配套编写正式 migration 文件落库，保证变更可追溯、可在生产环境按序执行
- grade：人审级
- enforcement：code-review
- override：TRD 可为沙箱/测试专属数据库明确保留 `synchronize`，须写明适用范围；生产路径不可覆盖
- superseded-when：接入 migration 自动生成/校验的 CI 检查后升级为机械级

---

### BE-EXT-01 · 外部接口返回值防御性校验

- applies-if：调用任何第三方/外部 API 并使用其返回值（含工作单号回填销售人员姓名的第三方接口）
- rule：外部接口返回值必须先检查关键字段是否为 `null`/`undefined`，禁止直接解构；查询失败或无匹配需产出可识别的失败标记，不得让异常值静默流入下游计算
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：—

---

### BE-EXT-02 · 对象存储访问统一走专属客户端封装

- applies-if：新增/修改需要读写对象存储（OSS 等）的代码
- rule：禁止在业务模块（Controller/Service）中直接 import 并调用对象存储 SDK；统一经由专属封装客户端（如 `OssClient`）暴露的方法（上传、生成签名 URL 等），SDK 初始化、鉴权、路径拼接等细节收敛在该封装内
- grade：人审级
- enforcement：code-review
- override：TRD 可为一次性脚本（数据迁移/初始化脚本，非常规业务代码路径）指定直接调用 SDK，须写明理由
- superseded-when：—

---

### BE-EXCEL-01 · Excel 解析与生成共用同一套列定义

- applies-if：新增/修改 Excel 导入解析或导出生成逻辑，且导入与导出涉及同一批业务字段
- rule：禁止导入解析与导出生成各自硬编码一份列顺序/表头；统一通过共享列定义（如 `ExcelParser`/`ExcelBuilder`）驱动读写，避免字段顺序在两处独立维护后悄然漂移不一致
- grade：人审级
- enforcement：code-review
- override：TRD 可为导入/导出字段完全不重叠的场景豁免共享列定义
- superseded-when：—

---

### BE-JSON-01 · 数据库 JSON 字段运行时类型守卫

- applies-if：读取数据库中声明为 JSON 类型的字段
- rule：JSON 字段运行时类型不可信，读取后必须用类型守卫函数验证，不得只依赖编译时类型；格式异常时不进入下游逻辑
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：引入运行时 schema 校验库（如 zod）统一处理 JSON 字段后升级为机械级

---

### BE-SEC-01 · 凭证类数据单向哈希存储

- applies-if：新增/修改存储用户登录凭证（如管理员账号密码）的逻辑
- rule：密码等凭证禁止明文或可逆加密存储，统一走单向哈希（如 bcrypt/argon2）+ 加盐；第三方接口密钥/Token 等配置项统一走环境变量注入，禁止硬编码
- grade：人审级
- enforcement：code-review
- override：TRD 可指定具体哈希算法与参数，但不可取消哈希本身
- superseded-when：接入密钥管理/密文扫描工具后可为"禁止硬编码"子项升级为机械级

---

### BE-SEC-02 · 响应序列化排除敏感字段

- applies-if：Entity 或内部数据结构中含 `password`、`secret`、`token` 等敏感字段，且该结构会被序列化进 HTTP 响应
- rule：响应体禁止出现敏感字段明文；用独立的响应 DTO 白名单字段，或显式裁剪后再返回，不得直接把持久化 Entity 透传给响应
- grade：人审级
- enforcement：code-review
- override：可用全局 `ClassSerializerInterceptor` + `@Exclude()` 等价替代，须在 TRD 写明
- superseded-when：引入上述全局序列化机制后升级为机械级

---

### BE-ENV-01 · 环境变量特殊字符转义

- applies-if：新增/修改 `.env` 中含 `#`、空格等特殊字符的配置值（数据库密码、第三方接口密钥等）
- rule：值含 `#` 时必须加引号（`dotenv` 将裸 `#` 视为注释符会截断后续内容），`.env.example` 中对应字段需加注释提示
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：—

---

### BE-LOG-01 · 错误必须记录具体原因

- applies-if：新增/修改 `try/catch` 或异常处理代码
- rule：禁止只 `catch` 不记录；错误日志必须包含具体原因（错误对象/关键上下文），禁止裸 `console.log`/`console.error`，统一走 NestJS `Logger`
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：接入结构化日志/错误上报平台后，"必须记录"部分可由平台侧兜底降级为该平台配置说明

---

### BE-CLEAN-01 · 提交代码整洁纪律

- applies-if：任意代码提交
- rule：禁止提交含 `// TODO`、`// FIXME` 的未完成代码；禁止提交注释掉的废弃代码块；禁止遗留调试用 `console.log` 等输出
- grade：人审级
- enforcement：code-review（未使用 import 若已配置 `@typescript-eslint/no-unused-vars` 则由该规则机械拦截）
- override：不可覆盖
- superseded-when：接入对应 lint 规则覆盖后，被覆盖的子项各自独立升级为机械级

---

## 测试框架约定

### BE-TEST-01 · 测试框架、命令与文件位置

- applies-if：新增/修改后端代码需要配套测试（NestJS 官方标配 Jest）
- rule：测试框架统一用 Jest（`@nestjs/testing` + `ts-jest`）；单元测试文件与被测文件同目录，命名 `*.spec.ts`（如 `policy-record.service.spec.ts`）；端到端/集成测试统一放 `test/` 目录，命名 `*.e2e-spec.ts`；运行命令：单测 `npm run test`，端到端 `npm run test:e2e`，覆盖率 `npm run test:cov`
- grade：人审级
- enforcement：code-review
- override：TRD 可为特定模块指定额外测试工具（如 supertest 用于 e2e），须与 Jest 共存而非替代
- superseded-when：接入 CI 强制测试门禁后升级为机械级
