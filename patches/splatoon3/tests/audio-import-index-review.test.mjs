import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
const bytes=name=>Uint8Array.from({length:64},(_,i)=>(i+name.charCodeAt(0))%256).buffer;
const hash=name=>createHash('sha256').update(new Uint8Array(bytes(name))).digest('hex');
const manifest=clips=>({schema:1,usageRights:'Synthetic independently generated test fixture',clips});
function fixture(maxBytes=8192){
 const counts={fetch:0,decode:0};
 const buffer=(channels,length,rate,seed=0)=>{const pcm=Array.from({length:channels},()=>Float32Array.from({length},(_,i)=>((i+seed)%31)/31));return{numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData:c=>pcm[c]};};
 const ctx={state:'running',sampleRate:8000,createBuffer:buffer,decodeAudioData:async data=>{counts.decode++;await Promise.resolve();return buffer(1,256,8000,new Uint8Array(data)[0]);}};
 const pack=new AuthorizedSamplePack(ctx,{maxBytes,fetcher:async url=>{counts.fetch++;await Promise.resolve();const name=url.split('/').at(-1);return {ok:true,arrayBuffer:async()=>bytes(name)};}});
 return{pack,ctx,counts};
}
function assertIndex(pack,requireEventOrder=false){
 const expected=new Map(),buffers=new Map();
 for(const row of pack.loaded.values()){
  const key=row.id+':'+row.event;if(!expected.has(key))expected.set(key,[]);expected.get(key).push(row);
  if(!buffers.has(row.buffer))buffers.set(row.buffer,row.bytes);
 }
 assert.deepEqual([...pack.byEvent.keys()].sort(),[...expected.keys()].sort());
 if(requireEventOrder)assert.deepEqual([...pack.byEvent.keys()],[...expected.keys()]);
 for(const [key,rows]of expected){rows.sort((a,b)=>a.variant-b.variant);assert.deepEqual(pack.byEvent.get(key),rows);}
 assert.equal(pack.bytes,[...buffers.values()].reduce((a,b)=>a+b,0));assert.ok(pack.bytes<=pack.maxBytes);assert.equal(pack.pending,0);
}
const row=(id,event,file,variant=0)=>({id,event,file,variant,sha256:hash(file)});
test('partial import replacement, pick LRU and repeated eviction preserve exact live event membership',async()=>{
 const {pack}=fixture(2048);let seed=47;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const events=[['shooter','fire'],['roller','roll'],['s3-brush-normal','windup'],['s3-brush-normal','roll']];
 for(let round=0;round<40;round++){
  const clips=new Map();
  for(let i=0;i<(round%2?12:6);i++){
   const [id,event]=events[i%events.length],variant=Math.floor(i/events.length),file=['a.wav','b.wav','c.wav'][Math.floor(random()*3)];
   clips.set(id+':'+event+':'+variant,row(id,event,file,variant));
  }
  const result=await pack.load(manifest([...clips.values()]),{replace:round%7===0,concurrency:1+round%4});
  assert.equal(result.rejected,0);assertIndex(pack,true);
  for(const [id,event]of events)pack.pick(id,event,Math.floor(random()*100));
  assertIndex(pack);
 }
});
test('failed partial imports retain valid PCM and event arrays, and later successful rows remain indexed',async()=>{
 const {pack}=fixture();await pack.load(manifest([row('shooter','fire','a.wav')]));
 const live=pack.pick('shooter','fire'),array=pack.byEvent.get('shooter:fire');
 const bad={...row('roller','fire','b.wav'),sha256:'0'.repeat(64)};
 assert.equal((await pack.load(manifest([bad]),{replace:false})).rejected,1);
 assert.equal(pack.pick('shooter','fire'),live);assert.deepEqual(pack.byEvent.get('shooter:fire'),array);assertIndex(pack);
 await pack.load(manifest([row('roller','fire','b.wav')]),{replace:false});assert.ok(pack.pick('roller','fire'));assertIndex(pack);
});
test('late superseded decode and clear cannot publish buckets or event arrays',async()=>{
 const {pack,ctx}=fixture();let release;const original=ctx.decodeAudioData;
 ctx.decodeAudioData=()=>new Promise(r=>{release=r;});
 const pending=pack.load(manifest([row('shooter','fire','a.wav')]));
 while(!release)await new Promise(r=>setImmediate(r));
 ctx.decodeAudioData=original;
 await pack.load(manifest([row('roller','fire','b.wav')]));
 release(await original(bytes('a.wav')));assert.equal((await pending).cancelled,true);assert.equal(pack.pick('shooter','fire'),null);assert.ok(pack.pick('roller','fire'));assertIndex(pack);
 let finish;ctx.decodeAudioData=()=>new Promise(r=>{finish=r;});
 const cleared=pack.load(manifest([row('shooter','fire','c.wav')]),{replace:false});while(!finish)await new Promise(r=>setImmediate(r));
 pack.clear();finish(await original(bytes('c.wav')));assert.equal((await cleared).cancelled,true);assert.equal(pack.loaded.size,0);assertIndex(pack);
});
test('verified Brush windup stays raw while roll gets independent seam repair and shares repeated repaired rolls',async()=>{
 const {pack,counts}=fixture();
 await pack.load(manifest([row('s3-brush-normal','windup','a.wav')]),{concurrency:1});
 const windup=pack.pick('s3-brush-normal','windup');const raw=Array.from(windup.buffer.getChannelData(0));
 await pack.load(manifest([row('s3-brush-normal','roll','a.wav'),row('s3-brush-normal','roll','a.wav',1)]),{replace:false,concurrency:1});
 const roll=pack.pick('s3-brush-normal','roll',0),other=pack.pick('s3-brush-normal','roll',1);
 assert.notEqual(roll.buffer,windup.buffer);assert.equal(roll.buffer,other.buffer);assert.deepEqual(Array.from(windup.buffer.getChannelData(0)),raw);assert.equal(counts.fetch,1);assert.equal(counts.decode,1);assertIndex(pack);
});
