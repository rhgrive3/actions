// Shared native Charger charge/keep kernel. Extracted from the installed
// source owner so receiver replay uses the same laws and record fields.
export function chargerChargeSeconds(w,beforeT,dt,fundedInk,grounded,fullInkBudget=false){
 const threshold=fullInkBudget?w.inkFull:w.inkMin;
 const low=fundedInk+1e-10<threshold;
 const fundedRate=low?(w.emptyChargeRate??1/3):1;
 const airRate=grounded?1:(w.airChargeRate??1/3);
 const minimum=w.minimumChargeTime??8/60;
 const earlyDt=Math.min(dt,Math.max(0,minimum-beforeT*Math.max(1e-10,w.chargeTime))/fundedRate);
 return earlyDt*fundedRate+(dt-earlyDt)*Math.min(fundedRate,airRate);
}
export function chargerKeepRecord(w,paid){return {charge:1,remaining:w.keepChargeTime,fireDelay:w.storedFireDelay||0,laserDelay:w.storedLaserDelay||0,resurfaced:false,paid:Math.max(paid||0,w.inkFull)};}
export function chargerKeepHidden(record,dt){record.remaining-=dt;record.resurfaced=false;return record.remaining>1e-10;}
export function chargerKeepResurface(record,w){record.remaining=w.keepChargeTime;record.fireDelay=w.storedFireDelay||0;record.laserDelay=w.storedLaserDelay||0;record.resurfaced=true;}
export function chargerKeepReady(record,dt){record.fireDelay=Math.max(0,(record.fireDelay||0)-dt);record.laserDelay=Math.max(0,(record.laserDelay||0)-dt);return record.fireDelay<=1e-10;}
export const CHARGER_CANCEL_SUB_SECONDS=5/60;
export const CHARGER_INTERRUPT_RECOVERY_SECONDS=19/60;
export const CHARGER_KEEP_CANCEL_RECOVERY_SECONDS=3/60;
export function chargerSubCancels(actor,runner,input,dt){return actor.weapon.kind==='charger'&&!!input.sub&&!!runner.charging&&!runner.s3Stored&&dt>0;}
export function mainSubOwns(runner,input){return !!input.sub||!!runner.aimingSub&&!!input.subReleased;}
export function chargerProgressiveInk(w,progress){const p=Math.max(0,Math.min(1,progress)),minT=w.minimumChargeTime??8/60;return p<=minT?w.inkMin*p/Math.max(1e-10,minT):w.inkMin+(w.inkFull-w.inkMin)*(p-minT)/Math.max(1e-10,1-minT);}
export function chargerFundedProgress(w,ink){const value=Math.max(0,ink),minT=w.minimumChargeTime??8/60;return value<=w.inkMin?minT*value/Math.max(1e-10,w.inkMin):Math.min(1,minT+(1-minT)*(value-w.inkMin)/Math.max(1e-10,w.inkFull-w.inkMin));}
export function chargerLowInkRecovery(a,r,interrupt=0,keep=0){return a.weapon?.kind==='charger'&&!!r?.charging&&!(Number.isFinite(r.charge)&&r.charge>=1)&&a.ink+1e-10<(a.weapon.inkMin??0)&&interrupt<=1e-10&&keep<=1e-10;}
