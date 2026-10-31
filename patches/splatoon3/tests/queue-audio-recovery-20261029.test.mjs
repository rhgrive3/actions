import test from 'node:test';
import assert from 'node:assert/strict';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';
import { WeaponSoundBank, AUDIO_RECIPES } from '../runtime/audio/bank.mjs';
import { renderSound } from '../runtime/audio/render.mjs';
import { PitchPreservingChargeCache, stretchChargerPCM } from '../runtime/audio/pitch-preserving-charge.mjs';
import { audioWorkerDeadline } from '../runtime/audio/worker-deadline.mjs';

const cues=['combat:critical','combat:damage','combat:ink_focus_normal','combat:ink_focus_strong','combat:splat'];
const buffer=(channels,length,rate)=>{
  const data=Array.from({length:channels},()=>new Float32Array(length));
  return {numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData:c=>data[c]};
};
const context=(rate=8000)=>({state:'running',sampleRate:rate,createBuffer:buffer,async decodeAudioData(){return buffer(1,80,rate);}});
class Mixer {constructor(ctx){this.ctx=ctx;this.byName=new Map();}init(){return this;}_def(){return null;}stats(){return {};}stopAll(){}}
installWeaponAudioEngine(Mixer);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({fail=false,manifestFail=false}={}){
  const engine=new Mixer(context()),bank=engine.weaponBank(),loader=engine._realS3Loader;
  const clips=['shooter','roller',...cues].map((id,i)=>({id,event:'fire',variant:0,file:`s3-real/fixture-${i}.mp3`}));
  const manifest={schema:1,usageRights:'Generated local test bytes; no third-party audio fetched',clips};
  const requests=[],ensures=[];
  loader.fetcher=async()=>manifestFail?{ok:false,status:503}:{ok:true,json:async()=>manifest};
  bank.authorized.fetcher=async url=>{
    requests.push(String(url));
    return fail&&/fixture-[2-6]\.mp3/.test(String(url))?{ok:false,status:503}:
      {ok:true,headers:{get:()=>null},arrayBuffer:async()=>new ArrayBuffer(16)};
  };
  const ensure=loader.ensure.bind(loader);
  loader.ensure=(...args)=>{ensures.push(args[0]);return ensure(...args);};
  const ensureMany=loader.ensureMany.bind(loader);
  loader.ensureMany=(requests,options)=>{ensures.push(...requests.map(row=>row.id));return ensureMany(requests,options);};
  const settle=async()=>{while(loader.inFlight.size){await Promise.all([...loader.inFlight.values()]);await flush();}};
  return {engine,bank,loader,manifest,requests,ensures,settle};
}
test('real recorded loader shares first requests and re-arms only a truly evicted combat cue',async()=>{
  const f=fixture();
  try{
    for(let i=0;i<12;i++)f.engine.prepareWeapon('shooter');
    await f.settle();
    assert.deepEqual(f.ensures.filter(id=>id.startsWith('combat:')),cues);
    f.engine.prepareWeapon('roller');await f.settle();
    const identities=new Map(cues.map(id=>[id,f.bank.authorized.pick(id,'fire').buffer]));
    const count=f.ensures.length;
    f.engine.prepareWeapon('shooter');await f.settle();
    assert.equal(f.ensures.length,count+1,'only the selected main is requested; all five cues are resident');
    const pack=f.bank.authorized;
    pack.maxBytes=pack.bytes;
    // Actual bounded-pack import evicts damage: make every other resident newer.
    for(const row of [...pack.loaded.values()])if(row.id!=='combat:damage')pack.pick(row.id,row.event,row.variant);
    await pack.load({...f.manifest,clips:[{id:'blaster',event:'fire',variant:0,file:'s3-real/extra.mp3'}]},{replace:false});
    assert.equal(pack.byEvent.has('combat:damage:fire'),false);
    assert.equal(cues.filter(id=>pack.byEvent.has(id+':fire')).length,4);
    pack.maxBytes=40*1024*1024;
    const before=f.ensures.filter(id=>id.startsWith('combat:')).length;
    for(let i=0;i<10;i++)f.engine.prepareWeapon('roller');
    await f.settle();
    assert.deepEqual(f.ensures.filter(id=>id.startsWith('combat:')).slice(before),['combat:damage']);
    for(const id of cues)assert.equal(pack.byEvent.has(id+':fire'),true);
    for(const id of cues.filter(id=>id!=='combat:damage'))assert.equal(pack.pick(id,'fire').buffer,identities.get(id));
  }finally{f.engine.disposeWeaponAudio();}
});
test('combat recovery honors per-event failure backoff and then retries without replaying one-shots',async()=>{
  const f=fixture({fail:true});
  try{
    f.engine.prepareWeapon('shooter');await f.settle();
    const count=f.ensures.filter(id=>id.startsWith('combat:')).length,requests=f.requests.length;
    assert.equal(count,5);assert.equal(f.loader.retryAfter.size,5);
    for(let i=0;i<30;i++)f.engine.prepareWeapon('shooter');await f.settle();
    assert.equal(f.ensures.filter(id=>id.startsWith('combat:')).length,count);assert.equal(f.requests.length,requests);
    f.bank.authorized.fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)});
    for(const id of cues)f.loader.retryAfter.set(id+':fire',Date.now()-1);
    f.engine.prepareWeapon('roller');await f.settle();
    assert.equal(f.ensures.filter(id=>id.startsWith('combat:')).length,10);
    assert(cues.every(id=>f.bank.authorized.byEvent.has(id+':fire')));
  }finally{f.engine.disposeWeaponAudio();}
});
test('unavailable manifest backoff creates no combat polling and context replacement releases the old bank',async()=>{
  const f=fixture({manifestFail:true});
  f.engine.prepareWeapon('shooter');await f.settle();const count=f.ensures.filter(id=>id.startsWith('combat:')).length;
  for(let i=0;i<20;i++)f.engine.prepareWeapon('shooter');await f.settle();
  assert.equal(f.ensures.filter(id=>id.startsWith('combat:')).length,count);
  f.engine.ctx=context(44100);const replacement=f.engine.weaponBank();
  assert.notEqual(replacement,f.bank);assert.equal(f.bank.disposed,true);assert.equal(f.engine._warmCombatCueBank,null);
  f.engine.disposeWeaponAudio();assert.equal(replacement.disposed,true);assert.equal(f.engine._warmCombatCueBank,null);
});

