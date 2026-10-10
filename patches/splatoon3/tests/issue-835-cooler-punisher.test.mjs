// #835: Nintendo's Splatoon 3 Ver.2.1.0 Tacticooler exception:
// https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257
// Drink Quick Respawn/Special Saver cannot be negated by RP/Haunt, while RP
// still increases respawn time and Special Gauge lost. Production kits do not
// currently offer a drink, so explicitly exercise the future authoritative flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './clothing-gear-fixture.mjs';
import { emptyLoadout, gearCurve } from '../runtime/gear.mjs';
import { deathGearPenalty, tacticoolerDrinkActive } from '../runtime/clothing-gear.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, String(a) + ' != ' + String(b));
async function actors() {
  const f = await fixture();
  f.profile.flow.threshold = 1e6;
  f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3()];
  const victim = f.make(), attacker = f.make();
  victim.s3.loadout = emptyLoadout(); attacker.s3.loadout = emptyLoadout();
  attacker.team = 1;
  return { f, victim, attacker };
}
test('#835 drink flag requires an explicit authoritative active state', () => {
  assert.equal(tacticoolerDrinkActive({ s3: { drink: true } }), true);
  assert.equal(tacticoolerDrinkActive({ s3: { tacticooler: true } }), true);
  assert.equal(tacticoolerDrinkActive({ s3: { cooler: true } }), true);
  assert.equal(tacticoolerDrinkActive({ s3: { drink: false, cooler: { active: false } } }), false);
  assert.equal(tacticoolerDrinkActive({ s3: {} }), false);
});
test('#835 real RP death retains the 57 AP drink while charging extra death penalties', async () => {
  const { f, victim: v, attacker: a } = await actors();
  a.s3.loadout[1].main = 'respawnPunisher'; a.setWeapon(a.weaponId);
  v.s3.drink = true; v.special = 80;
  v.s3.quickRespawnHistory.seenEnemyDeath = false;
  v.splat(a, 'weapon');
  const p = v.s3.lastDeathGear;
  assert.equal(p.cooler, true); assert.equal(p.incoming, true);
  assert.equal(p.qrAP, 57); assert.equal(p.saverAP, 57);
  assert.equal(p.frames, f.profile.clothingGear.respawnPunisher.targetFrames);
  near(v.respawnTimer, f.PLAYER.respawnTime - p.quickReduction + p.frames / 60);
  near(v.special, 80 * Math.max(0, gearCurve(57, ...f.profile.gear.specialSaver) - p.loss));
  assert.ok(v.respawnTimer < f.PLAYER.respawnTime + p.frames / 60,
    'drink still shortens a punished first death');
});
test('#835 without drink, first death remains ineligible for ordinary Quick Respawn', async () => {
  const { f, victim: v, attacker: a } = await actors();
  a.s3.loadout[1].main = 'respawnPunisher'; a.setWeapon(a.weaponId);
  v.special = 80; v.splat(a, 'weapon');
  const p = v.s3.lastDeathGear;
  assert.equal(p.cooler, false); assert.equal(p.qrAP, 0);
  near(v.respawnTimer, f.PLAYER.respawnTime + p.frames / 60);
  near(v.special, 80 * Math.max(0, gearCurve(0, ...f.profile.gear.specialSaver) - p.loss));
});
test('#835 own RP wearer with drink retains 57 AP but still suffers self penalty', async () => {
  const { f, victim: v, attacker: a } = await actors();
  v.s3.loadout[1].main = 'respawnPunisher'; v.setWeapon(v.weaponId);
  v.s3.drink = true; v.special = 80; v.splat(a, 'weapon');
  const p = v.s3.lastDeathGear;
  assert.equal(p.cooler, true); assert.equal(p.self, true);
  assert.equal(p.qrAP, 57); assert.equal(p.saverAP, 57);
  near(v.respawnTimer, f.PLAYER.respawnTime - p.quickReduction + p.frames / 60);
  near(v.special, 80 * Math.max(0, gearCurve(57, ...f.profile.gear.specialSaver) - p.loss));
});
test('#835 RP and drink do not bypass environmental attribution rules', async () => {
  const { f, victim: v, attacker: a } = await actors();
  a.s3.loadout[1].main = 'respawnPunisher'; a.setWeapon(a.weaponId);
  const ordinary = deathGearPenalty(v, a, 'water', f.profile, {}, gearCurve);
  assert.equal(ordinary.incoming, false); assert.equal(ordinary.frames, 0);
  v.s3.drink = true;
  const drink = deathGearPenalty(v, a, 'water', f.profile, {}, gearCurve);
  assert.equal(drink.incoming, false); assert.equal(drink.frames, 0);
  assert.equal(drink.qrAP, 57); assert.equal(drink.saverAP, 57);
});
