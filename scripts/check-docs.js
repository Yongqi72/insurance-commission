#!/usr/bin/env node
/*
 * check-docs.js · hact-method 产物结构 linter（子计划 1 · 地基）
 *
 * 用途：机械核对 PRD / TRD 的「结构完备」+「交叉一致」完成判据。
 *      交叉一致含两条：PRD 涉及实体↔TRD 表；PRD AC-nn↔TRD「# 满足 AC」回链
 *      （逐条正向挡悬空 + 逐条反向验覆盖，替代 draft-tech-design 旧人工「覆盖映射自检」）。
 *      只验确定性可查的部分；语义判据（场景5要素/三角评估/AC是否用户真要的/
 *      载体是否真承接 AC 而非仅 id 在场）不碰，留人（🧑 段）。
 *
 * 用法：
 *   node check-docs.js <prd.md> <trd.md>   # 全量 + 交叉对账（推荐）
 *   node check-docs.js --prd <prd.md>      # 只验 PRD
 *   node check-docs.js --trd <trd.md>      # 只验 TRD
 *   位置参数顺序：第一个当 prd、第二个当 trd（也可用 --prd/--trd 显式指定）
 *
 * 退出码：有任一 FAIL → 1；全 pass → 0。
 *
 * 解析策略：容错行扫描（按固定 header + 槽位标签），非完整 markdown AST。
 *          依赖模板的固定 header（## 段落 / ### 功能：/ ### 表：/ ### 接口：）与
 *          槽位写法（**字段**：值）。HTML 注释（<!-- -->）整体忽略。
 */
'use strict';
const fs = require('fs');

const PLACEHOLDER = '<待填>';
const findings = []; // {level:'fail'|'pass'|'human', rule, loc, msg}
function fail(rule, loc, msg) { findings.push({ level: 'fail', rule, loc, msg }); }
function pass(rule, msg) { findings.push({ level: 'pass', rule, msg }); }
function human(rule, msg) { findings.push({ level: 'human', rule, msg }); }

function isEmptyVal(v) {
  const t = (v || '').trim();
  return t === '' || t.includes(PLACEHOLDER);
}

// 「涉及实体」的显式无值写法：`无` 或 `无（理由）`。
//
// 为什么需要这条：工程债 / 纯工具类功能真的不碰任何数据实体，而两条判据会把它夹死——
// 槽位留空判「为空或占位」，填「无」又被交叉对账当成实体名去 TRD 找「### 表：无」。
// 于是唯一的出路变成「随便写个实体名骗过去」，而那正是交叉对账要防的事。
// 原则：**措辞规避不是修复**，缺出口就把出口开出来，不让后来者去绕。
function isExplicitNone(v) {
  return /^无\s*(?:[（(].*[）)])?$/.test((v || '').trim());
}

// 读文件 → 行数组，并标注每行是否处于 HTML 注释内（注释行不计入内容/槽位）
function readDoc(path) {
  const raw = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  const lines = [];
  let inComment = false;
  for (let i = 0; i < raw.length; i++) {
    let text = raw[i];
    let commented = inComment;
    // 单行内可能 <!-- ... --> 开闭；粗略处理：只要本行起始就在注释内 → commented
    if (!inComment && /<!--/.test(text)) {
      commented = true;
      if (/-->/.test(text)) inComment = false; // 单行注释，下一行恢复
      else inComment = true;
    } else if (inComment && /-->/.test(text)) {
      inComment = false; // 本行仍算注释行
    }
    lines.push({ n: i + 1, text, commented });
  }
  return lines;
}

const reH2 = /^##\s+(.+?)\s*$/;
const reH3 = /^###\s+(.+?)\s*$/;
const reSlot = /^\*\*(.+?)\*\*\s*[:：]\s*(.*)$/;
const reListItem = /^\s*[-*]\s+(.+)$/;

// 把文档切成 level-2 段落：{title, start, lines:[{n,text,commented}]}（含其下 ### 块）
function splitSections(lines) {
  const sections = [];
  let cur = null;
  for (const ln of lines) {
    if (ln.commented) { if (cur) cur.lines.push(ln); continue; }
    const m = ln.text.match(reH2);
    if (m) {
      cur = { title: m[1].trim(), start: ln.n, lines: [] };
      sections.push(cur);
    } else if (cur) {
      cur.lines.push(ln);
    }
  }
  return sections;
}

function sectionByTitle(sections, title) {
  return sections.find(s => s.title === title);
}

// 段落是否有实质内容（非空行、非注释、非纯占位）
function sectionHasContent(sec) {
  return sec.lines.some(ln => {
    if (ln.commented) return false;
    const t = ln.text.trim();
    if (t === '') return false;
    if (t.includes(PLACEHOLDER)) return false;
    return true;
  });
}

