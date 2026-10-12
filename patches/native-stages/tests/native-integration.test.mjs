import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nativeFixture,readStage } from './fixture.mjs';
import { prepareNativeStageBuild } from '../../../scripts/lib/inkwave-native-stages.mjs';
const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const IDS=['scorch','hagglefish','inkblot','mako','brinewater'];

test('public builds have no reference model payload',()=>assert.equal(prepareNativeStageBuild(null),null));
for(const id of IDS)test('native source physics, painting, movement, nav and rules: '+id,{skip:!ROOT},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(ROOT,id),level=new f.NativeLevel(data),physics=new f.NativePhysics(level);
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
 console.log(JSON.stringify({id,ppm:G.paint.ppm,atlas:2048,faces:level.faces.length,gridBytes:G.paint.grid.byteLength,navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,navMilliseconds:performance.now()-start}));
});
