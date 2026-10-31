import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {CHARGE_CONFIRMATION,prepareChargeConfirmation,chargeConfirmationDefinition,disposeChargeConfirmation} from '../runtime/audio/charge-confirmation.mjs';
import {playProgressCharge} from '../runtime/audio/progress-charge-playback.mjs';
import {chargeAudioProgress} from '../runtime/audio/charge-audio-state.mjs';
import {spinnerChargeAudioLoop} from '../runtime/audio/spinner-charge-control.mjs';
import {stringerChargeAudioLoop} from '../runtime/audio/stringer-charge-control.mjs';
import {spinnerPreload,spinnerReleaseCache} from '../runtime/audio/spinner-charge-clips.mjs';
import {installChargeAudioLifecycle,playChargeCue} from '../runtime/audio/charge-audio-lifecycle.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {adaptWeaponAudio} from '../audio-adapter.mjs';
import {fixture} from './source-fixture.mjs';

function param(value=0){return {value,changes:[],setValueAtTime(v,t){this.value=v;this.changes.push([v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.changes.push([v,t]);},setTargetAtTime(v,t){this.value=v;this.changes.push([v,t]);},cancelScheduledValues(){}};}
function buffer(seconds=.15,sampleRate=48000){const data=new Float32Array(Math.round(seconds*sampleRate));return {duration:seconds,length:data.length,sampleRate,numberOfChannels:1,getChannelData(){return data;}};}
function node(){return {playing:true,updates:[],set(o){this.updates.push({...o});},stop(){this.playing=false;}};}
class Engine{
 constructor(){this.sources=[];this.voices=[];this.cues=[];this.sfxIn={};this.ctx={state:'running',sampleRate:48000,currentTime:0,
  decodeAudioData:async()=>buffer(.15),
  createBufferSource:()=>{const s={playbackRate:param(1),loop:false,connect(){},disconnect(){this.disconnected=true;},start(...a){this.startArgs=a;},stop(t){this.stopped=t;}};this.sources.push(s);return s;},
  createGain:()=>({gain:param(),connect(){},disconnect(){}})};}
 loop(name,o){const h=node();this.voices.push({name,o,h});return h;}
 play(name,o){this.cues.push({name,o});return {};}
 stopAll(){for(const v of this.voices)v.h.stop();}
}
installChargeAudioLifecycle(Engine);
const fetchCue=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8626)});
const record=id=>MAIN_WEAPON_CATALOG.records.find(r=>r.id===id);
function actor(id){const r=record(id);return {isLocal:true,ink:100,weapon:{id,chargeTime:1,catalogRecord:r},weaponRunner:{charging:true,charge:0,s3ChargeAudioProgress:0}};}

test('the common confirmation is the exact selected beep, not a ChargeKeepReady substitute',async()=>{
 const data=fs.readFileSync(new URL('../runtime/audio/charge-ready-reference.mp3',import.meta.url));
 assert.equal(data.length,8626);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),CHARGE_CONFIRMATION.sha256);
 const e=new Engine();let fetches=0;
 const [a,b]=await Promise.all([prepareChargeConfirmation(e,{fetcher:async()=>{fetches++;return fetchCue();}}),prepareChargeConfirmation(e,{fetcher:fetchCue})]);
 assert.equal(a,b);assert.equal(fetches,1);
 for(const pitch of [1,1.15,.01,3]){
  const v={ctx:e.ctx,t:1,out:{},nodes:[],srcs:[],end:0};chargeConfirmationDefinition(e).build(v,pitch);
  assert.equal(v.srcs[0].playbackRate.value,pitch===1.15?1.15:1);assert.equal(v.srcs[0].loop,false);
 }
 playChargeCue(e,{isLocal:true},null,.5,2);assert.equal(e.cues[0].name,'charge:confirmation');assert.equal(e.cues[0].o.pitch,1.15);
 disposeChargeConfirmation(e);assert.equal(chargeConfirmationDefinition(e),null);
});

test('confirmation decode has cancellation ownership and rejects invalid bodies',async()=>{
 const e=new Engine();let done;e.ctx.decodeAudioData=()=>new Promise(r=>done=r);
 const load=prepareChargeConfirmation(e,{fetcher:fetchCue});await new Promise(r=>setImmediate(r));
 disposeChargeConfirmation(e);done(buffer());assert.equal(await load,null);assert.equal(chargeConfirmationDefinition(e),null);
 await assert.rejects(prepareChargeConfirmation(e,{fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1001)})}),/length mismatch/);
});

