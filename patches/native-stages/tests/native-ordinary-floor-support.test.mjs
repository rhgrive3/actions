import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';
import {TIDEWATER} from '../../../inkwave-public/src/world/maps.js';

const root=process.env.NATIVE_ORDINARY_FOLLOWER_ASSETS;
const ready=!!root&&fs.existsSync(path.join(root,'wahoo','manifest.json'));
test('ordinary unopted source arrival retains real foot, distance, height and airborne guards',{skip:!ready},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,d=readStage(root,'wahoo');
 const L=G.level=new f.NativeLevel(d);G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
 assert(!L.manifest.sourceNavigation?.wallClimb&&!L.manifest.sourceNavigation?.highDrops&&!L.manifest.sourceNavigation?.wallSurge);
 const digest=()=>crypto.createHash('sha256').update(Buffer.from(d.triangles.buffer)).update(Buffer.from(d.flags.buffer)).update(Buffer.from(d.mask.buffer)).digest('hex'),before=digest();
 const p=L.spawnPads[0],node={x:p.x,y:p.y,z:p.z};
 const hit=G.physics.raycast(p.clone().setY(p.y+.1),new THREE.Vector3(0,-1,0),.3);
 assert(hit.hit&&hit.triangle>=0&&Math.abs(hit.point.y-p.y)<1e-7);
 for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
  const a=new f.Actor({team:0,name:'ordinary source support',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});G.actors=[a];a.spawnAt(p,Math.PI/2);
  for(let i=0;i<hz;i++){G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);}
  assert(a.alive&&a.grounded);assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  const position=Array.from(a.pos.toArray()),velocity=Array.from(a.vel.toArray());
  assert.equal(f.nativeSourceWaypointReached(G,a,node),true);
  assert.equal(f.nativeSourceWaypointReached(G,a,{...node,x:node.x+.3}),false,'an unreached source point must not advance the route');
  assert.equal(f.nativeSourceWaypointReached(G,a,{...node,y:node.y+.5}),false,'unsupported high surface does not count as arrival');
  assert.equal(f.nativeSourceWaypointReached(G,a,{...node,y:node.y-.5}),false,'a different lower support does not count as arrival');
  a.grounded=false;assert.equal(f.nativeSourceWaypointReached(G,a,node),false,'ordinary source route must land before advancing');a.grounded=true;
  assert.deepEqual(Array.from(a.pos.toArray()),position);assert.deepEqual(Array.from(a.vel.toArray()),velocity);
 }
 assert.equal(digest(),before,'original source triangles, NP roles and masks stay identical');
});

test('real legacy Tidewater keeps generous waypoint policy without source-only foot gates',async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f;
 G.level=new f.Level(TIDEWATER);G.physics=new f.Physics(G.level);G.camera=new THREE.PerspectiveCamera();
 assert(!G.level.native);
 const a=new f.Actor({team:0,name:'legacy source policy',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.spawnAt(G.level.spawnPads[0],0);
 const node={x:a.pos.x+.3,y:a.pos.y+.5,z:a.pos.z};
 assert.equal(f.nativeSourceWaypointReached(G,a,node),true);
 a.grounded=false;assert.equal(f.nativeSourceWaypointReached(G,a,node),true,'legacy airborne waypoint handling remains unchanged');
});
