import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as sourceFixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const STEP = 1 / 60;
const adaptBuildSource = (rel, code) => adaptRange(rel,
  adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

async function nativeFixture({ grounded = true, wire = false } = {}) {
  const adaptedNative = new Set(), adaptedRuntime = new Set();
  const adaptNative = (rel, code) => {
    adaptedNative.add(rel);
    let out = adaptBuildSource(rel, code);
    if (rel === 'src/game/character-geo.js' || rel === 'src/game/character-weapons.js') {
      out = out.replaceAll("from 'three/addons/utils/BufferGeometryUtils.js'", "from '../../vendor/three/jsm/utils/BufferGeometryUtils.js'");
    }
    return out;
  };
  const adaptRuntime = (rel, code) => { adaptedRuntime.add(rel); return adaptBuildSource(rel, code); };
  const f = await sourceFixture({
    adaptNative,
    adaptRuntime,
    extraExports: `
      export { Character } from './inkwave-public/src/game/character.js';
      export { NetMatch } from './inkwave-public/src/net/netmatch.js';
      export { installSubSpecialFidelity } from './patches/splatoon3/runtime/sub-special-fidelity.mjs';
      export { installWeaponsFidelity, installShotGuide, advanceFidelityProjectile } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
    `,
  });
  f.installSubSpecialFidelity(f, f.profile);
  f.installWeaponsFidelity(f, f.profile);
  f.installShotGuide(f, f.profile);
  assert.equal(f.profile.referenceVersion, '11.3.0');
  assert.ok(adaptedNative.has('src/game/weapons.js'));
  assert.ok(adaptedRuntime.has('patches/splatoon3/runtime/weapons.mjs'));
  assert.ok(adaptedRuntime.has('patches/splatoon3/runtime/weapons-fidelity.mjs'));

  const V = f.THREE.Vector3;
  const level = {
    blocks: [], faces: [], groundHeight: () => 0,
    queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 0; return out; },
  };
  f.G.level = level;
  f.G.physics = new f.Physics(level);
  f.G.camera = { position: new V(1000, 1000, 1000) };
  f.G.audio = { play() {}, loop() { return { set() {}, stop() {} }; } };
  f.G.fx = { muzzle() {} };
  f.G.paint = { sample: () => 1, splat: () => 0 };
  f.G.time = 0;
  f.G.scene = new f.THREE.Scene();
  const projectiles = f.G.projectiles = new f.Projectiles(f.G.scene);
  const actor = new f.Actor({ team: 0, name: 'issue-575-native', weapon: 'dualies', CharacterClass: f.Character });
  assert.ok(actor.character instanceof f.Character, 'actual native Character supplies both hand muzzle transforms');
  actor.pos.set(0, 0, 0); actor.yaw = 0; actor.aimYaw = 0; actor.aimPitch = 0;
  actor.aimDir.set(0, 0, 1); actor.form = 'kid'; actor.grounded = grounded; actor.ink = 100;
  actor.intent.fire = true; actor.intent.move.set(0, 0, 0);
  actor.character.root.position.copy(actor.pos); actor.character.root.rotation.y = 0;
  actor.character.form = 'kid'; actor.character.setWeapon('dualies'); actor.character.wAim = 1;
  actor.character.root.updateMatrixWorld(true);
  f.G.actors = [actor];
  actor.weaponRunner.reset();

  const muzzles = [0, 1].map(hand => {
    const out = new V(); projectiles._muzzleHand(actor, hand, out); return out;
  });
  const midpoint = muzzles[0].clone().add(muzzles[1]).multiplyScalar(.5);
  const targetDistance = 10.5; // Fixture reach used by #608; not a Splatoon 3 world-distance claim.
  actor.aimPoint.copy(midpoint).addScaledVector(actor.aimDir, targetDistance);

  let netMatch = null, unsubscribe = null, remoteActor = null;
  if (wire) {
    actor.nid = 1;
    netMatch = new f.NetMatch({ myId: 'owner', isHost: false }, {});
    f.G.netm = netMatch;
    unsubscribe = f.on('weapon:fire', event => netMatch._onLocalEvent('weapon:fire', event));
    remoteActor = new f.Actor({ team: 0, name: 'issue-575-remote', weapon: 'dualies', CharacterClass: f.Character });
    remoteActor.nid = 1; remoteActor.remote = true; remoteActor.owner = 'owner';
    remoteActor.pos.copy(actor.pos); remoteActor.form = 'kid';
    const receiverCamera = new V(0, 0, 2);
    f.G.camera.position.copy(receiverCamera);
    const receiver = new f.NetMatch({ myId: 'receiver', isHost: false }, {});
    receiver.byNid.set(remoteActor.nid, remoteActor);
    return { f, V, actor, projectiles, muzzles, midpoint, netMatch, receiver, remoteActor, unsubscribe, adaptedNative, adaptedRuntime };
  }
  return { f, V, actor, projectiles, muzzles, midpoint, adaptedNative, adaptedRuntime };
}