for(const hz of [30,60,120])test(`Charger funded progress cannot reach its tail during a ${hz}Hz empty-ink stall`,()=>{
 const e=new Engine(),h=playProgressCharge(e,buffer(2),{offset:.4591,length:1.215,chargeTime:1,progress:0});
 for(let i=1;i<=hz/2;i++){e.ctx.currentTime=i/hz;h.set({progress:i/hz});}
 assert.equal(e.sources.length,1);const s=e.sources[0],cap=.4591+.5;
 assert.ok(s.loopEnd<=cap+1e-9);assert.equal(s.loop,true);
 for(let i=1;i<=hz*8;i++){e.ctx.currentTime+=1/hz;h.set({progress:.5});}
 assert.equal(e.sources.length,1,'wall time never starts a completion tail');
 assert.equal(s.playbackRate.value,0,'true pause, not an almost-silent 0.05x crawl');
 assert.ok(s.loopEnd<=cap+1e-9);
 // Exactly-funded last shot is legal even when the tank is now zero.
 for(let i=1;i<=hz/2;i++){e.ctx.currentTime+=1/hz;h.set({progress:.5+i/hz});}
 assert.equal(e.sources.length,2);assert.equal(e.sources[1].loop,false);
 assert.ok(Math.abs(e.sources[1].startArgs[1]-(.4591+1))<1e-9);
 h.set({progress:1});assert.equal(e.sources.length,2);
 e.stopAll();assert.equal(h.playing,false);assert.ok(Number.isFinite(e.sources[1].stopped));
});

test('zero ink never starts a full phrase; prior/full charge restoration never creates a new completion',()=>{
 const e=new Engine(),h=playProgressCharge(e,buffer(2),{offset:.4591,length:1.215,progress:0});
 for(let i=0;i<300;i++){e.ctx.currentTime+=1/60;h.set({progress:0});}
 assert.equal(e.sources.length,1);assert.equal(e.sources[0].playbackRate.value,0);
 h.stop();assert.equal(h.playing,false);
 const f=new Engine();assert.equal(playProgressCharge(f,buffer(2),{length:1.215,progress:1}).playing,false);assert.equal(f.sources.length,0);
});

test('all six Splatlings use one unwarped full cue, gated by funded ink rather than visual charge',async()=>{
 for(const r of MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling')){
  const e=new Engine(),a=actor(r.id);e.ctx.decodeAudioData=async()=>buffer(3);
  await spinnerPreload(e,r.id,{fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(64)})});
  const h=spinnerChargeAudioLoop(e,r.id,{actor:a},()=>node());
  // Visual animation reaches full but only 20% was funded.
  a.weaponRunner.s3ChargeAudioProgress=.2;
  for(let i=0;i<360;i++){e.ctx.currentTime+=1/60;h.set({progress:1});}
  assert.equal(e.cues.filter(c=>c.o.pitch===1.15).length,0,r.id+' false full cue');
  assert.ok(e.voices.every(v=>v.o.phase!==2),r.id+' false full premix interval');
  a.ink=0;a.weaponRunner.s3ChargeAudioProgress=1;e.ctx.currentTime+=1/60;h.set({progress:1});
  const full=e.cues.filter(c=>c.o.pitch===1.15);assert.equal(full.length,1,r.id);
  assert.equal(full[0].name,'charge:confirmation');
  for(let i=0;i<300;i++)h.set({progress:1});assert.equal(e.cues.filter(c=>c.o.pitch===1.15).length,1);
  if(['splatling','s3-spinner-quick','s3-spinner-hypershort'].includes(r.id)){
   const end=e.voices.find(v=>v.o.phase===2);assert.ok(end.o.offset>(r.id==='splatling'?1.383333:r.id==='s3-spinner-quick'?.633333:2)+.25,'skip embedded full beep');
  }
  h.stop();spinnerReleaseCache(e);
 }
});

test('Stringer visual full without paid ink is not a full-charge sound',()=>{
 for(const r of MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='stringer')){
  const e=new Engine(),a=actor(r.id),h=stringerChargeAudioLoop(e,r.id,{actor:a},()=>node());
  a.weaponRunner.s3ChargeAudioProgress=.1;h.set({progress:1});assert.equal(e.cues.length,0);
  a.ink=0;a.weaponRunner.s3ChargeAudioProgress=1;h.set({progress:1});
  assert.equal(e.cues.filter(c=>c.o.pitch===1.15).length,1);
  assert.ok(e.cues.every(c=>c.name==='charge:confirmation'));h.stop();
 }
});

