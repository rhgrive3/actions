import {spawnSplashDrop} from './blaster-flight-paint.mjs';

// The pinned 11.3.0 table supplies the 2.2-unit interval and the tiered
// FlySplashPaintParam WidthHalf/DepthScale envelope. It does not supply this
// drop's integration algorithm. INKWAVE uses its existing owner-only falling
// splash queue, zero initial drop velocity and the parent's calibrated gravity.
// This restores a real terrain-contact trail; it does not certify retail timing
// or the unresolved relationship of FlySplashPaintRadiusArray to WidthHalf.
const states=new WeakMap();
export function paintFizzyFlight(game,object,start,end){
  if(!object||object.dead||object.ghost||object.subId!=='fizzy'||!object.owner||object.owner.remote||!game?.projectiles)return 0;
  const spec=object.spec,index=Math.max(0,Math.min(2,(object.popLimit||1)-1));
  const interval=spec?.flySplashDistance?.[index],paint=spec?.flySplashPaintParam?.[index];
  if(!(Number.isFinite(interval)&&interval>0)||!paint||!(Number.isFinite(paint.widthHalf)&&paint.widthHalf>0)||
    !(Number.isFinite(spec.gravity)&&spec.gravity>0))return 0;
  let state=states.get(object);
  if(!state){
    state={from:start.clone(),direction:start.clone(),spec:Object.freeze({gravity:spec.gravity,drag:0,surfaceOnly:true,
      depthScaleMax:paint.depthScaleMax,depthScaleMin:paint.depthScaleMin,
      dropHeightMax:paint.depthMaxDropHeight,dropHeightMin:paint.depthMinDropHeight})};
    states.set(object,state);
  }
  const delta=state.direction.copy(end).sub(start),distance=delta.length();
  if(!(Number.isFinite(distance)&&distance>1e-8))return 0;
  let pending=object.flySplashDistance||0,consumed=0,count=0;
  while(pending+distance-consumed+1e-10>=interval){
    const advance=interval-pending,t=Math.max(0,Math.min(1,(consumed+advance)/distance));
    state.from.copy(start).addScaledVector(delta,t);
    const ordinal=(object.flySplashDrops||0)+1;
    const drop=spawnSplashDrop(game,{owner:object.owner,team:object.team,seed:object.seed,
      salt:ordinal,from:state.from,direction:delta,radius:paint.widthHalf,spec:state.spec});
    if(drop)count++;
    object.flySplashDrops=ordinal;
    consumed+=advance;pending=0;
  }
  object.flySplashDistance=Math.max(0,pending+distance-consumed);
  return count;
}