function planeBasis(fixture) {
  const { V, actor, midpoint } = fixture;
  const normal = actor.aimPoint.clone().sub(midpoint).normalize();
  const right = new V(normal.z, 0, -normal.x).normalize();
  return { normal, right };
}

function targetPlaneHit(f, actor, round, basis) {
  const target = actor.aimPoint;
  const probe = {
    ...round,
    pos: round.start.clone(), prev: round.start.clone(), vel: round.vel.clone(),
    age: 0, fidelityPhase: 0, fidelityPrevAge: 0,
  };
  let before = probe.pos.clone();
  let beforeDistance = before.clone().sub(target).dot(basis.normal);
  for (let frame = 1; frame <= 120; frame++) {
    f.advanceFidelityProjectile(probe, STEP);
    const after = probe.pos.clone();
    const afterDistance = after.clone().sub(target).dot(basis.normal);
    if (beforeDistance <= 0 && afterDistance >= 0 && afterDistance !== beforeDistance) {
      const fraction = -beforeDistance / (afterDistance - beforeDistance);
      return before.lerp(after, fraction);
    }
    before = after;
    beforeDistance = afterDistance;
  }
  throw new Error('actual native Dualies projectile did not reach the fixture target plane');
}

function advanceToGuideFrame(f, round, frames) {
  const probe = {
    ...round,
    pos: round.start.clone(), prev: round.start.clone(), vel: round.vel.clone(),
    age: 0, fidelityPhase: 0, fidelityPrevAge: 0,
  };
  for (let frame = 0; frame < frames; frame++) f.advanceFidelityProjectile(probe, STEP);
  return probe.pos;
}

function actualShots(fixture, { frames = 90, startTick = 0 } = {}) {
  const { f, projectiles, actor } = fixture, runner = actor.weaponRunner;
  const rows = [];
  let tick = startTick, draws = 0;
  f.setRandom(() => { draws++; return 0; });
  const fire = projectiles.fireDualies;
  projectiles.fireDualies = function (...args) {
    const beforeDraws = draws;
    const result = fire.apply(this, args);
    rows.push({ hand: args[3], spread: args[2], draws: draws - beforeDraws, tick, round: this.list.at(-1), turret: !!runner.s3Turret });
    return result;
  };
  try {
    for (tick = startTick; tick < startTick + frames && rows.length < 2; tick++) {
      runner.update(STEP, { fire: true, firePressed: tick === startTick, sub: false, subReleased: false });
      f.G.time += STEP;
    }
  } finally {
    projectiles.fireDualies = fire;
    f.restoreRandom();
  }
  return rows;
}