// 把一个 section 内的 ### 块切出来：{name, start, lines:[]}
function splitBlocks(sec, h3prefix) {
  const blocks = [];
  let cur = null;
  for (const ln of sec.lines) {
    const m = !ln.commented && ln.text.match(reH3);
    if (m && m[1].startsWith(h3prefix)) {
      cur = { name: m[1].slice(h3prefix.length).trim(), start: ln.n, lines: [] };
      blocks.push(cur);
    } else if (cur) {
      cur.lines.push(ln);
    }
  }
  return blocks;
}

// 兼容三种槽位写法：`**key**：v`（PRD 功能槽）/ `- key：v`（TRD 表/接口列表槽）/ `key：v`
function getSlot(blockLines, key) {
  for (const ln of blockLines) {
    if (ln.commented) continue;
    const t = ln.text.replace(/^\s*[-*]\s+/, ''); // 去列表标记
    const m = t.match(/^(?:\*\*)?(.+?)(?:\*\*)?\s*[:：]\s*(.*)$/);
    if (m && m[1].trim() === key) return { val: m[2], line: ln.n };
  }
  return null;
}

// ---------------- PRD ----------------
const PRD_SECTIONS = ['产品目标', '目标用户', '核心功能', '用户故事', 'MVP 边界', '开放问题'];
const DRAFT_UX_ENUM = ['需要', '不需要'];

function checkPRD(path) {
  const lines = readDoc(path);
  const strictAcFormat = lines.some(ln => /ac-format:\s*intent-oracle-v1/.test(ln.text));
  const sections = splitSections(lines);
  const file = path;

  // 1. 6 段落齐 + 无空段（开放问题反向：须为空）
  for (const title of PRD_SECTIONS) {
    const sec = sectionByTitle(sections, title);
    if (!sec) { fail('PRD段落完备', `${file}`, `缺段落「## ${title}」`); continue; }
    if (title === '开放问题') {
      const items = sec.lines.filter(ln => !ln.commented && reListItem.test(ln.text));
      if (items.length > 0) fail('PRD开放问题清空', `${file}:${items[0].n}`, `「开放问题」段未清空（残留 ${items.length} 项），定稿须为空`);
      else pass('PRD开放问题清空', '开放问题段为空');
      continue;
    }
    if (title === '核心功能') continue; // 由功能块校验覆盖
    if (!sectionHasContent(sec)) fail('PRD段落非空', `${file}:${sec.start}`, `段落「## ${title}」为空或仅占位`);
    else pass('PRD段落非空', `「## ${title}」有内容`);
  }

  // 2. 功能块
  const core = sectionByTitle(sections, '核心功能');
  const entities = [];
  const acIds = new Map();   // 全 PRD 的 AC id → 首次出现行号（全局唯一校验）
  let acBad = false;         // 任一 AC id 缺失/重号 → 跳过末尾汇总 pass
  if (core) {
    const blocks = splitBlocks(core, '功能：');
    if (blocks.length === 0) fail('PRD功能块存在', `${file}:${core.start}`, '「核心功能」段无任何「### 功能：」块');
    for (const b of blocks) {
      const where = `${file}:${b.start}`;
      const tag = `功能「${b.name}」`;
      for (const key of ['入口', '涉及实体']) {
        const slot = getSlot(b.lines, key);
        if (!slot) fail('PRD功能槽完备', where, `${tag} 缺槽位「${key}」`);
        else if (isEmptyVal(slot.val)) fail('PRD功能槽非空', `${file}:${slot.line}`, `${tag} 槽位「${key}」为空或占位`);
        else pass('PRD功能槽非空', `${tag} ${key} 已填`);
      }
      const ux = getSlot(b.lines, 'draft-ux');
      if (!ux) fail('PRD功能槽完备', where, `${tag} 缺槽位「draft-ux」`);
      else if (isEmptyVal(ux.val) || !DRAFT_UX_ENUM.includes(ux.val.trim()))
        fail('PRDdraftux枚举', `${file}:${ux.line}`, `${tag} draft-ux 取值「${ux.val.trim()}」非法，须 ∈ {需要,不需要}`);
      else pass('PRDdraftux枚举', `${tag} draft-ux=${ux.val.trim()}`);
      // AC ≥1：只取顶格列表项；intent/oracle/example 是缩进子项，不得误算成额外 AC。
      const acItems = b.lines.filter(ln => !ln.commented && /^[-*]\s+/.test(ln.text) && !ln.text.includes(PLACEHOLDER));
      if (acItems.length === 0) fail('PRD功能AC存在', where, `${tag} 无有效 Acceptance Criteria 条目`);
      else pass('PRD功能AC存在', `${tag} 有 ${acItems.length} 条 AC`);
      for (const ln of acItems) {
        const body = ln.text.replace(/^\s*[-*]\s+/, '');
        const m = body.match(/^(AC-\d+)\s*[:：]/);
        if (!m) { acBad = true; fail('PRD AC id', `${file}:${ln.n}`, `${tag} AC 条目缺全局唯一 id「AC-nn：」前缀 —— ${body.slice(0, 30)}…`); continue; }
        const id = m[1];
        if (acIds.has(id)) { acBad = true; fail('PRD AC id 唯一', `${file}:${ln.n}`, `AC id「${id}」重号（另见 ${file}:${acIds.get(id)}）`); }
        else acIds.set(id, ln.n);
        const at = b.lines.indexOf(ln);
        let end = b.lines.length;
        for (let j = at + 1; j < b.lines.length; j++) {
          if (!b.lines[j].commented && /^[-*]\s+/.test(b.lines[j].text)) { end = j; break; }
        }
        const detail = b.lines.slice(at + 1, end).filter(x => !x.commented).map(x => x.text).join('\n');
        const hasIntent = /^\s+[-*]\s+intent\s*[:：]\s*\S+/mi.test(detail) && !detail.match(/^\s+[-*]\s+intent.*<待填>/mi);
        const hasOracle = /^\s+[-*]\s+oracle\s*[:：]\s*\S+/mi.test(detail) && !detail.match(/^\s+[-*]\s+oracle.*<待填>/mi);
        if (strictAcFormat && (!hasIntent || !hasOracle))
          fail('PRD AC intent/oracle', `${file}:${ln.n}`, `${id} 缺有效 intent 或 oracle（example 可省）`);
      }
      // 收集实体供交叉对账
      const ent = getSlot(b.lines, '涉及实体');
      if (ent && !isEmptyVal(ent.val) && !isExplicitNone(ent.val)) {
        ent.val.split(/[,，、]/).map(s => s.trim()).filter(Boolean).forEach(e => entities.push(e));
      }
    }
    if (acIds.size && !acBad) pass('PRD AC id 唯一', `${acIds.size} 条 AC 均带全局唯一 id（append-only，允许空号）`);
  }
  return { entities, acIds: [...acIds.keys()], acBad };
}

