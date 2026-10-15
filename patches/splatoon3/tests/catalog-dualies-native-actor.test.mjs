import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:`export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';`});
const {G,Actor,Character,THREE,Projectiles,Physics}=f.installedRuntime;f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
function finiteWeapon(w){assert.ok(w&&w.ps);assert.ok(Object.keys(w.ps).length);for(const v of Object.values(w.ps))assert.ok(Number.isFinite(v));for(const p of Object.values(w.parts)){p.updateMatrixWorld(true);assert.ok(p.matrixWorld.elements.every(Number.isFinite));}assert.ok(w.muzzle.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite));}
for(const id of ['s3-maneuver-short','s3-maneuver-gallon','s3-maneuver-dual','s3-maneuver-stepper','s3-maneuver-long'])test(id+' native Actor advances both hand triggers through near/far and reset',()=>{
 for(const team of [0,1]){
  G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,2,2);G.camera.updateMatrixWorld();G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out}};G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;G.actors=[];
  const ps=new Projectiles(G.scene);G.projectiles=ps;const a=new Actor({team,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});const ch=a.character,r=a.weaponRunner;ch.actor=a;ch.onEvent=null;ch.inWorld=true;a.grounded=a.ground.hit=true;G.scene.add(ch.root);G.actors=[a];const trigger=ch.trigger,notes=[];let shots=0;const moved=[false,false],near=new Set(),hands=new Set();
  ch.trigger=function(type,value){if(type==='shoot')notes.push(value);return Reflect.apply(trigger,this,arguments)};
  try{
   assert.ok(ch.weapon.left,'actual paired native weapon');
   for(let tick=0;tick<180;tick++){
    const dt=1/60,fire=tick>=30&&tick<130;G.time+=dt;G.camera.position.z=tick<90?2:50;G.camera.updateMatrixWorld();a.ink=100;a.intent.fire=fire;const count=ps.list.length,n=notes.length,hand=r.hand;r.update(dt,{fire,firePressed:tick===30});const born=ps.list.length-count;
    if(born){assert.equal(born,1);assert.equal(r.hand,hand^1);assert.equal(r.sinceHand[r.hand],0);assert.equal(notes.length,n+1);assert.equal(notes.at(-1).hand,r.hand);assert.equal(+notes.at(-1),1);hands.add(r.hand);shots++;}else{assert.equal(r.hand,hand);assert.equal(notes.length,n);}
    a._finishFrame(dt);near.add(ch.weapon.near);finiteWeapon(ch.weapon);finiteWeapon(ch.weapon.left);moved[0]||=Math.abs(ch.weapon.parts.trigger.rotation.x)>.001;moved[1]||=Math.abs(ch.weapon.left.parts.trigger.rotation.x)>.001;
   }
   assert.ok(shots>1);assert.deepEqual([...hands].sort(),[0,1]);assert.deepEqual([...near].sort(),[false,true]);assert.deepEqual(moved,[true,true]);r.reset();assert.equal(r.hand,0);assert.deepEqual(Array.from(r.sinceHand),[99,99]);a._finishFrame(0);finiteWeapon(ch.weapon);finiteWeapon(ch.weapon.left);console.log('BASE_DUALIES_ACTOR',JSON.stringify({id,team,shots,ticks:180,moved,near:[...near]}));
  }finally{ch.trigger=trigger;ps.clear();G.scene.remove(ch.root);ch.dispose();G.scene.remove(ps.blobs,ps.arcLine,ps.arcRing);G.actors=[];}
 }
});
