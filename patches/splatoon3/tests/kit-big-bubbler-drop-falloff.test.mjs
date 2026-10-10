// BB-04 regression: a `type: "drop"` round must reach the dome with the SAME
// distance falloff the native pipeline uses for actors and the boss.
//
//   native (adapted weapons.js)  dmg = lerp(p.damage, p.dmgFar,
//                                            clamp(p.start.distanceTo(hit) / 7, 0, 1))
//
// Before the fix kitBarrierCandidate charged `(p.damage || 0) * rawPerDamageUnit`
// with no distance term, so a roller flick that had already travelled far
// destroyed a dome the native damage model would have left standing.
//
// The round is advanced by the REAL adapted `Projectiles.update` -> `_step`
// nearest-collision chronology, so the dome contact is arbitrated by the same
// production call site, not by a hand-written query. Only the flick's sheet
// spread is replaced by a single deterministic glob carrying the exact field set
// native `fireFlick` assigns to one drop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './kit-composed-fixture.mjs';
import {
  installKitBigBubbler, bigBubblerDomes, bigBubblerRemoteDomes,
  clearBigBubblers, kitBarrierCandidate, BIG_BUBBLER_SOURCE_RATES,
} from '../runtime/kit-big-bubbler.mjs';
import { installKitDefense } from '../runtime/kit-defense.mjs';
import { fidelityDamage, installWeaponsFidelity } from '../runtime/weapons-fidelity.mjs';

const RAW_PER_DAMAGE_UNIT = 100;   // BIG_BUBBLER_CALIBRATION.rawPerDamageUnit
const FALLOFF_RANGE = 7;           // the native constant in weapons.js
const FAR_CASE_HP = 20000;         // pinned test budget, above one far contact
// Pinned spl__DamageRateInfoConfig RollerSplash x GreatBarrier_Barrier (canopy).
const ROLLER_SPLASH = BIG_BUBBLER_SOURCE_RATES.RollerSplash[0];

async function composed() {
  const f = await fixture();
  // Host-realm Kit helpers consume the same pinned source table as the VM.
  // Register them on unused derived prototypes, leaving the native VM owners intact.
  installWeaponsFidelity({...f,Projectiles:class extends f.Projectiles {},WeaponRunner:class extends f.WeaponRunner {}},f.profile);
  const scene = new f.THREE.Scene();
  f.G.scene = scene;f.G.camera={position:new f.THREE.Vector3(0,20,0)};
  f.G.projectiles = new f.Projectiles(scene);
  f.SPECIALS.bubbler = { id: 'bubbler', name: 'Big Bubbler', blurb: 'dome', cost: 180 };
  const api = { ...f, Actor: f.Actor, Projectiles: f.Projectiles, THREE: f.THREE, G: f.G,
    PLAYER: f.PLAYER, emit: f.emit, SPECIALS: f.SPECIALS };
  installKitBigBubbler(api, { ...f.profile, kits: { bigBubbler: {} } });
  installKitDefense(api);
  clearBigBubblers('drop-falloff-test');
  return { f, api };
}

