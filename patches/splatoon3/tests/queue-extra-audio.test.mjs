import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
import {chargerRiseBuffer,disposeChargerRise} from '../runtime/audio/charger-charge-rise.mjs';
import {installWeaponAudioEngine} from '../runtime/audio/engine.mjs';
const bytes=()=>Uint8Array.from({length:128},(_,i)=>i).buffer;
const sha=createHash('sha256').update(Buffer.from(bytes())).digest('hex');
const manifest=clips=>({schema:1,usageRights:'Controlled generated unit-test fixture',clips});
const clip=(variant,hash=sha)=>({id:'shooter',event:'fire',file:'shared.mp3',variant,sha256:hash});
for(const concurrency of [1,2,3,4])test('uniform signed source transfers once after SHA-256, including mixed-case declarations: '+concurrency,async()=>{
 const fetched=[],inputs=[];
 const ctx={state:'running',async decodeAudioData(input){inputs.push(input);assert.deepEqual(new Uint8Array(input),new Uint8Array(bytes()));structuredClone(input,{transfer:[input]});return {duration:.1,length:800,numberOfChannels:1,sampleRate:8000};}};
 const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>{const b=bytes();fetched.push(b);return{ok:true,headers:{get:()=>null},arrayBuffer:async()=>b};}});
 const result=await pack.load(manifest([clip(0),clip(1,sha.toUpperCase()),clip(2)]),{concurrency});
 assert.equal(result.loaded,3);assert.equal(result.rejected,0);assert.equal(fetched.length,1);assert.equal(inputs.length,1);assert.equal(inputs[0],fetched[0]);assert.equal(fetched[0].byteLength,0);
 assert.equal(pack.pick('shooter','fire',0).buffer,pack.pick('shooter','fire',1).buffer);
});
test('Charger decoder takes exact response ownership and cached callers do not decode again',async()=>{
 const original=Uint8Array.from({length:20000},(_,i)=>i%251).buffer;let calls=0;
 const buffer={duration:2,sampleRate:44100,numberOfChannels:1};
 const ctx={state:'running',async decodeAudioData(input){calls++;assert.equal(input,original);assert.equal(new Uint8Array(input)[19999],19999%251);structuredClone(input,{transfer:[input]});return buffer;}};
 const fetcher=async()=>({ok:true,arrayBuffer:async()=>original});
 assert.equal(await chargerRiseBuffer(ctx,{fetcher}),buffer);assert.equal(original.byteLength,0);assert.equal(await chargerRiseBuffer(ctx,{fetcher}),buffer);assert.equal(calls,1);disposeChargerRise(ctx);
});
class Mixer{
 constructor(){this.ctx={state:'running',sampleRate:8000};this.byName=new Map();this.played=[];this.loops=[];}
 _def(){} init(){return this;} stats(){return{};} stopAll(){}
 play(name,options){const row={name,options};this.played.push(row);return row;}
 loop(name,options){const h={name,options,playing:true,updates:[],set(update){this.updates.push(update);},stop(){this.playing=false;}};this.loops.push(h);return h;}
}
installWeaponAudioEngine(Mixer);
test('known-absent requested events preserve base recording, telemetry and unknown-manifest retries',()=>{
 const audio=new Mixer(),bank=audio.weaponBank();bank.authorized.byEvent.set('splatling:fire',[{}]);
 const loader=audio._realS3Loader;let calls=0;loader.ensure=()=>{calls++;return Promise.resolve({});};loader.declares=()=>false;
 for(let i=0;i<10000;i++)assert.equal(audio.playWeapon('splatling','fire_full',{volume:.6}).name,'main:splatling:fire');
 assert.equal(calls,0);assert.deepEqual([...loader.notMapped],['splatling:fire_full']);
 assert.equal(audio.played.length,10000);assert.equal(audio.played[0].options.volume,.6);assert.equal(audio.played[0].options.priority,64);
 loader.declares=()=>null;audio.playWeapon('splatling','fire_full');assert.equal(calls,1);
 audio.disposeWeaponAudio();
});
test('deferred loop snapshots options only before resolution; actual handle receives every live update',async()=>{
 const audio=new Mixer(),bank=audio.weaponBank();let resolve;audio._realS3Loader.ensure=()=>new Promise(r=>resolve=r);
 let enumerations=0;const update=new Proxy({volume:.3},{ownKeys(target){enumerations++;return Reflect.ownKeys(target);}});
 const h=audio.loopWeapon('splatling','spin',{volume:.2});h.set(update);assert.equal(enumerations,1);
 bank.authorized.byEvent.set('splatling:spin',[{}]);resolve({});await Promise.resolve();assert.equal(audio.loops.length,1);assert.equal(audio.loops[0].options.volume,.3);
 enumerations=0;for(let i=0;i<10000;i++)h.set(update);assert.equal(enumerations,0);assert.equal(audio.loops[0].updates.length,10000);
 h.stop();h.set(update);assert.equal(audio.loops[0].updates.length,10000);audio.disposeWeaponAudio();
});
for(const indexed of [false,true])test('cross-filename verified PCM shares by checksum and exact loop semantics, indexed='+indexed,async()=>{
 let fetches=0,decodes=0;const ctx={state:'running',async decodeAudioData(input){decodes++;return {duration:.1,length:800,numberOfChannels:1,sampleRate:8000};}};
 const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>{fetches++;return{ok:true,headers:{get:()=>null},arrayBuffer:async()=>bytes()};}});
 assert.equal((await pack.load(manifest([{...clip(0),file:'heavy.mp3'}]))).loaded,1);
 const original=pack.pick('shooter','fire').buffer;
 const clips=Array.from({length:indexed?8:1},(_,i)=>({...clip(i+1,i%2?sha.toUpperCase():sha),file:'hunter-'+i+'.mp3'}));
 assert.equal((await pack.load(manifest(clips),{replace:false})).loaded,clips.length);
 assert.equal(fetches,1);assert.equal(decodes,1);assert.equal(pack.bytes,800*4);
 for(let i=0;i<clips.length;i++)assert.equal(pack.pick('shooter','fire',i+1).buffer,original);
 const mismatch=await pack.load(manifest([{...clip(15,'f'.repeat(64)),file:'bad.mp3'}]),{replace:false});assert.equal(mismatch.rejected,1);assert.equal(decodes,1);
 const independent=await pack.load(manifest([{...clip(14),file:'unshared.mp3',seamlessLoop:false}]),{replace:false});assert.equal(independent.loaded,1);assert.equal(decodes,2);assert.notEqual(pack.pick('shooter','fire',pack.byEvent.get('shooter:fire').length-1).buffer,original);
 pack.clear();assert.equal((await pack.load(manifest([{...clip(0),file:'hunter.mp3'}]),{replace:false})).loaded,1);assert.equal(decodes,3);
});
