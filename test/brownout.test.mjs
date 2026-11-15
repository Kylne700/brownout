import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProxy, callMatcher, HTML_ERROR } from '../lib/proxy.mjs';
import { parseNdjson } from '../lib/kane.mjs';
import { buildEvidence, buildPrompt, describeFault, readFaultLog } from '../lib/evidence.mjs';
import { parseAgentJson } from '../lib/agent.mjs';

const get = (port, p, method = 'GET') => new Promise((res) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method }, (x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => res({ code: x.statusCode, body: b })); });
  r.on('error', (e) => res({ error: e.code })); r.end();
});
async function withProxy(faults, fn) {
  let hits = 0;
  const up = http.createServer((q, s) => { hits++; s.end('{"ok":true}'); });
  await new Promise((r) => up.listen(18760, '127.0.0.1', r));
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bo-')), 'f.ndjson');
  const px = createProxy({ target: 18760, faults, logFile: log });
  await px.listen(18761);
  try { await fn({ hits: () => hits, log }); } finally { await px.close(); up.closeAllConnections(); up.close(); }
}

test('callMatcher', () => {
  assert.deepEqual([1, 2, 3, 4].map(callMatcher('1-2')), [true, true, false, false]);
  assert.equal(callMatcher('all')(99), true);
  assert.equal(callMatcher('3')(3), true);
  assert.throws(() => callMatcher('x'));
});

test('status action counts calls and logs; later calls pass through', async () => {
  await withProxy([{ name: 's', route: '/pay', method: 'POST', calls: '1-2', action: 'status:503' }], async ({ hits, log }) => {
    assert.equal((await get(18761, '/pay', 'POST')).code, 503);
    assert.equal((await get(18761, '/pay', 'POST')).code, 503);
    assert.equal((await get(18761, '/pay', 'POST')).code, 200);
    assert.equal((await get(18761, '/pay', 'GET')).code, 200); // other method untouched
    assert.equal(hits(), 2);
    const l = readFaultLog(log);
    assert.deepEqual(l.map((e) => e.call), [1, 2]);
    assert.equal(l[0].action, 'status:503');
  });
});

test('drop-after-upstream reaches the app, client sees no response', async () => {
  await withProxy([{ name: 's', route: '/pay', method: 'POST', calls: '1', action: 'drop-after-upstream' }], async ({ hits }) => {
    assert.ok((await get(18761, '/pay', 'POST')).error);
    assert.equal(hits(), 1);
    assert.equal((await get(18761, '/pay', 'POST')).code, 200);
  });
});

test('delay and html-error bodies', async () => {
  await withProxy([{ name: 'd', route: '/a', method: 'GET', calls: 'all', action: 'delay:300' }, { name: 'h', route: '/b', method: 'GET', calls: '1', action: 'body:html-error' }], async () => {
    const t = Date.now(); assert.equal((await get(18761, '/a')).code, 200); assert.ok(Date.now() - t >= 290);
    assert.equal((await get(18761, '/b')).body, HTML_ERROR);
    assert.equal((await get(18761, '/b')).body, '{"ok":true}');
  });
});

const runEnd = '{"type":"run_end","status":"failed","reason":"Payment failed shown","one_liner":"x","credits_consumed":15.4,"duration":45.9,"reason_code":"assertion_error.confirmed_product_bug","test_url":"https://example.invalid/x"}';
test('parseNdjson: run_end and steps', () => {
  const text = ['{"type":"stream_start","v":1}', '{"step":2,"status":"running","remark":"Step 1"}', '{"step":2,"status":"done","remark":"click: Pay now"}', 'garbage', runEnd].join('\n');
  const r = parseNdjson(text);
  assert.deepEqual(r.steps, ['click: Pay now']);
  assert.equal(r.runEnd.status, 'failed');
  assert.equal(r.runEnd.credits_consumed, 15.4);
});

test('parseNdjson on the real spike samples', () => {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
  for (const f of ['run1.ndjson', 'run2.ndjson', 'run3.ndjson']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const r = parseNdjson(fs.readFileSync(p, 'utf8'));
    assert.ok(r.runEnd && ['passed', 'failed'].includes(r.runEnd.status), f);
    assert.ok(r.steps.length > 0, f);
  }
});

test('evidence join + prompt', () => {
  const faults = [{ method: 'POST', path: '/api/pay', call: 1, action: 'drop-after-upstream', storm: 'x' }];
  const kane = { status: 'failed', reason: 'Orders page shows 2 orders', summary: 's', oneLiner: 'o', reasonCode: 'c', steps: ['a', 'b'] };
  const ev = buildEvidence({ storm: { name: 'x', expect: 'exactly one order' }, kane, faults, flow: 'FLOW', tryNo: 1 });
  assert.equal(ev.faults.length, 1);
  const p = buildPrompt(ev, '/app');
  for (const s of ['What the user saw:', 'Orders page shows 2 orders', 'What the network did', 'POST /api/pay call #1', 'closed before the browser', 'The rule the app must meet:', 'exactly one order', 'Fix the app in /app; do not edit the proxy, storms or flows']) assert.ok(p.includes(s), s);
  assert.ok(describeFault({ method: 'GET', path: '/x', call: 1, action: 'delay:12000' }).includes('12000'));
});

test('parseAgentJson', () => {
  const a = parseAgentJson('{"result":"done","total_cost_usd":0.12,"num_turns":4,"usage":{"input_tokens":10,"output_tokens":5}}');
  assert.equal(a.cost, 0.12); assert.equal(a.tokensOut, 5);
  assert.equal(parseAgentJson('plain text').message, 'plain text');
});
