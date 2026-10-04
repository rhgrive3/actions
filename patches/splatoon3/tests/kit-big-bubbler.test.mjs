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
  installKitBigBubbler, bigBubblerDomes, bigBubblerRemoteDomes, bigBubblerSnapshot,
  bigBubblerOwnerId, kitBarrierCandidate, kitBarrierHitRecord, clearBigBubblers,
  tickBigBubblers, tickRemoteBigBubblers, replayBigBubbler, resetBigBubblerReplay,
  BIG_BUBBLER_RAW, BIG_BUBBLER_CALIBRATION, hermite2d, kitBarrierShelter,
  BIG_BUBBLER_OWNERSHIP,
} from '../runtime/kit-big-bubbler.mjs';

const MODULE_PATH = new URL('../runtime/kit-big-bubbler.mjs', import.meta.url);

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

// ---------------------------------------------------------------- lifecycle
test('only a charged, single, live native activation deploys a structure', async () => {
  const { f } = await composed();
  level(f);
  const a = roller(f); f.G.actors = [a];
  // a manual call with an empty gauge must not create a structure
  a.special = 0;
  a._startSpecial();
  assert.equal(bigBubblerDomes().length, 0, 'an uncharged manual _startSpecial does not deploy');
  // a dead actor must not deploy either, even with a full gauge
  a.special = a.specialCost();
  a.alive = false;
  a._startSpecial();
  assert.equal(bigBubblerDomes().length, 0, 'a dead actor does not deploy');
  a.alive = true;
  // re-entrancy: a nested activation chain fails closed and deploys nothing
  let fired = false, nested = 0;
  const stop = f.on('special:use', () => {
    if (fired) return;
    fired = true;
    a.special = a.specialCost();
    a._startSpecial();
    nested++;
  });
  a.special = a.specialCost();
  a._startSpecial();
  stop();
  assert.equal(nested, 1, 'the nested call really happened');
  assert.equal(bigBubblerDomes().length, 0, 'a re-entrant activation chain never deploys');
  // the ordinary path runs the native common activation exactly once
  let refills = 0;
  const stopRefill = f.on('special:refill', () => refills++);
  f.G.actors = [a];
  const inkBefore = a.ink;
  a.special = a.specialCost(); a.intent.special = true; f.tick(a);
  stopRefill();
  assert.equal(bigBubblerDomes().length, 1, 'one real activation deploys exactly one dome');
  // 1 uncharged + 1 dead + (1 re-entrant chain = outer + nested) + 1 real = 5
  assert.equal(a.stats.specials, 5, 'the native activation ran once per call and never more');
  assert.equal(a.special, 0);
  assert.equal(refills, 0,
    'this module never refills: the parent resources module keys the refill on a '
    + 'specialActive activation, and the bubbler deliberately sets none');
  assert.equal(a.ink, inkBefore, 'so the tank is exactly where the parent left it');
});

test('the module never writes an ink field, so the refill stays the parent’s', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  assert.equal(/\.ink\s*=/.test(source), false, 'no ink assignment anywhere in the module');
  assert.equal(/\bink\s*[:=]/.test(source), false, 'no ink binding either');
});

test('a paused timestep is a strict no-op: no growth, no ignition, no paint', async () => {
  const { f } = await composed();
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  let paints = 0;
  f.G.paint.splat = () => { paints++; return 0; };
  // park the clock: a non-positive timestep must be ignored outright
  tickBigBubblers(0);
  assert.equal(dome.t, 0);
  assert.equal(dome.ignited, false);
  for (let i = 0; i < 120; i++) { tickBigBubblers(0); tickRemoteBigBubblers(0); tickBigBubblers(-1); }
  assert.equal(dome.t, 0, 'a paused or negative dt never advances the clock');
  assert.equal(dome.ignited, false, 'a paused clock never ignites');
  assert.equal(paints, 0, 'a paused clock never paints');
  assert.equal(dome.radius, BIG_BUBBLER_RAW.minRadius);
  assert.equal(bigBubblerRemoteDomes().length, 0, 'and the remote clock is a no-op too');
});

