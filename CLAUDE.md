# insurance-commission

## 项目说明
保单管理人员用于统计全集团各销售的保单提成：导入保单账单 Excel，按工作单号调用第三方接口回填销售人员姓名，按阶梯提成规则计算每人提成，输出提成统计报表

## 规范加载
本仓使用 hact-method 的执行规范。Step 1 推断出 task.type 后，用 Read 工具加载对应路径的单份规范，**不得预加载多份**：

| task.type | 规范路径 | 备注 |
|-----------|---------|------|
| `init-project` | `../hact-method-lab/specs-execution/init-project.md` | |
| `draft-foundation` | `../hact-method-lab/specs-execution/draft-foundation.md` | V0 地基设计（走骨架前）；A 类项目 init 后、V1 PRD 前；只设计不产代码，骨架代码归 develop(source=foundation) |
| `draft-prd-vN` | `../hact-method-lab/specs-execution/draft-prd-vN.md` | |
| `draft-ux` | `../hact-method-lab/specs-execution/draft-ux.md` | 可选，PRD 有 `draft-ux: 需要` 时触发，插在 G1→G2 之间 |
| `draft-tech-design` | `../hact-method-lab/specs-execution/draft-tech-design.md` | |
| `plan-sprint` | `../hact-method-lab/specs-execution/plan-sprint.md` | |
| `develop` | `../hact-method-lab/specs-execution/develop.md` | 含 per-task 独立审查 + 自合并到 master，无独立 pr-review |
| `generate-integration-tests` | `../hact-method-lab/specs-execution/generate-integration-tests.md` | |
| `manual-test` | `../hact-method-lab/specs-execution/manual-test.md` | |
| `deploy` | `../hact-method-lab/specs-execution/deploy.md` | |
| `wrap-up-iteration` | `../hact-method-lab/specs-execution/wrap-up-iteration.md` | |
| `dispatch-new` | `../hact-method-lab/specs-execution/dispatch-new.md` | B 类 |
| `revise-doc` | `../hact-method-lab/specs-execution/revise-doc.md` | B 类 |

> B 类任务包创建后统一由 `develop` 拾取（`source=bug/optimization`），复用写代码前 freshness preflight、独立证据审查和有界复审；不得默认绕过 develop 手动实现。仅用户明确要求接管已有手动 diff 时，才用 `adversarial-review` 兼容入口；该 skill 必须先核 `b-reviews/{task-id}/preflight.md`，缺失时先补做并如实标 `retroactive`，不得把事后核对伪装成写代码前已通过。

## 个人工具（人工触发，不在主线流程）

| 工具 | 调用方式 | 说明 |
|------|---------|------|
| Gitee 仓库操作 | `/gitee-ops` | 远端为 Gitee 时，创建 PR / 合并 PR / 查询分支，**禁止使用 gh CLI** |
| 浏览器自动化 | `/pinchtab` | 前端场景测试：打开页面、点击操作、填表、截图、导出 PDF；联调阶段 generate-integration-tests 前端脚本使用 |

## 跨会话接续规则
每次打开本仓时，按顺序执行：

**Step 0：代码同步（强制执行，不可跳过）**

对项目仓、hact-method、个人 notes 仓各执行一遍同步：

```bash
# 同步函数：不吞 stderr、失败原样报错（不得改写为"已同步"）；
# 「拉取 N 个 commit」由 HEAD 前后对比实测得出——拉到才说拉到
sync_repo() {  # 用法: sync_repo <仓路径> <必须分支|->
  dir="$1"; want="$2"
  branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD) || return 1
  if [ "$want" != "-" ] && [ "$branch" != "$want" ]; then
    echo "⚠️ $dir 当前在 $branch 而非 $want" >&2; return 1
  fi
  before=$(git -C "$dir" rev-parse HEAD)
  git -C "$dir" fetch origin || return 1
  if git -C "$dir" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    git -C "$dir" pull --ff-only || return 1   # diverged / 冲突 / 凭据失败在此原样报错
  else
    echo "$dir（$branch）：当前分支无远端跟踪，仅 fetch"
  fi
  echo "$dir（$branch）：拉取 $(git -C "$dir" rev-list --count "$before..HEAD") 个 commit"
}

sync_repo . -                          # 项目仓（断点续做可能在任务分支上，不限分支）
sync_repo ../hact-method-lab master    # hact-method：必须在 master
sync_repo "../hact-notes-{username}" - \
  || echo "个人 notes 仓同步未成功（未创建/无跟踪/冲突）——不阻断，如需积累见 init-project Step 4.5"
```

完成后，**必须**向人类输出以下声明（格式固定，不可省略）：

