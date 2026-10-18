// 11.3.0 explicit scalar fields come from Leanny/splat3 7280ff9cde8b.
// Sparse defaults and Nintendo's random-number algorithm are not available.
// Preserve authored elliptical groups; InitVelRandom affects launch speed only
// in this reconstruction, with a bounded signed uniform draw in source units.
export function brellaPelletSpeed(group, centre, random = Math.random) {
  const speed = Number.isFinite(group.MoveParam?.SpawnSpeed) ? group.MoveParam.SpawnSpeed : centre;
  const variation = Number.isFinite(group.InitVelRandom) ? Math.max(0, group.InitVelRandom) : 0;
  return variation > 0 ? Math.max(0, speed + (random() * 2 - 1) * variation) : speed;
}

// The guard plane shares canopy.pos and canopy.dir with the detached group
// and held guardPose reference. The procedural cloth has a wider, curved
// silhouette; agreement of its full surface with this source-radius guard is
// unresolved (see the family audit). A thin circular ellipsoid replaces the
// old vertical capsule (whose center was one radius ABOVE the visible shield).
// Circular aperture/thickness are INKWAVE geometry, not extracted retail mesh.
export function canopyEntry(from, to, canopy, projectileRadius = 0) {
  const c=canopy.pos,n=canopy.dir,r=Math.max(0,canopy.radius)+Math.max(0,projectileRadius),depth=.06+Math.max(0,projectileRadius);
  if (!(r>0)) return null;
  const nx=n.x,ny=n.y,nz=n.z,n2=nx*nx+ny*ny+nz*nz;
  if (!(n2>1e-12)) return null;
  const invN=1/Math.sqrt(n2),ux=nx*invN,uy=ny*invN,uz=nz*invN;
  const ox=from.x-c.x,oy=from.y-c.y,oz=from.z-c.z,dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
  // Bounding sphere early-out rejects most actors before the quadratic.
  const extent=Math.max(r,depth);
  if(Math.min(ox,ox+dx)>extent||Math.max(ox,ox+dx)<-extent||Math.min(oy,oy+dy)>extent||Math.max(oy,oy+dy)<-extent||Math.min(oz,oz+dz)>extent||Math.max(oz,oz+dz)<-extent)return null;
  const on=ox*ux+oy*uy+oz*uz,dn=dx*ux+dy*uy+dz*uz,ir=1/(r*r),extra=1/(depth*depth)-ir;
  const A=(dx*dx+dy*dy+dz*dz)*ir+dn*dn*extra,B=2*((ox*dx+oy*dy+oz*dz)*ir+on*dn*extra),C=(ox*ox+oy*oy+oz*oz)*ir+on*on*extra-1;
  if(C<=1e-9)return 0;
  if(A<=1e-12)return null;
  const disc=B*B-4*A*C;if(disc<0)return null;
  const t=(-B-Math.sqrt(disc))/(2*A);return t>=-1e-9&&t<=1+1e-9?Math.max(0,Math.min(1,t)):null;
}

// Scope actual collision evidence through synchronous damage routing. Neither
// the sender nor the receiver substitutes the attacker's receipt-time position.
export function withProjectileHitGeometry(system, from, to, radius, action) {
  const old=system.s3HitGeometry;
  const depth=system._s3HitGeometryDepth||0;
  const pool=system._s3HitGeometryPool||(system._s3HitGeometryPool=[]);
  const geometry=pool[depth]||(pool[depth]=new Array(7));
  system._s3HitGeometryDepth=depth+1;
  geometry[0]=from.x;geometry[1]=from.y;geometry[2]=from.z;
  geometry[3]=to.x;geometry[4]=to.y;geometry[5]=to.z;geometry[6]=Math.max(0,radius||0);
  system.s3HitGeometry=geometry;
  try{return action();}finally{system.s3HitGeometry=old;system._s3HitGeometryDepth=depth;}
}
export function validProjectileHitGeometry(g) {
  return Array.isArray(g)&&g.length===7&&g.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)&&g[6]>=0&&g[6]<=10;
}
