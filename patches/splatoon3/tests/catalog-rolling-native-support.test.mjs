import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const extraExports="export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';";
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.settings={};f.setRandom(()=>.37);
const records=f.MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&['roller','brush'].includes(r.family));
const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
function world(degrees=0,{floorY=0,extra=[]}={}){
 const rise=Math.tan(degrees*Math.PI/180)*12;
 const level=new f.Level({bounds:{minX:-25,maxX:25,minZ:-15,maxZ:25},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,
 single:[{kind:'box',min:[-25,floorY-1,-15],max:[25,floorY,25]},...extra,...(degrees?[{kind:'ramp',low:[0,0,0],high:[0,rise,12],width:20,thickness:.5}]:[])],half:[]});
 f.G.level=level;f.G.physics=new f.Physics(level);f.G.scene=new f.THREE.Scene();f.G.actors=[];f.G.time=0;
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){this.quads=0;}}
 const paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:20,cell:.25});f.G.paint=paint;f.G.projectiles=new f.Projectiles(f.G.scene);
 const calls=[],splat=paint.splat;paint.splat=function(at,r,team,opts){const area=splat.call(this,at,r,team,opts);calls.push({at:at.clone(),r,area,face:opts.face});return area;};
 return {paint,level,calls};
}
function actor(id,z=4){const a=f.make(id);a.pos.set(0,20,z);const h={hit:false,point:V(),normal:V()};f.G.physics.raycast(a.pos,V(0,-1,0),40,h,true);assert.ok(h.hit);a.pos.copy(h.point);a.ground.hit=true;a.ground.face=h.face;a.ground.normal.copy(h.normal);a.groundN.copy(h.normal);a.yaw=0;a.aimDir.set(0,-1,.001).normalize();a.grounded=true;a.form='kid';a.ink=100;a.weaponRunner.cooldown=0;return a;}
const tick=(a,dt,fire=true)=>{f.G.time+=dt;a.weaponRunner.update(dt,{fire,firePressed:false,sub:false});f.G.paint.advanceSimulation(dt);};

function enableActor(a){delete a._integrate;a.intent.fire=true;a._prevIntent.fire=true;a.kidT=10;a.aimPitch=-Math.PI/2;a.aimYaw=0;a.weaponRunner.cooldown=0;}
function actorTick(a){f.G.time+=1/60;a.update(1/60);f.G.paint.advanceSimulation(1/60);}
for(const gap of [0,.000001,.0001,.01,.2])for(const detour of [false,true]) test('distinct native faces gap '+gap+' offpath detour '+detour,()=>{
 world();const tris=[];for(const [z0,z1] of [[-2,.2],[.2+gap,2]])tris.push(-2,0,z0,2,0,z0,2,0,z1,-2,0,z0,2,0,z1,-2,0,z1);
 if(detour)tris.push(1,0,.2,2,0,.2,2,0,.2+gap,1,0,.2,2,0,.2+gap,1,0,.2+gap); const d={triangles:new Float32Array(tris),normals:new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0]),flags:new Uint32Array([3,3,3,3]),objectIds:new Uint32Array([0,0,0,0]),nodes:new Float32Array([-2,0,-2,2,0,2,-1,4]),order:new Uint32Array([0,1,2,3]),triangleFace:new Int32Array([0,0,0,0]),mask:new Uint8Array(64).fill(1),manifest:{id:'gap',bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2},spawnPads:[[0,0,-1],[0,0,1]],spawnBarrier:0,gridCells:64,objects:[{collidable:true,bounds:[[-2,0,-2],[2,0,2]]}],faces:[{origin:[-2,0,-2],u:[1,0,0],v:[0,0,1],n:[0,1,0],su:4,sv:4,nu:8,nv:8,cu:.5,cv:.5,grid:0,object:0,triangles:[0,1,2,3],bounds:[[-2,0,-2],[2,0,2]]}]}};
 const count=tris.length/9;d.normals=new Float32Array(Array.from({length:count},()=>[0,1,0]).flat());d.flags=new Uint32Array(count).fill(3);d.objectIds=new Uint32Array(count);d.order=new Uint32Array(Array.from({length:count},(_,i)=>i));d.triangleFace=new Int32Array(Array.from({length:count},(_,i)=>Math.floor(i/2)));d.nodes[7]=count;const template=d.manifest.faces[0];d.manifest.faces=Array.from({length:count/2},(_,i)=>({...template,triangles:[2*i,2*i+1]}));const level=f.G.level=new f.NativeLevel(d);f.G.physics=new f.NativePhysics(level);const calls=[];f.G.paint={sample:()=>0,splat:(...args)=>{calls.push(args);return 0;},advanceSimulation:()=>{}};
 const a=actor('s3-roller-compact',0);const h=new f.Hit();f.G.physics.raycast(V(0,.15,.2+gap/2),V(0,-1,0),.3,h,true);if(gap===0||gap>=.0001)assert.equal(h.hit,gap===0,'actual mesh gap or continuous surface');else console.log('SUBTOLERANCE_RAY_HIT',gap,h.hit);enableActor(a);actorTick(a);assert.ok(a.ground.hit&&a.grounded,'real Actor keeps support');console.log('NATIVE_GAP',a.ground.face,calls.length);if(gap===0){assert.ok(calls.length>0,'continuous native mesh must paint across face IDs');assert.equal(calls[0][3].face,1);}else assert.equal(calls.length,0,'gap in centre path must not bridge even via off-path topology');
});

