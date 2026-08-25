#!/usr/bin/env node
/*
 * check-sprint.js · hact-method G3（plan-sprint 产物）完成判据 linter（子计划 3c）
 *
 * 用途：机械核对 G3 完成判据里**确定性可查**的部分——任务包字段完备 / reference 稳定锚 /
 *      AC 正向 tag（含逐条 id 存在性）+ 逐条 AC 反向覆盖（按 PRD AC-nn id）/ depends_on / sprint↔queue↔status 三方一致 /
 *      视觉地基包（v1 含前端必有 `baseline: visual` 包；vN+1 的 design.md 变更触发退人工）/
 *      归属真空（任务包声明"这件事不在本包"时，须确有另一个包认领）/
 *      审计留痕完备性（已 [merged] 的任务须有 code_reviews[]；新条目区分 code/spec rounds、墙钟、review profile 并落逐轮 report）。
 *      语义残量（疑点确认 / TRD 模块覆盖 / Step3.5 独审结论 / 逐条 AC 忠实性——内容真覆盖、非仅 id 在场）机器判不了，
 *      留签字人确认（🧑 段），脚本只把可机械的挡在签字前。
 *
 * 用法（在项目仓根目录执行）：
 *   node scripts/check-sprint.js vN          # 项目根 = cwd
 *   node scripts/check-sprint.js vN <项目根>
 *   node scripts/check-sprint.js --review <task-id> [项目根]  # A/B 通用 review 审计
 *
 * 退出码：有任一 FAIL → 1；全 pass → 0；用法错误 / 自身出错 → 2。
 *
 * 序列化前提（见 templates/queue/task-package.md + sub3c-design D1）：任务包用 YAML frontmatter。
 *   纯 Node 无外部依赖；frontmatter / status.yml 用针对本 schema 的容错行扫描，非完整 YAML AST。
 * 存量项目（无 status.yml）：三方一致的 status 侧退回兜底（pass + 提示），与 check-gate 同。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PLACEHOLDER = '<待填>';
const findings = []; // {level:'fail'|'pass'|'human', rule, loc, msg}
const fail  = (rule, loc, msg) => findings.push({ level: 'fail',  rule, loc, msg });
const pass  = (rule, msg)      => findings.push({ level: 'pass',  rule, msg });
const human = (rule, msg)      => findings.push({ level: 'human', rule, msg });

function readLines(p) { return fs.readFileSync(p, 'utf8').split(/\r?\n/); }
function exists(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function stripComment(s) { return s.replace(/\s+#.*$/, '').trim(); } // 去行尾 ` # 注释`

// 任务包机械必含的 17 字段（specs-structural/develop.md §字段规范的可校验子集）。
// status 不在内（与 status.yml 重复，由后者权威）；risk 缺省按 standard，不机械校验；api-contract 条件必填，单独判。
const REQUIRED = ['task-id', 'sprint_id', 'layers', 'source', 'task_type', 'urgency',
  'title', 'description', 'depends_on', 'files', 'acceptance-criteria',
  'relevant-standards', 'reference', 'context', 'known-risks', 'do-not', 'escalate-if'];

/* ---------- frontmatter 容错解析 ----------
 * 取首个 --- 与下一个 --- 之间。顶格 `key:` 为字段；支持：
 *   标量 `key: v` / 块标量 `key: >`|`|` / 块列表（后续 `  - item`）/ 行内列表 `key: [a, b]` / 空列表 `[]`
 * 返回 { key: {type, text, items} }。列表项的多行续行（更深缩进、非 `-`）并入上一项。
 */
function parseFrontmatter(p) {
  const raw = readLines(p);
  let s = raw.findIndex(l => /^---\s*$/.test(l));
  if (s < 0) return null;
  let e = raw.findIndex((l, i) => i > s && /^---\s*$/.test(l));
  if (e < 0) e = raw.length;
  const fmAbs = s + 1;                          // frontmatter 首行在文件中的绝对行号基
  const lines = raw.slice(s + 1, e);
  const fm = {};
  let curKey = null, cur = null;

  const closeKey = () => { if (curKey) { fm[curKey] = cur; curKey = null; cur = null; } };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.trim() === '') continue;
    if (/^\s*#/.test(ln)) continue;             // 整行注释
    const top = ln.match(/^([A-Za-z_][\w-]*):\s?(.*)$/); // 顶格字段（无前导空格）
    if (top && !/^\s/.test(ln)) {
      closeKey();
      curKey = top[1];
      const rest = top[2];
      const restNoComment = stripComment(rest);
      if (restNoComment === '[]') {
        cur = { type: 'inline-empty-list', text: '[]', items: [] };
      } else if (/^\[.*\]$/.test(restNoComment)) {
        const inner = restNoComment.slice(1, -1).trim();
        cur = { type: 'list', text: restNoComment,
                items: inner ? inner.split(',').map(x => x.trim()).filter(Boolean) : [] };
      } else if (restNoComment === '>' || restNoComment === '|') {
        cur = { type: 'block', text: '', items: [] };     // 后续缩进行并入
      } else if (restNoComment !== '') {
        cur = { type: 'scalar', text: restNoComment, items: [] };
      } else {
        cur = { type: 'pending', text: '', items: [] };   // 待后续行判定 list / block
      }
      continue;
    }
    if (!curKey) continue;
    // 续行：列表项 or 块标量行
    const item = ln.match(/^\s+-\s+(.*)$/);
    if (item) {
      if (cur.type === 'pending') cur.type = 'list';
      if (cur.type === 'list') cur.items.push(stripComment(item[1]));
      continue;
    }
    // 更深缩进的非 `-` 行：列表项续行（并入上一项）或块标量行
    if (cur.type === 'list' && cur.items.length) {
      cur.items[cur.items.length - 1] += ' ' + stripComment(ln);
    } else {
      if (cur.type === 'pending') cur.type = 'block';
      cur.text += (cur.text ? ' ' : '') + stripComment(ln);
    }
  }
  closeKey();
  fm.__line = fmAbs;
  return fm;
}

function valEmpty(key, v) {
  if (!v) return true;                                  // 字段缺失
  if (v.type === 'inline-empty-list') return !['depends_on', 'relevant-standards', 'reference', 'known-risks', 'do-not', 'escalate-if'].includes(key);
  if (v.type === 'list') return v.items.filter(x => x && !x.includes(PLACEHOLDER)).length === 0;
  const t = (v.text || '').trim();
  return t === '' || t.includes(PLACEHOLDER);
}
function listItems(v) { return v && v.items ? v.items.filter(x => x && !x.includes(PLACEHOLDER)) : []; }
function scalarText(v) { return v ? (v.text || '') : ''; }

