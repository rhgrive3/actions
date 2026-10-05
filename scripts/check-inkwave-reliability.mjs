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
import { runTouchTransitionCases } from './inkwave-touch-transition-cases.mjs';

const option = name => { const i = process.argv.indexOf(name); assert(i >= 0 && process.argv[i + 1], 'Required ' + name); return path.resolve(process.argv[i + 1]); };
const site = option('--site'), evidence = option('--evidence-dir'), cache = option('--profile-dir');
const focusedOnly = process.argv.includes('--focused-touch-transitions');
const negativeControl = process.argv.includes('--negative-control');
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
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><canvas id="game"></canvas><div id="test-menu-target" class="iw-menu" style="position:fixed;top:10px;left:10px;z-index:9500;width:120px;height:40px;background:#333;color:#fff;pointer-events:auto">Menu Item</div><script type="module">
import * as THREE from 'three';
import { Input } from '/src/core/input.js';
import { PlayerController } from '/src/game/player.js';
import { Match } from '/src/game/match.js';
import { G } from '/src/core/ctx.js';
import { DEFAULT_SETTINGS } from '/src/config.js';
import { installClock,runSimulation } from '/patches/splatoon3/runtime/clock.mjs';
import { NetSession } from '/src/net/session.js';
import { HUD } from '/src/ui/hud.js';
import { DioramaOverlay } from '/src/ui/diorama.js';
window.input=new Input(document.getElementById('game'));window.mobile=input.mobile;
input.lastDevice='touch';mobile.setVisible(true);
G.settings={...DEFAULT_SETTINGS,aimAssist:0,aimAssistMouse:false};
const actor={intent:{move:new THREE.Vector3()},alive:true,team:0,canSuperJump:()=>false};
window.rig={yaw:0,pitch:0,mode:'follow',target:actor};
window.controller=new PlayerController(actor,rig,input);controller.computeAim=()=>{};
G.rig=rig;G.projectiles={update(){}};
window.intents=[];const match={state:'playing',local:actor,controller,updateController(dt){controller.update(dt);},update(){intents.push({...actor.intent,move:actor.intent.move.toArray()});}};
window.sim={input,rig,match,showcase:{},_padMenus(){}};installClock({G});
window.advance=dt=>runSimulation(sim,dt);window.G=G;window.Match=Match;window.NetSession=NetSession;window.HUD=HUD;window.DioramaOverlay=DioramaOverlay;window.THREE=THREE;window.ready=true;
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
      const entry = { engine: engineName, viewport: { width: 1024, height: 768 }, checks: [], dragEvents: engineName === 'chromium' ? 'native-CDP-touch' : 'DOM-PointerEvent', evidenceClass: engineName === 'chromium' ? 'native-CDP-touch' : 'DOM-PointerEvent' }; report.cases.push(entry);
      const cdp = engineName === 'chromium' ? await context.newCDPSession(page) : null;
      const gesture = async (type, points) => {
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ id: p.id, x: p.x, y: p.y, radiusX: 2, radiusY: 2, force: 1 })) });
        else await page.evaluate(({ type, points }) => {
          const pointers = window.testPointers || (window.testPointers = new Map());
          if (type === 'touchEnd' || type === 'touchCancel') {
            for (const [id, p] of pointers) if (!points.some(q => q.id === id)) {
              const target = (mobile._ptr?.has(id) || mobile._stick?.id === id || (mobile.root?.hasPointerCapture?.(id))) ? mobile.root : (p.target || mobile.root);
              target.dispatchEvent(new PointerEvent(type === 'touchEnd' ? 'pointerup' : 'pointercancel', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id, clientX: p.x, clientY: p.y }));
              pointers.delete(id);
            }
          } else for (const p of points) {
            const isNew = !pointers.has(p.id);
            let target;
            if (isNew) target = document.elementFromPoint(p.x, p.y) || document.getElementById('game');
            else target = (mobile._ptr?.has(p.id) || mobile._stick?.id === p.id || (mobile.root?.hasPointerCapture?.(p.id))) ? mobile.root : (pointers.get(p.id)?.target || mobile.root);
            target.dispatchEvent(new PointerEvent(isNew ? 'pointerdown' : 'pointermove', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: p.id, clientX: p.x, clientY: p.y }));
            pointers.set(p.id, { x: p.x, y: p.y, target });
          }
        }, { type, points });
      };
      if (!focusedOnly) {
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
      const gyroViability = await page.evaluate(async () => {
        await mobile.setGyro(false);mobile.setVisible(true);
        const access=mobile.gyro._platformGyroAccess,permission=access.permission;
        // A fixture-supplied session grant; this probe never requests browser/OS permission.
        access.permission='granted';
        try {
          await mobile.setGyro(true);
          const waiting=mobile.gyro.platformStatus.availability==='waiting'&&!mobile.els.gyro.classList.contains('is-on')&&mobile.els.gyro.getAttribute('aria-busy')==='true';
          mobile.moveX=.4;mobile.buttons.fire=true;mobile.lookDX=.2;
          await new Promise(resolve=>setTimeout(resolve,2150));
          const stopped=!mobile.gyro.enabled&&!mobile._gyroWanted&&!mobile.s.gyro&&mobile.gyro.platformStatus.reason==='no-sensor-data';
          const offUI=!mobile.els.gyro.classList.contains('is-on')&&mobile.els.gyro.getAttribute('aria-pressed')==='false';
          const inputPreserved=mobile.moveX===.4&&mobile.buttons.fire&&mobile.lookDX===.2;
          await mobile.setGyro(true);
          mobile.gyro._orientation({alpha:0,beta:0,gamma:0,timeStamp:performance.now()+1});
          mobile.gyro._orientation({alpha:20,beta:0,gamma:0,timeStamp:performance.now()+18});
          const recovered=mobile.gyro.enabled&&mobile.gyro.platformStatus.availability==='active'&&mobile.els.gyro.classList.contains('is-on');
          return {waiting,stopped,offUI,inputPreserved,recovered};
        } finally {await mobile.setGyro(false);mobile.reset();access.permission=permission;}
      });
      assert.deepEqual(gyroViability,{waiting:true,stopped:true,offUI:true,inputPreserved:true,recovered:true});
      entry.checks.push('actual-built-gyro-no-data-stops-ON-state-and-explicit-retry-recovers');
      const startupGrant = await page.evaluate(async () => {
        const {prepareGyroStartup,startGyroStartup}=await import('/patches/local-quality/gyro-startup.mjs');
        const {initialGyroDefaults}=await import('/patches/local-quality/gyro-permission.mjs');
        await mobile.setGyro(false);mobile.setVisible(true);
        const gyro=mobile.gyro,original=gyro.request,descriptor=Object.getOwnPropertyDescriptor(gyro,'needsPermission');
        const access=gyro._platformGyroAccess,permission=access.permission;
        let resolve,count=0;
        try {
          Object.defineProperty(gyro,'needsPermission',{configurable:true,value:true});
          gyro.request=()=>{count++;return new Promise(r=>{resolve=r;});};
          const game={input:{mobile},settings:{gyro:true},match:{state:'playing',paused:false},menus:{current:null}},world={mode:'match'};
          const prepared=prepareGyroStartup(game,world);const started=startGyroStartup(game,world);
          const stayedOff=!gyro.enabled&&count===1;
          access.permission='granted';gyro.request=original;Object.defineProperty(gyro,'needsPermission',{configurable:true,value:false});resolve(true);
          await prepared;await started;
          gyro._orientation({alpha:0,beta:0,gamma:0,timeStamp:performance.now()+1});
          gyro._orientation({alpha:15,beta:0,gamma:0,timeStamp:performance.now()+18});
          return {stayedOff,started:gyro.enabled&&gyro.platformStatus.availability==='active',onePrompt:count===1,
            mobileDefault:initialGyroDefaults({gyro:false},{touch:true}).gyro,desktopDefault:initialGyroDefaults({gyro:false},{touch:false}).gyro};
        } finally {
          gyro.request=original;if(descriptor)Object.defineProperty(gyro,'needsPermission',descriptor);else delete gyro.needsPermission;
          await mobile.setGyro(false);access.permission=permission;
        }
      });
      assert.deepEqual(startupGrant,{stayedOff:true,started:true,onePrompt:true,mobileDefault:true,desktopDefault:false});
      entry.checks.push('actual-built-late-START-grant-and-device-specific-default');


      // Native touch action, actual shared PlayerController reset, and actual gyro
      // rebaseline. No sensor permission is requested: the fixture supplies samples.
      for (const gyroOn of [false, true]) {
        await page.evaluate(enabled => {
          mobile.reset(); mobile.setVisible(true); input.lastDevice = 'touch';
          controller.enabled = true; controller.a.yaw = 1.2;
          controller.rig.yaw = -2; controller.rig.pitch = .7;
          mobile.gyro.enabled = enabled; mobile.gyro.dYaw = .4; mobile.gyro.dPitch = .3;
          mobile.lookDX = .2; mobile.lookDY = .1;
          sim.s3Clock?.reset();
        }, gyroOn);
        await page.locator('[data-c="cameraReset"]').tap();
        const recentered = await page.evaluate(() => {
          advance(1 / 60);
          const first = [rig.yaw, rig.pitch, mobile.gyro.enabled];
          mobile.gyro._orientation({ alpha: 150, beta: 30, gamma: 45, timeStamp: 1000 });
          advance(1 / 60);
          return { first, next: [rig.yaw, rig.pitch], pending: mobile.wasPressed('cameraReset') };
        });
        assert.deepEqual(recentered, { first: [1.2, 0, gyroOn], next: [1.2, 0], pending: false });
      }
      await page.evaluate(() => { mobile.gyro.enabled = false; mobile.gyro.discard(); });
      entry.checks.push('native-touch-camera-reset-shares-controller-path-and-rebases-next-sensor-sample');
      const padHighlight = await page.evaluate(() => {
        window.navigationPrevious = { match: G.match, input: G.input, pad: input.pad, device: input.lastDevice };
        input.pad = { mapping: 'standard' }; input.lastDevice = 'pad'; G.input = input;
        G.match = { state: 'playing', controller }; controller.padJumpIndex = 1;
        const hud = window.navigationHud = new HUD();
        hud.lab = { local: controller.a, beacons: [0, 1, 2, 3].map(i => ({ x: .2 + i * .2, y: .3, name: 'Target ' + i, weapon: 'shooter', ok: true, home: i === 3 })) };
        hud.setVisible(true); hud._mapT = 1;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        hud._updMap({ canvas, expanded: true, players: [] }, 0);
        return { beacon: hud.beacons[1].classList.contains('is-hover'), row: hud.legendRows[1].classList.contains('is-hover'), cursor: hud.mapCursor.classList.contains('is-on'), guide: hud.mapLegend.querySelector('.iw-lg__foot').textContent };
      });
      assert.equal(padHighlight.beacon, true); assert.equal(padHighlight.row, true); assert.equal(padHighlight.cursor, false);
      assert(padHighlight.guide.includes('A'));
      await page.screenshot({ path: path.join(evidence, engineName + '-pad-map-selection.png') });
      await page.evaluate(() => {
        navigationHud.dispose(); const old = navigationPrevious;
        G.match = old.match; G.input = old.input; input.pad = old.pad; input.lastDevice = old.device;
        controller.padJumpIndex = -1;
      });
      entry.checks.push('actual-built-HUD-highlights-selected-pad-beacon-and-confirmation-guide');
      const respawnNavigation = await page.evaluate(() => {
        const old = { match:G.match, actors:G.actors, input:G.input, level:G.level, device:input.lastDevice };
        const a={alive:false,grounded:false,team:0,intent:{move:new THREE.Vector3()},pos:new THREE.Vector3(),
          canSuperJump(){return this.alive&&!this.superJumpState;},superJump(target){if(!this.canSuperJump())return false;this.superJumpState={target};return true;}};
        const ally={alive:true,team:0,pos:new THREE.Vector3(2,0,3)};
        const camera={yaw:.4,pitch:.2},c=new controller.constructor(a,camera,input);c.computeAim=()=>{};
        const match={state:'playing',paused:false,local:a,controller:c};
        const padDescriptor=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
        const pad={index:0,id:'respawn-intent',connected:true,mapping:'standard',axes:[.9,-.5,.8,.7],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
        let hud,dio;
        try {
          G.match=match;G.actors=[a,ally];G.input=input;G.level={spawnPads:[new THREE.Vector3()]};
          input.lastDevice='kbm';input.keys.add('Tab');input.keys.add('KeyW');input.mouse.left=true;
          Match.prototype.updateController.call(match,1/60);
          const deadBlocked=!c.enabled&&c.mapHeld&&a.intent.move.lengthSq()===0&&!a.intent.fire&&camera.yaw===.4&&camera.pitch===.2;
          hud=new HUD();hud._local=()=>a;hud._beaconTargets=()=>[{ok:true,actor:ally}];hud._jumpTo(0);
          const hudQueued=c.pendingRespawnJump?.actor===ally&&!a.superJumpState;
          c.pendingRespawnJump=null;
          Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});input.pollPad();
          dio=new DioramaOverlay(document.body);dio.on=true;dio.k=1;dio.pins[0].target=ally;
          dio.pins[0].el.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true,cancelable:true}));
          const dioramaQueued=c.pendingRespawnJump?.actor===ally&&!a.superJumpState;
          for(let i=0;i<120;i++){input.pollPad();Match.prototype.updateController.call(match,1/60);}
          const heldAxesPreserve=c.pendingRespawnJump?.actor===ally&&input.lastDevice==='pad'&&input.navigationDevice==='touch';
          a.alive=true;Match.prototype.updateController.call(match,1/60);const waitsForLanding=!a.superJumpState;
          a.grounded=true;Match.prototype.updateController.call(match,1/60);const landed=a.superJumpState?.target===ally&&!c.pendingRespawnJump;
          a.alive=false;a.superJumpState=null;Match.prototype.updateController.call(match,1/60);c.requestMapJump(ally);
          window.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch'}));c.requestMapJump(ally);input.pollPad();
          pad.buttons[0]={pressed:true,value:1};input.pollPad();Match.prototype.updateController.call(match,1/60);
          const freshPadCancels=!c.pendingRespawnJump;
          c.requestMapJump(ally);c.menuBlocked=true;Match.prototype.updateController.call(match,1/60);
          const pauseCancels=!c.pendingRespawnJump&&!c.mapHeld&&!a.intent.fire;
          return {deadBlocked,hudQueued,dioramaQueued,waitsForLanding,landed,pauseCancels,heldAxesPreserve,freshPadCancels};
        } finally {
          if(padDescriptor)Object.defineProperty(navigator,'getGamepads',padDescriptor);else delete navigator.getGamepads;
          input.pollPad();hud?.dispose();dio?.el.remove();input.keys.clear();input.pressed.clear();input.mouse.left=false;input.lastDevice=old.device;
          mobile.setMap(false);G.match=old.match;G.actors=old.actors;G.input=old.input;G.level=old.level;
        }
      });
      assert.deepEqual(respawnNavigation,{deadBlocked:true,hudQueued:true,dioramaQueued:true,waitsForLanding:true,landed:true,pauseCancels:true,heldAxesPreserve:true,freshPadCancels:true});
      entry.checks.push('actual-built-Match-HUD-diorama-dead-map-selection-and-deferred-respawn-admission');
      const mapGyro = await page.evaluate(() => {
        const old={match:G.match,actors:G.actors,rig:G.rig,camera:G.camera,level:G.level,device:input.lastDevice,active:mobile.active,enabled:mobile.gyro.enabled};
        const a={alive:true,grounded:true,team:0,yaw:0,weapon:{kind:'shooter',range:12},pos:new THREE.Vector3(),intent:{move:new THREE.Vector3()},canSuperJump(){return true;}};
        const rig={yaw:.2,pitch:.3,dioLook:{x:0,y:0},mapK:0},c=new controller.constructor(a,rig,input);c.computeAim=()=>{};
        const match={state:'playing',paused:false,local:a,controller:c};let dio;
        try {
          G.match=match;G.actors=[a];G.rig=rig;G.level={spawnPads:[new THREE.Vector3()]};
          G.camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,100);G.camera.position.set(0,8,12);G.camera.lookAt(0,0,0);G.camera.updateMatrixWorld();
          mobile.active=true;mobile.gyro.enabled=true;mobile.setMap(false);input.lastDevice='touch';input.keys.add('Tab');
          dio=new DioramaOverlay(document.body);Match.prototype.updateController.call(match,1/60);dio.update(1/60,1);
          const x=dio.cx,y=dio.cy;mobile.gyro.dYaw=.04;mobile.gyro.dPitch=.03;Match.prototype.updateController.call(match,1/60);dio.update(1/60,1);
          const cursorMoves=dio.cx<x&&dio.cy<y,frozen=rig.yaw===.2&&rig.pitch===.3,after=[dio.cx,dio.cy];dio.update(1/60,1);
          const once=dio.cx===after[0]&&dio.cy===after[1];input.keys.delete('Tab');mobile.gyro.dYaw=.5;Match.prototype.updateController.call(match,1/60);
          const noReplay=rig.yaw===.2;mobile.gyro.dYaw=.02;Match.prototype.updateController.call(match,1/60);const battleResumes=rig.yaw>.2;
          return {cursorMoves,frozen,once,noReplay,battleResumes};
        } finally {
          dio?.el.remove();input.keys.clear();input.pressed.clear();mobile.gyro.discard();mobile.gyro.enabled=old.enabled;mobile.active=old.active;input.lastDevice=old.device;
          G.match=old.match;G.actors=old.actors;G.rig=old.rig;G.camera=old.camera;G.level=old.level;
        }
      });
      assert.deepEqual(mapGyro,{cursorMoves:true,frozen:true,once:true,noReplay:true,battleResumes:true});
      entry.checks.push('actual-built-gyro-map-cursor-single-consumption-and-camera-ownership');


      // Complete built action pipeline, including the native Character trigger.
      // Ground collision/paint/projectile display are bounded fixture surfaces.
      await page.evaluate(async () => {
        const { install } = await import('/patches/splatoon3/runtime/install.mjs');
        const { Actor } = await import('/src/game/actor.js');
        const { Character } = await import('/src/game/character.js');
        const { on } = await import('/src/core/ctx.js');
        const THREE = await import('three');
        install(await fetch('/patches/splatoon3/profile.json').then(r => r.json()));
        G.scene = new THREE.Scene(); G.teamColors = [new THREE.Color('orange'), new THREE.Color('blue')];
        G.level = { blocks: [], groundHeight: () => 0 };
        G.paint = { sample: () => 1, splat: () => 0 };
        G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
        G.match = { playing: () => true };
        G.projectiles = { update() {}, fireDualies() {} };
        const a = window.actionActor = new Actor({ team: 0, name: 'browser input', weapon: 'dualies', CharacterClass: Character });
        a.grounded = a.ground.hit = true; a._integrate = () => {}; a._spawnBarrier = () => {};
        a.canSuperJump = () => false; G.actors = [a];
        window.actionDodges = 0; on('weapon:dodge', event => { if (event.actor === a) actionDodges++; });
        controller.a = a; sim.match.local = a; rig.target = a;
        sim.match.update = dt => a.update(dt); sim.s3Clock.reset();
        mobile.reset(); mobile.setVisible(true); mobile.moveX = .8; input.lastDevice = 'touch';
      });
      await page.locator('[data-c="fire"]').tap(); await page.locator('[data-c="jump"]').tap();
      await page.evaluate(() => advance(1 / 120));
      assert.equal(await page.evaluate(() => actionDodges), 0);
      await page.evaluate(() => advance(1 / 120));
      assert.equal(await page.evaluate(() => actionDodges), 1);
      await page.evaluate(() => {
        // A separate held-input trial begins from neutral admission state.
        // Pressing jump again during the preceding tap's active roll is illegal.
        actionActor.weaponRunner.reset(); actionActor.grounded = true;
        actionActor.jumpBuffer = 0; actionActor._prevIntent.jump = false;
        mobile.reset(); mobile.moveX = .8; actionDodges = 0;
        const pointer = (id, pointerId, type) => {
          const el = document.querySelector(`[data-c="${id}"]`), r = el.getBoundingClientRect();
          el.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
        };
        window.actionPointer = pointer;
        pointer('fire', 501, 'pointerdown'); pointer('jump', 502, 'pointerdown');
        for (let i = 0; i < 31; i++) advance(1 / 60);
        pointer('jump', 502, 'pointerup'); pointer('jump', 503, 'pointerdown');
        advance(1 / 120); advance(1 / 120);
        for (let i = 0; i < 60; i++) advance(1 / 60);
      });
      assert.equal(await page.evaluate(() => actionDodges), 2, 'held touch release/repress reaches real Character once');
      await page.evaluate(() => { actionPointer('jump', 503, 'pointerup'); actionPointer('fire', 501, 'pointerup'); advance(1 / 60); });
      assert.equal(await page.evaluate(() => actionActor.intent.jump), false);
      entry.checks.push('native-taps-and-DOM-touch-repress-reach-actual-Actor-Runner-Character-once');
      const subOwnership = await page.evaluate(() => {
        const old = G.projectiles, shots = [];
        try {
          mobile.reset(); mobile.moveX = mobile.moveY = 0; input.lastDevice = 'touch';
          actionActor.setWeapon('shooter'); actionActor.kidT = 1; actionActor.ink = 100;
          actionActor._prevIntent.fire = actionActor._prevIntent.sub = false;
          G.projectiles = { update() {}, fireShooter() { shots.push('main'); }, throwBomb() { shots.push('bomb'); } };
          actionPointer('sub', 601, 'pointerdown'); actionPointer('fire', 602, 'pointerdown');
          for (let i = 0; i < 20; i++) advance(1 / 60);
          const aiming = actionActor.weaponRunner.aimingSub, heldShots = [...shots];
          actionPointer('sub', 601, 'pointerup'); advance(1 / 60); const releaseShots = [...shots];
          actionPointer('fire', 602, 'pointerup'); for (let i = 0; i < 30; i++) advance(1 / 60);
          return { aiming, heldShots, releaseShots, finalShots: shots };
        } finally { mobile.reset(); G.projectiles = old; actionActor.setWeapon('dualies'); }
      });
      assert.deepEqual(subOwnership, { aiming: true, heldShots: [], releaseShots: ['bomb'], finalShots: ['bomb'] });
      entry.checks.push('native-DOM-sub-hold-and-release-exclude-simultaneous-main-and-phantom-replay');

      }
      if (!focusedOnly && !negativeControl) {
        const previousViewport=page.viewportSize();
        try {
          await page.setViewportSize({width:390,height:844});
          await page.evaluate(()=>{input.lastDevice='touch';mobile.reset();mobile.setVisible(true);document.documentElement.classList.add('iw-touch');});
          await page.waitForFunction(()=>{const el=mobile.root.querySelector('.iwm-rotate');return el&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0;});
          entry.portraitGuard=await page.evaluate(()=>{
            const overlay=mobile.root.querySelector('.iwm-rotate'),rows=[],gyro=mobile.gyro.enabled;
            const neutral=()=>mobile._ptr.size===0&&mobile._stick.id===-1&&mobile.moveX===0&&mobile.moveY===0&&mobile.lookDX===0&&mobile.lookDY===0&&mobile.pressed.size===0&&!mobile.mapOpen&&Object.values(mobile.buttons).every(v=>!v);
            const route=(id,x,y)=>{for(const [type,dx,dy]of [['pointerdown',0,0],['pointermove',30,20],['pointerup',30,20]])overlay.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:id,clientX:x+dx,clientY:y+dy}));};
            for(const [i,id]of ['fire','squid','jump','sub','special','map','gyro','pause'].entries()){const b=mobile._box(id);route(i+90,b.x,b.y);if(!neutral())throw Error('Portrait hidden control routed: '+id);rows.push(id);}
            for(const x of [30,360]){route(110+x,x,400);if(!neutral())throw Error('Portrait overlay drag routed');}
            if(mobile.gyro.enabled!==gyro)throw Error('Portrait pointer changed gyro');
            const r=overlay.getBoundingClientRect();return {controls:rows,neutral:neutral(),gyroUnchanged:true,visible:getComputedStyle(overlay).display!=='none',width:r.width,height:r.height};
          });
          await page.screenshot({path:path.join(evidence,engineName+'-portrait-guard.png'),animations:'disabled'});
        } finally {if(previousViewport)await page.setViewportSize(previousViewport);await page.evaluate(()=>{mobile.reset();input.lastDevice='touch';mobile.setVisible(true);});}
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const fire=await page.evaluate(()=>mobile._box('fire'));
        await page.touchscreen.tap(fire.x,fire.y);
        assert(await page.evaluate(()=>mobile.pressed.has('fire')),'landscape FIRE edge restores after portrait');
        await page.evaluate(()=>mobile.reset());
        entry.checks.push('portrait-guard-visible-native-DOM-routing-neutral-landscape-restored');
      }
      await page.screenshot({ path: path.join(evidence, engineName + '-tablet-controls.png') });
      // Transition coverage ends by destroying MobileInput; run it after every
      // probe that requires the live overlay, retaining its destruction checks.
      await runTouchTransitionCases({
        page, context, cdp, engineName, gesture, entry, report, negativeControl,
      });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; throw error; }
finally {
  await new Promise(resolve => server.close(resolve));
  const file = path.join(evidence, 'reliability-browser-result.json'); fs.writeFileSync(file + '.pending', JSON.stringify(report, null, 2)); fs.renameSync(file + '.pending', file);
}
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, checks: report.cases.reduce((n, c) => n + c.checks.length, 0), contentHash: report.contentHash, physicalIPadVerified: false }));
