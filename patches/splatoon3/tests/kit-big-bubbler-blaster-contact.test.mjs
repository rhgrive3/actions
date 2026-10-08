// #1161: a stock Blaster (Japanese ホットブラスター) DIRECT projectile carries a
// dimensionless SOURCE-side object multiplier of 1.9x against the Big Bubbler.
//
// Community measurement (version provenance 11.2.0 / 3.1.1 marked) at
// https://wikiwiki.jp/splatoon3mix/ブキ/ホットブラスター and
// https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/グレートバリア:
// the direct round's raw pre-target damage against the barrier is 125 -> 237.5
// (x1.9). With Object Shredder the same source rate reports x2.09 (1.9 x 1.1),
// applied once. The generic separate ブラスター entry is 2.1x, so 1.9 must NOT
// be blanket-applied to every blaster variant, only to the stock Hot Blaster's
// direct projectile.
//
// This is a SOURCE-side multiplier: kitBarrierCandidate() computes the amount
// once, and the target-side DamgeRatio (0.64) is applied afterwards. A remote
// proposal therefore carries the post-multiplier, post-ratio amount and the
// host adjudication must not multiply it again.
//
// The full-adapter test drives the REAL composed runtimes (adapted
// inkwave-public + installKitBigBubbler + installKitDefense) through the real
// Projectiles.update -> fidelity _step -> kitDefenseCandidate path, not a
// hand-written query.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './kit-composed-fixture.mjs';
import { fixture as productionFixture } from './source-fixture.mjs';
import {
  installKitBigBubbler, bigBubblerDomes, bigBubblerRemoteDomes,
  clearBigBubblers, kitBarrierCandidate, adjudicateBigBubblerDamage,
  bigBubblerOwnerId, BIG_BUBBLER_RAW, BIG_BUBBLER_CALIBRATION,
} from '../runtime/kit-big-bubbler.mjs';
import { installKitDefense } from '../runtime/kit-defense.mjs';

const RAW_PER_DAMAGE_UNIT = BIG_BUBBLER_CALIBRATION.rawPerDamageUnit; // 100 (declared)
const CANOPY_RATIO = BIG_BUBBLER_RAW.damageRatio;                     // 0.64
const BLASTER_DIRECT = 125;                  // profile.weapons.blaster.directDamage
const BLASTER_OBJECT_MULTIPLIER = 1.9;       // #1161 sourced source-side object rate
const DOME_HP = 40000;                       // pinned test budget above one contact

