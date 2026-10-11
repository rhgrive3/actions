// #189 pins the maximum-speed edge; #649 scales the floor-only side bands by
// actual ground speed. Leanny's table supplies SpeedMax and WidthHalfMax but
// no intermediate curve, so the linear bridge below is an explicit INKWAVE
// approximation, not a claim about the retail interpolation.
export function paintRollerMaximumWidth(game,runner,weapon,paintSource,scale,referenceHz,fx,fz) {
  const a=runner.a,hs=Math.hypot(a.vel.x,a.vel.z);
  if(a.remote || !a.alive || !a.grounded || weapon.kind!=='roller' ||
      !Number.isFinite(scale) || !(scale>0) || !Number.isFinite(referenceHz) || !(referenceHz>0) ||
      !Number.isFinite(weapon.rollWidth) || !Number.isFinite(hs) ||
      !Number.isFinite(paintSource?.SpeedMax) || !Number.isFinite(paintSource?.WidthHalfMax) ||
      !(paintSource.SpeedMax>0) || !(paintSource.WidthHalfMax>0)) return 0;
  const target=paintSource.WidthHalfMax*scale;
  // #979 reconciles the CPU edge with native GLSL: BAND_W=.62, BAND_R=.1,
  // plus the .03/.018 ripple amplitudes at the visible sd=0 boundary. Use
  // that analytic maximum so the new parity edge cannot exceed sourced width.
  // Preserve native y=.35 projection, interior waves and the existing body.
  const bandHalfMax=.62+.1+.03+.018;
  const nativeHalf=weapon.rollWidth*.33+Math.sqrt(.62**2-.35**2)*bandHalfMax;
  if(!(target>nativeHalf))return 0;
  const maxSpeed=paintSource.SpeedMax*referenceHz*scale;
  if(!(maxSpeed>0))return 0;
  const speedRatio=Math.max(0,Math.min(1,hs/maxSpeed));
  const targetHalf=nativeHalf+(target-nativeHalf)*speedRatio;
  if(!(targetHalf>nativeHalf))return 0;
  const overlap=Math.min(.1*scale,nativeHalf/4);
  const half=(targetHalf-nativeHalf+overlap)/2,offset=targetHalf-half;
  const radius=Math.hypot(half/bandHalfMax,.35);
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
