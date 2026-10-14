import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGyroMotionDenial,GYRO_MOTION_DENIAL_CONTEXT} from '../lib/inkwave-gyro-motion-denial.mjs';
const evidence = () => ({userAgent:GYRO_MOTION_DENIAL_CONTEXT.userAgent,secureContext:true,results:Array.from({length:8},(_,i)=>({name:String(i),pass:true}))});
test('returns all eight successful browser receipts',async()=>{
 const value=evidence();assert.equal(await checkGyroMotionDenial({evaluate:async()=>value}),value);
});
test('rejects incomplete scenario execution',async()=>{
 const value=evidence();value.results.pop();await assert.rejects(checkGyroMotionDenial({evaluate:async()=>value}),/All delayed-motion scenarios/);
});
test('rejects an individual browser scenario failure',async()=>{
 const value=evidence();value.results[3]={name:'90Hz',pass:false,error:'regression'};await assert.rejects(checkGyroMotionDenial({evaluate:async()=>value}),/regression/);
});
test('propagates browser evaluation failure',async()=>{
 await assert.rejects(checkGyroMotionDenial({evaluate:async()=>{throw Error('module import failed');}}),/module import failed/);
});

test('isolated denial context selects Android and rejects desktop evidence',async()=>{
 assert.match(GYRO_MOTION_DENIAL_CONTEXT.userAgent,/Android/i);
 const value=evidence();value.userAgent='Desktop';await assert.rejects(checkGyroMotionDenial({evaluate:async()=>value}),/Android production path/);
});
