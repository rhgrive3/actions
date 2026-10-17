import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
// Standalone Node CI intentionally has no node_modules/three; the production source
// fixture resolves the pinned vendored Three and follows normal runtime composition.
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,
 extraExports:"export * as R from './patches/splatoon3/runtime/weapon-models/registry.mjs';export * as AP from './patches/splatoon3/runtime/weapon-appearance.mjs';export {VARIANT_MODELS} from './patches/splatoon3/runtime/weapon-models/shooter-blaster-variants.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';"});
const {R,AP,VARIANT_MODELS,ALTERNATE_WEAPON_KITS}=f;
const rows=['Shooter_First_01','Shooter_Normal_01','Shooter_Normal_02'];
for(const row of rows)test(row+' reuses saved builder and preserves explicit Base/manual/default migration',()=>{
 const kit=ALTERNATE_WEAPON_KITS.find(k=>k.main===row),base=kit.baseId;
 assert.equal(R.registeredWeaponVariantModels().length,87);assert.equal(R.registeredWeaponVariants().length,94);assert.equal(R.registeredWeaponModels().length,65);
 assert.equal(R.weaponVariantSpec(row).build,VARIANT_MODELS[row].build);assert.equal(R.weaponDefaultAppearance(kit.id),row);assert.equal(R.weaponModelKey(kit.id),row);assert.equal(R.weaponBaseModelId(kit.id),base);
 for(const preference of [base,row,null]){
  let raw=JSON.stringify(preference===null?{}:{[base]:preference});const initial=raw;const storage=()=>({getItem:()=>raw,setItem:(_key,v)=>{raw=v;}});
  assert.equal(AP.selectedWeaponAppearance(kit.id,storage()),preference??row);assert.equal(AP.weaponAppearancePreference(kit.id,storage()),preference);assert.equal(raw,initial,'reading old storage does not rewrite it');
  for(const id of [base,row,'']){AP.setWeaponAppearance(kit.id,id,storage());assert.equal(AP.selectedWeaponAppearance(kit.id,storage()),id||row);assert.deepEqual(JSON.parse(raw),id?{[base]:id}:{});}
 }
 for(const raw of ['{broken',JSON.stringify({[base]:'removed-row'})])assert.equal(AP.selectedWeaponAppearance(kit.id,{getItem:()=>raw}),row);
 const opts=AP.weaponAppearanceOptions(kit.id,'en');assert.ok(opts.some(x=>x.id===''));assert.ok(opts.some(x=>x.id===base));assert.ok(opts.some(x=>x.id===row));AP.setWeaponAppearance(kit.id,'',null);
});
test('all 94 old manual preferences remain readable without storage mutation',()=>{for(const row of R.registeredWeaponVariants()){const base=R.weaponVariantSpec(row).baseId,kit=ALTERNATE_WEAPON_KITS.find(k=>k.baseId===base);const raw=JSON.stringify({[base]:row});assert.equal(AP.selectedWeaponAppearance(kit.id,{getItem:()=>raw,setItem(){throw Error('read must not write')}}),row);}});
