// #883 — Splat Dualies scalar shot-deviation envelope (Ver.11.3.0
// WeaponManeuverNormal: Stand_DegSwerve 2 / Jump_DegSwerve 7.5 /
// LapOver_DegSwerve 0, no separate pitch-spread field).
//
// The composed build adapter routes native `_fireRound` (Dualies + Splatling)
// through `spreadWeaponRound`. The native generic sampler `_spread` keeps an
// unsourced fixed 0.55 pitch-axis compression, so a Dualies sample at vertical
// azimuth only reaches atan(0.55*tan(envelope)). This test drives the REAL
// composed `fireDualies` path (adapted native source, real Projectiles) with
// deterministic spread draws and asserts the sampled angular deviation equals
// the sourced scalar envelope at horizontal and vertical azimuths.
//
// Controls kept independent: Heavy Splatling's separately sourced
// PitchDegSwerve branch, the post-roll LapOver 0° turret, native `_spread`
// byte state for the separate shooter/blaster roots (#607/#677), adapter
// routing, projectile speed and shot determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { spreadWeaponRound } from '../runtime/weapon-edgecases.mjs';
import { fixture as networkFixture } from '../../network-replication/tests/robustness-fixture.mjs';

const R2D = 180 / Math.PI;
const close = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) < e, `${a} != ${b} (within ${e})`);

async function setup() {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.boss = null; G.netm = null; G.actors = [];
  G.level = { blocks: [], faces: [], queryBlocks(_a, _b, _c, _d, out) { out.length = 0; return out; } };
  G.physics = new f.Physics(G.level);
  const ps = G.projectiles = new f.Projectiles(G.scene);
  const a = f.make('dualies');
  a.aimPoint.set(0, 1.05, 100); a.aimDir.set(0, 0, 1);
  return { f, G, ps, a };
}

// The composed Dualies path consumes no RNG before the two spread draws (no
// fidelity speed-jitter wrapper wraps `fireDualies`); the projectile seed draw
// follows the spread pair and falls back to .5. `thetaTurns` is the raw azimuth
// draw: the sampler converts it with t = random * 2π (0.25 = vertical axis).
function draws(f, radius, thetaTurns, seed = .5) {
  let n = 0;
  const seq = [radius, thetaTurns, seed];
  f.setRandom(() => seq[n++] ?? .5);
  return () => n;
}

// Post-ballistic base direction for one hand, measured with a 0° spread shot
// so the sampled deviations are decomposed in the exact base frame the helper
// uses (right = (-z, 0, x), up = cross(dir, right)).
function baseFrame(ps, a, hand) {
  const before = ps.list.length;
  ps.fireDualies(a, a.weapon, 0, hand);
  const v = ps.list[before].vel.clone().normalize();
  const right = v.clone().set(-v.z, 0, v.x);
  if (right.lengthSq() < 1e-4) right.set(1, 0, 0).addScaledVector(v, -v.x);
  right.normalize();
  const up = v.clone().cross(right);
  return { base: v, right, up };
}

function fireAndDecompose(f, ps, a, hand, spread, radius, thetaTurns) {
  const frame = baseFrame(ps, a, hand);
  const randomCalls = draws(f, radius, thetaTurns);
  const before = ps.list.length;
  ps.fireDualies(a, a.weapon, spread, hand);
  const shot = ps.list[before];
  const v = shot.vel.clone().normalize();
  return {
    h: Math.atan2(v.dot(frame.right), v.dot(frame.base)) * R2D,
    v: Math.atan2(v.dot(frame.up), v.dot(frame.base)) * R2D,
    angle: Math.atan2(frame.base.clone().cross(v).length(), frame.base.dot(v)) * R2D,
    baseY: frame.base.y,
    speed: shot.vel.length(),
    damage: shot.damage,
    origin: shot.start.toArray(),
    randomCalls: randomCalls(),
  };
}

function nativeSpread(f, ps, base, spread, radius, thetaTurns) {
  const randomCalls = draws(f, radius, thetaTurns);
  const out = ps._spread(base.clone(), spread).normalize();
  return {
    angle: Math.atan2(base.clone().cross(out).length(), base.dot(out)) * R2D,
    randomCalls: randomCalls(),
  };
}


test('#883 grounded Dualies reach the sourced 2.0° scalar envelope at vertical and horizontal azimuths', async () => {
  const { f, ps, a } = await setup();
  a.grounded = true;
  // Vertical azimuth (draw 0.25 -> t = pi/2, sin t = 1): the full scalar
  // angle, no 0.55 pitch-axis compression.
  const vert = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0.25);
  close(vert.v, 2, 1e-6);
  close(vert.h, 0, 1e-6);
  // Horizontal azimuth (cos t = 1): identical scalar angle.
  const horiz = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0);
  close(horiz.h, 2, 1e-6);
  close(horiz.v, 0, 1e-6);
  // Equal scalar radius at 45°: equal angular deviation on both axes.
  const quarter = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0.125);
  const expected = Math.atan(Math.cos(Math.PI / 4) * Math.tan(2 * Math.PI / 180)) * R2D;
  close(quarter.h, expected, 1e-6);
  close(quarter.v, expected, 1e-6);
  // Projectile speed and damage are untouched by the direction sampler.
  close(quarter.speed, a.weapon.projSpeed, 1e-6);
  assert.equal(quarter.damage, a.weapon.damage);
  assert.equal(quarter.randomCalls, 3, 'two spread draws plus the existing projectile seed draw');
});

