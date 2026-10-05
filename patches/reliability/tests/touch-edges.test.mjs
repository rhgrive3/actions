// Executes real gameplay-adapted Player, Input, MobileInput, Actor and weapons.
// DOM display surfaces and collisions are fixtures; input delivery is production code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { installClock, runSimulation, STEP } from '../../splatoon3/runtime/clock.mjs';
import { adaptInput } from '../input-adapter.mjs';
import { adaptTouchEdges } from '../touch-edge-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const IDS = ['jump', 'squid', 'fire', 'sub', 'special'];
const read = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
const classList = () => ({ add() {}, remove() {}, toggle() {} });

async function boot({ patched = true, weapon = 'shooter' } = {}) {
  const f = await fixture(), listeners = new Map(), modules = new Map();
  let pads = [];
  const context = vm.createContext({ console, performance, AbortController, setTimeout, clearTimeout,
    screen: { width: 1000, height: 700, orientation: { angle: 0 } }, innerWidth: 1000, innerHeight: 700,
    localStorage: { getItem: key => key === 'inkwave.settings' ? '{"lang":"en"}' : null },
    navigator: { userAgent: 'input regression', maxTouchPoints: 0, getGamepads: () => pads },
    window: { addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); } },
    document: { documentElement: { classList: classList() }, addEventListener() {}, pointerLockElement: null },
  });
  const synthetic = (identifier, values) => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [name, value] of Object.entries(values)) this.setExport(name, value);
  }, { context, identifier });
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(UPSTREAM, file);
    let mod;
    if (rel === 'src/core/ctx.js' || rel === 'src/config.js' || rel === 'src/game/physics.js') mod = synthetic(file, f);
    else if (file === 'three') mod = synthetic(file, { ...f.THREE });
    else {
      let code = adaptInput(rel, adaptSource(rel, fs.readFileSync(file, 'utf8')));
      if (patched) code = adaptTouchEdges(rel, code);
      mod = new vm.SourceTextModule(code, { context, identifier: file });
    }
    modules.set(file, mod); return mod;
  }
  const entry = new vm.SourceTextModule("export { Input } from './src/core/input.js'; export { PlayerController } from './src/game/player.js';", {
    context, identifier: path.join(UPSTREAM, 'touch-test-entry.js'),
  });
  await entry.link((spec, from) => load(spec === 'three' ? spec : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const input = new entry.namespace.Input({}), mobile = input.mobile;
  // Mobile constructor skipped installing display DOM on this headless device.
  // Activate its actual control methods with inert display elements.
  mobile.active = true;
  mobile.root = { classList: classList(), querySelectorAll: () => [], setPointerCapture() {} };
  mobile.els = Object.fromEntries([...IDS, 'map'].map(id => [id, { classList: classList() }]));
  input.lastDevice = 'touch';
  const actor = f.make(weapon), rig = { yaw: 0, pitch: 0 };
  const controller = new entry.namespace.PlayerController(actor, rig, input);
  controller.computeAim = () => {}; // Camera-ray rendering is independent of intent delivery.
  f.G.settings = { aimAssist: 0 }; f.G.rig = rig; f.G.actors = [actor];
  actor.canSuperJump = () => false;
  const rows = [];
  const game = { input, rig, _padMenus() {}, match: { paused: false,
    updateController(dt) { controller.update(dt); rows.push(Object.fromEntries(IDS.map(id => [id, actor.intent[id]]))); },
    update(dt) { actor.update(dt); },
  } };
  f.G.projectiles.update = () => {};
  f.G.projectiles.throwBomb = () => f.shots.push({ kind: 'bomb' });
  installClock({ G: f.G });
  let pointerId = 0;
  const press = id => { const event = { pointerId: ++pointerId, clientX: 700, clientY: 400, type: 'pointerdown' }; mobile._press(id, event); return event; };
  const release = event => mobile._up({ ...event, type: 'pointerup' });
  return { ...f, input, mobile, actor, controller, rig, game, rows, press, release,
    tap(id) { release(press(id)); },
    frame(dt = STEP) { runSimulation(game, dt); },
    event(name, event) { for (const fn of listeners.get(name) || []) fn(event); },
    pads(next) { pads = next; },
  };
}

for (const id of IDS) test(`${id}: a completed tap is retained before a tick, delivered once, then released`, async () => {
  const before = await boot({ patched: false }); before.tap(id);
  assert.equal(before.mobile.down(id), false);
  assert.equal(before.mobile.wasPressed(id), true);
  before.frame();
  assert.equal(before.rows[0][id], false, 'current gameplay build loses the completed touch tap');
  assert.equal(before.mobile.wasPressed(id), true, 'current Input never consumes recorded mobile edges');
  const after = await boot(); after.tap(id);
  after.frame(STEP / 2);
  assert.equal(after.rows.length, 0);
  assert.equal(after.mobile.wasPressed(id), true);
  after.frame(STEP / 2);
  assert.equal(after.rows[0][id], true);
  assert.equal(after.mobile.wasPressed(id), false);
  after.frame();
  assert.equal(after.rows[1][id], false);
  after.tap(id); after.frame();
  assert.equal(after.rows[2][id], true, 'a new completed tap on a later tick is delivered');
});

test('held controls survive edge consumption and release on the next tick', async () => {
  const h = await boot(), held = IDS.map(id => h.press(id));
  h.frame(); h.frame();
  for (const row of h.rows) assert.ok(IDS.every(id => row[id]));
  assert.equal(h.mobile.pressed.size, 0);
  held.forEach(h.release); h.frame();
  assert.ok(IDS.every(id => h.rows[2][id] === false));
});

test('disabled controller consumes taps without replay when enabled', async () => {
  const h = await boot(); h.controller.enabled = false;
  IDS.forEach(id => h.tap(id)); h.frame();
  assert.ok(IDS.every(id => h.rows[0][id] === false));
  assert.equal(h.mobile.pressed.size, 0);
  h.controller.enabled = true; h.frame();
  assert.ok(IDS.every(id => h.rows[1][id] === false));
});

test('map retains fire/sub suppression, consumes their edges, and suppresses swipe/gyro camera look', async () => {
  const h = await boot(); h.mobile.setMap(true);
  h.tap('fire'); h.tap('sub');
  h.mobile.lookDX = .3; h.mobile.lookDY = .2;
  h.mobile.gyro.enabled = true; h.mobile.gyro.dYaw = .4; h.mobile.gyro.dPitch = .1;
  h.frame();
  assert.equal(h.rows[0].fire, false); assert.equal(h.rows[0].sub, false);
  assert.equal(h.rig.yaw, 0); assert.equal(h.rig.pitch, 0);
  assert.equal(h.mobile.lookDX, 0); assert.equal(h.mobile.gyro.dYaw, 0);
  h.mobile.setMap(false); h.frame();
  assert.equal(h.rows[1].fire, false); assert.equal(h.rows[1].sub, false);
  assert.equal(h.rig.yaw, 0); assert.equal(h.rig.pitch, 0);
});

for (const hz of [20, 30, 60, 90, 120, 144]) test(`${hz}Hz rendering delivers touch displacement and a tap exactly once at 60Hz`, async () => {
  const h = await boot(); h.tap('fire'); h.mobile.lookDX = .25; h.mobile.lookDY = .1;
  for (let frame = 0; frame < hz; frame++) h.frame(1 / hz);
  assert.equal(h.game.s3Clock.ticks, 60);
  assert.equal(h.rows.filter(row => row.fire).length, 1);
  assert.equal(h.rows[0].fire, true);
  assert.equal(h.rig.yaw, -.25); assert.equal(h.rig.pitch, -.1);
});

test('actual charger charges while held and fires once on release; completed fire tap releases next tick', async () => {
  const h = await boot({ weapon: 'charger' }), held = h.press('fire');
  for (let i = 0; i < 20; i++) h.frame();
  assert.equal(h.actor.weaponRunner.charging, true); assert.ok(h.actor.weaponRunner.charge > 0);
  assert.equal(h.shots.length, 0);
  h.release(held); h.frame();
  assert.equal(h.shots.length, 1); assert.equal(h.shots[0].kind, 'charger');
  assert.equal(h.actor.weaponRunner.charging, false);
  for (let i = 0; i < 30; i++) h.frame();
  assert.equal(h.shots.length, 1);
  h.tap('fire'); h.frame();
  assert.equal(h.rows.at(-1).fire, true); assert.equal(h.actor.weaponRunner.charging, true);
  h.frame();
  assert.equal(h.rows.at(-1).fire, false); assert.equal(h.actor.weaponRunner.charging, false);
  assert.equal(h.shots.length, 2);
});

test('actual roller completes a tap flick and stops rolling after a held trigger releases', async () => {
  const h = await boot({ weapon: 'roller' }); h.tap('fire'); h.frame();
  assert.ok(h.actor.weaponRunner.s3RollerAttack);
  for (let i = 0; i < 50; i++) h.frame();
  assert.equal(h.shots.length, 1); assert.equal(h.actor.weaponRunner.rolling, false);
  const held = h.press('fire');
  for (let i = 0; i < 50; i++) h.frame();
  assert.equal(h.actor.weaponRunner.rolling, true);
  h.release(held); h.frame();
  assert.equal(h.actor.weaponRunner.rolling, false);
});

test('actual Actor stays squid while held and returns to kid after release', async () => {
  const h = await boot(), held = h.press('squid');
  h.frame(); h.frame(); assert.equal(h.actor.form, 'squid');
  h.release(held); h.frame(); assert.equal(h.actor.form, 'kid');
});

test('desktop keyboard/mouse/gamepad intent traces are identical with and without the touch overlay', async () => {
  const traces = [];
  for (const patched of [false, true]) {
    const h = await boot({ patched }); h.mobile.active = false; h.input.locked = true;
    for (const code of ['Space', 'ShiftLeft', 'KeyE', 'KeyF']) {
      h.event('keydown', { code, repeat: false, preventDefault() {} }); h.event('keyup', { code });
    }
    h.event('mousedown', { button: 0 }); h.event('mouseup', { button: 0 });
    h.frame(); h.frame();
    h.pads([{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: [0, 3, 5, 6, 7].includes(i), value: [6, 7].includes(i) ? 1 : 0 })) }]);
    h.frame(); traces.push(h.rows);
  }
  assert.deepEqual(traces[1], traces[0]);
  assert.ok(IDS.every(id => traces[1][0][id]));
  assert.ok(IDS.every(id => traces[1][1][id] === false));
  assert.ok(IDS.every(id => traces[1][2][id]));
});

