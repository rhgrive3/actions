import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {readFileSync} from 'node:fs';
const physicsSource=readFileSync(new URL('../../../inkwave-public/src/game/physics.js',import.meta.url),'utf8');
const {Physics}=new Function('THREE',physicsSource.replace(/^import .*;$/gm,'').replace(/\bexport /g,'')+'\nreturn {Physics};')(THREE);
import {combatAdmission} from '../combat-provenance.mjs';
import {COMBAT_HIT_CEILINGS} from '../combat-hit-ceilings-data.mjs';

function fixture({kind='shooter',cause=kind,proofKind='main',physics=true}={}) {
  const calls=[];
  class Vector3 {set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}}
  const actor={nid:17,owner:'guest',remote:true,alive:true,
    weapon:{id:kind,kind,damage:30,sub:'bomb',special:'storm'},pos:{x:0,y:0,z:0}};
  const crab={id:3,x:0,y:0,z:10,hp:40,dead:false};
  const boss={sim:true,dead:false,visible:true,pos:{x:0,y:0,z:10},
    crabs:new Map([[3,crab]]),model:{hitShapes:[{active:true,pos:{x:0,y:0,z:10},r:2}]}};
  const proof={actor:17,at:100,origin:[0,0,0],unit:[0,0,1],reach:30,
    cause,kind:proofKind,uses:0,maxUses:4};
  let visibility=()=>true;
  const nm={isHost:true,cfg:{id:'m'},byNid:new Map([[17,actor]]),
    match:{state:'playing',boss},_combatHitCeilings:COMBAT_HIT_CEILINGS,
    _combatProvenanceTHREE:{Vector3},
    _combatProvenance:{proofs:new Map([['guest',[proof]]]),pending:new Map(),
      contacts:new Map(),contactSnapshots:new Map(),specialSnapshots:new Map()}};
  if(physics)nm._combatProvenancePhysics={los(a,b){
    calls.push([[a.x,a.y,a.z],[b.x,b.y,b.z]]);
    return visibility(a,b);
  }};
  return {nm,actor,boss,crab,proof,calls,setVisibility(fn){visibility=fn;},
    claim(extra={}){return combatAdmission(nm,'guest',
      {m:'m',a:17,d:20,w:'crab',c:3,q:1,weak:0,...extra},'boss',100);}};
}

test('direct-fire crablet claims require receiver LOS before proof or target consumption',()=>{
  for(const kind of ['shooter','dualies','splatling','charger']) {
    const x=fixture({kind});
    x.setVisibility((_a,b)=>b.z<2);
    assert.equal(x.claim(),false,kind);
    assert.equal(x.proof.uses,0);
    assert.equal(x.proof.bossTargets?.size??0,0);
    assert.ok(x.calls.some(([,b])=>b[2]>9),'receiver crablet visibility queried');
    x.setVisibility(()=>true);
    assert.equal(x.claim(),true,'same unspent proof accepts clear target');
    assert.equal(x.proof.uses,1);
    assert.equal(x.claim({q:2}),false,'new nonce cannot re-hit this target');
    assert.equal(x.proof.uses,1);
  }
});
test('blocked or throwing muzzle/terrain checks fail closed without consuming proof',()=>{
  for(const visibility of [()=>false,()=>1,()=>{throw Error('collision failed');}]) {
    const x=fixture();x.setVisibility(visibility);
    assert.equal(x.claim(),false);assert.equal(x.proof.uses,0);
    assert.equal(x.proof.bossTargets?.size??0,0);
  }
});
test('crablet LOS ends at the native closest contact on the actual shot ray',()=>{
  const x=fixture();
  x.setVisibility((_a,b)=>b.z<=10);
  assert.equal(x.claim(),true);
  const end=x.calls.at(-1)[1];
  assert.equal(end[2],10);
  assert.equal(end[1],0,'visibility cannot bend the shot toward the sphere centre');
  assert.ok(Math.hypot(end[0],end[1]-.35,end[2]-10)<=.55);
});
test('dead or invalid crablets never consume a main proof',()=>{
  for(const change of [{dead:true},{x:NaN},{y:Infinity},{z:undefined}]) {
    const x=fixture();Object.assign(x.crab,change);
    assert.equal(x.claim(),false);assert.equal(x.proof.uses,0);
  }
});
test('body visibility, weak-crablet rejection and offline behavior are unchanged',()=>{
  const blocked=fixture();blocked.setVisibility(()=>false);
  assert.equal(blocked.claim({c:-1,w:'shooter'}),false);
  assert.equal(blocked.proof.uses,0);
  const clear=fixture();assert.equal(clear.claim({c:-1,w:'shooter'}),true);
  const weak=fixture();assert.equal(weak.claim({weak:1}),false);
  assert.equal(weak.proof.uses,0);
  const offline=fixture({physics:false});assert.equal(offline.claim(),true);
});
test('area main, sub and special proof paths retain their existing admission',()=>{
  for(const options of [
    {kind:'blaster'},
    {kind:'shooter',cause:'bomb',proofKind:'sub'},
    {kind:'shooter',cause:'storm',proofKind:'special'},
  ]) {
    const x=fixture(options);x.setVisibility(()=>false);
    const extra=options.proofKind==='special'?{w:'storm'}:{};
    assert.equal(x.claim(extra),true);
    assert.equal(x.calls.length,0,'direct-fire-only change must not gate area paths');
  }
});

function partialCoverFixture(wallX,halfX) {
  const x=fixture(),V=THREE.Vector3;
  const blocks=[{id:0,solid:true,grate:false,center:new V(wallX,.35,5),
    half:new V(halfX,2,.1),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],
    faces:Array(6).fill(-1)}];
  const physics=new Physics({blocks,queryBlocks:()=>[0],faces:[]});
  const origin=new V(0,.35,0),end=new V(.5,.35,10),len=Math.hypot(.5,10);
  x.proof.origin=[0,.35,0];x.proof.unit=[.5/len,0,10/len];
  x.nm._combatProvenancePhysics=physics;
  x.nm._combatProvenanceTHREE=THREE;
  return {...x,physics,origin,end};
}
test('actual Physics: a clear sphere-edge shot is not rejected by center cover',()=>{
  const x=partialCoverFixture(0,.1);
  assert.equal(x.physics.segment(x.origin,x.end).hit,false,'actual projectile segment is clear');
  assert.equal(x.claim(),true,'native sphere-edge contact must remain admissible');
  assert.equal(x.proof.uses,1);
});
test('actual Physics: a blocked shot is not admitted through an exposed center',()=>{
  const x=partialCoverFixture(.25,.04);
  assert.equal(x.physics.segment(x.origin,x.end).hit,true,'actual projectile segment hits the wall');
  assert.equal(x.claim(),false,'an unrelated clear center ray cannot authorize this shot');
  assert.equal(x.proof.uses,0);
  assert.equal(x.proof.bossTargets?.size??0,0);
});
