// The coding agent behind the loop. Default: Claude Code headless (`claude -p`), edit tools only, Sonnet.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function claudeBin() {
  for (const d of (process.env.PATH || '').split(':')) if (d && fs.existsSync(path.join(d, 'claude'))) return path.join(d, 'claude');
  return path.join(os.homedir(), '.local/bin/claude');
}

// Flags: -p headless; --tools = file tools only (no Bash, no web); acceptEdits = no prompts for edits;
// --setting-sources project + --strict-mcp-config + --disable-slash-commands = no user settings/hooks/MCP/skills;
// --no-session-persistence = leaves no session behind; --restricted = file tools confined to the app folder and
// the user's settings files are ignored. The env below also stops the global CLAUDE.md and auto-memory from loading
// (checked: without it the user's global CLAUDE.md still loaded).
export const CLAUDE_FLAGS = ['-p', '--model', 'sonnet', '--output-format', 'json', '--tools', 'Read,Edit,Write,Glob,Grep',
  '--permission-mode', 'acceptEdits', '--setting-sources', 'project', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--restricted'];

export function parseAgentJson(text) {
  try {
    const j = JSON.parse(text);
    return { message: String(j.result ?? '').slice(0, 400), cost: j.total_cost_usd ?? null, turns: j.num_turns ?? null,
      tokensIn: j.usage ? (j.usage.input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0) + (j.usage.cache_read_input_tokens || 0) : null,
      tokensOut: j.usage?.output_tokens ?? null };
  } catch { return { message: text.trim().slice(0, 400), cost: null, turns: null, tokensIn: null, tokensOut: null }; }
}

// prompt goes to stdin; cwd = the app folder. agentCmd (string) overrides the default and runs through sh -c.
export function runAgent({ prompt, cwd, agentCmd, timeoutMs = 600000 }) {
  const t0 = Date.now();
  const [bin, args] = agentCmd ? ['sh', ['-c', agentCmd]] : [claudeBin(), CLAUDE_FLAGS];
  return new Promise((resolve) => {
    const p = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, BROWNOUT_APP_DIR: cwd, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } });
    let out = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (out += c));
    const timer = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
    p.on('error', (e) => { clearTimeout(timer); resolve({ wall: 0, exitCode: -1, message: String(e) }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ wall: (Date.now() - t0) / 1000, exitCode: code, ...parseAgentJson(out) }); });
    p.stdin.end(prompt);
  });
}
