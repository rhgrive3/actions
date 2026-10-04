import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installKitDefense } from '../runtime/kit-defense.mjs';
async function setup() {
  const f = await fixture(); installKitDefense(f);
  const system = new f.Projectiles(new f.THREE.Scene()), owner = f.make();
  const p = system._new(); Object.assign(p, { owner, team: 0, type: 'shot', wid: 'shooter', damage: 36,
    size: .15, radius: .3, age: 0, life: 10, straight: 10, grav: 0, drag: 0, trailEvery: 0 });
  p.pos.set(0, 1, 0); p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(600, 0, 0);
  f.G.actors = []; f.G.boss = null; f.G.physics.segment = () => ({ hit: false });
  let contacts = 0, hits = 0, walls = 0;
  system.kitBarrierCandidate = () => ({ distance: 2, onHit: () => { contacts++; } });
  system.applyHit = () => { hits++; }; system._impact = () => { walls++; };
  return { f, system, p, counts: () => [contacts, hits, walls] };
}
test('native step chooses a nearer defense without damage, burst or a second integration', async () => {
  const { f, system, p, counts } = await setup();
  const victim = f.make(); victim.team = 1; victim.pos.set(8, 0, 0); f.G.actors = [victim];
  assert.equal(system._step(p, 1 / 60), true); assert.deepEqual(counts(), [1, 0, 0]);
  assert.equal(p.age, 1 / 60); assert.equal(p.pos.x, 10);
});
test('nearer terrain and exact terrain ties suppress defense side effects', async () => {
  for (const distance of [1, 2]) {
    const { f, system, p, counts } = await setup();
    f.G.physics.segment = () => ({ hit: true, dist: distance });
    assert.equal(system._step(p, 1 / 60), true); assert.deepEqual(counts(), [0, 0, 1]);
  }
});
test('nearer actor or boss wins over a farther defense', async () => {
  const a = await setup(), victim = a.f.make(); victim.team = 1; victim.pos.set(1, 0, 0);
  a.f.G.actors = [victim]; assert.equal(a.system._step(a.p, 1 / 60), true); assert.deepEqual(a.counts(), [0, 1, 0]);
  const b = await setup(); let boss = 0; b.f.G.boss = { segHit: () => ({ dist: 1 }) };
  b.system._bossImpact = () => { boss++; }; assert.equal(b.system._step(b.p, 1 / 60), true);
  assert.equal(boss, 1); assert.deepEqual(b.counts(), [0, 0, 0]);
});
test('candidate queries are inert, choose earliest intake and reject invalid distances', async () => {
  const { f, system, p, counts } = await setup(); p.prev.set(0, 1, 0); p.pos.set(10, 1, 0);
  let intake = 0; const near = f.make(), far = f.make(); near.team = far.team = 1;
  f.G.actors = [far, near];
  f.inkVacAbsorbCandidate = actor => ({ distance: actor === near ? 1 : 6, onHit: () => { intake++; } });
  const candidate = system.kitDefenseCandidate(p); assert.equal(candidate.distance, 1);
  assert.deepEqual(counts(), [0, 0, 0]); assert.equal(intake, 0); candidate.onHit(); assert.equal(intake, 1);
  f.inkVacAbsorbCandidate = () => ({ distance: -1, onHit() { throw new Error('invalid'); } });
  system.kitBarrierCandidate = () => ({ distance: 11, onHit() { throw new Error('outside step'); } });
  assert.equal(system.kitDefenseCandidate(p), null);
});
test('partial and piercing charger beams stop at defense; piercing hits before it remain', async () => {
  for (const charge of [.5, 1]) {
    const f = await fixture(); installKitDefense(f);
    const system = new f.Projectiles(new f.THREE.Scene()), owner = f.make('charger');
    owner.pos.set(0, 0, 0); owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 20);
    const victim = f.make(); victim.team = 1; victim.pos.set(0, 0, 7);
    f.G.actors = [victim]; f.G.boss = null;
    f.G.physics.raycast = (_a, _d, _l, hit) => { hit.hit = false; return hit; };
    let contacts = 0; const hits = [];
    system.kitBarrierCandidate = () => ({ distance: 3, onHit: () => { contacts++; } });
    system.applyHit = (_a, e) => hits.push(e);
    system.fireCharger(owner, { ...owner.weapon, rangeMin: 10, rangeMax: 10 }, charge);
    assert.equal(contacts, 1, 'one authoritative defense hit per beam');
    assert.equal(hits.length, 0, 'actor behind defense excluded');
    assert.equal(system.beams[0].mesh.scale.z, 3, 'native visual beam uses the intercepted length');
    assert.equal(system.s3BeamDefense, undefined, 'temporary candidate restored');
  }
  const f = await fixture(); installKitDefense(f);
  const system = new f.Projectiles(new f.THREE.Scene()), owner = f.make('charger');
  owner.pos.set(0, 0, 0); owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 20);
  const near = f.make(), far = f.make(); near.team = far.team = 1;
  near.pos.set(0, 0, 1.5); far.pos.set(0, 0, 7); f.G.actors = [far, near]; f.G.boss = null;
  f.G.physics.raycast = (_a, _d, _l, hit) => { hit.hit = false; return hit; };
  let contacts = 0; const hits = [];
  system.kitBarrierCandidate = () => ({ distance: 3, onHit: () => { contacts++; } });
  system.applyHit = (_a, e) => hits.push(e);
  system.fireCharger(owner, { ...owner.weapon, rangeMin: 10, rangeMax: 10 }, 1);
  assert.deepEqual(hits, [near]); assert.equal(contacts, 1);
});

test('actual Bubbler mechanics participate in the native sweep and preserve ghost and nearer-wall authority', async () => {
  const { installKitBigBubbler, tickBigBubblers, bigBubblerDomes } = await import('../runtime/kit-big-bubbler.mjs');
  for (const mode of ['owned', 'ghost', 'nearer-wall']) {
    const f = await fixture(); installKitDefense(f); installKitBigBubbler(f, f.profile);
    const system = f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
    const owner = f.make('roller'); owner.nid = 4; owner.weapon = { ...owner.weapon, special: 'bubbler', specialCost: 180 };
    owner.special = 180; owner._startSpecial(); tickBigBubblers(1);
    const dome = bigBubblerDomes()[0], hp = dome.hp;
    const shooter = f.make(); shooter.team = 1; shooter.nid = 9;
    f.G.actors = [owner]; f.G.boss = null;
    f.G.physics.segment = () => mode === 'nearer-wall' ? { hit: true, dist: .1 } : { hit: false };
    let hits = 0, impacts = 0; system.applyHit = () => { hits++; }; system._impact = () => { impacts++; };
    const p = system._new(); Object.assign(p, { owner: shooter, team: 1, type: 'shot', wid: 'shooter', damage: 36,
      size: .15, radius: .3, age: 0, life: 1, straight: 1, grav: 0, drag: 0, trailEvery: 0, ghost: mode === 'ghost' });
    p.pos.copy(dome.pos).add(new f.THREE.Vector3(0, 1, 20)); p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(0, 0, -1800);
    assert.equal(system._step(p, 1 / 60), true); assert.equal(hits, 0, mode);
    assert.equal(dome.hp, mode === 'owned' ? hp - 3600 : hp, mode);
    assert.equal(impacts, mode === 'nearer-wall' ? 1 : 0, mode); assert.equal(p.age, 1 / 60);
    system.clear();
  }
});
