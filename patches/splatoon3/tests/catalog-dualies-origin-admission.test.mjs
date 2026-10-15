import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:`export {weaponModelSpec} from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';`});
const {G,Actor,Character,THREE}=f.installedRuntime;f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
for(const id of ['s3-maneuver-short','s3-maneuver-gallon','s3-maneuver-dual','s3-maneuver-stepper','s3-maneuver-long'])test(id+' hand updates only on admitted round across stop, empty, refill, roll, reset and equipment switch',()=>{
 G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o}};G.physics=new f.installedRuntime.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;const ps=new f.installedRuntime.Projectiles(G.scene);G.projectiles=ps;
 const a=new Actor({team:0,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.character.actor=a;a.character.onEvent=null;a.grounded=true;a.ground.hit=true;G.actors=[a];G.scene.add(a.character.root);const r=a.weaponRunner,trigger=a.character.trigger;let shots=0,notifications=[],denied=0,rolled=false;
 a.character.trigger=function(...args){if(args[0]==='shoot')notifications.push(args[1]);return Reflect.apply(trigger,this,args)};
 const nativeMuzzleHand=ps._muzzleHand;let muzzleCalls=0;ps._muzzleHand=function(...args){muzzleCalls++;assert.equal(args[1],r.hand^1);return Reflect.apply(nativeMuzzleHand,this,args)};
 function tick(fire){a.intent.fire=fire;const hand=r.hand,before=ps.list.length,n=notifications.length,mc=muzzleCalls;G.time+=1/60;r.update(1/60,{fire});const delta=ps.list.length-before;if(delta){assert.equal(muzzleCalls,mc+1);assert.equal(delta,1);assert.equal(r.hand,hand^1);assert.equal(r.sinceHand[r.hand],0);assert.equal(notifications.length,n+1);assert.equal(notifications.at(-1).hand,r.hand);assert.equal(+notifications.at(-1),1);shots++;}else{assert.equal(muzzleCalls,mc);assert.equal(r.hand,hand);assert.equal(notifications.length,n);denied++;}a._finishFrame(1/60);}
 try{
  a.ink=0;for(let i=0;i<25;i++)tick(true);assert.equal(shots,0,'empty is never admitted');
  a.ink=100;for(let i=0;i<45;i++)tick(true);assert.ok(shots>=2);const stopped=shots;for(let i=0;i<40;i++)tick(false);assert.equal(shots,stopped);
  a.ink=0;for(let i=0;i<25;i++)tick(true);assert.equal(shots,stopped);a.ink=100;for(let i=0;i<30;i++)tick(true);assert.ok(shots>stopped,'refill resumes admission');
  a.ink=100;a.intent.fire=true;rolled=r.tryDodge(new THREE.Vector3(1,0,0));assert.equal(rolled,true);for(let i=0;i<80;i++){a.ink=100;tick(true)}
  r.reset();assert.equal(r.hand,0);assert.deepEqual(Array.from(r.sinceHand),[99,99]);for(let i=0;i<10;i++)tick(false);assert.equal(r.hand,0);
  a.setWeapon('shooter');assert.equal(r.hand,0);assert.deepEqual(Array.from(r.sinceHand),[99,99]);a.setWeapon(id);assert.equal(r.hand,0);assert.deepEqual(Array.from(r.sinceHand),[99,99]);a.ink=100;const switchBefore=shots;for(let i=0;i<30;i++)tick(true);assert.ok(shots>switchBefore);
  assert.ok(denied>0);console.log('DUALIES_BOUNDARY',JSON.stringify({id,shots,denied,rolled}));
 }finally{ps._muzzleHand=nativeMuzzleHand;a.character.trigger=trigger;G.scene.remove(a.character.root);a.character.dispose();ps.clear();G.scene.remove(ps.blobs,ps.arcLine,ps.arcRing)}
});
