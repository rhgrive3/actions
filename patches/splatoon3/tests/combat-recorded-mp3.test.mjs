import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { COMBAT_CUE_SOURCES, installRecordedCombatAudio, isSourceCriticalHit } from '../runtime/audio/combat-recordings.mjs';

const root=new URL('../runtime/audio/s3-real/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root));

test('six real combat MP3 assets are physically committed and SHA-256 exact',()=>{
 const keys=Object.keys(COMBAT_CUE_SOURCES);
 assert.deepEqual(keys,['ink_hit_body','s3_ink_hit_heavy','hit_marker','s3_critical_hit','splat_enemy','s3_splat_squid']);
 for(const [name,spec] of Object.entries(COMBAT_CUE_SOURCES)){
   const bytes=read(spec.file);
   assert.equal(bytes.length,spec.bytes,name+' original MP3 length');
   assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256,name+' source SHA');
   assert.equal(bytes.subarray(0,3).toString('ascii'),'ID3',name+' includes an ID3 header');
   assert.ok(bytes.includes(Buffer.from([0xff,0xfb]))||bytes.includes(Buffer.from([0xff,0xf3])),
     name+' contains an MPEG audio frame after metadata');
 }
});

test('the installed production audio routes only source-based direct Charger confirmations and splat outcomes',()=>{
 const source=[
  ['src/audio/audio.js','installRecordedCombatAudio'],
  ['src/game/weapons.js','charge:combatHit?.charge'],
  ['src/game/weapons.js',"'s3_ink_hit_heavy'"],
  ['src/main.js',"'s3_critical_hit'"],
  ['src/main.js',"'s3_splat_squid'"],
  ['patches/splatoon3/runtime/main-weapon-catalog.mjs','{charge:d.charge,direct:true}']
 ];
 for(const [rel,needle] of source){
   const root=rel.startsWith('patches/')?new URL('../../../',import.meta.url):new URL('../../../inkwave-public/',import.meta.url);
   const raw=fs.readFileSync(new URL(rel,root),'utf8');
   const built=adaptBuildSource(rel,raw);
   if(rel==='src/audio/audio.js'){
     assert.match(built,/installWeaponAudioEngine\(AudioEngine\)/);
     continue;
   }
   assert.ok(built.includes(needle),rel+' source cue wiring: '+needle);
 }
});

test('Charger hit confirmation depends on projectile charge, not on damage or kill flag',()=>{
 for(const weaponId of ['charger','s3-charger-long','s3-charger-quick']){
   assert.equal(isSourceCriticalHit({weaponId,charge:1,direct:true}),true);
   assert.equal(isSourceCriticalHit({weaponId,charge:.65,direct:true}),false);
   assert.equal(isSourceCriticalHit({weaponId,charge:1,direct:false}),false);
 }
 assert.equal(isSourceCriticalHit({weaponId:'shooter',charge:1,direct:true}),false);
 assert.equal(isSourceCriticalHit({weaponId:'charger',charge:0.9999,direct:true}),true);
 assert.equal(isSourceCriticalHit({weaponId:'charger',direct:true}),false);
});

test('Safari-style Window.fetch loads original clips once per AudioContext, never synthetic cues',async()=>{
 const oldFetch=globalThis.fetch;
 const requests=[];
 let decodes=0;
 const fake={
   state:'running',
   createBufferSource(){
     const out={buffer:null,starts:[],connect(){},start(time){this.starts.push(time);}};
     fake.sources.push(out);return out;
   },
   sources:[],
   async decodeAudioData(bytes){decodes++;return {duration:.4,bytes:bytes.byteLength};}
 };
 class Mixer{constructor(ctx){this.ctx=ctx;}
   _def(){return {synth:true};}
 }
 installRecordedCombatAudio(Mixer);
 globalThis.fetch=function(url){
   if(this!==globalThis)throw new Error('Can only call Window.fetch on instances of Window');
   const name=String(url).split('/').pop(),data=read(name);
   requests.push(name);
   return Promise.resolve({ok:true,status:200,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});
 };
 try{
   const m=new Mixer(fake);
   assert.equal(m._def('hit_marker'),null,'no synth during cold load');
   assert.equal(m._def('splat_enemy'),null,'no synth during cold load');
   const first=await m.prepareRecordedCombatCues();
   assert.equal(first.ready,true,JSON.stringify(first));
   assert.equal(first.decoded,4);
   assert.deepEqual(first.errors,[]);
   assert.equal(decodes,6);
   assert.equal(requests.length,6);
   const again=await m.prepareRecordedCombatCues();
   assert.equal(again.ready,true);
   assert.equal(decodes,6,'never re-decodes every hit');
   assert.equal(m._def('unrelated')?.synth,true);
   for(const name of Object.keys(COMBAT_CUE_SOURCES)){
     const def=m._def(name);
     assert.ok(def&&!def.synth,name+' registered source audio definition');
     const v={ctx:fake,out:{},nodes:[],srcs:[],t:1.25,end:0};
     def.build(v);
     assert.equal(v.srcs.length,1,name+' uses exactly one decoded original');
     assert.deepEqual(v.srcs[0].starts,[1.25]);
   }
   assert.equal(m.recordedCombatCueStats().loaded,6);
 }finally{globalThis.fetch=oldFetch;}
});
