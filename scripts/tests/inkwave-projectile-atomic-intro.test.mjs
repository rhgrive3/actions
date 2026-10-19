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