test('native grounded and airborne Dualies keep two independent aim centers and trajectory-matched guides', async () => {
  for (const grounded of [true, false]) {
    const fixture = await nativeFixture({ grounded, wire: grounded });
    const { f, actor, projectiles, V, muzzles } = fixture;
    const randomCalls = { count: 0 };
    f.setRandom(() => { randomCalls.count++; return 0; });
    const guideBefore = randomCalls.count;
    const guides = projectiles.s3DualiesGuides(actor, actor.weapon).map(point => point.clone());
    assert.equal(randomCalls.count, guideBefore, 'installed guide predicts without consuming native RNG');
    assert.ok(distance(guides[0], guides[1]) > 1e-6,
      `${grounded ? 'grounded' : 'airborne'} normal-fire guide centers are distinct`);

    const runner = actor.weaponRunner;
    runner.reset(); runner.cooldown = 0; runner.hand = 0; runner.s3Turret = false;
    const shots = actualShots(fixture);
    assert.deepEqual(shots.map(row => row.hand), [1, 0], 'NativeRunner preserves alternating left/right hand order');
    assert.ok(shots.every(row => !row.turret), 'normal-fire launches remain outside the post-roll turret owner');
    assert.equal(shots[1].tick - shots[0].tick, Math.round(actor.weapon.fireInterval / STEP),
      'normal-fire cadence remains the native weapon interval');
    assert.ok(shots.every(row => row.draws === (row.spread > 0 ? 3 : 1)),
      'each real shot consumes only the existing spread sample draws plus one projectile seed');

    const basis = planeBasis(fixture);
    const hits = shots.map(row => targetPlaneHit(f, actor, row.round, basis));
    const lateral = hits.map(point => point.dot(basis.right));
    assert.ok(Math.abs(lateral[0] - lateral[1]) > 1e-6,
      `${grounded ? 'grounded' : 'airborne'} normal-fire target-plane hits retain hand separation`);
    assert.ok(Math.abs((lateral[0] + lateral[1]) * .5 - actor.aimPoint.dot(basis.right)) < 1e-6,
      'left/right target-plane offsets remain symmetric around the camera aim center');
    for (const row of shots) {
      assert.ok(advanceToGuideFrame(f, row.round, actor.weapon.shotGuideFrame).distanceTo(guides[row.hand]) < 1e-9,
        `hand ${row.hand} installed guide equals its actual fidelity-integrated flight`);
    }

    if (grounded) {
      const { netMatch, receiver, remoteActor, unsubscribe } = fixture;
      const spawnRecords = netMatch.out.filter(record => record[1] === 'p');
      const fireRecords = netMatch.out.filter(record => record[1] === 'ev' && record[2] === 'weapon:fire');
      assert.equal(spawnRecords.length, 2, 'one owner projectile wire record per native launch');
      assert.equal(fireRecords.length, 2, 'one existing weapon:fire event per native launch');
      assert.ok(spawnRecords.every(record => record.length === 36),
        `the current projectile birth wire record keeps its field count: ${spawnRecords.map(record => record.length).join(',')}`);
      assert.deepEqual(Array.from(spawnRecords, record => record[32]), [1, 2], 'native projectile wire IDs remain sequential');
      assert.deepEqual(shots.map(row => row.round._netId), [1, 2], 'owner births retain the IDs serialized for playback');
      assert.deepEqual(Array.from(netMatch.out.filter(record => record[1] === 'p' || record[1] === 'ev'), record => record[1]),
        ['p', 'ev', 'p', 'ev'], 'spawn/event ordering stays paired per alternating hand');
      for (let i = 0; i < fireRecords.length; i++) {
        const payload = fireRecords[i][3];
        assert.deepEqual(Object.keys(payload).sort(), ['actor', 'dir', 'hand', 'muzzle', 'weapon']);
        assert.equal(payload.actor.n, actor.nid);
        assert.equal(payload.weapon, 'dualies');
        assert.equal(payload.hand, shots[i].hand);
      }
      const fxRows = [];
      f.G.fx.muzzle = (muzzle, direction) => fxRows.push({ muzzle: muzzle.toArray(), direction: direction.toArray() });
      const audioRows = [];
      f.G.audio.play = (name, options) => audioRows.push({ name, options });
      const beforePlayback = projectiles.list.length;
      assert.equal(receiver.byNid.get(spawnRecords[0][2]), remoteActor, 'receiver resolves the owner ID to the remote actor');
      for (const record of spawnRecords) receiver._play('owner', record);
      for (const record of fireRecords) receiver._play('owner', record);
      assert.equal(projectiles.list.length, beforePlayback + 2, 'wire playback adds only the two remote ghost rounds');
      assert.equal(audioRows.length, 2, 'weapon:fire playback remains presentation-only');
      assert.equal(fxRows.length, 2, 'each played weapon:fire uses its recorded hand ray');
      for (let i = 0; i < spawnRecords.length; i++) {
        const ghost = projectiles.list[beforePlayback + i], spawn = spawnRecords[i], payload = fireRecords[i][3];
        assert.equal(ghost.owner, remoteActor); assert.equal(ghost.ghost, true); assert.equal(ghost.damage, 0);
        assert.deepEqual(ghost.start.toArray(), spawn.slice(5, 8));
        assert.deepEqual(ghost.vel.toArray(), spawn.slice(8, 11));
        assert.deepEqual(fxRows[i].muzzle, payload.muzzle);
        assert.deepEqual(fxRows[i].direction, payload.dir);
      }
      unsubscribe();
    }
  }
});

