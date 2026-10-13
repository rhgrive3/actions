import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeStageCatalog,prepareNativeStageBuild} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {parseSourceOBJ} from '../runtime/source-convert.mjs';
import {nativeFixture,readStage} from './fixture.mjs';
import {nativeTowerClearance} from '../runtime/native-tower-clearance.mjs';

const definition=JSON.parse(fs.readFileSync(new URL('../definitions/mincemeat.json',import.meta.url)));
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const source=process.env.INKWAVE_MINCEMEAT_SOURCE;
const available=root&&fs.existsSync(path.join(root,'mincemeat/manifest.json'));

test('revised Mincemeat is discoverable with explicit inferred placement',()=>{
 const stage=nativeStageCatalog().stages.find(s=>s.id==='mincemeat');
 assert.deepEqual(stage,definition);
 assert.equal(stage.internal,'Vss_Scrap01');
 assert.equal(stage.sourceSha256,'11cecf76146211ac7fff04394763b0a1d883605f78136b4aee59b8e8dd076d23');
 assert.equal(stage.tree,'257212ff6a22efaf9773c55568f165c86fce967a');
 assert.equal(stage.version1130Verified,false);
 assert.match(stage.placementStatus,/unverified/);
 const publicBuild=prepareNativeStageBuild(null);
 assert.equal(publicBuild.root,null);
 assert.equal(publicBuild.config.mode,'browser-direct');
 const {integritySha256,...sealed}=publicBuild.config.stages.find(s=>s.id===stage.id);
 assert.match(integritySha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(sealed,stage);
});

test('Mincemeat Python/worker source attributes and inferred exclusions agree',{skip:!available||!source},()=>{
 const data=readStage(root,'mincemeat');
 const parsed=parseSourceOBJ(fs.readFileSync(path.join(source,'Vss_Scrap01.obj'),'utf8'),definition.sourceSemantics);
 for(const key of ['vertices','indices'])assert.equal(Buffer.compare(Buffer.from(data[key].buffer),Buffer.from(parsed[key].buffer)),0,key+' exact source float/index bytes');
 assert.equal(parsed.objects.length,276);
 assert.equal(parsed.objects.filter(o=>!o.active).length,71);
 assert.equal(parsed.objects.filter(o=>o.collidable).length,113);
 for(let i=0;i<parsed.objects.length;i++){
  const a=parsed.objects[i],b=data.manifest.objects[i];
  for(const key of ['name','material','vo','vc','io','ic','active','collidable','paintable','sourceHasUV'])assert.equal(a[key],b[key],a.name+' '+key);
  if(!a.active)assert.equal(a.collidable,false);
  if(a.name.includes('GeneralBoxNoPaint'))assert.equal(a.paintable,false);
 }
 const sharedBox=parsed.objects.find(o=>o.name.startsWith('FldObj_Scrap01BoxPntVar_'));
 assert.equal(sharedBox.active,true);
 assert.equal(sharedBox.collidable,true);
 assert.equal(sharedBox.paintable,false);
 console.log(JSON.stringify({id:'mincemeat',vertices:data.vertices.length/8,triangles:data.indices.length/3,sourceAttributeBytesEqual:true,inactiveObjects:71,collidableObjects:113}));
});

test('Mincemeat supports, capsule movement, wall ink, and rules use actual source triangles',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(root,'mincemeat');
 const level=G.level=new f.NativeLevel(data),physics=G.physics=new f.NativePhysics(level);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new CpuPaint(null,level,{atlasSize:2048,maxDensity:4,cell:.25});
 assert.ok(G.paint.turfTotal>1000);
 assert.ok(data.manifest.chartMaxPlaneError<.005);
 const spawnSupport=[];
 for(const pad of level.spawnPads){
  const hit=physics.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert.ok(hit.hit&&hit.normal.y>.68);
  assert.ok(Math.abs(pad.y-hit.point.y-.08)<1e-6);
  assert.ok(physics.bodyFits(hit.point.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height,false,.01));
  assert.ok(G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.03),1.5,0,{seed:.125,instant:true})>0);
  assert.equal(G.paint.sample(hit.face,hit.u,hit.v),1);
  spawnSupport.push({pad:pad.toArray(),support:hit.point.toArray(),normal:hit.normal.toArray()});
 }
 let wallProof=false;
 for(const face of level.faces){
  if(!face.wall||face.sv<1.5)continue;
  for(const tid of face.triangles.slice(0,4)){
   const tri=level.triangleWorld.triangle(tid),point=tri.a.clone().add(tri.b).add(tri.c).multiplyScalar(1/3);
   const feet=point.clone().addScaledVector(face.n,PLAYER.radius+.06);feet.y-=.3;
   const hit=physics.raycast(feet.clone().add(new THREE.Vector3(0,.3,0)),face.n.clone().negate(),PLAYER.radius+.35);
   if(!hit.hit||hit.face!==face.id)continue;
   G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.03),2,0,{seed:.375,instant:true});
   if(G.paint.sample(hit.face,hit.u,hit.v)!==1)continue;
   const actor=f.make();actor.pos.copy(feet);actor.intent.move.copy(face.n).negate();actor.form='squid';actor.climbExit=0;
   actor._updateClimb(1/60,true);if(!actor.climbing)continue;
   assert.ok(actor.vel.y>0);
   G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.03),3,1,{seed:.375,instant:true});
   actor._updateClimb(1/60,true);assert.equal(actor.climbing,false);wallProof=true;break;
  }
  if(wallProof)break;
 }
 assert.equal(wallProof,true,'own source-wall ink climbs; enemy ink releases');
 for(let i=0;i<G.paint.grid.length;i++)if(G.paint.dead[i])assert.equal(G.paint.grid[i],0);
 const movement=[];
 for(const hz of [30,60,120]){
  const actor=f.make();actor._integrate=f.Actor.prototype._integrate;actor.spawnAt(level.spawnPads[0],0);actor.intent.move.set(0,0,0);actor.intent.fire=false;
  for(let i=0;i<hz;i++){G.time+=1/hz;actor.update(1/hz);}
  assert.ok(actor.alive&&actor.grounded&&Number.isFinite(actor.pos.length()));
  const before=actor.pos.clone();actor.intent.move.set(0,0,1);
  for(let i=0;i<hz;i++){G.time+=1/hz;actor.update(1/hz);}
  assert.ok(actor.alive&&actor.grounded&&Number.isFinite(actor.pos.length()));
  const walked=actor.pos.distanceTo(before);assert.ok(walked>1,'real capsule walks along source support');
  movement.push({hz,position:actor.pos.toArray(),grounded:actor.grounded,walked});
 }
 assert.ok(Math.max(...movement.map(m=>m.walked))-Math.min(...movement.map(m=>m.walked))<.25,'30/60/120 Hz source walking remains comparable');
 const start=performance.now();G.nav=new f.NavGraph(level,physics);const navMilliseconds=performance.now()-start;
 assert.ok(G.nav.validIds.length>1000);
 const ids=level.spawnPads.map(p=>G.nav.nearest(p,1.2));assert.ok(ids.every(id=>id>=0));
 const reach=seed=>{const seen=new Set([seed]),queue=[seed];for(let i=0;i<queue.length;i++)for(const edge of G.nav.nodes[queue[i]].nb)if(G.nav.valid[edge.to]&&!seen.has(edge.to)){seen.add(edge.to);queue.push(edge.to);}return seen;};
 const reachable=ids.map(reach);assert.ok(reachable[0].has(ids[1])&&reachable[1].has(ids[0]),'supported pads share directed routes');
 const stage=f.nativeRankedStage(G);assert.equal(stage.version1130Verified,false);
 assert.match(stage.calibration,/UNVERIFIED/);
 for(const point of [stage.zones[0].center,stage.rainmaker.center,...stage.rainmaker.goals,...stage.clams.spawns]){
  const id=G.nav.nearest(new THREE.Vector3(...point),1.2);
  assert.ok(id>=0&&reachable.every(set=>set.has(id)),'both teams can reach ranked objective');
 }
 assert.ok(stage.zones[0].center[1]<11,'ranked center stays on shared lower gameplay floor');
 const clearance=nativeTowerClearance(level,PLAYER,stage.tower.halfSize),path=stage.tower.path;
 assert.equal(stage.tower.boarding.approaches.length,path.length);
 assert.ok(stage.tower.centerIndex>=3&&path.length-stage.tower.centerIndex>=4,'supported tower has travel on both sides of center');
 const span=stage.tower.arenaSpan;
 assert.equal(span.bothHalvesVerified,true);
 assert.ok(span.endpointProjection[0]<-span.minimumHalfDepth&&span.endpointProjection[1]>span.minimumHalfDepth,'the complete deck and rider envelope enters both opposing-pad arena halves');
 for(const approach of stage.tower.boarding.approaches){assert.ok(approach.height<=stage.tower.boarding.maxJumpHeight);assert.ok(reachable.every(set=>set.has(approach.sourceNode)),'both teams reach every source boarding approach');}
 assert.ok(stage.tower.sourceClearance.assurance.includes('retail trajectory/lift unverified'));
 for(let i=0;i<path.length;i++)assert.ok(clearance.clear(path[i],path[Math.max(0,i-1)]),'full tower swept deck/pole/capsule clears source triangles');
 level._addBlock({kind:'obox',center:[path[0][0],path[0][1]-.12,path[0][2]],size:[stage.tower.halfSize*2,.24,stage.tower.halfSize*2],rotY:0,paint:false,hidden:true});
 const deck=level.blocks.at(-1),rider=f.make();
 const samples=path.flatMap((p,i)=>i?[p,...[.25,.5,.75].map(t=>p.map((v,k)=>path[i-1][k]+(v-path[i-1][k])*t))]:[p]);
 for(const point of samples){
  deck.center.set(point[0],point[1]-.12,point[2]);deck.aabbMin.copy(deck.center).sub(deck.half);deck.aabbMax.copy(deck.center).add(deck.half);
  rider.pos.fromArray(point);rider.pos.x+=.7;rider.vel.set(0,0,0);rider.grounded=false;rider._resolve(false,rider.pos.y,false);
  assert.ok(rider.grounded&&rider.ground.hit,'real capsule remains supported at every tower node and three interior samples of every segment');
  assert.equal(rider.ground.block,deck.id);
 }
 G.match.mode='turf';G.match.opts={};
 const actor=f.make();actor._integrate=f.Actor.prototype._integrate;assert.equal(f.beginInitialSquidSpawn(actor),true);assert.ok(actor.s3.squidSpawn.target);
 actor.intent.fire=true;actor.update(1/60);assert.equal(actor.s3.squidSpawn.phase,'flight');actor.intent.fire=false;
 let landingFrames=0;
 while(actor.s3.squidSpawn&&landingFrames<180){G.time+=1/60;actor.update(1/60);landingFrames++;}
 assert.equal(actor.s3.squidSpawn,undefined);assert.equal(actor.grounded,true);assert.equal(actor.ground.hit,true);
 const brain=new f.BotBrain(actor,'normal'),goals=f.nativePaintGoalIds(brain,G),from=G.nav.nearest(actor.pos,1.2);assert.ok(goals.length>0);
 for(const target of goals.slice(0,5))assert.ok(G.nav.path(from,target,actor.team,50000));
 console.log(JSON.stringify({id:'mincemeat',spawnSupport,wallSwimming:true,maskedHolesUnpainted:true,movement,navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,navMilliseconds,spawnReachable:reachable.map(s=>s.size),rankedCenter:stage.zones[0].center,towerPathNodes:stage.tower.path.length,towerLift:stage.tower.localLift,towerCenter:stage.tower.path[stage.tower.centerIndex],towerArenaSpan:span,towerSourceClearance:stage.tower.sourceClearance,towerEveryNodeAndSegmentSupportVerified:true,towerBoardingSamples:samples.length,landingFrames,paintGoals:goals.length,atlas:2048,ppm:G.paint.ppm}));
});
