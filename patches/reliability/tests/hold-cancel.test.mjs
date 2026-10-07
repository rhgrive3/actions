// #936 / #903: a platform cancel (touch pointercancel / premature lostpointercapture) or a mouse -> touch handoff
// ends a hold without a deliberate release, so Charger / Splatling charges and SUB aim must be dropped, not released.
// Executes the composed MobileInput + Input + PlayerController and the real Actor / WeaponRunner on the 60 Hz clock.
// The DOM, pointer lock and collisions are fixtures; this is logic evidence, not a browser or device capture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { installClock, runSimulation, STEP } from '../../splatoon3/runtime/clock.mjs';
import { adaptReliability } from '../adapter.mjs';
import { adaptHoldCancel } from '../hold-cancel-adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const IDS = ['jump', 'squid', 'fire', 'sub', 'special'];
const classList = () => ({ add() {}, remove() {}, toggle() {}, contains() { return false; } });

async function boot({ weapon = 'charger', withhold = false } = {}) {
  // Actor + WeaponRunner come from the gameplay graph with only the cancel connection applied.
  const f = await fixture({ adapt: (rel, code) => adaptHoldCancel(rel, adaptSource(rel, code)) });
  const listeners = new Map(), docListeners = new Map(), modules = new Map();
  const add = (map, name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };
  const doc = { hidden: false, documentElement: { classList: classList() }, addEventListener: (n, fn) => add(docListeners, n, fn), querySelector: () => null, pointerLockElement: null };
  const canvas = { ownerDocument: doc, closest: () => null, requestPointerLock() {} };
  doc.exitPointerLock = () => { doc.pointerLockElement = null; for (const fn of docListeners.get('pointerlockchange') || []) fn(); };
  const context = vm.createContext({ console, performance, AbortController, setTimeout, clearTimeout,
    screen: { width: 1000, height: 700, orientation: { angle: 0 } }, innerWidth: 1000, innerHeight: 700, localStorage: { getItem: () => null },
    navigator: { userAgent: 'hold cancel fixture', maxTouchPoints: 0, getGamepads: () => [] },
    window: { addEventListener: (n, fn) => add(listeners, n, fn) }, document: doc });
  const synthetic = (file, values) => new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, { context, identifier: file });
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(UPSTREAM, file); let mod;
    if (['src/core/ctx.js', 'src/config.js', 'src/game/physics.js'].includes(rel)) mod = synthetic(file, f);
    else if (file === 'three') mod = synthetic(file, f.THREE);
    else mod = new vm.SourceTextModule(adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, fs.readFileSync(file, 'utf8'))))), { context, identifier: file });
    modules.set(file, mod); return mod;
  }
  const entry = new vm.SourceTextModule("export { Input } from './src/core/input.js'; export { PlayerController } from './src/game/player.js';", { context, identifier: path.join(UPSTREAM, 'hold-cancel-entry.js') });
  await entry.link((spec, from) => {
    if (spec === 'three') return load('three');
    let file = path.resolve(path.dirname(from.identifier), spec);
    if (file.startsWith(path.join(UPSTREAM, 'patches') + path.sep)) file = path.join(ROOT, path.relative(UPSTREAM, file));
    return load(file);
  });
  await entry.evaluate();
  Object.assign(f.G, { mode: 'match', match: { state: 'playing', paused: false, attract: false, playing: () => true }, game: { menus: { current: null } } });
  const input = new entry.namespace.Input(canvas), mobile = input.mobile;
  Object.assign(mobile, { active: true, visible: true, root: { classList: classList(), querySelectorAll: () => [], setPointerCapture() {} },
    els: Object.fromEntries([...IDS, 'map'].map(id => [id, { classList: classList() }])), _abort: new AbortController(), _stickHome: { x: 100, y: 500, d: 120 }, _stickR: 60 });
  mobile._drawStick = () => {};
  input.lastDevice = 'kbm'; // desktop mouse + keyboard first; a touch takes over later
  if (withhold) { input.holdCancelled = () => false; } // negative control: the cancel never reaches the controller
  const actor = f.make(weapon), rig = { yaw: 0, pitch: 0 };
  const controller = new entry.namespace.PlayerController(actor, rig, input);
  controller.computeAim = () => {};
  Object.assign(f.G, { settings: { aimAssist: 0 }, rig, actors: [actor] });
  actor.canSuperJump = () => false; actor.ink = 100;
  f.G.projectiles.update = () => {};
  f.G.projectiles.throwBomb = () => f.shots.push({ kind: 'bomb' });
  f.G.projectiles.fireSplatling = () => f.shots.push({ kind: 'splatling' });
  installClock({ G: f.G });
  const game = { input, rig, _padMenus() {}, match: { paused: false, updateController(dt) { controller.update(dt); }, update(dt) { actor.update(dt); } } };
  const frame = (n = 1) => { for (let i = 0; i < n; i++) runSimulation(game, STEP); };
  const event = (name, e) => { for (const fn of listeners.get(name) || []) fn(e); };
  let pointer = 0;
  const ev = (type, extra = {}) => ({ type, pointerType: 'touch', pointerId: ++pointer, clientX: 700, clientY: 300, target: canvas, cancelable: true, preventDefault() {}, stopPropagation() {}, ...extra });
  return { ...f, input, mobile, actor, game, frame, event, runner: actor.weaponRunner, shots: f.shots,
    // touch button hold; returns the pointer event so the same pointer can be released / cancelled
    hold(id) { const e = ev('pointerdown'); mobile._press(id, e); return e; },
    end(e, type = 'pointerup') { mobile._up({ ...e, type }); },
    // keyboard + mouse
    mouseDown(button) { input.locked = true; event('mousedown', { button }); },
    mouseUp(button) { event('mouseup', { button }); },
    key(code, down) { event(down ? 'keydown' : 'keyup', { code, repeat: false, preventDefault() {} }); },
    // a real touch: the window capture listener sees it first, then the mobile router
    touchTakeover(hit = null) {
      const e = ev('pointerdown'); mobile._hitButton = () => hit;
      event('pointerdown', e); mobile._down(e); return e;
    },
    lock() { doc.pointerLockElement = canvas; input.locked = true; },
  };
}
const kinds = h => h.shots.map(s => s.kind);

