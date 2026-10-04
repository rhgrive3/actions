// Big Bubbler (issue 177 kit work) against the ACTUAL composed public runtime:
// the immutable inkwave-public sources adapted by patches/splatoon3/adapter.mjs
// plus the real Actor, Projectiles, Physics and config objects. Only wall/ground
// collision, audio and the parent's not-yet-landed call site are stubbed.
//
// The interception contract is deliberately split here, because the native
// first-contact arbitration belongs to the integration owner:
//   * kitBarrierCandidate() is a pure query and is proven inert;
//   * native Physics.segment() supplies the real wall contact distance, so a
//     dome behind a wall provably cannot outrank it;
//   * onHit() is proven to apply HP exactly once, and never for ghost rounds.
// No test below simulates interception by driving the projectile loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import {
  installKitBigBubbler, bigBubblerDomes, bigBubblerSnapshot, kitBarrierCandidate,
  kitBarrierHitRecord, clearBigBubblers, tickBigBubblers,
  BIG_BUBBLER_RAW, BIG_BUBBLER_CALIBRATION, hermite2d, kitBarrierShelter,
} from '../runtime/kit-big-bubbler.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || `${ROOT}inkwave-public`;
const DT = 1 / 60;
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// Represents the composed profile the parent owns: the kit id, its registry
// entry and the base cost. This lane does not edit install.mjs or profile.json.
async function composed(bigBubbler) {
  const f = await fixture();
  const scene = new f.THREE.Scene();
  f.G.scene = scene;
  f.G.projectiles = new f.Projectiles(scene);
  f.SPECIALS.bubbler = { id: 'bubbler', name: 'Big Bubbler', blurb: 'Deploy a damageable ink dome.', cost: 180 };
  const api = { ...f, Actor: f.Actor, Projectiles: f.Projectiles, THREE: f.THREE, G: f.G,
    PLAYER: f.PLAYER, emit: f.emit, SPECIALS: f.SPECIALS };
  installKitBigBubbler(api, { ...f.profile, kits: { bigBubbler: bigBubbler || {} } });
  clearBigBubblers('test-setup');
  return { f, api, scene };
}

// A real level: a floor plus an optional wall slab, driven by the real Physics.
function level(f, wallZ = null) {
  const V = f.THREE.Vector3;
  const block = (id, cx, cy, cz, hx, hy, hz) => {
    const center = new V(cx, cy, cz), half = new V(hx, hy, hz);
    return { id, solid: true, center, half, axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
      faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  };
  const blocks = [block(0, 0, -0.5, 0, 100, 0.5, 100)];
  if (wallZ !== null) blocks.push(block(1, 0, 2, wallZ, 20, 4, 0.4));
  const lvl = { blocks, faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0, pointInside: () => false,
    spawnPads: [new V(), new V(80, 0, 80)], spawnBarrier: 1,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; for (const b of blocks) out.push(b.id); return out; } };
  const physics = new f.Physics(lvl);
  f.G.level = lvl; f.G.physics = physics;
  return physics;
}

// The arbitration the PARENT owns, reproduced here so the query contract is
// exercised against real native contact distances. Nothing in the module does
// this; it is the shape of the call site documented in the report.
function arbitrate(f, physics, p, start, end, skipGrates = true) {
  const world = physics.segment(start, end, new f.Hit(), skipGrates);
  const candidate = f.G.projectiles.kitBarrierCandidate(p, start, end);
  if (candidate && (!world.hit || candidate.distance < world.dist)) return { winner: 'dome', candidate, world };
  return { winner: world.hit ? 'world' : 'none', candidate, world };
}

