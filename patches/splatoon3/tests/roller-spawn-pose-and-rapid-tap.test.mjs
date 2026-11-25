import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnOwnerFixture, prepareSpawn, launchSpawn, assertReady } from './respawn-spawn-owner-fixture.mjs';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';

const ALL_ROLLERS = ['roller', 's3-roller-compact', 's3-roller-heavy', 's3-roller-hunter', 's3-roller-wide'];

let spawnCached;
const spawnFixture = () => spawnCached ??= spawnOwnerFixture();

let actorCached;
const actorFixture = () => actorCached ??= sourceLoadedActorFixture({ random: () => 0.5 });

function createGroundedActor(f, weaponId) {
  f.reset();
  const a = new f.Actor({ team: 0, weapon: weaponId, isLocal: true, CharacterClass: f.Character });
  f.G.actors = [a];
  a.pos.set(0, 0, 0);
  a.vel.set(0, 0, 0);
  a.grounded = true;
  a.ground.hit = true;
  a.form = 'kid';
  a.kidT = 10;
  a.ink = 100;
  return a;
}

test('all five Rollers hold the raised shoulder carry pose while standing on the Turf War spawner', async () => {
  const f = await spawnFixture();
  const C = f.CHARACTER_CHANNELS;
  const { READY_ANCHOR, READY_ROTATION } = f.ROLLER_POSE;

  for (const weaponId of ALL_ROLLERS) {
    const a = await prepareSpawn(f);
    a.setWeapon(weaponId);
    const c = a.character;
    for (let i = 0; i < 20; i++) f.tick(a);
    assert.equal(a.s3.squidSpawn?.phase, 'aim', `${weaponId} stays on spawner`);
    assert.equal(a.weaponRunner.rolling, false, `${weaponId} must not be rolling on spawner`);
    assert.equal(c.wRoll, 0, `${weaponId} wRoll stays 0 on spawner`);
    assert.equal(c._s3RollerContactPose, false, `${weaponId} must not enter contact pose on spawner`);
    assert.equal(f.spawnMotionAllowsAction(c, true), false, `${weaponId} keeps spawn action lock on spawner`);

    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(c.P[C.ANC + i] - READY_ANCHOR[i]) < 1e-4, `${weaponId} ANC[${i}] on spawner`);
      assert.ok(Math.abs(c.P[C.ANCR + i] - READY_ROTATION[i]) < 1e-4, `${weaponId} ANCR[${i}] on spawner`);
    }

    // Launch and land still transition cleanly into ready carry.
    launchSpawn(f, a);
    for (let i = 0; i < 120 && a.s3.squidSpawn; i++) f.tick(a);
    assert.equal(a.s3.squidSpawn, undefined, `${weaponId} finishes spawn landing`);
    f.tick(a);
    assertReady(f, c);
  }
});

test('Splat Roller rapid-tapping across cadences never deadlocks or enters accidental rolling', async () => {
  const f = await actorFixture();

  for (const period of [6, 8, 9, 10, 12, 15, 20]) {
    const a = createGroundedActor(f, 'roller');
    let shots = 0, rollStarts = 0, stopLocks = 0;
    const origPush = f.G.projectiles._push;
    let tick = 0, lastShotTick = -999;
    f.G.projectiles._push = function (...args) {
      if (tick !== lastShotTick) { shots++; lastShotTick = tick; }
      return origPush.apply(this, args);
    };
    try {
      for (tick = 0; tick < 240; tick++) {
        a.intent.fire = (tick % period) < 3;
        a.ink = 100;
        const prevRolling = a.weaponRunner.rolling;
        const prevStop = !!a.weaponRunner.s3RollStop;
        f.tick(a, 1 / 60);
        if (!prevRolling && a.weaponRunner.rolling) rollStarts++;
        if (!prevStop && a.weaponRunner.s3RollStop) stopLocks++;
      }
    } finally {
      f.G.projectiles._push = origPush;
      a.character.dispose();
    }
    assert.equal(rollStarts, 0, `period=${period}F must never enter accidental rolling`);
    assert.equal(stopLocks, 0, `period=${period}F must never arm spurious s3RollStop`);
    assert.ok(shots >= 5, `period=${period}F expected >=5 flicks in 4s, got ${shots}`);
  }
});

