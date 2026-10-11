// Coplanar union ownership for the reconstruction's box/ramp surfaces.
// Rendering and CPU ink masks consume the same convex polygons; overlapping slabs are never counted twice.
const EPS=1e-7;
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
export function polygonArea(p) {let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1];}return a/2;}
function clip(poly,a,b,inside) {
  const out=[];if(!poly.length)return out;
  for(let i=0;i<poly.length;i++) {
    const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q);
    const pin=inside?dp>=-EPS:dp<=EPS,qin=inside?dq>=-EPS:dq<=EPS;
    if(pin)out.push(p);
    if(pin!==qin&&Math.abs(dp-dq)>EPS){const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
  }
  // Remove duplicates introduced when an edge is exactly on the clipping line.
  return out.filter((p,i)=>{const q=out[(i+out.length-1)%out.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>EPS;});
}
export function subtractConvex(subject,cutter) {
  if(polygonArea(cutter)<0)cutter=[...cutter].reverse();
  let inside=subject;const out=[];
  for(let i=0;i<cutter.length&&inside.length>=3;i++){
    const a=cutter[i],b=cutter[(i+1)%cutter.length];
    const outside=clip(inside,a,b,false);if(outside.length>=3&&Math.abs(polygonArea(outside))>EPS)out.push(outside);
    inside=clip(inside,a,b,true);
  }
  return out;
}
export function faceContainsUV(face,u,v) {
  if(u<-EPS||v<-EPS||u>face.su+EPS||v>face.sv+EPS)return false;
  if(!face.renderPolygons)return true;
  const p=[u,v];
  return face.renderPolygons.some(poly=>poly.every((a,i)=>cross(a,poly[(i+1)%poly.length],p)>=-EPS));
}
export function buildSurfaceOwnership(level) {
  // Contact surfaces own co-planar overlaps before ordinary underlying slabs.
  const faces=[...level.faces].sort((a,b)=>(+!!level.blocks[b.block].conveyor)-(+!!level.blocks[a.block].conveyor)||a.id-b.id);
  for(let i=0;i<faces.length;i++) {
    const f=faces[i],b=level.blocks[f.block];
    let polys=[[[0,0],[f.su,0],[f.su,f.sv],[0,f.sv]]];
    const group=b.dynamic?.id||null;
    for(let j=0;j<i&&polys.length;j++) {
      const g=faces[j],other=level.blocks[g.block];
      if((other.dynamic?.id||null)!==group||other.grate!==b.grate||other.glass!==b.glass)continue;
      if(f.n.dot(g.n)<1-1e-8)continue;
      const dx=g.origin.x-f.origin.x,dy=g.origin.y-f.origin.y,dz=g.origin.z-f.origin.z;
      if(Math.abs(dx*f.n.x+dy*f.n.y+dz*f.n.z)>EPS)continue;
      const cu=dx*f.u.x+dy*f.u.y+dz*f.u.z,cv=dx*f.v.x+dy*f.v.y+dz*f.v.z;
      const gu=g.u.dot(f.u)*g.su,gv=g.u.dot(f.v)*g.su,hu=g.v.dot(f.u)*g.sv,hv=g.v.dot(f.v)*g.sv;
      const cutter=[[cu,cv],[cu+gu,cv+gv],[cu+gu+hu,cv+gv+hv],[cu+hu,cv+hv]];
      const xs=cutter.map(p=>p[0]),ys=cutter.map(p=>p[1]);
      if(Math.max(...xs)<=EPS||Math.min(...xs)>=f.su-EPS||Math.max(...ys)<=EPS||Math.min(...ys)>=f.sv-EPS)continue;
      polys=polys.flatMap(p=>subtractConvex(p,cutter));
      if(polys.length>256)throw new Error(`Stage surface ${f.id}: excessive coplanar fragmentation`);
    }
    f.renderPolygons=polys;
    f.exposedArea=polys.reduce((a,p)=>a+Math.abs(polygonArea(p)),0);
  }
}
