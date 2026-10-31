import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { advanceShooterNearestSlot } from '../runtime/shooter-nearest-paint.mjs';
import { beginReceiverTorpedoObservation, receiverTorpedoObservationState, hasReceiverTorpedoObservation } from '../runtime/torpedo-receiver-trajectory.mjs';
import { ClamsRule } from '../runtime/ranked/clams.mjs';
import { collectBrellaSplashes } from '../runtime/added-family-paint.mjs';

test('one-pass Shooter membership cannot read its slot before the existing source validation',()=>{
  function run(fused){const runner={s3ShooterNearestSlot:0},forced=[];Object.defineProperty(forced,0,{get(){runner.s3ShooterNearestSlot=1;return 1;},enumerable:true});forced.length=1;
    const spawn={SplitNum:3,ForceSpawnNearestAddNumArray:forced};
    if(!fused)return {emit:advanceShooterNearestSlot(runner,spawn),slot:runner.s3ShooterNearestSlot};
    const slot=((runner.s3ShooterNearestSlot||0)%spawn.SplitNum)+1;let found=false;
    for(const value of forced){if(!Number.isInteger(value)||value<1||value>spawn.SplitNum)throw RangeError();if(value===slot)found=true;}
    runner.s3ShooterNearestSlot=slot;return {emit:slot===spawn.SplitNum||found,slot};
  }
  assert.deepEqual(run(false),{emit:false,slot:1});assert.deepEqual(run(true),{emit:true,slot:1});
});

function torpedo(){
  const owner={remote:true,owner:'peer',nid:7,netLife:1},object={owner,ghost:true,subId:'torpedo',phase:'flight',sourceLife:1,seq:3,dead:false};
  const world={_s3SubObjects:[object]},G={projectiles:world,level:{},physics:{},match:{},netm:{match:{},peers:new Map([['peer',{}]]),byNid:new Map([[7,owner]])}},api={G};
  assert.equal(beginReceiverTorpedoObservation(api,world,object),true);return {api,world,object,owner};
}
test('an enrolled Torpedo retains its observation when a mutable subId changes; non-Torpedo gating would skip retirement',()=>{
  const {api,world,object,owner}=torpedo();object.subId='burst';owner.netLife=2;
  assert.equal(hasReceiverTorpedoObservation(object),true);assert.equal(receiverTorpedoObservationState(api,world,object),'retired');
  assert.equal(object.subId==='torpedo'?receiverTorpedoObservationState(api,world,object):null,null);
});
test('a previously active Torpedo observation is invalidated by a synchronous intervening owner-life change',()=>{
  const {api,world,object,owner}=torpedo();const cached=receiverTorpedoObservationState(api,world,object);assert.equal(cached,'active');
  const prev=new THREE.Vector3();prev.copy=()=>{owner.netLife++;return prev;};prev.copy(new THREE.Vector3());
  assert.equal(receiverTorpedoObservationState(api,world,object),'retired');assert.notEqual(cached,'retired');
});

test('Clam expiry callbacks observe each immediate removal, so filtering once before notifications changes the contract',()=>{
  const rule=Object.create(ClamsRule.prototype),observed=[];rule.state={clams:[{id:'a',expiresIn:0,kind:'small',team:0},{id:'b',expiresIn:0,kind:'small',team:0}]};
  rule._event=(kind,row)=>observed.push([kind,row.id,rule.state.clams.map(c=>c.id)]);rule._expireAndAge(1/60);
  assert.deepEqual(observed,[['clam-expire','a',['b']],['clam-expire','b',[]]]);
  const batched=[['clam-expire','a',[]],['clam-expire','b',[]]];assert.notDeepEqual(batched,observed);
});

test('Brella release callbacks can retain consumed sample records and points; recycling needs an explicit ownership opt-in',()=>{
  const volley={next:0,plan:{first:0,spacing:1,count:3,source:{SplashPaintWidthOneActive:.2,SplashPaintWidthFullActive:.6,SplashPaintDepthScaleOneActive:1,SplashPaintDepthScaleFullActive:2}},nodes:[]};
  const node={volley,distance:0,ended:false,samples:new Map()};volley.nodes=[node];const retained=[],values=[];
  collectBrellaSplashes(node,{prev:new THREE.Vector3(0,1,0),age:.1},new THREE.Vector3(0,1,4),false,()=>{const row=node.samples.get(volley.next);retained.push(row);values.push(row.point.toArray());});
  assert.equal(new Set(retained).size,3);assert.deepEqual(retained.map(r=>r.point.toArray()),values);
  const reused=retained[0];reused.point.copy(retained[2].point);assert.notDeepEqual(retained.map(r=>r.point.toArray()),values);
});

test('Inkjet device-array identity does not certify a cached pack after a same-array replacement',()=>{
  const source=fs.readFileSync(new URL('../runtime/special-vfx.mjs',import.meta.url),'utf8');
  assert.ok(source.replace(/\s/g,'').includes("ch.s3SpecialDevices?.()?.find(d=>d.spec?.model==='spInkjetPack')"));
  const old={spec:{model:'spInkjetPack'}},live={spec:{model:'spInkjetPack'}},devices=[old],ch={s3SpecialDevices:()=>devices};
  const cached=ch.s3SpecialDevices().find(d=>d.spec?.model==='spInkjetPack');devices[0]=live;
  assert.equal(ch.s3SpecialDevices().find(d=>d.spec?.model==='spInkjetPack'),live);assert.notEqual(cached,live);
});

test('Clam sorting observes live distance calls; precomputation changes custom rule evaluation order',()=>{
  const source=ClamsRule.prototype.botGoal.toString();
  assert.ok(source.includes('candidates.sort((a, b) => this._distanceSq(position, a.pos) - this._distanceSq(position, b.pos))'));
  const items=[{id:'a',pos:[3,0,0]},{id:'b',pos:[2,0,0]},{id:'c',pos:[1,0,0]}];
  function sort(cached){let count=0;const distance=p=>{count++;return p[0]+(count%3===0?100:0);};const copy=items.slice();
    if(cached){const ds=new Map(copy.map(i=>[i,distance(i.pos)]));copy.sort((a,b)=>ds.get(a)-ds.get(b));}
    else copy.sort((a,b)=>distance(a.pos)-distance(b.pos));return {order:copy.map(i=>i.id),calls:count};}
  assert.notDeepEqual(sort(true),sort(false));
});
