import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spinnerPreload,spinnerReleaseCache,spinnerCached,spinnerCacheStats,SPINNER_CACHE_LIMIT,spinnerClipDefinition} from '../runtime/audio/spinner-charge-clips.mjs';
import {spinnerChargeAudioLoop} from '../runtime/audio/spinner-charge-control.mjs';
import {stringerChargeAudioLoop} from '../runtime/audio/stringer-charge-control.mjs';
import {installChargeAudioLifecycle,chargeFraction} from '../runtime/audio/charge-audio-lifecycle.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {fixture} from './source-fixture.mjs';
const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling'||r.family==='stringer');
const record=id=>rows.find(r=>r.id===id);
const actor=id=>({isLocal:true,alive:true,form:'kid',pos:{x:0,y:0,z:0},weaponRunner:{charge:0},
 weapon:{id,chargeTime:(record(id).parameters.WeaponParam?.ChargeFrame_Second??record(id).parameters.spl__WeaponStringerParam.ChargeParam.ChargeFrameFullCharge)/60,catalogRecord:record(id)}});
const makeBuffer=(seconds=3,sr=48000,channels=1)=>{
 const data=Array.from({length:channels},()=>Float32Array.from({length:Math.round(seconds*sr)},(_,i)=>Math.sin(i*.125)*.15));
 return {sampleRate:sr,numberOfChannels:channels,length:data[0].length,duration:seconds,getChannelData:i=>data[i]};
};
const raw=()=>({ok:true,headers:{get:()=>null},arrayBuffer:async()=>new ArrayBuffer(64)});
function source(){return {playing:true,updates:[],stops:0,set(p){this.updates.push({...p});},stop(){this.playing=false;this.stops++;}};}
class Engine{
 constructor(){this.ctx={state:'running',currentTime:0,decodeAudioData:async()=>makeBuffer()};this.voices=[];this.cues=[];}
 loop(name,o){if(this.reject)return {playing:false,set(){},stop(){}};const h=source();this.voices.push({name,o,h});return h;}
 playWeapon(id,event,o){this.cues.push({id,event,o});return {};}
 stopAll(){for(const v of this.voices)if(v.h.playing)v.h.stop();}
}
installChargeAudioLifecycle(Engine);
const load=(e,id,extra={})=>spinnerPreload(e,id,{fetcher:async()=>raw(),...extra});

test('premix never runs into the next charge stage; actual thresholds own source starts',async()=>{
 const e=new Engine(),a=actor('s3-spinner-quick');await load(e,a.weapon.id);
 const h=spinnerChargeAudioLoop(e,a.weapon.id,{actor:a},()=>source());
 assert.equal(e.voices.length,1);assert.equal(e.voices[0].o.phase,0);
 for(let n=0;n<120;n++){e.ctx.currentTime+=1/60;h.set({progress:.2});}
 assert.equal(e.voices.length,1,'a stalled first ring never starts its ready cue');
 h.set({progress:18/27});assert.equal(e.voices.length,2);assert.equal(e.voices[1].o.phase,1);
 assert.ok(Math.abs(e.voices[1].o.offset-.406061)<1e-8);
 h.set({progress:1});assert.equal(e.voices.length,3);assert.equal(e.voices[2].o.phase,2);
 assert.ok(Math.abs(e.voices[2].o.offset-.633333)<1e-8);
 for(let n=0;n<300;n++)h.set({progress:1});
 assert.equal(e.voices.length,3,'full hold never restarts either beep');
 assert.equal(e.cues.length,0,'no generic ready layered over the recorded mix');
 h.stop();assert.ok(e.voices.every(v=>!v.h.playing));
 spinnerReleaseCache(e);
});

test('partial and full charge restoration do not replay earlier premix cues',async()=>{
 for(const q of [.8,1]){
  const e=new Engine(),a=actor('s3-spinner-quick');a.weaponRunner.charge=q;await load(e,a.weapon.id);
  const h=spinnerChargeAudioLoop(e,a.weapon.id,{actor:a},()=>source());
  assert.equal(e.voices.length,1);assert.equal(e.voices[0].o.phase,q===1?2:1);
  assert.ok(e.voices[0].o.offset>(q===1?.633333:.406061));h.set({progress:q});
  assert.equal(e.cues.length,0);h.stop();spinnerReleaseCache(e);
 }
});

