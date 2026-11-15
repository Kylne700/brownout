// REPORT.md + report.html (static, no JS) from the ladder result.
import fs from 'node:fs';
import path from 'node:path';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const mark = (r) => (r ? (r.green ? 'green' : 'RED') : '-');

export function totals(res) {
  const S = res.storms;
  const all = [...S.flatMap((s) => [s.baseline, ...s.tries, s.verify]).filter(Boolean)];
  const agents = S.flatMap((s) => s.tries.map((t) => t.agent).filter(Boolean));
  const cost = agents.reduce((a, x) => a + (x.cost || 0), 0);
  return {
    total: S.length,
    naive: S.filter((s) => s.baseline?.green).length,
    hasBaseline: S.some((s) => s.baseline),
    fixed: S.filter((s) => (s.verify ? s.verify.green : s.final === 'green')).length,
    bugs: S.filter((s) => s.tries.some((t) => !t.green) || (s.baseline && !s.baseline.green)).length,
    loops: agents.length,
    credits: +all.reduce((a, r) => a + (r.credits || 0), 0).toFixed(1),
    minutes: +((new Date(res.endedAt) - new Date(res.startedAt)) / 60000).toFixed(1),
    agentCost: +cost.toFixed(3),
    agentSeconds: +agents.reduce((a, x) => a + (x.wall || 0), 0).toFixed(0),
  };
}

function row(s) {
  const tries = s.tries.map((t) => `${t.n}:${mark(t)}`).join(' -> ');
  const first = s.baseline || s.tries[0];
  const files = [...new Set(s.tries.flatMap((t) => t.files || []))].join(', ') || '-';
  const credits = [s.baseline, ...s.tries, s.verify].filter(Boolean).reduce((a, r) => a + (r.credits || 0), 0).toFixed(1);
  const secs = [s.baseline, ...s.tries, s.verify].filter(Boolean).reduce((a, r) => a + (r.seconds || 0), 0).toFixed(0);
  return { name: s.name, naive: mark(s.baseline), tries, kane: (first?.reason || '').replace(/\s+/g, ' '), fault: (first?.fault || []).join('; ') || '-', files, final: mark(s.verify) !== '-' ? mark(s.verify) : (s.final || '-'), credits, secs };
}

export function writeReport(res, dir) {
  const t = totals(res), rows = res.storms.map(row);
  const head = `Storms survived: ${t.hasBaseline ? `${t.naive}/${t.total} naive -> ` : ''}${t.fixed}/${t.total} fixed. Bugs caught: ${t.bugs}. Agent loops: ${t.loops}. Kane credits: ${t.credits}. Minutes: ${t.minutes}.`;
  const md = [`# BROWNOUT report`, '', head, `Agent: Claude Code (headless). Agent cost: $${t.agentCost} over ${t.agentSeconds} s.`, '',
    '| Storm | Naive | Tries | Final | Kane said | Fault | Files changed | Credits | Sec |', '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.naive} | ${r.tries} | ${r.final} | ${r.kane.replace(/\|/g, '/')} | ${r.fault} | ${r.files} | ${r.credits} | ${r.secs} |`), ''].join('\n');
  fs.writeFileSync(path.join(dir, 'REPORT.md'), md);
  const cell = (v, c) => `<td class="${c || ''}">${esc(v)}</td>`;
  const cls = (v) => (v === 'green' ? 'g' : v === 'RED' || v === 'red' ? 'r' : '');
  const html = `<!doctype html><meta charset=utf-8><title>BROWNOUT report</title><style>body{font:15px system-ui;margin:2rem;background:#101418;color:#e8e6e1}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:6px 8px;vertical-align:top;text-align:left}.g{color:#5fd38d;font-weight:700}.r{color:#ff6b5e;font-weight:700}h1{margin:0}</style>
<h1>BROWNOUT</h1><p>${esc(head)}</p><p>Agent: Claude Code (headless). Agent cost: $${t.agentCost} over ${t.agentSeconds} s.</p>
<table><tr><th>Storm<th>Naive<th>Tries<th>Final<th>Kane said<th>Fault<th>Files changed<th>Credits<th>Sec</tr>
${rows.map((r) => `<tr>${cell(r.name)}${cell(r.naive, cls(r.naive))}${cell(r.tries)}${cell(r.final, cls(r.final))}${cell(r.kane)}${cell(r.fault)}${cell(r.files)}${cell(r.credits)}${cell(r.secs)}</tr>`).join('\n')}</table>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html);
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(res, null, 2));
  return { md, totals: t };
}