for(const strips of [64,65,1024]) test('continuous native tessellation '+strips,()=>{
 world();const tris=[];for(const [z0,z1] of Array.from({length:strips},(_,i)=>[-.001+i*.602/strips,-.001+(i+1)*.602/strips]))tris.push(-2,0,z0,2,0,z0,2,0,z1,-2,0,z0,2,0,z1,-2,0,z1);
 const d={triangles:new Float32Array(tris),normals:new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0]),flags:new Uint32Array([3,3,3,3]),objectIds:new Uint32Array([0,0,0,0]),nodes:new Float32Array([-2,0,-2,2,0,2,-1,4]),order:new Uint32Array([0,1,2,3]),triangleFace:new Int32Array([0,0,0,0]),mask:new Uint8Array(64).fill(1),manifest:{id:'gap',bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2},spawnPads:[[0,0,-1],[0,0,1]],spawnBarrier:0,gridCells:64,objects:[{collidable:true,bounds:[[-2,0,-2],[2,0,2]]}],faces:[{origin:[-2,0,-2],u:[1,0,0],v:[0,0,1],n:[0,1,0],su:4,sv:4,nu:8,nv:8,cu:.5,cv:.5,grid:0,object:0,triangles:[0,1,2,3],bounds:[[-2,0,-2],[2,0,2]]}]}};
 const count=tris.length/9;d.normals=new Float32Array(Array.from({length:count},()=>[0,1,0]).flat());d.flags=new Uint32Array(count).fill(3);d.objectIds=new Uint32Array(count);d.order=new Uint32Array(Array.from({length:count},(_,i)=>i));d.triangleFace=new Int32Array(count);d.nodes[7]=count;d.manifest.faces[0].triangles=Array.from(d.order);
 d.triangleFace=new Int32Array(Array.from({length:count},(_,i)=>Math.floor(i/2)));const template=d.manifest.faces[0];d.manifest.faces=Array.from({length:strips},(_,i)=>({...template,triangles:[2*i,2*i+1]})); const level=f.G.level=new f.NativeLevel(d);f.G.physics=new f.NativePhysics(level);const calls=[];f.G.paint={sample:()=>0,splat:(...args)=>{calls.push(args);return 0;},advanceSimulation:()=>{}};
 const a=actor('s3-roller-compact',0);const h=new f.Hit();f.G.physics.raycast(V(0,.15,0.2),V(0,-1,0),.3,h,true);assert.equal(h.hit,true,'actual mesh gap or continuous surface');enableActor(a);actorTick(a);assert.ok(a.ground.hit&&a.grounded,'real Actor keeps support');console.log('NATIVE_GAP',a.ground.face,calls.length);assert.ok(calls.length>0,'continuous native mesh must paint');
});

