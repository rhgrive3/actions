// #717: Slosher 2F teammate-through grace window.
// Splatoon 3 Ver. 11.3.0: standard Slosher units 0/1/2 have FriendThroughFrameForPlayer = 2.
// Globs pass through teammates for the first 2 frames (< 2F); after 2F (>= 2F),
// teammate collision obstructs and consumes the glob without friendly damage or splash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

async function setup(kind = 'slosher') {
  const f = await fixture(), V = f.THREE.Vector3;
  f.G.scene = new f.THREE.Scene();
  f.G.camera = { position: new V(0, 20, 0) };
  f.G.actors = [];
  f.G.boss = null;
  f.G.netm = null;
  f.G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; return out; } };
  f.G.physics = new f.Physics(f.G.level);
  const ps = new f.Projectiles(f.G.scene);
  f.G.projectiles = ps;
  f.setRandom(() => 0.5);
  const shooter = f.make(kind);
  shooter.name = 'shooter';
  shooter.aimPoint.set(0, 1.05, 100);
  shooter.aimDir.set(0, 0, 1);
  const ally = f.make();
  ally.name = 'ally';
  const enemy = f.make();
  enemy.name = 'enemy';
  enemy.team = 1;
  enemy.hp = 100;
  enemy.invuln = 0;
  f.G.actors.push(shooter, ally, enemy);
  return { f, ps, shooter, ally, enemy };
}

function step(ps, frames = 120) {
  for (let i = 0; i < frames && ps.list.length; i++) ps.update(1 / 60);
}

test('#717 standard Slosher unit 0/1/2 preserve FriendThroughFrameForPlayer = 2', async () => {
  const { f, shooter, ps } = await setup();
  const raw = f.profile.weaponsFidelityCompletion.weapons.slosher;
  assert.ok(raw?.UnitGroupParam?.Unit?.length >= 3, 'standard Slosher defines units 0, 1, 2');
  for (let i = 0; i < 3; i++) {
    const unit = raw.UnitGroupParam.Unit[i];
    assert.equal(unit.CollisionParam.FriendThroughFrameForPlayer, 2, `unit ${i} source FriendThroughFrameForPlayer is 2`);
  }
  ps.fireSlosh(shooter, shooter.weapon);
  for (const p of ps.list) {
    assert.equal(p.fidelityFriendThrough, 2, 'every fired Slosher glob receives fidelityFriendThrough = 2');
    assert.equal(p.fidelityPlayerCollision.FriendThroughFrameForPlayer, 2, 'player collision record preserves FriendThroughFrameForPlayer = 2');
  }
});

test('#717 teammate intersection inside <2F grace window remains pass-through', async () => {
  const { ps, shooter, ally, enemy } = await setup();
  // Within the first 2 frames (< 2F), the slosher glob passes through the ally.
  ally.pos.set(0, 0, 1.0);
  enemy.pos.set(0, 0, 6.0);
  ps.fireSlosh(shooter, shooter.weapon);
  step(ps);
  assert.equal(ally.hp, 100, 'friendly actor is unharmed during pass-through');
  assert.equal(enemy.hp, 30, 'enemy behind ally takes the hit (100 - 70 = 30) during <2F grace window');
});

test('#717 teammate intersection after 2F becomes an obstruction without friendly damage or enemy hit behind', async () => {
  const { ps, shooter, ally, enemy } = await setup();
  // Ally at z = 4.5 is reached after frame 2 (>= 2F).
  ally.pos.set(0, 0, 4.5);
  enemy.pos.set(0, 0, 6.0);
  ps.fireSlosh(shooter, shooter.weapon);
  step(ps);
  assert.equal(ps.list.length, 0, 'slosher globs consumed by the ally body block');
  assert.equal(ally.hp, 100, 'blocking ally takes zero friendly damage');
  assert.equal(enemy.hp, 100, 'enemy behind ally takes no damage when blocked after 2F');

  // Control: moving ally off the line restores the hit to enemy
  ally.pos.set(50, 0, 0);
  ps.fireSlosh(shooter, shooter.weapon);
  step(ps);
  assert.equal(ally.hp, 100, 'off-line ally untouched');
  assert.equal(enemy.hp, 30, 'enemy is hit when ally is not on the line');
});

test('#717 swept step crossing 2F threshold resolves from candidate contact age, not frame-end age', async () => {
  const { f, ps, shooter, ally } = await setup();
  ps.fireSlosh(shooter, shooter.weapon);
  const p = ps.list[0];

  // Configure a swept step crossing the 2F boundary: from 1.5F to 2.5F
  p.fidelityPrevAge = 1.5 / 60;
  p.age = 2.5 / 60;
  p.prev.set(0, 1.05, 1.0);
  p.pos.set(0, 1.05, 5.0);

  // Early contact: ally at z = 2.0 has contact age < 2F -> passes through
  ally.pos.set(0, 0, 2.0);
  let targets = f.fidelityProjectileTargets(ps, p);
  assert.equal(targets.length, 0, 'early contact age (<2F) within swept step passes through ally');

  // Late contact: ally at z = 4.5 has contact age >= 2F -> blocks
  ally.pos.set(0, 0, 4.5);
  targets = f.fidelityProjectileTargets(ps, p);
  assert.equal(targets.length, 1, 'late contact age (>=2F) within swept step obstructs on ally');
  assert.equal(targets[0].name, 'ally');
});