function level(f) {
  const V = f.THREE.Vector3;
  const blocks = [{ id: 0, solid: true, center: new V(0, -0.5, 0), half: new V(400, 0.5, 400),
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)], faces: [-1, -1, 0, -1, -1, -1],
    aabbMin: new V(-400, -1, -400), aabbMax: new V(400, 0, 400) }];
  const lvl = { blocks, faces: [{ origin: new V(-400, 0, -400), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0, pointInside: () => false,
    spawnPads: [new V(), new V(300, 0, 300)], spawnBarrier: 1,
    queryBlocks: (_x, _z, _a, _b, out) => { out.length = 0; for (const b of blocks) out.push(b.id); return out; } };
  f.G.level = lvl;
  f.G.physics = new f.Physics(lvl);
  return f.G.physics;
}

// Deploy one real dome through the real activation, then pin its HP so the
// arithmetic in these tests is exact rather than clock-dependent.
async function withDome(f, hp = FAR_CASE_HP) {
  level(f);
  const a = f.make('roller');
  a.pos.set(0, 0, 0); a.yaw = 0; a.aimYaw = 0;
  a.weapon = { ...a.weapon, special: 'bubbler', specialCost: 180 };
  f.G.actors = [a];
  a.special = a.specialCost();
  a._startSpecial();
  const dome = bigBubblerDomes()[0];
  assert.ok(dome, 'the activation must deploy a dome');
  for (let i = 0; i < 240; i++) f.G.projectiles.update(1 / 60);   // grow + ignite
  dome.hp = hp;
  f.G.actors = [];
  return { a, dome };
}

// The exact field set native fireFlick assigns to one glob, so the adapted _step
// treats it as a real drop. Sheet spread is the only thing replaced.
function spawnFlick(f, owner, from, aim, { damage, dmgFar, speed = 20, legacy = false }) {
  const p = f.G.projectiles._new();
  Object.assign(p, { type: 'drop', owner, team: owner.team, age: 0, life: 6, straight: 999,
    radius: 0.85, damage, dmgFar, size: 0.15, trail: 0, trailEvery: 0, grav: 0, drag: 0,
    seed: 0, vis: 0.1, tail0: 4, tailK: 1, wob: 0, wobF: 19, nose: 0, sats: 1 });
  p.pos.copy(from); p.prev.copy(from); p.start.copy(from);
  p.vel.copy(aim).normalize().multiplyScalar(speed);
  f.G.projectiles._push(p);
  if (legacy) p.fidelityRollerUnit = null;
  // Controlled straight drop isolates barrier falloff from the current Roller gravity/phase owner.
  p.straight=999;p.grav=0;p.drag=0;p.fidelityMove=null;p.life=6;
  return p;
}

function runUntilSpent(f, p, limit = 6000) {
  for (let i = 0; i < limit; i++) {
    f.G.projectiles.update(1 / 240);
    if (!f.G.projectiles.list.includes(p)) return true;
  }
  return false;
}

// Steps until the round is consumed, keeping the dome's HP pinned at `hp` for
// every frame of the measured window. The TimeDamage burn is switched off by
// clearing `ignited` before the flight (the canopy shell is still a real shield;
// only the emitter stops being reachable), so the ONLY HP movement observed is
// the contact frame's own damage.
function runPinningBeforeContact(f, p, dome, hp, limit = 6000) {
  dome.ignited = false;
  for (let i = 0; i < limit; i++) {
    if (!f.G.projectiles.list.includes(p)) return true;
    dome.hp = hp;
    f.G.projectiles.update(1 / 240);
  }
  return false;
}

const rollerFlick = (f) => ({ near: f.profile.weapons.roller.flickDamageNear, far: f.profile.weapons.roller.flickDamageFar });

test('BB-04: a far roller flick leaves the dome standing at the native-model HP (9097)', async () => {
  const { f } = await composed();
  const { a, dome } = await withDome(f, FAR_CASE_HP);
  const { near, far } = rollerFlick(f);
  assert.equal(near, 150);
  assert.equal(far, 35);

  // The flick must come from an ENEMY: a dome never blocks its own owner's fire
  // (kitBarrierCandidate skips a same-team dome), which is correct behaviour.
  const enemy = f.make('roller');
  enemy.pos.set(dome.pos.x, 0, dome.pos.z - 40); enemy.yaw = 0; enemy.aimYaw = 0;
  enemy.weapon = { ...enemy.weapon, sub: 'curling' };
  enemy.team = 1;
  const start = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - 40);
  const p = spawnFlick(f, enemy, start, new f.THREE.Vector3(0, 0, 1), { damage: near, dmgFar: far, legacy: true });
  assert.ok(runPinningBeforeContact(f, p, dome, FAR_CASE_HP), 'the round must be consumed by the dome');

  assert.equal(ROLLER_SPLASH, 1.8);
  const expected = FAR_CASE_HP - far * ROLLER_SPLASH * RAW_PER_DAMAGE_UNIT * 0.64;
  assert.equal(dome.hp, expected,
    `far flick must spend flickDamageFar (${far}), not flickDamageNear (${near}); dome hp = ${dome.hp}`);
  assert.ok(dome.hp > 0, 'the dome must survive a far flick');
});

