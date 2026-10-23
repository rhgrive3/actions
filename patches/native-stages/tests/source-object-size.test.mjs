import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {sourceObjectBytes} from '../runtime/source-catalog.mjs';
import {validateSourceInventory} from '../runtime/source-inventory.mjs';

const stages=nativeStageCatalog().stages;
const read=rel=>fs.readFileSync(new URL(rel,import.meta.url),'utf8');
const workerSource=read('../runtime/source-worker.mjs'),catalogSource=read('../runtime/source-catalog.mjs');
test('all current source object lengths are authenticated LFS payload sizes, not tree pointer sizes',async()=>{
 const pins=JSON.parse(read('../runtime/source-cache.mjs').match(/const PINNED_SOURCE_TREES=Object.freeze\((\{[\s\S]*?\})\);/)[1]);
 assert.equal(stages.length,23);
 for(const stage of stages){
  const bytes=sourceObjectBytes(stage);assert(Number.isSafeInteger(bytes)&&bytes>0,stage.id);
  const inventory=await validateSourceInventory(stage.tree,fs.readFileSync(new URL('../source-inventories/'+stage.tree+'.json',import.meta.url)),pins[stage.tree]);
  const blob=inventory.tree.find(f=>f.path===stage.internal+'.obj');assert(blob,stage.id);
  const pointer=Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:'+stage.sourceSha256+'\nsize '+bytes+'\n');
  assert.equal(crypto.createHash('sha1').update('blob '+pointer.length+'\0').update(pointer).digest('hex'),blob.sha,stage.id+' authenticated payload identity and length');
  assert.equal(pointer.length,blob.size,stage.id+' pointer byte count');
  assert(bytes>blob.size,stage.id+' never use pointer size for source payload');
 }
 assert.equal(sourceObjectBytes({sourceSha256:'unknown'}),undefined);
});

async function run(stage,constrainedClient=false){
 const calls=[],messages=[],arrays=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
 const context=vm.createContext({TextDecoder,performance:{now:()=>1},self:{navigator:{deviceMemory:16,userAgent:'desktop'},postMessage:m=>messages.push(m)}});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
 // Keep the real worker and real catalog/size lookup. Only network, conversion
 // and derived storage are replaced at their boundary; no download is needed.
 const catalog=new vm.SourceTextModule(catalogSource,{context});
 await catalog.link(spec=>{assert.equal(spec,'./build-config.mjs');return synthetic({nativeStageBuild:{stages:[stage]}});});await catalog.evaluate();
 const cache=synthetic({readDerived:async()=>null,writeDerived:async()=>{},sourceTree:async()=>({tree:[{type:'blob',path:stage.internal+'.mtl',size:3,sha:'mtl'}]}),sourceBytes:async(id,url,pin,signal,progress)=>{calls.push({url,pin,progress});if(progress)progress({bytes:3,total:sourceObjectBytes(stage)||3});return new Uint8Array([65,66,67]).buffer;}});
 const worker=new vm.SourceTextModule(workerSource,{context});
 await worker.link(spec=>spec==='./source-catalog.mjs'?catalog:spec==='./source-cache.mjs'?cache:synthetic({convertSource:()=>Object.fromEntries(arrays.map(k=>[k,new Uint8Array(1)]))}));
 await worker.evaluate();await context.self.onmessage({data:{id:stage.id,runtimeSha256:'fixture',constrainedClient}});
 assert(messages.at(-1).result,JSON.stringify(messages));
 return{calls,messages};
}
test('actual nonconstrained worker wires authenticated size and progress together for all current stages',async()=>{
 for(const stage of stages){
  const{calls,messages}=await run(stage),obj=calls.find(c=>c.url.endsWith('.obj'));
  assert.equal(obj.pin.sha256,stage.sourceSha256);assert.equal(obj.pin.bytes,sourceObjectBytes(stage),stage.id);
  assert.equal(typeof obj.progress,'function',stage.id);
  assert(messages.some(m=>m.progress==='download'&&m.bytes===3&&m.total===sourceObjectBytes(stage)),stage.id);
  assert.equal(calls.find(c=>c.url.endsWith('.mtl')).progress,undefined);
 }
});
test('actual constrained and unknown stage workers retain their existing safe fallback contracts',async()=>{
 const constrained=await run(stages[0],true),obj=constrained.calls[0];
 assert.equal(obj.progress,undefined);assert.equal(Object.hasOwn(obj.pin,'bytes'),false);
 const unknown={...stages[0],sourceSha256:'a'.repeat(64)};
 const other=await run(unknown);assert.equal(other.calls[0].pin.bytes,undefined);assert.equal(typeof other.calls[0].progress,'function');
});