for(const mirror of [1,-1])for(const gap of [0,.0001])test('generic float32 shared-edge planes mirror '+mirror+' gap '+gap,()=>{
 world();const seam=.3,y=z=>z<=seam?6-.7*z:6-.7*seam-.9*(z-seam),tris=[];
 for(const [z0,z1] of [[-2,seam],[seam+gap,2]])tris.push(-2,y(z0),mirror*z0,2,y(z0),mirror*z0,2,y(z1),mirror*z1,-2,y(z0),mirror*z0,2,y(z1),mirror*z1,-2,y(z1),mirror*z1);
 const triangles=new Float32Array(tris), normals=new Float32Array(12);
 for(let i=0;i<4;i++){const a=V().fromArray(triangles,i*9),b=V().fromArray(triangles,i*9+3),c=V().fromArray(triangles,i*9+6),n=b.sub(a).cross(c.sub(a)).normalize();if(n.y<0)n.negate();normals.set(n.toArray(),i*3);}
 if(gap===0){
  const vertices=id=>Array.from({length:3},(_,j)=>Array.from(triangles.subarray(id*9+j*3,id*9+j*3+3)).join(','));
  assert.equal(vertices(1).filter(v=>vertices(2).includes(v)).length,2,'both source triangles share exact Float32 edge');
  const edge=V(0,triangles[2*9+1],triangles[2*9+2]);
  const projectedY=id=>{const o=V().fromArray(triangles,id*9),n=V().fromArray(normals,id*3);return o.y-((edge.x-o.x)*n.x+(edge.z-o.z)*n.z)/n.y;};
  assert.ok(Math.abs(projectedY(1)-projectedY(2))>1e-8,'stored Float32 normal planes must disagree beyond continuity tolerance');
 }
 const faces=[0,1].map(i=>({origin:[-2,0,-2],u:[1,0,0],v:[0,0,1],n:Array.from(normals.slice(i*6,i*6+3)),su:4,sv:4,nu:8,nv:8,cu:.5,cv:.5,grid:i*64,object:0,triangles:[i*2,i*2+1],bounds:[[-2,0,-2],[2,8,2]]}));
 const d={triangles,normals,flags:new Uint32Array([3,3,3,3]),objectIds:new Uint32Array(4),nodes:new Float32Array([-2,0,-2,2,8,2,-1,4]),order:new Uint32Array([0,1,2,3]),triangleFace:new Int32Array([0,0,1,1]),mask:new Uint8Array(128).fill(1),manifest:{id:'synthetic-rounded-seam',bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2},spawnPads:[[0,0,-1],[0,0,1]],spawnBarrier:0,gridCells:128,objects:[{collidable:true,bounds:[[-2,0,-2],[2,8,2]]}],faces}};
 f.G.level=new f.NativeLevel(d);f.G.physics=new f.NativePhysics(f.G.level);const calls=[];f.G.paint={sample:()=>0,splat:(...args)=>{calls.push(args);return 0;},advanceSimulation:()=>{}};
 const a=actor('s3-roller-compact',0);a.yaw=mirror===1?0:Math.PI;tick(a,1/60);assert.ok(a.ground.hit);console.log('SYNTHETIC_SEAM',mirror,gap,calls.length);if(gap===0){assert.ok(calls.length>0,'exact shared vertices must retain rolling contact despite Float32 normal rounding');assert.equal(calls[0][3].face,1);}else assert.equal(calls.length,0,'real gap remains rejected');
});
