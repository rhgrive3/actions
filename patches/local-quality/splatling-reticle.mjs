const unit=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
export function splatlingStages(charge,runner,w,out={}){
 // Legacy Barrel has firstChargeTime/burstFirst, while the five 11.3.0
 // catalogue Spinners own ChargeFrame_First / ChargeFrame_Second only inside
 // their source GameParameterTable. The old HUD was reading the legacy fields
 // from catalogue weapons, and consequently never filled the second ring.
 const source=w?.catalogRecord?.parameters, param=source?.WeaponParam;
 const sourceFirst=param?.ChargeFrame_First,sourceFull=param?.ChargeFrame_Second;
 const catalog=Number.isFinite(sourceFirst)&&Number.isFinite(sourceFull)&&sourceFirst>0&&sourceFull>sourceFirst;
 const first=catalog?sourceFirst/60:w?.firstChargeTime;
 const full=catalog?sourceFull/60:w?.chargeTime;
 if(!(first>0&&full>first))return Object.assign(out,{first:unit(charge),second:0});
 const boundary=first/full;
 // During catalogue streaming runner.charge resets to zero, but the source
 // stream owns a fixed duration/elapsed pair. Reconstruct the two ring meters
 // from the remaining source MaxShootingFrame_First/Second rather than the
 // legacy Barrel's burstT/burstFirst fields (which catalogue lacks).
 if(catalog&&runner?.streaming){
  const state=runner.catalogState;
  const firstShots=param?.MaxShootingFrame_First;
  const fullShots=source?.WeaponFullChargeParam?.MaxShootingFrame_Second??param?.MaxShootingFrame_Second;
  if(Number.isFinite(state?.streamTime)&&Number.isFinite(state?.streamElapsed)&&
    Number.isFinite(firstShots)&&Number.isFinite(fullShots)&&firstShots>0&&fullShots>firstShots){
    const left=Math.max(0,state.streamTime-Math.max(0,state.streamElapsed));
    const firstDur=firstShots/60,fullDur=fullShots/60;
    out.first=unit(left/firstDur);out.second=unit((left-firstDur)/(fullDur-firstDur));return out;
  }
 }
 // During a stream native charge is remaining / this release's duration,
 // which jumps near1 even after a partial release. Read remaining duration
 // against the already-authoritative two-stage burst curve instead.
 if(runner?.streaming&&w.burstFirst>0&&w.burstMax>w.burstFirst&&Number.isFinite(runner.burstT)){
  // The source-aware reservation includes a terminal reference frame after
  // the last cadence slot. That frame is not second-stage charge progress.
  const left=Math.max(0,runner.burstT-(runner.s3Spin?1/60:0));
  out.first=unit(left/w.burstFirst);out.second=unit((left-w.burstFirst)/(w.burstMax-w.burstFirst));return out;
 }
 const c=unit(charge);out.first=unit(c/boundary);out.second=unit((c-boundary)/(1-boundary));return out;
}
export function updateSplatlingStages(hud,charge,runner,w){
 const p=splatlingStages(charge,runner,w,hud._splatStages ||= {}),L=hud._L;
 if(L.splatFirst!==p.first){L.splatFirst=p.first;hud._chargeEl.style.strokeDashoffset=(100*(1-p.first)).toFixed(2);}
 if(L.splatSecond!==p.second){L.splatSecond=p.second;hud._chargeSecond.style.strokeDashoffset=(100*(1-p.second)).toFixed(2);}
 const complete=p.first>=1-1e-9, prior=L.splatFirstComplete===true;
 if(L.splatFirstComplete!==complete){
  L.splatFirstComplete=complete;
  hud.ret.classList.toggle('is-first-complete',complete);
  // Source threshold crossing is a once-per-charge moment. A brief cosmetic
  // highlight makes catalogue first-stage readiness distinct from full charge.
  // Reuse the native HUD class toggler; no additional DOM nodes or per-tick FX.
  if(complete&&!prior&&p.second<1-1e-9&&!runner?.streaming)
   hud._restart?.(hud.ret,'is-first-flash');
 }
}