const reLineNum = /L\s*\d+|\d+\s*[-–~]\s*\d+|行\s*\d+/;   // 行号 / 行号区间
const reSectionAnchor = /(?:§|#)\s*[^\s#]|(?:章节|小节)\s*[:：]/;
const reSymbolAnchor = /`[^`]+`|(?:class|function|method|symbol)\s*[:：]\s*\S+/i;
const hasStableAnchor = s => reLineNum.test(s) || reSectionAnchor.test(s) || reSymbolAnchor.test(s);
const reAcTag = /[（(]\s*源\s*[:：]\s*PRD/;               // (源：PRD…)
const reTechTag = /[（(]\s*技术\s*[)）]/;                  // (技术)
const reIntent = /\bintent\s*[:：]/i;
const reOracle = /\boracle\s*[:：]/i;
const reExample = /\bexample\s*[:：]/i;
const reGoldenTrue = /\bgolden\s*[:：]\s*true\b/i;

/* ---------- risk 敏感启发词（安全敏感预检四类，决策#29） ----------
 * 启发式只升不降：命中而任务包未标 risk: sensitive → 🧑 留签字人确认（非 FAIL，允许误报）。
 * 语义级判定在 develop 侧（阶段 B 有效 risk + 末端 diff 独立预检），此处只做确定性词面拦截。*/
const SENSITIVE_HINTS = [
  // 权限 / 认证 / 数据隔离
  '权限', '鉴权', '认证', '越权', '租户', '密码', 'auth', 'permission', 'guard', 'jwt', 'acl',
  // 不可逆数据操作
  '迁移', 'migration', 'drop', 'truncate', '清空', '批量删', '硬删', 'schema',
  // 金额 / 计费
  '金额', '计费', '价格', '扣费', '支付', '退款', '对账', 'billing', 'payment', 'refund',
  // 对外不可撤销副作用
  '扣款', '短信', '邮件', '发信', 'webhook', 'sms',
];
/* 扫描字段白名单。`risk-note`（作者解释"为什么这次命中是误报"的地方）**刻意不在其中**——
 * 否则解释文字本身必然复述启发词、再次命中，作者只能靠改措辞绕开，而改措辞会削弱说明本身。
 * 这不违反「只升不降」：既有字段的信号一个没少，只是给误报说明一个不自我触发的落点。*/
const RISK_SCAN_FIELDS = ['title', 'description', 'acceptance-criteria', 'files', 'known-risks'];
function sensitiveHits(fm) {
  const chunks = [];
  for (const k of RISK_SCAN_FIELDS) {
    const v = fm[k];
    if (!v) continue;
    chunks.push(scalarText(v), ...listItems(v));
  }
  const text = chunks.join(' ').toLowerCase();
  return SENSITIVE_HINTS.filter(w => {
    const needle = w.toLowerCase();
    // `oracle` 内含字母串 `acl`；ACL 只按独立 token 匹配，避免新 AC schema 让所有任务误升 sensitive。
    if (needle === 'acl') return /(^|[^a-z0-9_])acl(?=$|[^a-z0-9_])/.test(text);
    return text.includes(needle);
  });
}

/* ---------- 归属真空：推卸语检测 ----------
 * 缺陷常落在「A 包不做 ∩ B 包不做」的交集里——两个包各自都合规，没人认领那件事。
 * 只匹配"移交给别人"的措辞，不匹配普通禁令（`do-not` 里的"不改 X / 不新增 Y"是正常内容）。
 * 机械可判的只有三件：① 点名的包 id 不在本 sprint queue（推给不存在的包）；② 两包互推（环）；
 * ③ 未点名任何包 id 的推卸语 → 认领方机器认不出，留 🧑 逐条指认。 */
const PUNT_HINTS = [
  // 「不在本包内另查 X」是实现禁令不是移交，排除 内/中/里 后缀
  /不在本包(?![内中里])/, /不在此包(?![内中里])/, /非本包(负责|职责|范围)/, /本包不(负责|收口|承接|覆盖)/,
  /(收口|统一|落点|接线|入口|实现)不在(本|此)包/,
  /留(给)?(后续|下期|下一期|后面|以后|其它包|其他包|另一包)/,
  /(由|归)\s*[\w一-龥-]{1,24}?包\s*(负责|实现|收口|承接|处理|做)/,
  /后续包/, /另起(一)?包/, /下期(再|另)?(做|补|处理|收口)/,
];
const PUNT_SCAN_FIELDS = ['do-not', 'context'];
const reTaskIdLike = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+-\d{2,3}\b/gi;

/* 返回本包所有推卸语行：{ text, named: 被点名且在 queue 的包 id, ghosts: 被点名但 queue 里没有的 }
 * 走**原始行**而非 parseFrontmatter 的产物：共用解析器按 YAML 规矩把 ` #` 起的尾串当注释剥掉，
 * 而任务包正文里 `决策 #25` 这类引用很常见，剥完会把同一行后半段（推卸语常在那）一起吃掉。 */
function puntLines(file, selfId, queueIds) {
  const raw = readLines(file);
  const s = raw.findIndex(l => /^---\s*$/.test(l));
  if (s < 0) return [];
  let e = raw.findIndex((l, i) => i > s && /^---\s*$/.test(l));
  if (e < 0) e = raw.length;
  const out = [];
  let curKey = null;
  for (const ln of raw.slice(s + 1, e)) {
    const top = /^\s/.test(ln) ? null : ln.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (top) curKey = top[1];
    if (!PUNT_SCAN_FIELDS.includes(curKey)) continue;
    const line = (top ? top[2] : ln).replace(/^\s*-\s+/, '').trim();
    if (!line) continue;
    const hit = PUNT_HINTS.map(re => line.match(re)).find(Boolean);
    if (!hit) continue;
    const mentioned = [...new Set(line.match(reTaskIdLike) || [])].filter(x => x !== selfId);
    // 报文只截推卸语前后各 30 字——整行常上百字，从行首截会看不见命中处
    const at = hit.index;
    out.push({
      field: curKey,
      text: (at > 30 ? '…' : '') + line.slice(Math.max(0, at - 30), at + 30) + (at + 30 < line.length ? '…' : ''),
      named: mentioned.filter(x => queueIds.includes(x)),
      ghosts: mentioned.filter(x => !queueIds.includes(x)),
    });
  }
  return out;
}

/* ---------- 任务包 AC 行：抽 (源：PRD …) 标签内的所有 AC-nn id ----------
 * 支持单条多覆盖 (源：PRD AC-01、AC-02) 与人读后缀 (源：PRD AC-01·删除确认)。*/
function acRefIds(ac) {
  const tag = ac.match(/[（(]\s*源\s*[:：]\s*PRD([^)）]*)[)）]/);
  if (!tag) return [];
  const out = []; let m; const re = /AC-\d+/g;
  while ((m = re.exec(tag[1]))) out.push(m[0]);
  return out;
}

