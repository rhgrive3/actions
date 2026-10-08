import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const CURB_FRONT = 0.6;

function installLevel(f, blocks) {
  const layout = {
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[-18, 0, 0], [18, 0, 0]],
    spawnBarrier: 0,
    half: [],
    single: blocks,
  };
  f.G.level = new f.Level(layout);
  f.G.physics = new f.Physics(f.G.level);
}

function floorAndCurb(ceiling = null) {
  const blocks = [
    { kind: 'box', min: [-10, -1, -10], max: [10, 0, 10] },
    { kind: 'box', min: [-10, 0, CURB_FRONT], max: [10, 0.3, 10] },
  ];
  if (ceiling) blocks.push({ kind: 'box', min: [-10, ceiling, -10], max: [10, ceiling + 1, 10] });
  return blocks;
}

async function productionWorld(blocks) {
  const f = await fixture({ productionComposition: true, fullRuntime: true });
  installLevel(f, blocks);
  f.G.paint = { sample: () => 1, splat: () => 0 };
  return f;
}

function actorAt(f, { z = -1.2, y = 0, form = 'kid', move = 1 } = {}) {
  const a = f.make();
  delete a._integrate; // retain the composed native Actor/Physics integration path
  a.pos.set(0, y, z);
  a.vel.set(0, 0, 0);
  a.intent.move.set(0, 0, move);
  a.form = form;
  a.intent.squid = form === 'squid';
  a._prevIntent.squid = form === 'squid';
  a.grounded = true;
  f.G.actors = [a];
  const support = f.G.physics.groundProbe(a.pos.x, a.pos.y, a.pos.z, 0.4, 0.35,
    f.PLAYER.footRadius, a.ground, false);
  assert.equal(support.hit, true, 'native groundProbe starts on actual level geometry');
  a.grounded = true;
  a.groundN.copy(support.normal);
  a._surface();
  return a;
}

function advance(f, a, hz, seconds = 2) {
  const clock = new f.FixedClock();
  const trace = [];
  for (let frame = 0; frame < hz * seconds; frame++) {
    clock.advance(1 / hz, dt => {
      f.G.time += dt;
      a.update(dt);
      trace.push({ y: a.pos.y, z: a.pos.z, grounded: a.grounded });
    });
  }
  return trace;
}

function jumpAdvance(f, a, hz, seconds = 2) {
  advance(f, a, hz, 18 / 60); // build the approach used by the reviewer before the jump press
  const clock = new f.FixedClock();
  const trace = [];
  let jumpPending = true;
  for (let frame = 0; frame < hz * seconds; frame++) {
    clock.advance(1 / hz, dt => {
      f.G.time += dt;
      a.intent.jump = jumpPending;
      a.update(dt);
      if (a.s3JumpSerial > 0) jumpPending = false;
      trace.push({ y: a.pos.y, z: a.pos.z, grounded: a.grounded, wall: a.contacts.wall, jumpSerial: a.s3JumpSerial || 0 });
    });
  }
  return trace;
}

test('#1160 full production composition rejects a blocked curb step without walking through its side', async () => {
  const f = await productionWorld(floorAndCurb(1.5));
  const radius = f.PLAYER.s3HumanoidTerrainRadiusRaw * f.PLAYER.s3TerrainDistanceScale;
  const expectedFront = CURB_FRONT - radius;
  let reference;
  for (const hz of [30, 60, 120]) {
    const a = actorAt(f);
    const trace = advance(f, a, hz);
    const sideContact = trace.findIndex((row, index) => index > 0 && row.z < trace[index - 1].z - 1e-6);
    assert.ok(sideContact > 0, 'first rejected rise resolves against the curb side');
    assert.ok(Math.abs(trace[sideContact].y) < 1e-6);
    assert.ok(Math.abs(trace[sideContact].z - expectedFront) < 0.03,
      `first side resolution uses the form radius (z=${trace[sideContact].z}, expected ${expectedFront})`);
    if (hz === 30) console.log(`#1160 after: first rejected rise at tick ${sideContact}, y=${trace[sideContact].y}, z=${trace[sideContact].z}`);
    const elevated = trace.find(row => row.y > 0.05);
    assert.equal(elevated, undefined, `a ${hz} Hz render cadence must not snap into the 1.50 m ceiling`);
    assert.equal(trace.every(row => Math.abs(row.y) < 1e-6), true, 'blocked curb remains on the same flat floor without bounce');
    assert.ok(Math.abs(a.pos.y) < 0.02, `blocked curb leaves feet on the lower floor (y=${a.pos.y})`);
    assert.ok(a.pos.z <= expectedFront + 0.03,
      `rejected 0.30 m step blocks the curb side (z=${a.pos.z}, expected <= ${expectedFront})`);
    assert.equal(a.grounded, true);
    assert.equal(f.G.physics.bodyFits(a.pos, radius, f.PLAYER.stepUp, f.PLAYER.height), true,
      'the committed lower-floor body pose fits solid geometry');
    if (reference) assert.deepEqual(trace, reference, 'fixed gameplay ticks are independent of render cadence');
    else reference = trace;
  }
});