// GUARD, not a regression: a flick that reaches the canopy almost immediately
// must still spend essentially the full near amount. (This one also passes on the
// unfixed source, which is the point - it proves the fix does not over-scale.)
test('BB-04: a flick at zero range still spends essentially the full near amount', async () => {
  const { f } = await composed();
  const dome = (await withDome(f, 40000)).dome;
  const { near, far } = rollerFlick(f);
  // Spawn 0.05u outside the exact contact shell (dome radius + the round's own
  // size), so the falloff factor is ~0 and "zero range" really is zero.
  const start = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - dome.radius - 0.15 - 0.05);
  // a real actor: native _draw reads owner.color when the round is consumed
  const a = f.make('roller');
  a.pos.set(dome.pos.x, 0, dome.pos.z - 40); a.yaw = 0; a.aimYaw = 0;
  a.team = 1;
  const p = spawnFlick(f, a, start, new f.THREE.Vector3(0, 0, 1), { damage: near, dmgFar: far, legacy: true });
  assert.ok(runPinningBeforeContact(f, p, dome, 40000));
  const spent = 40000 - dome.hp;
  const scaledNear = near * ROLLER_SPLASH * RAW_PER_DAMAGE_UNIT * 0.64;
  // 97% rather than 100%: the round is launched 1.2u above the dome centre, so
  // the sphere solve puts the contact ~0.14u further along than a perfectly
  // head-on shot. That ~2-3% is REAL native falloff, not a defect, so the guard
  // asserts "essentially the near amount, never more than it".
  assert.ok(spent >= scaledNear * 0.97,
    `a near-zero-range flick must spend the 0.64-scaled near amount (~${scaledNear}); spent ${spent}`);
  assert.ok(spent <= scaledNear,
    'and can never exceed the near amount');
});

test('BB-04: an ordinary (non-drop) round is NOT distance-scaled', async () => {
  const { f } = await composed();
  const { a, dome } = await withDome(f, 40000);
  const p = f.G.projectiles._new();
  const start = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - 40);
  // deliberately carries dmgFar: the falloff must not touch a non-drop round
  const enemyShot = f.make('roller');
  enemyShot.pos.set(dome.pos.x, 0, dome.pos.z - 40); enemyShot.yaw = 0; enemyShot.aimYaw = 0;
  enemyShot.team = 1;
  Object.assign(p, { type: 'shot', owner: enemyShot, team: 1, age: 0, life: 6, straight: 999,
    radius: 0.2, damage: 36, dmgFar: 1, size: 0.15, trail: 0, trailEvery: 0, grav: 0, drag: 0,
    seed: 0, vis: 0.1, tail0: 4, tailK: 1, wob: 0, wobF: 19, nose: 0, sats: 1 });
  p.pos.copy(start); p.prev.copy(start); p.start.copy(start);
  p.vel.set(0, 0, 20);
  f.G.projectiles._push(p);p.straight=999;p.grav=0;p.drag=0;p.fidelityMove=null;p.life=6;
  assert.ok(runPinningBeforeContact(f, p, dome, 40000));
  assert.equal(dome.hp, 40000 - 36 * RAW_PER_DAMAGE_UNIT * 0.64,
    'a normal shot spends its own damage regardless of travel');
});

test('BB-04: the falloff uses the native contact-point distance, not travel distance', async () => {
  const { f } = await composed();
  const { a, dome } = await withDome(f, 40000);
  const { near, far } = rollerFlick(f);
  // Aim off-axis so p.start.distanceTo(contact) is measurably larger than the
  // distance the round travelled this step; conflating the two is the bug class.
  const start = new f.THREE.Vector3(dome.pos.x - 5, 1.2, dome.pos.z - 12);
  const prev = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - 9);
  const end = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - 6);
  const enemyA = f.make('roller');
  enemyA.pos.set(start.x, 0, start.z); enemyA.yaw = 0; enemyA.aimYaw = 0;
  enemyA.team = 1;
  const p = { pos: end.clone(), prev: prev.clone(), start: start.clone(),
    vel: new f.THREE.Vector3(0, 0, 1), age: 0, straight: 999, drag: 0, grav: 0,
    size: 0.15, damage: near, dmgFar: far, team: 1, life: 6, type: 'drop', owner: enemyA, radius: 0.85 };

  const c = kitBarrierCandidate(p, prev, end);
  assert.ok(c, 'the segment must reach the canopy');
  const nativeDistance = start.distanceTo(c.point);
  const travelDistance = prev.distanceTo(end);
  assert.ok(nativeDistance > travelDistance,
    `contact distance ${nativeDistance.toFixed(3)} must exceed per-step travel ${travelDistance.toFixed(3)}`);

  const expected = (near + (far - near) * Math.min(1, Math.max(0, nativeDistance / FALLOFF_RANGE)))
    * ROLLER_SPLASH * RAW_PER_DAMAGE_UNIT * 0.64;
  assert.equal(c.damage, expected,
    `dome damage must equal the native lerp at the contact point (${expected})`);
  assert.ok(c.damage < near * ROLLER_SPLASH * RAW_PER_DAMAGE_UNIT, 'a partially-scaled hit sits below the near amount');
});

