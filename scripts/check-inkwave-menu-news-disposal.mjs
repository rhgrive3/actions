// UI-only browser acceptance. --source-root composes requested modules directly
// for diagnostics; it does NOT certify a normal build or bypass its guards.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : path.resolve(process.argv[i + 1]); };
const sourceRoot = arg('--source-root'), site = arg('--site'), output = arg('--output');
assert.ok(output && !!sourceRoot !== !!site, 'Provide --output and exactly one of --source-root / --site');
const compose = sourceRoot ? (await import(pathToFileURL(path.join(sourceRoot, 'scripts/inkwave-source-composition.mjs')))).adaptBuildSource : null;
const loaded = new Map();
const harness = `<!doctype html><meta charset="utf-8"><style>body{margin:0}#root{position:fixed;inset:0}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><div id="root"></div>
<script type="module">
import { Menus } from '/src/ui/menus.js';
import { DEFAULT_SETTINGS } from '/src/config.js';
import { installMenuQuality } from '/patches/local-quality/menu.mjs';
installMenuQuality(Menus);
window.createMenu=()=>{const root=document.createElement('div');document.getElementById('root').append(root);const m=new Menus(root,{getSettings:()=>({...DEFAULT_SETTINGS})});m.setPlatformDriven(true);m.show('settings',{wipe:false,light:false});return m;};
window.ready=true;
</script>`;
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end(harness); return; }
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const relative = pathname.slice(1), rel = relative.replace(/^inkwave-public\//, '');
    const base = site || (relative.startsWith('patches/') ? sourceRoot : path.join(sourceRoot, 'inkwave-public'));
    const file = path.resolve(base, relative.startsWith('patches/') ? relative : rel);
    if (!file.startsWith(base + path.sep)) throw Error('path');
    let data = fs.readFileSync(file);
    if (compose && rel.startsWith('src/') && rel.endsWith('.js')) data = Buffer.from(compose(rel, data.toString()));
    loaded.set(pathname, crypto.createHash('sha256').update(data).digest('hex'));
    const ext = path.extname(file);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream');
    res.end(data);
  } catch (error) { res.writeHead(404).end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture?news=force`);
  await page.waitForFunction(() => window.ready, { timeout: 10000 });
  const result = await page.evaluate(() => {
    const nativeTimeout = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
    const nativeRaf = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
    const timers = new Set(), frames = new Set();
    window.setTimeout = (fn, ms, ...args) => { const id = nativeTimeout(() => { timers.delete(id); fn(...args); }, ms); timers.add(id); return id; };
    window.clearTimeout = id => { timers.delete(id); nativeClear(id); };
    window.requestAnimationFrame = fn => { const id = nativeRaf(t => { frames.delete(id); fn(t); }); frames.add(id); return id; };
    window.cancelAnimationFrame = id => { frames.delete(id); nativeCancel(id); };
    const cases = [];
    for (const updated of [false, true]) {
      const m = window.createMenu();
      if (updated) m.update(1 / 60);
      const news = m._news;
      news.maybeShow();
      news._tween(1, () => {}, () => {});
      const timer = news._t, frame = news._raf;
      m.dispose();
      cases.push({ updated, timerRetired: !timers.has(timer), frameRetired: !frames.has(frame), preloadReleased: news._pre === null });
      // Clean the baseline's leaked work explicitly after observing it.
      news.dispose();
    }
    const m = window.createMenu(), news = m._news;
    news.show(); const el = news.el;
    m.update(1 / 60);
    const updatePreservedDialog = news.el === el && el.isConnected;
    m.dispose(); news.dispose();
    for (const id of timers) nativeClear(id);
    for (const id of frames) nativeCancel(id);
    window.setTimeout = nativeTimeout; window.clearTimeout = nativeClear;
    window.requestAnimationFrame = nativeRaf; window.cancelAnimationFrame = nativeCancel;
    return { cases, updatePreservedDialog };
  });
  const passed = result.updatePreservedDialog && result.cases.every(c => c.timerRetired && c.frameRetired && c.preloadReleased);
  const evidence = { status: passed ? 'passed' : 'failed', scope: sourceRoot ? 'Diagnostic source composition, not a successful normal build' : 'Normal build UI modules', root: sourceRoot || site, browser: browser.version(), result, errors, loaded: Object.fromEntries(loaded) };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ ...evidence, loaded: loaded.size }, null, 2));
  assert.deepEqual(errors, []); assert.equal(passed, true, 'menu/news lifecycle acceptance');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
