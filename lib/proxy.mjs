// Reverse proxy that injects deterministic faults and logs every one as NDJSON.
import http from 'node:http';
import fs from 'node:fs';

// "1-2" | "3" | "all" -> predicate on the 1-based call number
export function callMatcher(calls = 'all') {
  const s = String(calls).trim();
  if (s === 'all') return () => true;
  const m = s.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error(`bad calls spec: ${calls}`);
  const lo = +m[1], hi = m[2] ? +m[2] : lo;
  return (n) => n >= lo && n <= hi;
}

export const HTML_ERROR = '<!doctype html><title>502 Bad Gateway</title><h1>502 Bad Gateway</h1><p>The upstream server returned an error. (edge cache)</p>';

// faults: [{name, route, method, calls, action}]. Counters live per proxy instance (= per run).
export function createProxy({ target, faults = [], logFile, log }) {
  const counters = new Map();
  const rules = faults.map((f, i) => ({ ...f, key: i, match: callMatcher(f.calls), method: (f.method || 'GET').toUpperCase() }));
  const entries = [];
  const record = (rule, req, path, call) => {
    const e = { t: new Date().toISOString(), storm: rule.name, method: req.method, path, call, action: rule.action };
    entries.push(e);
    if (logFile) fs.appendFileSync(logFile, JSON.stringify(e) + '\n');
    if (log) log(e);
  };
  const forward = (req, res, onResponse) => {
    const up = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${target}` } }, (ur) => onResponse(ur));
    up.on('error', () => { res.statusCode = 502; res.end('upstream down'); });
    req.pipe(up);
  };
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    const rule = rules.find((r) => r.method === req.method && r.route === path && (counters.set(r.key, (counters.get(r.key) || 0) + 1), r.match(counters.get(r.key))));
    const pass = () => forward(req, res, (ur) => { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); });
    if (!rule) return pass();
    const call = counters.get(rule.key);
    record(rule, req, path, call);
    const [kind, arg] = rule.action.split(':');
    if (kind === 'status') { req.resume(); res.writeHead(+arg, { 'content-type': 'text/plain' }); return res.end('Service Unavailable'); }
    if (kind === 'body') { req.resume(); res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HTML_ERROR); }
    if (kind === 'delay') return setTimeout(pass, +arg);
    if (kind === 'drop-after-upstream') {
      return forward(req, res, (ur) => { ur.resume(); ur.on('end', () => req.socket.destroy()); });
    }
    throw new Error(`unknown action: ${rule.action}`);
  });
  return {
    entries,
    listen: (port) => new Promise((ok) => server.listen(port, '127.0.0.1', ok)),
    close: () => { server.closeAllConnections?.(); return new Promise((ok) => server.close(ok)); },
  };
}