test('pause is explicit to progress-controlled recordings; ordinary motor pitch clamp is unchanged',()=>{
 const source=fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8');
 const composed=adaptWeaponAudio('src/audio/audio.js',source);
 assert.ok(composed.includes('Math.max(d.progressControlled?0:0.05, +p.pitch)'));
 const remote=adaptWeaponAudio('src/net/netmatch.js',fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8'));
 assert.ok(remote.includes('progress:wr.charge'));
 assert.ok(remote.includes('a.net._chargerRise?.set?.({progress:wr.charge,pos:a.pos})'));
});

test('actual installed ink owners expose funded progress: empty, partial and exact-final-tank charge',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:adaptBuildSource});
 const selected=MAIN_WEAPON_CATALOG.records.filter(r=>['charger','splatling','stringer'].includes(r.family));
 const result=[];
 for(const row of selected){
  for(const budget of [0,.25,1]){
   const a=f.make(row.id);a.isLocal=true;a.form='kid';a.kidT=2;a.intent.fire=true;
   const total=a.weapon.inkFull;a.ink=total*budget;
   const frames=Math.ceil(a.weapon.chargeTime*60*9)+20;
   // Isolate starvation: tick the actual weapon owner with no resource refill.
   for(let n=0;n<frames;n++){f.G.time+=1/60;a.weaponRunner.update(1/60,a.intent);}
   const audible=chargeAudioProgress(a,a.weaponRunner.charge);
   assert.ok(Number.isFinite(audible)&&audible>=0&&audible<=1,row.id);
   if(budget<1)assert.ok(audible<1,row.id+' underfunded must not become ready');
   else assert.equal(audible,1,row.id+' exactly funded final tank must become ready');
   result.push({id:row.id,budget,visual:a.weaponRunner.charge,audible,ink:a.ink});a.weaponRunner.reset();
  }
 }
 assert.equal(result.length,51);
});

test('a single update crossing both boundaries emits full only, not a two-pitch chord',()=>{
 for(const id of ['s3-stringer-normal','s3-spinner-hyper']){
  const e=new Engine(),a=actor(id),base=node();
  // Avoid optional remote fetch: a failed native-independent rise never
  // creates the full cue. The actual threshold owner is tested here.
  const start=id.includes('stringer')?stringerChargeAudioLoop:spinnerChargeAudioLoop;
  const h=start(e,id,{actor:a},()=>base);
  a.weaponRunner.s3ChargeAudioProgress=1;e.ctx.currentTime=.1;h.set({progress:1});
  assert.equal(e.cues.length,1,id);assert.equal(e.cues[0].o.pitch,1.15);h.stop();
 }
});

test('same-audio-clock catch-up retires an obsolete first cue before full',()=>{
 const e=new Engine(),a={isLocal:true},kills=[];
 e.play=()=>({v:{kill:t=>kills.push(t)}});
 playChargeCue(e,a,null,.5,1);playChargeCue(e,a,null,.5,2);
 assert.equal(kills.length,1);assert.equal(kills[0],.003);
});

test('installed audio runtime receives funded Charger progress and cancels at release',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:adaptBuildSource,
  extraExports:"export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';"});
 const rises=[],cues=[];
 f.G.audio={ctx:{state:'running',currentTime:0},prepareWeapon(){},prewarmChargerChargeRise(){},
  playChargerChargeRise(o){const h=node();rises.push({o,h});return h;},
  playWeapon(id,event,o){cues.push({id,event,o});},play(){},loopWeapon(){return node();}};
 f.installWeaponAudioRuntime(f.installedRuntime);
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const id of ['charger','s3-charger-quick','s3-charger-long','s3-charger-pencil']){
  rises.length=0;cues.length=0;const a=f.make(id);a.isLocal=true;a.form='kid';a.kidT=2;a.intent.fire=true;a.ink=a.weapon.inkFull*.25;
  for(let n=0;n<600;n++){f.G.time+=1/60;f.G.audio.ctx.currentTime=f.G.time;a.weaponRunner.update(1/60,a.intent);}
  assert.equal(rises.length,1,id+' one authoritative owner');
  assert.ok(Number.isFinite(rises[0].o.progress),id+' progress-controlled start');
  assert.ok(rises[0].h.updates.length>100);
  assert.ok(rises[0].h.updates.every(u=>u.progress<1),id+' no premature full');
  assert.equal(cues.filter(c=>c.event==='ready').length,0,id+' no premature ready event');
  a.intent.fire=false;a.weaponRunner.update(1/60,a.intent);
  assert.equal(rises[0].h.playing,false,id+' release cancels source');a.weaponRunner.reset();
 }
});
