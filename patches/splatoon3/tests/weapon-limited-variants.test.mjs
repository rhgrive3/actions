import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
const R=await fixture({extraExports:`export {registeredWeaponVariantModels,registeredWeaponModels,weaponModelKey,weaponModelSpec,weaponModelFamily,weaponBehaviorFamily,weaponFamilyPose,weaponFamilyTrigger,weaponNeedsNativeCarry,weaponHold,buildWeaponModel} from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';`});
const {THREE,MAIN_WEAPON_CATALOG,ALTERNATE_WEAPON_KITS}=R;
const selected=R.registeredWeaponVariantModels(), geos=d=>[d.body,d.ink,...Object.values(d.parts||{}).map(p=>p.src)].filter(Boolean);
const digest=d=>geos(d).map(g=>{const h=crypto.createHash('sha256');for(const [k,a]of Object.entries(g.attributes)){h.update(k);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');});
const fresh=id=>({kind:R.weaponModelFamily(id),parts:{}}),dispose=d=>geos(d).forEach(g=>g.dispose());
test('exact thirty-three selected rows; all 65 main and 95 alternate families resolve without changing unselected keys',()=>{
 const rows=['Stringer_Normal_02','Charger_Quick_01','Maneuver_Short_02','Stringer_Short_02','Shelter_Normal_01','Slosher_Washtub_01','Shelter_Wide_01','Shelter_Wide_02','Shelter_Focus_01','Stringer_Short_01','Stringer_Normal_01','Stringer_Explosion_01','Roller_Heavy_01','Slosher_Diffusion_01','Shooter_Blaze_01','Shooter_QuickMiddle_01','Shooter_Short_01','Shooter_Precision_01','Saber_Heavy_01','Saber_Normal_01','Saber_Normal_02','Saber_Lite_02','Slosher_Launcher_01','Slosher_Bathtub_01','Charger_Normal_01','Charger_NormalScope_01','Charger_Long_01','Charger_LongScope_01','Charger_Keeper_01','Charger_Light_01','Charger_Pencil_01','Charger_Normal_02','Charger_NormalScope_02'];
 assert.deepEqual([...selected].sort(),rows.sort());assert.equal(MAIN_WEAPON_CATALOG.records.length,65);assert.equal(ALTERNATE_WEAPON_KITS.length,95);assert.equal(R.registeredWeaponModels().length,65);
 const records=new Map(MAIN_WEAPON_CATALOG.records.map(r=>[r.id,r]));let unselected=0;
 for(const row of [...MAIN_WEAPON_CATALOG.records,...ALTERNATE_WEAPON_KITS]){
  const base=records.get(row.baseId||row.id);assert(base);assert.equal(R.weaponModelFamily(row.id),base.modelKind);assert.equal(R.weaponBehaviorFamily(row.id),base.family);
  assert.equal(R.weaponFamilyPose(row.id),R.weaponFamilyPose(base.id));assert.equal(R.weaponFamilyTrigger(row.id),R.weaponFamilyTrigger(base.id));
  assert.equal(R.weaponNeedsNativeCarry(row.id),['brella','splatana','stringer','brush'].includes(base.family)||!!R.weaponModelSpec(row.id)?.nativeCarry);
  if(selected.includes(row.main))continue;
  if(row.main)unselected++;assert.equal(R.weaponModelKey(row.id),base.id);assert.equal(R.weaponModelSpec(row.id),R.weaponModelSpec(base.id));
 }assert.equal(unselected,62);
});
test('selected official aliases have one canonical key, spec, cached hold, build and native animation',()=>{
 for(const row of ALTERNATE_WEAPON_KITS.filter(r=>selected.includes(r.main))){
  assert.equal(R.weaponModelKey(row.id),row.main);assert.equal(R.weaponModelKey(row.main),row.main);assert.equal(R.weaponModelSpec(row.id),R.weaponModelSpec(row.main));
  const hold={pos:[1,2,3],nested:{a:1}};assert.equal(R.weaponHold(row.id,hold),R.weaponHold(row.main,hold));assert.equal(R.weaponHold(row.id,hold),R.weaponHold(row.id,hold));
  const a=R.buildWeaponModel(row.id,fresh(row.id)),b=R.buildWeaponModel(row.main,fresh(row.id));assert.deepEqual(digest(a),digest(b));assert.equal(a.kind,R.weaponModelFamily(row.id));assert.equal(a.modelId,row.baseId);assert.equal(a.modelVariantId,row.main);assert.equal(a.animate,b.animate);assert.deepEqual(a.gripL,b.gripL);assert.deepEqual(a.muzzle,b.muzzle);
  const w=d=>({def:d,ps:{},parts:Object.fromEntries(Object.entries(d.parts).map(([k,p])=>{const o=new THREE.Object3D();o.userData.rest=new THREE.Vector3(...(p.pivot||[0,0,0]));return[k,o];}))});const wa=w(a),wb=w(b);
  for(let i=0;i<120;i++){const st={dt:1/60,charge:(i%60)/60,sinceRelease:(i%30)/60,runner:{catalogState:{canopy:i<60?{open:true,launched:false}:null,naked:i<60?0:1}}};a.animate?.(wa,st);b.animate?.(wb,st);assert.deepEqual(wa.ps,wb.ps);for(const k of Object.keys(wa.parts)){assert.deepEqual(wa.parts[k].position,wb.parts[k].position);assert.deepEqual(wa.parts[k].scale,wb.parts[k].scale);assert.deepEqual(wa.parts[k].rotation.toArray(),wb.parts[k].rotation.toArray());assert.equal(wa.parts[k].visible,wb.parts[k].visible);}}
  dispose(a);dispose(b);
 }
});
test('native Brella and Stringer pose deltas survive variant keys; Squiffer stays unchanged',()=>{
 const C={ANC:0,ANCR:3,AFOLT:6,AFOLR:7,IKR:8,IKL:9,LTW:10,HIPS:11,SPINE:14,CHEST:17,CLAVL:20,CLAVR:23,HEAD:26,NECK:29};
 const ch=(id,base)=>({weaponModel:id,weapon:{def:{modelId:base}},P:new Float64Array(40),kidForm:true,kid:new THREE.Object3D(),grounded:true,wTwo:0,wSub:0,wAim:1,charge:.5,_runner(){return{a:{},catalogState:{canopy:{open:true,launched:false,pos:new THREE.Vector3(1,2,3),dir:new THREE.Vector3(0,0,1)}}};}});
 for(const row of ALTERNATE_WEAPON_KITS.filter(x=>selected.includes(x.main)&&R.weaponBehaviorFamily(x.id)==='brella')){
  const spec=R.weaponModelSpec(row.main),base=R.weaponModelSpec(row.baseId),a=ch(row.main,row.baseId),b=ch(row.baseId,row.baseId),bad=ch(row.main,row.baseId);
  const def=R.buildWeaponModel(row.main,fresh(row.id));a.weapon.def=def;
  spec.pose(a,1/60,{},C);base.pose(b,1/60,{},C);delete bad.weapon.def.modelId;spec.pose(bad,1/60,{},C);
  assert.deepEqual(a.P,b.P,row.main+' actual pose');assert(a.P.some(x=>x!==0),row.main+' nonvacuous');assert(bad.P.every(x=>x===0));dispose(def);
 }
 for(const row of ALTERNATE_WEAPON_KITS.filter(x=>selected.includes(x.main)&&R.weaponBehaviorFamily(x.id)==='stringer')){
  const a=ch(row.main,row.baseId),b=ch(row.baseId,row.baseId),bad=ch(row.main,row.baseId),def=R.buildWeaponModel(row.main,fresh(row.id));a.weapon.def=def;
  for(let i=0;i<30;i++){a.P.fill(0);b.P.fill(0);R.weaponFamilyPose(row.main)(a,1/60,{},C);R.weaponFamilyPose(row.baseId)(b,1/60,{},C);delete bad.weapon.def.modelId;R.weaponFamilyPose(row.main)(bad,1/60,{},C);assert.deepEqual(a.P,b.P,row.main+' actual pose');}
  assert(a.P[C.ANCR+2]>0);assert(bad.P.every(x=>x===0));dispose(def);
 }
 const row=ALTERNATE_WEAPON_KITS.find(x=>selected.includes(x.main)&&R.weaponBehaviorFamily(x.id)==='charger'),x=ch(row.main,row.baseId),y=ch(row.baseId,row.baseId);R.weaponFamilyPose(row.id)(x,1/60,{},C);R.weaponFamilyPose(row.baseId)(y,1/60,{},C);assert.deepEqual(x.P,y.P);assert(x.P.some(v=>v!==0));
});
test('Gold Dynamo canonical row executes nonzero native rolling pose; families without pose stay absent',()=>{
 const row=ALTERNATE_WEAPON_KITS.find(x=>x.main==='Roller_Heavy_01'),record=MAIN_WEAPON_CATALOG.records.find(x=>x.id===row.baseId);
 const make=id=>{const def=R.buildWeaponModel(id,fresh(id)),runner={a:{weapon:{catalogRecord:record},grounded:true,remote:false},catalogState:{swingCount:0}};return{weaponModel:R.weaponModelKey(id),weapon:{def},P:new Float64Array(8),wRoll:1,_runner(){return runner;}};};
 const a=make(row.main),b=make(row.baseId);for(let i=0;i<30;i++){a.P.fill(0);b.P.fill(0);R.weaponFamilyPose(row.main)(a,1/60,{}, {ANCR:0});R.weaponFamilyPose(row.baseId)(b,1/60,{}, {ANCR:0});assert.deepEqual(a.P,b.P);assert(a.P.some(v=>v!==0));assert([...a.P].every(Number.isFinite));}
 const bad=make(row.main);delete bad.weapon.def.drumAt;R.weaponFamilyPose(row.main)(bad,1/60,{}, {ANCR:0});assert(bad.P.every(v=>v===0));dispose(a.weapon.def);dispose(b.weapon.def);dispose(bad.weapon.def);
 for(const id of ['Slosher_Washtub_01','Slosher_Diffusion_01','Maneuver_Short_02']){const spec=R.weaponModelSpec(id);assert.equal(R.weaponFamilyPose(id),null);assert.equal(spec.pose,R.weaponModelSpec(spec.baseId).pose);}
});
