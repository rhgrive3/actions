import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeEventMemoProbe}from'./native-ground-event-memo-fixture.mjs';
for(const hz of[30,60,120])test(`native Actor event boundary preserves support, full pose and muzzle at ${hz}Hz`,async t=>{
 const out=await nativeEventMemoProbe({hz});
 assert.equal(out.authoritativeEqual,true);assert.equal(out.firstContact,-1);assert.equal(out.firstPose,-1);assert.equal(out.firstMuzzle,-1);assert.equal(out.maxMuzzle,0);
 const[control,candidate]=out.states;assert.deepEqual(candidate.events,control.events);assert.ok(candidate.events.length>0);
 for(const s of out.states){assert.equal(s.callback[0].first,0);assert.ok(Math.abs(s.callback[0].second-.1)<1e-9);assert.equal(s.callback[0].active,false);assert.deepEqual(s.nested,[false]);assert.equal(s.active,false);assert.equal(s.retained,0);assert.equal(s.poolRetainsPhysics,false);}
 assert.ok(candidate.memoHits>0,'identical queries still reuse results between callbacks');assert.equal(control.queries-candidate.queries,candidate.memoHits);
 t.diagnostic(JSON.stringify(out));
});
test('throwing native Actor event listeners release memo leases and cached physics references',async t=>{
 const out=await nativeEventMemoProbe({throws:true});
 for(const s of out.states){assert.equal(s.expectedError,true);assert.equal(s.callback[0].active,false);assert.equal(s.active,false);assert.equal(s.retained,0);assert.equal(s.poolRetainsPhysics,false);}
 t.diagnostic(JSON.stringify(out));
});
