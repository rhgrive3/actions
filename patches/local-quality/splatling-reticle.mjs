const unit=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
export function splatlingStages(charge,runner,w,out={}){
 const first=w?.firstChargeTime,full=w?.chargeTime;
 if(!(first>0&&full>first))return Object.assign(out,{first:unit(charge),second:0});
 const boundary=first/full;
 // During a stream native charge is remaining / this release's duration,
 // which jumps near1 even after a partial release. Read remaining duration
 // against the already-authoritative two-stage burst curve instead.
 if(runner?.streaming&&w.burstFirst>0&&w.burstMax>w.burstFirst&&Number.isFinite(runner.burstT)){
  const left=Math.max(0,runner.burstT);
  out.first=unit(left/w.burstFirst);out.second=unit((left-w.burstFirst)/(w.burstMax-w.burstFirst));return out;
 }
 const c=unit(charge);out.first=unit(c/boundary);out.second=unit((c-boundary)/(1-boundary));return out;
}
export function updateSplatlingStages(hud,charge,runner,w){
 const p=splatlingStages(charge,runner,w,hud._splatStages ||= {}),L=hud._L;
 if(L.splatFirst!==p.first){L.splatFirst=p.first;hud._chargeEl.style.strokeDashoffset=(100*(1-p.first)).toFixed(2);}
 if(L.splatSecond!==p.second){L.splatSecond=p.second;hud._chargeSecond.style.strokeDashoffset=(100*(1-p.second)).toFixed(2);}
 hud.ret.classList.toggle('is-first-complete',p.first>=1-1e-9);
}
