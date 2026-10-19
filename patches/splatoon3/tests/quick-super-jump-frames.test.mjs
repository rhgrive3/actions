import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';

// 11.3.0 params: ChargeFrm [20,35,80], MoveFrm [96.6,132.3,138].
// Wiki gear/gear-power/part2 verifies floor per phase. Initial-form timing is
// deliberately separate: this regression retains the existing 1F/22F policy.
const rows = [[0, 80, 138], [3, 57, 137], [6, 49, 137], [10, 43, 136],
  [20, 33, 130], [30, 26, 120], [48, 20, 100], [57, 20, 96]];
async function boot() {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, adaptNative: adaptBuildSource, adaptRuntime: adaptBuildSource });
  const level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100], grate: false }], half: [] });
  Object.assign(f.G, { level, physics: new f.Physics(level), netm: null,
    match: { state: 'playing', playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 } });
  return f;
}
function equip(a, ap) {
  const l = emptyLoadout();
  for (let main = 0; main <= 3; main++) {
    const subs = (ap - main * 10) / 3;
    if (!Number.isInteger(subs) || subs < 0 || subs > 9) continue;
    for (let i = 0; i < main; i++) l[i].main = 'quickSuperJump';
    for (let i = 0; i < subs; i++) l[Math.floor(i / 3)].subs[i % 3] = 'quickSuperJump';
    a.s3.loadout = l; a.s3RefreshGear(); return;
  }
  throw Error('Invalid AP topology');
}
function measure(f, ap, form, hz) {
  const a = f.make(); equip(a, ap); a.pos.set(0, 0, 0); a.form = form; a.invuln = 0;
  delete a._integrate; // retain actual Physics and Actor support/landing integration
  assert.equal(a.superJump(new f.THREE.Vector3(30, 0, 0)), true);
  assert.equal(a.superJumpState.t, 0, 'confirmation is t=0, before the first simulation tick');
  assert.equal(a.superJumpState.startForm, form);
  const clock = new f.FixedClock(); let tick = 0, launch = null, land = null;
  const trace = [];
  for (let frame = 0; a.superJumpState && frame < hz * 10; frame++) clock.advance(1 / hz, dt => {
    if (!a.superJumpState) return;
    const phase = a.superJumpState.phase; f.G.time += dt; a._updateSuperJump(dt); tick++;
    trace.push(a.superJumpState?.phase || 'landed');
    if (phase === 'charge' && a.superJumpState?.phase === 'flight') launch = tick;
    if (!a.superJumpState) land = tick;
  });
  assert.ok(launch !== null && land !== null, 'the actual Actor traverses both phases and lands');
  return { a, launch, flight: land - launch, land, trace };
}

test('gear-adjusted Super Jump phases floor independently at 30/60/120Hz without changing startup ownership', async () => {
  const f = await boot();
  for (const [ap, charge, flight] of rows) for (const form of ['squid', 'kid']) {
    let reference = null;
    for (const hz of [30, 60, 120]) {
      const result = measure(f, ap, form, hz), startup = form === 'kid' ? 22 : 1;
      assert.equal(result.a.s3.jumpChargeTime * 60, charge, `${ap}AP charge curve`);
      assert.equal(result.a.s3.jumpFlightTime * 60, flight, `${ap}AP flight curve`);
      assert.equal(result.launch, startup + charge, `${ap}AP ${form} ${hz}Hz launch`);
      assert.equal(result.flight, flight, `${ap}AP ${form} ${hz}Hz flight`);
      assert.equal(result.land, startup + charge + flight);
      assert.equal(result.trace[result.launch - 2], 'charge', 'previous tick remains vulnerable charge');
      assert.equal(result.trace[result.launch - 1], 'flight', 'launch boundary is exact');
      assert.equal(result.trace.at(-2), 'flight'); assert.equal(result.trace.at(-1), 'landed');
      if (reference) assert.deepEqual(result.trace, reference, 'render partition cannot change the tick timeline');
      else reference = result.trace;
    }
  }
});

test('Quick Super Jump refresh and respawn retain quantized AP phases and untouched form terms', async () => {
  const f = await boot(), a = f.make();
  for (const [ap, charge, flight] of rows) {
    equip(a, ap); const before = a.s3.jumpStartupHumanoidF;
    a.alive = false; a.respawn();
    assert.equal(a.s3.jumpChargeTime * 60, charge); assert.equal(a.s3.jumpFlightTime * 60, flight);
    assert.equal(a.s3.jumpStartupSwimF, 1); assert.equal(before, 22); assert.equal(a.s3.jumpStartupHumanoidF, 22);
  }
});
