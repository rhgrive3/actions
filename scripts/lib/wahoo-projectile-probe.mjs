/** Wahoo's first centre-eye wall ray crosses a small shop trim at the live
 * weapon height. Use a larger original wall with an exposed firing corridor. */
export function selectWahooProjectileWall(G){
 const V=G.local.pos.constructor,vec=(x=0,y=0,z=0)=>new V(x,y,z),down=vec(0,-1,0),L=G.level;
 for(const face of L.faces){
  if(Math.abs(face.n.y)>.12||face.su<3||face.sv<3)continue;
  for(const fraction of [.5,.25,.75])for(const side of [1,-1]){
   const seed=face.origin.clone().addScaledVector(face.u,face.su*fraction).addScaledVector(face.v,face.sv*fraction),normal=face.n.clone().multiplyScalar(side),stance=seed.clone().addScaledVector(normal,3),floor=G.physics.raycast(stance.clone().add(vec(0,2,0)),down,9);
   if(!floor.hit||floor.normal.y<.68||floor.face<0)continue;
   stance.y=floor.point.y+.002;
   if(!G.physics.bodyFits(stance,.38,.3,1.45))continue;
   const eye=stance.clone().add(vec(0,1.05,0)),direction=normal.clone().negate(),hit=G.physics.raycast(eye,direction,5);
   if(!hit.hit||hit.face!==face.id||hit.triangle<0||!(L.triangleWorld.flags[hit.triangle]&2)||hit.dist<1.5||hit.dist>4.5)continue;
   const cross=vec(-normal.z,0,normal.x);let exposed=true;
   // Include solid NoPaint surfaces. The eye, both shoulders and high muzzle
   // envelope must see this same original wall before any foreground trim.
   for(const y of [.9,1.4,1.7])for(const x of [-.4,0,.4]){
    const origin=stance.clone().add(vec(0,y,0)).addScaledVector(cross,x),h=G.physics.raycast(origin,direction,hit.dist+.1);
    if(!h.hit||h.face!==face.id){exposed=false;break;}
   }
   if(!exposed)continue;
   return {stance,target:hit.point.clone(),face:hit.face,triangle:hit.triangle,u:hit.u,v:hit.v,sourceObject:L.manifest.objects[L.triangleWorld.objectIds[hit.triangle]].name};
  }
 }
 throw Error('No original Wahoo wall has a supported exposed firing corridor');
}
