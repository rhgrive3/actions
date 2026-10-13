/** Source-supported local human approach. No source transform or collision is
 * changed. Normal run/jump dimensions come from the live Actor configuration. */
export function nativeTowerBoarding(G,reachable,body,halfSize=1.2){
 const N=G.nav,P=G.physics,allowed=new Uint8Array(N.nodes.length);for(const id of reachable)allowed[id]=1;
 const jumpPeak=body.jumpVel**2/(2*body.gravity),maxJumpHeight=jumpPeak+Math.min(body.ledgeAssist,.22),metrics={candidates:0,arcs:0,bodySamples:0};
 const feet=G.level.spawnPads[0].clone(),cache=new Map(),outer=Math.SQRT2*halfSize+body.radius+.05,inner=Math.min(halfSize+.05,Math.max(.82,halfSize-.3));
 const find=(id,target)=>{
  const key=id+'/'+target[1];if(cache.has(key))return cache.get(key);
  const node=N.nodes[id],candidates=[];
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
   const ix=node.ix+dx,iz=node.iz+dz;if(ix<0||iz<0||ix>=N.nx||iz>=N.nz)continue;
   for(const source of N.cells[iz*N.nx+ix]){
    if(!allowed[source])continue;const n=N.nodes[source];if(n.zone>=0)continue;
    const distance=Math.hypot(n.x-target[0],n.z-target[2]),height=target[1]-n.y;
    if(distance<outer||distance>halfSize+1.5||height<-.25||height>maxJumpHeight)continue;
    candidates.push({n,distance,height});
   }
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.height-b.height);metrics.candidates+=candidates.length;
  for(const {n,distance,height} of candidates){
   const ux=(n.x-target[0])/distance,uz=(n.z-target[2])/distance,end=[target[0]+ux*inner,target[1],target[2]+uz*inner],run=distance-inner;
   const jumping=height>body.stepUp,duration=jumping?(body.jumpVel+Math.sqrt(Math.max(0,body.jumpVel**2-2*body.gravity*Math.min(height,jumpPeak))))/body.gravity:Math.max(.05,run/body.runSpeed);
   if(run/body.runSpeed>duration+.05)continue;metrics.arcs++;let clear=true;
   for(let i=0;i<=12;i++){
    const t=duration*i/12,travel=Math.min(run,body.runSpeed*t),y=jumping?n.y+body.jumpVel*t-.5*body.gravity*t*t:n.y+(target[1]-n.y)*i/12;
    feet.set(n.x-ux*travel,y+.01,n.z-uz*travel);metrics.bodySamples++;
    if(!P.bodyFits(feet,body.radius+.02,.32,body.height,false,.01)){clear=false;break;}
   }
   if(clear){const proof={sourceNode:n.id,start:[n.x,n.y,n.z],end,height,jumping};cache.set(key,proof);return proof;}
  }
  cache.set(key,null);return null;
 };
 return {find,maxJumpHeight,metrics,assurance:'Source-supported normal human run/jump approach; local inference; retail boarding/lift unverified'};
}
