// Roller rolling paint width.
//
// #189 source maximum: at the pinned Ver.11.3.0 Splat Roller the sourced
// `BodyParam.PaintParam` supplies `SpeedMax` 0.132 and `WidthHalfMax` 2.8, so
// at the maximum-speed regime the total lateral rolling footprint half-width is
// `WidthHalfMax` (after the repository's source->world scale). The existing
// native three-band body paint stays; two extra floor-only bands reach that
// boundary. This maximum calibration is unchanged by #649.
//
// #649 speed dependence: Splatoon 3's verified system behavior is that a faster
// roll paints wider because the left/right side splashes grow with movement
// speed, while the direct Roller body contact strip is what paints walls. Only
// the two endpoints are sourced/calibrated here (native body edge at rest,
// `WidthHalfMax` at `SpeedMax`). The intermediate interpolation is deliberately
// the minimal monotone segment between them and is NOT a pinned Nintendo curve;
// it is recorded as unverified in reports/inkwave-splatoon3-behavior-2026-10-02.md.
// Ground speed is read from the authoritative `Math.hypot(a.vel.x,a.vel.z)`, the
// same value the composed movement owner writes, so the 90F normal->dash target
// change produces the corresponding width change.
export function paintRollerMaximumWidth(game,runner,weapon,paintSource,scale,fx,fz) {
  const a=runner.a,hs=Math.hypot(a.vel.x,a.vel.z);
  if(a.remote || !a.alive || !a.grounded || weapon.kind!=='roller' ||
      !(scale>0) || !Number.isFinite(paintSource?.SpeedMax) ||
      !Number.isFinite(paintSource?.WidthHalfMax) || !(paintSource.SpeedMax>0)) return 0;
  const speedMax=paintSource.SpeedMax*60*scale;
  const q=Math.max(0,Math.min(1,hs/speedMax));
  // Native body-contact half-width: the outer edge of the existing three-band
  // body paint (radius .62 splat at y=.35; signed-distance threshold .69*r).
  const nativeHalf=weapon.rollWidth*.33+Math.sqrt(.62**2-.35**2)*.69;
  // Total lateral half-width grows monotonically from the native body edge at
  // rest to the sourced maximum at the SpeedMax regime.
  const target=nativeHalf+(paintSource.WidthHalfMax*scale-nativeHalf)*q;
  if(!(target>nativeHalf))return 0;
  const overlap=Math.min(.1*scale,nativeHalf/4);
  const half=(target-nativeHalf+overlap)/2,offset=target-half;
  const radius=Math.hypot(half/.69,.35);
  const state=runner.s3MaxRollPaint||(runner.s3MaxRollPaint={point:a.pos.clone(),direction:a.pos.clone(),sequence:0});
  state.direction.set(fx,0,fz);state.sequence++;
  let area=0;
  for(const side of [-1,1]){
    state.point.set(a.pos.x+fx*.75+fz*offset*side,a.pos.y+.35,a.pos.z+fz*.75-fx*offset*side);
    const result=game.paint.splat(state.point,radius,a.team,{kind:'rollFloor',stretch:state.direction,seed:((Math.imul(state.sequence,2654435761)^(side<0?0x189:0x981))>>>0)/4294967296});
    if(Number.isFinite(result))area+=result;
  }
  return area;
}
