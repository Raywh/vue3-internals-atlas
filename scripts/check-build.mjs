import fs from 'node:fs';
const h = fs.readFileSync('vue-graph.html', 'utf8');
const m = h.match(/<script id="data"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO DATA BLOCK'); process.exit(1); }
const d = JSON.parse(m[1]);
const withR = d.nodes.filter((n) => n.r && n.r.length);
const badPrefix = withR.filter((n) => n.r.some((x) => x.startsWith('code:')));
const unresolved = withR.filter((n) => n.r.some((x) => !d.nodes.some((y) => y.id === x)));
const missing = withR.filter((n) => n.r.some((x) => x !== '-' && !fs.existsSync('vue-core/' + x)));
console.log('nodes:', d.nodes.length, '| edges:', d.edges.length, '| nodes with R:', withR.length);
console.log('R still carrying code: prefix:', badPrefix.length);
console.log('R pointing to a node not in graph:', unresolved.length);
console.log('R pointing to a file that does not exist:', missing.length);
const r = d.nodes.find((n) => n.id.endsWith('/renderer.ts'));
console.log('renderer tags:', r.tags, '| S:', r.s);
console.log('renderer R:', r.r.join(' , '));
console.log('chapters:', d.chapters.length, '| placeholder left:', h.includes('__DATA__'));