test('stopAll cancels a pending controller before a late decode can create a voice',async()=>{
 const e=new Engine(),a=actor('splatling');let done;
 e.ctx.decodeAudioData=()=>new Promise(resolve=>{done=()=>resolve(makeBuffer());});
 const preload=load(e,a.weapon.id);await new Promise(resolve=>setImmediate(resolve));
 const base=source(),h=spinnerChargeAudioLoop(e,a.weapon.id,{actor:a},()=>base);
 e.stopAll();assert.equal(h.playing,false);assert.equal(base.playing,false);
 done();await preload;await Promise.resolve();assert.equal(e.voices.length,0);spinnerReleaseCache(e);
});

test('disposal cancels fetch/decode ownership and cannot repopulate the released cache',async()=>{
 const e=new Engine();let done;
 e.ctx.decodeAudioData=()=>new Promise(resolve=>{done=()=>resolve(makeBuffer());});
 const pending=load(e,'splatling');await new Promise(resolve=>setImmediate(resolve));
 spinnerReleaseCache(e);done();assert.equal(await pending,null);
 assert.equal(spinnerCached(e,'splatling'),null);assert.equal(spinnerCacheStats(e).bytes,0);
});

test('decoded cache has a hard bound and rejects one oversized recording',async()=>{
 const e=new Engine();e.ctx.decodeAudioData=async()=>makeBuffer(3,192000,2);
 await assert.rejects(load(e,'splatling'),/oversized/);
 assert.equal(spinnerCacheStats(e).bytes,0);spinnerReleaseCache(e);
 const f=new Engine();f.ctx.decodeAudioData=async()=>makeBuffer(3,96000,2);
 for(const id of ['splatling','s3-spinner-quick','s3-spinner-hypershort']){
  await load(f,id);assert.ok(spinnerCacheStats(f).bytes<=SPINNER_CACHE_LIMIT);
 }
 assert.equal(spinnerCacheStats(f).entries,1);spinnerReleaseCache(f);
});

test('network-size limit and total I/O deadline fail closed without permanently pending voices',async()=>{
 const e=new Engine();let decoded=0;e.ctx.decodeAudioData=async()=>{decoded++;return makeBuffer();};
 await assert.rejects(load(e,'splatling',{fetcher:async()=>({ok:true,headers:{get:()=>999999}})}),/Invalid/);
 assert.equal(decoded,0);spinnerReleaseCache(e);
 await assert.rejects(load(e,'splatling',{fetcher:()=>new Promise(()=>{}),timeout:15}),/timed out/);
 assert.equal(spinnerCacheStats(e).pending,0);spinnerReleaseCache(e);
});

test('all three premix loop windows have continuous sample boundaries at 44.1 and 48 kHz',async()=>{
 for(const sr of [44100,48000])for(const id of ['splatling','s3-spinner-quick','s3-spinner-hypershort']){
  const e=new Engine();e.ctx.decodeAudioData=async()=>makeBuffer(3,sr);const b=await load(e,id);
  for(const phase of [0,1,2]){
   let src;const v={t:0,nodes:[],srcs:[],ctx:{createBufferSource(){src={playbackRate:{value:1,setTargetAtTime(){}},connect(){},start(){}};return src;}}};
   spinnerClipDefinition(e,id).loop(v,1,{phase});
   const lo=Math.round(src.loopStart*sr),hi=Math.round(src.loopEnd*sr);
   assert.ok(lo<hi&&hi<b.length);assert.equal(src._end,Infinity);
   assert.ok(Math.abs(b.getChannelData(0)[hi-1]-b.getChannelData(0)[lo])<1e-6,`${id}/${phase}/${sr}`);
  }
  spinnerReleaseCache(e);
 }
});

test('Stringers use distinct source mid/full clocks, one recorded loop and two recorded proxy cues',()=>{
 for(const [id,first,full] of [['s3-stringer-normal',30,72],['s3-stringer-short',12,34],['s3-stringer-explosion',40,80]]){
  const e=new Engine(),a=actor(id),base=source(),h=stringerChargeAudioLoop(e,id,{actor:a,volume:.6},()=>base);
  assert.equal(chargeFraction(a.weapon,'stringer'),first/full);
  for(let f=1;f<=full;f++){e.ctx.currentTime=f/60;h.set({progress:f/full});}
  assert.deepEqual(e.cues.map(c=>[c.id,c.event]),[['charger','ready'],['charger','ready']]);
  const count=base.updates.length;for(let i=0;i<300;i++)h.set({progress:1});
  assert.equal(base.updates.length,count,'stable local hold skips repeated automation');
  h.stop();assert.equal(base.playing,false);
 }
});

