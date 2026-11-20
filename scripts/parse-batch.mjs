// 解析 aoci_maintain 返回，产出批次清单给子代理用
import fs from 'node:fs';

const raw = fs.readFileSync('last-call.json', 'utf8').replace(/^\uFEFF/, '');
const j = JSON.parse(raw);
const cp = j.code_plan;
const batch = {
  code_batch_id: cp.batch_id,
  total_targets: cp.total_targets,
  included: cp.included,
  remaining: cp.remaining,
  siblings: (cp.siblings || []).map((s) => ({ batch_id: s.batch_id, included: s.included, state: s.state })),
  candidates: j.candidates.map((c) => ({
    path: c.path,
    source_sha256: c.source_sha256,
    candidate_id: c.candidate_id,
    file_lines: c.file_lines,
    expected_e: c.expected_e,
  })),
};
fs.writeFileSync('batch.json', JSON.stringify(batch, null, 1));
console.log('batch', batch.code_batch_id.slice(0, 12), '| included', batch.included, '| remaining', batch.remaining, '| total', batch.total_targets);
console.log('siblings', JSON.stringify(batch.siblings));
console.log('total lines in batch', batch.candidates.reduce((a, c) => a + c.file_lines, 0));
for (const c of batch.candidates) console.log('  ', String(c.file_lines).padStart(5), c.path);
