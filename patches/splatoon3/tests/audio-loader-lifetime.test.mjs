import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {installWeaponAudioEngine} from '../runtime/audio/engine.mjs';
import {WeaponSoundBank} from '../runtime/audio/bank.mjs';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
const ROOT=new URL('../../../',import.meta.url);
let digestHook=async()=>new ArrayBuffer(32);
Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest(...args){return digestHook(...args);}}}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const flush=()=>new Promise(r=>setImmediate(r));
function pcm(){return {sampleRate:48000,numberOfChannels:1,length:64,duration:64/48000,getChannelData(){return new Float32Array(64);}};}
class Mixer{
 constructor(ctx){this.ctx=ctx;this.byName=new Map();this.loopStarts=0;this.loops=new Set();this.voices=[];}
 _def(){return null;}init(){return this;}play(){}stats(){return {};}
 loop(){this.loopStarts++;const h={playing:true,set(){},stop(){h.playing=false;}};this.loops.add(h);return h;}
}
// Preserve actual native stopAll behavior; voice creation remains a counted mixer seam.
const mixerSource=fs.readFileSync(new URL('inkwave-public/src/audio/audio.js',ROOT),'utf8');
const start=mixerSource.indexOf('  stopAll('),end=mixerSource.indexOf('\n  stats()',start);
Mixer.prototype.stopAll=vm.runInNewContext('({'+mixerSource.slice(start,end)+'}).stopAll');
installWeaponAudioEngine(Mixer);
const id='special:inkjet',event='spin';
const manifest={schema:1,usageRights:'Synthetic fixture bytes only; no external audio fetched',clips:[{id,event,file:'s3-real/fixture.mp3',variant:0,seamlessLoop:true,sha256:'0'.repeat(64)}]};
function harness(boundary){
 const ready=deferred(),gate=deferred(),counts={manifest:0,json:0,asset:0,bytes:0,decode:0,hash:0};
 const step=async name=>{counts[name]++;if(name===boundary){ready.resolve();await gate.promise;}};
 const ctx={sampleRate:48000,currentTime:0,state:'running',async decodeAudioData(){await step('decode');return pcm();}};
 const engine=new Mixer(ctx),bank=engine.weaponBank(),loader=engine._realS3Loader;
 loader.fetcher=async()=>{await step('manifest');return {ok:true,json:async()=>{await step('json');return manifest;}};};
 bank.authorized.fetcher=async()=>{await step('asset');return {ok:true,headers:{get(){return null;}},arrayBuffer:async()=>{await step('bytes');return new ArrayBuffer(8);}};};
 digestHook=async()=>{await step('hash');return new ArrayBuffer(32);};
 return {ready,gate,counts,ctx,engine,bank,loader};
}
for(const boundary of ['manifest','json','asset','bytes','decode','hash'])for(const cancellation of ['dispose','replacement','closed'])test(`${cancellation} at ${boundary} prevents later work and old bank resurrection`,async()=>{
 const h=harness(boundary),handle=h.engine.loopWeapon(id,event),job=h.loader.ensure(id,event);await h.ready.promise;
 if(cancellation==='dispose'){h.engine.disposeWeaponAudio();h.engine.disposeWeaponAudio();}
 if(cancellation==='replacement'){h.engine.ctx={...h.ctx};h.engine.weaponBank();}
 if(cancellation==='closed')h.ctx.state='closed';
 const counts={...h.counts};h.gate.resolve();const result=await job;await flush();
 assert.deepEqual(h.counts,counts,'no downstream fetch/decode/hash after cancellation');assert.equal(result.cancelled,true);assert.equal(h.bank.authorized.loaded.size,0);assert.equal(h.bank.authorized.bytes,0);assert.equal(h.bank.authorized.pending,0);assert.equal(h.loader.inFlight.size,0);assert.equal(h.engine.loopStarts,0);assert.equal(handle.playing,false);
});
for(const boundary of ['manifest','json','asset','bytes','decode','hash'])test(`current owner completes successfully through ${boundary}`,async()=>{
 const h=harness(boundary),handle=h.engine.loopWeapon(id,event),job=h.loader.ensure(id,event);await h.ready.promise;h.gate.resolve();const result=await job;await flush();
 assert.equal(result.loaded,1);assert.equal(result.cancelled,false);assert.equal(h.bank.authorized.bytes,256);assert.equal(h.engine.loopStarts,1);assert.equal(handle.playing,true);assert.deepEqual(h.counts,{manifest:1,json:1,asset:1,bytes:1,decode:1,hash:1});handle.stop();h.engine.disposeWeaponAudio();
});
test('queued jobs cannot start after repeated owner disposal',async()=>{
 const h=harness('manifest'),first=h.loader.ensure(id,event),second=h.loader.ensure('shooter','fire');await h.ready.promise;h.engine.disposeWeaponAudio();h.engine.disposeWeaponAudio();h.gate.resolve();const results=await Promise.all([first,second]);await flush();assert(results.every(x=>x.cancelled));assert.equal(h.counts.asset,0);assert.equal(h.loader.inFlight.size,0);
});
test('current failed load retains retry behavior without adding voices',async()=>{
 const h=harness('manifest');h.loader.fetcher=async()=>({ok:false,status:503});const result=await h.loader.ensure(id,event);assert.equal(result.unavailable,true);assert.equal(h.loader.status,'unavailable');assert.equal(h.loader.errors.length,1);assert.equal(h.engine.loopStarts,0);h.engine.disposeWeaponAudio();
});
test('shared resident cache survives cancelled replacement import and successful new load',async()=>{
 const ctx={state:'running',sampleRate:48000,decodeAudioData:async()=>pcm()},gate=deferred(),ready=deferred();let calls=0;
 const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})});digestHook=async()=>new ArrayBuffer(32);await pack.load(manifest);const buffer=pack.pick(id,event).buffer;
 pack.fetcher=async()=>{calls++;ready.resolve();await gate.promise;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
 const other={...manifest,clips:[{...manifest.clips[0],id:'shooter',event:'fire',file:'s3-real/other.mp3'}]};const stale=pack.load(other,{replace:false});await ready.promise;
 // A newer import wins without clearing the resident shared source.
 const current=await pack.load(manifest,{replace:false});assert.equal(current.loaded,1);gate.resolve();assert.equal((await stale).cancelled,true);assert.equal(pack.pick(id,event).buffer,buffer);assert.equal(pack.loaded.size,1);assert.equal(calls,1);assert.equal(pack.pending,0);
});
test('late worker completion/error cannot recreate a disposed worker or cache',()=>{
 let created=0,terminated=0,worker;const ctx={sampleRate:48000};const bank=new WeaponSoundBank(ctx,{workerFactory:()=>{created++;return worker={postMessage(){},terminate(){terminated++;}};}});
 bank.warm('shooter');const message=worker.onmessage,error=worker.onerror,key=bank.inFlight[3];bank.dispose();message({data:{key,pcm:new Float32Array(16)}});error({message:'late'});bank.warm('shooter');assert.equal(created,1);assert.equal(terminated,1);assert.equal(bank.worker,null);assert.equal(bank.pending.size,0);assert.equal(bank.cache.size,0);
});
test('strict real-only bank never creates synthesis workers',()=>{
 let workers=0;const bank=new WeaponSoundBank({sampleRate:48000},{realOnly:true,workerFactory(){workers++;}});bank.warm('shooter');assert.equal(workers,0);bank.dispose();
});