function roller(f, x = 0, z = 0, yaw = 0) {
  const a = f.make('roller');
  a.pos.set(x, 0, z); a.yaw = yaw; a.aimYaw = yaw;
  a.weapon = { ...a.weapon, special: 'bubbler' };
  return a;
}
function activate(f, a) { a.special = a.specialCost(); a.intent.special = true; f.tick(a); }
function step(f, ticks) { for (let i = 0; i < ticks; i++) tickBigBubblers(DT); }
function round(f, team, pos, opts = {}) {
  return { pos: pos.clone(), prev: pos.clone(), vel: new f.THREE.Vector3(0, 0, 1), age: 0,
    straight: 0.07, grav: 28, drag: 0.8, size: 0.15, damage: 36, team, life: 1.2, type: 'shot', ...opts };
}

// ---------------------------------------------------------------------------
test('the pinned Hermit2DSmooth curves evaluate through their pinned endpoints', () => {
  close(hermite2d(BIG_BUBBLER_RAW.radiusCurve, 0), 0.1940299, 1e-9);
  close(hermite2d(BIG_BUBBLER_RAW.radiusCurve, 1), 1.0, 1e-9);
  close(hermite2d(BIG_BUBBLER_RAW.ascendCurve, 0), 0.0, 1e-9);
  close(hermite2d(BIG_BUBBLER_RAW.ascendCurve, 1), 1.0, 1e-9);
  let previous = -1;
  for (let i = 0; i <= 40; i++) {
    const v = hermite2d(BIG_BUBBLER_RAW.radiusCurve, i / 40);
    assert.ok(v >= previous - 1e-9, 'the pinned radius curve is monotonic');
    previous = v;
  }
});

test('activating the special deploys a stationary dome with the pinned durability', async () => {
  const { f } = await composed();
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  assert.equal(bigBubblerDomes().length, 1);
  const dome = bigBubblerDomes()[0];
  assert.equal(dome.team, 0);
  assert.equal(dome.hp, BIG_BUBBLER_RAW.maxHp);
  assert.equal(dome.fieldHp, BIG_BUBBLER_RAW.maxFieldHp);
  close(dome.pos.z, BIG_BUBBLER_CALIBRATION.deployDistance, 1e-9);
  // the native activation still owns the gauge, the stat and the form change
  assert.equal(a.special, 0);
  assert.equal(a.stats.specials, 1);
  assert.equal(a.specialActive, null, 'no renamed slam/storm state is used');
  assert.equal(a.invuln, 0, 'the special is not invulnerability');
  const anchor = dome.pos.clone();
  step(f, 90);
  close(dome.pos.distanceTo(anchor), 0, 1e-12, 'the structure is stationary');
});

test('radius grows on the pinned curve, arms on the pinned frame and stays under the cap', async () => {
  const { f } = await composed();
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  assert.equal(dome.ignited, false);
  const first = dome.radius;
  step(f, 20);
  assert.ok(dome.radius > first, 'the dome grows');
  step(f, 80);                                   // 100 ticks: past IgnitionFrame (15)
  assert.equal(dome.ignited, true);
  assert.ok(dome.emitterY > 0, 'the emitter rises');
  assert.ok(Math.abs(dome.radius - BIG_BUBBLER_RAW.maxRadius) < 1e-6, 'full radius is the pinned MaxRadius');
  assert.ok(dome.radius <= BIG_BUBBLER_RAW.maxRadius + 1e-9);
});

test('the pinned TimeDamage collapses the canopy and releases its scene resources', async () => {
  const { f, scene } = await composed();
  level(f);
  const a = roller(f); f.G.actors = [a];
  const sceneBefore = scene.children.length;
  activate(f, a);
  const dome = bigBubblerDomes()[0];
  assert.ok(scene.children.length > sceneBefore, 'the dome owns real scene objects');
  const disposals = [];
  const watch = (mesh, kind) => {
    const original = mesh[kind].dispose.bind(mesh[kind]);
    mesh[kind].dispose = () => { disposals.push(`${dome.shell === mesh ? 'shell' : 'emitter'}:${kind}`); original(); };
  };
  watch(dome.shell, 'geometry'); watch(dome.shell, 'material');
  watch(dome.emitterMesh, 'geometry'); watch(dome.emitterMesh, 'material');
  for (let i = 0; i < 60 * 30 && bigBubblerDomes().length; i++) tickBigBubblers(DT);
  assert.equal(bigBubblerDomes().length, 0, 'the pinned TimeDamage ends the dome');
  assert.equal(scene.children.length, sceneBefore, 'the dome leaves the scene');
  assert.deepEqual(disposals.sort(),
    ['emitter:geometry', 'emitter:material', 'shell:geometry', 'shell:material'],
    'every dome GPU resource is disposed exactly once');
});

