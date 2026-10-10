import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { flowAbilityPoints, FLOW_ABILITIES } from '../runtime/flow-effects.mjs';
import { gearCurve, emptyLoadout } from '../runtime/gear.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function equip(a, ability, ap) {
  const loadout = emptyLoadout();
  if (ap === 27) for (const part of loadout) part.subs.fill(ability);
  if (ap === 57) for (const part of loadout) { part.main = ability; part.subs.fill(ability); }
  a.s3.loadout = loadout; a.setWeapon(a.weaponId);
}
function activate(f, a) {
  const victim = f.make(); victim.team = 1 - a.team;
  f.emit('turf', { actor: a, area: 10000 });
  f.emit('splatted', { attacker: a, victim });
  assert.equal(a.s3.flow.active, true);
}
function snapshot(a) {
  const m = a.s3.modifiers;
  return Object.fromEntries(['runSpeed', 'swimSpeed', 'enemyDamageCap', 'enemyDamageRate', 'enemyJumpVelocity', 'rollRetention', 'surgeChargeScale', 'runSpeedFiring', 'actionAirSpread'].map(k => [k, m[k]]));
}
test('Flow adds only its four abilities, caps each at 57 and never edits permanent AP', () => {
  const base = { runSpeed: 27, swimSpeed: 57, inkSaverMain: 10 }, before = { ...base };
  const ap = flowAbilityPoints(base, true, 30);
  assert.deepEqual(base, before);
  assert.deepEqual(ap, { runSpeed: 57, swimSpeed: 57, inkSaverMain: 10, inkResistance: 30, actionIntensify: 30 });
  assert.deepEqual(flowAbilityPoints(base, false, 30), base);
});
test('real activation updates every published movement modifier once, immediately', async () => {
  const f = await fixture(), a = f.make('blaster'), other = f.make('blaster');
  const base = snapshot(a), untouched = snapshot(other), weapon = a.weapon, runner = a.weaponRunner;
  runner.firingT = .23; runner.s3Stored = .6;
  const ink = a.ink, cost = a.specialCost();
  activate(f, a);
  for (const id of FLOW_ABILITIES) close(a.s3.modifiers[id], gearCurve(30, ...f.profile.gear[id]));
  assert.ok(a.s3.modifiers.enemyDamageRate < base.enemyDamageRate);
  assert.ok(a.s3.modifiers.enemyDamageCap < base.enemyDamageCap);
  assert.ok(a.s3.modifiers.enemyJumpVelocity > base.enemyJumpVelocity);
  assert.ok(a.s3.modifiers.rollRetention > base.rollRetention);
  assert.ok(a.s3.modifiers.surgeChargeScale < base.surgeChargeScale);
  close(a.weapon.spreadAir, 10 * (1 - gearCurve(30, 0, .5, 1)));
  assert.equal(a.weapon, weapon); assert.equal(a.weaponRunner, runner);
  assert.equal(runner.firingT, .23); assert.equal(runner.s3Stored, .6);
  assert.equal(a.ink, ink); assert.equal(a.specialCost(), cost);
  assert.deepEqual(snapshot(other), untouched);
  assert.equal(f.WEAPONS.blaster.spreadAir, 10);
});
test('27AP and 57AP plus Flow saturate at ordinary 57AP without multiplicative speed bonus', async () => {
  for (const id of FLOW_ABILITIES) for (const ap of [27, 57]) {
    const f = await fixture(), boosted = f.make('shooter'), maximum = f.make('shooter');
    equip(boosted, id, ap); equip(maximum, id, 57); activate(f, boosted);
    close(boosted.s3.modifiers[id], maximum.s3.modifiers[id]);
    if (id === 'runSpeed') close(boosted.weaponRunner.moveSpeed(), maximum.weaponRunner.moveSpeed());
    const basePoints = f.abilityPoints(boosted.s3.loadout); assert.equal(basePoints[id], ap);
  }
});
test('Flow extension, expiry, re-entry and equipment changes do not compound spread or replace weapon state', async () => {
  const f = await fixture(), a = f.make('blaster'); const base = snapshot(a);
  activate(f, a); const active = snapshot(a), spread = a.weapon.spreadAir;
  a.s3.flow.remaining = 10; const victim = f.make(); victim.team = 1;
  f.emit('splatted', { attacker: a, victim });
  assert.equal(a.s3.flow.remaining, Math.min(f.profile.flow.maxDuration,10+f.profile.flow.extension)); assert.deepEqual(snapshot(a), active); assert.equal(a.weapon.spreadAir, spread);
  a.s3.flow.remaining = 1 / 60; f.tick(a);
  assert.equal(a.s3.flow.active, false); assert.deepEqual(snapshot(a), base); assert.equal(a.weapon.spreadAir, 10);
  activate(f, a); assert.equal(a.weapon.spreadAir, spread);
  equip(a, 'actionIntensify', 27); assert.equal(a.weapon.spreadAir, 0);
  a.setWeapon('shooter'); close(a.s3.modifiers.actionAirSpread, 1);
  close(a.weapon.spreadAir, a.weapon.spreadGround);
});
test('current reset/death Flow policy is preserved and temporary effects never survive its clear', async () => {
  const f = await fixture(), a = f.make('blaster'); const base = snapshot(a);
  activate(f, a); a.reset();
  assert.equal(a.s3.flow.active, false); assert.deepEqual(snapshot(a), base);
  activate(f, a); const enemy = f.make(); enemy.team = 1;
  const active=snapshot(a);a.splat(enemy);assert.equal(a.s3.flow.active,true,'current306 retains active Flow through death');assert.deepEqual(snapshot(a),active);
  a.s3.flow.remaining=1/60;f.tick(a);assert.equal(a.s3.flow.active,false);assert.deepEqual(snapshot(a),base);assert.equal(a.weapon.spreadAir,10);
});
test('real enemy-ink resource consumer receives reduced rate and cap from Flow', async () => {
  const f = await fixture(), ordinary = f.make(), boosted = f.make(); activate(f, boosted);
  f.G.paint.sample = () => 2;
  for (const a of [ordinary, boosted]) { a.invuln = 0; a.grounded = true; a.form = 'kid'; a.hp = 100; f.updateResources(a, 1); }
  close(100 - ordinary.hp, 18);
  const r = f.profile.resources, rawRate = boosted.s3.modifiers.enemyDamageRate;
  const rate = r.enemyInkReferenceHz ? Math.floor(rawRate / r.enemyInkReferenceHz / r.enemyInkDamageQuantum + 1e-10) * r.enemyInkDamageQuantum * r.enemyInkReferenceHz : rawRate;
  close(100 - boosted.hp, rate * (1 - (boosted.s3.modifiers.enemyInkGrace || 0)));
  assert.ok(boosted.hp > ordinary.hp);
  f.updateResources(boosted, 10); close(100 - boosted.hp, boosted.s3.modifiers.enemyDamageCap);
});
test('actual surge charge and chained roll consume temporary Action Intensify', async () => {
  const f = await fixture(), a = f.make(), b = f.make(); activate(f, b);
  const frames = [];
  for (const actor of [a, b]) {
    actor.form = 'squid'; actor.climbing = true; actor.intent.jump = true;
    let n = 0; while (actor.s3.actions?.surge?.charge !== 1 && n < 100) { f.beforeActions(actor, 1 / 60, false); n++; }
    frames.push(n);
    actor.s3.actions.surge = null; actor.climbing = false; actor.submerged = true; actor.intent.jump = false;
    actor.vel.set(0, 0, 12); actor.intent.move.set(0, 0, -1);
    actor.s3.actions.chain = 1; actor.s3.actions.chainTimer = 1;actor.s3.actions.chainSpeed=12;
    f.beforeActions(actor, 1 / 60, true);
    close(Math.hypot(actor.vel.x, actor.vel.z), 12 * actor.s3.modifiers.rollRetention);
  }
  assert.equal(frames[0], 45); assert.ok(frames[1] < frames[0]);
});
test('fixed simulation schedules 30/60/120Hz see identical Flow expiry and restoration', async () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), a = f.make(); activate(f, a); a.s3.flow.remaining = .5;
    let accumulator = 0, ticks = 0, ended = 0;
    for (let frame = 0; frame < hz; frame++) {
      accumulator += 1 / hz;
      while (accumulator + 1e-10 >= 1 / 60) {
        f.tick(a); ticks++; accumulator -= 1 / 60;
        if (!ended && !a.s3.flow.active) ended = ticks;
      }
    }
    results.push({ ended, modifiers: snapshot(a) });
  }
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});