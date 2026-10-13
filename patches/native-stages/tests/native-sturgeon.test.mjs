import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const definition=JSON.parse(fs.readFileSync(new URL('../definitions/sturgeon.json',import.meta.url)));
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const source=process.env.INKWAVE_NATIVE_STAGE_SOURCE;
const available=root&&fs.existsSync(path.join(root,'sturgeon','manifest.json'));

test('sturgeon identity preserves the pinned display source and 11.3.0 uncertainty',()=>{
 assert.equal(definition.internal,'Vss_Nagasaki03');
 assert.equal(definition.tree,'fd3bcfd8eb89378b4f1764d3947e5132febf3295');
 assert.equal(definition.version1130Verified,false);
 assert.equal(definition.spawnPads[0][2],-definition.spawnPads[1][2]);
 assert.equal(definition.spawnPads[0][0],-definition.spawnPads[1][0]);
 assert.ok(Math.hypot(definition.spawnPads[0][0]-definition.spawnPads[1][0],definition.spawnPads[0][2]-definition.spawnPads[1][2])>120);
});

test('sturgeon uint32 face indices independently equal every original OBJ face',{skip:!available||!source},()=>{
 const text=fs.readFileSync(path.join(source,definition.internal,definition.internal+'.obj'),'utf8');
 assert.equal(Buffer.byteLength(text),31263599);
 assert.equal(crypto.createHash('sha256').update(text).digest('hex'),definition.sourceSha256);
 const expected=[];let vertices=0,objectStart=0;
 for(const line of text.split('\n')){
  if(line.startsWith('o '))objectStart=vertices;
  else if(line.startsWith('v '))vertices++;
  else if(line.startsWith('f ')){
   const face=line.slice(2).trim().split(/\s+/).map(token=>Number(token.split('/')[0])-1-objectStart);
   for(let j=1;j<face.length-1;j++)expected.push(face[0],face[j],face[j+1]);
  }
 }
 const data=readStage(root,'sturgeon');
 assert.equal(vertices,269203);
 assert.equal(expected.length/3,188196);
 assert.deepEqual(data.indices,new Uint32Array(expected));
});

test('sturgeon opposed pads support full capsules and both teams reach the same paint arena',{skip:!available},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(root,'sturgeon');
 G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();
 const level=new f.NativeLevel(data),physics=new f.NativePhysics(level);G.level=level;G.physics=physics;
 G.match.mode='turf';G.match.opts={};
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new CpuPaint(null,level,{atlasSize:2048,maxDensity:4,cell:.25});
 for(const pad of level.spawnPads){
  const hit=physics.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert.ok(hit.hit);assert.ok(Math.abs(hit.point.y-11)<.001);assert.ok(hit.normal.y>.99);
  assert.match(data.manifest.objects[data.objectIds[hit.triangle]].name,/^Fld_Nagasaki03_GroundSteelPlate02_A_01__/);
  assert.equal(physics.bodyFits(pad,PLAYER.radius+.04,.32,PLAYER.height,false,.01),true);
 }
 G.nav=new f.NavGraph(level,physics);const stage=f.nativeRankedStage(G);
 const center=new THREE.Vector3().fromArray(stage.zones[0].center),target=G.nav.nearest(center,1.2);
 for(let team=0;team<2;team++){
  const start=G.nav.nearest(level.spawnPads[team],1.2),route=G.nav.path(start,target,team,50000);
  assert.ok(route?.length>20,'team '+team+' has a directed route from its opposed source support');
 }
 const movement=[];
 for(const team of [0,1])for(const hz of [30,60,120]){
  // Preserve production facing, root transforms, animation, integration and
  // muzzle placement. fixture.make() intentionally suppresses these methods.
  const actor=new f.Actor({team,name:'sturgeon movement',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  G.actors=[actor];G.scene.add(actor.character.root);
  const direction=team?-1:1;
  actor.spawnAt(level.spawnPads[team],team?Math.PI:0);actor.intent.move.set(0,0,direction);actor.intent.fire=false;
  let groundedFrames=0;
  for(let i=0;i<hz;i++){G.time+=1/hz;actor.update(1/hz);if(actor.grounded)groundedFrames++;}
  assert.ok(actor.alive);assert.ok(actor.grounded);assert.ok((actor.pos.z-level.spawnPads[team].z)*direction>3);
  assert.equal(groundedFrames,hz,'real source support throughout inward walking');
  assert.ok(actor.character.root.position.distanceTo(actor.visualPos(new THREE.Vector3()))<1e-9,'production frame finishing updates the smoothed real root');
  movement.push({team,hz,weapon:actor.weaponId,gearAP:0,seconds:1,input:[0,0,direction],pos:actor.pos.toArray(),groundedFrames,productionCharacter:true,productionActorMethods:true});
  actor.intent.move.set(0,0,0);actor.intent.fire=false;
  const opponent=level.spawnPads[1-team],pad=level.spawnPads[team],expectedYaw=Math.atan2(opponent.x-pad.x,opponent.z-pad.z);
  for(const bot of [false,true]){
   actor.isBot=bot;actor.bot=bot?new f.BotBrain(actor,'normal'):null;
   actor.aimPoint.copy(pad).sub(opponent.clone().sub(pad).normalize().multiplyScalar(8));
   if(actor.bot)actor.bot.aimYaw=expectedYaw+Math.PI;
   actor.alive=false;
   if(actor.bot)actor.bot.update(1/hz); // Production death observation precedes respawn.
   actor.respawn();
   assert.ok(actor.s3.squidSpawn?.target,'death respawn starts the production source launch');
   assert.ok(Math.abs(actor.aimYaw-expectedYaw)<1e-9,'respawn resets stale aim toward opposed support');
   if(actor.bot){actor.bot.update(1/hz);assert.ok(Math.cos(actor.bot.aimYaw-expectedYaw)>.8,'first live brain tick resets stale outward aim before ordinary steering');}
   actor.intent.fire=true;G.time+=1/hz;actor.update(1/hz);actor.intent.fire=false;
   let frames=0;
   while(actor.s3.squidSpawn&&frames<hz*3){G.time+=1/hz;actor.update(1/hz);frames++;}
   assert.equal(actor.s3.squidSpawn,undefined);assert.ok(actor.alive&&actor.grounded&&actor.ground.hit);
   const support=physics.raycast(actor.pos.clone().setY(actor.pos.y+.1),new THREE.Vector3(0,-1,0),.5);
   assert.ok(support.hit&&support.triangle>=0,'death respawn lands on original source triangles');
   movement.push({team,hz,phase:'death-respawn',bot,frames,expectedYaw,pos:actor.pos.toArray(),sourceTriangle:support.triangle,productionCharacter:true,productionActorMethods:true});
  }
  actor.character.root.removeFromParent();actor.character.dispose();
 }
 const camera=data.manifest.objects.filter(o=>/^Fld_Nagasaki03_CameraWall_/.test(o.name));
 const distant=data.manifest.objects.filter(o=>/^FldObj_Nagasaki03_Crane_/.test(o.name));
 assert.equal(camera.length,1);assert.equal(distant.length,4);
 for(const o of [...camera,...distant]){assert.equal(o.active,true);assert.equal(o.collidable,false);assert.ok(o.ic>0);}
 console.log(JSON.stringify({id:'sturgeon',opposedPadDistance:level.spawnPads[0].distanceTo(level.spawnPads[1]),navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,rankedCenter:stage.zones[0].center,movement}));
});
