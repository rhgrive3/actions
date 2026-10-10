import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceShooterNearestSlot} from '../runtime/shooter-nearest-paint.mjs';
const sourced = {SplitNum:8,ForceSpawnNearestAddNumArray:[4]};
test('16 successful shooter rounds force only slots 4/8 in each cycle',()=>{
 const r={s3ShooterNearestSlot:0},hits=[];
 for(let shot=1;shot<=16;shot++)if(advanceShooterNearestSlot(r,sourced))hits.push(shot);
 assert.deepEqual(hits,[4,8,12,16]);
});
test('dry or cancelled fire does not consume shot slots',()=>{
 const r={s3ShooterNearestSlot:0};
 for(let shot=0;shot<3;shot++)assert.equal(advanceShooterNearestSlot(r,sourced),false);
 // No call for empty-trigger attempt.
 assert.equal(r.s3ShooterNearestSlot,3);
 assert.equal(advanceShooterNearestSlot(r,sourced),true);
});
test('non-default valid cycles retain split-end foot paint',()=>{
 const r={};const s={SplitNum:7,ForceSpawnNearestAddNumArray:[]};
 assert.deepEqual(Array.from({length:14},(_,i)=>advanceShooterNearestSlot(r,s)?i+1:null).filter(Boolean),[7,14]);
});
test('invalid source never silently paints a random cadence',()=>{
 assert.throws(()=>advanceShooterNearestSlot({}, {SplitNum:0,ForceSpawnNearestAddNumArray:[4]}),RangeError);
});
