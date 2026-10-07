import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const DEG = Math.PI / 180;
// The sector is measured from this glob's own spawn, never from world axes.
function at(from, distance, degrees, yaw = 0) {
  const a = degrees * DEG + yaw;
  return { x: from.x + Math.sin(a) * distance, y: from.y, z: from.z + Math.cos(a) * distance };
}
// Distance is measured exactly the way the runtime measures it.
function span(f, spawn, point) {
  return new f.THREE.Vector3(spawn.x, spawn.y, spawn.z).distanceTo(point);
}
// Only the geometry fields matter here; the rest mirrors a fired glob at age 0.
function glob(f, spawn, sectorYaw, extra = {}) {
  return {
    s3Weapon: f.WEAPONS.roller, s3Vertical: false, start: new f.THREE.Vector3(spawn.x, spawn.y, spawn.z),
    fidelitySectorYaw: sectorYaw, fidelityYaw: 0, age: 0, fidelityPrevAge: 0, fidelityImpactT: 1, ...extra,
  };
}

test('#734 hits just inside and just outside the source ±16° sector split bands, not a fixed launch yaw', async () => {
  const f = await fixture(), spawn = { x: 0, y: 0, z: 0 };
  const inside = f.WEAPONS.roller.flickDamageBands, outside = f.WEAPONS.roller.ballistics.horizontalOutsideDamageBands;
  for (const degrees of [-15.99, 15.99]) {
    const p = glob(f, spawn, 0), o = at(spawn, 5, degrees);
    assert.ok(Math.abs(f.rollerHitAngle(p, o)) < f.WEAPONS.roller.ballistics.horizontalInsideDegrees * DEG);
    assert.equal(f.fidelityDamage(p, o), f.distanceDamage(inside, span(f, spawn, o)));
    assert.notEqual(f.fidelityDamage(p, o), f.distanceDamage(outside, span(f, spawn, o)));
  }
  for (const degrees of [-16.01, 16.01, 180 - 16.01]) {
    const p = glob(f, spawn, 0), o = at(spawn, 5, degrees);
    assert.ok(Math.abs(f.rollerHitAngle(p, o)) > f.WEAPONS.roller.ballistics.horizontalInsideDegrees * DEG);
    assert.equal(f.fidelityDamage(p, o), f.distanceDamage(outside, span(f, spawn, o)));
  }
  // A hit behind the glob measures 180°, and any request past a half turn is
  // normalised into one turn instead of an unwrapped value that would slip the test.
  assert.ok(Math.abs(Math.abs(f.rollerHitAngle(glob(f, spawn, 0), at(spawn, 5, 180))) - Math.PI) < 1e-9);
  assert.ok(Math.abs(f.rollerHitAngle(glob(f, spawn, 0), at(spawn, 5, 200)) + 160 * DEG) < 1e-9);
});

test('#734 the sector reference is the swing forward, so a rotated swing keeps its own straight ahead', async () => {
  const f = await fixture(), b = f.WEAPONS.roller.ballistics;
  const yaw = -Math.PI / 2, spawn = { x: 20, y: 0, z: -1 }, inside = f.WEAPONS.roller.flickDamageBands;
  // Facing -X: the hit that is 14° off that forward is Inside, while the very
  // same spawn/hit pair would be 76° off the world +Z axis.
  const swung = glob(f, spawn, yaw), point = at(spawn, 5, 14, yaw);
  assert.ok(Math.abs(f.rollerHitAngle(swung, point)) < b.horizontalInsideDegrees * DEG);
  assert.equal(f.fidelityDamage(swung, point), f.distanceDamage(inside, span(f, spawn, point)));
  assert.ok(Math.abs(f.rollerHitAngle(glob(f, spawn, 0), point)) > 60 * DEG);
});

