// Native DOM check of emitted localization modules. No game/GPU/retail claim.
// node scripts/check-inkwave-ui-literals-browser.mjs _site [baseline-site]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const roots = { candidate: path.resolve(process.argv[2] || '_site') };
if (process.argv[3]) roots.baseline = path.resolve(process.argv[3]);
for (const root of Object.values(roots)) assert.ok(fs.existsSync(path.join(root, 'inkwave-build.json')), 'built site required');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const [, lane, ...parts] = url.pathname.split('/');
  const root = roots[lane];
  const rel = parts.join('/');
  if (!root) { res.writeHead(404).end(); return; }
  if (rel === 'probe.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/jsm/"}}</script><body>');
    return;
  }
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const type = /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
  const receipts = [];
  for (const lane of Object.keys(roots)) for (const lang of ['ja', 'en']) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const origin = `http://127.0.0.1:${server.address().port}/${lane}/`;
      await page.goto(origin + 'probe.html');
      await page.evaluate(lang => localStorage.setItem('inkwave.settings', JSON.stringify({ lang })), lang);
      const rows = await page.evaluate(async () => {
        const { t, tx, tu, setTextMode, LANG } = await import('./src/i18n.js');
        const { h } = await import('./src/ui/ui-util.js');
        const values = [...Object.getOwnPropertyNames(Object.prototype), '<img src=x onerror="window.literalExecuted=true">'];
        const rows = [];
        for (const mode of ['kbm', 'pad', 'touch']) {
          setTextMode(mode);
          const failures = [];
          for (const value of values) {
            try {
              const child = h('span', null, value);
              const props = h('span', { text: value, title: value });
              document.body.append(child, props);
              if ([t(value, { n: 1 }), tx(value), tu(value), child.textContent, props.textContent, props.title].some(text => text !== value)) failures.push(value);
              child.remove(); props.remove();
            } catch (error) { failures.push(value + ': ' + error); }
          }
          if (h('span', null, 'Back').textContent !== (LANG === 'ja' ? 'もどる' : 'Back')) throw Error('authored translation changed');
          if (window.literalExecuted || document.querySelector('img')) throw Error('literal became executable markup');
          rows.push({ lang: LANG, mode, values: values.length, failures });
        }
        return rows;
      });
      for (const row of rows) {
        if (lane === 'candidate') assert.deepEqual(row.failures, [], JSON.stringify(row));
        else assert.ok(row.failures.length > 0, 'baseline must reproduce the name collision');
        receipts.push({ lane, ...row });
      }
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ browser: browser.version(), measurement: 'emitted modules and native DOM; no game/GPU claim', receipts }, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
