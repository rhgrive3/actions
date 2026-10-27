import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chargerRiseBuffer, playChargerRise, prewarmChargerRise, disposeChargerRise,
  usesSplatChargerRise, usesChargerRise, RECORDED_CHARGER_FIRST
} from '../runtime/audio/charger-charge-rise.mjs';
import { stretchChargerPCM } from '../runtime/audio/pitch-preserving-charge.mjs';
import { WEAPON_AUDIO } from '../runtime/audio/weapon-recipes.mjs';
import { VARIANT_BASE_WEAPON } from '../runtime/alternate-weapon-kits-data.mjs';

const SR=44100;
function mock() {
  const frames=Math.round(1.82857*SR),pcm=new Float32Array(frames),played=[];
  for(let k=0;k<frames;k++) pcm[k]=.4*Math.sin(k*2*Math.PI*440/SR);
  const decoded={
    duration:frames/SR,sampleRate:SR,length:frames,numberOfChannels:1,
    getChannelData(){return pcm;}
  };
  const ctx={
    sampleRate:SR,state:'running',currentTime:2,
    decodeAudioData:async()=>decoded,
    createBuffer(channels,length,sampleRate){
      assert.equal(sampleRate,SR);
      const arr=Array.from({length:channels},()=>new Float32Array(length));
      return{sampleRate,length,duration:length/sampleRate,numberOfChannels:channels,
        getChannelData(i){return arr[i];}};
    },
    createGain(){
      return{gain:{value:0,setValueAtTime(v){this.value=v;},
        linearRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}},
        connect(){},disconnect(){}};
    },
    createBufferSource(){
      const source={buffer:null,loop:true,playbackRate:{value:0},connect(){},disconnect(){},
        start(when,offset,span){this.started={when,offset,span};},
        stop(t){this.stopped=t;}};
      played.push(source);return source;
    }
  };
  return {ctx,decoded,pcm,played,audio:{ctx,sfxIn:{connect(){}}},fetcher:async()=>({
    ok:true,arrayBuffer:async()=>new ArrayBuffer(36571)
  })};
}
class FakeWorker {
  constructor(){this.terminated=false;this.calls=0;}
  postMessage(m){
    this.calls++;
    queueMicrotask(()=>{
      if(this.terminated)return;
      let samples;
      try{samples=stretchChargerPCM(m.samples,m.sampleRate,m.ratio);}
      catch{samples=null;}
      this.onmessage?.({data:{key:m.key,serial:m.serial,samples}});
    });
  }
  terminate(){this.terminated=true;}
}
const fundamental=x=>{
  let first=-1,last=-1,crossings=0;
  const a=Math.round(x.length*.17),b=Math.round(x.length*.83);
  for(let i=a+1;i<b;i++)if(x[i-1]<=0&&x[i]>0){
    if(first<0)first=i;last=i;crossings++;
  }
  return (crossings-1)*SR/(last-first);
};

test('Splat phrase is the shared recorded source for every Charger and kit skin only',()=>{
  const chargers=Object.values(WEAPON_AUDIO).filter(r=>r.family==='charger');
  assert.ok(chargers.length>=8);
  for(const {id} of chargers)assert.equal(usesChargerRise(id),true,id);
  for(const [kit,base] of Object.entries(VARIANT_BASE_WEAPON))
    if(chargers.some(c=>c.id===base))assert.equal(usesChargerRise(kit),true,kit);
  assert.equal(usesChargerRise('shooter'),false);
  assert.equal(usesChargerRise('s3-stringer-normal'),false);
  assert.equal(usesSplatChargerRise('charger'),true);
  assert.equal(usesSplatChargerRise('s3-charger-long'),false);
  assert.equal(RECORDED_CHARGER_FIRST.playSeconds,1.215);
});

test('one decoded Splat Charger recording becomes distinct pitch-preserved timing for all Charger types',async()=>{
  const s=mock();await chargerRiseBuffer(s.ctx,{fetcher:s.fetcher});
  const workers=[];
  const workerFactory=()=>{const w=new FakeWorker();workers.push(w);return w;};
  const sampleBefore=s.pcm.slice(),source=s.decoded;
  const cases=[
    ['s3-charger-light',20/60], // Bamboo
    ['s3-charger-quick',45/60], // Squiffer
    ['s3-charger-long',92/60], // E-liter
    ['s3-charger-keeper',71/60], // Goo Tuber
    ['s3-charger-pencil',72/60], // R-PEN
  ];
  for(const [weaponId,chargeTime] of cases){
    assert.equal(await prewarmChargerRise(s.audio,{weaponId,chargeTime,workerFactory}),true);
    await Promise.resolve();
    const handle=playChargerRise(s.audio,{weaponId,chargeTime,volume:.5});
    assert.ok(handle?.playing,weaponId);
    const src=s.played.at(-1);
    assert.equal(src.playbackRate.value,1,weaponId+' stays 1x');
    assert.equal(src.started.offset,0,weaponId+' uses the 1.215s excerpt');
    assert.notEqual(src.buffer,source,weaponId+' uses cached WSOLA of common source');
    assert.ok(Math.abs(src.started.span-1.215*chargeTime)<.0015,weaponId+' duration');
    assert.ok(Math.abs(fundamental(src.buffer.getChannelData(0))-440)<9,weaponId+' no pitch shift');
    handle.stop(.02);assert.ok(src.stopped>0);
  }
  assert.deepEqual(s.pcm,sampleBefore,'no editing the original recorded sound');
  assert.equal(workers.length,1,'one off-thread worker per AudioContext');
  const h=playChargerRise(s.audio,{weaponId:'charger',chargeTime:1});
  assert.ok(h?.playing,'Splat is unchanged');
  const native=s.played.at(-1);
  assert.equal(native.buffer,source);
  assert.equal(native.started.offset,.4591);
  assert.equal(native.started.span,1.215);
  assert.equal(native.playbackRate.value,1);
  disposeChargerRise(s.ctx);
  assert.ok(workers[0].terminated,'dispose terminates pending worker');
});

test('cold Worker cache never substitutes a weapon-specific HoldNoise during charge',async()=>{
  const s=mock();
  await chargerRiseBuffer(s.ctx,{fetcher:s.fetcher});
  const h=playChargerRise(s.audio,{weaponId:'s3-charger-long',chargeTime:92/60});
  assert.ok(h?.playing);
  const started=s.played.at(-1);
  assert.equal(started.buffer,s.decoded,'fallback is the original Splat recording');
  assert.equal(started.started.offset,.4591);
  assert.equal(started.playbackRate.value,1,'even fallback never pitches up');
  disposeChargerRise(s.ctx);
  assert.equal(playChargerRise(s.audio,{weaponId:'s3-charger-quick',chargeTime:.75}),null);
});
