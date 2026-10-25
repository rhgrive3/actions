import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {applyCatalogueChoice} from '../runtime/catalogue.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
function setup(){
 const P=f.G.projectiles;P.clear();f.G.actors.length=0;f.G.time=0;
 P.kitBarrierCandidate=()=>null;
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const owner=f.make('shooter');
 const p={owner,team:0,damage:10,type:'shot',ghost:false,prev:new f.THREE.Vector3(),pos:new f.THREE.Vector3(0,0,1),size:.1};
 return {P,owner,p};
}
function cloneCount(run){
 const proto=f.THREE.Vector3.prototype,clone=proto.clone;let calls=0;
 proto.clone=function(){calls++;return clone.call(this);};
 try{run();}finally{proto.clone=clone;}
 return calls;
}
test('absent, null and empty fists allocate no vectors and still return the native defense by identity',()=>{
 const {P,p}=setup();
 for(const state of ['absent',null,[]]){
  if(state==='absent')delete P._catalogueFists;else P._catalogueFists=state;
  assert.equal(cloneCount(()=>{for(let i=0;i<1000;i++)assert.equal(P.kitDefenseCandidate(p),null);}),0);
  let calls=0;const earlier={distance:.2,point:new f.THREE.Vector3(0,0,.2),onHit(){}};
  P.kitBarrierCandidate=()=>{calls++;return earlier;};
  assert.equal(P.kitDefenseCandidate(p),earlier);assert.equal(calls,1);
  P.kitBarrierCandidate=()=>null;
 }
});
test('active fists preserve native priority and exact ties across repeated activation, retirement and clear',()=>{
 const {P,owner}=setup(),enemy=f.make('shooter');enemy.team=1;
 assert.ok(applyCatalogueChoice(owner,{sub:'bomb',special:'tripleSplashdown'},f));
 for(let activation=0;activation<2;activation++){
  owner.specialActive=null;owner.special=owner.specialCost();owner._startSpecial();
  const list=P._catalogueFists;assert.equal(list.length,2);
  const fist=list[0],p={owner:enemy,team:1,damage:10,type:'shot',ghost:false,size:.1,
   prev:fist.pos.clone().add(new f.THREE.Vector3(0,0,-2)),pos:fist.pos.clone().add(new f.THREE.Vector3(0,0,2))};
  const hit=P.kitDefenseCandidate(p);assert.equal(hit.distance,2);assert.equal(fist.hp,100,'query alone is inert');
  const native={distance:2,point:new f.THREE.Vector3(),onHit(){}};
  P.kitBarrierCandidate=()=>native;assert.equal(P.kitDefenseCandidate(p),native,'exact ties retain the prior native candidate');
  native.distance=1;assert.equal(P.kitDefenseCandidate(p),native);
  native.distance=3;const nearer=P.kitDefenseCandidate(p);assert.equal(nearer.distance,2);nearer.onHit();assert.equal(fist.hp,90);
  P.kitBarrierCandidate=()=>null;
  for(let i=0;i<88;i++){f.G.time+=1/60;P.update(1/60);}
  assert.equal(P._catalogueFists,list,'observe the existing live array, without a replacement cache');assert.equal(list.length,0);
  assert.equal(cloneCount(()=>assert.equal(P.kitDefenseCandidate(p),null)),0,'retired fists restore the empty fast path');
  P.clear();assert.equal(P._catalogueFists.length,0);
 }
});
test('sustained actual Shooter projectiles reach the empty defense sweep throughout their fixed simulation steps',()=>{
 const {P,owner}=setup();owner.aimDir.set(0,0,1);owner.aimPoint.set(0,1,200);
 const native=P.kitDefenseCandidate;let queries=0,rounds=0;
 P.kitDefenseCandidate=function(...args){queries++;assert.equal(this._catalogueFists?.length||0,0);return native.apply(this,args);};
 f.setRandom(()=>.5);
 try{
  for(let i=0;i<120;i++){
   f.G.time+=1/60;owner.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
   rounds=Math.max(rounds,P.list.length);P.update(1/60);
  }
 }finally{P.kitDefenseCandidate=native;f.restoreRandom();}
 assert.ok(rounds>0,'native WeaponRunner emits actual projectiles');
 assert.ok(queries>120,`actual fixed-step sweeps reach the wrapper repeatedly: ${queries}`);
});
