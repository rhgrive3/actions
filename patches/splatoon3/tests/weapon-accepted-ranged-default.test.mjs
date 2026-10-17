import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:"export {setWeaponAppearance,selectedWeaponAppearance} from './patches/splatoon3/runtime/weapon-appearance.mjs';export * as R from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
const {G,THREE,R}=f;
const rows=[['Maneuver_Gallon_01','s3-maneuver-gallon'],['Maneuver_Normal_02','dualies'],['Shelter_Compact_01','s3-shelter-compact'],['Spinner_Downpour_01','s3-spinner-downpour'],['Spinner_HyperShort_01','s3-spinner-hypershort'],['Spinner_Standard_01','splatling']];
const floor={id:0,solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],center:new THREE.Vector3(0,-1,0),half:new THREE.Vector3(100,1,100),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-100,-2,-100),aabbMax:new THREE.Vector3(100,0,100)};
G.level={...G.level,faces:[],blocks:[floor],queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;}};
G.physics=new f.installedRuntime.Physics(G.level);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function geometry(g){if(!g)return null;const attrs={};for(const[n,a]of Object.entries(g.attributes).sort())attrs[n]={itemSize:a.itemSize,normalized:a.normalized,type:a.array.constructor.name,count:a.count,sha:sha(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))};const a=g.index;return {attrs,index:a?{type:a.array.constructor.name,count:a.count,sha:sha(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))}:null,groups:g.groups};}
function shape(w){return {body:geometry(w.def.body),ink:geometry(w.def.ink),parts:Object.fromEntries(Object.entries(w.def.parts).map(([n,p])=>[n,{geometry:geometry(p.src),mat:p.mat,hidden:p.hidden??false,pivot:p.pivot?.toArray()}]))};}
function finite(a){assert.ok(a.length>0&&a.every(Number.isFinite));return a;}
for(const[row,baseId]of rows)test(row+' official default preserves accepted manual geometry and native Actor behavior',()=>{
 const kit=f.ALTERNATE_WEAPON_KITS.find(k=>k.main===row);assert.ok(kit);assert.equal(kit.baseId,baseId);
 assert.equal(R.weaponDefaultAppearance(kit.id),row,'official kit must select the accepted row without an override');
 assert.ok(R.registeredWeaponVariantModels().includes(row));assert.equal(R.weaponModelSpec(kit.id),R.weaponVariantSpec(row));
 const hold={arm:{x:1,y:2},grip:[1,2,3]};assert.deepEqual(R.weaponHold(row,hold),R.weaponHold(baseId,hold));
 for(const team of[0,1]){
  const paired=[];
  for(const role of['manual','default']){
   f.setWeaponAppearance(kit.id,role==='manual'?row:'',null);assert.equal(f.selectedWeaponAppearance(kit.id,null),row);
   G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,2,2);G.camera.updateMatrixWorld();G.actors=[];G.time=0;G.projectiles.clear();
   const a=new f.Actor({team,weapon:kit.id,isLocal:true,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
   const trace=[],shapes=[],initial={},moved=new Set(),owner=G.teamColors[team].toArray();let births=0,maxCharge=0,opened=false,folded=false;
   const push=G.projectiles._push;G.projectiles._push=function(...args){births++;return push.apply(this,args);};
   try{
    ch.actor=a;ch.onEvent=null;G.scene.add(ch.root);G.actors=[a];a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.pos.set(0,0,0);a.vel.set(0,0,0);
    assert.equal(ch.weaponModel,row);assert.equal(ch.weaponAppearanceModel,row);assert.equal(ch.weapon.def.modelId,baseId);assert.equal(ch.weapon.def.modelVariantId,row);
    for(let hand=0,w=ch.weapon;w;w=w.left,hand++){shapes.push(shape(w));for(const[n,p]of Object.entries(w.parts))initial[hand+':'+n]=JSON.stringify([p.position.toArray(),p.quaternion.toArray(),p.scale.toArray()]);}
    for(let i=0;i<420;i++){
     a.intent.fire=i>=15&&i<300;G.time+=1/60;a.update(1/60);ch.root.updateMatrixWorld(true);const hands=[];
     for(let hand=0,w=ch.weapon;w;w=w.left,hand++){
      assert.deepEqual(w.ink.material.color.toArray(),owner);assert.deepEqual(w.inkFar.material.color.toArray(),owner);
      const parts={};for(const[n,p]of Object.entries(w.parts)){parts[n]=finite(p.matrixWorld.toArray());if(JSON.stringify([p.position.toArray(),p.quaternion.toArray(),p.scale.toArray()])!==initial[hand+':'+n])moved.add(hand+':'+n);if(w.def.parts[n]?.mat==='ink')assert.deepEqual(p.userData.mesh.material.color.toArray(),owner,n);}
      if(row==='Shelter_Compact_01'){
       const c=w.parts.canopy,ink=w.parts.canopyInk;assert.ok(c&&ink,'accepted checked cloth must exist');
       for(const k of['position','quaternion','scale'])assert.deepEqual(ink[k].toArray(),c[k].toArray(),k);assert.equal(ink.visible,c.visible);
       const state=a.weaponRunner.catalogState?.canopy;opened ||= !!state?.open&&w.ps.bo>.9&&c.scale.x>1;folded ||= opened&&i>300&&!state?.open&&w.ps.bo<.01;
      }
      hands.push({parts,near:w.near,pivot:finite(w.pivot.matrixWorld.toArray()),muzzle:finite(w.muzzle.getWorldPosition(new THREE.Vector3()).toArray())});
     }
     maxCharge=Math.max(maxCharge,a.weaponRunner.charge||0);trace.push({pose:finite(Array.from(ch.P)),hands,ink:a.ink,births,charge:a.weaponRunner.charge});
    }
    assert.ok(births>0);assert.ok(moved.has('0:trigger'));if(row.startsWith('Maneuver_'))assert.ok(moved.has('1:trigger'));if(row.startsWith('Spinner_')){assert.ok(maxCharge>=1);assert.ok(moved.has('0:barrels'));}if(row==='Shelter_Compact_01')assert.ok(opened&&folded);
    assert.ok(trace.some(t=>t.pose.some(v=>v!==0)));paired.push({shapes,trace});
   }finally{G.projectiles._push=push;G.projectiles.clear();ch.dispose();assert.equal(ch.root.parent,null);assert.equal(ch._sourceMotionDisposed,true);G.actors=[];f.setWeaponAppearance(kit.id,'',null);}
  }
  assert.deepEqual(paired[1],paired[0],'default and explicit accepted manual appearance preserve all geometry and live trace');
 }
});

test('accepted ranged defaults retain all manual choices and explicit base overrides',()=>{
 assert.equal(R.registeredWeaponVariants().length,95);
 for(const[row,baseId]of rows){const kit=f.ALTERNATE_WEAPON_KITS.find(k=>k.main===row);
  assert.ok(R.registeredWeaponVariants(baseId).includes(row));
  for(const team of[0,1]){
   f.setWeaponAppearance(kit.id,baseId,null);assert.equal(f.selectedWeaponAppearance(kit.id,null),baseId);
   G.scene=new THREE.Scene();G.actors=[];G.projectiles.clear();
   const a=new f.Actor({team,weapon:kit.id,isLocal:true,CharacterClass:f.Character}),ch=a.character;
   try{G.scene.add(ch.root);assert.equal(ch.weaponModel,row);assert.equal(ch.weaponAppearanceModel,baseId);assert.equal(ch.weapon.def.modelId,baseId);assert.equal(ch.weapon.def.modelVariantId,undefined);assert.deepEqual(ch.weapon.ink.material.color.toArray(),G.teamColors[team].toArray());}
   finally{ch.dispose();assert.equal(ch.root.parent,null);G.projectiles.clear();G.actors=[];f.setWeaponAppearance(kit.id,'',null);assert.equal(f.selectedWeaponAppearance(kit.id,null),row);}
  }
 }
});
