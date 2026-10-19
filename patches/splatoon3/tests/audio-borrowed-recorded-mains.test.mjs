import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { WEAPON_AUDIO, mainAudioSourceId } from '../runtime/audio/weapon-recipes.mjs';
import { BORROWED_RECORDED_MAIN, borrowedRecordedMainId, isBorrowedRecordedMain } from '../runtime/audio/borrowed-recorded-mains.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';

const installed=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
const recordedBase=new Set(installed.clips.filter(c=>c.event==='fire'&&!c.id.includes(':')).map(c=>c.id));

function clock() {
 const sources=[];let decoded=0;
 const ctx={
  sampleRate:48000,currentTime:10,state:'running',
  createBuffer(ch,n,sr){
   const rows=Array.from({length:ch},()=>new Float32Array(n));
   return {sampleRate:sr,numberOfChannels:ch,length:n,duration:n/sr,getChannelData:i=>rows[i]};
  },
  async decodeAudioData(){decoded++;return ctx.createBuffer(1,4800,48000);},
  createBufferSource(){
   const voice={connect(){},start(){},buffer:null,loop:false,playbackRate:{value:1,setTargetAtTime(q){this.value=q;}}};
   sources.push(voice);return voice;
  },
  createGain(){return {gain:{value:1},connect(){}};}
 };
 return {ctx,sources,decodeCount:()=>decoded};
}
class Mixer {
 constructor(ctx){this.ctx=ctx;this.byName=new Map();this.played=[];}
 init(){return this;}
 _def(){return null;}
 play(name,opts){
  const d=this._def(name);if(!d)return null;
  const v={ctx:this.ctx,t:this.ctx.currentTime,out:{},nodes:[],srcs:[],end:0,endless:false};
  if(d.build)d.build(v,opts?.pitch??1,opts);
  else if(d.loop)d.loop(v,opts?.pitch??1,opts);
  this.played.push({name,voice:v,definition:d});return d;
 }
 loop(name,o){return this.play(name,o)?{playing:true,stop(){this.playing=false},set(){}}:null;}
 stats(){return{played:this.played.length};}
 stopAll(){}
}
installWeaponAudioEngine(Mixer);

test('exactly the 11 later missing 2022 MAIN recordings borrow an existing same-family verified MP3',()=>{
 const missing=MAIN_WEAPON_CATALOG.records.filter(r=>!recordedBase.has(r.id));
 assert.equal(missing.length,11,'missing source set has a reproducible catalog definition');
 assert.deepEqual(Object.keys(BORROWED_RECORDED_MAIN).sort(),missing.map(r=>r.id).sort());
 for(const target of missing){
  const source=borrowedRecordedMainId(target.id);
  assert.equal(isBorrowedRecordedMain(target.id),true,target.id);
  assert.ok(recordedBase.has(source),target.id+' points only to existing 2022 file');
  assert.equal(WEAPON_AUDIO[target.id].family,WEAPON_AUDIO[source].family,
    target.id+' does not borrow another weapon family');
  const clip=installed.clips.find(c=>c.id===source&&c.event==='fire');
  const bytes=fs.readFileSync(new URL('../runtime/audio/'+clip.file,import.meta.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),clip.sha256,
    target.id+' points at an authentic, SHA-verified repository MP3');
 }
 for(const record of MAIN_WEAPON_CATALOG.records.filter(r=>recordedBase.has(r.id))){
  assert.equal(borrowedRecordedMainId(record.id),record.id,
    record.id+' must keep its own correct source recording');
 }
 for(const kit of ALTERNATE_WEAPON_KITS){
  assert.equal(mainAudioSourceId(kit.id),kit.baseId,'gameplay kit identity unchanged');
  if(isBorrowedRecordedMain(kit.baseId))
   assert.equal(borrowedRecordedMainId(mainAudioSourceId(kit.id)),BORROWED_RECORDED_MAIN[kit.baseId]);
 }
});

test('all eleven unsourced mains and variants only emit their already-decoded original family MP3',async()=>{
 const {ctx,sources,decodeCount}=clock(),audio=new Mixer(ctx),bank=audio.weaponBank();
 const owners=Object.entries(BORROWED_RECORDED_MAIN);
 const sample=owners.map(([target,source])=>{
  const row=installed.clips.find(c=>c.id===source&&c.event==='fire');
  assert.ok(row,target+' recording');
  return {id:source,event:'fire',file:row.file,variant:0};
 });
 const manifest={schema:1,usageRights:'Local authorized regression fixture, no external downloads',clips:sample};
 const buf={ok:true,headers:{get(){return null;}},arrayBuffer:async()=>new ArrayBuffer(64)};
 audio._realS3Loader.fetcher=async()=>({ok:true,json:async()=>manifest});
 bank.authorized.fetcher=async()=>buf;
 const variants=ALTERNATE_WEAPON_KITS.filter(k=>isBorrowedRecordedMain(k.baseId));
 for(const [target,source] of owners){
   // START may complete only after the real downloaded family recording is resident.
   const result=await audio.requireRecordedMainShot(target);
   assert.deepEqual(result,{ready:true,id:source,recording:'fire'});
   const recorded=bank.authorized.pick(source,'fire')?.buffer;
   assert.ok(recorded,'decoded source exists '+source);
   assert.equal(audio.playWeapon(target,'fire',{actor:{isLocal:true}})?.weaponId,source);
   assert.equal(sources.at(-1).buffer,recorded,'original source buffer is played');
   const kit=variants.find(k=>k.baseId===target);
   if(kit){
     assert.equal(audio.playWeapon(kit.id,'fire',{actor:{isLocal:true}})?.weaponId,source);
     assert.equal(sources.at(-1).buffer,recorded,'alternate shares original source');
   }
   assert.equal(bank.cache.size,0,'no synthesized PCM created for '+target);
 }
 assert.equal(audio.stats().authoredFallbackShots,0);
 assert.equal(decodeCount(),owners.length,'one decoder call per source, not per shot');
 const count=decodeCount();
 for(const [target] of owners)audio.playWeapon(target,'fire',{actor:{isLocal:true}});
 assert.equal(decodeCount(),count,'shots reuse the same decoded recording');
 audio.disposeWeaponAudio();
});

test('missing borrowed original fails safely instead of inventing gunshot',async()=>{
 const {ctx,sources}=clock(),audio=new Mixer(ctx),bank=audio.weaponBank();
 audio._realS3Loader.fetcher=async()=>({ok:true,json:async()=>({
  schema:1,usageRights:'Local fixture with absent R-PEN source',clips:[]
 })});
 bank.authorized.fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(60)});
 await assert.rejects(audio.requireRecordedMainShot('s3-charger-pencil'),/代用する2022年実録MP3/);
 assert.equal(audio.playWeapon('s3-charger-pencil','fire',{actor:{isLocal:true}}),null);
 assert.equal(audio._def('main:s3-charger-pencil:fire'),null);
 assert.equal(audio.stats().authoredFallbackShots,0);
 assert.equal(bank.cache.size,0);
 assert.equal(sources.length,0);
 audio.disposeWeaponAudio();
});