test('catalog Rollers rapid-tapping never enters accidental rolling and fires full swing cadence', async () => {
  const f = await actorFixture();
  const minExpected = {
    's3-roller-compact': 6,
    's3-roller-heavy': 3,
    's3-roller-hunter': 5,
    's3-roller-wide': 5,
  };

  for (const weaponId of ['s3-roller-compact', 's3-roller-heavy', 's3-roller-hunter', 's3-roller-wide']) {
    for (const period of [6, 8, 10, 15]) {
      const a = createGroundedActor(f, weaponId);
      let shots = 0, rollStarts = 0;
      const origPush = f.G.projectiles._push;
      let tick = 0, lastShotTick = -999;
      f.G.projectiles._push = function (...args) {
        if (tick !== lastShotTick) { shots++; lastShotTick = tick; }
        return origPush.apply(this, args);
      };
      try {
        for (tick = 0; tick < 240; tick++) {
          a.intent.fire = (tick % period) < 3;
          a.ink = 100;
          const prevRolling = a.weaponRunner.rolling;
          f.tick(a, 1 / 60);
          if (!prevRolling && a.weaponRunner.rolling) rollStarts++;
        }
      } finally {
        f.G.projectiles._push = origPush;
        a.character.dispose();
      }
      assert.equal(rollStarts, 0, `${weaponId} period=${period}F must never enter accidental rolling`);
      assert.ok(shots >= minExpected[weaponId], `${weaponId} period=${period}F expected >=${minExpected[weaponId]} swings, got ${shots}`);
    }
  }
});

test('tapping near the end of an intentional s3RollStop window starts a flick instead of cold-rolling', async () => {
  const f = await actorFixture();
  const a = createGroundedActor(f, 'roller');
  a.intent.move.set(0, 0, 1);

  // Establish an intentional roll by holding fire continuously from a flick.
  a.intent.fire = true;
  for (let i = 0; i < 50; i++) { a.ink = 100; f.tick(a, 1 / 60); }
  assert.equal(a.weaponRunner.rolling, true, 'continuous hold enters rolling');

  // Release fire to arm the 16F s3RollStop window.
  a.intent.fire = false;
  f.tick(a, 1 / 60);
  assert.equal(a.weaponRunner.rolling, false);
  assert.ok(a.weaponRunner.s3RollStop, 'intentional roll release arms s3RollStop');

  // Wait 14 frames, then press & hold fire on frame 15 (still inside 16F lock).
  for (let i = 0; i < 14; i++) f.tick(a, 1 / 60);
  a.intent.fire = true;
  f.tick(a, 1 / 60); // frame 15: blocked by s3RollStop, buffered
  assert.equal(a.weaponRunner.flick, -1, 'still blocked at frame 15');
  assert.equal(a.weaponRunner.rolling, false, 'must not roll at frame 15');

  // Frame 16: s3RollStop expires; buffered press must start a flick, NOT cold-roll.
  f.tick(a, 1 / 60);
  assert.ok(a.weaponRunner.flick >= 0, 'buffered tap starts a flick on frame 16');
  assert.equal(a.weaponRunner.rolling, false, 'must not cold-roll on frame 16');
  a.character.dispose();
});

test('grounded zero-ink depleted swing clears s3RollerAttack even while fire stays held', async () => {
  const f = await actorFixture();
  const a = createGroundedActor(f, 'roller');
  a.ink = 1; // positive below full cost -> depleted swing drains ink to 0
  a.intent.fire = true;
  f.tick(a, 1 / 60);
  assert.ok(a.weaponRunner.s3RollerAttack, 'depleted swing starts');

  // Hold fire well past the full swing interval with 0 ink.
  for (let i = 0; i < 65; i++) {
    a.ink = 0;
    f.tick(a, 1 / 60);
  }
  assert.equal(a.weaponRunner.rolling, false, 'cannot roll at 0 ink');
  assert.equal(a.weaponRunner.s3RollerAttack, null, 's3RollerAttack must clear after interval');
  assert.equal(a.character.s3RollerFlick, null, 'character.s3RollerFlick must clear after interval');
  a.character.dispose();
});