test('dome ids use the real network identity, never a colliding slot fallback', async () => {
  const { f } = await composed();
  level(f);
  const a = roller(f); const b = roller(f, 0, 20, 0);
  f.G.actors = [a, b];
  assert.equal(bigBubblerOwnerId(a), bigBubblerOwnerId(a), 'stable per actor instance');
  assert.notEqual(bigBubblerOwnerId(a), bigBubblerOwnerId(b),
    'two actors of the same team get different keys even with the same slot');
  activate(f, a); activate(f, b);
  const ids = bigBubblerDomes().map(d => d.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, 'same team and same special count still collide-free');
  assert.ok(ids.every(id => !/^0:0:/.test(id)), 'no "team:slot:count" identity is emitted');
  // a live net id is preferred over anything this module could mint
  a.nid = 41;
  assert.equal(bigBubblerOwnerId(a), 'n41', 'Actor.nid is the source of truth');
  assert.equal(bigBubblerOwnerId(null), null, 'an absent owner has no identity, and does not crash');
  a.special = a.specialCost();
  a._startSpecial();
  assert.ok(bigBubblerDomes().some(d => d.id.startsWith('0:n41:')),
    'the dome id carries the real network identity');
});

// ------------------------------------------------------------------ replay
const VALID_DEPLOY = () => ({
  domeId: '1:n9:3', serial: 3, team: 1, t: 1.0,
  pos: [-12.5, 0, 33.25], hp: BIG_BUBBLER_RAW.maxHp, fieldHp: BIG_BUBBLER_RAW.maxFieldHp,
});

test('a replayed deploy restores the transmitted position instead of re-deriving aim', async () => {
  const { f, scene } = await composed();
  level(f);
  const proxy = f.make('shooter'); proxy.team = 1; proxy.pos.set(0, 0, 60); proxy.aimYaw = 1.1;
  f.G.actors = [proxy];
  const sceneBefore = scene.children.length;
  const result = f.G.projectiles.kitBubbleReplay('deploy', proxy, VALID_DEPLOY());
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'deployed');
  const shown = bigBubblerRemoteDomes();
  assert.equal(shown.length, 1);
  const [px, py, pz] = shown[0].pos.toArray();
  assert.equal(px, -12.5);
  assert.equal(py, 0);
  assert.equal(pz, 33.25);
  // the aim-derived position would be ~ (sin(1.1), cos(1.1)) * 3 from the proxy
  const derived = { x: 60 + Math.sin(1.1) * BIG_BUBBLER_CALIBRATION.deployDistance,
    z: Math.cos(1.1) * BIG_BUBBLER_CALIBRATION.deployDistance };
  assert.ok(Math.hypot(33.25 - derived.x, 0 - derived.z) > 20,
    'which is nowhere near the aim-derived landing point');
  assert.equal(shown[0].team, 1);
  assert.equal(shown[0].id, '1:n9:3');
  assert.equal(shown[0].serial, 3);
  assert.equal(shown[0].remote, true);
  assert.ok(scene.children.length > sceneBefore, 'a real scene object backs the remote dome');
});

test('replay is idempotent: duplicate deploy, hit and expire packets are reported, not applied', async () => {
  const { f } = await composed();
  level(f);
  const proxy = f.make('shooter'); proxy.team = 1; f.G.actors = [proxy];
  const payload = VALID_DEPLOY();
  assert.equal(f.G.projectiles.kitBubbleReplay('deploy', proxy, payload).reason, 'deployed');
  const again = f.G.projectiles.kitBubbleReplay('deploy', proxy, payload);
  assert.equal(again.ok, true);
  assert.equal(again.reason, 'duplicate');
  assert.equal(bigBubblerRemoteDomes().length, 1, 'a duplicated deploy creates nothing new');
  // a hit with a distinct serial is applied once, even when the packet repeats
  const hit = { domeId: payload.domeId, serial: 1, target: 'canopy', amount: 3600 };
  const shown = bigBubblerRemoteDomes()[0];
  const hp = shown.hp;
  assert.equal(f.G.projectiles.kitBubbleReplay('hit', proxy, hit).reason, 'displayed');
  assert.equal(shown.hp, hp - 3600);
  assert.equal(f.G.projectiles.kitBubbleReplay('hit', proxy, hit).reason, 'duplicate');
  assert.equal(f.G.projectiles.kitBubbleReplay('hit', proxy, hit).ok, true);
  assert.equal(shown.hp, hp - 3600, 'a duplicated hit packet cannot spend HP twice');
  // expire is idempotent too
  assert.equal(f.G.projectiles.kitBubbleReplay('expire', proxy, { domeId: payload.domeId }).reason, 'expired');
  assert.equal(bigBubblerRemoteDomes().length, 0);
  assert.equal(f.G.projectiles.kitBubbleReplay('expire', proxy, { domeId: payload.domeId }).reason, 'duplicate');
});

