import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(!vm.SourceTextModule){
 test('navigation publication VM subprocess',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;execFileSync(process.execPath,['--max-old-space-size=128','--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});});
}else{
 const {createRecoveryFixture}=await import('./native-world-recovery-fixture.mjs');
 for(const stop of ['none','signal','generation'])test('detached navigation '+stop+' publishes only completed current candidate',async()=>{
  let ready,release,current=true,received;
  const entered=new Promise(resolve=>ready=resolve),gate=new Promise(resolve=>release=resolve);
  const f=await createRecoveryFixture({}, {modify({mock}){mock.NavGraph=class{static async createNative(level,physics,options){received=options;ready();await gate;return {level,complete:true,nativeBuildMetrics:{yieldCount:5}};}};}});
  const oldNav=f.G.nav,pending=f.build(f.game,{id:'tiny',name:'tiny'},()=>current);await entered;
  assert.equal(f.G.nav,oldNav);assert.equal(f.G.level,f.oldLevel);assert.equal(f.counters.newMinimapActive,0);assert.equal(f.counters.old,0);assert.equal(received.current(),true);
  if(stop==='signal')f.game._nativeAbort.abort();if(stop==='generation')current=false;release();await pending;
  if(stop==='none'){assert.equal(f.G.nav.complete,true);assert.equal(f.game.nativeWorld.metrics.navBuild.yieldCount,5);assert.equal(f.counters.newMinimapActive,1);}
  else{assert.equal(f.G.nav,oldNav);assert.equal(f.G.level,f.oldLevel);assert.equal(f.counters.newPaint,1);assert.equal(f.counters.newDisplay,1);assert.equal(f.counters.old,0);assert.equal(f.counters.newMinimapActive,0);}
 });
 test('desktop starts navigation before texture completion and waits before publication',async()=>{
  let releaseNav,releaseTextures;const navGate=new Promise(resolve=>releaseNav=resolve),textureGate=new Promise(resolve=>releaseTextures=resolve),events=[];
  const f=await createRecoveryFixture({}, {modify({mock,game}){game.mobile.touch=false;mock.navigator.deviceMemory=16;mock.NavGraph=class{static async createNative(level){events.push('nav');await navGate;return {level};}};mock.loadNativeTextures=async()=>{events.push('textures');await textureGate;return new Map();};}});
  const pending=f.build(f.game,{id:'tiny',name:'tiny'},()=>true);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,['nav','textures']);assert.equal(f.G.level,f.oldLevel);
  releaseTextures();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.G.level,f.oldLevel);releaseNav();await pending;assert.notEqual(f.G.level,f.oldLevel);assert.equal(f.counters.newMinimapActive,1);
 });
 test('desktop texture failure aborts and settles detached navigation without touching the old world',async()=>{
  const error=Error('texture failure');let stopped=false;
  const f=await createRecoveryFixture({}, {modify({mock,game}){game.mobile.touch=false;mock.navigator.deviceMemory=16;mock.NavGraph=class{static createNative(_level,_physics,{signal}){return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{stopped=true;reject(signal.reason);},{once:true}));}};mock.loadNativeTextures=async()=>{throw error;};}});
  await assert.rejects(f.build(f.game,{id:'tiny',name:'tiny'},()=>true),value=>value===error);assert.equal(stopped,true);assert.equal(f.G.level,f.oldLevel);assert.equal(f.counters.old,0);
 });

}
