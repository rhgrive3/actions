// Shared continuous collision support for roller admission and roller/brush paint.
// Trace the centre path on actual collision polygons, never paint-chart
// rectangles. Coalesced intervals and streamed plane crossings follow
// continuous upper support without a geometry-density cut-off.
export function traceRollingFloor(owner, at, level, physics, contact, paintableOnly = true) {
  const from=owner.pos, tol=1e-9;
  if(!owner.ground?.hit || !level || !Number.isFinite(from.x+from.y+from.z+at.x+at.z))return;
  // Partial/test levels without collision queries cannot prove floor contact.
  if(typeof (level.triangleWorld?level.queryDynamicBlocks:level.queryBlocks)!=='function')return;
  const surfaces=[], dx=at.x-from.x,dz=at.z-from.z;
  function polygon(points,normal,faceId){
    const face=level.faces[faceId];
    if(!face || (paintableOnly&&!face.paintable) || !(normal.y>0))return;
    // Collision vertices define the plane. Stored float32 shading/contact
    // normals can disagree across an exact shared edge after rounding.
    const o=points[0],ex=points[1].x-o.x,ey=points[1].y-o.y,ez=points[1].z-o.z;
    const fx=points[2].x-o.x,fy=points[2].y-o.y,fz=points[2].z-o.z;
    const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
    if(ny===0)return;
    const y0=o.y-((from.x-o.x)*nx+(from.z-o.z)*nz)/ny;
    const dy=-(dx*nx+dz*nz)/ny;
    if(!Number.isFinite(y0+dy))return;
    let area=0,lo=0,hi=1;
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.z-b.x*a.z;}
    if(Math.abs(area)<1e-12)return;
    const sign=Math.sign(area);
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],ex=b.x-a.x,ez=b.z-a.z;
      const q=sign*(ex*(from.z-a.z)-ez*(from.x-a.x)),d=sign*(ex*dz-ez*dx);
      if(Math.abs(d)<1e-12){if(q < -tol)return;}
      else if(d>0)lo=Math.max(lo,-q/d);else hi=Math.min(hi,-q/d);
    }
    if(lo>hi+tol || hi<0 || lo>1)return;
    surfaces.push({lo:Math.max(0,lo),hi:Math.min(1,hi),y0,dy,normal:normal.clone(),face:faceId,start:faceId===owner.ground.face&&lo<=tol,endFaces:hi>=1-tol?[faceId]:[]});
  }
  const min=contact.origin.set(Math.min(from.x,at.x),-Infinity,Math.min(from.z,at.z));
  const max=contact.down.set(Math.max(from.x,at.x),Infinity,Math.max(from.z,at.z));
  const world=level.triangleWorld;
  if(world)world.queryBox(min,max,id=>{
    if(world.flags[id]&4)return;
    const normal=contact.point.fromArray(world.normals,id*3);
    const tri=world.triangle(id);
    polygon([tri.a,tri.b,tri.c],normal,level.data.triangleFace[id]);
  });
  const ids=[];
  if(world)level.queryDynamicBlocks(min.x,min.z,max.x,max.z,ids);
  else level.queryBlocks(min.x,min.z,max.x,max.z,ids);
  for(const id of ids){
    const block=level.blocks[id];if(!block?.solid||block.grate)continue;
    for(const faceId of block.faces){
      const face=level.faces[faceId];if(!face || !(face.n.y>0))continue;
      const o=face.origin,u=face.u,v=face.v;
      const corners=contact.blockCorners||=( [null,at.clone(),at.clone(),at.clone()] );
      corners[0]=o;corners[1].copy(o).addScaledVector(u,face.su);
      corners[2].copy(o).addScaledVector(u,face.su).addScaledVector(v,face.sv);
      corners[3].copy(o).addScaledVector(v,face.sv);
      polygon(corners,face.n,faceId);
    }
  }
  if(!surfaces.length)return;
  // Merge actual overlapping/touching intervals on the exact same path
  // plane across chart IDs; retain accepted support membership explicitly.
  // Missing collision intervals remain gaps regardless of chart identity.
  surfaces.sort((a,b)=>a.y0-b.y0||a.dy-b.dy||a.lo-b.lo);
  let count=0;
  for(const s of surfaces){
    const prior=surfaces[count-1];
    if(prior&&prior.y0===s.y0&&prior.dy===s.dy&&s.lo<=prior.hi+tol)
      {prior.hi=Math.max(prior.hi,s.hi);prior.start ||= s.start;for(const face of s.endFaces)if(!prior.endFaces.includes(face))prior.endFaces.push(face);}
    else surfaces[count++]=s;
  }
  surfaces.length=count;
  let current=surfaces.find(s=>s.start&&s.lo<=tol);
  if(!current)return;
  // Stream the next endpoint/upper-plane crossing instead of constructing
  // all pairwise events. Storage is linear in intersecting collision pieces;
  // mesh density never silently disables a valid contact.
  let t=0;
  while(t<1-tol){
    const y=current.y0+current.dy*t;
    let next=null;
    for(const s of surfaces){
      if(s.lo>t+tol||s.hi<=t+tol||Math.abs(s.y0+s.dy*t-y)>1e-8)continue;
      if(!next||s.dy>next.dy||(s.dy===next.dy&&s.hi>next.hi))next=s;
    }
    if(!next)return;current=next;
    let end=current.hi;
    for(const s of surfaces){
      if(s.dy<=current.dy)continue;
      const cross=(current.y0-s.y0)/(s.dy-current.dy);
      if(cross>t+tol&&cross<end&&cross>=s.lo-tol&&cross<=s.hi+tol)end=cross;
    }
    if(!(end>t))return;
    t=end;
  }
  contact.point.set(at.x,current.y0+current.dy,at.z);
  contact.origin.copy(contact.point).addScaledVector(current.normal,.15);
  contact.down.copy(current.normal).negate();
  const h=physics.raycast(contact.origin,contact.down,.3,contact.hit,true);
  contact.hit=h;
  if(h.hit&&current.endFaces.includes(h.face)&&h.point.distanceToSquared(contact.point)<1e-12)
    return h;
}