async function composed() {
  const f = await fixture();
  const scene = new f.THREE.Scene();
  f.G.scene = scene;
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.projectiles = new f.Projectiles(scene);
  f.SPECIALS.bubbler = { id: 'bubbler', name: 'Big Bubbler', blurb: 'dome', cost: 180 };
  const api = { ...f, Actor: f.Actor, Projectiles: f.Projectiles, THREE: f.THREE, G: f.G,
    PLAYER: f.PLAYER, emit: f.emit, SPECIALS: f.SPECIALS };
  installKitBigBubbler(api, { ...f.profile, kits: { bigBubbler: {} } });
  installKitDefense(api);
  clearBigBubblers('blaster-contact-test');
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
// arithmetic is exact rather than clock-dependent.
async function withDome(f, hp = DOME_HP) {
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

// The exact field set native fireBlaster assigns to one round. The round is
// pushed through the real _push so the adapted initialize() stamps the weapon
// identity and blaster ballistics; straight/zero-gravity flight is then pinned
// so the test isolates the source multiplier from flight physics.
function spawnBlaster(f, owner, from, aim) {
  const p = f.G.projectiles._new();
  Object.assign(p, { type: 'blast', owner, team: owner.team, age: 0,
    life: owner.weapon.range / owner.weapon.projSpeed, straight: 99,
    radius: owner.weapon.impactRadius ?? 3.385, damage: owner.weapon.directDamage, size: 0.26,
    trail: -1.5, trailEvery: 2.2, trailRadius: 0.45, grav: 0, drag: 0, seed: 0,
    vis: 0.2, tail0: 0.5, tailK: 0.9, wob: 0.085, wobF: 17, nose: 0.15, sats: 4 });
  p.pos.copy(from); p.prev.copy(from); p.start.copy(from);
  p.vel.copy(aim).normalize().multiplyScalar(owner.weapon.projSpeed);
  f.G.projectiles._push(p);
  p.straight = 999; p.grav = 0; p.drag = 0; p.fidelityMove = null; p.life = 6;
  return p;
}

function runPinningBeforeContact(f, p, dome, hp, limit = 6000) {
  dome.ignited = false;   // switch off the TimeDamage burn; the canopy shell stays real
  for (let i = 0; i < limit; i++) {
    if (!f.G.projectiles.list.includes(p)) return true;
    dome.hp = hp;
    f.G.projectiles.update(1 / 240);
  }
  return false;
}

// A segment that starts OUTSIDE the canopy shell (a segment that starts inside
// reports no entry, by design) and reaches across the dome centre.
function approach(dome, back = 2, y = 1.2) {
  return { start: new (dome.pos.constructor)(dome.pos.x, y, dome.pos.z - dome.radius - back),
    end: new (dome.pos.constructor)(dome.pos.x, y, dome.pos.z + 2) };
}

// Builds a plain blast projectile record (no push) for the candidate/adjudication
// tests, so the query is exercised directly against the real dome.
function blastRound(f, enemy, from, weapon) {
  return { pos: from.clone(), prev: from.clone(), start: from.clone(),
    vel: new f.THREE.Vector3(0, 0, 1), age: 0, straight: 999, drag: 0, grav: 0,
    size: 0.26, damage: weapon.directDamage, team: enemy.team, life: 6,
    type: 'blast', owner: enemy, radius: 3.385, s3Weapon: weapon };
}

test('#1161 full adapter: a stock Blaster direct round spends 125 x 1.9 x 100 x 0.64 on the canopy', async () => {
  const { f } = await composed();
  const { dome } = await withDome(f, DOME_HP);
  assert.equal(f.profile.weapons.blaster.directDamage, BLASTER_DIRECT);

  const enemy = f.make('blaster');
  enemy.pos.set(dome.pos.x, 0, dome.pos.z - 40); enemy.yaw = 0; enemy.aimYaw = 0;
  enemy.team = 1;
  const start = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - 40);
  const p = spawnBlaster(f, enemy, start, new f.THREE.Vector3(0, 0, 1));
  assert.equal(p.s3Weapon?.kind, 'blaster', 'the adapted round carries the stock Blaster identity');
  assert.ok(p.fidelityMove === null || Number.isFinite(p.fidelityMove.freeGravity));
  assert.ok(runPinningBeforeContact(f, p, dome, DOME_HP), 'the round must be consumed by the dome');

  const expected = BLASTER_DIRECT * BLASTER_OBJECT_MULTIPLIER * RAW_PER_DAMAGE_UNIT * CANOPY_RATIO;
  const spent = DOME_HP - dome.hp;
  assert.equal(spent, expected,
    `a stock Blaster direct contact must spend 125 x 1.9 x 100 x 0.64 = ${expected}; spent ${spent}`);
});

test('#1161 source-side decomposition: source damage, object rate and target scale are separate factors', async () => {
  const { f } = await composed();
  const { dome } = await withDome(f, DOME_HP);
  const enemy = f.make('blaster');
  enemy.pos.set(dome.pos.x, 0, dome.pos.z - 40); enemy.yaw = 0; enemy.aimYaw = 0; enemy.team = 1;
  const { start, end } = approach(dome);
  const p = blastRound(f, enemy, start, enemy.weapon);

  const candidate = kitBarrierCandidate(p, start, end);
  assert.ok(candidate && candidate.target === 'canopy', 'the segment reaches the canopy');
  // source damage x source object rate, both applied before the raw-unit mapping
  const source = BLASTER_DIRECT * BLASTER_OBJECT_MULTIPLIER;
  assert.equal(source, 237.5, 'the pre-target source amount is 237.5');
  assert.equal(candidate.damage, source * RAW_PER_DAMAGE_UNIT * CANOPY_RATIO,
    'candidate.damage = source(237.5) x rawUnit(100) x canopyRatio(0.64)');
  // and the target-side scale is applied exactly once
  assert.notEqual(candidate.damage, source * RAW_PER_DAMAGE_UNIT,
    'the canopy ratio is a distinct target-side factor, not folded into the source rate');
});

test('#1161 controls: a shooter round and a non-stock blast family stay at 1.00x', async () => {
  const { f } = await composed();
  const { dome } = await withDome(f, DOME_HP);
  const { start, end } = approach(dome);

  // an ordinary shooter round: 36 damage, no source object multiplier
  const shooter = f.make('shooter');
  shooter.pos.set(dome.pos.x, 0, dome.pos.z - 40); shooter.team = 1;
  const shot = { ...blastRound(f, shooter, start, shooter.weapon), type: 'shot', damage: 36, size: 0.15 };
  const shotCandidate = kitBarrierCandidate(shot, start, end);
  assert.ok(shotCandidate && shotCandidate.target === 'canopy');
  assert.equal(shotCandidate.damage, 36 * RAW_PER_DAMAGE_UNIT * CANOPY_RATIO,
    'a shooter round must stay 1.00x (never amplified)');

  // a non-stock 'blast' family (e.g. a trizooka descriptor with kind 'trizooka'):
  // must NOT receive the Hot Blaster multiplier just because type === 'blast'
  const other = f.make('blaster');
  other.pos.set(dome.pos.x, 0, dome.pos.z - 40); other.team = 1;
  const otherWeapon = { ...other.weapon, kind: 'trizooka', directDamage: 125 };
  const otherRound = { ...blastRound(f, other, start, otherWeapon), damage: 125 };
  const otherCandidate = kitBarrierCandidate(otherRound, start, end);
  assert.ok(otherCandidate && otherCandidate.target === 'canopy');
  assert.equal(otherCandidate.damage, 125 * RAW_PER_DAMAGE_UNIT * CANOPY_RATIO,
    'a non-stock blast family is not amplified by the Hot Blaster rate');
});

test('#1161 the 1.9x is applied once: local spend, remote proposal and host adjudication agree', async () => {
  const { f } = await composed();
  const { dome: local } = await withDome(f, DOME_HP);
  const expected = BLASTER_DIRECT * BLASTER_OBJECT_MULTIPLIER * RAW_PER_DAMAGE_UNIT * CANOPY_RATIO;

  // ---- local authoritative contact: spent exactly once, idempotent
  const enemy = f.make('blaster');
  enemy.pos.set(local.pos.x, 0, local.pos.z - 40); enemy.team = 1; enemy.nid = 22;
  const { start, end } = approach(local);
  const hpBefore = local.hp;
  const settled = kitBarrierCandidate(blastRound(f, enemy, start, enemy.weapon), start, end);
  const applied = settled.onHit();
  assert.equal(applied, expected, 'the authoritative local contact spends the 1.9x amount once');
  assert.equal(local.hp, hpBefore - expected);
  assert.equal(settled.onHit(), 0, 'a second onHit cannot double-spend');

  // ---- remote presentation contact: the proposal carries the SAME canonical amount
  const owner = local.owner;
  const remote = { ...local, remote: true };
  bigBubblerDomes().length = 0;                // force the remote dome to win the query
  bigBubblerRemoteDomes().push(remote);
  const remoteShooter = { ...enemy, nid: 22 };
  const remoteCand = kitBarrierCandidate(blastRound(f, remoteShooter, start, enemy.weapon), start, end);
  assert.ok(remoteCand && remoteCand.remote, 'a local round against a remote dome only proposes');
  assert.equal(remoteCand.damage, expected, 'the proposal amount already carries 1.9x once and 0.64 once');
  const remoteHp = remote.hp;
  assert.equal(remoteCand.onHit(), 0, 'the proposing client spends nothing');
  assert.equal(remoteCand.proposal.amount, expected, 'the flat proposal carries the canonical amount');
  assert.equal(remote.hp, remoteHp, 'the remote dome is untouched on the proposing client');

  // ---- host adjudication: applies the SAME amount once, never re-multiplies
  bigBubblerRemoteDomes().length = 0;
  bigBubblerDomes().push(local);
  local.hp = DOME_HP; local.fieldHp = local.fieldHpMax; local.damageProgress = 0;
  const roster = new Map([[`n${remoteShooter.nid}`, 1]]);
  const result = adjudicateBigBubblerDamage(remoteCand.proposal, { host: true, roster });
  assert.equal(result.ok, true, `adjudication must accept the proposal: ${JSON.stringify(result)}`);
  assert.equal(result.reason, 'applied');
  assert.equal(result.applied, expected, 'the host applies the source-scaled amount once');
  assert.equal(local.hp, DOME_HP - expected, 'and the authoritative dome moved by exactly that amount');
  const again = adjudicateBigBubblerDamage(remoteCand.proposal, { host: true, roster });
  assert.equal(again.ok, true);
  assert.equal(again.reason, 'duplicate', 'a retransmit is a duplicate');
  assert.equal(local.hp, DOME_HP - expected, 'and never re-applies');

  // sanity: the owner identity used by adjudication is the real one
  assert.equal(remoteCand.proposal.domeOwner, bigBubblerOwnerId(owner));
});


test('#1161 complete production composition and installed runtime retain one direct contact multiplier', async () => {
  const f = await productionFixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { bigBubblerDomes as productionDomes } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';" });
  f.G.scene = new f.THREE.Scene();
  f.G.projectiles = new f.Projectiles(f.G.scene);
  level(f);
  const owner = f.make('roller');
  owner.pos.set(0, 0, 0); owner.yaw = owner.aimYaw = 0;
  owner.weapon = { ...owner.weapon, special: 'bubbler', specialCost: 180 };
  owner.special = owner.specialCost();
  owner._startSpecial();
  const dome = f.productionDomes()[0];
  assert.ok(dome, 'the installed production runtime deploys the actual dome');
  for (let i = 0; i < 240; i++) f.G.projectiles.update(1 / 60);
  dome.hp = DOME_HP;
  f.G.actors = [];
  const enemy = f.make('blaster'); enemy.team = 1;
  enemy.pos.set(dome.pos.x, 0, dome.pos.z - 40); enemy.yaw = enemy.aimYaw = 0;
  const round = spawnBlaster(f, enemy, new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - 40), new f.THREE.Vector3(0, 0, 1));
  assert.equal(round.s3Weapon.kind, 'blaster');
  assert.ok(runPinningBeforeContact(f, round, dome, DOME_HP));
  assert.equal(DOME_HP - dome.hp, BLASTER_DIRECT * BLASTER_OBJECT_MULTIPLIER * RAW_PER_DAMAGE_UNIT * CANOPY_RATIO);
});
