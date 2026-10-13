import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {readStage} from './fixture.mjs';

const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,
 extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs'; export {sweepLevelSphere} from './inkwave-public/src/game/inkCollision.js';"});
const {THREE}=f,V=(x,y,z)=>new THREE.Vector3(x,y,z);
function triangleStage(flags=3,paint=true){
 const data={manifest:{id:'synthetic-sweep',bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[-5,0,0],[5,0,0]],spawnBarrier:0,
  faces:[{n:[1,0,0],u:[0,1,0],v:[0,0,1],origin:[0,0,0],su:2,sv:2,bounds:[[0,0,0],[0,2,2]],triangles:[0]}],
  objects:[{collidable:true,grate:!!(flags&4),bounds:[[-10,-10,-10],[10,10,10]]}]},
  triangles:new Float32Array([0,0,0,0,2,0,0,0,2]),normals:new Float32Array([1,0,0]),flags:new Uint32Array([flags]),objectIds:new Uint32Array([0]),
  nodes:new Float32Array([0,0,0,0,2,2,-1,1]),order:new Uint32Array([0]),triangleFace:new Int32Array([paint?0:-1]),mask:new Uint8Array([1])};
 return new f.NativeLevel(data);
}
const close=(a,b,e=2e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function sweep(level,a,b,r=.2,skip=true){return f.sweepLevelSphere(level,V(...a),V(...b),r,{point:V(0,0,0),normal:V(0,0,0)},skip);}

test('source sweep reaches the actual thin wall instead of enclosing object bounds',()=>{
 const level=triangleStage(),a=[-5,.5,.5],b=[5,.5,.5];
 level.native=false;const old=sweep(level,a,b);level.native=true;
 assert.equal(old.hit,true);assert.equal(old.dist,0);assert.equal(old.face,-1,'negative control hits giant inferred object box');
 const hit=sweep(level,a,b);assert.equal(hit.hit,true);close(hit.dist,4.8);assert.equal(hit.triangle,0);assert.equal(hit.face,0);
 close(hit.point.x,0);close(hit.point.y,.5);close(hit.point.z,.5);close(hit.normal.x,-1);close(hit.u,.5);close(hit.v,.5);
 const reverse=sweep(level,b,a);close(reverse.dist,4.8);close(reverse.normal.x,1);
});
test('chart rectangle holes are open to projectiles and a missed query clears stale identifiers',()=>{
 const level=triangleStage();level.native=false;assert.equal(sweep(level,[-5,1.7,1.7],[5,1.7,1.7],.1).hit,true);level.native=true;
 const hit=sweep(level,[-5,1.7,1.7],[5,1.7,1.7],.1);assert.equal(hit.hit,false);assert.equal(hit.face,-1);assert.equal(hit.block,-1);assert.equal(hit.triangle,-1);
});
test('rounded triangle edges and vertices have finite earliest contacts',()=>{
 const level=triangleStage(),expected=5-Math.sqrt(.2**2-2*.1**2);
 for(const [y,z,point] of [[1.1,1.1,[0,1,1]],[-.1,-.1,[0,0,0]]]){
  const hit=sweep(level,[-5,y,z],[5,y,z]);assert.equal(hit.hit,true);close(hit.dist,expected);close(hit.normal.length(),1);
  for(let i=0;i<3;i++)close(hit.point.getComponent(i),point[i]);
 }
 assert.equal(sweep(level,[-5,-.3,-.3],[5,-.3,-.3]).hit,false);
});
test('continuous source sweep does not tunnel at large time steps or through zero-radius faces',()=>{
 for(const radius of [0,.025,.2]){
  const hit=sweep(triangleStage(),[-500,.5,.5],[500,.5,.5],radius);assert.equal(hit.hit,true);close(hit.dist,500-radius,2e-5);
 }
});
test('stationary overlap and tangency use an actual surface contact',()=>{
 const level=triangleStage(),hit=sweep(level,[-.1,.5,.5],[-.1,.5,.5]);assert.equal(hit.hit,true);assert.equal(hit.dist,0);close(hit.point.x,0);close(hit.normal.x,-1);
 assert.equal(sweep(level,[-.3,.5,.5],[-.3,.5,.5]).hit,false);
 const tangent=sweep(level,[-5,2.2,0],[5,2.2,0]);assert.equal(tangent.hit,true);close(tangent.dist,5,2e-5);close(tangent.point.y,2);
});
test('source grate and NoPaint contracts remain distinct from solid collision',()=>{
 const grate=triangleStage(7);assert.equal(sweep(grate,[-5,.5,.5],[5,.5,.5]).hit,false);assert.equal(sweep(grate,[-5,.5,.5],[5,.5,.5],.2,false).hit,true);
 const opaque=sweep(triangleStage(1,false),[-5,.5,.5],[5,.5,.5]);assert.equal(opaque.hit,true);assert.equal(opaque.face,-1);close(opaque.dist,4.8);
});
test('actual dynamic game OBBs retain their analytic sweep and nearest-hit priority',()=>{
 const level=triangleStage(),id=level.blocks.length;
 level.blocks.push({id,solid:true,grate:false,center:V(-2,1,1),half:V(.5,.5,.5),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],aabbMin:V(-2.5,.5,.5),aabbMax:V(-1.5,1.5,1.5),faces:[-1,-1,-1,-1,-1,-1]});
 const hit=sweep(level,[-5,1,1],[5,1,1]);assert.equal(hit.hit,true);assert.equal(hit.block,id);assert.equal(hit.triangle,-1);close(hit.dist,2.3);close(hit.point.x,-2.5);
 const source=sweep(level,[5,.6,.6],[-5,.6,.6]);assert.equal(source.triangle,0);close(source.dist,4.8);
});
test('admitted ink damages the near enemy but cannot damage through a source wall',async()=>{
 for(const x of [-2,2]){
  const fresh=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,
   extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';"}),{G}=fresh;
  const level=new fresh.NativeLevel(triangleStage().data);G.level=level;G.physics=new fresh.NativePhysics(level);
  const actor=fresh.make('shooter'),enemy=fresh.make('shooter');enemy.team=1;enemy.pos.set(x,0,.5);
  actor.pos.set(-5,0,.5);actor.character.root.position.copy(actor.pos);actor.aimYaw=actor.intent.aimYaw=Math.PI/2;actor.aimPoint.set(5,1.05,.5);actor.intent.fire=true;fresh.setRandom(()=>.5);
  for(let i=0;i<60&&!G.projectiles.list.length;i++){G.time+=1/60;actor.update(1/60);}actor.intent.fire=false;
  assert.equal(G.projectiles.list.length,1,'the ordinary source weapon admits its head');const hp=enemy.hp;
  for(let i=0;i<60;i++){G.time+=1/60;G.projectiles.update(1/60);}
  if(x<0)assert.ok(enemy.hp<hp,'enemy capsule in front of source wall receives damage');
  else assert.equal(enemy.hp,hp,'source wall wins before the enemy capsule');
 }
});

