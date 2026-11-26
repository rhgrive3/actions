import {trackChargeHandle,QUIET_CHARGE} from './charge-audio-lifecycle.mjs';
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const finitePos=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
// One source while charging, one short natural tail after an admitted full
// edge. Its read head is bounded by the gameplay-funded position. No timer
// may announce completion; a paused/empty tank cannot reach the final tail.
export function playProgressCharge(audio,buffer,{offset=0,length,chargeTime=1,progress=0,volume=.55,pos}={}) {
  const ctx=audio?.ctx,target=audio?.sfxIn;
  if(!ctx||ctx.state==='closed'||!buffer||!target||!(length>0)||!Number.isFinite(progress))return QUIET_CHARGE;
  let q=clamp(progress,0,1);if(q>=1)return QUIET_CHARGE; // retained full charge is not a new onset
  const step=1/(buffer.sampleRate||ctx.sampleRate||48000);
  const body=length/1.215,tail=length-body;
  // Read-head model. The buffer is meant to play at one steady speed: the
  // stretched phrase spans `body` seconds for a `chargeTime` charge, so the
  // nominal rate is body/chargeTime (1x once the stretch is ready). Deriving
  // the rate from each frame's dp/dt made it follow AudioContext quantum and
  // render-frame jitter (and 0/2 sim ticks per frame at high refresh or
  // accelerated simulation), which warbled the pitch and chopped the gain:
  // the reported charge "noise". The rate is now the nominal speed, scaled
  // only by a sustained (not per-frame) change of charge speed and a small,
  // slow drift correction that keeps the head comfortably behind the funded
  // end so it never wraps the guard loop or chops on a single dropped frame.
  const nominal=clamp(body/Math.max(.05,chargeTime),.02,4);
  let stopped=false,ended=false,src=null,sourceGain=null,untrack=()=>{};
  let previous=q,last=ctx.currentTime,rate=nominal,level=clamp(Number(volume)||0,0,1),position=pos;
  let appliedRate=nominal,gainTarget=0,gainSettlesAt=0;
  let head=0,headAt=ctx.currentTime,anchorQ=q,anchorAt=ctx.currentTime,progressAt=ctx.currentTime,speed=1;
  let buildingHeadroom=false,wasPaused=false;
  const headNow=now=>head+appliedRate*Math.max(0,now-headAt);
  function applyRate(next,now){
    head=headNow(now);headAt=now;
    src.playbackRate.cancelScheduledValues?.(now);
    if(src.playbackRate.setValueAtTime)src.playbackRate.setValueAtTime(next,now);
    else src.playbackRate.value=next;
    appliedRate=next;
  }
  const panner=finitePos(pos)&&typeof audio._panner==='function'?audio._panner(pos,3):null;
  if(panner)panner.connect(target);
  const valid=()=>!stopped&&!ended&&audio.ctx===ctx&&ctx.state!=='closed';
  function disconnect(source,gain){try{source.disconnect();gain.disconnect();}catch{}}
  function retire(source,gain,fade=.006){
    if(!source)return;
    const now=ctx.currentTime;
    gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);
    gain.gain.linearRampToValueAtTime(0,now+fade);
    try{source.stop(now+fade);}catch{disconnect(source,gain);}
  }
  function start(full=false){
    const now=ctx.currentTime,old=src,oldGain=sourceGain;
    const s=ctx.createBufferSource(),g=ctx.createGain();src=s;sourceGain=g;
    s.buffer=buffer;s.connect(g);g.connect(panner||target);
    const initialRate=full?1:nominal;
    rate=initialRate;
    s.playbackRate.value=initialRate;
    appliedRate=initialRate;
    const end=offset+Math.max(step*2,body*q);
    head=Math.max(offset,end-Math.min(.04*nominal,body*q));headAt=now;
    s.loop=!full;s.loopStart=Math.max(offset,end-.035);s.loopEnd=end;
    g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(q>0?level:0,now+.006);
    gainTarget=q>0?level:0;gainSettlesAt=now+.006;
    s.onended=()=>{disconnect(s,g);if(src===s){ended=true;untrack();try{panner?.disconnect?.();}catch{}}};
    if(full){
      g.gain.setValueAtTime(level,now+Math.max(.006,tail-.02));
      g.gain.linearRampToValueAtTime(0,now+tail);
      s.start(now,offset+body,tail);
    }else s.start(now,head);
    if(old)retire(old,oldGain);
  }
  const h={
    get playing(){return valid();},
    set(update={}){
      if(!valid()){h.stop(.005);return;}
      if(Number.isFinite(update.volume))level=clamp(update.volume,0,1);
      if(Object.hasOwn(update,'pos'))position=update.pos;
      const now=ctx.currentTime;
      if(finitePos(position)&&panner){
        if(panner.positionX){panner.positionX.setValueAtTime(position.x,now);panner.positionY.setValueAtTime(position.y,now);panner.positionZ.setValueAtTime(position.z,now);}
        else panner.setPosition?.(position.x,position.y,position.z);
      }
      if(!Number.isFinite(update.progress)||q>=1)return;
      const next=clamp(update.progress,0,1),dt=now-last,dp=next-previous;
      q=next;
      if(q>=1){start(true);return;}
      const end=offset+Math.max(step*2,body*q);
      src.loopStart=Math.max(offset,end-.035);src.loopEnd=end;
      if(dp>0)progressAt=now;
      if(dt>=1/240){
        if(wasPaused&&dp>0){anchorQ=previous;anchorAt=last;wasPaused=false;head=Math.max(offset,end-Math.min(.04*nominal,body*q));headAt=now;buildingHeadroom=false;speed=1;}
        // Sustained charge speed relative to the nominal clock (1 = normal,
        // ~1/3 for an airborne/empty-tank charge), measured over >=45 ms.
        // Never reset anchorAt on head catch-up so a sudden 1 -> 1/3 drop on
        // jump always completes its measurement window cleanly.
        const span=now-anchorAt;
        if(span>=.045){
          const measured=(q-anchorQ)*Math.max(.05,chargeTime)/span;
          if(measured>0)speed=Math.abs(measured-1)<.22?1:clamp(measured,.05,4);
          anchorQ=q;anchorAt=now;
        }
        // Only mute on a genuine pause/hold where progress has stopped
        // advancing for >80 ms; never chop on a single 33 ms frame hitch.
        const paused=now-progressAt>.08;
        if(paused){
          rate=0;wasPaused=true;buildingHeadroom=false;
        }else{
          // Target ~40 ms of wall-clock headroom behind the funded end.
          // Softly decelerate when approaching `end` instead of muting, and
          // keep a wide deadband so normal 30/60/120 Hz charging stays steady.
          const headroom=(end-headNow(now))/nominal;
          if(headroom<.012)buildingHeadroom=true;
          else if(headroom>=.035)buildingHeadroom=false;
          const correction=buildingHeadroom?.25:headroom>.075?clamp(1+(headroom-.04)/.5,1.02,1.06):1;
          rate=clamp(nominal*speed*correction,.02,4);
        }
        if(rate===0?appliedRate!==0:Math.abs(rate-appliedRate)>.012*Math.max(rate,appliedRate))applyRate(rate,now);
        else rate=appliedRate;
        const target=rate>0&&q>0?level:0;
        // Preserve every in-flight ramp, but do not reschedule a settled target.
        if(target!==gainTarget || now<gainSettlesAt){
          sourceGain.gain.cancelScheduledValues(now);
          sourceGain.gain.setValueAtTime(sourceGain.gain.value,now);
          sourceGain.gain.linearRampToValueAtTime(target,now+.006);
          gainTarget=target;gainSettlesAt=now+.006;
        }
        previous=q;last=now;
      }
    },
    stop(fade=.04){if(stopped||ended)return;stopped=true;retire(src,sourceGain,clamp(Number(fade)||.04,.005,.15));untrack();},
  };
  start();untrack=trackChargeHandle(audio,h,finitePos(pos)?64:88);
  return h;
}
