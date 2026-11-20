// 合并子代理产出的条目 → 规范化 → 本地预校验（按 AOCI 的硬上限）→ 生成 update_entry 载荷
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve('vue-core');
const batch = JSON.parse(fs.readFileSync('batch.json', 'utf8'));
const byPath = new Map(batch.candidates.map((c) => [c.path, c]));

const RE = /^([^\[\]]+)\[([^\]]+)\]:\s*F:([\s\S]*?)\s*\|\s*R:([\s\S]*?)\s*\|\s*A:([\s\S]*?)\s*\|\s*S:([\s\S]*)$/;

const entryFiles = process.argv.slice(2);
const raw = new Map();
const problems = [];

for (const f of entryFiles) {
  const arr = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  for (const item of arr) {
    const p = String(item.path).replace(/\\/g, '/').trim();
    if (!byPath.has(p)) { problems.push(`[不在批次内] ${p}`); continue; }
    if (raw.has(p)) { problems.push(`[重复] ${p}`); continue; }
    raw.set(p, String(item.entry).replace(/\r?\n/g, ' ').trim());
  }
}

const missing = batch.candidates.filter((c) => !raw.has(c.path)).map((c) => c.path);
if (missing.length) problems.push(`[缺条目] ${missing.join(', ')}`);

// 规范化：R/A 用半角逗号无空格，字段间距统一
function normalize(entry) {
  const m = entry.match(RE);
  if (!m) return null;
  const [, name, tags, F, R, A, S] = m;
  const r = R.trim() === '-' ? '-' : R.split(',').map((x) => x.trim()).filter(Boolean).join(',');
  const a = A.trim() === '-' ? '-' : A.split(',').map((x) => x.trim()).filter(Boolean).join(',');
  return { name: name.trim(), tags: tags.trim(), F: F.trim(), R: r, A: a, S: S.trim() };
}

const LIM = {
  rBytes: { 9: 542, 8: 422, 7: 272, 6: 272, 5: 272, 4: 152, 3: 152, 2: 152, 1: 152 },
  sTokens: { 9: 100, 8: 70, 7: 40, 6: 40, 5: 40, 4: 20, 3: 20, 2: 20, 1: 20 },
};

const entries = [];
for (const [p, rawEntry] of raw) {
  const n = normalize(rawEntry);
  if (!n) { problems.push(`${p}: 格式不匹配`); continue; }
  const c = (n.tags.match(/[1-9]/) || [])[0];
  if (!c) { problems.push(`${p}: 标签无重要性数字 [${n.tags}]`); continue; }
  const C = +c;
  const errs = [];
  if (Buffer.byteLength(n.F, 'utf8') > 480) errs.push(`F 超过 160 字`);
  if (n.R !== '-') {
    const items = n.R.split(',');
    if (items.length > 8) errs.push('R 超过 8 项');
    if (Buffer.byteLength(n.R, 'utf8') > LIM.rBytes[C]) errs.push(`R 字节 ${Buffer.byteLength(n.R, 'utf8')} > C${C} 上限 ${LIM.rBytes[C]}`);
    for (const it of items) {
      if (!it.startsWith('code:')) { errs.push(`R 不是 code: 身份 → ${it}`); continue; }
      if (!fs.existsSync(path.join(REPO, it.slice(5)))) errs.push(`R 指向不存在的文件 → ${it.slice(5)}`);
    }
  }
  if (n.A !== '-' && n.A.split(',').length > 6) errs.push('A 超过 6 项');
  if (n.S !== '-' && Math.ceil(Buffer.byteLength(n.S, 'utf8') / 3) > LIM.sTokens[C]) errs.push(`S token 超过 C${C} 上限`);
  if (errs.length) { problems.push(`${p}: ${errs.join('; ')}`); continue; }

  const entry = `${n.name}[${n.tags}]: F:${n.F} | R:${n.R} | A:${n.A} | S:${n.S}`;
  const cand = byPath.get(p);
  entries.push({ path: p, new_entry: entry, source_sha256: cand.source_sha256, candidate_id: cand.candidate_id });
}

fs.writeFileSync('submit.json', JSON.stringify({ code_batch_id: batch.code_batch_id, entries }, null, 1));
console.log(`批次文件 ${entryFiles.length} 个 | 合并 ${raw.size} | 通过 ${entries.length} | 问题 ${problems.length}`);
for (const p of problems) console.log(' ✗', p);
if (!problems.length) console.log('✅ 预校验通过，submit.json 已生成');