test('replay validation is bounded and never throws on malformed input', async () => {
  const { f } = await composed();
  level(f);
  const proxy = f.make('shooter'); proxy.team = 1; f.G.actors = [proxy];
  const bad = [
    [undefined, 'not-an-object'], [null, 'not-an-object'], ['deploy', 'not-an-object'],
    [[], 'not-an-object'], [{}, 'bad-dome-id'], [{ domeId: 7 }, 'bad-dome-id'], [{ domeId: '' }, 'bad-dome-id'],
    [{ domeId: 'x'.repeat(65), team: 1, t: 0, pos: [0, 0, 0], hp: 1, fieldHp: 1 }, 'dome-id-too-long'],
    [{ domeId: 'a', team: 9, t: 0, pos: [0, 0, 0], hp: 1, fieldHp: 1 }, 'bad-team'],
    [{ domeId: 'a', team: 1.5, t: 0, pos: [0, 0, 0], hp: 1, fieldHp: 1 }, 'bad-team'],
    [{ domeId: 'a', team: 1, t: 0, pos: [0, 0], hp: 1, fieldHp: 1 }, 'bad-position'],
    [{ domeId: 'a', team: 1, t: 0, pos: [0, 0, NaN], hp: 1, fieldHp: 1 }, 'bad-position'],
    [{ domeId: 'a', team: 1, t: 0, pos: [0, 0, Infinity], hp: 1, fieldHp: 1 }, 'bad-position'],
    [{ domeId: 'a', team: 1, t: 0, pos: [0, 0, 1e9], hp: 1, fieldHp: 1 }, 'bad-position'],
    [{ domeId: 'a', team: 1, t: -1, pos: [0, 0, 0], hp: 1, fieldHp: 1 }, 'bad-age'],
    [{ domeId: 'a', team: 1, t: 1e9, pos: [0, 0, 0], hp: 1, fieldHp: 1 }, 'bad-age'],
    [{ domeId: 'a', team: 1, t: 0, pos: [0, 0, 0], hp: -1, fieldHp: 1 }, 'bad-hp'],
    [{ domeId: 'a', team: 1, t: 0, pos: [0, 0, 0], hp: 1, fieldHp: 1e12 }, 'bad-field-hp'],
    [{ domeId: 'a', team: 1, t: 0, pos: [0, 0, 0], hp: 1, fieldHp: 1, serial: -3 }, 'bad-serial'],
    [{ domeId: 'a', team: 1, t: 0, pos: [0, 0, 0], hp: 1, fieldHp: 1, serial: 1.5 }, 'bad-serial'],
  ];
  for (const [payload, reason] of bad) {
    const r = replayBigBubbler('deploy', proxy, payload);
    assert.equal(r.ok, false, `rejected: ${reason}`);
    assert.equal(r.reason, reason, `reason for ${JSON.stringify(payload)?.slice(0, 40)}`);
  }
  assert.equal(bigBubblerRemoteDomes().length, 0, 'no malformed packet created anything');
  assert.equal(replayBigBubbler('nope', proxy, {}).reason, 'unknown-event');
  // hit validates target and amount
  for (const payload of [{}, { domeId: 'a', target: 'wall', amount: 1 }, { domeId: 'a', target: 'canopy', amount: -1 },
    { domeId: 'a', target: 'canopy', amount: 'lots' }, { domeId: 'a'.repeat(80), target: 'canopy', amount: 1 },
    { domeId: 'a', target: 'canopy', amount: 1, serial: -1 }]) {
    assert.equal(replayBigBubbler('hit', proxy, payload).ok, false, `hit rejects ${JSON.stringify(payload).slice(0, 50)}`);
  }
  // expire validates only the id: a well-formed id for an unknown dome is a
  // harmless idempotent no-op, not an error, and must say so rather than vanish
  for (const payload of [{}, undefined, 'x', { domeId: 3 }, { domeId: '' }, { domeId: 'a'.repeat(80) }]) {
    assert.equal(replayBigBubbler('expire', proxy, payload).ok, false, `expire rejects ${JSON.stringify(payload)}`);
  }
  const orphan = replayBigBubbler('expire', proxy, { domeId: 'never-deployed' });
  assert.equal(orphan.ok, true);
  assert.equal(orphan.reason, 'already-absent', 'an unknown dome is reported, not silently ignored');
});

