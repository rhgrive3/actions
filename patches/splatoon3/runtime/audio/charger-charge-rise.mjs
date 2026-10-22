/**
 * Distinct continuous Charger charge-rise timbre.
 *
 * Built from independent oscillators/noise, NOT a Nintendo sound recording
 * or a sample reconstruction. The Splatune 2 Charger SFX reference exhibits
 * a clear spectral ridge near 1017 -> 6967 Hz over ~0.91 seconds; that is
 * a measured spectral feature, NOT an inferred S3 playbackRate curve.
 *
 * Source "HoldNoise" remains a separate recorded one-shot onset. The rising
 * effect stops on release/squid/weapon cancellation and needs no UI import.
 */
const cache=new WeakMap();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const smooth=u=>{const x=clamp(u,0,1);return x*x*(3-2*x);};
export const RISE_REFERENCE=Object.freeze({
  startHz:1017,endHz:6967,referenceRiseSeconds:.91,
  // This is a design duration, not a claimed 11.3.0 audio-event length.
  defaultSeconds:1.18,
});
export function synthesizeChargerRise(ctx,requestedSeconds=RISE_REFERENCE.defaultSeconds){
  if(!ctx||typeof ctx.createBuffer!=='function')throw new TypeError('AudioContext required');
  const sr=ctx.sampleRate;
  if(!Number.isFinite(sr)||sr<16000)throw new RangeError('unsupported sound sample rate');
  const seconds=clamp(Number.isFinite(requestedSeconds)?requestedSeconds:RISE_REFERENCE.defaultSeconds,.4,2.4);
  const length=Math.ceil(seconds*sr),out=ctx.createBuffer(1,length,sr),data=out.getChannelData(0);
  const start=.065*seconds,end=.91*seconds,span=end-start;
  let phase=0,undertone=0,filteredNoise=0,seed=0x94e61cd1;
  const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)/2147483648)-1;};
  for(let i=0;i<length;i++){
    const t=i/sr,p=smooth((t-start)/span);
    const f=RISE_REFERENCE.startHz+(RISE_REFERENCE.endHz-RISE_REFERENCE.startHz)*p;
    phase+=2*Math.PI*f/sr;
    undertone+=Math.PI*f/sr;
    // A bright ascending pitched body, lower subharmonic and gentle upper
    // partials, plus low-intensity filtered airflow. Every component is new
    // procedural PCM. No source sample is embedded or replayed here.
    const white=next();
    filteredNoise+=.14*(white-filteredNoise);
    const hiss=white-filteredNoise;
    const edge=smooth((t-.075*seconds)/(.115*seconds));
    const tail=1-smooth((t-.81*seconds)/(.17*seconds));
    const amp=edge*tail*(.34+.56*p);
    const shimmer=.89+.07*Math.sin(2*Math.PI*9*t)+.04*Math.sin(2*Math.PI*17*t);
    // Omit the upper partial above Nyquist: aliased whines would betray the
    // timbre on 22.05k/24k mobile AudioContexts.
    const upper=f*2.015<sr*.47?Math.sin(phase*2.015+.8)*.021:0;
    const tone=Math.sin(phase)*.145+Math.sin(undertone+.18)*.045+upper;
    const spray=hiss*(.015+.018*p);
    data[i]=clamp(amp*shimmer*(tone+spray),-.48,.48);
  }
  // Two complete silent frames at the end prevent endpoint pop even if this
  // buffer is stopped naturally rather than through AudioBuffer.onended.
  if(length>2){data[length-2]=0;data[length-1]=0;}
  return out;
}
export function chargerRiseBuffer(ctx,seconds=RISE_REFERENCE.defaultSeconds){
  let group=cache.get(ctx);if(!group){group=new Map();cache.set(ctx,group);}
  const key=Math.round(clamp(Number.isFinite(seconds)?seconds:RISE_REFERENCE.defaultSeconds,.4,2.4)*60)/60;
  if(group.has(key))return group.get(key);
  // Bound cached waveforms to the current six typical Charger charge times.
  while(group.size>=6)group.delete(group.keys().next().value);
  const sound=synthesizeChargerRise(ctx,key);
  group.set(key,sound);return sound;
}
export function playChargerRise(audio,{duration=RISE_REFERENCE.defaultSeconds,volume=.55,pos=null}={}){
  const ctx=audio?.ctx,target=audio?.sfxIn;
  if(!ctx||!target||typeof ctx.createGain!=='function'||typeof ctx.createBufferSource!=='function')return null;
  const amount=clamp(Number(volume)||0,0,1);if(amount<=0)return null;
  const buffer=chargerRiseBuffer(ctx,duration);
  const source=ctx.createBufferSource(),gain=ctx.createGain(),now=ctx.currentTime;
  source.buffer=buffer;source.loop=false;source.playbackRate.value=1;
  const validPos=pos&&[pos.x,pos.y,pos.z].every(Number.isFinite);
  const panner=validPos&&typeof audio._panner==='function'?audio._panner(pos,3):null;
  source.connect(gain);gain.connect(panner||target);if(panner)panner.connect(target);
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(amount,now+.006);
  let stopped=false,ended=false;
  const handle={
    get playing(){return !stopped&&!ended;},
    stop(fade=.04){
      if(stopped||ended)return;
      stopped=true;const t=ctx.currentTime,d=clamp(Number(fade)||.04,.005,.15);
      gain.gain.cancelScheduledValues(t);gain.gain.setValueAtTime(gain.gain.value,t);
      gain.gain.linearRampToValueAtTime(0,t+d);
      try{source.stop(t+d);}catch{}
    }
  };
  source.onended=()=>{ended=true;try{source.disconnect();gain.disconnect();panner?.disconnect?.();}catch{}};
  source.start(now);
  return handle;
}