test('#883 airborne Dualies reach the sourced 7.5° Jump_DegSwerve at vertical azimuth', async () => {
  const { f, ps, a } = await setup();
  a.grounded = false;
  const vert = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0.25);
  close(vert.v, 7.5, 1e-6);
  close(vert.angle, 7.5, 1e-6);
  assert.equal(vert.randomCalls, 3, 'two spread draws plus the existing projectile seed draw');
  const horiz = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0);
  close(horiz.h, 7.5, 1e-6);
});

test('#883 before/after samples retain the exact native random-call count and radial draw', async () => {
  const { f, ps, a } = await setup();
  a.grounded = true;
  const base = baseFrame(ps, a, 0).base;
  const native = nativeSpread(f, ps, base, 2, 1 - 1e-12, 0.25);
  close(native.angle, Math.atan(0.55 * Math.tan(2 * Math.PI / 180)) * R2D, 1e-6);
  assert.equal(native.randomCalls, 2, 'native spread consumes exactly the radial and azimuth draws');
  const corrected = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0.25);
  close(corrected.angle, 2, 1e-6);
  assert.equal(corrected.randomCalls, native.randomCalls + 1, 'the same two spread draws remain, plus unchanged projectile seed');

  a.grounded = false;
  const airBase = baseFrame(ps, a, 0).base;
  const airNative = nativeSpread(f, ps, airBase, 7.5, 1 - 1e-12, 0.25);
  close(airNative.angle, Math.atan(0.55 * Math.tan(7.5 * Math.PI / 180)) * R2D, 1e-6);
  assert.equal(airNative.randomCalls, 2);
  const airCorrected = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0.25);
  close(airCorrected.angle, 7.5, 1e-6);
  assert.equal(airCorrected.randomCalls, airNative.randomCalls + 1);

  const nativeLock = nativeSpread(f, ps, airBase, 0, 1 - 1e-12, 0.25);
  assert.equal(nativeLock.randomCalls, 0, 'native lock consumes no spread draws');
  const correctedLock = fireAndDecompose(f, ps, a, 0, 0, 1 - 1e-12, 0.25);
  close(correctedLock.angle, 0, 1e-12);
  assert.equal(correctedLock.randomCalls, nativeLock.randomCalls + 1, 'lock keeps zero spread draws and the existing seed draw');
});

test('#883 near-vertical upward and downward aims retain the scalar angular envelope', async () => {
  const { f, ps, a } = await setup();
  a.grounded = true;
  a.aimPoint.set(.1745329, 101.05, .3);
  a.aimDir.set(.00174533, .99999848, 0).normalize();
  const up = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0);
  assert.ok(up.baseY > .9999, `upward aim should be near vertical, base y=${up.baseY}`);
  close(up.h, 2, 1e-6);
  close(up.angle, 2, 1e-6);

  a.aimPoint.set(-.1745329, -98.95, .3);
  a.aimDir.set(-.00174533, -.99999848, 0).normalize();
  const down = fireAndDecompose(f, ps, a, 0, undefined, 1 - 1e-12, 0);
  assert.ok(down.baseY < -.9999, `downward aim should be near vertical, base y=${down.baseY}`);
  close(down.h, 2, 1e-6);
  close(down.angle, 2, 1e-6);
});

test('#883 LapOver_DegSwerve 0 keeps legal post-roll turret fire at exactly 0°', async () => {
  const { f, ps, a } = await setup();
  a.grounded = true;
  assert.equal(a.weapon.spreadLock, 0, 'profile spreadLock stays 0');
  const base = baseFrame(ps, a, 0).base;
  const runner = a.weaponRunner;
  runner.lockT = .1;
  runner.s3Turret = true;
  runner.cooldown = 0;
  a.intent.fire = true;
  let randomCalls = 0;
  f.setRandom(() => { randomCalls++; return .5; });
  const before = ps.list.length;
  runner._dualies(0, { fire: true, sub: false }, a.weapon);
  const locked = ps.list[before];
  assert.equal(runner.spread, a.weapon.spreadLock, 'actual post-roll runner selects LapOver_DegSwerve');
  const lockedDir = locked.vel.clone().normalize();
  close(Math.atan2(base.clone().cross(lockedDir).length(), base.dot(lockedDir)) * R2D, 0, 1e-12);
  assert.equal(randomCalls, 1, 'zero spread makes no spread draws; only the projectile seed is sampled');
});