test('#734 independent spawns on the same hit point split the way the geometry does', async () => {
  const f = await fixture(), b = f.WEAPONS.roller.ballistics;
  const inside = f.WEAPONS.roller.flickDamageBands, outside = b.horizontalOutsideDamageBands;
  const point = { x: 0, y: 0, z: 4 };
  const centre = glob(f, { x: 0, y: 0, z: 0 }, 0);
  const lateral = glob(f, { x: 6, y: 0, z: 0 }, 0);
  assert.equal(f.rollerHitAngle(centre, point), 0);
  assert.ok(Math.abs(f.rollerHitAngle(lateral, point)) > b.horizontalInsideDegrees * DEG);
  assert.equal(f.fidelityDamage(centre, point), f.distanceDamage(inside, span(f, { x: 0, y: 0, z: 0 }, point)));
  assert.equal(f.fidelityDamage(lateral, point), f.distanceDamage(outside, span(f, { x: 6, y: 0, z: 0 }, point)));
  // A spawn mirrored across the hit negates the sector angle but not the table.
  const mirrored = glob(f, { x: -6, y: 0, z: 0 }, 0);
  assert.equal(f.rollerHitAngle(mirrored, point), -f.rollerHitAngle(lateral, point));
  assert.equal(f.fidelityDamage(mirrored, point), f.distanceDamage(outside, span(f, { x: -6, y: 0, z: 0 }, point)));
});

test('#734 the issue overlap pair: an outer +18° launch hitting forward is Inside, an inner launch reaching wide is Outside', async () => {
  const f = await fixture(), b = f.WEAPONS.roller.ballistics;
  const inside = f.WEAPONS.roller.flickDamageBands, outside = b.horizontalOutsideDamageBands;
  const spawn = { x: 0, y: 0, z: 0 };
  const outerLaunch = glob(f, spawn, 0, { fidelityYaw: 18 * DEG });
  const forward = { x: 0, y: 0, z: 2 };
  assert.ok(2 > b.horizontalInsideDistance, 'the reported xz stays outside the close-range rule');
  assert.equal(f.fidelityDamage(outerLaunch, forward), f.distanceDamage(inside, span(f, spawn, forward)));
  assert.notEqual(f.fidelityDamage(outerLaunch, forward), f.distanceDamage(outside, span(f, spawn, forward)));
  const innerLaunch = glob(f, spawn, 0, { fidelityYaw: 0 });
  const wide = at(spawn, 3, 20);
  assert.equal(f.fidelityDamage(innerLaunch, wide), f.distanceDamage(outside, span(f, spawn, wide)));
  // The launch yaw is no longer an input in either direction.
  for (const yaw of [-18, 0, 18]) {
    assert.equal(f.fidelityDamage(glob(f, spawn, 0, { fidelityYaw: yaw * DEG }), wide), f.distanceDamage(outside, span(f, spawn, wide)));
    assert.equal(f.fidelityDamage(glob(f, spawn, 0, { fidelityYaw: yaw * DEG }), forward), f.distanceDamage(inside, span(f, spawn, forward)));
  }
});

test('#734 the InsideDistanceXZ = 1.2 close-range rule still overrides a wide hit angle', async () => {
  const f = await fixture(), b = f.WEAPONS.roller.ballistics;
  const spawn = { x: 0, y: 0, z: 0 }, inside = f.WEAPONS.roller.flickDamageBands;
  for (const distance of [0.5, b.horizontalInsideDistance]) {
    const point = at(spawn, distance, 40);
    assert.equal(f.rollerHitAngle(glob(f, spawn, 0), point), 40 * DEG);
    assert.equal(f.fidelityDamage(glob(f, spawn, 0), point), f.distanceDamage(inside, span(f, spawn, point)));
  }
});

test('#734 vertical globs keep the vertical table and a projectile without a sector keeps Inside', async () => {
  const f = await fixture(), vertical = f.WEAPONS.roller.verticalDamageBands;
  const spawn = { x: 0, y: 0, z: 0 };
  for (const degrees of [0, 40, 90]) {
    const p = glob(f, spawn, 0, { s3Vertical: true }), point = at(spawn, 6, degrees);
    assert.equal(f.fidelityDamage(p, point), f.distanceDamage(vertical, span(f, spawn, point)));
  }
  const pooled = glob(f, spawn, 0, { fidelitySectorYaw: undefined });
  const wide = at(spawn, 5, 40);
  assert.equal(f.rollerHitAngle(pooled, wide), null);
  assert.equal(f.fidelityDamage(pooled, wide), f.distanceDamage(f.WEAPONS.roller.flickDamageBands, span(f, spawn, wide)));
});

