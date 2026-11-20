// 组装 vue-graph.html：真实依赖图 + AOCI FRAS 条目 + 学习路线
// 兼容两种布局：仓库内有 vue-core/ 克隆，或只有导出的 index/aoci.code.txt
import fs from 'node:fs';

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const first = (...ps) => ps.find((p) => fs.existsSync(p));

const graph = readJSON('graph.json');
const chapters = readJSON('chapters.json').chapters;

const codePath = first('vue-core/aoci.code.txt', 'index/aoci.code.txt', 'aoci.code.txt');
if (!codePath) { console.error('找不到 aoci.code.txt'); process.exit(1); }

// ── 解析 aoci.code.txt（Volumes v1：目录小节 + 单行条目）──
const codeTxt = fs.readFileSync(codePath, 'utf8').replace(/^\uFEFF/, '');
const entries = new Map();
let curDir = '', bad = 0;
for (const raw of codeTxt.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const sec = line.match(/^=+(.*?)=+$/);
  if (sec) { curDir = sec[1].replace(/^\//, '').replace(/^<repository>\/?/, ''); if (curDir && !curDir.endsWith('/')) curDir += '/'; continue; }
  const m = line.match(/^([^\[\]]+)\[([^\]]+)\]:\s*F:([\s\S]*?)\s*\|\s*R:([\s\S]*?)\s*\|\s*A:([\s\S]*?)\s*\|\s*S:([\s\S]*)$/);
  if (!m) { bad++; continue; }
  const [, name, tags, F, R, A, S] = m;
  entries.set(name.includes('/') ? name : curDir + name, { tags, f: F.trim(), r: R.trim(), a: A.trim(), s: S.trim() });
}

// ── 章节归属 ──
const chapterOf = new Map();
for (const c of chapters) for (const f of c.files) if (!chapterOf.has(f)) chapterOf.set(f, c.id);

const nodes = graph.nodes.map((n) => {
  const full = 'packages/' + n.id;
  const e = entries.get(full);
  return {
    id: full,
    pkg: n.pkg,
    lines: n.lines,
    exports: n.exports,
    chapter: chapterOf.get(full) || null,
    hasEntry: !!e,
    tags: e ? e.tags : null,
    f: e ? e.f : null,
    r: e ? e.r.split(',').map((x) => x.trim().replace(/^code:/, '')).filter((x) => x && x !== '-') : [],
    a: e ? e.a : null,
    s: e ? e.s : null,
  };
});

const ids = new Set(nodes.map((n) => n.id));
const edges = graph.edges
  .map((e) => ({ from: 'packages/' + e.from, to: 'packages/' + e.to }))
  .filter((e) => ids.has(e.from) && ids.has(e.to));

const tplPath = first('viewer.template.html', 'scripts/viewer.template.html');
const tpl = fs.readFileSync(tplPath, 'utf8');
const data = {
  meta: {
    source: 'vuejs/core @ 7de9e41 (v3.5.46)',
    generatedAt: new Date().toISOString(),
    indexEngine: 'AOCI-CODE v0.2.0-rc3 (FSL-1.1-MIT)',
    stats: { nodes: nodes.length, edges: edges.length, entries: nodes.filter((n) => n.hasEntry).length },
  },
  chapters, nodes, edges,
};
fs.writeFileSync('vue-graph.html', tpl.replace('__DATA__', JSON.stringify(data).replace(/</g, '\\u003c')));

console.log('索引来源：', codePath);
console.log('条目：', entries.size, '（解析失败', bad, '行）');
console.log('节点', nodes.length, '| 有 FRAS 条目', nodes.filter((n) => n.hasEntry).length, '| 边', edges.length);
console.log('输出 vue-graph.html', (fs.statSync('vue-graph.html').size / 1024).toFixed(0), 'KB');
