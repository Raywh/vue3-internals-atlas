// 构建产物自检：数据块是否替换、R 是否带 code: 前缀、指向的文件是否存在
import fs from 'node:fs';

const h = fs.readFileSync('vue-graph.html', 'utf8');
const m = h.match(/<script id="data"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO DATA BLOCK'); process.exit(1); }
const d = JSON.parse(m[1]);

const withR = d.nodes.filter((n) => n.r && n.r.length);
const badPrefix = withR.filter((n) => n.r.some((x) => x.startsWith('code:')));
const unresolved = withR.filter((n) => n.r.some((x) => !d.nodes.some((y) => y.id === x)));
const hasSource = fs.existsSync('vue-core');
const missing = hasSource
  ? withR.filter((n) => n.r.some((x) => !fs.existsSync('vue-core/' + x)))
  : [];

console.log('nodes:', d.nodes.length, '| edges:', d.edges.length, '| nodes with R:', withR.length);
console.log('R 带 code: 前缀:', badPrefix.length, '（必须 0）');
console.log('R 指向图外节点:', unresolved.length, '（渲染成不可点的纯文本，不算失败）');
if (hasSource) console.log('R 指向不存在的文件:', missing.length);
else console.log('R 指向不存在的文件: 跳过（本仓库没有 vue-core 源码）');
console.log('章节:', d.chapters.length, '| 模板占位符残留:', h.includes('__DATA__'));

const problems = badPrefix.length + missing.length + (h.includes('__DATA__') ? 1 : 0);
if (problems) { console.error('FAILED:', problems, '个问题'); process.exit(1); }
console.log('OK');
