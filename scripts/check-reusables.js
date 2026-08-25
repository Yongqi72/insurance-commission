#!/usr/bin/env node
/*
 * check-reusables.js · 项目根 `reusables.md` 登记表可信度 linter
 *
 * 用途：机械核对「已落地资产」表里登记的**路径是否真的存在**。
 *      `reusables.md` 是一张纯人写人读的表，却被 `draft-tech-design`（做共享组件建议前读）、
 *      `plan-sprint`（切包时读）、`draft-prd-vN`（走过 V0 时核 as-built，读的正是「标杆切片登记」）
 *      当权威源消费——**读它的地方越多，它失真的代价越大**：登记指向一个已被改名/搬走/删掉的
 *      资产时，上述检查会静默放行（读到的是一句描述，不是一个能撞的东西）。
 *      本检查只答一个确定性问题：表里写的路径，此刻还在不在。
 *
 * 不做的事（成本远高于收益，留人走查）：
 *      「废弃资产无引用」——判定一个资产是否已废弃需要语义，且全仓引用扫描在大仓上很贵。
 *      「登记是否齐全」（该登记而没登记的资产）——分母不可枚举，机器答不了。
 *
 * 用法（在项目仓根目录执行）：
 *   node scripts/check-reusables.js            # 项目根 = cwd
 *   node scripts/check-reusables.js <项目根>
 *
 * 退出码：有任一 FAIL → 1；全 pass → 0；用法错误 / 自身出错 → 2。
 * 纯 Node 无外部依赖；markdown 表用针对本模板的行扫描，非完整 AST。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const findings = []; // {level:'fail'|'pass'|'human', rule, loc, msg}
const fail  = (rule, loc, msg) => findings.push({ level: 'fail',  rule, loc, msg });
const pass  = (rule, msg)      => findings.push({ level: 'pass',  rule, msg });
const human = (rule, msg)      => findings.push({ level: 'human', rule, msg });

/* 表格行 → 单元格数组。首尾的空串（`|` 起止产生）去掉。 */
function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
}
const isSeparator = l => /^\s*\|[\s:|-]+\|\s*$/.test(l);
/* 占位行：模板初始态 `|（首期为空）| | | |`，或整行单元格全空 */
const isPlaceholder = cs => cs.every(c => c === '' || /（首期为空）|^—+$/.test(c));

/* 从「路径」单元格里取候选 token。
 * 优先取反引号包裹的片段（模板与实际用法都这么写）；没有反引号时退回整格文本按分隔符切。
 * 分隔符含中文顿号与逗号——同一格登记多个路径是常见写法（如全局管道五件横跨两个目录）。 */
