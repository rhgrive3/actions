// Earliest contact between a linearly moving/growing sphere and a triangle.
// A triangle consists of its face, three finite edges and three vertices.
// Each feature supplies a linear/quadratic distance equation, without search.
function quadraticEntry(A,B,C,lo=0,hi=1){
 if(lo>hi)return Infinity;
 const fLo=(A*lo+B)*lo+C;
 if(fLo<=0)return lo;
 if(A===0){
  if(B===0)return Infinity;
  const t=-C/B;return t>=lo&&t<=hi?t:Infinity;
 }
 if(A>0&&(2*A*lo+B>=0||(2*A*hi+B<=0&&(A*hi+B)*hi+C>1e-6)))return Infinity;
 const disc=B*B-4*A*C;if(disc<0)return Infinity;
 const sqrt=Math.sqrt(disc),q=-.5*(B+(B>=0?sqrt:-sqrt));
 let a,b;
 if(q===0)a=b=-B/(2*A);else {a=q/A;b=C/q;}
 if(a>b){const swap=a;a=b;b=swap;}
 if(a>=lo&&a<=hi)return a;
 return b>=lo&&b<=hi?b:Infinity;
}

export function sphereTriangleEntry(triangle,from,delta,radius,change,probe,normal,lengthSquared=delta.lengthSq(),maxTime=1){
 // Match the existing distance-gap tolerance, rather than enlarging gameplay
 // radii or the broadphase. All input geometry and eligibility remain intact.
 const r=radius+1e-10;
 const ta=triangle.a,tb=triangle.b,tc=triangle.c;
 triangle.getNormal(normal);
 const nLenSq=normal.x*normal.x+normal.y*normal.y+normal.z*normal.z;
 const hasUnitNormal=nLenSq>0.999999&&nLenSq<1.000001;
 const signed=(from.x-ta.x)*normal.x+(from.y-ta.y)*normal.y+(from.z-ta.z)*normal.z;
 const speed=delta.dot(normal);
 let slabLo=0,slabHi=maxTime<1?maxTime:1;
 if(hasUnitNormal){
  if(Math.abs(signed)<=r+1e-7){
   triangle.closestPointToPoint(from,probe);
   if(probe.distanceToSquared(from)<=r*r)return 0;
  }
  const d1=speed-change,rhs1=r+1e-7-signed;
  if(d1>1e-12){const t=rhs1/d1;if(t<slabHi)slabHi=t;}
  else if(d1<-1e-12){const t=rhs1/d1;if(t>slabLo)slabLo=t;}
  else if(rhs1<0)return Infinity;
  const d2=-speed-change,rhs2=r+1e-7+signed;
  if(d2>1e-12){const t=rhs2/d2;if(t<slabHi)slabHi=t;}
  else if(d2<-1e-12){const t=rhs2/d2;if(t>slabLo)slabLo=t;}
  else if(rhs2<0)return Infinity;
  if(slabLo>slabHi)return Infinity;
  const rLo=r+change*slabLo,rHi=r+change*slabHi,pad=(rLo>rHi?rLo:rHi)+1e-6;
  const x0=from.x+delta.x*slabLo,x1=from.x+delta.x*slabHi;
  const minX=(x0<x1?x0:x1)-pad,maxX=(x0>x1?x0:x1)+pad;
  if((ta.x>maxX&&tb.x>maxX&&tc.x>maxX)||(ta.x<minX&&tb.x<minX&&tc.x<minX))return Infinity;
  const z0=from.z+delta.z*slabLo,z1=from.z+delta.z*slabHi;
  const minZ=(z0<z1?z0:z1)-pad,maxZ=(z0>z1?z0:z1)+pad;
  if((ta.z>maxZ&&tb.z>maxZ&&tc.z>maxZ)||(ta.z<minZ&&tb.z<minZ&&tc.z<minZ))return Infinity;
  const y0=from.y+delta.y*slabLo,y1=from.y+delta.y*slabHi;
  const minY=(y0<y1?y0:y1)-pad,maxY=(y0>y1?y0:y1)+pad;
  if((ta.y>maxY&&tb.y>maxY&&tc.y>maxY)||(ta.y<minY&&tb.y<minY&&tc.y<minY))return Infinity;
 }else{
  triangle.closestPointToPoint(from,probe);
  if(probe.distanceToSquared(from)<=r*r)return 0;
 }
 let best=Infinity;
 for(let side=-1;side<=1;side+=2){
  const denominator=speed-side*change;
  if(Math.abs(denominator)<1e-14)continue;
  const t=(side*r-signed)/denominator;
  if(t<0||t>1||t>=best||t>slabHi)continue;
  probe.copy(from).addScaledVector(delta,t).addScaledVector(normal,-(signed+speed*t));
  if(triangle.containsPoint(probe))best=t;
 }
 const distanceA=lengthSquared-change*change;
 const vHi=best<slabHi?best:slabHi;
 if(slabLo<=vHi){
  for(let i=0;i<3;i++){
   const a=i===0?ta:i===1?tb:tc;
   const b=i===0?tb:i===1?tc:ta;
   const x=from.x-a.x,y=from.y-a.y,z=from.z-a.z;
   const curHi=best<slabHi?best:slabHi;
   const vertex=quadraticEntry(distanceA,2*(x*delta.x+y*delta.y+z*delta.z-r*change),x*x+y*y+z*z-r*r,0,curHi);
   if(vertex<best)best=vertex;
   const ex=b.x-a.x,ey=b.y-a.y,ez=b.z-a.z,length=ex*ex+ey*ey+ez*ez;
   if(length<1e-24)continue;
   const start=(x*ex+y*ey+z*ez)/length,rate=(delta.x*ex+delta.y*ey+delta.z*ez)/length;
   let lo=0,hi=best<slabHi?best:slabHi;
   if(Math.abs(rate)<1e-14){if(start<0||start>1)continue;}
   else {const t0=-start/rate,t1=(1-start)/rate,tLo=t0<t1?t0:t1,tHi=t0>t1?t0:t1;if(tLo>0)lo=tLo;if(tHi<hi)hi=tHi;}
   if(lo>hi||lo>=best)continue;
   const ox=x-ex*start,oy=y-ey*start,oz=z-ez*start,dx=delta.x-ex*rate,dy=delta.y-ey*rate,dz=delta.z-ez*rate;
   const edge=quadraticEntry(dx*dx+dy*dy+dz*dz-change*change,2*(ox*dx+oy*dy+oz*dz-r*change),ox*ox+oy*oy+oz*oz-r*r,lo,best<hi?best:hi);
   if(edge<best)best=edge;
  }
 }
 return best;
}
