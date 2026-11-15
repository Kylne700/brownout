// Join Kane's words with the proxy's fault log for one run -> evidence.json + prompt.txt
import fs from 'node:fs';
import path from 'node:path';

export function readFaultLog(file) {
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function describeFault(f) {
  const what = {
    status: (a) => `answered with HTTP ${a} without reaching the app`,
    'drop-after-upstream': () => 'reached the app and was processed there, but the connection was closed before the browser got the answer',
    delay: (a) => `was held for ${a} ms before it reached the app`,
    body: () => 'got HTTP 200 with an HTML error page instead of the JSON the page expects',
  };
  const [k, a] = f.action.split(':');
  return `${f.method} ${f.path} call #${f.call} ${(what[k] || (() => f.action))(a)}`;
}

export function buildEvidence({ storm, kane, faults, flow, tryNo, verify = null }) {
  return {
    storm: storm.name, try: tryNo, expect: storm.expect, flow,
    kane: { status: kane.status, reason: kane.reason, summary: kane.summary, oneLiner: kane.oneLiner, reasonCode: kane.reasonCode, lastSteps: kane.steps.slice(-6) },
    faults, verify,
  };
}

export function buildPrompt(ev, appDir) {
  const saw = [ev.kane.reason, ev.kane.oneLiner].filter(Boolean).join(' ') || ev.kane.summary || (ev.kane.status === 'passed' ? 'Kane saw nothing wrong in the browser.' : 'The test run did not finish.');
  const net = ev.faults.length ? ev.faults.map(describeFault).join('\n') : 'No fault was injected before the failure.';
  return `A browser test (Kane) failed while a network fault was injected into the app.

What the user saw:
${saw}
${ev.kane.summary && ev.kane.summary !== saw ? `\nKane's longer summary: ${ev.kane.summary}\n` : ''}
What the network did (proxy fault log):
${net}

${ev.verify ? `The app's own state check (${ev.verify.ok ? 'passed' : 'FAILED'}): ${ev.verify.out}\n\n` : ''}The user journey that was run:
${ev.flow}

The rule the app must meet:
${ev.expect}

Fix the app in ${appDir}; do not edit the proxy, storms or flows. Keep the changes small and keep earlier behaviour working (a purchase with no faults must still end with the text "Order confirmed"). Reply with one short line saying what you changed.
`;
}

export function writeEvidence(dir, ev, appDir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify(ev, null, 2));
  const prompt = buildPrompt(ev, appDir);
  fs.writeFileSync(path.join(dir, 'prompt.txt'), prompt);
  return prompt;
}
