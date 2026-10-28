// Charge is the unchanged full-clock fraction. A Stringer's first ring is at
// its own pinned ChargeFrameMidCharge, not necessarily halfway (LACT: 12/34).
// Stage 0 fills the first ring; stage 1 fills the second; stage 2 is full.
export function catalogChargeStage(weapon, charge) {
  const p=weapon?.catalogRecord?.parameters?.spl__WeaponStringerParam?.ChargeParam;
  if (!p) return null;
  const full=p.ChargeFrameFullCharge, first=p.ChargeFrameMidCharge;
  if (!(first>0 && full>first)) return null;
  const frames=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0))*full;
  if (frames+1e-9>=full) return { stage:2, progress:1, first:first/full };
  if (frames+1e-9>=first) return { stage:1, progress:(frames-first)/(full-first), first:first/full };
  return { stage:0, progress:frames/first, first:first/full };
}
