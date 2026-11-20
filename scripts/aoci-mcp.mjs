// 极简 MCP stdio 客户端：驱动 `aoci mcp`，让条目走 AOCI 自己的校验/原子写入流水线
// 用法：node aoci-mcp.mjs list | schema <tool> | call <tool> [args.json]
// 环境变量：AOCI_BIN（默认 PATH 里的 aoci）、AOCI_REPO（默认 ./vue-core）、OUT（结果文件名）、AOCI_TEMP（默认 ./.tmp）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AOCI = process.env.AOCI_BIN || 'aoci';
const REPO = path.resolve(process.env.AOCI_REPO || 'vue-core');
const TMP = path.resolve(process.env.AOCI_TEMP || '.tmp');
fs.mkdirSync(TMP, { recursive: true });

const proc = spawn(AOCI, ['--repo', REPO, 'mcp'], {
  env: { ...process.env, TEMP: TMP, TMP },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const pending = new Map();
let nextId = 1;

proc.stdout.setEncoding('utf8');
proc.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { console.error('[non-json]', line.slice(0, 200)); continue; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
proc.stderr.setEncoding('utf8');
proc.stderr.on('data', (d) => { if (/error|panic/i.test(d)) console.error('[stderr]', d.slice(0, 400)); });

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout: ' + method)), 180000);
    pending.set(id, (m) => { clearTimeout(timer); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const notify = (method, params) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');

async function main() {
  const [cmd, arg1, arg2] = process.argv.slice(2);
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'dsh-learner', version: '1.0.0' },
  });
  notify('notifications/initialized', {});

  if (cmd === 'list') {
    const r = await rpc('tools/list', {});
    for (const t of r.tools) console.log('-', t.name, '|', (t.description || '').split('\n')[0].slice(0, 110));
  } else if (cmd === 'schema') {
    const r = await rpc('tools/list', {});
    console.log(JSON.stringify(r.tools.find((x) => x.name === arg1), null, 1));
  } else if (cmd === 'call') {
    const args = arg2 ? JSON.parse(fs.readFileSync(arg2, 'utf8')) : {};
    const r = await rpc('tools/call', { name: arg1, arguments: args });
    const text = r.content.map((c) => c.text).join('\n');
    const outFile = process.env.OUT || 'last-call.json';
    fs.writeFileSync(outFile, text);
    console.log('saved:', outFile, 'bytes:', text.length, 'isError:', !!r.isError);
    console.log(text.slice(0, 800));
  }
  proc.kill();
  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e.message); proc.kill(); process.exit(1); });
