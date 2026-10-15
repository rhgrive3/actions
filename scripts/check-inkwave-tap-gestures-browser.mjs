// Focused Chromium input check against the actual emitted Input/MobileInput.
// No Game/renderer is booted. Permission callbacks and navigator pads are spies;
// CDP touch events traverse the native DOM listeners and capture/fallback paths.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const option = name => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw Error('Required ' + name); return path.resolve(process.argv[i + 1]); };
const site = option('--site'), evidence = option('--evidence-dir');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css">
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
</head><body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas>
<script type="module">
import {Input} from '/src/core/input.js'; import {G} from '/src/core/ctx.js';
G.mode='match';G.match={state:'playing',paused:false,attract:false};
const input=new Input(document.querySelector('canvas')),m=input.mobile,counts={pause:0,gyro:0};
m.onPause=()=>counts.pause++;m._toggleGyroFromTap=()=>counts.gyro++;
input.lastDevice='touch';m.setVisible(true);
const trusted=[];document.addEventListener('pointerdown',e=>trusted.push(e.isTrusted),true);
globalThis.probe={input,m,counts,trusted};
</script></body></html>`;
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
  try {
    const key = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1), file = path.resolve(site, key);
    if (!file.startsWith(site + path.sep) || !Object.hasOwn(manifest.artifacts, key)) throw Error('Unlisted artifact');
    const data = fs.readFileSync(file); assert.equal(hash(data), manifest.artifacts[key]);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => globalThis.probe?.m?.root);
  const cdp = await context.newCDPSession(page), cases = [];
  const touch = async (type, point) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [] });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const prepare = async id => page.evaluate(id => {
    const { input, m, counts } = probe; m.reset(); input.lastDevice = 'touch'; m.setVisible(true);
    counts.pause = counts.gyro = 0; const b = m._box(id); return { x: b.x, y: b.y };
  }, id);
  const state = () => page.evaluate(() => ({ ...probe.counts, map: probe.m.mapOpen, owner: probe.input.lastDevice, contacts: probe.m._ptr.size }));
  for (const id of ['map', 'pause', 'gyro']) {
    const p = await prepare(id), delta = p.x > 500 ? -60 : 60;
    await touch('touchStart', p); await touch('touchMove', { x: p.x + delta, y: p.y });
    await touch('touchMove', p); await touch('touchEnd');
    let s = await state(); assert.equal(s.map, false, id); assert.equal(s.pause, 0, id); assert.equal(s.gyro, 0, id);
    await touch('touchStart', p); await touch('touchEnd'); s = await state();
    assert.equal(id === 'map' ? s.map : s[id], id === 'map' ? true : 1, id + ' fresh tap');
    cases.push(id + ': out-and-back cancelled, fresh tap accepted');
  }
  let p = await prepare('gyro'); await touch('touchStart', p);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ index: 0, id: 'probe-pad', mapping: 'standard', connected: true,
      axes: [.6, 0, .6, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }] });
    for (let i = 0; i < 120; i++) probe.input.pollPad();
  });
  assert.equal((await state()).owner, 'touch');
  await touch('touchEnd'); await page.evaluate(() => probe.input.pollPad());
  assert.equal((await state()).owner, 'pad'); cases.push('GYRO keeps touch ownership through 120 held-pad polls');
  await page.evaluate(() => { delete navigator.getGamepads; });
  p = await prepare('gyro');
  await page.evaluate(() => { probe.m.root.style.visibility = 'hidden'; probe.m.root.setPointerCapture = () => { throw Error('capture unavailable'); }; });
  await touch('touchStart', p); await touch('touchMove', p); await touch('touchEnd');
  let s = await state(); assert.equal(s.gyro, 1); assert.equal(s.contacts, 0);
  await touch('touchStart', p); await touch('touchCancel');
  s = await state(); assert.equal(s.gyro, 1); assert.equal(s.contacts, 0);
  cases.push('canvas capture fallback delivers GYRO up/cancel exactly once');
  assert.deepEqual(errors, []);
  const trusted = await page.evaluate(() => probe.trusted);
  assert.equal(trusted.length, 9, 'each of the nine gestures must enter the native browser router once');
  assert(trusted.every(Boolean), 'touch events must be trusted native browser events');
  await page.evaluate(() => { probe.m.root.style.visibility = ''; });
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, 'touch-controls.png') });
  const result = { status: 'passed', browser: browser.version(), contentHash: manifest.contentHash,
    scope: 'focused native DOM touch routing; mocked pad/permission callback, no full-game or hardware acceptance', cases, trustedPointerDowns: trusted.length, errors };
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2)); await context.close();
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
