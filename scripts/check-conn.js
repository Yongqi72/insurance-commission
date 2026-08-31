#!/usr/bin/env node
/*
 * check-conn.js · hact-method 连接与凭据的统一寻址 + 体检
 *
 * 解决的问题：Gitee PAT / SSH 服务器 / 数据库 / 第三方 key 此前散在四处（环境变量、
 * 项目 backend/.env、deployment.config、Claude Code 的 MCP alias 配置），没有单一真相源，
 * 换人换机不可复现，各 spec 各写各的回退路径。
 *
 * 分层（唯一约定）：
 *   {项目仓根}/connections.yml   入库、**零机密**。只写坐标 + ${secret:NAME} 引用。
 *   ~/.hact/secrets.env          机器本地、**永不入库**。只写 NAME=值，全部项目共用，chmod 600。
 *   deployment.config            保留原职：构建 / 重启 / 健康检查命令（那是项目命令，不是连接信息）。
 *
 * 用法（在项目仓根目录执行）：
 *   node scripts/check-conn.js [check] [--live] [项目根]   # 体检（默认动作）
 *   node scripts/check-conn.js get <点分路径> [项目根]      # 取单值（机密已解析），供脚本内插
 *   node scripts/check-conn.js env [项目根]                 # 输出 export 语句，供 eval
 *   node scripts/check-conn.js init [项目根]                # 播种 connections.yml / secrets.env 骨架
 *
 * 退出码：有任一 FAIL → 1；全 pass → 0；用法错误 / 自身出错 → 2。
 *   （get 取不到值 → 1，说明写 stderr；stdout 保持干净，可直接 $(...) 取用。）
 *
 * 纯 Node 无外部依赖。connections.yml 用针对本 schema 的容错缩进扫描（只认标量 + 两三层嵌套），
 * 非完整 YAML AST——与 check-sprint.js 对 frontmatter 的处理同源。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const findings = [];
const fail  = (rule, loc, msg) => findings.push({ level: 'fail',  rule, loc, msg });
const pass  = (rule, msg)      => findings.push({ level: 'pass',  rule, msg });
const human = (rule, msg)      => findings.push({ level: 'human', rule, msg });

const SECRETS_DIR  = path.join(os.homedir(), '.hact');
const SECRETS_FILE = path.join(SECRETS_DIR, 'secrets.env');
const SECRET_REF   = /\$\{secret:([A-Za-z_][A-Za-z0-9_]*)\}/g;
const SECRET_ONLY  = /^\$\{secret:[A-Za-z_][A-Za-z0-9_]*\}$/;

// 存量兼容：新 handle 取不到时回退这些历史环境变量名，让已配好的机器零改动继续能跑。
const LEGACY_ALIAS = { HACT_GITEE_TOKEN: ['GITEE_ACCESS_TOKEN', 'GITEE_TOKEN'] };

function exists(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) return t.slice(1, -1);
  return t;
}

/* ---------------- connections.yml 解析 ---------------- */
// 返回 { flat: Map<点分路径,{value,line}>, bad: [{line,raw}] }
function parseConn(text) {
  const flat = new Map(), bad = [], dup = [], stack = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1;
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    const m = raw.match(/^(\s*)([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/);
    if (!m) { bad.push({ line, raw: raw.trim() }); return; }
    const indent = m[1].length, key = m[2];
    // 剥行尾注释。必须同时认「行首 #」——`\s*:\s*` 已吃掉冒号后的空白，
    // 于是「只有注释没有值」的块起始键（`prod:   # 说明`）到这里就是纯 `#...`；
    // 若只认「空白 + #」会剥不掉，把块起始误判成叶子，导致整块层级静默塌陷。
    const val = unquote(m[3].replace(/(^|\s)#.*$/, ''));
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const p = [...stack.map(s => s.key), key].join('.');
    if (val === '') stack.push({ indent, key });
    else {
      // 同一路径写两次 = 后者静默覆盖前者；最常见成因是层级塌陷，见下方 dup 报告。
      if (flat.has(p)) dup.push({ path: p, first: flat.get(p).line, second: line });
      flat.set(p, { value: val, line });
    }
  });
  return { flat, bad, dup };
}

/* ---------------- ~/.hact/secrets.env 加载 ---------------- */
function loadSecrets() {
  const map = new Map();
  let stat = null;
  if (exists(SECRETS_FILE)) {
    stat = fs.statSync(SECRETS_FILE);
    for (const raw of fs.readFileSync(SECRETS_FILE, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      // 不剥行尾 #：凭据可能含 #。本文件不支持行内注释，整行 # 才是注释。
      const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) map.set(m[1], unquote(m[2]));
    }
  }
  return { map, stat, present: stat !== null };
}

// 解析顺序：进程环境变量 → ~/.hact/secrets.env → 历史别名。取到第一个非空即止。
// 每个被解析出的凭据值都登记在此，redact() 据它兜底擦除——任何要打印的字符串先过一遍。
// 这是第二道防线；第一道是「凭据根本不进 argv」（见 checkLive 的 curl -K - 用法）。
const SEEN = new Set();
function remember(v) { if (v && v.length >= 8) SEEN.add(v); return v; }
function redact(str) {
  let out = String(str);
  for (const v of SEEN) out = out.split(v).join('***');
  return out;
}

function resolveSecret(name, secrets) {
  for (const n of [name, ...(LEGACY_ALIAS[name] || [])]) {
    if (process.env[n] && process.env[n].trim()) return { value: remember(process.env[n].trim()), from: `环境变量 ${n}` };
    if (secrets.map.get(n)) return { value: remember(secrets.map.get(n)), from: `~/.hact/secrets.env:${n}` };
  }
  return null;
}

function refsIn(value) {
  const names = [];
  let m; SECRET_REF.lastIndex = 0;
  while ((m = SECRET_REF.exec(value))) names.push(m[1]);
  return names;
}

function expand(value, secrets) {
  const missing = [];
  SECRET_REF.lastIndex = 0;
  const out = value.replace(SECRET_REF, (_, name) => {
    const hit = resolveSecret(name, secrets);
    if (!hit) { missing.push(name); return ''; }
    return hit.value;
  });
  return { out, missing };
}

function loadProject(root) {
  const file = path.join(root, 'connections.yml');
  if (!exists(file)) return { file, missing: true };
  return { file, missing: false, ...parseConn(fs.readFileSync(file, 'utf8')) };
}

/* ---------------- 体检 ---------------- */
// 明文机密扫描：本方案的全部价值建立在「connections.yml 零机密」上，破了就一文不值，故判 FAIL。
const SECRETISH_KEY = /(token|secret|password|passwd|passphrase|credential|api[-_]?key|(^|[-_])key$)/i;
const HARD_PATTERNS = [
  [/^[0-9a-f]{32}$/i,                'Gitee PAT 形态（32 位十六进制）'],
  [/^gh[pousr]_[A-Za-z0-9]{16,}$/,   'GitHub token 形态'],
  [/^github_pat_[A-Za-z0-9_]{20,}$/, 'GitHub 细粒度 token 形态'],
  [/^sk-[A-Za-z0-9\-_]{16,}$/,       'OpenAI 风格 API key 形态'],
];
function looksLikePath(v) { return /^[~./]/.test(v) || v.includes('/') || v.includes('\\'); }

function checkPlaintext(conn) {
  let hits = 0;
  for (const [p, { value, line }] of conn.flat) {
    if (SECRET_ONLY.test(value)) continue;
    let hard = null;
    for (const [re, why] of HARD_PATTERNS) if (re.test(value)) { hard = why; break; }
    if (hard) {
      fail('明文机密', `connections.yml:${line} → ${p}`,
        `值命中${hard}。connections.yml 入库、零机密——把真值挪进 ~/.hact/secrets.env，此处改写 \${secret:NAME}；该凭据按已泄露处理，务必轮换一次。`);
      hits++; continue;
    }
    const leaf = p.split('.').pop();
    if (SECRETISH_KEY.test(leaf) && value.length >= 16 && !looksLikePath(value) && !refsIn(value).length) {
      fail('明文机密', `connections.yml:${line} → ${p}`,
        `字段名是机密语义、值为 ${value.length} 位裸串。挪进 ~/.hact/secrets.env，此处改写 \${secret:NAME}。`);
      hits++;
    }
  }
  if (!hits) pass('明文机密', 'connections.yml 未发现裸凭据');
}

function checkSecretRefs(conn, secrets) {
  const refs = new Map(); // NAME -> [引用它的路径]
  for (const [p, { value }] of conn.flat) {
    for (const n of refsIn(value)) { if (!refs.has(n)) refs.set(n, []); refs.get(n).push(p); }
  }
  if (!refs.size) { human('凭据引用', 'connections.yml 未引用任何机密——若本项目确实无需凭据可忽略'); return; }
  let miss = 0;
  for (const [name, paths] of refs) {
    const hit = resolveSecret(name, secrets);
    if (hit) pass('凭据引用', `${name} 已解析（来源：${hit.from}），被 ${paths.join(' / ')} 引用`);
    else {
      miss++;
      fail('凭据引用', `${name}（被 ${paths.join(' / ')} 引用）`,
        `解析不到值。在 ~/.hact/secrets.env 加一行 \`${name}=<值>\`，或导出同名环境变量。`);
    }
  }
  if (miss && !secrets.present) {
    fail('凭据文件', SECRETS_FILE, '文件不存在。跑 `node scripts/check-conn.js init` 播种骨架，填值后 chmod 600。');
  }
}

// handle 命名空间是全机扁平的，撞名 = 静默覆盖（两个项目各连各的库却共用 HACT_DB_PROD_PASSWORD 即是）。
// 身份类凭据跟人走、跨项目共用一份是**对的**；项目资源类跟项目走，必须带项目前缀区分。
// 判 🧑 不判 FAIL：多个项目合法共用同一个库 / 同一个第三方账号的情况确实存在。
const SHARED_OK = [/^HACT_GITEE_TOKEN$/, /^HACT_SSH_/, /^GITEE_/];
function projectTokens(root) {
  let name = path.basename(path.resolve(root));
  try {
    const r = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = r.replace(/\.git$/, '').match(/([^/:]+)$/);
    if (m) name = m[1];
  } catch { /* 无 origin：退回目录名 */ }
  const up = name.toUpperCase();
  return [up.replace(/[^A-Z0-9]+/g, '_'), up.replace(/[^A-Z0-9]+/g, '')];
}
function checkHandleNamespace(conn, root) {
  const toks = projectTokens(root);
  for (const [p, { value }] of conn.flat) {
    if (!/^(db|api)\./.test(p)) continue;            // 只管项目资源类
    for (const n of refsIn(value)) {
      if (SHARED_OK.some(re => re.test(n))) continue;
      if (toks.some(t => t && n.includes(t))) { pass('handle 命名', `${n} 带项目前缀，不会与其他项目撞名`); continue; }
      human('handle 命名', `${n}（${p}）未带项目前缀。~/.hact/secrets.env 是全机共用的扁平命名空间——`
        + `另一个项目若也用这个名字连它自己的资源，后填的会静默覆盖先填的。建议改名为 HACT_${toks[0]}_… 。`);
    }
  }
}

function gitToplevel(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
}

function checkSecretsFileSafety(secrets) {
  if (!secrets.present) return;
  // ① 落在 git 工作树内 = 迟早被提交。这是本方案唯一的致命失效模式，判 FAIL。
  const top = gitToplevel(SECRETS_DIR);
  if (top) fail('凭据落位', SECRETS_FILE, `该文件位于 git 工作树 ${top} 内，随时可能被提交。把 ~/.hact 移出任何仓库（也别放进云同步盘里的仓库目录）。`);
  else pass('凭据落位', '~/.hact 不在任何 git 工作树内');
  // ② 权限
  if (process.platform === 'win32') {
    human('凭据权限', `Windows 下不校验 POSIX 权限。请确认 ${SECRETS_FILE} 仅本账户可读（右键→属性→安全）。`);
  } else {
    const mode = secrets.stat.mode & 0o777;
    if (mode & 0o077) fail('凭据权限', SECRETS_FILE, `权限 ${mode.toString(8)} 对同组/其他用户可读。执行 \`chmod 600 ${SECRETS_FILE}\`。`);
    else pass('凭据权限', `${SECRETS_FILE} 权限 ${mode.toString(8)}`);
  }
}

// MCP alias 是 harness 侧配置、不随 secrets.env 走——换机最容易漏的正是这一项。
function checkMcpAlias(conn, root) {
  const aliases = [];
  for (const [p, { value }] of conn.flat) if (/(^|\.)mcp-alias$/.test(p)) aliases.push({ p, value });
  if (!aliases.length) return;
  const files = [
    path.join(os.homedir(), '.claude.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(root, '.mcp.json'),
    path.join(root, '.claude', 'settings.json'),
  ].filter(exists);
  const blob = files.map(f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
  for (const { p, value } of aliases) {
    if (blob.includes(`"${value}"`)) pass('MCP alias', `${p} = ${value} 已在本机 MCP 配置中登记`);
    else human('MCP alias', `${p} = ${value} 在本机 MCP 配置里找不到（查了 ${files.length} 处）。换机后需重配该 SSH server；若配置写法不同则忽略本条。`);
  }
}

function checkLive(conn, secrets) {
  const tokRef = conn.flat.get('gitee.token');
  if (tokRef) {
    const { out, missing } = expand(tokRef.value, secrets);
    if (!missing.length && out) {
      // token 经 stdin 送进 curl 的配置（-K -），**不进 argv**——否则它会出现在进程列表里，
      // 以及 execFileSync 抛错时的 e.message 里（后者实测已泄露过一次）。
      const NULLDEV = process.platform === 'win32' ? 'NUL' : '/dev/null';  // Windows 的 curl.exe 不认 /dev/null
      const cfg = ['silent', 'output = "' + NULLDEV + '"', 'write-out = "%{http_code}"',
        'url = "https://gitee.com/api/v5/user?access_token=' + out + '"'].join('\n') + '\n';
      try {
        const code = execFileSync('curl', ['-K', '-'],
          { input: cfg, stdio: ['pipe', 'pipe', 'ignore'], timeout: 20000 }).toString().trim();
        if (code === '200') pass('连通:gitee', 'Gitee token 有效（GET /user 返回 200）');
        else if (code === '401') fail('连通:gitee', 'gitee.token', 'GET /user 返回 401——token 无效或已过期，去 Gitee → 设置 → 私人令牌 重新生成，并更新 ~/.hact/secrets.env。');
        else human('连通:gitee', 'GET /user 返回 ' + (code || '（空）') + '——非 200/401，多为网络/代理问题，非凭据问题。');
      } catch (e) { human('连通:gitee', '未能发起请求（curl 不可用或超时）：' + redact(String(e.message).split('\n')[0]).slice(0, 120)); }
    }
  }
  for (const [p, { value }] of conn.flat) {
    if (!p.startsWith('ssh.') || !/\.host$/.test(p)) continue;
    const base = p.slice(0, -'.host'.length);
    const user = conn.flat.get(`${base}.user`);
    const target = user ? `${user.value}@${value}` : value;
    try {
      execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new', target, 'true'],
        { stdio: 'ignore', timeout: 25000 });
      pass('连通:ssh', `${base} → ${target} 免密可达`);
    } catch {
      human('连通:ssh', `${base} → ${target} 未连通（免密未配 / 主机不可达 / 私钥需口令）。部署走 MCP alias 时本条可忽略。`);
    }
  }
}

function runCheck(root, live) {
  const conn = loadProject(root);
  if (conn.missing) {
    fail('登记表', conn.file, 'connections.yml 不存在。跑 `node scripts/check-conn.js init` 播种，或从 hact-method-lab/templates/connections.yml 拷贝后填写。');
    return;
  }
  pass('登记表', `connections.yml 存在，解析出 ${conn.flat.size} 个字段`);
  for (const b of conn.bad) human('登记表', `connections.yml:${b.line} 无法解析，已跳过：${b.raw}`);
  // 同一点分路径出现两次 = 后者静默覆盖前者。最常见成因是层级塌陷（某个块起始键被误判成叶子，
  // 其下字段全被压到上一层），而塌陷本身不报错、字段数还照常——这是唯一能确定性抓住它的信号。
  for (const d of conn.dup || []) {
    fail('登记表', `connections.yml:${d.second}（首次出现在 :${d.first}）`,
      `路径 ${d.path} 重复，后者静默覆盖前者。检查缩进：是不是某个块起始键被当成了叶子，导致其下字段塌陷到上一层。`);
  }
  const secrets = loadSecrets();
  checkPlaintext(conn);
  checkSecretRefs(conn, secrets);
  checkSecretsFileSafety(secrets);
  checkHandleNamespace(conn, root);
  checkMcpAlias(conn, root);
  if (live) checkLive(conn, secrets);
  else human('连通性', '未跑真实连通性探测（默认不发外部请求）。换机 / 排障时加 `--live` 实打一次 Gitee token 与 SSH。');
}

/* ---------------- get / env / init ---------------- */
function cmdGet(root, dotted) {
  const conn = loadProject(root);
  if (conn.missing) { console.error(`connections.yml 不存在：${conn.file}`); process.exit(1); }
  const hit = conn.flat.get(dotted);
  if (!hit) {
    console.error(`connections.yml 中无字段 ${dotted}。现有字段：\n  ${[...conn.flat.keys()].join('\n  ')}`);
    process.exit(1);
  }
  const { out, missing } = expand(hit.value, loadSecrets());
  if (missing.length) { console.error(`${dotted} 引用的机密未配置：${missing.join(', ')}（补进 ~/.hact/secrets.env）`); process.exit(1); }
  process.stdout.write(out);
}

function cmdEnv(root) {
  const conn = loadProject(root);
  if (conn.missing) { console.error(`connections.yml 不存在：${conn.file}`); process.exit(1); }
  const secrets = loadSecrets();
  const names = new Set();
  for (const [, { value }] of conn.flat) for (const n of refsIn(value)) names.add(n);
  let missing = 0;
  for (const n of names) {
    const hit = resolveSecret(n, secrets);
    if (!hit) { console.error(`# 缺失：${n}`); missing++; continue; }
    console.log(`export ${n}='${hit.value.replace(/'/g, `'\\''`)}'`);
  }
  process.exit(missing ? 1 : 0);
}

// 播种内容的单一真相源是 templates/connections.yml。脚本在本仓内（templates/scripts/）时直接读它；
// 被拷进项目仓 scripts/ 后读不到，退回下面这份内嵌副本——两者须保持一致。
const CONN_FALLBACK = `# connections.yml · 本项目的外部连接登记
# 入库、**零机密**——机密只写 \${secret:NAME} 引用，真值放 ~/.hact/secrets.env（机器本地、永不入库）。
# 分工：本文件回答「连到哪、用哪份凭据」；deployment.config 回答「怎么构建、怎么重启、怎么验活」。
# 校验：node scripts/check-conn.js check [--live]

gitee:
  remote: origin                       # owner/repo 由 git remote 推导，不在此硬编码
  token: \${secret:HACT_GITEE_TOKEN}

# ssh:
#   prod:
#     mcp-alias: <Claude Code 里配的 SSH server 名>
#     host: <ip 或域名>
#     user: <登录用户>
#     identity-file: ~/.ssh/id_xxx
#     passphrase: \${secret:HACT_SSH_PROD_PASSPHRASE}   # 私钥无口令则删掉本行
#     app-dir: /srv/<项目名>

# db:
#   prod:
#     host: 127.0.0.1
#     port: 3306
#     name: <库名>
#     user: <账号>
#     password: \${secret:HACT_<项目名大写>_DB_PROD_PASSWORD}

# api:
#   <服务名>:
#     base-url: https://...
#     key: \${secret:HACT_<项目名大写>_API_<服务名大写>_KEY}
#
# ⚠️ handle 命名分两类（~/.hact/secrets.env 是全机扁平命名空间，撞名 = 静默覆盖）：
#   身份类跟人走、跨项目共用（HACT_GITEE_TOKEN / HACT_SSH_*）；项目资源类跟项目走、必须带项目前缀。
`;
function connSkeleton() {
  const tpl = path.join(__dirname, '..', 'connections.yml');
  if (exists(tpl)) { try { return fs.readFileSync(tpl, 'utf8'); } catch { /* 退回内嵌副本 */ } }
  return CONN_FALLBACK;
}

const SECRETS_SKELETON = `# ~/.hact/secrets.env · 机器本地凭据（**永不入库**，chmod 600）
# 全部项目共用；各项目 connections.yml 用 \${secret:NAME} 引用这里的 NAME。
# 格式：NAME=值。不支持行内注释（凭据可能含 #），整行 # 才是注释。
# 换机：本文件可直接拷贝复用；但 ~/.ssh 私钥文件与 Claude Code 的 MCP server 配置不随它走，需另配。

HACT_GITEE_TOKEN=
# HACT_SSH_PROD_PASSPHRASE=
# HACT_DB_PROD_PASSWORD=
`;

function cmdInit(root) {
  const connFile = path.join(root, 'connections.yml');
  if (exists(connFile)) console.log(`· 已存在，跳过：${connFile}`);
  else { fs.writeFileSync(connFile, connSkeleton(), 'utf8'); console.log(`✅ 已播种：${connFile}`); }

  if (exists(SECRETS_FILE)) console.log(`· 已存在，跳过：${SECRETS_FILE}`);
  else {
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
    fs.writeFileSync(SECRETS_FILE, SECRETS_SKELETON, 'utf8');
    if (process.platform !== 'win32') fs.chmodSync(SECRETS_FILE, 0o600);
    console.log(`✅ 已播种：${SECRETS_FILE}${process.platform === 'win32' ? '（Windows 下请自行确认仅本账户可读）' : '（已 chmod 600）'}`);
  }
  console.log(`\n下一步：填 ${SECRETS_FILE} 的凭据值 → 按需取消 connections.yml 里 ssh/db/api 段的注释并填坐标 → 跑 \`node scripts/check-conn.js check --live\` 验一次。`);
}

/* ---------------- 主流程 ---------------- */
function main() {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const args = argv.filter(a => a !== '--live');
  const cmd = ['check', 'get', 'env', 'init'].includes(args[0]) ? args.shift() : 'check';

  try {
    if (cmd === 'get') {
      const dotted = args.shift();
      if (!dotted) { console.error('用法: node check-conn.js get <点分路径> [项目根]'); process.exit(2); }
      cmdGet(args[0] || process.cwd(), dotted); return;
    }
    if (cmd === 'env')  { cmdEnv(args[0] || process.cwd());  return; }
    if (cmd === 'init') { cmdInit(args[0] || process.cwd()); return; }
    runCheck(args[0] || process.cwd(), live);
  } catch (e) {
    console.error('check-conn 自身出错（非配置问题）:', redact(e.message));
    process.exit(2);
  }

  const fails  = findings.filter(f => f.level === 'fail');
  const passes = findings.filter(f => f.level === 'pass');
  const humans = findings.filter(f => f.level === 'human');
  console.log(`\n=== check-conn 报告（${args[0] || process.cwd()}）===`);
  console.log(`通过 ${passes.length} 项 / 失败 ${fails.length} 项\n`);
  if (fails.length) {
    console.log('❌ FAIL:');
    for (const f of fails) console.log(redact(`  [${f.rule}] ${f.loc}
      ${f.msg}`));
    console.log('');
  } else {
    console.log('✅ 确定性判据全部通过\n');
  }
  if (passes.length) { console.log('✅ 明细:'); for (const p of passes) console.log(redact(`  [${p.rule}] ${p.msg}`)); console.log(''); }
  if (humans.length) { console.log('🧑 需人确认（脚本不判，非 FAIL）:'); for (const h of humans) console.log(redact(`  [${h.rule}] ${h.msg}`)); }
  process.exit(fails.length ? 1 : 0);
}

main();