// ---------------------------------------------------------------------------
// Contact-query contract: inert query, world distance, onHit only on a win.
test('querying the barrier changes no position, no HP, no turf and emits nothing', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  let paints = 0;
  f.G.paint.splat = () => { paints++; return 0; };
  let events = 0;
  const stop = f.on('kit:bubbler:hit', () => events++);
  const p = round(f, 1, new f.THREE.Vector3(0, 1.05, -8));
  const start = new f.THREE.Vector3(0, 1.05, -8), end = new f.THREE.Vector3(0, 1.05, 8);
  const hp = dome.hp, position = p.pos.clone();
  const candidate = f.G.projectiles.kitBarrierCandidate(p, start, end);
  stop();
  assert.ok(candidate, 'a crossing segment yields a candidate');
  assert.equal(p.pos.distanceTo(position), 0, 'the query never moves the round');
  assert.equal(dome.hp, hp, 'the query never spends HP');
  assert.equal(paints, 0, 'the query never paints');
  assert.equal(events, 0, 'the query emits nothing');
  // and the module really is the prototype target the parent will call
  assert.equal(typeof f.G.projectiles.kitBarrierCandidate, 'function');
  assert.equal(f.G.projectiles.kitBarrierCandidate.length, 3, 'the parent hook takes (p, start, end)');
  assert.equal(f.G.projectiles._step, f.Projectiles.prototype._step,
    'the native step is untouched: no predictive fallback, one physics truth');
});

test('the candidate reports a world distance comparable with native contacts', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  const physics = level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  const start = new f.THREE.Vector3(0, 1.05, -8), end = new f.THREE.Vector3(0, 1.05, 8);
  const candidate = kitBarrierCandidate(round(f, 1, start), start, end);
  assert.ok(candidate);
  close(candidate.distance, candidate.t * start.distanceTo(end), 1e-12, 'distance is t x segment length');
  assert.ok(candidate.distance > 0 && candidate.distance < start.distanceTo(end));
  // the entry point is exactly on the shell and keeps the round's height
  close(candidate.point.distanceTo(dome.pos), dome.radius + 0.15, 1e-9);
  close(candidate.point.y, 1.05, 1e-9);
  // a segment that misses entirely yields nothing
  assert.equal(kitBarrierCandidate(round(f, 1, start),
    new f.THREE.Vector3(0, 40, -8), new f.THREE.Vector3(0, 40, 8)), null);
  assert.equal(kitBarrierCandidate(round(f, 1, start), start, start), null, 'a degenerate step yields nothing');
  assert.ok(physics, 'the real Physics was installed for the arbitration comparison');
});

