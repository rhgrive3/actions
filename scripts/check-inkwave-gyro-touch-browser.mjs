#!/usr/bin/env node
// Emitted-module browser check: native Chromium touch/pointer delivery plus
// synthetic DeviceOrientation events. No rendered match or hardware claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium, devices } from 'playwright';

const option = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const positionalSite = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
const site = path.resolve(option('--site') || positionalSite || '_site');
const evidence = option('--evidence-dir');
if (evidence) { fs.mkdirSync(evidence,{recursive:true}); fs.rmSync(path.join(evidence,'gyro-touch-browser.json'),{force:true}); }
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash, 'artifact manifest');
assert.equal(hash(JSON.stringify(manifest.files)), manifest.inputHash, 'input manifest');
// Working-tree builds are intentional: parallel agents do not commit here.
for (const file of ['input-ownership-adapter.mjs', 'touch-gyro-owner-adapter.mjs']) {
  assert.equal(manifest.files['reliability/' + file], hash(fs.readFileSync(new URL('../patches/reliability/' + file, import.meta.url))), 'build includes current ' + file);
}
const receipts = {}, errors = [], cases = [];
const html = `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="icon" href="data:,"><link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css">
<style>html,body{margin:0;overflow:hidden;touch-action:none}canvas{width:100vw;height:100vh}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
<canvas id="game"></canvas><script type="module">
import * as THREE from 'three';
import { Input } from '/src/core/input.js';
import { PlayerController } from '/src/game/player.js';
import { G } from '/src/core/ctx.js';
import { DEFAULT_SETTINGS } from '/src/config.js';
import { installClock, runSimulation } from '/patches/splatoon3/runtime/clock.mjs';
window.G = G;
window.input = new Input(document.querySelector('canvas'));
window.mobile = input.mobile;
input.lastDevice = 'touch'; mobile.setVisible(true);
G.settings = {...DEFAULT_SETTINGS, aimAssist:0};
window.actor = {pos:new THREE.Vector3(),intent:{move:new THREE.Vector3()},alive:true,team:0,yaw:1.2,canSuperJump:()=>false};
window.rig = {yaw:0,pitch:0,mode:'follow',target:actor}; G.rig = rig; G.actors = [actor]; G.mode = 'match';
window.controller = new PlayerController(actor,rig,input); controller.computeAim = ()=>{};
G.match = {state:'playing',paused:false,local:actor,controller};
G.projectiles = {update(){}};
G.match.updateController = dt=>controller.update(dt); G.match.update = ()=>{};
window.sim = {input,rig,match:G.match,showcase:{},_padMenus(){}};
installClock({G}); window.advance = dt=>runSimulation(sim,dt);
window.pose = ()=>({yaw:rig.yaw,pitch:rig.pitch});
window.orient = (alpha,beta,gamma)=>{
  const event = Object.assign(new Event('deviceorientation'),{alpha,beta,gamma});
  Object.defineProperty(event,'timeStamp',{value:performance.now()}); window.dispatchEvent(event);
};
window.tick = (dt=1/60)=>{controller.update(dt);input.endFrame();};
window.pointerEvidence = [];
for(const type of ['pointerdown','pointermove','pointerup']) window.addEventListener(type,e=>{
  if(e.pointerType==='touch')pointerEvidence.push({type,trusted:e.isTrusted});
},{capture:true});
window.ready = true;
</script></html>`;
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/probe') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
    const rel = decodeURIComponent(pathname.slice(1)), file = path.resolve(site, rel);
    assert(file.startsWith(site + path.sep));
    const bytes = fs.readFileSync(file); assert.equal(hash(bytes), manifest.artifacts[rel], 'loaded ' + rel);
    receipts[rel] = hash(bytes);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(bytes);
  } catch (error) { res.writeHead(404); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
try {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || (fs.existsSync(chromium.executablePath()) ? chromium.executablePath() : fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ ...devices['iPad Mini landscape'], viewport: { width: 1024, height: 768 } });
  await context.addInitScript(() => {
    window.permissionPrompts = 0;
    for (const key of ['DeviceOrientationEvent', 'DeviceMotionEvent']) Object.defineProperty(window, key, {
      configurable: true, value: class { static requestPermission() { permissionPrompts++; return Promise.resolve('granted'); } },
    });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  await page.waitForFunction(() => window.ready);
  await page.clock.install();
  assert.equal(await page.evaluate(() => mobile.setGyro(true)), true, 'real gyro startup with simulated permission');
  const cdp = await context.newCDPSession(page);
  let finger = null, angle = 0;
  const touch = async (type, point) => {
    finger = point;
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ id: 1, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }] : [] });
  };
  const sensor = async () => {
    await page.clock.runFor(17); angle += 2;
    await page.evaluate(a => orient(a, 35 + a / 2, a / 3), angle);
  };
  const rebase = async () => {
    await page.evaluate(() => { mobile.gyro.discard(); mobile.gyro.resync(); });
    await sensor(); // First attitude after a reset establishes a baseline.
  };
  const reset = async () => {
    if (finger) await touch('touchEnd', null);
    await page.evaluate(() => { input.lastDevice = 'touch'; mobile.reset(); controller.enabled = true; rig.yaw = rig.pitch = 0; });
    await rebase();
  };
  const checkCombined = async (dt, label) => {
    const row = await page.evaluate(dt => {
      const before = pose(), swipe = { x: mobile.lookDX, y: mobile.lookDY }, gyro = { x: mobile.gyro.dYaw, y: mobile.gyro.dPitch };
      tick(dt); const after = pose(); tick(dt);
      return { before, swipe, gyro, after, idle: pose(), pending: [mobile.lookDX,mobile.lookDY,mobile.gyro.dYaw,mobile.gyro.dPitch] };
    }, dt);
    assert.notEqual(row.swipe.x, 0, label + ' horizontal touch'); assert.notEqual(row.swipe.y, 0, label + ' vertical touch');
    assert.notEqual(row.gyro.x, 0, label + ' sensor yaw'); assert.notEqual(row.gyro.y, 0, label + ' sensor pitch');
    close(row.after.yaw, row.before.yaw - row.swipe.x + row.gyro.x, label + ' same-tick yaw');
    close(row.after.pitch, row.before.pitch - row.swipe.y + row.gyro.y, label + ' same-tick pitch');
    assert.deepEqual(row.idle, row.after, label + ' no delayed replay'); assert.deepEqual(row.pending, [0,0,0,0]);
    cases.push({ name: label, ...row });
  };
  for (const hz of [30,60,120,144]) {
    await reset(); await touch('touchStart', { x: 730, y: 180 });
    await touch('touchMove', { x: 748, y: 192 }); await sensor(); await checkCombined(1 / hz, `${hz}Hz combined`);
    await touch('touchMove', { x: 730, y: 180 }); await sensor(); await checkCombined(1 / hz, `${hz}Hz reverse drag`);
    await touch('touchEnd', null); await sensor();
    const released = await page.evaluate(() => { const before = pose(), g = { yaw:mobile.gyro.dYaw,pitch:mobile.gyro.dPitch }; tick(); return {before,g,after:pose()}; });
    close(released.after.yaw, released.before.yaw + released.g.yaw, 'gyro continues after release');
    close(released.after.pitch, released.before.pitch + released.g.pitch, 'gyro pitch continues after release');
  }
  for (const hz of [30,60,120,144]) {
    await reset(); await page.evaluate(() => sim.s3Clock?.reset());
    await touch('touchStart', {x:730,y:180}); await touch('touchMove', {x:748,y:192}); await sensor();
    const cadence = await page.evaluate(hz => {
      const dx=mobile.lookDX,dy=mobile.lookDY,gx=mobile.gyro.dYaw,gy=mobile.gyro.dPitch,frames=[];
      for(let i=0;i<4;i++){advance(1/hz);frames.push({pose:pose(),ticks:sim.s3Clock.ticks});}
      return {dx,dy,gx,gy,frames};
    },hz);
    const firstTickFrame=Math.ceil(hz/60)-1;
    for(let i=0;i<cadence.frames.length;i++){
      close(cadence.frames[i].pose.yaw,i<firstTickFrame?0:cadence.gx-cadence.dx,`${hz}Hz clock yaw frame ${i}`);
      close(cadence.frames[i].pose.pitch,i<firstTickFrame?0:cadence.gy-cadence.dy,`${hz}Hz clock pitch frame ${i}`);
    }
    cases.push({name:`${hz}Hz render cadence delivers both inputs on first 60Hz simulation tick`,...cadence});
  }
  for (const invertX of [false,true]) for (const invertY of [false,true]) {
    await reset(); await page.evaluate(({invertX,invertY}) => Object.assign(G.settings,{invertX,padInvertX:invertX,invertY}), {invertX,invertY});
    await touch('touchStart', {x:730,y:180}); await touch('touchMove', {x:748,y:192}); await sensor();
    await checkCombined(1 / 60, `stick inversion ${invertX}/${invertY}`);
  }
  // Button drags use the same relative-look path as the right-hand look zone.
  await reset();
  const fire = await page.evaluate(() => mobile._box('fire'));
  await touch('touchStart', {x:fire.x,y:fire.y}); await touch('touchMove', {x:fire.x-20,y:fire.y-14}); await sensor();
  await checkCombined(1 / 60, 'FIRE drag with gyro');

  await reset(); await touch('touchStart', {x:730,y:180}); await touch('touchMove', {x:748,y:192}); await sensor();
  await page.evaluate(() => controller.resetCamera());
  assert.deepEqual(await page.evaluate(() => {tick();return pose();}), {yaw:1.2,pitch:0});
  await rebase(); await touch('touchMove', {x:760,y:200}); await sensor(); await checkCombined(1 / 60, 'fresh input after camera reset');

  await reset(); await touch('touchStart', {x:730,y:180}); await touch('touchMove', {x:748,y:192}); await sensor();
  await page.evaluate(() => {input.lastDevice='kbm';tick();input.lastDevice='touch';tick();});
  assert.deepEqual(await page.evaluate(() => pose()), {yaw:0,pitch:0}, 'handoff drops both sources');
  await touch('touchEnd', null); await rebase();
  await touch('touchStart', {x:730,y:180}); await touch('touchMove', {x:748,y:192}); await sensor();
  await checkCombined(1 / 60, 'fresh input after owner handoff');

  await reset(); await touch('touchStart', {x:730,y:180}); await touch('touchMove', {x:748,y:192}); await sensor();
  const resumed = await page.evaluate(() => {controller.enabled=false;controller.update(1/60);controller.enabled=true;tick();return pose();});
  assert.deepEqual(resumed, {yaw:0,pitch:0}, 'disabled gameplay cannot replay touch or gyro');
  await rebase(); await touch('touchMove', {x:760,y:200}); await sensor();
  await checkCombined(1 / 60, 'fresh input after disabled gameplay');

  await reset(); await touch('touchStart', {x:730,y:180});
  for (const enabled of [false,true]) {
    assert.equal(await page.evaluate(on => mobile.setGyro(on), enabled), enabled);
    if (enabled) await rebase();
    await touch('touchMove', enabled ? {x:760,y:200} : {x:748,y:192});
    if (enabled) { await sensor(); await checkCombined(1 / 60, 'fresh input after gyro ON'); }
    else {
      const off = await page.evaluate(() => {const before=pose(),dx=mobile.lookDX,dy=mobile.lookDY;tick();return {before,dx,dy,after:pose()};});
      assert.notEqual(off.dy,0);close(off.after.yaw,off.before.yaw-off.dx,'first OFF yaw');close(off.after.pitch,off.before.pitch-off.dy,'first OFF pitch');
      cases.push({name:'fresh input after gyro OFF',...off});
    }
  }
  await touch('touchEnd', null);
  const pointerEvents = await page.evaluate(() => pointerEvidence);
  assert(pointerEvents.some(e => e.type === 'pointermove')); assert(pointerEvents.every(e => e.trusted), 'browser-generated touch PointerEvents');
  for (const rel of ['src/core/mobile.js','src/core/input.js','src/core/gyro.js','src/game/player.js']) assert(receipts[rel], 'loaded emitted ' + rel);
  assert.deepEqual(errors, []);
  const report = { status:'passed',engine:'chromium',contentHash:manifest.contentHash,inputHash:manifest.inputHash,
    sensor:'synthetic DeviceOrientation events and permission responses',pointer:'trusted Chromium CDP touch PointerEvents',
    physicalIOSVerified:false,physicalSwitchVerified:false,fullRenderedMatchVerified:false,cases,receipts,errors };
  if (evidence) { fs.mkdirSync(evidence,{recursive:true}); fs.writeFileSync(path.join(evidence,'gyro-touch-browser.json'),JSON.stringify(report,null,2)+'\n'); }
  console.log(JSON.stringify(report,null,2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
