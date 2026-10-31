#!/usr/bin/env node
// Isolated baseline/candidate WebGL atlas comparison; not a match FPS benchmark.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const site = path.resolve(process.argv[2] || '_site');
const out = path.resolve(process.argv[3] || '.ci-scratch/paint-transfer-probe.json');
if (!process.env.INKWAVE_PAINT_BASELINE || !process.env.INKWAVE_PAINT_EXPERIMENT)
  throw Error('Set INKWAVE_PAINT_BASELINE and INKWAVE_PAINT_EXPERIMENT to the built paint modules');
const baseline = fs.readFileSync(path.resolve(process.env.INKWAVE_PAINT_BASELINE));
const candidate = fs.readFileSync(path.resolve(process.env.INKWAVE_PAINT_EXPERIMENT));
const fixture = fs.readFileSync(new URL('./lib/inkwave-paint-transfer-fixture.mjs', import.meta.url));
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://local').pathname;
    if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (url === '/fixture') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js"}}</script>'); return;
    }
    if (url === '/fixture.mjs' || url === '/src/world/paint.js' || url === '/src/world/paint-candidate.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(url === '/fixture.mjs' ? fixture : url === '/src/world/paint.js' ? baseline : candidate); return;
    }
    const file = path.resolve(site, '.' + decodeURIComponent(url));
    if (!file.startsWith(site + path.sep) || !fs.statSync(file).isFile()) throw Error('not found');
    res.writeHead(200, { 'content-type': /\.(mjs|js)$/.test(file) ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const report = { status: 'running', errors: [], scope: 'Synthetic native paint WebGL atlas; no full match or physical FPS claim' };
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  report.chromium = await browser.version();
  report.result = await page.evaluate(async () => (await import('/fixture.mjs')).run());
  if (report.errors.length) throw Error('Page or console errors: ' + report.errors.join('; '));
  report.status = 'passed';
} catch (e) {
  report.status = 'failed'; report.errors.push(e.stack || String(e)); console.error(e);
} finally {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') process.exitCode = 1;
