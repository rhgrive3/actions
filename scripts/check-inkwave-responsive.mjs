#!/usr/bin/env node
// Focused menu regression. Runs the production menu DOM/CSS with the
// existing offline session fixture; does not claim real-device or gameplay proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkCoreMenus } from './check-inkwave-responsive-core.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const source = path.resolve(arg('--source') || path.join(repo, 'inkwave-public'));
const evidence = path.resolve(arg('--evidence-dir') || '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-responsive-ui-20261002');
const cache = path.resolve(arg('--profile-dir') || '/mnt/workspace/.dev-state/agent-work/cache/inkwave-responsive-ui-20261002');
const baseline = arg('--baseline');
const audit = process.argv.includes('--audit');
const section = arg('--section') || 'expansion';
const selectedCases = (arg('--cases') || arg('--case') || '').split(',').filter(Boolean);
assert(['core', 'expansion', 'all'].includes(section), 'Unknown menu section');
const physical = (p) => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
for (const p of [evidence, cache]) {
  assert(physical(p).startsWith('/mnt/workspace/'), `Persistent workspace storage required: ${p}`);
  fs.mkdirSync(p, { recursive: true });
}
const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require('playwright');
const patchStyles = fs.existsSync(path.join(source, 'patches/splatoon3/ui.css')) ? '<link rel="stylesheet" href="/patches/splatoon3/ui.css">' : '';
const runtimeFiles = patchStyles ? ['patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/gear.mjs', 'patches/splatoon3/runtime/conditional-gear.mjs', 'patches/splatoon3/runtime/sub-resistance.mjs', 'patches/splatoon3/profile.json'] : [];
for (const file of runtimeFiles) assert(fs.existsSync(path.join(source, file)), `Missing installed UI input: ${file}`);
const runtimeInstaller = patchStyles ? `
import { install } from '/patches/splatoon3/runtime/install.mjs';
const tuningResponse = await fetch('/patches/splatoon3/profile.json');
if (!tuningResponse.ok) throw Error('Published gameplay profile unavailable');
const tuning = await tuningResponse.json();
install(tuning);
` : '';
const html = `<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css">
${patchStyles}
<style>html,body{margin:0;overflow:hidden;background:#0d1020;touch-action:none}#ui-root{position:fixed;inset:0}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
<div id="ui-root"></div><script type="module">
import { Menus } from '/src/ui/menus.js';
import { G } from '/src/core/ctx.js';
import { MockNet } from '/src/net/mock.js';
import { DEFAULT_SETTINGS } from '/src/config.js';
${runtimeInstaller}
let settings={...DEFAULT_SETTINGS}, profile={name:'Test Squidkid',level:5,xp:1200}, loadout={weapon:'shooter'};
G.settings=settings; G.net=new MockNet();
window.G=G;window.menuState=()=>({settings,profile,loadout});window.menus=new Menus(document.getElementById('ui-root'),{
 getSettings:()=>settings,setSetting:(k,v)=>settings[k]=v,
 setSettings:v=>{settings={...v};G.settings=settings},
 getProfile:()=>profile,setProfile:v=>Object.assign(profile,v),
 setProfileName:v=>profile.name=v,setProfileStyle:v=>profile.style={...v},
 getLoadout:()=>loadout,setLoadout:v=>Object.assign(loadout,v)
});
window.addEventListener('keydown',e=>{if(menus.handleKey(e)&&document.activeElement?.tagName!=='INPUT')e.preventDefault()});
window.menuReady=true;
</script></html>`;
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/__menus') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); return; }
    const relative = decodeURIComponent(url.pathname).slice(1);
    let file = path.resolve(source, relative);
    assert(file.startsWith(source + path.sep));
    if (baseline && ['styles/mobile.css', 'src/ui/menus.js', 'src/ui/news.js'].includes(relative)) file = path.join(path.resolve(baseline), 'inkwave-public', relative);
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404); response.end('Missing'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}/__menus?netmock=1&mockauto=0&mocklat=0&news=0`;
const result = { kind: 'production-menu-dom-with-offline-session', source, section, selectedCases, realDeviceVerified: false, baseline: baseline || null, cases: [], errors: [] };
result.runtimeInstalled = !!patchStyles;
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sourceHashes = () => Object.fromEntries(['styles/mobile.css', 'styles/ui.css', 'src/ui/menus.js', 'src/ui/news.js', 'src/core/device.js', ...(patchStyles ? ['patches/splatoon3/ui.css'] : []), ...runtimeFiles].map((f) => {
  const original = baseline && ['styles/mobile.css', 'src/ui/menus.js', 'src/ui/news.js'].includes(f);
  return [f, hash(fs.readFileSync(original ? path.join(path.resolve(baseline), 'inkwave-public', f) : path.join(source, f)))];
}));
result.sourceHashes = sourceHashes();
const runnerHashes = () => Object.fromEntries(['check-inkwave-responsive.mjs', 'check-inkwave-responsive-core.mjs'].map((f) => [f, hash(fs.readFileSync(path.join(repo, 'scripts', f)))]));
result.runnerHashes = runnerHashes();
const configurations = [
  ['phone-portrait', { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }],
  ['phone-landscape', { ...devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 } }],
  ['small-phone', { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } }],
  ['tablet-portrait', { ...devices['iPad Mini'], viewport: { width: 768, height: 1024 } }],
  ['tablet-landscape', { ...devices['iPad Mini landscape'], viewport: { width: 1024, height: 768 } }],
  ['tablet-split', { ...devices['iPad Mini'], viewport: { width: 507, height: 768 } }],
  ['desktop', { viewport: { width: 1440, height: 900 }, hasTouch: false }],
];
const show = async (page, name) => {
  await page.evaluate((screen) => { menus.wipe.cancel(); menus.show(screen, { wipe: false, light: false, force: true }); }, name);
  await settle(page);
};
const settle = async (page) => page.evaluate(async () => {
  await Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})));
});
const geometry = async (page, selector, label) => {
  await settle(page);
  const controls = page.locator(selector);
  const measurements = await controls.evaluateAll((els) => els.filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.is-leaving')).map((el) => {
    const r = el.getBoundingClientRect();
    return { class: el.className, width: r.width, height: r.height, left: r.left, right: r.right, viewport: innerWidth };
  }));
  assert(measurements.length, `${label}: no controls rendered`);
  if (!audit) for (const r of measurements) {
    assert(r.left >= -1 && r.right <= r.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(r)}`);
    assert(r.width >= 43 && r.height >= 43, `${label}: small touch target ${JSON.stringify(r)}`);
  }
  return measurements;
};
const tap = async (page, selector) => { const el = page.locator(selector).first(); await el.scrollIntoViewIfNeeded(); await el.tap(); };
const engines = arg('--engine') ? [arg('--engine')] : ['chromium', 'webkit'];
try {
  for (const engineName of engines) {
    const engine = { chromium, webkit }[engineName];
    assert(engine, `Unknown browser: ${engineName}`);
    for (const [name, config] of configurations) {
      if (selectedCases.length && !selectedCases.includes(name)) continue;
      const browserDir = path.join(cache, engineName, name);
      fs.mkdirSync(path.join(browserDir, 'artifacts'), { recursive: true });
      const context = await engine.launchPersistentContext(path.join(browserDir, 'profile'), {
        ...config, headless: true, artifactsDir: path.join(browserDir, 'artifacts'), downloadsPath: path.join(browserDir, 'downloads'),
        reducedMotion: 'reduce', ...(engineName === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}),
      });
      const entry = { engine: engineName, browserVersion: context.browser()?.version(), viewport: config.viewport, name, screens: {} };
      result.cases.push(entry);
      const page = context.pages()[0] || await context.newPage();
      page.on('pageerror', (e) => result.errors.push(`${engineName}/${name}: ${e.message}`));
      await page.addInitScript(() => {
        window.responsiveEvents = [];
        for (const event of ['pointerdown', 'pointerup', 'click', 'gotpointercapture', 'lostpointercapture']) document.addEventListener(event, (e) => {
          responsiveEvents.push({ event, pointerType: e.pointerType, target: e.target.closest('button,input')?.className || e.target.className, tag: e.target.tagName, x: e.clientX, y: e.clientY });
          if (responsiveEvents.length > 12) responsiveEvents.shift();
        }, true);
      });
      try {
        await page.goto(address);
        await page.waitForFunction(() => window.menuReady);
        await page.evaluate(() => document.fonts.ready);
        await show(page, 'online');
        if (name === 'desktop') {
          if (section !== 'expansion') {
            await checkCoreMenus({ page, entry, config, engineName, evidence, show, settle,
              geometry: async (page, selector) => { assert(await page.locator(selector).count()); return 'desktop-captured'; }, tap, audit: true });
            for (const [screen, selector] of [['main', '.iw-main__menu'], ['setup', '.iw-ss__hero'], ['settings', '.iw-settings__panel']]) {
              await show(page, screen);
              assert.equal(await page.locator(selector).evaluate((el) => getComputedStyle(el).position), 'absolute', `${screen}: desktop composition must remain unchanged`);
            }
            entry.coreMenus = 'desktop-composition-passed';
            await show(page, 'online');
          }
          entry.nativeInputHidden = await page.locator('.iw-code-input').count() === 0 || !(await page.locator('.iw-code-input').isVisible());
          assert(entry.nativeInputHidden);
          const slot = page.locator('.iw-code__box').first(); await slot.click();
          await page.keyboard.type('bc'); await page.keyboard.press('Backspace');
          assert.equal(await page.locator('.iw-code__ch').first().textContent(), 'B');
          assert.equal(await page.locator('.iw-code__ch').nth(1).textContent(), '');
          for (const screen of ['online', 'mode', 'lobby']) {
            await show(page, screen);
            entry.screens[screen] = await page.locator('.iw-screen').screenshot({ path: path.join(evidence, `${engineName}-${name}-${screen}.png`) }).then(() => 'captured');
          }
          entry.status = 'passed';
          continue;
        }
        entry.touchMode = await page.locator('.iw-ui').evaluate((el) => el.classList.contains('is-touch'));
        assert(entry.touchMode, `${name}: touch mode not detected`);
        if (section !== 'expansion') {
          await checkCoreMenus({ page, entry, config, engineName, evidence, show, settle, geometry, tap, audit });
          if (section === 'core') { entry.status = audit ? 'audited' : 'passed'; continue; }
          await show(page, 'online');
        }
        entry.screens.online = await geometry(page, '.iw-code-input, .iw-join__btns button, .iw-hubcard--create, .iw-hub__chip, .iw-online .iw-backbtn', 'online');
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}-online.png`) });
        if (audit) continue;
        await tap(page, '.iw-code-input');
        assert.equal(await page.locator('.iw-code-input').evaluate((el) => document.activeElement === el), true);
        await page.locator('.iw-code-input').fill('bc');
        await page.locator('.iw-code-input').press('Backspace');
        assert.equal(await page.locator('.iw-code-input').inputValue(), 'B');
        await page.locator('.iw-code-input').fill('BO1-C');
        assert.equal(await page.locator('.iw-code-input').inputValue(), 'BC');
        await page.locator('.iw-code-input').fill('BC234');
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => G.net.state), 'offline', 'native typing must allow correction before joining');
        await tap(page, '.iw-join__btns .is-go');
        await page.waitForFunction(() => menus.current === 'lobby');
        assert.equal(await page.evaluate(() => G.net.code), 'BC234');
        entry.joinedCode = 'BC234';
        await page.evaluate(() => G.net.mock.fill(7));
        entry.screens.lobby = await geometry(page, '.iw-lob__bar button:not(.iw-seg__opt), .iw-lob__bar .iw-seg__opt, .iw-rc__copy, .iw-lob__leave', 'lobby');
        assert.equal(await page.locator('.iw-lob__member').count(), 8);
        assert(await page.locator('.iw-lob__side').evaluate((side) => {
          const heading = side.querySelector('.iw-lob__mode').getBoundingClientRect();
          const x = heading.left + heading.width / 2, y = heading.top + heading.height / 2;
          return y < 0 || y >= innerHeight || side.contains(document.elementFromPoint(x, y));
        }), 'the lobby dock must not cover the visible mode/settings heading');
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}-lobby.png`) });
        await tap(page, '.iw-lob__wchip');
        entry.screens.drawer = await geometry(page, '.iw-ldr .iw-wcard, .iw-ldr .iw-touch-close', 'drawer');
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}-drawer.png`) });
        await page.locator('.iw-ldr .iw-wcard:last-child').scrollIntoViewIfNeeded();
        const closeRect = await page.locator('.iw-ldr .iw-touch-close').boundingBox();
        assert(closeRect.y >= 0 && closeRect.y + closeRect.height <= config.viewport.height, 'drawer close must remain in view while scrolling');
        await tap(page, '.iw-ldr .iw-touch-close');
        await page.waitForFunction(() => !menus._modal);
        await tap(page, '.iw-lob__wchip');
        await tap(page, '.iw-ldr .iw-wcard:last-child');
        await page.waitForFunction(() => !menus._modal);
        await page.waitForFunction(() => G.net.lobby.players.find((p) => p.you).weapon !== 'shooter');
        entry.equipped = await page.evaluate(() => G.net.lobby.players.find((p) => p.you).weapon);
        assert.notEqual(entry.equipped, 'shooter');
        await tap(page, '.iw-lob__emote');
        entry.screens.emotes = await geometry(page, '.iw-emowheel button', 'emotes');
        await tap(page, '.iw-emowheel .iw-touch-close');
        await page.waitForFunction(() => !menus._modal);
        await tap(page, '.iw-btn--ready');
        await page.waitForFunction(() => G.net.lobby.players.find((p) => p.you).ready);
        assert.equal(await page.evaluate(() => G.net.lobby.players.find((p) => p.you).ready), true);
        await page.evaluate(() => G.net.leave());
        await show(page, 'online');
        await page.locator('.iw-code-input').fill('ZZZZZ');
        await tap(page, '.iw-join__btns .is-go');
        await page.waitForFunction(() => document.querySelector('.iw-jstat')?.classList.contains('is-on'));
        assert.equal(await page.locator('.iw-code-input').isDisabled(), false);
        await page.locator('.iw-code-input').evaluate((el) => {
          const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'Join my room: BC234');
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
        });
        assert.equal(await page.locator('.iw-code-input').inputValue(), 'BC234');
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => G.net.state), 'error', 'native paste must wait for JOIN');
        await page.evaluate(() => menus.setInputMode('kbm'));
        assert.equal(await page.locator('.iw-code-input').isVisible(), true, 'touch device layout must survive an attached keyboard or compatibility mouse event');
        assert.equal(await page.locator('.iw-online').evaluate((el) => getComputedStyle(el).overflowY), 'auto');
        await page.evaluate(() => menus.setInputMode('touch'));
        await page.evaluate(() => G.net.leave());
        await page.evaluate(() => G.net.create('Host Squidkid'));
        await show(page, 'lobby');
        entry.screens.host = await geometry(page, '.iw-lob__modearrows i, .iw-lstage__arrows i, .iw-lset .iw-seg__opt, .iw-btn--lobstart', 'host');
        await tap(page, '.iw-lob__modearrows .is-r');
        await page.waitForFunction(() => G.net.lobby.mode === 'boss');
        assert.equal(await page.locator('.iw-lobby').evaluate((el) => el.classList.contains('is-bossmode')), true);
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}-boss-lobby.png`) });
        await page.evaluate(() => G.net.leave());
        await show(page, 'mode');
        entry.screens.mode = await geometry(page, '.iw-mode, .iw-modesel .iw-backbtn', 'mode');
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}-mode.png`) });
        await show(page, 'main');
        await page.evaluate(() => menus._news.show());
        entry.screens.news = await geometry(page, '.iw-news__btns button', 'news');
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}-news.png`) });
        const stage = page.locator('.iw-news__stage');
        assert(await stage.evaluate((el) => el.scrollHeight >= el.clientHeight));
        await tap(page, '.iw-news__go');
        await page.waitForFunction(() => document.querySelector('.iw-news')?.dataset.page === 'boss');
        await tap(page, '.iw-news__later');
        await page.waitForFunction(() => !menus._news.open);
        entry.status = 'passed';
      } catch (error) {
        entry.status = 'failed'; entry.error = error.message;
        entry.interactionFailure = await page.evaluate(() => ({ events: window.responsiveEvents, inputMode: menus._input, newsPage: document.querySelector('.iw-news')?.dataset.page, newsBusy: menus._news._busy,
          scroll: [...document.querySelectorAll('.iw-news__stage,.iw-news__go')].map((el) => { const r = el.getBoundingClientRect(); return { class: el.className, y: r.y, bottom: r.bottom, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }; }) }));
        await page.screenshot({ path: path.join(evidence, `${engineName}-${name}-failure.png`) }).catch(() => {});
        if (!audit) throw error;
      } finally { await context.close(); }
    }
  }
  assert(result.cases.length, 'At least one known viewport case must run');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(sourceHashes(), result.sourceHashes, 'Menu sources changed while the browser matrix was running');
  assert.deepEqual(runnerHashes(), result.runnerHashes, 'Menu acceptance scripts changed while the browser matrix was running');
  result.status = audit ? 'audited' : 'passed';
} catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
finally {
  await new Promise((resolve) => server.close(resolve));
  const file = path.join(evidence, audit ? 'audit-result.json' : 'responsive-result.json');
  fs.writeFileSync(file + '.pending', JSON.stringify(result, null, 2) + '\n'); fs.renameSync(file + '.pending', file);
  console.log(JSON.stringify({ status: result.status, cases: result.cases.length, errors: result.errors, error: result.error, evidence: file }));
}
