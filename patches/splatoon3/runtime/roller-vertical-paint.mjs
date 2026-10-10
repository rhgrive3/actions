import {paintDistanceFlight} from './blaster-flight-paint.mjs';
export function rollerVerticalPaintSpec(group,scale=1,depletionPaintScale=1) {
  const paint=group?.SplashPaintParam;
  if(!paint || ![scale,group.SpawnSplashBetweenLength,paint.WidthHalf,paint.WidthHalfNearest,paint.DepthScaleMax].every(n=>Number.isFinite(n)&&n>0) ||
      !Number.isFinite(group.SpawnSplashFirstLength)||group.SpawnSplashFirstLength<0 ||
      !Number.isInteger(group.SpawnSplashNum)||group.SpawnSplashNum<1||group.SpawnSplashNum>256 ||
      paint.DepthScaleMin!==paint.DepthScaleMax)
    throw new RangeError('Unsupported Roller vertical splash source');
  // Supplied #423 semantics define SpawnSplashNum as intermediate + nearest.
  // Reserve the one nearest slot for its separate release-time owner (#358).
  // It must not become an extra intermediate stamp merely because foot paint
  // is absent in a deployment. The actual four intermediate events are owned
  // by the single central Unit 0 trajectory, not repeated for all five globs.
  const paintScale=Number.isFinite(depletionPaintScale)&&depletionPaintScale>0?depletionPaintScale:1;
  return Object.freeze({first:group.SpawnSplashFirstLength*scale,
    spacing:group.SpawnSplashBetweenLength*scale,count:group.SpawnSplashNum-1,
    reservedNearest:1,width:paint.WidthHalf*scale*paintScale,nearestWidth:paint.WidthHalfNearest*scale*paintScale,
    depth:1+(paint.DepthScaleMax-1)*paintScale});
}
export function configureRollerVerticalPaint(p,group,scale,depletionPaintScale=1) {
  const spec=rollerVerticalPaintSpec(group,scale,depletionPaintScale);
  p.s3RollerFlightPaint={spec,distance:0,index:0,last:p.pos.clone(),sample:p.pos.clone(),end:p.pos.clone(),
    down:p.pos.clone().set(0,-1,0),direction:p.pos.clone(),hit:{hit:false,point:p.pos.clone(),normal:p.pos.clone()}};
  p.trailEvery=0;
}
export function paintRollerVerticalFlight(game,p,end=p?.pos) {
  if(p?.type!=='drop'||p.fidelityMode!=='vertical'||p.fidelityRollerUnitIndex!==0)return 0;
  return paintDistanceFlight(game,p,p.s3RollerFlightPaint,end);
}
