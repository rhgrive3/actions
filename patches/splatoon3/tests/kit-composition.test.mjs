import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { composeKits, VERIFIED_KITS, selectedSubCost, registerKitMetadata } from '../runtime/kit-composition.mjs';
const reference = JSON.parse(fs.readFileSync(new URL('../reference/kit-main-reference.json', import.meta.url)));
function registries() {
  return { WEAPONS: Object.fromEntries(['shooter','roller','charger','blaster'].map(id => [id,{id,sub:'bomb',special:'slam',specialCost:999}])),
    SUB: { bomb:{id:'bomb',inkCost:70}, suction:{id:'suction',inkCost:null,inkCostFallback:70}, curling:{id:'curling',inkCost:65}, autobomb:{id:'autobomb',inkCost:55} },
    SPECIALS: { trizooka:{id:'trizooka'}, bubbler:{id:'bubbler'}, inkVac:{id:'inkVac'} } };
}
test('all three required base kits agree with pinned extracted main rows', () => {
  const api=registries();composeKits(api);
  const expected = {
    shooter: { row:219, main:'Shooter_Normal_00', sub:'suction', special:'trizooka', specialCost:200, rawSub:'Bomb_Suction', rawSpecial:'SpUltraShot' },
    roller: { row:133, main:'Roller_Normal_00', sub:'curling', special:'bubbler', specialCost:180, rawSub:'Bomb_Curling', rawSpecial:'SpGreatBarrier' },
    charger: { row:73, main:'Charger_Normal_00', sub:'bomb', special:'inkVac', specialCost:190, rawSub:'Bomb_Splash', rawSpecial:'SpBlower' },
  };
  assert.deepEqual(Object.keys(VERIFIED_KITS).sort(), ['charger','roller','shooter'], 'literal required-kit denominator');
  const profile = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url)));
  const configured=registries();for(const [id,w]of Object.entries(profile.weapons))if(configured.WEAPONS[id])Object.assign(configured.WEAPONS[id],w);composeKits(configured);
  for (const [main, kit] of Object.entries(expected)) {
    const prefix=`data/mush/1130/WeaponInfoMain.json#/${kit.row}/`;
    assert.equal(reference.parameters[prefix+'__RowId'].value,kit.main);
    // PR1188: the pinned 11.3.0 row is current. Ver.7.2.0 raised Splattershot
    // to 210p and official Ver.11.1.0 notes lowered it back to 200p.
    assert.equal(reference.parameters[prefix+'SpecialPoint'].value,kit.specialCost);
    assert.equal(reference.parameters[prefix+'SubWeapon'].value,`Work/Gyml/${kit.rawSub}.spl__WeaponInfoSub.gyml`);
    assert.equal(reference.parameters[prefix+'SpecialWeapon'].value,`Work/Gyml/${kit.rawSpecial}.spl__WeaponInfoSpecial.gyml`);
    assert.deepEqual(VERIFIED_KITS[main], {main:kit.main,sub:kit.sub,special:kit.special,specialCost:kit.specialCost});
    assert.equal(api.WEAPONS[main].sub,kit.sub);assert.equal(api.WEAPONS[main].special,kit.special);
    assert.equal(api.WEAPONS[main].specialCost,kit.specialCost);
    assert.equal(configured.WEAPONS[main].specialCost,kit.specialCost);
  }
  assert.deepEqual(reference.officialHistory['Ver.11.1.0'].specialPointChanges.Shooter_Normal_00,[210,200]);
  // 11.3.0 Blaster installs both the source sub and special. The Autobomb
  // chasing curve is explicitly a calibration, not a decompiled game binary.
  assert.equal(api.WEAPONS.blaster.kitStatus,'partial-verified-kit');
  assert.equal(api.WEAPONS.blaster.special,'bubbler');assert.equal(api.WEAPONS.blaster.specialCost,190);
  assert.equal(api.WEAPONS.blaster.sub,'autobomb');assert.deepEqual(api.WEAPONS.blaster.kitVerifiedSlots,['sub','special']);
  const blasterRow='data/mush/1130/WeaponInfoMain.json#/19/';
  assert.equal(reference.parameters[blasterRow+'__RowId'].value,'Blaster_Middle_00');
  assert.equal(reference.parameters[blasterRow+'SpecialPoint'].value,190);
  assert.equal(reference.parameters[blasterRow+'SpecialWeapon'].value,'Work/Gyml/SpGreatBarrier.spl__WeaponInfoSpecial.gyml');
  assert.match(api.WEAPONS.blaster.blurb,/11.3.0 kit slots installed/);
});
test('missing implementation registration fails before any kit changes', () => {
  const api=registries();delete api.SPECIALS.inkVac;
  assert.throws(()=>composeKits(api),/incomplete/);
  assert.equal(api.WEAPONS.shooter.special,'slam');
});
test('selected cost honors explicit fallback and actor-local gear', () => {
  const api=registries();composeKits(api);
  assert.equal(selectedSubCost({weapon:api.WEAPONS.shooter},api.SUB),70);
  assert.equal(selectedSubCost({weapon:api.WEAPONS.roller,s3:{modifiers:{inkSaverSub:.8}}},api.SUB),52);
  assert.equal(api.SUB.curling.inkCost,65);
});

test('metadata cannot fabricate absent special mechanics or partially update existing registries', () => {
  const api = registries(); delete api.SPECIALS.trizooka;
  const original = JSON.stringify(api); assert.throws(() => registerKitMetadata(api), /Special mechanics not registered: trizooka/);
  assert.equal(JSON.stringify(api), original); assert.throws(() => composeKits(api), /incomplete/);
});
