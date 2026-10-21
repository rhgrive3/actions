import assert from 'node:assert/strict';
import test from 'node:test';
import { admitRankedPose, objectiveSpecialFor } from '../../patches/splatoon3/runtime/ranked/pose-admission.mjs';

const actor = { pos:{x:0,y:0,z:0}, specialActive:null };
const world = { floorAt:()=>0, blocked:()=>false };
function row(x=0,z=0,{y=0,tp=0,f=17}={}) {
  const r = Array(21).fill(0);
  r[0]=1; r[1]=x; r[2]=y; r[3]=z; r[10]=f; r[11]=100; r[12]=100; r[16]=tp;
  return r;
}
test('owner path permits smooth running but denies a finite teleport and stale timestamp',()=>{
  const s = {};
  assert.equal(admitRankedPose(s,row(),actor,10,world),true);
  assert.equal(admitRankedPose(s,row(.65,.2),actor,10.05,world),true);
  assert.equal(admitRankedPose(s,row(42,0),actor,10.1,world),false,'finite forged in-stage jump');
  assert.equal(admitRankedPose(s,row(1,0),actor,10.01,world),false,'replayed time');
  assert.deepEqual(s.last.pos,[.65,0,.2],'rejected sample does not poison next admission');
  assert.equal(admitRankedPose(s,row(1,.3),actor,10.1,world),true);
});
test('a forged teleport epoch cannot override a live normal actor',()=>{
  const s={};
  assert.equal(admitRankedPose(s,row(),actor,1,world),true);
  assert.equal(admitRankedPose(s,row(36,0,{tp:1}),actor,1.05,world),false);
  assert.equal(s.last.tp,0);
});
test('host geometry rejects grounded high-altitude and tunneling',()=>{
  const s={};
  assert.equal(admitRankedPose(s,row(),actor,1,world),true);
  assert.equal(admitRankedPose(s,row(0,0,{y:9}),actor,1.05,world),false);
  const wall={floorAt:()=>0,blocked:()=>true};
  assert.equal(admitRankedPose(s,row(2,0),actor,1.2,wall),false);
});
test('verified superjump charge followed by bounded teleport epoch may relocate',()=>{
  const s={};
  assert.equal(admitRankedPose(s,row(),actor,1,world),true);
  assert.equal(admitRankedPose(s,row(.2,0,{f:1|16384}),actor,1.05,world),true);
  assert.equal(admitRankedPose(s,row(.3,0,{f:1|32768}),actor,1.3,world),true);
  assert.equal(admitRankedPose(s,row(45,0,{f:1|32768,tp:1}),actor,1.35,world),true);
  assert.equal(s.last.tp,1);
});
test('remote null special cannot clear an active host-observed restriction',()=>{
  for(const id of ['krakenRoyale','zipcaster','inkjet','crabTank']) {
    assert.equal(objectiveSpecialFor({specialActive:{id}}, {special:null}),id);
  }
  assert.equal(objectiveSpecialFor(actor,{special:'storm'}),'storm');
  assert.equal(objectiveSpecialFor(actor,{special:null}),null);
});
