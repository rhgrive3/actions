import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_ENTRIES, REFERENCE_SOURCE, sourceCoverageSummary, sourceMeasurementFor } from '../runtime/audio/reference-profiles.mjs';
import { WEAPON_AUDIO } from '../runtime/audio/weapon-recipes.mjs';
import { renderSound, pcmMetrics } from '../runtime/audio/render.mjs';
import { AuthorizedSamplePack, validateAuthorizedManifest } from '../runtime/audio/authorized-samples.mjs';
import { WeaponSoundBank } from '../runtime/audio/bank.mjs';
const id='shooter';const allowed={schema:1,targetVersion:'11.3.0',usageRights:'Original recording, rights granted to this application',clips:[{id,event:'fire',file:'custom/splatter.wav',variant:0, gain:.8}]};
const sampleCtx={sampleRate:48000,createBuffer(_channels,len,sr){const pcm=new Float32Array(len);return {length:len,duration:len/sr,getChannelData:()=>pcm};},decodeAudioData:async()=>({duration:.23,length:11040,numberOfChannels:1,sampleRate:48000})};
test('reference provenance is explicitly Splatoon 1 era, not S3 11.3.0 certification',()=>{
 assert.match(REFERENCE_SOURCE.gameLineage,/Splatoon 1/);
 assert.equal(Object.keys(REFERENCE_ENTRIES).length,29);
 const rows=sourceCoverageSummary(WEAPON_AUDIO);assert.equal(rows.length,29);
 assert.equal(new Set(rows.map(x=>x.id)).size,19);
 for(const entry of Object.values(REFERENCE_ENTRIES)){
  assert.match(entry.sha,/^[a-f\d]{40}$/);assert.equal(entry.env.length,20);assert.equal(entry.seq.length,4);
  for(const band of entry.seq)if(band)assert.equal(band.length,7);
  assert.match(entry.url,/github.com\/zerokizo\/splatoonsweps/);
 }
 assert.equal(sourceMeasurementFor(WEAPON_AUDIO['s3-shooter-gravity'],'fire').ms,787);
 assert.equal(sourceMeasurementFor(WEAPON_AUDIO['s3-maneuver-normal'],'fire'),null);
 assert.notEqual(sourceMeasurementFor(WEAPON_AUDIO.slosher,'fire',0).sha,sourceMeasurementFor(WEAPON_AUDIO.slosher,'fire',1).sha);
 assert.equal(sourceMeasurementFor(WEAPON_AUDIO['s3-spinner-quick'],'ready').ms,133);
});
test('reference-guided PCM renders finite, distinct, non-silent articulations without embedding WAV bytes',()=>{
 const a=WEAPON_AUDIO['s3-shooter-gravity'],b=WEAPON_AUDIO.shooter,c=WEAPON_AUDIO['splatling'];
 for(const [r,e] of [[a,'fire'],[b,'fire'],[c,'ready']]){
  const pcm=renderSound(r,e,0,48000),m=pcmMetrics(pcm,48000);
  assert.ok(m.peak>.05&&m.peak<=.761);assert.ok(Math.abs(m.dc)<.02);
  assert.equal(Number.isFinite(m.rmsDbFS),true);
 }
 assert.notDeepEqual([...renderSound(a,'fire',0,16000).subarray(0,80)],[...renderSound(b,'fire',0,16000).subarray(0,80)]);
});
test('only validated, licensed and path-safe manifest entries are accepted',()=>{
 assert.equal(validateAuthorizedManifest(allowed).length,1);
 for(const bad of [
   {...allowed,usageRights:''},
   {...allowed,clips:[{id,event:'fire',file:'../outside.wav'}]},
   {...allowed,clips:[{id,event:'fire',file:'https://example.com/a.wav'}]},
   {...allowed,clips:[{id,event:'explode',file:'a.wav'}]},
   {...allowed,clips:[{id,event:'fire',file:'a.wav',gain:300}]},
   {...allowed,clips:[{id,event:'fire',file:'a.wav',loopStart:2,loopEnd:1}]},
   {...allowed,clips:[{id,event:'fire',file:'a.wav',variant:2},{id,event:'fire',file:'b.wav',variant:2}]}
 ])assert.throws(()=>validateAuthorizedManifest(bad));
});
test('licensed sample pack decodes, caches, honors event+variants, preserves fallback',async()=>{
 const requested=[];
 const pack=new AuthorizedSamplePack(sampleCtx,{fetcher:async url=>{requested.push(url);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(100)};}});
 const result=await pack.load(allowed,{baseURL:'./user-sfx'});
 assert.equal(result.loaded,1);assert.equal(result.rejected,0);assert.equal(requested[0],'./user-sfx/custom/splatter.wav');
 assert.equal(pack.pick(id,'fire',0)?.gain,.8);
 assert.equal(pack.pick('roller','fire',0),null);
 assert.equal(pack.stats().clips,1);
 pack.clear();assert.equal(pack.stats().clips,0);
});
test('loaded user sound is preferred in the actual Bank buffer-source signal path',async()=>{
 const nodes=[];
 const ctx={...sampleCtx,createBufferSource(){const src={loop:false,buffer:null,playbackRate:{value:1,setTargetAtTime(){}},connect(dest){this.to=dest;},start(t,offset){this.started=[t,offset]}};nodes.push(src);return src;},createGain(){return{gain:{value:1},connect(){}}}};
 const bank=new WeaponSoundBank(ctx);
 bank.authorized.fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(100)});
 await bank.authorized.load(allowed,{baseURL:'.'});
 const def=bank.resolve('main:shooter:fire');assert.ok(def);
 const v={ctx,out:{},t:5,nodes:[],srcs:[],end:0,endless:false};def.build(v,1);
 assert.equal(nodes.length,1);assert.equal(nodes[0].buffer.duration,.23);
 assert.equal(nodes[0].started[0],5);assert.equal(bank.misses,0);
 assert.equal(bank.authorized.pick('roller','fire',0),null);
 bank.dispose();
});
test('unauthorized pack failures keep synthesized audio ready and never install partial unsafe clips',async()=>{
 const ctx={...sampleCtx,decodeAudioData:async()=>{throw new Error('bad decoder')}};
 const bank=new WeaponSoundBank(ctx);bank.authorized.fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(100)});
 const result=await bank.authorized.load(allowed);assert.equal(result.loaded,0);assert.equal(result.rejected,1);
 const m=bank.get(id,'fire',0);assert.ok(m.length>100);
 bank.dispose();
});
