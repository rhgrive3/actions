// Controlled module/Worker boundary coverage. Real LFS payload admission and
// browser Worker scheduling remain separate qualification steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file=new URL('../runtime/source-data.mjs',import.meta.url);
const runtime=fs.readFileSync(file,'utf8');
async function harness({prebuilt=true,load=async()=>({manifest:{id:'stage'},sourceMetrics:{prebuilt:true}}),reply={result:{manifest:{id:'stage'}}},postFailure=null}={}){
 const workers=[],warnings=[],events=[],loads=[];
 const config={runtimeSha256:'runtime-pin',...(prebuilt?{prebuilt:{stages:{stage:{stageSha256:'record-pin',bytes:123}}}}:{})};
 const stages=Array.from({length:26},(_,i)=>({id:i?'stage'+i:'stage',tree:(i+1).toString(16).padStart(40,'0')}));
 class Worker {
  constructor(url,options){this.url=String(url);this.options=options;this.terminated=0;workers.push(this);}
  postMessage(message){if(postFailure)throw postFailure;this.message=structuredClone(message);if(reply)queueMicrotask(()=>this.onmessage?.({data:reply}));}
  terminate(){this.terminated++;}
 }
 const context=vm.createContext({URL,Worker,DOMException,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  console:{warn:message=>warnings.push(message)},dispatchEvent:event=>events.push(event),
 });
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [name,value]of Object.entries(values))this.setExport(name,value);},{context});
 const module=new vm.SourceTextModule(runtime,{context,identifier:String(file),initializeImportMeta(meta){meta.url=String(file);},
  importModuleDynamically:async spec=>{
   assert.equal(spec,'./prebuilt-load.mjs');
   const prebuilt=synthetic({loadPrebuiltSource:async(id,signal)=>{loads.push({id,signal});return load(id,signal);}});
   await prebuilt.link(()=>assert.fail('unexpected prebuilt dependency'));await prebuilt.evaluate();return prebuilt;
  },
 });
 await module.link(spec=>{if(spec==='./source-catalog.mjs')return synthetic({SOURCE_RECIPE:'recipe',SOURCE_STAGES:stages});assert.equal(spec,'./build-config.mjs');return synthetic({nativeStageBuild:config});});
 await module.evaluate();
 return {run:module.namespace.loadBrowserSource,workers,warnings,events,loads,config,stages};
}

test('admitted prebuilt data is published directly without starting a converter worker',async()=>{
 const data={manifest:{id:'stage'},triangles:new Float32Array([1,2,3]),sourceMetrics:{prebuilt:true}},controller=new AbortController();
 const h=await harness({load:async()=>data});
 assert.equal(await h.run('stage',controller.signal,{constrained:true}),data);
 assert.equal(h.loads[0].id,'stage');assert.equal(h.loads[0].signal,controller.signal);
 assert.equal(h.workers.length,0);assert.equal(h.warnings.length,0);
});

test('prebuilt fetch failure falls back to the unchanged worker protocol and constrained profile',async()=>{
 const h=await harness({load:async()=>{throw Error('verified chunk unavailable');}}),controller=new AbortController();
 const data=await h.run('stage',controller.signal,{constrained:true});assert.equal(data.manifest.id,'stage');
 assert.equal(h.workers.length,1);const worker=h.workers[0];
 assert.equal(worker.url,new URL('./source-worker.mjs',file).href);assert.equal(worker.options.type,'module');
 assert.deepEqual(JSON.parse(JSON.stringify(worker.message)),{id:'stage',runtimeSha256:'runtime-pin',constrainedClient:true});
 assert.equal(worker.terminated,1);assert.equal(h.events.at(-1).detail.phase,'ready');
 assert.match(h.warnings[0],/prebuilt stage unavailable, converting source: verified chunk unavailable/);
});

test('stages without admitted records use the pinned converter worker with default desktop profile',async()=>{
 const h=await harness({prebuilt:false});await h.run('stage');assert.equal(h.loads.length,0);
 assert.deepEqual(JSON.parse(JSON.stringify(h.workers[0].message)),{id:'stage',runtimeSha256:'runtime-pin',constrainedClient:false});
 assert.equal(h.workers[0].terminated,1);assert.equal(h.warnings.length,0);
});

test('an aborted prebuilt load never starts the fallback worker',async()=>{
 const failure=new DOMException('Aborted','AbortError'),h=await harness({load:async()=>{throw failure;}});
 await assert.rejects(h.run('stage'),error=>error===failure);assert.equal(h.workers.length,0);assert.equal(h.warnings.length,0);
});

test('a signal aborted during a failed prebuilt fetch also prevents fallback',async()=>{
 const controller=new AbortController(),failure=Error('fetch failed after cancellation');
 const h=await harness({load:async()=>{controller.abort();throw failure;}});
 await assert.rejects(h.run('stage',controller.signal),error=>error===failure);assert.equal(h.workers.length,0);assert.equal(h.warnings.length,0);
});

test('fallback worker failure terminates once and emits failed, never ready',async()=>{
 const h=await harness({load:async()=>{throw Error('missing prebuilt');},reply:{error:'source integrity mismatch'}});
 await assert.rejects(h.run('stage'),/source integrity mismatch/);assert.equal(h.workers[0].terminated,1);
 assert.deepEqual(h.events.map(e=>e.detail.phase),['failed']);
});

