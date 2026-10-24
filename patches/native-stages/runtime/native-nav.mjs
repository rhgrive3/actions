import * as THREE from 'three';
const EMPTY_CELL = Object.freeze([]);
import { PLAYER } from '../../../src/config.js';
import { nativeClimbTransition } from './native-climb.mjs';
import {nativeDropTransition} from './native-drop.mjs';
import {nativeSurgeTransition} from './native-surge.mjs';
import {nativeJumpAttachTransition} from './native-jump-attach.mjs';
import {nativeWallApproachTransition,nativeApproachJumpTransition} from './native-approach.mjs';
const CARDINAL_TWO=[[2,0],[-2,0],[0,2],[0,-2]],CARDINAL_DIRECTIONS=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
const WALKABLE_RAY={minNormalY:.68};
const navHit=()=>({point:new THREE.Vector3(),normal:new THREE.Vector3()});
/** Keep real routes out of both supported spawn layers. The legacy largest
 * undirected component can be a decorative floor far beneath a native deck. */
export function pruneNativeNav(graph){for(const _ of pruneNativeNavSteps(graph)){} }
function* pruneNativeNavSteps(graph){
 const down=new THREE.Vector3(0,-1,0),origin=new THREE.Vector3();
 const L=graph.level,P=graph.physics,step=graph.step,seeds=[],supportHit=navHit(),walkHit=navHit();
 for(const pad of L.spawnPads){
  const support=L.triangleWorld.ray(origin.set(pad.x,pad.y+.3,pad.z),down,.6,WALKABLE_RAY,supportHit);
  if(!support||Math.abs(support.point.y-pad.y)>.15)throw Error('Native navigation spawn lacks source support');
  const candidates=[],px=Math.round((pad.x-graph.x0)/step),pz=Math.round((pad.z-graph.z0)/step);
  if(Array.isArray(graph.cells)&&Number.isInteger(graph.nx)&&Number.isInteger(graph.nz)&&graph.cells.length===graph.nx*graph.nz){
   for(let iz=Math.max(0,pz-3);iz<=Math.min(graph.nz-1,pz+3);iz++)for(let ix=Math.max(0,px-3);ix<=Math.min(graph.nx-1,px+3);ix++)for(const id of graph.cells[iz*graph.nx+ix]){
    const n=graph.nodes[id];if(Math.abs(n.y-support.point.y)<=.7&&Math.hypot(n.x-pad.x,n.z-pad.z)<=step*1.6)candidates.push(n);
   }
  }else for(const n of graph.nodes)if(Math.abs(n.y-support.point.y)<=.7&&Math.hypot(n.x-pad.x,n.z-pad.z)<=step*1.6)candidates.push(n);
  candidates.sort((a,b)=>a.id-b.id);
  candidates.sort((n,m)=>((n.x-pad.x)**2+(n.z-pad.z)**2+(n.y-support.point.y)**2*6)-((m.x-pad.x)**2+(m.z-pad.z)**2+(m.y-support.point.y)**2*6));
  let seed=-1;
  for(const n of candidates){
   const count=Math.max(1,Math.ceil(Math.hypot(n.x-pad.x,n.z-pad.z)/.2));let clear=true;
   for(let i=0;i<=count;i++){
    const t=i/count,x=pad.x+(n.x-pad.x)*t,z=pad.z+(n.z-pad.z)*t,y=support.point.y+(n.y-support.point.y)*t;
    const h=L.triangleWorld.ray(origin.set(x,y+.25,z),down,.5,WALKABLE_RAY,walkHit);
    if(!h||Math.abs(h.point.y-y)>.2||!P.bodyFits(origin.set(x,h.point.y+.01,z),PLAYER.radius+.04,.32,PLAYER.height,false,.01)){clear=false;break;}
   }
   if(clear){seed=n.id;break;}
  }
  if(seed<0)throw Error('Native navigation spawn has no clear source-supported node');
  seeds.push(seed);
  yield 'spawn';
 }
 const valid=new Uint8Array(graph.nodes.length),queue=[];
 for(const seed of seeds)if(!valid[seed]){valid[seed]=1;queue.push(seed);}
 for(let i=0;i<queue.length;i++){
  for(const edge of graph.nodes[queue[i]].nb)if(!valid[edge.to]){valid[edge.to]=1;queue.push(edge.to);}
  yield 'prune';
 }
 graph.valid=valid;graph.validIds=[];
 for(let i=0;i<graph.nodes.length;i++){if(valid[graph.nodes[i].id])graph.validIds.push(graph.nodes[i].id);if((i&255)===255)yield 'prune';}
 graph.nativeSpawnNodeIds=seeds;
}
/** Populate the existing NavGraph/A* contract from triangle support, not chart boxes. */
export function buildNativeNav(graph){for(const _ of buildNativeNavSteps(graph)){} }
// Both entry points consume the same ordered builder. Yield only between fully
// finished cells/edge candidates: each transition keeps synchronous ownership.
export function* buildNativeNavSteps(graph){
 const down=new THREE.Vector3(0,-1,0),origin=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
 const rayHit=navHit();
 const L=graph.level,w=L.triangleWorld,B=L.bounds,st=graph.step,walkRise=L.manifest.sourceNavigation?.highDrops?Math.min(.5,PLAYER.stepUp):.5;
 graph.x0=B.minX+st*.5;graph.z0=B.minZ+st*.5;
 graph.nx=Math.floor((B.maxX-B.minX)/st);graph.nz=Math.floor((B.maxZ-B.minZ)/st);
 graph.cells=new Array(graph.nx*graph.nz).fill(EMPTY_CELL);
 const top=w.nodes[4]+1,bottom=w.nodes[1]-1;
 for(let iz=0;iz<graph.nz;iz++)for(let ix=0;ix<graph.nx;ix++){
  const x=graph.x0+ix*st,z=graph.z0+iz*st;let list=EMPTY_CELL,from=top;
  for(let layer=0;layer<8&&from>bottom;layer++){
   const h=w.ray(origin.set(x,from,z),down,from-bottom,WALKABLE_RAY,rayHit);if(!h)break;
   const y=h.point.y;from=y-.2;
   if(!graph.physics.bodyFits(origin.set(x,y+.01,z),PLAYER.radius+.04,.32,PLAYER.height,false,.01))continue;
   const node={id:graph.nodes.length,x,y,z,ix,iz,nb:[],zone:-1,nativePaintable:!!(h.flags&2)&&L.data.triangleFace[h.triangle]>=0};
   for(let t=0;t<2;t++){const p=L.spawnPads[t];if(Math.hypot(x-p.x,z-p.z)<L.spawnBarrier+.6&&y>p.y-1)node.zone=t;}
   if(list===EMPTY_CELL)graph.cells[iz*graph.nx+ix]=list=[];
   graph.nodes.push(node);list.push(node.id);
  }
  yield 'sample';
 }
 const jumpAttachments=L.manifest.sourceNavigation?.wallJumpAttach?Array.from({length:graph.nodes.length},()=>[]):null;
 const drops=L.manifest.sourceNavigation?.highDrops?Array.from({length:graph.nodes.length},()=>[]):null;
 const surges=L.manifest.sourceNavigation?.wallSurge?Array.from({length:graph.nodes.length},()=>[]):null;
 for(const n of graph.nodes){
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dz)continue;const ix=n.ix+dx,iz=n.iz+dz;
   if(ix<0||iz<0||ix>=graph.nx||iz>=graph.nz)continue;
   for(const id of graph.cells[iz*graph.nx+ix]){
    yield 'edges';
    const m=graph.nodes[id],dy=m.y-n.y;let type,cost;
    if(dy>=-.5&&dy<=walkRise){if(dx&&dz&&(!graph._has(n.ix+dx,n.iz,n.y)||!graph._has(n.ix,n.iz+dz,n.y)))continue;type='walk';cost=Math.hypot(dx,dz)*st;}
    else if(!(dx&&dz)&&dy>walkRise&&dy<=1.25){type='jump';cost=st+2.5;}
    // The stock 3.4-unit drop cap is an AI policy for the small blockouts.
    // Native high ledges can drop safely to verified support above fall death.
    else if(!(dx&&dz)&&dy<-.5&&m.y>PLAYER.fallDeathY){type='drop';cost=st+.8;}
    else {
     if(!(dx&&dz)){const edge=nativeClimbTransition(graph,n,m);if(edge)n.nb.push(edge);else{if(jumpAttachments&&dy>1.25)jumpAttachments[n.id].push(id);if(surges&&dy>1.25)surges[n.id].push(id);}}
     continue;
    }
    if(type==='drop'&&drops&&dy< -1.25){drops[n.id].push(id);continue;}
    const lift=type==='walk'?.65:1.5;
    if(!graph.physics.los(a.set(n.x,n.y+lift,n.z),b.set(m.x,m.y+lift,m.z))){
     continue;
    }
    n.nb.push({to:id,cost,type});
   }
  }
  yield 'edges';
 }
 // A source wall can consume a whole centre sample: the next valid upper
 // support is then two cells away. Only the opted, fully swept Surge/drop screens
 // may qualify that actual support pair; ordinary edges remain unchanged.
 if(surges||drops)for(const n of graph.nodes){for(const [dx,dz]of CARDINAL_TWO){
  const ix=n.ix+dx,iz=n.iz+dz;if(ix<0||iz<0||ix>=graph.nx||iz>=graph.nz)continue;
  for(const id of graph.cells[iz*graph.nx+ix]){const dy=graph.nodes[id].y-n.y;if(surges&&dy>1.25)surges[n.id].push(id);if(drops&&dy< -1.25)drops[n.id].push(id);}
 }yield 'departures';}
 yield* pruneNativeNavSteps(graph);
 if(drops||surges||jumpAttachments||L.manifest.sourceNavigation?.wallApproach){
  // Build ordinary/climb edges before selecting any supports. Only expensive
  // departure simulations need the directed spawn frontier; upper masts that
  // cannot be reached do not require speculative trajectories.
  const seen=graph.valid.slice(),queue=graph.validIds.slice();
  for(let i=0;i<queue.length;i++){
   const n=graph.nodes[queue[i]];
   if(L.manifest.sourceNavigation?.wallApproach){
    for(const [dx,dz]of CARDINAL_TWO){const ix=n.ix+dx,iz=n.iz+dz;if(ix<0||iz<0||ix>=graph.nx||iz>=graph.nz)continue;for(const id of graph.cells[iz*graph.nx+ix]){yield 'transitions';const edge=nativeApproachJumpTransition(graph,n,graph.nodes[id]);if(edge&&!n.nb.some(e=>e.to===edge.to))n.nb.push(edge);}}
    if(n.nativePaintable)for(const direction of CARDINAL_DIRECTIONS){yield 'transitions';const edge=nativeWallApproachTransition(graph,n,direction);if(edge&&!n.nb.some(e=>e.to===edge.to))n.nb.push(edge);}
   }
   for(const id of jumpAttachments?.[n.id]||[]){yield 'transitions';const edge=nativeJumpAttachTransition(graph,n,graph.nodes[id]);if(edge&&!n.nb.some(e=>e.to===edge.to))n.nb.push(edge);}
   for(const id of surges?.[n.id]||[]){yield 'transitions';const edge=nativeSurgeTransition(graph,n,graph.nodes[id]);if(edge&&!n.nb.some(e=>e.to===edge.to))n.nb.push(edge);}
   for(const id of drops?.[n.id]||[]){yield 'transitions';const edge=nativeDropTransition(graph,n,graph.nodes[id]);if(edge&&!n.nb.some(e=>e.to===edge.to))n.nb.push(edge);}
   for(const edge of n.nb)if(!seen[edge.to]){seen[edge.to]=1;queue.push(edge.to);}
   yield 'transitions';
  }
  yield* pruneNativeNavSteps(graph);
 }
}

