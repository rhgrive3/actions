import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
import {RealS3SampleLoader} from '../runtime/audio/real-s3-loader.mjs';
import {pcmResidency,pcmEventWindows} from '../runtime/audio/pcm-residency.mjs';
const MiB=1024*1024,flush=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const oldIds=['shooter','roller','charger','blaster'];
const newIds=['combat:critical','combat:damage','combat:ink_focus_normal','combat:ink_focus_strong','combat:splat'];
const row=(id,n,variant=0,extra={})=>({id,event:'fire',variant,file:`pcm${n}.mp3`,...extra});
const manifest=clips=>({schema:1,usageRights:'Synthetic fixture PCM only; no game-owned audio',clips});
function rig({clipBytes=10*MiB,maxBytes=40*MiB}={}){
 const gates=new Map(),requests=[],decoded=[],ctx={state:'running',sampleRate:48000,async decodeAudioData(bytes){const n=new Uint8Array(bytes)[0];decoded.push(n);const gate=gates.get(n);if(gate){gate.started.resolve();await gate.release.promise;}return {tag:n,length:clipBytes/32,numberOfChannels:8,sampleRate:48000,duration:clipBytes/32/48000,getChannelData(){throw Error('one-shot fixture must not read or repair PCM');}};}};
 const fetcher=async url=>{requests.push(String(url));const n=Number(String(url).match(/pcm(\d+)/)[1]);return{ok:true,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array([n]).buffer};};
 const pack=new AuthorizedSamplePack(ctx,{maxBytes,fetcher});
 return {pack,ctx,requests,decoded,gate(n){const g={started:deferred(),release:deferred()};gates.set(n,g);return g;}};
}
const ids=pack=>[...pack.loaded.values()].map(x=>x.id+':'+x.event+':'+x.variant);
function indexed(pack){const rows=[...pack.loaded.values()];const unique=new Map(rows.map(r=>[r.buffer,r.bytes]));assert.equal(pack.bytes,[...unique.values()].reduce((a,b)=>a+b,0));for(const [event,list]of pack.byEvent)assert.deepEqual(list,rows.filter(x=>x.id+':'+x.event===event).sort((a,b)=>a.variant-b.variant));assert(pack.bytes<=pack.maxBytes);}
test('40 MiB published bank: two-event windows reduce actual old-plus-staged identity peak from 80 to 60 MiB',async()=>{
 const results=[];
 for(const publishEvents of [0,2]){
  const h=rig();await h.pack.load(manifest(oldIds.map((id,i)=>row(id,i))));const playing=h.pack.pick(oldIds[0],'fire').buffer;
  const samples=[],result=await h.pack.load(manifest(newIds.slice(0,4).map((id,i)=>row(id,i+4))),{replace:false,concurrency:2,publishEvents,observeResidency:s=>samples.push(s)});
  assert.equal(result.loaded,4);assert.equal(result.rejected,0);assert.equal(result.residency.publishedBytes,40*MiB);assert.equal(result.residency.stagedBytes,40*MiB);assert.equal(result.residency.pendingNativeDecodes,2);
  assert.equal(result.residency.unionBytes,(publishEvents?60:80)*MiB);assert.equal(result.residency.retainedBytes,(publishEvents?60:80)*MiB);assert.equal(result.residency.publications,publishEvents?2:1);indexed(h.pack);
  assert.equal(playing.tag,0,'an active source reference remains unchanged after its cache entry is evicted');assert.equal(h.requests.length,8);assert.equal(h.decoded.length,8);
  results.push({publishEvents,loaded:result.loaded,residency:result.residency,final:ids(h.pack),samples});
 }
 assert.deepEqual(results[0].final,results[1].final);
 if(process.env.PCM_REPORT)fs.writeFileSync(process.env.PCM_REPORT,JSON.stringify({conditions:'Synthetic valid AudioBuffer identities, 8 channels at 48000 Hz, 10 MiB per sample. Does not measure browser/process/native audio memory or reclaim timing.',results},null,2));
});
test('a demand window exposes no unfinished variant, including after the preceding window publishes',async()=>{
 const h=rig({clipBytes:MiB,maxBytes:12*MiB});await h.pack.load(manifest([row('shooter',0)]));const first=h.gate(5),second=h.gate(8);
 const clips=[row(newIds[0],4,0),row(newIds[0],5,1),row(newIds[1],6),row(newIds[2],7,0),row(newIds[2],8,1)];
 const loading=h.pack.load(manifest(clips),{replace:false,concurrency:2,publishEvents:2});await first.started.promise;await flush();assert.deepEqual(ids(h.pack),['shooter:fire:0']);
 first.release.resolve();await second.started.promise;await flush();assert.deepEqual(h.pack.byEvent.get(newIds[0]+':fire').map(x=>x.variant),[0,1]);assert(h.pack.byEvent.has(newIds[1]+':fire'));assert.equal(h.pack.byEvent.has(newIds[2]+':fire'),false);indexed(h.pack);
 second.release.resolve();assert.equal((await loading).loaded,5);assert.deepEqual(h.pack.byEvent.get(newIds[2]+':fire').map(x=>x.variant),[0,1]);indexed(h.pack);
});
test('atomic replacement retains the complete old bank until all variants finish and explicitly reports necessary headroom',async()=>{
 const h=rig();await h.pack.load(manifest(oldIds.map((id,i)=>row(id,i))));const old=h.pack.loaded,gate=h.gate(7),samples=[];
 const loading=h.pack.load(manifest(newIds.slice(0,4).map((id,i)=>row(id,i+4))),{replace:true,concurrency:2,observeResidency:s=>samples.push(s)});await gate.started.promise;await flush();assert.equal(h.pack.loaded,old);assert.equal(h.pack.loaded.size,4);gate.release.resolve();const result=await loading;
 assert.equal(result.residency.unionBytes,80*MiB);assert.equal(result.residency.publications,1);assert.notEqual(h.pack.loaded,old);indexed(h.pack);
 await assert.rejects(h.pack.load(manifest([]),{replace:true,publishEvents:2}),/remain atomic/);
});
test('shared signed source aliases keep one fetch/decode across publication windows and count PCM once',async()=>{
 const h=rig({clipBytes:MiB,maxBytes:4*MiB});const bytes=new Uint8Array([4]),sha=createHash('sha256').update(bytes).digest('hex');
 const result=await h.pack.load(manifest(newIds.map(id=>row(id,4,0,{sha256:sha}))),{replace:false,publishEvents:2,concurrency:2,observeResidency(){}});
 assert.equal(result.loaded,5);assert.equal(h.requests.length,1);assert.equal(h.decoded.length,1);assert.equal(h.pack.bytes,MiB);assert.equal(result.residency.retainedBytes,MiB);assert.equal(new Set([...h.pack.loaded.values()].map(r=>r.buffer)).size,1);indexed(h.pack);
});
test('window commits preserve playback LRU touches and the completed-window cancellation boundary',async()=>{
 const h=rig({clipBytes:MiB,maxBytes:4*MiB});await h.pack.load(manifest([row('shooter',0),row('roller',1)]));const gate=h.gate(7);
 const pending=h.pack.load(manifest(newIds.slice(0,4).map((id,i)=>row(id,i+4))),{replace:false,publishEvents:2,concurrency:1});await gate.started.promise;
 const live=h.pack.pick('shooter','fire');assert(live);gate.release.resolve();await pending;assert(h.pack.loaded.has('shooter:fire:0'),'real playback touch survives the next staged eviction');indexed(h.pack);
 const next=rig({clipBytes:MiB,maxBytes:12*MiB}),stop=next.gate(7);const loading=next.pack.load(manifest(newIds.slice(0,4).map((id,i)=>row(id,i+4))),{replace:false,publishEvents:2,concurrency:1});await stop.started.promise;assert(next.pack.byEvent.has(newIds[0]+':fire'));assert.equal(next.pack.byEvent.has(newIds[2]+':fire'),false);
 const replacement=await next.pack.load(manifest([row('shooter',0)]),{replace:false});stop.release.resolve();assert.equal((await loading).cancelled,true);assert.equal(replacement.loaded,1);assert(next.pack.byEvent.has(newIds[0]+':fire'));assert.equal(next.pack.byEvent.has(newIds[2]+':fire'),false);indexed(next.pack);
});
test('reentrant diagnostic cancellation cannot reclaim a newer generation or publish stale metadata',async()=>{
 for(const phase of ['begin','staged','published']){const h=rig({clipBytes:MiB,maxBytes:12*MiB});let fired=false,newest;
  const pending=h.pack.load(manifest(newIds.slice(0,3).map((id,i)=>row(id,i+4))),{replace:false,publishEvents:2,observeResidency(sample){if(!fired&&sample.phase===phase){fired=true;newest=h.pack.load(manifest([row('shooter',0)]));}}});
  assert.equal((await pending).cancelled,true);assert.equal((await newest).loaded,1);assert.deepEqual(ids(h.pack),['shooter:fire:0']);assert.equal(h.pack._lruStage,null);assert.equal(h.pack.pending,0);indexed(h.pack);
 }
});
test('actual demand loader enables two-event publication while single-event and operator API defaults remain explicit',async()=>{
 const h=rig({clipBytes:MiB,maxBytes:12*MiB}),data=manifest(newIds.map((id,i)=>row(id,i+4) ));
 // Use the real same-origin manifest path contract while retaining synthetic bytes.
 data.clips=data.clips.map((c,i)=>({...c,variant:0,file:`s3-real/pcm${i+4}.mp3`}));
 const loader=new RealS3SampleLoader({ctx:h.ctx,authorized:h.pack},{fetcher:async()=>({ok:true,json:async()=>data}),assetFetcher:h.pack.fetcher}),options=[];const load=h.pack.load.bind(h.pack);h.pack.load=(manifest,opts)=>{options.push(opts);return load(manifest,opts);};
 await loader.ensureMany(newIds.map(id=>({id,event:'fire'})));assert.equal(options.length,1);assert.equal(options[0].publishEvents,2);assert.equal(options[0].concurrency,2);assert(newIds.every(id=>loader.isEventResident(id,'fire')));
 assert.equal(pcmEventWindows(data.clips,2).length,3);const buffer={length:1,numberOfChannels:1};assert.equal(pcmResidency(new Map([['a',{buffer,bytes:4}]]),new Map([['b',{buffer,bytes:4}]]),new Map([['c',buffer]])).retainedBytes,4);
});

