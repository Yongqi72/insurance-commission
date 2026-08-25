<!--
  任务包模板 · plan-sprint 产物 · 每个 develop 任务一个文件，存 iterations/vN/queue/{task-id}.md
  序列化锁定：YAML frontmatter（check-sprint.js 据此 parse）。字段规范见 specs-structural/develop.md §字段规范。
  填写规则：所有 <待填> 必须替换为实值；无依赖的 depends_on 填 []（不是 <待填>）；
           api-contract 仅 layers=[backend] 且接口被前端消费时填，否则整段删除（注释掉的不算填）。
  注：本文件 frontmatter 即任务包正文；--- 之后正文段可留空（字段均在 frontmatter）。
  视觉地基包：全局 reset + UI 库主题覆盖（设计主色等 token 映射）+ design.md token 全局接线（variables.scss + main/App 入口），
           不属任何业务页。在 frontmatter 加 `baseline: visual` 标记（仅此包加，其余包不加；check-sprint 据此机械核 v1 必有）；
           其余 frontend 任务 depends_on 它。触发与内容见 plan-sprint Step 2。
  体量预算：normative core 以 8–12KB 为软预算；超过时拆包，或把历史/解释移到 frontmatter 后的 non-normative appendix。
           develop 与独审默认只读 frontmatter；appendix 仅在明确疑点时查。
  审查维度不在任务包手填：develop 在每次 full 前用 task_type/layers/source/risk、本 frontmatter 与 fixed changed-files
           生成 review profile；任务包作者不得用自报字段关闭审查维度。
-->
---
task-id: <待填>            # 唯一标识，命名 {项目缩写}-v{N}-{三位序号}，如 hact-v4-001；对应 sprint.md 行
sprint_id: <待填>          # 所属 Sprint 标识，如 v4-s1；由 plan-sprint 填
layers: <待填>             # [frontend] / [backend] / [shared]（数组写法）
source: <待填>             # sprint / integration / manual-test / bug / optimization
task_type: <待填>          # dev-frontend（layers=[frontend]）/ dev-backend（layers=[backend]）/ shared 时显式指定
# baseline: visual        # 仅「视觉地基包」加此行；普通任务包不写。见顶部说明 + plan-sprint Step 2
urgency: normal           # normal（默认）/ hotfix
risk: standard            # standard（默认，审查 subagent 可用轻量模型）/ sensitive（触及权限/认证/数据隔离、不可逆数据操作、金额/计费计算、对外不可撤销副作用）；存疑即 sensitive（只升不降，develop 侧另按有效 risk + diff 独立预检兜底）
risk-note:                # 可选。check-sprint 的启发词命中而你判定是误报时，理由写这里（如"命中『迁移』只因 files 含历史迁移文件路径，本包不改 schema"）。本字段不参与启发扫描，故解释文字不会再次自我触发
title: <待填>              # 简短描述，≤15 字
status: 可取               # plan-sprint 初始写「可取」；流转：可取 → taken-by:{user} → done → merged
description: <待填>        # 格式「当前状态 → 期望状态」，不写"实现XXX"
depends_on: []            # 前置 task-id 列表，无依赖填 []；与 sprint.md 依赖列、status.yml depends_on 三处一致
files:
  - <待填>                # 必改文件路径，精确到已知行号范围；不预防性列"可能"文件
supersedes: []            # 本包取代的既有实体，无则 []（不是 <待填>）。一行一条，写清是什么：
                          # 代码路径（旧实现 / 旧分支 / 已无调用方的模块）、lint 规则 id、spec 文件、decisions #N。
                          # 填了即欠一笔退役账——develop 交付时逐条给「已下线 / 保留 + 理由」，见 develop §退役账
ac-format: intent-oracle-v1
acceptance-criteria:
  # 每条是一个 block scalar，须含 intent + oracle；标覆盖的 PRD AC：(源：PRD AC-nn)，纯技术约束标 (技术)。
  # example 可省；普通 example 只帮助理解、不压过 oracle。仅经写包独审独立复算的例子可标 golden: true，并要求 develop 字面物化。
  # backend 验收锚 = **调用方能用它做成事**，不是"我实现了 AC"：写完逐条问一遍「拿这条交付的东西，
  #   调用方要做的那件事做得成吗」。常见缺口是字段齐了但列表/白名单不放行、状态对了却没有取它的读接口
  #   ——锚在调用方那侧，缺口才在写包时暴露；锚在自己这侧，它会等到前端撞上来才出现。
  - |-
    (源：PRD AC-nn)
    intent: <用户可观察结果>
    oracle: <可执行判据 / 计算方式 / 状态条件>
    example: <可选；封闭输入与派生结果>
    golden: false
relevant-standards:
  - <待填>                # 只列 applies-if 命中的规则：`RULE-ID · standards-{layer}.md § 条目标题`；design.md 为 frontend 无条件必读，不重复列
reference:
  - <待填>                # 仅列实现决策必需锚点：文件路径 + 稳定符号/章节锚（优先）或行号 + 说明；拒"全文"
  # 前端任务：reference 须含 ux-flows.md 对应功能段锚（若文件存在）
  # 后端任务：reference 须含 trd.md 错误码/服务流程对应章节锚
context: <待填>           # 关键实现切入点，如 GoalList.vue L142 handleDelete()
known-risks: []           # 只列本任务新打开/显著放大的实际风险；无则 []
do-not: []                # 只列本任务真实 scope 边；全局凭据/编码红线不在每包重复；无则 []
escalate-if: []           # 只列无法从权威原文自行裁决的分支；普通上下文探索不写；无则 []
# --- 以下仅 layers=[backend] 且该接口被前端消费时填，由 plan-sprint 推导写入；不需要则整段删除 ---
# api-contract:
#   endpoint: <待填>       # 如 GET /api/...
#   request:              # 可选，有 query / body 时填
#     query: { field: type }
#     body: { field: type }
#   response:             # 字段平铺，不嵌套（嵌套须注明原因）
#     field: type
---