for (const type of ['pointercancel', 'lostpointercapture']) {
  test(`#936 Charger: held touch FIRE + ${type} drops the charge; a normal pointerup still fires once`, async () => {
    const h = await boot(); const e = h.hold('fire'); h.frame(30);
    assert.equal(h.runner.charging, true); const ink = h.actor.ink;
    h.end(e, type); h.end(e, type); h.frame(3);
    assert.deepEqual(kinds(h), [], 'cancel is not a release'); assert.equal(h.runner.charging, false); assert.equal(h.runner.charge, 0);
    assert.equal(h.actor.ink, ink, 'no ink is spent by a cancelled charge'); h.frame(120); assert.deepEqual(kinds(h), []);
    const n = await boot(); const f = n.hold('fire'); n.frame(30); n.end(f); n.frame(2);
    assert.deepEqual(kinds(n), ['charger']); assert.ok(n.actor.ink < 100);
  });
  test(`#936 Splatling: held touch FIRE + ${type} starts no stream; a normal pointerup does`, async () => {
    const h = await boot({ weapon: 'splatling' }); const e = h.hold('fire'); h.frame(30);
    assert.equal(h.runner.charging, true);
    h.end(e, type); h.frame(3); assert.equal(h.runner.streaming, false); assert.equal(h.runner.charging, false); assert.equal(h.runner.charge, 0);
    h.frame(60); assert.deepEqual(kinds(h), []);
    const n = await boot({ weapon: 'splatling' }); const f = n.hold('fire'); n.frame(30); n.end(f); n.frame(2);
    assert.equal(n.runner.streaming, true);
  });
  test(`#936 SUB: held touch SUB + ${type} throws no bomb and spends no ink; a normal pointerup throws once`, async () => {
    const h = await boot({ weapon: 'shooter' }); const e = h.hold('sub'); h.frame(10);
    assert.equal(h.runner.aimingSub, true); const ink = h.actor.ink;
    h.end(e, type); h.end(e, type); h.frame(3);
    assert.deepEqual(kinds(h), []); assert.equal(h.runner.aimingSub, false); assert.equal(h.actor.ink, ink);
    const n = await boot({ weapon: 'shooter' }); const f = n.hold('sub'); n.frame(10); n.end(f); n.frame(2);
    assert.deepEqual(kinds(n), ['bomb']); assert.ok(n.actor.ink < 100);
  });
}