test('replacement context loads successfully while the old manifest is still pending',async()=>{
 const h=harness('manifest'),old=h.loader.ensure(id,event);await h.ready.promise;
 h.engine.ctx={sampleRate:48000,currentTime:0,state:'running',decodeAudioData:async()=>pcm()};const next=h.engine.weaponBank(),loader=h.engine._realS3Loader;
 loader.fetcher=async()=>({ok:true,json:async()=>manifest});next.authorized.fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});digestHook=async()=>new ArrayBuffer(32);
 assert.equal((await loader.ensure(id,event)).loaded,1);h.engine.loopWeapon(id,event);assert.equal(h.engine.loopStarts,1);h.gate.resolve();assert.equal((await old).cancelled,true);assert.equal(h.bank.authorized.bytes,0);assert.equal(next.authorized.bytes,256);h.engine.disposeWeaponAudio();
});

test('failed current decode preserves a resident cache and remains retryable',async()=>{
 const h=harness('manifest');h.gate.resolve();await h.loader.ensure(id,event);const buffer=h.bank.authorized.pick(id,event).buffer;
 h.bank.authorized.fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});h.ctx.decodeAudioData=async()=>{throw Error('synthetic decode failure');};
 const different={...manifest,clips:[{...manifest.clips[0],id:'shooter',event:'fire',file:'s3-real/new.mp3'}]};const failed=await h.bank.authorized.load(different,{replace:false});assert.equal(failed.rejected,1);assert.equal(h.bank.authorized.pick(id,event).buffer,buffer);
 h.ctx.decodeAudioData=async()=>pcm();digestHook=async()=>new ArrayBuffer(32);assert.equal((await h.bank.authorized.load(different,{replace:false})).loaded,1);assert.equal(h.bank.authorized.loaded.size,2);h.engine.disposeWeaponAudio();
});

test('loader asset failure respects backoff and retries the current owner successfully',async()=>{
 const h=harness('unused');let assets=0;
 h.bank.authorized.fetcher=async()=>{assets++;return assets===1?{ok:false,status:503}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
 const first=await h.loader.ensure(id,event);await flush();assert.equal(first.rejected,1);assert.equal(h.bank.authorized.loaded.size,0);
 const throttled=await h.loader.ensure(id,event);await flush();assert.equal(throttled.throttled,true);assert.equal(assets,1);
 h.loader.retryAfter.set(id+':'+event,Date.now()-1);const retry=await h.loader.ensure(id,event);assert.equal(retry.loaded,1);assert.equal(assets,2);assert.equal(h.counts.manifest,1);assert.equal(h.bank.authorized.bytes,256);h.engine.disposeWeaponAudio();
});
