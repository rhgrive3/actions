// Regression coverage for the public freebuff-8 issue group, exercised against
// the actual composed modules (upstream source + patches/splatoon3 adapter):
//   #105 / #119 projectile collision chronology (nearest actor / terrain)
//   #168 Charger dedicated nearest (feet) paint
//   #87 full-charge Charger piercing order independence
//   #95 Splattershot 20f post-fire ink-recovery cooldown
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';

test('projectile chronology connection fails closed when the upstream collision loop changes', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const weapons = fs.readFileSync(root + 'inkwave-public/src/game/weapons.js', 'utf8');
  assert.throws(() => adaptSource('src/game/weapons.js', weapons.replace('      // actors\n', '      // actors moved\n')),
    /projectile nearest-collision chronology/);
});

// A straight-flight Splattershot round: one 60 Hz step advances ~2.266 units.
const SHOOTER_STEP = 135.96 / 60;

function projectile(f, owner) {
  return {
    type: 'shot', owner, team: owner.team, wid: 'shooter', radius: 0.3,
    prev: new f.THREE.Vector3(), pos: new f.THREE.Vector3(),
    vel: new f.THREE.Vector3(SHOOTER_STEP * 60, 0, 0),
    age: 0, straight: 10, grav: 0, drag: 0, size: 0.15, life: 10, trailEvery: 0,
    damage: 36, s3Weapon: owner.weapon, s3DamageGroup: null, s3Vertical: false,
  };
}

function setup(f) {
  const { G, THREE } = f;
  const system = new f.Projectiles(new THREE.Scene());
  const hits = [], impacts = [];
  let impacted = 0;
  system.applyHit = (_owner, target, damage) => hits.push({ target, damage });
  system._impact = (_p, hit) => { impacted++; impacts.push(hit); };
  G.boss = undefined;
  G.actors = [];
  G.physics.segment = () => ({ hit: false });
  return { system, hits, impacts, impactCount: () => impacted };
}

function enemy(f, x, team = 1) {
  const e = f.make();
  e.team = team; e.pos.set(x, 0, 0); e.form = 'kid'; e.alive = true; e.smoothY = 0;
  return e;
}

test('#105 a swept step resolves the nearest enemy regardless of G.actors order', async () => {
  const f = await fixture();
  const near = enemy(f, 0.25 * SHOOTER_STEP), far = enemy(f, 0.75 * SHOOTER_STEP);

  for (const order of [[far, near], [near, far]]) {
    const { system, hits } = setup(f);
    f.G.actors = order;
    const p = projectile(f, f.make());
    system._step(p, 1 / 60);
    assert.equal(hits.length, 1, `exactly one enemy is hit for order ${order.map(e => e.pos.x.toFixed(2))}`);
    assert.equal(hits[0].target, near, 'the nearer enemy takes the hit in both roster orders');
    assert.equal(hits[0].damage, 36);
  }
});

test('#105 three aligned enemies always select the minimum positive t', async () => {
  const f = await fixture();
  const a = enemy(f, 0.2 * SHOOTER_STEP), b = enemy(f, 0.5 * SHOOTER_STEP), c = enemy(f, 0.8 * SHOOTER_STEP);
  const { system, hits } = setup(f);
  f.G.actors = [c, a, b];
  system._step(projectile(f, f.make()), 1 / 60);
  assert.deepEqual(hits.map(h => h.target), [a]);
});

test('#119 a nearer world surface beats a farther actor (no same-tick hit through cover)', async () => {
  const f = await fixture();
  const far = enemy(f, 0.75 * SHOOTER_STEP);
  const { system, hits, impactCount } = setup(f);
  f.G.actors = [far];
  f.G.physics.segment = (_a, _b, out) => {
    out.hit = true; out.dist = 0.4 * SHOOTER_STEP;
    out.point.set(0.4 * SHOOTER_STEP, 0, 0); out.normal.set(-1, 0, 0); return out;
  };
  const p = projectile(f, f.make());
  assert.equal(system._step(p, 1 / 60), true);
  assert.equal(hits.length, 0, 'the enemy behind the nearer cover is not damaged');
  assert.equal(impactCount(), 1, 'the projectile impacts the nearer world surface');
});