test('#936 negative control: without the cancel report, the same pointercancel releases the Charger and throws the bomb', async () => {
  const c = await boot({ withhold: true }); c.mobile.wasCancelled = () => false; const e = c.hold('fire'); c.frame(30); c.end(e, 'pointercancel'); c.frame(2);
  assert.deepEqual(kinds(c), ['charger']);
  const s = await boot({ weapon: 'shooter', withhold: true }); s.mobile.wasCancelled = () => false; const f = s.hold('sub'); s.frame(10); s.end(f, 'pointercancel'); s.frame(2);
  assert.deepEqual(kinds(s), ['bomb']);
});

test('#936 a hold that another finger keeps, and a hold pressed again before the tick, are not cancelled', async () => {
  const h = await boot(); const a = h.hold('fire'), b = h.hold('fire'); h.frame(20);
  h.end(a, 'pointercancel'); h.frame(3); assert.equal(h.runner.charging, true, 'pointer B still holds FIRE'); assert.deepEqual(kinds(h), []);
  h.end(b, 'pointercancel'); const c = h.hold('fire'); h.frame(3);
  assert.equal(h.runner.charging, true, 'FIRE was pressed again, so the cancel does not discard it'); h.end(c); h.frame(2);
  assert.deepEqual(kinds(h), ['charger']);
});

test('#936 repeated cancel notifications cannot create an action and the marker is consumed once', async () => {
  const h = await boot(); const e = h.hold('fire'); h.frame(20);
  h.end(e, 'pointercancel'); h.frame(1); for (let i = 0; i < 5; i++) { h.end(e, 'pointercancel'); h.end(e, 'lostpointercapture'); h.end(e); }
  h.frame(5); assert.deepEqual(kinds(h), []); assert.equal(h.mobile.wasCancelled('fire'), false);
  const f = h.hold('fire'); h.frame(30); h.end(f); h.frame(2); assert.deepEqual(kinds(h), ['charger'], 'the next deliberate release is unaffected');
});

test('#936 a completed tap on pointer A survives the cancellation of unrelated pointer B', async () => {
  const h = await boot({ weapon: 'shooter' }); const a = h.hold('fire'); h.end(a); const b = h.hold('sub'); h.end(b, 'pointercancel'); h.frame(2);
  assert.ok(kinds(h).includes('shooter'), 'the tapped FIRE edge was still delivered');
  assert.deepEqual(kinds(h).filter(k => k === 'bomb'), []);
});

test('#936 keyboard SUB, mouse FIRE and mouse SUB keep their normal release semantics', async () => {
  const k = await boot({ weapon: 'shooter' }); k.key('KeyE', true); k.frame(10); assert.equal(k.runner.aimingSub, true); k.key('KeyE', false); k.frame(2);
  assert.deepEqual(kinds(k), ['bomb']);
  const m = await boot(); m.mouseDown(0); m.frame(30); assert.equal(m.runner.charging, true); m.mouseUp(0); m.frame(2);
  assert.deepEqual(kinds(m), ['charger'], 'physical mouseup without a touch takeover still releases');
  const r = await boot({ weapon: 'shooter' }); r.mouseDown(2); r.frame(10); r.mouseUp(2); r.frame(2);
  assert.deepEqual(kinds(r), ['bomb']);
});