test('#883 Dualies never delegate to the 0.55-compressed native sampler; other families keep their paths', () => {
  let calls = 0;
  const system = { _spread(dir) { calls++; return dir; } };
  const dir = { clone: () => dir, copy: () => dir, set: () => dir, lengthSq: () => 1, normalize: () => dir, addScaledVector: () => dir, cross: () => dir };
  spreadWeaponRound(system, dir, { grounded: true }, { kind: 'dualies', spreadGround: 2 }, 2);
  assert.equal(calls, 0, 'Dualies must sample the scalar cone inside spreadWeaponRound');
  spreadWeaponRound(system, dir, { grounded: true }, { kind: 'splatling', spreadGround: 3.3, spreadPitchGround: 1.6 }, 3.3);
  assert.equal(calls, 0, 'grounded Splatling still uses its own PitchDegSwerve envelope');
  spreadWeaponRound(system, dir, { grounded: false }, { kind: 'splatling', spreadGround: 3.3 }, 7);
  assert.equal(calls, 1, 'airborne Splatling keeps the native fallback path');
});

test('#883 native source, adapter routing and shot determinism stay intact', async () => {
  const native = fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js', import.meta.url), 'utf8');
  // Native is immutable: the unsourced 0.55 term stays for the separate
  // shooter/blaster roots (#607/#677), which this Dualies-only fix must not touch.
  assert.ok(native.includes('Math.sin(t) * Math.tan(r) * 0.55'), 'native _spread unchanged');
  const composed = adaptSource('src/game/weapons.js', native);
  assert.ok(composed.includes('spreadWeaponRound(this, dir, a, w, spreadDeg);'), '_fireRound still routes through spreadWeaponRound');
  // The identical native spread call also lives in `fireShooter` (out of scope,
  // roots #607/#677): composed output must keep exactly that one occurrence.
  const anchor = 'this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));';
  const count = s => s.split(anchor).length - 1;
  assert.equal(count(native), 2, 'native keeps both raw spread calls');
  assert.equal(count(composed), 1, 'only the _fireRound occurrence is rerouted');
  // Same draw sequences produce identical directions regardless of call cadence.
  const run = async () => {
    const { f, ps, a } = await setup();
    a.grounded = true;
    const out = [];
    for (let i = 0; i < 8; i++) {
      const shot = fireAndDecompose(f, ps, a, i % 2, undefined, (i + 1) / 10, i / 8);
      out.push([shot.h, shot.v]);
    }
    return out;
  };
  assert.deepEqual(await run(), await run());
});


test('#883 both hands use the same scalar rule from their own muzzle origins', async () => {
  const { f, ps, a } = await setup();
  a.grounded = true;
  a.character.getMuzzle = out => out.copy(a.pos).add(new f.THREE.Vector3(.2, 1.05, .3));
  const shots = [];
  for (const hand of [0, 1]) {
    const shot = fireAndDecompose(f, ps, a, hand, undefined, 1 - 1e-12, 0.25);
    close(shot.v, 2, 1e-6);
    close(shot.h, 0, 1e-6);
    shots.push(shot);
  }
  assert.notDeepEqual(shots[0].origin, shots[1].origin, 'alternating hands keep their separate muzzle origins');
});

test('#883 owner round event and remote ghost preserve the sampled direction', async () => {
  const f = await networkFixture();
  assert.equal(f.network, true, 'exercise the production network adapter composition');
  const V = f.THREE.Vector3;
  const nm = f.makeNetMatch(f.makeSession('me'));
  const owner = f.makeActor({ nid: 7, owner: 'me', remote: false, roller: false });
  owner.weapon = f.WEAPONS.dualies;
  owner.character.getMuzzle = out => out.copy(owner.pos).add(new V(.2, 1.05, .3));
  owner.aimPoint.set(.2, 3.05, 100);
  owner.aimDir.set(0, 0, 1);
  owner.grounded = true;
  f.bind(nm, [owner]);
  nm.out.length = 0;

  f.projectiles.fireDualies(owner, owner.weapon, undefined, 1);
  const local = f.projectiles.list.at(-1);
  const roundEvent = nm.out.find(event => event[1] === 'p');
  assert.ok(roundEvent, 'actual owner Projectiles._push records a projectile event');
  assert.equal(roundEvent[2], owner.nid);
  assert.equal(roundEvent[4], 'dualies');
  assert.deepEqual(roundEvent.slice(8, 11), local.vel.toArray(), 'current owner event preserves the sampled velocity');

  const receiver = f.makeNetMatch(f.makeSession('p2'));
  const remote = f.makeActor({ nid: 7, owner: 'me', remote: true, roller: false });
  remote.weapon = f.WEAPONS.dualies;
  f.bind(receiver, [remote]);
  receiver._play('me', roundEvent);
  const ghost = f.projectiles.list.at(-1);
  assert.ok(ghost.ghost, 'the current network event dispatcher creates the remote projectile ghost');
  assert.deepEqual(ghost.vel.toArray(), local.vel.toArray(), 'the actual remote ghost replays the owner round without resampling');
  assert.equal(ghost.damage, 0, 'remote rounds remain cosmetic; owner damage authority is unchanged');
  assert.equal(local.damage, owner.weapon.damage);
  close(local.vel.length(), owner.weapon.projSpeed, 1e-8);
});