test('a dome behind a nearer wall reports a larger distance and never wins', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  // a wall slab at z = -6 (it spans z in [-6.4, -5.6]); the dome deploys back at z = +3
  const physics = level(f, -6);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  const start = new f.THREE.Vector3(0, 1.05, -8), end = new f.THREE.Vector3(0, 1.05, 8);
  const hp = dome.hp;
  const result = arbitrate(f, physics, round(f, 1, start), start, end);
  assert.ok(result.candidate, 'the dome is geometrically on the segment');
  assert.equal(result.world.hit, true, 'the real wall is hit by the same segment');
  assert.ok(result.world.dist < result.candidate.distance,
    `native wall contact (${result.world.dist}) must precede the dome contact (${result.candidate.distance})`);
  assert.equal(result.winner, 'world', 'the nearer native contact wins');
  // onHit was therefore never invoked, and nothing was spent
  assert.equal(result.candidate.settled, false, 'a losing candidate is never settled');
  assert.equal(dome.hp, hp, 'a losing candidate never spends HP');
  // the same segment with the wall removed makes the dome the first contact
  const open = arbitrate(f, level(f), round(f, 1, start), start, end);
  assert.equal(open.world.hit, false, 'nothing blocks the segment in the open');
  assert.equal(open.winner, 'dome', 'the dome is then the first contact');
  assert.equal(dome.hp, hp, 'and querying still spends nothing until onHit runs');
});

test('the winning handler applies HP exactly once and is idempotent', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  const start = new f.THREE.Vector3(0, 1.05, -8), end = new f.THREE.Vector3(0, 1.05, 8);
  const hp = dome.hp;
  const candidate = kitBarrierCandidate(round(f, 1, start), start, end);
  const applied = candidate.onHit();
  assert.equal(applied, 36 * BIG_BUBBLER_CALIBRATION.rawPerDamageUnit);
  assert.equal(dome.hp, hp - applied, 'the round spends the canopy once');
  assert.equal(candidate.onHit(), 0, 'a second call cannot double-spend');
  assert.equal(dome.hp, hp - applied);
  const record = kitBarrierHitRecord(candidate);
  assert.deepEqual(record.point.length, 3);
  assert.equal(record.target, 'canopy');
  assert.equal(record.visualOnly, false);
  assert.equal(record.domeId, dome.id, 'the record identifies the dome for remote replay');
});

test('a long step and an inside origin both permit escape', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  // one very long step still reports the same WORLD distance as any other step
  // that covers the same entry point, so a long dt cannot inflate or hide a hit
  const start = new f.THREE.Vector3(0, 1.05, -60);
  const far = kitBarrierCandidate(round(f, 1, start, { straight: 10 }), start,
    new f.THREE.Vector3(0, 1.05, 60));
  assert.ok(far, 'a 120 m step still yields a candidate');
  close(far.t * start.distanceTo(new f.THREE.Vector3(0, 1.05, 60)), far.distance, 1e-12);
  // the candidate record is reused, so snapshot the value before querying again
  const farDistance = far.distance, farPoint = far.point.clone();
  const near = kitBarrierCandidate(round(f, 1, start, { straight: 10 }), start,
    new f.THREE.Vector3(0, 1.05, 0));
  assert.ok(near);
  close(near.distance, farDistance, 1e-9, 'the world distance is independent of the step length');
  close(near.point.distanceTo(farPoint), 0, 1e-12, 'and so is the entry point');
  // independent reference: march the segment and take the first sample that is
  // inside the inflated shell. Brute force, derived from the pinned numbers only.
  const r = BIG_BUBBLER_RAW.maxRadius + 0.15;
  const from = new f.THREE.Vector3(0, 1.05, -60), to = new f.THREE.Vector3(0, 1.05, 60);
  let marched = null;
  for (let i = 0; i <= 1_000_000; i++) {
    const s = i / 1_000_000;
    const x = from.x + (to.x - from.x) * s, y = from.y + (to.y - from.y) * s, z = from.z + (to.z - from.z) * s;
    if ((x - dome.pos.x) ** 2 + (y - dome.pos.y) ** 2 + (z - dome.pos.z) ** 2 <= r * r) {
      marched = s * from.distanceTo(to);
      break;
    }
  }
  const stepSize = from.distanceTo(to) / 1_000_000;
  assert.ok(marched !== null, 'the march finds the shell');
  // the march can only overshoot by one sample, never undershoot the exact entry
  assert.ok(marched >= farDistance - 1e-12 && marched - farDistance <= stepSize + 1e-12,
    `marched ${marched} must bracket the exact entry ${farDistance} within one ${stepSize} sample`);
  close(farDistance, marched, stepSize, 'the reported world distance matches a brute-force march');
  // a round that starts inside is not intercepted, whatever the step length
  const inside = new f.THREE.Vector3(dome.pos.x, dome.pos.y + 0.5, dome.pos.z);
  assert.equal(kitBarrierCandidate(round(f, 1, inside, { straight: 10 }), inside,
    new f.THREE.Vector3(dome.pos.x, dome.pos.y + 0.5, dome.pos.z + 40)), null,
    'an inside origin may leave');
  // a friendly round is never a candidate either
  const outside = new f.THREE.Vector3(0, 1.05, -8);
  assert.equal(kitBarrierCandidate(round(f, 0, outside), outside, new f.THREE.Vector3(0, 1.05, 8)), null);
});

