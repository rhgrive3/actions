import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptWeaponAudio } from '../audio-adapter.mjs';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';
import { WeaponSoundBank, AUDIO_RECIPES, mainAudioSourceId } from '../runtime/audio/bank.mjs';
import { fireArticulation, WEAPON_AUDIO } from '../runtime/audio/weapon-recipes.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';
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

test('2022-unrecorded alternate kits keep their own source-family authored cue after negative proof',async()=>{
 const {ctx,sources}=mkctx(),audio=new MixerStub(ctx);
 audio.weaponBank();
 audio._realS3Loader.fetcher=async()=>({ok:true,json:async()=>manifest([clip('shooter','fire','recorded.mp3')])});
 audio._realS3Loader.bank.authorized.fetcher=async()=>res;
 for(const [alt,base] of [
   ['s3-shooter-quicklong-01','s3-shooter-quicklong'],
   ['s3-spinner-hypershort-01','s3-spinner-hypershort'],
   ['s3-brush-heavy-01','s3-brush-heavy']
 ]){
   assert.equal(mainAudioSourceId(alt),base);
   assert.equal(audio.playWeapon(alt,'fire',{actor:{isLocal:true}}),null,
     'unavailable manifest must not allow premature synthesis: '+alt);
 }
 await audio._realS3Loader.getManifest();
 for(const [alt,base] of [
   ['s3-shooter-quicklong-01','s3-shooter-quicklong'],
   ['s3-spinner-hypershort-01','s3-spinner-hypershort'],
   ['s3-brush-heavy-01','s3-brush-heavy']
 ]){
   assert.equal(audio._realS3Loader.declares(base,'fire'),false);
   const voice=audio.playWeapon(alt,'fire',{actor:{isLocal:true}});
   assert.equal(voice?.weaponId,base,'only the correct family recipe is eligible');
   assert.equal(audio.played.at(-1).name,`main:${base}:fire`);
 }
 assert.equal(audio.stats().authoredFallbackShots,3);
 assert.equal(sources.length,3);
 assert.ok(sources.every(x=>x.buffer),'each confirmed unrecorded alternate has an authored sample');
 audio.disposeWeaponAudio();
});

test('95 alternate main kits resolve to their original sound identity, no synthetic collab bank',()=>{
 const recorded=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
 const recordedBase=new Set(recorded.clips.filter(c=>c.event==='fire'&&!c.id.includes(':')).map(c=>c.id));
 assert.equal(ALTERNATE_WEAPON_KITS.length,95);
 assert.equal(recordedBase.size,54);
 const {ctx}=mkctx(),bank=new WeaponSoundBank(ctx,{realOnly:true,audibleShotFallback:true});
 for(const kit of ALTERNATE_WEAPON_KITS){
   assert.equal(mainAudioSourceId(kit.id),kit.baseId,kit.main);
   assert.equal(mainAudioSourceId(kit.baseId),kit.baseId);
   assert.equal(mainAudioSourceId('special:'+kit.special),'special:'+kit.special,'special remains independent');
   assert.equal(mainAudioSourceId('sub:'+kit.sub),'sub:'+kit.sub,'sub remains independent');
   assert.equal(bank.has(kit.id,'fire'),true,kit.main);
   assert.equal(bank.name(kit.id,'fire'),`main:${kit.baseId}:fire`,kit.main);
   assert.equal(bank.has(kit.id,'charge'),bank.has(kit.baseId,'charge'),kit.main);
   assert.equal(bank.has(kit.id,'explosion'),bank.has(kit.baseId,'explosion'),kit.main);
   assert.ok(WEAPON_AUDIO[kit.baseId]);
   assert.equal(WEAPON_AUDIO[kit.id],undefined,'variant must not be a separate pseudo-recipe');
   assert.equal(recorded.clips.some(c=>c.id===kit.id),false,'no duplicate MP3 required for '+kit.main);
   if(recordedBase.has(kit.baseId))
     assert.ok(recorded.clips.some(c=>c.id===kit.baseId&&c.event==='fire'),'source base exists for '+kit.main);
 }
 assert.equal(mainAudioSourceId('shooter-01'),'shooter','Tentatek Splattershot');
 assert.equal(mainAudioSourceId('s3-spinner-quick-01'),'s3-spinner-quick','Zink Mini Splatling');
 assert.equal(mainAudioSourceId('splatling-01'),'splatling','Heavy Splatling Deco');
 assert.equal(mainAudioSourceId('s3-shooter-expert-01'),'s3-shooter-expert','Forge Splattershot Pro');
 bank.dispose();
});

