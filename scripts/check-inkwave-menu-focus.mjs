#!/usr/bin/env node
// Real emitted Menus + production installer; offline session only, no gameplay claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createResponsiveAssetServer } from './lib/inkwave-responsive-server.mjs';
const repo = fileURLToPath(new URL('../', import.meta.url));
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const source = path.resolve(arg('--source') || path.join(repo, '.built-site/_site'));
const evidence = path.resolve(arg('--evidence-dir') || path.join(repo, '.dev-state/menu-focus'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const pins = JSON.parse(fs.readFileSync(new URL('./inkwave-menu-focus-pins.json', import.meta.url)));
const manifestPath = path.join(source, 'inkwave-build.json');
const manifestBytes = fs.readFileSync(manifestPath), manifest = JSON.parse(manifestBytes);
assert.equal(manifest.build.optimization, 'esbuild-minify', 'Requires production emission');
assert.equal(hash(JSON.stringify(manifest.files)), manifest.inputHash, 'Manifest input hash');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash, 'Manifest artifact hash');
for (const [key, digest] of Object.entries(pins.inputs)) assert.equal(manifest.files[key], digest, `Pinned composed UI input: ${key}`);
const files = ['src/ui/menus.js', 'patches/splatoon3/runtime/menu-layout.mjs', 'patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/profile.json'];
const emitted = Object.fromEntries(files.map(file => {
  const digest = hash(fs.readFileSync(path.join(source, file)));
  assert.equal(manifest.artifacts[file], digest, `Emitted artifact: ${file}`);
  return [file, digest];
}));
// Observe factories and callbacks, preserving receiver, arguments, return and errors.
// Installation precedes observation; no native constructor or screen is substituted.
function observe(Menus) {
  const audit = window.focusAudit = { screens: [], construction: [], destroyedCallbacks: [] };
  for (const name of ['setup', 'loadout']) {
    const key = '_scr_' + name, factory = Menus.prototype[key];
    Menus.prototype[key] = function (...args) {
      const before = this._focus, scr = Reflect.apply(factory, this, args);
      audit.construction.push({ name, unchanged: before === this._focus });
      const row = { name, focus: 0, destroyed: false, owned: true, mounted: true };
      audit.screens.push(row);
      const focus = scr.onFocus, destroy = scr.destroy, menus = this;
      scr.onFocus = function (...values) {
        row.focus++;
        row.owned &&= menus._scr === scr;
        row.mounted &&= scr.el.isConnected;
        if (row.destroyed) audit.destroyedCallbacks.push(name);
        return focus ? Reflect.apply(focus, this, values) : undefined;
      };
      scr.destroy = function (...values) {
        row.destroyed = true;
        return destroy ? Reflect.apply(destroy, this, values) : undefined;
      };
      return scr;
    };
  }
}
const html = `<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css">
<link rel="stylesheet" href="/patches/splatoon3/ui.css">
<style>html,body{margin:0;overflow:hidden;background:#0d1020;touch-action:none}#ui-root{position:fixed;inset:0}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
<div id="ui-root"></div>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
<script type="module">
import { Menus } from '/src/ui/menus.js';
import { G } from '/src/core/ctx.js';
import { MockNet } from '/src/net/mock.js';
import { DEFAULT_SETTINGS } from '/src/config.js';
import { install } from '/patches/splatoon3/runtime/install.mjs';
const tuningResponse = await fetch('/patches/splatoon3/profile.json');
if (!tuningResponse.ok) throw Error('Published gameplay profile unavailable');
install(await tuningResponse.json());
(${observe.toString()})(Menus);
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
const result = { status: 'pending', baseCommit: pins.baseCommit, sourceSha: process.env.SOURCE_SHA || null, contentHash: manifest.contentHash, source, manifestSha256: hash(manifestBytes), inputHash: manifest.inputHash, revision: manifest.build.revision, emitted, errors: [], checks: [] };
fs.mkdirSync(evidence, { recursive: true });
const server = createResponsiveAssetServer({ source, html });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const { chromium } = createRequire(import.meta.url)('playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const responses = [];
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('response', response => {
    const key = new URL(response.url()).pathname.slice(1);
    if (files.includes(key)) responses.push(response.body().then(bytes => {
      assert.equal(response.status(), 200, key);
      assert.equal(hash(bytes), emitted[key], `Browser consumed ${key}`);
      return key;
    }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/__menus?netmock=1&mockauto=0&mocklat=0&news=0`);
  await page.waitForFunction(() => window.menuReady);
  result.checks = await page.evaluate(() => {
    const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    const checks = [], menus = window.menus, audit = window.focusAudit;
    const show = (name, back = false) => {
      menus.wipe.cancel();
      menus.show(name, { wipe: false, light: false, force: true, back });
      const row = audit.screens.at(-1);
      check(row.name === name && row.focus === 1 && row.owned && row.mounted, `${name}: exactly one owned, mounted initial onFocus`);
      check(audit.construction.every(x => x.unchanged), 'factories never take focus during construction');
      check(audit.destroyedCallbacks.length === 0, 'no onFocus after destroy');
    };
    const visible = () => menus._focus?._wid && !menus._focus.hidden && menus._scr.el.contains(menus._focus);
    show('loadout');
    check(menus._scr.el.querySelectorAll('.s3-wfilter__tab').length > 2, 'production installer adds real catalogue filters');
    show('setup'); show('loadout');
    // Native keyboard entry and actual tab DOM click handlers, no replacement handlers.
    const tabs = [...menus._scr.el.querySelectorAll('.s3-wfilter__tab')];
    const selectedCategory = () => tabs.find(t => t.getAttribute('aria-selected') === 'true')?.dataset.cat;
    const beforeCategory = selectedCategory();
    check(beforeCategory === 'all', 'new loadout starts on all filter');
    const expectedCategory = tabs[(tabs.findIndex(t => t.dataset.cat === beforeCategory) + 1) % tabs.length].dataset.cat;
    const handled = menus.handleKey(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', cancelable: true }));
    check(handled === true && selectedCategory() === expectedCategory && expectedCategory !== beforeCategory, 'keyboard advances exactly one class and is handled');
    const cards = [...menus._scr.el.querySelectorAll('[data-cat]')].filter(el => el._wid);
    check(cards.length > 0 && cards.some(card => !card.hidden) && cards.every(card => card.hidden === (expectedCategory !== 'all' && card.dataset.cat !== expectedCategory)), 'keyboard filter visibility matches exact class membership');
    check(visible() && menus._focus.dataset.cat === expectedCategory, 'keyboard class change keeps visible matching card focus');
    const other = tabs.find(t => t.dataset.cat !== 'all' && t.dataset.cat !== menus._focus.dataset.cat);
    check(!!other, 'different weapon class exists');
    other.click();
    check(visible() && menus._focus.dataset.cat === other.dataset.cat, 'click class change repairs hidden card focus');
    const retained = menus._focus;
    other.click();
    check(menus._focus === retained, 'visible focus retained on repeated filter');
    menus._setFocus(null);
    other.click();
    check(visible(), 'null focus repaired by later user filter');
    const remembered = menus._focus.dataset.id;
    for (let cycle = 0; cycle < 12; cycle++) {
      show('setup'); show('loadout', true);
      check(menus._focus.dataset.id === remembered && visible(), `return ${cycle}: remembered visible focus`);
    }
    check(audit.destroyedCallbacks.length === 0 && audit.screens.filter(x => x !== audit.screens.at(-1)).every(x => x.destroyed), 'all outgoing screens destroyed without late focus callbacks');
    check(audit.screens.every(row => row.owned && row.mounted), 'every observed focus callback belongs to its mounted screen');
    return checks;
  });
  result.consumed = [...new Set(await Promise.all(responses))].sort();
  assert.deepEqual(result.consumed, [...files].sort(), 'All pinned runtime inputs actually consumed');
  assert.deepEqual(result.errors, []);
  for (const file of files) assert.equal(hash(fs.readFileSync(path.join(source, file))), emitted[file], `Unchanged after browser: ${file}`);
  assert.equal(hash(fs.readFileSync(manifestPath)), result.manifestSha256);
  result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = error.stack; process.exitCode = 1; }
finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(evidence, 'menu-focus-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
