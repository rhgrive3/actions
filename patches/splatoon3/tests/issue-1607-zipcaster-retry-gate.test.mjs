import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #1607 (investigation) — Zipcaster failed-hook retry gate.
//
// Evidence status (Splatoon 3 Ver.11.3.0, pinned Leanny/splat3 7280ff9c):
//   WeaponSpSuperHook.WeaponParam.ShotFailedIntervalFrm = 20, WaitFrameShot2Attack = 12,
//   BulletBombMoveParam.SpawnSpeedZSpecUp = 3.36 units/F, MaxLengthHook = 35,
//   MinLengthHook_Floor = 3, MinLengthHook_Wall = 0.
// The table gives the interval after a failed shot, but not which events start that
// clock. INKWAVE's runtime keeps the 45F retry gate taken from the Splatoon 3
// verification wiki ("Wiki 45F miss wait" in all-specials.mjs); that page could not be
// re-fetched (HTTP 403) and the gap 45F - 20F is not attributable to a source-backed
// stage (the hook's out flight to MaxLengthHook is 35 / 3.36 = 10.4F). The gate is
// therefore NOT changed here. These tests only pin the frame boundary of the current gate
// (earliest re-hook tick, ink, position, input) so that any later evidence-based change
// is a deliberate edit, and so that it is identical at 30/60/120Hz.
const DT = 1 / 60;
const GATE_TICKS = 45;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

async function world() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const V = f.THREE.Vector3;
  const block = { id: 0, solid: true, grate: false, center: new V(0, 1.5, 2), half: new V(2, 2, .1),
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)], faces: [-1, -1, -1, -1, -1, -1] };
  const level = { blocks: [block], faces: [], queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; out.push(0); return out; } };
  f.G.physics = new f.Physics(level);
  f.realRaycast = f.G.physics.raycast.bind(f.G.physics);
  return f;
}

// mode: 'miss' (no surface), 'floor' (a floor 2 units away, below MinLengthHook_Floor),
// 'wall' (the real close wall, accepted because MinLengthHook_Wall = 0).
function setMode(f, mode) {
  const V = f.THREE.Vector3;
  f.G.physics.raycast = mode === 'miss' ? (_o, _d, _l, h) => { h.hit = false; return h; }
    : mode === 'floor' ? (_o, _d, _l, h) => { h.hit = true; h.point = new V(0, -.95, 1); h.normal = new V(0, 1, 0); h.face = 0; h.u = h.v = .5; return h; }
    : f.realRaycast;
}

function zip(f) {
  const a = f.make();
  a.weapon = { ...a.weapon, special: 'zipcaster', specialCost: 100 };
  a.special = 100; a._resolve = () => {};
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 35); a._startSpecial();
  return { a, s: a._s3AllSpecialState };
}

// Presses are scheduled per fixed tick, so every render rate sees the same inputs.
// modes[i] is the surface for the press at presses[i].
function run(f, { presses, modes, hz = 60, ticks = 60 }) {
  const { a, s } = zip(f), clock = new FixedClock(), start = a.pos.clone(), fuel = s.inkFuel;
  const log = [];
  let tick = 0;
  for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
    const at = presses.indexOf(tick);
    if (at >= 0) setMode(f, modes[at]);
    a.intent.sub = at >= 0;
    a._updateSpecial(dt);
    log.push([tick, s.phase, s.failedHooks || 0, s.nextHookAt || 0]);
    tick++;
  });
  assert.equal(tick, ticks, 'one second of fixed ticks');
  return { s, a, log, fuel, moved: a.pos.distanceTo(start) };
}

for (const hz of [30, 60, 120]) {
  for (const mode of ['miss', 'floor']) {
    test(`#1607 ${mode}: re-hook is refused one tick before the ${GATE_TICKS}F gate and admitted on it (${hz}Hz)`, async () => {
      const f = await world();
      // Press at tick 0 fails; a fresh edge one tick early is refused; a fresh edge on the
      // gate tick is evaluated again (and fails again, so the counter shows the attempt).
      const early = run(f, { presses: [0, GATE_TICKS - 1], modes: [mode, mode], hz });
      assert.equal(early.s.failedHooks, 1, 'an edge before the gate is not evaluated');
      const onGate = run(f, { presses: [0, GATE_TICKS], modes: [mode, mode], hz });
      assert.equal(onGate.s.failedHooks, 2, 'an edge on the gate tick is evaluated');
      assert.equal(onGate.s.phase, 'ready', 'a failed hook never leaves the ready state');
      close(onGate.moved, 0);
      // No hook-ink debit on a failed hook: only the time-based special tank drain remains.
      close(onGate.fuel - onGate.s.inkFuel, onGate.s.inkDrainPerSecond * 60 * DT);
    });
  }
  test(`#1607 a valid close wall is not gated, and the first tick after the miss gate admits a real hook (${hz}Hz)`, async () => {
    const f = await world();
    const direct = run(f, { presses: [0], modes: ['wall'], hz });
    assert.equal(direct.s.phase === 'hookFlight' || direct.s.phase === 'zip' || direct.s.phase === 'hookWait' || direct.s.phase === 'ready', true);
    assert.equal(direct.s.failedHooks || 0, 0, 'a valid wall hook is not a failed hook');
    assert.equal(direct.s.nextHookAt || 0, 0, 'a valid hook does not set the failed-hook gate');
    const afterMiss = run(f, { presses: [0, GATE_TICKS], modes: ['miss', 'wall'], hz });
    assert.equal(afterMiss.s.failedHooks, 1);
    assert.equal(afterMiss.log[GATE_TICKS][1], 'hookFlight', 'the hook pressed on the gate tick is not lost');
    assert.ok(afterMiss.fuel - afterMiss.s.inkFuel > afterMiss.s.inkDrainPerSecond * DT, 'the valid hook pays its hook ink');
  });
}

test('#1607 the miss gate is the same fixed tick at 30/60/120Hz', async () => {
  const f = await world();
  const logs = [30, 60, 120].map(hz => run(f, { presses: [0, GATE_TICKS - 1, GATE_TICKS + 1], modes: ['miss', 'miss', 'miss'], hz }).log);
  assert.deepEqual(logs[1], logs[0]);
  assert.deepEqual(logs[2], logs[0]);
});
