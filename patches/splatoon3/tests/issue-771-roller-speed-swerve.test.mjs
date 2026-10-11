import test from 'node:test';
import assert from 'node:assert/strict';
import {rollerSpeedSwerveDegrees} from '../runtime/weapons-fidelity.mjs';

const wide={BulletNum:12,SpawnSpeedBase:1.05,SpawnSpeedRandom:.36,SpawnWideDegree:18,SwerveRateBySpeed:.05};
const near={BulletNum:1,SpawnSpeedBase:.48,SpawnSpeedRandom:.11,SpawnWideDegree:4,SwerveRateBySpeed:.10};
const nearEq=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('#771 source main 12-glob fan now responds to SAME sampled launch speed',()=>{
  for(const offset of [0,5,11]){
    const center=rollerSpeedSwerveDegrees(wide,offset,12,wide.SpawnSpeedBase);
    const fast=rollerSpeedSwerveDegrees(wide,offset,12,wide.SpawnSpeedBase+wide.SpawnSpeedRandom);
    const slow=rollerSpeedSwerveDegrees(wide,offset,12,wide.SpawnSpeedBase-wide.SpawnSpeedRandom);
    nearEq(center,18*(offset/11*2-1));
    nearEq(fast-center,18*.05);
    nearEq(center-slow,18*.05);
    assert.ok(fast!==slow,'same projectile index responds to source speed variation');
  }
});

test('#771 one-glob near unit consumes its independent 0.1 swerve rate',()=>{
 nearEq(rollerSpeedSwerveDegrees(near,0,1,near.SpawnSpeedBase),0);
 nearEq(rollerSpeedSwerveDegrees(near,0,1,near.SpawnSpeedBase+near.SpawnSpeedRandom),.4);
 nearEq(rollerSpeedSwerveDegrees(near,0,1,near.SpawnSpeedBase-near.SpawnSpeedRandom),-.4);
});

test('#771 zero-rate/no-speed-random/invalid values preserve the deterministic base fan',()=>{
 const stationary={...wide,SwerveRateBySpeed:0};
 nearEq(rollerSpeedSwerveDegrees(stationary,0,12,1.41),-18);
 nearEq(rollerSpeedSwerveDegrees({...wide,SpawnSpeedRandom:0},11,12,1.2),18);
 nearEq(rollerSpeedSwerveDegrees(wide,0,12,Infinity),-18);
 nearEq(rollerSpeedSwerveDegrees(near,0,1,.48+1.1),.4);
});

test('#771 fixed 60Hz source-speed samples do not depend on 30/60/120Hz render cadence',()=>{
 const traces=[30,60,120].map(_hz=>
   Array.from({length:12},(_,i)=>{
     const sample=wide.SpawnSpeedBase+wide.SpawnSpeedRandom*((i%3)-1);
     return [i,sample,rollerSpeedSwerveDegrees(wide,i,12,sample)];
   }));
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
