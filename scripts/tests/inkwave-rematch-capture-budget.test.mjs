import test from 'node:test';import assert from 'node:assert/strict';
import {verifyRematchFailureRecovery} from '../lib/inkwave-rematch-failure-browser.mjs';
function fakePage(failAt=0){const state={scenario:null,shots:[],cleanups:0,retries:0},error=Error('CAPTURE_FAILED');return {state,error,
 async waitForFunction(){},
 async evaluate(fn,arg){const code=String(fn);if(arg?.scenario)state.scenario=arg.scenario;
  if(code.includes('q.retrySettled=false'))state.retries++;
  if(code.includes('q.restore();delete'))state.cleanups++;
  if(code.includes('return { rejected:'))return {rejected:null,menu:'main',mode:'menu',attract:true,toastCount:1};
  if(code.includes('return { scenario:'))return {scenario:state.scenario,calls:2,oldSettled:true,oldRejected:null,retrySettled:true,retryRejected:null,toastCount:state.scenario==='warm-rejection-retry'?1:0,mode:'match',menu:null,attract:false,playing:true,liveMatch:true,optionsPreserved:true,winnerPreserved:true};
  return null;
 },async screenshot(options){state.shots.push(options);if(state.shots.length===failAt)throw error;return Buffer.from('test-double');}};}
test('all three screenshots remain required with finite60s capture budget; no capture retry',async()=>{const p=fakePage();const r=await verifyRematchFailureRecovery(p,{evidenceDir:'/evidence',contentHash:'head'});assert.equal(r.length,2);assert.equal(p.state.shots.length,3);assert.deepEqual(p.state.shots.map(x=>x.timeout),[60000,60000,60000]);assert.equal(p.state.retries,2);assert.equal(p.state.cleanups,2);assert.equal(p.state.shots[0].path,'/evidence/warm-rejection-retry-recovered.png');});
for(const failAt of [1,2,3])test('screenshot failure '+failAt+' propagates without omission and always restores instrumentation',async()=>{const p=fakePage(failAt);await assert.rejects(verifyRematchFailureRecovery(p,{evidenceDir:'/evidence',contentHash:'head'}),e=>e===p.error);assert.equal(p.state.shots.length,failAt);assert.equal(p.state.cleanups,failAt===3?2:1);if(failAt===1)assert.equal(p.state.retries,0,'failed recovery image cannot be skipped to retry API');});