test('a large single event keeps necessary variant-atomic headroom; it is not advertised as a universal 60 MiB cap',async()=>{
 const h=rig();await h.pack.load(manifest(oldIds.map((id,i)=>row(id,i))));const result=await h.pack.load(manifest([0,1,2,3].map(variant=>row(newIds[0],variant+4,variant))),{replace:false,publishEvents:2,concurrency:2,observeResidency(){}});
 assert.equal(result.residency.unionBytes,80*MiB);assert.equal(result.residency.publications,1);assert.deepEqual(h.pack.byEvent.get(newIds[0]+':fire').map(x=>x.variant),[0,1,2,3]);indexed(h.pack);
});
test('partial per-variant errors remain attributed and SHA failure never reaches decode across windows',async()=>{
 const h=rig({clipBytes:MiB,maxBytes:12*MiB}),clips=[row(newIds[0],4),row(newIds[1],5),row(newIds[2],6,0),row(newIds[2],7,1,{sha256:'0'.repeat(64)})];
 const result=await h.pack.load(manifest(clips),{replace:false,publishEvents:2,concurrency:2,observeResidency(){}});
 assert.equal(result.loaded,3);assert.equal(result.rejected,1);assert.equal(result.errors[0].id,newIds[2]);assert.match(result.errors[0].error,/Checksum mismatch/);assert(!h.decoded.includes(7));assert.equal(h.pack.byEvent.get(newIds[2]+':fire').length,1);indexed(h.pack);
});
