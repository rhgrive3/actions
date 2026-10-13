import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.NATIVE_SUPPORT_FIXTURE_ASSETS;
const enabled=!!root&&fs.existsSync(path.join(root,'humpback','manifest.json'));
test('source waypoint arrival uses the actual controller footprint on a real Humpback ramp',{skip:!enabled},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(root,'humpback');
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 const digest=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex'),before=digest();
 assert.equal(L.manifest.sourceNavigation.highDrops,true);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
 const node={x:10.2,y:2.204948592,z:-1.4},cases=[];let lastActor;
 const centre=P.raycast(new THREE.Vector3(node.x,node.y+.1,node.z),new THREE.Vector3(0,-1,0),.3);
 assert(centre.hit&&centre.triangle===95004);assert(Math.abs(centre.point.y-node.y)<1e-7);
 f.setRandom(()=>.5);
 try{for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
  const a=new f.Actor({team:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  lastActor=a;
  a.spawnAt(new THREE.Vector3(node.x,node.y,node.z),0);G.actors=[a];
  for(let frame=0;frame<hz;frame++){G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);}
  assert(a.alive&&a.grounded);assert(Math.abs(a.pos.y-node.y)>.16,'reproduce the rejected real footprint height');
  const position=Array.from(a.pos.toArray()),velocity=Array.from(a.vel.toArray());
  assert.equal(f.nativeSourceWaypointReached(G,a,node),true);
  assert.equal(f.nativeSourceFootSupported(G,a,node),true,'physical support is shared with other opted traversal handlers');
  const navigation=L.manifest.sourceNavigation;L.manifest.sourceNavigation=undefined;
  assert.equal(f.nativeSourceFootSupported(G,a,node),true,'physical support does not depend on the high-drop follower opt-in');
  L.manifest.sourceNavigation=navigation;
  assert.deepEqual(Array.from(a.pos.toArray()),position);assert.deepEqual(Array.from(a.vel.toArray()),velocity);
  assert.equal(f.nativeSourceWaypointReached(G,a,{...node,y:node.y+.5}),false,'a higher unsupported target remains rejected');
  assert.equal(f.nativeSourceFootSupported(G,a,{...node,y:node.y+.5}),false);
  assert.equal(f.nativeSourceWaypointReached(G,a,{...node,y:node.y-.5}),false,'a lower unrelated target remains rejected');
  a.grounded=false;assert.equal(f.nativeSourceWaypointReached(G,a,node),false,'airborne arrival remains rejected');a.grounded=true;
  const support=a._nativeWaypointGround;
  assert(Math.abs(support.y-a.pos.y)<1e-7);assert.equal(support.center,false);assert.equal(PLAYER.footRadius,.24);
  const probe=P.groundProbe;let formProbe;
  P.groundProbe=function(...args){formProbe={up:args[3],skipGrates:args[7]};return probe.apply(this,args);};
  a.form='squid';f.nativeSourceWaypointReached(G,a,node);
  assert.deepEqual(formProbe,{up:PLAYER.squidStepUp,skipGrates:true},'the swimmer retains its installed step and grate query policy');
  a.form='kid';P.groundProbe=probe;
  cases.push({hz,node,feet:position,centreTriangle:centre.triangle,footprintY:support.y,footprintBlock:support.block,centreHeightDifference:a.pos.y-node.y,productionActor:true,productionCharacter:true,weapon:'Shooter_Normal_00',gearAP:0});
 }}finally{f.restoreRandom();}
 L._addBlock({kind:'box',min:[node.x+.12,node.y+.2,node.z-.08],max:[node.x+.3,node.y+.3,node.z+.08],paint:false,hidden:true});
 assert.equal(f.nativeSourceWaypointReached(G,lastActor,node),false,'a dynamic box under only the foot ring cannot substitute for original source support');
 assert.equal(f.nativeSourceFootSupported(G,lastActor,node),false);
 assert(lastActor._nativeWaypointGround.block>=L.staticBlockCount);
 assert.equal(digest(),before,'original triangles, roles and masks remain unchanged');
 console.log(JSON.stringify({cases,sourceBuffersUnchanged:true,scope:'Standalone production Actor/Character on pinned source; natural neutral settling, no production-match or retail measurement claim'}));
});