test('touch overlay requires unique gameplay-adapted anchors and does not modify other modules', () => {
  const player = adaptSource('src/game/player.js', read('src/game/player.js'));
  const input = adaptInput('src/core/input.js', read('src/core/input.js'));
  for (const [rel, code] of [['src/game/player.js', player], ['src/core/input.js', input]]) {
    assert.throws(() => adaptTouchEdges(rel, ''), /conflict/);
    assert.throws(() => adaptTouchEdges(rel, code + '\n' + code), /conflict/);
    assert.throws(() => adaptTouchEdges(rel, adaptTouchEdges(rel, code)), /conflict/);
  }
  for (const id of IDS) {
    const anchor = player.split('\n').find(line => line.startsWith(`    it.${id} =`));
    assert.throws(() => adaptTouchEdges('src/game/player.js', player.replace(anchor, '')), /conflict/);
    assert.throws(() => adaptTouchEdges('src/game/player.js', player + '\n' + anchor), /conflict/);
  }
  assert.throws(() => adaptTouchEdges('src/game/player.js', read('src/game/player.js')), /conflict/);
  for (const rel of ['src/core/mobile.js', 'src/main.js']) assert.equal(adaptTouchEdges(rel, 'unchanged'), 'unchanged');
  for (const rel of ['src/game/actor.js', 'src/game/weapons.js']) {
    const source = adaptSource(rel, read(rel));
    assert.notEqual(adaptTouchEdges(rel, source), source);
    assert.throws(() => adaptTouchEdges(rel, ''), /conflict/);
    assert.throws(() => adaptTouchEdges(rel, source + source), /conflict/);
    assert.throws(() => adaptTouchEdges(rel, adaptTouchEdges(rel, source)), /conflict/);
  }
});