test('a remote dome is presentation only: its clock paints nothing and burns nothing', async () => {
  const { f } = await composed();
  level(f);
  const proxy = f.make('shooter'); proxy.team = 1; f.G.actors = [proxy];
  let paints = 0;
  f.G.paint.splat = () => { paints++; return 0; };
  const authoritative = [], presentation = [];
  const stops = [
    f.on('kit:bubbler:ignite', p => authoritative.push(p)),
    f.on('kit:bubbler:hit', p => authoritative.push(p)),
    f.on('kit:bubbler:burn', p => authoritative.push(p)),
    f.on('kit:bubbler:collapse', p => authoritative.push(p)),
    f.on('kit:bubbler:deploy', p => authoritative.push(p)),
    f.on('kit:bubbler:remote:ignite', p => presentation.push(p)),
    f.on('kit:bubbler:remote:gone', p => presentation.push(p)),
    f.on('kit:bubbler:replay:reset', p => presentation.push(p)),
  ];
  const fresh = { ...VALID_DEPLOY(), t: 0 };
  replayBigBubbler('deploy', proxy, fresh);
  const dome = bigBubblerRemoteDomes()[0];
  assert.equal(dome.ignited, false, 'a freshly replayed dome is not yet armed');
  const hp = dome.hp, field = dome.fieldHp;
  for (let i = 0; i < 60 * 40; i++) tickRemoteBigBubblers(DT);
  stops.forEach(stop => stop());
  assert.equal(paints, 0, 'a remote dome never paints on this client');
  assert.equal(dome.hp, hp, 'the TimeDamage burn never runs against a remote dome');
  assert.equal(dome.fieldHp, field);
  assert.equal(bigBubblerRemoteDomes().length, 1, 'a remote dome never expires on its own');
  assert.deepEqual(authoritative, [], 'no authoritative event is emitted for a remote dome');
  assert.equal(presentation.length, 1, 'exactly one presentation ignition');
  assert.equal(presentation[0].presentationOnly, true);
});

test('a local round versus a remote dome proposes damage and changes nothing', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const proxy = f.make('shooter'); proxy.team = 1; f.G.actors = [proxy];
  replayBigBubbler('deploy', proxy, VALID_DEPLOY());
  const remote = bigBubblerRemoteDomes()[0];
  tickRemoteBigBubblers(DT);
  const hp = remote.hp, field = remote.fieldHp;
  const proposals = [];
  const stop = f.on('kit:bubbler:damage-proposal', p => proposals.push(p));
  // the round crosses the dome: centre (-12.5, 0, 33.25), shell radius 7.5 at t=1
  const y = 1.05;
  const start = new f.THREE.Vector3(-12.5, y, 33.25 - 20), end = new f.THREE.Vector3(-12.5, y, 33.25 + 20);
  const candidate = kitBarrierCandidate(round(f, 0, start), start, end);
  assert.ok(candidate, 'a local round can be stopped by a remote dome');
  assert.equal(candidate.remote, true);
  assert.equal(candidate.ownership, 'remote-presentation');
  const applied = candidate.onHit();
  stop();
  assert.equal(applied, 0, 'no HP is spent on this client');
  assert.equal(remote.hp, hp, 'the remote HP is untouched');
  assert.equal(remote.fieldHp, field);
  assert.equal(proposals.length, 1, 'the parent is handed exactly one proposal');
  const wire = proposals[0];
  assert.deepEqual(JSON.parse(JSON.stringify(wire)), wire, 'the proposal is JSON-safe');
  assert.equal(wire.domeId, remote.id);
  assert.equal(wire.serial, remote.serial);
  assert.equal(wire.amount, 36 * BIG_BUBBLER_CALIBRATION.rawPerDamageUnit);
  assert.equal(candidate.onHit(), 0, 'a second call cannot propose twice');
  assert.equal(proposals.length, 1);
  // the ghost round is still intercepted, still visual only
  const ghost = kitBarrierCandidate(round(f, 0, start, { ghost: true }), start, end);
  assert.ok(ghost, 'a ghost may be stopped at a remote dome');
  assert.equal(ghost.visualOnly, true);
  assert.equal(ghost.onHit(), 0);
  assert.equal(ghost.proposal, null, 'a ghost proposes nothing at all');
});

