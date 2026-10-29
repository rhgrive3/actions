import test from 'node:test';
import assert from 'node:assert/strict';
import {subject,fire,damage,names} from './catalog-horizontal-sector-fixture.mjs';
const HALF=Math.PI/2;

test('#1810 all four horizontal sectors follow the central admitted camera through real facing lag at 30/60/120 Hz',async()=>{
  const f=await subject();
  try{for(const name of names)for(const hz of [30,60,120]){
    const control=fire(f,{name,hz});assert.ok(damage(control)>0);
    for(const yaw of [-HALF,HALF]){
      const row=fire(f,{name,yaw,hz});assert.equal(row.aimYaw,yaw);
      assert.ok(Math.abs(row.bodyYaw-yaw)>1,'actual finite-rate body spring still lags release aim');
      assert.equal(row.sectorYaw,yaw);assert.ok(row.sectors.every(y=>y===yaw),'one center across every fan unit');
      assert.equal(row.contacts.length,1);assert.equal(row.contacts[0].table,'inside');
      assert.ok(Math.abs(damage(row)-damage(control))<1e-8,name+' camera-relative equivalent central target');
    }
  }}finally{f.restoreRandom();}
});

test('#1810 old body-sector negative control reproduces a real Dynamo central hit losing its pinned max damage',async()=>{
  const good=await subject(),bad=await subject(true);
  try{
    const control=fire(good),fixed=fire(good,{yaw:HALF}),old=fire(bad,{yaw:HALF});
    assert.equal(damage(control),180);assert.equal(damage(fixed),180);
    assert.ok(damage(old)<120&&damage(old)>100,'old source selects the outside table for a central camera shot');
    assert.deepEqual(fixed.start,old.start);assert.deepEqual(fixed.velocity,old.velocity);
    assert.deepEqual(fixed.packet,old.packet,'wire, per-pellet headings and all source damage parameters stay untouched');
    assert.equal(fixed.ink,old.ink);
    console.log(JSON.stringify({dynamoCentralSector:{alignedDamage:damage(control),turnedFixedDamage:damage(fixed),
      turnedOldDamage:damage(old),acceptedYaw:fixed.aimYaw,bodyYawAtCapture:fixed.bodyYaw,
      fixedSector:fixed.sectorYaw,oldSector:old.sectorYaw,wireUnchanged:true}}));
  }finally{good.restoreRandom();bad.restoreRandom();}
});

test('#1810 edge fan pellets keep the shared camera sector and real outside damage selection',async()=>{
  const f=await subject();
  try{for(const name of names){
    const aligned=fire(f,{name,outer:true});
    for(const yaw of [-HALF,HALF]){
      const edge=fire(f,{name,yaw,outer:true});assert.equal(edge.sectorYaw,yaw);
      assert.equal(edge.contacts.length,1);assert.equal(edge.contacts[0].table,'outside',name);
      assert.ok(Math.abs(damage(edge)-damage(aligned))<1e-8,name+' rotated outer contact retains source curve');
    }
  }}finally{f.restoreRandom();}
});

test('#1810 near-vertical direction, wall-constrained birth and miss controls retain native geometry and packets',async()=>{
  const good=await subject(),bad=await subject(true);
  try{for(const options of [
    ...[-HALF,HALF].flatMap(yaw=>[-HALF,HALF,-HALF+1e-12,HALF-1e-12].map(pitch=>({yaw,pitch}))),
    ...[-HALF,0,HALF].map(yaw=>({yaw,wall:true})),
    {yaw:HALF,hit:false},
  ]){
    const fixed=fire(good,options),old=fire(bad,options);
    assert.ok(Number.isFinite(fixed.sectorYaw));assert.ok(fixed.velocity.every(Number.isFinite));
    assert.deepEqual(fixed.start,old.start);assert.deepEqual(fixed.velocity,old.velocity);assert.deepEqual(fixed.packet,old.packet);
    if(options.wall||options.hit===false)assert.equal(fixed.contacts.length,0,'actual stage wall/miss cannot create damage');
  }}finally{good.restoreRandom();bad.restoreRandom();}
});

test('#1810 low-ink wire and Dynamo secondary zero policy remain identical while sector yaw is corrected',async()=>{
  const good=await subject(),bad=await subject(true);
  try{for(const ink of [1,100]){
    const fixed=fire(good,{yaw:HALF,ink}),old=fire(bad,{yaw:HALF,ink});
    assert.deepEqual(fixed.packet,old.packet);assert.equal(fixed.ink,old.ink);
    assert.deepEqual(fixed.secondary,old.secondary);
    assert.ok(fixed.secondary.every(rate=>rate===0),'existing source policy is preserved, not a Nintendo sentinel decoder');
    assert.equal(fixed.sectorYaw,HALF);
  }}finally{good.restoreRandom();bad.restoreRandom();}
});