test('#119 an actor nearer than the world surface still receives the hit', async () => {
  const f = await fixture();
  const near = enemy(f, 0.25 * SHOOTER_STEP);
  const { system, hits, impactCount } = setup(f);
  f.G.actors = [near];
  f.G.physics.segment = (_a, _b, out) => {
    out.hit = true; out.dist = 0.7 * SHOOTER_STEP;
    out.point.set(0.7 * SHOOTER_STEP, 0, 0); out.normal.set(-1, 0, 0); return out;
  };
  system._step(projectile(f, f.make()), 1 / 60);
  assert.deepEqual(hits.map(h => h.target), [near]);
  assert.equal(impactCount(), 0, 'a nearer actor suppresses the world impact');
});

test('#87 a full-charge Charger damages every aligned enemy in near-to-far order regardless of roster order', async () => {
  const f = await fixture(), { G, THREE } = f, a = f.make('charger');
  const victims = [3, 6, 9].map(z => enemy(f, 0));
  victims.forEach((e, i) => e.pos.set(0, 0, 3 + i * 3));
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 30);
  G.physics.raycast = (_from, _dir, _dist, hit) => { hit.hit = false; return hit; };
  const system = new f.Projectiles(new THREE.Scene());
  const hits = [];
  system.applyHit = (_o, target, damage) => hits.push({ target, damage });
  for (const order of [[victims[2], victims[0], victims[1]], [victims[1], victims[2], victims[0]]]) {
    hits.length = 0; G.actors = [a, ...order];
    system.fireCharger(a, a.weapon, 1);
    assert.deepEqual(hits.map(h => h.target), victims, 'hits are ordered by distance, not roster slot');
    assert.ok(hits.every(h => h.damage === 160));
  }
});

test('#168 a partial Charger shot always leaves a dedicated, seeded splash at the shooter feet', async () => {
  const f = await fixture(), { G, THREE } = f, a = f.make('charger');
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 30);
  const splats = [];
  G.paint.splat = (point, radius, team, opts) => { splats.push({ point: point.clone(), radius, team, opts }); return 0.5; };
  a.addTurf = () => {};
  G.physics.raycast = (from, dir, _dist, hit) => {
    if (dir.y < -0.5) { hit.hit = true; hit.dist = from.y; hit.point.set(from.x, 0, from.z); hit.normal.set(0, 1, 0); return hit; }
    hit.hit = false; return hit;
  };
  const system = new f.Projectiles(new THREE.Scene());
  system.applyHit = () => {};

  for (const yaw of [0, 0.7, -1.4]) {
    a.aimDir.set(Math.sin(yaw), 0, Math.cos(yaw)); a.aimYaw = yaw;
    splats.length = 0;
    system.fireCharger(a, a.weapon, 0.5);
    const feet = splats.filter(s => s.opts?.kind === 'chargerFeet');
    assert.equal(feet.length, 1, `exactly one feet splash for yaw ${yaw}`);
    assert.ok(Math.abs(feet[0].point.x - a.pos.x) < 1e-9 && Math.abs(feet[0].point.z - a.pos.z) < 1e-9, 'splash is centred on the shooter');
    assert.equal(feet[0].radius, a.weapon.feetPaintRadius);
    assert.equal(feet[0].opts.seed, 0, 'feet splash is independent of the random line-paint seed');
    assert.equal(feet[0].team, a.team);
  }
});

test('#168 a full-charge Charger applies the feet splash exactly once (piercing wrapper does not duplicate it)', async () => {
  const f = await fixture(), { G, THREE } = f, a = f.make('charger');
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 30);
  const splats = [];
  G.paint.splat = (point, radius, team, opts) => { splats.push({ point: point.clone(), radius, team, opts }); return 0.5; };
  a.addTurf = () => {};
  G.physics.raycast = (from, dir, _dist, hit) => {
    if (dir.y < -0.5) { hit.hit = true; hit.dist = from.y; hit.point.set(from.x, 0, from.z); hit.normal.set(0, 1, 0); return hit; }
    hit.hit = false; return hit;
  };
  const system = new f.Projectiles(new THREE.Scene());
  system.applyHit = () => {};
  system.fireCharger(a, a.weapon, 1);
  const feet = splats.filter(s => s.opts?.kind === 'chargerFeet');
  assert.equal(feet.length, 1, 'one feet splash even though the full-charge path paints through the native line');
});

