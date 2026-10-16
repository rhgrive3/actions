import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const {AP,R,ALTERNATE_WEAPON_KITS}=await fixture({extraExports:"export * as AP from './patches/splatoon3/runtime/weapon-appearance.mjs';export * as R from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';"});
const rows=['Brush_Heavy_01','Brush_Heavy_02','Slosher_Double_01','Slosher_Diffusion_02'];
function store(initial=null){let raw=initial;const make=()=>({getItem:k=>{assert.equal(k,AP.WEAPON_APPEARANCE_STORAGE_KEY);return raw;},setItem:(k,v)=>{assert.equal(k,AP.WEAPON_APPEARANCE_STORAGE_KEY);raw=v;}});return {open:make,raw:()=>raw};}
test('four new defaults persist explicit Base and manual preference through new storage handles',()=>{
 assert.equal(R.registeredWeaponVariantModels().length,75);assert.equal(AP.WEAPON_APPEARANCE_STORAGE_KEY,'inkwave.weapon-appearances.v1');
 for(const row of rows){const kit=ALTERNATE_WEAPON_KITS.find(k=>k.main===row);assert.ok(kit);const s=store();
  assert.equal(AP.weaponAppearancePreference(kit.id,s.open()),null);assert.equal(AP.selectedWeaponAppearance(kit.id,s.open()),row);
  AP.setWeaponAppearance(kit.id,kit.baseId,s.open());assert.deepEqual(JSON.parse(s.raw()),{[kit.baseId]:kit.baseId});assert.equal(AP.selectedWeaponAppearance(kit.id,s.open()),kit.baseId);
  AP.setWeaponAppearance(kit.id,row,s.open());assert.deepEqual(JSON.parse(s.raw()),{[kit.baseId]:row});assert.equal(AP.selectedWeaponAppearance(kit.id,s.open()),row);
  AP.setWeaponAppearance(kit.id,'',s.open());assert.deepEqual(JSON.parse(s.raw()),{});assert.equal(AP.weaponAppearancePreference(kit.id,s.open()),null);assert.equal(AP.selectedWeaponAppearance(kit.id,s.open()),row);
 }
});
test('all94 historical saved manual rows survive read/reopen and unrelated preference writes',()=>{
 const all=R.registeredWeaponVariants();assert.equal(all.length,94);
 for(const row of all){const base=R.weaponVariantSpec(row).baseId,kit=ALTERNATE_WEAPON_KITS.find(k=>k.baseId===base);assert.ok(kit);const raw=JSON.stringify({[base]:row}),s=store(raw);
  assert.equal(AP.weaponAppearancePreference(kit.id,s.open()),row);assert.equal(AP.selectedWeaponAppearance(kit.id,s.open()),row);assert.equal(s.raw(),raw,'read does not rewrite saved bytes');
  assert.ok(AP.weaponAppearanceOptions(kit.id).some(x=>x.id===row));
  const other=ALTERNATE_WEAPON_KITS.find(k=>k.baseId!==base);AP.setWeaponAppearance(other.id,other.baseId,s.open());assert.equal(JSON.parse(s.raw())[base],row);assert.equal(AP.selectedWeaponAppearance(kit.id,s.open()),row);
 }
});
test('malformed, wrong-family and removed settings fail closed to each new default',()=>{
 for(const row of rows){const kit=ALTERNATE_WEAPON_KITS.find(k=>k.main===row),wrong=R.registeredWeaponVariants().find(x=>R.weaponVariantSpec(x).baseId!==kit.baseId);
  for(const raw of ['{broken','[]',JSON.stringify({[kit.baseId]:'removed-row'}),JSON.stringify({[kit.baseId]:wrong})]){const s=store(raw);assert.equal(AP.weaponAppearancePreference(kit.id,s.open()),null);assert.equal(AP.selectedWeaponAppearance(kit.id,s.open()),row);}
 }
});