test('a neutral round never spends a dome budget, on either dome', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const local = bigBubblerDomes()[0];
  step(f, 60);
  const start = new f.THREE.Vector3(0, 1.05, -8), end = new f.THREE.Vector3(0, 1.05, 8);
  const hp = local.hp;
  for (const team of [null, undefined, 'blue', 1.5, NaN]) {
    const neutral = kitBarrierCandidate(round(f, team, start), start, end);
    assert.ok(neutral, `a neutral round (team ${String(team)}) can still be intercepted visually`);
    assert.equal(neutral.visualOnly, true);
    assert.equal(neutral.onHit(), 0);
  }
  assert.equal(local.hp, hp, 'no neutral round damaged the local dome');
  assert.equal(kitBarrierHitRecord(kitBarrierCandidate(round(f, null, start), start, end)).visualOnly, true);
});

test('the candidate reports which targets are reachable and re-checks liveness on hit', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  level(f);
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  step(f, 90);
  const ey = dome.pos.y + dome.emitterY;
  const overhead = new f.THREE.Vector3(dome.pos.x, ey, -8);
  const through = new f.THREE.Vector3(dome.pos.x, ey, dome.pos.z);
  const above = kitBarrierCandidate(round(f, 1, overhead), overhead, through);
  assert.equal(above.target, 'field');
  assert.deepEqual(above.reachableCanopy, false, 'a shot over the shell cannot reach the canopy');
  assert.equal(above.reachableEmitter, true);
  // a shell shot can reach the canopy but not the emitter above it
  const low = new f.THREE.Vector3(dome.pos.x, dome.pos.y + 1.0, dome.pos.z - 20);
  const shell = kitBarrierCandidate(round(f, 1, low), low, new f.THREE.Vector3(dome.pos.x, dome.pos.y + 1.0, dome.pos.z + 20));
  assert.equal(shell.target, 'canopy');
  assert.equal(shell.reachableCanopy, true);
  assert.equal(shell.reachableEmitter, false, 'the emitter is above this segment');
  assert.deepEqual(kitBarrierHitRecord(shell).reachable, { canopy: true, emitter: false });
  // a candidate queried before the dome died spends nothing when it settles
  const pending = kitBarrierCandidate(round(f, 1, low),
    low, new f.THREE.Vector3(dome.pos.x, dome.pos.y + 1.0, dome.pos.z + 20));
  clearBigBubblers('test-race');
  assert.equal(dome.dead, true);
  assert.equal(pending.onHit(), 0, 'a stale candidate cannot spend a dead dome');
});

test('a match reset clears remote domes, the dedupe window and the scene', async () => {
  const { f, scene } = await composed();
  level(f);
  const proxy = f.make('shooter'); proxy.team = 1; f.G.actors = [proxy];
  const payload = VALID_DEPLOY();
  replayBigBubbler('deploy', proxy, payload);
  replayBigBubbler('hit', proxy, { domeId: payload.domeId, serial: 1, target: 'canopy', amount: 10 });
  const sceneWith = scene.children.length;
  assert.equal(bigBubblerRemoteDomes().length, 1);
  let resets = 0;
  const stop = f.on('kit:bubbler:replay:reset', () => resets++);
  const removed = resetBigBubblerReplay('test-match-reset');
  stop();
  assert.deepEqual(removed.removed, [payload.domeId]);
  assert.equal(resets, 1, 'the parent is told exactly when the replay side was reset');
  assert.equal(bigBubblerRemoteDomes().length, 0);
  assert.ok(scene.children.length < sceneWith, 'the remote dome released its scene objects');
  // the same packet is accepted again after a reset: no stale dedupe carries over
  assert.equal(replayBigBubbler('deploy', proxy, payload).reason, 'deployed',
    'the dedupe window is cleared by the reset');
});

