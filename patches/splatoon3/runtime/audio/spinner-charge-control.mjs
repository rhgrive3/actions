import {chargeAudioProgress} from './charge-audio-state.mjs';
import {spinnerAudioIds,spinnerUsesPremix,spinnerClipMarkers,spinnerCached,spinnerPreload} from './spinner-charge-clips.mjs';
import {QUIET_CHARGE,trackChargeHandle,prewarmChargeCue,playChargeCue,chargeFraction,chargeStage} from './charge-audio-lifecycle.mjs';
// Reuse one decoded buffer; start a source only at an actual stage boundary.
// The first/second cue is never reached by a free-running wall-clock recording.
export function spinnerChargeAudioLoop(engine,id,opts={},nativeLoop=()=>null){
  const ctx=engine?.ctx;if(!spinnerAudioIds.has(id)||!ctx||ctx.state==='closed')return QUIET_CHARGE;
  const phrase=spinnerUsesPremix(id),meta=spinnerClipMarkers(id),firstAt=chargeFraction(opts.actor?.weapon);
  let progress=chargeAudioProgress(opts.actor,Number.isFinite(opts.progress)?opts.progress:opts.actor?.weaponRunner?.charge);
  let phase=chargeStage(progress,firstAt),previous=progress,last=ctx.currentTime;
  let stopped=false,pending=false,clip=null,clipPhase=-1,native=null,retire=()=>{},position=opts.pos;
  let volume=Number.isFinite(opts.volume)?Math.max(0,opts.volume):.5;
  let first=progress+1e-6>=firstAt,full=progress>=1;
  const seconds=Math.max(.05,opts.actor?.weapon?.chargeTime||1);
  const phaseStart=s=>s===0?0:s===1?meta.first:meta.full;
  const sourceSpan=s=>s===0?meta.first:meta.full-meta.first;
  const gameSpan=s=>s===0?firstAt:1-firstAt;
  const nominal=s=>s===2?1:sourceSpan(s)/(seconds*gameSpan(s));
  let pitch=phrase?nominal(phase):.88+.32*progress,lastPitch=NaN,lastVolume=NaN;
  const update={pitch:1,volume,pos:position};
  const baseUpdate={volume,pos:position};
  const safeNative=()=>{try{return nativeLoop();}catch{return null;}};
  const valid=()=>!stopped&&engine.ctx===ctx&&ctx.state!=='closed';
  function start(resume=true){
    if(!valid()||!spinnerCached(engine,id))return;
    let offset=0;
    if(phrase){
      const lo=phase===1?firstAt:0;
      // The full-charge transient is now a separate unwarped reference cue.
      offset=phase===2?meta.full+.30:phaseStart(phase);
      if(resume)offset=phase===2?meta.full+.30:Math.max(offset+(phase===1?.035:0),offset+(progress-lo)/gameSpan(phase)*sourceSpan(phase));
    }
    const candidate=engine.loop('spinnerClip:'+id,{...opts,phase,offset,pitch,fadeIn:.006,volume:phrase?volume:volume*.52,pos:position});
    if(candidate?.playing===false||!candidate){
      candidate?.stop?.(.01);
      if(phrase&&clipPhase!==phase){clip?.stop?.(.012);clip=null;clipPhase=-1;}
      if(!native?.playing)native=safeNative();return;
    }
    clip?.stop?.(.012);clip=candidate;clipPhase=phase;lastPitch=NaN;lastVolume=NaN;
    if(phrase&&native){native.stop?.(.025);native=null;}
  }
  const handle={
    get playing(){return valid()&&(pending||clip?.playing===true||native?.playing===true);},
    get sampleReady(){return valid()&&clip?.playing===true;},
    set(next={}){
      if(!valid())return;
      if(Object.hasOwn(next,'pos'))position=next.pos;
      if(Number.isFinite(next.volume))volume=Math.max(0,next.volume);
      if(Number.isFinite(next.progress)){
        const q=chargeAudioProgress(opts.actor,next.progress),now=ctx.currentTime,dt=now-last,dp=q-previous;
        const stage=chargeStage(q,firstAt),changed=stage!==phase;
        progress=q;
        if(changed){
          const backwards=stage<phase;phase=stage;pitch=phrase?nominal(phase):.88+.32*q;
          if(phrase)start(backwards); // forward edge starts the recorded cue, never the looped tail
        }else if(!phrase)pitch=.88+.32*q;
        else if(phase===2)pitch=1;
        else if(dt>=1/240){
          if(dp>0)pitch=Math.max(.02,Math.min(4,dp*sourceSpan(phase)/(gameSpan(phase)*dt)));
          else if(opts.actor?.remote!==true)pitch=0;
        }
        // Aggregate zero-time simulation ticks rather than divide by zero.
        if(dt>=1/240||changed){last=now;previous=q;}
        const needsCue=!phrase||!clip?.playing||clipPhase!==phase;
        if(!first&&q+1e-6>=firstAt){first=true;if(needsCue&&q<1)playChargeCue(engine,opts.actor,position,volume,1);}
        if(!full&&q>=1){full=true;playChargeCue(engine,opts.actor,position,volume,2);}
      }
      const scaled=phrase?volume:volume*.52;
      // Stable full holds do not enqueue redundant AudioParam automation.
      if(clip?.playing&&(pitch!==lastPitch||scaled!==lastVolume||position)){
        update.pitch=pitch;update.volume=scaled;update.pos=position;clip.set?.(update);
        lastPitch=pitch;lastVolume=scaled;
      }
      if(native){baseUpdate.volume=volume;baseUpdate.pos=position;native.set?.(baseUpdate);}
    },
    stop(fade=.06){if(stopped)return;stopped=true;pending=false;clip?.stop?.(fade);native?.stop?.(fade);clip=native=null;retire();},
  };
  retire=trackChargeHandle(engine,handle,opts.priority??(opts.actor?.isLocal?88:64));
  if(!valid())return QUIET_CHARGE;
  prewarmChargeCue(engine);
  if(!phrase||!spinnerCached(engine,id))native=safeNative();
  if(spinnerCached(engine,id))start(progress>0);
  else{
    pending=true;
    spinnerPreload(engine,id).then(buffer=>{pending=false;if(valid()&&buffer)start(true);},()=>{pending=false;});
  }
  return handle;
}
