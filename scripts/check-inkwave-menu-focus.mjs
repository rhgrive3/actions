#!/usr/bin/env node
// Real emitted Menus + production installer; offline session only, no gameplay claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createResponsiveAssetServer } from './lib/inkwave-responsive-server.mjs';
import { clippingVisibility } from './check-inkwave-landscape-fixes.mjs';
import { ICON_MENU_INSTALLER_SHA256, SQUIDROLL_MENU_INSTALLER_SHA256, MENU_ICON_INPUT_SHA256, SQUIDROLL_MENU_INPUT_SHA256, verifyMenuInstallerSourceIdentity, verifyMenuLayoutSourceIdentity } from './lib/inkwave-menu-focus-source-identity.mjs';
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
const menuLayoutEpoch=verifyMenuLayoutSourceIdentity(fs.readFileSync(path.join(repo,'patches/splatoon3/runtime/menu-layout.mjs'),'utf8'),manifest.files['patch/runtime/menu-layout.mjs'],pins.inputs['patch/runtime/menu-layout.mjs']);
const installerSource=fs.readFileSync(path.join(repo,'patches/splatoon3/runtime/install.mjs'),'utf8');
const frozenInstaller=fs.readFileSync(new URL('./fixtures/inkwave-menu-installer-before-icons-1915.mjs.txt',import.meta.url),'utf8');
const installerHash=hash(installerSource),iconInputs={};
const frozenIconInstaller=installerHash===SQUIDROLL_MENU_INSTALLER_SHA256?fs.readFileSync(new URL('./fixtures/inkwave-menu-installer-before-squidroll-20261029.mjs.txt',import.meta.url),'utf8'):undefined;
const requiredInputs=installerHash===SQUIDROLL_MENU_INSTALLER_SHA256?{...MENU_ICON_INPUT_SHA256,...SQUIDROLL_MENU_INPUT_SHA256}:installerHash===ICON_MENU_INSTALLER_SHA256?MENU_ICON_INPUT_SHA256:{};
for(const key of Object.keys(requiredInputs)){
 const file=key.replace(/^patch\//,'patches/splatoon3/');
 iconInputs[key]={source:fs.readFileSync(path.join(repo,file),'utf8'),manifestDigest:manifest.files[key]};
}
const menuInstallerEpoch=verifyMenuInstallerSourceIdentity(installerSource,manifest.files['patch/runtime/install.mjs'],pins.inputs['patch/runtime/install.mjs'],frozenInstaller,iconInputs,frozenIconInstaller);
for (const [key, digest] of Object.entries(pins.inputs)) assert.equal(manifest.files[key],key==='patch/runtime/menu-layout.mjs'?menuLayoutEpoch.sourceSha256:key==='patch/runtime/install.mjs'?menuInstallerEpoch.sourceSha256:digest, `Pinned composed UI input: ${key}`);
const files = ['src/ui/menus.js', 'patches/splatoon3/runtime/menu-layout.mjs', 'patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/profile.json'];
for(const key of [...Object.keys(menuInstallerEpoch.iconInputs),...Object.keys(menuInstallerEpoch.effectInputs)])files.push(key.replace(/^patch\//,'patches/splatoon3/'));
const emitted = Object.fromEntries(files.map(file => {
  const digest = hash(fs.readFileSync(path.join(source, file)));
  assert.equal(manifest.artifacts[file], digest, `Emitted artifact: ${file}`);
  return [file, digest];
}));
// Observe factories and callbacks, preserving receiver, arguments, return and errors.
// Installation precedes observation; no native constructor or screen is substituted.
function observe(Menus) {
  const audit = window.focusAudit = { screens: [], construction: [], destroyedCallbacks: [], graphNavigation: [] };
  const graphNav=Menus.prototype._graphNav;
  Menus.prototype._graphNav=function(...args){
    const result=Reflect.apply(graphNav,this,args);
    audit.graphNavigation.push({dir:args[1],result});
    return result;
  };
  for (const name of ['setup', 'loadout', 'mode']) {
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
<link rel="icon" href="data:,">
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
if (new URLSearchParams(location.search).has('owners')) {
  const { installMenuQuality } = await import('/patches/local-quality/menu.mjs');
  installMenuQuality(Menus);
}
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
// Standalone addition for the EXISTING emitted-menu checker; never launches a
// browser. Positive actions use real controls; synthetic events model late DOM
// delivery only. No Menus/MobileInput/API handler is replaced.
async function assertBrowserSettingsLifetime(page) {
  const key = '__browserSettingsLifetimeOwnerProbe', errors = [];
  const onError = error => errors.push(error.message);
  const check = (ok, label) => { if (!ok) throw Error('settings lifetime: ' + label); };
  const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  page.on('pageerror', onError);
  try {
    await page.evaluate(async key => {
      if (window[key] || document.querySelector('#iw-mobile-controls')) throw Error('settings lifetime: isolated mobile fixture required');
      const { MobileInput } = await import('/src/core/mobile.js');
      const { DEFAULT_SETTINGS } = await import('/src/config.js');
      const canvas = document.createElement('canvas'); canvas.dataset.settingsLifetimeProbe = 'true'; document.body.appendChild(canvas);
      const state = window[key] = { canvas, originalSettings: { ...menuState().settings }, originalScreen: menus.current,
        originalStorage: localStorage.getItem('inkwave.touchLayout'), hadMobileClass: document.documentElement.classList.contains('iw-mobile'),
        defaultOpacity: DEFAULT_SETTINGS.touchOpacity, sentinelOpacity: DEFAULT_SETTINGS.touchOpacity === .42 ? .43 : .42 };
      state.mobile = new MobileInput(canvas, { lastDevice: 'touch' });
      if (!state.mobile.root || state.mobile.editing) throw Error('settings lifetime: actual touch owner did not initialize');
      menus.wipe.cancel(); menus.show('settings', { wipe: false, light: false, force: true });
      state.focus = menus._scr.el.querySelector('[data-id="reset"]'); state.focus.focus({ preventScroll: true });
      state.initialDraft = JSON.stringify(state.mobile.layout); state.mobile.openEditor();
    }, key);
    const editor = page.locator('#iw-mobile-controls .iwm-edit');
    await editor.locator('select').selectOption('jump');
    await editor.locator('.iwm-layout-position summary').tap();
    await editor.locator('.iwm-edit__size').focus();
    await page.keyboard.press(await page.evaluate(key => window[key].mobile._cfg('jump').s >= 1 ? 'Home' : 'End', key));
    await editor.locator('[data-axis="x"]').focus(); await page.keyboard.press('Home');
    await editor.locator('[data-axis="y"]').focus(); await page.keyboard.press('End');
    await page.evaluate(key => { const s = window[key]; s.saved = JSON.stringify(s.mobile.layout);
      if (!s.mobile.editing || !s.mobile.root.querySelector('.iwm-layout-position').open || !s.mobile.layout.jump || s.saved === s.initialDraft) throw Error('settings lifetime: active XY/size edit missing');
    }, key);
    await editor.locator('[data-e="save"]').tap(); await frames();
    check(await page.evaluate(key => { const s = window[key]; return !s.mobile.editing && s.mobile._sel === null &&
      JSON.stringify(s.mobile.layout) === s.saved && localStorage.getItem('inkwave.touchLayout') === s.saved && document.activeElement === s.focus; }, key), 'Save must persist draft and restore focus');
    const lateEvents = () => page.evaluate(key => {
      const s = window[key], root = s.mobile.root, input = el => el.dispatchEvent(new Event('input', { bubbles: true }));
      const x = root.querySelector('[data-axis="x"]'), y = root.querySelector('[data-axis="y"]');
      x.value = '75'; input(x); // null selection used to throw before any other late event
      root.querySelector('[data-e="reset"]').click();
      const select = root.querySelector('select'); select.value = 'fire'; select.dispatchEvent(new Event('change', { bubbles: true }));
      const size = root.querySelector('.iwm-edit__size'); size.value = '50'; input(size);
      x.value = '100'; input(x); y.value = '0'; input(y);
      return !s.mobile.editing && s.mobile._sel === null && JSON.stringify(s.mobile.layout) === s.saved && localStorage.getItem('inkwave.touchLayout') === s.saved;
    }, key);
    check(await lateEvents(), 'late editor events after Save'); await frames();
    await page.evaluate(key => { const s = window[key]; s.focus.focus({ preventScroll: true }); s.mobile.openEditor(); }, key);
    await editor.locator('select').selectOption('jump');
    await editor.locator('.iwm-edit__size').focus();
    await page.keyboard.press(await page.evaluate(key => window[key].mobile._cfg('jump').s >= 1 ? 'Home' : 'End', key));
    check(await page.evaluate(key => JSON.stringify(window[key].mobile.layout) !== window[key].saved, key), 'Cancel requires a genuinely changed draft');
    await editor.locator('[data-e="cancel"]').tap(); await frames();
    check(await lateEvents(), 'Cancel must restore draft and reject late events'); await frames();

    await page.evaluate(key => { const s = window[key];
      menus.api.setSettings({ ...menuState().settings, touchOpacity: s.sentinelOpacity });
      menus.show('settings', { wipe: false, light: false, force: true });
    }, key);
    const reset = page.locator('.iw-settings:not(.is-leaving) [data-id="reset"]');
    await reset.scrollIntoViewIfNeeded(); await reset.tap();
    check(await page.evaluate(key => menuState().settings.touchOpacity === window[key].sentinelOpacity, key), 'first Reset press must not change data');
    await reset.tap();
    check(await page.evaluate(key => menuState().settings.touchOpacity === window[key].defaultOpacity, key), 'second active Reset press must apply defaults');
    await page.evaluate(key => { const s = window[key]; menus.api.setSettings({ ...menuState().settings, touchOpacity: s.sentinelOpacity }); }, key);
    await reset.tap();
    await page.evaluate(key => { const s = window[key];
      const retired = menus._scr.el.querySelector('[data-id="reset"]');
      menus.show('main', { wipe: false, light: false, force: true }); // actual _swap invokes actual destroy
      retired.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      retired.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      if (menus.current !== 'main' || menuState().settings.touchOpacity !== s.sentinelOpacity) throw Error('settings lifetime: retired Reset mutated current settings');
    }, key);
    await frames(); check(errors.length === 0, 'unexpected page errors: ' + errors.join('; '));
    return { editorSave: true, editorCancel: true, expandedXY: true, closedEditorEventsIgnored: true,
      activeResetDoubleConfirmation: true, retiredResetIgnored: true, pageErrors: errors };
  } finally {
    try { await page.evaluate(key => {
      const s = window[key]; if (!s) return;
      try { if (s.mobile?.editing) s.mobile._closeEditor(false); s.mobile?.destroy(); }
      finally { s.canvas?.remove();
        if (s.originalStorage === null) localStorage.removeItem('inkwave.touchLayout'); else localStorage.setItem('inkwave.touchLayout', s.originalStorage);
        if (s.hadMobileClass) document.documentElement.classList.add('iw-mobile');
        menus.api.setSettings(s.originalSettings); menus.wipe.cancel(); menus.show(s.originalScreen, { wipe: false, light: false, force: true });
        delete window[key];
      }
    }, key); } finally { page.off('pageerror', onError); }
  }
}

// Existing offline production Menus fixture only. No launch/capture or handler replacement.
async function assertBrowserModalLifetime(page) {
  return page.evaluate(async () => {
    const m = window.menus, checks = [], calls = { quit: 0, resume: 0 };
    const check = (ok, label) => { if (!ok) throw Error('modal lifetime: ' + label); checks.push(label); };
    check(window.menuReady === true && m && window.G?.net?.isMock === true && G.net.state === 'offline', 'real offline fixture is ready');
    check(Object.hasOwn(Object.getPrototypeOf(m), Symbol.for('inkwave.local-quality.menu.v1')), 'actual production installMenuQuality is installed');
    check(document.documentElement.classList.contains('iw-touch') || m.el.classList.contains('is-touch'), 'touch fixture profile is active');
    const api = m.api, original = Object.fromEntries(['quitMatch', 'resumeMatch'].map(k => [k, { own: Object.hasOwn(api, k), value: api[k] }]));
    const initialScreen = m.current;
    for (const [key, count] of [['quitMatch', 'quit'], ['resumeMatch', 'resume']]) api[key] = function (...args) {
      calls[count]++;
      return typeof original[key].value === 'function' ? Reflect.apply(original[key].value, api, args) : undefined;
    };
    const wait = async (predicate, label) => {
      const until = performance.now() + 10000;
      while (!predicate()) {
        if (performance.now() >= until) throw Error('modal lifetime timeout: ' + label);
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    };
    const opaque = el => el?.isConnected && parseFloat(getComputedStyle(el).opacity) > .99;
    try {
      m.show('pause', { force: true, wipe: false, light: false });
      check(m.current === 'pause' && m._scr?.name === 'pause', 'actual pause factory mounted');
      check(m._qualityInputGuard === true, 'actual production capture guard installed by swap');
      const quit = m._scr.el.querySelector('[data-id="quit"]');
      await wait(() => opaque(quit), 'pause action entrance');
      const open = async () => {
        quit.click();
        await wait(() => m._modal?.classList.contains('iw-modal') && opaque(m._modal), 'native confirmation entrance');
        const modal = m._modal, buttons = modal.querySelectorAll('[data-nav]');
        check(buttons.length === 2 && buttons[1].dataset.id === 'modal-1', 'native two-action confirmation');
        return { modal, cancel: buttons[0], quit: buttons[1], saved: m._binds.get(buttons[1])?.accept };
      };
      const old = await open();
      check(typeof old.saved === 'function', 'saved actual native bound callback');
      old.cancel.click();
      check(m._modal === null && m.current === 'pause' && calls.quit === 0 && calls.resume === 0, 'Cancel keeps the paused match/menu');
      check(old.modal.isConnected && old.modal.inert && old.modal.classList.contains('is-leaving') && !m._binds.has(old.quit), 'closed confirmation is inert and bindings retired immediately');
      old.quit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      old.saved('mouse');
      check(calls.quit === 0 && calls.resume === 0 && m.current === 'pause' && m._focus === quit, 'retired click and saved callback cannot quit or steal focus');
      const fresh = await open();
      await wait(() => !old.modal.isConnected, 'unmodified old 240ms removal timer');
      check(m._modal === fresh.modal && fresh.modal.isConnected && !fresh.modal.inert, 'old cleanup cannot close reopened confirmation');
      fresh.quit.click();
      fresh.quit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      fresh.saved('mouse');
      check(calls.quit === 1 && calls.resume === 0, 'fresh Quit executes once through queued repeats');
      await wait(() => m.current === 'main' && m._scr?.name === 'main' && !m.wipe?.running, 'native return to main');
      await wait(() => !fresh.modal.isConnected, 'native closed modal cleanup');
      check(m._modal === null && m._scr.el.classList.contains('iw-main'), 'no modal/input owner remains on main');
      return { checks, apiCalls: { ...calls }, viewport: [innerWidth, innerHeight], qualityCapture: true, screenshots: false, realDevice: false };
    } finally {
      for (const key of ['quitMatch', 'resumeMatch']) {
        if (original[key].own) api[key] = original[key].value;
        else delete api[key];
      }
      if (m._modal) m._closeModal(true);
      m.show(initialScreen, { force: true, wipe: false, light: false });
    }
  });
}

// Candidate for the existing screenshot-free menu-focus checker, not a new runner.
// Caller supplies one fresh, loaded production Menus fixture page per touch size.
// Real callbacks/native input events; all clipboard reads and connecting promises
// are controlled. The only passthrough is to the verified offline MockNet itself.
async function assertBrowserOnlineLifetime(page) {
  const checks = [];
  const ensure = (ok, label) => { if (!ok) throw Error(`online lifetime: ${label}`); };
  const root = '.iw-online:not(.is-leaving)';
  const code = page.locator(`${root} .iw-code-input`);
  const name = page.locator(`${root} .iw-name__input`);
  const pasteButton = page.locator(`${root} .iw-join__btns button`).first();
  const joinButton = page.locator(`${root} .iw-join__btns button`).last();
  await page.evaluate(() => {
    if (!window.menus || !window.menuState || !window.G?.net?.isMock ||
        !G.net.mock || new URL(location.href).searchParams.get('netmock') !== '1' ||
        navigator.maxTouchPoints < 1 || window.__onlineLifetimeProbe) {
      throw Error('online lifetime: requires a fresh touch offline MockNet fixture');
    }
    const net = G.net;
    const p = window.__onlineLifetimeProbe = {
      net, clips: [], calls: [], originalJoin: net.join,
      originalName: menuState().profile.name, originalMode: menus._input,
      clipboardDescriptor: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
      joinDescriptor: Object.getOwnPropertyDescriptor(net, 'join'),
      createDescriptor: Object.getOwnPropertyDescriptor(net, 'create'),
      original: false,
    };
    const pending = (list, data = {}) => new Promise((resolve, reject) => {
      list.push({ ...data, resolve, reject, settled: false });
    });
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        readText: () => pending(p.clips),
      } });
      for (const kind of ['join', 'create']) Object.defineProperty(net, kind, {
        configurable: true, writable: true, value: function (...args) {
          if (kind === 'join' && p.original) {
            p.calls.push({ kind, args, settled: true });
            return Reflect.apply(p.originalJoin, this, args);
          }
          return pending(p.calls, { kind, args });
        },
      });
    } catch (error) {
      for (const [object, key, descriptor] of [
        [navigator, 'clipboard', p.clipboardDescriptor], [net, 'join', p.joinDescriptor], [net, 'create', p.createDescriptor],
      ]) {
        if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key];
      }
      delete window.__onlineLifetimeProbe;
      throw error;
    }
  });
  const open = () => page.evaluate(() => {
    menus.wipe.cancel();
    menus.show('online', { force: true, wipe: false, light: false, instantLeave: true });
    menus.setInputMode('touch');
  });
  const paste = async () => {
    const before = await page.evaluate(() => __onlineLifetimeProbe.clips.length);
    await pasteButton.click();
    ensure(await page.evaluate(n => __onlineLifetimeProbe.clips.length === n + 1, before), 'exactly one controlled clipboard request');
    return before;
  };
  const settle = (list, index, reject, value) => page.evaluate(async ({ list, index, reject, value }) => {
    const item = __onlineLifetimeProbe[list][index];
    if (!item || item.settled) throw Error('online lifetime: invalid controlled settlement');
    item.settled = true;
    item[reject ? 'reject' : 'resolve'](reject ? Error(value) : value);
    await Promise.resolve(); await Promise.resolve();
  }, { list, index, reject, value });
  const snapshot = () => page.evaluate(() => {
    const el = menus._scr.el, input = el.querySelector('.iw-code-input');
    return { current: menus.current, code: input?.value, disabled: input?.disabled,
      mode: el.querySelector('.iw-hubcard--join')?.dataset.mode,
      error: el.querySelector('.iw-jstat')?.classList.contains('is-on'),
      title: el.querySelector('.iw-jstat b')?.textContent,
      body: el.querySelector('.iw-jstat__txt > span')?.textContent,
      focusedName: document.activeElement === el.querySelector('.iw-name__input'),
      focusedCode: document.activeElement === input,
      calls: __onlineLifetimeProbe.calls.length, reads: __onlineLifetimeProbe.clips.length };
  });
  // Test both possible production auto-submit delays (reduced 120 / normal 420 ms).
  const waitPastAutoJoin = () => page.waitForTimeout(550);
  try {
    // 1. Native code edits, name focus/edit, and native Escape each own the entry.
    await open();
    let request = await paste();
    await code.fill('NETXX');
    await settle('clips', request, false, 'BCEFG');
    ensure((await snapshot()).code === 'NETXX', 'new native edit beats old clipboard success');
    for (const reject of [false, true]) {
      await code.focus();
      request = await paste();
      await name.fill('Owner name');
      await settle('clips', request, reject, reject ? 'denied' : 'BCEFG');
      const s = await snapshot();
      ensure(s.code === 'NETXX' && s.focusedName && await name.inputValue() === 'Owner name', 'new name edit beats old clipboard response');
    }
    await code.focus();
    request = await paste();
    await code.press('Escape');
    await settle('clips', request, true, 'denied');
    let s = await snapshot();
    ensure(s.mode === 'idle' && !s.focusedCode && s.calls === 0, 'late rejection cannot reopen Escape-cancelled entry');
    // A Paste click deliberately preserves native focus. A subsequent edit of
    // that already-focused name must retire the request without a refocus.
    for (const reject of [false, true]) {
      await open(); await code.fill('NETXX'); await name.fill('Before');
      request = await paste();
      ensure((await snapshot()).focusedName, 'Paste preserves existing native name focus');
      await name.fill('Edited owner');
      await settle('clips', request, reject, reject ? 'denied' : 'BCEFG');
      s = await snapshot();
      ensure(s.code === 'NETXX' && s.focusedName && await name.inputValue() === 'Edited owner', 'already-focused name input retires old clipboard response');
    }
    checks.push('online: native edit/name focus/name input/Escape retire stale clipboard success and rejection');

    // 2. Two actual Paste callbacks, settled newest first; no touch auto-submit.
    await open();
    const older = await paste(), newer = await paste();
    await settle('clips', newer, false, 'NETXX');
    await settle('clips', older, false, 'BCEFG');
    await waitPastAutoJoin();
    s = await snapshot();
    ensure(s.code === 'NETXX' && s.calls === 0, 'newest Paste wins and touch still requires explicit JOIN');
    checks.push('online: out-of-order Paste preserves newest code and touch explicit submission');

    // 3. The submitted join owns state across its controlled failure and old read.
    request = await paste();
    await joinButton.click();
    s = await snapshot();
    ensure(s.disabled && s.mode === 'connecting' && s.calls === 1, 'actual JOIN enters busy state exactly once');
    const busyReads = s.reads;
    await pasteButton.click();
    // A real document paste event also must not mutate the disabled code.
    await page.evaluate(() => {
      document.activeElement?.blur();
      const data = new DataTransfer(); data.setData('text/plain', 'BCEFG');
      document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    });
    s = await snapshot();
    ensure(s.reads === busyReads && s.code === 'NETXX' && s.calls === 1, 'busy Paste starts no read and cannot overwrite disabled entry');
    await settle('calls', 0, true, 'Could not connect');
    const error = await snapshot();
    ensure(error.mode === 'error' && error.error && error.title && error.body && !error.disabled, 'actual join rejection restores editable, explained error');
    await settle('clips', request, false, 'BCEFG');
    s = await snapshot();
    ensure(s.code === 'NETXX' && s.mode === 'error' && s.error && s.title === error.title && s.body === error.body && s.calls === 1, 'old clipboard cannot clear submitted code or post-error notice');
    checks.push('online: busy and post-error ownership reject stale clipboard writes');

    // 4. Intentionally exercise the keyboard document-paste timer on a touch page.
    // Cancellation and focus happen in the same browser task, before its 120 ms
    // timer can fire even on a slow CI host. Native input focus fires the guard.
    for (const cancel of ['name', 'Escape']) {
      await open();
      await page.evaluate(cancel => {
        document.activeElement?.blur();
        const data = new DataTransfer(); data.setData('text/plain', 'BCEFG');
        document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
        const el = menus._scr.el;
        if (cancel === 'name') el.querySelector('.iw-name__input').focus();
        else {
          const input = el.querySelector('.iw-code-input'); input.focus();
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        }
      }, cancel);
      s = await snapshot();
      ensure(s.code === 'BCEFG' && (cancel === 'name' ? s.focusedName : s.mode === 'idle'), 'keyboard paste reached actual entry before cancellation');
      await waitPastAutoJoin();
      ensure((await snapshot()).calls === 1, 'superseded keyboard auto-join never submits');
    }
    // Finally restore the actual offline implementation for its normal valid flow.
    await open();
    await page.evaluate(() => { __onlineLifetimeProbe.original = true; });
    await code.fill('bcefg');
    await waitPastAutoJoin();
    ensure((await snapshot()).code === 'BCEFG' && (await snapshot()).calls === 1, 'native valid entry sanitizes and remains explicit-submit');
    await joinButton.click();
    await page.waitForFunction(() => menus.current === 'lobby' && G.net.isMock && G.net.state === 'lobby' && G.net.code === 'BCEFG');
    ensure(await page.evaluate(() => {
      const p = __onlineLifetimeProbe, call = p.calls.at(-1);
      return p.calls.length === 2 && call.kind === 'join' && call.args[0] === 'BCEFG' && G.net === p.net;
    }), 'normal valid JOIN reaches the actual offline lobby exactly once');
    checks.push('online: newer name/Escape cancel queued auto-join while normal MockNet JOIN still succeeds');
    return checks;
  } finally {
    await page.evaluate(async () => {
      const p = window.__onlineLifetimeProbe;
      if (!p) return;
      try {
        menus.wipe.cancel();
        menus.show('main', { force: true, wipe: false, light: false, instantLeave: true });
        p.net.leave();
        for (const item of [...p.clips, ...p.calls]) if (!item.settled) {
          item.settled = true; item.reject(Error('probe cleanup'));
        }
        await Promise.resolve(); await Promise.resolve();
      } finally {
        for (const [object, key, descriptor] of [
          [navigator, 'clipboard', p.clipboardDescriptor], [p.net, 'join', p.joinDescriptor], [p.net, 'create', p.createDescriptor],
        ]) {
          if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key];
        }
        menus.api.setProfileName?.(p.originalName);
        menus.setInputMode(p.originalMode);
        delete window.__onlineLifetimeProbe;
      }
    });
  }
}


