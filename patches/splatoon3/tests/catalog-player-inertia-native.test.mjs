import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const close = (actual, expected, name = '') => assert.ok(Math.abs(actual - expected) < 1e-8, `${name}: ${actual} != ${expected}`);
const explicit = MAIN_WEAPON_CATALOG.records.filter(r => !r.legacy && ['XRate', 'ZRate', 'YPlusRate', 'YMinusRate']
  .some(k => Number.isFinite(r.parameters.spl__SpawnBulletAdditionMovePlayerParam?.[k])));
const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, vmMathRandom: () => .5,
  extraExports: "export { applyCatalogPlayerVelocity } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';" });
f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
f.G.projectiles._draw = () => {}; // This fixture verifies native logic, not WebGL pixels.
const ps = f.G.projectiles;

function spawnBatch(id, velocity, dt = 1 / 60) {
  ps.clear(); f.G.actors.length = 0; f.G.time = 0;
  const a = f.make(id); a.nid = 1; a.form = 'kid'; a.ink = 100; a.yaw = 0;
  a.pos.set(0, 20, 0); a.character.root.position.copy(a.pos);
  a.vel.set(...velocity); a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 21.05, 100);
  a.intent.fire = true;
  const packets = [];
  f.G.netm = { mute: 0, recProj(p) {
    if (p.owner !== a) return;
    let wire;
    f.NetMatch.prototype.recProj.call({ _rec: row => { wire = [0, ...row, 0, 1]; return wire; }, cfg: { id: 'inertia-test' } }, p);
    packets.push({ p, wire, velocity: p.vel.clone(), delay: p.delay, start: p.start.clone(), actorVelocity: a.vel.clone(),
      unit: p.catalog.descriptor.unit, index: p.catalog.index });
  } };
  let ticks = 0;
  while (!ps.list.length && ticks * dt < 6) {
    f.G.time += dt;
    a.weaponRunner.update(dt, { fire: true, firePressed: ticks === 0, sub: false, subReleased: false });
    ticks++;
  }
  a.intent.fire = false;
  assert.ok(ps.list.length > 0, id + ' actual installed runner emits');
  return { a, packets, queued: [...ps.list], ticks };
}
function releaseQueued(dt = 1 / 60) {
  for (let i = 0; i < Math.ceil(1 / dt); i++) { f.G.time += dt; ps.update(dt); }
}

for (const dt of [1 / 30, 1 / 60, 1 / 120]) test(`all 40 source records reach native emitted velocities and packets at ${1 / dt} Hz`, () => {
  for (const r of explicit) {
    const still = spawnBatch(r.id, [0, 0, 0], dt); releaseQueued(dt);
    const baseline = still.packets.map(row => ({ unit: row.unit, index: row.index, v: row.velocity.clone() }));
    const moving = spawnBatch(r.id, [3, -4, 5], dt); releaseQueued(dt);
    assert.equal(moving.packets.length, baseline.length, r.id + ' same admitted volley size');
    assert.ok(baseline.length > 0, r.id + ' birth packets exist');
    const spec = r.parameters.spl__SpawnBulletAdditionMovePlayerParam;
    for (let i = 0; i < baseline.length; i++) {
      const b = baseline[i], row = moving.packets[i];
      assert.deepEqual([row.unit, row.index], [b.unit, b.index], r.id + ' per-unit birth order');
      close(row.velocity.x - b.v.x, Number.isFinite(spec.XRate) ? 3 * spec.XRate : 0, r.id + ' X');
      close(row.velocity.y - b.v.y, Number.isFinite(spec.YMinusRate) ? -4 * spec.YMinusRate : 0, r.id + ' Y');
      close(row.velocity.z - b.v.z, Number.isFinite(spec.ZRate) ? 5 * spec.ZRate : 0, r.id + ' Z');
      assert.equal(row.delay, 0, r.id + ' wire birth has no second source delay');
      assert.ok(row.wire, r.id + ' real recorder accepts complete source packet');
    }
  }
});

test('actual delayed Slosher queue samples moving/falling owner at birth and records no premature packet', () => {
  const row = MAIN_WEAPON_CATALOG.records.find(r => !r.legacy && r.family === 'slosher' &&
    r.parameters.UnitGroupParam.Unit.some(u => u.UnitDelayFrame > 0 || u.AfterOffsetDelayFrame > 0));
  assert.ok(row, 'source-backed delayed Slosher exists');
  const born = spawnBatch(row.id, [0, 0, 0]);
  const pending = born.queued.filter(p => p.delay > 0);
  assert.ok(pending.length > 0);
  assert.equal(born.packets.length, born.queued.length - pending.length, 'only true-born globs were sent');
  const before = new Map(pending.map(p => [p, p.vel.clone()]));
  born.a.vel.set(0, -6, 7); born.a.pos.set(4, 20, 5); born.a.character.root.position.copy(born.a.pos);
  releaseQueued();
  const spec = row.parameters.spl__SpawnBulletAdditionMovePlayerParam;
  for (const p of pending) {
    const sent = born.packets.filter(row => row.p === p);
    assert.equal(sent.length, 1, row.id + ' pending glob published once');
    close(sent[0].velocity.y - before.get(p).y, Number.isFinite(spec.YMinusRate) ? -6 * spec.YMinusRate : 0);
    close(sent[0].velocity.z - before.get(p).z, Number.isFinite(spec.ZRate) ? 7 * spec.ZRate : 0);
    assert.ok(sent[0].start.x > 3, 'true birth uses the moved muzzle');
  }
});

test('actual cancelled delayed wave cannot emit a late projectile or movement packet', () => {
  const row = explicit.find(r => r.family === 'slosher' && r.parameters.UnitGroupParam.Unit.some(u => u.UnitDelayFrame > 0 || u.AfterOffsetDelayFrame > 0));
  for (const reason of ['sub', 'reset', 'dead', 'switch']) {
    const born = spawnBatch(row.id, [0, 0, 0]);
    const pending = born.queued.filter(p => p.delay > 0), sentBefore = born.packets.length;
    assert.ok(pending.length > 0);
    if (reason === 'sub') { born.a.intent.sub = true; born.a.weaponRunner.update(1 / 60, { fire: false, sub: true, subReleased: false }); }
    if (reason === 'reset') born.a.weaponRunner.reset();
    if (reason === 'dead') born.a.alive = false;
    if (reason === 'switch') born.a.setWeapon('shooter');
    releaseQueued();
    assert.equal(born.packets.length, sentBefore, reason + ' cancels delayed birth recording');
    assert.ok(pending.every(p => !ps.list.includes(p)), reason + ' retires every pending glob');
  }
});

test('real catalog network replay consumes transmitted velocity without applying remote motion again', () => {
  const born = spawnBatch('s3-shooter-expert', [0, 0, 5]), sent = born.packets[0];
  assert.ok(sent?.wire);
  const remote = f.make('s3-shooter-expert'); remote.remote = true; remote.vel.set(50, 80, 100);
  ps.ghostProjectile(remote, sent.wire);
  const ghost = ps.list.at(-1); assert.ok(ghost.ghost && ghost.catalog);
  const before = ghost.vel.clone(), count = born.packets.length;
  assert.equal(f.applyCatalogPlayerVelocity(ghost), false);
  close(ghost.vel.distanceTo(before), 0);
  assert.equal(born.packets.length, count);
  assert.equal(ghost.catalog.birthPending, undefined, 'replay starts from actual transmitted birth');
  assert.deepEqual(Array.from(ghost.vel.toArray()), sent.wire.slice(8, 11));
});
