import test from 'node:test';import assert from 'node:assert/strict';
import {verifyRematchFailureRecovery} from '../lib/inkwave-rematch-failure-browser.mjs';
function fakePage(failAt=0){const state={scenario:null,shots:[],cleanups:0,retries:0},error=Error('CAPTURE_FAILED');return {state,error,
 async waitForFunction(){},
 async evaluate(fn,arg){const code=String(fn);if(arg?.scenario)state.scenario=arg.scenario;
  if(code.includes('q.retrySettled=false'))state.retries++;
  if(code.includes('q.restore();delete'))state.cleanups++;
  if(code.includes('return { rejected:'))return {rejected:null,menu:'main',mode:'menu',attract:true,toastCount:1};
  if(code.includes('return { scenario:'))return {scenario:state.scenario,calls:state.scenario==='warm-rejection-retry'?3:2,rematchCalls:2,attractCalls:state.scenario==='warm-rejection-retry'?1:0,warmOwners:[],oldSettled:true,oldRejected:null,retrySettled:true,retryRejected:null,toastCount:state.scenario==='warm-rejection-retry'?1:0,mode:'match',menu:null,attract:false,playing:true,liveMatch:true,optionsPreserved:true,winnerPreserved:true};
  return null;
 },async screenshot(options){state.shots.push(options);if(state.shots.length===failAt)throw error;return Buffer.from('test-double');}};}
test('all three screenshots remain required with finite60s capture budget; no capture retry',async()=>{const p=fakePage();const r=await verifyRematchFailureRecovery(p,{evidenceDir:'/evidence',contentHash:'head'});assert.equal(r.length,2);assert.equal(p.state.shots.length,3);assert.deepEqual(p.state.shots.map(x=>x.timeout),[60000,60000,60000]);assert.equal(p.state.retries,2);assert.equal(p.state.cleanups,2);assert.equal(p.state.shots[0].path,'/evidence/warm-rejection-retry-recovered.png');});
for(const failAt of [1,2,3])test('screenshot failure '+failAt+' propagates without omission and always restores instrumentation',async()=>{const p=fakePage(failAt);await assert.rejects(verifyRematchFailureRecovery(p,{evidenceDir:'/evidence',contentHash:'head'}),e=>e===p.error);assert.equal(p.state.shots.length,failAt);assert.equal(p.state.cleanups,failAt===3?2:1);if(failAt===1)assert.equal(p.state.retries,0,'failed recovery image cannot be skipped to retry API');});

for(const liveCalls of [1,3])test('rematch warm accounting rejects '+liveCalls+' live calls and restores instrumentation',async()=>{
 const p=fakePage(),evaluate=p.evaluate.bind(p);
 p.evaluate=async(fn,arg)=>{const r=await evaluate(fn,arg);return String(fn).includes('return { scenario:')?{...r,calls:liveCalls+1,rematchCalls:liveCalls,attractCalls:1}:r;};
 await assert.rejects(verifyRematchFailureRecovery(p,{evidenceDir:'/evidence',contentHash:'head'}),e=>e.message.includes('violated live ownership'));
 assert.equal(p.state.cleanups,1);
});
test('unknown warm owner fails before the fault gate and restores the native warm function',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
 const match={attract:false},warm=()=>{throw Error('unknown owner must not delegate');};
 const g={match,lastMatchOpts:{},_warmCharacters:warm,menus:{toast(){}},api:{}};
 g.api.rematch=()=>g._warmCharacters({attract:false});
 Object.defineProperty(globalThis,'window',{value:{__inkwave:g,__G:{match}},configurable:true,writable:true});
 const p=fakePage(),evaluate=p.evaluate.bind(p);
 p.evaluate=async(fn,arg)=>arg?.scenario||String(fn).includes('q.restore();delete')?fn(arg):evaluate(fn,arg);
 try {
  await assert.rejects(verifyRematchFailureRecovery(p,{evidenceDir:'/evidence',contentHash:'head'}),e=>e.message.includes('no current match owner'));
  assert.equal(g._warmCharacters,warm);
  assert.equal(window.__inkwaveRematchFailureQA,undefined);
 } finally {if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
});
