// BVH and segment/triangle distance adapted from the user-supplied R6 handoff.
import * as THREE from 'three';
import {sphereTriangleEntry} from './sphere-triangle-entry.mjs';
const clamp=(x,a,b)=>x<=a?+a:x>=b?+b:x;
const V=()=>new THREE.Vector3();
const _groundOrigin=V(),_groundDown=new THREE.Vector3(0,-1,0);

/** Read-only source-triangle BVH. The render model is never substituted with boxes. */
export class TriangleWorld {
 constructor(data) {
  // Collision owns its BVH inputs, never display-only upload buffers.
  // Keep other metadata extensions compatible without retaining render aliases.
  Object.assign(this,data);
  delete this.vertices;delete this.indices;
  this.triangleCount=this.triangles.length/9;
  this._box=new THREE.Box3();this._ta=V();this._tb=V();this._tc=V();this._triangle=new THREE.Triangle();
  this._u=V();this._v=V();this._w=V();this._p=V();this._q=V();this._cp=V();this._sp=V();this._bestp=V();this._bests=V();this._d=V();this._s0=V();this._s1=V();this._center=V();this._normal=V();
  this.queryCount=0;this.triangleTests=0;
  // One stack per active nesting level. Indexed writes preserve its numeric
  // backing capacity; pop()/length=0 may discard it. Each query owns a local
  // cursor, and finally releases the nesting slot even when a callback throws.
  this._queryStacks=[];this._queryDepth=0;
 }
 _acquireStack(){const depth=this._queryDepth++,stack=this._queryStacks[depth]||(this._queryStacks[depth]=[]);stack[0]=0;return stack;}
 _releaseStack(_stack){this._queryDepth--;}
 // anyHit is reserved for Boolean ground support; ordinary callers retain exact nearest-hit data.
 // Optional out owns point/normal Vector3s distinct from the ray inputs. Misses
 // leave it untouched; callers omitting it still receive independently owned hits.
 ray(origin,dir,far=1000,{ignoreGrates=false,minNormalY=-2,anyHit=false,minHitY=-Infinity}={},out=null) {
  if(!Number.isFinite(origin.x+origin.y+origin.z+dir.x+dir.y+dir.z))return null;
  const nodes=this.nodes,stack=this._acquireStack(),verts=this.triangles,norm=this.normals;let best=far,id=-1,bu=0,bv=0;
  try {
  // Ground/edge probes use this exact direction. Keep native division and
  // traversal order; no reciprocal approximation or cross-query cache.
  const verticalDown=dir.x===0&&dir.z===0&&dir.y===-1;
  this.queryCount++;let top=1;
  while(top){
   const ni=stack[--top]*8;let low=0,high=best,miss=false;
   if(verticalDown){
    if(origin.x<nodes[ni]||origin.x>nodes[ni+3]||origin.z<nodes[ni+2]||origin.z>nodes[ni+5])miss=true;
    else {const a=(nodes[ni+1]-origin.y)/dir.y,b=(nodes[ni+4]-origin.y)/dir.y;
     // Ordered downward endpoints: [b,a] overlaps [0,best] unless one
     // interval is wholly outside. Preserve NaN/unordered/coercion fallback.
     if(a>=b&&typeof best==='number')miss=best===best&&(a<0||best<0||b>best);
     else {low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low)miss=true;}
    }
   }else{
   // Fixed axes retain the scalar read/calculation order, including early
   // rejection and the unordered/coercion fallback, without per-node axis dispatch.
   {
    const o=origin.x,d=dir.x;
    if(d>-1e-12&&d<1e-12){if(o<nodes[ni]||o>nodes[ni+3])miss=true;}
    else{
     const a=(nodes[ni]-o)/d,b=(nodes[ni+3]-o)/d;
     if(a<=b&&typeof high==='number'&&high===high){if(a>low)low=a;if(b<high)high=b;if(high<low)miss=true;}
     else if(b<=a&&typeof high==='number'&&high===high){if(b>low)low=b;if(a<high)high=a;if(high<low)miss=true;}
     else{low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low)miss=true;}
    }
   }
   if(!miss){
    const o=origin.y,d=dir.y;
    if(d>-1e-12&&d<1e-12){if(o<nodes[ni+1]||o>nodes[ni+4])miss=true;}
    else{
     const a=(nodes[ni+1]-o)/d,b=(nodes[ni+4]-o)/d;
     if(a<=b&&typeof high==='number'&&high===high){if(a>low)low=a;if(b<high)high=b;if(high<low)miss=true;}
     else if(b<=a&&typeof high==='number'&&high===high){if(b>low)low=b;if(a<high)high=a;if(high<low)miss=true;}
     else{low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low)miss=true;}
    }
   }
   if(!miss){
    const o=origin.z,d=dir.z;
    if(d>-1e-12&&d<1e-12){if(o<nodes[ni+2]||o>nodes[ni+5])miss=true;}
    else{
     const a=(nodes[ni+2]-o)/d,b=(nodes[ni+5]-o)/d;
     if(a<=b&&typeof high==='number'&&high===high){if(a>low)low=a;if(b<high)high=b;if(high<low)miss=true;}
     else if(b<=a&&typeof high==='number'&&high===high){if(b>low)low=b;if(a<high)high=a;if(high<low)miss=true;}
     else{low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low)miss=true;}
    }
   }
   }
   if(miss)continue;
   const left=nodes[ni+6]|0,right=nodes[ni+7]|0;
   if(left>=0){stack[top++]=left;stack[top++]=right;continue;}
   const start=-left-1;
   for(let q=start;q<start+right;q++){
    const t=this.order[q];if((ignoreGrates&&(this.flags[t]&4))||norm[t*3+1]<minNormalY)continue;
    const n=t*9,ax=verts[n],ay=verts[n+1],az=verts[n+2],ex=verts[n+3]-ax,ey=verts[n+4]-ay,ez=verts[n+5]-az,fx=verts[n+6]-ax,fy=verts[n+7]-ay,fz=verts[n+8]-az;
    const hx=dir.y*fz-dir.z*fy,hy=dir.z*fx-dir.x*fz,hz=dir.x*fy-dir.y*fx,det=ex*hx+ey*hy+ez*hz;
    this.triangleTests++;if(det>-1e-10&&det<1e-10)continue;
    const inv=1/det,sx=origin.x-ax,sy=origin.y-ay,sz=origin.z-az,u=(sx*hx+sy*hy+sz*hz)*inv;
    if(u<-.000001||u>1.000001)continue;
    const qx=sy*ez-sz*ey,qy=sz*ex-sx*ez,qz=sx*ey-sy*ex,v=(dir.x*qx+dir.y*qy+dir.z*qz)*inv;
    if(v<-.000001||u+v>1.000001)continue;
    const distance=(fx*qx+fy*qy+fz*qz)*inv;
    if(distance<.00001||distance>best||distance===best&&id>=0&&t>id)continue;if(anyHit){if(!(origin.y+dir.y*distance<minHitY))return true;continue;}best=distance;id=t;bu=u;bv=v;
   }
  }
  if(id<0)return null;
  const normal=(out?out.normal:new THREE.Vector3()).fromArray(norm,id*3);if(normal.dot(dir)>0)normal.negate();
  const point=out?out.point.copy(origin).addScaledVector(dir,best):origin.clone().addScaledVector(dir,best);
  if(!out)return {triangle:id,distance:best,point,normal,u:bu,v:bv,flags:this.flags[id],object:this.objectIds[id]};
  out.triangle=id;out.distance=best;out.u=bu;out.v=bv;out.flags=this.flags[id];out.object=this.objectIds[id];return out;
  } finally {this._releaseStack(stack);}
 }
 // Ordered, masked BVH traversal for the nine parallel footprint samples.
 // Each sample keeps ray()'s exact triangle equations and tie winner. Sharing
 // the traversal and triangle setup does not combine or approximate contacts.
 hasCanonicalRay(){return this.ray===CANONICAL_RAY;}
 rayDownBatch(origins,far,options,outputs){
  const count=origins.length,{ignoreGrates=false,minNormalY=-2}=options||{};
  if(count>30||!(far>0)||!Number.isFinite(far)||options?.anyHit||this.ray!==CANONICAL_RAY){
   for(let i=0;i<count;i++)outputs[i].hit=!!this.ray(origins[i],_groundDown,far,options,outputs[i]);
   return outputs;
  }
  const state=this._downBatch||(this._downBatch={dist:new Float64Array(30),ids:new Int32Array(30),u:new Float64Array(30),v:new Float64Array(30)});
  const {dist,ids,u,v}=state,nodes=this.nodes,verts=this.triangles,norm=this.normals,dir=_groundDown;
  let mask=0;
  for(let i=0;i<count;i++){
   outputs[i].hit=false;dist[i]=far;ids[i]=-1;
   const o=origins[i];if(Number.isFinite(o.x+o.y+o.z+dir.x+dir.y+dir.z)){mask|=1<<i;this.queryCount++;}
  }
  if(!mask)return outputs;
  const stack=this._acquireStack();stack[1]=mask;let top=2;
  try {
   while(top){
    const pending=stack[--top],ni=stack[--top]*8;let active=0;
    // A small child node usually intersects only one or two footprint rays.
    // Visit its set bits in the same ascending sample order instead of
    // scanning every sample at every node (and again at every triangle).
    for(let remaining=pending;remaining;remaining&=remaining-1){
     const i=31-Math.clz32(remaining&-remaining),o=origins[i];
     if(o.x<nodes[ni]||o.x>nodes[ni+3]||o.z<nodes[ni+2]||o.z>nodes[ni+5])continue;
     const a=(nodes[ni+1]-o.y)/dir.y,b=(nodes[ni+4]-o.y)/dir.y;
     if(a>=b){if(a<0||b>dist[i])continue;}
     else if(Math.min(dist[i],Math.max(a,b))<Math.max(0,Math.min(a,b)))continue;
     active|=1<<i;
    }
    if(!active)continue;
    const left=nodes[ni+6]|0,right=nodes[ni+7]|0;
    if(left>=0){stack[top++]=left;stack[top++]=active;stack[top++]=right;stack[top++]=active;continue;}
    const start=-left-1;
    for(let q=start;q<start+right;q++){
     const t=this.order[q];if((ignoreGrates&&(this.flags[t]&4))||norm[t*3+1]<minNormalY)continue;
     const n=t*9,ax=verts[n],ay=verts[n+1],az=verts[n+2],ex=verts[n+3]-ax,ey=verts[n+4]-ay,ez=verts[n+5]-az,fx=verts[n+6]-ax,fy=verts[n+7]-ay,fz=verts[n+8]-az;
     const hx=dir.y*fz-dir.z*fy,hy=dir.z*fx-dir.x*fz,hz=dir.x*fy-dir.y*fx,det=ex*hx+ey*hy+ez*hz,parallel=Math.abs(det)<1e-10,inv=1/det;
     for(let remaining=active;remaining;remaining&=remaining-1){
      const i=31-Math.clz32(remaining&-remaining);this.triangleTests++;if(parallel)continue;
      const o=origins[i],sx=o.x-ax,sy=o.y-ay,sz=o.z-az,tu=(sx*hx+sy*hy+sz*hz)*inv;
      if(tu<-.000001||tu>1.000001)continue;
      const qx=sy*ez-sz*ey,qy=sz*ex-sx*ez,qz=sx*ey-sy*ex,tv=(dir.x*qx+dir.y*qy+dir.z*qz)*inv;
      if(tv<-.000001||tu+tv>1.000001)continue;
      const distance=(fx*qx+fy*qy+fz*qz)*inv;
      if(distance<.00001||distance>dist[i]||distance===dist[i]&&ids[i]>=0&&t>ids[i])continue;
      dist[i]=distance;ids[i]=t;u[i]=tu;v[i]=tv;
     }
    }
   }
   for(let i=0;i<count;i++){
    const t=ids[i];if(t<0)continue;const out=outputs[i];
    out.hit=true;out.triangle=t;out.distance=dist[i];out.u=u[i];out.v=v[i];out.flags=this.flags[t];out.object=this.objectIds[t];
    out.normal.fromArray(norm,t*3);if(out.normal.dot(dir)>0)out.normal.negate();
    out.point.copy(origins[i]).addScaledVector(dir,dist[i]);
   }
   return outputs;
  }finally{this._releaseStack(stack);}
 }
 // Opt-in early termination leaves existing callback return semantics intact.
 queryBox(min,max,fn,stopOnFalse=false){
  const a=this.nodes,stack=this._acquireStack();let top=1;
  try {
  while(top){const n=stack[--top]*8;if(a[n]>max.x||a[n+1]>max.y||a[n+2]>max.z||a[n+3]<min.x||a[n+4]<min.y||a[n+5]<min.z)continue;
   const left=a[n+6]|0,right=a[n+7]|0;if(left>=0){stack[top++]=left;stack[top++]=right;continue;}const start=-left-1;for(let k=start;k<start+right;k++)if(fn(this.order[k])===false&&stopOnFalse)return;
  }
  } finally {this._releaseStack(stack);}
 }
 // A scalar, conservative precheck only; queryBox's public candidate order is unchanged.
 triangleOverlapsBounds(id,x0,y0,z0,x1,y1,z1){
  if(!Number.isFinite(x0+y0+z0+x1+y1+z1))return true;
  const a=this.triangles,i=id*9;
  const ax=a[i],bx=a[i+3],cx=a[i+6];
  if((ax>x1&&bx>x1&&cx>x1)||(ax<x0&&bx<x0&&cx<x0))return false;
  const ay=a[i+1],by=a[i+4],cy=a[i+7];
  if((ay>y1&&by>y1&&cy>y1)||(ay<y0&&by<y0&&cy<y0))return false;
  const az=a[i+2],bz=a[i+5],cz=a[i+8];
  return !((az>z1&&bz>z1&&cz>z1)||(az<z0&&bz<z0&&cz<z0));
 }
 /** Continuous sphere contact with unchanged source faces, edges and vertices.
  * Each feature yields a linear/quadratic earliest entry, including a linearly
  * changing radius. The BVH and contact/material selection stay authoritative.
  * Optional out owns point/normal vectors distinct from the inputs. Misses
  * leave it untouched; omitted out still returns an independently owned hit. */
 sweepSphere(from,to,radius,{ignoreGrates=false,endRadius=radius}={},out=null){
  if(!(radius>=0)||!(endRadius>=0)||!Number.isFinite(radius+endRadius)||!Number.isFinite(from.x+from.y+from.z+to.x+to.y+to.z)||this.nodes.length<8)return null;
  const scratch=this._sphereSweep||(this._sphereSweep={box:new THREE.Box3(),delta:V(),probe:V(),normal:V()}),{box,delta,probe,normal}=scratch;
  delta.subVectors(to,from);const lengthSquared=delta.lengthSq(),length=Math.sqrt(lengthSquared);
  const maxRadius=radius>endRadius?radius:endRadius,change=endRadius-radius,bPad=maxRadius+1e-9;
  let curMinX=(from.x<to.x?from.x:to.x)-bPad,curMinY=(from.y<to.y?from.y:to.y)-bPad,curMinZ=(from.z<to.z?from.z:to.z)-bPad;
  let curMaxX=(from.x>to.x?from.x:to.x)+bPad,curMaxY=(from.y>to.y?from.y:to.y)+bPad,curMaxZ=(from.z>to.z?from.z:to.z)+bPad;
  box.min.set(curMinX,curMinY,curMinZ);box.max.set(curMaxX,curMaxY,curMaxZ);
  let best=Infinity,bestReference=null,bestTriangle=-1,bestTime=0,px=0,py=0,pz=0,nx=0,ny=0,nz=0;this.queryCount++;
  const pad=maxRadius+1e-6;
  const bMinX=curMinX,bMinY=curMinY,bMinZ=curMinZ,bMaxX=curMaxX,bMaxY=curMaxY,bMaxZ=curMaxZ;
  this.queryBox(box.min,box.max,id=>{
   if(ignoreGrates&&(this.flags[id]&4))return;
   if(!this.triangleOverlapsBounds(id,bMinX,bMinY,bMinZ,bMaxX,bMaxY,bMaxZ))return;
   this.triangleTests++;
   if(best<1&&!this.triangleOverlapsBounds(id,curMinX,curMinY,curMinZ,curMaxX,curMaxY,curMaxZ))return;
   const tri=this.triangle(id);
   let time=sphereTriangleEntry(tri,from,delta,radius,change,probe,normal,lengthSquared,best<1?best+1e-7:1);
   if(time===Infinity)return;
   const analyticTime=time;
   if(bestTriangle>=0&&Math.abs(time-best)<=1e-9){
    // Original distance searches quantise almost simultaneous source contacts.
    // Preserve their selected triangle/material only for these ambiguous hits;
    // far-away candidates never incur the old per-triangle search cost.
    if(bestReference===null)bestReference=this._sphereDistanceEntry(from,to,delta,radius,change,this.triangle(bestTriangle),probe);
    const reference=this._sphereDistanceEntry(from,to,delta,radius,change,this.triangle(id),probe);
    if(reference===Infinity||reference>bestReference||reference===bestReference&&id>bestTriangle)return;
    time=reference;bestReference=reference;
   }else {if(time>best)return;bestReference=null;}
   probe.copy(from).addScaledVector(delta,time);this._capsuleDistance(probe,probe,this.triangle(id));
   normal.subVectors(probe,this._bestp);
   if(normal.lengthSq()<1e-20){normal.fromArray(this.normals,id*3);if(normal.dot(delta)>0)normal.negate();}
   else normal.normalize();
   best=analyticTime;bestTriangle=id;bestTime=time;px=this._bestp.x;py=this._bestp.y;pz=this._bestp.z;nx=normal.x;ny=normal.y;nz=normal.z;
   if(best<1){
    const tb=best+1e-6<1?best+1e-6:1,tx=from.x+delta.x*tb,ty=from.y+delta.y*tb,tz=from.z+delta.z*tb;
    curMinX=(from.x<tx?from.x:tx)-pad;curMaxX=(from.x>tx?from.x:tx)+pad;
    curMinY=(from.y<ty?from.y:ty)-pad;curMaxY=(from.y>ty?from.y:ty)+pad;
    curMinZ=(from.z<tz?from.z:tz)-pad;curMaxZ=(from.z>tz?from.z:tz)+pad;
   }
  });
  if(bestTriangle<0)return null;
  if(!out)return {triangle:bestTriangle,time:bestTime,distance:bestTime*length,point:new THREE.Vector3(px,py,pz),normal:new THREE.Vector3(nx,ny,nz),flags:this.flags[bestTriangle],object:this.objectIds[bestTriangle]};
  out.triangle=bestTriangle;out.time=bestTime;out.distance=bestTime*length;
  out.point.set(px,py,pz);out.normal.set(nx,ny,nz);out.flags=this.flags[bestTriangle];out.object=this.objectIds[bestTriangle];return out;
 }
 // The previous source entry equation is retained solely to resolve
 // sub-nanosegment contact ordering, with its original brackets/iterations.
 _sphereDistanceEntry(from,to,delta,radius,change,tri,probe){
  const lengthSquared=delta.lengthSq(),maxRadius=Math.max(radius,radius+change);
  if(this._capsuleDistance(from,to,tri)>maxRadius+1e-10)return Infinity;
  const closest=lengthSquared?clamp(probe.copy(this._bests).sub(from).dot(delta)/lengthSquared,0,1):0;
  if(this._capsuleDistance(from,from,tri)<=radius+1e-10)return 0;
  let hi=closest;
  if(change!==0){
   const gap=t=>{probe.copy(from).addScaledVector(delta,t);return this._capsuleDistance(probe,probe,tri)-radius-change*t;};
   if(gap(1)<=1e-10)hi=1;
   else {
    const ratio=(Math.sqrt(5)-1)*.5;let lo=0,high=1,a=high-ratio*(high-lo),b=lo+ratio*(high-lo),fa=gap(a),fb=gap(b);
    for(let i=0;i<64;i++){
     if(fa<=fb){high=b;b=a;fb=fa;a=high-ratio*(high-lo);fa=gap(a);}
     else {lo=a;a=b;fa=fb;b=lo+ratio*(high-lo);fb=gap(b);}
    }
    hi=fa<=fb?a:b;if(Math.min(fa,fb)>1e-10)return Infinity;
   }
  }else if(!lengthSquared||!closest)return Infinity;
  let lo=0;
  for(let i=0;i<36;i++){
   const mid=(lo+hi)*.5;probe.copy(from).addScaledVector(delta,mid);
   if(this._capsuleDistance(probe,probe,tri)<=radius+change*mid+1e-10)hi=mid;else lo=mid;
  }
  return hi;
 }
 triangle(id,out=this._triangle){const i=id*9,a=this.triangles;out.a.x=a[i];out.a.y=a[i+1];out.a.z=a[i+2];out.b.x=a[i+3];out.b.y=a[i+4];out.b.z=a[i+5];out.c.x=a[i+6];out.c.y=a[i+7];out.c.z=a[i+8];return out;}
 ground(x,y,z,up=.35,down=.5,squid=false){return this.ray(_groundOrigin.set(x,y+up,z),_groundDown,up+down,{ignoreGrates:squid,minNormalY:.62});}
 // Closest pair of points on two finite segments (degenerates included).
 _segments(a,b,c,d,outP,outQ){
  const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=d.x-c.x,vy=d.y-c.y,vz=d.z-c.z,wx=a.x-c.x,wy=a.y-c.y,wz=a.z-c.z;
  const A=ux*ux+uy*uy+uz*uz,B=ux*vx+uy*vy+uz*vz,C=vx*vx+vy*vy+vz*vz,D=ux*wx+uy*wy+uz*wz,E=vx*wx+vy*wy+vz*wz;let s=0,t=0;
  if(A<1e-14){t=clamp(E/(C||1),0,1);}else if(C<1e-14){s=clamp(-D/A,0,1);}else{
   const den=A*C-B*B;s=den>1e-14?clamp((B*E-C*D)/den,0,1):0;t=(B*s+E)/C;
   if(t<0){t=0;s=clamp(-D/A,0,1);}else if(t>1){t=1;s=clamp((B-D)/A,0,1);}
  }
  const px=outP.x=a.x+ux*s,py=outP.y=a.y+uy*s,pz=outP.z=a.z+uz*s;
  const qx=outQ.x=c.x+vx*t,qy=outQ.y=c.y+vy*t,qz=outQ.z=c.z+vz*t;
  const dx=px-qx,dy=py-qy,dz=pz-qz;return dx*dx+dy*dy+dz*dz;
 }
 _pointTriangleDistance(point,tri){
  const bp=this._bestp,bs=this._bests,cp=this._cp,sp=this._sp;
  tri.closestPointToPoint(point,cp);
  const px=point.x,py=point.y,pz=point.z,spx=px+0,spy=py+0,spz=pz+0;
  let dx=cp.x-px,dy=cp.y-py,dz=cp.z-pz,best=dx*dx+dy*dy+dz*dz;
  bp.x=cp.x;bp.y=cp.y;bp.z=cp.z;bs.x=px;bs.y=py;bs.z=pz;
  // Match the original degenerate-segment edge formula and its rounding,
  // rather than replacing it with the Triangle helper's different tie path.
  for(let i=0;i<3;i++){
   const a=i===0?tri.a:i===1?tri.b:tri.c,b=i===0?tri.b:i===1?tri.c:tri.a;
   const vx=b.x-a.x,vy=b.y-a.y,vz=b.z-a.z,wx=px-a.x,wy=py-a.y,wz=pz-a.z;
   const C=vx*vx+vy*vy+vz*vz,E=vx*wx+vy*wy+vz*wz,t=clamp(E/(C||1),0,1);
   const cpx=cp.x=a.x+vx*t,cpy=cp.y=a.y+vy*t,cpz=cp.z=a.z+vz*t;
   sp.x=spx;sp.y=spy;sp.z=spz;
   const ex=spx-cpx,ey=spy-cpy,ez=spz-cpz,ds=ex*ex+ey*ey+ez*ez;
   if(ds<best){best=ds;bp.x=cpx;bp.y=cpy;bp.z=cpz;bs.x=spx;bs.y=spy;bs.z=spz;}
  }
  return Math.sqrt(best);
 }
 _capsuleDistance(s0,s1,tri){
  if(s0===s1)return this._pointTriangleDistance(s0,tri);
  const bp=this._bestp,bs=this._bests,cp=this._cp,sp=this._sp;
  tri.closestPointToPoint(s0,cp);
  let dx=cp.x-s0.x,dy=cp.y-s0.y,dz=cp.z-s0.z,best=dx*dx+dy*dy+dz*dz;
  bp.x=cp.x;bp.y=cp.y;bp.z=cp.z;bs.x=s0.x;bs.y=s0.y;bs.z=s0.z;
  tri.closestPointToPoint(s1,cp);
  dx=cp.x-s1.x;dy=cp.y-s1.y;dz=cp.z-s1.z;let ds=dx*dx+dy*dy+dz*dz;
  if(ds<best){best=ds;bp.x=cp.x;bp.y=cp.y;bp.z=cp.z;bs.x=s1.x;bs.y=s1.y;bs.z=s1.z;}
  const a=tri.a,b=tri.b,c=tri.c;
  ds=this._segments(s0,s1,a,b,sp,cp);if(ds<best){best=ds;bp.x=cp.x;bp.y=cp.y;bp.z=cp.z;bs.x=sp.x;bs.y=sp.y;bs.z=sp.z;}
  ds=this._segments(s0,s1,b,c,sp,cp);if(ds<best){best=ds;bp.x=cp.x;bp.y=cp.y;bp.z=cp.z;bs.x=sp.x;bs.y=sp.y;bs.z=sp.z;}
  ds=this._segments(s0,s1,c,a,sp,cp);if(ds<best){best=ds;bp.x=cp.x;bp.y=cp.y;bp.z=cp.z;bs.x=sp.x;bs.y=sp.y;bs.z=sp.z;}
  const v0x=c.x-b.x,v0y=c.y-b.y,v0z=c.z-b.z,v1x=a.x-b.x,v1y=a.y-b.y,v1z=a.z-b.z;
  const nx=v0y*v1z-v0z*v1y,ny=v0z*v1x-v0x*v1z,nz=v0x*v1y-v0y*v1x;
  const r0=nx*(s0.x-a.x)+ny*(s0.y-a.y)+nz*(s0.z-a.z),r1=nx*(s1.x-a.x)+ny*(s1.y-a.y)+nz*(s1.z-a.z);
  const scale=(nx<0?-nx:nx)+(ny<0?-ny:ny)+(nz<0?-nz:nz);
  if(!((r0>1e-7*scale&&r1>1e-7*scale)||(r0<-1e-7*scale&&r1<-1e-7*scale))){
   tri.getNormal(this._normal);const d0=this._normal.dot(this._d.subVectors(s0,a)),d1=this._normal.dot(this._d.subVectors(s1,a));
   if(d0*d1<=0&&Math.abs(d0-d1)>1e-12){sp.copy(s0).lerp(s1,d0/(d0-d1));if(tri.containsPoint(sp)){best=0;bp.x=sp.x;bp.y=sp.y;bp.z=sp.z;bs.x=sp.x;bs.y=sp.y;bs.z=sp.z;}}
  }
  return Math.sqrt(best);
 }
 resolveCapsule(feet,height=1.45,radius=.38,ignoreGrates=false){
  let ground=false,wall=false,maxPush=0;const velocityNormal=new THREE.Vector3();
  const s0=this._s0,s1=this._s1,box=this._box,tri=this._triangle,pad=radius+.002;
  for(let pass=0;pass<4;pass++){
   const sy0=feet.y+radius,sy1=feet.y+Math.max(radius,height-radius);
   s0.set(feet.x,sy0,feet.z);s1.set(feet.x,sy1,feet.z);
   let x0=feet.x-pad,y0=sy0-pad,z0=feet.z-pad,x1=feet.x+pad,y1=sy1+pad,z1=feet.z+pad;
   box.min.set(x0,y0,z0);box.max.set(x1,y1,z1);
   let pushed=false;
   this.queryBox(box.min,box.max,id=>{
    if(ignoreGrates&&(this.flags[id]&4))return;
    if(!this.triangleOverlapsBounds(id,x0,y0,z0,x1,y1,z1))return;
    this.triangle(id,tri);const distance=this._capsuleDistance(s0,s1,tri);if(distance>=radius-.0001)return;
    const dir=this._d.subVectors(this._bests,this._bestp);
    if(distance<1e-8){tri.getNormal(dir);this._center.copy(s0).add(s1).multiplyScalar(.5).sub(tri.a);if(dir.dot(this._center)<0)dir.negate();}else dir.multiplyScalar(1/distance);
    const depth=radius-distance+.0003;if(depth>radius+height)return;
    s0.addScaledVector(dir,depth);s1.addScaledVector(dir,depth);feet.addScaledVector(dir,depth);if(depth>maxPush)maxPush=depth;pushed=true;
    x0=(s0.x<s1.x?s0.x:s1.x)-pad;y0=(s0.y<s1.y?s0.y:s1.y)-pad;z0=(s0.z<s1.z?s0.z:s1.z)-pad;
    x1=(s0.x>s1.x?s0.x:s1.x)+pad;y1=(s0.y>s1.y?s0.y:s1.y)+pad;z1=(s0.z>s1.z?s0.z:s1.z)+pad;
    if(dir.y>.6)ground=true;if(dir.y>-.5&&dir.y<.5)wall=true;velocityNormal.add(dir);
   });
   if(!pushed)break;
  }
  return {ground,wall,maxPush,normal:velocityNormal.normalize()};
 }
 capsulePenetration(feet,height=1.45,radius=.38){
  const sy0=feet.y+radius,sy1=feet.y+Math.max(radius,height-radius);
  const s0=this._s0.set(feet.x,sy0,feet.z),s1=this._s1.set(feet.x,sy1,feet.z),box=this._box;
  const x0=feet.x-radius,y0=sy0-radius,z0=feet.z-radius,x1=feet.x+radius,y1=sy1+radius,z1=feet.z+radius;
  box.min.set(x0,y0,z0);box.max.set(x1,y1,z1);let depth=0;
  this.queryBox(box.min,box.max,id=>{if(!this.triangleOverlapsBounds(id,x0,y0,z0,x1,y1,z1))return;this.triangle(id);const pen=radius-this._capsuleDistance(s0,s1,this._triangle);if(pen>depth)depth=pen;});return depth;
 }
}

const CANONICAL_RAY=TriangleWorld.prototype.ray;
