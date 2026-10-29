import test from 'node:test';import assert from 'node:assert/strict';import {getEventListeners} from 'node:events';
import {readEncodedAudioResponse,EncodedAudioResponseError} from '../runtime/audio/encoded-response.mjs';
import {audioLoadScope} from '../runtime/audio/load-deadline.mjs';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
import {chargerRiseBuffer,chargerRecordedStatus,disposeChargerRise} from '../runtime/audio/charger-charge-rise.mjs';
function stream(chunks,{reported=null,never=false,error=null}={}){
 let at=0,cancelled=0,reads=0,fullReads=0;
 const body=new ReadableStream({pull(controller){reads++;if(error){controller.error(error);return;}if(never)return new Promise(()=>{});if(at<chunks.length)controller.enqueue(chunks[at++]);else controller.close();},cancel(){cancelled++;}},{highWaterMark:0});
 return {response:{ok:true,headers:{get:()=>reported},body,arrayBuffer(){fullReads++;throw Error('full arrayBuffer must not run on a readable body');}},counts:()=>({cancelled,reads,fullReads}),body};
}
for(const max of [512*1024,8*1024*1024])for(const reported of [null,'16'])test('streamed cap '+max+' rejects oversized actual data with header '+reported,async()=>{
 const f=stream([new Uint8Array(max),new Uint8Array(1),new Uint8Array(10)],{reported}),scope=audioLoadScope(1000);
 try{await assert.rejects(scope.run(()=>readEncodedAudioResponse(f.response,max,{scope})),EncodedAudioResponseError);assert.equal(f.counts().cancelled,1);assert.equal(f.counts().reads,2);assert.equal(f.counts().fullReads,0);assert.equal(f.body.locked,false);assert.equal(scope.signal.aborted,true);assert.equal(getEventListeners(scope.signal,'abort').length,0);}finally{scope.finish();}
});
test('honest oversized Content-Length rejects before requesting or allocating body bytes',async()=>{
 const f=stream([new Uint8Array(1)],{reported:'1048577'}),scope=audioLoadScope(1000);
 try{await assert.rejects(readEncodedAudioResponse(f.response,1024*1024,{scope}),EncodedAudioResponseError);assert.deepEqual(f.counts(),{cancelled:1,reads:0,fullReads:0});assert.equal(f.body.locked,false);}finally{scope.finish();}
});
for(const max of [512*1024,8*1024*1024])test('exact cap '+max+' and irregular chunk boundaries preserve every byte',async()=>{
 const input=new Uint8Array(max);for(let i=0;i<max;i++)input[i]=(i*17)%251;
 const cuts=[1,31,65535,65536,65537,max],chunks=[];let from=0;for(const to of cuts){chunks.push(input.subarray(from,to));from=to;}
 const f=stream(chunks),scope=audioLoadScope(1000);
 try{const bytes=await readEncodedAudioResponse(f.response,max,{scope});assert(Buffer.from(bytes).equals(Buffer.from(input)));assert.equal(f.counts().fullReads,0);assert.equal(f.counts().cancelled,0);assert.equal(f.body.locked,false);assert.equal(getEventListeners(scope.signal,'abort').length,0);}finally{scope.finish();}
});
test('empty data and invalid chunk types reject, while tiny chunks need no unbounded chunk list',async()=>{
 for(const chunks of [[],[new Uint8Array()],[new Uint16Array(2)]]){const f=stream(chunks);await assert.rejects(readEncodedAudioResponse(f.response,100),EncodedAudioResponseError);assert.equal(f.body.locked,false);}
 const count=70000,f=stream(Array.from({length:count},()=>new Uint8Array([7]))),result=await readEncodedAudioResponse(f.response,count);assert.equal(result.byteLength,count);assert(new Uint8Array(result).every(v=>v===7));
});
test('compatibility fetchers retain exact ArrayBuffer identity and existing post-read validation',async()=>{
 const bytes=new ArrayBuffer(32);assert.equal(await readEncodedAudioResponse({arrayBuffer:async()=>bytes},32),bytes);
 for(const result of [new ArrayBuffer(33),new ArrayBuffer(0),new Uint8Array(12)])await assert.rejects(readEncodedAudioResponse({arrayBuffer:async()=>result},32),EncodedAudioResponseError);
});
test('pre-abort, stalled read timeout and mid-stream cancellation release readers and listeners',async()=>{
 const pre=audioLoadScope(1000),f=stream([new Uint8Array(4)]);pre.cancel();await assert.rejects(readEncodedAudioResponse(f.response,8,{scope:pre}),/cancelled/);assert.equal(f.counts().reads,0);
 const hung=stream([],{never:true}),scope=audioLoadScope(20,'fixture response timeout');
 try{await assert.rejects(scope.run(()=>readEncodedAudioResponse(hung.response,8,{scope})),/fixture response timeout/);await new Promise(r=>setImmediate(r));assert.equal(hung.counts().cancelled,1);assert.equal(hung.body.locked,false);assert.equal(getEventListeners(scope.signal,'abort').length,0);}finally{scope.finish();}
 const second=audioLoadScope(1000),stalled=stream([],{never:true});const pending=second.run(()=>readEncodedAudioResponse(stalled.response,8,{scope:second}));second.cancel(new Error('superseded'));await assert.rejects(pending,/superseded/);await new Promise(r=>setImmediate(r));assert.equal(stalled.counts().cancelled,1);assert.equal(stalled.body.locked,false);
});
const manifest=(id='shooter')=>({schema:1,usageRights:'Generated synthetic local test bytes',clips:[{id,event:'fire',variant:0,file:'fixture.mp3'}]});
function context(){let calls=0;const ctx={state:'running',sampleRate:48000,async decodeAudioData(){calls++;return {duration:2,sampleRate:48000,length:96000,numberOfChannels:1,getChannelData:()=>new Float32Array(96000)};}};return {ctx,decodes:()=>calls};}
test('authorized loader rejects oversized streaming data before decode and preserves live transaction state',async()=>{
 const c=context();let f=stream([new Uint8Array(10000)]);
 const pack=new AuthorizedSamplePack(c.ctx,{fetcher:async()=>f.response});await pack.load(manifest());const current=pack.pick('shooter','fire').buffer,bytes=pack.bytes;
 f=stream([new Uint8Array(8*1024*1024),new Uint8Array(1)]);const result=await pack.load(manifest('roller'),{replace:false});
 assert.equal(result.loaded,0,'no new clip is published');assert.equal(pack.loaded.size,1,'existing successful row remains');assert.equal(result.rejected,1);assert.equal(c.decodes(),1);assert.equal(pack.pick('shooter','fire').buffer,current);assert.equal(pack.bytes,bytes);assert.equal(pack._loadScopes.size,0);assert.equal(f.counts().cancelled,1);pack.clear();
});
test('Charger encoded size policy rejects before decode, retains its valid source, and cannot retry a malformed payload',async()=>{
 const c=context(),f=stream([new Uint8Array(512*1024),new Uint8Array(1)]);
 assert.equal(await chargerRiseBuffer(c.ctx,{fetcher:async()=>f.response}),null);assert.equal(c.decodes(),0);assert.equal(f.counts().cancelled,1);assert.match(chargerRecordedStatus(c.ctx).error,/invalid recorded Charger audio payload/);
 let requests=0;assert.equal(await chargerRiseBuffer(c.ctx,{retry:true,now:()=>Date.now()+100000,fetcher:async()=>{requests++;return stream([new Uint8Array(20000)]).response;}}),null);assert.equal(requests,0);disposeChargerRise(c.ctx);
 const good=context(),s=stream([new Uint8Array(512*1024)]);const actual=await chargerRiseBuffer(good.ctx,{fetcher:async()=>s.response});assert(actual);assert.equal(good.decodes(),1);assert.equal(await chargerRiseBuffer(good.ctx),actual);disposeChargerRise(good.ctx);
});
