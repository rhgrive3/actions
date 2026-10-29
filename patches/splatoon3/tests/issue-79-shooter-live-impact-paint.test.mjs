// #79: the LIVE Splattershot round (InkFlight 'shooter' profile) never visits the
// generic Projectiles._impact path, so the existing direct-_impact regressions do
// not cover play. Fire real rounds through Projectiles.fireShooter -> InkFlight ->
// Physics OBB contact -> CPU PaintSystem, for floor and wall contacts.
// Pinned S3 11.3.0 WeaponShooterNormal (Leanny/splat3@7280ff9c, SHA-256 dfca9f45...):
//   PaintParam WidthHalfNear/Middle 1.93, WidthHalfFar 1.71, DistanceMiddle 1.1,
//   DepthScaleMax 2.24, DepthScaleMin 1.31 (BreakFree 2.24 / 1.12);
//   WallDropCollisionPaintParam PaintRadiusShock 1.56.
// Inkipedia Splattershot (S3): "When a shot hits a wall, it will have an inking radius of 1.56 units."
// Paramtable defaults (Template:Shooter_data_S3): DistanceNear 1.1, DistanceFar 20, 10/35 degrees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { SOURCE_SHOT_PAINT_KIND, SOURCE_SPLASH_PAINT_KIND } from '../runtime/source-shot-footprint.mjs';

const near = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
const lerp = (a, b, t) => a + (b - a) * t, clamp01 = t => Math.max(0, Math.min(1, t));
// Independent restatement of the sourced floor rules (not imported from runtime).
const width = d => d <= 1.1 ? 1.93 : lerp(1.93, 1.71, clamp01((d - 1.1) / (20 - 1.1)));
const straightDepth = deg => lerp(2.24, 1.31, clamp01((deg - 10) / (35 - 10)));

async function liveWorld({ wall = false } = {}) {
  const f = await fixture({ productionComposition: true, realProjectiles: true, fullRuntime: true });
  const V = f.THREE.Vector3, G = f.G, ps = G.projectiles;
  const axes = () => [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)];
  const faces = [{ id: 0, block: 0, origin: new V(-20, 0, -5), u: new V(1, 0, 0), v: new V(0, 0, 1), n: new V(0, 1, 0),
    su: 40, sv: 45, wall: false, turf: true, paintable: true }];
  const blocks = [{ id: 0, solid: true, grate: false, center: new V(0, -1, 17.5), half: new V(20, 1, 22.5), axes: axes(),
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: new V(-20, -2, -5), aabbMax: new V(20, 0, 40) }];
  if (wall) {
    faces.push({ id: 1, block: 1, origin: new V(-20, 0, 6), u: new V(1, 0, 0), v: new V(0, 1, 0), n: new V(0, 0, -1),
      su: 40, sv: 4, wall: true, turf: false, paintable: true });
    blocks.push({ id: 1, solid: true, grate: false, center: new V(0, 2, 7), half: new V(20, 2, 1), axes: axes(),
      faces: [-1, -1, -1, -1, -1, 1], aabbMin: new V(-20, 0, 6), aabbMax: new V(20, 4, 8) });
  }
  G.level = { faces, blocks, groundHeight: () => 0, pointInside: () => false,
    queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 0; for (const b of blocks) out.push(b.id); return out; } };
  G.physics = new f.Physics(G.level); G.camera = new f.THREE.PerspectiveCamera(); G.settings = {};
  class CpuPaint extends f.PaintSystem { _initGPU() { this.quads = 0; } _pushQuad() {} }
  G.paint = new CpuPaint(null, G.level, { atlasSize: 1024, maxDensity: 8, cell: .25 });
  const records = [], splat = G.paint.splat;
  G.paint.splat = function (center, radius, team, opts = {}) {
    const area = splat.call(this, center, radius, team, opts);
    records.push({ center: center.toArray(), radius, kind: opts.kind, stretch: opts.stretchAmt ?? 0, area });
    return area;
  };
  const actor = f.make('shooter'); actor.pos.set(0, 0, 0); actor.character.root.position.copy(actor.pos);
  actor.nid = 7; actor.owner = 'local'; actor._nearCamera = () => false;
  const nativeAddTurf = actor.addTurf, initialTurf = actor.stats.turf, initialSpecial = actor.special;
  assert.ok(Number.isFinite(initialTurf) && Number.isFinite(initialSpecial));
  assert.ok(Number.isFinite(actor.specialCost()) && !actor.specialActive);
  let turf = 0;
  actor.addTurf = function (area) { turf += area; return nativeAddTurf.call(this, area); };
  let generic = 0; const impact = ps._impact;
  ps._impact = function (...args) { generic++; return impact.apply(this, args); };
  const contacts = [], native = ps.inkFlight.impact;
  ps.inkFlight.impact = function (p, hit) {
    contacts.push({ phase: p.inkPhase, distance: p.start.distanceTo(hit.point), normalY: hit.normal.y,
      angle: Math.asin(Math.min(1, Math.abs(p.vel.dot(hit.normal)) / p.vel.length())) * 180 / Math.PI });
    return native.call(this, p, hit);
  };
  return { f, actor, ps, records, contacts, turf: () => turf, initialTurf, initialSpecial, generic: () => generic };
}
function checkCredit(s) {
  const actor = s.actor, total = s.records.reduce((sum, r) => sum + r.area, 0);
  near(s.turf(), total, 'recorded paint areas reach the actual actor');
  near(actor.stats.turf, s.initialTurf + total, 'native Actor.addTurf updates shooter stats');
  near(actor.special, Math.min(actor.specialCost(), s.initialSpecial + total), 'native Actor.addTurf applies the special gauge cap');
}
function fire(s, { angle = 20, height = 0 } = {}) {
  const { actor: a, ps } = s, rad = angle * Math.PI / 180;
  a.pos.y = height; a.character.root.position.copy(a.pos);
  a.aimDir.set(0, -Math.sin(rad), Math.cos(rad));
  a.aimPoint.copy(a.pos).add(new s.f.THREE.Vector3(0, 1.05, 0)).addScaledVector(a.aimDir, 80);
  s.f.setRandom(() => .5); // centred spread draw; no new gameplay constant
  ps.fireShooter(a, a.weapon, 0);
  const p = ps.list.at(-1);
  assert.equal(p.inkKey, 'shooter', 'live Splattershot round is an InkFlight round');
  return p;
}
function advance(s, rate = 60, seconds = 2) {
  let carry = 0;
  for (let i = 0; i < rate * seconds; i++) {
    carry += 1 / rate;
    while (carry >= 1 / 60 - 1e-10) { s.f.G.time += 1 / 60; s.ps.update(1 / 60); carry -= 1 / 60; }
  }
}

