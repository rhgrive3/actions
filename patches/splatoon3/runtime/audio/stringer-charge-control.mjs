import {QUIET_CHARGE,trackChargeHandle,prewarmChargeCue,playChargeCue,chargeFraction,boundedCharge,chargeStage} from './charge-audio-lifecycle.mjs';
const IDS=new Set(['s3-stringer-normal','s3-stringer-short','s3-stringer-explosion']);
export const usesStringerCharge=id=>IDS.has(id);
// Recorded Stringer/LACT charge loops are retained. The subtle stage-dependent
// rate/gain curve and shared recorded Ready cue are INKWAVE approximations,
// not recovered retail SLINK settings. Wellstring uses the existing Tri proxy.
export function stringerChargeAudioLoop(engine,id,opts={},nativeLoop=()=>null){
  const ctx=engine?.ctx;if(!usesStringerCharge(id)||!ctx||ctx.state==='closed')return QUIET_CHARGE;
  const first=chargeFraction(opts.actor?.weapon,'stringer');
  let q=boundedCharge(Number.isFinite(opts.progress)?opts.progress:opts.actor?.weaponRunner?.charge);
  let stage=chargeStage(q,first),stopped=false,retire=()=>{},position=opts.pos;
  let volume=Number.isFinite(opts.volume)?Math.max(0,opts.volume):.6;
  let firstPlayed=stage>=1,fullPlayed=stage===2,lastPitch=NaN,lastVolume=NaN;
  const native=nativeLoop();if(!native)return QUIET_CHARGE;
  const update={pos:position,volume,pitch:1};
  const valid=()=>!stopped&&engine.ctx===ctx&&ctx.state!=='closed';
  const h={
    get playing(){return valid()&&native.playing!==false;},
    set(next={}){
      if(!valid())return;
      if(Object.hasOwn(next,'pos'))position=next.pos;
      if(Number.isFinite(next.volume))volume=Math.max(0,next.volume);
      if(Number.isFinite(next.progress))q=boundedCharge(next.progress);
      stage=chargeStage(q,first);
      const phase=q<first?.5*q/first:.5+.5*(q-first)/(1-first);
      const pitch=.92+.16*phase,gain=volume*(stage===2?.68:.8+.2*phase);
      if(pitch!==lastPitch||gain!==lastVolume||position){
        update.pitch=pitch;update.volume=gain;update.pos=position;native.set?.(update);
        lastPitch=pitch;lastVolume=gain;
      }
      if(!firstPlayed&&stage>=1){firstPlayed=true;playChargeCue(engine,opts.actor,position,volume,1);}
      if(!fullPlayed&&stage===2){fullPlayed=true;playChargeCue(engine,opts.actor,position,volume,2);}
    },
    stop(fade=.04){if(stopped)return;stopped=true;native.stop?.(fade);retire();},
  };
  retire=trackChargeHandle(engine,h,opts.priority??(opts.actor?.isLocal?88:64));
  if(valid()){prewarmChargeCue(engine);h.set({progress:q});}
  return h;
}
