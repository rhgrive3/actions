import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const afterAdmission = `    const started=(this.s3JumpSerial||0)!==before;
    if(started && this.alive && this.form==='kid' && !this.superJumpState &&
       !this.specialActive && !this.climbing) {`;
async function world(old = false) {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { normalJumpHoldState } from './patches/splatoon3/runtime/normal-jump-hold.mjs';",
    adaptRuntime: (rel, source) => old && rel === 'patches/splatoon3/runtime/normal-jump-hold.mjs'
      ? source.replace(afterAdmission, '    if(ordinary && this.s3JumpSerial!==before && !this.superJumpState) {') : source,
  });
  const level = new f.Level({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-20, -1, -20], max: [20, 0, 20] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  return f;
}
function actor(f, squid) {
  const a = f.make('shooter'); delete a._integrate;
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.form = squid ? 'squid' : 'kid';
  a.intent.squid = false; a.intent.jump = true;
  return a;
}
function trace(f, { squid = false, tap = false, hz = 60 } = {}) {
  const a = actor(f, squid), clock = new f.FixedClock(), rows = [];
  let frame = 0, launch;
  for (let render = 0; render < hz; render++) clock.advance(1 / hz, dt => {
    a.intent.jump = !tap || frame === 0;
    f.G.time += dt; a.update(dt);
    if (!frame) launch = { form: a.form, serial: a.s3JumpSerial, state: f.normalJumpHoldState(a) };
    rows.push([a.pos.y, a.vel.y, a.grounded, a.s3JumpSerial || 0]); frame++;
  });
  return { launch, rows, apex: Math.max(...rows.map(row => row[0])) };
}

test('#890 old pre-update form gate loses tap/hold distinction during native emergence', async () => {
  const f = await world(true);
  const tap = trace(f, { squid: true, tap: true }), held = trace(f, { squid: true });
  assert.equal(tap.launch.form, 'kid'); assert.equal(tap.launch.serial, 1);
  assert.equal(tap.launch.state, null);
  assert.deepEqual(tap.rows, held.rows);
  assert(trace(f, { tap: true }).apex < tap.apex, 'the existing ordinary humanoid path already differs');
});

test('#890 real emergence jump uses the existing humanoid hold response at 30/60/120 Hz', async () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const f = await world();
    const humanTap = trace(f, { tap: true, hz }), humanHeld = trace(f, { hz });
    const emergeTap = trace(f, { squid: true, tap: true, hz }), emergeHeld = trace(f, { squid: true, hz });
    assert.equal(emergeTap.launch.form, 'kid'); assert.equal(emergeTap.launch.serial, 1);
    assert.equal(emergeTap.launch.state.serial, 1);
    assert.deepEqual(emergeTap.rows, humanTap.rows, 'same actual humanoid launch has the same short-hop trace');
    assert.deepEqual(emergeHeld.rows, humanHeld.rows, 'held trajectory is unchanged');
    assert(emergeTap.apex < emergeHeld.apex);
    assert.equal(emergeTap.rows.at(-1)[2], true, 'real physics returns the tap to the floor');
    results.push([emergeTap.rows, emergeHeld.rows]);
  }
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});

test('#890 grounded idle and swim-form launch never manufacture a humanoid hold epoch', async () => {
  const f = await world(), idle = actor(f, false);
  idle.intent.jump = false; f.tick(idle, 3);
  assert.equal(idle.s3JumpSerial, undefined);
  assert.equal(f.normalJumpHoldState(idle), null);
  const swim = actor(f, true); swim.intent.squid = true;
  f.tick(swim);
  assert.equal(swim.form, 'squid'); assert.equal(swim.s3JumpSerial, 1);
  assert.equal(f.normalJumpHoldState(swim), null);
  const emerged = actor(f, true); f.tick(emerged);
  assert.equal(f.normalJumpHoldState(emerged).serial, 1);
  emerged.reset(); assert.equal(f.normalJumpHoldState(emerged), null);
});
