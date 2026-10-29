import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
async function waitForDigest(entered,pending,timeoutMs=2000){
 let timer;
 const finished=pending.then(()=>{throw Error('request completed before digest entry');},error=>{throw error;});
 try{await Promise.race([entered,finished,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timed out waiting for digest entry')),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}

async function fixture({chunks=[],digest=crypto.webcrypto.subtle.digest.bind(crypto.webcrypto.subtle),read=null,metadata=null,fetchError=null}={}){
 const calls={fetch:0,cancel:0,release:0,arrayBuffer:0};let at=0;
 const context=vm.createContext({URL,DOMException,AbortController,TextDecoder,crypto:{subtle:{digest}},location:{href:'https://test.invalid/index.html'},
 fetch:async()=>{calls.fetch++;if(fetchError)throw fetchError;return{ok:true,body:{getReader:()=>({read:()=>read?read():Promise.resolve(at<chunks.length?{value:chunks[at++],done:false}:{done:true}),cancel:async()=>{calls.cancel++;},releaseLock:()=>{calls.release++;}})},arrayBuffer:async()=>{calls.arrayBuffer++;if(metadata)return metadata.buffer.slice(metadata.byteOffset,metadata.byteOffset+metadata.byteLength);throw Error('stream must not allocate a full chunk');}};}});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});
 const mod=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/prebuilt-load.mjs',import.meta.url),'utf8'),{context});
 await mod.link(s=>s==='./build-config.mjs'?synthetic({nativeStageBuild:{prebuilt:{baseURL:'/native/'}}}):synthetic({PREBUILT_SCHEMA:2,unpackFacesAsync(){throw Error('unused')}}));await mod.evaluate();return {api:mod.namespace,calls};
}
test('verified stream fills only its final buffer range without materializing the chunk',async()=>{
 const bytes=Uint8Array.from({length:1003},(_,i)=>i%256),chunks=[];for(let i=0;i<bytes.length;i+=13)chunks.push(bytes.subarray(i,i+13));
 const f=await fixture({chunks}),backing=new Uint8Array(bytes.length+18).fill(249),target=backing.subarray(9,-9);
 await f.api.fetchVerifiedInto('mask.bin',{bytes:bytes.length,sha256:sha(bytes)},undefined,target);
 assert.deepEqual(target,bytes);assert.ok(backing.subarray(0,9).every(v=>v===249));assert.ok(backing.subarray(-9).every(v=>v===249));
 assert.deepEqual(f.calls,{fetch:1,cancel:0,release:1,arrayBuffer:0});
});
for(const size of [7,9])test('stream length '+size+' rejects and releases the reader',async()=>{
 const f=await fixture({chunks:[new Uint8Array(size)]});
 await assert.rejects(f.api.fetchVerifiedInto('bad',{bytes:8,sha256:sha(new Uint8Array(8))},undefined,new Uint8Array(8)),/integrity mismatch/);
 assert.equal(f.calls.cancel,1);assert.equal(f.calls.release,1);
});
test('corrupted streamed bytes retain the original digest rejection',async()=>{
 const f=await fixture({chunks:[new Uint8Array([1,2,4])]});
 await assert.rejects(f.api.fetchVerifiedInto('bad',{bytes:3,sha256:sha(new Uint8Array([1,2,3]))},undefined,new Uint8Array(3)),/integrity mismatch/);
 assert.equal(f.calls.release,1);
});
test('cancellation while digest is pending cannot publish verified bytes',async()=>{
 const controller=new AbortController(),data=new Uint8Array([1,2,3]),entered=deferred(),release=deferred();
 const f=await fixture({chunks:[data],digest:async(a,b)=>{entered.resolve();await release.promise;return crypto.webcrypto.subtle.digest(a,b);}});
 const pending=f.api.fetchVerifiedInto('data',{bytes:3,sha256:sha(data)},controller.signal,new Uint8Array(3));
 try{await waitForDigest(entered.promise,pending);controller.abort();release.resolve();await assert.rejects(pending,{name:'AbortError'});}
 finally{controller.abort();release.resolve();pending.catch(()=>{});}
 assert.equal(f.calls.release,1);
});
test('already cancelled or wrong-sized destinations start no requests',async()=>{
 const f=await fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(f.api.fetchVerifiedInto('data',{bytes:3},controller.signal,new Uint8Array(3)),{name:'AbortError'});
 await assert.rejects(f.api.fetchVerifiedInto('data',{bytes:3},undefined,new Uint8Array(2)),/target size mismatch/);
 assert.equal(f.calls.fetch,0);
});
test('metadata verification observes cancellation during digest',async()=>{
 const controller=new AbortController(),data=new Uint8Array([1,2,3]),entered=deferred(),release=deferred();
 const f=await fixture({metadata:data,digest:async(a,b)=>{entered.resolve();await release.promise;return crypto.webcrypto.subtle.digest(a,b);}});
 const pending=f.api.fetchVerified('stage.json',{bytes:3,sha256:sha(data)},controller.signal);
 try{await waitForDigest(entered.promise,pending);controller.abort();release.resolve();await assert.rejects(pending,{name:'AbortError'});}
 finally{controller.abort();release.resolve();pending.catch(()=>{});}
 assert.equal(f.calls.fetch,1);assert.equal(f.calls.arrayBuffer,1);
});

test('digest entry wait surfaces an early stream read failure and retires the reader',async()=>{
 const expected=Error('injected read failure'),f=await fixture({read:()=>Promise.reject(expected)}),entered=deferred();
 const pending=f.api.fetchVerifiedInto('data',{bytes:3,sha256:sha(new Uint8Array(3))},undefined,new Uint8Array(3));
 await assert.rejects(waitForDigest(entered.promise,pending),error=>error===expected);
 assert.equal(f.calls.cancel,1);assert.equal(f.calls.release,1);
});
test('digest entry wait surfaces an early metadata fetch failure',async()=>{
 const expected=Error('injected fetch failure'),f=await fixture({fetchError:expected}),entered=deferred();
 const pending=f.api.fetchVerified('stage.json',{bytes:3,sha256:sha(new Uint8Array(3))});
 await assert.rejects(waitForDigest(entered.promise,pending),error=>error===expected);assert.equal(f.calls.fetch,1);
});
test('digest entry wait times out when a stream never enters digest and cleans up',async()=>{
 const entered=deferred(),read=deferred(),controller=new AbortController(),f=await fixture({read:()=>read.promise});
 const pending=f.api.fetchVerifiedInto('data',{bytes:3,sha256:sha(new Uint8Array(3))},controller.signal,new Uint8Array(3));
 try{await assert.rejects(waitForDigest(entered.promise,pending,25),/timed out waiting for digest entry/);}
 finally{controller.abort();read.reject(new DOMException('Aborted','AbortError'));await assert.rejects(pending,{name:'AbortError'});}
 assert.equal(f.calls.cancel,1);assert.equal(f.calls.release,1);
});
