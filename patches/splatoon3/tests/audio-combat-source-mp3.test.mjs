import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {WeaponSoundBank} from '../runtime/audio/bank.mjs';
import {KIT_AUDIO} from '../runtime/audio/kit-recipes.mjs';

const index=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
const installed=Object.freeze({
 hit:['HitEf_Damage_00.mp3','c4b6ac316315ee76f06392821db008334daf6f162e106347f164196ac64a85db'],
 critical_hit:['HitEf_CriticalHit_00.mp3','5366114895aca376f4780aa1123d90a7c4542bcad24a464afc374f47f28169cd'],
 splat:['Pl_DeadBubbleSplash_00.mp3','8963d67e781c415a6247e0b7725e0c8f891dd313d4a98cceadadde566797e40c'],
});

test('2022 original player feedback MP3 identities, hashes and event routes are pinned',()=>{
 assert.deepEqual([...KIT_AUDIO['fx:combat'].events],Object.keys(installed));
 const source=index.clips.filter(c=>c.id==='fx:combat');
 assert.equal(source.length,3);
 for(const [event,[filename,sha]] of Object.entries(installed)){
   const clip=source.find(c=>c.event===event);
   assert.ok(clip,filename);
   assert.equal(clip.sourceName,filename);
   assert.equal(clip.file,'s3-real/'+filename);
   assert.equal(clip.sha256,sha);
   assert.equal(clip.sourceVersion,'2022-extract');
   const bytes=fs.readFileSync(new URL('../runtime/audio/'+clip.file,import.meta.url));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);
   assert.ok(bytes.byteLength>3000&&bytes.byteLength<100000);
 }
});

test('E-liter and E-liter Scope preserve the original distinct 2022 Heavy HoldNoise instead of Charger Normal',()=>{
 for(const id of ['s3-charger-long','s3-charger-longscope']){
  const clip=index.clips.find(c=>c.id===id&&c.event==='charge');
  assert.equal(clip?.sourceName,'Wp_Charger_HoldNoise_Heavy_00.mp3');
  assert.equal(clip.sha256,'bf195dee1f2ef39e02a2c5f6ae179258008e81157059e10521d1c3bc96f5d655');
  assert.ok(Math.abs(clip.durationSeconds-0.41796)<.00001);
  const source=fs.readFileSync(new URL('../runtime/audio/'+clip.file,import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),clip.sha256);
 }
 const normal=index.clips.find(c=>c.id==='charger'&&c.event==='charge');
 assert.equal(normal.sourceName,'Wp_Charger_HoldNoise_00.mp3',
   'Normal Charger remains Normal rather than inheriting Heavy sound');
});

test('fully composed game routes Charger direct hits and splats to recorded S3 feedback, never to legacy synth',()=>{
 const source=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
 const out=adaptBuildSource('src/main.js',source);
 assert.match(out,/playWeapon\?\.\('fx:combat',[^\n]*critical_hit/,'direct Charger contact has the original CriticalHit source');
 assert.match(out,/blasterHitCueKind\?\.\(attacker,weaponId\)==='direct'/,'Blaster burst keeps indirect category');
 assert.match(out,/playWeapon\?\.\('fx:combat','splat'/,'confirmed local splat uses the original Pl source');
 assert.doesNotMatch(out,/G\.audio\?\.play\('hit_marker',/,'no synthesized hit click layered over MP3');
 assert.doesNotMatch(out,/G\.audio\?\.play\('splat_enemy',/,'no synthesized kill pop layered over MP3');
});

test('combat originals can be decoded as non-synthesized events in the actual sound bank',async()=>{
 const sources=[];
 const ctx={sampleRate:48000,state:'running',currentTime:1,
  createBuffer(ch,len,sr){return {length:len,numberOfChannels:ch,sampleRate:sr,duration:len/sr,getChannelData:()=>new Float32Array(len)};},
  async decodeAudioData(){return this.createBuffer(1,4800,48000);},
  createBufferSource(){const s={connect(){},start(){},playbackRate:{value:1},buffer:null};sources.push(s);return s;},
  createGain(){return {gain:{value:1},connect(){}};}
 };
 const bank=new WeaponSoundBank(ctx,{realOnly:true,audibleShotFallback:true});
 assert.equal(bank.has('fx:combat','critical_hit'),true);
 assert.equal(bank.resolve('main:fx:combat:critical_hit'),null,'no fake critical sample before decode');
 assert.throws(()=>bank.get('fx:combat','critical_hit'),/Procedural weapon audio disabled/);
 const map=new Map(index.clips.filter(c=>c.id==='fx:combat').map(c=>[c.file,
  fs.readFileSync(new URL('../runtime/audio/'+c.file,import.meta.url))]));
 bank.authorized.fetcher=async url=>{
   const name=String(url).replace(/^\.\/?/,'');
   const bytes=map.get(name);
   assert.ok(bytes,'requested only pinned combat file: '+name);
   return {ok:true,headers:{get:()=>null},arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
 };
 const clips=index.clips.filter(c=>c.id==='fx:combat');
 const r=await bank.authorized.load({...index,clips},{baseURL:'./',replace:false,concurrency:2});
 assert.equal(r.loaded,3,JSON.stringify(r.errors));
 assert.equal(r.rejected,0);
 assert.equal(bank.stats().entries,0,'no authored PCM was rendered');
 for(const name of Object.keys(installed)){
   assert.ok(bank.authorized.pick('fx:combat',name)?.buffer);
   assert.ok(bank.resolve('main:fx:combat:'+name)?.build,'decoded MP3 is playable as a native mixer voice');
 }
 bank.dispose();
});
