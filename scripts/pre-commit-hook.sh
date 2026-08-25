#!/bin/sh
# hact-method · pre-commit 门卫（forcing function）
# ------------------------------------------------------------------
# 判官（check-*.js）说红 → 拦 commit。让「结构判据通过」成为提交的唯一出路，
# 而不再是一条「记得跑、退出码 0 才签」的散文规则（散文进 context 会失真，门卫不会）。
#
# 安装：init-project 把本文件复制为 项目仓 `.git/hooks/pre-commit` 并 chmod +x。
# 触发：commit 时按 staged 文件路由到对应检查器——
#   iterations/vN/prd.md            → check-docs.js（同迭代有 trd.md 则带上做交叉对账）
#   iterations/vN/trd.md            → check-docs.js（PRD+TRD 交叉）
#   iterations/vN/sprint.md|queue/*.md → check-sprint.js vN（只认 .md——.gitkeep 不触发，init 提交 queue 必然为空）
#   iterations/vN/gates.md 新增 G4/G5 → check-gate.js G{N} vN
#   reusables.md，或本次 commit 有文件删除/改名 → check-reusables.js（登记路径是否还在）
#
# 触发条件依赖共暂存（暗礁）：linter 按 staged 的**产物文件**路由——check-docs 看
#   prd/trd、check-sprint 看 sprint/queue。签 Gate 时若把产物与 gates.md 分两次 commit
#   （产物先入、单独 commit 签字），签字那次只 stage gates.md → check-docs/check-sprint
#   不重跑（G4/G5 例外：check-gate 看 gates.md 自身新增行，照跑）。故签 G1/G2/G3 时须把
#   产物与 gates.md **同次暂存**，门卫才在签字点复验结构。属「护栏非密码锁」范围。
#
# 兼容（暗礁，见 hact-method HOOK 存档）：
#   - 脚本缺失（存量仓未铺 scripts/check-*.js）→ 该检查 no-op 放行，绝不拦死。
#   - node 不在 PATH → 警告并放行（不因环境差异 brick 提交）。
#   - 护栏非密码锁：`git commit --no-verify` 可绕过，是范围限制非拦路石。
# ------------------------------------------------------------------
set -u

# node 缺失 → 放行（环境兜底）
if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  pre-commit: 未找到 node，跳过结构检查（放行）" >&2
  exit 0
fi

staged=$(git diff --cached --name-only)
[ -z "$staged" ] && exit 0

fail=0

run() {  # run <脚本> <参数...>：脚本存在才跑；红则置 fail
  script="$1"; shift
  [ -f "$script" ] || return 0          # no-op：存量仓未铺脚本
  echo "▶ pre-commit: node $script $*" >&2
  node "$script" "$@" || fail=1
}

# 抽出 staged 路径里涉及的迭代版本目录（去重）
iter_dirs=$(echo "$staged" \
  | grep -oE '^iterations/v[0-9]+/' \
  | sort -u)

for dir in $iter_dirs; do
  ver=$(echo "$dir" | grep -oE 'v[0-9]+')   # vN

  # --- PRD / TRD 结构 + 交叉（check-docs.js）---
  prd_staged=$(echo "$staged" | grep -qE "^${dir}prd\.md$" && echo y || echo n)
  trd_staged=$(echo "$staged" | grep -qE "^${dir}trd\.md$" && echo y || echo n)
  if [ "$prd_staged" = y ] || [ "$trd_staged" = y ]; then
    if [ -f "${dir}prd.md" ] && [ -f "${dir}trd.md" ]; then
      run scripts/check-docs.js "${dir}prd.md" "${dir}trd.md"   # 两文件齐 → 交叉对账
    elif [ "$prd_staged" = y ]; then
      run scripts/check-docs.js --prd "${dir}prd.md"
    elif [ "$trd_staged" = y ]; then
      run scripts/check-docs.js --trd "${dir}trd.md"
    fi
  fi

  # --- sprint / 任务包（check-sprint.js）---
  # 只认 .md：init 提交只 stage queue/**/.gitkeep（立项时 queue 必然为空），不触发本检查
  if echo "$staged" | grep -qE "^${dir}(sprint\.md|queue/.*\.md)$"; then
    run scripts/check-sprint.js "$ver"
  fi

  # --- gates.md 新增 G4/G5（check-gate.js）---
  if echo "$staged" | grep -qE "^${dir}gates\.md$"; then
    # 只看本次 diff 新增（+）行里已签署（[x]）的 G4/G5——未签行（新建 gates.md 时全行为+）不触发检查
    added_gates=$(git diff --cached -U0 -- "${dir}gates.md" \
      | grep -E '^\+' | grep -E '\[x\]' | grep -oE 'G[45]' | sort -u)
    for g in $added_gates; do
      run scripts/check-gate.js "$g" "$ver"
    done
  fi

  # --- ux-flows / prototype（check-ux.js）---
  if echo "$staged" | grep -qE "^${dir}(ux-flows\.md|prototype\.html|prototype-map\.md)$"; then
    run scripts/check-ux.js "$ver"
  fi
done

# --- reusables.md 登记表（check-reusables.js）---
# 在迭代循环**外**：reusables.md 是项目根跨迭代活文档，不属于任何 vN。
# 两个触发口，第二个才是主力：
#   ① 改了表本身 —— 新登记的路径当场核。
#   ② 本次 commit 删除或改名了任何文件 —— 登记失真的**主要发生方式**不是有人改坏了表，
#      而是资产被搬走/改名而表没跟着动（此时表纹丝未动，只盯 ① 永远发现不了）。
if echo "$staged" | grep -qE "^reusables\.md$" \
   || [ -n "$(git diff --cached --name-only --diff-filter=DR)" ]; then
  run scripts/check-reusables.js
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "❌ pre-commit 门卫：结构检查未通过，已拦截本次 commit。" >&2
  echo "   按上方报告逐条修产物、重跑到绿；确需绕过用 git commit --no-verify（留痕自负）。" >&2
  exit 1
fi
exit 0
