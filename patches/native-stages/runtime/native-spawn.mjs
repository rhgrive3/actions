/** Local deterministic fallback only when the ordinary aim/slot has no support.
 * Every candidate comes from source-triangle nav and is revalidated by the
 * existing Actor._resolve through the caller. These are not retail coordinates. */
export function nativeInitialLanding(G,actor,validate){
 if(!G.level?.native||!G.nav?.nodes||typeof validate!=='function')return null;
 const pad=G.level.spawnPads[actor.team],sign=actor.team===0?1:-1,candidates=[];
 for(const node of G.nav.nodes){
  if(!G.nav.valid[node.id])continue;
  const dx=node.x-pad.x,dz=node.z-pad.z,d=Math.hypot(dx,dz);
  if(d<2.5||d>12||dz*sign<0)continue;
  candidates.push({node,score:Math.abs(d-7.5)+Math.abs(dx)*.25+Math.max(0,node.y-pad.y)*2});
 }
 candidates.sort((a,b)=>a.score-b.score||a.node.id-b.node.id);
 for(const {node} of candidates.slice(0,64)){const target=validate(node.x,node.z);if(target)return target;}
 return null;
}
