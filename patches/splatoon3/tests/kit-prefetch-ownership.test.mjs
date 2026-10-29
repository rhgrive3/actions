import test from 'node:test';
import assert from 'node:assert/strict';
import {RealS3SampleLoader} from '../runtime/audio/real-s3-loader.mjs';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
import {refreshRecordedKitPrefetch,cancelRecordedKitPrefetch} from '../runtime/audio/kit-prefetch.mjs';
import {installWeaponAudioRuntime} from '../runtime/audio/runtime.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const clip=(id,event,variant=0)=>({id,event,variant,file:'s3-real/'+id.replaceAll(':','_')+'_'+event+variant+'.mp3'});
const clips=[clip('shooter','fire'),clip('sub:bomb','fire'),clip('sub:bomb','explosion'),clip('special:inkjet','fire'),clip('special:inkjet','fire',1),clip('special:inkjet','spin')];
function harness(){
 const calls=[];const ctx={state:'running',sampleRate:48000,async decodeAudioData(){return {duration:.01,length:480,numberOfChannels:1,sampleRate:48000,getChannelData:()=>new Float32Array(480)};}};
 const authorized=new AuthorizedSamplePack(ctx),bank={ctx,authorized};
 const loader=new RealS3SampleLoader(bank,{fetcher:async()=>({ok:true,json:async()=>({schema:1,usageRights:'Synthetic fixture only',clips})}),assetFetcher:async url=>{calls.push(String(url));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};}});
 return {ctx,bank,loader,calls,state:{}};
}
async function idle(loader){for(let i=0;i<20;i++){await loader.queue;await flush();if(!loader.pendingJobs.length&&!loader.inFlight.size)return;}assert.fail('loader did not become idle');}
test('event residency requires every decoded variant and does not trust old loaded flags',async()=>{
 const h=harness();await h.loader.ensure('special:inkjet','fire');assert.equal(h.loader.isEventResident('special:inkjet','fire'),true);
 h.bank.authorized.loaded.delete(h.bank.authorized.key('special:inkjet','fire',1));assert.equal(h.loader.isEventResident('special:inkjet','fire'),false);assert(h.loader.loaded.has('special:inkjet'));assert.equal(h.loader.isEventResident('absent','fire'),false);
});
test('cancel only queued speculation; required join and other owners survive while priority main starts first',async()=>{
 const h=harness(),owner={},other={};
 const gone=h.loader.ensure('sub:bomb','fire',{owner});
 const shared=h.loader.ensure('special:inkjet','fire',{owner});assert.equal(h.loader.ensure('special:inkjet','fire',{owner:other}),shared);
 const required=h.loader.ensure('special:inkjet','spin',{owner});assert.equal(h.loader.ensure('special:inkjet','spin'),required);
 const main=h.loader.ensure('shooter','fire',{priority:true});h.loader.cancelOwner(owner);
 assert.deepEqual((await gone),{loaded:0,cancelled:true});await Promise.all([main,shared,required]);await idle(h.loader);
 assert.match(h.calls[0],/shooter_fire/);assert(!h.calls.some(x=>x.includes('sub_bomb_fire')));assert(h.loader.isEventResident('special:inkjet','fire'));assert(h.loader.isEventResident('special:inkjet','spin'));
});
test('already started speculative decode is retained after its owner cancels',async()=>{
 const h=harness(),gate=deferred(),started=deferred(),owner={};h.ctx.decodeAudioData=async()=>{started.resolve();await gate.promise;return {duration:.01,length:480,numberOfChannels:1,sampleRate:48000,getChannelData:()=>new Float32Array(480)};};
 const promise=h.loader.ensure('special:inkjet','fire',{owner});await started.promise;h.loader.cancelOwner(owner);gate.resolve();assert.equal((await promise).loaded,2);assert(h.loader.isEventResident('special:inkjet','fire'));
});
test('prefetch joins pending work once, rearms real cache eviction, and preserves continuous cue demand paging',async()=>{
 const h=harness();await h.loader.getManifest();let stamp=1000;const now=()=>stamp;
 const external={};const pending=h.loader.ensure('special:inkjet','fire',{owner:external});
 const row=refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','inkjet',now);
 const fire=h.loader.pendingJobs.find(x=>x.key==='special:inkjet:fire');assert(fire.owners.has(row.owner));assert(fire.owners.has(external));
 refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','inkjet',now);assert.equal(fire.owners.size,2);
 await pending;await idle(h.loader);stamp+=1100;refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','inkjet',now);await idle(h.loader);
 const previous=h.calls.length;h.bank.authorized.clear(); // actual cache invalidation increments generation
 refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','inkjet',now);await idle(h.loader);
 assert(h.calls.length>previous);assert(h.loader.isEventResident('special:inkjet','fire'));assert(!h.loader.isEventResident('special:inkjet','spin'),'unused evicted continuous cue is demand paged');
});
test('prefetch honors manifest/event retry clocks and retries after bounded backoff',async()=>{
 const h=harness();await h.loader.getManifest();let stamp=1000;h.loader.manifestRetryAt=5000;h.loader.retryAfter.set('special:inkjet:fire',6000);
 const row=refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','inkjet',()=>stamp);assert.equal(h.loader.pendingJobs.length,0);assert.equal(row.next,5000);
 stamp=5500;refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','inkjet',()=>stamp);assert(!h.loader.pendingJobs.some(x=>x.key==='special:inkjet:fire'));await idle(h.loader);
 h.loader.retryAfter.delete('special:inkjet:fire');stamp=6500;refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','inkjet',()=>stamp);await idle(h.loader);assert(h.loader.isEventResident('special:inkjet','fire'));
});
test('kit or context replacement cancels old queued owner; stale promise completion does not dirty new owner',async()=>{
 const h=harness(),a=refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','inkjet',()=>1000);
 const b=refreshRecordedKitPrefetch(h.state,h.loader,{},'', '',()=>1000);assert.notEqual(a,b);assert.equal(h.loader.pendingJobs.length,0);assert.equal(b.dirty,false);await flush();assert.equal(b.dirty,false);
 cancelRecordedKitPrefetch(h.state);assert.equal(h.state.kitPrefetch,null);assert.equal(h.state.preloadedKit,null);
});
test('installed WeaponRunner update/reset/actor removal/match end/disposal own real prefetch requests',async()=>{
 for(const boundary of ['reset','actor','match','dispose','remote','closed']){
  const h=harness(),events=new Map();class Actor{setWeapon(){} _startSpecial(){} _updateSpecial(){}}class WeaponRunner{reset(){}update(){return 'original';}}class Projectiles{throwBomb(){} _push(){} _blastBurst(){}}
  const G={time:0,audio:{ctx:h.ctx,_realS3Loader:h.loader,play(){},prepareWeapon(){return h.loader.ensure('shooter','fire',{priority:true});},loopWeapon(){return {stop(){},set(){}};}}};
  const installed=installWeaponAudioRuntime({G,Actor,WeaponRunner,Projectiles,on(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);return()=>{};}});
  const r=new WeaponRunner();r.a={weaponRunner:r,alive:true,isLocal:true,form:'kid',pos:{x:0,y:0,z:0},weapon:{id:'shooter',sub:'bomb',special:'inkjet'}};
  assert.equal(r.update(.016),'original');assert(r._mainAudioState.kitPrefetch);assert(h.loader.pendingJobs.length>1);
  if(boundary==='reset')r.reset();if(boundary==='actor')for(const fn of events.get('actor:removed'))fn({actor:r.a});if(boundary==='match')for(const fn of events.get('match:state'))fn({state:'results'});if(boundary==='dispose')installed.dispose();if(boundary==='remote'){r.a.isLocal=false;r.update(.016);}if(boundary==='closed'){h.ctx.state='closed';r.update(.016);}
  assert.equal(r._mainAudioState?.kitPrefetch??null,null,boundary);assert(h.loader.pendingJobs.every(x=>x.required),boundary);await idle(h.loader);installed.dispose();
 }
});