test('BB-04: the owner adjudication receives the same scaled amount', async () => {
  const { f } = await composed();
  const { a, dome } = await withDome(f, 40000);
  const { near, far } = rollerFlick(f);
  // A REMOTE dome turns the local hit into a proposal instead of direct damage.
  bigBubblerDomes().length = 0;   // the local dome would otherwise tie and win
  const remote = { ...dome, id: `${dome.team}:n99:1`, remote: true,
    owner: { team: dome.team, nid: 99 }, dead: false };
  bigBubblerRemoteDomes().push(remote);

  const start = new f.THREE.Vector3(remote.pos.x - 5, 1.2, remote.pos.z - 12);
  const prev = new f.THREE.Vector3(remote.pos.x, 1.2, remote.pos.z - 9);
  const end = new f.THREE.Vector3(remote.pos.x, 1.2, remote.pos.z - 6);
  const shooter = { team: 1, remote: true, nid: 22 };
  const p = { pos: end.clone(), prev: prev.clone(), start: start.clone(),
    vel: new f.THREE.Vector3(0, 0, 1), age: 0, straight: 999, drag: 0, grav: 0,
    size: 0.15, damage: near, dmgFar: far, team: shooter.team, life: 6, type: 'drop', owner: shooter, radius: 0.85 };

  const c = kitBarrierCandidate(p, prev, end);
  assert.ok(c && c.remote, 'a local round against a remote dome must only propose');
  const expected = (near + (far - near) * Math.min(1, Math.max(0, start.distanceTo(c.point) / FALLOFF_RANGE)))
    * RAW_PER_DAMAGE_UNIT * 0.64;
  const settled = c.onHit();
  assert.equal(settled, 0, 'a proposal spends nothing on the proposing client');
  assert.ok(c.proposal, 'onHit must hand the parent a flat proposal');
  assert.equal(c.proposal.amount, expected,
    `the proposal must carry the SCALED amount (${expected}), not the near one`);
  assert.equal(remote.hp, 40000, 'the remote dome must be untouched here');

  bigBubblerRemoteDomes().length = 0;
});

test('#1046 current Roller flick uses S3 fidelity damage, then 1.8x object and 0.64 barrier modifiers', async () => {
  const { f } = await composed();
  const { dome } = await withDome(f, 50000);
  dome.ignited = false;
  const enemy = f.make('roller');
  enemy.pos.set(dome.pos.x, 0, dome.pos.z - 12); enemy.yaw = 0; enemy.aimYaw = 0; enemy.team = 1;
  const start = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - 12);
  const p = spawnFlick(f, enemy, start, new f.THREE.Vector3(0, 0, 1),
    { damage: enemy.weapon.flickDamageNear, dmgFar: enemy.weapon.flickDamageFar });
  assert.ok(p.fidelityRollerUnit, 'adapted current Roller unit identity is available');
  const end = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z + 2);
  const candidate = kitBarrierCandidate(p, start, end);
  assert.ok(candidate && candidate.target === 'canopy');
  const base = fidelityDamage(p, candidate.point, candidate.t);
  const expected = base * 1.8 * RAW_PER_DAMAGE_UNIT * 0.64;
  assert.ok(Math.abs(candidate.damage - expected) < 1e-9,
    `expected fidelity ${base} * 1.8 * 0.64, got raw delta ${candidate.damage}`);
});
