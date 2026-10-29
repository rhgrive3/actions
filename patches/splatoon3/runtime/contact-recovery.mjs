// Stage visibility for the existing contact volume. This is not a new S3 drum
// collider: test the closest lateral point of the native drum and its path.
let _from = null, _drum = null, _target = null, _hit = null;
export function rollerContactClear(a, e, w, physics, player) {
  if (!physics?.segment) return physics?.los ? physics.los(a.pos,e.pos) : false;
  const fx=Math.sin(a.yaw),fz=Math.cos(a.yaw),rx=fz,rz=-fx;
  const lateral=Math.max(-w.rollWidth/2,Math.min(w.rollWidth/2,(e.pos.x-a.pos.x)*rx+(e.pos.z-a.pos.z)*rz));
  const from=(_from&&_from.constructor===a.pos.constructor)?_from.copy(a.pos):(_from=a.pos.clone());from.y+=(a.smoothY||0)+.35;
  // Occlusion must stop at the threatened body. Casting all the way to the
  // nominal 0.75-WU drum tip wrongly rejects a legitimate near-side hit when
  // a solid wall sits BEHIND the victim but in front of that unused tip.
  // This clamps only the LOS probe, never the native Roller damage rectangle.
  const targetForward=(e.pos.x-a.pos.x)*fx+(e.pos.z-a.pos.z)*fz;
  const reach=Math.max(0,Math.min(.75,targetForward));
  const drum=(_drum&&_drum.constructor===from.constructor)?_drum.copy(from):(_drum=from.clone());drum.x+=fx*reach+rx*lateral;drum.z+=fz*reach+rz*lateral;
  const target=(_target&&_target.constructor===e.pos.constructor)?_target.copy(e.pos):(_target=e.pos.clone());target.y+=(e.smoothY||0)+Math.min(player.height,e.form==='squid'?player.squidHeight:player.height)*.5;
  const l=physics.level;
  if (l?.pointInside && (l.pointInside(from)||l.pointInside(drum)||l.pointInside(target))) return false;
  const hit=(_hit&&_hit.point.constructor===from.constructor)?_hit:(_hit={hit:false,point:from.clone(),normal:from.clone()});
  hit.hit=false;hit.point.copy(from);hit.normal.copy(from);
  // Do not let raycast's origin-inside exemption move the drum through a wall.
  if (physics.segment(from,drum,hit,false).hit) return false;
  return !physics.segment(drum,target,hit,false).hit;
}
export function blasterPlayerRadiusRate(p,w) {
  return p.s3TerrainBurst ? w.terrainSplashRadiusRate : 1;
}
export function installContactRecovery({Projectiles}) {
  const tag=Symbol.for('inkwave.s3.contact-recovery.v1'),p=Projectiles.prototype;
  if(p[tag])return;Object.defineProperty(p,tag,{value:true});
  const impact=p._impact;
  p._impact=function(projectile,...args){
    const before=projectile.s3TerrainBurst;
    projectile.s3TerrainBurst=projectile.type==='blast';
    try{return impact.call(this,projectile,...args);}
    finally{projectile.s3TerrainBurst=before;}
  };
}
