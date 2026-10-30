// Charge/stream audio is presentation-only. The gameplay frame, ink and
// network state remain owned by the already-installed WeaponRunner.
import {spinnerAudioIds,spinnerUsesPremix,spinnerClipFull,spinnerCached,spinnerPreload}
  from './spinner-charge-clips.mjs';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function spinnerChargeAudioLoop(engine,id,opts={},nativeLoop=()=>null){
  if(!spinnerAudioIds.has(id))return null;
  const phrase=spinnerUsesPremix(id),ctx=engine.ctx;
  let stopped=false,clip=null,native=phrase?null:nativeLoop();
  let progress=0,previous=0,last=ctx?.currentTime??0;
  let pitch=phrase?clamp(spinnerClipFull(id)/(opts.actor?.weapon?.chargeTime||1),.25,3):.88;
  let first=false,full=false,failed=false,position=opts.pos;
  const params=opts.actor?.weapon?.catalogRecord?.parameters?.WeaponParam;
  const firstFraction=Number.isFinite(params?.ChargeFrame_First)&&
    Number.isFinite(params?.ChargeFrame_Second)&&params.ChargeFrame_Second>params.ChargeFrame_First
    ?params.ChargeFrame_First/params.ChargeFrame_Second:2/3;
  const volume=Number.isFinite(opts.volume)?opts.volume:.5;
  const start=()=>{
    if(stopped||engine.ctx!==ctx||!spinnerCached(engine,id))return;
    clip=engine.loop('spinnerClip:'+id,{
      ...opts,offset:phrase?progress*spinnerClipFull(id):0,pitch,
      volume:phrase?volume:volume*.52,
    });
  };
  if(spinnerCached(engine,id))start();
  else spinnerPreload(engine,id).then(()=>start(),e=>{
    failed=true;
    // An unusable premix falls back to the existing recorded motor.
    if(phrase&&!stopped)native=nativeLoop();
    console.warn('[spinner audio] optional charge phrase',id,e);
  });
  const cue=stage=>{
    if(phrase)return; // the offline mix already contains both beeps
    engine.play?.('splatling_ready',{
      pos:opts.actor?.isLocal?undefined:position,
      volume:stage===1?.29:.48,pitch:stage===1?.92:1.13,
      priority:91,
    });
  };
  return {
    get playing(){return !stopped&&(clip?.playing!==false||!clip||native?.playing!==false);},
    set(update={}){
      if(stopped)return;
      if(update.pos!==undefined)position=update.pos;
      if(Number.isFinite(update.progress)){
        progress=clamp(update.progress,0,1);
        const t=ctx?.currentTime??last,dt=t-last,dp=progress-previous;
        if(phrase&&dt>.004&&dp>0)pitch=clamp(dp*spinnerClipFull(id)/dt,.25,3);
        else if(!phrase)pitch=.88+.32*progress;
        previous=progress;last=t;
        if(!first&&progress+1e-6>=firstFraction){first=true;cue(1);}
        if(!full&&progress+1e-6>=1){full=true;cue(2);}
      }
      clip?.set?.({pitch,volume:phrase?(update.volume??volume):(update.volume??volume)*.52,pos:position});
      native?.set?.({volume:update.volume??volume,pos:position});
    },
    stop(fade=.06){
      if(stopped)return;stopped=true;
      clip?.stop?.(fade);native?.stop?.(fade);clip=native=null;
    },
    get sampleReady(){return !!clip?.playing&&!failed;},
  };
}
