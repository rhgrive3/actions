import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { gearCurve } from '../runtime/gear.mjs';

const loadout = (ability, points = 57) => {
  const parts = Array.from({ length: 3 }, () => ({ main: 'none', subs: ['none', 'none', 'none'] }));
  if (points === 57) for (const part of parts) { part.main = ability; part.subs.fill(ability); }
  else if (points === 10) parts[0].main = ability;
  return parts;
};

test('actual equipped Splatling uses its 1.35 firing override without altering another actor', async () => {
  const f = await fixture(), spinner = f.make('splatling'), shooter = f.make('shooter');
  for (const a of [spinner, shooter]) { a.s3.loadout = loadout('runSpeed'); a.setWeapon(a.weaponId); a.weaponRunner.firingT = 1; }
  assert.ok(Math.abs(spinner.weaponRunner.moveSpeed() - spinner.weapon.moveSpeedFiring * 1.35) < 1e-9);
  assert.ok(Math.abs(shooter.weaponRunner.moveSpeed() - shooter.weapon.moveSpeedFiring * 1.25) < 1e-9);
  spinner.s3.loadout = loadout('runSpeed', 10); spinner.setWeapon('splatling'); spinner.weaponRunner.firingT = 1;
  const ratio = gearCurve(10, 1, 1.175, 1.35);
  assert.ok(Math.abs(spinner.weaponRunner.moveSpeed() - spinner.weapon.moveSpeedFiring * ratio) < 1e-9);
  assert.equal(shooter.s3.modifiers.runSpeedFiring, 1.25);
});

test('actual blaster connects zero ground spread and its distinct Action Intensify curve', async () => {
  const f = await fixture(), a = f.make('blaster'), r = a.weaponRunner;
  assert.equal(r._spreadDeg(a.weapon), 0);
  a.grounded = false; assert.equal(r._spreadDeg(a.weapon), 10);
  a.s3.loadout = loadout('actionIntensify', 10); a.setWeapon('blaster');
  const expected = 10 * (1 - gearCurve(10, 0, .5, 1));
  assert.ok(Math.abs(r._spreadDeg(a.weapon) - expected) < 1e-9);
  assert.notEqual(r._spreadDeg(a.weapon), 10 * (1 - gearCurve(10, 0, .75, 1)));
  a.s3.loadout = loadout('actionIntensify'); a.setWeapon('blaster');
  assert.equal(r._spreadDeg(a.weapon), 0);
});

test('actual Flow accumulates preparation but activates on a splat and paints only state events', async () => {
  const f = await fixture(), a = f.make(), b = f.make(); b.team = 1;
  const paints = []; f.G.paint.splat = (...args) => { paints.push(args); return 0; };
  f.emit('turf', { actor: a, area: 10000 });
  f.emit('damage', { victim: b, attacker: a, amount: 100, source: 'shooter' });
  assert.equal(a.s3.flow.active, false); assert.equal(paints.length, 0);
  f.emit('splatted', { victim: b, attacker: a });
  assert.equal(a.s3.flow.active, true); assert.equal(paints.length, 1);
  const initialTime = a.s3.flow.remaining; f.tick(a, 60);
  assert.ok(a.s3.flow.remaining < initialTime); assert.equal(paints.length, 1);
  f.emit('splatted', { victim: b, attacker: a });
  assert.equal(paints.length, 2);
  assert.equal(paints[0][1], f.profile.flow.paintRadius);
});

test('actual Flow uses hostile damage credit for an assist extension', async () => {
  const f = await fixture(), helper = f.make(), killer = f.make(), victim = f.make(); victim.team = 1;
  helper.s3.flow.active = true; helper.s3.flow.remaining = 10;
  let paints = 0; f.G.paint.splat = () => { paints++; return 0; };
  f.emit('damage', { victim, attacker: helper, amount: 20, source: 'shooter' });
  f.emit('splatted', { victim, attacker: killer });
  assert.equal(helper.s3.flow.remaining, 20); assert.equal(paints, 1);
  assert.equal(helper.s3.splatsThisLife || 0, 0);
});

test('actual quick respawn requires consecutive lives without a splat and ignores assists', async () => {
  const f = await fixture(), a = f.make(), ally = f.make(), victim = f.make(); victim.team = 1;
  a.s3.loadout = loadout('quickRespawn'); a.setWeapon('shooter');
  a.splat(null); const ordinary = a.respawnTimer;
  a.reset(); f.emit('damage', { victim, attacker: a, amount: 20, source: 'shooter' });
  f.emit('splatted', { victim, attacker: ally });
  assert.equal(a.s3.splatsThisLife || 0, 0);
  a.splat(null); assert.ok(a.respawnTimer < ordinary);
  a.reset(); f.emit('splatted', { victim, attacker: a }); a.splat(null);
  assert.equal(a.respawnTimer, ordinary);
});

test('actual Splat Bomb bands respect cover and never damage teammates', async () => {
  const f = await fixture(), a = f.make(), near = f.make(), far = f.make(), ally = f.make();
  near.team = far.team = 1; near.pos.set(0, 0, 3); far.pos.set(0, 0, 5); ally.pos.set(0, 0, 3);
  f.G.actors = [a, near, far, ally];
  const system = new f.Projectiles(new f.THREE.Scene()), hits = [];
  system.applyHit = (_owner, target, damage) => hits.push({ target, damage });
  system._explodeBomb({ owner: a, team: a.team, pos: new f.THREE.Vector3() });
  assert.deepEqual(hits.map(hit => [hit.target, hit.damage]), [[near, 180], [far, 30]]);
  hits.length = 0; f.G.physics.los = () => false;
  system._explodeBomb({ owner: a, team: a.team, pos: new f.THREE.Vector3() });
  assert.equal(hits.length, 0);
});

test('actual Splat Bomb waits for ground contact before starting its 60-frame fuse', async () => {
  const f = await fixture(), a = f.make(); a.isLocal = true;
  f.G.camera = new f.THREE.PerspectiveCamera(); f.G.camera.position.set(0, 4, 0);
  const system = new f.Projectiles(new f.THREE.Scene());
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  system.throwBomb(a); const bomb = system.bombs[0];
  for (let i = 0; i < 10; i++) system._updateBombs(1 / 60);
  assert.equal(bomb.fuse, -1);
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = true; hit.point.set(0, 0, 0); hit.normal.set(0, 1, 0); return hit; };
  system._updateBombs(1 / 60); assert.ok(Math.abs(bomb.fuse - 59 / 60) < 1e-9);
  let bursts = 0; system._explodeBomb = () => bursts++;
  for (let i = 0; i < 58; i++) system._updateBombs(1 / 60);
  assert.equal(bursts, 0); system._updateBombs(1 / 60); assert.equal(bursts, 1);
});