test('two composed actors round-trip a deploy packet through JSON, duplicates, reset and disposal', async () => {
  const { f, scene } = await composed();
  level(f);
  const local = roller(f, 0, 0, 0);                       // the authoritative side
  const proxy = f.make('shooter'); proxy.team = 1; proxy.nid = 7; proxy.pos.set(0, 0, 60);
  f.G.actors = [local, proxy];
  const sceneBefore = scene.children.length;   // baseline: no dome on screen yet
  activate(f, local);
  step(f, 60);
  assert.ok(scene.children.length > sceneBefore, 'the deployed dome owns real scene objects');
  // the packet a host would put on the wire, and it must survive JSON intact
  const packet = { e: 'deploy', payload: bigBubblerSnapshot()[0] };
  const wire = JSON.parse(JSON.stringify(packet));
  assert.deepEqual(wire, packet, 'the snapshot is a JSON-safe packet');
  for (const key of ['domeId', 'serial', 'team', 't', 'pos', 'hp', 'fieldHp']) {
    assert.ok(key in wire.payload, `the packet carries ${key}`);
  }
  // match disposal on the receiving side before the packet arrives
  f.G.projectiles.clear();
  assert.equal(bigBubblerDomes().length + bigBubblerRemoteDomes().length, 0);
  assert.equal(scene.children.length, sceneBefore, 'every scene object is released by the reset');

  // the same packet is delivered twice (a duplicated transport frame)
  const first = f.G.projectiles.kitBubbleReplay(wire.e, proxy, wire.payload);
  const second = f.G.projectiles.kitBubbleReplay(wire.e, proxy, wire.payload);
  assert.equal(first.reason, 'deployed');
  assert.equal(second.reason, 'duplicate');
  assert.equal(bigBubblerRemoteDomes().length, 1);
  const shown = bigBubblerRemoteDomes()[0];
  assert.deepEqual(Array.from(shown.pos.toArray()), wire.payload.pos, 'the transmitted position round-trips exactly');
  assert.equal(shown.team, wire.payload.team);
  assert.equal(shown.id, wire.payload.domeId);
  assert.equal(shown.serial, wire.payload.serial);
  assert.equal(shown.hp, wire.payload.hp);
  assert.equal(shown.fieldHp, wire.payload.fieldHp);
  assert.equal(shown.t, wire.payload.t);
  assert.equal(shown.ignited, wire.payload.ignited);

  // a hit packet, duplicated, and then an expiry packet, duplicated
  const hit = { domeId: wire.payload.domeId, serial: 1, target: 'canopy', amount: 3600 };
  const hitWire = JSON.parse(JSON.stringify(hit));
  const hp = shown.hp;
  f.G.projectiles.kitBubbleReplay('hit', proxy, hitWire);
  f.G.projectiles.kitBubbleReplay('hit', proxy, hitWire);
  assert.equal(shown.hp, hp - 3600, 'exactly one hit packet was applied');
  const expireWire = JSON.parse(JSON.stringify({ domeId: wire.payload.domeId }));
  f.G.projectiles.kitBubbleReplay('expire', proxy, expireWire);
  f.G.projectiles.kitBubbleReplay('expire', proxy, expireWire);
  assert.equal(bigBubblerRemoteDomes().length, 0);
  assert.equal(scene.children.length, sceneBefore, 'the expiry disposed the remote dome');

  // the authoritative dome is untouched by any of the remote traffic
  local.special = local.specialCost();
  local._startSpecial();
  assert.equal(bigBubblerDomes().length, 1, 'the local side still owns its own structure');
});

test('the ownership declaration is explicit rather than a silent network gap', () => {
  assert.ok(BIG_BUBBLER_OWNERSHIP.owns.length >= 4);
  assert.ok(BIG_BUBBLER_OWNERSHIP.doesNotOwn.some(s => /packet transport/.test(s)));
  assert.ok(BIG_BUBBLER_OWNERSHIP.doesNotOwn.some(s => /prediction|reconciliation|rollback/.test(s)));
  assert.ok(/host/.test(BIG_BUBBLER_OWNERSHIP.remoteHpAuthority));
  assert.ok(/proposal/.test(BIG_BUBBLER_OWNERSHIP.remoteHpAuthority),
    'and it names the damage proposal the parent must adjudicate');
  assert.ok(/neutral/i.test(BIG_BUBBLER_OWNERSHIP.neutralPolicy));
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  assert.ok(/NO online parity/.test(source), 'the module states the parity limitation in-source');
});

test('the documented native query anchor is present and unique in the composed source', () => {
  const source = fs.readFileSync(`${UPSTREAM}/src/game/weapons.js`, 'utf8');
  const anchor = '      p.pos.addScaledVector(p.vel, dt);\n      let dead = false;';
  assert.equal(source.split(anchor).length - 1, 1, 'the parent call site has one exact anchor');
  assert.ok(source.includes('G.physics.segment(p.prev, p.pos, _hit, true)'),
    'the native world contact the candidate must be arbitrated against');
  assert.ok(source.includes('return dead;'));
});