#!/usr/bin/env node
// Focused production menu/mobile DOM check, with real touch taps in Chromium and WebKit.
// This does not attest a deployed commit or replace real iOS device verification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { adaptTouchLayout, touchLayoutIdentity } from '../patches/touch-layout/adapter.mjs';

const option = name => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
const repo = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(option('--site') || path.join(repo, 'inkwave-public'));
const built = !!option('--site');
const evidence = path.resolve(option('--evidence-dir') || '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-touch-layout-20261002');
const cache = path.resolve(option('--profile-dir') || '/mnt/workspace/.dev-state/agent-work/cache/inkwave-touch-layout-20261002');
const physical = p => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
for (const dir of [evidence, cache]) { assert(physical(dir).startsWith('/mnt/workspace/'), 'Persistent workspace required'); fs.mkdirSync(dir, { recursive: true }); }
const { chromium, webkit, devices } = createRequire(import.meta.url)('playwright');
const fixture = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css">
<style>html,body{margin:0;overflow:hidden;background:#0d1020;touch-action:none}#ui-root{position:fixed;inset:0}</style>
<div id="ui-root"></div><canvas id="game"></canvas><script type="module">
import { MobileInput } from '/src/core/mobile.js'; import { Menus } from '/src/ui/menus.js'; import { DEFAULT_SETTINGS } from '/src/config.js';
window.mobile=new MobileInput(document.getElementById('game'),{lastDevice:'touch'});
window.settings={...DEFAULT_SETTINGS};
window.menus=new Menus(document.getElementById('ui-root'),{getSettings:()=>settings,setSetting:(k,v)=>settings[k]=v,editTouchLayout:()=>mobile.openEditor()});
menus.show('settings',{wipe:false,light:false}); window.ready=true;
</script></html>`;
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const receipts = {};
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/__layout') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(fixture); return; }
    const rel = decodeURIComponent(url.pathname).slice(1), file = path.resolve(source, rel);
    assert(file.startsWith(source + path.sep));
    let data = fs.readFileSync(file);
    if (!built && /\.(js|css)$/.test(rel)) data = Buffer.from(adaptTouchLayout(rel, data.toString('utf8')));
    receipts[rel] = crypto.createHash('sha256').update(data).digest('hex');
    response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); response.end(data);
  } catch { response.writeHead(404); response.end('Missing'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}/__layout?news=0`;
const report = { kind: 'production-touch-layout-dom', source, built, realDeviceVerified: false, touchLayout: touchLayoutIdentity(), cases: [], errors: [] };
if (built) {
  const identity = JSON.parse(fs.readFileSync(path.join(source, 'inkwave-build.json'), 'utf8'));
  assert.deepEqual(identity.build.touchLayout, report.touchLayout, 'Built editor matches tested source');
  for (const [file, hash] of Object.entries(report.touchLayout)) assert.equal(identity.files['touch-layout/' + file], hash, 'Editor participates in exact-source verification');
  report.contentHash = identity.contentHash;
}
const engines = option('--engine') ? [option('--engine')] : ['chromium', 'webkit'];
const configs = [
  ['phone-landscape', { ...devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 } }],
  ['tablet-landscape', { ...devices['iPad Mini landscape'], viewport: { width: 1024, height: 768 } }],
  ['small-phone-portrait', { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } }],
];
const box = (page, id) => page.evaluate(id => mobile._box(id), id);
const pointer = async (page, type, id, x, y) => page.evaluate(({ type, id, x, y }) => {
  const el = document.elementFromPoint(x, y) || mobile.root;
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y }));
}, { type, id, x, y });
try {
  for (const engineName of engines) {
    const engine = { chromium, webkit }[engineName]; assert(engine, 'Unknown browser');
    for (const [name, config] of configs) {
      const browserDir = path.join(cache, engineName, name); fs.mkdirSync(path.join(browserDir, 'artifacts'), { recursive: true });
      const context = await engine.launchPersistentContext(path.join(browserDir, 'profile'), { ...config, headless: true, reducedMotion: 'reduce',
        artifactsDir: path.join(browserDir, 'artifacts'), downloadsPath: path.join(browserDir, 'downloads'),
        ...(engineName === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}) });
      const entry = { engine: engineName, name, viewport: config.viewport, checks: [] }; report.cases.push(entry);
      const page = context.pages()[0] || await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => report.errors.push(`${engineName}/${name}: ${error.message}`));
      try {
        await page.goto(address); await page.waitForFunction(() => window.ready);
        await page.evaluate(() => { localStorage.removeItem('inkwave.touchLayout'); mobile.layout = {}; mobile._layoutAll(); });
        const firstRow = await page.locator('.iw-row').first().evaluate(el => el._key);
        assert.equal(firstRow, '_layout', 'Layout editing must be the first touch setting');
        await page.locator('.iw-row').first().tap();
        assert(await page.evaluate(() => mobile.editing));
        assert.equal(await page.locator('.iwm-layout-control option').count(), 9);
        entry.checks.push('settings-entry-and-nine-controls');
        const bars = await page.locator('.iwm-edit__bar, .iwm-edit__sel').evaluateAll(els => els.map(el => {
          const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, w: innerWidth, h: innerHeight };
        }));
        for (const r of bars) assert(r.x >= 0 && r.right <= r.w + 1 && r.y >= 0 && r.bottom <= r.h + 1, 'Editor bars fit viewport');
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}.png`) });
        entry.checks.push('responsive-editor');
        // Native selector/range taps work without sending gameplay actions.
        await page.locator('.iwm-layout-control').selectOption('jump');
        const sizeTrack = await page.locator('.iwm-edit__size').boundingBox();
        await page.touchscreen.tap(sizeTrack.x + sizeTrack.width * .8, sizeTrack.y + sizeTrack.height / 2);
        assert(await page.evaluate(() => mobile._cfg('jump').s > 1), 'Size slider responds to real touch');
        await page.locator('.iwm-edit__size').focus(); await page.keyboard.press('End');
        assert.equal(await page.evaluate(() => mobile._cfg('jump').s), 1.7);
        await page.locator('[data-e="one"]').tap();
        assert.equal(await page.evaluate(() => mobile._cfg('jump').s), 1);
        assert.deepEqual(await page.evaluate(() => [...mobile.pressed]), []);
        entry.checks.push('individual-resize-reset-and-input-isolation');
        // Coordinate ranges recover controls even if placed underneath the edit panels.
        await page.locator('.iwm-layout-position summary').tap();
        const xRange = page.locator('[data-axis="x"]'); await xRange.focus(); await page.keyboard.press('End');
        const right = await box(page, 'jump'); assert(right.x > config.viewport.width * .7);
        await page.locator('.iwm-layout-position summary').tap();
        entry.checks.push('precise-position');
        if (name !== 'small-phone-portrait') {
          for (const [id, dx, dy] of [['fire', -160, -70], ['jump', -100, -50], ['stick', 120, -80]]) {
            // Reset this control first so every case starts from a known visible position.
            await page.locator('.iwm-layout-control').selectOption(id); await page.locator('[data-e="one"]').tap();
            const start = await box(page, id);
            await pointer(page, 'pointerdown', 41, start.x, start.y);
            await pointer(page, 'pointermove', 41, start.x + dx, start.y + dy);
            await pointer(page, 'pointerup', 41, start.x + dx, start.y + dy);
            const end = await box(page, id);
            assert(Math.hypot(end.x - start.x, end.y - start.y) > 30, `${id} moves with drag`);
          }
          entry.checks.push('fire-jump-stick-drag');
        }
        // Two touch pointers resize the selected button. Cancellation leaves no stale gesture.
        await page.locator('.iwm-layout-control').selectOption('fire');
        const scale = await page.evaluate(() => mobile._cfg('fire').s);
        await pointer(page, 'pointerdown', 51, 25, config.viewport.height / 2);
        await pointer(page, 'pointerdown', 52, 65, config.viewport.height / 2);
        await pointer(page, 'pointermove', 52, 85, config.viewport.height / 2);
        await pointer(page, 'pointercancel', 51, 25, config.viewport.height / 2);
        await pointer(page, 'pointerup', 52, 85, config.viewport.height / 2);
        assert(await page.evaluate(s => mobile._cfg('fire').s > s, scale));
        entry.checks.push('pinch-and-cancel');
        const draft = await page.evaluate(() => mobile.layout);
        await page.locator('[data-e="save"]').tap();
        assert.equal(await page.evaluate(() => mobile.editing), false, 'Real touch save closes editor');
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('inkwave.touchLayout'))), draft);
        await page.reload(); await page.waitForFunction(() => window.ready);
        assert.deepEqual(await page.evaluate(() => mobile.layout), draft);
        await page.locator('.iw-row').first().tap();
        await page.locator('[data-e="reset"]').tap();
        await page.locator('[data-e="cancel"]').tap();
        assert.deepEqual(await page.evaluate(() => mobile.layout), draft);
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('inkwave.touchLayout'))), draft);
        entry.checks.push('touch-save-reload-cancel');
        await page.locator('.iw-row').first().tap();
        await page.evaluate(() => {
          window.restoreStorage = Storage.prototype.setItem;
          Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
        });
        await page.locator('[data-e="save"]').tap();
        assert.equal(await page.evaluate(() => mobile.editing), true);
        assert(await page.locator('.iwm-layout-error').textContent());
        await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
        await page.locator('[data-e="cancel"]').tap();
        entry.checks.push('storage-failure-retains-draft');
        // Relocate the floating stick to the right, then exercise gameplay routing there.
        if (name === 'small-phone-portrait') await page.setViewportSize({ width: 568, height: 320 });
        await page.evaluate(() => { mobile.openEditor(); mobile._layoutPosition('stick', innerWidth * .65, innerHeight * .25); mobile._closeEditor(true); mobile.setVisible(true); });
        const moved = await box(page, 'stick');
        assert.equal(await page.evaluate(({ x, y }) => mobile._hitButton(x, y), moved), null, 'Stick test must avoid overlapping action buttons');
        await pointer(page, 'pointerdown', 71, moved.x, moved.y);
        await pointer(page, 'pointermove', 71, moved.x + 30, moved.y);
        assert(await page.evaluate(() => mobile.moveX > .2), 'Moved floating stick controls movement');
        await pointer(page, 'pointerup', 71, moved.x + 30, moved.y);
        assert.equal(await page.evaluate(() => mobile.moveX), 0);
        await page.evaluate(() => { mobile.s.stickMode = 'fixed'; });
        await pointer(page, 'pointerdown', 72, moved.x + 30, moved.y);
        assert(await page.evaluate(() => mobile.moveX > .2), 'Moved fixed stick controls movement');
        await pointer(page, 'pointercancel', 72, moved.x + 30, moved.y);
        assert.equal(await page.evaluate(() => mobile.moveX), 0);
        entry.checks.push('moved-stick-gameplay-routing');
        await page.evaluate(() => mobile.openEditor());
        const beforeRotation = page.viewportSize();
        await pointer(page, 'pointerdown', 81, beforeRotation.width * .45, beforeRotation.height * .4);
        assert.equal(await page.evaluate(() => mobile._edit?.pts.size), 1);
        await page.setViewportSize({ width: beforeRotation.height, height: beforeRotation.width });
        await page.waitForFunction(() => mobile._edit === null && mobile._H === Math.max(300, Math.min(460, Math.min(innerWidth, innerHeight))));
        const bounds = await page.evaluate(() => Object.keys(mobile.els).map(id => ({ id, ...mobile._box(id), w: innerWidth, h: innerHeight })));
        for (const b of bounds) assert(b.x - b.d / 2 >= 0 && b.x + b.d / 2 <= b.w + 1 && b.y - b.d / 2 >= 0 && b.y + b.d / 2 <= b.h + 1, `${b.id} survives rotation`);
        assert.equal(await page.evaluate(() => mobile._edit), null);
        await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => mobile.editing), false);
        entry.checks.push('rotation-bounds-and-escape');
        // Corrupt stored layouts cannot create NaN or off-screen controls.
        await page.evaluate(() => localStorage.setItem('inkwave.touchLayout', '{"fire":{"dx":"bad","dy":99999,"s":-50}}'));
        await page.reload(); await page.waitForFunction(() => window.ready);
        const valid = await box(page, 'fire'); assert(Number.isFinite(valid.x) && Number.isFinite(valid.y) && valid.d > 0);
        entry.checks.push('invalid-storage-recovery');
        entry.status = 'passed';
      } catch (error) {
        entry.status = 'failed'; report.errors.push(`${engineName}/${name}: ${error.stack}`);
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}-failure.png`) }).catch(() => {});
      } finally { await context.close(); }
    }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
report.loadedHashes = receipts;
report.status = report.errors.length ? 'failed' : 'passed';
const destination = path.join(evidence, 'touch-layout-result.json');
fs.writeFileSync(destination + '.writing', JSON.stringify(report, null, 2)); fs.renameSync(destination + '.writing', destination);
console.log(JSON.stringify({ status: report.status, cases: report.cases.map(c => ({ engine: c.engine, name: c.name, status: c.status, checks: c.checks.length })), errors: report.errors, evidence: destination }));
if (report.errors.length) process.exitCode = 1;
