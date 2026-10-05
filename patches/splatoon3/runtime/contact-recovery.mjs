// Stage visibility for the existing contact volume. This is not a new S3 drum
// collider: test the closest lateral point of the native drum and its path.
export function rollerContactClear(a, e, w, physics, player) {
  if (!physics?.segment) return physics?.los ? physics.los(a.pos,e.pos) : false;
  const fx=Math.sin(a.yaw),fz=Math.cos(a.yaw),rx=fz,rz=-fx;
  const lateral=Math.max(-w.rollWidth/2,Math.min(w.rollWidth/2,(e.pos.x-a.pos.x)*rx+(e.pos.z-a.pos.z)*rz));
  const from=a.pos.clone();from.y+=(a.smoothY||0)+.35;
  const drum=from.clone();drum.x+=fx*.75+rx*lateral;drum.z+=fz*.75+rz*lateral;
  const target=e.pos.clone();target.y+=(e.smoothY||0)+Math.min(player.height,e.form==='squid'?player.squidHeight:player.height)*.5;
  if (physics.level?.pointInside && [from,drum,target].some(p=>physics.level.pointInside(p))) return false;
  const hit={hit:false,point:from.clone(),normal:from.clone()};
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
