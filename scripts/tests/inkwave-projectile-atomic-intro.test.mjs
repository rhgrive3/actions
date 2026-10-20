import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {atomicIntroFunction,requireAtomicIntro} from '../lib/inkwave-projectile-atomic-intro.mjs';
import {completeNativeTurfIntro} from '../lib/inkwave-projectile-ci-intro.mjs';
const source=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
const lo=source.indexOf('const playingReady = () => {'),hi=source.indexOf('\n    };',lo);
const playing=vm.runInNewContext('('+source.slice(lo,hi+7).replace('const playingReady = ','').replace(/;$/,'')+')');
function world(after=()=>{}){
  const m={state:'intro',stateT:0,time:180,attract:false,paused:false,controller:{},local:{isLocal:true}};
  const G={mode:'match',match:m,projectiles:{},renderer:{}},calls=[];
  const g={match:m,frozen:false,_skipRender:false,debug:{freeze(){g.frozen=true;calls.push('freeze');},unfreeze(){g.frozen=false;calls.push('unfreeze');after({m,g,G});}},_frame(dt){calls.push('frame');assert.equal(dt,1/60);assert.equal(g._skipRender,true);m.stateT+=dt;if(m.stateT>4.2){m.state='playing';m.stateT=0;}}};
  return {m,g,G,calls,window:{__inkwave:g,__G:G}};
}
test('same browser task completes unchanged intro then validates full playing state',async()=>{
  const w=world(),callback=atomicIntroFunction(completeNativeTurfIntro,playing);let evaluations=0;
  const page={evaluate:async fn=>{evaluations++;return vm.runInNewContext('('+fn.toString()+')()',{window:w.window});}};
  const receipt=await requireAtomicIntro(page,callback,Date.now()+1000);
  assert.equal(evaluations,1);assert.equal(receipt.playingReady,true);assert.equal(receipt.readiness.state,'playing');
  assert.equal(receipt.readiness.local,true);assert.equal(receipt.readiness.renderer,true);
  assert.ok(receipt.intro.frames>=252&&receipt.intro.frames<=255);assert.equal(w.m.time,180);
  assert.equal(w.g.frozen,false);assert.equal(w.g._skipRender,false);assert.equal(w.calls.at(-1),'unfreeze');
});
test('post-intro missing native fields fail full predicate without another browser task',async()=>{
  for(const mutate of [w=>{w.G.mode='menu';},w=>{w.G.match={};},w=>{w.m.attract=true;},w=>{delete w.m.local;},w=>{delete w.m.controller;},w=>{delete w.G.projectiles;},w=>{delete w.G.renderer;}]){
    const w=world(mutate),fn=atomicIntroFunction(completeNativeTurfIntro,playing);
    await assert.rejects(requireAtomicIntro({evaluate:async callback=>vm.runInNewContext('('+callback.toString()+')()',{window:w.window})},fn,Date.now()+1000),/full playing predicate/);
  }
});
test('false and object-truthy predicates cannot satisfy admission',async()=>{
  for(const value of [false,{},null,undefined])await assert.rejects(requireAtomicIntro({evaluate:async()=>({playingReady:value})},()=>{},Date.now()+1000),/full playing predicate/);
});
test('late and already-expired receipts are rejected despite a true predicate',async()=>{
  let now=0,calls=0;
  const page={evaluate:async()=>{calls++;now=101;return {playingReady:true};}};
  await assert.rejects(requireAtomicIntro(page,()=>{},100,{now:()=>now}),/after deadline/);
  assert.equal(calls,1);
  await assert.rejects(requireAtomicIntro(page,()=>{},100,{now:()=>101}),/expired before/);assert.equal(calls,1);
});
test('unreturned evaluation consumes only remaining deadline and clears timer',async()=>{
  let delay,cleared;
  await assert.rejects(requireAtomicIntro({evaluate:()=>new Promise(()=>{})},()=>{},100,{now:()=>75,setTimer:(fn,ms)=>{delay=ms;queueMicrotask(fn);return 4;},clearTimer:id=>cleared=id}),/budget exceeded/);
  assert.equal(delay,25);assert.equal(cleared,4);
});
test('harness uses atomic receipt with unchanged deadline and no second playing probe',()=>{
  assert.ok(source.includes('atomicIntroFunction(completeNativeTurfIntro,playingReady),deadline'));
  assert.ok(!source.includes("requireNativePhase(playingReady"));
  assert.ok(source.includes('const NATIVE_BOOT_TIMEOUT_MS = 180000;'));
  assert.ok(source.includes("timeout: 30000 }).catch(() => {})"),'downstream optional HUD observation retained');
});


