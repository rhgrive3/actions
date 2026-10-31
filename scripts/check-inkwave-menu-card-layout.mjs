#!/usr/bin/env node
// DOM-only visual/navigation evidence using the real composed Menus/catalogue.
// No game boot, WebGL arena, installs or duplicate site builds are needed.
//
// node scripts/check-inkwave-menu-card-layout.mjs --site <built-site> --evidence-dir <dir>
// Optional: --source-patches overlays this checkout's UI CSS/card-layout adapter;
// --font <Japanese OpenType font> supplies a test-only font on minimal CI images;
// --motion reduce|smooth|both, --case <name>, --label <prefix>, --ui-css <file>.
// INKWAVE_CHROMIUM and PLAYWRIGHT_MODULE select existing local browser/dependencies.
// This is headless Chromium evidence, not a physical iPad / Safari measurement.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptMenuCardLayout } from '../patches/local-quality/menu-card-layout-adapter.mjs';
import { replaceOnce } from '../patches/local-quality/adapter.mjs';

const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Required ${name}`);
};
const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.resolve(option('--site')), evidence = path.resolve(option('--evidence-dir'));
const manifest = path.join(site, 'inkwave-build.json');
const buildContentHash = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).contentHash : null;
const sourcePatches = process.argv.includes('--source-patches');
const font = option('--font', ''), css = option('--ui-css', '');
if (font) assert(fs.statSync(path.resolve(font)).isFile(), '--font must be an existing font file');
const label = option('--label', 'menu-cards'), motion = option('--motion', 'both'), onlyCase = option('--case', '');
assert(['reduce', 'smooth', 'both'].includes(motion), '--motion must be reduce, smooth or both');
assert(/^[\w-]+$/.test(label), '--label must be a simple filename prefix');
fs.mkdirSync(evidence, { recursive: true });
const cases = [
  ['desktop', 1280, 720, false], ['tablet', 744, 1133, true],
  ['tablet-landscape', 1133, 744, true], ['phone', 844, 390, true], ['phone-portrait', 390, 844, true],
].filter(([name]) => !onlyCase || name === onlyCase);
assert(cases.length, 'Unknown --case');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.otf': 'font/otf', '.png': 'image/png', '.webp': 'image/webp' };
const fontCSS = font ? '@font-face{font-family:"IW JP Display";src:url(/qa-font.otf);font-weight:400;unicode-range:U+3000-30FF,U+3400-4DBF,U+4E00-9FFF,U+FF00-FFEF;font-display:swap}@font-face{font-family:"IW JP Body";src:url(/qa-font.otf);font-weight:400 900;unicode-range:U+3000-30FF,U+3400-4DBF,U+4E00-9FFF,U+FF00-FFEF;font-display:swap}' : '';
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><base href="/"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css"><link rel="stylesheet" href="/patches/splatoon3/ui.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#171126}#ui-root{position:fixed;inset:0}' + fontCSS + '</style></head><body><div id="ui-root"></div></body></html>';
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/qa.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
    const rel = pathname.slice(1), isLayout = rel === 'patches/splatoon3/runtime/menu-layout.mjs';
    let file = path.resolve(site, '.' + pathname), body;
    assert(file.startsWith(site + path.sep), 'Unsafe path');
    if (pathname === '/qa-font.otf' && font) file = path.resolve(font);
    if (rel === 'patches/splatoon3/ui.css' && (css || sourcePatches)) file = css ? path.resolve(css) : path.join(root, rel);
    if (isLayout && sourcePatches) body = adaptMenuCardLayout(rel, fs.readFileSync(path.join(root, rel), 'utf8'), replaceOnce);
    if (body === undefined) body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
let browser;
const results = [], failures = [];
const record = (ok, message) => { if (!ok) failures.push(message); };
const focusMetrics = page => page.evaluate(() => {
  const card = window.menu._focus, grid = card?.closest('.s3-wgrid');
  if (!grid) return { inGrid: false, name: card?.textContent };
  const c = card.getBoundingClientRect(), g = grid.getBoundingClientRect();
  return { inGrid: true, name: card.querySelector('.iw-wcard__name')?.textContent,
    card: c.toJSON(), grid: g.toJSON(), scrollTop: grid.scrollTop,
    fullyVisible: c.top >= g.top - 1 && c.bottom <= g.bottom + 1,
    insideViewport: c.top >= -1 && c.bottom <= innerHeight + 1 };
});
try {
  browser = await pw.chromium.launch({ executablePath: process.env.INKWAVE_CHROMIUM || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const mode of motion === 'both' ? ['reduce', 'smooth'] : [motion]) for (const [name, width, height, touch] of cases) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, locale: 'ja-JP', reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(base + '/qa.html');
    await page.evaluate(async ({ touch }) => {
      if (touch) document.documentElement.classList.add('iw-touch', 'iw-touch-ui');
      localStorage.setItem('inkwave.settings', JSON.stringify({ lang: 'ja', music: 0 }));
      const { install } = await import('/patches/splatoon3/runtime/install.mjs');
      install(await (await fetch('/patches/splatoon3/profile.json')).json());
      const { Menus } = await import('/src/ui/menus.js');
      window.menu = new Menus(document.querySelector('#ui-root')); window.menu.show('loadout');
      await document.fonts.ready;
    }, { touch });
    await page.waitForTimeout(mode === 'smooth' ? 1000 : 200);
    await page.evaluate(() => window.menu._scr.tick?.(20));
    const names = await page.evaluate(() => [...document.querySelectorAll('.s3-wgrid .iw-wcard__name')].map(el => {
      const style = getComputedStyle(el), card = el.closest('.iw-wcard'), icon = card.querySelector('.iw-wcard__icon'), svg = icon.querySelector('svg');
      return { text: el.textContent, fontSize: parseFloat(style.fontSize), height: el.clientHeight, scrollHeight: el.scrollHeight,
        clipped: el.scrollHeight > el.clientHeight + 1, iconHeight: icon.getBoundingClientRect().height,
        svgHeight: svg?.getBoundingClientRect().height ?? null, cardHeight: card.getBoundingClientRect().height };
    }));
    const prefix = `${label}-${name}-${mode}`;
    await page.screenshot({ path: path.join(evidence, prefix + '.png') });
    record(names.length === 161, `${prefix}: catalogue count ${names.length}`);
    record(names.every(x => !x.clipped), `${prefix}: clipped names: ${names.filter(x => x.clipped).map(x => x.text).join(', ')}`);
    const focus = [];
    const waitScroll = () => page.waitForTimeout(mode === 'smooth' ? 1600 : 300);
    // Direct focus jumps use the same native path as keyboard/pad navigation.
    for (const action of ['long-name', 'back-to-first', 'native-down', 'rapid-navigation']) {
      await page.evaluate(action => {
        const cards = [...document.querySelectorAll('.s3-wgrid .iw-wcard')];
        if (action === 'long-name') window.menu._moveFocus(cards.find(c => c.querySelector('.iw-wcard__name')?.textContent === 'キャンピングシェルターソレーラ') || cards.at(-2));
        if (action === 'back-to-first') window.menu._moveFocus(cards[0]);
        if (action === 'native-down') window.menu._nav('down');
        window.menu._scr.tick?.(20);
      }, action);
      if (action === 'rapid-navigation') for (const index of [50, 120, 1, 155]) {
        await page.evaluate(index => {
          const cards = [...document.querySelectorAll('.s3-wgrid .iw-wcard')];
          window.menu._moveFocus(cards[Math.min(index, cards.length - 1)]); window.menu._scr.tick?.(20);
        }, index);
        await page.waitForTimeout(40); // interrupt real smooth movement between successive navigation events
      }
      await waitScroll();
      const bounds = await focusMetrics(page); focus.push({ action, ...bounds });
      record(bounds.inGrid && bounds.fullyVisible, `${prefix}: ${action} focus is outside its grid`);
      if (action === 'long-name') await page.screenshot({ path: path.join(evidence, prefix + '-long-name.png') });
    }
    // A wheel gesture arriving before correction must own the resulting scroll.
    // Explicit scrollTo models the browser's default wheel movement deterministically.
    await page.evaluate(() => {
      const grid = document.querySelector('.s3-wgrid'), nativeScroll = grid.scrollTo.bind(grid), calls = [];
      grid.scrollTo = (...args) => { calls.push(args); return nativeScroll(...args); };
      nativeScroll({ top: 0, behavior: 'instant' });
      const cards = [...grid.querySelectorAll('.iw-wcard')]; window.menu._moveFocus(cards.at(-3));
      grid.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
      nativeScroll({ top: 400, behavior: 'instant' });
      window.manualCheck = { grid, calls, count: calls.length, expected: grid.scrollTop };
    });
    await page.waitForTimeout(400);
    const manual = await page.evaluate(() => ({ before: window.manualCheck.expected, after: window.manualCheck.grid.scrollTop, beforeCalls: window.manualCheck.count, afterCalls: window.manualCheck.calls.length }));
    record(manual.afterCalls === manual.beforeCalls, `${prefix}: correction ran after manual wheel`);
    record(Math.abs(manual.before - manual.after) <= 1, `${prefix}: manual scroll moved from ${manual.before} to ${manual.after}`);
    await page.evaluate(() => window.menu.dispose());
    record(errors.length === 0, `${prefix}: browser errors: ${errors.join('; ')}`);
    results.push({ name, mode, viewport: { width, height, touch }, names, focus, manual, errors });
    await context.close();
    console.log(JSON.stringify({ name, mode, cards: names.length, clipped: names.filter(x => x.clipped).length, focusVisible: focus.every(x => x.fullyVisible), manual, errors }));
  }
} catch (error) { failures.push(String(error.stack || error)); }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(evidence, label + '-report.json'), JSON.stringify({ status: failures.length ? 'failed' : 'passed', buildContentHash, sourcePatches, testFont: !!font, browser: browser?.version(), failures, results }, null, 2) + '\n');
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
