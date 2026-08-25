#!/usr/bin/env node
/*
 * check-gate.js · hact-method Gate 完成判据薄检查器（子计划 3b · G4/G5）
 *
 * 用途：机械核对 G4 / G5 完成判据里**确定性可查**的那几条，取代原 §7 subagent 冷核里
 *      "结构/状态可查"的部分。语义核心（用户验收是否真通过、feedback 分流对不对、
 *      偏离处理对不对）机器判不了，**不碰，留人签**——脚本只把可机械的挡在签字前。
 *
 * 用法（在项目仓根目录执行）：
 *   node scripts/check-gate.js G4 vN     # 验 G4：manual-test 修复任务全 merged + 验收报告结论=通过
 *   node scripts/check-gate.js G5 vN     # 验 G5：feedback 已清空 + project.md 无"开发中"
 *
 * 退出码：有任一 FAIL → 1；全 pass → 0；用法错误 / 自身出错 → 2。
 *
 * 设计边界（见 _meta/plans/2026-06-19-structural-review/sub3b-G345检查器-design.md）：
 *   - G3 不在此脚本：其完成判据需 parse 任务包，而任务包格式尚未规范化，留 sub3c + check-sprint.js。
 *   - 纯 Node 无外部依赖；status.yml 用针对本 schema 的容错行扫描，非完整 YAML AST。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const findings = []; // {level:'fail'|'pass'|'human', rule, loc, msg}
const fail  = (rule, loc, msg) => findings.push({ level: 'fail',  rule, loc, msg });
const pass  = (rule, msg)      => findings.push({ level: 'pass',  rule, msg });
const human = (rule, msg)      => findings.push({ level: 'human', rule, msg }); // 留人签的语义残量，仅提示

function readLines(p) {
  return fs.readFileSync(p, 'utf8').split(/\r?\n/);
}
function exists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
// 去掉值两端的引号 / 方括号 / 空白（status.yml 偶有 "[可取]" 写法）
function cleanVal(v) {
  return (v || '').trim().replace(/^["']|["']$/g, '').replace(/^\[|\]$/g, '').trim();
}

/* ---------- status.yml 容错解析：只抽 tasks[] 的 source/iteration/status ----------
 * schema 见 skeleton/07-status-contract.md：
 *   tasks:
 *     - id: x
 *       iteration: v2
 *       source: sprint
 *       status: merged
 * 每个条目以 `- ` 起；条目内 `key: value` 缩进更深。只取所需三键。
 */
function parseTasks(statusPath) {
  if (!exists(statusPath)) return null; // 调用方负责区分"无文件"与"空 tasks"
  const lines = readLines(statusPath);
  const tasks = [];
  let inTasks = false, baseIndent = null, cur = null;
  const flush = () => { if (cur) { tasks.push(cur); cur = null; } };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    if (/^tasks:\s*$/.test(line)) { inTasks = true; continue; }
    if (!inTasks) continue;
    // 顶格非空行（无缩进且非列表项）→ tasks 段结束
    if (/^\S/.test(line) && !/^-/.test(line)) { flush(); break; }
    if (line.trim() === '') continue;

    const item = line.match(/^(\s*)-\s+(.*)$/);
    if (item) {
      const indent = item[1].length;
      if (baseIndent === null) baseIndent = indent;
      if (indent === baseIndent) {
        flush();
        cur = {};
        // `- key: value` 首键内联
        const kv = item[2].match(/^([A-Za-z_-]+):\s*(.*)$/);
        if (kv) cur[kv[1]] = cleanVal(kv[2]);
        continue;
      }
    }
    const kv = line.match(/^\s+([A-Za-z_-]+):\s*(.*)$/);
    if (kv && cur) cur[kv[1]] = cleanVal(kv[2]);
  }
  flush();
  return tasks;
}