/* ---------- PRD：抽核心功能各 AC 列表项的全局唯一 AC-nn id ---------- */
function prdAcIds(prdPath) {
  if (!exists(prdPath)) return null;
  const ids = new Set();
  let inCore = false;
  for (const l of readLines(prdPath)) {
    if (/^##\s/.test(l)) inCore = /^##\s*核心功能/.test(l);
    if (!inCore) continue;
    const m = l.match(/^\s*[-*]\s+(AC-\d+)\s*[:：]/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/* ---------- sprint.md：抽表格首列 task-id ---------- */
function sprintIds(sprintPath) {
  if (!exists(sprintPath)) return null;
  const ids = [];
  for (const l of readLines(sprintPath)) {
    if (!/^\s*\|/.test(l)) continue;
    const cells = l.split('|').map(c => c.trim());
    const first = cells[1] || '';
    if (!first || first === 'task-id' || /^-{2,}$/.test(first.replace(/\s/g, ''))) continue;
    if (/-.*\d/.test(first)) ids.push(first);            // task-id 形如 hact-v4-001
  }
  return ids;
}

/* ---------- status.yml：抽 tasks[] 的 id/source/iteration（容错，同 check-gate） ---------- */
function parseStatusTasks(statusPath) {
  if (!exists(statusPath)) return null;
  const lines = readLines(statusPath);
  const tasks = [];
  let inTasks = false, baseIndent = null, cur = null;
  const flush = () => { if (cur) { tasks.push(cur); cur = null; } };
  const clean = v => (v || '').trim().replace(/^["']|["']$/g, '').replace(/^\[|\]$/g, '').trim();
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    if (/^tasks:\s*$/.test(line)) { inTasks = true; continue; }
    if (!inTasks) continue;
    if (/^\S/.test(line) && !/^-/.test(line)) { flush(); break; }
    if (line.trim() === '') continue;
    const item = line.match(/^(\s*)-\s+(.*)$/);
    if (item) {
      const indent = item[1].length;
      if (baseIndent === null) baseIndent = indent;
      if (indent === baseIndent) {
        flush(); cur = {};
        const kv = item[2].match(/^([A-Za-z_-]+):\s*(.*)$/);
        if (kv) cur[kv[1]] = clean(kv[2]);
        continue;
      }
    }
    const kv = line.match(/^\s+([A-Za-z_-]+):\s*(.*)$/);
    if (kv && cur) cur[kv[1]] = clean(kv[2]);
  }
  flush();
  return tasks;
}

// 迭代内 queue 的三个进料口（三方一致 + 审计留痕两处共用，故提到模块级）。
const ITER_SOURCES = new Set(['sprint', 'integration', 'manual-test']);

/* ---------- status.yml：抽 code_reviews[] 的 iteration/task_id/rounds 拆分（同上容错扫描） ----------
 * 只取顶层键即可判完备性；`comment` 常是长中文单行、`issues:` 是更深缩进的子列表，
 * 均靠「顶层条目缩进 === baseIndent」这一条挡住，不做完整 YAML AST。 */
function parseCodeReviews(statusPath) {
  if (!exists(statusPath)) return null;
  const out = [];
  let inBlk = false, baseIndent = null, cur = null;
  const flush = () => { if (cur) { out.push(cur); cur = null; } };
  const clean = v => (v || '').trim().replace(/^["']|["']$/g, '').trim();
  for (const raw of readLines(statusPath)) {
    const line = raw.replace(/\t/g, '  ');
    if (/^code_reviews:\s*$/.test(line)) { inBlk = true; continue; }
    if (!inBlk) continue;
    if (/^\s*#/.test(line)) continue;                               // 注释行（含顶格 `#` 的 schema 示例块）——
    // 必须先于下面的"顶层新键"判定：真实 status.yml 在 code_reviews[] 中段夹着顶格注释示例
    // （doc-extract 即如此），当作块结束会静默丢掉其后的全部条目（实测漏 4 条）。
    if (/^\S/.test(line) && !/^-/.test(line)) { flush(); break; }   // 顶层新键 → 本块结束
    if (line.trim() === '') continue;
    const item = line.match(/^(\s*)-\s+(.*)$/);
    if (item) {
      const indent = item[1].length;
      if (baseIndent === null) baseIndent = indent;
      if (indent === baseIndent) {
        flush(); cur = {};
        const kv = item[2].match(/^([A-Za-z_-]+):\s*(.*)$/);
        if (kv) cur[kv[1]] = clean(kv[2]);
        continue;
      }
      continue;                                                     // issues[] 等子列表项，跳过
    }
    const kv = line.match(/^\s+([A-Za-z_-]+):\s*(.*)$/);
    if (kv && cur && !(kv[1] in cur)) cur[kv[1]] = clean(kv[2]);    // 首次出现为准，防子块同名键覆盖
  }
  flush();
  return out;
}

const REVIEW_AUDIT_FIELDS = [
  'review_report_dir',
  'review_profile_version',
  'implementation_started_at', 'implementation_completed_at',
  'review_started_at', 'review_completed_at',
  'implementation_minutes', 'review_minutes', 'spec_minutes',
];
const isUInt = v => /^\d+$/.test(v || '');
const isSha40 = v => /^[0-9a-f]{40}$/i.test(v || '');
const isSha256 = v => /^[0-9a-f]{64}$/.test(v || '');
const parseIso = v => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v || '')) return NaN;
  return Date.parse(v);
};
const ceilMinutes = (start, end) => Math.ceil((end - start) / 60000);
const FOUNDATION_PROFILE_VERSION = 'foundation-review/v1';

function resolveProjectFile(root, rel) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(root, rel || '');
  if (!rel || path.isAbsolute(rel) || (abs !== absRoot && !abs.startsWith(absRoot + path.sep))) return null;
  return abs;
}

function findTaskPackages(root, id) {
  const matches = [];
  const bTask = path.join(root, 'b-queue', `${id}.md`);
  if (exists(bTask)) matches.push(bTask);
  const iterationsDir = path.join(root, 'iterations');
  if (fs.existsSync(iterationsDir) && fs.statSync(iterationsDir).isDirectory()) {
    for (const iteration of fs.readdirSync(iterationsDir)) {
      const candidate = path.join(iterationsDir, iteration, 'queue', `${id}.md`);
      if (exists(candidate)) matches.push(candidate);
    }
  }
  return matches;
}

function fullProfileErrors(root, id, profileRel, taskPackagePath, changedFiles, effectiveRisk) {
  const errors = [];
  const profilePath = resolveProjectFile(root, profileRel);
  if (!profilePath || !exists(profilePath)) return [`review_profile 非项目内现存文件：${profileRel || '(empty)'}`];
  let tools, actual;
  try { tools = require('./review-profile'); }
  catch (error) { return [`缺 scripts/review-profile.js 或无法加载：${error.message}`]; }
  try { actual = JSON.parse(fs.readFileSync(profilePath, 'utf8')); }
  catch (error) { return [`${profileRel}: JSON 无法解析：${error.message}`]; }
  const expected = tools.buildReviewProfileFromText(
    fs.readFileSync(taskPackagePath, 'utf8'), changedFiles, effectiveRisk);
  if (actual.schema !== tools.PROFILE_SCHEMA) errors.push(`${profileRel}: schema 非 ${tools.PROFILE_SCHEMA}`);
  if (actual.task_id !== id) errors.push(`${profileRel}: task_id 不匹配`);
  if (actual.task_type !== expected.task_type) errors.push(`${profileRel}: task_type 与权威任务包不一致`);
  if (JSON.stringify(actual.layers) !== JSON.stringify(expected.layers)) errors.push(`${profileRel}: layers 与权威任务包不一致`);
  if (actual.source !== expected.source) errors.push(`${profileRel}: source 与权威任务包不一致`);
  if (actual.effective_risk !== effectiveRisk) errors.push(`${profileRel}: effective_risk 与 round risk 不一致`);
  if (actual.input_fingerprint !== expected.input_fingerprint) errors.push(`${profileRel}: input_fingerprint 与权威输入不一致`);
  if (JSON.stringify(actual.changed_files) !== JSON.stringify(expected.changed_files))
    errors.push(`${profileRel}: changed_files 与 full round 不一致`);
  if (JSON.stringify(actual.selected_dimensions) !== JSON.stringify(expected.selected_dimensions))
    errors.push(`${profileRel}: selected_dimensions 不是选择器重算结果`);
  if (JSON.stringify(actual.omitted_dimensions) !== JSON.stringify(expected.omitted_dimensions))
    errors.push(`${profileRel}: omitted_dimensions 不是选择器重算结果`);
  if (JSON.stringify(actual.signals) !== JSON.stringify(expected.signals))
    errors.push(`${profileRel}: signals 不是选择器重算结果`);
  const selectedIds = Array.isArray(actual.selected_dimensions) ? actual.selected_dimensions.map(x => x && x.id) : [];
  const omittedIds = Array.isArray(actual.omitted_dimensions) ? actual.omitted_dimensions.map(x => x && x.id) : [];
  const partition = [...selectedIds, ...omittedIds].sort();
  if (JSON.stringify(partition) !== JSON.stringify([...tools.DIMENSION_IDS].sort())
      || new Set(partition).size !== tools.DIMENSION_IDS.length)
    errors.push(`${profileRel}: selected/omitted 未形成完整且不重复的维度分区`);
  for (const core of tools.CORE_DIMENSIONS) {
    if (!selectedIds.includes(core)) errors.push(`${profileRel}: core 维度 ${core} 不得裁剪`);
  }
  return errors;
}

function reviewAuditErrors(root, id, cr, options = {}) {
  const errors = [];
  const profileVersion = cr.review_profile_version || '';
  const legacyProfile = options.allowLegacyProfile === true && !profileVersion;
  const foundationProfile = profileVersion === FOUNDATION_PROFILE_VERSION;
  if (foundationProfile && id !== 'foundation')
    errors.push(`${FOUNDATION_PROFILE_VERSION} 只允许 task_id=foundation 使用`);
  let profileTools = null;
  if (!foundationProfile && !legacyProfile) {
    try { profileTools = require('./review-profile'); }
    catch (error) { errors.push(`缺 scripts/review-profile.js 或无法加载：${error.message}`); }
    if (profileTools && profileVersion !== profileTools.PROFILE_SCHEMA)
      errors.push(`review_profile_version 必须为 ${profileTools.PROFILE_SCHEMA}`);
  }
  if (!['pass', 'revised'].includes(cr.freshness)) errors.push('freshness 必须为 pass 或 revised');
  const implStart = parseIso(cr.implementation_started_at);
  const implEnd = parseIso(cr.implementation_completed_at);
  const reviewStart = parseIso(cr.review_started_at);
  const reviewEnd = parseIso(cr.review_completed_at);
  if (![implStart, implEnd, reviewStart, reviewEnd].every(Number.isFinite)) {
    errors.push('四个 started/completed 字段须为带时区 ISO-8601');
  } else {
    if (implStart > implEnd) errors.push('implementation_started_at 晚于 completed_at');
    if (implEnd !== reviewStart) errors.push('implementation_completed_at 必须等于 review_started_at，避免墙钟留白或重叠');
    if (reviewStart > reviewEnd) errors.push('review_started_at 晚于 completed_at');
    if (isUInt(cr.implementation_minutes)
        && Number(cr.implementation_minutes) !== ceilMinutes(implStart, implEnd))
      errors.push('implementation_minutes 与时间戳向上取整结果不符');
    if (isUInt(cr.review_minutes)
        && Number(cr.review_minutes) !== ceilMinutes(reviewStart, reviewEnd))
      errors.push('review_minutes 与时间戳向上取整结果不符');
  }
  for (const k of ['implementation_minutes', 'review_minutes', 'spec_minutes']) {
    if (!isUInt(cr[k])) errors.push(`${k} 须为 int>=0`);
  }

  const relDir = cr.review_report_dir || '';
  const absRoot = path.resolve(root);
  const absDir = path.resolve(root, relDir);
  if (!relDir || path.isAbsolute(relDir) || (absDir !== absRoot && !absDir.startsWith(absRoot + path.sep))) {
    errors.push('review_report_dir 须为项目根内相对路径');
    return errors;
  }
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    errors.push(`review_report_dir 不存在：${relDir}`);
    return errors;
  }

  const preflightPath = path.join(absDir, 'preflight.md');
  let preflightBaseRef = '', preflightBaseTree = '';
  if (!exists(preflightPath)) {
    errors.push('缺 preflight.md');
  } else {
    const pf = parseFrontmatter(preflightPath);
    const p = k => scalarText(pf && pf[k]);
    preflightBaseRef = p('base_ref');
    preflightBaseTree = p('base_tree');
    const pfStart = parseIso(p('started_at')), pfEnd = parseIso(p('completed_at'));
    if (!pf || p('task_id') !== id) errors.push('preflight task_id 不匹配');
    if (!['before-code', 'retroactive'].includes(p('timing'))) errors.push('preflight timing 非法');
    if (!['pass', 'revised'].includes(p('result'))) errors.push('preflight result 未闭合');
    if (!isSha40(p('base_ref')) || !isSha40(p('base_tree'))) errors.push('preflight base_ref/base_tree 非固定 40 位 SHA');
    if (![pfStart, pfEnd].every(Number.isFinite) || pfStart > pfEnd) errors.push('preflight 时间非法');
    if (!isUInt(p('spec_minutes')) || (Number.isFinite(pfStart) && Number.isFinite(pfEnd)
        && Number(p('spec_minutes')) !== ceilMinutes(pfStart, pfEnd))) errors.push('preflight spec_minutes 非法');
    if (isUInt(cr.spec_minutes) && isUInt(p('spec_minutes'))
        && Number(cr.spec_minutes) < Number(p('spec_minutes'))) errors.push('status spec_minutes 小于 preflight 记录');
  }

  const reports = fs.readdirSync(absDir).filter(f => /^round-\d{2}\.md$/.test(f)).sort();
  if (isUInt(cr.code_rounds) && reports.length !== Number(cr.code_rounds))
    errors.push(`round report 数 ${reports.length} != code_rounds ${cr.code_rounds}`);
  let previousEscalated = false, previousReviewedHead = '', lastConclusion = '';
  let activeProfile = '';
  const fullProfiles = new Set();
  let taskPackagePath = '';
  if (!foundationProfile && !legacyProfile) {
    const taskPackages = findTaskPackages(root, id);
    if (taskPackages.length !== 1) errors.push(taskPackages.length
      ? `找到 ${taskPackages.length} 个同 id 任务包，review profile 输入必须唯一`
      : '找不到 A/B 权威任务包，无法重算 review profile');
    else taskPackagePath = taskPackages[0];
  }
  let firstReportStarted = NaN, lastReportCompleted = NaN;
  const findingId = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-F\\d{3}$`);
  reports.forEach((file, index) => {
    const rp = parseFrontmatter(path.join(absDir, file));
    const r = k => scalarText(rp && rp[k]);
    const mode = r('mode');
    const risk = r('risk');
    const profileRel = r('review_profile');
    const started = parseIso(r('started_at')), completed = parseIso(r('completed_at'));
    if (!rp || r('task_id') !== id) errors.push(`${file}: task_id 不匹配`);
    if (Number(r('round')) !== index + 1) errors.push(`${file}: round 与文件序号不符`);
    if (!['full', 'targeted'].includes(mode)) errors.push(`${file}: mode 非法`);
    if (!['standard', 'sensitive'].includes(risk)) errors.push(`${file}: risk 非法`);
    if (index === 0 && mode !== 'full') errors.push(`${file}: 首轮必须 full`);
    if (previousEscalated && mode !== 'full') errors.push(`${file}: 上轮要求 escalate_to_full，本轮却非 full`);
    if (!isSha40(r('base_ref'))) errors.push(`${file}: base_ref 非固定 40 位 SHA`);
    else if (preflightBaseRef && r('base_ref') !== preflightBaseRef) errors.push(`${file}: base_ref 与 preflight 不一致`);
    if (!isSha40(r('reviewed_base')) || !isSha40(r('reviewed_head'))) errors.push(`${file}: reviewed tree 非 40 位 SHA`);
    else if (mode === 'full' && preflightBaseTree && r('reviewed_base') !== preflightBaseTree)
      errors.push(`${file}: full reviewed_base 必须等于 preflight base_tree`);
    else if (mode === 'targeted' && previousReviewedHead && r('reviewed_base') !== previousReviewedHead)
      errors.push(`${file}: targeted reviewed_base 必须等于上一轮 reviewed_head`);
    if (!isSha256(r('diff_sha256'))) errors.push(`${file}: diff_sha256 非 64 位小写 hex`);
    if (!listItems(rp && rp.changed_files).length) errors.push(`${file}: changed_files 为空`);
    if (legacyProfile) {
      // P0 存量报告没有 review_profile；保留原固定 diff/墙钟链审计，不虚构历史 profile。
    } else if (foundationProfile) {
      if (profileRel !== FOUNDATION_PROFILE_VERSION)
        errors.push(`${file}: Foundation review_profile 必须为 ${FOUNDATION_PROFILE_VERSION}`);
    } else if (mode === 'full') {
      const absProfile = resolveProjectFile(root, profileRel);
      const profileKey = absProfile ? path.normalize(absProfile) : profileRel;
      if (fullProfiles.has(profileKey)) errors.push(`${file}: 每次 full 必须生成新的 review_profile`);
      fullProfiles.add(profileKey);
      if (taskPackagePath && ['standard', 'sensitive'].includes(risk))
        errors.push(...fullProfileErrors(root, id, profileRel, taskPackagePath, listItems(rp && rp.changed_files), risk)
          .map(message => `${file}: ${message}`));
      activeProfile = profileKey;
    } else {
      const absProfile = resolveProjectFile(root, profileRel);
      const profileKey = absProfile ? path.normalize(absProfile) : profileRel;
      if (!activeProfile || profileKey !== activeProfile)
        errors.push(`${file}: targeted 必须继承最近一次 full 的 review_profile`);
    }
    if (![started, completed].every(Number.isFinite) || started > completed) errors.push(`${file}: 时间非法`);
    if (!isUInt(r('elapsed_minutes')) || (Number.isFinite(started) && Number.isFinite(completed)
        && Number(r('elapsed_minutes')) !== ceilMinutes(started, completed))) errors.push(`${file}: elapsed_minutes 非法`);
    if (!['pass', 'revise', 'evidence-needed'].includes(r('conclusion'))) errors.push(`${file}: conclusion 非法`);
    if (!['true', 'false'].includes(r('escalate_to_full'))) errors.push(`${file}: escalate_to_full 非布尔`);
    if (mode === 'targeted') {
      if (!r('prior_report') || r('prior_report') === 'null') {
        errors.push(`${file}: targeted 缺 prior_report`);
      } else if (index === 0 || path.resolve(root, r('prior_report')) !== path.resolve(absDir, reports[index - 1])) {
        errors.push(`${file}: prior_report 必须指向紧邻上一轮报告`);
      }
      const ids = listItems(rp && rp.target_finding_ids);
      if (!ids.length) errors.push(`${file}: targeted 缺 target_finding_ids`);
      else if (ids.some(x => !findingId.test(x))) errors.push(`${file}: target_finding_ids 不符合 ${id}-FNNN`);
    }
    if (index === 0) firstReportStarted = started;
    lastReportCompleted = completed;
    previousReviewedHead = r('reviewed_head');
    lastConclusion = r('conclusion');
    previousEscalated = r('escalate_to_full') === 'true';
  });
  if (reports.length && Number.isFinite(reviewStart) && firstReportStarted !== reviewStart)
    errors.push('review_started_at 与首轮 report.started_at 不一致');
  if (reports.length && Number.isFinite(reviewEnd) && lastReportCompleted !== reviewEnd)
    errors.push('review_completed_at 与末轮 report.completed_at 不一致');
  if (reports.length && lastConclusion !== 'pass') errors.push('末轮 report.conclusion 必须为 pass');
  if (reports.length && previousEscalated) errors.push('末轮仍要求 escalate_to_full，审查尚未闭合');
  return errors;
}

/* A/B 共用的单任务 review 审计。显式调用代表当前任务正在走新流程，
 * 因此缺字段是 FAIL；迭代扫描仍对没有任何新字段的存量条目只留人签。 */
function checkReviewAudit(taskId, root) {
  const statusPath = path.join(root, 'status.yml');
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(taskId || '')) {
    fail('review 审计', statusPath, 'task-id 只允许字母、数字和连字符，拒绝路径片段');
    return;
  }
  const crs = parseCodeReviews(statusPath);
  if (crs === null) {
    fail('review 审计', statusPath, '缺 status.yml');
    return;
  }
  const matches = crs.filter(c => c.task_id === taskId);
  if (matches.length !== 1) {
    fail('review 审计', statusPath, matches.length
      ? `${taskId} 有 ${matches.length} 个 code_reviews[] 条目，必须唯一`
      : `${taskId} 无 code_reviews[] 条目`);
    return;
  }
  const cr = matches[0];
  const errors = [];
  if (!isUInt(cr.rounds) || Number(cr.rounds) < 1) errors.push('rounds 须为 int>=1');
  if (!isUInt(cr.code_rounds) || Number(cr.code_rounds) < 1) errors.push('code_rounds 须为 int>=1');
  if (!isUInt(cr.spec_rounds)) errors.push('spec_rounds 须为 int>=0');
  if (isUInt(cr.rounds) && isUInt(cr.code_rounds) && isUInt(cr.spec_rounds)
      && Number(cr.rounds) !== Number(cr.code_rounds) + Number(cr.spec_rounds))
    errors.push('rounds 必须等于 code_rounds + spec_rounds');
  const missing = REVIEW_AUDIT_FIELDS.filter(k => !(k in cr));
  if (missing.length) errors.push(`缺墙钟/report 字段：${missing.join('/')}`);
  else errors.push(...reviewAuditErrors(root, taskId, cr));
  if (errors.length) fail('review 审计', statusPath, `${taskId}: ${errors.join('；')}`);
  else pass('review 审计', `${taskId} 的 freshness、轮次、固定 diff、review profile、逐轮报告与三段墙钟均合法`);
}

/* ====================== 主校验 ====================== */
function checkSprint(iteration, root) {
  const iterDir = path.join(root, 'iterations', iteration);
  const queueDir = path.join(iterDir, 'queue');
  if (!fs.existsSync(queueDir)) {
    fail('queue 目录', queueDir, `queue 目录不存在：${queueDir}`);
    return;
  }
  const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) { fail('任务包存在', queueDir, 'queue 目录无任务包'); return; }

  const packages = [];     // {id, fm, layers, deps, file}
  let unparsed = 0;        // frontmatter 解析失败数 —— queue 侧集合因此不完整，见下方三方一致
  for (const f of files) {
    const fp = path.join(queueDir, f);
    let fm;
    try { fm = parseFrontmatter(fp); }
    catch (e) { fail('frontmatter 解析', fp, `解析失败：${e.message}`); unparsed++; continue; }
    if (!fm) { fail('frontmatter 解析', fp, '未找到 YAML frontmatter（--- 包裹）'); unparsed++; continue; }
    const id = f.replace(/\.md$/, '');
    const layersV = fm['layers'];
    const layers = layersV ? (layersV.items.length ? layersV.items : [scalarText(layersV)])
                              .join(',').replace(/[\[\]]/g, '') : '';
    const deps = listItems(fm['depends_on']);
    packages.push({ id, fm, file: fp, layersStr: layers, deps });
  }

  // 哪些 backend 任务被前端 depends_on 消费（→ api-contract 必填）
  const consumedByFE = new Set();
  for (const p of packages) {
    if (/frontend/.test(p.layersStr)) for (const d of p.deps) consumedByFE.add(d);
  }

  // 收集任务包 AC tag 引用到的 PRD AC id（逐条反向覆盖用）+ 解析 PRD AC id 集
  const referencedAcIds = new Set();
  const prdPath = path.join(iterDir, 'prd.md');
  const prdIds = prdAcIds(prdPath);   // Set | null（存量无 prd.md → 退人工兜底）

  for (const p of packages) {
    const where = p.file;
    // 1. 字段完备
    for (const key of REQUIRED) {
      if (valEmpty(key, p.fm[key])) fail('字段完备', where, `${p.id}：字段「${key}」缺失/为空/占位`);
    }
    // 1b. api-contract 条件必填
    if (/backend/.test(p.layersStr) && consumedByFE.has(p.id)) {
      if (valEmpty('api-contract', p.fm['api-contract']))
        fail('api-contract 必填', where, `${p.id}：backend 且被前端任务 depends_on 消费，api-contract 须填（当前缺/占位/仍注释）`);
    }
    // 2. reference 稳定锚 + ux-flows/trd 链
    const refs = listItems(p.fm['reference']);
    if (refs.length) {
      const noAnchor = refs.filter(r => !hasStableAnchor(r));
      if (noAnchor.length) fail('reference 稳定锚', where, `${p.id}：${noAnchor.length} 条 reference 无符号/章节/行号锚（首条：${noAnchor[0].slice(0, 40)}…）`);
      // draft-ux 是**可选**环节（PRD 标 `draft-ux: 需要` 才触发）——ux-flows.md 不存在时，
      // 前端 AC 的形态权威落在 TRD「交互技术方案」段，此处不得强求引用一份不存在的文件。
      // 存在时照旧强制（收窄非关闭）。承 v4「source 三口放行」同一处置：检查器不得把可选环节当必选前提。
      if (/frontend/.test(p.layersStr) && fs.existsSync(path.join(iterDir, 'ux-flows.md'))
          && !refs.some(r => /ux-flows/i.test(r)))
        fail('reference ux-flows', where, `${p.id}：前端任务 reference 未含 ux-flows 稳定锚`);
      if (/backend/.test(p.layersStr) && !refs.some(r => /trd/i.test(r)))
        fail('reference trd', where, `${p.id}：后端任务 reference 未含 trd 稳定锚`);
    }
    // 3. AC 正向 tag + 逐条 id 存在性
    const acs = listItems(p.fm['acceptance-criteria']);
    const acFormat = scalarText(p.fm['ac-format']);
    for (const ac of acs) {
      const hasSrc = reAcTag.test(ac), hasTech = reTechTag.test(ac);
      if (!hasSrc && !hasTech)
        fail('AC 回链 tag', where, `${p.id}：AC 缺 (源：PRD…) 或 (技术) 标注 —— ${ac.slice(0, 40)}…`);
      if (hasSrc) {
        const ids = acRefIds(ac);
        if (!ids.length) fail('AC 回链 id', where, `${p.id}：(源：PRD…) 内无 AC-nn id —— ${ac.slice(0, 40)}…`);
        for (const id of ids) {
          referencedAcIds.add(id);
          if (prdIds && !prdIds.has(id)) fail('AC 正向:悬空', where, `${p.id}：AC 回链 ${id} 在 PRD 不存在（打错号/已退休）`);
        }
      }
      if (acFormat === 'intent-oracle-v1') {
        if (!reIntent.test(ac) || !reOracle.test(ac))
          fail('AC intent/oracle', where, `${p.id}：新格式 AC 必须同时含 intent 与 oracle —— ${ac.slice(0, 50)}…`);
        if (reGoldenTrue.test(ac) && !reExample.test(ac))
          fail('AC golden', where, `${p.id}：golden: true 但缺 example —— ${ac.slice(0, 50)}…`);
      }
    }
  }
  if (findings.filter(f => f.level === 'fail').length === 0) pass('任务包字段/AC/reference', `${packages.length} 个任务包字段完备、reference 含稳定锚、AC 回链与新格式合法`);

  // 4. AC 逐条反向覆盖：PRD 每个 AC-nn 被 ≥1 任务包 tag 引用（替代旧功能级——逐条严格强于功能级）
  if (prdIds === null) {
    human('AC 逐条覆盖', `未找到 ${prdPath}（存量项目），逐条 AC 反向覆盖无法机械核 —— 由签字人确认 PRD 每条 AC 均有任务覆盖`);
  } else if (prdIds.size === 0) {
    human('AC 逐条覆盖', `PRD 未发现 AC-nn 形式的 id（存量旧格式 AC1？）—— 逐条覆盖退人工兜底`);
  } else {
    const uncovered = [...prdIds].filter(id => !referencedAcIds.has(id));
    if (uncovered.length) fail('AC 逐条覆盖', prdPath, `PRD AC 未被任何任务包引用：${uncovered.join('、')}`);
    else pass('AC 逐条覆盖', `PRD ${prdIds.size} 条 AC 均被任务包 AC 引用（逐条）`);
  }

  // 5. 三方一致：queue ↔ sprint.md ↔ status.yml
  //
  // ⚠️ 级联抑制：queue 侧集合来自解析成功的包。若有包 frontmatter 解析失败（存量旧格式仓——
  // 字段写成 Markdown 列表而非 YAML），它们不在 queueIds 里，比对就会把 sprint.md / status.yml
  // 里**全部**任务报成"queue 无"——一个根因放大成 N 条下游误报（实测：4 个存量仓里 ~50 条三方
  // 一致 FAIL 中只有 ~8 条是真漂移，其余全是这条级联）。故解析不全时本项整体退 🧑，不出 FAIL：
  // 集合本就不可信，基于它下的判断没有证据力。
  const queueIds = packages.map(p => p.id);
  const stTasks = parseStatusTasks(path.join(root, 'status.yml'));   // 第 9 项也用，故不进抑制块
  if (unparsed > 0) {
    human('三方一致', `queue 有 ${unparsed} 个包 frontmatter 解析失败（见上方 FAIL），queue 侧集合不完整 —— 三方一致本轮不比对（避免把一个格式问题放大成 N 条假漂移）；修好解析后重跑即恢复`);
  } else {
  const spIds = sprintIds(path.join(iterDir, 'sprint.md'));
  if (spIds === null) {
    fail('三方一致:sprint', path.join(iterDir, 'sprint.md'), 'sprint.md 不存在');
  } else {
    const sset = new Set(spIds), qset = new Set(queueIds);
    const qNotSp = queueIds.filter(id => !sset.has(id));
    const spNotQ = spIds.filter(id => !qset.has(id));
    if (qNotSp.length) fail('三方一致:sprint', path.join(iterDir, 'sprint.md'), `queue 有但 sprint.md 无：${qNotSp.join(', ')}`);
    if (spNotQ.length) fail('三方一致:sprint', path.join(iterDir, 'sprint.md'), `sprint.md 有但 queue 无：${spNotQ.join(', ')}`);
    if (!qNotSp.length && !spNotQ.length) pass('三方一致:sprint', `queue ↔ sprint.md 一致（${queueIds.length} 个任务）`);
  }
  if (stTasks === null) {
    human('三方一致:status', '项目根无 status.yml（存量项目），queue↔status 一致性退回人工兜底');
  } else {
    // 迭代内 queue 的三个进料口：plan-sprint 产 sprint；generate-integration-tests Step 4 产
    // integration；manual-test 产 manual-test —— 后两者同样写进 iterations/vN/queue/ 并同步
    // tasks[]，故一致性比对须一并放行（B 类 bug/optimization 走 b-queue、iteration=null，不在此列）。
    const stIds = new Set(stTasks.filter(t => ITER_SOURCES.has(t.source) && t.iteration === iteration).map(t => t.id));
    const qNotSt = queueIds.filter(id => !stIds.has(id));
    const stNotQ = [...stIds].filter(id => !new Set(queueIds).has(id));
    if (qNotSt.length) fail('三方一致:status', 'status.yml', `queue 有但 status.yml tasks[] 无（source∈{sprint,integration,manual-test},${iteration}）：${qNotSt.join(', ')}`);
    if (stNotQ.length) fail('三方一致:status', 'status.yml', `status.yml 有但 queue 无：${stNotQ.join(', ')}`);
    if (!qNotSt.length && !stNotQ.length) pass('三方一致:status', `queue ↔ status.yml tasks[] 一致`);
  }
  }   // ← 级联抑制块结束

  // 6. 视觉地基包：v1 含前端必有标 `baseline: visual` 的地基包（plan-sprint Step 2）；
  //    vN+1 的「design.md 变更触发」机器判不了 → 退人工。
  const fePkgs = packages.filter(p => /frontend/.test(p.layersStr));
  if (fePkgs.length) {
    const basePkg = packages.find(p => /visual/.test(scalarText(p.fm['baseline'])));
    if (!basePkg) {
      if (iteration === 'v1')
        fail('视觉地基包', queueDir, `v1 含 ${fePkgs.length} 个 frontend 任务但无标 baseline: visual 的视觉地基包（全局 reset + UI 库主题覆盖 + token 全局接线）—— plan-sprint Step 2 硬性必有`);
      else
        human('视觉地基包', `本期含 frontend 任务但无地基包 —— 若 design.md 较上期 G3 后有变更需追加「地基跟进包」（design.md 变更触发机器判不了，由签字人确认）`);
    } else {
      const notDep = fePkgs.filter(p => p.id !== basePkg.id && !p.deps.includes(basePkg.id));
      if (notDep.length)
        human('视觉地基依赖', `地基包 ${basePkg.id} 在场，但这些 frontend 任务未 depends_on 它：${notDep.map(p => p.id).join('、')} —— 确认是否应串在地基之后`);
      else
        pass('视觉地基包', `视觉地基包 ${basePkg.id} 在场，frontend 任务均依赖它`);
    }
  }

  // 7. risk 敏感启发核对（决策#29 第③层）：命中启发词而未标 sensitive → 🧑（只升不降，允许误报）
  for (const p of packages) {
    const declared = scalarText(p.fm['risk']).toLowerCase();
    if (declared.includes('sensitive')) continue;
    const hits = sensitiveHits(p.fm);
    if (hits.length)
      human('risk 启发核对', `${p.id}：命中敏感启发词「${[...new Set(hits)].join('、')}」但 risk=${declared || 'standard(缺省)'} —— 确认是否应标 sensitive（决定 develop 独审模型档位；末端预检另按 diff 独立判定兜底）。判定为误报时把理由写进 \`risk-note\` 字段，该字段不参与启发扫描`);
  }

  // 8. 归属真空：声明"这件事不在本包"时，须确有另一个包认领
  const puntGraph = new Map();          // 本包 → 它点名移交的包 id 集
  let puntHitCount = 0;
  for (const p of packages) {
    const lines = puntLines(p.file, p.id, queueIds);
    if (!lines.length) continue;
    puntHitCount += lines.length;
    const named = new Set();
    for (const l of lines) {
      for (const g of l.ghosts)
        fail('归属真空', p.file, `${p.id}：${l.field} 把「${l.text}…」移交给 ${g}，但本期 queue 无该任务包`);
      for (const n of l.named) named.add(n);
      if (!l.named.length && !l.ghosts.length)
        human('归属真空', `${p.id}（${l.field}）：「${l.text}…」未点名承接的任务包 —— 指认哪个包的 files/AC 认领了它，无则本期无人做`);
    }
    puntGraph.set(p.id, named);
  }
  for (const [a, outs] of puntGraph) {
    for (const b of outs) {
      if (a < b && puntGraph.get(b) && puntGraph.get(b).has(a))
        fail('归属真空:互推', queueDir, `${a} 与 ${b} 互相声明该件事不在本包 —— 两边都不做，落在交集里`);
    }
  }
  if (puntHitCount === 0) pass('归属真空', '任务包 do-not/context 无"移交他包"措辞');

  // 9. 审计留痕完备性：已 [merged] 的任务须有 code_reviews[] 条目（develop 末端义务，长期要求）
  //    并须记 rounds（2026-07-30 加的独审轮数仪器）。本项在「标记 [merged]」那次 commit 上触发——
  //    develop 末端 `git add {任务包} sprint.md status.yml` 已命中 hook 的 sprint/queue 路由，无需改路由。
  //    实证驱动：file-extract v2 十一个任务全部在仪器落地后合并，rounds 记录数 0、两个任务连条目都没有，
  //    而无任何机械检查发现——仪器装了不响，与它要解的问题同一失效类。
  if (stTasks === null) {
    human('审计留痕', '无 status.yml（存量项目），code_reviews[] 完备性退回人工兜底');
  } else {
    const crs = parseCodeReviews(path.join(root, 'status.yml')) || [];
    // 按 task_id 建索引，`iteration` 只在条目自带时才用来排除——存量仓（mail-ai）的 code_reviews[]
    // 条目普遍不写 iteration，按 iteration 硬过滤会把它们全判成"无条目"（实测假阳性 8 条）。
    const crByTask = new Map(crs.filter(c => c.task_id && (!c.iteration || c.iteration === iteration))
                                .map(c => [c.task_id, c]));
    const mergedIds = stTasks
      .filter(t => ITER_SOURCES.has(t.source) && t.iteration === iteration && t.status === 'merged')
      .map(t => t.id);
    const noEntry = [], noRounds = [], badRounds = [], noSplit = [], badSplit = [];
    const noAudit = [], partialAudit = [], legacyProfile = [], badAudit = [];
    const legacyAuditFields = REVIEW_AUDIT_FIELDS.filter(k => k !== 'review_profile_version');
    for (const id of mergedIds) {
      const cr = crByTask.get(id);
      if (!cr) { noEntry.push(id); continue; }
      if (!('rounds' in cr)) { noRounds.push(id); continue; }
      if (!/^\d+$/.test(cr.rounds) || Number(cr.rounds) < 1) badRounds.push(`${id}(rounds=${cr.rounds})`);
      if (!('code_rounds' in cr) || !('spec_rounds' in cr)) {
        noSplit.push(id);
      } else if (!/^\d+$/.test(cr.code_rounds) || Number(cr.code_rounds) < 1
                 || !/^\d+$/.test(cr.spec_rounds) || Number(cr.spec_rounds) < 0
                 || Number(cr.rounds) !== Number(cr.code_rounds) + Number(cr.spec_rounds)) {
        badSplit.push(`${id}(rounds=${cr.rounds},code=${cr.code_rounds},spec=${cr.spec_rounds})`);
      }
      const presentLegacyAudit = legacyAuditFields.filter(k => k in cr);
      if (!presentLegacyAudit.length) {
        noAudit.push(id);
      } else if (presentLegacyAudit.length !== legacyAuditFields.length) {
        partialAudit.push(`${id}(缺 ${legacyAuditFields.filter(k => !(k in cr)).join('/')})`);
      } else if (!('review_profile_version' in cr)) {
        legacyProfile.push(id);
        const errs = reviewAuditErrors(root, id, cr, { allowLegacyProfile: true });
        if (errs.length) badAudit.push(`${id}: ${errs.join('；')}`);
      } else {
        const errs = reviewAuditErrors(root, id, cr);
        if (errs.length) badAudit.push(`${id}: ${errs.join('；')}`);
      }
    }
    if (noEntry.length)
      fail('审计留痕', 'status.yml', `已 [merged] 但 code_reviews[] 无条目：${noEntry.join(', ')} —— develop 末端漏写审计留痕`);
    if (badRounds.length)
      fail('审计留痕', 'status.yml', `rounds 非 int≥1（见 skeleton/07 值域）：${badRounds.join(', ')}`);
    if (noRounds.length)
      human('审计留痕', `有 code_reviews 条目但缺 rounds：${noRounds.join(', ')} —— rounds 是 2026-07-30 新增字段，存量条目普遍无；本期新合并的应补（轮数事后不可复原，只能当场记）`);
    if (badSplit.length)
      fail('审计留痕', 'status.yml', `rounds 拆分非法或总数不相等：${badSplit.join(', ')}`);
    if (noSplit.length)
      human('审计留痕', `有 code_reviews 条目但缺 code_rounds/spec_rounds：${noSplit.join(', ')} —— 存量可保留；新合并任务须区分代码轮与规格轮`);
    if (partialAudit.length)
      fail('审计留痕', 'status.yml', `墙钟/report/profile 字段只写了一部分：${partialAudit.join('；')}`);
    if (badAudit.length)
      fail('审计留痕', 'status.yml', `墙钟/report/profile 审计非法：${badAudit.join('；')}`);
    if (noAudit.length)
      human('审计留痕', `有 code_reviews 条目但缺墙钟/report 字段：${noAudit.join(', ')} —— 存量可保留；新合并任务须自动记录 implementation/review/spec 分钟与逐轮报告`);
    if (legacyProfile.length)
      human('审计留痕', `P0 报告链合法但缺 review profile：${legacyProfile.join(', ')} —— 存量可保留；新 full review 必须自动生成 profile`);
    if (!mergedIds.length)
      pass('审计留痕', '本迭代尚无 [merged] 任务，无需审计留痕');
    else if (!noEntry.length && !badRounds.length && !noRounds.length && !badSplit.length && !noSplit.length
             && !partialAudit.length && !legacyProfile.length && !badAudit.length && !noAudit.length)
      pass('审计留痕', `${mergedIds.length} 个 [merged] 任务均有合法 rounds、墙钟、review profiles 与逐轮 reports`);
  }

  // 语义残量（留人签）
  human('G3:人签','疑点清单已逐条确认 / TRD 每模块都有任务包 / Step3.5 独审无遗留阻断 / 任务包 AC 逐条忠实于其回链的 PRD AC（内容真覆盖，非仅 id 在场）—— 语义判断，由签字人确认');
}

/* ---------------- 主流程 ---------------- */
function main() {
  const args = process.argv.slice(2);
  const reviewMode = args[0] === '--review';
  const subject = reviewMode ? args[1] : args[0];
  const root = (reviewMode ? args[2] : args[1]) || process.cwd();
  if (!subject || (!reviewMode && !/^v\d+$/.test(subject))) {
    console.error('用法: node check-sprint.js <vN> [项目根]\n'
      + '   或: node check-sprint.js --review <task-id> [项目根]');
    process.exit(2);
  }
  try {
    if (reviewMode) checkReviewAudit(subject, root);
    else checkSprint(subject, root);
  }
  catch (e) { console.error('check-sprint 自身出错（非产物问题）:', e.message); process.exit(2); }

  const fails = findings.filter(f => f.level === 'fail');
  const passes = findings.filter(f => f.level === 'pass');
  const humans = findings.filter(f => f.level === 'human');
  console.log(`\n=== check-sprint (${reviewMode ? `review:${subject}` : subject}) 报告 ===`);
  console.log(`通过 ${passes.length} 项 / 失败 ${fails.length} 项\n`);
  if (fails.length) {
    console.log('❌ FAIL:');
    for (const f of fails) console.log(`  [${f.rule}] ${f.loc}\n      ${f.msg}`);
    console.log('');
  } else {
    console.log('✅ 确定性判据全部通过（语义判据仍需人核）\n');
  }
  if (humans.length) {
    console.log('🧑 留签字人确认（脚本不判，非 FAIL）:');
    for (const h of humans) console.log(`  [${h.rule}] ${h.msg}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main();