test('#95 a fresh Splattershot shot cannot refill at 1f/4f/19f in humanoid form, and refills at 20f', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 0; a.lastFire = 0; a.form = 'kid';
  f.tick(a, 19);
  assert.equal(a.ink, 0, 'no ink recovery before the 20-frame post-fire cooldown elapses');
  f.tick(a, 1);
  assert.ok(a.ink > 0, 'refill becomes eligible at the 20-frame boundary');
});

test('#95 entering own-ink swim form does not bypass the 20f post-fire cooldown', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 0; a.lastFire = 0;
  a.grounded = true; a.ground = { hit: true, face: 0, u: 0.5, v: 0.5 };
  a.intent.squid = true;
  f.tick(a, 1);
  assert.equal(a.form, 'squid');
  assert.equal(a.ink, 0, 'submerged refill must not start on the first post-shot frame');
  f.tick(a, 18);
  assert.equal(a.ink, 0, 'still no refill at 19 frames');
  f.tick(a, 1);
  assert.ok(a.ink > 0, 'own-ink swim refill starts only at 20 frames');
});

test('#95 an empty trigger click does not reset the ink-recovery cooldown', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 0.4; a.lastFire = 1; a.intent.fire = true;
  f.tick(a);
  assert.ok(a.lastFire > 1, 'lastFire still advances from its prior value');
  assert.ok(a.lastFire > 0.02, 'an empty click must not restart the post-fire cooldown at zero');
});

test('first actor surface contact wins even when its centre lies behind nearer-centre cover', async () => {
  const f = await fixture(), target = enemy(f, 1), { system, hits, impactCount } = setup(f);
  f.G.actors = [target];
  f.G.physics.segment = (_a, _b, out) => {
    out.hit = true; out.dist = .8; out.point.set(.8, 1, 0); out.normal.set(-1, 0, 0); return out;
  };
  const p = projectile(f, f.make()); p.pos.y = 1;
  system._step(p, 1 / 60);
  assert.deepEqual(hits.map(h => h.target), [target]);
  assert.equal(impactCount(), 0);
});

test('a long swept step does not cull actors far from its endpoint', async () => {
  const f = await fixture(), target = enemy(f, 1), { system, hits } = setup(f);
  f.G.actors = [target];
  const p = projectile(f, f.make()); p.pos.y = 1;
  system._step(p, 1 / 10);
  assert.deepEqual(hits.map(h => h.target), [target]);
});

test('world wins exact actor-entry ties, and nearest boss intercepts actors', async () => {
  const f = await fixture(), target = enemy(f, 1), { system, hits, impactCount } = setup(f);
  f.G.actors = [target];
  const p = projectile(f, f.make()); p.pos.y = 1;
  const entryDistance = 1 - (f.PLAYER.radius * .95 + p.size);
  f.G.physics.segment = (_a, _b, out) => {
    out.hit = true; out.dist = entryDistance; out.point.set(entryDistance, 1, 0); out.normal.set(-1, 0, 0); return out;
  };
  system._step(p, 1 / 60);
  assert.equal(hits.length, 0); assert.equal(impactCount(), 1);
  f.G.physics.segment = () => ({ hit: false });
  let bossHits = 0;
  f.G.boss = { segHit: () => ({ dist: .1 }) };
  system._bossImpact = () => { bossHits++; };
  const q = projectile(f, f.make()); q.pos.y = 1;
  system._step(q, 1 / 60);
  assert.equal(hits.length, 0); assert.equal(bossHits, 1);
});

// --- adversarial review follow-up: closest-approach vs first-entry and endpoint cull ---

