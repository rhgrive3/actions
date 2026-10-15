import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
{
const source=fs.readFileSync(new URL('../runtime/source-worker.mjs',import.meta.url),'utf8');
const fields=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
async function run(nav,{offline=false,hit=true}={}){
 const calls={read:0,write:0,convert:0,fetch:0,source:[],messages:[]},data=Object.fromEntries(fields.map(k=>[k,new Uint8Array(4)]));
 const ctx=vm.createContext({TextDecoder,performance:{now:()=>1},self:{navigator:nav,postMessage:(m,t)=>calls.messages.push({m,t})},fetch:async()=>{calls.fetch++;if(offline)throw Error('offline tree');return{ok:true,json:async()=>({sha:'tree',truncated:false,tree:[{type:'blob',path:'stage.mtl',size:3,sha:'mtl'}]})};}});
 const imports={
 './source-catalog.mjs':{SOURCE_RECIPE:'recipe',SOURCE_STAGES:[{id:'stage',sourceSha256:'hash',internal:'stage',tree:'tree'}],sourceURL:(_,p)=>p},
 './source-convert.mjs':{convertSource:()=>{calls.convert++;return data;}},
 './source-cache.mjs':{sourceTree:async()=>{calls.fetch++;if(offline)throw Error('offline tree');return{sha:'tree',truncated:false,tree:[{type:'blob',path:'stage.mtl',size:3,sha:'mtl'}]};},readDerived:async()=>{calls.read++;return hit?data:null;},writeDerived:async()=>{calls.write++;},sourceBytes:async(id,url,pin,signal,progress)=>{calls.source.push({url,progress:typeof progress});return new Uint8Array([65,66,67]).buffer;}}
 };
 const m=new vm.SourceTextModule(source,{context:ctx});await m.link(spec=>{const values=imports[spec];assert(values,spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context:ctx});});await m.evaluate();await ctx.self.onmessage({data:{id:'stage',runtimeSha256:'runtime'}});return{calls,data};
}
for(const nav of [{deviceMemory:4,userAgent:'desktop'},{deviceMemory:2,userAgent:'desktop'},{deviceMemory:8,userAgent:'Android'},{userAgent:'iPhone'},{userAgent:'iPad'}])test('constrained bypass '+JSON.stringify(nav),async()=>{const{calls,data}=await run(nav);assert.equal(calls.read,0);assert.equal(calls.write,0);assert.equal(calls.convert,1);assert.equal(calls.fetch,1);assert.equal(calls.source[0].progress,'undefined');assert(calls.messages.some(x=>x.m.bytes===3&&x.m.total===3));const r=calls.messages.at(-1);assert.equal(r.m.result.sourceMetrics.cached,false);assert.deepEqual(Array.from(r.t),fields.map(k=>data[k].buffer));});
for(const nav of [{deviceMemory:8,userAgent:'desktop'},{userAgent:'Macintosh; Intel Mac OS X'}])test('unconstrained derived hit '+JSON.stringify(nav),async()=>{const{calls}=await run(nav,{offline:true});assert.equal(calls.read,1);assert.equal(calls.fetch,0);assert.equal(calls.convert,0);assert.equal(calls.messages.at(-1).m.result.sourceMetrics.cached,true);});
test('raw cache presence cannot satisfy offline constrained tree request',async()=>{const{calls}=await run({deviceMemory:4,userAgent:'desktop'},{offline:true});assert.equal(calls.read,0);assert.equal(calls.source.length,1);assert.equal(calls.fetch,1);assert.equal(calls.convert,0);assert.equal(calls.messages.at(-1).m.error,'offline tree');});
test('unconstrained miss preserves progress callback, conversion and derived write',async()=>{const{calls}=await run({deviceMemory:8,userAgent:'desktop'},{hit:false});assert.equal(calls.read,1);assert.equal(calls.write,1);assert.equal(calls.convert,1);assert.equal(calls.source[0].progress,'function');});

}
{
const cacheCode=fs.readFileSync(new URL('../runtime/source-cache.mjs',import.meta.url),'utf8'),workerCode=fs.readFileSync(new URL('../runtime/source-worker.mjs',import.meta.url),'utf8');
const pin='1'.repeat(40),digest=b=>crypto.createHash('sha256').update(b).digest('hex'),git=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const obj=Buffer.from('o stage\nv 0 0 0\n'),mtl=Buffer.from('newmtl stage\n'),tree={sha:pin,truncated:false,tree:[{type:'blob',path:'stage.mtl',size:mtl.length,sha:git(mtl)}]};
const names=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
async function fixture(){
 const stores=new Map(),events={fetch:[],convert:0,idb:0,messages:[]};let offline=false;
 const caches={keys:async()=>[...stores.keys()],delete:async n=>stores.delete(n),open:async n=>{if(!stores.has(n))stores.set(n,new Map());const m=stores.get(n);return{match:async k=>m.get(k)?.clone(),put:async(k,v)=>{m.set(k,v.clone());},delete:async k=>m.delete(k)};}};
 const ctx=vm.createContext({TextEncoder,TextDecoder,Response,crypto:crypto.webcrypto,Date,performance:{now:()=>1},caches,
 indexedDB:{open(){events.idb++;throw Error('derived cache must remain bypassed');}},self:{navigator:{deviceMemory:4,userAgent:'desktop'},postMessage:(m,t)=>events.messages.push({m,t})},
 fetch:async url=>{events.fetch.push(url);if(offline)throw Error('offline');if(url.includes('/git/trees/'))return new Response(JSON.stringify(tree));if(url==='stage.obj')return new Response(obj);if(url==='stage.mtl')return new Response(mtl);throw Error('unknown request '+url);}});
 const cache=new vm.SourceTextModule(cacheCode,{context:ctx});await cache.link(()=>{throw Error('unexpected import');});await cache.evaluate();
 const data=Object.fromEntries(names.map(k=>[k,new Uint8Array([1,2,3])])),imports={
 './source-catalog.mjs':{SOURCE_RECIPE:'recipe',SOURCE_STAGES:[{id:'stage',sourceSha256:digest(obj),internal:'stage',tree:pin}],sourceURL:(_,p)=>p},
 './source-convert.mjs':{convertSource:()=>{events.convert++;return structuredClone(data);}}
 };
 const worker=new vm.SourceTextModule(workerCode,{context:ctx});await worker.link(spec=>{if(spec==='./source-cache.mjs')return cache;const v=imports[spec];assert(v);return new vm.SyntheticModule(Object.keys(v),function(){for(const[k,x]of Object.entries(v))this.setExport(k,x);},{context:ctx});});await worker.evaluate();
 const run=()=>ctx.self.onmessage({data:{id:'stage',runtimeSha256:'runtime'}}),key='https://inkwave.invalid/native-source-tree/'+pin;
 return{cache:cache.namespace,stores,events,key,run,offline:()=>offline=true,metadata:()=>stores.get('inkwave-native-source-v2-stage'),replace:async f=>{const map=stores.get('inkwave-native-source-v2-stage'),e=await map.get(key).json();await f(e);map.set(key,new Response(JSON.stringify(e)));}};
}
test('actual worker converts cached raw source offline while continuing to bypass derived IDB',async()=>{const f=await fixture();await f.run();assert.equal(f.events.convert,1);assert.equal(f.events.fetch.length,3);f.offline();await f.run();assert.equal(f.events.convert,2);assert.equal(f.events.fetch.length,3);assert.equal(f.events.idb,0);const result=f.events.messages.at(-1);assert(result.m.result);assert.equal(result.m.result.sourceMetrics.cached,false);assert.equal(result.t.length,10);});
for(const[name,change]of Object.entries({schema:e=>e.schema=2,tree:e=>e.tree='2'.repeat(40),bytes:e=>e.bytes++,seal:e=>e.sha256='0'.repeat(64),body:e=>e.body+=' ',missingBody:e=>delete e.body,
 unsafePath:e=>{const t=JSON.parse(e.body);t.tree[0].path='../escape';e.body=JSON.stringify(t);e.bytes=Buffer.byteLength(e.body);e.sha256=digest(e.body);},
 truncated:e=>{const t=JSON.parse(e.body);t.truncated=true;e.body=JSON.stringify(t);e.bytes=Buffer.byteLength(e.body);e.sha256=digest(e.body);},
 wrongPinnedBody:e=>{const t=JSON.parse(e.body);t.sha='2'.repeat(40);e.body=JSON.stringify(t);e.bytes=Buffer.byteLength(e.body);e.sha256=digest(e.body);},
 invalidBlob:e=>{const t=JSON.parse(e.body);t.tree[0].sha='invalid';e.body=JSON.stringify(t);e.bytes=Buffer.byteLength(e.body);e.sha256=digest(e.body);}
}))test('invalid cached '+name+' fails closed offline',async()=>{const f=await fixture();await f.run();await f.replace(change);f.offline();await f.run();assert.equal(f.events.convert,1);assert.equal(f.events.messages.at(-1).m.error,'offline');assert.equal(f.events.idb,0);assert.equal(f.metadata().has(f.key),false);});
test('missing metadata fails closed offline without using unbound raw cache alone',async()=>{const f=await fixture();await f.run();f.metadata().delete(f.key);f.offline();await f.run();assert.equal(f.events.convert,1);assert.equal(f.events.messages.at(-1).m.error,'offline');});
test('existing two-slot eviction retains metadata only with its own stage slot',async()=>{const f=await fixture();await f.cache.sourceTree('stage',pin);await f.cache.sourceTree('second',pin);await f.cache.sourceTree('third',pin);assert.equal(f.stores.size,2);assert(f.stores.has('inkwave-native-source-v2-third'));for(const m of f.stores.values())assert(m.has(f.key));});

for(const missing of ['stage.obj','stage.mtl'])test('missing cached '+missing+' rejects offline conversion',async()=>{const f=await fixture();await f.run();f.metadata().delete(missing);f.offline();await f.run();assert.equal(f.events.convert,1);assert.equal(f.events.messages.at(-1).m.error,'offline');});
test('invalid metadata blob size rejects despite valid local envelope seal',async()=>{const f=await fixture();await f.run();await f.replace(e=>{const t=JSON.parse(e.body);t.tree[0].size=-1;e.body=JSON.stringify(t);e.bytes=Buffer.byteLength(e.body);e.sha256=digest(e.body);});f.offline();await f.run();assert.equal(f.events.convert,1);assert.equal(f.events.messages.at(-1).m.error,'offline');});
test('corrupt raw OBJ remains rejected by original source integrity check',async()=>{const f=await fixture();await f.run();f.metadata().set('stage.obj',new Response('corrupt'));f.offline();await f.run();assert.equal(f.events.convert,1);assert.equal(f.events.messages.at(-1).m.error,'offline');});

}