test('#1160 full production composition rejects a jump landing that cannot fit beneath a roof', async () => {
  let reference;
  for (const hz of [30, 60, 120]) {
    const f = await productionWorld(floorAndCurb(1.5));
    const a = actorAt(f);
    const trace = jumpAdvance(f, a, hz);
    assert.ok(a.s3JumpSerial > 0, 'the native Actor admitted the reviewer’s jump input');
    const invalidLanding = trace.findIndex(row => row.grounded && row.y > 0.05);
    assert.equal(invalidLanding, -1,
      `a ${hz} Hz jump must not commit feet to the 0.30 m curb beneath the 1.50 m roof`);
    assert.equal(trace.some(row => row.grounded && Math.abs(row.y) < 0.02 && row.wall), true,
      'rejected raised support resolves against the curb side while retaining the lower floor');
    assert.ok(Math.abs(a.pos.y) < 0.02);
    assert.ok(a.pos.z <= CURB_FRONT - f.PLAYER.s3HumanoidTerrainRadiusRaw * f.PLAYER.s3TerrainDistanceScale + 0.03);
    if (reference) assert.deepEqual(trace, reference, 'jump clearance agrees at 30/60/120 Hz render cadence');
    else reference = trace;
  }

  reference = null;
  for (const hz of [30, 60, 120]) {
    const f = await productionWorld(floorAndCurb());
    const a = actorAt(f);
    const trace = jumpAdvance(f, a, hz);
    assert.ok(trace.some(row => row.grounded && Math.abs(row.y - 0.3) < 0.01),
      `an open ${hz} Hz jump still lands on the curb support`);
    if (reference) assert.deepEqual(trace, reference, 'open jump landing agrees at 30/60/120 Hz render cadence');
    else reference = trace;
  }
});

test('#1160 controls keep open curbs, slopes, step-downs, and grate form rules stable', async () => {
  const f = await productionWorld(floorAndCurb());
  const cadences = [30, 60, 120];
  let reference;
  for (const hz of cadences) {
    f.G.time = 0;
    installLevel(f, floorAndCurb());
    let a = actorAt(f);
    let trace = advance(f, a, hz);
    assert.ok(Math.abs(a.pos.y - 0.3) < 0.01, `unobstructed curb is still walkable at ${hz} Hz`);
    assert.equal(trace.filter((row, i) => i > 0 && row.y > trace[i - 1].y + 0.01).length, 1,
      'open curb produces one upward step without bounce');
    assert.equal(trace.filter((row, i) => i > 0 && row.y < trace[i - 1].y - 0.01).length, 0);

    f.G.time = 0;
    installLevel(f, [
      { kind: 'box', min: [-10, -1, -12], max: [10, 0, 12] },
      { kind: 'ramp', low: [0, 0, -6], high: [0, 1.2, 6], width: 8, thickness: 1.6 },
    ]);
    a = actorAt(f, { z: -7 });
    trace = advance(f, a, hz, 2);
    const slopeSteps = trace.filter((row, i) => i > 0 && row.y > trace[i - 1].y + 1e-4);
    assert.ok(a.pos.y > 0.2 && a.pos.y < 1.3, `native ground following climbs the slope at ${hz} Hz (y=${a.pos.y})`);
    assert.ok(slopeSteps.length > 5, 'slope height is followed continuously across fixed ticks');
    assert.equal(trace.filter((row, i) => i > 0 && row.y < trace[i - 1].y - 0.02).length, 0,
      'slope traversal does not bounce vertically');

    f.G.time = 0;
    installLevel(f, [
      { kind: 'box', min: [-10, -1, -10], max: [10, 0, 10] },
      { kind: 'box', min: [-10, 0, -10], max: [10, 0.3, CURB_FRONT] },
    ]);
    a = actorAt(f, { z: -1.2, y: 0.3 });
    trace = advance(f, a, hz, 2);
    assert.ok(Math.abs(a.pos.y) < 0.01, `step-down settles on the lower floor at ${hz} Hz`);
    assert.equal(trace.filter((row, i) => i > 0 && row.y < trace[i - 1].y - 0.01).length, 1,
      'step-down is a single height change without vertical bounce');
    assert.equal(trace.filter((row, i) => i > 0 && row.y > trace[i - 1].y + 0.01).length, 0);

    f.G.time = 0;
    const grate = [
      { kind: 'box', min: [-10, -1, -10], max: [10, 0, 10] },
      { kind: 'box', min: [-3, 0, -3], max: [3, 0.3, 3], grate: true },
    ];
    installLevel(f, grate);
    const kid = actorAt(f, { z: 0, y: 0.3, move: 0 });
    const kidTrace = advance(f, kid, hz, 0.5);
    assert.ok(Math.abs(kid.pos.y - 0.3) < 0.01, 'kid stands on the grate');
    assert.equal(kidTrace.every(row => Math.abs(row.y - 0.3) < 0.01), true);
    f.G.time = 0;
    installLevel(f, grate);
    const squid = actorAt(f, { z: 0, y: 0.3, form: 'squid', move: 0 });
    const squidTrace = advance(f, squid, hz, 0.5);
    assert.ok(Math.abs(squid.pos.y) < 0.01, 'squid passes through the grate to the floor below');
    assert.ok(squidTrace[0].y < 0.01, 'squid reaches the lower floor on its first fixed tick');
    assert.equal(squidTrace.filter((row, i) => i > 0 && Math.abs(row.y - squidTrace[i - 1].y) > 0.01).length, 0,
      'grate fall settles without oscillation');
    assert.equal(squidTrace.filter((row, i) => i > 0 && row.y > squidTrace[i - 1].y + 0.01).length, 0);

    if (reference) {
      assert.deepEqual(kidTrace, reference.kid, 'grate support agrees at 30/60/120 Hz render cadence');
      assert.deepEqual(squidTrace, reference.squid, 'squid grate fall agrees at 30/60/120 Hz render cadence');
    } else reference = { kid: kidTrace, squid: squidTrace };
  }
});