test('the exposed emitter is a distinct target and its own budget ends the dome', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 90);
  assert.ok(dome.emitterY > 8, 'the emitter sits above the canopy shell');
  const ey = dome.pos.y + dome.emitterY;
  const start = new f.THREE.Vector3(dome.pos.x, ey, -8), end = new f.THREE.Vector3(dome.pos.x, ey, dome.pos.z);
  const candidate = kitBarrierCandidate(round(f, 1, start), start, end);
  assert.ok(candidate, 'the emitter is reachable without crossing the shell');
  assert.equal(candidate.target, 'field', 'a distinct target, not the canopy');
  const canopy = dome.hp, field = dome.fieldHp;
  candidate.onHit();
  assert.equal(dome.fieldHp, field - 36 * BIG_BUBBLER_CALIBRATION.rawPerDamageUnit);
  assert.equal(dome.hp, canopy, 'the canopy is untouched');
  // draining the emitter budget collapses the structure
  while (bigBubblerDomes().length && dome.fieldHp > 0) {
    const again = kitBarrierCandidate(round(f, 1, start), start, end);
    if (!again) break;
    again.onHit();
  }
  assert.equal(bigBubblerDomes().length, 0, 'the emitter budget collapses the dome');
  assert.equal(dome.fieldHp, 0);
});

test('ghost rounds are stopped at the dome but never spend HP, turf or paint', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  let paints = 0;
  f.G.paint.splat = () => { paints++; return 0; };
  const start = new f.THREE.Vector3(0, 1.05, -8), end = new f.THREE.Vector3(0, 1.05, 8);
  const hp = dome.hp, turf = a.stats.turf;
  const ghost = kitBarrierCandidate(round(f, 1, start, { ghost: true }), start, end);
  assert.ok(ghost, 'a ghost is still stopped so the remote image matches');
  assert.equal(ghost.visualOnly, true);
  assert.ok(ghost.distance > 0);
  assert.equal(ghost.onHit(), 0);
  assert.equal(dome.hp, hp, 'a ghost never damages the dome');
  assert.equal(paints, 0, 'a ghost never paints');
  assert.equal(a.stats.turf, turf, 'a ghost never scores turf');
  assert.equal(kitBarrierHitRecord(ghost).visualOnly, true, 'the replay record marks it visual-only');
});

// ---------------------------------------------------------------------------
test('actors walk into the dome with no push, no damage and no invulnerability', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const owner = roller(f);
  const enemy = f.make('shooter'); enemy.team = 1; enemy.pos.set(0, 0, 3);
  f.G.actors = [owner, enemy];
  activate(f, owner);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  const position = enemy.pos.clone(), enemyHp = enemy.hp, turf = owner.stats.turf;
  step(f, 120);
  assert.ok(enemy.pos.distanceTo(position) < 1e-12, 'the dome pushes nobody');
  assert.equal(enemy.hp, enemyHp, 'standing inside is not damage');
  assert.equal(enemy.invuln, 0, 'the dome grants no invulnerability');
  assert.equal(enemy.alive, true);
  assert.equal(owner.stats.turf, turf, 'idle overlap is inert by default');
});