// ---------------- TRD ----------------
const TRD_SECTIONS = ['技术选型变更', '数据库设计', '接口设计', '测试环境约定', '交互技术方案', '模块拆分', '共享组件建议'];

function checkTRD(path) {
  const lines = readDoc(path);
  const sections = splitSections(lines);
  const file = path;

  for (const title of TRD_SECTIONS) {
    const sec = sectionByTitle(sections, title);
    if (!sec) { fail('TRD段落完备', `${file}`, `缺段落「## ${title}」`); continue; }
    if (['数据库设计', '接口设计'].includes(title)) continue; // 由块校验覆盖
    if (!sectionHasContent(sec)) fail('TRD段落非空', `${file}:${sec.start}`, `段落「## ${title}」为空或仅占位`);
    else pass('TRD段落非空', `「## ${title}」有内容`);
  }

  // 数据库设计 → 表块
  const tables = [];
  const db = sectionByTitle(sections, '数据库设计');
  if (db) {
    const blocks = splitBlocks(db, '表：');
    if (blocks.length === 0) fail('TRD表块存在', `${file}:${db.start}`, '「数据库设计」段无任何「### 表：」块');
    for (const b of blocks) {
      tables.push(b.name);
      const f = getSlot(b.lines, '字段');
      if (f && isEmptyVal(f.val)) fail('TRD表字段非空', `${file}:${f.line}`, `表「${b.name}」字段槽为空或占位`);
    }
  }

  // 接口设计 → 接口块（轻校验：三槽非空）
  const api = sectionByTitle(sections, '接口设计');
  if (api) {
    const blocks = splitBlocks(api, '接口：');
    if (blocks.length === 0) fail('TRD接口块存在', `${file}:${api.start}`, '「接口设计」段无任何「### 接口：」块');
    for (const b of blocks) {
      for (const key of ['请求体', '响应体', '错误码']) {
        const slot = getSlot(b.lines, key);
        if (slot && isEmptyVal(slot.val)) fail('TRD接口槽非空', `${file}:${slot.line}`, `接口「${b.name}」槽位「${key}」为空或占位`);
      }
    }
  }

  // 全局扫 `满足 AC：AC-nn` 回链 tag（载体无关：接口/模块/交互场景都可挂，统一抽 id）
  // 见 draft-tech-design.md §接口设计 + AC 覆盖映射自检；与 PRD AC id 在 checkCross 逐条对账
  const acRefs = new Set();
  for (const ln of lines) {
    if (ln.commented) continue;
    if (!/满足\s*AC/.test(ln.text)) continue;
    let m; const re = /AC-\d+/g;
    while ((m = re.exec(ln.text))) acRefs.add(m[0]);
  }
  return { tables, acRefs: [...acRefs] };
}

