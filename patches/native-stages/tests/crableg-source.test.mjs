import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';
import {nativeArenaBasis} from '../runtime/native-spawn.mjs';
import {nativeTowerClearance} from '../runtime/native-tower-clearance.mjs';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';

const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const enabled=!!root&&fs.existsSync(path.join(root,'crableg','manifest.json'));

test('Crableg records the pinned Spider00 identity and opposed complete source banks',()=>{
 const s=nativeStageCatalog().stages.find(s=>s.id==='crableg');
 assert.equal(s.internal,'Vss_Spider00');
 assert.equal(s.tree,'76fb75d5a7ad6edcfb8640df6894cb5687bc127d');
 assert.equal(s.sourceSha256,'6f0c27703e7fbe5a02e442431ee88d811ac794849966a82a27b1f96b2c4578c7');
 assert.equal(s.version1130Verified,false);
 assert(s.spawnPads[0][0]>20&&s.spawnPads[0][2]<-60&&s.spawnPads[1][0]<-20&&s.spawnPads[1][2]>60);
 assert(s.bounds.minX<=-49&&s.bounds.maxX>=49&&s.bounds.minZ<=-72&&s.bounds.maxZ>=72);
 assert(s.placementStatus.includes('unverified'));
});

test('Crableg original bank support, complete directed field, live movement and ranked clearance',{skip:!enabled},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(root,'crableg');
 const digest=()=>{const h=crypto.createHash('sha256');for(const a of [data.vertices,data.indices,data.triangles])h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));return h.digest('hex');};
 const before=digest(),L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
 const objects=data.manifest.objects,pads=[];
 assert(objects.filter(o=>o.name.startsWith('FldObj_Spider00_PackPnt_')).every(o=>o.active));
 assert(objects.filter(o=>/^FldObj_Spider00_Pack(?:Var|Vlf|Vgl|Vcl)_/.test(o.name)).every(o=>!o.active));
 for(const o of objects.filter(o=>o.active&&/GeneralBoxNoPaint|__(?:FldSpiderNoPaintUDIM00|NoPaintedVLoop00|FloorWireNetN(?:_Yellow)?)$/.test(o.name)))assert.equal(o.paintable,false,o.name);
 for(const [team,pad] of L.spawnPads.entries()){
  const h=P.raycast(pad.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),.6);
  assert(h.hit&&h.triangle>=0&&h.normal.y>.99&&Math.abs(h.point.y-pad.y)<.03);
  const name=objects[L.triangleWorld.objectIds[h.triangle]].name;
  assert(/^Fld_Spider00_.*__(?:MetalPlateSteel|FloorLine00|MetalPlateAshiba00)$/.test(name));
  assert(P.bodyFits(pad,PLAYER.radius+.04,.32,PLAYER.height));
  G.paint.splat(h.point.clone().addScaledVector(h.normal,.03),1.5,team,{seed:.125,instant:true});
  assert.equal(G.paint.sample(h.face,h.u,h.v),team+1);
  pads.push({team,pad:pad.toArray(),sourcePoint:h.point.toArray(),sourceTriangle:h.triangle,sourceObject:name,capsuleClear:true});
 }
 for(let i=0;i<G.paint.dead.length;i++)if(G.paint.dead[i])assert.equal(G.paint.grid[i],0);
 const N=G.nav=new f.NavGraph(L,P),seeds=N.nativeSpawnNodeIds;
 const reach=seeds.map(seed=>{const seen=new Set([seed]),q=[seed];for(let j=0;j<q.length;j++)for(const e of N.nodes[q[j]].nb)if(!seen.has(e.to)){seen.add(e.to);q.push(e.to);}return seen;});
 const common=N.validIds.filter(id=>reach.every(s=>s.has(id))),paintable=common.filter(id=>N.nodes[id].nativePaintable);
 const extent={minX:Math.min(...common.map(id=>N.nodes[id].x)),maxX:Math.max(...common.map(id=>N.nodes[id].x)),minZ:Math.min(...common.map(id=>N.nodes[id].z)),maxZ:Math.max(...common.map(id=>N.nodes[id].z))};
 console.log(JSON.stringify({crablegSourceNav:{nodes:N.nodes.length,valid:N.validIds.length,common:common.length,paintable:paintable.length,extent}}));
 assert(common.length>1000&&paintable.length>1000,'both whole source banks reach a substantial common field');
 const fullExtent={minX:Math.min(...N.validIds.map(id=>N.nodes[id].x)),maxX:Math.max(...N.validIds.map(id=>N.nodes[id].x)),minZ:Math.min(...N.validIds.map(id=>N.nodes[id].z)),maxZ:Math.max(...N.validIds.map(id=>N.nodes[id].z))};
 assert(extent.minX<-20&&extent.maxX>20&&extent.minZ<-30&&extent.maxZ>30,'mutually reachable source component spans the complete lower attack fields');
 assert(fullExtent.minZ<-65&&fullExtent.maxZ>65&&fullExtent.minX<-40&&fullExtent.maxX>40,'source navigation retains both original upper banks and exterior side lanes');
 const stage=f.nativeRankedStage(G),basis=nativeArenaBasis(L),project=p=>(p[0]-basis.origin.x)*basis.forward.x+(p[2]-basis.origin.z)*basis.forward.z;
 assert(project(stage.rainmaker.goals[0])>25&&project(stage.rainmaker.goals[1])<-25,'opposed goals leave the center');
 const targets=[stage.zones[0].center,stage.rainmaker.center,...stage.rainmaker.goals,...stage.rainmaker.checkpoints.flat(),...stage.clams.spawns,...stage.clams.goals];
 for(const p of targets){const id=N.nearest(new THREE.Vector3(...p),1.2);for(const [team,seed] of seeds.entries())assert(N.path(seed,id,team,50000),'source-bank route to every supported local objective');}
 G.match.mode='turf';G.match.opts={};const movement=[],traversal=[];
 for(const team of [0,1])for(const hz of [30,60,120]){
  const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(L.spawnPads[team],0);
  a.intent.fire=a.intent.jump=a.intent.squid=false;a.intent.move.set(basis.forward.x*(team?-.25:.25),0,basis.forward.z*(team?-.25:.25));
  const start=a.pos.clone();for(let i=0;i<hz/2;i++){G.time+=1/hz;a.update(1/hz);}
  assert(a.alive&&a.grounded&&a.ground.hit&&a.pos.distanceTo(start)>.1);
  movement.push({team,hz,moved:a.pos.distanceTo(start),position:a.pos.toArray(),weapon:a.weaponId,gear:a.s3?.loadout,grounded:a.grounded});
 }
 // Controller-sized ordinary inputs follow a complete real source route from
 // each original bank to its opposed local goal. No pose/velocity correction.
 for(const team of [0,1])for(const hz of [30,60,120]){
  const goal=stage.rainmaker.goals[team],end=N.nearest(new THREE.Vector3(...goal),1.2),route=N.path(seeds[team],end,team,50000);
  const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;a.spawnAt(L.spawnPads[team],0);
  a.intent.fire=a.intent.squid=false;let waypoint=0,frames=0,jumps=0,distance=0,maxY=a.pos.y,minY=a.pos.y;
  for(;frames<hz*180&&waypoint<route.length;frames++){
   const n=N.nodes[route[waypoint]],dx=n.x-a.pos.x,dz=n.z-a.pos.z,d=Math.hypot(dx,dz),dy=n.y-a.pos.y;
   if(a.grounded&&d<.22&&Math.abs(dy)<.18){waypoint++;continue;}
   const mag=Math.min(.3,Math.max(.06,d*.4));a.intent.move.set(d>1e-6?dx/d*mag:0,0,d>1e-6?dz/d*mag:0);a.intent.jump=dy>PLAYER.stepUp;
   const previous=a.pos.clone(),serial=a.s3JumpSerial||0;G.time+=1/hz;a.update(1/hz);distance+=a.pos.distanceTo(previous);jumps+=(a.s3JumpSerial||0)>serial?1:0;maxY=Math.max(maxY,a.pos.y);minY=Math.min(minY,a.pos.y);
   if(!a.alive)break;
  }
  const hit=P.raycast(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3);
  const proof={team,hz,goal,routeNodes:route.length,reachedNodes:waypoint,seconds:frames/hz,distance,jumps,minY,maxY,position:a.pos.toArray(),alive:a.alive,grounded:a.grounded,supportTriangle:hit.triangle,input:'ordinary human move magnitude <=0.3 and jump; default shooter, gear AP 0; no transform/velocity edits'};
  console.log(JSON.stringify({crablegPhysicalTraversal:proof}));
  assert(a.alive&&a.grounded&&hit.hit&&hit.triangle>=0&&waypoint===route.length,'whole opposed source-bank physical route '+JSON.stringify(proof));
  traversal.push(proof);
 }
 let tower={supported:stage.tower.supported,...stage.ruleAvailability.tower};
 if(stage.tower.supported){
  const t=stage.tower,clear=nativeTowerClearance(L,PLAYER,t.halfSize);assert(t.arenaSpan.bothHalvesVerified);
  for(const [i,p] of t.path.entries()){
   assert(clear.clear(p,t.path[Math.max(0,i-1)]));
   for(const x of [-t.halfSize,0,t.halfSize])for(const z of [-t.halfSize,0,t.halfSize])assert(P.bodyFits(new THREE.Vector3(p[0]+x,p[1]+.01,p[2]+z),PLAYER.radius,.32,PLAYER.height));
  }
  tower={...tower,nodes:t.path.length,centerIndex:t.centerIndex,halfSize:t.halfSize,lift:t.localLift,arenaSpan:t.arenaSpan,sourceClearance:clear.metrics};
 }else assert.throws(()=>f.nativeRankedStage(G,'tower'),e=>e.code==='NATIVE_TOWER_SOURCE_CLEARANCE_UNSUPPORTED');
 assert.equal(digest(),before,'render/collision source buffers remain immutable');
 const report={id:'crableg',pads,sourceSha256:data.manifest.sourceSha256,sourceRenderCollisionDigest:before,sourceBuffersRetained:true,geometry:data.manifest.geometry,faces:L.faces.length,gridCells:G.paint.grid.length,turfTotal:G.paint.turfTotal,nav:{nodes:N.nodes.length,valid:N.validIds.length,seeds,common:common.length,commonPaintable:paintable.length,extent,fullExtent},movement,traversal,tower,version1130Verified:false};
 if(process.env.CRABLEG_CPU_REPORT)fs.writeFileSync(process.env.CRABLEG_CPU_REPORT,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
});
