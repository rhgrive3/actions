// #285 follow-up evidence: the horizontal-flick spawn spread (SpawnPositionWidth
// 0.8 as a total span, SpawnPositionRandomCube 0.1) must come out of the REAL
// release path (WeaponRunner.update -> fireFlick), not only a direct fireFlick
// call, and must not depend on the render interval. The release tick is a fixed
// 60 Hz tick, so the seeded draw order is identical at 30/60/120 Hz.
// Logic-only (Node VM, production modules). Not a browser or Switch comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';

const YAW = .4;
async function release(hz, {seed = 112, yaw = YAW} = {}) {
  const f = await fixture({fidelity: true, floor: false}), a = f.make('roller', {x: 2, y: 10, z: 3}), r = a.weaponRunner;
  r.s3FlickVertical = false; a.yaw = yaw; f.reseed(seed);
  const clock = new f.FixedClock();
  let first = true;
  // 40 fixed ticks: press on tick 1, the swing releases on tick 21 (21F), then idle.
  for (let i = 0; i < Math.round(40 / 60 * hz); i++) clock.advance(1 / hz, dt => {
    r.update(dt, {fire: false, firePressed: first}); first = false;
  });
  return {f, a, clock, list: [...f.projectiles.list]};
}
// Each fixture is its own VM realm: copy into host-realm arrays before deepEqual.
const rows = list => list.map(p => ({unit: p.s3FlickUnit, start: Array.from(p.start.toArray()), vel: Array.from(p.vel.toArray()), pos: Array.from(p.pos.toArray())}));

test('#285 real release: 12 main globs leave 12 distinct origins before integration, identical at 30/60/120 Hz', async () => {
  const runs = {};
  for (const hz of [30, 60, 120]) runs[hz] = await release(hz);
  for (const hz of [30, 60, 120]) {
    const {a, clock, list} = runs[hz];
    assert.equal(clock.ticks, 40, `${hz} Hz render schedule advances 40 fixed ticks`);
    assert.equal(list.length, 13, '12 main globs plus the existing nearest unit');
    assert.ok(Math.abs(a.ink - 91.5) < 1e-9, 'one 8.5% payment on the 21F release');
    const main = list.filter(p => p.s3FlickUnit === 0);
    assert.equal(main.length, 12);
    assert.equal(new Set(main.map(p => JSON.stringify(p.start.toArray()))).size, 12, 'no common launch point');
    for (const p of main) {
      assert.equal(p.age, 0);
      assert.ok(p.pos.distanceTo(p.start) < 1e-12 && p.prev.distanceTo(p.start) < 1e-12, 'no integration step has run');
    }
  }
  assert.deepEqual(rows(runs[30].list), rows(runs[60].list), '30 Hz == 60 Hz');
  assert.deepEqual(rows(runs[120].list), rows(runs[60].list), '120 Hz == 60 Hz');
});

test('#285 real release: main-globs span the sourced 0.8 total width (plus the 0.1 cube) across the aim-right axis', async () => {
  const {a, f, list} = await release(60);
  const B = f.ROLLER_SPAWN_BASE, rx = Math.cos(YAW), rz = -Math.sin(YAW);
  const main = list.filter(p => p.s3FlickUnit === 0);
  const fx = Math.sin(YAW), fz = Math.cos(YAW);
  const lateral = main.map(p => (p.start.x - a.pos.x - fx * B.forward) * rx + (p.start.z - a.pos.z - fz * B.forward) * rz);
  const span = Math.max(...lateral) - Math.min(...lateral);
  const raw = f.profile.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit[0];
  assert.equal(raw.SpawnPositionWidth, .8);
  assert.equal(raw.SpawnPositionRandomCube, .1);
  // Fan placement spans exactly SpawnPositionWidth; independent cube jitter can widen it by at most 2 * .1 * (|cos|+|sin|).
  const jitterCap = 2 * raw.SpawnPositionRandomCube * (Math.abs(rx) + Math.abs(rz));
  assert.ok(span > raw.SpawnPositionWidth - jitterCap - 1e-9 && span < raw.SpawnPositionWidth + jitterCap + 1e-9,
    `lateral span ${span} within ${raw.SpawnPositionWidth} +/- ${jitterCap}`);
  for (const p of main) assert.ok(Math.abs(p.start.y - (a.pos.y + B.height)) <= raw.SpawnPositionRandomCube + 1e-9, 'height jitter is bounded by the sourced cube');
});
