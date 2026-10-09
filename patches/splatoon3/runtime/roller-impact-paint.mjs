// S3 Roller projectile landing paint width (#411) and depth (#611/#674/#713).
//
// Some Splat Roller records omit schema-default fields.  Keep the documented
// PaintParam DistanceNear default explicit instead of treating omission as 0.
const DEFAULT_DISTANCE_NEAR = 1.1;
const DEFAULT_DISTANCE_FAR = 20;
const DEFAULT_DEGREE_MAX = 10;
const DEFAULT_DEGREE_MIN = 35;
const DEFAULT_DEPTH_MAX = 2.4;
const DEFAULT_DEPTH_MIN = 1.4;
const clamp01 = value => Math.max(0, Math.min(1, value));
const lerp = (a,b,t) => a + (b-a)*t;
const finite = (value,fallback) => Number.isFinite(value) ? value : fallback;

export function rollerImpactPaintParam(projectile) {
  return projectile?.fidelityRollerUnit?.UnitParam?.PaintParam ?? null;
}

/** #498: source-defined width falloff endpoints per Roller unit.
 * S3 specifies 20F/30F start, 50F end and minimum 0.6. The intermediate
 * interpolation shape is *provisional* (linear); 11.3.0 engine/capture
 * verification is still required before declaring the Issue fully fixed.
 */
export function rollerPaintAgeMultiplier(projectile) {
  if (!projectile || projectile.ghost || projectile.type !== 'drop' ||
      projectile.s3Weapon?.kind !== 'roller') return 1;
  const p=rollerImpactPaintParam(projectile);
  const from=p?.ChangeWidthStartFrame, to=p?.ChangeWidthEndFrame, rate=p?.ChangeFrameWidthRate;
  if (![from,to,rate].every(Number.isFinite) || !(to>from) || !(rate>0) || rate>1) return 1;
  const frame=Math.max(0,Number.isFinite(projectile.age)?projectile.age*60:0);
  if (frame<=from) return 1;
  if (frame>=to) return rate;
  return lerp(1,rate,clamp01((frame-from)/(to-from)));
}
export function rollerTrailAgeWidth(projectile,width) {
  return width*rollerPaintAgeMultiplier(projectile);
}

/** Lateral landing-paint radius from the sourced near/far distance anchors. */
export function rollerImpactRadius(projectile, hitPoint, scale=1) {
  const paint=rollerImpactPaintParam(projectile);
  if(!paint || !(scale>0) || !projectile?.start || !hitPoint) return null;
  const nearWidth=paint.WidthHalfNear, farWidth=paint.WidthHalfFar;
  if(!Number.isFinite(nearWidth)||!(nearWidth>0)||!Number.isFinite(farWidth)||!(farWidth>0))return null;
  const near=finite(paint.DistanceNear,DEFAULT_DISTANCE_NEAR),far=finite(paint.DistanceFar,DEFAULT_DISTANCE_FAR);
  if(!(far>near))return null;
  const distance=projectile.start.distanceTo(hitPoint)/scale;
  const t=clamp01((distance-near)/(far-near));
  return lerp(nearWidth,farWidth,t)*scale*rollerPaintAgeMultiplier(projectile);
}


/** Impact angle in degrees above the contacted surface plane (0=grazing, 90=head-on). */
export function rollerImpactAngleDegrees(velocity, normal) {
  if(!velocity||!normal)return null;
  const vl=Math.hypot(velocity.x,velocity.y,velocity.z),nl=Math.hypot(normal.x,normal.y,normal.z);
  if(!(vl>0)||!(nl>0))return null;
  const dot=Math.abs(velocity.x*normal.x+velocity.y*normal.y+velocity.z*normal.z)/(vl*nl);
  return Math.asin(clamp01(dot))*180/Math.PI;
}

/**
 * #713 candidate height blend for break/free impacts.
 *
 * The pinned 11.3.0 Splat Roller records provide height anchors 1.5 and 10,
 * alongside the break/free depth scales. Public data does not define the exact
 * height reference, units, interpolation curve, or interaction with incidence
 * angle. This model uses the flight apex above the contacted plane, maps the
 * two raw anchors linearly, and composes the normalized height/angle reductions
 * by taking the stronger one. These choices are deterministic but provisional;
 * Switch capture is still required to claim hardware fidelity.
 */
export function rollerBreakFreeHeightUnit(projectile, height) {
  const paint=rollerImpactPaintParam(projectile);
  if(!paint)return null;
  const maxHeight=paint.HeightUseDepthScaleMaxBreakFree;
  const minHeight=paint.HeightUseDepthScaleMinBreakFree;
  if(!Number.isFinite(maxHeight)||!Number.isFinite(minHeight)||!(minHeight>maxHeight))return null;
  if(!Number.isFinite(height)||height<0)return null;
  return clamp01((height-maxHeight)/(minHeight-maxHeight));
}