function pathTokens(cell) {
  const backticked = [...cell.matchAll(/`([^`]+)`/g)].map(m => m[1].trim());
  const raw = backticked.length ? backticked : cell.split(/[、,，;；]/).map(s => s.trim());
  return raw
    .map(s => s.replace(/^[（(【]+|[）)】。，,；;]+$/g, '').trim())
    .filter(Boolean);
}

/* 仓内文件索引（懒建，且只在**已有路径对不上**时才建）：
 * 用于区分两种"对不上"——「这东西压根不在仓里了」（真失真，FAIL）与
 * 「东西在，只是不在登记写的位置」（登记按某子目录相对写，或资产搬了家；🧑 交人判）。
 * 不做这个区分的代价是实测出来的：按仓根严判时，两个真实项目分别报 34 / 7 条全红，
 * 而它们只是把路径相对 `src/`、`apps/web/` 写——一个 41 条全假阳性的检查器会被直接关掉。 */
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo']);
let fileIndex = null;   // 相对路径数组
function buildIndex(root) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 12 || out.length > 60000) return;          // 兜底：不为一次提示扫穿超大仓
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') && e.name !== '.claude') continue;
      if (IGNORE_DIRS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      out.push(path.relative(root, abs).split(path.sep).join('/') + (e.isDirectory() ? '/' : ''));
      if (e.isDirectory()) walk(abs, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}
/* 登记的 `a/b/c.ts` 在仓里以 `x/y/a/b/c.ts` 存在 → 算"位置不符"而非"不存在"。
 * 用后缀匹配而非同名匹配：只匹文件名会把 `index.ts` 撞成一片。 */
function findElsewhere(root, p) {
  if (!fileIndex) fileIndex = buildIndex(root);
  const needle = (p.endsWith('/') ? p.slice(0, -1) : p).replace(/^\.?\//, '');
  return fileIndex.filter(f => {
    const g = f.endsWith('/') ? f.slice(0, -1) : f;
    return g === needle || g.endsWith('/' + needle);
  });
}

/* 路径形：含 `/` 才当路径判。
 * 不含 `/` 的反引号片段是**对代码里某个标识符的指称**（`Actor`、`write-options.ts` 这类
 * "某文件里的某个导出"），它们不是可解析路径——拿它们去 statSync 只会造出一堆假阳性，
 * 那正是让检查器被当噪声关掉的走法。这类整行交给 🧑 段。 */
const isPathShaped = t => t.includes('/');

function checkReusables(root) {
  const file = path.join(root, 'reusables.md');
  if (!fs.existsSync(file)) {
    // 存量项目可能还没建这张表——与 check-sprint 对 status.yml 的兜底同口径：提示，不 FAIL。
    human('reusables 存在性', `未找到 ${path.relative(process.cwd(), file) || 'reusables.md'}——存量项目未建表则忽略本项；已建项目请确认路径`);
    return;
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  // 只扫「已落地资产」段：「建议已拒绝」表登记的是**没有落地**的东西，路径不该存在。
  let start = lines.findIndex(l => /^##\s+已落地资产/.test(l));
  if (start < 0) {
    // 早期模板用的是 `## 组件 / UI 元素` 这类分类小标题，没有「已落地资产」总段。
    // 这类仓判 FAIL 会把每一次带删除/改名的提交都拦死在一个与本次改动无关的历史差异上，
    // 于是门卫整体被 --no-verify 绕过——与 check-sprint 对无 status.yml 的存量项目同口径：提示，不拦。
    human('reusables 结构', '未找到「## 已落地资产」段（疑为早期模板的分类式表头）——本检查跳过；如需生效，把表头对齐当前 `templates/reusables.md`');
    return;
  }
  let end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l));
  if (end < 0) end = lines.length;

  let pathCol = -1;          // 「路径」列下标，由表头确定（不写死列序）
  let assetCol = -1;
  let rows = 0, checked = 0;
  const missing = [];
  const misplaced = [];
  const unresolvable = [];

  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) continue;
    if (isSeparator(line)) continue;
    const cs = cells(line);

    // 表头行：每个子表都有一行，据此重置列下标（各子表列序理论上可不同）
    if (cs.includes('路径')) { pathCol = cs.indexOf('路径'); assetCol = cs.findIndex(c => /资产/.test(c)); continue; }
    if (isPlaceholder(cs)) continue;
    if (pathCol < 0 || pathCol >= cs.length) continue;   // 表头还没出现过的散行，跳过

    rows++;
    const loc = `reusables.md:${i + 1}`;
    const asset = assetCol >= 0 && assetCol < cs.length ? cs[assetCol] : '(未知资产)';
    const cell = cs[pathCol];

    if (!cell) { fail('登记完整性', loc, `资产「${asset}」的路径列为空——登记不完整，消费方读不到可核对的东西`); continue; }

    const tokens = pathTokens(cell);
    const paths = tokens.filter(isPathShaped);
    if (!paths.length) {
      // 「模式」类资产（如某种类型封口手法）本就没有唯一路径，不判 FAIL，交人核。
      unresolvable.push(`${loc} 资产「${asset}」路径列无可解析路径（现文：${cell.slice(0, 50)}）`);
      continue;
    }

    for (const p of paths) {
      checked++;
      // 通配登记分两形，混判会造假红：
      //   `src/common/*`            → 目录形，核目录在不在
      //   `.../1720000001000-*.ts`  → 文件名前缀形（迁移文件常这么登记），核该目录下有没有以此为前缀的条目
      let probe = p, namePrefix = null;
      if (p.includes('*')) {
        const cut = p.slice(0, p.indexOf('*'));
        const slash = cut.lastIndexOf('/');
        probe = cut.slice(0, slash < 0 ? 0 : slash);
        const rest = cut.slice(slash + 1);
        if (rest) namePrefix = rest;                 // `*` 前还有半截文件名
      }
      if (!probe) continue;
      // 先剥尾部 `/` 再 stat：带尾斜杠去 stat 一个文件，系统直接抛 ENOTDIR，
      // 会把「登记为目录但实为文件」误报成「不存在」——两种失真的修法不同，不能混。
      const declaredDir = probe.endsWith('/');
      const abs = path.join(root, declaredDir ? probe.slice(0, -1) : probe);
      let st = null;
      try { st = fs.statSync(abs); } catch { /* 不在登记的位置 */ }
      let resolvedDir = st ? path.join(root, probe) : null;
      if (!st) {
        const hits = findElsewhere(root, probe);
        if (hits.length === 1) {
          misplaced.push(`${loc} 资产「${asset}」登记 \`${p}\`，仓内实际在 \`${hits[0]}\``);
          resolvedDir = path.join(root, hits[0]);      // 位置不符仍继续核前缀，避免同一行报两次
        } else if (hits.length > 1) {
          misplaced.push(`${loc} 资产「${asset}」登记 \`${p}\` 不在该位置，仓内有 ${hits.length} 处同后缀（${hits.slice(0, 2).join('、')}…）`);
          continue;
        } else {
          missing.push(`${loc} 资产「${asset}」→ \`${p}\` 仓内不存在（同后缀也搜不到）`);
          continue;
        }
      }
      // 以 `/` 结尾即声明是目录；实为文件说明资产形态变了，同样是登记失真
      if (st && declaredDir && !st.isDirectory()) { missing.push(`${loc} 资产「${asset}」→ \`${p}\` 登记为目录但实为文件`); continue; }
      // 文件名前缀形通配：目录已解析出来，核里面有没有以该前缀打头的条目
      if (namePrefix && resolvedDir) {
        let ents = [];
        try { ents = fs.readdirSync(resolvedDir); } catch { /* 读不了当空 */ }
        if (!ents.some(n => n.startsWith(namePrefix)))
          missing.push(`${loc} 资产「${asset}」→ \`${p}\`：目录在，但其中无以 \`${namePrefix}\` 打头的条目`);
      }
    }
  }

  if (missing.length) {
    for (const m of missing) fail('登记路径存在性', m.split(' ')[0], m.split(' ').slice(1).join(' '));
  } else if (checked) {
    pass('登记路径存在性', `已落地资产 ${rows} 行，${checked} 条路径全部存在`);
  }
  if (misplaced.length) {
    human('登记位置不符', `${misplaced.length} 条登记路径在仓根解析不到、但同后缀的东西在仓里另一处——若本项目按子目录相对登记，是**表的写法**该统一为仓根相对；若不是，就是资产搬了家而表没跟着动：\n      ` + misplaced.join('\n      '));
  }
  if (unresolvable.length) {
    human('路径不可解析', `${unresolvable.length} 行的路径列没有可解析路径（多为「模式」类资产，非缺陷）——请确认它指称的东西仍在：\n      ` + unresolvable.join('\n      '));
  }
  if (!rows) pass('登记路径存在性', '「已落地资产」表为空（首期或全为占位行），无可核路径');
}

function main() {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  if (!fs.existsSync(root)) { console.error(`项目根不存在：${root}`); process.exit(2); }
  try { checkReusables(root); }
  catch (e) { console.error('check-reusables 自身出错（非产物问题）:', e.message); process.exit(2); }

  const fails  = findings.filter(f => f.level === 'fail');
  const passes = findings.filter(f => f.level === 'pass');
  const humans = findings.filter(f => f.level === 'human');

  console.log('\n=== check-reusables 报告 ===');
  console.log(`通过 ${passes.length} 项 / 失败 ${fails.length} 项\n`);
  if (fails.length) {
    console.log('❌ FAIL:');
    for (const f of fails) console.log(`  [${f.rule}] ${f.loc}\n      ${f.msg}`);
    console.log('');
  } else {
    console.log('✅ 登记路径确定性判据通过（资产是否已废弃、该登记而未登记，机器不判）\n');
  }
  if (humans.length) {
    console.log('🧑 留人确认（脚本不判，非 FAIL）:');
    for (const h of humans) console.log(`  [${h.rule}] ${h.msg}`);
  }
  process.exit(fails.length ? 1 : 0);
}
main();
