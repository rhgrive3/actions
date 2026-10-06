// #801 — Splatoon 3 Ver. 11.3.0: standard Splat Roller flicks carry
// FriendThroughFrameForPlayer = 3 on all five active horizontal/vertical
// collision units. Flick globs pass through teammates for the first 3 frames
// (< 3F); after 3F (>= 3F) teammate collision obstructs and consumes the glob
// without friendly damage, splat credit, or enemy-hit effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

async function setup(vertical = false) {
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
  const shooter = f.make('roller');
  shooter.name = 'shooter';
  shooter.pos.set(0, 0, 0);
  shooter.aimPoint.set(0, 1.05, 100);
  shooter.aimDir.set(0, 0, 1);
  if (vertical) shooter.weaponRunner.s3FlickVertical = true;
  const ally = f.make();
  ally.name = 'ally';
  ally.hp = 100;
  const enemy = f.make();
  enemy.name = 'enemy';
  enemy.team = 1;
  enemy.hp = 100;
  enemy.invuln = 0;
  f.G.actors.push(shooter, ally, enemy);
  return { f, ps, shooter, ally, enemy };
}

// Keep one near-center glob so every case shares one trajectory.
function isolateCenterGlob(ps, vertical = false) {
  const keep = vertical ? ps.list[4] : ps.list[6];
  ps.list.length = 0;
  ps.list.push(keep);
  return keep;
}

function step(ps, frames = 30) {
  for (let i = 0; i < frames && ps.list.length; i++) ps.update(1 / 60);
}

test('#801 all five active Roller flick units expose a 3F friend-through window', async () => {
  const seen = await setup();
  const raw = seen.f.profile.weaponsFidelityCompletion.weapons.roller;
  const units = [...raw.WideSwingUnitGroupParam.Unit, ...raw.VerticalSwingUnitGroupParam.Unit];
  assert.equal(units.length, 5, 'two horizontal + three vertical active units');
  for (const [i, unit] of units.entries()) {
    assert.equal(unit.UnitParam.CollisionParam.FriendThroughFrameForPlayer, 3, `unit ${i} source window is 3F`);
  }
  for (const vertical of [false, true]) {
    const c = await setup(vertical);
    c.ps.fireFlick(c.shooter, c.shooter.weapon);
    assert.equal(c.ps.list.length, vertical ? 5 : 13);
    for (const p of c.ps.list) {
      assert.equal(p.fidelityFriendThrough, 3, 'glob receives fidelityFriendThrough = 3');
      assert.equal(p.fidelityPlayerCollision.friendThrough, 3, 'player collision record preserves the 3F window');
    }
    assert.equal(c.ps.list[0].fidelityPlayerCollision.initRadius, vertical ? 0.116 : 0.12);
    assert.equal(c.ps.list[0].fidelityPlayerCollision.endRadius, vertical ? 0.87 : 1.02);
  }
});

test('#801 horizontal ally inside the 3F window stays pass-through; after 3F it blocks', async () => {
  const g = await setup(false);
  g.ps.fireFlick(g.shooter, g.shooter.weapon);
  const gk = isolateCenterGlob(g.ps, false);
  g.ally.pos.set(gk.pos.x, 0, 1.6);
  g.enemy.pos.set(gk.pos.x, 0, 7.0);
  step(g.ps);
  assert.equal(g.ally.hp, 100, 'grace-window ally takes no friendly damage');
  assert.equal(g.enemy.hp, 0, 'enemy behind a grace-window ally still takes the hit');
  const b = await setup(false);
  b.ps.fireFlick(b.shooter, b.shooter.weapon);
  const bk = isolateCenterGlob(b.ps, false);
  b.ally.pos.set(bk.pos.x, 0, 5.0);
  b.enemy.pos.set(bk.pos.x, 0, 7.0);
  step(b.ps);
  assert.equal(b.ps.list.length, 0, 'glob is consumed by the post-window ally');
  assert.equal(b.ally.hp, 100, 'blocking ally takes no friendly damage');
  assert.equal(b.enemy.hp, 100, 'enemy behind the blocker takes no damage');
  const c = await setup(false);
  c.ps.fireFlick(c.shooter, c.shooter.weapon);
  const ck = isolateCenterGlob(c.ps, false);
  c.ally.pos.set(50, 0, 0);
  c.enemy.pos.set(ck.pos.x, 0, 7.0);
  step(c.ps);
  assert.equal(c.enemy.hp, 0, 'control without the ally reaches the enemy');
});

test('#801 vertical flick obeys the same unit-specific 3F window', async () => {
  const c = await setup(true);
  c.ps.fireFlick(c.shooter, c.shooter.weapon);
  const keep = isolateCenterGlob(c.ps, true);
  assert.equal(keep.fidelityFriendThrough, 3, 'vertical glob carries its unit 3F window');
  c.ally.pos.set(0, 0, 5.5);
  c.enemy.pos.set(0, 0, 8.0);
  step(c.ps);
  assert.equal(c.ps.list.length, 0, 'vertical glob is consumed by the post-window ally');
  assert.equal(c.ally.hp, 100, 'vertical blocker takes no friendly damage');
  assert.equal(c.enemy.hp, 100, 'enemy behind a vertical blocker takes no damage');
});

test('#801 non-roller Blaster keeps its current teammate behavior', async () => {
  const c = await setup(false);
  const blaster = c.f.make('blaster');
  blaster.name = 'blaster';
  blaster.pos.set(0, 0, 0);
  blaster.aimPoint.set(0, 1.05, 100);
  blaster.aimDir.set(0, 0, 1);
  c.f.G.actors[0] = blaster;
  c.ally.pos.set(0, 0, 5.0);
  c.enemy.pos.set(0, 0, 7.0);
  c.enemy.hp = 1000;
  c.ps.fireBlaster(blaster, blaster.weapon, 0);
  assert.equal(c.ps.list[0].fidelityFriendThrough, null, 'Blaster keeps long pass-through (no Roller window)');
  for (let i = 0; i < 60 && c.ps.list.length; i++) c.ps.update(1 / 60);
  assert.equal(c.ally.hp, 100, 'Blaster ally unharmed');
  assert.ok(c.enemy.hp < 1000, 'Blaster round still passes through the ally');
});

test('#801 30/60/120 Hz rendering around the same fixed simulation blocks identically', async () => {
  const outcomes = [];
  for (const hz of [30, 60, 120]) {
    const c = await setup(false);
    c.ps.fireFlick(c.shooter, c.shooter.weapon);
    const keep = isolateCenterGlob(c.ps, false);
    c.ally.pos.set(keep.pos.x, 0, 5.0);
    c.enemy.pos.set(keep.pos.x, 0, 7.0);
    const clock = new FixedClock();
    let consumedAt = null;
    for (let i = 0; i < hz; i++) {
      clock.advance(1 / hz, () => {
        c.ps.update(1 / 60);
        if (!c.ps.list.length && consumedAt === null) consumedAt = clock.ticks;
      });
    }
    outcomes.push({ consumedAt, allyHp: c.ally.hp, enemyHp: c.enemy.hp, list: c.ps.list.length });
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
  assert.equal(outcomes[0].list, 0, 'the glob is consumed at every cadence');
  assert.equal(outcomes[0].allyHp, 100, 'no friendly damage at any cadence');
  assert.equal(outcomes[0].enemyHp, 100, 'enemy behind the blocker is safe at every cadence');
});
