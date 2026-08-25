#!/usr/bin/env node
/*
 * review-profile.js · develop full review 的确定性维度选择器
 *
 * 输入只来自权威任务包、有效 risk 与固定 reviewed diff 的 changed files。
 * 输出 JSON profile；full review 只执行 selected_dimensions，targeted 继承最近一次 full profile。
 * 缺少关键元数据时 fail-safe：扩大选择，不静默裁剪。
 *
 * 用法（在项目仓根目录执行）：
 *   node scripts/review-profile.js <task-package.md> \
 *     --risk standard|sensitive \
 *     --output <project-relative-profile.json> \
 *     --changed-files <file...>
 *
 * 不传 --output 时把 JSON 写到 stdout。输出文件已存在时拒绝覆盖，保持审计记录不可变。
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROFILE_SCHEMA = 'develop-review-profile/v1';
const CORE_DIMENSIONS = Object.freeze([
  'contract',
  'scope-and-secrets',
  'test-evidence',
  'comment-hygiene',
]);
const DIMENSION_IDS = Object.freeze([
  ...CORE_DIMENSIONS,
  'standards',
  'enforcement',
  'design-fidelity',
  'input-provenance',
  'query-performance',
  'concurrency',
  'logging-privacy',
  'maintainability',
  'sensitive-boundaries',
]);

function stripComment(value) {
  return (value || '').replace(/\s+#.*$/, '').trim();
}

function parseFrontmatterText(text) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex(line => /^---\s*$/.test(line));
  if (start < 0) return { fields: {}, body: '' };
  let end = lines.findIndex((line, index) => index > start && /^---\s*$/.test(line));
  if (end < 0) end = lines.length;
  const bodyLines = lines.slice(start + 1, end);
  const fields = {};
  let currentKey = null;

  for (const raw of bodyLines) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const top = raw.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (top && !/^\s/.test(raw)) {
      currentKey = top[1];
      const value = stripComment(top[2]);
      fields[currentKey] = { scalar: value, items: [] };
      if (/^\[.*\]$/.test(value)) {
        const inner = value.slice(1, -1).trim();
        fields[currentKey].items = inner
          ? inner.split(',').map(item => item.trim()).filter(Boolean)
          : [];
      }
      continue;
    }
    if (!currentKey) continue;
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item) {
      fields[currentKey].items.push(stripComment(item[1]));
    } else {
      const continuation = stripComment(raw);
      if (continuation) fields[currentKey].scalar += ` ${continuation}`;
    }
  }

  const trustedBody = bodyLines
    .filter(line => !/^\s*#/.test(line))
    .map(stripComment)
    .filter(Boolean)
    .join('\n');
  return { fields, body: trustedBody };
}

function scalar(fields, key) {
  const value = fields[key] && fields[key].scalar;
  return (value || '').replace(/^['"]|['"]$/g, '').trim();
}

function items(fields, key) {
  return (fields[key] && fields[key].items || [])
    .map(value => value.replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

function parseTaskPackageText(text) {
  const parsed = parseFrontmatterText(text);
  const fields = parsed.fields;
  return {
    taskId: scalar(fields, 'task-id'),
    taskType: scalar(fields, 'task_type'),
    layers: items(fields, 'layers'),
    source: scalar(fields, 'source'),
    declaredRisk: scalar(fields, 'risk') || 'standard',
    relevantStandards: items(fields, 'relevant-standards'),
    hasApiContract: Object.prototype.hasOwnProperty.call(fields, 'api-contract'),
    text: parsed.body,
  };
}

function normalizeFiles(changedFiles) {
  return [...new Set((changedFiles || [])
    .map(file => String(file).trim().replace(/\\/g, '/'))
    .filter(Boolean))].sort();
}

function hasAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function isCodeFile(file) {
  return /\.(?:[cm]?[jt]sx?|vue|svelte|py|rb|go|rs|java|kt|cs|php|css|scss|sass|less|html)$/i.test(file);
}

function isTestOrToolingFile(file) {
  const normalized = `/${file.toLowerCase()}`;
  return /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(normalized)
    || /\/(?:__tests__|tests?|fixtures?|mocks?|scripts?|tools?|lint-rules?|eslint)(?:\/|$)/.test(normalized)
    || /\/(?:package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json)$/.test(normalized)
    || /\.(?:md|txt|snap|json|ya?ml|toml)$/.test(normalized);
}

function normativeTaskText(text) {
  return String(text || '').split(/\r?\n/)
    .filter(line => !/^status\s*:/.test(line))
    .join('\n');
}

function buildReviewProfile(task, changedFiles, effectiveRisk) {
  const files = normalizeFiles(changedFiles);
  const text = `${task.text || ''}\n${files.join('\n')}`.toLowerCase();
  const layers = (task.layers || []).map(layer => layer.toLowerCase());
  const taskType = (task.taskType || '').toLowerCase();
  const requestedRisk = effectiveRisk || task.declaredRisk || 'standard';
  const declaredRiskValid = ['standard', 'sensitive'].includes(task.declaredRisk);
  const risk = !declaredRiskValid || task.declaredRisk === 'sensitive' || requestedRisk === 'sensitive'
    ? 'sensitive' : 'standard';
  const metadataIncomplete = !task.taskId || !taskType || !layers.length || !task.source || !declaredRiskValid;
  const unknownLayer = !layers.some(layer => ['frontend', 'backend'].includes(layer))
    && !/dev-(?:frontend|backend)/.test(taskType);
  const frontend = layers.includes('frontend') || taskType === 'dev-frontend';
  const backend = layers.includes('backend') || taskType === 'dev-backend';
  const productionFiles = files.filter(file => isCodeFile(file) && !isTestOrToolingFile(file));
  const testToolingOnly = files.length > 0 && productionFiles.length === 0;
  const unknownSurface = files.length === 0;

  const uiSignal = (frontend || unknownLayer) && (
    productionFiles.some(file => /\.(?:vue|svelte|tsx|jsx|css|scss|sass|less|html)$/i.test(file))
    || hasAny(text, [/(?:^|\W)(?:design\.md|prototype\.html)(?:$|\W)/, /视觉|页面|组件|样式|交互|frontend|\bui\b/])
  );
  const inputSignal = (backend || unknownLayer) && (
    task.hasApiContract
    || hasAny(text, [/(?:^|[\/._-])(?:dto|request|input|schema|validator)s?(?:[\/._-]|$)/, /controller|router|route|resolver|endpoint|请求体|入参|用户输入/])
  );
  const querySignal = (backend || unknownLayer) && hasAny(text, [
    /(?:^|[\/._-])(?:repository|repositories|repo|repos|dao|models?|entities?|database|db|prisma)(?:[\/._-]|$)/,
    /query|select\b|typeorm|sequelize|mongoose|数据库|查询|分页|列表|\bn\+1\b/,
  ]);
  const concurrencySignal = (backend || unknownLayer) && hasAny(text, [
    /transaction|upsert|unique|concurr|mutex|lock|migration|schema|事务|并发|竞态|唯一|批量(?:写|删|更新)/,
  ]);
  const loggingSignal = productionFiles.length > 0 || hasAny(text, [
    /logger|logging|console\.|日志|隐私|pii|secret|token|password/,
  ]);
  const enforcementSignal = testToolingOnly || hasAny(text, [
    /enforcement|guard|policy|probe|checker|linter|eslint|ast|rule|validator|fail-closed|反例|闸|规则|校验器|验证器|测试基础设施/,
  ]);

  const signals = {
    metadata_incomplete: metadataIncomplete,
    unknown_layer: unknownLayer,
    surface: unknownSurface ? 'unknown' : (testToolingOnly ? 'test-tooling-only' : 'production'),
    frontend,
    backend,
    ui: uiSignal,
    input: inputSignal,
    query: querySignal,
    concurrency: concurrencySignal,
    logging: loggingSignal,
    enforcement: enforcementSignal,
    sensitive: risk === 'sensitive',
  };

  const selected = [];
  const omitted = [];
  const choose = (id, applies, selectedReason, omittedReason) => {
    (applies ? selected : omitted).push({ id, reason: applies ? selectedReason : omittedReason });
  };

  for (const id of CORE_DIMENSIONS) {
    selected.push({ id, reason: 'core: every code review keeps contract, scope, evidence, and changed-comment checks' });
  }
  choose('standards', metadataIncomplete || task.relevantStandards.length > 0,
    metadataIncomplete ? 'fail-safe: task metadata is incomplete' : 'task package has relevant-standards',
    'task package relevant-standards is empty');
  choose('enforcement', metadataIncomplete || enforcementSignal,
    metadataIncomplete ? 'fail-safe: task metadata is incomplete' : 'task/change surface contains enforcement or test/tooling signals',
    'no enforcement or test/tooling signal');
  choose('design-fidelity', metadataIncomplete || unknownLayer || uiSignal,
    metadataIncomplete || unknownLayer ? 'fail-safe: frontend applicability is unresolved' : 'frontend UI/design surface is present',
    frontend ? 'frontend task has no UI/design surface' : 'task is not frontend');
  choose('input-provenance', metadataIncomplete || unknownLayer || inputSignal,
    metadataIncomplete || unknownLayer ? 'fail-safe: backend input applicability is unresolved' : 'backend request/API input surface is present',
    backend ? 'backend task has no request/DTO/input surface' : 'task is not backend');
  choose('query-performance', metadataIncomplete || unknownLayer || querySignal,
    metadataIncomplete || unknownLayer ? 'fail-safe: backend query applicability is unresolved' : 'backend query/data-read surface is present',
    backend ? 'backend task has no query/data-read signal' : 'task is not backend');
  choose('concurrency', metadataIncomplete || unknownLayer || concurrencySignal,
    metadataIncomplete || unknownLayer ? 'fail-safe: backend concurrency applicability is unresolved' : 'backend write/transaction/concurrency surface is present',
    backend ? 'backend task has no write/transaction/concurrency signal' : 'task is not backend');
  choose('logging-privacy', metadataIncomplete || loggingSignal,
    metadataIncomplete ? 'fail-safe: task metadata is incomplete' : 'production or logging/privacy surface is present',
    'fixed diff is test/tooling-only and has no logging/privacy signal');
  choose('maintainability', metadataIncomplete || unknownSurface || productionFiles.length > 0,
    metadataIncomplete || unknownSurface ? 'fail-safe: changed surface is unresolved' : 'fixed diff contains production code',
    'fixed diff contains no production code');
  choose('sensitive-boundaries', metadataIncomplete || risk === 'sensitive',
    metadataIncomplete ? 'fail-safe: task metadata is incomplete' : 'effective risk is sensitive; profile may only add high-risk scrutiny',
    'effective risk is standard');

  const fingerprintInput = {
    schema: PROFILE_SCHEMA,
    task_normative_frontmatter_sha256: crypto.createHash('sha256').update(normativeTaskText(task.text)).digest('hex'),
    task_id: task.taskId,
    task_type: task.taskType,
    layers,
    source: task.source,
    effective_risk: risk,
    relevant_standards: [...task.relevantStandards].sort(),
    has_api_contract: task.hasApiContract,
    changed_files: files,
  };

  return {
    schema: PROFILE_SCHEMA,
    task_id: task.taskId,
    task_type: task.taskType,
    layers,
    source: task.source,
    effective_risk: risk,
    changed_files: files,
    input_fingerprint: crypto.createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex'),
    signals,
    selected_dimensions: selected,
    omitted_dimensions: omitted,
  };
}

function buildReviewProfileFromText(taskPackageText, changedFiles, effectiveRisk) {
  return buildReviewProfile(parseTaskPackageText(taskPackageText), changedFiles, effectiveRisk);
}

function parseArgs(argv) {
  const args = [...argv];
  const taskPath = args.shift();
  const out = { taskPath, changedFiles: [], risk: '', output: '' };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--risk') out.risk = args.shift() || '';
    else if (flag === '--output') out.output = args.shift() || '';
    else if (flag === '--changed-files') {
      while (args.length && !args[0].startsWith('--')) out.changedFiles.push(args.shift());
    } else throw new Error(`未知参数：${flag}`);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskPath || !args.changedFiles.length || (args.risk && !['standard', 'sensitive'].includes(args.risk))) {
    console.error('用法: node review-profile.js <task-package.md> --risk standard|sensitive '
      + '--output <profile.json> --changed-files <file...>');
    process.exit(2);
  }
  const taskText = fs.readFileSync(args.taskPath, 'utf8');
  const task = parseTaskPackageText(taskText);
  if (!task.taskId) throw new Error('任务包缺 task-id，不能生成 review profile');
  const profile = buildReviewProfile(task, args.changedFiles, args.risk || task.declaredRisk);
  const json = `${JSON.stringify(profile, null, 2)}\n`;
  if (!args.output) {
    process.stdout.write(json);
    return;
  }
  const output = path.resolve(args.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, json, { encoding: 'utf8', flag: 'wx' });
  console.log(`review profile: ${path.relative(process.cwd(), output)} (${profile.selected_dimensions.length}/${DIMENSION_IDS.length} dimensions)`);
}

module.exports = {
  PROFILE_SCHEMA,
  CORE_DIMENSIONS,
  DIMENSION_IDS,
  parseTaskPackageText,
  buildReviewProfile,
  buildReviewProfileFromText,
  normalizeFiles,
  normativeTaskText,
};

if (require.main === module) {
  try { main(); }
  catch (error) { console.error('review-profile 失败:', error.message); process.exit(2); }
}