/* ---------------- G4 ---------------- */
function checkG4(iteration, root) {
  const statusPath = path.join(root, 'status.yml');
  const tasks = parseTasks(statusPath);

  // 判据3：所有 develop(source=manual-test, iteration=vN) 已 merged
  if (tasks === null) {
    fail('G4:manual-test任务状态', statusPath, 'status.yml 不存在，无法核 source=manual-test 任务是否全 merged（存量项目退回人工兜底）');
  } else {
    const mt = tasks.filter(t => t.source === 'manual-test' && t.iteration === iteration);
    const unmerged = mt.filter(t => t.status !== 'merged');
    if (mt.length === 0) pass('G4:manual-test任务状态', `无 source=manual-test 修复任务（${iteration}），判据空过`);
    else if (unmerged.length) fail('G4:manual-test任务状态', statusPath, `${unmerged.length} 个 source=manual-test 任务未 merged：${unmerged.map(t => t.id || '?').join(', ')}`);
    else pass('G4:manual-test任务状态', `${mt.length} 个 source=manual-test 任务全部 merged`);
  }

  // 判据4：验收报告已写，结论"通过"
  const reportPath = path.join(root, 'iterations', iteration, 'acceptance-report.md');
  if (!exists(reportPath)) {
    fail('G4:验收报告结论', reportPath, '验收报告 acceptance-report.md 不存在');
  } else {
    const lines = readLines(reportPath);
    const i = lines.findIndex(l => /^##\s*验收结论/.test(l));
    if (i < 0) fail('G4:验收报告结论', reportPath, '验收报告缺「## 验收结论」段');
    else {
      const body = lines.slice(i + 1, i + 6).join('\n');
      if (/通过/.test(body) && !/不通过|未通过/.test(body)) pass('G4:验收报告结论', '验收报告结论为「通过」');
      else fail('G4:验收报告结论', `${reportPath}:${i + 1}`, '「## 验收结论」段未明确写「通过」');
    }
  }

  // 语义残量（留人签，脚本不判）
  human('G4:人签', '用户是否明确说「验收通过」、所有反馈问题是否已处理——可视区人工验收，由签字人确认（design §3）');
}

/* ---------------- G5 ---------------- */
function checkG5(iteration, root) {
  // 判据2：feedback.md 已清空（仅剩标题/空白，无数据行）
  const fbPath = path.join(root, 'feedback.md');
  if (!exists(fbPath)) {
    pass('G5:feedback已清空', 'feedback.md 不存在（视为无残留）');
  } else {
    const lines = readLines(fbPath);
    const residue = lines.filter(l => {
      const t = l.trim();
      if (t === '') return false;
      if (/^#\s/.test(t)) return false;        // 标题行
      if (/^-{3,}$/.test(t)) return false;     // 分隔线
      return true;                              // 其余即残留数据
    });
    if (residue.length) fail('G5:feedback已清空', `${fbPath}`, `feedback.md 未清空，残留 ${residue.length} 行（首行：${residue[0].trim().slice(0, 40)}…）`);
    else pass('G5:feedback已清空', 'feedback.md 已清空');
  }

  // 判据3：project.md 无"开发中"标注
  const pjPath = path.join(root, 'project.md');
  if (!exists(pjPath)) {
    fail('G5:project无开发中', pjPath, 'project.md 不存在');
  } else {
    const lines = readLines(pjPath);
    const hits = lines.map((l, n) => ({ l, n: n + 1 })).filter(x => x.l.includes('开发中'));
    if (hits.length) fail('G5:project无开发中', `${pjPath}:${hits[0].n}`, `project.md 残留「开发中」标注 ${hits.length} 处（首处 L${hits[0].n}）`);
    else pass('G5:project无开发中', 'project.md 无「开发中」标注');
  }

  // 语义残量（留人签）
  human('G5:人签', 'backlog `[偏离]` 是否全部处理得当（建 revise-doc / 记 decisions）、feedback 分流是否准确——语义判断，由签字人确认');
}

/* ---------------- 主流程 ---------------- */
function main() {
  const [gate, iteration, rootArg] = process.argv.slice(2);
  const root = rootArg || process.cwd();
  if (!gate || !iteration || !/^G[45]$/.test(gate)) {
    console.error('用法: node check-gate.js <G4|G5> <vN> [项目根]');
    process.exit(2);
  }
  try {
    if (gate === 'G4') checkG4(iteration, root);
    else checkG5(iteration, root);
  } catch (e) {
    console.error('check-gate 自身出错（非产物问题）:', e.message);
    process.exit(2);
  }

  const fails = findings.filter(f => f.level === 'fail');
  const passes = findings.filter(f => f.level === 'pass');
  const humans = findings.filter(f => f.level === 'human');
  console.log(`\n=== check-gate ${gate} (${iteration}) 报告 ===`);
  console.log(`通过 ${passes.length} 项 / 失败 ${fails.length} 项\n`);
  if (fails.length) {
    console.log('❌ FAIL:');
    for (const f of fails) console.log(`  [${f.rule}] ${f.loc}\n      ${f.msg}`);
    console.log('');
  } else {
    console.log('✅ 确定性判据全部通过\n');
  }
  if (humans.length) {
    console.log('🧑 留签字人确认（脚本不判，非 FAIL）:');
    for (const h of humans) console.log(`  [${h.rule}] ${h.msg}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main();
