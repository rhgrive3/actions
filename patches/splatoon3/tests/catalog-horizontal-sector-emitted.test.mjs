// These positives consume actual selected source/emitted modules unchanged.
// The source-only old-policy mutation lives in the separate aim test file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {subject,fire,damage,names} from './catalog-horizontal-sector-fixture.mjs';
const HALF=Math.PI/2;

test('horizontal sector production positives: four owners keep camera-relative central damage at 30/60/120 Hz',async()=>{
  const f=await subject();
  try{for(const name of names)for(const hz of [30,60,120]){
    const aligned=fire(f,{name,hz});assert.ok(damage(aligned)>0);
    for(const yaw of [-HALF,HALF]){
      const turned=fire(f,{name,hz,yaw});
      assert.equal(turned.aimYaw,yaw);assert.ok(Math.abs(turned.bodyYaw-yaw)>1);
      assert.equal(turned.sectorYaw,yaw);assert.ok(turned.sectors.every(v=>v===yaw));
      assert.equal(turned.contacts.length,1);assert.equal(turned.contacts[0].table,'inside');
      assert.ok(Math.abs(damage(turned)-damage(aligned))<1e-8,name+' equivalent native central damage');
      if(name==='Dynamo Roller')assert.equal(damage(turned),180);
    }
  }}finally{f.restoreRandom();}
});

test('horizontal sector production positives: edge fans retain the actual outside curve',async()=>{
  const f=await subject();
  try{for(const name of names){
    const aligned=fire(f,{name,outer:true});
    for(const yaw of [-HALF,HALF]){
      const turned=fire(f,{name,yaw,outer:true});
      assert.equal(turned.sectorYaw,yaw);assert.equal(turned.contacts.length,1);
      assert.equal(turned.contacts[0].table,'outside');
      assert.ok(Math.abs(damage(turned)-damage(aligned))<1e-8);
    }
  }}finally{f.restoreRandom();}
});

test('horizontal sector production positives: near-vertical births and actual walls/misses remain finite and non-damaging',async()=>{
  const f=await subject();
  try{for(const options of [
    ...[-HALF,HALF].flatMap(yaw=>[-HALF,HALF,-HALF+1e-12,HALF-1e-12].map(pitch=>({yaw,pitch}))),
    ...[-HALF,0,HALF].map(yaw=>({yaw,wall:true})),{yaw:HALF,hit:false},
  ]){
    const row=fire(f,options);assert.ok(Number.isFinite(row.sectorYaw));
    assert.ok(row.start.every(Number.isFinite));assert.ok(row.velocity.every(Number.isFinite));
    if(options.wall||options.hit===false)assert.equal(row.contacts.length,0);
  }}finally{f.restoreRandom();}
});
