import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
import { installProjectileCaptureRoster } from '../lib/inkwave-projectile-ci-roster.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
async function nativeRoster(warmup = 0) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, extraExports: `
    export * from './patches/splatoon3/runtime/player-hurtbox.mjs';
    export * from './patches/splatoon3/runtime/actor-motion.mjs';
  ` });
  const level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    spawnPads: [[-10, 0, -20], [10, 0, 20]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-50, -1, -50], max: [50, 0, 50] }] });
  f.G.level = level; f.G.physics = new f.Physics(level); f.G.scene = new f.THREE.Scene();
  f.G.camera = { position: new f.THREE.Vector3() }; f.G.time = warmup;
  for (let team = 0; team < 2; team++) for (let slot = 0; slot < 4; slot++) {
    const a = f.make('splatling');
    a.team = team; a.slot = slot; a.isLocal = team === 0 && slot === 0; a.isBot = !a.isLocal;
    a.nid = team * 4 + slot; a.owner = 'offline';
    a.pos.set(warmup + slot, 3 + team, warmup - slot); a.vel.set(1, 2, 3);
    a.hp = 17; a.ink = 9; a.invuln = warmup; a.form = 'squid'; a.submerged = true;
    a.s3.squidSpawn = { phase: 'aim', t: warmup };
    a.s3.loadout = [{ main: 'actionIntensify', subs: ['runSpeed', 'runSpeed', 'runSpeed'] },
      { main: 'swimSpeed', subs: ['swimSpeed', 'swimSpeed', 'swimSpeed'] },
      { main: 'inkRecovery', subs: ['inkRecovery', 'inkRecovery', 'inkRecovery'] }];
    a.s3RefreshGear(); a.intent.fire = true; a._prevIntent.jump = true;
    a.weaponRunner.cooldown = warmup + 1; a.weaponRunner.charge = .75;
    a.character.root.updateMatrixWorld = () => {};
  }
  f.G.match = { state: 'playing', attract: false, actors: f.G.actors, local: f.G.actors[0], playing: () => true };
  f.beginActorMotionTick(f.G.actors);
  const game = { frozen: true, match: f.G.match }, host = {};
  return { ...f, game, host };
}

test('all eight native actors, gear, capsules and clocks are independent of boot warmup', async () => {
  const left = await nativeRoster(3), right = await nativeRoster(37);
  const refs = [...left.G.actors], list = left.G.actors;
  // Playwright serializes the function: evaluate the exact closure-free form.
  const serialized = (0, eval)('(' + installProjectileCaptureRoster.toString() + ')');
  const a = await serialized(left), b = await serialized(right);
  assert.deepEqual(plain(a), plain(b));
  assert.equal(left.G.actors, list); assert.deepEqual([...left.G.actors], refs);
  assert.equal(a.actors.length, 8);
  for (const row of a.actors) {
    assert.equal(row.state.hp, left.PLAYER.hp); assert.equal(row.state.ink, left.PLAYER.inkMax);
    assert.equal(row.state.invuln, 0); assert.equal(row.state.form, 'kid');
    assert.equal(row.intent.fire, false); assert.equal(row.previousIntent.jump, false);
    assert.equal(row.weaponClock.cooldown, 0); assert.equal(row.motionStart, null);
    assert.equal(row.lifecycle.squidSpawn, null); assert.deepEqual(row.gear.abilityPoints, {});
    assert.ok(row.floorHit.hit && row.floorHit.center && row.floorHit.block >= 0);
    assert.equal(row.capsule.radius, left.hurtboxRadius(list[row.order], left.PLAYER));
    assert.equal(row.capsule.height, left.hurtboxHeight(list[row.order], left.PLAYER));
    assert.equal(row.capsule.active, true);
  }
  assert.equal(a.actors.filter(row => !row.isLocal && row.team === 0).length, 3,
    'all friendly colliders remain in the native collision list');
});

test('each scenario restores every actor and keeps source capsule changes visible', async () => {
  const f = await nativeRoster(8), original = await installProjectileCaptureRoster(f);
  const bot = f.G.actors[1];
  bot.pos.x += 2; bot.hp = 4; bot.vel.y = 5; bot.intent.fire = true;
  bot.s3.loadout[0].main = 'actionIntensify'; bot.s3RefreshGear();
  assert.notDeepEqual(plain(f.host.__iwProjectileRosterSnapshot()), plain(original));
  assert.deepEqual(plain(f.host.__iwResetProjectileRoster()), plain(original));
  f.PLAYER.s3HumanoidHurtRadius += .01;
  assert.notDeepEqual(plain(f.host.__iwProjectileRosterSnapshot()), plain(original),
    'a real native hurtbox change cannot be normalized out of the receipt');
});

test('wrong roster identity, remote admission, live stepping and invalid floor fail closed', async () => {
  const f = await nativeRoster(); await installProjectileCaptureRoster(f);
  f.game.frozen = false; assert.throws(() => f.host.__iwResetProjectileRoster(), /live performance/);
  f.game.frozen = true;
  f.G.actors[1].owner = 'changed'; assert.throws(() => f.host.__iwProjectileRosterSnapshot(), /identity/);
  const remote = await nativeRoster(); remote.G.actors[4].remote = true;
  await assert.rejects(() => installProjectileCaptureRoster(remote), /offline/);
  const short = await nativeRoster(); short.G.actors.pop();
  await assert.rejects(() => installProjectileCaptureRoster(short), /eight native/);
  const unsupported = await nativeRoster(); unsupported.G.physics.groundProbe = (...args) => { args[6].hit = false; return args[6]; };
  await assert.rejects(() => installProjectileCaptureRoster(unsupported), /native walkable floor/);
});
