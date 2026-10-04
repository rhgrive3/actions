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
