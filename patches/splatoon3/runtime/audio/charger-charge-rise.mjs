/**
 * Recorded Splatune 2 first-Charger phrase: start mechanical sound through
 * the first complete rising tone, stopping at the first silence.
 *
 * The recording is deliberately NOT the prior synthesis. Use the archived
 * MP3 frames in the same-origin assets/audio directory at exactly 1x speed.
 *
 * The source reference is Splatune 2, not proof of S3 11.3.0 sound identity.
 * The user supplied and explicitly selected this audio for their game.
 */
export const RECORDED_CHARGER_FIRST=Object.freeze({
  source:"Splatune 2, Disc 2, Track 31, SFX: Splat Charger",
  // Full MP3 had 24.104ms encode padding relative to aligned FLAC.
  startSeconds:.4591,
  playSeconds:1.215,
  minimumDecodedSeconds:1.75,
  nominalFrameSeconds:70*1152/44100,
});
const FILE_URL=new URL('../../../../assets/audio/charger-first-splatune2-reference.mp3',import.meta.url);
const slots=new WeakMap();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const stateFor=ctx=>{let s=slots.get(ctx);if(!s){s={buffer:null,promise:null,error:null};slots.set(ctx,s);}return s;};
export function chargerRecordedStatus(ctx){
  const state=ctx?slots.get(ctx):null;
  return {ready:!!state?.buffer,loading:!!state?.promise,error:state?.error||null};
}
export async function chargerRiseBuffer(ctx,{fetcher,sourceUrl}={}){
  if(!ctx||typeof ctx.decodeAudioData!=='function')return null;
  const state=stateFor(ctx);
  if(state.buffer)return state.buffer;
  if(state.promise)return state.promise;
  const fetchAudio=fetcher||(typeof fetch==='function'?fetch:null);
  if(!fetchAudio)return null;
  // A missing local asset fails closed; repeated weapon frames cannot spam fetch.
  if(state.error)return null;
  state.promise=(async()=>{
    const response=await fetchAudio(sourceUrl||FILE_URL.href,{credentials:'same-origin',cache:'force-cache'});
    if(!response?.ok)throw new Error('recorded Charger asset unavailable ('+(response?.status??'network')+')');
    const bytes=await response.arrayBuffer();
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<10000||bytes.byteLength>512*1024)
      throw new Error('invalid recorded Charger audio payload');
    const buffer=await ctx.decodeAudioData(bytes.slice(0));
    if(!buffer||!Number.isFinite(buffer.duration)||
       buffer.duration<RECORDED_CHARGER_FIRST.minimumDecodedSeconds||
       buffer.duration>3||
       !Number.isFinite(buffer.sampleRate)||buffer.sampleRate<8000||
       buffer.numberOfChannels<1||buffer.numberOfChannels>2)
      throw new Error('recorded Charger audio duration/format mismatch');
    state.buffer=buffer;return buffer;
  })().catch(error=>{state.error=String(error?.message||error);return null;})
    .finally(()=>{state.promise=null;});
  return state.promise;
}
export function playChargerRise(audio,{volume=.55,pos=null}={}){
  const ctx=audio?.ctx,target=audio?.sfxIn;
  const buffer=ctx?slots.get(ctx)?.buffer:null;
  if(!buffer||!target||typeof ctx.createGain!=='function'||typeof ctx.createBufferSource!=='function')return null;
  const level=clamp(Number(volume)||0,0,1);
  if(level<=0)return null;
  const now=ctx.currentTime,source=ctx.createBufferSource(),gain=ctx.createGain();
  const validPos=pos&&[pos.x,pos.y,pos.z].every(Number.isFinite);
  const panner=validPos&&typeof audio._panner==='function'?audio._panner(pos,3):null;
  const offset=RECORDED_CHARGER_FIRST.startSeconds;
  const length=Math.min(RECORDED_CHARGER_FIRST.playSeconds,buffer.duration-offset);
  if(!(length>.2))return null;
  source.buffer=buffer;source.loop=false;source.playbackRate.value=1;
  source.connect(gain);gain.connect(panner||target);if(panner)panner.connect(target);
  gain.gain.setValueAtTime(0,now);
  gain.gain.linearRampToValueAtTime(level,now+.006);
  const tail=Math.min(.025,length*.04);
  gain.gain.setValueAtTime(level,now+length-tail);
  gain.gain.linearRampToValueAtTime(0,now+length);
  let stopped=false,ended=false;
  const h={
    get playing(){return !stopped&&!ended;},
    stop(fade=.04){
      if(stopped||ended)return;
      stopped=true;
      const t=ctx.currentTime,d=clamp(Number(fade)||.04,.005,.15);
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value,t);
      gain.gain.linearRampToValueAtTime(0,t+d);
      try{source.stop(t+d);}catch{}
    }
  };
  source.onended=()=>{ended=true;try{source.disconnect();gain.disconnect();panner?.disconnect?.();}catch{}};
  source.start(now,offset,length);
  return h;
}
