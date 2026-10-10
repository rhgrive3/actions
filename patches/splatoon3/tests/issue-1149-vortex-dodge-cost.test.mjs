import test from 'node:test';
import assert from 'node:assert/strict';
import { specialEvidenceFixture } from './special-evidence-fixture.mjs';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
async function setup() {
  const f = await specialEvidenceFixture();
  const owner = f.make('charger'), victim = f.make('dualies');
  owner.aimDir.set(0, 0, 1); owner.aimYaw = owner.aimPitch = 0;
  owner.special = owner.specialCost(); owner._startSpecial();
  victim.team = 1; victim.pos.set(0, 0, 5); victim.intent.fire = true;
  assert.equal(f.inkVacActorContact(owner, victim), true);
  const base = victim.weapon.rollInk;
  const dodge = () => victim.weaponRunner.tryDodge(new f.THREE.Vector3(1, 0, 0));
  return { f, owner, victim, base, dodge };
}
test('#1149 negative control admits a base-cost dodge that the sourced 3.5x suppression rejects', async () => {
  const old = await setup(); old.victim.weaponRunner.inkVacDodgeInkCost = value => value;
  old.victim.ink = old.base * 3.5 - .01;
  assert.equal(old.dodge(), true); close(old.victim.ink, old.base * 2.5 - .01);
  const current = await setup(); current.victim.ink = current.base * 3.5 - .01;
  const before = current.victim.ink, rolls = current.victim.weaponRunner.rollsLeft;
  assert.equal(current.dodge(), false); close(current.victim.ink, before);
  assert.equal(current.victim.weaponRunner.rollsLeft, rolls); assert.equal(current.victim.weaponRunner.dodge, null);
});
test('#1149 exact sourced cost is checked and debited once without changing equipped gear cost', async () => {
  const { f, victim, base, dodge } = await setup();
  assert.equal(f.INK_VAC_CALIBRATION.actorDodgeInkCostScale, 3.5);
  victim.ink = base * 3.5;
  assert.equal(dodge(), true); close(victim.ink, 0); close(victim.weapon.rollInk, base);
  assert.equal(dodge(), false); close(victim.ink, 0);
});
test('#1149 contact filtering and release leave no sticky dodge-cost modifier', async () => {
  const { f, owner, victim, base, dodge } = await setup();
  for (const exit of [() => { victim.pos.z = -5; }, () => { victim.team = owner.team; },
    () => { f.G.physics.los = () => false; }, () => { f.disposeInkVac(owner); }]) {
    victim.weaponRunner.reset(); victim.intent.fire = true; victim.ink = base;
    exit(); assert.equal(dodge(), true); close(victim.ink, 0); close(victim.weapon.rollInk, base);
    victim.pos.z = 5; victim.team = 1; f.G.physics.los = () => true;
  }
});
test('#1149 remote cone suppresses only the locally-owned victim and overlapping cones do not stack cost', async () => {
  const { f, owner, victim, base, dodge } = await setup();
  f.disposeInkVac(owner); owner.remote = true; owner.owner = 'A'; owner.nid = 1;
  f.replayInkVac(f.INK_VAC_EVENTS.activation, owner, { actor: owner, kit: 'inkVac', serial: 50, power: 0, charge: 0 }, { from: 'A' });
  const other = f.make('charger'); other.pos.copy(owner.pos); other.aimDir.copy(owner.aimDir);
  other.special = other.specialCost(); other._startSpecial();
  victim.ink = 100; assert.equal(dodge(), true); close(victim.ink, 100 - base * 3.5);
  victim.weaponRunner.reset(); victim.remote = true; victim.intent.fire = true; victim.ink = 100;
  close(victim.weaponRunner.inkVacDodgeInkCost(base), base);
});
for (const hz of [30, 60, 120]) test(`#1149 ${hz}Hz rendered input schedule uses native Actor dodge admission at 3.5x cost`, async () => {
  const { f, victim, base } = await setup(); victim.ink = base * 3.5;
  victim.intent.move.set(1, 0, 0); victim.intent.jump = true;
  let acc = 0, ticks = 0;
  for (let frame = 0; frame < hz / 10; frame++) {
    acc += 1 / hz;
    while (acc + 1e-10 >= 1 / 60) {
      acc -= 1 / 60; f.tick(victim); ticks++; victim.intent.jump = false;
    }
  }
  assert.equal(ticks, 6); close(victim.ink, 0);
  assert.ok(victim.weaponRunner.dodge, 'native Actor accepted the dodge'); close(victim.weapon.rollInk, base);
});
test('#1149 sourced factor composes with current Ink Saver Main cost, without reducing it via Sub Resistance', async () => {
  const { victim, dodge, base } = await setup();
  victim.s3.loadout = [
    { main: 'inkSaverMain', subs: ['inkSaverMain', 'inkSaverMain', 'inkSaverMain'] },
    { main: 'subResistance', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
  ];
  victim.setWeapon('dualies'); victim.intent.fire = true;
  const equipped = victim.weapon.rollInk; assert.ok(equipped < base);
  victim.ink = equipped * 3.5; assert.equal(dodge(), true); close(victim.ink, 0);
  close(victim.weapon.rollInk, equipped);
});
