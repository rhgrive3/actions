// Continuous time-of-impact primitives, independent of weapon tuning and render Hz.
// Radii may grow linearly within one fixed tick. Expanded-box corner false positives
// are avoided by solving the true distance to the OBB (rounded Minkowski boundary).
const E = 1e-10;
function firstRoot(A, B, C, lo, hi) {
  const f = t => (A*t+B)*t+C;
  if (f(lo) <= E) return lo;
  if (Math.abs(A) < E) {
    if (Math.abs(B) < E) return null;
    const t=-C/B; return t>=lo-E && t<=hi+E ? Math.max(lo,Math.min(hi,t)):null;
  }
  const disc=B*B-4*A*C;
  if(disc < -E) return null;
  const s=Math.sqrt(Math.max(0,disc));
  const roots=[(-B-s)/(2*A),(-B+s)/(2*A)].sort((a,b)=>a-b);
  for(const t of roots)if(t>=lo-E && t<=hi+E)return Math.max(lo,Math.min(hi,t));
  return null;
}
// Distance from moving point to an axis-aligned box. Zero half-sizes also cover
// points and axis-aligned segments, so the same solver provides capsule entry.
export function roundedBoxEntry(origin, delta, half, radius0, radius1=radius0) {
  const cuts=[0,1],dr=radius1-radius0;
  for(let k=0;k<3;k++)if(Math.abs(delta[k])>E)for(const x of [-half[k],half[k]]){
    const t=(x-origin[k])/delta[k];if(t>E&&t<1-E)cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  for(let i=0;i<cuts.length-1;i++){
    const lo=cuts[i],hi=cuts[i+1],mid=(lo+hi)/2;
    let A=-dr*dr,B=-2*radius0*dr,C=-radius0*radius0;
    for(let k=0;k<3;k++){
      const v=origin[k]+delta[k]*mid;
      if(v>=-half[k]&&v<=half[k])continue;
      const a=delta[k],b=origin[k]-(v>half[k]?half[k]:-half[k]);
      A+=a*a;B+=2*a*b;C+=b*b;
    }
    const t=firstRoot(A,B,C,lo,hi);if(t!==null)return t;
  }
  return null;
}
export function capsuleEntry(from,to,base,bodyRadius,height,bulletRadius0,bulletRadius1=bulletRadius0) {
  const h=Math.max(0,height-2*bodyRadius)/2;
  return roundedBoxEntry([from.x-base.x,from.y-base.y-bodyRadius-h,from.z-base.z],
    [to.x-from.x,to.y-from.y,to.z-from.z],[0,h,0],bodyRadius+bulletRadius0,bodyRadius+bulletRadius1);
}
export function sweptWorldHit(physics,from,to,r0,r1,out,skipGrates=true) {
  const level=physics?.level,dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,len=Math.hypot(dx,dy,dz);
  if(!level?.queryBlocks||!level.blocks)return physics.segment(from,to,out,skipGrates);
  out.hit=false;out.dist=len;out.block=-1;out.face=-1;
  const r=Math.max(r0,r1),ids=level.queryBlocks(Math.min(from.x,to.x)-r,Math.min(from.z,to.z)-r,
    Math.max(from.x,to.x)+r,Math.max(from.z,to.z)+r,physics._wfSweepIds||(physics._wfSweepIds=[]));
  let best=Infinity,chosen=null;
  for(const index of ids){
    const b=level.blocks[index];if(!b?.solid||(skipGrates&&b.grate))continue;
    const rel=[from.x-b.center.x,from.y-b.center.y,from.z-b.center.z];
    const o=b.axes.map(a=>rel[0]*a.x+rel[1]*a.y+rel[2]*a.z),d=b.axes.map(a=>dx*a.x+dy*a.y+dz*a.z);
    const h=[b.half.x,b.half.y,b.half.z],t=roundedBoxEntry(o,d,h,r0,r1);
    if(t!==null&&(t<best-E || Math.abs(t-best)<E&&index<(chosen?.index??Infinity))){best=t;chosen={b,index,o,d,h};}
  }
  if(!chosen)return out;
  const {b,index,o,d,h}=chosen,q=o.map((v,k)=>v+d[k]*best),closest=q.map((v,k)=>Math.max(-h[k],Math.min(h[k],v)));
  let n=q.map((v,k)=>v-closest[k]),nlen=Math.hypot(...n),axis=0;
  if(nlen<E){
    // Initial overlap must stop the shot instead of letting it escape through a wall.
    let gap=Infinity;for(let k=0;k<3;k++){const g=h[k]-Math.abs(q[k]);if(g<gap){gap=g;axis=k;}}
    n=[0,0,0];n[axis]=q[axis]===0?(d[axis]>0?-1:1):Math.sign(q[axis]);closest[axis]=n[axis]*h[axis];
  }else {n=n.map(v=>v/nlen);axis=n.reduce((a,v,k)=>Math.abs(v)>Math.abs(n[a])?k:a,0);}
  out.hit=true;out.dist=best*len;out.block=index;
  out.normal.set(0,0,0);out.point.copy(b.center);
  for(let k=0;k<3;k++){out.normal.addScaledVector(b.axes[k],n[k]);out.point.addScaledVector(b.axes[k],closest[k]);}
  out.face=b.faces?.[axis*2+(n[axis]>0?0:1)]??-1;
  const face=level.faces?.[out.face];if(face){
    const x=out.point.x-face.origin.x,y=out.point.y-face.origin.y,z=out.point.z-face.origin.z;
    out.u=x*face.u.x+y*face.u.y+z*face.u.z;out.v=x*face.v.x+y*face.v.y+z*face.v.z;
  }
  return out;
}
