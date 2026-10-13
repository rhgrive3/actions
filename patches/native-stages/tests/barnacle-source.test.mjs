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
const enabled=!!root&&fs.existsSync(path.join(root,'barnacle','manifest.json'));

test('Barnacle uses renovated Section01 with independently reviewable source semantics',()=>{
 const stage=nativeStageCatalog().stages.find(s=>s.id==='barnacle');
 assert.equal(stage.internal,'Vss_Section01');
 assert.equal(stage.tree,'c7d87b908c565e698fade2f7bbe4c9353f200435');
 assert.equal(stage.sourceSha256,'2d792394f5672734b9faa0972293792f0983977318d464848f709aaec9232ad4');
 assert.equal(stage.version1130Verified,false);
 assert(stage.spawnPads[0][2]<-60&&stage.spawnPads[1][2]>60,'teams start in meaningful opposed source banks');
 assert(stage.placementStatus.includes('unverified'));
});

test('Barnacle real source pads, whole playable routes, masks, movement and ranked envelopes',{skip:!enabled},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(root,'barnacle');
 const hash=()=>{const h=crypto.createHash('sha256');for(const a of [data.vertices,data.indices,data.triangles])h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));return h.digest('hex');};
 const before=hash(),level=G.level=new f.NativeLevel(data),physics=G.physics=new f.NativePhysics(level);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new CpuPaint(null,level,{atlasSize:2048,maxDensity:4,cell:.25});
 const sourceObjects=data.manifest.objects;
 assert(sourceObjects.filter(o=>o.name.startsWith('FldObj_Section01_PntVarSet_')).every(o=>o.active));
 assert(sourceObjects.filter(o=>/^FldObj_Section01_(Vcl|Vgl|Vlf)Set_/.test(o.name)).every(o=>!o.active),'ranked alternatives remain separate display exports');
 assert(sourceObjects.find(o=>o.name==='FldObj_Section01_SignageVlf_pPlane1841__PlayFieldUDIM01')?.active===false);
 const scenery=sourceObjects.find(o=>o.name==='Fld_Section01_pPlane1840__Tile03');
 assert(scenery.active&&!scenery.collidable&&scenery.vc===4,'450-unit mall scenery plane remains visible without inventing a playable basement');
 for(const o of sourceObjects.filter(o=>o.active&&/GeneralBoxNoPaint/.test(o.name)))assert.equal(o.paintable,false,o.name);
 for(const [team,pad] of level.spawnPads.entries()){
  const h=physics.raycast(pad.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),.6);
  assert(h.hit&&h.triangle>=0&&h.normal.y>.99&&Math.abs(h.point.y-pad.y)<1e-6);
  assert.equal(sourceObjects[level.triangleWorld.objectIds[h.triangle]].name,'Fld_Section01_pCubeShape5910_1__Wood01');
  assert(physics.bodyFits(pad,PLAYER.radius+.04,.32,PLAYER.height),'ordinary human capsule fits source spawn');
  G.paint.splat(h.point.clone().addScaledVector(h.normal,.03),1.5,team,{seed:.125,instant:true});
  assert.equal(G.paint.sample(h.face,h.u,h.v),team+1);
 }
 assert(G.paint.turfTotal>100000);
 for(let i=0;i<G.paint.dead.length;i++)if(G.paint.dead[i])assert.equal(G.paint.grid[i],0,'source polygon holes cannot own ink');
 const nav=G.nav=new f.NavGraph(level,physics),seeds=nav.nativeSpawnNodeIds;
 const reach=seeds.map(seed=>{const set=new Set([seed]),queue=[seed];for(let j=0;j<queue.length;j++)for(const e of nav.nodes[queue[j]].nb)if(!set.has(e.to)){set.add(e.to);queue.push(e.to);}return set;});
 const both=nav.validIds.filter(id=>reach.every(set=>set.has(id))),paintable=both.filter(id=>nav.nodes[id].nativePaintable);
 assert(both.length>2500&&paintable.length>2500,'both source banks reach the full shared arena');
 const extent={minX:Math.min(...both.map(id=>nav.nodes[id].x)),maxX:Math.max(...both.map(id=>nav.nodes[id].x)),minZ:Math.min(...both.map(id=>nav.nodes[id].z)),maxZ:Math.max(...both.map(id=>nav.nodes[id].z))};
 assert(extent.minX<-30&&extent.maxX>30&&extent.minZ<-40&&extent.maxZ>40,'common routes cover both sides and both fields');
 assert(!nav.validIds.some(id=>nav.nodes[id].y<-4),'distant source scenery is not a navigation fallback');
 const stage=f.nativeRankedStage(G),basis=nativeArenaBasis(level),project=p=>(p[0]-basis.origin.x)*basis.forward.x+(p[2]-basis.origin.z)*basis.forward.z;
 assert(project(stage.rainmaker.goals[0])>30&&project(stage.rainmaker.goals[1])<-30);
 const goals=[stage.zones[0].center,stage.rainmaker.center,...stage.rainmaker.goals,...stage.clams.spawns];
 for(const target of goals){const goal=nav.nearest(new THREE.Vector3(...target),1.2);for(const [team,seed] of seeds.entries())assert(nav.path(seed,goal,team,50000),'every supported local objective has a directed source route from each bank');}
 const movement=[];
 G.match.mode='turf';G.match.opts={};
 for(const team of [0,1])for(const hz of [30,60,120]){
  const a=f.make();a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(level.spawnPads[team],0);
  a.intent.fire=a.intent.jump=a.intent.squid=false;a.intent.move.set(basis.forward.x*(team?-.25:.25),0,basis.forward.z*(team?-.25:.25));
  const start=a.pos.clone();for(let i=0;i<hz/2;i++){G.time+=1/hz;a.update(1/hz);}
  assert(a.alive&&a.grounded&&a.ground.hit&&a.pos.distanceTo(start)>.1,'production integrator moves on source at '+hz+' Hz');
  movement.push({team,hz,moved:a.pos.distanceTo(start),pos:a.pos.toArray(),grounded:a.grounded,weapon:a.weaponId,gear:a.s3?.loadout});
 }
 let tower={supported:stage.tower.supported,...stage.ruleAvailability.tower};
 if(stage.tower.supported){
  const t=stage.tower,clear=nativeTowerClearance(level,PLAYER,t.halfSize),arc=[];
  assert(t.arenaSpan.bothHalvesVerified);
  for(const [i,p] of t.path.entries()){
   assert(clear.clear(p,t.path[Math.max(0,i-1)]),'every segment clears swept deck, pole and live rider volume');
   for(const x of [-t.halfSize,0,t.halfSize])for(const z of [-t.halfSize,0,t.halfSize])assert(physics.bodyFits(new THREE.Vector3(p[0]+x,p[1]+.01,p[2]+z),PLAYER.radius,.32,PLAYER.height),'live source capsule at deck edge');
   if(i)arc.push(Math.hypot(...p.map((v,k)=>v-t.path[i-1][k])));
  }
  tower={...tower,nodes:t.path.length,centerIndex:t.centerIndex,halfSize:t.halfSize,lift:t.localLift,arenaSpan:t.arenaSpan,sourceClearance:clear.metrics,arcLengths:[arc.slice(0,t.centerIndex).reduce((a,b)=>a+b,0),arc.slice(t.centerIndex).reduce((a,b)=>a+b,0)]};
 }else assert.throws(()=>f.nativeRankedStage(G,'tower'),e=>e.code==='NATIVE_TOWER_SOURCE_CLEARANCE_UNSUPPORTED');
 assert.equal(hash(),before,'runtime cannot alter original source buffers');
 const report={id:'barnacle',sourceSha256:data.manifest.sourceSha256,vertices:data.manifest.geometry.vertices,collisionTriangles:level.triangleWorld.triangleCount,sourceRenderCollisionDigest:before,sourceBuffersRetained:true,faces:level.faces.length,gridCells:G.paint.grid.length,turfTotal:G.paint.turfTotal,ppm:G.paint.ppm,nav:{nodes:nav.nodes.length,valid:nav.validIds.length,seeds,common:both.length,commonPaintable:paintable.length,extent},movement,tower,version1130Verified:false};
 if(process.env.BARNACLE_CPU_REPORT)fs.writeFileSync(process.env.BARNACLE_CPU_REPORT,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
});
