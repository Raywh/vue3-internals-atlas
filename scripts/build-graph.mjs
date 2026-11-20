// 从真实源码里抽取 文件级依赖图 + 导出符号 + 包归属
// 只做静态文本解析（import/export 语句），不做 AST —— 出错的地方宁可漏，不要编。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('vue-core');
const PKG_DIR = path.join(ROOT, 'packages');

const IGNORE_DIR = /__tests__|node_modules|dist/;
const files = [];
for (const pkg of fs.readdirSync(PKG_DIR)) {
  const src = path.join(PKG_DIR, pkg, 'src');
  if (!fs.existsSync(src)) continue;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!IGNORE_DIR.test(full)) walk(full); continue; }
      if (!/\.(ts|vue)$/.test(e.name)) continue;
      if (/\.d\.ts$/.test(e.name)) continue;
      files.push(full);
    }
  };
  walk(src);
}

const toId = (abs) => path.relative(PKG_DIR, abs).replace(/\\/g, '/');

// 解析 import 说明符 -> 目标文件 id
function resolveSpec(spec, fromAbs) {
  if (spec.startsWith('.')) {
    const base = path.resolve(path.dirname(fromAbs), spec);
    for (const cand of [base, base + '.ts', base + '.vue', path.join(base, 'index.ts')]) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return toId(cand);
    }
    return null;
  }
  // 包别名：@vue/shared -> shared/src/index.ts
  const m = spec.match(/^@vue\/([\w-]+)$/);
  if (m) {
    const idx = path.join(PKG_DIR, m[1], 'src', 'index.ts');
    if (fs.existsSync(idx)) return toId(idx);
  }
  return null;
}

function exportsOf(code) {
  const out = new Set();
  const re = /export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(code))) out.add(m[1]);
  // export { a, b as c }  /  export { a } from './x'
  const re2 = /export\s*\{([^}]*)\}/g;
  while ((m = re2.exec(code))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name);
    }
  }
  // export default
  if (/export\s+default\b/.test(code)) out.add('default');
  return [...out];
}

const nodes = [];
const edges = [];
const edgeSet = new Set();
const idByAbs = new Map();

for (const abs of files) {
  const code = fs.readFileSync(abs, 'utf8');
  const id = toId(abs);
  idByAbs.set(abs, id);
  const pkg = id.split('/')[0];
  nodes.push({
    id,
    pkg,
    lines: code.split('\n').length,
    exports: exportsOf(code),
    isIndex: /\/index\.ts$/.test(id),
  });
}

for (const abs of files) {
  const code = fs.readFileSync(abs, 'utf8');
  const from = toId(abs);
  const specs = new Set();
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) specs.add(m[1]);
  const re2 = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  while ((m = re2.exec(code))) specs.add(m[1]);
  for (const s of specs) {
    const to = resolveSpec(s, abs);
    if (!to || to === from) continue;
    const key = from + '->' + to;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ from, to });
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: 'vuejs/core @ ' + fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim(),
  stats: { nodes: nodes.length, edges: edges.length },
  nodes,
  edges,
};
fs.writeFileSync('graph.json', JSON.stringify(out, null, 1));

console.log('nodes', nodes.length, 'edges', edges.length);
const byPkg = {};
for (const n of nodes) byPkg[n.pkg] = (byPkg[n.pkg] || 0) + 1;
console.log('byPkg', byPkg);
const isolated = nodes.filter((n) => !edges.some((e) => e.from === n.id || e.to === n.id)).map((n) => n.id);
console.log('isolated', isolated.length, isolated.slice(0, 10));
