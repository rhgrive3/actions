import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spinnerAudioIds,spinnerClipKey,spinnerClipFull,spinnerUsesPremix} from '../runtime/audio/spinner-charge-clips.mjs';
test('all six Spinner types have a charge soundtrack',()=>{
 assert.equal(spinnerAudioIds.size,6);
 for(const id of spinnerAudioIds){assert.ok(spinnerClipKey(id));assert.ok(spinnerClipFull(id)>0);}
 assert.equal(spinnerUsesPremix('s3-spinner-hypershort'),true);
 assert.equal(spinnerUsesPremix('s3-spinner-downpour'),false);
});
test('four deployed Spinner sound clips are valid bounded MP3 files',()=>{
 for(const id of ['mini','heavy','examiner','rise']){
  const buf=fs.readFileSync(new URL('../runtime/audio/spinner-charge-clips/'+id+'.mp3',import.meta.url));
  assert.ok(buf.length>10000&&buf.length<262144,id);
  assert.equal(buf.toString('latin1',0,3),'ID3',id);
 }
});

test('MP3 fetching is shared and cached by audio context',async()=>{
 const {spinnerPreload,spinnerCached}=await import('../runtime/audio/spinner-charge-clips.mjs');
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(64)};};
 const context={state:'running',decodeAudioData:async()=>({duration:3,length:48000,numberOfChannels:1})};
 const engine={ctx:context};
 try{
  const [first,second]=await Promise.all([spinnerPreload(engine,'splatling'),spinnerPreload(engine,'splatling')]);
  assert.equal(first,second);assert.equal(calls,1);
  assert.equal(spinnerCached(engine,'splatling'),first);
 }finally{globalThis.fetch=old;}
});
test('one charge starts one premix and cancels its native fallback',async()=>{
 const {spinnerPreload}=await import('../runtime/audio/spinner-charge-clips.mjs');
 const {spinnerChargeAudioLoop}=await import('../runtime/audio/spinner-charge-control.mjs');
 const old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(64)});
 const ctx={state:'running',currentTime:0,decodeAudioData:async()=>({duration:3,length:48000,numberOfChannels:1})};
 const sounds=[],base={playing:true,stops:0,set(){},stop(){this.stops++;this.playing=false;}};
 const engine={ctx,loop(name,opts){const h={playing:true,stops:0,set(){},stop(){this.stops++;this.playing=false;}};sounds.push({name,opts,h});return h;}};
 try{
  await spinnerPreload(engine,'s3-spinner-hypershort');
  const actor={isLocal:true,weapon:{chargeTime:2,catalogRecord:{parameters:{WeaponParam:{ChargeFrame_First:60,ChargeFrame_Second:120}}}}};
  const h=spinnerChargeAudioLoop(engine,'s3-spinner-hypershort',{actor},()=>base);
  assert.equal(base.stops,0,'cached premix should not create a needless motor voice');assert.equal(sounds.length,1);
  h.set({progress:1});h.stop();h.stop();
  assert.equal(sounds[0].h.stops,1);
 }finally{globalThis.fetch=old;}
});

test('gapless browser MP3 decode preserves a smoothly looping rise sample',async()=>{
 const {spinnerPreload,spinnerClipDefinition}=await import('../runtime/audio/spinner-charge-clips.mjs');
 const old=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(64)});
 const sampleRate=48000,pcm=new Float32Array(Math.round(.489*sampleRate));
 for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(i*.13)*.17;
 const buffer={sampleRate,numberOfChannels:1,length:pcm.length,duration:pcm.length/sampleRate,
   getChannelData:()=>pcm};
 const engine={ctx:{state:'running',decodeAudioData:async()=>buffer}};
 try{
  assert.equal(await spinnerPreload(engine,'s3-spinner-hyper'),buffer);
  const def=spinnerClipDefinition(engine,'s3-spinner-hyper');
  assert.ok(def?.loop);
  let src;
  const voice={t:0,nodes:[],srcs:[],ctx:{createBufferSource(){
   src={playbackRate:{value:1,setTargetAtTime(){}},connect(){},start(){}};
   return src;
  }}};
  def.loop(voice,1,{});
  assert.equal(src._end,Infinity,'V.kill must have a stop deadline for the looping source');
  const from=Math.round(src.loopStart*sampleRate),end=Math.round(src.loopEnd*sampleRate);
  assert.ok(Math.abs(pcm[end-1]-pcm[from])<1e-3,'the loop boundary is nearly continuous');
 }finally{globalThis.fetch=old;}
});
