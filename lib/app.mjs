// Start/stop the app under test (own process group only) and snapshot its files.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitPort(port, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise((r) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
    if (ok) return;
    await sleep(150);
  }
  throw new Error(`app did not open port ${port}`);
}

export async function startApp({ cmd, cwd, port }) {
  const p = spawn('sh', ['-c', cmd], { cwd, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), APP_PORT: String(port), DISPLAY: '' } });
  try { await waitPort(port); } catch (e) { stopApp(p); throw e; }
  return p;
}

export function stopApp(p) { try { process.kill(-p.pid, 'SIGTERM'); } catch {} }

export function snapshot(dir, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(dir, to, { recursive: true, filter: (s) => !s.includes('node_modules') });
}

// Files changed between two snapshots + unified diff text.
export function diffDirs(a, b) {
  const r = spawnSync('diff', ['-ruN', a, b], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const files = [...(r.stdout || '').matchAll(/^\+\+\+ (\S+)/gm)].map((m) => path.relative(b, m[1]));
  return { files, patch: r.stdout || '' };
}
