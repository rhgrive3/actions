import test from 'node:test';import assert from 'node:assert/strict';
import {pushQuantileSample,orderedQuantile} from '../rolling-quantile.mjs';
test('incremental 60-sample windows match independent stable-sort quantiles over bursts, ties and signed zero',()=>{
 const values=[],ordered=[];let seed=9;
 for(let i=0;i<20000;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const value=i%17===0?-0:i%13===0?0:i%11===0?.25:(seed%1000)/1000;
  pushQuantileSample(values,ordered,value);const oracle=[...values].sort((a,b)=>a-b);
  assert.deepEqual(ordered,oracle);assert.ok(values.length<=60);
  for(const q of [.9,.95])assert.ok(Object.is(orderedQuantile(ordered,q),oracle[Math.min(oracle.length-1,Math.floor(q*oracle.length))]));
 }
});
