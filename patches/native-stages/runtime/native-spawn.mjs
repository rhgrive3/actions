/** Inferred local arena orientation from opposing supported pads. Source geometry
 * stays in its original coordinates; this is not recovered retail placement. */
export function nativeArenaBasis(level){
 if(!level?.native)return null;
 const coordinate=(p,key,index)=>Array.isArray(p)?p[index]:p?.[key],pads=level.spawnPads;
 const ax=coordinate(pads?.[0],'x',0),az=coordinate(pads?.[0],'z',2),bx=coordinate(pads?.[1],'x',0),bz=coordinate(pads?.[1],'z',2);
 if(![ax,az,bx,bz].every(Number.isFinite))throw Error('Native arena lacks opposing support coordinates');
 const dx=bx-ax,dz=bz-az,span=Math.hypot(dx,dz);
 if(!(span>1e-6))throw Error('Native arena opposing supports coincide');
 const forward={x:dx/span,z:dz/span};
 return {forward,lateral:{x:forward.z,z:-forward.x},origin:{x:(ax+bx)*.5,z:(az+bz)*.5},halfSpan:span*.5};
}
export function nativeSpawnYaw(level,team,legacyYaw){
 const basis=nativeArenaBasis(level);if(!basis)return legacyYaw;
 const sign=team===0?1:-1;return Math.atan2(basis.forward.x*sign,basis.forward.z*sign);
}
/** Only local native ranked configs supply this axis. Ordinary retreatZ keeps Z. */
export function nativeRetreatCoordinate(config,pos){
 const axis=config?.nativeRetreatAxis;
 if(!Array.isArray(axis)||axis.length!==2||!axis.every(Number.isFinite)||Math.abs(Math.hypot(...axis)-1)>1e-6)return pos[2];
 return pos[0]*axis[0]+pos[2]*axis[1];
}

/** Local deterministic fallback only when the ordinary aim/slot has no support.
 * Every candidate comes from source-triangle nav and is revalidated by the
 * existing Actor._resolve through the caller. These are not retail coordinates. */
export function nativeInitialLanding(G,actor,validate){
 if(!G.level?.native||!G.nav?.nodes||typeof validate!=='function')return null;
 const pad=G.level.spawnPads[actor.team],sign=actor.team===0?1:-1,basis=nativeArenaBasis(G.level),candidates=[];
 for(const node of G.nav.nodes){
  if(!G.nav.valid[node.id])continue;
  const dx=node.x-pad.x,dz=node.z-pad.z,d=Math.hypot(dx,dz);
  const forward=(dx*basis.forward.x+dz*basis.forward.z)*sign,cross=dx*basis.lateral.x+dz*basis.lateral.z;
  if(d<2.5||d>12||forward<0)continue;
  candidates.push({node,score:Math.abs(d-7.5)+Math.abs(cross)*.25+Math.max(0,node.y-pad.y)*2});
 }
 candidates.sort((a,b)=>a.score-b.score||a.node.id-b.node.id);
 for(const {node} of candidates.slice(0,64)){const target=validate(node.x,node.z,node.y);if(target)return {...target,nativeSourceY:node.y};}
 return null;
}
const botLandingCache=new WeakMap();

/** Local native AI policy. A safe roof can still be a directed dead end.
 * Select a real source layer that can reach the same common paint component
 * as local objectives; never move/erase geometry or change human free aim. */
export function nativeBotInitialLanding(G,actor,validate,getPlayable){
 const L=G.level,N=G.nav;if(!L?.native||N?.level!==L||!N?.validIds?.length||typeof validate!=='function'||typeof getPlayable!=='function')return null;
 let cache=botLandingCache.get(N);
 if(!cache||cache.level!==L||cache.dead!==G.paint.dead){
  const common=getPlayable(G).common,reverse=Array.from({length:N.nodes.length},()=>[]),teams=[];
  for(const id of N.validIds)for(const edge of N.nodes[id].nb)if(N.valid[edge.to])reverse[edge.to].push(id);
  for(const team of [0,1]){
   const reachable=new Uint8Array(N.nodes.length),queue=common.filter(id=>N.nodes[id].zone!==1-team);
   for(const id of queue)reachable[id]=1;
   for(let i=0;i<queue.length;i++)for(const id of reverse[queue[i]])if(!reachable[id]&&N.nodes[id].zone!==1-team){reachable[id]=1;queue.push(id);}
   teams.push(reachable);
  }
  cache={level:L,dead:G.paint.dead,teams};botLandingCache.set(N,cache);
 }
 const pad=L.spawnPads[actor.team],basis=nativeArenaBasis(L),sign=actor.team===0?1:-1,slot=Number.isSafeInteger(actor.slot)?((actor.slot%4)+4)%4:0;
 const angle=nativeSpawnYaw(L,actor.team,actor.team===0?0:Math.PI)+(slot-1.5)*.3;
 const preferred={x:pad.x+Math.sin(angle)*7.5,z:pad.z+Math.cos(angle)*7.5},candidates=[];
 for(const id of N.validIds){
  if(!cache.teams[actor.team][id])continue;const node=N.nodes[id],dx=node.x-pad.x,dz=node.z-pad.z,d=Math.hypot(dx,dz);
  if(d<2.5||d>12||(dx*basis.forward.x+dz*basis.forward.z)*sign<0)continue;
  candidates.push({node,score:Math.hypot(node.x-preferred.x,node.z-preferred.z)+Math.max(0,node.y-pad.y)*2});
 }
 candidates.sort((a,b)=>a.score-b.score||a.node.id-b.node.id);
 for(const {node} of candidates){const target=validate(node.x,node.z,node.y);if(target&&Math.abs(target.y-node.y)<=.5)return {...target,nativeSourceY:node.y};}
 return null;
}
