// S3 Roller projectile landing paint width (#411) and longitudinal depth (#611/#674/#713).
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
  return lerp(nearWidth,farWidth,t)*scale;
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
 * #713: unit blend for the sourced break/free height selector.
 *
 * The pinned 11.3.0 record carries HeightUseDepthScaleMaxBreakFree (1.5) and
 * HeightUseDepthScaleMinBreakFree (10) next to DepthScaleMaxBreakFree /
 * DepthScaleMinBreakFree.
 *
 * VERIFIED (measurement): the Japanese verification wiki reports the measured
 * behavior "弾が飛んだ高さが高いほど伸びが縮む" (the higher the bullet flew, the
 * more the forward paint stretch shrinks) and lists it as an independent factor
 * alongside the impact angle and the straight/brake-free speed.  That fixes the
 * direction (low height -> DepthScaleMaxBreakFree, high height -> Min) and that
 * the quantity is a flight height, not the impact clearance or launch height.
 *
 * NOT VERIFIED (blocker): neither wiki defines the exact height reference
 * (absolute altitude vs. height above the landing surface vs. apex vs.
 * break/free-entry height) and the wiki states the detailed stretch formula is
 * still unknown.  This project therefore maps the glob's peak altitude above
 * the contacted surface onto the two sourced anchors, linear in between, as a
 * provisional calibration (same convention as the #674 incidence selector).
 */
export function rollerBreakFreeHeightUnit(projectile, height) {
  const paint=rollerImpactPaintParam(projectile);
  if(!paint)return null;
  const maxHeight=paint.HeightUseDepthScaleMaxBreakFree,minHeight=paint.HeightUseDepthScaleMinBreakFree;
  if(!Number.isFinite(maxHeight)||!Number.isFinite(minHeight)||!(minHeight>maxHeight))return null;
  if(!Number.isFinite(height)||height<0)return null;
  return clamp01((height-maxHeight)/(minHeight-maxHeight));
}

/** #713: break/free depth scale selected only by the sourced landing-height anchors. */
export function rollerImpactHeightDepthScale(projectile, height) {
  const paint=rollerImpactPaintParam(projectile);
  const t=rollerBreakFreeHeightUnit(projectile,height);
  if(!paint||t===null)return null;
  const max=finite(paint.DepthScaleMaxBreakFree,NaN),min=finite(paint.DepthScaleMinBreakFree,NaN);
  if(!(max>0)||!(min>0))return null;
  return lerp(max,min,t);
}

/**
 * #713: the source-defined height quantity at the actual impact: the glob's arc
 * height above the contacted surface. A finite projectile.fidelityImpactHeight
 * (used by fixtures and any future calibrated replay) takes priority; otherwise
 * the highest observed point of the trajectory is compared against the contact
 * point.  For sloped/wall contacts only the plane clearance is meaningful, so
 * the larger of the arc height and the plane clearance is used.
 */
export function rollerImpactHeight(projectile, hit, scale=1) {
  if(!projectile||!hit?.point||!hit?.normal)return null;
  const n=hit.normal,nl=Math.hypot(n.x,n.y,n.z);
  if(!(nl>0))return null;
  const s=scale>0?scale:1;
  if(Number.isFinite(projectile.fidelityImpactHeight))
    return Math.max(0,projectile.fidelityImpactHeight)/s;
  let highest=-Infinity;
  for(const point of [projectile.pos,projectile.prev,projectile.start])
    if(Number.isFinite(point?.y))highest=Math.max(highest,point.y);
  if(Number.isFinite(projectile.fidelityMaxY))highest=Math.max(highest,projectile.fidelityMaxY);
  if(!Number.isFinite(highest))return null;
  const p=projectile.pos||projectile.start;
  const clearance=p?Math.max(0,((p.x-hit.point.x)*n.x+(p.y-hit.point.y)*n.y+(p.z-hit.point.z)*n.z)/nl):0;
  const arc=(n.y/nl)>0.5?Math.max(0,highest-hit.point.y):0;
  return Math.max(clearance,arc)/s;
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
    // #713: break/free paint is additionally selected by the landing height.
    // The measured behavior treats height, angle and flight speed as separate
    // "the more X, the more the stretch shrinks" factors, so the two selectors
    // are composed as the stronger round condition (union: max of the two
    // normalized reductions).  This preserves the #674 selector instead of
    // replacing it.  NOTE: the exact engine combination is not publicly
    // documented; see the rollerBreakFreeHeightUnit note above.
    const tHeight=rollerBreakFreeHeightUnit(projectile,height);
    if(tHeight!==null)t=Math.max(t,tHeight);
  }
  return lerp(max,min,t);
}

/** #674: impact incidence selects/interpolates the straight-flight depth envelope. */
export function rollerImpactStraightDepthScale(projectile, normal) {
  return rollerImpactDepthScaleForPhase(projectile,normal,true);
}

/** #611 + #674 + #713: brake/free impacts use the height- and angle-selected envelope. */
export function rollerImpactDepthScale(projectile, normal, height) {
  return rollerImpactDepthScaleForPhase(projectile,normal,(projectile?.fidelityPhase??0)===0,height);
}

/**
 * Run the existing impact path while replacing only its first gameplay splat.
 * This preserves native FX/audio/event/random-draw order and leaves damage,
 * collision, trajectory and wall-drop ownership untouched.
 */
export function withRollerImpactPaint(game,projectile,hit,scale,callback) {
  const radius=rollerImpactRadius(projectile,hit?.point,scale);
  const height=rollerImpactHeight(projectile,hit,scale);
  const depthScale=rollerImpactDepthScale(projectile,hit?.normal,height);
  const paint=game?.paint;
  if(!(radius>0) || !(depthScale>0) || !paint || typeof paint.splat!=='function')return callback();
  const native=paint.splat,context=paint;
  let replaced=false;
  paint.splat=function(point,nativeRadius,team,opts={}){
    if(replaced)return native.call(this,point,nativeRadius,team,opts);
    replaced=true;
    return native.call(this,point,radius,team,{...opts,stretchAmt:Math.max(0,depthScale-1)});
  };
  try{return callback({radius,depthScale,height});}finally{context.splat=native;}
}
