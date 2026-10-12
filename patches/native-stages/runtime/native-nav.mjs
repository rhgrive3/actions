import * as THREE from 'three';
import { PLAYER } from '../../../src/config.js';
const down=new THREE.Vector3(0,-1,0),origin=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
/** Populate the existing NavGraph/A* contract from triangle support, not chart boxes. */
export function buildNativeNav(graph){
 const L=graph.level,w=L.triangleWorld,B=L.bounds,st=graph.step;
 graph.x0=B.minX+st*.5;graph.z0=B.minZ+st*.5;
 graph.nx=Math.floor((B.maxX-B.minX)/st);graph.nz=Math.floor((B.maxZ-B.minZ)/st);
 graph.cells=Array.from({length:graph.nx*graph.nz},()=>[]);
 const top=w.nodes[4]+1,bottom=w.nodes[1]-1;
 for(let iz=0;iz<graph.nz;iz++)for(let ix=0;ix<graph.nx;ix++){
  const x=graph.x0+ix*st,z=graph.z0+iz*st,list=graph.cells[iz*graph.nx+ix];let from=top;
  for(let layer=0;layer<8&&from>bottom;layer++){
   const h=w.ray(origin.set(x,from,z),down,from-bottom,{minNormalY:.68});if(!h)break;
   const y=h.point.y;from=y-.2;
   if(!graph.physics.bodyFits(origin.set(x,y+.01,z),PLAYER.radius+.04,.32,PLAYER.height,false,.01))continue;
   const node={id:graph.nodes.length,x,y,z,ix,iz,nb:[],zone:-1};
   for(let t=0;t<2;t++){const p=L.spawnPads[t];if(Math.hypot(x-p.x,z-p.z)<L.spawnBarrier+.6&&y>p.y-1)node.zone=t;}
   graph.nodes.push(node);list.push(node.id);
  }
 }
 for(const n of graph.nodes){
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dz)continue;const ix=n.ix+dx,iz=n.iz+dz;
   if(ix<0||iz<0||ix>=graph.nx||iz>=graph.nz)continue;
   for(const id of graph.cells[iz*graph.nx+ix]){
    const m=graph.nodes[id],dy=m.y-n.y;let type,cost;
    if(Math.abs(dy)<=.5){if(dx&&dz&&(!graph._has(n.ix+dx,n.iz,n.y)||!graph._has(n.ix,n.iz+dz,n.y)))continue;type='walk';cost=Math.hypot(dx,dz)*st;}
    else if(!(dx&&dz)&&dy>.5&&dy<=1.25){type='jump';cost=st+2.5;}
    else if(!(dx&&dz)&&dy<-.5&&dy>=-3.4){type='drop';cost=st+.8;}
    else continue;
    const lift=type==='walk'?.65:1.5;
    if(!graph.physics.los(a.set(n.x,n.y+lift,n.z),b.set(m.x,m.y+lift,m.z)))continue;
    n.nb.push({to:id,cost,type});
   }
  }
 }
 graph._prune();
}
