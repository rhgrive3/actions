import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { composeKits, VERIFIED_KITS, selectedSubCost } from '../runtime/kit-composition.mjs';
const reference = JSON.parse(fs.readFileSync(new URL('../reference/curated-numbers.json', import.meta.url)));
function registries() {
  return { WEAPONS: Object.fromEntries(['shooter','roller','charger','blaster'].map(id => [id,{id,sub:'bomb',special:'slam',specialCost:999}])),
    SUB: { bomb:{id:'bomb',inkCost:70}, suction:{id:'suction',inkCost:null,inkCostFallback:70}, curling:{id:'curling',inkCost:65} },
    SPECIALS: { trizooka:{id:'trizooka'}, bubbler:{id:'bubbler'}, inkVac:{id:'inkVac'} } };
}
test('all three required base kits agree with pinned extracted main rows', () => {
  const api=registries();composeKits(api);
  const rows={shooter:219,roller:133,charger:73};
  for (const [main,kit] of Object.entries(VERIFIED_KITS)) {
    const row=rows[main], prefix=`data/mush/1130/WeaponInfoMain.json#/${row}/`;
    assert.equal(reference.parameters[prefix+'__RowId'].value,kit.main);
    assert.equal(reference.parameters[prefix+'SpecialPoint'].value,kit.specialCost);
    assert.equal(api.WEAPONS[main].sub,kit.sub);assert.equal(api.WEAPONS[main].special,kit.special);
    assert.equal(api.WEAPONS[main].specialCost,kit.specialCost);
    const profile = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url)));
    assert.equal(profile.weapons[main].specialCost,kit.specialCost);
  }
  assert.equal(api.WEAPONS.blaster.kitStatus,'original-inkwave-kit');
  assert.equal(api.WEAPONS.blaster.special,'slam');
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