// Physics.segmentCapsuleDist returns the closest-approach parameter (it minimises
// pointCapsuleDist), while G.physics.segment and boss.segHit report first-entry
// distance. A hurt volume can be entered before a nearer-looking wall even when
// its centre is farther along the step. The actor must win here: with
// PLAYER.radius 0.38 and p.size 0.15 the hurt radius is 0.511, so an actor centre
// at x = 1.0 is entered at x ~= 0.658, ahead of a wall at x = 0.8.
test('#119 REVIEW a hurt volume entered before a wall must beat a wall its centre follows', async () => {
  const f = await fixture();
  const actor = enemy(f, 1.0);
  const { system, hits, impactCount } = setup(f);
  f.G.actors = [actor];
  f.G.physics.segment = (_a, _b, out) => {
    out.hit = true; out.dist = 0.8; out.point.set(0.8, 0, 0); out.normal.set(-1, 0, 0); return out;
  };
  system._step(projectile(f, f.make()), 1 / 60);
  assert.deepEqual(hits.map(h => h.target), [actor],
    'the actor volume is entered before the wall; closest-approach ordering wrongly resolves the wall');
  assert.equal(impactCount(), 0, 'no wall impact when the actor is contacted first');
});

// The fixed-step early-out uses |e.pos - p.pos| against the segment END, not the
// swept segment. A long step can therefore drop an actor that genuinely lies on
// the path.
test('#119 REVIEW the endpoint cull must not drop an actor lying on a long step', async () => {
  const f = await fixture();
  const actor = enemy(f, 1.0);
  const { system, hits } = setup(f);
  f.G.actors = [actor];
  const p = projectile(f, f.make());
  p.vel.set(600, 0, 0); // one 1/60 step spans 10 world units, ending at x = 10
  system._step(p, 1 / 60);
  assert.deepEqual(hits.map(h => h.target), [actor],
    'x = 1 lies on the swept segment; the |e.pos.x - p.pos.x| > 3 endpoint cull must not drop it');
});

// boss.segHit reports entry distance while the actor loop reports closest-approach.
// Comparing the two directly biases ordering toward the boss. Boss entry 0.7 is
// behind the actor hurt-volume entry ~0.658, so the actor must take the hit.
test('#119 REVIEW actor closest-approach distance must be comparable to boss entry distance', async () => {
  const f = await fixture(), { THREE } = f;
  const actor = enemy(f, 1.0);
  const { system, hits } = setup(f);
  f.G.actors = [actor];
  let bossImpacts = 0;
  system._bossImpact = () => { bossImpacts++; };
  f.G.boss = { segHit: () => ({ dist: 0.7, t: 0.7 / SHOOTER_STEP, point: new THREE.Vector3(), target: {} }) };
  system._step(projectile(f, f.make()), 1 / 60);
  assert.deepEqual(hits.map(h => h.target), [actor],
    'the actor hurt volume is entered before the boss; entry-domain and closest-approach-domain distances are not comparable');
  assert.equal(bossImpacts, 0);
});

// Guard: an actor already inside the capsule at the segment start is still hit.
test('#105 REVIEW an actor inside the capsule at the segment start is still hit', async () => {
  const f = await fixture();
  const actor = enemy(f, 0);
  const { system, hits } = setup(f);
  f.G.actors = [actor];
  system._step(projectile(f, f.make()), 1 / 60);
  assert.deepEqual(hits.map(h => h.target), [actor]);
});

// Guard: the wall/actor tie-break must be deterministic across repeated steps.
test('#119 REVIEW wall/actor boundary resolution is deterministic', async () => {
  const f = await fixture();
  const results = [];
  for (let i = 0; i < 3; i++) {
    const actor = enemy(f, 1.0);
    const { system, hits, impactCount } = setup(f);
    f.G.actors = [actor];
    f.G.physics.segment = (_a, _b, out) => {
      out.hit = true; out.dist = 0.66; out.point.set(0.66, 0, 0); out.normal.set(-1, 0, 0); return out;
    };
    system._step(projectile(f, f.make()), 1 / 60);
    results.push(hits.length === 1 ? 'actor' : (impactCount() ? 'wall' : 'none'));
  }
  assert.equal(new Set(results).size, 1, `boundary resolution must be deterministic, got ${results}`);
});
