// Issue #649: real composed Roller rolling paint must widen with ground speed.
// Splatoon 3 Ver.11.3.0 Splat Roller `BodyParam.PaintParam` = { SpeedMax 0.132,
// WidthHalfMax 2.8 }; verified system behavior is that faster rolling paints a
// wider trail because the floor-only side splashes grow with movement speed,
// while the Roller body contact strip is the wall-painting surface. This test
// drives the real Actor/WeaponRunner/WeaponsFidelity composition (batch fixture)
// and measures the actual emitted CPU footprint; #189's maximum-width calibration
// is the upper endpoint and is not re-calibrated here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFixture, cpuFloor } from './batch03-fixture.mjs';
import { rollingMovementSpeed } from '../runtime/movement-physics.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// One real `_roller` paint update at a controlled ground speed (moved = 1 > 0.28).
async function draw(speed, { yaw = 0, dt = 1 / 60, ink = 100 } = {}) {
  const f = await batchFixture(), a = f.make('roller'), r = a.weaponRunner;
  a.isLocal = true; a.yaw = yaw; a.ink = ink;
  a.intent.move.set(Math.sin(yaw), 0, Math.cos(yaw));
  a.vel.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
  r.rolling = true; r.rollT = 1.5;
  r.lastRollPos = a.pos.clone().add(new f.THREE.Vector3(0, 0, -1));
  r._roller(dt, { fire: true }, a.weapon);
  return { f, a, r };
}
function widthOf(f, axis = 'x') {
  const floor = cpuFloor(f, 20, .025);
  f.paint.forEach(e => floor.splat(e.point, e.radius, e.team, e.opts));
  return floor.extent(axis).width;
}

test('#649 real rolling footprint widens monotonically with ground speed; #189 maximum is the upper endpoint', async () => {
  const speeds = [0, 0.5, 1, 3.24, 6.48, 7.0, 7.8, 7.92];
  const widths = [];
  for (const s of speeds) widths.push(widthOf((await draw(s)).f));
  for (let i = 1; i < widths.length; i++)
    assert.ok(widths[i] > widths[i - 1] + 1e-6, `speed ${speeds[i]} must be wider than ${speeds[i - 1]} (${widths})`);
  assert.ok(Math.abs(widths.at(-1) - 5.6) < .06, `SpeedMax regime reaches the #189 5.6 calibration (${widths.at(-1)})`);
  // A low/early-roll sample is measurably narrower than the dash sample.
  assert.ok(widths[1] < widths.at(-1) - 1, 'low-speed sample measurably narrower than dash');
});

test('#649 speed saturation: at and above the SpeedMax regime the footprint no longer widens', async () => {
  const atMax = widthOf((await draw(7.92)).f), above = widthOf((await draw(11.88)).f);
  assert.ok(Math.abs(atMax - above) < 1e-9, 'clamped at SpeedMax');
  assert.ok(Math.abs(atMax - 5.6) < .06);
});

test('#649 composed 90F dash transition changes paint width without changing contact-damage width', async () => {
  const f = await batchFixture(), w = f.WEAPONS.roller;
  const before = rollingMovementSpeed({ a: { weapon: w }, rollT: 89 / 60 });
  const after = rollingMovementSpeed({ a: { weapon: w }, rollT: 90 / 60 });
  assert.equal(before, w.rollBaseSpeed); assert.equal(after, w.rollSpeed);
  const normal = await draw(before), dash = await draw(after);
  assert.ok(widthOf(dash.f) > widthOf(normal.f) + 1e-6, 'dash paints wider');
  assert.equal(normal.a.weapon.rollWidth, dash.a.weapon.rollWidth, 'contact-damage width unchanged');
  assert.equal(dash.a.weapon.rollWidth, 1.9);
});

test('#649 side splashes are floor-only and cannot paint a wall the Roller body does not contact', async () => {
  const f = await draw(7.92);
  assert.equal(f.f.paint.length, 5, '3 native body bands + 2 speed-scaled floor bands');
  assert.ok(f.f.paint.slice(0, 3).every(e => e.opts.kind === 'roll'), 'body contact bands unchanged');
  assert.ok(f.f.paint.slice(3).every(e => e.opts.kind === 'rollFloor'), 'side splashes are the floor alias');
  // Real PaintSystem projection with one floor and one wall face.
  const V = f.f.THREE.Vector3;
  const faces = [
    { origin: new V(), n: new V(0, 1, 0), u: new V(1, 0, 0), v: new V(0, 0, 1), su: 20, sv: 20, atlas: {}, wall: false },
    { origin: new V(), n: new V(1, 0, 0), u: new V(0, 0, 1), v: new V(0, 1, 0), su: 20, sv: 20, atlas: {}, wall: true },
  ];
  const touched = [], p = Object.create(f.f.PaintSystem.prototype);
  Object.assign(p, {
    level: { faces, blocks: [{ faces: [0, 1, -1, -1, -1, -1], aabbMin: new V(-2, -2, -2), aabbMax: new V(20, 20, 20) }], queryBlocks: () => [0] },
    growing: [], clock: 0, _wetUntil: 0, _splatEntryPool: [], _splatGrowthPool: [],
    _splatPoolStats: { entryArraysCreated: 0, growthRecordsCreated: 0 },
    _cpuSplat(face) { touched.push(face.wall); return 1; }, _emitGrowth() {}, _rippledNear: () => true,
  });
  p.splat(new V(.1, .1, 1), 1, 0, { seed: .5, kind: 'rollFloor', stretch: new V(0, 0, 1) });
  assert.deepEqual(touched, [false], 'side splash reaches floor only');
  touched.length = 0;
  p.splat(new V(.1, .1, 1), 1, 0, { seed: .5, kind: 'roll', stretch: new V(0, 0, 1) });
  assert.deepEqual(touched, [false, true], 'body contact still paints walls');
});

