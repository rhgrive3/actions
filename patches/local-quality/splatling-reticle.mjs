const unit=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const positive=(x,fallback)=>Number.isFinite(x)&&x>0?x:fallback;

// The original seven-weapon HUD reads legacy seconds. Added catalogue weapons
// instead expose sourced frame counts and a separate catalogue stream clock.
// Neither missing legacy fields nor runner.charge=0 after release means that
// the second charge stage does not exist.
export function splatlingStages(charge,runner,w,out={}){
 const record=w?.catalogRecord;
 const parameter=record?.family==='splatling'?record.parameters?.WeaponParam:null;
 const catalogue=parameter&&!record.legacy;
 const full=catalogue?positive(parameter.ChargeFrame_Second,60):w?.chargeTime;
 // Ballpoint's raw ChargeFrame_First=1 controls ballistic charging, not its
 // visible first circle. The game's measured first-circle time is 50/100F:
 // https://wikiwiki.jp/splatoon3mix/ブキ/クーゲルシュライバー (main table, 11.0.0).
 // Keep the raw gameplay table unchanged; this is a presentation-only split.
 const ballpoint=record?.sourceActor==='WeaponSpinnerDownpour';
 const first=catalogue?(ballpoint?full/2:positive(parameter.ChargeFrame_First,full/2)):w?.firstChargeTime;
 if(!(first>0&&full>first))return Object.assign(out,{first:unit(charge),second:0});
 const boundary=first/full;
 const state=runner?.catalogState;
 if(catalogue&&runner?.streaming&&state?.stream>0&&Number.isFinite(state.streamTime)&&Number.isFinite(state.streamElapsed)){
  const normalMax=positive(parameter.MaxShootingFrame_Second,160);
  const burstMax=state.streamCharge>=1-1e-9?
    positive(record.parameters?.WeaponFullChargeParam?.MaxShootingFrame_Second,normalMax):normalMax;
  // Mirror the catalogue's admitted shooting-duration curve. Ballpoint is
  // linear after its existing eight-frame minimum, not a 1F first UI ring.
  const burstFirst=ballpoint?normalMax*unit((first-8)/(full-8)):
    positive(parameter.MaxShootingFrame_First,burstMax/2);
  const left=Math.max(0,(state.streamTime-Math.max(0,state.streamElapsed))*60);
  out.first=unit(left/burstFirst);
  out.second=unit((left-burstFirst)/Math.max(1e-9,burstMax-burstFirst));
  return out;
 }
 // Native remaining charge is a fraction of this release's duration. Read its
 // duration instead so a partial release cannot jump up to a false full ring.
 if(runner?.streaming&&w.burstFirst>0&&w.burstMax>w.burstFirst&&Number.isFinite(runner.burstT)){
  const left=Math.max(0,runner.burstT-(runner.s3Spin?1/60:0));
  out.first=unit(left/w.burstFirst);out.second=unit((left-w.burstFirst)/(w.burstMax-w.burstFirst));return out;
 }
 const c=catalogue&&runner?.charging&&Number.isFinite(state?.chargeF)?unit(state.chargeF/full):unit(charge);
 out.first=unit(c/boundary);out.second=unit((c-boundary)/(1-boundary));return out;
}
export function updateSplatlingStages(hud,charge,runner,w){
 const p=splatlingStages(charge,runner,w,hud._splatStages ||= {}),L=hud._L;
 if(L.splatFirst!==p.first){L.splatFirst=p.first;hud._chargeEl.style.strokeDashoffset=(100*(1-p.first)).toFixed(2);}
 if(L.splatSecond!==p.second){L.splatSecond=p.second;hud._chargeSecond.style.strokeDashoffset=(100*(1-p.second)).toFixed(2);}
 hud.ret.classList.toggle('is-first-complete',p.first>=1-1e-9);
}
