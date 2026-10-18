// Browser regression for the production-composed settings screen, isolated from
// the 3D match. This verifies DOM/input behavior, not retail-device equivalence.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg = name => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw new Error('Required ' + name); return path.resolve(process.argv[i + 1]); };
const site = arg('--site'), evidence = arg('--evidence-dir');
fs.mkdirSync(evidence, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const harness = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles/ui.css"><link rel="stylesheet" href="styles/mobile.css"><style>html,body{margin:0;height:100%;overflow:hidden;background:#0d1020}#ui-root{position:fixed;inset:0}</style><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/jsm/"}}</script><div id="ui-root"></div><script type="module">
import {Menus} from './src/ui/menus.js';
import {DEFAULT_SETTINGS} from './src/config.js';
import {installMenuQuality} from './patches/local-quality/menu.mjs';
installMenuQuality(Menus);
let settings={...DEFAULT_SETTINGS},reads=0,writes=[];
const api={getSettings(){reads++;return {...settings}},setSettings(p){Object.assign(settings,p);writes.push(p)}};
window.testUI={get reads(){return reads},get writes(){return writes},get settings(){return settings},api};
const m=window.menu=new Menus(document.getElementById('ui-root'),api);m.setPlatformDriven(true);m.show('settings',{wipe:false,light:false});
window.ready=true;
</script></html>`;
const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__settings.html') { res.setHeader('content-type', 'text/html'); res.end(harness); return; }
    const file = path.resolve(site, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(site + path.sep) || !fs.statSync(file).isFile()) throw new Error('Missing');
    res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [], errors = [];
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/__settings.html`);
    await page.waitForFunction(() => window.ready);
    await page.waitForTimeout(200);
    const result = await page.evaluate(async () => {
      const m = window.menu, ui = window.testUI;
      const check = (v, message) => { if (!v) throw new Error(message); };
      const row = key => m._scr.el.querySelector('[data-id="set-' + key + '"]');
      check(row('sensitivity'), 'mouse row initially present');
      m._setFocus(row('sensitivity')); m.setInputMode('touch');
      check(!row('sensitivity'), 'mouse row hidden immediately on touch');
      check(m._focus?.isConnected, 'removed row does not retain focus');
      m.setInputMode('pad'); check(row('sensitivity'), 'mouse row returns on controller');
      const first = row('sensitivity'); m.setInputMode('kbm');
      check(row('sensitivity') === first, 'equivalent row policy does not rebuild');
      const audio = m._scr.el.querySelector('[data-id="tab-audio"]'); m._binds.get(audio).accept();
      m._setFocus(row('master')); m.refreshSetting('master');
      let before = ui.reads; m.refreshSetting('master');
      check(ui.reads - before === 1, 'focused refresh takes one settings snapshot');
      before = ui.reads; m._setSetting('master', 0.25);
      check(ui.reads - before === 1, 'setting and preview update take one settings snapshot');
      check(m._scr.el.querySelector('.iw-prev__val').textContent === '25%', 'live preview updated');
      const reset = m._scr.el.querySelector('[data-id="reset"]');
      m._binds.get(reset).accept(); m._binds.get(reset).accept();
      check(m._scr.el.querySelector('.iw-prev__val').textContent === Math.round(ui.settings.master * 100) + '%', 'reset updates active preview');
      // Instrument only the list geometry. Cursor geometry remains live by design.
      m._setFocus(null); // Isolate list-edge work from the deliberately live selection ring.
      const rows = m._scr.el.querySelector('.iw-rows'); let reads = 0;
      for (const key of ['scrollHeight', 'clientHeight', 'scrollTop']) {
        let owner = rows; while (owner && !Object.getOwnPropertyDescriptor(owner, key)) owner = Object.getPrototypeOf(owner);
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        Object.defineProperty(rows, key, { configurable: true, get() { reads++; return descriptor.get.call(this); }, ...(descriptor.set ? { set(v) { descriptor.set.call(this, v); } } : {}) });
      }
      await new Promise(resolve => requestAnimationFrame(resolve)); m.update(1 / 60); reads = 0;
      for (let i = 0; i < 120; i++) m.update(1 / 60);
      check(reads === 0, 'stable settings list performs no per-frame scroll geometry reads');
      rows.dispatchEvent(new Event('scroll')); m.update(1 / 60);
      check(reads === 3, 'scroll invalidation takes one geometry snapshot');
      const scrollGeometryReads = reads;
      const track = row('master').querySelector('.iw-slider__track');
      track.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, button: 0, clientX: track.getBoundingClientRect().left + 10, bubbles: true }));
      check(track.parentElement.classList.contains('is-drag'), 'drag begins');
      check(m._focus === row('master'), 'pressing the track focuses its row before preview update');
      m._binds.get(m._scr.el.querySelector('[data-id="tab-video"]')).accept();
      check(!track.parentElement.classList.contains('is-drag'), 'switching tab retires drag');
      const count = ui.writes.length;
      track.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 1000 }));
      check(ui.writes.length === count, 'retired slider never changes settings');
      m.setInputMode('touch');
      // Let the observer report final responsive dimensions before the screenshot.
      await new Promise(resolve => requestAnimationFrame(resolve)); m.update(1 / 60);
      return { passed: true, snapshotsPerRefresh: 1, stableFrames: 120, stableListGeometryReads: 0, scrollGeometryReads };
    });
    // Trusted browser input exercises click admission and actual pointer capture.
    await page.locator('[data-id="tab-audio"]').click();
    const master = page.locator('[data-id="set-master"] .iw-slider__track');
    await master.scrollIntoViewIfNeeded();
    const box = await master.boundingBox();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.testUI.settings.master), 0.8);
    assert.equal(await page.locator('.iw-slider.is-drag').count(), 0);
    await page.locator('[data-id="tab-video"]').click();
    await page.waitForFunction(() => {
      const m = window.menu, root = m._scr.el, row = root.querySelector('[data-id="set-quality"]');
      let opacity = 1; for (let el = row; el && el !== root.parentNode; el = el.parentElement) opacity *= +getComputedStyle(el).opacity;
      return opacity > 0.6;
    });
    await page.locator('[data-id="set-quality"] .iw-seg__opt').first().click();
    assert.equal(await page.evaluate(() => window.testUI.settings.quality), 'low');
    await page.evaluate(() => { const m = window.menu; m._setFocus(m._scr.el.querySelector('[data-id="set-quality"]')); m.update(1 / 60); });
    result.trustedMouseDragAndTabClick = true;
    await page.waitForTimeout(350);
    const tabLabelsFit = await page.locator('.iw-settings .iw-tab > span').evaluateAll(labels => labels.every(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1));
    assert(tabLabelsFit, 'settings tab labels stay on one line');
    await page.screenshot({ path: path.join(evidence, `settings-${viewport.width}x${viewport.height}.png`) });
    results.push({ viewport, ...result });
    await page.evaluate(() => window.menu.dispose());
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(evidence, 'settings-ui.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
