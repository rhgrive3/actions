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
  let stopped=false,ended=false,src=null,sourceGain=null,untrack=()=>{};
  let previous=q,last=ctx.currentTime,rate=1,level=clamp(Number(volume)||0,0,1),position=pos;
  let appliedRate=1,gainTarget=0,gainSettlesAt=0;
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
    s.playbackRate.value=full?1:rate;
    appliedRate=full?1:rate;
    const end=offset+Math.max(step*2,body*q);
    s.loop=!full;s.loopStart=Math.max(offset,end-.035);s.loopEnd=end;
    g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(q>0?level:0,now+.006);
    gainTarget=q>0?level:0;gainSettlesAt=now+.006;
    s.onended=()=>{disconnect(s,g);if(src===s){ended=true;untrack();try{panner?.disconnect?.();}catch{}}};
    if(full){
      g.gain.setValueAtTime(level,now+Math.max(.006,tail-.02));
      g.gain.linearRampToValueAtTime(0,now+tail);
      s.start(now,offset+body,tail);
    }else s.start(now,Math.max(offset,end-Math.min(.016,body*q)));
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
      if(dt>=1/240){
        rate=dp>0?clamp(dp*Math.max(.05,chargeTime)/dt,.02,4):0;
        // Exact zero, not the general mixer 0.05 minimum: no hidden crawl.
        if(rate!==appliedRate){
          src.playbackRate.cancelScheduledValues?.(now);
          if(src.playbackRate.setValueAtTime)src.playbackRate.setValueAtTime(rate,now);
          else src.playbackRate.value=rate;
          appliedRate=rate;
        }
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
