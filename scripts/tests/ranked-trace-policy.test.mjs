import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rankedTraceOptions,captureRankedBootPhase} from '../lib/ranked-trace-policy.mjs';
import {observeRankedBoot} from '../lib/ranked-boot-diagnostics.mjs';
test('normal tracing retains DOM snapshots; explicit diagnostic switch restores screenshot tracing',()=>{
 assert.deepEqual(rankedTraceOptions({}),{screenshots:false,snapshots:true,sources:false});
 assert.equal(rankedTraceOptions({RANKED_TRACE_FULL_SCREENSHOTS:'1'}).screenshots,true);
 for(const value of ['',undefined,'0','true'])assert.equal(rankedTraceOptions({RANKED_TRACE_FULL_SCREENSHOTS:value}).screenshots,false);
});
test('bounded boot images retain their state and report capture failure without replacing the boot result',async()=>{
 const receipt={context:2};let options;
 const page={evaluate:async()=>({ready:true}),screenshot:async o=>{options=o;}};
 await captureRankedBootPhase(page,'/tmp/evidence',receipt,'ready');assert.deepEqual(options,{path:'/tmp/evidence/boot-2-ready.png',timeout:5000});assert.equal(receipt.visualPhases[0].state.ready,true);
 page.screenshot=async()=>{throw Error('closed');};page.evaluate=async()=>{throw Error('crashed');};await captureRankedBootPhase(page,'/tmp/evidence',receipt,'dom-ready');assert.equal(receipt.visualPhases[1].screenshotError,'closed');assert.equal(receipt.visualPhases[1].stateError,'crashed');
});
test('phase observation cannot delay readiness timeout or turn an actual failure into success',async()=>{
 const handlers=new Map(),receipt={},phases=[];let waited;
 const page={on:(k,f)=>handlers.set(k,f),off:k=>handlers.delete(k),waitForFunction:async(_f,_x,opts)=>{waited=opts;throw Error('Timeout 180000ms exceeded');}};
 await assert.rejects(observeRankedBoot(page,'https://example.test/',receipt,async()=>{},{observePhase:async phase=>{phases.push(phase);throw Error('screenshot failed');}}),/Timeout 180000ms/);
 assert.deepEqual(waited,{timeout:180000,polling:250});assert.equal(receipt.status,'failed');assert.deepEqual(phases,['dom-ready']);assert.equal(handlers.size,0);
 const source=fs.readFileSync(new URL('../check-inkwave-ranked-browser.mjs',import.meta.url),'utf8');
 assert.match(source,/tracing.start\(rankedTraceOptions\(process.env\)\)/);assert.match(source,/tracing.stop\(\{path:path.join\(out,'trace-'/);assert.match(source,/failure-'\+i\+'\.png'/);assert.match(source,/status:'failed'/);
});
