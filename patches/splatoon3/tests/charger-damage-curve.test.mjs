import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptSource, replaceOnce } from '../adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const near = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

function legacyDamageAdapter(rel, source) {
  const adapted = adaptSource(rel, source);
  return rel === 'src/game/weapons.js'
    ? replaceOnce(adapted, 'chargerDamage(a, w, charge)', 'lerp(w.damageMin, w.damagePartialMax, charge)', 'pre-curve-fix damage reference')
    : adapted;
}

async function releaseAt(f, frames, renderHz) {
  const { G, THREE } = f;
  G.camera = { position: new THREE.Vector3(0, 20, 0) };
  G.physics.los = () => true;
  const rayRanges = [];
  G.physics.raycast = (_from, _dir, range, hit) => { rayRanges.push(range); hit.hit = false; return hit; };
  const actor = f.make('charger'), target = f.make('shooter'), hits = [];
  actor.isLocal = true;
  actor.aimDir.set(0, 0, 1); actor.aimPoint.set(0, 1.05, 100);
  target.team = 1; target.pos.set(0, 0, 3); target.hp = 1000; target.invuln = 0;
  G.actors = [actor, target];
  const projectiles = new f.Projectiles(new THREE.Scene());
  projectiles.applyHit = (_owner, victim, damage) => hits.push({ victim, damage });
  G.projectiles = projectiles;

  let shotRange = null;
  let chargeProgressAtShot = null, chargeAtShot = null;
  const fireCharger = projectiles.fireCharger;
  projectiles.fireCharger = function (...args) {
    chargeProgressAtShot = actor.weaponRunner.chargeT;
    chargeAtShot = actor.weaponRunner.charge;
    const result = fireCharger.apply(this, args);
    shotRange = rayRanges.find(range => range >= actor.weapon.rangeMin && range <= actor.weapon.rangeMax) ?? null;
    return result;
  };
  actor.intent.fire = true;
  const clock = new FixedClock(), targetChargeTime = frames / 60;
  for (let render = 0; !hits.length && render < renderHz * 2; render++) clock.advance(1 / renderHz, () => {
    if (hits.length) return;
    f.tick(actor);
    if (actor.intent.fire && actor.weaponRunner.chargeT * actor.weapon.chargeTime + 1e-10 >= targetChargeTime) actor.intent.fire = false;
  });
  assert.equal(hits.length, 1, 'the actual native Charger beam reaches the target capsule');
  assert.equal(hits[0].victim, target);
  near(chargeProgressAtShot * actor.weapon.chargeTime, targetChargeTime);
  return { damage: hits[0].damage, range: shotRange, charge: chargeAtShot };
}

test('native Splat Charger damage uses the sourced minimum and partial slope without changing range', async () => {
  const beforeFix = await fixture({ adapt: legacyDamageAdapter });
  const oldEight = await releaseAt(beforeFix, 8, 60);
  near(oldEight.damage, 46.6666666667);
  near(oldEight.charge, 1 / 6);

  const fixed = await fixture();
  for (const renderHz of [30, 60, 120]) {
    const eight = await releaseAt(fixed, 8, renderHz);
    const thirty = await releaseAt(fixed, 30, renderHz);
    const full = await releaseAt(fixed, 60, renderHz);
    near(eight.damage, 40);
    near(thirty.damage, 80);
    near(full.damage, 160);
    near(eight.range, oldEight.range);
    const expectedRange = fixed.profile.weapons.charger.rangeMin + (fixed.profile.weapons.charger.rangeMax - fixed.profile.weapons.charger.rangeMin) * thirty.charge;
    assert.ok(Math.abs(thirty.range - expectedRange) < 1e-7, JSON.stringify({ renderHz, actualRange: thirty.range, expectedRange, charge: thirty.charge, rangeMin: fixed.profile.weapons.charger.rangeMin, rangeMax: fixed.profile.weapons.charger.rangeMax }));
  }
  const nine = await releaseAt(fixed, 9, 60);
  near(nine.damage, 40 + (1 / 60) * 138.46);
});
