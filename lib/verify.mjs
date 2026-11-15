// Ground truth beside Kane: run the storm's `verify` shell command while the app is still up.
// Exit 0 = the app state is right. The command gets BROWNOUT_APP_URL (the app itself, no proxy) and BROWNOUT_STORM.
import { spawnSync } from 'node:child_process';

export function runVerify(storm, { appPort, cwd, timeoutMs = 20000 }) {
  if (!storm.verify) return null;
  const r = spawnSync('sh', ['-c', storm.verify], { cwd, encoding: 'utf8', timeout: timeoutMs,
    env: { ...process.env, BROWNOUT_APP_URL: `http://127.0.0.1:${appPort}`, BROWNOUT_STORM: storm.name } });
  const out = `${r.stdout || ''}${r.stderr || ''}`.replace(/\s+/g, ' ').trim().slice(0, 300);
  return { ok: r.status === 0, code: r.status, out: out || (r.error ? String(r.error.message) : '') };
}

// A storm is green only when Kane passed and (if a verify command exists) the app state agrees.
export function join(kanePassed, verify) {
  const green = kanePassed && (!verify || verify.ok);
  const disagree = !!verify && kanePassed !== verify.ok;
  return { green, disagree };
}