// Called once per already-installed, English, hasTouch context by the existing
// screenshot-free menu-focus runner. This never launches a browser or a game.
async function assertBrowserGearPractice(page) {
  const viewport = page.viewportSize(), checks = [], labels = [];
  assert(viewport && [[844, 390], [1133, 744]].some(([w, h]) => w === viewport.width && h === viewport.height), 'canonical landscape viewport required');
  const settle = async () => {
    await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise((_, reject) => setTimeout(() => reject(Error('menu font readiness timeout')), 10000))]); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
  };
  const check = (ok, name, detail) => { assert(ok, name + (detail ? ': ' + JSON.stringify(detail) : '')); checks.push(name); };
  try {
    await page.evaluate(async () => {
      if (!window.menus || !window.G || !window.menuState || document.documentElement.lang !== 'en' || navigator.maxTouchPoints < 1 || typeof window.fixtureClippingVisibility !== 'function') throw Error('real English touch menu fixture and verified clipping helper required');
      if (window.__gearPracticeAudit) throw Error('gear/practice audit must not be reapplied');
      const m = window.menus, api = m.api;
      const a = window.__gearPracticeAudit = { loadouts: 0, resumes: 0, equips: [], keys: [], match: G.match, setLoadout: api.setLoadout, resumeMatch: api.resumeMatch, kit: localStorage.getItem('inkwave.catalogue-kit.v1'), pause: m.constructor.prototype._scr_pause, mode: m.constructor.prototype._scr_mode };
      api.setLoadout = function (...args) { a.loadouts++; return Reflect.apply(a.setLoadout, this, args); };
      api.resumeMatch = function (...args) { a.resumes++; return a.resumeMatch ? Reflect.apply(a.resumeMatch, this, args) : undefined; };
      a.capture = e => { if (['Enter', ' ', 'Tab'].includes(e.key)) queueMicrotask(() => a.keys.push({ key: e.key, prevented: e.defaultPrevented })); };
      document.addEventListener('keydown', a.capture, true);
      m.wipe.cancel(); m.setInputMode('touch'); m.show('loadout', { wipe: false, light: false, force: true });
      const card = [...m._scr.el.querySelectorAll('.iw-wcard')].find(c => c._wid && c._wid !== menuState().loadout.weapon && !c.hidden);
      if (!card) throw Error('different real background weapon required');
      m._setFocus(card, { snap: true });
    });
    await settle();
    const summary = page.locator('details.s3-gear > summary'), reset = page.locator('details.s3-gear .s3-catalogue button');
    check(await summary.count() === 1 && await reset.count() === 1, 'real gear summary and catalogue reset exist');
    const press = async (control, key) => { await control.scrollIntoViewIfNeeded(); await control.focus(); await page.keyboard.press(key); await settle(); };
    await press(summary, 'Enter');
    assert(await summary.evaluate(e => e.parentElement.open), 'summary Enter must open details');
    await press(summary, 'Space');
    assert(await summary.evaluate(e => !e.parentElement.open), 'summary Space must close details');
    check(await page.evaluate(() => __gearPracticeAudit.loadouts === 0 && __gearPracticeAudit.keys.every(e => !e.prevented)), 'summary Enter/Space retain defaults without background equip');
    await press(summary, 'Enter'); await press(summary, 'Tab');
    check(await page.evaluate(() => document.activeElement?.matches('select') && document.activeElement.closest('details.s3-gear') && __gearPracticeAudit.loadouts === 0 && __gearPracticeAudit.keys.every(e => !e.prevented)), 'summary Tab reaches native gear form without menu routing');
    const select = page.locator('details.s3-gear .s3-catalogue select').first();
    const base = await select.inputValue(), other = await select.evaluate((e, base) => [...e.options].find(o => o.value !== base)?.value, base);
    assert(other, 'real alternate kit option required');
    for (const key of ['Enter', 'Space']) {
      await select.selectOption(other);
      assert(await page.evaluate(() => !!JSON.parse(localStorage.getItem('inkwave.catalogue-kit.v1') || '{}')[menuState().loadout.weapon]), 'custom kit must persist before reset');
      await press(reset, key);
      assert.equal(await select.inputValue(), base, 'native reset must restore the standard sub');
      assert(await page.evaluate(() => !JSON.parse(localStorage.getItem('inkwave.catalogue-kit.v1') || '{}')[menuState().loadout.weapon]), 'native reset must remove custom kit');
    }
    await press(reset, 'Tab');
    check(await page.evaluate(() => document.activeElement?.matches('select') && document.activeElement.closest('details.s3-gear') && __gearPracticeAudit.loadouts === 0 && __gearPracticeAudit.keys.every(e => !e.prevented)), 'reset Enter/Space/Tab retain native action/focus without background equip');

    await page.evaluate(async () => {
      const href = '/patches/practice-range/styles/range.css';
      if (![...document.styleSheets].some(s => s.href && new URL(s.href).pathname === href)) {
        await new Promise((resolve, reject) => { const link = document.createElement('link'); const timer = setTimeout(() => reject(Error('real range stylesheet timeout')), 10000); link.rel = 'stylesheet'; link.href = href; link.onload = () => { clearTimeout(timer); resolve(); }; link.onerror = () => { clearTimeout(timer); reject(Error('real range stylesheet failed')); }; document.head.append(link); });
      }
      const sheets = [...document.styleSheets].filter(s => s.href).map(s => new URL(s.href).pathname);
      if (sheets.indexOf(href) <= sheets.indexOf('/patches/splatoon3/ui.css')) throw Error('production range stylesheet must follow the three menu sheets');
      const m = window.menus, a = window.__gearPracticeAudit;
      const range = await import('/patches/practice-range/runtime/menu.mjs');
      range.installRangeMenus(m.constructor); a.installedRange = true;
      // Bounded offline API fixture, not a game/session implementation or a
      // substituted factory. The real rangePause closure owns all rendered DOM.
      a.session = { local: { weaponId: 'shooter' }, movingTargets: false, setWeapon(id) { a.equips.push(id); this.local.weaponId = id; }, setMovingTargets(on) { this.movingTargets = on; } };
      G.match = { attract: false, range: a.session };
      m.wipe.cancel(); m.setInputMode('touch'); m.show('pause', { wipe: false, light: false, force: true });
    });
    await page.locator('.iwr-tab[data-tab="weapon"]').tap(); await settle();
    const inventory = await page.evaluate(async () => {
      await Promise.race([document.fonts.load('900 12px Rubik', 'Heavy Edit Splatling Nouveau'), new Promise((_, reject) => setTimeout(() => reject(Error('shipped Rubik load timeout')), 10000))]);
      const { WEAPONS, WEAPON_ORDER } = await import('/src/config.js');
      const chips = [...menus._scr.el.querySelectorAll('.iwr-wchip')];
      return { expected: WEAPON_ORDER.length, actual: chips.length, exact: chips.every(c => c.querySelector('b')?.textContent === WEAPONS[c.dataset.id.slice(2)]?.name), font: document.fonts.check('900 12px Rubik') && [...document.fonts].some(f => /Rubik/.test(f.family) && f.status === 'loaded'), factory: menus._scr.el.classList.contains('iwr-pausescr') };
    });
    check(inventory.factory && inventory.expected > 100 && inventory.actual === inventory.expected && inventory.exact && inventory.font, 'actual range factory builds complete English inventory with shipped Rubik', inventory);
    const ids = ['s3-spinner-downpour-01', 's3-spinner-hypershort-01'];
    for (const id of ids) {
      const chip = page.locator(`.iwr-wchip[data-id="w-${id}"]`);
      assert.equal(await chip.count(), 1, 'known long English weapon must exist');
      await chip.evaluate(c => c.scrollIntoView({ block: 'center', inline: 'nearest' })); await page.mouse.move(1, 1); await settle();
      const box = await chip.evaluate(c => {
        const name = c.querySelector('b'), meta = c.querySelector('small'), icon = c.querySelector('.iwr-wchip__icon'), s = getComputedStyle(name);
        const r = name.getBoundingClientRect(), cr = c.getBoundingClientRect(), mr = meta.getBoundingClientRect(), ir = icon.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(name);
        const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
        const clip = window.fixtureClippingVisibility(name);
        const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
        return { text: name.textContent, clamp: s.webkitLineClamp, display: s.display, overflow: s.overflowY, height: name.clientHeight, scroll: name.scrollHeight, lines: rects.length, fullText: rects.length > 0 && rects.every(q => q.left >= r.left - 1 && q.right <= r.right + 1 && q.top >= r.top - 1 && q.bottom <= r.bottom + 1), separated: ir.bottom <= r.top + 1 && r.bottom <= mr.top + 1 && mr.bottom <= cr.bottom + 1, unclipped: clip.unclipped === true && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, clippedBy: clip.clippedBy, hit: !!hit && (hit === c || c.contains(hit)), bodyOverflow: document.body.scrollWidth > innerWidth + 1 };
      });
      assert(box.text.endsWith('Splatling Nouveau') && box.clamp === 'none' && box.display === 'block' && box.overflow === 'visible' && box.height + 1 >= box.scroll && box.fullText && box.separated && box.unclipped && box.hit && !box.bodyOverflow, 'entire long practice name must be unclamped, visible and separated: ' + JSON.stringify(box));
      labels.push({ id, text: box.text, lines: box.lines });
    }
    checks.push('both proven long English practice names are rendered in full without clipping');
    const category = await page.locator(`.iwr-wchip[data-id="w-${ids[1]}"]`).getAttribute('data-cat');
    await page.locator(`.iwr-filter[data-cat="${category}"]`).tap(); await settle();
    const filter = await page.evaluate(cat => [...menus._scr.el.querySelectorAll('.iwr-wchip')].every(c => c.hidden === (c.dataset.cat !== cat)) && !!menus._scr.el.querySelector(`.iwr-filter.is-on[data-cat="${cat}"]`), category);
    check(filter, 'real practice class filter preserves exact visibility membership');
    const chosen = page.locator(`.iwr-wchip[data-id="w-${ids[1]}"]`);
    await chosen.evaluate(c => c.scrollIntoView({ block: 'center', inline: 'nearest' })); await chosen.tap(); await settle();
    assert(await page.evaluate(id => __gearPracticeAudit.equips.length === 1 && __gearPracticeAudit.equips[0] === id && __gearPracticeAudit.session.local.weaponId === id && __gearPracticeAudit.resumes === 1 && menus.current === null, ids[1]), 'real chip must equip once and use real resume/close path');
    await page.evaluate(() => { menus.wipe.cancel(); menus.setInputMode('touch'); menus.show('pause', { wipe: false, light: false, force: true }); });
    await settle();
    check(await page.evaluate(id => menus._scr.el.classList.contains('iwr-pausescr') && menus._scr.el.querySelector('.iwr-tab.is-on')?.dataset.tab === 'weapon' && !!menus._scr.el.querySelector(`.iwr-wchip.is-on[data-id="w-${id}"]`) && [...menus._scr.el.querySelectorAll('.iwr-wchip')].every(c => !c.hidden) && menus._scr.el.querySelector('.iwr-cur__txt > b')?.textContent === menus._scr.el.querySelector(`.iwr-wchip[data-id="w-${id}"] b`)?.textContent, ids[1]), 'equip/resume/reopen retains equipped name and restores complete all-filter inventory');
    return { viewport, checks, labels, scope: 'actual emitted menu DOM and native keys; bounded offline range API, not gameplay' };
  } finally {
    await page.evaluate(() => {
      const a = window.__gearPracticeAudit; if (!a) return;
      document.removeEventListener('keydown', a.capture, true);
      const m = window.menus; m.api.setLoadout = a.setLoadout;
      if (a.resumeMatch) m.api.resumeMatch = a.resumeMatch; else delete m.api.resumeMatch;
      if (a.installedRange) { m.constructor.prototype._scr_pause = a.pause; m.constructor.prototype._scr_mode = a.mode; }
      G.match = a.match;
      if (a.kit === null) localStorage.removeItem('inkwave.catalogue-kit.v1'); else localStorage.setItem('inkwave.catalogue-kit.v1', a.kit);
      m.wipe.cancel(); m.show('loadout', { wipe: false, light: false, force: true });
      delete window.__gearPracticeAudit;
    });
  }
}

