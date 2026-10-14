// Earliest contact between a linearly moving/growing sphere and a triangle.
// A triangle consists of its face, three finite edges and three vertices.
// Each feature supplies a linear/quadratic distance equation, without search.
function quadraticEntry(A,B,C,lo=0,hi=1){
 if(lo>hi)return Infinity;
 if((A*lo+B)*lo+C<=0)return lo;
 if(Math.abs(A)<1e-14){
  if(Math.abs(B)<1e-14)return Infinity;
  const t=-C/B;return t>=lo&&t<=hi?t:Infinity;
 }
 const disc=B*B-4*A*C;if(disc<0)return Infinity;
 const sqrt=Math.sqrt(disc),q=-.5*(B+(B>=0?sqrt:-sqrt));
 let a,b;
 if(q===0)a=b=-B/(2*A);else {a=q/A;b=C/q;}
 if(a>b){const swap=a;a=b;b=swap;}
 if(a>=lo&&a<=hi)return a;
 return b>=lo&&b<=hi?b:Infinity;
}

export function sphereTriangleEntry(triangle,from,delta,radius,change,probe,normal){
 // Match the existing distance-gap tolerance, rather than enlarging gameplay
 // radii or the broadphase. All input geometry and eligibility remain intact.
 const r=radius+1e-10;
 triangle.closestPointToPoint(from,probe);
 if(probe.distanceToSquared(from)<=r*r)return 0;
 let best=Infinity;
 triangle.getNormal(normal);
 const signed=(from.x-triangle.a.x)*normal.x+(from.y-triangle.a.y)*normal.y+(from.z-triangle.a.z)*normal.z;
 const speed=delta.dot(normal);
 for(let side=-1;side<=1;side+=2){
  const denominator=speed-side*change;
  if(Math.abs(denominator)<1e-14)continue;
  const t=(side*r-signed)/denominator;
  if(t<0||t>1||t>=best)continue;
  probe.copy(from).addScaledVector(delta,t).addScaledVector(normal,-(signed+speed*t));
  if(triangle.containsPoint(probe))best=t;
 }
 const distanceA=delta.lengthSq()-change*change;
 for(let i=0;i<3;i++){
  const a=i===0?triangle.a:i===1?triangle.b:triangle.c;
  const b=i===0?triangle.b:i===1?triangle.c:triangle.a;
  const x=from.x-a.x,y=from.y-a.y,z=from.z-a.z;
  const vertex=quadraticEntry(distanceA,2*(x*delta.x+y*delta.y+z*delta.z-r*change),x*x+y*y+z*z-r*r);
  if(vertex<best)best=vertex;
  const ex=b.x-a.x,ey=b.y-a.y,ez=b.z-a.z,length=ex*ex+ey*ey+ez*ez;
  if(length<1e-24)continue;
  const start=(x*ex+y*ey+z*ez)/length,rate=(delta.x*ex+delta.y*ey+delta.z*ez)/length;
  let lo=0,hi=1;
  if(Math.abs(rate)<1e-14){if(start<0||start>1)continue;}
  else {const a=-start/rate,b=(1-start)/rate;lo=Math.max(0,Math.min(a,b));hi=Math.min(1,Math.max(a,b));}
  if(lo>hi||lo>=best)continue;
  const ox=x-ex*start,oy=y-ey*start,oz=z-ez*start,dx=delta.x-ex*rate,dy=delta.y-ey*rate,dz=delta.z-ez*rate;
  const edge=quadraticEntry(dx*dx+dy*dy+dz*dz-change*change,2*(ox*dx+oy*dy+oz*dz-r*change),ox*ox+oy*oy+oz*oz-r*r,lo,hi);
  if(edge<best)best=edge;
 }
 return best;
}