function yieldNativeNav(signal){
 return new Promise((resolve,reject)=>{
  let frame,settled=false;
  const finish=(error)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);if(error){if(frame!==undefined)cancelAnimationFrame(frame);reject(error);}else resolve();};
  const abort=()=>finish(new DOMException('Aborted','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  frame=requestAnimationFrame(()=>finish());
 });
}
/** Detached, cancellable main-thread fallback: no worker copies of source arrays. */
export async function buildNativeNavAsync(graph,{signal,current=()=>true,budgetMilliseconds=4,
 now=()=>performance.now(),yieldTask=()=>yieldNativeNav(signal)}={}){
 const check=()=>{if(signal?.aborted||!current())throw new DOMException('Aborted','AbortError');};
 const budget=Number.isFinite(budgetMilliseconds)&&budgetMilliseconds>0?budgetMilliseconds:4;
 const started=now(),steps=buildNativeNavSteps(graph);
 let sliceStart=started,maxSliceMilliseconds=0,yieldCount=0;
 check();
 try{
  for(let next=steps.next();;next=steps.next()){
   const elapsed=now()-sliceStart;
   if(next.done){maxSliceMilliseconds=Math.max(maxSliceMilliseconds,elapsed);break;}
   if(elapsed>=budget){
    maxSliceMilliseconds=Math.max(maxSliceMilliseconds,elapsed);yieldCount++;
    check();await yieldTask();check();sliceStart=now();
   }
  }
  check();
  graph.nativeBuildMetrics={maxSliceMilliseconds,yieldCount,elapsedMilliseconds:now()-started};
  return graph;
 }finally{steps.return();}
}
