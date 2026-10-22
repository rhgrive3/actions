import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {atomicIntroFunction,requireAtomicIntro} from '../lib/inkwave-projectile-atomic-intro.mjs';
import {nativeTurfIntroWithUiFunction} from '../lib/inkwave-projectile-intro-ui.mjs';
import {completeNativeTurfIntro} from '../lib/inkwave-projectile-ci-intro.mjs';
import {withProjectileCaptureUi} from '../lib/inkwave-projectile-capture-ui.mjs';
const source=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
const lo=source.indexOf('const playingReady = () => {'),hi=source.indexOf('\n    };',lo);
const playing=vm.runInNewContext('('+source.slice(lo,hi+7).replace('const playingReady = ','').replace(/;$/,'')+')');
function world(after=()=>{}){
  const m={state:'intro',stateT:0,time:180,attract:false,paused:false,controller:{},local:{isLocal:true}};
  const G={mode:'match',match:m,projectiles:{},renderer:{}},calls=[];
  const g={match:m,frozen:false,_skipRender:false,debug:{freeze(){g.frozen=true;calls.push('freeze');},unfreeze(){g.frozen=false;calls.push('unfreeze');if(m.state==='playing')after({m,g,G});}},_frame(dt){calls.push('frame');assert.equal(dt,1/60);assert.equal(g._skipRender,true);m.stateT+=dt;if(m.stateT>4.2){m.state='playing';m.stateT=0;}}};
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
async function actualHarnessCallback() {
  const start=source.indexOf('const atomicReceipt = await requireAtomicIntro(page,');
  const end=source.indexOf("\n    phaseMark('admission','end');",start);
  assert(start>=0&&end>start,'actual atomic call is present');
  let captured;
  const page={},phaseReceipt={},deadline=Date.now()+10000;
  const a=source.indexOf('const admissionReady = () => {'),b=source.indexOf('\n    };',a);
  assert(a>=0&&b>a,'native admission predicate is present');
  const admission=vm.runInNewContext('('+source.slice(a,b+7).replace('const admissionReady = ','').replace(/;$/,'')+')');
  await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})()',{
    page,phaseReceipt,deadline,atomicIntroFunction,completeNativeTurfIntro,withProjectileCaptureUi,nativeTurfIntroWithUiFunction,
    playingReady:playing,admissionReady:admission,
    requireAtomicIntro:async(...args)=>{captured=args;return {};},
  });
  assert.equal(captured[0],page);assert.equal(captured[2],deadline);
  assert.equal(captured[3].receipt,phaseReceipt.atomicIntro);
  return captured[1];
}
test('harness uses actual UI-wrapped atomic receipt with unchanged deadline and no second playing probe',async()=>{
  const callback=await actualHarnessCallback(),w=world(),phases=[];
  w.window.__iwProjectileCaptureUiGate=options=>{phases.push(JSON.parse(JSON.stringify(options)));return {ready:true};};
  const result=await vm.runInNewContext('('+callback.toString()+')()',{window:w.window});
  assert.equal(result.playingReady,true);
  assert.deepEqual(phases,[{phase:'admission',allowIntro:true,settled:false,cinematicAdmission:true},{phase:'intro-ui-wait',allowIntro:true,settled:false,requireHudSettled:true},{phase:'playing',settled:false}]);
  assert.equal(w.calls.filter(c=>c==='freeze').length,2);
  assert.ok(!source.includes("requireNativePhase(playingReady"));
  assert.ok(source.includes('const NATIVE_BOOT_TIMEOUT_MS = 180000;'));
  assert.ok(source.includes("window.__iwProjectileCaptureUiGate({phase:'settled'}).ready === true"),'native UI must complete inside the original deadline');
  assert.ok(!source.includes("timeout: 30000 }).catch(() => {})"),'failed UI readiness must not be swallowed');
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
  const end=source.indexOf('\n  const placement = await page.evaluate',start);
  assert(start>=0&&end>start,'failure block ends before capture placement');
  const block=source.slice(start,end);
  assert.ok(block.includes('atomicIntro:window.__iwProjectileAtomicIntroReceipt??null'));
  assert.ok(block.includes('failureSnapshotReturnedAtMs=Date.now()'));
  assert.ok(block.includes('native-startup-diagnostics-failed'));
  assert.ok(block.includes('throw error;'));
  assert.equal((block.match(/page\.evaluate\(/g)||[]).length,1);
});

test('incomplete or object-truthy admission does not invoke intro or playing predicate',()=>{
  for(const value of [false,{},null,undefined]){
    const window={value,intros:0,predicates:0};
    const fn=atomicIntroFunction(()=>{window.intros++;},()=>{window.predicates++;return true;},()=>window.value);
    const r=vm.runInNewContext('('+fn.toString()+')()',{window});
    assert.equal(r.admissionReady,false);assert.equal(window.intros,0);assert.equal(window.predicates,0);
    assert.equal(r.timing.outcome,'admission-pending');assert.equal(r.timing.introReturnedAtMs,undefined);
    assert.equal(typeof r.timing.admissionReturnedAtMs,'number');
  }
});
test('pending admission polls without frame steps then completes intro exactly once in accepting task',async()=>{
  const w=world();w.window.admitted=false;let evaluations=0,now=0;const sleeps=[],budgets=[];
  const fn=atomicIntroFunction(completeNativeTurfIntro,playing,()=>window.admitted);
  const page={evaluate:async callback=>{evaluations++;return vm.runInNewContext('('+callback.toString()+')()',{window:w.window});}};
  const receipt=await requireAtomicIntro(page,fn,1000,{now:()=>now,setTimer:(_,ms)=>{budgets.push(ms);return 1;},clearTimer(){},sleep:async ms=>{sleeps.push(ms);assert.equal(w.calls.length,0);now+=ms;w.window.admitted=true;}});
  assert.equal(evaluations,2);assert.deepEqual(sleeps,[250]);assert.deepEqual(budgets,[1000,750]);
  assert.equal(receipt.playingReady,true);assert.equal(w.calls.filter(c=>c==='freeze').length,1);
  assert.equal(w.calls.filter(c=>c==='unfreeze').length,1);assert.equal(w.m.time,180);
});
test('pending admission cannot refresh deadline or launch evaluation after poll budget expires',async()=>{
  let now=90,calls=0;const sleeps=[];
  await assert.rejects(requireAtomicIntro({evaluate:async()=>{calls++;return {admissionReady:false};}},()=>{},100,{now:()=>now,setTimer:()=>1,clearTimer(){},sleep:async ms=>{sleeps.push(ms);now+=ms;}}),/expired before evaluation/);
  assert.equal(calls,1);assert.deepEqual(sleeps,[10]);
});
test('admitted task still rejects false or object playing result without rerunning intro',async()=>{
  for(const value of [false,{}]){
    const window={value,intros:0};let evaluations=0;
    const fn=atomicIntroFunction(()=>{window.intros++;return {};},()=>window.value,()=>true);
    await assert.rejects(requireAtomicIntro({evaluate:async callback=>{evaluations++;return vm.runInNewContext('('+callback.toString()+')()',{window});}},fn,100,{now:()=>1}),/full playing predicate/);
    assert.equal(window.intros,1);assert.equal(evaluations,1);
  }
});
test('admission exception is preserved and does not run intro or retry',async()=>{
  const original={message:'admission original'},window={original,intros:0};let evaluations=0;
  const fn=atomicIntroFunction(()=>{window.intros++;},()=>true,()=>{throw window.original;});
  await assert.rejects(requireAtomicIntro({evaluate:async callback=>{evaluations++;return vm.runInNewContext('('+callback.toString()+')()',{window});}},fn,100,{now:()=>1}),e=>e===original);
  assert.equal(window.intros,0);assert.equal(evaluations,1);assert.equal(window.__iwProjectileAtomicIntroReceipt.outcome,'threw');
});
test('admitted ready result after deadline still fails and is never retroactively accepted',async()=>{
  const w=world();let now=0;const receipt={};
  const fn=atomicIntroFunction(completeNativeTurfIntro,playing,()=>true);
  await assert.rejects(requireAtomicIntro({evaluate:async callback=>{const result=await vm.runInNewContext('('+callback.toString()+')()',{window:w.window});now=101;return result;}},fn,100,{now:()=>now,receipt}),/after deadline/);
  assert.equal(w.m.state,'playing');assert.equal(receipt.outcome,'failed');
});
test('actual UI-wrapped admission cannot advance intro when UI is pending or object-truthy',async()=>{
  assert.equal(source.includes('requireNativePhase(admissionReady'),false);
  const callback=await actualHarnessCallback();
  for(const ready of [false,{},undefined]){
    const w=world();w.window.__iwProjectileCaptureUiGate=()=>({ready});
    const result=await vm.runInNewContext('('+callback.toString()+')()',{window:w.window});
    assert.equal(result.admissionReady,false);assert.equal(w.calls.length,0);
  }
});
test('actual harness preserves native admission and post-intro predicate even when UI is ready',async()=>{
  const callback=await actualHarnessCallback();
  const mutations=[w=>{w.G.mode='menu';},w=>{w.G.match={};},w=>{w.m.attract=true;},w=>{delete w.m.local;},w=>{delete w.m.controller;},w=>{delete w.G.projectiles;},w=>{delete w.G.renderer;}];
  for(const mutate of mutations){
    const w=world();mutate(w);w.window.__iwProjectileCaptureUiGate=()=>({ready:true});
    const before=await vm.runInNewContext('('+callback.toString()+')()',{window:w.window});
    assert.equal(before.admissionReady,false);assert.equal(w.calls.length,0);
    const after=world(mutate);after.window.__iwProjectileCaptureUiGate=()=>({ready:true});
    const result=await vm.runInNewContext('('+callback.toString()+')()',{window:after.window});
    assert.equal(result.playingReady,false);assert.equal(after.calls.filter(c=>c==='freeze').length,2);
  }
});
test('actual native admission predicate blocks incomplete state without intro frames',()=>{
  const start=source.indexOf('const admissionReady = () => {'),end=source.indexOf('\n    };',start);
  const admission=vm.runInNewContext('('+source.slice(start,end+7).replace('const admissionReady = ','').replace(/;$/,'')+')');
  for(const mutate of [w=>{w.G.mode='menu';},w=>{w.G.match={};},w=>{w.m.state='loading';},w=>{w.m.attract=true;},w=>{delete w.m.local;},w=>{delete w.m.controller;},w=>{delete w.g.debug;},w=>{delete w.G.projectiles;},w=>{delete w.G.renderer;}]){
    const w=world();mutate(w);
    const fn=atomicIntroFunction(completeNativeTurfIntro,playing,admission);
    const r=vm.runInNewContext('('+fn.toString()+')()',{window:w.window});
    assert.equal(r.admissionReady,false);assert.equal(w.calls.length,0);
  }
  const w=world(),fn=atomicIntroFunction(completeNativeTurfIntro,playing,admission);let tick=10;
  const r=vm.runInNewContext('('+fn.toString()+')()',{window:w.window,Date:{now:()=>tick++}});
  assert.equal(r.playingReady,true);
  assert.deepEqual([r.timing.enteredAtMs,r.timing.admissionReturnedAtMs,r.timing.introReturnedAtMs,r.timing.predicateReturnedAtMs],[10,11,12,13]);
});

