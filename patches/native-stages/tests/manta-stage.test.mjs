import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeRankedComponent} from '../runtime/native-ranked.mjs';

const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const definition=nativeStageCatalog().stages.find(s=>s.id==='manta');

test('Manta Maria pins its distinct source and opposing deck supports',()=>{
 assert.equal(definition.internal,'Vss_Pillar03');
 assert.equal(definition.name,'マンタマリア号');
 assert.equal(definition.tree,'5e08b4fb4825f7bfdd138ad13139a3d1af6d29dc');
 assert.equal(definition.sourceSha256,'8b7a26e0f71ed69c055e42ead154bd34bc08532ba89a95bea3a813766716ac1a');
 assert.equal(definition.version1130Verified,false);
 assert(definition.spawnPads[0][2]<0&&definition.spawnPads[1][2]>0);
 assert(Math.abs(definition.spawnPads[1][2]-definition.spawnPads[0][2])>80);
});

test('Manta retains original roofs and separates distant scenery and Tricolor', {skip:!ROOT},()=>{
 const m=readStage(ROOT,'manta').manifest;
 assert.equal(m.geometry.vertices,595742);
 assert.equal(m.geometry.triangles,317651);
 const roof=m.objects.find(o=>o.name==='Fld_Pillar03_TestField1158_pCube84_1__GroundRoof');
 assert(roof?.active&&roof.collidable&&roof.paintable);
 const lifeboatFloor=m.objects.find(o=>o.name==='Fld_Pillar03_MetalFloor_1__SlopeMetalPlate_np');
 assert(lifeboatFloor?.active&&lifeboatFloor.collidable&&!lifeboatFloor.paintable);
 const streetlights=m.objects.filter(o=>/^FldObj_Pillar03_Streetlight_/.test(o.name));
 assert(streetlights.length>=2);
 for(const o of streetlights){assert(o.active);assert(!o.collidable);assert(o.bounds[0][0]>75);}
 const tricolor=m.objects.filter(o=>o.ruleLayer==='Tcl');
 assert(tricolor.length>30);
 assert(tricolor.every(o=>!o.active&&!o.collidable));
});

test('Manta opposite source pads fit capsules and reach a common deck in both directions', {skip:!ROOT},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,level=new f.NativeLevel(readStage(ROOT,'manta')),physics=new f.NativePhysics(level);
 G.level=level;G.physics=physics;
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;}_pushQuad(){}}
 G.paint=new CpuPaint(null,level,{atlasSize:2048,maxDensity:4,cell:.25});
 for(const pad of level.spawnPads){
  const hit=physics.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert(hit.hit&&hit.normal.y>.68&&hit.face>=0);
  assert(Math.abs(hit.point.y-pad.y)<.0001);
  assert.equal(level.manifest.objects[level.triangleWorld.objectIds[hit.triangle]].name,'Fld_Pillar03_TestField1158_pCube84_1__GroundRoof');
  assert(physics.bodyFits(pad.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height,false,.01));
 }
 G.nav=new f.NavGraph(level,physics);
 const seeds=level.spawnPads.map(p=>G.nav.nearest(p,1.2));
 const paintable=G.nav.validIds.filter(id=>G.nav.nodes[id].nativePaintable);
 const common=nativeRankedComponent(G.nav,paintable,seeds);
 assert(common.paintable.length>100);
 for(let team=0;team<2;team++){
  assert(G.nav.path(seeds[team],seeds[1-team],team,50000),'opposing deck pad has a directed route');
  for(const target of common.paintable.filter((_,i)=>i%Math.max(1,Math.floor(common.paintable.length/20))===0))assert(G.nav.path(seeds[team],target,team,50000));
 }
 const motion=[];
 for(const hz of [30,60,120]){
  const actor=f.make();actor._integrate=f.Actor.prototype._integrate;actor.spawnAt(level.spawnPads[0],0);
  actor.intent.move.copy(level.spawnPads[1]).sub(level.spawnPads[0]).setY(0).normalize();
  actor.intent.fire=false;
  for(let i=0;i<hz/2;i++){G.time+=1/hz;actor.update(1/hz);}
  assert(actor.alive&&actor.grounded);
  const distance=actor.pos.distanceTo(level.spawnPads[0]);assert(distance>1);
  motion.push({hz,seconds:.5,distance,pos:actor.pos.toArray()});
 }
 assert(Math.max(...motion.map(x=>x.distance))-Math.min(...motion.map(x=>x.distance))<.25);
 const evidence={id:'manta',sourceSha256:definition.sourceSha256,spawnNodeIds:seeds,navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,commonNodes:common.common.length,commonPaintable:common.paintable.length,motion,weapon:'shooter',gear:'default fixture profile',state:'grounded humanoid, firing off',input:'normalized vector toward opposing supported pad'};
 console.log(JSON.stringify(evidence));
 if(process.env.MANTA_CPU_REPORT){fs.mkdirSync(path.dirname(process.env.MANTA_CPU_REPORT),{recursive:true});fs.writeFileSync(process.env.MANTA_CPU_REPORT,JSON.stringify(evidence,null,2));}
});
