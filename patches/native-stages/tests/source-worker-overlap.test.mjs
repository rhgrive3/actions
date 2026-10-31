import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../runtime/source-worker.mjs',import.meta.url),'utf8');
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};};
async function harness(){
 const obj=gate(),tree=gate(),mtl=gate(),events=[],messages=[],signals=[],fields=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];let converted=0;
 const context=vm.createContext({TextDecoder,AbortController,performance:{now:()=>1},self:{navigator:{},postMessage:m=>messages.push(m)}});
 const imports={
 './source-catalog.mjs':{SOURCE_RECIPE:'r',SOURCE_STAGES:[{id:'x',internal:'stage',sourceSha256:'pin',tree:'tree'}],sourceURL:(_s,p)=>p,sourceObjectBytes:()=>42},
 './source-cache.mjs':{readDerived:async()=>null,beginDerivedWrite:async()=>null,sourceTree:(_id,pin,signal)=>{events.push('tree');signals.push(signal);return tree.promise;},sourceBytes:(_id,url,pin,signal)=>{events.push(url);signals.push(signal);if(url.endsWith('.mtl'))assert.deepEqual(JSON.parse(JSON.stringify(pin)),{bytes:3,gitSha1:'1111111111111111111111111111111111111111'});return url.endsWith('.obj')?obj.promise:mtl.promise;}},
 './source-convert.mjs':{convertSource:(_stage,o,m,files)=>{converted++;assert.deepEqual(Array.from(o),[1,2]);assert.equal(m,'ABC');return Object.fromEntries(fields.map(k=>[k,new Uint8Array(1)]));}},
 };
 const module=new vm.SourceTextModule(source,{context});await module.link(spec=>{const values=imports[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context});});await module.evaluate();
 const run=()=>context.self.onmessage({data:{id:'x',runtimeSha256:'runtime'}});
 return{obj,tree,mtl,events,messages,signals,run,converted:()=>converted};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const treeValue={tree:[{type:'blob',path:'stage.mtl',size:3,sha:'1111111111111111111111111111111111111111'}]};
test('authenticated MTL starts after tree while OBJ is pending; conversion awaits both payloads',async()=>{
 const h=await harness(),running=h.run();await flush();assert.deepEqual(h.events,['stage.obj','tree']);h.tree.resolve(treeValue);await flush();assert.deepEqual(h.events,['stage.obj','tree','stage.mtl']);assert.equal(h.converted(),0);h.mtl.resolve(new Uint8Array([65,66,67]).buffer);await flush();assert.equal(h.converted(),0);h.obj.resolve(new Uint8Array([1,2]).buffer);await running;assert.equal(h.converted(),1);assert(h.messages.at(-1).result);assert.equal(new Set(h.signals).size,1);
});
for(const failure of ['obj','tree','mtl'])test(failure+' failure aborts sibling downloads and never converts',async()=>{
 const h=await harness(),running=h.run();await flush();if(failure==='mtl'){h.tree.resolve(treeValue);await flush();}h[failure].reject(Error('injected '+failure));await running;assert.equal(h.converted(),0);assert.equal(h.messages.at(-1).error,'injected '+failure);assert(h.signals.every(s=>s.aborted));
 // Late settlement is observed and cannot publish another result.
 h.obj.resolve(new Uint8Array([1,2]).buffer);h.tree.resolve(treeValue);h.mtl.resolve(new Uint8Array([65,66,67]).buffer);await flush();assert.equal(h.messages.filter(m=>m.result).length,0);
});
test('unsafe or missing material tree is rejected before MTL starts',async()=>{for(const value of [{tree:[]},{tree:[{type:'blob',path:'../stage.mtl',size:3,sha:'pin'}]}]){const h=await harness(),running=h.run();await flush();h.tree.resolve(value);await running;assert.equal(h.events.includes('stage.mtl'),false);assert.equal(h.converted(),0);h.obj.resolve(new Uint8Array([1,2]).buffer);}});