test('#79 live floor impacts: near/far width and shallow/mid/steep straight-phase depth reach CPU paint', async () => {
  const seen = [];
  for (const angle of [8, 15, 22.5, 30, 60, 85]) {
    const s = await liveWorld();
    fire(s, { angle });
    advance(s);
    assert.equal(s.generic(), 0, 'generic _impact is never visited by live rounds');
    assert.equal(s.contacts.length, 1);
    const hit = s.contacts[0], body = s.records.find(r => r.kind === SOURCE_SHOT_PAINT_KIND);
    assert.ok(hit.normalY > .99 && body?.area > 0, 'floor body paint');
    near(body.radius, width(hit.distance), 'sourced near/far width at ' + angle);
    if (hit.phase === 0) near(body.stretch / 1.6, straightDepth(hit.angle) - 1, 'straight-phase depth at ' + angle);
    checkCredit(s);
    seen.push({ angle: hit.angle, distance: hit.distance, phase: hit.phase, radius: body.radius, stretch: body.stretch });
  }
  // Coverage of the sourced bands, measured from the actual contacts.
  assert.ok(seen.some(c => c.distance <= 1.1), 'a near (<= DistanceNear) contact');
  assert.ok(seen.some(c => c.distance > 1.1), 'a farther contact');
  assert.ok(seen.some(c => c.phase === 0 && c.angle < 10), 'a shallow straight contact');
  assert.ok(seen.some(c => c.phase === 0 && c.angle > 35), 'a steep straight contact');
  const radii = seen.map(c => c.radius);
  assert.ok(Math.max(...radii) - Math.min(...radii) > 1e-3, 'width varies with distance');
});

