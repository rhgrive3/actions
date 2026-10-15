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
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,level=new f.NativeLevel(readStage(ROOT,'manta')),physics=new f.NativePhysics(level);
 G.level=level;G.physics=physics;
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
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
 const field=common.paintable.filter(id=>G.nav.nodes[id].zone<0);
 for(let team=0;team<2;team++){
  const opposing=level.spawnPads[1-team],bank=[...field].sort((i,j)=>{
   const a=G.nav.nodes[i],b=G.nav.nodes[j];return Math.hypot(a.x-opposing.x,a.z-opposing.z)-Math.hypot(b.x-opposing.x,b.z-opposing.z);
  })[0];
  assert(bank!==undefined&&G.nav.path(seeds[team],bank,team,50000),'opposing playable bank has a directed route outside the protected enemy spawn');
  for(const target of field.filter((_,i)=>i%Math.max(1,Math.floor(field.length/20))===0))assert(G.nav.path(seeds[team],target,team,50000));
 }
 const motion=[];G.camera=new THREE.PerspectiveCamera();G.match.mode='zones';G.match.opts={};f.setRandom(()=>.5);
 try{for(const hz of [30,60,120]){
  const actor=new f.Actor({team:0,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});actor.spawnAt(level.spawnPads[0],0);G.actors=[actor];assert(actor.grounded&&!actor.s3.squidSpawn);assert.deepEqual(Object.keys(actor.s3.abilityPoints),[]);
  actor.intent.move.copy(level.spawnPads[1]).sub(level.spawnPads[0]).setY(0).normalize();
  actor.intent.fire=false;
  for(let i=0;i<hz/2;i++){G.camera.position.copy(actor.pos).add(new THREE.Vector3(0,2,6));G.time+=1/hz;actor.update(1/hz);}
  assert(actor.alive&&actor.grounded);
  const distance=actor.pos.distanceTo(level.spawnPads[0]);
  assert(distance>.8&&distance<1,'the retained source railing blocks direct inward movement');
  assert(actor.contacts.wall&&actor.contacts.wallBlock>=0);
  const rail=actor.contacts.wallBlock;
  actor.spawnAt(level.spawnPads[0],Math.PI/2);actor.intent.move.set(1,0,0);
  for(let i=0;i<hz/2;i++){G.camera.position.copy(actor.pos).add(new THREE.Vector3(0,2,6));G.time+=1/hz;actor.update(1/hz);}
  const support=physics.raycast(actor.pos.clone().setY(actor.pos.y+.1),new THREE.Vector3(0,-1,0),.3);
  assert(actor.alive&&actor.grounded&&actor.pos.distanceTo(level.spawnPads[0])>2);
  assert(support.hit&&support.face>=0&&Math.abs(support.point.y-actor.pos.y)<.02);
  motion.push({hz,seconds:.5,blockedDistance:distance,sourceRailBlock:rail,distance:actor.pos.distanceTo(level.spawnPads[0]),pos:actor.pos.toArray(),sourceSupportTriangle:support.triangle,productionActor:true,productionCharacter:true,gearAP:0});
 }}finally{f.restoreRandom();}
 assert(Math.max(...motion.map(x=>x.distance))-Math.min(...motion.map(x=>x.distance))<.25);
 const evidence={id:'manta',sourceSha256:definition.sourceSha256,spawnNodeIds:seeds,navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,commonNodes:common.common.length,commonPaintable:common.paintable.length,motion,weapon:'shooter',gear:'zero AP; actual production Character/Actor integrator and frame finish; CPU VM optional motion unavailable',state:'grounded humanoid, firing off',input:'inward movement retains source railing collision; ordinary tangent +X movement retains exact source floor'};
 console.log(JSON.stringify(evidence));
 if(process.env.MANTA_CPU_REPORT){fs.mkdirSync(path.dirname(process.env.MANTA_CPU_REPORT),{recursive:true});fs.writeFileSync(process.env.MANTA_CPU_REPORT,JSON.stringify(evidence,null,2));}
});
