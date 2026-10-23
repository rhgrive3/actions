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
}
