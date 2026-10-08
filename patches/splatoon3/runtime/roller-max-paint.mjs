// #189: maximum-speed width calibration only. The speed->width curve below
// SpeedMax is deliberately NOT guessed (#650). Existing body paint remains;
// two additional floor-only bands reach the sourced maximum lateral boundary.
export function paintRollerMaximumWidth(game,runner,weapon,paintSource,scale,fx,fz) {
  const a=runner.a,hs=Math.hypot(a.vel.x,a.vel.z);
  if(a.remote || !a.alive || !a.grounded || weapon.kind!=='roller' ||
      !(scale>0) || !Number.isFinite(paintSource?.SpeedMax) ||
      hs+1e-8<paintSource.SpeedMax*60*scale) return 0;
  const target=paintSource.WidthHalfMax*scale;
  // Native band geometry: CPU/GPU signed-distance threshold yields .69*r.
  // Keep the native y=.35 surface projection and the existing body splats.
  const nativeHalf=weapon.rollWidth*.33+Math.sqrt(.62**2-.35**2)*.69;
  if(!(target>nativeHalf))return 0;
  const overlap=Math.min(.1*scale,nativeHalf/4);
  const half=(target-nativeHalf+overlap)/2,offset=target-half;
  const radius=Math.hypot(half/.69,.35);
  const state=runner.s3MaxRollPaint||(runner.s3MaxRollPaint={point:a.pos.clone(),direction:a.pos.clone(),sequence:0});
  state.direction.set(fx,0,fz);state.sequence++;
  let area=0;
  for(const side of [-1,1]){
    state.point.set(a.pos.x+fx*.75+fz*offset*side,a.pos.y+.35,a.pos.z+fz*.75-fx*offset*side);
    const result=game.paint.splat(state.point,radius,a.team,{kind:'rollFloor',stretch:state.direction,seed:((Math.imul(state.sequence,2654435761)^(side<0?0x189:0x981))>>>0)/4294967296,claimOwner:a});
    if(Number.isFinite(result))area+=result;
  }
  return area;
}
