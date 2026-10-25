import { mainAudioSourceId } from './weapon-recipes.mjs';

// This excerpt is a Splat Charger phrase, not a family-wide charge clock.
// Other chargers use their own registered onset and gameplay-owned ready edge.
export function usesSplatChargerRise(id) {
  const source = mainAudioSourceId(id);
  return source === 'charger' || source === 's3-charger-normalscope';
}

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
const recordedChargerURL=sourceUrl=>{
  if(sourceUrl)return sourceUrl;
  // vm.SourceTextModule test fixtures may have no import.meta.url. Never resolve
  // an external asset at module evaluation: this is an opt-in prewarm path.
  return import.meta.url ? new URL('../../../../assets/audio/charger-first-splatune2-reference.mp3',import.meta.url).href : null;
};
const slots=new WeakMap();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const RETRY_BACKOFF_MS=4000,MAX_ATTEMPTS=3,LOAD_TIMEOUT_MS=8000;
const stateFor=ctx=>{let s=slots.get(ctx);if(!s){s={buffer:null,promise:null,error:null,retryable:false,retryAfter:0,attempts:0,generation:0,controller:null};slots.set(ctx,s);}return s;};
class ChargerLoadError extends Error {
  constructor(message,retryable=false){super(message);this.retryable=retryable;}
}
export function chargerRecordedStatus(ctx){
  const state=ctx?slots.get(ctx):null;
  return {ready:!!state?.buffer,loading:!!state?.promise,error:state?.error||null};
}
export function disposeChargerRise(ctx){
  const state=ctx?slots.get(ctx):null;
  if(!state)return;
  state.generation++;state.controller?.abort();slots.delete(ctx);
}
// Only explicit prewarm/weapon selection may retry; ordinary requests never retry.
export async function chargerRiseBuffer(ctx,{fetcher,sourceUrl,retry=false,now=Date.now,timeoutMs=LOAD_TIMEOUT_MS}={}){
  if(!ctx||ctx.state==='closed'||typeof ctx.decodeAudioData!=='function')return null;
  const state=stateFor(ctx);
  if(state.buffer)return state.buffer;
  if(state.promise)return state.promise;
  const fetchAudio=fetcher||(typeof globalThis.fetch==='function'?globalThis.fetch.bind(globalThis):null);
  const assetURL=recordedChargerURL(sourceUrl);
  if(!fetchAudio||!assetURL)return null;
  if(state.error&&(!retry||!state.retryable||state.attempts>=MAX_ATTEMPTS||now()<state.retryAfter))return null;
  const generation=++state.generation;
  state.attempts++;
  const controller=typeof AbortController==='function'?new AbortController():null;
  state.controller=controller;
  let timer;
  const operation=(async()=>{
    let response;
    try{response=await fetchAudio(assetURL,{credentials:'same-origin',cache:'force-cache',...(controller?{signal:controller.signal}:{})});}
    catch(error){throw new ChargerLoadError('recorded Charger network failure: '+String(error?.message||error),true);}
    if(state.generation!==generation||slots.get(ctx)!==state||controller?.signal.aborted||ctx.state==='closed')return null;
    if(!response?.ok){
      const status=response?.status;
      throw new ChargerLoadError('recorded Charger asset unavailable ('+(status??'network')+')',status===408||status===429||(status>=500&&status<=599));
    }
    let bytes;
    try{bytes=await response.arrayBuffer();}
    catch(error){throw new ChargerLoadError('recorded Charger response failure: '+String(error?.message||error),true);}
    if(state.generation!==generation||slots.get(ctx)!==state||controller?.signal.aborted||ctx.state==='closed')return null;
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<10000||bytes.byteLength>512*1024)
      throw new ChargerLoadError('invalid recorded Charger audio payload');
    const buffer=await ctx.decodeAudioData(bytes);
    if(!buffer||!Number.isFinite(buffer.duration)||
       buffer.duration<RECORDED_CHARGER_FIRST.minimumDecodedSeconds||
       buffer.duration>3||
       !Number.isFinite(buffer.sampleRate)||buffer.sampleRate<8000||
       buffer.numberOfChannels<1||buffer.numberOfChannels>2)
      throw new ChargerLoadError('recorded Charger audio duration/format mismatch');
    return buffer;
  })();
  state.promise=Promise.race([operation,new Promise((_,reject)=>{
    timer=setTimeout(()=>{reject(new ChargerLoadError('recorded Charger load timed out',true));controller?.abort();},timeoutMs);
  })]).then(buffer=>{
    if(state.generation!==generation||slots.get(ctx)!==state||ctx.state==='closed')return null;
    state.buffer=buffer;state.error=null;state.retryable=false;state.retryAfter=0;state.attempts=0;
    return buffer;
  }).catch(error=>{
    if(state.generation===generation&&slots.get(ctx)===state){
      state.error=String(error?.message||error);state.retryable=error instanceof ChargerLoadError&&error.retryable;
      state.retryAfter=now()+RETRY_BACKOFF_MS;
    }
    return null;
  }).finally(()=>{clearTimeout(timer);if(state.generation===generation){state.promise=null;state.controller=null;}});
  return state.promise;
}
export function playChargerRise(audio,{volume=.55,pos=null,weaponId='charger'}={}){
  if(!usesSplatChargerRise(weaponId))return null;
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