```
📋 会话启动·代码同步
- 项目仓（{当前分支}）：{已拉取 N 个 commit / 已是最新 / ⚠️ 有冲突——停止，请人工处理}
- hact-method（master）：{已拉取 N 个 commit / 已是最新}
- 个人 notes（hact-notes-{username}）：{已拉取 N 个 commit / 已是最新 / 未配置}
同步完成，进入 Step 1。
```

声明纪律：「已拉取 N 个 commit」只能填 sync_repo 输出的实测计数；任何仓同步失败时不得声明"已是最新/已同步"，原样贴出报错。

⚠️ **项目仓或 hact-method** 的 sync_repo 失败（冲突 / diverged / 凭据失败 / hact-method 不在 master）→ 停止，不得进入 Step 1，等待人类解决后重新执行 Step 0。个人 notes 仓失败不阻断（私有，提示后可继续）。

项目仓与 hact-method 同步完即可进入 Step 1（个人 notes 仓未配置不阻断）。

**Step 1：读取项目当前状态，推断当前任务类型**
1. 读取 `project.md` 了解当前产品与技术状态
2. 读取相关迭代的 `gates.md` 确认 Gate 签署状态（**V0 期读 `iterations/v0/gates.md`**，见第 4 步「先判 V0」；否则读最新 `vN`——`iterations/v0/` 存在且 V0 未完成时，不要被 init 预建的空 `v1/` 目录误导）
3. 读取 `iterations/vN/sprint.md`，从**状态列**和 **PR 列**得出各任务进度（一次读取即可得全貌，无需逐个读 queue 文件）
4. 按下表推断当前任务类型并**明确声明**：

**先判 V0 走骨架**（`iterations/v0/` 存在时 V0 优先于下面 V1+ 表；不存在 = 跳过了 V0 或 V0 已完成，直接看 V1+ 表）：

| `iterations/v0/` 状态 | 推断任务类型 |
|---|---|
| `v0/gates.md` G2 未签 | `draft-foundation` — V0 地基设计未完成，续做 |
| G2 已签，`status.yml` 中 `foundation` task 缺失或未 `[merged]` | `develop`(source=foundation) — 建走骨架（拾取见 develop 会话启动「source=foundation 进料」块）|
| G2 已签，`foundation` task `[merged]` | **V0 完成**（机器信号）→ 落到下面 V1+ 表（通常进 `draft-prd-vN`）|

**V1+ 推断表**：

| sprint.md 状态分布 | PR 列 | Gate 状态 | 推断任务类型 |
|-------------------|-------|-----------|-------------|
| 迭代目录空 / 无 `sprint.md` | — | G1 未签 | `draft-prd-vN` — 本期 PRD 未起草（V0 完成后或新迭代起点的落点）|
| 有 `[可取]` | — | G3 已签，G4 未签 | `develop` — 列出可认领任务，等待用户拾取 |
| 有任意 `[taken-by]` 或 `[done]` | — | G3 已签，G4 未签 | `develop` — 继续未完成任务包（`[done]` = 上次会话推 PR 后未及合并，续做至自合并 `[merged]`）|
| 全部 `[merged]` | — | G4 未签 | `generate-integration-tests` |
| 全部 `[merged]`，联调报告已存在 | — | G4 未签 | `manual-test` |
| G4 已签，G5 未签 | — | G5 未签 | `wrap-up-iteration` |
| G5 已签 | — | — | 本迭代完结，等待下一指令 |

> **联调报告轻读**：推断 `manual-test` 时，只检查 `integration-tests/result-*.md` 是否存在，不读全文；若需确认三条件通过，只读末尾 20 行。进入 `manual-test` 规范执行后再读全文。

🚫 **禁止给用户贴角色标签**（如"作为前端程序员"）——执行层（frontend/backend）由 develop spec 第零步在会话内确认，不在启动阶段推断。

5. 加载对应规范，输出当前状态摘要：Gate 进度 + 任务状态分布 + 推断的下一步动作
6. 若 Step 1 结束时处于等待状态（迭代完结、无 gates.md 等），收到用户任务指令后，**必须先加载对应 exec spec，再执行，不得跳过**。

**断点续做对账原则**（适用所有 task 的「断点续做」）：恢复某个进行中任务时，以**工作区实际文件 / `git diff --stat` 为准**核对 `_meta/sessions/*-progress.md`，二者冲突时**信工作区**，progress.md 仅作"上次意图"补充——不得仅凭 progress.md 推断进度而重复实现已落盘的改动（compact 不删工作区文件；progress.md 可能落后于实际进度）。
