#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runLadder, loadStorms } from '../lib/loop.mjs';
import { writeReport } from '../lib/report.mjs';
import { makeUi, bold, green } from '../lib/ui.mjs';
import { balance, defaultPrefix } from '../lib/kane.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = `brownout run  --app "<start cmd>" [--app-dir d] [--app-port 18751] [--port 18750] --flows <dir> --storms <file>
              [--agent-cmd "<cmd>"] [--max-tries 3] [--only <storm>] [--no-fix] [--baseline] [--final] [--no-mullvad]
brownout demo [--reset] [--only <storm>] [--no-baseline] [--no-final] [--baseline-from <result.json>]`;
const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  app: { type: 'string' }, 'app-dir': { type: 'string' }, 'app-port': { type: 'string', default: '18751' }, port: { type: 'string', default: '18750' },
  flows: { type: 'string' }, storms: { type: 'string' }, 'agent-cmd': { type: 'string' }, 'max-tries': { type: 'string', default: '3' },
  only: { type: 'string' }, 'no-fix': { type: 'boolean' }, baseline: { type: 'boolean' }, final: { type: 'boolean' }, reset: { type: 'boolean' },
  'no-baseline': { type: 'boolean' }, 'no-final': { type: 'boolean' }, 'no-mullvad': { type: 'boolean' }, 'kane-timeout': { type: 'string', default: '170' }, 'run-dir': { type: 'string' }, 'baseline-from': { type: 'string' } } });
const cmd = positionals[0];
if (!['run', 'demo'].includes(cmd)) { console.log(usage); process.exit(cmd ? 1 : 0); }

let cfg;
if (cmd === 'demo') {
  const work = path.join(root, 'demo/shop'), pristine = path.join(root, 'demo/shop-naive');
  if (v.reset || !fs.existsSync(work)) { fs.rmSync(work, { recursive: true, force: true }); fs.cpSync(pristine, work, { recursive: true }); console.log('demo shop reset to the naive version'); }
  cfg = { app: 'node server.mjs', appDir: work, flows: path.join(root, 'demo/flows'), storms: path.join(root, 'demo/storms.json'), baseline: !v['no-baseline'], final: !v['no-final'] };
} else {
  if (!v.app || !v.flows || !v.storms) { console.log(usage); process.exit(1); }
  cfg = { app: v.app, appDir: path.resolve(v['app-dir'] || '.'), flows: path.resolve(v.flows), storms: path.resolve(v.storms), baseline: !!v.baseline, final: !!v.final };
}
const ts = new Date().toISOString().replace(/[:.]/g, '-');
Object.assign(cfg, { port: +v.port, appPort: +v['app-port'], agentCmd: v['agent-cmd'], maxTries: +v['max-tries'], only: v.only, fix: !v['no-fix'],
  kanePrefix: v['no-mullvad'] ? [] : defaultPrefix(), kaneTimeout: +v['kane-timeout'], baselineFrom: v['baseline-from'] && path.resolve(v['baseline-from']), runDir: path.resolve(v['run-dir'] || path.join(root, 'runs', ts)) });
fs.mkdirSync(cfg.runDir, { recursive: true });

const storms = loadStorms(cfg.storms).filter((s) => !cfg.only || s.name === cfg.only);
console.log(bold('BROWNOUT') + `  ${storms.length} storms  run folder: ${cfg.runDir}`);
const bal0 = balance(cfg.kanePrefix).trim().split('\n').slice(0, 3).join(' | ');
console.log(`kane balance before: ${bal0}`);
const res = await runLadder(cfg, makeUi(storms));
const { md, totals } = writeReport(res, cfg.runDir);
console.log('\n' + md.split('\n').slice(2, 5).join('\n'));
console.log(green('report: ') + path.join(cfg.runDir, 'REPORT.md'));
console.log(`kane balance after: ${balance(cfg.kanePrefix).trim().split('\n').slice(0, 3).join(' | ')}`);
process.exit(totals.fixed === totals.total ? 0 : 1);