test('collab and original share the same decoded shooter/spinner buffers, with no fallback synthesis',async()=>{
 const {ctx,sources}=mkctx(),a=new MixerStub(ctx);
 a.weaponBank();
 const pack=manifest([clip('shooter','fire','Wp_ShooterNormal_Shot_00.mp3'),
   clip('s3-spinner-quick','fire','Wp_SpinnerQuick_Shot_00.mp3'),
   clip('s3-spinner-quick','charge','Wp_SpinnerQuick_Motor_00.mp3'),
   clip('s3-spinner-quick','spin','Wp_SpinnerQuick_MotorFire_00.mp3'),
   clip('splatling','fire','Wp_SpinnerStandard_Shot_00.mp3')]);
 a._realS3Loader.fetcher=async()=>({ok:true,json:async()=>pack});
 a._realS3Loader.bank.authorized.fetcher=async()=>res;
 const actor={isLocal:true};
 for(const variantId of ['shooter-01','shooter-02','s3-spinner-quick-01','s3-spinner-quick-02','splatling-01']){
   assert.equal(a.playWeapon(variantId,'fire',{actor}),null,'unknown/cold MP3 stays silent: '+variantId);
 }
 for(const id of ['shooter','s3-spinner-quick','splatling'])
   assert.equal((await a._realS3Loader.ensure(id,'fire')).rejected,0);
 for(const [variantId,baseId] of [['shooter-01','shooter'],['shooter-02','shooter'],
   ['s3-spinner-quick-01','s3-spinner-quick'],['s3-spinner-quick-02','s3-spinner-quick'],['splatling-01','splatling']]){
   const played=a.playWeapon(variantId,'fire',{actor});
   assert.equal(played?.weaponId,baseId);
   assert.equal(a.played.at(-1).name,`main:${baseId}:fire`);
   assert.equal(sources.at(-1).buffer,a.weaponBank().authorized.pick(baseId,'fire').buffer);
 }
 const spin=a.loopWeapon('s3-spinner-quick-01','spin',{actor,volume:.4});
 assert.ok(spin?.playing,'variant Spinner has a real, deferred motor-fire loop');
 await a._realS3Loader.ensure('s3-spinner-quick','spin');await new Promise(r=>setImmediate(r));
 assert.equal(a.played.at(-1).name,'main:s3-spinner-quick:spin');
 spin.stop();
 assert.equal(a._realS3Loader.notMapped.size,0,'no variant-only load attempt');
 assert.equal(a.stats().authoredFallbackShots,0,'every recorded kit uses MP3s');
 a.disposeWeaponAudio();
});

