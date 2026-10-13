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
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(root,'sturgeon');
 const level=new f.NativeLevel(data),physics=new f.NativePhysics(level);G.level=level;G.physics=physics;
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
 for(const hz of [30,60,120]){
  const actor=f.make('shooter');actor._integrate=f.Actor.prototype._integrate;
  actor.spawnAt(level.spawnPads[0],0);actor.intent.move.set(0,0,1);actor.intent.fire=false;
  let groundedFrames=0;
  for(let i=0;i<hz;i++){G.time+=1/hz;actor.update(1/hz);if(actor.grounded)groundedFrames++;}
  assert.ok(actor.alive);assert.ok(actor.grounded);assert.ok(actor.pos.z-level.spawnPads[0].z>3);
  assert.equal(groundedFrames,hz,'real source support throughout inward walking');
  movement.push({hz,weapon:actor.weaponId,gearAP:0,seconds:1,input:[0,0,1],pos:actor.pos.toArray(),groundedFrames});
 }
 const camera=data.manifest.objects.filter(o=>/^Fld_Nagasaki03_CameraWall_/.test(o.name));
 const distant=data.manifest.objects.filter(o=>/^FldObj_Nagasaki03_Crane_/.test(o.name));
 assert.equal(camera.length,1);assert.equal(distant.length,4);
 for(const o of [...camera,...distant]){assert.equal(o.active,true);assert.equal(o.collidable,false);assert.ok(o.ic>0);}
 console.log(JSON.stringify({id:'sturgeon',opposedPadDistance:level.spawnPads[0].distanceTo(level.spawnPads[1]),navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,rankedCenter:stage.zones[0].center,movement}));
});
