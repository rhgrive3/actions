import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

// #911: in battle a Blaster shot that collides with a player makes the reduced impact burst (same class as a
// wall/floor hit: half HP, 70-50 -> 35-25); only the timed in-air detonation is the full burst. Logic-only: real
// adapted Projectiles._step/_blastBurst, with the world, FX and audio stubbed. Not a browser or Switch comparison.
const close = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const DT = 1 / 60;
async function setup() {
  const f = await fixture(), a = f.make('blaster'), V = f.THREE.Vector3;
  const ps = new f.Projectiles(new f.THREE.Scene()); f.G.projectiles = ps;
  f.G.camera = { position: new V(0, 20, 0) }; f.G.fx = { burst() {}, explosion() {}, splatted() {} };
  f.G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  // Remember where each burst was centred so a control burst can be replayed at exactly that point.
  const bursts = [], burst = ps._blastBurst;
  ps._blastBurst = function (p, at, direct) { bursts.push(at.clone()); return burst.call(this, p, at, direct); };
  const foe = (x, z) => { const e = f.make(); e.team = 1; e.invuln = 0; e.hp = 100; e.maxHp = 100; e.pos.set(x, 0, z); return e; };
  // A blast flying +Z along x=0 that reaches the origin within one step. `life` decides whether it detonates in flight.
  const shot = (life = 2) => {
    const p = ps._new();
    Object.assign(p, { type: 'blast', owner: a, team: 0, age: 0, trail: 0, trailEvery: 0, radius: 1, seed: .5, wid: 'blaster', size: .26, life, straight: 99, grav: 0, drag: 0,
      damage: a.weapon.directDamage });
    p.pos.set(0, .7, -.9); p.prev.copy(p.pos); p.vel.set(0, 0, a.weapon.projSpeed); p.start.copy(p.pos);
    return p;
  };
  return { f, a, ps, foe, shot, V, bursts };
}

test('#911 direct player hit: 125 direct once, nearby foe takes the reduced impact burst, not the 70-50 airburst', async () => {
  const { f, a, ps, foe, shot, bursts } = await setup();
  const direct = foe(0, 0), near = foe(.4, 0); direct.hp = direct.maxHp = 500; // `near` is iterated after `direct`, which ends the shot
  f.G.actors = [a, direct, near];
  const p = shot(); assert.equal(ps._step(p, DT), true);
  close(500 - direct.hp, 125, 1e-6);                 // direct damage exactly once, no duplicate splash
  const impact = 100 - near.hp;
  assert.ok(impact > 0 && impact <= 35, `reduced impact burst stays inside its 35-25 HP envelope (${impact})`);
  // #340 compresses the reduced player's damage curve into the smaller admission radius,
  // so a nearby target is not necessarily the 35 HP inner-band maximum. Compare against
  // an explicit terrain-class burst at the exact same centre instead of hard-coding 35.
  const centre = bursts.at(-1).clone(); near.hp = 100; f.G.actors = [a, near];
  const control = shot(); control.s3TerrainBurst = true; ps._blastBurst(control, centre, null); ps.update(DT);
  close(100 - near.hp, impact);
  assert.equal(p.s3TerrainBurst, false, 'cause flag is restored after the burst');
});

test('#911 negative control: the timed in-air detonation keeps the full 70-50 burst', async () => {
  const { f, a, ps, foe, shot } = await setup();
  const near = foe(.9, 0), far = foe(0, 2.2); f.G.actors = [a, near, far];
  const p = shot(DT / 2); assert.equal(ps._step(p, DT), true);   // expires in flight, nothing in its path
  close(100 - near.hp, 70);
  assert.ok(100 - far.hp > 50 && 100 - far.hp < 70, 'band interpolates between 70 and 50');
});

test('#911 direct contact uses the same compressed 35-25 curve as a terrain impact at the same centre', async () => {
  const { f, a, ps, foe, shot, bursts } = await setup();
  for (const x of [.4, .9, 1.2, 1.6]) {
    const direct = foe(0, 0), near = foe(x, 0); direct.hp = direct.maxHp = 500; f.G.actors = [a, direct, near];
    ps._step(shot(), DT);
    const impact = 100 - near.hp, centre = bursts.at(-1).clone();
    near.hp = 100; f.G.actors = [a, near];
    const reduced = shot(); reduced.s3TerrainBurst = true; ps._blastBurst(reduced, centre, null); ps.update(DT);
    close(100 - near.hp, impact);
    near.hp = 100; ps._blastBurst(shot(), centre, null);
    const timed = 100 - near.hp;
    assert.ok(impact <= Math.floor(timed * .5 * 10 + 1e-9) / 10 + 1e-9,
      `x ${x}: compressed impact curve never exceeds half of the full airburst (${impact} vs ${timed})`);
    assert.ok(impact >= 0 && impact <= 35 + 1e-9);
  }
});

test('#911 LOS cover still blocks the reduced burst; terrain contact and boss direct hits are unchanged', async () => {
  const { f, a, ps, foe, shot, V } = await setup();
  const direct = foe(0, 0), near = foe(.4, 0); direct.hp = direct.maxHp = 500; f.G.actors = [a, direct, near];
  f.G.physics.los = () => false;
  ps._step(shot(), DT); close(near.hp, 100); close(500 - direct.hp, 125, 1e-6);
  f.G.physics.los = () => true;
  // terrain contact (existing path) still 35 and boss-targeted bursts do not take the player-collision flag
  near.hp = 100; ps._impact(shot(), { point: new V(0, .7, 0), normal: new V(0, 1, 0) });
  close(near.hp, 100); ps.update(DT);
  assert.ok(100 - near.hp > 0 && 100 - near.hp <= 35, 'terrain impact resolves next tick on the reduced curve');
  // Which cause the burst runs under: player collision = reduced impact, boss/timed = untouched.
  let cause; f.G.audio = { play: (name) => { if (name === 'blaster_boom') cause = p.s3TerrainBurst; } };
  const p = shot();
  ps._blastBurst(p, new V(0, .7, 0), direct); assert.equal(cause, true);
  ps._blastBurst(p, new V(0, .7, 0), 'boss'); assert.equal(cause, false);
  ps._blastBurst(p, new V(0, .7, 0), null); assert.equal(cause, false);
  assert.equal(p.s3TerrainBurst, false);
  const boss = []; f.G.boss = { splash: (...args) => boss.push(args) };
  ps._blastBurst(p, new V(0, .7, 0), direct); close(boss[0][3], 70, 1e-9);   // boss splash dimensions stay native
});
