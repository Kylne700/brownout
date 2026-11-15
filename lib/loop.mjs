// The closed loop: for each storm, Kane runs -> red -> evidence -> agent patch -> re-run -> green -> next storm.
import fs from 'node:fs';
import path from 'node:path';
import { createProxy } from './proxy.mjs';
import { runKane } from './kane.mjs';
import { readFaultLog, buildEvidence, writeEvidence } from './evidence.mjs';
import { runAgent } from './agent.mjs';
import { startApp, stopApp, snapshot, diffDirs } from './app.mjs';

export function loadStorms(file) {
  const storms = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const s of storms) for (const f of s.faults) f.name = s.name;
  return storms;
}

// One Kane run against a fresh app + fresh proxy (counters start at 0) with only this storm's faults.
export async function runStorm(storm, cfg, dir, ui) {
  fs.mkdirSync(dir, { recursive: true });
  const faultFile = path.join(dir, 'faults.ndjson');
  fs.rmSync(faultFile, { force: true });
  const base = `http://127.0.0.1:${cfg.port}`;
  const flow = fs.readFileSync(path.join(cfg.flows, storm.flow), 'utf8').trim().replaceAll('{{BASE}}', base);
  const app = await startApp({ cmd: cfg.app, cwd: cfg.appDir, port: cfg.appPort });
  const proxy = createProxy({ target: cfg.appPort, faults: storm.faults, logFile: faultFile });
  await proxy.listen(cfg.port);
  try {
    const kane = await runKane({ objective: flow, url: base, prefix: cfg.kanePrefix, rawFile: path.join(dir, 'kane.ndjson'), onStep: ui.step, timeout: cfg.kaneTimeout });
    return { kane, flow, faults: readFaultLog(faultFile), green: kane.status === 'passed' };
  } finally {
    await proxy.close();
    stopApp(app);
  }
}

const summarize = (r, extra = {}) => ({ status: r.kane.status, green: r.green, reason: r.kane.reason, credits: r.kane.credits, seconds: r.kane.wall, fault: r.faults.map((f) => `${f.method} ${f.path} #${f.call} ${f.action}`), ...extra });

export async function runLadder(cfg, ui = {}) {
  const u = { step() {}, storm() {}, result() {}, agent() {}, phase() {}, ...ui };
  const storms = loadStorms(cfg.storms).filter((s) => !cfg.only || s.name === cfg.only);
  const out = { startedAt: new Date().toISOString(), storms: storms.map((s) => ({ name: s.name, title: s.title, expect: s.expect, baseline: null, tries: [], final: null, verify: null })) };
  const by = Object.fromEntries(out.storms.map((s) => [s.name, s]));
  const runDir = (s, label) => path.join(cfg.runDir, s.name, label);

  if (cfg.baselineFrom) { // reuse the numbers of an earlier `--no-fix` run on the naive app instead of paying for them again
    const prev = JSON.parse(fs.readFileSync(cfg.baselineFrom, 'utf8'));
    for (const s of storms) by[s.name].baseline = prev.storms.find((x) => x.name === s.name)?.tries[0] ?? null;
  } else if (cfg.baseline) {
    u.phase('baseline: the app as it is, every storm once');
    for (const s of storms) { u.storm(s, 'baseline'); const r = await runStorm(s, cfg, runDir(s, 'baseline'), u); by[s.name].baseline = summarize(r); u.result(s, 'baseline', r); }
  }

  u.phase(cfg.fix ? 'ladder: storm, Kane, agent, re-run' : 'ladder (no fixing)');
  for (const s of storms) {
    const rec = by[s.name];
    for (let n = 1; n <= (cfg.fix ? cfg.maxTries + 1 : 1); n++) {
      const dir = runDir(s, `try${n}`);
      u.storm(s, `try ${n}`);
      const r = await runStorm(s, cfg, dir, u);
      const t = summarize(r, { n });
      rec.tries.push(t);
      u.result(s, `try ${n}`, r);
      if (r.green) { rec.final = 'green'; break; }
      const ev = buildEvidence({ storm: s, kane: r.kane, faults: r.faults, flow: r.flow, tryNo: n });
      const prompt = writeEvidence(dir, ev, cfg.appDir);
      if (!cfg.fix || n > cfg.maxTries) { rec.final = 'red'; break; }
      const before = path.join(dir, 'before'), after = path.join(dir, 'after');
      snapshot(cfg.appDir, before);
      u.agent(s, 'start');
      const a = await runAgent({ prompt, cwd: cfg.appDir, agentCmd: cfg.agentCmd });
      snapshot(cfg.appDir, after);
      const d = diffDirs(before, after);
      fs.writeFileSync(path.join(dir, 'fix.patch'), d.patch);
      fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(a, null, 2));
      fs.rmSync(before, { recursive: true, force: true }); fs.rmSync(after, { recursive: true, force: true });
      t.agent = a; t.files = d.files;
      u.agent(s, 'done', a, d.files);
    }
  }

  if (cfg.final) {
    u.phase('final pass: all storms again on the fixed app');
    for (const s of storms) { u.storm(s, 'final'); const r = await runStorm(s, cfg, runDir(s, 'final'), u); by[s.name].verify = summarize(r); u.result(s, 'final', r); }
  }
  out.endedAt = new Date().toISOString();
  return out;
}
