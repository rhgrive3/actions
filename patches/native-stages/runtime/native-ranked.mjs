/** Explicit local objectives derived from reachable nav nodes. Never retail coordinates.
 * The Pnt display mesh is shared by all rules until original placement data exists. */
import {nativeTowerClearance} from './native-tower-clearance.mjs';
import {nativeArenaBasis} from './native-spawn.mjs';
import {nativeStageRuleStatus} from './rule-availability.mjs';
const sourceStageCache=new WeakMap();
function requireMode(stage,mode){if(mode==='tower'&&!stage.tower.supported){const error=new RangeError(stage.tower.reason);error.code='NATIVE_TOWER_SOURCE_CLEARANCE_UNSUPPORTED';throw error;}return stage;}
// Kosaraju without recursion: source stages can contain thousands of ledges.
// A tiny elevated floor near XZ center must not become the whole ranked arena.
export function nativeRankedComponent(N,paintable,spawnIds=[]){
 const reverse=Array.from({length:N.nodes.length},()=>[]),seen=new Uint8Array(N.nodes.length),order=[];
 for(const id of N.validIds)for(const e of N.nodes[id].nb)if(N.valid[e.to])reverse[e.to].push(id);
 for(const seed of N.validIds){
  if(seen[seed])continue;seen[seed]=1;const stack=[[seed,0]];
  while(stack.length){const top=stack.at(-1),edges=N.nodes[top[0]].nb;if(top[1]>=edges.length){order.push(top[0]);stack.pop();continue;}const to=edges[top[1]++].to;if(N.valid[to]&&!seen[to]){seen[to]=1;stack.push([to,0]);}}
 }
 const component=new Int32Array(N.nodes.length).fill(-1),groups=[];
 for(let i=order.length-1;i>=0;i--){const seed=order[i];if(component[seed]>=0)continue;const cid=groups.length,ids=[seed];component[seed]=cid;for(let j=0;j<ids.length;j++)for(const to of reverse[ids[j]])if(component[to]<0){component[to]=cid;ids.push(to);}groups.push(ids);}
 let reachable=null;
 for(const seed of spawnIds){if(!Number.isInteger(seed)||!N.valid[seed])throw Error('Native ranked spawn has no navigation support');const visited=new Uint8Array(N.nodes.length),queue=[seed];visited[seed]=1;for(let i=0;i<queue.length;i++)for(const e of N.nodes[queue[i]].nb)if(N.valid[e.to]&&!visited[e.to]){visited[e.to]=1;queue.push(e.to);}if(reachable)for(let i=0;i<reachable.length;i++)reachable[i]&=visited[i];else reachable=visited;}
 const paintCount=new Uint32Array(groups.length);for(const id of paintable)if(component[id]>=0&&(!reachable||reachable[id]))paintCount[component[id]]++;
 let best=-1;for(let i=0;i<groups.length;i++)if(paintCount[i]&&(best<0||paintCount[i]>paintCount[best]||paintCount[i]===paintCount[best]&&groups[i].length>groups[best].length))best=i;
 if(best<0||groups[best].length<10)throw Error('Native ranked center component is too small');
 return {common:groups[best],paintable:paintable.filter(id=>component[id]===best&&(!reachable||reachable[id])),reachable:N.validIds.filter(id=>!reachable||reachable[id]),reachablePaintable:paintable.filter(id=>!reachable||reachable[id])};
}
export function nativeRankedStage(G,requiredMode=null){
 const L=G.level,N=G.nav;if(!L?.native||!N?.validIds.length)throw Error('No reachable native ranked navigation');
 const body=G.physics.actorBody,bodyKey=[body.radius,body.height].join('/'),cached=sourceStageCache.get(N);
 // Navigation, original source masks and live capsule dimensions own this proof.
 // Turf ownership and temporary ranked meshes do not alter source triangles.
 if(cached?.level===L&&cached.mask===L.data.mask&&cached.bodyKey===bodyKey)return requireMode(cached.stage,requiredMode);
 const all=N.validIds;
 const nearest=(ids,x,z)=>{let best=null,score=Infinity;for(const id of ids){const n=N.nodes[id];if(n.zone>=0)continue;const d=(n.x-x)**2+(n.z-z)**2;if(d<score){score=d;best=n;}}return best;};
 const B=L.bounds,basis=nativeArenaBasis(L),mx=basis.origin.x,mz=basis.origin.z,axis=basis.forward,cross=basis.lateral;
 const dz=((B.maxX-B.minX)*Math.abs(axis.x)+(B.maxZ-B.minZ)*Math.abs(axis.z))*.2;
 const point=(along,lateral=0)=>[mx+axis.x*along+cross.x*lateral,mz+axis.z*along+cross.z*lateral];
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
 const playable=nativeRankedComponent(N,paintable,L.spawnPads.map(p=>N.nearest(p,1.2))),common=playable.common,middle=nearest(playable.paintable,mx,mz);
 const pick=(along,lateral=0)=>nearest(common,...point(along,lateral)),ends=[pick(-dz),pick(dz)];
 const configured=nativeStageRuleStatus(L.layout.id,'tower');let tower;
 if(configured?.supported===false)tower={...configured,path:[]};
 else try{tower={supported:true,...nativeTowerRoute(G,playable.reachable,playable.reachablePaintable,middle,ends,mx,mz,dz)};}catch(error){
  if(error.code!=='NATIVE_TOWER_SOURCE_CLEARANCE_UNSUPPORTED')throw error;
  tower={supported:false,status:'source-route-unverified',reason:'安全なヤグラ経路を確認できないため、このルールは利用できません。',evidence:error.message,path:[]};
 }
 const v=n=>[n.x,n.y,n.z],goals=[v(ends[1]),v(ends[0])],checkpoints=[[v(pick(dz*.5))],[v(pick(-dz*.5))]];
 const clams=[-1,1].flatMap(s=>[-1,0,1].map(t=>v(pick(s*dz*.6,t*6))));
 const projectedOrigin=mx*axis.x+mz*axis.z;
 const stage={id:L.layout.id,ruleAvailability:{tower:{supported:tower.supported,status:tower.status||'source-clear-local',reason:tower.reason||null}},zones:[{center:v(middle),size:[6,6]}],
  tower:{...tower,speed:1.2,checkpoints:[[{progress:.6,count:5}],[{progress:.6,count:5}]]},
  rainmaker:{center:v(middle),goals,checkpoints,retreatZ:[projectedOrigin-dz*1.7,projectedOrigin+dz*1.7],nativeRetreatAxis:[axis.x,axis.z]},clams:{spawns:clams,goals},
  calibration:'LOCAL reachable-nav calibration on Pnt display mesh. 11.3.0 ranked geometry, zones, routes, checkpoints and goals UNVERIFIED.',version1130Verified:false};
 sourceStageCache.set(N,{level:L,mask:L.data.mask,bodyKey,stage});return requireMode(stage,requiredMode);
}