test('LACT full charge keep suppresses fresh ready cues on resurfacing',()=>{
 const e=new Engine(),a=actor('s3-stringer-short');a.weaponRunner.charge=1;
 const base=source(),h=stringerChargeAudioLoop(e,a.weapon.id,{actor:a},()=>base);
 for(let i=0;i<60;i++)h.set({progress:1});assert.equal(e.cues.length,0);
 e.stopAll();assert.equal(h.playing,false);assert.equal(base.playing,false);
});

test('missing context and mixer admission rejection are not reported as playing',async()=>{
 assert.equal(spinnerChargeAudioLoop({ctx:null},'splatling').playing,false);
 assert.equal(stringerChargeAudioLoop({ctx:null},'s3-stringer-short').playing,false);
 const e=new Engine(),a=actor('splatling');await load(e,a.weapon.id);e.reject=true;
 const h=spinnerChargeAudioLoop(e,a.weapon.id,{actor:a},()=>null);assert.equal(h.playing,false);h.stop();spinnerReleaseCache(e);
});

async function scene(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { installWeaponAudioRuntime } from './patches/splatoon3/runtime/audio/runtime.mjs';\nexport { syncCatalogSpinnerCharge } from './patches/splatoon3/runtime/audio/spinner-charge-layer.mjs';"});
 const calls=[],cues=[];
 f.G.audio={ctx:{state:'running',currentTime:0},prepareWeapon(){},duck(){},
  loopWeapon(id,event,opts){const h=source();calls.push({id,event,opts,h});return h;},
  playWeapon(id,event,opts){cues.push({id,event,opts});},play(name){cues.push({name});},
  syncSpinnerCharge(r){f.syncCatalogSpinnerCharge(this,r);},prewarmChargerChargeRise(){},playChargerChargeRise(){return null;}};
 f.installWeaponAudioRuntime(f.installedRuntime);f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 return {...f,calls,cues};
}

test('installed gameplay: all six Spinners own only one charge and one stream loop',async()=>{
 const f=await scene();
 for(const row of rows.filter(r=>r.family==='splatling')){
  f.calls.length=0;f.cues.length=0;const a=f.make(row.id);a.isLocal=true;a.form='kid';a.kidT=2;a.ink=100;a.intent.fire=true;
  f.tick(a,row.parameters.WeaponParam.ChargeFrame_Second+10);
  const charge=f.calls.filter(c=>c.event==='charge');assert.equal(charge.length,1,row.id+' duplicate charge');
  assert.ok(charge[0].h.updates.some(u=>u.progress===1),row.id+' gameplay fraction delivered');
  assert.equal(f.cues.filter(c=>c.name==='charger_full'||c.name==='splatling_ready').length,0);
  a.intent.fire=false;f.tick(a);assert.equal(f.calls.filter(c=>c.event==='spin').length,1,row.id+' duplicate stream');
  assert.equal(charge[0].h.playing,false);a.weaponRunner.reset();
 }
});

test('installed replica voices: all Stringers charge positionally and stop on squid/special/death',async()=>{
 const f=await scene();
 for(const row of rows.filter(r=>r.family==='stringer')){
  const net=Object.create(f.NetMatch.prototype);net.byNid=new Map();f.calls.length=0;
  const a=f.make(row.id);a.isLocal=false;a.remote=true;a.alive=true;a.form='kid';a._nearCamera=()=>true;a.net||={};a.net.loops||={};net.byNid.set(row.id,a);
  const r=a.weaponRunner;r.charging=true;r.charge=.7;net._voices(1/60);net._voices(1/60);
  assert.equal(f.calls.filter(c=>c.event==='charge').length,1,row.id);
  assert.ok(f.calls[0].h.updates.some(u=>u.progress===.7));
  a.specialActive={id:'storm'};net._voices(1/60);assert.equal(f.calls[0].h.playing,false);
  a.specialActive=null;a.form='squid';net._voices(1/60);assert.equal(f.calls.length,1);
  a.form='kid';net._voices(1/60);assert.equal(f.calls.length,2);
  a.alive=false;net._voices(1/60);assert.equal(f.calls[1].h.playing,false);
 }
});
