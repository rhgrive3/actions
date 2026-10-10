import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function world(old = false) {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { normalJumpHoldState } from './patches/splatoon3/runtime/normal-jump-hold.mjs';",
    adaptRuntime: (rel, source) => old && rel === 'patches/splatoon3/runtime/normal-jump-hold.mjs'
      ? source.replace('released:false,applied:false', 'released:!this.intent?.jump,applied:false') : source,
  });
  const level = new f.Level({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-20, -1, -20], max: [20, 0, 20] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  return f;
}
function jump(f, { buffered = true, tap = true, hz = 60 } = {}) {
  const a = f.make(), clock = new f.FixedClock(), rows = [];
  delete a._integrate;
  a.pos.set(0, buffered ? .04 : 0, 0); a.vel.set(0, buffered ? -2 : 0, 0);
  a.grounded = !buffered; a.ground.hit = !buffered; a.coyote = 0; a.form = 'kid';
  let tick = 0, landing, launch, response;
  for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
    a.intent.jump = !tap || tick === 0;
    f.G.time += dt; a.update(dt);
    if (tick === 0) landing = { grounded: a.grounded, buffer: a.jumpBuffer, serial: a.s3JumpSerial || 0 };
    if (!launch && a.s3JumpSerial) launch = { tick, held: a.intent.jump, serial: a.s3JumpSerial };
    const state = f.normalJumpHoldState(a);
    if (state?.released) response ||= { ...state };
    if (a.s3JumpSerial) rows.push([a.pos.y, a.vel.y, a.grounded]);
    tick++;
  });
  return { landing, launch, response, rows, apex: Math.max(...rows.map(row => row[0])) };
}

test('#890 negative control: released buffered input never consumes the old short-hop response', async () => {
  const f = await world(true), tap = jump(f), held = jump(f, { tap: false });
  assert.equal(tap.landing.grounded, true); assert.equal(tap.landing.serial, 0);
  assert.equal(tap.launch.held, false); assert.equal(tap.response.applied, false);
  assert.deepEqual(tap.rows, held.rows);
});

test('#890 actual buffered 1F tap retains admission and uses the existing ordinary short-hop response', async () => {
  const f = await world(), tap = jump(f), held = jump(f, { tap: false });
  const direct = jump(f, { buffered: false });
  assert.equal(tap.landing.grounded, true); assert.equal(tap.landing.serial, 0);
  assert.equal(tap.landing.buffer, f.PLAYER.jumpBuffer);
  assert.equal(tap.launch.tick, 1); assert.equal(tap.launch.held, false);
  assert.equal(tap.response.applied, true);
  assert.equal(tap.response.serial, tap.launch.serial);
  assert(tap.apex < held.apex);
  assert.deepEqual(tap.rows, direct.rows.slice(0, tap.rows.length));
  assert.equal(tap.rows.at(-1)[2], true);
});

test('#890 buffered-release jump is identical under 30/60/120Hz fixed-step rendering', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) traces.push(jump(await world(), { hz }));
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});
