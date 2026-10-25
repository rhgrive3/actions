// Controlled module/Worker boundary coverage. Real LFS payload admission and
// browser Worker scheduling remain separate qualification steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file=new URL('../runtime/source-data.mjs',import.meta.url);
const runtime=fs.readFileSync(file,'utf8');
async function harness({prebuilt=true,load=async()=>({manifest:{id:'stage'},sourceMetrics:{prebuilt:true}}),reply={result:{manifest:{id:'stage'}}}}={}){
 const workers=[],warnings=[],events=[],loads=[];
 class Worker {
  constructor(url,options){this.url=String(url);this.options=options;this.terminated=0;workers.push(this);}
  postMessage(message){this.message=message;if(reply)queueMicrotask(()=>this.onmessage?.({data:reply}));}
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
 await module.link(spec=>{assert.equal(spec,'./build-config.mjs');return synthetic({nativeStageBuild:{runtimeSha256:'runtime-pin',...(prebuilt?{prebuilt:{stages:{stage:{stageSha256:'record-pin',bytes:123}}}}:{})}});});
 await module.evaluate();
 return {run:module.namespace.loadBrowserSource,workers,warnings,events,loads};
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
 controller.abort();await assert.rejects(pending,{name:'AbortError'});const worker=h.workers[0];assert.equal(worker.terminated,1);
 worker.onmessage({data:{result:{manifest:{id:'late'}}}});
 assert.equal(worker.terminated,1);assert.deepEqual(h.events.map(e=>e.detail.phase),['failed']);
});