test('#717 shooter owner body never blocks its own slosh rounds', async () => {
  const { ps, shooter, ally, enemy } = await setup();
  ally.pos.set(50, 0, 0); // ally off line
  enemy.pos.set(0, 0, 6.0);
  ps.fireSlosh(shooter, shooter.weapon);
  step(ps);
  assert.equal(shooter.hp, 100, 'shooter takes no damage');
  assert.equal(enemy.hp, 30, 'owner body never blocks its own slosher globs');
});

test('#717 enemy in front takes the hit first, unchanged chronology', async () => {
  const { ps, shooter, ally, enemy } = await setup();
  enemy.pos.set(0, 0, 3.5);
  ally.pos.set(0, 0, 6.0);
  ps.fireSlosh(shooter, shooter.weapon);
  step(ps);
  assert.equal(ps.list.length, 0);
  assert.equal(enemy.hp, 30, 'enemy takes direct hit first');
  assert.equal(ally.hp, 100, 'ally behind enemy is untouched');
});

test('#717 a ghost slosher glob blocked by an ally is consumed once with no damage side effects', async () => {
  const { ps, shooter, ally, enemy } = await setup();
  ally.pos.set(0, 0, 4.5);
  enemy.pos.set(0, 0, 6.0);
  ps.fireSlosh(shooter, shooter.weapon);
  for (const p of ps.list) p.ghost = true;
  step(ps);
  assert.equal(ps.list.length, 0, 'ghost globs consumed visually');
  assert.equal(ally.hp, 100, 'no friendly damage from ghost');
  assert.equal(enemy.hp, 100, 'no enemy damage from ghost');
});

test('#717 projectile pool reset clears fidelityFriendThrough', async () => {
  const { ps } = await setup();
  const p = ps._new();
  assert.equal(p.fidelityFriendThrough, null, 'fresh/recycled projectile initializes with fidelityFriendThrough = null');
  ps.clear();
  assert.equal(ps.list.length, 0, 'clear resets pool');
});

test('#717 unrelated Dualies, Splatling, and Blaster preserve their friend-through semantics', async () => {
  for (const kind of ['dualies', 'splatling', 'blaster']) {
    const { ps, shooter, ally, enemy } = await setup(kind);
    ally.pos.set(0, 0, 4.5);
    enemy.pos.set(0, 0, 6.0);
    if (kind === 'blaster') {
      enemy.hp = 1000;
      ps.fireBlaster(shooter, shooter.weapon, 0);
    } else if (kind === 'dualies') {
      ps.fireDualies(shooter, shooter.weapon, 0, 0);
    } else {
      ps.fireSplatling(shooter, shooter.weapon, 0);
    }
    step(ps);
    assert.equal(ally.hp, 100, `${kind} ally remains unharmed`);
    assert.ok(enemy.hp < (kind === 'blaster' ? 1000 : 100), `${kind} round passes through ally to hit enemy`);
  }
});

test('#717 30/60/120 Hz rendering around the same fixed simulation blocks identically', async () => {
  const outcomes = [];
  for (const hz of [30, 60, 120]) {
    const { ps, shooter, ally, enemy } = await setup();
    ally.pos.set(0, 0, 4.5);
    enemy.pos.set(0, 0, 6.0);
    ps.fireSlosh(shooter, shooter.weapon);
    const clock = new FixedClock();
    let consumedAt = null;
    for (let i = 0; i < hz; i++) {
      clock.advance(1 / hz, () => {
        ps.update(1 / 60);
        if (!ps.list.length && consumedAt === null) consumedAt = clock.ticks;
      });
    }
    outcomes.push({ consumedAt, allyHp: ally.hp, enemyHp: enemy.hp, list: ps.list.length });
  }
  assert.deepEqual(outcomes[0], outcomes[1], '30 Hz matches 60 Hz');
  assert.deepEqual(outcomes[1], outcomes[2], '60 Hz matches 120 Hz');
  assert.equal(outcomes[0].enemyHp, 100, 'the block holds in every cadence');
  assert.equal(outcomes[0].allyHp, 100);
});

test('#717 Slosher maximum-per-volley damage grouping is preserved', async () => {
  const { ps, shooter, enemy } = await setup();
  // Fire directly at enemy without ally obstruction
  enemy.pos.set(0, 0, 5.0);
  ps.fireSlosh(shooter, shooter.weapon);
  step(ps);
  // Head glob does 70 damage. Multiple globs in the volley must not stack to 70 + 50*8 = 470.
  assert.equal(enemy.hp, 30, 'only the max per volley damage applies (100 - 70 = 30)');
});

test('#717 terrain obstacle takes precedence over distant actors', async () => {
  const { f, ps, shooter, enemy } = await setup();
  const V = f.THREE.Vector3;
  enemy.pos.set(0, 0, 8.0);
  const block = {
    id: 0, solid: true, grate: false,
    center: new V(0, 1.05, 4.0),
    half: new V(2, 2, 0.2),
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1]
  };
  f.G.level = {
    blocks: [block],
    faces: [],
    groundHeight: () => 0,
    queryBlocks: (_a, _b, _c, _d, out) => { out.push(0); return out; }
  };
  f.G.physics = new f.Physics(f.G.level);
  ps.fireSlosh(shooter, shooter.weapon);
  step(ps);
  assert.equal(enemy.hp, 100, 'terrain blocks slosher globs from reaching enemy');
});
