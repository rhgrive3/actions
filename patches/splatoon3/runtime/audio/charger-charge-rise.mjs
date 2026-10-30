import {playProgressCharge} from './progress-charge-playback.mjs';
import { readEncodedAudioResponse, EncodedAudioResponseError } from './encoded-response.mjs';
import { mainAudioSourceId, WEAPON_AUDIO } from './weapon-recipes.mjs';
import { PitchPreservingChargeCache, chargerOnsetRatio } from './pitch-preserving-charge.mjs';
import { audioLoadScope } from './load-deadline.mjs';

// Every Charger now uses the same Splat Charger reference rise. Different charge
// clocks stretch its ascending phrase in a Worker WITHOUT changing pitch.
// The game itself still owns when full-charge 'ready' fires.
export function usesSplatChargerRise(id) {
  const source=mainAudioSourceId(id);
  return source==='charger'||source==='s3-charger-normalscope';
}
export function usesChargerRise(id) {
  return WEAPON_AUDIO[mainAudioSourceId(id)]?.family==='charger';
}

/**
 * Recorded Splatune 2 first-Charger phrase: start mechanical sound through
 * the first complete rising tone, stopping at the first silence.
 *
 * The recording is deliberately NOT the prior synthesis. Use the archived
 * MP3 frames in the same-origin assets/audio directory. The original stays
 * unmodified at 1x for Splat Charger; derived phrases are pre-stretched by
 * WSOLA off-thread and also play at 1x to preserve pitch.
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
const stateFor=ctx=>{let s=slots.get(ctx);if(!s){s={buffer:null,excerpt:null,stretchCache:null,promise:null,error:null,retryable:false,retryAfter:0,attempts:0,generation:0,scope:null};slots.set(ctx,s);}return s;};
class ChargerLoadError extends Error {
  constructor(message,retryable=false){super(message);this.retryable=retryable;}
}
export function chargerRecordedStatus(ctx){
  const state=ctx?slots.get(ctx):null;
  return {ready:!!state?.buffer,loading:!!state?.promise,error:state?.error||null,stretched:state?.stretchCache?.stats()?.ready||0};
}
export function disposeChargerRise(ctx){
  const state=ctx?slots.get(ctx):null;
  if(!state)return;
  // Remove the old owner before callbacks triggered by abort can re-enter.
  state.generation++;slots.delete(ctx);state.scope?.cancel();state.stretchCache?.dispose();state.excerpt=null;
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
  const scope=audioLoadScope(timeoutMs,'recorded Charger load timed out');
  state.scope=scope;
  const operation=scope.run(async()=>{
    let response;
    try{response=await fetchAudio(assetURL,{credentials:'same-origin',cache:'force-cache',...(scope.signal?{signal:scope.signal}:{})});}
    catch(error){throw new ChargerLoadError('recorded Charger network failure: '+String(error?.message||error),true);}
    scope.check();
    if(state.generation!==generation||slots.get(ctx)!==state||ctx.state==='closed')return null;
    if(!response?.ok){
      const status=response?.status;
      throw new ChargerLoadError('recorded Charger asset unavailable ('+(status??'network')+')',status===408||status===429||(status>=500&&status<=599));
    }
    let bytes;
    try{bytes=await readEncodedAudioResponse(response,512*1024,{minBytes:10000,scope,label:'invalid recorded Charger audio payload'});}
    catch(error){throw new ChargerLoadError(error instanceof EncodedAudioResponseError?error.message:'recorded Charger response failure: '+String(error?.message||error),!(error instanceof EncodedAudioResponseError));}
    scope.check();
    if(state.generation!==generation||slots.get(ctx)!==state||ctx.state==='closed')return null;
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
  });
  state.promise=operation.then(buffer=>{
    if(state.generation!==generation||slots.get(ctx)!==state||ctx.state==='closed')return null;
    state.buffer=buffer;state.error=null;state.retryable=false;state.retryAfter=0;state.attempts=0;
    return buffer;
  }).catch(error=>{
    if(state.generation===generation&&slots.get(ctx)===state){
      state.error=String(error?.message||error);state.retryable=(error instanceof ChargerLoadError&&error.retryable)||state.error==='recorded Charger load timed out';
      state.retryAfter=now()+RETRY_BACKOFF_MS;
    }
    return null;
  }).finally(()=>{scope.finish();if(state.generation===generation){state.promise=null;state.scope=null;}});
  return state.promise;
}

/** Extract ONLY the 1.215s rising Splat Charger phrase from the verified MP3. */
function sourceExcerpt(ctx,state) {
  if(state.excerpt)return state.excerpt;
  const src=state.buffer,sr=src?.sampleRate;
  if(!Number.isFinite(sr)||!Number.isFinite(src?.length)||
    typeof src?.getChannelData!=='function'||typeof ctx.createBuffer!=='function')return null;
  const start=Math.round(RECORDED_CHARGER_FIRST.startSeconds*sr);
  const count=Math.round(RECORDED_CHARGER_FIRST.playSeconds*sr);
  if(start<0||count<128||start+count>src.length)return null;
  const excerpt=ctx.createBuffer(src.numberOfChannels,count,sr);
  for(let i=0;i<src.numberOfChannels;i++)
    excerpt.getChannelData(i).set(src.getChannelData(i).subarray(start,start+count));
  state.excerpt=excerpt;
  return excerpt;
}