test('browser timing is persisted with ordered entry, intro and predicate returns',()=>{
  const w=world();let now=10;
  const fn=atomicIntroFunction(completeNativeTurfIntro,playing);
  const result=vm.runInNewContext('('+fn.toString()+')()',{window:w.window,Date:{now:()=>now++}});
  assert.equal(result.timing,w.window.__iwProjectileAtomicIntroReceipt);
  assert.equal(result.timing.enteredAtMs,10);assert.equal(result.timing.introReturnedAtMs,11);
  assert.equal(result.timing.predicateReturnedAtMs,12);assert.equal(result.timing.outcome,'ready');
  assert.equal(result.timing.intro.frames,result.intro.frames);
  assert.equal(w.calls.filter(c=>c==='freeze').length,1);
});
test('failed predicates and native exceptions persist evidence without masking native error',()=>{
  const w=world();const no=atomicIntroFunction(()=>({frames:0}),()=>false);
  const result=vm.runInNewContext('('+no.toString()+')()',{window:w.window});
  assert.equal(result.timing.outcome,'predicate-failed');
  const thrown={message:'native original'},fail=atomicIntroFunction(()=>{throw window.nativeError;},()=>true);
  w.window.nativeError=thrown;
  assert.throws(()=>vm.runInNewContext('('+fail.toString()+')()',{window:w.window}),e=>e===thrown);
  assert.equal(w.window.__iwProjectileAtomicIntroReceipt.outcome,'threw');
  assert.equal(w.window.__iwProjectileAtomicIntroReceipt.error,'native original');
  assert.equal(w.window.__iwProjectileAtomicIntroReceipt.introReturnedAtMs,undefined);
});
test('unavailable diagnostic storage does not change execution or error identity',()=>{
  const w=world();Object.defineProperty(w.window,'__iwProjectileAtomicIntroReceipt',{set(){throw Error('diagnostics denied');}});
  const fn=atomicIntroFunction(completeNativeTurfIntro,playing);
  const result=vm.runInNewContext('('+fn.toString()+')()',{window:w.window});
  assert.equal(result.playingReady,true);
  const original={message:'real error'};w.window.original=original;
  const failed=atomicIntroFunction(()=>{throw window.original;},()=>true);
  assert.throws(()=>vm.runInNewContext('('+failed.toString()+')()',{window:w.window}),e=>e===original);
});
test('host timing distinguishes late CDP delivery without changing failed outcome',async()=>{
  let now=20,resolveEvaluation,timerCallback,calls=0;
  const receipt={},page={evaluate:()=>{calls++;return new Promise(resolve=>resolveEvaluation=resolve);}};
  const pending=requireAtomicIntro(page,()=>{},100,{receipt,now:()=>now,setTimer:fn=>{timerCallback=fn;return 1;},clearTimer(){}});
  assert.equal(receipt.requestedAtMs,20);assert.equal(receipt.deadlineAtMs,100);
  now=100;timerCallback();await assert.rejects(pending,/budget exceeded/);
  assert.equal(receipt.outcome,'failed');assert.equal(receipt.deadlineObservedAtMs,100);
  now=110;resolveEvaluation({playingReady:true,timing:{enteredAtMs:30,introReturnedAtMs:70,predicateReturnedAtMs:71,outcome:'ready'}});
  await Promise.resolve();await Promise.resolve();
  assert.equal(receipt.evaluationReturnedAtMs,110);assert.equal(receipt.browserTiming.predicateReturnedAtMs,71);
  assert.equal(receipt.outcome,'failed');assert.equal(calls,1);
});
test('host diagnostic write failure preserves native rejection and accepted result',async()=>{
  const receipt=new Proxy({},{set(){throw Error('diagnostics write denied');}}),original=new Error('native rejection');
  await assert.rejects(requireAtomicIntro({evaluate:async()=>{throw original;}},()=>{},100,{receipt,now:()=>1}),e=>e===original);
  const result=await requireAtomicIntro({evaluate:async()=>({playingReady:true})},()=>{},100,{receipt,now:()=>1});
  assert.equal(result.playingReady,true);
});
test('failure snapshot is diagnostic only and original failure is rethrown',()=>{
  const start=source.indexOf('phaseReceipt.failureSnapshotRequestedAtMs');
  const end=source.indexOf('\n  await page.waitForFunction',start);const block=source.slice(start,end);
  assert.ok(block.includes('atomicIntro:window.__iwProjectileAtomicIntroReceipt??null'));
  assert.ok(block.includes('failureSnapshotReturnedAtMs=Date.now()'));
  assert.ok(block.includes('native-startup-diagnostics-failed'));
  assert.ok(block.includes('throw error;'));
  assert.equal((block.match(/page\.evaluate\(/g)||[]).length,1);
});
