// Live ladder on the terminal.
const c = (n) => (s) => (process.stdout.isTTY || process.env.FORCE_COLOR ? `\x1b[${n}m${s}\x1b[0m` : s);
export const red = c(31), green = c(32), dim = c(2), bold = c(1), yellow = c(33);

export function makeUi(storms) {
  const idx = (s) => storms.findIndex((x) => x.name === s.name) + 1;
  const pad = (s, n) => String(s).padEnd(n);
  return {
    phase: (t) => console.log('\n' + bold(`== ${t}`)),
    storm: (s, label) => console.log(`\n${bold(`[${idx(s)}/${storms.length}] ${pad(s.name, 14)}`)} ${label}  ${dim(s.title || '')}`),
    step: (r) => console.log(dim(`      . ${r.slice(0, 90)}`)),
    result: (s, label, r) => {
      const mark = r.green ? green('GREEN') : red('RED  ');
      console.log(`      ${mark} ${r.kane.reason ? `"${r.kane.reason.replace(/\s+/g, ' ').slice(0, 140)}"` : r.kane.status}`);
      if (r.faults.length) console.log(yellow(`      fault: ${r.faults.map((f) => `${f.method} ${f.path} #${f.call} ${f.action}`).join(' | ')}`));
      console.log(dim(`      ${r.kane.wall.toFixed(0)} s, ${Number(r.kane.credits).toFixed(1)} credits`));
    },
    agent: (s, what, a, files) => console.log(what === 'start' ? yellow('      agent: fixing...') : yellow(`      agent: done in ${a.wall.toFixed(0)} s${a.cost != null ? `, $${a.cost.toFixed(3)}` : ''}, files: ${files.join(', ') || 'none'}${a.message ? `\n      agent says: ${a.message.slice(0, 160)}` : ''}`)),
  };
}
