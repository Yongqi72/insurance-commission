#!/usr/bin/env node
// check-ux.js <vN> [root]
// 验证 draft-ux 产物结构：
//   ux-flows.md  —— 含「场景列表」（S-id 条目）+ 「流程图」（mermaid 块）
//   prototype-map.md —— 含「前端 AC 覆盖」表
//   prototype.html   —— 文件存在
//
// 用法：node scripts/check-ux.js v1 [项目根目录]
// 退出码：0 = 通过  1 = 结构不合格  2 = 参数错误
'use strict';
const fs   = require('fs');
const path = require('path');

const ver  = process.argv[2];
const root = process.argv[3] || '.';

if (!ver || !/^v\d+$/.test(ver)) {
  console.error('用法：node scripts/check-ux.js <vN> [根目录]');
  process.exit(2);
}

const findings = [];
let hasFail = false;
function pass(label, msg)      { findings.push({ level: 'pass', label, msg }); }
function fail(label, loc, msg) { findings.push({ level: 'fail', label, loc, msg }); hasFail = true; }

const iterDir = path.join(root, 'iterations', ver);

/* ---- ux-flows.md ---- */
const uxPath = path.join(iterDir, 'ux-flows.md');
if (!fs.existsSync(uxPath)) {
  fail('ux-flows.md 存在', uxPath, '未找到 ux-flows.md');
} else {
  const text = fs.readFileSync(uxPath, 'utf8');

  if (!/^##\s+场景列表/m.test(text)) {
    fail('场景列表段', uxPath, '缺少「## 场景列表」段');
  } else if (!/\bS\d+[：:]/m.test(text)) {
    fail('场景条目', uxPath, '「场景列表」下无 S-id 条目（格式：- S1：…）');
  } else {
    pass('场景列表', '含「## 场景列表」段且有 S-id 条目');
  }

  if (!/^##\s+流程图/m.test(text)) {
    fail('流程图段', uxPath, '缺少「## 流程图」段');
  } else if (!/```mermaid/m.test(text)) {
    fail('mermaid 块', uxPath, '「流程图」段内无 mermaid 代码块');
  } else {
    pass('流程图', '含「## 流程图」段且有 mermaid 代码块');
  }
}

/* ---- prototype-map.md ---- */
const mapPath = path.join(iterDir, 'prototype-map.md');
if (!fs.existsSync(mapPath)) {
  fail('prototype-map.md 存在', mapPath,
    '未找到 prototype-map.md（由 Claude Design 与 prototype.html 同步产出）');
} else {
  const text = fs.readFileSync(mapPath, 'utf8');
  if (!/^##\s+前端\s*AC\s*覆盖/m.test(text)) {
    fail('AC 覆盖表', mapPath, '缺少「## 前端 AC 覆盖」段');
  } else if (!/^\|\s*AC[\s|]/m.test(text)) {
    fail('AC 表头', mapPath, '「前端 AC 覆盖」段内无 | AC | 表头行');
  } else {
    pass('prototype-map.md', '含「前端 AC 覆盖」表');
  }
}

/* ---- prototype.html ---- */
const htmlPath = path.join(iterDir, 'prototype.html');
if (!fs.existsSync(htmlPath)) {
  fail('prototype.html 存在', htmlPath, '未找到 prototype.html');
} else {
  pass('prototype.html', 'prototype.html 存在');
}

/* ---- 输出 ---- */
for (const f of findings) {
  if (f.level === 'pass') console.log(`✅ [${f.label}] ${f.msg}`);
  if (f.level === 'fail') console.error(`❌ [${f.label}] ${f.loc}：${f.msg}`);
}
process.exit(hasFail ? 1 : 0);
