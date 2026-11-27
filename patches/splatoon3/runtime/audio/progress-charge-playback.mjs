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
  let previous=q,last=ctx.currentTime,rate=q>0?nominal:0,level=clamp(Number(volume)||0,0,1),position=pos;
  let appliedRate=q>0?nominal:0,gainTarget=0;
  let head=0,headAt=ctx.currentTime,anchorQ=q,anchorAt=ctx.currentTime,progressAt=ctx.currentTime,speed=1;
  let buildingHeadroom=false,wasPaused=false;
  const headNow=now=>{
    const raw=head+appliedRate*Math.max(0,now-headAt);
    if(src&&src.loop&&appliedRate>0&&src.loopEnd>src.loopStart&&raw>=src.loopEnd){
      const span=src.loopEnd-src.loopStart;
      return src.loopStart+((raw-src.loopStart)%span);
    }
    return raw;
  };
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
    const initialRate=full?nominal:(q>0?nominal:0);
    rate=initialRate;
    s.playbackRate.value=initialRate;
    appliedRate=initialRate;
    const end=offset+Math.max(step*2,body*q);
    head=Math.max(offset,end-Math.min(.04*nominal,body*q));headAt=now;
    s.loop=!full;s.loopStart=Math.max(offset,end-.035);s.loopEnd=end;
    s.onended=()=>{disconnect(s,g);if(src===s){ended=true;untrack();try{panner?.disconnect?.();}catch{}}};
    if(full){
      const maxTail=Number.isFinite(buffer.duration)?Math.max(0,buffer.duration-(offset+body)):tail;
      const playTail=Math.min(tail,maxTail);
      if(playTail<=0){
        g.gain.setValueAtTime(0,now);gainTarget=0;
        s.start(now,Math.min(offset+body,Number.isFinite(buffer.duration)?buffer.duration:offset+body),0);
      }else{
        const tailDur=playTail/nominal,fadeIn=Math.min(.006,tailDur*.5),holdEnd=Math.min(tailDur,Math.max(fadeIn,tailDur-.02));
        g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(level,now+fadeIn);
        g.gain.setValueAtTime(level,now+holdEnd);g.gain.linearRampToValueAtTime(0,now+tailDur);
        gainTarget=0;
        s.start(now,offset+body,playTail);
      }
    }else{
      g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(q>0?level:0,now+.006);
      gainTarget=q>0?level:0;
      s.start(now,head);
    }
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
      head=headNow(now);headAt=now;
      src.loopStart=Math.max(offset,end-.035);src.loopEnd=end;
      if(dp>0)progressAt=now;
      if(dt>=1/240){
        let resumedFromPause=false;
        if(wasPaused&&dp>0){
          anchorQ=previous;anchorAt=last;wasPaused=false;buildingHeadroom=false;speed=1;
          const targetHead=Math.max(offset,end-Math.min(.04*nominal,body*q));
          if(Math.abs(targetHead-headNow(now))>.045*nominal&&end-headNow(now)>.15*nominal){
            start(false);anchorQ=q;anchorAt=now;previous=q;last=now;return;
          }
          resumedFromPause=true;
        }
        // Sustained charge speed relative to the nominal clock (1 = normal,
        // ~1/3 for an airborne/empty-tank charge), measured over >=160 ms so
        // 30/60/120 Hz tick quantization never perturbs steady charging.
        const span=now-anchorAt;
        if(span>=.16){
          const measured=(q-anchorQ)*Math.max(.05,chargeTime)/span;
          if(measured>0)speed=Math.abs(measured-1)<.35?1:clamp(measured,.05,4);
          anchorQ=q;anchorAt=now;
        }
        // Only mute on a genuine pause/hold where progress has stopped
        // advancing for >80 ms; never chop on a single 33 ms frame hitch.
        const paused=q<=0||now-progressAt>.08;
        if(paused){
          rate=0;wasPaused=true;buildingHeadroom=false;
        }else if(resumedFromPause){
          rate=nominal;
        }else{
          // Keep pitch steady on normal charging: only apply gentle bounded
          // drift correction (never an octave-dropping 0.5x brake).
          const headroom=(end-headNow(now))/nominal;
          if(body*q<.04*nominal){
            buildingHeadroom=false;
          }else if(headroom<.004){
            buildingHeadroom=true;
          }else if(headroom>=.03){
            buildingHeadroom=false;
          }
          let correction=1;
          if(buildingHeadroom&&headroom<.03){
            correction=clamp(.94+(headroom/.03)*.06,.94,1);
          }else if(headroom>.09){
            correction=clamp(1+(headroom-.06)/.75,1.01,1.04);
          }
          rate=clamp(nominal*speed*correction,.02,4);
        }
        if(rate===0?appliedRate!==0:Math.abs(rate-appliedRate)>.015*Math.max(rate,appliedRate))applyRate(rate,now);
        else rate=appliedRate;
        const target=rate>0&&q>0?level:0;
        // Preserve every in-flight ramp, but do not reschedule a settled target.
        if(target!==gainTarget){
          sourceGain.gain.cancelScheduledValues(now);
          sourceGain.gain.setValueAtTime(sourceGain.gain.value,now);
          sourceGain.gain.linearRampToValueAtTime(target,now+.006);
          gainTarget=target;
        }
        previous=q;last=now;
      }
    },
    stop(fade=.04){if(stopped||ended)return;stopped=true;retire(src,sourceGain,clamp(Number(fade)||.04,.005,.15));untrack();},
  };
  start();untrack=trackChargeHandle(audio,h,finitePos(pos)?64:88);
  return h;
}