// ---------------- 交叉一致 ----------------
function checkCross(prdRes, trdRes, prdPath, trdPath) {
  const { entities, acIds, acBad } = prdRes;
  const { tables, acRefs } = trdRes;
  const norm = s => s.trim().toLowerCase();

  // 1. PRD 涉及实体 ↔ TRD 表
  const tableSet = new Set(tables.map(norm));
  const seen = new Set();
  for (const e of entities) {
    if (seen.has(norm(e))) continue;
    seen.add(norm(e));
    if (!tableSet.has(norm(e)))
      fail('交叉:实体有对应表', `${prdPath} → ${trdPath}`, `PRD 涉及实体「${e}」在 TRD 无对应「### 表：${e}」`);
    else pass('交叉:实体有对应表', `实体「${e}」↔ 表存在`);
  }

  // 2. PRD AC ↔ TRD `# 满足 AC：AC-nn` 回链（draft-tech-design 覆盖映射自检的机械化）
  //    逐条正向：每个 TRD 回链 id 在 PRD 存在（挡悬空/打错号）
  //    逐条反向：每个 PRD AC-nn 被 ≥1 TRD 载体回链承接（替代旧人工「覆盖映射」）
  //    存量兜底：PRD 无 AC-nn 形式 id（旧 AC1 格式 / acBad）→ 退人工，不误报。
  const trdRefSet = new Set(acRefs);
  // 正向：悬空回链（无论 PRD id 是否齐——打错号本身就该挡）
  if (acRefs.length) {
    const prdSet = new Set(acIds);
    const dangling = acRefs.filter(id => !prdSet.has(id));
    if (dangling.length) fail('交叉:AC回链悬空', `${trdPath} → ${prdPath}`, `TRD「# 满足 AC」回链的 ${dangling.join('、')} 在 PRD 不存在（打错号/已退休）`);
    else pass('交叉:AC回链悬空', `TRD ${acRefs.length} 处 AC 回链均指向 PRD 实有 AC`);
  }
  // 反向：PRD 每条 AC 被承接
  if (!acIds.length || acBad) {
    human('交叉:AC逐条覆盖', `PRD 无可靠的 AC-nn id（存量旧格式或 id 校验未过）→ 逐条 AC 覆盖映射退人工兜底：由签字人核 PRD 每条 AC 是否都被 TRD 载体（接口/模块/交互场景）承接`);
  } else {
    const uncovered = acIds.filter(id => !trdRefSet.has(id));
    if (uncovered.length) fail('交叉:AC逐条覆盖', `${prdPath} → ${trdPath}`, `PRD AC 未被任何 TRD 载体「# 满足 AC」回链承接：${uncovered.join('、')}（补回链或列疑点向用户确认是范围调整还是设计遗漏，不静默丢）`);
    else pass('交叉:AC逐条覆盖', `PRD ${acIds.length} 条 AC 均被 TRD 载体回链承接（逐条）`);
  }
}

// ---------------- 主流程 ----------------
function parseArgs(argv) {
  const out = { prd: null, trd: null };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--prd') out.prd = argv[++i];
    else if (argv[i] === '--trd') out.trd = argv[++i];
    else pos.push(argv[i]);
  }
  if (!out.prd && pos[0]) out.prd = pos[0];
  if (!out.trd && pos[1]) out.trd = pos[1];
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prd && !args.trd) {
    console.error('用法: node check-docs.js <prd.md> <trd.md>  (或 --prd / --trd)');
    process.exit(2);
  }
  let prdRes = null, trdRes = null;
  try {
    if (args.prd) prdRes = checkPRD(args.prd);
    if (args.trd) trdRes = checkTRD(args.trd);
  } catch (e) {
    console.error('linter 自身出错（非产物问题）:', e.message);
    process.exit(2);
  }
  if (prdRes && trdRes) checkCross(prdRes, trdRes, args.prd, args.trd);
  else if (args.prd && args.trd === null) console.log('（仅验 PRD，未做交叉对账——补 trd 参数可对账实体↔表、AC↔回链）');

  const fails = findings.filter(f => f.level === 'fail');
  const passes = findings.filter(f => f.level === 'pass');
  const humans = findings.filter(f => f.level === 'human');
  console.log(`\n=== check-docs 报告 ===`);
  console.log(`通过 ${passes.length} 项 / 失败 ${fails.length} 项\n`);
  if (fails.length) {
    console.log('❌ FAIL:');
    for (const f of fails) console.log(`  [${f.rule}] ${f.loc}\n      ${f.msg}`);
  } else {
    console.log('✅ 全部结构/一致性判据通过（语义判据仍需人核）');
  }
  if (humans.length) {
    console.log('\n🧑 留签字人确认（脚本不判，非 FAIL）:');
    for (const h of humans) console.log(`  [${h.rule}] ${h.msg}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main();
