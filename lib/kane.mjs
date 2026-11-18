// Runs kane-cli and parses its NDJSON stream. Only run_end matters for the verdict.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseNdjson(text) {
  const steps = [];
  let runEnd = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.type === 'run_end') runEnd = d;
    else if (d.step !== undefined && d.status === 'done' && d.remark) steps.push(d.remark);
  }
  return { steps, runEnd };
}

export function kaneBin() {
  // own node_modules, or the sibling .bin when installed as a dependency tree (npx)
  const local = [path.join(root, 'node_modules/.bin/kane-cli'), path.join(root, '../.bin/kane-cli')].find((p) => fs.existsSync(p));
  return local || 'kane-cli';
}

// Default prefix: mullvad-exclude when the binary exists (the Kane site blocks VPN exits).
export function defaultPrefix() {
  return spawnSync('which', ['mullvad-exclude']).status === 0 ? ['mullvad-exclude'] : [];
}

// BROWNOUT_HEADED=1 opts in to a visible browser (needs DISPLAY); the default stays headless.
export const headed = (env = process.env) => env.BROWNOUT_HEADED === '1';

export function kaneArgs({ objective, url, timeout = 170, maxSteps = 25 }, env = process.env) {
  return ['run', objective, '--url', url, ...(headed(env) ? [] : ['--headless']), '--agent', '--timeout', String(timeout), '--max-steps', String(maxSteps)];
}

// Returns {status, reason, summary, oneLiner, reasonCode, credits, duration, steps, exitCode, wall}
// rawFile gets the NDJSON with test_url removed; the link goes to <rawFile>.private (gitignored runs/).
export function runKane({ objective, url, prefix = defaultPrefix(), rawFile, onStep, ...opts }) {
  const cmd = [...prefix, kaneBin()];
  const env = { ...process.env };
  if (!headed()) delete env.DISPLAY;
  const t0 = Date.now();
  return new Promise((resolve) => {
    const p = spawn(cmd[0], [...cmd.slice(1), ...kaneArgs({ objective, url, ...opts })], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', buf = '';
    p.stdout.on('data', (c) => {
      out += c; buf += c;
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) { const { steps } = parseNdjson(l); if (steps[0] && onStep) onStep(steps[0]); }
    });
    p.stderr.on('data', () => {});
    p.on('close', (code) => {
      const { steps, runEnd } = parseNdjson(out);
      if (rawFile) {
        const m = runEnd?.test_url;
        fs.writeFileSync(rawFile, out.replace(/"test_url":"[^"]*"/g, '"test_url":"[private]"'));
        if (m) fs.writeFileSync(rawFile + '.private', m + '\n');
      }
      const r = runEnd || {};
      resolve({
        status: r.status || 'error', reason: r.reason || '', summary: r.summary || '', oneLiner: r.one_liner || '',
        reasonCode: r.reason_code || '', credits: r.credits_consumed ?? 0, duration: r.duration ?? 0,
        steps, exitCode: code, wall: (Date.now() - t0) / 1000,
      });
    });
  });
}
