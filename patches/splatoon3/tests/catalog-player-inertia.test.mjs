import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { fixture as sourceFixture } from './source-fixture.mjs';
const { applyCatalogPlayerVelocity, queueCatalogBirth, releaseCatalogBirth } = await sourceFixture({ productionComposition: true,
  extraExports: "export { applyCatalogPlayerVelocity, queueCatalogBirth, releaseCatalogBirth } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';" });

const records = MAIN_WEAPON_CATALOG.records;
const record = id => records.find(row => row.id === id);
const close = (actual, expected, name = '') => assert.ok(Math.abs(actual - expected) < 1e-9, `${name}: ${actual} != ${expected}`);
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } });
function fixture(id = 's3-shooter-expert') {
  const r = record(id), runnerState = { birthEpoch: 0 };
  const actor = { yaw: 0, aimDir: vec(1, 0, 0), pos: vec(), vel: vec(3, -4, 5), alive: true, hp: 100,
    weapon: { id, kind: 'catalog', catalogRecord: r }, weaponRunner: { catalogState: runnerState }, nid: 8, owner: 'local' };
  const p = { owner: actor, catalog: { r }, vel: vec(0, 0, 100), pos: vec(0, 1, 0), prev: vec(0, 1, 0), start: vec(0, 1, 0), delay: 0 };
  const packets = [], game = { actors: [actor], netm: { recProj(q) { packets.push({ velocity: [q.vel.x, q.vel.y, q.vel.z], delay: q.delay, position: [q.pos.x, q.pos.y, q.pos.z] }); } } };
  const system = { _muzzle(a, out) { out.copy(a.pos); out.y += 1; } };
  return { p, actor, packets, game, system };
}

test('all 40 explicit catalog source records inherit their admitted axes, without guessing sparse defaults', () => {
  const explicit = records.filter(r => !r.legacy && ['XRate', 'ZRate', 'YPlusRate', 'YMinusRate']
    .some(k => Number.isFinite(r.parameters.spl__SpawnBulletAdditionMovePlayerParam?.[k])));
  assert.equal(explicit.length, 40, 'includes Screw Slosher, whose only explicit motion rate is YMinusRate');
  const original = Math.random; Math.random = () => { throw new Error('motion inheritance must not reroll shot RNG'); };
  try {
    for (const r of explicit) {
      const { p, actor } = fixture(r.id), spec = r.parameters.spl__SpawnBulletAdditionMovePlayerParam;
      const before = JSON.stringify(r), actorVelocity = [actor.vel.x, actor.vel.y, actor.vel.z];
      assert.equal(applyCatalogPlayerVelocity(p), true, r.id);
      close(p.vel.x, Number.isFinite(spec.XRate) ? 3 * spec.XRate : 0, r.id + ' X');
      close(p.vel.y, Number.isFinite(spec.YMinusRate) ? -4 * spec.YMinusRate : 0, r.id + ' falling Y');
      close(p.vel.z, 100 + (Number.isFinite(spec.ZRate) ? 5 * spec.ZRate : 0), r.id + ' Z');
      assert.deepEqual([actor.vel.x, actor.vel.y, actor.vel.z], actorVelocity);
      assert.equal(JSON.stringify(r), before, 'pinned source remains immutable');
    }
  } finally { Math.random = original; }
});

test('body yaw owns forward/strafe inheritance, independently of aim pitch, spread, hand and backward motion', () => {
  const { p, actor } = fixture();
  actor.yaw = Math.PI / 2; actor.aimDir = vec(0, .8, -.6); actor.vel = vec(-3, 8, 5);
  p.vel = vec(17, 23, 42); p.hand = 1;
  applyCatalogPlayerVelocity(p);
  close(p.vel.x, 11); close(p.vel.y, 23); close(p.vel.z, 42);
  const first = [p.vel.x, p.vel.y, p.vel.z];
  actor.vel = vec(100, 100, 100);
  assert.equal(applyCatalogPlayerVelocity(p), false);
  assert.deepEqual([p.vel.x, p.vel.y, p.vel.z], first, 'a projectile receives motion once, not on each later frame');
});

test('Explosher applies explicit right/forward and signed vertical terms; guide suppresses only downward inheritance', () => {
  for (const [y, guide, expectedY] of [[4, false, 2], [-4, false, -2], [4, true, 2], [-4, true, 0]]) {
    const { p, actor } = fixture('s3-slosher-washtub'); actor.vel.y = y;
    applyCatalogPlayerVelocity(p, { guide });
    close(p.vel.x, .9); close(p.vel.y, expectedY); close(p.vel.z, 105);
  }
  const { p, actor } = fixture('s3-slosher-washtub');
  actor.yaw = Math.PI / 2; actor.vel = vec(5, -4, -3);
  applyCatalogPlayerVelocity(p);
  close(p.vel.x, 5); close(p.vel.y, -2); close(p.vel.z, 99.1);
});

