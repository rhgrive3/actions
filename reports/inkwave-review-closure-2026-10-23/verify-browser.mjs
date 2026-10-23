import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = path.resolve(process.argv[2] || 'work/review-closure/site');
const output = path.resolve(process.argv[3] || 'work/review-closure/browser.json');
const tests = ['special-multistorey-support', 'special-held-input-cancel', 'support-sensor-epochs', 'support-sampled-position',
  'support-owner-era-review', 'ink-vac-replica-lifecycle-review', 'catalogue-sub-life-order-review',
  'autobomb-target-life-review', 'catalogue-replica-handoff-review'];
const bootstrapTest = 'bootstrap-replica-retirement-review';
const harnessPath = fileURLToPath(new URL('./browser-harness.mjs', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const sourceHashes = {};
const hash = value => createHash('sha256').update(value).digest('hex');
const bootstrapSource = fs.readFileSync(path.join(root, 'patches/splatoon3/bootstrap.mjs'), 'utf8');
const harnessSource = fs.readFileSync(harnessPath, 'utf8');
const installerCalls = code => [...code.matchAll(/\b(install\w+)\(/g)].map(match => match[1]);
const bootstrapInstallers = installerCalls(bootstrapSource.slice(bootstrapSource.indexOf('const context = install(profile);')));
const harnessInstallers = installerCalls(harnessSource.slice(harnessSource.indexOf("if (new URLSearchParams"), harnessSource.indexOf('G.teamColors')));
assert.equal(bootstrapInstallers.length, 10, 'review every post-install bootstrap installer');
assert.deepEqual(harnessInstallers, bootstrapInstallers, 'browser fixture follows the actual complete bootstrap order');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><canvas id="canvas"></canvas><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>'); return; }
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (pathname === '/__harness.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(harnessPath)); return; }
  const stem = pathname.match(/^\/__tests\/([a-z-]+)\.mjs$/)?.[1];
  if (stem && [...tests, bootstrapTest].includes(stem)) {
    const file = 'patches/splatoon3/tests/' + stem + '.test.mjs', original = fs.readFileSync(path.join(root, file), 'utf8');
    sourceHashes[file] = hash(original);
    // Only substitute the Node runner/assert import and VM fixture boot. Keep
    // every callback, controlled state, negative control and assertion intact.
    const code = original.replace(/import (?:test|assert) from 'node:[^']+';/g, '')
      .replace("import { fixture } from './source-fixture.mjs';", "import { fixture, test, assert } from '/__harness.mjs';")
      .replace("import { specialEvidenceFixture } from './special-evidence-fixture.mjs';", "import { fixture as specialEvidenceFixture, test, assert } from '/__harness.mjs';")
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
  assert.equal(rows.length, 244);
  const bootstrap = await browser.newPage({ hasTouch: true, viewport: { width: 1000, height: 700 } });
  bootstrap.on('pageerror', e => errors.push(String(e)));
  await bootstrap.goto('http://127.0.0.1:' + server.address().port + '/?bootstrap=1');
  const completeRows = await bootstrap.evaluate(async stem => {
    const harness = await import('/__harness.mjs'); await import('/__tests/' + stem + '.mjs');
    return harness.run();
  }, bootstrapTest);
  assert.equal(completeRows.length, 21); rows.push(...completeRows);
  assert.equal(rows.length, 265); assert.deepEqual(errors, []);
  const record = { status: 'passed', browser: browser.version(), cases: rows.length,
    scope: 'Actual minified modules: 190 runtime cases and 54 native DOM Input/Controller cases in one realm; 21 intro/playing/finish disconnect cases in a fresh realm with every bootstrap installer in source order. Dummy Character/frozen ordinary integration, controlled JSON transport and synthetic pointer events; no ordinary rendered Game, real relay, physical touch or Nintendo hardware claim.',
    inputHash: manifest.inputHash, contentHash: manifest.contentHash, sourceHashes,
    bootstrapInstallers, bootstrapSha256: hash(bootstrapSource), harnessSha256: hash(fs.readFileSync(harnessPath)), rows, errors };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', cases: rows.length, browser: browser.version(), contentHash: manifest.contentHash }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