test('the owner dying leaves the deployed structure; match disposal erases it', async () => {
  const { f, scene } = await composed();
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const sceneAfterDeploy = scene.children.length;
  a.splat(null, 'weapon');
  assert.equal(a.alive, false);
  assert.equal(bigBubblerDomes().length, 1, 'owner death does not erase the structure');
  a.reset();
  assert.equal(bigBubblerDomes().length, 1, 'reset is the respawn path and is not an erase by default');
  f.G.projectiles.clear();
  assert.equal(bigBubblerDomes().length, 0, 'match disposal erases every dome');
  assert.ok(scene.children.length < sceneAfterDeploy, 'and releases its scene objects');
});

test('reset erasure is an explicit calibration, not the default', async () => {
  const { f } = await composed({ eraseOnOwnerReset: true });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  assert.equal(bigBubblerDomes().length, 1);
  a.reset();
  assert.equal(bigBubblerDomes().length, 0);
});

test('a zero timestep freezes the structure', async () => {
  const { f } = await composed();
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  step(f, 10);
  const dome = bigBubblerDomes()[0];
  const radius = dome.radius, t = dome.t, hp = dome.hp;
  for (let i = 0; i < 10; i++) tickBigBubblers(0);
  assert.equal(dome.radius, radius, 'pause does not grow the dome');
  assert.equal(dome.t, t);
  assert.equal(dome.hp, hp, 'pause does not burn the canopy');
});

test('the deploy / hit / expiry replay state is plain serializable data', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  step(f, 20);
  const snapshot = bigBubblerSnapshot();
  assert.equal(snapshot.length, 1);
  assert.equal(JSON.parse(JSON.stringify(snapshot))[0].team, 0);
  for (const key of ['domeId', 'team', 't', 'pos', 'radius', 'emitterY', 'hp', 'fieldHp', 'ignited']) {
    assert.ok(key in snapshot[0], `snapshot carries ${key}`);
  }
  assert.equal(snapshot[0].ignited, true, '20 ticks is past the pinned IgnitionFrame');
});

test('the explosion shielding handoff keeps native LOS and never grants invulnerability', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  const physics = level(f);
  const owner = roller(f);
  const hostile = f.make('shooter'); hostile.team = 1; hostile.pos.set(0, 0, 12);
  f.G.actors = [owner, hostile];
  activate(f, owner);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  // native LOS is the real Physics.los and is never replaced or wrapped
  const los = f.G.physics.los.bind(f.G.physics);
  assert.equal(f.G.physics.los, physics.los, 'native LOS is untouched by the installer');
  const origin = new f.THREE.Vector3(0, 1.05, 20), target = new f.THREE.Vector3(0, 1.05, -20);
  const losBefore = los(origin, target);
  const hp = dome.hp, invuln = hostile.invuln;
  // a blast coming from outside is shielded at the dome: first contact
  const blast = round(f, 1, origin, { type: 'blast', size: 0.3, damage: 30 });
  const shelter = f.G.projectiles.kitBarrierShelter(blast, origin, target);
  assert.ok(shelter, 'the dome is offered as one more first-contact candidate');
  assert.equal(shelter.domeId, dome.id);
  assert.equal(los(origin, target), losBefore, 'asking for the shield does not change native LOS');
  assert.equal(dome.hp, hp, 'the shielding query spends no HP: the parent decides');
  assert.equal(hostile.invuln, invuln, 'shielding is never actor invulnerability');
  assert.equal(owner.invuln, 0, 'nobody inside the dome becomes invulnerable');
  // a hostile that STARTS inside the dome is not shielded: native behaviour stands
  const inside = new f.THREE.Vector3(dome.pos.x, dome.pos.y + 0.5, dome.pos.z);
  const inward = round(f, 1, inside, { type: 'blast', size: 0.3, damage: 30 });
  assert.equal(kitBarrierShelter(inward, inside, new f.THREE.Vector3(dome.pos.x, dome.pos.y + 0.5, 40)),
    null, 'an inside origin is never shielded; hostile-inside behaviour is preserved');
  // a blast that misses the dome is not shielded either
  const over = new f.THREE.Vector3(0, 40, 20), over2 = new f.THREE.Vector3(0, 40, -20);
  assert.equal(kitBarrierShelter(round(f, 1, over, { type: 'blast' }), over, over2), null);
  // a friendly blast is never a candidate
  assert.equal(kitBarrierShelter(round(f, 0, origin, { type: 'blast' }), origin, target), null);
});

