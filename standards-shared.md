# 跨层通用规范 · insurance-commission

> 当前稳定默认规则表，V0 首期播种，原地更新当前真值，不追加版本史。加载规则见 `../hact-method-lab/templates/standards/schema.md`。

---

### SH-NAME-01 · 命名规范

- applies-if：新增/修改任意文件、变量、数据库对象
- rule：后端模块文件名 kebab-case（`policy-record.service.ts`）；前端组件文件名 PascalCase（`PolicyRecordList.vue`）；变量/函数 camelCase；类/接口/枚举 PascalCase；常量 UPPER_SNAKE_CASE；数据库表名/字段名 snake_case；Git 分支 `feature/{task-id}-{brief-desc}`
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：项目引入 lint 规则强制命名后升级为机械级

---

### SH-API-01 · API 响应信封（强制）

- applies-if：新增/修改后端 Controller 接口
- rule：所有接口统一返回 `{ code: number, msg: string, data?: any }`；`code === 0` 为成功，非 0 为业务/系统错误；成功由全局 `SuccessInterceptor` 包装，Controller 不手动包装；业务错误禁止伪装成 HTTP 200
- grade：构造级
- enforcement：global-success-interceptor + global-exception-filter
- override：不可覆盖，须先修 Foundation
- superseded-when：—

---

### SH-API-02 · 错误码约定

- applies-if：新增错误场景需要区分前端处理分支
- rule：`0`=成功；`1001`=参数校验失败；`1002`=未登录/token 失效；`1003`=无权限；`1004`=资源不存在；`1005`=操作冲突（如重复提交、区间重叠）；`2001`=第三方接口（工作单号回填）查询失败；`2002`=提成阶梯规则不完整，无法计算/导出；`5000`=服务器内部错误。新增错误码在本条目登记，不散落各处
- grade：机械级
- enforcement：shared error-code enum（前后端共享类型）
- override：TRD 可为特定模块追加错误码段，须登记于本表
- superseded-when：—

---

### SH-AUTH-01 · 鉴权与权限模型

- applies-if：新增后端接口 / 前端路由
- rule：鉴权方式 JWT Bearer Token；后端默认全部接口需鉴权（全局 `APP_GUARD`），仅 `@Public()` 显式标注的接口（如登录）免鉴权；前端 token 存 `localStorage`；单一管理员角色，无角色分层；token 失效前端统一跳转 `/login`
- grade：构造级
- enforcement：global-auth-guard + public-decorator
- override：不可覆盖，须先修 Foundation
- superseded-when：项目引入多角色权限需求时由 Foundation 重新设计

---

### SH-SEC-01 · 跨层安全规范（强制）

- applies-if：任意代码改动、PR description、完成报告撰写
- rule：禁止在代码/PR/报告中明文出现密码、token、密钥、第三方接口凭证；密钥统一走环境变量；禁止 `console.log`/Logger 打印用户输入、密码、token 等敏感数据
- grade：人审级
- enforcement：code-review
- override：不可覆盖
- superseded-when：—

---

### SH-TEST-01 · 测试环境约定

- applies-if：本地开发、联调测试
- rule：后端默认 `http://localhost:3000`，前端默认 `http://localhost:5173`（Vite 默认端口，可按实际调整）；测试数据库为独立库（禁止指向生产库）；联调禁止触发真实第三方接口计费调用，使用 mock/沙箱
- grade：人审级
- enforcement：无（人工核对启动配置）
- override：TRD 可写实具体端口/库名
- superseded-when：—