test('zero is not a missing field; absent shooter X/Y and absent spinner axes remain unmodified', () => {
  for (const id of ['s3-slosher-bathtub', 's3-spinner-quick', 's3-charger-light']) {
    assert.ok(record(id), id + ' source record exists');
    const { p, actor } = fixture(id); actor.vel.y = 12;
    const beforeY = p.vel.y;
    applyCatalogPlayerVelocity(p);
    close(p.vel.y, beforeY, id);
    if (id === 's3-slosher-bathtub') close(p.vel.z, 102.5);
    if (id === 's3-spinner-quick') assert.deepEqual([p.vel.x, p.vel.y, p.vel.z], [0, 0, 100]);
  }
  const { p } = fixture('s3-slosher-launcher');
  applyCatalogPlayerVelocity(p);
  assert.deepEqual([p.vel.x, p.vel.y, p.vel.z], [0, -4, 100], 'Screw keeps missing ZRate absent');
});

test('native families, network ghosts and remote owners never receive a second source-motion contribution', () => {
  for (const mutate of [p => { p.catalog.r = record('shooter'); }, p => { p.ghost = true; }, p => { p.owner.remote = true; }, p => { p.catalog = null; }]) {
    const { p } = fixture(); mutate(p);
    assert.equal(applyCatalogPlayerVelocity(p), false);
    assert.deepEqual([p.vel.x, p.vel.y, p.vel.z], [0, 0, 100]);
  }
  const { p } = fixture(); applyCatalogPlayerVelocity(p);
  p.catalog = { r: record('s3-slosher-launcher') }; p.vel = vec(0, 0, 100);
  applyCatalogPlayerVelocity(p);
  assert.deepEqual([p.vel.x, p.vel.y, p.vel.z], [0, -4, 100], 'pool reuse gets a fresh catalog state');
});

test('delayed globs sample motion and muzzle at birth, transmit the final velocity once, and preserve local unit offsets', () => {
  const { p, actor, game, system, packets } = fixture('s3-slosher-washtub');
  p.delay = .1; p.pos.x = 2; p.pos.y = 1.5;
  assert.equal(queueCatalogBirth(p, game, vec(0, 1, 0)), true);
  assert.equal(packets.length, 0);
  actor.pos = vec(10, 20, 30); actor.yaw = Math.PI / 2; actor.vel = vec(8, -6, -4);
  p.delay = 0;
  assert.equal(releaseCatalogBirth(system, p, game), true);
  assert.deepEqual(packets[0].velocity.map(x => Math.round(x * 1e9) / 1e9), [8, -3, 98.8]);
  assert.equal(packets[0].delay, 0);
  assert.deepEqual(packets[0].position.map(Math.round), [10, 22, 28]);
  assert.equal(releaseCatalogBirth(system, p, game), true);
  assert.equal(applyCatalogPlayerVelocity(p), false);
  assert.equal(packets.length, 1, 'no second birth packet or velocity inheritance');
});

test('a delayed glob cancelled by its owner lifecycle cannot publish stale motion or a projectile packet', () => {
  const cases = {
    death: ({ actor }) => { actor.alive = false; },
    zeroHP: ({ actor }) => { actor.hp = 0; },
    switch: ({ actor }) => { actor.weapon = { ...actor.weapon }; },
    special: ({ actor }) => { actor.specialActive = {}; },
    reset: ({ actor }) => { actor.weaponRunner.catalogState = {}; },
    cancel: ({ actor }) => { actor.weaponRunner.catalogState.birthEpoch++; },
    disconnect: ({ actor }) => { actor.owner = 'another-peer'; },
    removed: ({ game }) => { game.actors.length = 0; },
    remote: ({ actor }) => { actor.remote = true; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const f = fixture('s3-slosher-double'); f.p.delay = .1;
    queueCatalogBirth(f.p, f.game, vec(0, 1, 0)); mutate(f); f.p.delay = 0;
    assert.equal(releaseCatalogBirth(f.system, f.p, f.game), false, name);
    assert.equal(f.packets.length, 0, name);
    assert.deepEqual([f.p.vel.x, f.p.vel.y, f.p.vel.z], [0, 0, 100], name);
  }
});

test('bad actor data cannot inject NaN into a finite projectile; valid axes remain usable', () => {
  const { p, actor } = fixture('s3-slosher-washtub');
  actor.yaw = NaN; actor.vel.y = -4;
  applyCatalogPlayerVelocity(p);
  assert.deepEqual([p.vel.x, p.vel.y, p.vel.z], [0, -2, 100]);
});