test('#79 live wall contact paints the sourced 1.56 shock radius once, deterministically', async () => {
  const shocks = [];
  for (const seed of [.11, .5, .93]) {
    const s = await liveWorld({ wall: true });
    s.f.setRandom(() => seed);
    const { actor: a, ps } = s;
    a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 6);
    ps.fireShooter(a, a.weapon, 0);
    advance(s, 60, 1 / 60 * 3);
    assert.equal(s.generic(), 0);
    const wall = s.records.filter(r => Math.abs(r.center[2] - 6) < .1 && r.center[1] > .3);
    assert.ok(wall.length >= 1, 'wall contact paints');
    near(wall[0].radius, 1.56, 'PaintRadiusShock');
    assert.equal(wall[0].kind, SOURCE_SPLASH_PAINT_KIND);
    assert.ok(!s.records.some(r => r.kind === SOURCE_SHOT_PAINT_KIND && Math.abs(r.center[2] - 6) < .1), 'no floor body footprint on the wall');
    // This low wall splat also overlaps the floor: only those floor cells score.
    const face = s.f.G.level.faces[0], counts = s.f.G.paint.counts;
    assert.ok(counts[a.team] > 0, 'the low wall splash reaches the floor');
    near(s.turf(), counts[a.team] * face.cu * face.cv, 'wall-adjacent turf comes from owned floor cells');
    checkCredit(s);
    shocks.push(wall[0].radius);
  }
  assert.ok(shocks.every(r => r === shocks[0]), 'no cosmetic radius jitter');
});

test('#79 elevated live wall impact paints wall cells without awarding floor turf', async () => {
  const s = await liveWorld({ wall: true }), { actor: a, ps } = s, paint = s.f.G.paint;
  a.pos.y = 2; a.character.root.position.copy(a.pos);
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 3.05, 6);
  s.f.setRandom(() => .5);
  const before = Array.from(paint.grid);
  ps.fireShooter(a, a.weapon, 0); advance(s, 60, 3 / 60);
  assert.equal(s.generic(), 0, 'the live InkFlight path owns the wall impact');
  const wall = s.records.filter(r => Math.abs(r.center[2] - 6) < .1 && r.center[1] > 2);
  assert.equal(wall.length, 1, 'the elevated shot actually splats the wall');
  near(wall[0].radius, 1.56, 'dedicated wall shock radius');
  assert.equal(wall[0].kind, SOURCE_SPLASH_PAINT_KIND);
  assert.equal(wall[0].area, 0, 'wall-only paint returns no scored floor area');
  const [floorFace, wallFace] = s.f.G.level.faces;
  const changed = face => Array.from(paint.grid.slice(face.grid, face.grid + face.nu * face.nv))
    .filter((value, i) => value !== before[face.grid + i]).length;
  assert.ok(changed(wallFace) > 0, 'the impact changes real wall ownership cells');
  assert.equal(changed(floorFace), 0, 'no floor cells are affected');
  assert.equal(paint.counts[a.team], 0, 'wall ownership is excluded from the floor count');
  assert.equal(s.turf(), 0, 'the shooter earns no turf for wall-only paint');
  checkCredit(s);
});

test('#79 live long-fall impact reaches the far width anchor and credits actual floor area', async () => {
  const s = await liveWorld();
  s.initialSpecial = s.actor.special = s.actor.specialCost() - 1;
  // A naturally fired horizontal round from an elevated position reaches the
  // 20-unit distance anchor without changing projectile speed or lifetime.
  fire(s, { angle: 0, height: 10 }); advance(s);
  assert.equal(s.generic(), 0);
  assert.equal(s.contacts.length, 1);
  assert.ok(s.contacts[0].distance >= 20, 'actual contact reaches DistanceFar');
  const body = s.records.find(r => r.kind === SOURCE_SHOT_PAINT_KIND);
  assert.ok(body?.area > 0, 'actual far impact claims floor turf');
  near(body.radius, 1.71, 'sourced WidthHalfFar');
  const floorFace = s.f.G.level.faces[0];
  near(s.turf(), s.f.G.paint.counts[s.actor.team] * floorFace.cu * floorFace.cv, 'far impact and drops credit owned floor cells');
  checkCredit(s);
  assert.equal(s.actor.special, s.actor.specialCost(), 'far paint reaches but never exceeds the native special cap');
});

test('#79 live floor paint and turf agree across 30/60/120 render schedules', async () => {
  const outcomes = [];
  for (const rate of [30, 60, 120]) {
    const s = await liveWorld(); fire(s, { angle: 22.5 }); advance(s, rate);
    assert.equal(s.contacts.length, 1);
    checkCredit(s);
    outcomes.push(JSON.parse(JSON.stringify({ paint: s.records, turf: s.turf(), statsTurf: s.actor.stats.turf,
      special: s.actor.special, counts: Array.from(s.f.G.paint.counts) })));
  }
  assert.deepEqual(outcomes[1], outcomes[0]);
  assert.deepEqual(outcomes[2], outcomes[0]);
});
