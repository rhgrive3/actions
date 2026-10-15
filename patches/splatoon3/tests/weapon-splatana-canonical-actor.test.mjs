import {isDeepStrictEqual} from 'node:util';import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({adaptRuntime:(p,c)=>process.env.POSE_BASELINE&&p.endsWith('weapon-models/splatanas.mjs')?c.replace('SABER[ch.weapon?.def?.modelId || ch.weaponModel]','SABER[ch.weaponModel]'):c,productionComposition:true,fullRuntime:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:"export * as R from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
const {Actor,Character,G,R,THREE}=f;
for(const row of ['Saber_Normal_01','Saber_Normal_02','Saber_Heavy_01','Saber_Lite_02'])test('native Actor/Character charged/released canonical dispatch '+row,()=>{
 const kit=f.ALTERNATE_WEAPON_KITS.find(x=>x.main===row);assert(kit);const saved={actors:G.actors,time:G.time};const out=[];
 try{for(const id of [kit.baseId,kit.id]){G.actors=[];G.time=0;G.projectiles.clear();const a=new Actor({team:0,weapon:id,isLocal:false,CharacterClass:Character,name:'saber-qualification',style:{hair:0,skin:2,outfit:0,eyes:0}});try{
 const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];assert.equal(ch.weaponModel,id===kit.id?row:kit.baseId);assert.equal(ch.weapon.def.modelId,kit.baseId);if(id===kit.id)assert.equal(ch.weapon.def.modelVariantId,row);
 a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.vel.set(0,0,0);const rows=[];let seenFull=0,seenPose=0,seenBusy=0;
 for(let i=0;i<180;i++){const fire=i>=15&&i<100;a.intent.fire=fire;G.time+=1/60;a.weaponRunner.update(1/60,{fire,firePressed:i===15});a._finishFrame(1/60);ch.root.updateMatrixWorld(true);const charge=a.weaponRunner.charge;if(charge>=1)seenFull++;if(ch.P.some(v=>v!==0))seenPose++;if(a.weaponRunner.catalogState?.pending||a.weaponRunner.catalogState?.melee)seenBusy++;
 const matrices=[ch.weapon.pivot,...Object.values(ch.weapon.parts)].map(x=>Array.from(x.matrixWorld.elements));assert(matrices.flat().every(Number.isFinite));rows.push({pose:Array.from(ch.P),charge,matrices,muzzle:ch.weapon.muzzle.getWorldPosition(new THREE.Vector3()).toArray()});}
 assert(seenFull>0,'actual charged native state');assert(seenBusy>0,'actual native release state');assert(seenPose>0);out.push(rows);
 }finally{a.character.dispose();G.projectiles.clear();}}
 assert(isDeepStrictEqual(out[1],out[0]),'canonical variant native dispatch equals base across actual Runner/Character frames');
 }finally{G.actors=saved.actors;G.time=saved.time;G.projectiles.clear();}
});
