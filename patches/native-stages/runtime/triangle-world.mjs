// BVH and segment/triangle distance adapted from the user-supplied R6 handoff.
import * as THREE from 'three';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const V=()=>new THREE.Vector3();

/** Read-only source-triangle BVH. The render model is never substituted with boxes. */
export class TriangleWorld {
 constructor(data) {
  Object.assign(this,data);this.triangleCount=this.triangles.length/9;
  this._box=new THREE.Box3();this._ta=V();this._tb=V();this._tc=V();this._triangle=new THREE.Triangle();
  this._u=V();this._v=V();this._w=V();this._p=V();this._q=V();this._cp=V();this._sp=V();this._bestp=V();this._bests=V();this._d=V();this._s0=V();this._s1=V();this._center=V();this._normal=V();
  this.queryCount=0;this.triangleTests=0;
 }
 ray(origin,dir,far=1000,{ignoreGrates=false,minNormalY=-2}={}) {
  if(!Number.isFinite(origin.x+origin.y+origin.z+dir.x+dir.y+dir.z))return null;
  const nodes=this.nodes,stack=[0],verts=this.triangles,norm=this.normals;let best=far,id=-1,bu=0,bv=0;
  // Ground/edge probes use this exact direction. Keep native division and
  // traversal order; no reciprocal approximation or cross-query cache.
  const verticalDown=dir.x===0&&dir.z===0&&dir.y===-1;
  this.queryCount++;
  while(stack.length){
   const ni=stack.pop()*8;let low=0,high=best,miss=false;
   if(verticalDown){
    if(origin.x<nodes[ni]||origin.x>nodes[ni+3]||origin.z<nodes[ni+2]||origin.z>nodes[ni+5])miss=true;
    else {const a=(nodes[ni+1]-origin.y)/dir.y,b=(nodes[ni+4]-origin.y)/dir.y;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low)miss=true;}
   }else{
   for(let k=0;k<3;k++){
    const o=k===0?origin.x:k===1?origin.y:origin.z,d=k===0?dir.x:k===1?dir.y:dir.z;
    if(Math.abs(d)<1e-12){if(o<nodes[ni+k]||o>nodes[ni+3+k]){miss=true;break;}continue;}
    const a=(nodes[ni+k]-o)/d,b=(nodes[ni+3+k]-o)/d;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<low){miss=true;break;}
   }
   }
   if(miss)continue;
   const left=nodes[ni+6]|0,right=nodes[ni+7]|0;
   if(left>=0){stack.push(left,right);continue;}
   const start=-left-1;
   for(let q=start;q<start+right;q++){
    const t=this.order[q];if((ignoreGrates&&(this.flags[t]&4))||norm[t*3+1]<minNormalY)continue;
    const n=t*9,ax=verts[n],ay=verts[n+1],az=verts[n+2],ex=verts[n+3]-ax,ey=verts[n+4]-ay,ez=verts[n+5]-az,fx=verts[n+6]-ax,fy=verts[n+7]-ay,fz=verts[n+8]-az;
    const hx=dir.y*fz-dir.z*fy,hy=dir.z*fx-dir.x*fz,hz=dir.x*fy-dir.y*fx,det=ex*hx+ey*hy+ez*hz;
    this.triangleTests++;if(Math.abs(det)<1e-10)continue;
    const inv=1/det,sx=origin.x-ax,sy=origin.y-ay,sz=origin.z-az,u=(sx*hx+sy*hy+sz*hz)*inv;
    if(u<-.000001||u>1.000001)continue;
    const qx=sy*ez-sz*ey,qy=sz*ex-sx*ez,qz=sx*ey-sy*ex,v=(dir.x*qx+dir.y*qy+dir.z*qz)*inv;
    if(v<-.000001||u+v>1.000001)continue;
    const distance=(fx*qx+fy*qy+fz*qz)*inv;
    if(distance<.00001||distance>best)continue;best=distance;id=t;bu=u;bv=v;
   }
  }
  if(id<0)return null;
  const normal=new THREE.Vector3().fromArray(norm,id*3);if(normal.dot(dir)>0)normal.negate();
  return {triangle:id,distance:best,point:origin.clone().addScaledVector(dir,best),normal,u:bu,v:bv,flags:this.flags[id],object:this.objectIds[id]};
 }
 queryBox(min,max,fn){
  const a=this.nodes,stack=[0];
  while(stack.length){const n=stack.pop()*8;if(a[n]>max.x||a[n+1]>max.y||a[n+2]>max.z||a[n+3]<min.x||a[n+4]<min.y||a[n+5]<min.z)continue;
   const left=a[n+6]|0,right=a[n+7]|0;if(left>=0){stack.push(left,right);continue;}const start=-left-1;for(let k=start;k<start+right;k++)fn(this.order[k]);
  }
 }
 /** Continuous sphere contact with source triangles, including edges/corners.
  * Distance to a convex triangle along a segment is convex. The exact closest
  * segment/triangle pair brackets its first radius entry; bisection finds that
  * entry without sampling over thin walls or substituting chart rectangles. */
 sweepSphere(from,to,radius,{ignoreGrates=false}={}){
  if(!(radius>=0)||!Number.isFinite(radius)||!Number.isFinite(from.x+from.y+from.z+to.x+to.y+to.z)||this.nodes.length<8)return null;
  const scratch=this._sphereSweep||(this._sphereSweep={box:new THREE.Box3(),delta:V(),probe:V(),normal:V()}),{box,delta,probe,normal}=scratch;
  delta.subVectors(to,from);const lengthSquared=delta.lengthSq(),length=Math.sqrt(lengthSquared);
  box.min.copy(from).min(to).addScalar(-radius-1e-9);box.max.copy(from).max(to).addScalar(radius+1e-9);
  let best=Infinity,result=null;this.queryCount++;
  this.queryBox(box.min,box.max,id=>{
   if(ignoreGrates&&(this.flags[id]&4))return;
   const tri=this.triangle(id);this.triangleTests++;
   const minimum=this._capsuleDistance(from,to,tri);
   if(minimum>radius+1e-10)return;
   const closest=lengthSquared?clamp(probe.copy(this._bests).sub(from).dot(delta)/lengthSquared,0,1):0;
   const initial=this._capsuleDistance(from,from,tri);let time=0;
   if(initial>radius+1e-10){
    if(!lengthSquared||!closest)return;
    let lo=0,hi=closest;
    // Keep the outside endpoint outside, including tangent contacts. At most
    // 2^-36 of the submitted segment is left unresolved.
    for(let i=0;i<36;i++){
     const mid=(lo+hi)*.5;probe.copy(from).addScaledVector(delta,mid);
     if(this._capsuleDistance(probe,probe,tri)<=radius+1e-10)hi=mid;else lo=mid;
    }
    time=hi;
   }
   if(time>best||time===best&&result&&id>result.triangle)return;
   probe.copy(from).addScaledVector(delta,time);this._capsuleDistance(probe,probe,tri);
   normal.subVectors(probe,this._bestp);
   if(normal.lengthSq()<1e-20){normal.fromArray(this.normals,id*3);if(normal.dot(delta)>0)normal.negate();}
   else normal.normalize();
   best=time;result={triangle:id,time,distance:time*length,point:this._bestp.clone(),normal:normal.clone(),flags:this.flags[id],object:this.objectIds[id]};
  });
  return result;
 }
 triangle(id,out=this._triangle){const i=id*9,a=this.triangles;out.a.fromArray(a,i);out.b.fromArray(a,i+3);out.c.fromArray(a,i+6);return out;}
 ground(x,y,z,up=.35,down=.5,squid=false){return this.ray(new THREE.Vector3(x,y+up,z),new THREE.Vector3(0,-1,0),up+down,{ignoreGrates:squid,minNormalY:.62});}
 // Closest pair of points on two finite segments (degenerates included).
 _segments(a,b,c,d,outP,outQ){
  const u=this._u.subVectors(b,a),v=this._v.subVectors(d,c),w=this._w.subVectors(a,c),A=u.dot(u),B=u.dot(v),C=v.dot(v),D=u.dot(w),E=v.dot(w);let s=0,t=0;
  if(A<1e-14){t=clamp(E/(C||1),0,1);}else if(C<1e-14){s=clamp(-D/A,0,1);}else{
   const den=A*C-B*B;s=den>1e-14?clamp((B*E-C*D)/den,0,1):0;t=(B*s+E)/C;
   if(t<0){t=0;s=clamp(-D/A,0,1);}else if(t>1){t=1;s=clamp((B-D)/A,0,1);}
  }
  outP.copy(a).addScaledVector(u,s);outQ.copy(c).addScaledVector(v,t);return outP.distanceToSquared(outQ);
 }
 _capsuleDistance(s0,s1,tri){
  const bp=this._bestp,bs=this._bests,cp=this._cp,sp=this._sp;
  tri.closestPointToPoint(s0,cp);let best=cp.distanceToSquared(s0);bp.copy(cp);bs.copy(s0);
  tri.closestPointToPoint(s1,cp);let ds=cp.distanceToSquared(s1);if(ds<best){best=ds;bp.copy(cp);bs.copy(s1);}
  const a=tri.a,b=tri.b,c=tri.c;
  ds=this._segments(s0,s1,a,b,sp,cp);if(ds<best){best=ds;bp.copy(cp);bs.copy(sp);}
  ds=this._segments(s0,s1,b,c,sp,cp);if(ds<best){best=ds;bp.copy(cp);bs.copy(sp);}
  ds=this._segments(s0,s1,c,a,sp,cp);if(ds<best){best=ds;bp.copy(cp);bs.copy(sp);}
  tri.getNormal(this._normal);const d0=this._normal.dot(this._d.subVectors(s0,a)),d1=this._normal.dot(this._d.subVectors(s1,a));
  if(d0*d1<=0&&Math.abs(d0-d1)>1e-12){sp.copy(s0).lerp(s1,d0/(d0-d1));if(tri.containsPoint(sp)){best=0;bp.copy(sp);bs.copy(sp);}}
  return Math.sqrt(best);
 }
 resolveCapsule(feet,height=1.45,radius=.38,ignoreGrates=false){
  let ground=false,wall=false,maxPush=0;const velocityNormal=new THREE.Vector3();
  const s0=this._s0,s1=this._s1,box=this._box,tri=this._triangle;
  for(let pass=0;pass<4;pass++){
   s0.set(feet.x,feet.y+radius,feet.z);s1.set(feet.x,feet.y+Math.max(radius,height-radius),feet.z);
   box.min.copy(s0).min(s1).addScalar(-radius-.002);box.max.copy(s0).max(s1).addScalar(radius+.002);
   let pushed=false;
   this.queryBox(box.min,box.max,id=>{
    if(ignoreGrates&&(this.flags[id]&4))return;
    this.triangle(id,tri);const distance=this._capsuleDistance(s0,s1,tri);if(distance>=radius-.0001)return;
    const dir=this._d.subVectors(this._bests,this._bestp);
    if(distance<1e-8){tri.getNormal(dir);this._center.copy(s0).add(s1).multiplyScalar(.5).sub(tri.a);if(dir.dot(this._center)<0)dir.negate();}else dir.multiplyScalar(1/distance);
    const depth=radius-distance+.0003;if(depth>radius+height)return;
    s0.addScaledVector(dir,depth);s1.addScaledVector(dir,depth);feet.addScaledVector(dir,depth);maxPush=Math.max(maxPush,depth);pushed=true;
    if(dir.y>.6)ground=true;if(Math.abs(dir.y)<.5)wall=true;velocityNormal.add(dir);
   });
   if(!pushed)break;
  }
  return {ground,wall,maxPush,normal:velocityNormal.normalize()};
 }
 capsulePenetration(feet,height=1.45,radius=.38){
  const s0=this._s0.set(feet.x,feet.y+radius,feet.z),s1=this._s1.set(feet.x,feet.y+Math.max(radius,height-radius),feet.z),box=this._box;
  box.min.copy(s0).min(s1).addScalar(-radius);box.max.copy(s0).max(s1).addScalar(radius);let depth=0;
  this.queryBox(box.min,box.max,id=>{this.triangle(id);depth=Math.max(depth,radius-this._capsuleDistance(s0,s1,this._triangle));});return depth;
 }
}