test('Splattershot uses its recorded ShooterNormal MP3, never the generic synth shooter',async()=>{
 const installed=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
 const originalMains=new Set(installed.clips.filter(c=>c.event==='fire'&&!c.id.includes(':')).map(c=>c.id));
 assert.equal(originalMains.size,54,'all original 2022 recorded main weapons have their own shot');
 for(const id of originalMains){
   assert.ok(AUDIO_RECIPES[id],'gameplay audio recipe must map the recorded weapon '+id);
   assert.equal(fireArticulation(AUDIO_RECIPES[id],{}),'fire','ordinary shot must choose the actual recording: '+id);
 }
 const real=installed.clips.find(c=>c.id==='shooter'&&c.event==='fire');
 assert.equal(AUDIO_RECIPES.shooter.sourceActor,'WeaponShooterNormal');
 assert.equal(real?.sourceName,'Wp_ShooterNormal_Shot_00.mp3');
 assert.match(real?.sha256||'',/^[0-9a-f]{64}$/);
 const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const compiled=adaptWeaponAudio('src/game/weapons.js',source);
 assert.ok(!compiled.includes("G.audio?.play('shoot_shooter'"),
   'legacy synthesized shooter fire must never run alongside the event listener');
 assert.ok(compiled.includes("emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });"),
   'authoritative native shot emission remains intact');
 const {ctx,sources}=mkctx(),a=new MixerStub(ctx);
 a.weaponBank();
 a._realS3Loader.fetcher=async()=>({ok:true,json:async()=>manifest([clip('shooter','fire','Wp_ShooterNormal_Shot_00.mp3')])});
 a._realS3Loader.bank.authorized.fetcher=async()=>res;
 const actor={isLocal:true};
 assert.equal(a.playWeapon('shooter','fire',{actor}),null,'cold ShooterNormal never synthesizes a counterfeit shot');
 assert.equal(a.stats().authoredFallbackShots,0);
 await a._realS3Loader.ensure('shooter','fire');
 assert.equal(a._realS3Loader.declares('shooter','fire'),true);
 assert.equal(a.playWeapon('shooter','fire',{actor})?.weaponId,'shooter');
 assert.equal(a.played.at(-1).name,'main:shooter:fire');
 assert.equal(sources.at(-1).buffer,a.weaponBank().authorized.pick('shooter','fire').buffer);
 assert.equal(a.weaponBank().cache.size,0,'no Shooter synth PCM is generated');
 assert.equal(a.stats().authoredFallbackShots,0);
 a.disposeWeaponAudio();
});

test('a declared recorded shot never uses authored PCM while decoding',async()=>{
 const {ctx,sources}=mkctx(),a=new MixerStub(ctx);
 const local={isLocal:true};
 a.weaponBank();
 a._realS3Loader.fetcher=async()=>({ok:true,json:async()=>manifest([clip(id,'fire')])});
 a._realS3Loader.bank.authorized.fetcher=async()=>res;
 // The manifest can still be loading: never pretend a recorded Nintendo MP3
 // exists by emitting INKWAVE's parametric fallback.
 assert.equal(a.playWeapon(id,'fire',{actor:local}),null);
 assert.equal(a.played.length,0);
 assert.equal(a.stats().authoredFallbackShots,0);
 assert.equal(a._realS3Loader.declares(id,'fire'),null);
 const ready=await a._realS3Loader.ensure(id,'fire');
 assert.equal(ready.loaded,1,JSON.stringify(ready));
 assert.equal(a._realS3Loader.declares(id,'fire'),true);
 assert.equal(a._realS3Loader.declares('s3-charger-pencil','fire'),false);
 assert.equal(a.playWeapon(id,'fire',{actor:local})?.weaponId,id);
 assert.equal(a.played.length,1);
 assert.equal(sources.length,1,'only the actual recorded sample may play');
 assert.equal(sources[0].buffer,a.weaponBank().authorized.pick(id,'fire').buffer);
 assert.equal(a.weaponBank().cache.size,0,'no redundant synth PCM generated for recorded weapon');
 assert.equal(a._def('ui_click').legacy,true);
 assert.equal(a.stats().realAudioSuppressed,1,'cold shot stays silent rather than counterfeit its timbre');
 a.disposeWeaponAudio();
});

