import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
const clip=variant=>({id:'shooter',event:'fire',variant,file:`clip${variant}.mp3`});
const manifest=variants=>({schema:1,usageRights:'test fixture only',clips:variants.map(clip)});
const pcm=value=>({length:256,numberOfChannels:1,duration:.032,sampleRate:8000,getChannelData:()=>new Float32Array(256).fill(value)});
function rig({maxBytes=2048,shared=false}={}){
 let decodeGate=null,startedResolve;const started=new Promise(r=>startedResolve=r);let gateVariant=-1;
 const buffers=new Map(),ctx={state:'running',sampleRate:8000,async decodeAudioData(bytes){
  const v=new Uint8Array(bytes)[0];if(v===gateVariant)await new Promise(resolve=>{decodeGate=resolve;startedResolve();});
  if(shared&&v===1&&buffers.has(0))return buffers.get(0);
  const b=pcm(v);buffers.set(v,b);return b;
 }};
 let fetches=0;const pack=new AuthorizedSamplePack(ctx,{maxBytes,fetcher:async url=>{fetches++;const v=+url.match(/clip(\d+)/)[1];return{ok:true,arrayBuffer:async()=>new Uint8Array([v]).buffer};}});
 return{pack,ctx,buffers,gate(v){gateVariant=v;return started;},release(){decodeGate?.();},get fetches(){return fetches;}};
}
const keys=p=>[...p.loaded.values()].map(r=>r.variant);
test('playback during async partial load protects the actually most recent resident',async()=>{
 for(const touch of [false,true]){
  const r=rig();await r.pack.load(manifest([0,1]),{concurrency:1});const start=r.gate(2);
  const loading=r.pack.load(manifest([2]),{replace:false});await start;if(touch)r.pack.pick('shooter','fire',0);r.release();await loading;
  assert.deepEqual(keys(r.pack),touch?[0,2]:[1,2]);assert.equal(r.pack.bytes,2048);assert.equal(r.pack._lruStage,null);assert.equal(r.fetches,3);
 }
});
test('a live row played after staged eviction is restored before the next eviction',async()=>{
 const r=rig();await r.pack.load(manifest([0,1]),{concurrency:1});const start=r.gate(3);
 const loading=r.pack.load(manifest([2,3]),{replace:false,concurrency:1});await start;
 const item=r.pack.pick('shooter','fire',0);assert.equal(item.variant,0);r.release();await loading;
 assert.deepEqual(keys(r.pack),[0,3]);assert.equal(r.pack.bytes,2048);assert.equal(r.pack.byEvent.get('shooter:fire')[0],item);
});
test('repeated published MRU touches still reorder a staging bank after new rows arrive',async()=>{
 const r=rig({maxBytes:3072});await r.pack.load(manifest([0,1]),{concurrency:1});r.pack.pick('shooter','fire',1);
 const start=r.gate(3),loading=r.pack.load(manifest([2,3]),{replace:false,concurrency:1});await start;
 for(let i=0;i<100;i++)r.pack.pick('shooter','fire',1);r.release();await loading;
 assert.deepEqual(keys(r.pack),[2,1,3]);assert.equal(r.pack.bytes,3072);
});
test('touching an old published same-key row never overwrites a staged replacement',async()=>{
 const r=rig({maxBytes:3072});await r.pack.load(manifest([0,1]),{concurrency:1});const old=r.pack.loaded.get('shooter:fire:0');
 const start=r.gate(3),loading=r.pack.load(manifest([0,3]),{replace:false,concurrency:1});await start;r.pack.pick('shooter','fire',0);r.release();await loading;
 assert.deepEqual(keys(r.pack),[1,0,3]);assert.notEqual(r.pack.loaded.get('shooter:fire:0').buffer,old.buffer);
});
test('shared PCM accounting and event variant ordering survive mirrored touches',async()=>{
 const r=rig({shared:true});await r.pack.load(manifest([0,1]),{concurrency:1});assert.equal(r.pack.bytes,1024);
 const start=r.gate(2),loading=r.pack.load(manifest([2]),{replace:false});await start;r.pack.pick('shooter','fire',0);r.release();await loading;
 assert.deepEqual(keys(r.pack),[1,0,2]);assert.equal(r.pack.bytes,2048);assert.deepEqual(r.pack.byEvent.get('shooter:fire').map(v=>v.variant),[0,1,2]);
});
test('replace=true remains replacement and clear cancels a partial staging owner',async()=>{
 for(const clear of [false,true]){
  const r=rig();await r.pack.load(manifest([0,1]),{concurrency:1});const start=r.gate(2),loading=r.pack.load(manifest([2]),{replace:!clear});await start;r.pack.pick('shooter','fire',0);
  if(clear)r.pack.clear();r.release();const result=await loading;
  assert.equal(result.cancelled,clear);assert.deepEqual(keys(r.pack),clear?[]:[2]);assert.equal(r.pack._lruStage,null);
 }
});

test('synchronous abort reentry preserves the latest partial import staging owner',async()=>{
 let release,started,latest;
 const ready=new Promise(resolve=>{started=resolve;});
 const ctx={state:'running',sampleRate:8000,async decodeAudioData(bytes){
  const v=new Uint8Array(bytes)[0];
  if(v===4){started();await new Promise(resolve=>{release=resolve;});}
  return pcm(v);
 }};
 const fetched=[];
 const pack=new AuthorizedSamplePack(ctx,{maxBytes:2048,fetcher:async(url,{signal}={})=>{
  const v=+url.match(/clip(\d+)/)[1];fetched.push(v);
  if(v===2){
   signal.addEventListener('abort',()=>{latest=pack.load(manifest([4]),{replace:false});},{once:true});
   return new Promise(()=>{}); // The platform may ignore its aborted signal.
  }
  return{ok:true,arrayBuffer:async()=>new Uint8Array([v]).buffer};
 }});
 await pack.load(manifest([0,1]),{concurrency:1});
 const first=pack.load(manifest([2]),{replace:false});
 const superseded=pack.load(manifest([3]),{replace:false});
 await ready;assert.equal((await superseded).cancelled,true);
 assert.equal(pack._lruStage?.generation,pack.generation,'stale cancellation cannot steal the active stage');
 pack.pick('shooter','fire',0);release();
 assert.equal((await latest).cancelled,false);assert.equal((await first).cancelled,true);
 assert.deepEqual(keys(pack),[0,4]);assert.deepEqual(fetched,[0,1,2,4]);
 assert.equal(pack.bytes,2048);assert.equal(pack.pending,0);assert.equal(pack._lruStage,null);
 assert.deepEqual(pack.byEvent.get('shooter:fire').map(row=>row.variant),[0,4]);
});