// Candidate-only rendered ownership checks. Existing focus assertions stay intact.
async function assertRenderedOwnerLifetimes(browser, server, source, manifest, cases) {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const required = ['src/ui/menus.js', 'styles/ui.css', 'styles/mobile.css',
    'patches/splatoon3/ui.css', 'patches/splatoon3/runtime/install.mjs',
    'patches/splatoon3/profile.json', 'patches/local-quality/menu.mjs', 'src/core/mobile.js',
    'patches/practice-range/runtime/menu.mjs', 'patches/practice-range/styles/range.css',
    'patches/splatoon3/runtime/content-language.mjs'];
  for (const viewport of [{width:844,height:390},{width:1133,height:744}]) {
    const row = {viewport, status:'running', checks:{}, consumed:[], resourceErrors:[], pageErrors:[]};
    cases.push(row);
    const context = await browser.newContext({viewport, hasTouch:true, reducedMotion:'reduce'});
    try {
      await context.addInitScript({content:'window.fixtureClippingVisibility = '+clippingVisibility.toString()+';'});
      await context.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({lang:'en'})));
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        row.resourceErrors.push('external request blocked: ' + url.origin + url.pathname);
        return route.abort();
      });
      await context.routeWebSocket('**/*', ws => { row.resourceErrors.push('unexpected websocket'); ws.close(); });
      const page = await context.newPage(), pending = [], consumed = new Set();
      page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
      page.on('pageerror', error => row.pageErrors.push(error.message));
      page.on('requestfailed', request => row.resourceErrors.push('request failed: ' + request.url() + ' ' + request.failure()?.errorText));
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin !== origin) return;
        const key = decodeURIComponent(url.pathname).slice(1);
        if (response.status() >= 400) row.resourceErrors.push(response.status() + ': ' + key);
        if (key === '__menus') return; // The one explicit inline fixture document.
        if (!Object.hasOwn(manifest.artifacts, key)) {
          row.resourceErrors.push('unmanifested same-origin resource: ' + key);
          return;
        }
        pending.push(response.body().then(bytes => {
          assert.equal(response.status(), 200, 'owner resource ' + key);
          assert.equal(hash(bytes), manifest.artifacts[key], 'owner consumed production bytes ' + key);
          consumed.add(key);
        }).catch(error => row.resourceErrors.push(key + ': ' + error.message)));
      });
      await page.goto(origin + '/__menus?owners=1&netmock=1&mockauto=0&mocklat=0&news=0');
      await page.waitForFunction(() => window.menuReady && window.G?.net?.isMock === true);
      await page.evaluate(async () => {
        const [config, {LANG}, {localizeGameContent}] = await Promise.all([
          import('/src/config.js'), import('/src/i18n.js'), import('/patches/splatoon3/runtime/content-language.mjs')]);
        if (LANG !== 'en' || document.documentElement.lang !== 'en') throw Error('owner fixture language unavailable');
        localizeGameContent({...config, LANG});
        menuState().settings.lang = 'en';
        menus.setInputMode('touch');
        if (navigator.maxTouchPoints < 1 || !menus.el.classList.contains('is-touch')) throw Error('native touch profile unavailable');
      });
      await page.mouse.move(0, 0);
      row.checks.settings = await assertBrowserSettingsLifetime(page);
      row.checks.modal = await assertBrowserModalLifetime(page);
      row.checks.online = await assertBrowserOnlineLifetime(page);
      row.checks.gearPractice = await assertBrowserGearPractice(page);
      assert(['editorSave','editorCancel','expandedXY','closedEditorEventsIgnored','activeResetDoubleConfirmation','retiredResetIgnored'].every(key => row.checks.settings[key] === true), 'settings ownership checks incomplete');
      assert(row.checks.modal.qualityCapture && row.checks.modal.apiCalls.quit === 1 && row.checks.modal.checks.length >= 10, 'modal ownership checks incomplete');
      assert.equal(row.checks.online.length, 4, 'online ownership groups incomplete');
      assert(row.checks.gearPractice.checks.length >= 8 && row.checks.gearPractice.labels.length === 2, 'gear/practice checks incomplete');
      row.font = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = await document.fonts.load('900 12px Rubik');
        return {status:document.fonts.status, count:loaded.length, check:document.fonts.check('900 12px Rubik')};
      });
      assert.equal(row.font.status, 'loaded');
      assert(row.font.count > 0 && row.font.check, 'real shipped practice label font unavailable');
      await page.waitForLoadState('networkidle', {timeout:10000});
      await Promise.all(pending);
      row.consumed = [...consumed].sort();
      for (const file of required) {
        assert(consumed.has(file), 'owner required production input not consumed: ' + file);
        assert.equal(hash(fs.readFileSync(path.join(source, file))), manifest.artifacts[file], 'owner resource changed ' + file);
      }
      assert.deepEqual(row.resourceErrors, []);
      assert.deepEqual(row.pageErrors, []);
      row.status = 'passed';
    } catch (error) { row.status = 'failed'; row.error = error.stack; throw error; }
    finally { await context.close(); }
  }
  return cases;
}


