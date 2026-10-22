// Source-owned damage decisions for added Roller/Brush projectile packets.
// Native Splat Roller runs a separate established fidelityDamage implementation.
const RAD=Math.PI/180;
const clamp=(x)=>Math.max(0,Math.min(1,x));
export function catalogFieldUnitCanDamage(unit){
  // Paint-only outer globs still collide with/paint terrain but never hit
  // actors, boss bodies, devices or brella shields.
  return unit?.PaintOnly!==true && !(Number.isFinite(unit?.UnitDamageRate)&&unit.UnitDamageRate<=0);
}
export function catalogFlickDamageUnitRate(unit){
  return Number.isFinite(unit?.UnitDamageRate)?Math.max(0,unit.UnitDamageRate):1;
}
export function catalogFlickDamageTimeRate(damage,frames){
  const start=damage?.DamageRejectStartFrame,end=damage?.DamageRejectEndFrame,rate=damage?.DamageRejectRate;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isFinite(rate))return 1;
  return 1+(rate-1)*clamp((frames-start)/(end-start));
}
export function catalogRollerDamageTable(damage,key,point,start,sectorYaw){
  const inside=damage?.Inside;
  if(!inside || key!=='horizontal' || !damage?.Outside ||
    !Number.isFinite(sectorYaw)||!point||!start)return inside;
  const dx=point.x-start.x,dz=point.z-start.z;
  const distance=Math.hypot(dx,dz);
  if(!(distance>(Number.isFinite(inside.InsideDistanceXZ)?inside.InsideDistanceXZ:0)))return inside;
  const azimuth=Math.atan2(dx,dz)-sectorYaw;
  const relative=Math.abs(Math.atan2(Math.sin(azimuth),Math.cos(azimuth)));
  return relative>(inside.Degree||0)*RAD?damage.Outside:inside;
}
export function catalogFlickSourceDamage(damage,unit,key,frames,point,start,sectorYaw){
  if(!catalogFieldUnitCanDamage(unit))return 0;
  const table=catalogRollerDamageTable(damage,key,point,start,sectorYaw);
  if(!table)return null; // non-flick families keep existing damage law
  const distance=Math.hypot(point.x-start.x,point.y-start.y,point.z-start.z);
  const bands=[
    [table.DamageMaxDistance,table.DamageMaxValue],
    [table.DamageHighDistance,table.DamageHighValue],
    [table.DamageLowDistance,table.DamageLowValue],
    [table.DamageMinDistance,table.DamageMinValue]
  ].filter(([dist,value])=>Number.isFinite(dist)&&Number.isFinite(value));
  if(!bands.length)return null;
  let base=bands[0][1];
  for(let i=1;i<bands.length;i++){
    const [prevD,prevV]=bands[i-1],[nextD,nextV]=bands[i];
    if(distance>nextD){base=nextV;continue;}
    const fraction=nextD>prevD?clamp((distance-prevD)/(nextD-prevD)):1;
    base=prevV+(nextV-prevV)*fraction;break;
  }
  return Math.max(0,base/10)*catalogFlickDamageTimeRate(damage,frames)*catalogFlickDamageUnitRate(unit);
}
