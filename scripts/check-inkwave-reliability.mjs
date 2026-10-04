#!/usr/bin/env node
// Focused built-module browser proof. Native taps in both engines, native
// multitouch drags in Chromium and DOM pointer routing in WebKit. No physical
// iPad, deployed release, live relay, or full renderer claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const option = name => { const i = process.argv.indexOf(name); assert(i >= 0 && process.argv[i + 1], 'Required ' + name); return path.resolve(process.argv[i + 1]); };
const site = option('--site'), evidence = option('--evidence-dir'), cache = option('--profile-dir');
const physical = p => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
for (const dir of [evidence, cache]) { assert(physical(dir).startsWith('/mnt/workspace/'), 'Persistent workspace required'); fs.mkdirSync(dir, { recursive: true }); }
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
assert.equal(hash(JSON.stringify(manifest.files)), manifest.inputHash);
for (const [file, expected] of Object.entries(manifest.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), expected, file);
assert(manifest.build.reliability && Object.keys(manifest.build.reliability).length >= 7, 'Reliability adapters bound to build');

const fixture = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css">
<style>html,body{margin:0;overflow:hidden;background:#0d1020;touch-action:none}canvas{width:100vw;height:100vh}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><canvas id="game"></canvas><script type="module">
import * as THREE from 'three';
import { Input } from '/src/core/input.js';
import { PlayerController } from '/src/game/player.js';
import { Match } from '/src/game/match.js';
import { G } from '/src/core/ctx.js';
import { DEFAULT_SETTINGS } from '/src/config.js';
import { installClock,runSimulation } from '/patches/splatoon3/runtime/clock.mjs';
import { NetSession } from '/src/net/session.js';
import { HUD } from '/src/ui/hud.js';
window.input=new Input(document.getElementById('game'));window.mobile=input.mobile;
input.lastDevice='touch';mobile.setVisible(true);
G.settings={...DEFAULT_SETTINGS,aimAssist:0,aimAssistMouse:false};
const actor={intent:{move:new THREE.Vector3()},alive:true,team:0,canSuperJump:()=>false};
window.rig={yaw:0,pitch:0,mode:'follow',target:actor};
window.controller=new PlayerController(actor,rig,input);controller.computeAim=()=>{};
G.rig=rig;G.projectiles={update(){}};
window.intents=[];const match={state:'playing',local:actor,controller,updateController(dt){controller.update(dt);},update(){intents.push({...actor.intent,move:actor.intent.move.toArray()});}};
window.sim={input,rig,match,showcase:{},_padMenus(){}};installClock({G});
window.advance=dt=>runSimulation(sim,dt);window.G=G;window.Match=Match;window.NetSession=NetSession;window.HUD=HUD;window.ready=true;
</script></html>`;
const receipts = {}, errors = [];
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/__reliability') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(fixture); return; }
    const rel = decodeURIComponent(pathname).slice(1), file = path.resolve(site, rel);
    assert(file.startsWith(site + path.sep)); const bytes = fs.readFileSync(file);
    assert.equal(hash(bytes), manifest.artifacts[rel], 'Loaded artifact ' + rel); receipts[rel] = hash(bytes);
    response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); response.end(bytes);
  } catch (error) { response.writeHead(404); response.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/__reliability`;
const { chromium, webkit, devices } = createRequire(import.meta.url)('playwright');
const report = { status: 'running', contentHash: manifest.contentHash, inputHash: manifest.inputHash, reliability: manifest.build.reliability, physicalIPadVerified: false, liveRelayVerified: false, fullGameRendererVerified: false, cases: [], receipts, errors };
try {
  for (const engineName of ['chromium', 'webkit']) {
    const dir = path.join(cache, engineName); fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
    const context = await { chromium, webkit }[engineName].launchPersistentContext(path.join(dir, 'profile'), {
      ...devices['iPad Mini landscape'], viewport: { width: 1024, height: 768 }, headless: true,
      artifactsDir: path.join(dir, 'artifacts'), downloadsPath: path.join(dir, 'downloads'),
      ...(engineName === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}),
    });
    try {
      const page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(engineName + ': ' + error.message));
      await page.goto(url); await page.waitForFunction(() => window.ready);
      const entry = { engine: engineName, viewport: { width: 1024, height: 768 }, checks: [], dragEvents: engineName === 'chromium' ? 'native-CDP-touch' : 'DOM-PointerEvent' }; report.cases.push(entry);
      const cdp = engineName === 'chromium' ? await context.newCDPSession(page) : null;
      const gesture = async (type, points) => {
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ id: p.id, x: p.x, y: p.y, radiusX: 2, radiusY: 2, force: 1 })) });
        else await page.evaluate(({ type, points }) => {
          const pointers = window.testPointers || (window.testPointers = new Map());
          if (type === 'touchEnd' || type === 'touchCancel') {
            for (const [id, p] of pointers) if (!points.some(q => q.id === id)) { mobile.root.dispatchEvent(new PointerEvent(type === 'touchEnd' ? 'pointerup' : 'pointercancel', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id, clientX: p.x, clientY: p.y })); pointers.delete(id); }
          } else for (const p of points) {
            const isNew = !pointers.has(p.id), target = isNew ? document.elementFromPoint(p.x, p.y) : mobile.root;
            target.dispatchEvent(new PointerEvent(isNew ? 'pointerdown' : 'pointermove', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: p.id, clientX: p.x, clientY: p.y })); pointers.set(p.id, p);
          }
        }, { type, points });
      };
      const reset = () => page.evaluate(() => { mobile.reset(); mobile.layout = {}; mobile.s.stickMode = 'float'; mobile.s.fireAim = true; mobile._layoutAll(); sim.s3Clock?.reset(); intents.length = 0; });
      const look = () => page.evaluate(() => [mobile.lookDX, mobile.lookDY]);
      await reset();
      await gesture('touchStart', [{ id: 1, x: 470, y: 200 }]); await gesture('touchMove', [{ id: 1, x: 690, y: 230 }]);
      assert.deepEqual(await look(), [0, 0], 'Left-start gap crossing right cannot aim'); await gesture('touchEnd', []);
      await reset();
      await gesture('touchStart', [{ id: 1, x: 740, y: 200 }]); await gesture('touchMove', [{ id: 1, x: 430, y: 240 }]);
      assert((await look())[0] < 0, 'Right-start drag keeps aiming after crossing left'); await gesture('touchEnd', []);
      entry.checks.push('right-half-start-ownership-across-center');
      await reset();
      await gesture('touchStart', [{ id: 1, x: 160, y: 450 }]);
      await gesture('touchStart', [{ id: 1, x: 160, y: 450 }, { id: 2, x: 260, y: 260 }]);
      await gesture('touchMove', [{ id: 1, x: 200, y: 440 }, { id: 2, x: 650, y: 290 }]);
      assert.deepEqual(await look(), [0, 0], 'Second left-start finger cannot become look'); assert(await page.evaluate(() => Math.hypot(mobile.moveX, mobile.moveY) > 0));
      await gesture('touchEnd', []); entry.checks.push('left-stick-and-second-left-finger-isolation');
      await reset();
      const fire = await page.evaluate(() => mobile._box('fire'));
      await gesture('touchStart', [{ id: 1, x: 160, y: 450 }]);
      await gesture('touchStart', [{ id: 1, x: 160, y: 450 }, { id: 2, x: fire.x, y: fire.y }]);
      await gesture('touchMove', [{ id: 1, x: 200, y: 440 }, { id: 2, x: fire.x - 80, y: fire.y - 25 }]);
      assert(await page.evaluate(() => mobile.down('fire') && mobile.lookDX < 0 && Math.hypot(mobile.moveX, mobile.moveY) > 0));
      await gesture('touchMove', [{ id: 1, x: 200, y: 440 }, { id: 2, x: 350, y: fire.y - 40 }]);
      await page.evaluate(() => advance(1 / 60));
      assert(await page.evaluate(() => intents.at(-1).fire && rig.yaw > 0 && intents.at(-1).move.some(v => v !== 0)), 'Real controller simultaneously moves, fires, and turns');
      await gesture('touchEnd', []); await page.evaluate(() => advance(1 / 60));
      assert.equal(await page.evaluate(() => intents.at(-1).fire), false); entry.checks.push('held-fire-drag-capture-and-controller-aim-with-stick');
      await reset(); await page.evaluate(() => { mobile.s.fireAim = false; });
      await gesture('touchStart', [{ id: 1, x: fire.x, y: fire.y }]); await gesture('touchMove', [{ id: 1, x: fire.x - 80, y: fire.y - 25 }]);
      assert.deepEqual(await look(), [0, 0]); assert(await page.evaluate(() => mobile.down('fire'))); await gesture('touchEnd', []);
      await reset(); await page.evaluate(() => { mobile.openEditor(); mobile._layoutPosition('fire', 330, 300); mobile._closeEditor(true); });
      const movedFire = await page.evaluate(() => mobile._box('fire'));
      await gesture('touchStart', [{ id: 1, x: movedFire.x, y: movedFire.y }]); await gesture('touchMove', [{ id: 1, x: movedFire.x + 80, y: movedFire.y + 20 }]);
      assert(await page.evaluate(() => mobile.down('fire') && mobile.lookDX > 0), 'Relocated left-side explicit fire still aims'); await gesture('touchEnd', []);
      entry.checks.push('fire-aim-setting-and-relocated-button-exception');
      await reset();
      for (const id of ['jump', 'squid', 'fire', 'sub', 'special']) {
        await page.locator('[data-c="' + id + '"]').tap();
        assert(await page.evaluate(id => mobile.wasPressed(id) && !mobile.down(id), id), 'Native completed tap retained');
        await page.evaluate(() => advance(1 / 120)); assert.equal(await page.evaluate(() => intents.length), 0);
        await page.evaluate(() => advance(1 / 120)); assert(await page.evaluate(id => intents.at(-1)[id], id));
        await page.evaluate(() => advance(1 / 60)); assert.equal(await page.evaluate(id => intents.at(-1)[id], id), false);
        await reset();
      }
      entry.checks.push('native-five-button-taps-survive-render-only-frame-and-consume-once');
      await page.locator('[data-c="fire"]').tap(); await page.evaluate(() => { mobile.jumpTarget = 2; window.dispatchEvent(new Event('blur')); });
      assert.deepEqual(await page.evaluate(() => ({ edges: [...mobile.pressed], target: mobile.jumpTarget, look: [mobile.lookDX, mobile.lookDY] })), { edges: [], target: -1, look: [0, 0] });
      await page.evaluate(() => advance(1 / 60)); assert.equal(await page.evaluate(() => intents.at(-1).fire), false);
      entry.checks.push('focus-loss-cancels-pending-touch-action-and-jump-target');
      const network = await page.evaluate(async () => {
        const real = { WebSocket, setTimeout, clearTimeout, setInterval, clearInterval }, sockets = [], timers = new Map(); let seq = 0;
        window.setTimeout = (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id; };
        window.clearTimeout = id => timers.delete(id); window.setInterval = window.setTimeout; window.clearInterval = window.clearTimeout;
        window.WebSocket = class { static OPEN = 1; constructor() { this.readyState = 1; sockets.push(this); } send() {} close() { this.readyState = 3; } };
        try {
          const net = new NetSession();
          const cancelled = net.join('BC234', 'Old').catch(error => error.name);
          const oldTimeout = [...timers.values()].find(t => t.ms === 8000).fn;
          const savedWelcome = sockets[0].onmessage; net.leave();
          const joined = net.join('BC235', 'New');
          sockets[1].onmessage({ data: JSON.stringify({ t: 'welcome', id: 'new', host: 'new', members: [{ id: 'new', name: 'New' }] }) });
          await joined; oldTimeout(); savedWelcome({ data: JSON.stringify({ t: 'welcome', id: 'old', host: 'old', members: [] }) }); await Promise.resolve();
          const result = { cancelled: await cancelled, state: net.state, code: net.code, id: net.myId, socketOpen: net.tr?.open };
          net.leave(); result.remainingTimers = timers.size; return result;
        } finally { Object.assign(window, real); }
      });
      assert.deepEqual(network, { cancelled: 'AbortError', state: 'lobby', code: 'BC235', id: 'new', socketOpen: true, remainingTimers: 0 });
      entry.checks.push('actual-built-network-modules-cancel-rejoin-and-saved-stale-callbacks');
      const judging = await page.evaluate(async () => {
        const sounds = [], voices = [];
        const hud = new HUD(document.body, { playSound: name => {
          sounds.push(name); const voice = { disposed: 0, dispose() { this.disposed++; } }; voices.push(voice); return { v: voice };
        } });
        try {
          let owner = {}, captured = owner;
          const old = hud.judge({ winner: 0, percents: [65, 35], isCurrent: () => owner === captured });
          const oldFx = hud._fxMap.get('judge'); hud._fxTime = 1; oldFx(.1);
          owner = {}; oldFx(.1); const cancelled = await old;
          const afterCancel = { cancelled: cancelled.cancelled, elements: hud.overLayer.querySelectorAll('.iw-jd').length, sounds: [...sounds], voicesStopped: voices.every(v => v.disposed > 0) };
          const older = hud.judge({ winner: 0, percents: [70, 30] }), savedFx = hud._fxMap.get('judge');
          const newer = hud.judge({ winner: 1, percents: [40, 60] }), newerFx = hud._fxMap.get('judge');
          const replaced = await older; savedFx(.1);
          const newerPreserved = hud._fxMap.get('judge') === newerFx && hud.overLayer.querySelectorAll('.iw-jd').length === 1;
          hud._fxTime += 5.2; newerFx(.1); const delivered = await newer;
          const pending = hud.judge(); hud.dispose(); const disposed = await pending;
          return { afterCancel, replaced: replaced.cancelled, newerPreserved, winner: delivered.winner, disposed: disposed.cancelled };
        } finally { hud.dispose(); }
      });
      assert.deepEqual(judging, { afterCancel: { cancelled: true, elements: 0, sounds: ['judge_drumroll'], voicesStopped: true }, replaced: true, newerPreserved: true, winner: 1, disposed: true });
      entry.checks.push('actual-built-HUD-cancels-obsolete-judging-elements-sounds-and-promises');
      entry.checks.push('overlapping-judge-preserves-new-effect-and-normal-result');
      const gyroPermission = await page.evaluate(async () => {
        const descriptors = Object.fromEntries(['DeviceOrientationEvent', 'DeviceMotionEvent'].map(key => [key, Object.getOwnPropertyDescriptor(window, key)]));
        const requests = [];
        const permission = () => new Promise(resolve => requests.push(resolve));
        try {
          for (const key of Object.keys(descriptors)) Object.defineProperty(window, key, { configurable: true, writable: true, value: class { static requestPermission() { return permission(); } } });
          mobile.gyro.supported = true; mobile.gyro.granted = false;
          const pending = mobile.setGyro(true); mobile.setGyro(false);
          for (const resolve of requests.splice(0)) resolve('granted');
          const obsolete = await pending;
          const disabled = obsolete === false && mobile.gyro.enabled === false && mobile.s.gyro === false;
          const gyro = new mobile.gyro.constructor();
          const older = gyro.request(), first = requests.splice(0);
          const newer = gyro.request(), second = requests.splice(0);
          for (const resolve of second) resolve('granted'); await newer;
          for (const resolve of first) resolve('denied'); await older;
          return { disabled, permissionRemainsGranted: gyro.granted };
        } finally {
          mobile.setGyro(false);
          for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor) Object.defineProperty(window, key, descriptor); else delete window[key]; }
        }
      });
      assert.deepEqual(gyroPermission, { disabled: true, permissionRemainsGranted: true });
      entry.checks.push('actual-built-gyro-late-permission-cannot-undo-disable-or-newer-grant');
      const pausedController = await page.evaluate(() => {
        const match = { state: 'playing', paused: false, controller, local: controller.a };
        const device = input.lastDevice; input.lastDevice = 'kbm';
        input.keys.add('KeyW'); input.mouse.left = true;
        controller.menuBlocked = true;
        Match.prototype.updateController.call(match, 1 / 60);
        const blocked = !controller.enabled && !controller.a.intent.fire && controller.a.intent.move.lengthSq() === 0;
        controller.menuBlocked = false;
        Match.prototype.updateController.call(match, 1 / 60);
        const resumed = controller.enabled && controller.a.intent.fire && controller.a.intent.move.lengthSq() > 0;
        input.keys.clear(); input.mouse.left = false; input.lastDevice = device;
        return { blocked, resumed, matchContinues: !match.paused };
      });
      assert.deepEqual(pausedController, { blocked: true, resumed: true, matchContinues: true });
      entry.checks.push('actual-built-Match-keeps-online-menu-input-blocked-and-resumes');
      const menuPad = await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
        const route = sim._padMenus, device = input.lastDevice;
        const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
        const buttons = held => pad.buttons.forEach((button, i) => { button.pressed = held.includes(i); button.value = button.pressed ? 1 : 0; });
        try {
          Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
          input.padPrev = []; input.padPressed.clear(); input.padMenuPressed.clear(); input.padMenuBlocked.clear();
          let startEdges = 0;
          sim._padMenus = () => {
            if (input.padMenuPressed.has(9)) startEdges++;
            if (input.padMenuPressed.has(0)) input.consumePadMenuButton(0);
            input.padMenuPressed.clear();
          };
          buttons([9]); for (let i = 0; i < 5; i++) advance(1 / 144);
          buttons([]); advance(1 / 144);
          buttons([9]); for (let i = 0; i < 5; i++) advance(1 / 144);
          buttons([]); advance(1 / 144);
          buttons([0]); for (let i = 0; i < 5; i++) advance(1 / 144);
          const menuAcceptOwned = !input.padButton(0) && !input.padPressed.has(0) && !controller.a.intent.jump;
          buttons([]); advance(1 / 144);
          sim._padMenus = () => { input.padMenuPressed.clear(); };
          buttons([0]); advance(1 / 60);
          return { startEdges, menuAcceptOwned, nextGameplayPressRestored: input.padButton(0) && controller.a.intent.jump };
        } finally {
          buttons([]); input.pollPad(); input.padPressed.clear(); input.padMenuPressed.clear(); input.padMenuBlocked.clear(); input.padPrev = []; input.pad = null;
          sim._padMenus = route; input.lastDevice = device;
          if (descriptor) Object.defineProperty(navigator, 'getGamepads', descriptor); else delete navigator.getGamepads;
        }
      });
      assert.deepEqual(menuPad, { startEdges: 2, menuAcceptOwned: true, nextGameplayPressRestored: true });
      entry.checks.push('actual-built-Input-menu-pad-edge-and-hold-ownership-through-144Hz-clock');
      await page.screenshot({ path: path.join(evidence, engineName + '-tablet-controls.png') });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; throw error; }
finally {
  await new Promise(resolve => server.close(resolve));
  const file = path.join(evidence, 'reliability-browser-result.json'); fs.writeFileSync(file + '.pending', JSON.stringify(report, null, 2)); fs.renameSync(file + '.pending', file);
}
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, checks: report.cases.reduce((n, c) => n + c.checks.length, 0), contentHash: report.contentHash, physicalIPadVerified: false }));