const result = { status: 'pending', baseCommit: pins.baseCommit, sourceSha: process.env.SOURCE_SHA || null, contentHash: manifest.contentHash, source, manifestSha256: hash(manifestBytes), inputHash: manifest.inputHash, revision: manifest.build.revision, menuLayoutEpoch, menuInstallerEpoch, emitted, errors: [], checks: [] };
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
  result.checks = await page.evaluate(menuEpoch => {
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
    show('mode');
    const mode=menus._scr,modeRow=mode.el.querySelector('.iw-modesel__row');
    const modeCards=[...modeRow.querySelectorAll('.iw-mode')];
    check(modeCards.length>=6,'production mode catalogue supplies the real six-rule grid');
    menus._input='touch';
    const columns=modeRow.style.gridTemplateColumns;
    modeRow.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';
    menus._setFocus(modeCards[0],{snap:true});
    check(mode.onNav('down')===true&&menus._focus===modeCards[3],'mode navigation uses the mounted three-column grid');
    modeRow.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
    menus._setFocus(modeCards[0],{snap:true});
    check(mode.onNav('down')===true&&menus._focus===modeCards[2],'cached mode nodes still read responsive column changes');
    menus._setFocus(modeCards[1],{snap:true});mode.onNav('right');
    check(menus._focus===modeCards[1],'horizontal mode navigation retains row boundaries');
    const auditModeOwnership = () => {
      const parent=modeRow.parentNode,next=modeRow.nextSibling;
      menus._setFocus(modeCards[0],{snap:true});
      let graphCount=audit.graphNavigation.length;
      modeRow.remove();
      if(menuEpoch==='a1381283-screen-owned-caches'){
        mode.onNav('right');
        check(audit.graphNavigation.length===graphCount+1&&menus._focus===modeCards[0],'disconnected cached row delegates native graph without disconnected focus');
        parent.insertBefore(modeRow,next);
        const moved=modeCards.at(-1);mode.el.appendChild(moved);
        graphCount=audit.graphNavigation.length;mode.onNav('down');
        check(audit.graphNavigation.length===graphCount+1,'reparented cached card delegates the native graph');
        modeRow.appendChild(moved);
      }else if(menuEpoch==='historical-stage-picker'){
        let missingRowError;
        try{mode.onNav('right');}catch(error){missingRowError=error;}
        check(missingRowError instanceof TypeError&&audit.graphNavigation.length===graphCount&&menus._focus===modeCards[0],'historical detached row preserves prior TypeError');
        parent.insertBefore(modeRow,next);
        const moved=modeCards.at(-1);mode.el.appendChild(moved);
        graphCount=audit.graphNavigation.length;
        check(mode.onNav('down')===true&&menus._focus===modeCards[2]&&audit.graphNavigation.length===graphCount,'historical reparented card uses the live grid');
        modeRow.appendChild(moved);
      }else throw Error('Unknown menu-layout source epoch: '+menuEpoch);
    }; // End epoch-specific mode ownership audit
    auditModeOwnership();modeRow.style.gridTemplateColumns=columns;
    let graphCount;
    menus._setFocus(null);graphCount=audit.graphNavigation.length;mode.onNav('left');
    check(audit.graphNavigation.length===graphCount+1&&menus._focus===null,'absent mode focus delegates native graph');
    show('loadout');show('mode');
    check(menus._scr!==mode&&menus._scr.el.contains(menus._focus),'replacement mode screen owns its initial focus and cache');
    check(audit.destroyedCallbacks.length === 0 && audit.screens.filter(x => x !== audit.screens.at(-1)).every(x => x.destroyed), 'all outgoing screens destroyed without late focus callbacks');
    check(audit.screens.every(row => row.owned && row.mounted), 'every observed focus callback belongs to its mounted screen');
    return checks;
  },menuLayoutEpoch.epoch);
  result.consumed = [...new Set(await Promise.all(responses))].sort();
  assert.deepEqual(result.consumed, [...files].sort(), 'All pinned runtime inputs actually consumed');
  assert.deepEqual(result.errors, []);
  for (const file of files) assert.equal(hash(fs.readFileSync(path.join(source, file))), emitted[file], `Unchanged after browser: ${file}`);
  assert.equal(hash(fs.readFileSync(manifestPath)), result.manifestSha256);
  result.ownerChecks = [];
  await assertRenderedOwnerLifetimes(browser, server, source, manifest, result.ownerChecks);
  result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = error.stack; process.exitCode = 1; }
finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(evidence, 'menu-focus-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}

