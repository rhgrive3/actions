import test from 'node:test';
import assert from 'node:assert/strict';
import { playProgressCharge } from '../runtime/audio/progress-charge-playback.mjs';

// Reported: Squiffer and other Charger rises carried a rough "noise". The
// playback rate used to be dp/dt of every update, so AudioContext render
// quanta (128 samples) and 0/1 sim ticks per render frame warbled the pitch
// and chopped the gain. The recorded rise must instead play at one steady
// nominal rate while the charge advances normally.
function audioParam(value=0){return {value,calls:[],cancelScheduledValues(){},setValueAtTime(v){this.value=v;this.calls.push(v);},linearRampToValueAtTime(v){this.value=v;this.calls.push(v);}};}
function pcm(seconds,rate=48000){const n=Math.round(seconds*rate),d=new Float32Array(n);return {sampleRate:rate,length:n,duration:seconds,numberOfChannels:1,getChannelData:()=>d};}
function context(){
  const sources=[],gains=[];
  const ctx={state:'running',sampleRate:48000,currentTime:0,
    createBufferSource(){const s={playbackRate:audioParam(1),connect(){},disconnect(){},start(){},stop(){}};sources.push(s);return s;},
    createGain(){const g={gain:audioParam(),connect(){},disconnect(){}};gains.push(g);return g;}};
  return {ctx,sources,gains};
}
const quantum=t=>Math.floor(t*48000/128)*128/48000;

for(const [label,display,ticksPerFrame] of [['60Hz quantized clock',60,()=>1],['120Hz display with 0/1 sim ticks',120,i=>i%2],['30Hz display with 2 sim ticks',30,()=>2]]){
  test(`stretched Charger rise keeps a steady 1x rate and constant gain: ${label}`,()=>{
    const chargeTime=.75,{ctx,sources,gains}=context();
    // Stretched phrase: body == chargeTime (length = 1.215 * ratio).
    const h=playProgressCharge({ctx,sfxIn:{}},pcm(1),{offset:0,length:1.215*chargeTime,chargeTime,progress:0,volume:.55});
    let ticks=0,minRate=Infinity,maxRate=0,minGain=Infinity;
    for(let i=1;ticks<Math.round(chargeTime*60)-2;i++){
      ticks+=ticksPerFrame(i);ctx.currentTime=quantum(i/display);
      h.set({progress:ticks/(chargeTime*60)});
      if(ctx.currentTime>.1){const r=sources[0].playbackRate.value;minRate=Math.min(minRate,r);maxRate=Math.max(maxRate,r);minGain=Math.min(minGain,gains[0].gain.value);}
    }
    assert.equal(sources.length,1);
    assert.ok(minRate>=.9&&maxRate<=1.06,`rate stays near 1x (${minRate}..${maxRate})`);
    assert.ok(sources[0].playbackRate.calls.length<=6,`no per-frame rate automation (${sources[0].playbackRate.calls.length})`);
    assert.equal(minGain,.55,'gain never chops to silence while charging');
    h.stop();
  });
}