// ---- #903: mouse -> touch handoff
test('#903 Charger: a touch look takeover while the mouse holds FIRE fires nothing; the later mouseup is not a release either', async () => {
  const h = await boot(); h.lock(); h.mouseDown(0); h.frame(30); assert.equal(h.runner.charging, true);
  h.touchTakeover(null); h.frame(3);
  assert.deepEqual(kinds(h), [], 'handoff is not a release'); assert.equal(h.runner.charging, false); assert.equal(h.runner.charge, 0);
  h.mouseUp(0); h.frame(60); assert.deepEqual(kinds(h), []);
});

test('#903 negative control: without the cancel report the takeover releases the Charger and throws the SUB', async () => {
  const c = await boot({ withhold: true }); c.lock(); c.mouseDown(0); c.frame(30); c.touchTakeover(null); c.frame(2);
  assert.deepEqual(kinds(c), ['charger']);
  const s = await boot({ weapon: 'shooter', withhold: true }); s.lock(); s.mouseDown(2); s.frame(10); s.touchTakeover(null); s.frame(2);
  assert.deepEqual(kinds(s), ['bomb']);
});

test('#903 Splatling and SUB: the takeover starts no stream and throws no bomb; physical releases without a takeover still act', async () => {
  const sp = await boot({ weapon: 'splatling' }); sp.lock(); sp.mouseDown(0); sp.frame(30); assert.equal(sp.runner.charging, true);
  sp.touchTakeover(null); sp.frame(3); assert.equal(sp.runner.streaming, false); assert.equal(sp.runner.charging, false);
  const sub = await boot({ weapon: 'shooter' }); sub.lock(); sub.mouseDown(2); sub.frame(10); assert.equal(sub.runner.aimingSub, true); const ink = sub.actor.ink;
  sub.touchTakeover(null); sub.frame(3); assert.deepEqual(kinds(sub), []); assert.equal(sub.runner.aimingSub, false); assert.equal(sub.actor.ink, ink);
  sub.mouseUp(2); sub.frame(5); assert.deepEqual(kinds(sub), []);
  const ok = await boot({ weapon: 'splatling' }); ok.lock(); ok.mouseDown(0); ok.frame(30); ok.mouseUp(0); ok.frame(2); assert.equal(ok.runner.streaming, true);
});

test('#903 any real touch takeover cancels the mouse hold; one with no mouse hold changes nothing', async () => {
  const h = await boot(); h.lock(); h.mouseDown(0); h.frame(30);
  h.touchTakeover(null); h.frame(3); assert.deepEqual(kinds(h), []); assert.equal(h.runner.charging, false);
  const idle = await boot(); idle.touchTakeover(null); idle.frame(3); assert.equal(idle.mobile.wasCancelled('fire'), false); assert.equal(idle.input.holdCancelled('fire'), false);
});

test('#903 when the takeover touch is itself FIRE or SUB there is no false gap and no early release', async () => {
  const f = await boot(); f.lock(); f.mouseDown(0); f.frame(30); const charge = f.runner.charge;
  const t = f.touchTakeover('fire'); f.frame(5);
  assert.deepEqual(kinds(f), []); assert.equal(f.runner.charging, true); assert.ok(f.runner.charge > charge, 'the charge keeps building across the owner change');
  f.end(t); f.frame(2); assert.deepEqual(kinds(f), ['charger'], 'exactly one release, from the touch lift');
  const s = await boot({ weapon: 'shooter' }); s.lock(); s.mouseDown(2); s.frame(10);
  const u = s.touchTakeover('sub'); s.frame(5); assert.deepEqual(kinds(s), []); assert.equal(s.runner.aimingSub, true);
  s.end(u); s.frame(2); assert.deepEqual(kinds(s), ['bomb']);
});

test('#903 shooter hold stays neutral after takeover and the cancel marker is consumed by the tick', async () => {
  const h = await boot({ weapon: 'shooter' }); h.lock(); h.mouseDown(0); h.frame(5); h.touchTakeover(null);
  assert.equal(h.input.holdCancelled('fire'), true); h.frame(1); assert.equal(h.input.holdCancelled('fire'), false);
  assert.deepEqual(kinds(h).filter(k => k !== 'shooter'), []);
});
