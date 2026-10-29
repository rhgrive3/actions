// Charge is the unchanged full-clock fraction. A Stringer's first ring is at
// its own pinned ChargeFrameMidCharge, not necessarily halfway (LACT: 12/34).
// Stage 0 fills the first ring; stage 1 fills the second; stage 2 is full.
export function catalogChargeStage(weapon, charge, out) {
  const p=weapon?.catalogRecord?.parameters?.spl__WeaponStringerParam?.ChargeParam;
  if (!p) return null;
  const full=p.ChargeFrameFullCharge, first=p.ChargeFrameMidCharge;
  if (!(first>0 && full>first)) return null;
  const frames=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0))*full;
  const result=out || {};
  if (frames+1e-9>=full) { result.stage=2; result.progress=1; }
  else if (frames+1e-9>=first) { result.stage=1; result.progress=(frames-first)/(full-first); }
  else { result.stage=0; result.progress=frames/first; }
  result.first=first/full;
  return result;
}
