import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS,out=process.argv[2];
const f=await nativeFixture(),{G,THREE,PLAYER}=f;
const L=G.level=new f.NativeLevel(readStage(root,'bluefin')),P=G.physics=new f.NativePhysics(L),N=G.nav=new f.NavGraph(L,P);
const target=N.nodes[6540];
if(!target||target.x!==20||target.y!==3||target.z!==18.5)throw Error('Literal source target changed');
const reverse=Array.from({length:N.nodes.length},()=>[]);
for(const n of N.nodes)for(const e of n.nb)reverse[e.to].push({from:n.id,...e});
const bfs=seeds=>{const seen=new Set(seeds),q=[...seeds];for(let i=0;i<q.length;i++)for(const e of N.nodes[q[i]].nb)if(!seen.has(e.to)){seen.add(e.to);q.push(e.to);}return seen;};
const reach=N.nativeSpawnNodeIds.map(id=>bfs([id]));
const ancestors=new Set([target.id]),queue=[target.id];for(let i=0;i<queue.length;i++)for(const e of reverse[queue[i]])if(!ancestors.has(e.from)){ancestors.add(e.from);queue.push(e.from);}
const point=n=>new THREE.Vector3(n.x,n.y,n.z),describe=n=>{
 const h=P.raycast(point(n).add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0),.4);
 return{id:n.id,position:[n.x,n.y,n.z],valid:!!N.valid[n.id],nativePaintable:n.nativePaintable,teamReach:reach.map(s=>s.has(n.id)),source:h.hit?{triangle:h.triangle,face:h.face,point:h.point.toArray(),normal:h.normal.toArray(),object:L.manifest.objects[L.data.objectIds[h.triangle]].name}:null};
};
const region=N.nodes.filter(n=>n.x>=18&&n.x<=22&&n.z>=16.5&&n.z<=20.5&&Math.abs(n.y-3)<.15);
const incoming=reverse[target.id].map(e=>({...e,node:describe(N.nodes[e.from])}));
const closest=N.validIds.map(id=>N.nodes[id]).filter(n=>Math.abs(n.y-3)<1.25).sort((a,b)=>point(a).distanceToSquared(point(target))-point(b).distanceToSquared(point(target))).slice(0,16).map(describe);
const frontier=[];
for(const n of N.nodes.filter(n=>ancestors.has(n.id)&&Math.abs(n.y-3)<1.25))for(const dz of [-2,-1,0,1,2])for(const dx of [-2,-1,0,1,2]){
 if(!dx&&!dz||Math.abs(dx)+Math.abs(dz)>2)continue;const ix=n.ix+dx,iz=n.iz+dz;
 if(ix<0||iz<0||ix>=N.nx||iz>=N.nz)continue;
 for(const id of N.cells[iz*N.nx+ix]){
  const m=N.nodes[id];if(!N.valid[m.id]||Math.abs(n.y-m.y)>1.25||m.nb.some(e=>e.to===n.id))continue;
  const from=point(m).add(new THREE.Vector3(0,.65,0)),to=point(n).add(new THREE.Vector3(0,.65,0)),delta=to.clone().sub(from),length=delta.length(),h=P.raycast(from,delta.normalize(),length);
  frontier.push({from:describe(m),to:describe(n),horizontalDistance:Math.hypot(m.x-n.x,m.z-n.z),heightRise:n.y-m.y,ordinaryLiftLOS:P.los(from,to),diagonalSupports:dx&&dz?[N._has(m.ix+Math.sign(n.ix-m.ix),m.iz,m.y),N._has(m.ix,m.iz+Math.sign(n.iz-m.iz),m.y)]:null,blockingRay:h.hit?{triangle:h.triangle,face:h.face,point:h.point.toArray(),normal:h.normal.toArray(),object:L.manifest.objects[L.data.objectIds[h.triangle]].name}:null});
 }
}
frontier.sort((a,b)=>Math.hypot(a.to.position[0]-20,a.to.position[2]-18.5)-Math.hypot(b.to.position[0]-20,b.to.position[2]-18.5));
const report={foundation:'4d0d88ef05cd2fc5389bddcdcf3a7539fc926dd2',recipe:'inkwave-browser-source-v4',flags:L.manifest.sourceNavigation,originalPads:L.spawnPads.map(p=>p.toArray()),candidateNodes:N.nodes.length,validNodes:N.validIds.length,spawnSeeds:N.nativeSpawnNodeIds,teamReachCounts:reach.map(s=>s.size),target:describe(target),incoming,region:region.map(n=>({...describe(n),incoming:reverse[n.id].map(e=>({from:e.from,type:e.type,valid:!!N.valid[e.from]})),outgoing:n.nb.map(e=>({to:e.to,type:e.type,valid:!!N.valid[e.to]}))})),reverseAncestorCount:ancestors.size,reachableAncestors:queue.filter(id=>N.valid[id]).length,closestReachableY3:closest,frontierPairs:frontier.length,closestFrontierPairs:frontier.slice(0,32),conditions:'Read-only existing source graph/adjacency/actual ray support. No graph, definition, geometry, masks or Actor state edits; no new flight or running-jump admission.'};
fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({target:report.target,incomingCount:incoming.length,regionNodes:region.length,reachableRegionNodes:region.filter(n=>N.valid[n.id]).length,reverseAncestorCount:ancestors.size,reachableAncestors:report.reachableAncestors,frontierPairs:frontier.length,closestReachableY3:closest.slice(0,4),evidence:out}));
