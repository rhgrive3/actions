import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { adaptSource, checkCompatibility } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

import { realCharacter } from './real-character-fixture.mjs';
function start(f, a, vertical, dt = 1 / 60) {
  a.grounded = !vertical;
  a.weaponRunner.update(dt, { fire: true, firePressed: true });
}

test('simultaneous jump and fire go through actual Actor and retain vertical mode on landing', async () => {
  const f = await fixture(), a = f.make('roller');
  a.intent.jump = true; a.intent.fire = true; f.tick(a);
  assert.equal(a.weaponRunner.s3FlickVertical, true);
  assert.equal(a.weaponRunner.s3RollerAttack.elapsed, 0);
  a.grounded = true; a.intent.jump = false;
  f.tick(a, 25); assert.equal(f.shots.length, 0);
  f.tick(a); assert.equal(f.shots.length, 1);
  assert.equal(f.shots[0].windup, 26 / 60);
  assert.equal(a.weaponRunner.s3RollerAttack.vertical, true);
});
test('horizontal/vertical windups release on 21/26 elapsed ticks without an extra float tick', async () => {
  for (const vertical of [false, true]) for (const dt of [1 / 60, 1 / 120]) {
    const f = await fixture(), a = f.make('roller'); start(f, a, vertical, dt);
    const ticks = Math.round((vertical ? a.weapon.verticalWindup : a.weapon.flickWindup) / dt);
    for (let i = 0; i < ticks - 1; i++) a.weaponRunner.update(dt, { fire: false });
    assert.equal(f.shots.length, 0);
    a.weaponRunner.update(dt, { fire: false }); assert.equal(f.shots.length, 1);
    assert.ok(Math.abs(a.ink - 91.5) < 1e-9);
    assert.equal(a.weaponRunner.s3RollerAttack.released, true);
  }
});
test('jump after starting a horizontal attack keeps its selected mode; the next attack reselects', async () => {
  const f = await fixture(), a = f.make('roller'), r = a.weaponRunner;
  start(f, a, false); a.grounded = false;
  for (let i = 0; i < 42; i++) r.update(1 / 60, { fire: false });
  assert.equal(r.s3FlickVertical, false); assert.equal(f.shots.length, 1);
  r.update(1 / 60, { fire: true, firePressed: true });
  assert.equal(r.s3FlickVertical, true); assert.equal(r.s3RollerAttack.vertical, true);
  for (let i = 0; i < 26; i++) r.update(1 / 60, { fire: false });
  assert.equal(f.shots.length, 2);
});
test('a new flick lifts the rolling drum, a held trigger resumes rolling, release stops it', async () => {
  const f = await fixture(), a = f.make('roller'), r = a.weaponRunner;
  r.rolling = true; r.rollT = 2; start(f, a, false);
  assert.equal(r.rolling, false); assert.equal(r.rollT, 0);
  for (let i = 0; i < 21; i++) r.update(1 / 60, { fire: true });
  assert.equal(f.shots.length, 1);
  for (let i = 0; i < 20; i++) r.update(1 / 60, { fire: true });
  assert.equal(r.rolling, true); assert.equal(f.shots.length, 1);
  r.update(1 / 60, { fire: false }); assert.equal(r.rolling, false);
  r.reset(); assert.equal(r.s3RollerAttack, null); assert.equal(a.character.s3RollerFlick, null);
});
test('dry input does not create a phantom pose or spend ink', async () => {
  const f = await fixture(), a = f.make('roller'); a.ink = 2; start(f, a, true);
  assert.equal(a.weaponRunner.flick, -1); assert.equal(a.weaponRunner.s3RollerAttack, null);
  assert.equal(a.character.s3RollerFlick, null); assert.equal(a.ink, 2);
});
test('actual projectile path retains narrow vertical paint flight and one-attack damage aggregation', async () => {
  const f = await fixture(), a = f.make('roller'), system = new f.Projectiles(new f.THREE.Scene());
  const widths = [];
  for (const vertical of [false, true]) {
    system.list.length = 0; a.weaponRunner.s3FlickVertical = vertical;
    system.fireFlick(a, a.weapon);
    const drops = [...system.list]; assert.equal(drops.length, vertical ? 5 : 12);
    assert.ok(drops.every(p => p.s3Vertical === vertical && p.grav === a.weapon.flickGravity && p.drag === a.weapon.flickDrag));
    assert.ok(drops.every(p => p.trailRadius > 0 && p.radius > 0));
    widths.push(Math.max(...drops.map(p => Math.abs(Math.atan2(p.vel.x, p.vel.z)))));
    const victim = {}, hits = []; system.applyHit = (_owner, _victim, amount) => hits.push(amount);
    for (const p of drops) f.applyProjectileHit(system, p, victim, 999, p.start.clone().add(new f.THREE.Vector3(0, 0, 5.2)));
    assert.equal(hits.length, 1, 'several globs cannot multiply one swing into several maximum hits');
    assert.ok(vertical ? hits[0] === 150 : hits[0] < 150);
  }
  assert.ok(widths[1] < .03, 'vertical launch stays in a narrow forward line');
  assert.ok(widths[0] > .2, 'horizontal launch retains its fan');
});
test('actual bones and weapon rotate vertically and the drum impulse waits for gameplay release', async () => {
  const f = await fixture(), { Character, CHARACTER_CHANNELS: C } = await realCharacter();
  const a = new f.Actor({ team: 0, name: 'actual roller rig', weapon: 'roller', CharacterClass: Character });
  const c = a.character, r = a.weaponRunner;
  start(f, a, true);
  const frames = [], state = { form: 'kid', grounded: false, speed: 0, vy: 0, firing: true, rolling: false, localMove: { x: 0, z: 0 } };
  for (let i = 0; i < 48; i++) {
    if (i) r.update(1 / 60, { fire: false });
    if (i === 20) { state.grounded = true; c.trigger('land', 7.5); }
    c.update(1 / 60, state); c.root.updateMatrixWorld(true);
    frames.push({ drum: c.weapon.drumW, angle: c.P[C.ANCR + 2], arm: c.bones.handR.getWorldPosition(a.pos.clone()), weapon: c.weapon.drum.getWorldPosition(a.pos.clone()), bottom: new f.THREE.Box3().setFromObject(c.weapon.drum).min.y });
  }
  assert.ok(frames[18].angle > 1.4, 'drum axis is rotated upright before release');
  assert.equal(frames[25].drum, 0, 'no 0.15s visual impulse during windup');
  assert.ok(frames[26].drum > 30, 'drum spins on the actual 26F release');
  assert.ok(frames[18].weapon.distanceTo(frames[26].weapon) > .35, 'full weapon rig follows the downward swing');
  assert.ok(frames[18].arm.distanceTo(frames[26].arm) > .12, 'arm bones follow the grip IK');
  for (const frame of frames) for (const vec of [frame.arm, frame.weapon]) assert.ok(vec.toArray().every(Number.isFinite));
  assert.ok(frames.slice(26).every(frame => frame.bottom >= -.02), 'the upright drum clears the floor during landed recovery');
  assert.ok(Math.abs(frames[47].angle) < .4, 'recovery returns to the carry/roll orientation');
  a.setWeapon('shooter'); assert.equal(c.s3RollerFlick, null);
});
test('Character channel/drum hooks are hash locked and fail closed', () => {
  assert.doesNotThrow(() => checkCompatibility(path.join(ROOT, 'inkwave-public')));
  for (const name of ['character.js', 'character-weapons.js']) assert.throws(() => adaptSource('src/game/' + name, ''), /conflict/);
});