test('#649 unchanged: roll speeds, dash timing, damage width, ink consumption and deterministic geometry', async () => {
  const slow = await draw(1), fast = await draw(7.92);
  const w = fast.a.weapon;
  assert.ok(Math.abs(w.rollBaseSpeed - 6.48) < 1e-9 && w.rollSpeed === 7.92 && w.rollDashTime === 1.5);
  assert.equal(w.rollDamage, 125);
  // Ink consumption follows distance, not paint width: both emissions moved exactly 1 unit.
  assert.ok(Math.abs((100 - slow.a.ink) - (100 - fast.a.ink)) < 1e-9, 'ink/ metre independent of paint width');
  assert.ok(Math.abs((100 - fast.a.ink) - w.rollInkPerMeter) < 1e-9);
  // Deterministic sampling: same speed => same geometry at any frame interval.
  const a30 = await draw(3.24, { dt: 1 / 30 }), a60 = await draw(3.24, { dt: 1 / 60 }), a120 = await draw(3.24, { dt: 1 / 120 });
  assert.deepEqual(a60.f.paint.map(e => e.radius), a120.f.paint.map(e => e.radius));
  assert.deepEqual(a30.f.paint.map(e => e.radius), a120.f.paint.map(e => e.radius));
  assert.deepEqual(a60.f.paint.map(e => e.point.x), a120.f.paint.map(e => e.point.x));
});

// Real composed roll under the fixed 60 Hz gameplay clock, rendered from
// 30/60/120 Hz schedules. Position is advanced so the real paint emitter runs.
async function composedRoll(hz) {
  const f = await batchFixture(), a = f.make('roller'), r = a.weaponRunner, clock = new FixedClock();
  a.isLocal = true; a.yaw = 0; a.character.update = () => {}; delete a._finishFrame;
  a.grounded = true; a.intent.move.set(0, 0, 1);
  r.update(1 / 60, { fire: true, firePressed: true });
  for (let i = 0; i < 42; i++) r.update(1 / 60, { fire: true });
  a.vel.set(0, 0, 0);
  const splats = [], speeds = [];
  f.G.paint.splat = (point, radius, team, opts) => { splats.push({ tick: clock.ticks, x: point.x, y: point.y, z: point.z, radius, kind: opts.kind, stretch: opts.stretch ? { x: opts.stretch.x, y: opts.stretch.y, z: opts.stretch.z } : undefined }); return 1; };
  for (let i = 0; i < Math.round(150 / 60 * hz); i++) clock.advance(1 / hz, dt => {
    a.ink = 100; a._horizontal(dt, false, false);
    a.pos.x += a.vel.x * dt; a.pos.z += a.vel.z * dt;
    r.update(dt, { fire: true });
    speeds.push(Math.hypot(a.vel.x, a.vel.z));
  });
  return { f, clock, splats, speeds };
}
function footprintOf(f, splats, lo, hi) {
  const floor = cpuFloor(f, 60, .05);
  for (const s of splats) if (s.tick >= lo && s.tick < hi) floor.splat({ x: s.x, y: s.y, z: s.z }, s.radius, 0, { seed: .5, kind: s.kind, stretch: s.stretch });
  return floor.extent('x').width;
}
function areaOf(splats, lo, hi) {
  let area = 0;
  for (const s of splats) if (s.tick >= lo && s.tick < hi) area += Math.PI * Math.max(0, s.radius * s.radius - s.y * s.y);
  return area;
}

test('#649 composed roll: 30/60/120 Hz render schedules share the same speed trace and CPU/GPU paint area', async () => {
  const runs = {};
  for (const hz of [30, 60, 120]) runs[hz] = await composedRoll(hz);
  for (const hz of [30, 60, 120]) {
    assert.equal(runs[hz].clock.ticks, 150, `${hz} Hz runs 150 authoritative 60 Hz ticks`);
    assert.equal(runs[hz].speeds.length, 150, `${hz} Hz one applied speed per tick`);
    assert.deepEqual(runs[hz].speeds, runs[60].speeds, `${hz} Hz speed trace matches 60 Hz`);
    assert.deepEqual(runs[hz].splats, runs[60].splats, `${hz} Hz emitted paint matches 60 Hz`);
  }
  const f = runs[60].f, splats = runs[60].splats;
  assert.ok(splats.some(s => s.kind === 'roll') && splats.some(s => s.kind === 'rollFloor'), 'both body and floor splash bands emitted');
  const early = footprintOf(f, splats, 0, 10), dash = footprintOf(f, splats, 145, 150);
  assert.ok(early < dash - 1e-6, `early-roll footprint ${early} narrower than settled dash ${dash}`);
  assert.ok(Math.abs(dash - 5.6) < .06, `settled dash footprint reaches the #189 5.6 maximum (${dash})`);
  assert.ok(areaOf(splats, 145, 150) > areaOf(splats, 0, 10), 'dash CPU/GPU paint area grows');
  assert.ok(runs[60].speeds[149] === runs[60].f.WEAPONS.roller.rollSpeed, 'settled at the dash speed');
});
