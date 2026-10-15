import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const rows=[['s3-stringer-normal-02','Stringer_Normal_02','s3-stringer-normal'],['s3-charger-quick-01','Charger_Quick_01','s3-charger-quick'],['s3-maneuver-short-02','Maneuver_Short_02','s3-maneuver-short'],['s3-stringer-short-02','Stringer_Short_02','s3-stringer-short'],['s3-shelter-normal-01','Shelter_Normal_01','s3-shelter-normal'],['s3-slosher-washtub-01','Slosher_Washtub_01','s3-slosher-washtub']];
let pending;const load=()=>pending??=fixture({productionComposition:true,fullRuntime:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:"export * as R from './patches/splatoon3/runtime/weapon-models/registry.mjs';"});
for(const [kit,row,base] of rows)test('actual Actor/Character selected model, hold and native animation: '+row,async()=>{
 const f=await load(),{R,G,Actor,Character}=f;
 assert.equal(R.weaponModelKey(kit),row);const spec=R.weaponModelSpec(kit);assert.equal(spec.sourceRow,row);assert.equal(spec.baseId,base);
 const actors=G.actors,time=G.time;let a,original,calls=0;
 try{
 a=new Actor({team:0,weapon:kit,isLocal:false,name:'native-six',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];
 assert.equal(ch.weaponModel,row);assert.equal(ch.weapon.def.modelId,base);assert.equal(ch.weapon.def.modelVariantId,row);
 const subset=(actual,expected,label)=>{for(const [k,v]of Object.entries(expected||{})){if(v&&typeof v==='object'&&!Array.isArray(v))subset(actual[k],v,label+'.'+k);else assert.deepEqual(JSON.parse(JSON.stringify(actual[k])),JSON.parse(JSON.stringify(v)),label+'.'+k);}};
 assert.ok(ch.hold&&typeof ch.hold==='object');subset(ch.hold,spec.hold,'actual native hold');
 assert.equal(ch.weaponNativeCarry,R.weaponNeedsNativeCarry(kit),'actual Character native carry selection');
 if(spec.animate)assert.equal(ch.weapon.def.animate,spec.animate,'actual selected animator');
 assert.equal(R.weaponNeedsNativeCarry(kit),['brella','splatana','stringer','brush'].includes(R.weaponBehaviorFamily(kit))||!!spec.nativeCarry);
 original=ch.weapon.def.animate;if(original){ch.weapon.def.animate=function(...args){calls++;return original.apply(this,args);};}
 const transforms=[];for(const charge of [0,1,0]){a.form='kid';a.kidT=10;a.grounded=charge===0;a.ground.hit=a.grounded;a.intent.fire=false;a.vel.set(0,0,0);a.weaponRunner.charge=charge;a.weaponRunner.charging=charge===1;if(charge===0)ch.trigger('charge_release');for(let i=0;i<12;i++){G.time+=1/60;a._finishFrame(1/60);}
 ch.root.updateMatrixWorld(true);assert.ok(ch.weapon.pivot.matrixWorld.elements.every(Number.isFinite));const parts=Object.values(ch.weapon.parts||{});assert.ok(parts.length>0,'actual native animated parts are present');for(const p of parts){const node=p.pivot||p.mesh||p;assert.ok(node.matrixWorld,'actual part matrix exists');assert.equal(node.matrixWorld.elements.length,16);assert.ok(node.matrixWorld.elements.every(Number.isFinite));}transforms.push(ch.weapon.muzzle.getWorldPosition(new f.THREE.Vector3()).toArray());}
 if(original)assert.ok(calls>=36,'real part animator invoked every frame');assert.ok(transforms.flat().every(Number.isFinite));assert.equal(ch.weaponModel,row,'selection survives state transitions');
 }finally{if(a){if(original)a.character.weapon.def.animate=original;a.character.dispose();}G.projectiles.clear?.();G.actors=actors;G.time=time;}
});