test('genuinely unrecorded mains may use authored shots only after negative manifest proof',async()=>{
 const {ctx}=mkctx(),a=new MixerStub(ctx);
 a.weaponBank();
 a._realS3Loader.fetcher=async()=>({ok:true,json:async()=>manifest([clip(id,'fire')])});
 a._realS3Loader.bank.authorized.fetcher=async()=>res;
 assert.equal(a.playWeapon('s3-charger-pencil','fire_full',{actor:{isLocal:true}}),null,
   'an unknown manifest does not authorize authored substitution');
 await a._realS3Loader.getManifest();
 assert.equal(a._realS3Loader.declares('s3-charger-pencil','fire_full'),false);
 assert.equal(a.playWeapon('s3-charger-pencil','fire_full',{actor:{isLocal:true}})?.weaponId,'s3-charger-pencil');
 assert.equal(a.playWeapon('s3-charger-pencil','fire',{actor:{isLocal:false}}),null);
 assert.equal(a.playWeapon('s3-charger-long','scope'),null);
 const suspended=a.loopWeapon('s3-charger-long','charge');
 assert.equal(suspended.playing,true,'cold loops await real MP3 decoding without synthesis');
 suspended.stop();assert.equal(suspended.playing,false);
 assert.equal(a.played.length,1,'only the confirmed unrecorded local main shot may synthesize');
 assert.ok(a._def('main:s3-charger-pencil:fire_full'));
 assert.equal(a._def('main:special:inkjet:open'),null,'no synth replacement for unrecorded kits');
 assert.equal(a.weaponBank().stats().generatedOffThread,0);
 a.disposeWeaponAudio();
});

test('recorded Spinner normal shot replaces an unavailable full-charge articulation',async()=>{
 const {ctx,sources}=mkctx(),a=new MixerStub(ctx);
 a.weaponBank();
 const pack=manifest([clip('splatling','fire','standard.mp3'),clip('s3-spinner-quick','fire','mini.mp3')]);
 a._realS3Loader.fetcher=async()=>({ok:true,json:async()=>pack});
 a._realS3Loader.bank.authorized.fetcher=async()=>res;
 const local={isLocal:true};
 assert.equal(a.playWeapon('splatling','fire',{actor:local}),null,'initial Splatling shot must not synthesize');
 await a._realS3Loader.ensure('splatling','fire');
 await a._realS3Loader.ensure('s3-spinner-quick','fire');
 assert.equal(a.playWeapon('splatling','fire',{actor:local})?.weaponId,'splatling');
 const charged=fireArticulation(AUDIO_RECIPES['s3-spinner-quick'],{charge:1});
 assert.equal(charged,'fire_full','catalog full-charge requests a distinct articulation');
 assert.equal(a._realS3Loader.declares('s3-spinner-quick',charged),false);
 assert.equal(a.playWeapon('s3-spinner-quick',charged,{actor:local})?.weaponId,'s3-spinner-quick');
 assert.equal(a.played.at(-1).name,'main:s3-spinner-quick:fire');
 assert.equal(sources.at(-1).buffer,a.weaponBank().authorized.pick('s3-spinner-quick','fire').buffer);
 assert.equal(a.stats().authoredFallbackShots,0);
 a.disposeWeaponAudio();
});

test('production Splatling charge and stream use separate sourced motor events',()=>{
 const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const compiled=adaptWeaponAudio('src/game/weapons.js',source);
 assert.ok(compiled.includes("this.spinLoop = G.audio?.loopWeapon?.(a.weapon.id, 'charge'"), 'native charge loop must use recorded Motor');
 assert.ok(compiled.includes("G.audio?.loopWeapon?.(w.id, 'spin'"), 'native stream loop must use recorded MotorFire');
 assert.ok(!compiled.includes('G.audio?.play(snd,'), 'generic shot is not layered over the recording');
 const installed=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
 for(const event of ['fire','charge','spin'])assert.ok(installed.clips.some(c=>c.id==='splatling'&&c.event===event),
   'authentic 2022 Splatling source is installed: '+event);
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