function fakeClock(run){
  const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;let now=0,id=0;const timers=new Map();
  globalThis.setTimeout=(fn,delay)=>{const key=++id;timers.set(key,{fn,at:now+delay});return key;};
  globalThis.clearTimeout=key=>timers.delete(key);
  const clock={size:()=>timers.size,tick(ms){const until=now+ms;let n=0;for(;;){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>until)break;assert(++n<2000,'no timer spin');now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=until;}};
  try{return run(clock);}finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;}
}
for(const rate of [44100,48000])test(`silent authored Worker recovers with identical PCM at ${rate}Hz and rejects late responses`,()=>fakeClock(clock=>{
  const workers=[];const bank=new WeaponSoundBank(context(rate),{workerTimeoutMs:100,workerIdleMs:50,workerFactory:()=>{
    const worker={sent:[],terminated:0,postMessage(job){this.sent.push(job);},terminate(){this.terminated++;}};workers.push(worker);return worker;
  }});
  bank.warm('shooter',{events:['fire']});const worker=workers[0],late=worker.onmessage,error=worker.onerror;
  const key=bank.inFlight[3];clock.tick(99);assert.equal(bank.pending.size,3);assert.equal(bank.cache.size,0);
  clock.tick(101);assert.equal(bank.pending.size,0);assert.equal(bank.cache.size,3);assert.equal(worker.terminated,1);
  assert.match(bank.workerError,/timed out/);assert.equal(bank.worker,null);
  const bytes=bank.bytes;late({data:{key,pcm:new Float32Array(10)}});error({message:'stale'});
  assert.equal(bank.bytes,bytes);assert.equal(workers.length,1);
  for(let variant=0;variant<3;variant++)assert.deepEqual(bank.get('shooter','fire',variant).getChannelData(0),renderSound(AUDIO_RECIPES.shooter,'fire',variant,rate));
  bank.dispose();assert.equal(clock.size(),0);
}));
for(const failure of ['construct','post','error'])test(`authored ${failure} failure drains once and disposal cancels recovery timers`,()=>fakeClock(clock=>{
  let worker;const bank=new WeaponSoundBank(context(),{workerTimeoutMs:100,workerIdleMs:50,workerFactory:()=>{
    if(failure==='construct')throw Error('construct');
    return worker={postMessage(){if(failure==='post')throw Error('post');},terminate(){}};
  }});
  bank.warm('shooter',{events:['fire']});if(failure==='error')worker.onerror({message:'error'});
  clock.tick(100);assert.equal(bank.cache.size,3);assert.equal(bank.pending.size,0);assert.equal(clock.size(),0);
  bank.dispose();bank.warm('roller');clock.tick(1000);assert.equal(bank.cache.size,0);assert.equal(clock.size(),0);
}));
test('healthy authored worker retires only when idle, retains buffer identity and ignores a replaced worker',()=>fakeClock(clock=>{
  const workers=[];const bank=new WeaponSoundBank(context(),{workerTimeoutMs:100,workerIdleMs:50,workerFactory:()=>{
    const worker={postMessage(job){this.job=job;},terminate(){this.terminated=true;}};workers.push(worker);return worker;
  }});
  bank.warm('shooter',{events:['fire']});let worker=workers[0];const stale=worker.onmessage,staleError=worker.onerror;
  clock.tick(40);assert.equal(worker.terminated,undefined,'an active job is never idle-retired');
  while(bank.inFlight){const j=worker.job;worker.onmessage({data:{key:j.key,pcm:renderSound(AUDIO_RECIPES[j.id],j.event,j.variant,8000)}});}
  const first=bank.get('shooter','fire');clock.tick(49);assert.equal(bank.worker,worker);clock.tick(1);
  assert.equal(worker.terminated,true);assert.equal(bank.worker,null);assert.equal(bank.get('shooter','fire'),first);
  bank.warm('shooter',{events:['fire']});assert.equal(workers.length,1,'cache hits do not recreate the worker');
  const removed=bank.cache.get('shooter:fire:0');bank.cache.delete('shooter:fire:0');bank.bytes-=removed.bytes;
  bank.warm('shooter',{events:['fire']});worker=workers[1];const pending=bank.inFlight;
  stale({data:{key:pending[3],pcm:new Float32Array(1)}});staleError({message:'retired'});
  assert.equal(bank.worker,worker);assert.equal(bank.inFlight,pending);assert.equal(bank.workerFailed,false);
  bank.dispose();assert.equal(clock.size(),0);
}));
test('Charger idle retirement preserves exact ready PCM and never retires pending work',()=>fakeClock(clock=>{
  const ctx=context(8000),source=buffer(1,2000,8000);source.getChannelData(0).set(Float32Array.from({length:2000},(_,i)=>Math.sin(i*.2)));
  const workers=[];const cache=new PitchPreservingChargeCache(ctx,{workerIdleMs:50,workerFactory:()=>{
    const worker={postMessage(job){this.job=job;},terminate(){this.terminated=true;}};workers.push(worker);return worker;
  }});
  assert.equal(cache.prepare('phrase',source,.5),true);clock.tick(100);const first=workers[0];assert.equal(first.terminated,undefined);
  const stale=first.onmessage,staleError=first.onerror,j=first.job,samples=stretchChargerPCM(j.samples,j.sampleRate,j.ratio);
  first.onmessage({data:{...j,samples}});const ready=cache.lookup('phrase',source,.5);assert(ready);
  assert.deepEqual(ready.getChannelData(0),samples[0]);clock.tick(50);assert.equal(first.terminated,true);assert.equal(cache.worker,null);
  assert.equal(cache.lookup('phrase',source,.5),ready);assert.equal(cache.prepare('phrase',source,.5),true);assert.equal(workers.length,1);
  cache.prepare('phrase',source,.75);const current=cache.worker;
  stale({data:{...j,samples}});staleError();assert.equal(cache.worker,current);assert.equal(cache.unavailable,false);assert.equal(cache.pending.size,1);
  cache.dispose();clock.tick(100);assert.equal(cache.worker,null);assert.equal(cache.pending.size,0);assert.equal(clock.size(),0);
}));

