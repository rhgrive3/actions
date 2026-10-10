// #929: Heavy Splatling consumes its pinned0F teammate-through record.
// Actual public modules plus the build adapter (weapon-edgecases fixture);
// fixed 60 Hz simulation only, deterministic zero spread, no renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

async function setup(kind = 'splatling') {
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

test('#929 ally directly down the line body-blocks a zero-spread Heavy Splatling round', async () => {
  const { f, ps, shooter, ally, enemy } = await setup();
  const hits=[];f.on('hit', e=>hits.push(e));
  ally.pos.set(0, 0, 2);
  enemy.pos.set(0, 0, 6);
  ps.fireSplatling(shooter, shooter.weapon, 0);
  const birth=ps.list.at(-1);
  assert.equal(birth.fidelityFriendThrough,0,'pinned Heavy collision has no friendly-through grace');
  assert.equal(birth.fidelityPlayerCollision.initRadius,.225);
  assert.equal(birth.fidelityFieldCollision.initRadius,.2);
  step(ps);
  assert.equal(ps.list.length, 0, 'the round is consumed by the ally contact');
  assert.equal(enemy.hp, 100, 'the enemy behind the ally takes no damage');
  assert.equal(ally.hp, 100, 'the blocking ally takes no friendly-fire damage');
  assert.equal(hits.length,0,'friendly block emits no damage hit event');
  assert.equal(shooter.stats.splats,0,'friendly block awards no splat credit');
  // Control: moving the ally off the line restores the enemy hit.
  ally.pos.set(50, 0, 0);
  ps.fireSplatling(shooter, shooter.weapon, 0);
  step(ps);
  assert.equal(ally.hp, 100, 'an off-line ally is never hit');
  assert.ok(enemy.hp < 100, 'without the ally on the line the enemy is hit again');
});

test('#929 an ally pressed against the muzzle still blocks; the owner body never does', async () => {
  const { ps, shooter, ally, enemy } = await setup();
  ally.pos.set(0, 0, 0.5); // muzzle sits at z≈0.3 inside the ally capsule envelope
  enemy.pos.set(0, 0, 6);
  ps.fireSplatling(shooter, shooter.weapon, 0);
  step(ps);
  assert.equal(ps.list.length, 0, 'point-blank ally contact consumes the round on the first sweep');
  assert.equal(enemy.hp, 100);
  assert.equal(ally.hp, 100);
  // The shooter's own capsule envelopes the muzzle: the round must leave it.
  ally.pos.set(50, 0, 0);
  ps.fireSplatling(shooter, shooter.weapon, 0);
  step(ps);
  assert.equal(ally.hp, 100);
  assert.ok(enemy.hp < 100, 'the owner body never blocks its own round');
});

test('#929 earliest-contact ordering is deterministic when ally and enemy meet in the same fixed tick', async () => {
  const run = async () => {
    const { ps, shooter, ally, enemy } = await setup();
    ally.pos.set(0, 0, 4.5);
    enemy.pos.set(0, 0, 4.9); // both capsules enter during the same fixed sweep
    ps.fireSplatling(shooter, shooter.weapon, 0);
    step(ps);
    return { list: ps.list.length, allyHp: ally.hp, enemyHp: enemy.hp };
  };
  const first = await run();
  assert.deepEqual(first, { list: 0, allyHp: 100, enemyHp: 100 });
  for (let i = 0; i < 3; i++) assert.deepEqual(await run(), first, 'repeat runs are identical');
});

test('#929 enemy-in-front chronology is unchanged: the enemy still takes the hit first', async () => {
  const { ps, shooter, ally, enemy } = await setup();
  enemy.pos.set(0, 0, 2);
  ally.pos.set(0, 0, 6);
  ps.fireSplatling(shooter, shooter.weapon, 0);
  step(ps);
  assert.equal(ps.list.length, 0, 'the round is consumed at the first (enemy) contact');
  assert.ok(enemy.hp < 100, 'the nearest enemy still takes the hit');
  assert.equal(ally.hp, 100, 'the ally behind the enemy is untouched');
});

test('#929 a ghost round blocked by an ally is consumed once with no damage side effects', async () => {
  const { ps, shooter, ally, enemy } = await setup();
  ally.pos.set(0, 0, .5);
  enemy.pos.set(0, 0, 6);
  ps.fireSplatling(shooter, shooter.weapon, 0);
  ps.list.at(-1).ghost = true;
  ps.update(1/60); // birth contact must retire before the distant enemy is reachable
  assert.equal(ps.list.length, 0, 'the ghost is consumed visually exactly like a local round');
  assert.equal(ally.hp, 100, 'no friendly damage from a ghost');
  assert.equal(enemy.hp, 100, 'no double-applied enemy damage from a ghost');
});

test('#929 30/60/120 Hz rendering around the same fixed simulation blocks identically', async () => {
  const outcomes = [];
  for (const hz of [30, 60, 120]) {
    const { ps, shooter, ally, enemy } = await setup();
    ally.pos.set(0, 0, 2);
    enemy.pos.set(0, 0, 6);
    ps.fireSplatling(shooter, shooter.weapon, 0);
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


test('#929 world obstruction and grate traversal retain earliest-contact ownership',async()=>{
 for(const grate of [false,true]){
  const {f,ps,shooter,ally,enemy}=await setup(),V=f.THREE.Vector3;
  ally.pos.set(0,0,2);enemy.pos.set(0,0,6);
  const block={id:0,solid:true,grate,center:new V(0,1,1),half:new V(2,2,.1),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
  f.G.level={blocks:[block],faces:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}};
  f.G.physics=new f.Physics(f.G.level);ps.fireSplatling(shooter,shooter.weapon,0);const p=ps.list[0];
  p.prev.set(0,1,0);p.pos.set(0,1,3);p.fidelityPrevAge=0;p.age=1/60;
  const targets=f.fidelityProjectileTargets(ps,p);
  assert.equal(targets.length,grate?1:0);if(grate)assert.equal(targets[0],ally);
  assert.equal(f.fidelityWorldHit(ps,p).hit,!grate);
  assert.equal(ally.hp,100);assert.equal(enemy.hp,100);
 }
});
