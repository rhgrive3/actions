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
 for(const {node} of candidates.slice(0,64)){const target=validate(node.x,node.z);if(target)return target;}
 return null;
}
