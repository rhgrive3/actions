import test from 'node:test';
import assert from 'node:assert/strict';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';
import { WeaponSoundBank, AUDIO_RECIPES } from '../runtime/audio/bank.mjs';
import { fireArticulation } from '../runtime/audio/weapon-recipes.mjs';
import { RealS3SampleLoader } from '../runtime/audio/real-s3-loader.mjs';
import { AuthorizedSamplePack } from '../runtime/audio/authorized-samples.mjs';

const rights='Authorized only within a local private copy, no public distribution';
const id='s3-charger-long';
const clip=(w,event,file=`${event}.mp3`,variant=0)=>({id:w,event,file:`s3-real/${file}`,variant});
const manifest=clips=>({schema:1,usageRights:rights,targetVersion:'2022-extracted (NOT 11.3.0)',clips});
const mkctx=(dur=0.2)=>{
 const sources=[];let decodeCount=0;
 const ctx={sampleRate:48000,currentTime:10,
   createBuffer(ch,n,sr){const cells=Array.from({length:ch},()=>new Float32Array(n));return {sampleRate:sr,numberOfChannels:ch,length:n,duration:n/sr,getChannelData:i=>cells[i]};},
   async decodeAudioData(){decodeCount++;return ctx.createBuffer(1,Math.round(dur*48000),48000);},
   createBufferSource(){const s={connect(){},start(t){this.started=t;},loop:false,playbackRate:{value:1,setTargetAtTime(){}},buffer:null};sources.push(s);return s;},
   createGain(){return{gain:{value:1},connect(){}};}
 };
 return{ctx,sources,count:()=>decodeCount};
};
const res={ok:true,headers:{get:()=>null},arrayBuffer:async()=>new ArrayBuffer(1024)};
class MixerStub {
 constructor(ctx){this.ctx=ctx;this.byName=new Map();this.played=[];}
 _def(name){return{legacy:true,name};}
 init(){return this;}
 play(name,options){const d=this._def(name);if(!d)return null;const v={ctx:this.ctx,t:this.ctx.currentTime, out:{},nodes:[],srcs:[],end:0,endless:false};
   if(d.build)d.build(v,options?.pitch??1,options);
   else if(d.loop)d.loop(v,options?.pitch??1,options);
   this.played.push({name,def:d,voice:v});return d;}
 loop(name,options){return this.play(name,options)?{playing:true,set(){},stop(){}}:null;}
 stopAll(){}
 stats(){return{played:this.played.length};}
}
installWeaponAudioEngine(MixerStub);

test('v11 connects real game AudioEngine._def to decoded weapon buffers', async()=>{
 const {ctx,sources}=mkctx();const a=new MixerStub(ctx);
 // An admitted shot before warmup is discarded rather than synthesized or delayed.
 assert.equal(a.playWeapon(id,'fire'),null);
 assert.equal(a.played.length,0);
 assert.equal(a.weaponBank().stats().realOnly,true);
 // Supply the same-origin manifest and bytes through the real loader.
 a._realS3Loader.fetcher=async()=>({ok:true,json:async()=>manifest([clip(id,'fire')])});
 a._realS3Loader.manifestPromise=null;
 a._realS3Loader.bank.authorized.fetcher=async()=>res;
 const ready=await a._realS3Loader.ensure(id,'fire');
 assert.equal(ready.loaded,1,JSON.stringify(ready));
 const result=a.playWeapon(id,'fire');
 assert.equal(result.weaponId,id);
 assert.equal(a.played.at(-1).name,`main:${id}:fire`);
 assert.equal(a.played.at(-1).def.legacy,undefined);
 assert.equal(sources.length,1);
 assert.equal(sources[0].buffer,a.weaponBank().authorized.pick(id,'fire').buffer);
 assert.equal(a.weaponBank().cache.size,0,'no procedural PCM created');
 assert.equal(a._def('ui_click').legacy,true,'unrelated legacy UI audio remains intact');
 assert.equal(a.stats().realAudioSuppressed,1);
});

test('strict real-only mode suppresses unrecorded 2024+ weapons and missing events',async()=>{
 const {ctx}=mkctx(),a=new MixerStub(ctx);
 assert.equal(a.playWeapon('s3-charger-pencil','fire_full'),null);
 assert.equal(a.playWeapon('s3-charger-long','scope'),null);
 const suspended=a.loopWeapon('s3-charger-long','charge');
 assert.equal(suspended.playing,true,'cold loops await real MP3 decoding without synthesis');
 suspended.stop();assert.equal(suspended.playing,false);
 assert.equal(a.played.length,0);
 assert.equal(a._def('main:s3-charger-pencil:fire_full'),null);
 assert.equal(a.weaponBank().stats().generatedOffThread,0);
});

