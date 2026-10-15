import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const available=!!root&&fs.existsSync(path.join(root,'shipshape','manifest.json'));

test('Shipshape original opposing bank pads lead both teams through full source routes',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(root,'shipshape');
 G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);G.nav=new f.NavGraph(G.level,G.physics);
 const N=G.nav,seeds=N.nativeSpawnNodeIds,reach=[];
 for(const seed of seeds){const seen=new Uint8Array(N.nodes.length),queue=[seed];seen[seed]=1;for(let i=0;i<queue.length;i++)for(const edge of N.nodes[queue[i]].nb)if(N.valid[edge.to]&&!seen[edge.to]){seen[edge.to]=1;queue.push(edge.to);}reach.push(seen);}
 const common=N.validIds.filter(id=>reach.every(r=>r[id])&&N.nodes[id].nativePaintable&&N.nodes[id].zone<0);
 const banks=[common.filter(id=>N.nodes[id].z<-54),common.filter(id=>N.nodes[id].z>54)];
 const diagnostic={id:'shipshape',seeds,validNodes:N.validIds.length,commonNodes:common.length,commonZ:[Math.min(...common.map(id=>N.nodes[id].z)),Math.max(...common.map(id=>N.nodes[id].z))],bankCounts:banks.map(a=>a.length),spawnReach:reach.map(r=>({nodes:N.validIds.filter(id=>r[id]).length,negativeBank:N.validIds.filter(id=>r[id]&&N.nodes[id].z<-54).length,positiveBank:N.validIds.filter(id=>r[id]&&N.nodes[id].z>54).length})),outerBankNodes:N.validIds.filter(id=>Math.abs(N.nodes[id].z)>50&&N.nodes[id].nativePaintable).map(id=>({id,x:N.nodes[id].x,y:N.nodes[id].y,z:N.nodes[id].z,zone:N.nodes[id].zone,reachable:reach.map(r=>!!r[id]),edges:N.nodes[id].nb.map(e=>({to:e.to,type:e.type}))}))};
 const frontiers=[];
 for(const id of common){const n=N.nodes[id];if(Math.abs(n.z)<38)continue;
  for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){const ix=n.ix+dx,iz=n.iz+dz;if(ix<0||iz<0||ix>=N.nx||iz>=N.nz)continue;
   for(const target of N.cells[iz*N.nx+ix]){const m=N.nodes[target];if(!N.valid[target]||reach.every(r=>r[target])||m.y-n.y<=1.25)continue;
    const origin=new THREE.Vector3(n.x,n.y+.3,n.z),direction=new THREE.Vector3(m.x-n.x,0,m.z-n.z).normalize(),h=G.physics.raycast(origin,direction,N.step+.25),role=h.triangle>=0?data.manifest.objects[G.level.triangleWorld.objectIds[h.triangle]]:null;
    frontiers.push({lower:[n.x,n.y,n.z],upper:[m.x,m.y,m.z],sourceWall:role?.name,material:role?.material,paintable:role?.paintable,wallFace:h.face,normal:h.hit?h.normal.toArray():null,transitionAccepted:!!f.nativeClimbTransition(N,n,m)});
   }
  }
 }
 diagnostic.sourceFrontiers=frontiers;
 if(process.env.SHIPSHAPE_BANK_REPORT)fs.writeFileSync(process.env.SHIPSHAPE_BANK_REPORT,JSON.stringify(diagnostic,null,2)+'\n');
 console.log(JSON.stringify({id:diagnostic.id,seeds:diagnostic.seeds,commonNodes:diagnostic.commonNodes,commonZ:diagnostic.commonZ,bankCounts:diagnostic.bankCounts,spawnReach:diagnostic.spawnReach,sourceFrontiers:frontiers.slice(0,12)}));
 assert.ok(banks.every(a=>a.length>5),'both teams reach actual paintable bank floors beyond z ±54');
 const goals=banks.map(ids=>ids.reduce((best,id)=>Math.abs(N.nodes[id].x)<Math.abs(N.nodes[best].x)?id:best,ids[0])),cases=[];
 for(let team=0;team<2;team++){
  const pad=G.level.spawnPads[team],hit=G.physics.raycast(pad.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),.6);
  assert.ok(hit.hit&&Math.abs(hit.point.y-pad.y)<.12&&hit.normal.y>.68);
  assert.ok(G.physics.bodyFits(pad,PLAYER.radius+.04,.32,PLAYER.height,false,.01));
  assert.equal(data.manifest.objects[G.level.triangleWorld.objectIds[hit.triangle]].name,'Fld_Twist00_Floor00Mesh_01_1__Floor00');
  for(const goal of goals){const route=N.path(seeds[team],goal,team,50000);assert.ok(route?.length>1,'actual directed full-map bank route');cases.push({team,start:seeds[team],target:goal,targetPosition:[N.nodes[goal].x,N.nodes[goal].y,N.nodes[goal].z],routeNodes:route.length,edgeTypes:[...new Set(route.slice(1).map((id,i)=>N.nodes[route[i]].nb.find(e=>e.to===id).type))]});}
 }
 const result={id:'shipshape',sourceSha256:data.manifest.sourceSha256,version1130Verified:false,bounds:G.level.bounds,spawnPads:G.level.spawnPads.map(p=>p.toArray()),nodes:N.nodes.length,validNodes:N.validIds.length,mutuallyReachableBankNodes:banks.map(a=>a.length),cases};
 console.log(JSON.stringify(result));if(process.env.SHIPSHAPE_BANK_REPORT)fs.writeFileSync(process.env.SHIPSHAPE_BANK_REPORT,JSON.stringify(result,null,2)+'\n');
});
