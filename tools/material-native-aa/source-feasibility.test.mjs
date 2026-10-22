import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.env.INKWAVE_MATERIAL_COMMON_SOURCE;
assert.ok(root,'Set the immutable COMMON source directory');
const contract=JSON.parse(fs.readFileSync(new URL('./source-contract.json',import.meta.url),'utf8'));
const bodies={};
for(const [file,expected] of Object.entries(contract.blobs)){
 const body=fs.readFileSync(path.join(root,file),'utf8');
 assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(body)+'\0'+body).digest('hex'),expected,file);
 bodies[file]=body;
}
const {installPortraitWork}=await import(pathToFileURL(path.join(root,'patches/local-quality/portrait-work.mjs')));
const core=bodies['inkwave-public/vendor/three/build/three.core.js'];
const start=core.indexOf('function probeAsync( gl, sync, interval ) {');assert.ok(start>=0);
const probeAsync=Function('return '+core.slice(start,core.indexOf('\n}\n',start)+2))();
const createProbe=()=>{
 let calls=0;
 const gl={SYNC_FLUSH_COMMANDS_BIT:1,WAIT_FAILED:2,TIMEOUT_EXPIRED:3,CONDITION_SATISFIED:4,clientWaitSync:()=>++calls<3?3:4};
 return{promise:probeAsync(gl,{},1),count:()=>calls};
};
test('exact vendor async readback completion polls timers, not native frames or RAF',async()=>{
 const module=bodies['inkwave-public/vendor/three/build/three.module.js'];
 const s=module.indexOf('this.readRenderTargetPixelsAsync = async function');assert.ok(s>=0);
 const body=module.slice(s,module.indexOf('\n\t\t};',s)+5);
 assert.match(body,/_gl\.flush\(\);[\s\S]*await probeAsync\( _gl, sync, 4 \)/);
 assert.doesNotMatch(body,/requestAnimationFrame|_frame|_portraitStep/);
 const p=createProbe();await p.promise;assert.equal(p.count(),3);
});
test('one actual native portrait step schedules all14 updates and completion without further native servicing',async()=>{
 const prior=globalThis.requestIdleCallback,queue=[];let stepCalls=0,updates=0,resets=0,renders=0,delivered=0,probe;
 globalThis.requestIdleCallback=(fn,opts)=>{assert.equal(opts.timeout,120);queue.push(fn);return queue.length;};
 try{
  class Showcase{
   constructor(){this._portraitCharacter={resetPortraitForRequest:()=>resets++,update:(dt,animation)=>{assert.equal(dt,1/30);assert.equal(animation.time,updates/30);updates++;}};this._warmState='done';this._pq=[{key:'existing',req:{},cbs:[()=>delivered++]}];this._pcache=new Map();this.mode='hud';}
   _portraitStep(){throw Error('Native fallback should not run');}
   _anim(){return{};}
   _renderPortrait(){renders++;probe=createProbe();return probe.promise.then(()=>({width:2,height:2}));}
   _renderPortraitRun(){}
   dispose(){}
  }
  installPortraitWork(Showcase,{game:{mobile:{touch:false}}},canvas=>canvas,new Set(['hud']));
  const owner=new Showcase();stepCalls++;owner._portraitStep();
  assert.equal(owner._portraitJob.key,'existing');assert.ok(owner._portraitTask);
  while(queue.length){assert.ok(queue.length===1);queue.shift()({didTimeout:true,timeRemaining:()=>0});}
  assert.equal(stepCalls,1);assert.equal(resets,1);assert.equal(updates,14);assert.equal(renders,1);
  assert.equal(owner._pflight,1);assert.equal(owner._portraitJob,null);assert.equal(owner._portraitTask,null);
  await probe.promise;await Promise.resolve();await Promise.resolve();
  assert.equal(owner._pflight,0);assert.equal(delivered,1);assert.equal(owner._pq.length,0);assert.equal(owner._portraitPreparedCharacter,null);
 }finally{if(prior===undefined)delete globalThis.requestIdleCallback;else globalThis.requestIdleCallback=prior;}
});
test('actual showcase ties its returned canvas to readback completion',()=>{
 const body=bodies['inkwave-public/src/game/showcase.js'];
 const s=body.indexOf('  _renderPortraitRun(req, S, kind, r) {');assert.ok(s>=0);
 const f=body.slice(s,body.indexOf('\n  // Compile every showcase shader',s));
 assert.match(f,/const read = r\.readRenderTargetPixelsAsync \?/);
 assert.match(f,/return read\.then\(\(\) => \{/);
 assert.match(f,/ctx\.putImageData\(img, 0, 0\)/);
 assert.doesNotMatch(f,/requestAnimationFrame|G\.game\._frame/);
});