/** Preserve the existing inferred route when its full swept volume is clear.
 * Otherwise find directed routes on source-clear supported navigation nodes.
 * A lower local lift is considered only after the ordinary lift has no route. */
export function nativeTowerRoute(G,common,paintable,middle,ends,mx,mz,dz){
 const basis=nativeArenaBasis(G.level),point=s=>[mx+basis.forward.x*s,mz+basis.forward.z*s];
 const N=G.nav,nearest=(ids,x,z)=>{let best=-1,score=Infinity;for(const id of ids){const n=N.nodes[id];if(n.zone>=0)continue;const d=(n.x-x)**2+(n.z-z)**2;if(d<score){score=d;best=id;}}return best;};
 let clearance=nativeTowerClearance(G.level,G.physics.actorBody);
 const position=(id,lift)=>{const n=N.nodes[id];return[n.x,n.y+lift,n.z];};
 const route=(graph,center,first,last,lift)=>{
  const a=graph.path(first,center,0,50000),b=graph.path(center,last,0,50000);if(!a||!b)return null;
  const ids=[...a,...b.slice(1)],path=ids.map(id=>position(id,lift));
  if(path.length<3||path.some((p,i)=>!clearance.clear(p,path[Math.max(0,i-1)])))return null;
  return {path,centerIndex:a.length-1,halfSize:clearance.halfSize,localLift:lift,sourceClearance:{...clearance.metrics,radius:clearance.radius,height:clearance.height,assurance:clearance.assurance}};
 };
 const original=route(N,middle.id,ends[0].id,ends[1].id,3.3);if(original)return original;
 const attempts=[];
 for(const [halfSize,lift] of [[1.2,3.3],[1.2,1.2],[1.2,.4],[.8,3.3],[.8,1.2],[.8,.4]]){
  clearance=nativeTowerClearance(G.level,G.physics.actorBody,halfSize);
  const allowed=new Uint8Array(N.nodes.length),edgeCache=new Map();
  for(const id of common)if(N.nodes[id].zone<0&&clearance.clear(position(id,lift)))allowed[id]=1;
  const nodes=N.nodes.map(n=>({...n,nb:allowed[n.id]?n.nb.filter(e=>{
   if(!allowed[e.to])return false;const key=Math.min(n.id,e.to)*N.nodes.length+Math.max(n.id,e.to);
   if(!edgeCache.has(key))edgeCache.set(key,clearance.clear(position(n.id,lift),position(e.to,lift)));
   return edgeCache.get(key);
  }):[]}));
  const graph={...N,nodes,valid:allowed,validIds:common.filter(id=>allowed[id]),_g:null,_from:null,_seen:null,_closed:null,_stamp:0,path:N.path};
  let selected;try{selected=nativeRankedComponent(graph,paintable.filter(id=>allowed[id]));}catch{attempts.push({halfSize,lift,allowed:graph.validIds.length,component:0});continue;}
  graph.valid.fill(0);for(const id of selected.common)graph.valid[id]=1;graph.validIds=selected.common;
  const center=nearest(selected.paintable,mx,mz),first=nearest(selected.common,...point(-dz)),last=nearest(selected.common,...point(dz));
  const calibrated=route(graph,center,first,last,lift);if(calibrated)return calibrated;
  attempts.push({halfSize,lift,allowed:common.filter(id=>allowed[id]).length,component:selected.common.length,center,first,last});
 }
 const error=new Error('Native ranked source has no clear supported tower route: '+JSON.stringify(attempts));error.code='NATIVE_TOWER_SOURCE_CLEARANCE_UNSUPPORTED';throw error;
}
