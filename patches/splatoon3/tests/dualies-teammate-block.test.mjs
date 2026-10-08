import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, STEP } from './full-install-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #939: Splat Dualies' FriendThroughFrameForPlayer is 0F in both the normal and the post-roll (LapOver) collision
// records, so a live teammate is a body obstruction from projectile birth (no damage to the ally, nothing passes
// through to the enemy behind). Logic-only: real composed Actor/Projectiles/weapons-fidelity on the VM at fixed 60 Hz;
// not a browser run and not a Splatoon 3 real-device comparison.
const close = (a, b, label, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} != ${b}`);

// Shooter A at the origin; ally B `allyDist` along the shot line (+ `lateral`); enemy C 3 further on, no geometry between.
function scene(f, { turret = false, lateral = 0, hand = 0, allyDist = 3 } = {}) {
  const { G, THREE } = f; G.actors.length = 0; G.projectiles.clear();
  const a = f.make({ weapon: 'dualies' }); f.tick(a); a.aimYaw = 0; a.aimPitch = 0; a.weaponRunner.s3Turret = turret;
  const ps = G.projectiles; ps.fireDualies(a, a.weapon, 0, hand);
  const p = ps.list.at(-1), dir = p.vel.clone().normalize(), at = (d, side = 0) => [p.pos.x + dir.x * d + side, p.pos.y - .9, p.pos.z + dir.z * d];
  const ally = f.make({ team: 0, pos: at(allyDist, lateral) }), enemy = f.make({ team: 1, pos: at(allyDist + 3) });
  ally.hp = enemy.hp = 100; ally.invuln = enemy.invuln = 0;
  return { a, p, ps, ally, enemy, dir, THREE };
}
const fly = (s, frames = 40) => { for (let i = 0; i < frames && s.ps.list.includes(s.p); i++) s.ps.update(STEP); };

test('#939 the pinned Dualies records carry a 0F friend-through window for both profiles', async t => {
  const f = await boot(); t.after(f.close);
  const raw = f.profile.weaponsFidelityCompletion.weapons.dualies;
  assert.equal(raw.CollisionParam.FriendThroughFrameForPlayer, 0);
  assert.equal(raw.CollisionLapOverParam.FriendThroughFrameForPlayer, 0);
  // Projectiles are pooled, so read each record before building the next scene.
  const record = turret => ({ ...scene(f, { turret }).p.fidelityPlayerCollision }), normal = record(false), roll = record(true);
  assert.equal(normal.FriendThroughFrameForPlayer, 0); assert.equal(roll.FriendThroughFrameForPlayer, 0);
  close(normal.initRadius, raw.CollisionParam.InitRadiusForPlayer, 'normal radius');
  close(roll.initRadius, raw.CollisionLapOverParam.InitRadiusForPlayer, 'post-roll radius');
  assert.ok(roll.initRadius > normal.initRadius, 'post-roll keeps its wider player radius');
});

for (const hand of [0, 1]) test(`#939 a teammate blocks a normal shot (hand ${hand}); the enemy behind takes nothing and the ally takes no damage`, async t => {
  const f = await boot(); t.after(f.close);
  const s = scene(f, { hand }); fly(s);
  assert.equal(s.ally.hp, 100, 'no friendly fire'); assert.equal(s.enemy.hp, 100, 'enemy behind the ally is shielded');
  assert.ok(!s.ps.list.includes(s.p), 'the round is consumed');
  assert.ok(s.p.pos.z < s.enemy.pos.z - 1, `stopped at the ally (z ${s.p.pos.z})`);
  // Control: with the ally out of the swept radius the enemy is hit by the same round.
  const c = scene(f, { hand, lateral: 2 }); fly(c);
  assert.ok(c.enemy.hp < 100, 'enemy hit when the ally is clear of the shot'); assert.equal(c.ally.hp, 100);
});

test('#939 post-roll shots use the wider LapOver radius to block, exactly at the profile radius', async t => {
  const f = await boot(); t.after(f.close);
  const raw = f.profile.weaponsFidelityCompletion.weapons.dualies;
  const reach = turret => f.PLAYER.radius + raw[turret ? 'CollisionLapOverParam' : 'CollisionParam'].InitRadiusForPlayer;
  assert.ok(reach(true) > reach(false));
  const mid = (reach(true) + reach(false)) / 2;
  // Lateral offset between the two radii: the standing round slips past the ally, the post-roll round is blocked.
  const standing = scene(f, { lateral: mid, turret: false }); fly(standing);
  assert.ok(standing.enemy.hp < 100, 'standing profile passes outside its own radius');
  const roll = scene(f, { lateral: mid, turret: true }); fly(roll);
  assert.equal(roll.enemy.hp, 100, 'post-roll profile blocks with the 0.285-class LapOver radius'); assert.equal(roll.ally.hp, 100);
  assert.ok(!roll.ps.list.includes(roll.p));
  // Directly in line the post-roll round is blocked as well.
  const direct = scene(f, { turret: true }); fly(direct);
  assert.equal(direct.enemy.hp, 100);
  // Just outside the LapOver radius it passes.
  const outside = scene(f, { lateral: reach(true) + .02, turret: true }); fly(outside);
  assert.ok(outside.enemy.hp < 100);
});

test('#939 eligibility is judged at the contact age: a nonzero friend-through window passes early contacts only', async t => {
  const f = await boot(); t.after(f.close);
  const early = scene(f); early.p.fidelityFriendThrough = 30; fly(early);
  assert.ok(early.enemy.hp < 100, 'ally contacted inside the window is passed through');
  assert.equal(early.ally.hp, 100);
  const late = scene(f); late.p.fidelityFriendThrough = 1; fly(late);
  assert.equal(late.enemy.hp, 100, 'ally contacted after the window blocks');
});

test('#939 the shooter never blocks itself, dead or submerged allies do not block, and world contact still wins when nearer', async t => {
  const f = await boot(); t.after(f.close);
  const dead = scene(f); dead.ally.alive = false; fly(dead); assert.ok(dead.enemy.hp < 100, 'dead ally');
  const sub = scene(f); sub.ally.submerged = true; fly(sub); assert.ok(sub.enemy.hp < 100, 'submerged ally');
  const solo = scene(f, { lateral: 5 }); fly(solo); assert.ok(solo.enemy.hp < 100, 'owner capsule at the muzzle does not block its own shot');
  // A wall in front of the ally ends the round at the wall (the ally is never reached).
  const wall = scene(f); f.setBlocks([{ min: [-20, 0, wall.p.pos.z + 1], max: [20, 6, wall.p.pos.z + 1.2] }]);
  fly(wall); assert.equal(wall.ally.hp, 100); assert.equal(wall.enemy.hp, 100); f.setBlocks([]);
});

test('#939 blocking is identical when the fixed simulation is fed by 30/60/120Hz render clocks', async t => {
  const f = await boot(), results = []; t.after(f.close);
  for (const hz of [30, 60, 120]) {
    const s = scene(f), clock = new FixedClock(); let ticks = 0, consumedAt = null;
    for (let render = 0; render < hz; render++) clock.advance(1 / hz, dt => {
      if (consumedAt !== null) return;
      ticks++; s.ps.update(dt); if (!s.ps.list.includes(s.p)) consumedAt = ticks;
    });
    results.push({ ally: s.ally.hp, enemy: s.enemy.hp, consumedAt, z: +s.p.pos.z.toFixed(9) });
  }
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
  assert.equal(results[0].enemy, 100); assert.ok(results[0].consumedAt > 0);
});
