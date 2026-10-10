import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const STEP = 1 / 60;
const point = vector => Array.from(vector.toArray());
async function boot() {
  const f = await fixture({ productionComposition: true, extraExports: `
    export { HUD } from './inkwave-public/src/ui/hud.js';
    export { DioramaOverlay } from './inkwave-public/src/ui/diorama.js';
  ` });
  const level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }], half: [] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  f.G.settings = { aimAssist: 0, sensitivity: 1, padSensitivity: 1 };
  f.G.game = { minimap: { w: 100, h: 100, toCanvas(x, z, out) { out.x = x + 50; out.y = z + 50; } } };
  f.G.camera = new f.THREE.PerspectiveCamera();
  f.G.rig = { gameCam: f.G.camera, dioLook: { x: 0, y: 0 } };
  const make = (position = [0, 0, 0]) => {
    const a = f.make(); delete a._integrate;
    a.spawnAt(new f.THREE.Vector3(...position), 0); a.invuln = 0;
    return a;
  };
  return { ...f, make };
}
function input(device = 'keyboard') {
  const keys = new Set(), pressed = new Set();
  return { keys, pressed, lastDevice: device, navigationDevice: device,
    mouse: { dx: 0, dy: 0, left: false, right: false }, pad: device === 'pad' ? { mapping: 'standard' } : null,
    padPressed: new Set(), down: key => keys.has(key), wasPressed: key => pressed.has(key),
    padButton: () => false, padValue: () => 0, padAxis: () => 0,
    padStick(_x, _y, out) { out.x = out.y = out.mag = 0; },
  };
}
function controller(f, a, inp = input()) {
  const c = new f.PlayerController(a, { yaw: 0, pitch: 0 }, inp);
  f.G.match.local = a; f.G.match.controller = c;
  c.navigationEnabled = true; c.setTurfMap(true);
  return c;
}
function target(f, phase) {
  const b = f.make([3, 0, 2]), destination = new f.THREE.Vector3(20, 0, 9);
  assert.equal(b.superJump(destination), true);
  if (phase === 'flight') {
    let guard = 0;
    while (b.superJumpState?.phase === 'charge' && guard++ < 180) f.tick(b);
    f.tick(b, 5); assert.equal(b.superJumpState.phase, 'flight');
  }
  return { b, destination };
}

for (const phase of ['charge', 'flight']) test(`#412 ${phase} target inherits an immutable destination through A -> B -> C`, async () => {
  const f = await boot(), { b, destination } = target(f, phase), a = f.make(), next = f.make();
  assert.notDeepEqual(point(b.pos), point(destination));
  assert.equal(a.superJump(b), true);
  assert.deepEqual(point(a.superJumpState.to), point(destination));
  assert.notEqual(a.superJumpState.to, b.superJumpState.to);
  assert.equal(next.superJump(a), true);
  b.superJumpState.to.set(80, 0, 80); b.splat(null, 'water');
  assert.deepEqual(point(a.superJumpState.to), point(destination));
  assert.deepEqual(point(next.superJumpState.to), point(destination));
  let guard = 0; while (a.superJumpState && guard++ < 400) f.tick(a);
  assert.equal(a.superJumpState, null); assert.deepEqual(point(a.pos), point(destination));
});

test('#412 malformed/unconfirmed jumping targets never fall back to transient or last-ground positions', async () => {
  const f = await boot(), a = f.make(), b = f.make([7, 0, 3]), c = controller(f, a);
  b.superJumpGround = new f.THREE.Vector3(6, 0, 2); b.pos.set(10, 15, 7);
  const invalid = [{ phase: 'charge' }, { phase: 'flight' }, { phase: 'other', to: new f.THREE.Vector3() },
    { phase: 'charge', to: { x: 1, y: 0, z: 2 } }, { phase: 'flight', to: new f.THREE.Vector3(NaN, 0, 1) }];
  for (const state of invalid) {
    b.superJumpState = state;
    assert.equal(c.validMapJumpTarget(b), false); assert.equal(a.superJump(b), false);
    assert.equal(a.superJumpState, null);
  }
  b.superJumpState = { phase: 'charge', to: new f.THREE.Vector3(15, 0, 4) };
  b.alive = false; assert.equal(a.superJump(b), false); assert.equal(c.validMapJumpTarget(b), false);
  b.alive = true; b.team = 1; assert.equal(a.superJump(b), false); assert.equal(c.validMapJumpTarget(b), false);
  assert.equal(a.superJump(a), false);
});

for (const phase of ['charge', 'flight']) test(`#412 ${phase} keyboard, standard-pad confirmation and touch use the same committed target`, async () => {
  const f = await boot();
  for (const device of ['keyboard', 'pad', 'touch']) {
    f.G.actors = [];
    const a = f.make(), { b, destination } = target(f, phase), inp = input(device), c = controller(f, a, inp);
    assert.equal(c.validMapJumpTarget(b), true);
    if (device === 'pad') {
      inp.padPressed.add(14); c.updatePadMapSelection(true);
      assert.equal(a.superJumpState, null, 'D-pad only selects');
      inp.padPressed.add(1); c.updatePadMapSelection(true);
    } else if (device === 'keyboard') {
      inp.keys.add('Tab'); inp.pressed.add('Digit1'); c.update(STEP);
    } else {
      let pending = 0;
      inp.mobile = { active: true, root: {}, lookDX: 0, lookDY: 0, gyro: { enabled: false, discard() {} },
        mapOpen: true, pressed: new Set(), down: () => false, wasPressed: () => false,
        consumeJumpTarget: () => { const n = pending; pending = -1; return n; },
        get move() { return { x: 0, y: 0, mag: 0 }; }, consumeSpecial: () => false };
      c.update(STEP);
    }
    assert.ok(a.superJumpState, `${device} commits`);
    assert.deepEqual(point(a.superJumpState.to), point(destination));
  }
});

test('#412 HUD and diorama confirmation admit known destinations, and recheck a target changed after selection', async () => {
  const f = await boot(), a = f.make(), { b, destination } = target(f, 'charge'); controller(f, a);
  const h = Object.assign(Object.create(f.HUD.prototype), { _local: () => a, lab: null,
    _snd() {}, _restart() {}, beacons: [{}] });
  assert.equal(h._beaconTargets()[0].ok, true); h._jumpTo(0);
  assert.deepEqual(point(a.superJumpState.to), point(destination));
  a.superJumpState = null;
  const d = Object.assign(Object.create(f.DioramaOverlay.prototype), { on: true, k: 1, pins: [{ target: b }], _flash() {} });
  d._jump(0, a); assert.deepEqual(point(a.superJumpState.to), point(destination));
  a.superJumpState = null; b.superJumpState.to.x = NaN;
  assert.equal(h._beaconTargets()[0].ok, false); h._jumpTo(0); d._jump(0, a);
  assert.equal(a.superJumpState, null);
});

test('#412 30/60/120 Hz schedules preserve the same inherited destination and landing tick', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await boot(), { b, destination } = target(f, 'charge'), a = f.make(), clock = new FixedClock(), rows = [];
    assert.equal(a.superJump(b), true);
    for (let frame = 0; frame < hz * 4; frame++) clock.advance(1 / hz, () => {
      f.tick(a); rows.push([a.superJumpState?.phase ?? null, ...point(a.pos)]);
    });
    assert.equal(a.superJumpState, null); assert.deepEqual(point(a.pos), point(destination)); traces.push(rows);
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});
