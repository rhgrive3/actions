/** Test setup derived entirely from the loaded source mesh and capsule support.
 * This selects a reproducible firing stance; it does not author stage geometry. */
export function selectNativeProjectileWall(G) {
 const V=G.local.pos.constructor,vec=(x=0,y=0,z=0)=>new V(x,y,z),down=vec(0,-1,0),level=G.level;
 for(const face of level.faces){
  if(Math.abs(face.n.y)>.12||face.su<.8||face.sv<.8)continue;
  for(const fraction of [.5,.25,.75])for(const side of [1,-1]){
   const target=face.origin.clone().addScaledVector(face.u,face.su*fraction).addScaledVector(face.v,face.sv*fraction),normal=face.n.clone().multiplyScalar(side);
   const stance=target.clone().addScaledVector(normal,3),floor=G.physics.raycast(stance.clone().add(vec(0,2,0)),down,9);
   if(!floor.hit||floor.normal.y<.62||floor.face<0)continue;
   stance.y=floor.point.y+.002;
   if(!G.physics.bodyFits(stance,.38,.3,1.45))continue;
   const eye=stance.clone().add(vec(0,1.05,0)),hit=G.physics.raycast(eye,normal.clone().negate(),5,undefined,true);
   if(!hit.hit||hit.face<0||Math.abs(hit.normal.y)>.12||hit.dist<1.5||hit.dist>4.5)continue;
   return {stance,target:hit.point.clone(),face:hit.face,triangle:hit.triangle,u:hit.u,v:hit.v,sourceObject:level.manifest.objects[level.triangleWorld.objectIds[hit.triangle]].name};
  }
 }
 throw Error('No source-supported, clear standing shot to a paintable wall');
}
