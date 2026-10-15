import { nativeZone } from './native-zone.mjs';
/** Explicit local objectives derived from reachable nav nodes. Never retail coordinates.
 * The Pnt display mesh is shared by all rules until original placement data exists. */
export function nativeRankedStage(G){
 const L=G.level,N=G.nav;if(!L?.native||!N?.validIds.length)throw Error('No reachable native ranked navigation');
 const all=N.validIds;
 const nearest=(ids,x,z)=>{let best=null,score=Infinity;for(const id of ids){const n=N.nodes[id];if(n.zone>=0)continue;const d=(n.x-x)**2+(n.z-z)**2;if(d<score){score=d;best=n;}}return best;};
 const B=L.bounds,mx=(B.minX+B.maxX)*.5,mz=(B.minZ+B.maxZ)*.5,dz=(B.maxZ-B.minZ)*.2;
 // Drop edges are directed. Use the center's mutually reachable component,
 // rather than treating the original undirected prune as a playable uphill route.
 const probe=L.spawnPads[0].clone(),down=probe.clone().set(0,-1,0);
 const paintable=all.filter(id=>{
  const n=N.nodes[id],h=L.triangleWorld.ray(probe.set(n.x,n.y+.1,n.z),down,.3,{minNormalY:.7});
  if(!h)return false;const fid=L.data.triangleFace[h.triangle],f=L.faces[fid];
  if(!f?.turf)return false;
  const rel=probe.copy(h.point).sub(f.origin),u=rel.dot(f.u),v=rel.dot(f.v),i=Math.max(0,Math.min(f.nu-1,Math.floor(u/f.cu))),j=Math.max(0,Math.min(f.nv-1,Math.floor(v/f.cv)));
  return !G.paint.dead[f.grid+j*f.nu+i];
 });
 if(!paintable.length)throw Error('Native ranked stage has no live paint floor');
 const middle=nearest(paintable,mx,mz),reverse=Array.from({length:N.nodes.length},()=>[]);
 for(const n of N.nodes)for(const edge of n.nb)reverse[edge.to].push(n.id);
 const reach=(seed,backward)=>{const seen=new Set([seed]),queue=[seed];for(let i=0;i<queue.length;i++){const id=queue[i],next=backward?reverse[id]:N.nodes[id].nb.map(e=>e.to);for(const j of next)if(N.valid[j]&&!seen.has(j)){seen.add(j);queue.push(j);}}return seen;};
 const forward=reach(middle.id,false),back=reach(middle.id,true),common=all.filter(id=>forward.has(id)&&back.has(id));
 if(common.length<10)throw Error('Native ranked center component is too small');
 const pick=(x,z)=>nearest(common,x,z),ends=[pick(mx,mz-dz),pick(mx,mz+dz)];
 const nodePath=N.path(ends[0].id,middle.id,0,50000),other=N.path(middle.id,ends[1].id,0,50000);
 if(!nodePath||!other)throw Error('Native ranked center has no directed route');
 const path=[...nodePath,...other.slice(1)].map(id=>{const n=N.nodes[id];return[n.x,n.y+3.3,n.z];});
 const v=n=>[n.x,n.y,n.z],goals=[v(ends[1]),v(ends[0])],checkpoints=[[v(pick(mx,mz+dz*.5))],[v(pick(mx,mz-dz*.5))]];
 const clams=[-1,1].flatMap(s=>[-1,0,1].map(t=>v(pick(mx+t*6,mz+s*dz*.6))));
 const commonSet=new Set(common),zone=nativeZone(paintable.filter(id=>commonSet.has(id)).map(id=>N.nodes[id]),middle,N.step,
  (x,y,z)=>!!L.triangleWorld.ray(probe.set(x,y+.55,z),down,1.1,{minNormalY:.7}));
 return {id:L.layout.id,zones:[zone],
  tower:{path,centerIndex:nodePath.length-1,halfSize:1.2,speed:1.2,checkpoints:[[{progress:.6,count:5}],[{progress:.6,count:5}]]},
  rainmaker:{center:v(middle),goals,checkpoints,retreatZ:[mz-dz*1.7,mz+dz*1.7]},clams:{spawns:clams,goals},
  calibration:'LOCAL reachable-nav calibration on Pnt display mesh. 11.3.0 ranked geometry, zones, routes, checkpoints and goals UNVERIFIED.',version1130Verified:false};
}
