import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { LEGACY_JUMP_FEEL } from '../runtime/normal-jump-hold.mjs';

// #890 press-frame boundary and terrain coverage for the installed ordinary
// jump hold/release owner (runtime/normal-jump-hold.mjs).
//
// What is asserted is the INKWAVE contract, not a Splatoon 3 number:
// - B held for 1..holdFrames fixed ticks after takeoff takes the short-hop
//   response; holdFrames+1 or longer keeps the native arc unchanged.
// - The boundary and every trace are identical at 30/60/120Hz rendering.
// - Ramp, step, wall-side and airborne starts keep the same contract.
// holdFrames=5 / releaseRate=0.7 stay the provisional LEGACY_JUMP_FEEL values.
// The pinned Ver.11.3.0 extract (Leanny/splat3 7280ff9c, misc/SplPlayer and
// misc/params.json) has no ordinary jump velocity, gravity or B-hold key, so
// neither the cutoff nor the curve is claimed to match Splatoon 3.
const HOLD = LEGACY_JUMP_FEEL.holdFrames;

async function world(extra = []) {
  // Runtime modules receive the same build adapters as the published site.
  const f = await fixture({ productionComposition: true, fullRuntime: true,
    adaptRuntime: (rel, source) => adaptBuildSource(rel, source),
    extraExports: "export { normalJumpHoldState } from './patches/splatoon3/runtime/normal-jump-hold.mjs';" });
  const level = new f.Level({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-20, -1, -20], max: [20, 0, 20] }, ...extra] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  f.G.paint.sample = () => 1;
  return f;
}

// B is held on fixed ticks [0, holdTicks). Inputs are written per fixed tick,
// so every render cadence sees the same schedule.
function jump(f, { holdTicks = 1, hz = 60, seconds = 1.2, start = [0, 0, 0], grounded = true,
  move = [0, 0], press = 0 } = {}) {
  const a = f.make(), clock = new f.FixedClock(), rows = [];
  delete a._integrate;
  a.form = 'kid'; a.pos.set(...start); a.vel.set(0, 0, 0);
  a.grounded = grounded; a.ground.hit = grounded; a.coyote = 0;
  if (grounded) a.ground.face = 0;
  let tick = 0, takeoff = null;
  for (let frame = 0; frame < Math.round(hz * seconds); frame++) clock.advance(1 / hz, dt => {
    a.intent.jump = tick >= press && tick < press + holdTicks;
    a.intent.move.set(move[0], 0, move[1]);
    f.G.time += dt; a.update(dt);
    if (takeoff === null && a.s3JumpSerial) takeoff = tick;
    const hold = f.normalJumpHoldState(a);
    rows.push([a.pos.x, a.pos.y, a.pos.z, a.vel.y, a.grounded, a.s3JumpSerial || 0, hold ? hold.applied : null]);
    tick++;
  });
  return { rows, takeoff, serial: a.s3JumpSerial || 0, applied: rows.some(row => row[6] === true),
    apex: Math.max(...rows.map(row => row[1])) - start[1] };
}

test('#890 boundary: 1..holdFrames ticks take the short hop, holdFrames+1 keeps the native arc', async () => {
  const f = await world();
  assert.equal(HOLD, 5, 'provisional INKWAVE value under test');
  const held = jump(f, { holdTicks: 60 });
  assert.equal(held.takeoff, 0); assert.equal(held.applied, false);
  let previous = -Infinity;
  for (let n = 1; n <= HOLD; n++) {
    const r = jump(f, { holdTicks: n });
    assert.equal(r.serial, 1, `${n}F: exactly one jump`);
    assert.equal(r.applied, true, `${n}F release applies the short-hop response`);
    assert.ok(r.apex < held.apex, `${n}F apex ${r.apex} < held ${held.apex}`);
    // A later release keeps more of the native ascent: no plateau, no inversion.
    assert.ok(r.apex > previous, `${n}F apex ${r.apex} must exceed ${n - 1}F apex ${previous}`);
    previous = r.apex;
  }
  for (const n of [HOLD + 1, HOLD + 2, 20, 60]) {
    const r = jump(f, { holdTicks: n });
    assert.equal(r.applied, false, `${n}F hold never applies the release response`);
    assert.deepEqual(r.rows.map(row => row.slice(0, 6)), held.rows.map(row => row.slice(0, 6)),
      `${n}F hold follows the sustained native arc exactly`);
  }
});

test('#890 boundary: the shortest and longest holds give the same traces at 30/60/120Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await world();
    traces.push([1, HOLD, HOLD + 1, 60].map(holdTicks => jump(f, { holdTicks, hz })));
  }
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
});

const TERRAIN = [
  // 10.6 degree ramp under the start point, jumping while walking uphill.
  ['ramp takeoff while walking uphill', [{ kind: 'ramp', low: [0, 0, -4], high: [0, 1.5, 4], width: 8, thickness: .5 }],
    { start: [0, .75, 0], move: [0, 1] }],
  // Jump up onto a 0.6 WU step that ends the ascent early for the held arc.
  ['jump onto a step', [{ kind: 'box', min: [-4, 0, .8], max: [4, .6, 6] }], { move: [0, 1] }],
  // Ascend beside a wall while pushing into it.
  ['wall-side jump pushing into the wall', [{ kind: 'box', min: [.45, 0, -4], max: [1.5, 6, 4] }], { move: [1, 0] }],
];

for (const [name, extra, options] of TERRAIN) {
  test(`#890 ${name}: tap and hold diverge, the boundary holds, and 30/60/120Hz agree`, async () => {
    const traces = [];
    for (const hz of [30, 60, 120]) {
      const f = await world(extra);
      const tap = jump(f, { ...options, holdTicks: 1, hz });
      const edge = jump(f, { ...options, holdTicks: HOLD, hz });
      const past = jump(f, { ...options, holdTicks: HOLD + 1, hz });
      const held = jump(f, { ...options, holdTicks: 60, hz });
      for (const [label, r] of [['tap', tap], ['edge', edge], ['past', past], ['held', held]]) {
        assert.equal(r.takeoff, 0, `${label}: takeoff on the press tick`);
        assert.ok(r.rows[0][3] > 0 && r.rows[0][4] === false, `${label}: airborne and rising after takeoff`);
      }
      assert.equal(tap.applied, true); assert.equal(edge.applied, true);
      assert.equal(past.applied, false); assert.equal(held.applied, false);
      assert.ok(tap.apex < held.apex, `tap apex ${tap.apex} < held apex ${held.apex}`);
      assert.deepEqual(past.rows.map(row => row.slice(0, 6)), held.rows.map(row => row.slice(0, 6)));
      traces.push([tap, edge, past, held]);
    }
    assert.deepEqual(traces[1], traces[0]); assert.deepEqual(traces[2], traces[0]);
  });
}

test('#890 airborne without coyote: B neither jumps nor creates a hold epoch', async () => {
  const f = await world();
  for (const holdTicks of [1, HOLD, 30]) {
    const r = jump(f, { holdTicks, grounded: false, start: [0, 4, 0], seconds: .5 });
    assert.equal(r.serial, 0, `${holdTicks}F airborne press admits no ordinary jump`);
    assert.ok(r.rows.every(row => row[6] === null), 'no hold state while falling');
    assert.ok(r.rows.every(row => row[3] <= 0), 'no upward impulse');
  }
});