test('evicted decoded sound re-loads on demand instead of trusting stale v10 loaded bit',async()=>{
 const {ctx,count}=mkctx(0.1);
 const bank={authorized:new AuthorizedSamplePack(ctx,{maxBytes:19200,fetcher:async()=>res})};
 const sound=manifest([clip('shooter','fire','shotA.mp3'),clip('charger','fire','shotB.mp3')]);
 const loader=new RealS3SampleLoader(bank,{fetcher:async()=>({ok:true,json:async()=>sound}),assetFetcher:async()=>res});
 bank.authorized.maxBytes=19200; // deliberate test-only eviction after the loader's default 40MiB bump.
 await loader.ensure('shooter','fire');
 assert.ok(bank.authorized.pick('shooter','fire'));
 await loader.ensure('charger','fire');
 assert.equal(bank.authorized.pick('shooter','fire'),null,'budget evicted the oldest shot');
 const back=await loader.ensure('shooter','fire');
 assert.equal(back.loaded,1);
 assert.ok(bank.authorized.pick('shooter','fire'));
 assert.equal(count(),3,'only missing decoded sources are fetched again');
});

test('30-second verified loop ceiling accepts actual 2022 rollers and screens, denies oversized audio',async()=>{
 const {ctx}=mkctx(22.49143);
 const clips=[clip('sub:splashWall','spin','long-loop.mp3')];
 const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>res,maxBytes:35*1024*1024});
 const good=await pack.load(manifest(clips));
 assert.equal(good.rejected,0,JSON.stringify(good.errors));
 assert.ok(pack.pick('sub:splashWall','spin'));
 const bad=mkctx(31),reject=new AuthorizedSamplePack(bad.ctx,{fetcher:async()=>res,maxBytes:35*1024*1024});
 const result=await reject.load(manifest(clips));
 assert.equal(result.loaded,0);
 assert.match(result.errors[0].error,/Invalid decoded sample/);
});


test('unloaded continuous special audio starts after decode and respects pending stop',async()=>{
 const {ctx,sources}=mkctx(),a=new MixerStub(ctx);
 const records=manifest([clip('special:inkjet','spin','jet.mp3'),clip('special:crabTank','spin','crab.mp3')]);
 a.weaponBank();a._realS3Loader.fetcher=async()=>({ok:true,json:async()=>records});
 a._realS3Loader.bank.authorized.fetcher=async()=>res;
 const jet=a.loopWeapon('special:inkjet','spin',{volume:.3});
 assert.equal(a.played.length,0,'do not start a dummy synthesized loop');
 jet.set({volume:.5});
 await a._realS3Loader.ensure('special:inkjet','spin');await new Promise(r=>setImmediate(r));
 assert.equal(a.played.length,1,'admitted loop starts when real MP3 becomes resident');
 assert.equal(a.played[0].name,'main:special:inkjet:spin');
 assert.equal(sources.length,1);jet.stop();assert.equal(jet.playing,false);
 const crab=a.loopWeapon('special:crabTank','spin');crab.stop();
 await a._realS3Loader.ensure('special:crabTank','spin');await new Promise(r=>setImmediate(r));
 assert.equal(a.played.length,1,'stopping an effect during fetch prevents phantom late audio');
});

test('special loop transient manifest failure retries without permanent silent handle', async()=>{
 const {ctx,sources}=mkctx(),a=new MixerStub(ctx);
 a.weaponBank();
 let queries=0;
 a._realS3Loader.fetcher=async()=>{
   queries++;
   if(queries===1)return {ok:false,status:503};
   return {ok:true,json:async()=>manifest([clip('special:inkjet','spin','jet.mp3')])};
 };
 a._realS3Loader.bank.authorized.fetcher=async()=>res;
 const first=a.loopWeapon('special:inkjet','spin',{volume:.2});
 assert.ok(first.playing,'the pending loop should not register twice');
 await a._realS3Loader.ensure('special:inkjet','spin');await new Promise(r=>setImmediate(r));
 assert.equal(first.playing,false,'a failed load must allow the active special to retry');
 assert.equal(sources.length,0,'failed load may not fire a synthetic sound');
 a._realS3Loader.manifestRetryAt=Date.now()-1;
 const second=a.loopWeapon('special:inkjet','spin',{volume:.2});
 await a._realS3Loader.ensure('special:inkjet','spin');await new Promise(r=>setImmediate(r));
 assert.equal(second.playing,true,'recovered manifest must start the actual sample');
 assert.equal(sources.length,1);
 first.stop();second.stop();assert.equal(second.playing,false);
});


test('unrecorded dualies turret variants never cause post-dodge shooting to go silent',()=>{
 const installed=manifest([clip('s3-maneuver-dual','fire_alt','union.mp3')]);
 assert.equal(installed.clips.length,1);
 for (const recipe of Object.values(AUDIO_RECIPES).filter(x=>x.family==='dualies')){
   const event=fireArticulation(recipe,{mode:'turret',hand:1});
   if(['WeaponManeuverDual','WeaponManeuverLong'].includes(recipe.sourceActor))assert.equal(event,'fire_alt');
   else assert.equal(event,'fire_left','other dualies must retain their verified normal left shot');
 }
});