test('four silent WSOLA jobs release every slot, respect retry backoff and retain previously ready PCM',()=>fakeClock(clock=>{
  const source=buffer(1,2000,8000),workers=[];
  const cache=new PitchPreservingChargeCache(context(),{workerTimeoutMs:100,workerIdleMs:50,workerFactory:()=>{
    const worker={postMessage(job){this.job=job;},terminate(){this.terminated=true;}};workers.push(worker);return worker;
  }});
  cache.prepare('ready',source,.5);const old=workers[0],complete=old.onmessage,error=old.onerror,first=old.job;
  complete({data:{...first,samples:stretchChargerPCM(first.samples,first.sampleRate,first.ratio)}});
  const ready=cache.lookup('ready',source,.5);
  for(const time of [.35,.45,.55,.65])assert.equal(cache.prepare('pending',source,time),true);
  const stale=old.job;assert.equal(cache.pending.size,4);assert.equal(cache.prepare('pending',source,.75),false);
  clock.tick(99);assert.equal(cache.pending.size,4);clock.tick(1);
  assert.equal(old.terminated,true);assert.equal(cache.pending.size,0);assert.equal(cache.workerTimeouts,1);assert.equal(clock.size(),0);
  assert.equal(cache.lookup('ready',source,.5),ready);assert.equal(cache.prepare('pending',source,.75),false,'explicit preparation respects the four-second retry gate');
  cache.retryAfter=Date.now()-1;assert.equal(cache.prepare('pending',source,.65),true);const current=cache.worker;
  complete({data:{...stale,samples:[new Float32Array(5)]}});error();
  assert.equal(cache.worker,current);assert.equal(cache.pending.size,1);assert.equal(cache.unavailable,false);
  const job=current.job;current.onmessage({data:{...job,samples:stretchChargerPCM(job.samples,job.sampleRate,job.ratio)}});
  assert(cache.lookup('pending',source,.65));cache.dispose();assert.equal(clock.size(),0);
}));
test('response watchdog pauses when hidden, resumes with a full bound and removes its owned listener',()=>fakeClock(clock=>{
  const listeners=new Set(),document={hidden:false,addEventListener(type,fn){listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
  let timedOut=0,owned=true;const cancel=audioWorkerDeadline(()=>owned,()=>timedOut++,{timeoutMs:100,document});
  clock.tick(90);document.hidden=true;for(const fn of listeners)fn();assert.equal(clock.size(),0);
  clock.tick(10000);assert.equal(timedOut,0);document.hidden=false;for(const fn of listeners)fn();clock.tick(90);assert.equal(timedOut,0);
  cancel();assert.equal(listeners.size,0);assert.equal(clock.size(),0);
  audioWorkerDeadline(()=>owned,()=>timedOut++,{timeoutMs:100,document});clock.tick(100);assert.equal(timedOut,1);assert.equal(listeners.size,0);
  audioWorkerDeadline(()=>owned,()=>timedOut++,{timeoutMs:100,document});owned=false;clock.tick(100);assert.equal(timedOut,1);assert.equal(listeners.size,0);
}));

for(let resident=0;resident<=5;resident++)test('shared combat prewarm imports only missing events in 2+2+1 batches with '+resident+' resident',async()=>{
 const f=fixture();try{await f.loader.getManifest();if(resident)await f.bank.authorized.load({...f.manifest,clips:f.manifest.clips.filter(row=>cues.slice(0,resident).includes(row.id))},{replace:false});
  const batches=[],load=f.bank.authorized.load.bind(f.bank.authorized);f.bank.authorized.load=(manifest,options)=>{batches.push({ids:manifest.clips.map(x=>x.id),concurrency:options.concurrency});return load(manifest,options);};
  f.engine.prepareWeapon('shooter');await f.settle();const shared=batches.filter(x=>x.ids[0]?.startsWith('combat:'));assert.deepEqual(shared.map(x=>x.ids),Array.from({length:Math.ceil((5-resident)/2)},(_,i)=>cues.slice(resident+i*2,resident+i*2+2)));assert(shared.every(x=>x.concurrency===2));assert(cues.every(id=>f.loader.isEventResident(id,'fire')));
 }finally{f.engine.disposeWeaponAudio();}
});
test('START rejects a partially decoded combat event even if one variant is already published',async()=>{
 const f=fixture();try{f.manifest.clips.push({id:cues[0],event:'fire',variant:1,file:'s3-real/fail-variant.mp3'});const fetcher=f.bank.authorized.fetcher;f.bank.authorized.fetcher=url=>String(url).includes('fail-variant')?Promise.resolve({ok:false,status:404}):fetcher(url);
  await assert.rejects(f.engine.requireRecordedMainShot('shooter'),/combat:critical/);assert(f.bank.authorized.byEvent.has(cues[0]+':fire'));assert.equal(f.loader.isEventResident(cues[0],'fire'),false);
 }finally{f.engine.disposeWeaponAudio();}
});
