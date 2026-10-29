import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeProbe} from './issue-845-ground-certificate-fixture.mjs';

test('native triangle and dynamic support retain exact ground queries at 30/60/120 render schedules',async t=>{
 let baseline;
 for(const hz of [30,60,120]){
  const out=await nativeProbe({hz});
  assert.ok(Math.abs(out.groundAt-.1)<1e-9,'native ground sees the distinct small support');
  assert.ok(out.budget>=120,'real source-loaded actor enters hidden budget');
  assert.ok(out.targetHits>0,'actual retarget contacts query the support between ankle/heel/ball samples');
  const trace=JSON.stringify(out.rows);
  if(baseline)assert.equal(trace,baseline,'same fixed-tick actor, muzzle and contact state across render schedules');else baseline=trace;
  t.diagnostic(JSON.stringify({hz,groundCalls:out.ground,targetHits:out.targetHits,budgetTicks:out.budget}));
 }
});