test('actual LRU transaction eviction is observed without clearing the bank or replacing the kit',async()=>{
 const h=harness();await h.loader.getManifest();h.loader.declaredEvents=new Set(['sub:bomb:fire']);h.bank.authorized.maxBytes=1920;let stamp=1000;
 const row=refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','',()=>stamp);await idle(h.loader);stamp+=1100;refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','',()=>stamp);assert.equal(row.next,Infinity);
 assert(h.loader.isEventResident('sub:bomb','fire'));await h.loader.ensure('shooter','fire');assert(!h.loader.isEventResident('sub:bomb','fire'),'actual budget evicts the older PCM');
 refreshRecordedKitPrefetch(h.state,h.loader,h.ctx,'bomb','',()=>stamp);await idle(h.loader);assert(h.loader.isEventResident('sub:bomb','fire'));assert.equal(h.state.kitPrefetch,row);
});
test('production-composed Actor/WeaponRunner consumption keeps required main and withdraws old kit on reset',async()=>{
 const {fixture}=await import('./source-fixture.mjs');
 const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';"});
 const h=harness();f.G.audio={ctx:h.ctx,_realS3Loader:h.loader,play(){},playWeapon(){},prepareWeapon(){return h.loader.ensure('shooter','fire',{priority:true});},loopWeapon(){return{playing:true,set(){},stop(){this.playing=false;}};},loop(){return{set(){},stop(){}};},duck(){}};
 const installed=f.installWeaponAudioRuntime(f.installedRuntime),a=f.make('shooter');a.isLocal=true;a.form='kid';a.weapon={...a.weapon,sub:'bomb',special:'inkjet'};
 a.weaponRunner.update(1/60,{fire:false});assert(a.weaponRunner._mainAudioState.kitPrefetch);assert(h.loader.pendingJobs.some(row=>!row.required));a.weaponRunner.reset();assert.equal(a.weaponRunner._mainAudioState,null);assert(h.loader.pendingJobs.every(row=>row.required));await idle(h.loader);assert(h.loader.isEventResident('shooter','fire'));assert(!h.loader.isEventResident('special:inkjet','fire'));installed.dispose();
});