/** Break/free depth scale selected only by the unit's height anchors. */
export function rollerImpactHeightDepthScale(projectile, height) {
  const paint=rollerImpactPaintParam(projectile);
  const t=rollerBreakFreeHeightUnit(projectile,height);
  if(!paint||t===null)return null;
  const max=finite(paint.DepthScaleMaxBreakFree,NaN);
  const min=finite(paint.DepthScaleMinBreakFree,NaN);
  if(!(max>0)||!(min>0))return null;
  return lerp(max,min,t);
}

/**
 * Estimate the projectile's flight height for the landing paint selector.
 * `fidelityImpactHeight` is an explicit fixture/replay input; production keeps
 * the shot's highest Y and measures it above the contacted plane. This
 * interpretation and its source-to-world conversion remain uncalibrated.
 */
export function rollerImpactHeight(projectile, hit, scale=1) {
  if(!projectile||!hit?.point||!hit?.normal)return null;
  const n=hit.normal,nl=Math.hypot(n.x,n.y,n.z);
  if(!(nl>0))return null;
  const unitScale=Number.isFinite(scale)&&scale>0?scale:1;
  if(Number.isFinite(projectile.fidelityImpactHeight))
    return Math.max(0,projectile.fidelityImpactHeight)/unitScale;
  let highest=-Infinity;
  for(const point of [projectile.pos,projectile.prev,projectile.start])
    if(Number.isFinite(point?.y))highest=Math.max(highest,point.y);
  if(Number.isFinite(projectile.fidelityMaxY))highest=Math.max(highest,projectile.fidelityMaxY);
  if(!Number.isFinite(highest))return null;
  const p=projectile.pos||projectile.start;
  const clearance=p?Math.max(0,((p.x-hit.point.x)*n.x+(p.y-hit.point.y)*n.y+(p.z-hit.point.z)*n.z)/nl):0;
  const arc=(n.y/nl)>0.5?Math.max(0,highest-hit.point.y):0;
  return Math.max(clearance,arc)/unitScale;
}

function rollerImpactDepthScaleForPhase(projectile, normal, straight, height) {
  const paint=rollerImpactPaintParam(projectile),angle=rollerImpactAngleDegrees(projectile?.vel,normal);
  if(!paint||angle===null)return null;
  const straightMax=finite(paint.DepthScaleMaxStraight,finite(paint.DepthScaleMax,DEFAULT_DEPTH_MAX));
  const straightMin=finite(paint.DepthScaleMinStraight,finite(paint.DepthScaleMin,DEFAULT_DEPTH_MIN));
  const max=straight?straightMax:finite(paint.DepthScaleMaxBreakFree,straightMax);
  const min=straight?straightMin:finite(paint.DepthScaleMinBreakFree,straightMin);
  if(!(max>0)||!(min>0))return null;
  const maxDegree=finite(paint.DegreeUseDepthScaleMax,DEFAULT_DEGREE_MAX);
  const minDegree=finite(paint.DegreeUseDepthScaleMin,DEFAULT_DEGREE_MIN);
  if(!(minDegree>maxDegree))return null;
  let t=clamp01((angle-maxDegree)/(minDegree-maxDegree));
  if(!straight){
    const tHeight=rollerBreakFreeHeightUnit(projectile,height);
    if(tHeight!==null)t=Math.max(t,tHeight);
  }
  return lerp(max,min,t);
}

/** #674: impact incidence selects/interpolates the straight-flight depth envelope. */
export function rollerImpactStraightDepthScale(projectile, normal) {
  return rollerImpactDepthScaleForPhase(projectile,normal,true);
}

/** #611/#674/#713: break/free depth combines phase, incidence and flight-height inputs. */
export function rollerImpactDepthScale(projectile, normal, height) {
  return rollerImpactDepthScaleForPhase(projectile,normal,(projectile?.fidelityPhase??0)===0,height);
}

/**
 * Run the existing impact path while replacing only its first gameplay splat.
 * This preserves native FX/audio/event/random-draw order and leaves damage,
 * collision, trajectory and wall-drop ownership untouched.
 */
export function withRollerImpactPaint(game,projectile,hit,scale,callback) {
  const paintScale=projectile?.s3DepletionRound===true && Number.isFinite(projectile.s3DepletionPaintScale) && projectile.s3DepletionPaintScale>0
    ? projectile.s3DepletionPaintScale : 1;
  const baseRadius=rollerImpactRadius(projectile,hit?.point,scale);
  const radius=baseRadius===null?null:baseRadius*paintScale;
  const height=rollerImpactHeight(projectile,hit,scale);
  const depthScale=rollerImpactDepthScale(projectile,hit?.normal,height);
  const paint=game?.paint;
  if(!(radius>0) || !(depthScale>0) || !paint || typeof paint.splat!=='function')return callback();
  const native=paint.splat,context=paint;
  let replaced=false;
  paint.splat=function(point,nativeRadius,team,opts={}){
    if(replaced)return native.call(this,point,nativeRadius,team,opts);
    replaced=true;
    return native.call(this,point,radius,team,{...opts,stretchAmt:Math.max(0,(depthScale-1)*paintScale)});
  };
  try{return callback({radius,depthScale,height});}finally{context.splat=native;}
}