test('NativeRunner roll transition alone merges turret targets, then release restores normal hand guides', async () => {
  const fixture = await nativeFixture();
  const { f, actor, projectiles, V } = fixture;
  const runner = actor.weaponRunner;
  const separate = projectiles.s3DualiesGuides(actor, actor.weapon).map(point => point.clone());
  assert.ok(distance(separate[0], separate[1]) > 1e-6, 'normal state starts with independent guides');

  assert.equal(runner.tryDodge(new V(1, 0, 0)), true, 'native runner accepts a real grounded Dualies roll');
  for (let frame = 0; frame < 120 && !runner.s3Turret; frame++) {
    runner.update(STEP, { fire: true, firePressed: frame === 0, sub: false, subReleased: false });
    f.G.time += STEP;
  }
  assert.equal(runner.dodge, null, 'the native roll completed');
  assert.ok(runner.lockT > 0, 'the native post-roll lock owns the state hand-off');
  assert.equal(runner.s3Turret, true, 'post-roll state came from the composed NativeRunner transition');

  const turretGuides = projectiles.s3DualiesGuides(actor, actor.weapon).map(point => point.clone());
  assert.ok(distance(turretGuides[0], turretGuides[1]) < 1e-12,
    'only the actual post-roll turret state merges both guide centers');
  const shots = actualShots(fixture, { frames: 120, startTick: 120 });
  assert.equal(shots.length, 2, 'two actual alternating post-roll rounds leave the NativeRunner');
  assert.ok(shots.every(row => row.turret), 'the real fire calls remain owned by post-roll turret state');
  const basis = planeBasis(fixture);
  const hits = shots.map(row => targetPlaneHit(f, actor, row.round, basis));
  assert.ok(distance(hits[0], hits[1]) < 1e-8, 'post-roll launch paths share one target plane center');
  const actualGuideRows = shots.map(row => advanceToGuideFrame(f, row.round, actor.weapon.shotGuideFrame));
  const mergedFlightCenter = actualGuideRows[0].clone().add(actualGuideRows[1]).multiplyScalar(.5);
  assert.ok(mergedFlightCenter.distanceTo(turretGuides[0]) < 1e-9,
    'merged turret guide is the center of both real native trajectories');

  runner.update(STEP, { fire: false, firePressed: false, sub: false, subReleased: false });
  assert.equal(runner.s3Turret, false, 'release hands the runner back to its normal firing state');
  const handedBack = projectiles.s3DualiesGuides(actor, actor.weapon);
  assert.ok(distance(handedBack[0], handedBack[1]) > 1e-6, 'normal guides separate immediately after state hand-off');
});
