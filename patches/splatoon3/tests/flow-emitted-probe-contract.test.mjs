import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {flowCurveCases,validateFlowCurveRows,readFlowSource,runFlowCurveEmittedProbe} from '../../../scripts/lib/flow-curve-emitted-probe.mjs';
import crypto from 'node:crypto';
test('raw source delivery binds exact manifest bytes and rejects wrong pin, missing and unsafe paths',()=>{
 const root=new URL('../../../',import.meta.url),relative='patches/splatoon3/runtime/flow-effects.mjs';
 const body=fs.readFileSync(new URL(relative,root)),sha256=crypto.createHash('sha256').update(body).digest('hex');
 const manifest={files:{'patch/runtime/flow-effects.mjs':sha256}};
 assert.deepEqual(readFlowSource(root,relative,manifest),{body,sha256});
 for(const files of [{},{'patch/runtime/flow-effects.mjs':'0'.repeat(64)}])assert.throws(()=>readFlowSource(root,relative,{files}));
 for(const path of ['patches/splatoon3/../runtime/flow-effects.mjs','patches/splatoon3//runtime/flow-effects.mjs','other/flow-effects.mjs'])assert.throws(()=>readFlowSource(root,path,manifest));
});
test('strict mismatch retains both rows and exact path/value without relaxing the gate',()=>{
 const expected=Array.from({length:24},(_,i)=>({value:i})),actual=structuredClone(expected);actual[3].value+=Number.EPSILON*4;
 assert.throws(()=>validateFlowCurveRows(actual,expected),e=>{assert.equal(e.message,'Source/emitted Flow output differs');assert.equal(e.flowCurveParity.status,'failed');assert.deepEqual(e.flowCurveParity.actual,actual);assert.deepEqual(e.flowCurveParity.expected,expected);assert.equal(e.flowCurveParity.differences[0].path,'rows.3.value');assert.equal(e.flowCurveParity.differences[0].actual,actual[3].value);return true;});
});
test('length and nonfinite mismatch diagnostics remain explicit and throw',()=>{
 const expected=Array.from({length:24},()=>({value:1}));
 for(const actual of [expected.slice(1),expected.map((x,i)=>i?x:{value:NaN})])assert.throws(()=>validateFlowCurveRows(actual,expected),e=>{assert(e.flowCurveParity.differences.length);assert.equal(e.flowCurveParity.expectedCount,24);return true;});
});
import {refreshFlowEffects} from '../runtime/flow-effects.mjs';
import {weaponWeight} from '../runtime/weapon-weight.mjs';
const gear=fs.readFileSync(new URL('../runtime/gear.mjs',import.meta.url),'utf8');
const curve=vm.runInNewContext(gear.slice(gear.indexOf('export function gearCurve('),gear.indexOf('export function modifiersFor(')).replace('export ','')+';gearCurve');
const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
const rows=flowCurveCases(refreshFlowEffects,curve,weaponWeight,profile);
test('same-engine orchestration retains strict mismatch and removes its source route',async()=>{
 const root=new URL('../../../',import.meta.url),required=['runtime/flow-effects.mjs','runtime/gear.mjs','runtime/weapon-weight.mjs','profile.json'];
 const manifest={files:Object.fromEntries(required.map(p=>['patch/'+p,crypto.createHash('sha256').update(fs.readFileSync(new URL('patches/splatoon3/'+p,root))).digest('hex')]))};
 for(const mismatch of [false,true]){
  let handler,restored=false;const page={url:()=> 'http://127.0.0.1:1234/flow-render',async route(pattern,h){handler=h;},async unroute(pattern,h){assert.equal(h,handler);restored=true;},async evaluate(fn,args){
   assert.equal(args.sourcePrefix,'http://127.0.0.1:1234/__flow_source__/');assert.equal(args.prefix,'/_versions/pinned/');
   for(const path of required)await handler({request:()=>({url:()=>args.sourcePrefix+'patches/splatoon3/'+path}),fulfill:async r=>{assert.equal(r.status,200);assert(r.body.length);},abort:async()=>{throw Error('Unexpected source rejection');}});
   const actual=structuredClone(rows);if(mismatch)actual[0].modifiers.runSpeed+=Number.EPSILON;
   return {actual,expected:structuredClone(rows)};
  }};
  if(mismatch)await assert.rejects(runFlowCurveEmittedProbe(page,{prefix:'/_versions/pinned/',root,manifest}),e=>{assert.equal(e.flowCurveParity.sourceServed.length,4);assert.equal(e.flowCurveParity.nodeExpected.length,24);return true;});
  else {const r=await runFlowCurveEmittedProbe(page,{prefix:'/_versions/pinned/',root,manifest});assert.equal(r.cases,24);assert.equal(r.sourceServed.length,4);}
  assert.equal(restored,true);
 }
});
test('emitted probe input matrix has 24 cases across three weights and unchanged-state zero work',()=>{assert.deepEqual(validateFlowCurveRows(rows,structuredClone(rows)),{cases:24,refreshCalls:312,cachedCalls:0});});
test('missing export and wrong weight reject',()=>{assert.throws(()=>flowCurveCases(undefined,curve,weaponWeight,profile));assert.throws(()=>flowCurveCases(refreshFlowEffects,curve,()=> 'Mid',profile));});
test('changed output, missing rows and nonfinite output reject',()=>{for(const edit of [r=>r.pop(),r=>r[0].modifiers.runSpeed+=.001,r=>r[0].spreadAir=NaN]){const bad=structuredClone(rows);edit(bad);assert.throws(()=>validateFlowCurveRows(bad,rows));}});
test('fixture must exercise optimized curve count, not just equal output',()=>{const extra=(a,b,p,ap,c)=>{refreshFlowEffects(a,b,p,ap,c);c(0,0,.5,1);};assert.throws(()=>flowCurveCases(extra,curve,weaponWeight,profile));});