/** Schedule bounded WSOLA once after decode; no work runs in a simulation tick. */
export async function prewarmChargerRise(audio,{weaponId='charger',chargeTime=1,
  retry=true,workerFactory}={}) {
  if(!usesChargerRise(weaponId)||!audio?.ctx)return false;
  const ctx=audio.ctx,buffer=await chargerRiseBuffer(ctx,{retry});
  const state=slots.get(ctx);
  if(!buffer||state?.buffer!==buffer||ctx.state==='closed')return false;
  const ratio=chargerOnsetRatio(chargeTime);
  if(ratio==null)return false;
  if(Math.abs(ratio-1)<.005)return true; // original Splat phrase, no conversion
  const excerpt=sourceExcerpt(ctx,state);
  if(!excerpt)return false;
  state.stretchCache||=new PitchPreservingChargeCache(ctx,{workerFactory,maxBytes:3*1024*1024});
  return state.stretchCache.prepare('splat-charger-phrase',excerpt,chargeTime);
}
export function playChargerRise(audio,{volume=.55,pos=null,weaponId='charger',chargeTime=1,progress}={}){
  if(!usesChargerRise(weaponId))return null;
  const ctx=audio?.ctx,target=audio?.sfxIn;
  const state=ctx?slots.get(ctx):null;
  const original=state?.buffer;
  if(!original||!target||typeof ctx.createGain!=='function'||typeof ctx.createBufferSource!=='function')return null;
  const level=clamp(Number(volume)||0,0,1);
  if(level<=0)return null;

  let buffer=original,offset=RECORDED_CHARGER_FIRST.startSeconds;
  let length=Math.min(RECORDED_CHARGER_FIRST.playSeconds,original.duration-offset);
  // All chargers derive from the SAME selected Splat Charger rise. A ready
  // version is instant at play time. If Worker preparation is still in flight,
  // play the original phrase at pitch 1x and prepare for the next hold.
  const ratio=chargerOnsetRatio(chargeTime);
  if(ratio!==null&&Math.abs(ratio-1)>=.005){
    const excerpt=state.excerpt;
    const ready=excerpt&&state.stretchCache?.lookup('splat-charger-phrase',excerpt,chargeTime);
    if(ready){buffer=ready;offset=0;length=ready.duration;}
    else void prewarmChargerRise(audio,{weaponId,chargeTime}).catch(()=>{});
  }
  if(!(length>.2))return null;
  if(Number.isFinite(progress))return playProgressCharge(audio,buffer,{offset,length,chargeTime,progress,volume:level,pos});
  const now=ctx.currentTime,source=ctx.createBufferSource(),gain=ctx.createGain();
  const validPos=pos&&[pos.x,pos.y,pos.z].every(Number.isFinite);
  const panner=validPos&&typeof audio._panner==='function'?audio._panner(pos,3):null;
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
