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
export function catalogFlickSourceDamage(damage,unit,key,frames,point,start,sectorYaw,depleted=false){
  if(!catalogFieldUnitCanDamage(unit))return 0;
  const table=catalogRollerDamageTable(damage,key,point,start,sectorYaw);
  if(!table)return null; // non-flick families keep existing damage law
  const distance=Math.hypot(point.x-start.x,point.y-start.y,point.z-start.z);
  // Capture every field in the former array-literal order before validation.
  const d0=table.DamageMaxDistance,v0=table.DamageMaxValue,
    d1=table.DamageHighDistance,v1=table.DamageHighValue,
    d2=table.DamageLowDistance,v2=table.DamageLowValue,
    d3=table.DamageMinDistance,v3=table.DamageMinValue;
  let have=false,base,prevD,prevV;
  for(let i=0;i<4;i++){
    const nextD=i===0?d0:i===1?d1:i===2?d2:d3,nextV=i===0?v0:i===1?v1:i===2?v2:v3;
    if(!Number.isFinite(nextD)||!Number.isFinite(nextV))continue;
    if(!have){have=true;base=nextV;prevD=nextD;prevV=nextV;continue;}
    if(distance>nextD){base=nextV;prevD=nextD;prevV=nextV;continue;}
    const fraction=nextD>prevD?clamp((distance-prevD)/(nextD-prevD)):1;
    base=prevV+(nextV-prevV)*fraction;break;
  }
  if(!have)return null;
  // Source per-sector depleted damage is independent of the common
  // distance and late-airtime tables; do not halve unrelated Slosher shots.
  const depletedRate=depleted&&Number.isFinite(table.DepletionDamageRate)
    ?Math.max(0,table.DepletionDamageRate):1;
  return Math.max(0,base/10)*catalogFlickDamageTimeRate(damage,frames)*
    catalogFlickDamageUnitRate(unit)*depletedRate;
}