const ASSETS=process.env.INKWAVE_NATIVE_SWEEP_ASSETS;
for(const hz of [30,60,120])test('original Flounder admitted source shot paints its real wall at '+hz+' Hz',{skip:!ASSETS||!fs.existsSync(path.join(ASSETS,'flounder','manifest.json'))},()=>{
 const {G}=f,level=new f.NativeLevel(readStage(ASSETS,'flounder'));G.actors.length=0;G.projectiles.clear();G.time=0;G.level=level;G.physics=new f.NativePhysics(level);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.paint=new CpuPaint(null,level,{atlasSize:2048,maxDensity:4,cell:.25});
 const from=V(10.348,7.05,-10.7),to=V(8.255532108871513,7.912507995493927,-10.81141850073193);
 level.native=false;const old=sweep(level,from.toArray(),to.toArray());level.native=true;assert.equal(old.hit,true);assert.equal(old.dist,0);assert.equal(old.face,-1);
 assert.equal(sweep(level,from.toArray(),to.toArray()).hit,false,'the first source segment remains clear');
 const far=from.clone().addScaledVector(V(-125.54807346770923,51.75047972963562,-6.685110043915829),.04),hit=sweep(level,from.toArray(),far.toArray());
 assert.equal(hit.hit,true);assert.equal(hit.face,40740);assert.equal(hit.triangle,149775);close(hit.point.x,7,2e-4);
 const actor=f.make('shooter');actor.pos.set(10.348,6,-11);actor.character.root.position.copy(actor.pos);actor.aimYaw=actor.intent.aimYaw=Math.atan2(-125.54807346770923,-6.685110043915829);actor.aimPitch=actor.intent.aimPitch=Math.atan2(51.75047972963562,Math.hypot(125.54807346770923,6.685110043915829));
 actor.aimPoint.copy(hit.point);f.setRandom(()=>.5);
 actor.intent.fire=true;for(let i=0;i<hz&&!G.projectiles.list.length;i++){G.time+=1/hz;actor.update(1/hz);}actor.intent.fire=false;
 assert.equal(G.projectiles.list.length,1,'ordinary Actor→WeaponRunner→Projectiles admits one source round');
 for(let i=0;i<hz/2;i++){G.time+=1/hz;G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);}
 const face=level.faces[40740];assert.equal(G.paint.sample(face.id,hit.u,hit.v),1,'the target source wall is owned, not a manual floor stamp');
});
