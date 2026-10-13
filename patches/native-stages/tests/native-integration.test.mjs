import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nativeFixture,readStage } from './fixture.mjs';
import { prepareNativeStageBuild } from '../../../scripts/lib/inkwave-native-stages.mjs';
const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const RAY_ROOT=process.env.INKWAVE_RAY_TEST_STAGE_ASSETS;
assert.ok(!RAY_ROOT||!ROOT,'ray-only test assets and full native assets must not be mixed');
const DATA_ROOT=RAY_ROOT||ROOT;
const IDS=['scorch','hagglefish','inkblot','mako','brinewater'];

test('public builds offer five source choices without reference model payload',()=>{
 const build=prepareNativeStageBuild(null);assert.equal(build.root,null);assert.equal(build.config.mode,'browser-direct');assert.deepEqual(build.config.stages.map(s=>s.id),IDS);
});
for(const id of RAY_ROOT?['scorch']:IDS)test('native source physics, painting, movement, nav and rules: '+id,{skip:!DATA_ROOT},async()=>{
 const f=await nativeFixture({coreOnly:true}),{G,THREE,PLAYER}=f,data=readStage(DATA_ROOT,id),level=new f.NativeLevel(data),physics=new f.NativePhysics(level);
 G.level=level;G.physics=physics;
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new CpuPaint(null,level,{atlasSize:2048,maxDensity:4,cell:.25});
 assert.ok(G.paint.ppm>0);assert.ok(G.paint.turfTotal>1000);assert.equal(G.paint.grid.length,data.mask.length);assert.ok(data.manifest.chartMaxPlaneError<.005);
 for(const pad of level.spawnPads){
  const h=physics.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert.ok(h.hit,id+' spawn support');assert.ok(h.normal.y>.68);assert.ok(Math.abs(h.point.y-pad.y)<.12);
  const area=G.paint.splat(h.point.clone().addScaledVector(h.normal,.03),1.5,0,{seed:.125,instant:true});
  assert.ok(area>0,'positive claimed ground area');assert.equal(G.paint.sample(h.face,h.u,h.v),1);
 }
 // Find a real exported wall triangle and exercise the existing squid climb.
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
   actor._updateClimb(1/60,true);
   if(!actor.climbing)continue;
   assert.ok(actor.vel.y>0,'painted source wall grants upward swim velocity');
   G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.03),3,1,{seed:.375,instant:true});actor._updateClimb(1/60,true);assert.equal(actor.climbing,false,'enemy wall ink releases squid');wallProof=true;break;
  }
  if(wallProof)break;
 }
 assert.equal(wallProof,true,id+' native wall swimming');
 // Polygon masks prevent ink/turf ownership outside source triangles.
 for(let k=0;k<G.paint.grid.length;k++)if(G.paint.dead[k])assert.equal(G.paint.grid[k],0);
 // Both body and ground probes use the actual native triangles at 30/60/120 Hz.
 for(const hz of [30,60,120]){
  const a=f.make();a._integrate=f.Actor.prototype._integrate;a.spawnAt(level.spawnPads[0],0);a.intent.move.set(0,0,0);a.intent.fire=false;
  for(let i=0;i<hz;i++){G.time+=1/hz;a.update(1/hz);}
  assert.ok(a.alive);assert.ok(a.grounded);assert.ok(Number.isFinite(a.pos.length()));
 }
 const start=performance.now();G.nav=new f.NavGraph(level,physics);
 assert.ok(G.nav.validIds.length>100);const stage=f.nativeRankedStage(G);
 assert.equal(stage.version1130Verified,false);assert.match(stage.calibration,/UNVERIFIED/);
 assert.ok(stage.tower.path.length>2);
 for(const p of [...stage.rainmaker.goals,stage.rainmaker.center])assert.ok(Number.isFinite(level.groundHeight(p[0],p[2])));
 G.match.mode='turf';G.match.opts={};
 const spawned=f.make();assert.equal(f.beginInitialSquidSpawn(spawned),true);assert.ok(spawned.s3.squidSpawn.target,'initial landing fallback is supported');
 spawned.intent.fire=true;spawned.update(1/60);assert.equal(spawned.s3.squidSpawn.phase,'flight');spawned.intent.fire=false;
 for(let i=0;i<75;i++)spawned.update(1/60);assert.equal(spawned.s3.squidSpawn,undefined);assert.equal(spawned.grounded,true);
 const brain=new f.BotBrain(spawned,'normal');const candidates=f.nativePaintGoalIds(brain,G);assert.ok(candidates.length>0,'reachable native paint goals');
 const startNode=G.nav.nearest(spawned.pos,1.2);for(const target of candidates.slice(0,5))assert.ok(G.nav.path(startNode,target,spawned.team,50000),'directed path to sampled paint goal');
 console.log(JSON.stringify({id,ppm:G.paint.ppm,atlas:2048,faces:level.faces.length,gridBytes:G.paint.grid.byteLength,navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,navMilliseconds:performance.now()-start}));
});
