// PR1188: Blaster (WeaponBlasterMiddle, 11.3.0) floor paint from flight,
// timed airburst, terrain contact and direct hit, on real Level/Physics.
// Expected values come from the pinned source fields plus the explicitly
// labelled model (see BLASTER_FLOOR_PAINT_COMPARISON.md), never from a dump of
// this implementation's own output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR, blasterWorld, fire, run, settle, paintRecords, landings, cpuArea, cpuFootprint, flightAtHeight, splashDepthScale, splashStretch } from './blaster-floor-paint-harness.mjs';
import { advanceSplashDrops } from '../runtime/blaster-flight-paint.mjs';

const near = (a, b, eps = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} ${a} != ${b}`);
// Pinned 11.3.0 WeaponBlasterMiddle fields.
const SRC = { first: .5, spacing: 1.5, count: 7, width: 1.62, nearest: 2.43, hMax: 3, hMin: 10,
  dropRadius: 2.5, wallShock: 1.4, wallFirstDistance: 1.8, freeGravity: .016 };
// Type defaults absent from the sparse table (public analysis / prior #1107 import).
const DEFAULTS = { depthMax: 1.2, depthMin: 1.0, timedSplash: 2.0, timedDrop: 3.2 };
// Shared BulletSplashShooterSpawnParam defaults (upstream inkFlight.js INK_MODEL).
const SPAWN = { x: .055, zMax: .02 };
const expectedDepth = h => h <= SRC.hMax ? DEFAULTS.depthMax : h >= SRC.hMin ? DEFAULTS.depthMin :
  DEFAULTS.depthMax + (DEFAULTS.depthMin - DEFAULTS.depthMax) * (h - SRC.hMax) / (SRC.hMin - SRC.hMax);

test('PR1188 flight splashes: 7 drops at every height, no 4 WU cut-off, depth 1.2 -> 1.0 over 3..10', async () => {
  for (const h of [0, 2, 3, 3.95, 4, 4.05, 5, 10, 25]) {
    const { records, landings: land, spec } = await flightAtHeight(h);
    assert.equal(records.length, SRC.count, `height ${h}: every scheduled splash reaches the floor`);
    assert.equal(land.length, SRC.count);
    const releases = land.map(l => l.releaseZ).sort((a, b) => a - b);
    releases.forEach((z, i) => near(z, SRC.first + i * SRC.spacing, 1e-6, `release ${h}/${i}`));
    land.forEach((l, i) => {
      const r = records[i], fall = Math.max(l.frames, 1) / 60;
      near(l.y, 0, 1e-6, `floor ${h}/${i}`);
      near(l.height, Math.max(h, 1e-3), 1e-6, `drop height ${h}/${i}`);
      // Seeded spawn velocity (defaults X 0.055, Z 0.01..0.02 DU/F) only scatters the landing.
      assert.ok(Math.abs(l.x - l.releaseX) <= SPAWN.x * 60 * fall + 1e-9, `lateral ${h}/${i}`);
      assert.ok(l.z - l.releaseZ >= -1e-9 && l.z - l.releaseZ <= SPAWN.zMax * 60 * fall + 1e-9, `forward ${h}/${i}`);
      const depth = expectedDepth(l.height);
      near(l.depth, depth, 1e-9, `depth ${h}/${i}`);
      near(splashDepthScale(spec, l.height), depth, 1e-9);
      const radius = Math.abs(l.releaseZ - SRC.first) < 1e-6 ? SRC.nearest : SRC.width, { amount, centreBack } = splashStretch(depth, radius);
      near(r.radius, radius, 1e-12, `radius ${h}/${i}`);
      near(r.y, .005, 1e-6, `struck-face offset ${h}/${i}`);
      near(r.z, l.z - centreBack, 1e-6, `centred footprint ${h}/${i}`);
      near(r.stretchAmt, amount, 1e-9, `stretch ${h}/${i}`);
    });
  }
  // Continuity across the former 4.0 WU probe limit.
  const d = h => expectedDepth(h);
  assert.ok(Math.abs(d(3.95) - d(4.05)) < .01 && d(3.95) > d(4) && d(4) > d(4.05));
});

test('PR1188 flight splash CPU area follows the sourced depth: ellipse length and area', async () => {
  const low = await flightAtHeight(2), high = await flightAtHeight(10);
  const single = (w, r) => cpuArea(w, [r], { offsetZ: r.z });
  // Nearest splash alone (radius 2.43): area ratio equals the depth ratio 1.2 within grid quantisation.
  const aLow = single(low.w, low.records[0]), aHigh = single(high.w, high.records[0]);
  near(aLow / aHigh, DEFAULTS.depthMax / DEFAULTS.depthMin, .04, 'area ratio');
  // Absolute body area against the ellipse PI r^2 depth (blob wobble mean ~1.03, 0.97 CPU edge, 0.25 cells).
  near(aHigh / (Math.PI * SRC.nearest ** 2), 1, .12, 'circle area');
  // Footprint length along the shot scales with depth; width across it does not.
  const fLow = cpuFootprint(low.w, [low.records[1]], { offsetZ: low.records[1].z });
  const fHigh = cpuFootprint(high.w, [high.records[1]], { offsetZ: high.records[1].z });
  near(fLow.z.width / fHigh.z.width, 1.2, .08, 'length ratio');
  near(fLow.x.width / fHigh.x.width, 1, .04, 'width ratio');
});

test('PR1188 live round: actor height 0/2/4/10, 30/60/120 Hz render cadence give identical landings', async () => {
  for (const actorY of [0, 2, 4, 10]) {
    const snapshots = [];
    for (const hz of [30, 60, 120]) {
      const w = await blasterWorld({ actorY }); fire(w); run(w, hz); settle(w);
      const records = paintRecords(w).map(r => [r.x, r.y, r.z, r.radius, r.stretchAmt].map(v => +v.toFixed(9)));
      snapshots.push(records.sort((a, b) => a[2] - b[2] || a[3] - b[3]));
    }
    assert.deepEqual(snapshots[0], snapshots[1], `actor ${actorY}: 30 vs 60 Hz`);
    assert.deepEqual(snapshots[1], snapshots[2], `actor ${actorY}: 60 vs 120 Hz`);
    const records = snapshots[1];
    const flight = records.filter(r => r[3] === SRC.width || r[3] === SRC.nearest);
    assert.equal(flight.length, SRC.count, `actor ${actorY}: 7 flight splashes`);
    assert.ok(records.some(r => r[3] === DEFAULTS.timedDrop && Math.abs(r[1] - .1) < 1e-6), `actor ${actorY}: timed burst drop lands on the floor`);
    assert.ok(flight.every(r => Math.abs(r[1] - .005) < 1e-6), `actor ${actorY}: flight splashes paint the struck floor face`);
    // The round only descends after its straight phase, so every release is at
    // or below the muzzle: depth lies between depth(muzzle) and DepthScaleMax.
    const muzzle = actorY + 1.05, depth = expectedDepth(muzzle);
    for (const r of flight) {
      assert.ok(r[4] >= splashStretch(depth, r[3]).amount - 1e-9, `depth at actor ${actorY}`);
      assert.ok(r[4] <= splashStretch(DEFAULTS.depthMax, r[3]).amount + 1e-9, `depth cap at actor ${actorY}`);
    }
  }
});

test('PR1188 ledge and slope: splashes land on the surface below their release point', async () => {
  // Shot at y=3.05 over a 2 WU ledge that starts at z=4.
  const ledge = await blasterWorld({ blocks: [FLOOR, { kind: 'box', min: [-10, 0, 4], max: [10, 2, 40] }], actorY: 2, aimY: 3.05 });
  ledge.a.pos.y = 2; fire(ledge); run(ledge); settle(ledge);
  const land = landings(ledge).filter(l => l.radius === SRC.width || l.radius === SRC.nearest);
  assert.equal(land.length, SRC.count);
  for (const l of land) {
    // Floor before the step, the step's riser (a drifting splash may meet it), or the ledge top.
    const riser = Math.abs(l.z - 4) < 1e-6 && Math.abs(l.normalY) < .45 && l.y > 0 && l.y < 2;
    assert.ok(riser || Math.abs(l.y - (l.z < 4 ? 0 : 2)) < 1e-6, `ledge landing ${JSON.stringify(l)}`);
    if (!riser) near(l.depth, expectedDepth(l.height), 1e-9);
  }
  assert.ok(land.some(l => Math.abs(l.y) < 1e-6) && land.some(l => Math.abs(l.y - 2) < 1e-6), 'both levels receive splashes');
  // Ramp from (0,0,2) rising to (0,3,14): every landing lies on the slope plane.
  const ramp = await blasterWorld({ blocks: [FLOOR, { kind: 'ramp', low: [0, 0, 2], high: [0, 3, 14], width: 8, thickness: .5 }], actorY: 4 });
  fire(ramp); run(ramp); settle(ramp);
  const onRamp = landings(ramp).filter(l => l.radius === SRC.width && l.y > .05);
  assert.ok(onRamp.length >= 4, 'several splashes land on the ramp');
  const slope = 3 / 12;
  for (const l of onRamp) {
    near(l.y, slope * (l.z - 2), .01, `ramp landing at ${l.z}`);
    assert.ok(l.normalY < 1 && l.normalY > .95, 'slope normal');
  }
});

test('PR1188 wall: a splash released within FirstDistance sticks to the wall, the rest fall; burst drop runs to the wall base', async () => {
  const w = await blasterWorld({ blocks: [FLOOR, { kind: 'box', min: [-10, 0, 6], max: [10, 6, 7] }] });
  fire(w); run(w); settle(w);
  const records = paintRecords(w), land = landings(w);
  const floorFlight = land.filter(l => (l.radius === SRC.width || l.radius === SRC.nearest) && Math.abs(l.y) < 1e-6);
  const wallShock = records.filter(r => r.radius === SRC.wallShock);
  // Releases at 0.5/2.0/3.5/5.0 from the muzzle (z=0.3); the round meets the wall at z=6.
  // Only the z=5.3 release is within 1.8 of the wall along the lowered velocity.
  assert.deepEqual(floorFlight.map(l => +l.releaseZ.toFixed(6)).sort((a, b) => a - b), [.8, 2.3, 3.8]);
  assert.equal(wallShock.length, 1, 'one splash becomes a SplashWallHit drop');
  near(wallShock[0].z, 6 - .025, 1e-3, 'wall drop on the struck face');
  const burstDrop = records.filter(r => r.radius === SRC.dropRadius);
  assert.equal(burstDrop.length, 1, 'terrain-contact burst drop');
  near(burstDrop[0].y, .1, 1e-6, 'burst drop reaches the floor at the wall base');
  assert.ok(burstDrop[0].z < 6 && burstDrop[0].z > 5, 'burst drop lands in front of the wall');
});

test('PR1188 timed airburst: sphere splash shrinks continuously with height, drop always paints 3.2', async () => {
  const areas = [];
  for (const actorY of [-.55, 0, 1, 2, 5, 10]) {
    const w = await blasterWorld({ actorY }); fire(w); run(w); settle(w);
    const records = paintRecords(w);
    const sphere = records.find(r => r.radius === DEFAULTS.timedSplash);
    const drop = records.find(r => r.radius === DEFAULTS.timedDrop);
    assert.ok(sphere, `sphere splash at ${actorY}`); assert.ok(drop, `drop at ${actorY}`);
    near(drop.y, .1, 1e-6); near(drop.x, sphere.x, 1e-9); near(drop.z, sphere.z, 1e-9);
    areas.push(cpuArea(w, [sphere], { offsetZ: sphere.z }));
  }
  for (let i = 1; i < areas.length; i++) assert.ok(areas[i] <= areas[i - 1] + 1e-9, `sphere area non-increasing ${areas}`);
  assert.equal(areas.at(-1), 0, 'a 10 WU airburst sphere reaches no floor');
  assert.ok(areas[0] > 0, 'a low airburst sphere paints the floor');
});

test('PR1188 direct hit in mid-air: the collision drop falls to the floor below the victim', async () => {
  const w = await blasterWorld({ actorY: 6 });
  const e = w.make('shooter'); e.team = 1; e.pos.set(0, 6, 5); e.alive = true; w.G.actors.push(e);
  fire(w); run(w); settle(w);
  const records = paintRecords(w);
  const collisionSphere = records.find(r => r.radius === 1.4);
  assert.ok(collisionSphere, 'direct hit has its own historical 1.4 collision-sphere model');
  assert.equal(records.filter(r => r.radius === DEFAULTS.timedSplash).length, 0,
    'a direct hit must not reuse the timed-airburst 2.0 sphere');
  const drop = records.find(r => r.radius === SRC.dropRadius);
  assert.ok(drop, 'direct-hit burst drop painted');
  near(drop.y, .1, 1e-6); assert.ok(Math.abs(drop.z - 5) < 1, 'below the victim');
});

test('PR1188 ownership: ghosts and remote owners queue nothing; clear and long falls retire drops', async () => {
  for (const mode of ['ghost', 'remote']) {
    const w = await blasterWorld(); const p = fire(w);
    if (mode === 'ghost') p.ghost = true; else w.a.remote = true;
    run(w); settle(w);
    assert.equal(paintRecords(w).filter(r => r.radius === SRC.width).length, 0, mode);
  }
  const w = await blasterWorld({ blocks: [{ kind: 'box', min: [-1, -.5, -1], max: [1, 0, 1] }], actorY: 2 });
  fire(w); run(w);
  const before = (w.G.projectiles._s3SplashDrops || []).length;
  for (let i = 0; i < 300; i++) advanceSplashDrops(w.G.projectiles, 1 / 60, w.G, -100);
  assert.equal((w.G.projectiles._s3SplashDrops || []).length, 0, `void falls retire (${before} queued)`);
  const again = await blasterWorld({ actorY: 30 }); fire(again); run(again, 60, .3);
  assert.ok((again.G.projectiles._s3SplashDrops || []).length > 0);
  again.G.projectiles.clear(); assert.equal(again.G.projectiles._s3SplashDrops.length, 0);
});