test('#734 actual installed Projectiles record one shared sector and keep bands, distance, group and ghost rules', async () => {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(); G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  const system = G.projectiles = new f.Projectiles(G.scene), a = f.make('roller');
  a.yaw = 0.7; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 50);
  f.setRandom(() => 0.5);
  system.fireFlick(a, a.weapon);
  const globs = [...system.list];
  assert.equal(globs.length, 13);
  assert.ok(globs.every(q => q.fidelitySectorYaw === a.yaw));
  // The fan offsets still differ per glob; only the damage reference is shared.
  const offsets = new Set(globs.map(q => Math.round(q.fidelityYaw / DEG)));
  assert.ok(offsets.size > 4, `expected a spread fan, got ${[...offsets].join(',')}`);

  const hits = [];
  system.applyHit = (_o, _v, amount) => hits.push(amount);
  const outer = globs.reduce((best, q) => Math.abs(q.fidelityYaw) > Math.abs(best.fidelityYaw) ? q : best);
  assert.ok(Math.abs(outer.fidelityYaw) > 16 * DEG, 'outermost fan slot launches beyond the sector');
  let point = at(outer.start, 3, 0, a.yaw);
  f.applyFidelityProjectileHit(system, outer, { id: 'v1' }, 999, point);
  assert.deepEqual(hits, [f.distanceDamage(f.WEAPONS.roller.flickDamageBands, outer.start.distanceTo(point))]);
  assert.ok(Math.abs(hits[0] - 150) < 1e-9);

  const inner = globs.reduce((best, q) => Math.abs(q.fidelityYaw) < Math.abs(best.fidelityYaw) ? q : best);
  point = at(inner.start, 3, 20, a.yaw);
  hits.length = 0;
  f.applyFidelityProjectileHit(system, inner, { id: 'v2' }, 999, point);
  assert.deepEqual(hits, [f.distanceDamage(f.WEAPONS.roller.ballistics.horizontalOutsideDamageBands, inner.start.distanceTo(point))]);

  // Distance still falls off from this glob's own spawn point, at both tables.
  for (const distance of [3, 5, 8]) {
    assert.equal(f.fidelityDamage(inner, at(inner.start, distance, 0, a.yaw)),
      f.distanceDamage(f.WEAPONS.roller.flickDamageBands, distance));
    assert.equal(f.fidelityDamage(inner, at(inner.start, distance, 30, a.yaw)),
      f.distanceDamage(f.WEAPONS.roller.ballistics.horizontalOutsideDamageBands, distance));
  }

  // One swing still yields one maximum hit through the shared volley group.
  const shared = { id: 'v3' };
  hits.length = 0;
  for (const q of globs) f.applyFidelityProjectileHit(system, q, shared, 999, at(q.start, 3, 0, a.yaw));
  assert.equal(hits.length, 1);
  assert.equal(hits[0], f.distanceDamage(f.WEAPONS.roller.flickDamageBands, 3));

  // A ghost still neither damages nor paints: it carries no sector of its own.
  const q = globs[0];
  const packet = [0, 0, 0, q.type, q.wid, ...q.pos.toArray(), ...q.vel.toArray(), q.delay, q.life, q.straight,
    q.radius, q.size, q.grav, q.drag, 1.8, q.head, q.vis, q.tail0, q.tailK, q.wob, q.wobF, q.nose, q.sats];
  system.list.length = 0;
  system.ghostProjectile(a, packet);
  const ghost = system.list.at(-1);
  assert.equal(ghost.ghost, true);
  assert.equal(ghost.fidelitySectorYaw, null, 'no sector reference is invented for a remote glob');
  hits.length = 0;
  f.applyFidelityProjectileHit(system, ghost, { id: 'v4' }, 999, at(ghost.start, 3, 30, a.yaw));
  assert.deepEqual(hits, []);

  // Pooled records return without the previous swing's sector reference.
  system.pool.push(outer);
  assert.equal(system._new().fidelitySectorYaw, null);
  assert.ok(new THREE.Vector3());
});