test('aborting a pending fallback worker terminates it and ignores late result publication',async()=>{
 const controller=new AbortController(),h=await harness({prebuilt:false,reply:null}),pending=h.run('stage',controller.signal);
 const late=h.workers[0].onmessage;
 controller.abort();await assert.rejects(pending,{name:'AbortError'});const worker=h.workers[0];assert.equal(worker.terminated,1);
 assert.equal(worker.onmessage,null);assert.equal(worker.onerror,null);assert.equal(worker.onmessageerror,null);
 late({data:{result:{manifest:{id:'late'}}}});
 assert.equal(worker.terminated,1);assert.deepEqual(h.events.map(e=>e.detail.phase),['failed']);
});

const inventory=(h,id='stage')=>({id,runtimeSha256:h.config.runtimeSha256,recipe:'recipe',tree:h.stages.find(s=>s.id===id).tree,inventory:{sha:h.stages.find(s=>s.id===id).tree,truncated:false,tree:[{type:'blob',path:'source.mtl',sha:'a'.repeat(40),size:3}]}});
const emit=(worker,data)=>worker.onmessage({data:structuredClone(data)});
test('only successful pinned workers publish private metadata; warm messages receive independent clones',async()=>{
 const h=await harness({prebuilt:false,reply:null}),p=h.run('stage',undefined,{verifiedInventory:{untrusted:true}}),first=h.workers.at(-1);
 assert.equal(first.message.verifiedInventory,undefined);emit(first,{sourceInventory:inventory(h)});emit(first,{result:{ok:true}});await p;
 const q=h.run('stage'),second=h.workers.at(-1);assert.deepEqual(second.message.verifiedInventory,inventory(h));second.message.verifiedInventory.inventory.tree[0].sha='f'.repeat(40);emit(second,{result:{ok:true}});await q;
 const r=h.run('stage'),third=h.workers.at(-1);assert.equal(third.message.verifiedInventory.inventory.tree[0].sha,'a'.repeat(40));emit(third,{result:{ok:true}});await r;
});
test('failed/aborted workers and all late inventory/result events never seed metadata',async()=>{
 for(const abort of [false,true]){
  const h=await harness({prebuilt:false,reply:null}),controller=new AbortController(),p=h.run('stage',controller.signal),first=h.workers.at(-1);emit(first,{sourceInventory:inventory(h)});
  const late=first.onmessage;
  if(abort)controller.abort();else emit(first,{error:'injected failure'});await assert.rejects(p);
  assert.equal(first.onmessage,null);late({data:{sourceInventory:inventory(h)}});late({data:{result:{ok:true}}});
  const q=h.run('stage'),second=h.workers.at(-1);assert.equal(second.message.verifiedInventory,undefined);emit(second,{result:{ok:true}});await q;
 }
});

test('an already cancelled source load creates no worker or prebuilt request',async()=>{
 for(const prebuilt of [false,true]){
  const h=await harness({prebuilt}),controller=new AbortController();controller.abort();
  await assert.rejects(h.run('stage',controller.signal),{name:'AbortError'});
  assert.equal(h.workers.length,0);assert.equal(h.loads.length,0);
 }
});
test('synchronous worker post failure releases handlers, worker and abort listener',async()=>{
 const error=new DOMException('could not clone','DataCloneError'),controller=new AbortController();
 const h=await harness({prebuilt:false,postFailure:error});
 await assert.rejects(h.run('stage',controller.signal),e=>e===error);
 const w=h.workers[0];assert.equal(w.terminated,1);assert.equal(w.onmessage,null);assert.equal(w.onerror,null);assert.equal(w.onmessageerror,null);
 controller.abort();assert.equal(w.terminated,1);assert.deepEqual(h.events.map(e=>e.detail.phase),['failed']);
});
test('worker deserialization failure rejects once and releases the pending source',async()=>{
 const h=await harness({prebuilt:false,reply:null}),pending=h.run('stage'),w=h.workers[0],late=w.onmessage;
 w.onmessageerror({});await assert.rejects(pending,/could not be decoded/);
 late({data:{result:{untrusted:true}}});assert.equal(w.terminated,1);assert.equal(w.onmessage,null);
 assert.deepEqual(h.events.map(e=>e.detail.phase),['failed']);
});
test('runtime, stage tree and stage identity invalidate inventory reuse; retention is bounded to 24 entries',async()=>{
 const h=await harness({prebuilt:false,reply:null});
 async function complete(id){const p=h.run(id),w=h.workers.at(-1);emit(w,{sourceInventory:inventory(h,id)});emit(w,{result:{ok:true}});await p;return w;}
 await complete('stage');h.config.runtimeSha256='new-runtime';assert.equal((await complete('stage')).message.verifiedInventory,undefined);
 h.stages[0].tree='f'.repeat(40);assert.equal((await complete('stage')).message.verifiedInventory,undefined);
 for(let i=1;i<=25;i++)assert.equal((await complete('stage'+i)).message.verifiedInventory,undefined);
 assert.equal((await complete('stage')).message.verifiedInventory,undefined);
});
