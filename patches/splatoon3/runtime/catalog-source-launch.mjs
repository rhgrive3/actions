// Isolated 11.3.0 grouped-swing emission math. Angles are in degrees
// except for the final radian result. Source-specific default fields remain
// neutral, never substituted with per-family guesses.
const RAD=Math.PI/180;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export function catalogRollerSourcePitch(unit,index,vertical){
  const initial=Number.isFinite(unit?.SpawnRotateXDegree)?unit.SpawnRotateXDegree
    :(unit?.SpawnRotateXDegreeBase??0);
  return initial+(vertical?(unit?.AfterOffsetSpawnRotateXDegree??0)*index:0);
}
export function catalogBrushSourceYaw(unit,leftToRight){
  const v=leftToRight?unit?.SpawnRotateYDegreeLeftToRight:unit?.SpawnRotateYDegreeRightToLeft;
  return Number.isFinite(v)?v:0;
}
export function catalogUnitYawBase(unit,key,index,leftToRight){
  return (Number.isFinite(unit?.BaseRotateYDegree)?unit.BaseRotateYDegree:0)+
    (key==='vertical' ?(unit?.SpawnRotateYDegree??0):0)+
    (key==='brush'?catalogBrushSourceYaw(unit,leftToRight):0);
}
// Same biased uniform-to-power model as the already installed native Slosher
// launcher. The Nintendo distribution is not decompiled; this explicitly
// matches the current native *INKWAVE* owner and respects no-RNG exceptions.
export function catalogSlosherYawScatter(unit,index,random=Math.random){
  if(!unit||unit.RandomRotateYOffOrderNum?.includes(index)||
    !(Number.isFinite(unit.RandomRotateYDegree)&&unit.RandomRotateYDegree>0))return 0;
  const bias=Number.isFinite(unit.RandomRotateYBias)?clamp(unit.RandomRotateYBias,0,1):0;
  const sample=clamp(2*random()-1,-1,1);
  return unit.RandomRotateYDegree*Math.sign(sample)*Math.pow(Math.abs(sample),1+bias);
}
export function catalogSlosherHasSweptAim(param,sourceActor){
  return sourceActor==='WeaponSlosherBathtub'||
    (Number.isFinite(param?.FrameOffsetMaxDegree)&&param.FrameOffsetMaxDegree>0);
}

// Brush nearest turf is produced at a source-specified phase of each
// recurring swing cycle (LoopNum shots; OrderNum is one-based). S3 wiki notes
// the cycle resets after about 40F without flicking.
export function catalogBrushNearestDue(group,serial){
  const splash=group?.SplashNearestParam,n=splash?.LoopNum,o=splash?.OrderNum;
  return Number.isSafeInteger(n)&&n>0&&Number.isSafeInteger(o)&&o>0&&o<=n&&
    Number.isSafeInteger(serial)&&serial>0&&((serial-1)%n)===(o-1);
}