test('the deploy, hit, ignite and collapse events are the concrete remote replay handoff', async () => {
  const { f } = await composed();
  level(f);
  const a = roller(f); f.G.actors = [a];
  const seen = { deploy: [], ignite: [], hit: [], burn: [], collapse: [] };
  const stops = [
    f.on('kit:bubbler:deploy', p => seen.deploy.push(p)),
    f.on('kit:bubbler:ignite', p => seen.ignite.push(p)),
    f.on('kit:bubbler:hit', p => seen.hit.push(p)),
    f.on('kit:bubbler:burn', p => seen.burn.push(p)),
    f.on('kit:bubbler:collapse', p => seen.collapse.push(p)),
  ];
  activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  const start = new f.THREE.Vector3(0, 1.05, -8), end = new f.THREE.Vector3(0, 1.05, 8);
  kitBarrierCandidate(round(f, 1, start), start, end).onHit();
  for (let i = 0; i < 60 * 30 && bigBubblerDomes().length; i++) tickBigBubblers(DT);
  stops.forEach(stop => stop());
  // every stage a remote proxy needs is emitted once, with a serializable payload
  assert.equal(seen.deploy.length, 1);
  assert.equal(seen.ignite.length, 1);
  assert.equal(seen.collapse.length, 1, 'the pinned TimeDamage expires the dome exactly once');
  assert.equal(seen.collapse[0].reason, 'canopy-destroyed');
  for (const event of [...seen.deploy, ...seen.ignite, ...seen.collapse]) {
    assert.equal(event.domeId, dome.id, 'each event identifies the dome');
    assert.ok(Array.isArray(event.pos.toArray()), 'each event carries a serializable position');
  }
  assert.equal(seen.hit.length, 1, 'one onHit is exactly one incoming-hit event');
  assert.ok(seen.hit[0].amount > 0 && seen.hit[0].target === 'canopy' && seen.hit[0].cause === 'shot');
  // the events carry the live owner like every native kit event does; a net layer
// forwards the serializable subset, which is what the handoff documents.
  const wire = ({ domeId, team, target, amount, cause, hp, fieldHp }) =>
    ({ domeId, team, target, amount, cause, hp, fieldHp });
  assert.deepEqual(JSON.parse(JSON.stringify(wire(seen.hit[0]))), wire(seen.hit[0]),
    'the forwarded hit payload survives JSON unchanged');
  // the pinned TimeDamage is its own stream: it never masquerades as a hit
  assert.ok(seen.burn.length > 0, 'the burn ticks were observed');
  assert.ok(seen.burn.every(b => b.cause === 'burn' && b.target === 'canopy'));
});

test('the documented native query anchor is present and unique in the composed source', () => {
  const source = fs.readFileSync(`${UPSTREAM}/src/game/weapons.js`, 'utf8');
  const anchor = '      p.pos.addScaledVector(p.vel, dt);\n      let dead = false;';
  assert.equal(source.split(anchor).length - 1, 1, 'the parent call site has one exact anchor');
  assert.ok(source.includes('G.physics.segment(p.prev, p.pos, _hit, true)'),
    'the native world contact the candidate must be arbitrated against');
  assert.ok(source.includes('return dead;'));
});