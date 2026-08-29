#!/usr/bin/env node
// 页面外壳构造级校验（foundation.md「页面外壳」契约，standards-frontend.md）：
// 业务路由必须统一嵌套在 AppLayout 的 children 下，禁止在顶层新增不嵌套 AppLayout 的业务路由
// （唯一例外是 /login，未登录态本就到不了外壳）。此前该约束只是"强约定"（人工遵守），未被
// lint/类型系统拦截；本脚本对 router/index.ts 做结构级静态核对，接入 npm run lint，
// 顶层出现第三种路由形状（既非 /login、也非 AppLayout 外壳）时直接判定失败。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTER_FILE = path.join(__dirname, '..', 'src', 'router', 'index.ts');

function extractTopLevelRouteObjects(source) {
  const marker = 'routes:';
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`未在 ${ROUTER_FILE} 中找到 "routes:" 数组声明`);
  }
  const arrayStart = source.indexOf('[', markerIndex);
  if (arrayStart === -1) {
    throw new Error('routes: 后未找到数组起始的 "["');
  }

  // 逐字符扫描，按括号/引号深度切出顶层数组内的每个 { ... } 路由对象（忽略字符串内的括号）。
  const objects = [];
  let depth = 0;
  let objectStart = -1;
  let inString = null; // 当前所在字符串的引号字符，null 表示不在字符串内
  let arrayDepth = 0;

  for (let i = arrayStart; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];

    if (inString) {
      if (ch === inString && prev !== '\\') {
        inString = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '[') {
      arrayDepth += 1;
      continue;
    }
    if (ch === ']') {
      arrayDepth -= 1;
      if (arrayDepth === 0) {
        break; // 顶层 routes 数组结束
      }
      continue;
    }
    if (ch === '{') {
      if (arrayDepth === 1 && depth === 0) {
        objectStart = i;
      }
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (arrayDepth === 1 && depth === 0 && objectStart !== -1) {
        objects.push(source.slice(objectStart, i + 1));
        objectStart = -1;
      }
      continue;
    }
  }

  if (objects.length === 0) {
    throw new Error('routes: 数组内未解析出任何顶层路由对象，脚本可能与文件结构不匹配，需要人工核对');
  }
  return objects;
}

function isLoginRoute(routeText) {
  return /path:\s*['"]\/login['"]/.test(routeText);
}

function isAppLayoutShellRoute(routeText) {
  const hasAppLayoutImport = /AppLayout\.vue/.test(routeText);
  const hasChildren = /children\s*:\s*\[/.test(routeText);
  return hasAppLayoutImport && hasChildren;
}

function main() {
  const source = fs.readFileSync(ROUTER_FILE, 'utf8');
  const topLevelRoutes = extractTopLevelRouteObjects(source);

  const violations = [];
  topLevelRoutes.forEach((routeText, index) => {
    if (isLoginRoute(routeText)) {
      return;
    }
    if (isAppLayoutShellRoute(routeText)) {
      return;
    }
    violations.push({ index, snippet: routeText.slice(0, 120).replace(/\s+/g, ' ') });
  });

  if (violations.length > 0) {
    console.error('❌ 页面外壳构造级校验失败：顶层出现未嵌套 AppLayout 的业务路由');
    violations.forEach((v) => {
      console.error(`  - 第 ${v.index + 1} 个顶层路由对象：${v.snippet}...`);
    });
    console.error(
      '\n业务路由必须写进 AppLayout 路由的 children 数组，不得在 routes: 顶层单独新增' +
        '（唯一例外是 /login）。见 standards-frontend.md「页面外壳」契约。',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`✅ 页面外壳构造级校验通过（顶层 ${topLevelRoutes.length} 个路由对象，均合规）`);
}

main();
