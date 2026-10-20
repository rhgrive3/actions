import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// #890 acceptance coverage for the already-installed ordinary-jump B hold/release path
// (runtime/normal-jump-hold.mjs). The release threshold (holdFrames) and response
// (releaseRate) are INKWAVE's provisional LEGACY_JUMP_FEEL values, not Splatoon 3
// Ver.11.3.0 numbers; no S3 value exists in the pinned data (SplPlayer table has no
// jump hold key). These tests therefore assert only that a 1F tap and a sustained hold
// give different trajectories on each takeoff surface / admission path, that the
// sustained hold keeps the native arc, and that the fixed simulation is render-rate
// independent. They do not claim S3 parity of height, threshold or curve.
async function world(collapsed = false) {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { normalJumpHoldState } from './patches/splatoon3/runtime/normal-jump-hold.mjs';",
    // Negative control: removing the release response restores the issue's original
    // behaviour (B duration is ignored after takeoff).
    adaptRuntime: (rel, source) => collapsed && rel === 'patches/splatoon3/runtime/normal-jump-hold.mjs'
      ? source.replace('if(calibrated && prior.frames <= settings.holdFrames) {', 'if(false) {') : source });
  const level = new f.Level({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-20, -1, -20], max: [20, 0, 20] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  return f;
}

// Fixed-tick schedule: fire is held from tick 0 when charge is set (weapon charge before
// the jump), B is pressed at tick jumpAt for jumpTicks ticks. Inputs are set per fixed
// tick, so every render rate sees the same schedule.
function jump(f, { weapon, ink = 1, jumpTicks = 1, jumpAt = 0, charge = false, coyote = false, hz = 60, seconds = 1 } = {}) {
  f.G.paint.sample = () => ink;
  const a = f.make(weapon), clock = new f.FixedClock(), rows = [];
  delete a._integrate;
  a.form = 'kid';
  if (coyote) {
    a.pos.set(0, .5, 0); a.vel.set(0, -1, 0);
    a.grounded = false; a.ground.hit = false; a.coyote = .1;
  } else {
    a.pos.set(0, 0, 0); a.vel.set(0, 0, 0);
    a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  }
  let tick = 0, serial = 0;
  for (let frame = 0; frame < hz * seconds; frame++) clock.advance(1 / hz, dt => {
    a.intent.jump = tick >= jumpAt && tick < jumpAt + jumpTicks;
    a.intent.fire = charge;
    f.G.time += dt; a.update(dt);
    serial = a.s3JumpSerial || 0;
    const hold = f.normalJumpHoldState(a);
    rows.push([a.pos.y, a.vel.y, a.grounded, serial, hold ? hold.applied : null]);
    tick++;
  });
  return { rows, serial, apex: Math.max(...rows.map(row => row[0])) };
}

const SURFACES = [
  ['own ink', { ink: 1 }],
  ['enemy ink', { ink: 2 }],
  ['coyote window after leaving ground', { ink: 1, coyote: true }],
  ['Splatling charging takeoff cap', { weapon: 'splatling', ink: 1, charge: true, jumpAt: 30 }],
  ['Splatling charging takeoff cap on enemy ink', { weapon: 'splatling', ink: 2, charge: true, jumpAt: 30 }],
  ['Charger full-charge takeoff cap', { weapon: 'charger', ink: 1, charge: true, jumpAt: 80, seconds: 2 }],
];

for (const [name, options] of SURFACES) {
  test(`#890 ${name}: a 1F tap and a sustained B hold no longer share one arc`, async () => {
    const f = await world();
    const tap = jump(f, { ...options, jumpTicks: 1 });
    const held = jump(f, { ...options, jumpTicks: 30 });
    assert.equal(tap.serial, 1, 'the tap jump is admitted exactly once');
    assert.equal(held.serial, 1, 'the sustained jump is admitted exactly once');
    assert.ok(tap.apex < held.apex, `tap apex ${tap.apex} must be below held apex ${held.apex}`);
    assert.ok(tap.rows.some(row => row[4] === true), 'the early release applied the small-jump response');
    assert.ok(held.rows.every(row => row[4] !== true), 'the sustained hold never applied the small-jump response');
    // The sustained hold keeps the native arc of its own takeoff surface: it is the
    // highest arc this surface can produce, and the tap only lowers it.
    assert.ok(held.apex > 0, 'sustained hold leaves the ground');
  });

  test(`#890 ${name}: the fixed-tick trace is identical at 30/60/120Hz`, async () => {
    const traces = [];
    for (const hz of [30, 60, 120]) {
      const f = await world();
      traces.push({ tap: jump(f, { ...options, jumpTicks: 1, hz }), held: jump(f, { ...options, jumpTicks: 30, hz }) });
    }
    assert.deepEqual(traces[1], traces[0]);
    assert.deepEqual(traces[2], traces[0]);
  });
}

test('#890 weapon takeoff caps stay below the ordinary takeoff on both the tap and the hold path', async () => {
  const f = await world();
  const ordinary = jump(f, { jumpTicks: 30 });
  for (const options of [SURFACES[3][1], SURFACES[5][1]]) {
    const capped = jump(f, { ...options, jumpTicks: 30 });
    assert.ok(capped.apex < ordinary.apex, `capped hold apex ${capped.apex} must stay below ordinary ${ordinary.apex}`);
    const cappedTap = jump(f, { ...options, jumpTicks: 1 });
    assert.ok(cappedTap.apex < capped.apex);
  }
});

test('#890 negative control: without the release response a tap and a hold collapse to one arc on every surface', async () => {
  const f = await world(true);
  for (const [name, options] of SURFACES) {
    const tap = jump(f, { ...options, jumpTicks: 1 }), held = jump(f, { ...options, jumpTicks: 30 });
    assert.equal(tap.apex, held.apex, `${name}: the original collapsed behaviour must be what the control reproduces`);
    assert.ok(tap.rows.every(row => row[4] !== true), name);
  }
});
