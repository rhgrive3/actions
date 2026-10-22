import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = path.resolve(process.argv[2] || 'work/extended-fixes/site');
const output = path.resolve(process.argv[3] || 'work/extended-fixes/browser.json');
const tests = ['special-multistorey-support', 'special-held-input-cancel', 'support-sensor-epochs', 'support-sampled-position'];
const harnessPath = fileURLToPath(new URL('./browser-harness.mjs', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const sourceHashes = {};
const hash = value => createHash('sha256').update(value).digest('hex');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><canvas id="canvas"></canvas><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>'); return; }
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (pathname === '/__harness.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(harnessPath)); return; }
  const stem = pathname.match(/^\/__tests\/([a-z-]+)\.mjs$/)?.[1];
  if (stem && tests.includes(stem)) {
    const file = 'patches/splatoon3/tests/' + stem + '.test.mjs', original = fs.readFileSync(path.join(root, file), 'utf8');
    sourceHashes[file] = hash(original);
    // Only substitute the Node runner/assert import and VM fixture boot. Keep
    // every callback, controlled state, negative control and assertion intact.
    const code = original.replace(/import (?:test|assert) from 'node:[^']+';/g, '')
      .replace("import { fixture } from './source-fixture.mjs';", "import { fixture, test, assert } from '/__harness.mjs';")
      .replace("'../../local-quality/platform-input.mjs'", "'/patches/local-quality/platform-input.mjs'");
    res.setHeader('Content-Type', 'text/javascript'); res.end(code); return;
  }
  const file = path.resolve(site, '.' + pathname);
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', /\.(mjs|js)$/.test(file) ? 'text/javascript' : 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser; const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ hasTouch: true, viewport: { width: 1000, height: 700 } });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + server.address().port);
  const rows = await page.evaluate(async tests => {
    const harness = await import('/__harness.mjs');
    for (const stem of tests) { await import('/__tests/' + stem + '.mjs'); await harness.run(); }
    return [...await harness.run(), ...await harness.runControls()];
  }, tests);
  assert.equal(rows.length, 149); assert.deepEqual(errors, []);
  const record = { status: 'passed', browser: browser.version(), cases: rows.length,
    scope: 'Actual minified production modules in native Chromium: 95 controlled Actor/Level/Physics/Projectiles/NetMatch cases plus 54 native Input/MobileInput/PlayerController DOM cancellation cases. Button admission uses MobileInput._press and synthetic pointercancel/lostpointercapture dispatched through real DOM handlers. Dummy Character and frozen integration; no full rendered game, real relay, physical touch or Nintendo hardware parity claim.',
    inputHash: manifest.inputHash, contentHash: manifest.contentHash, sourceHashes, harnessSha256: hash(fs.readFileSync(harnessPath)), rows, errors };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', cases: rows.length, browser: browser.version(), contentHash: manifest.contentHash }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
