import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const extraExports="export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';";
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.settings={};f.setRandom(()=>.37);
const records=f.MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&['roller','brush'].includes(r.family));
const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
let orientation=0;
const rotate=(p)=>[p[0]*Math.cos(orientation)+p[2]*Math.sin(orientation),p[1],-p[0]*Math.sin(orientation)+p[2]*Math.cos(orientation)];
function rotateDef(d){if(d.kind==='ramp')return {...d,low:rotate(d.low),high:rotate(d.high)};const a=rotate(d.min),b=rotate(d.max);return {...d,min:a.map((x,i)=>Math.min(x,b[i])),max:a.map((x,i)=>Math.max(x,b[i]))};}
function world(degrees=0,{floorY=0,extra=[]}={}){
 const rise=Math.tan(degrees*Math.PI/180)*12;
 const level=new f.Level({bounds:{minX:-25,maxX:25,minZ:-15,maxZ:25},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,
 single:[{kind:'box',min:[-25,floorY-1,-15],max:[25,floorY,25]},...extra,...(degrees?[{kind:'ramp',low:[0,0,0],high:[0,rise,12],width:20,thickness:.5}]:[])].map(rotateDef),half:[]});
 f.G.level=level;f.G.physics=new f.Physics(level);f.G.scene=new f.THREE.Scene();f.G.actors=[];f.G.time=0;
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){this.quads=0;}}
 const paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:20,cell:.25});f.G.paint=paint;f.G.projectiles=new f.Projectiles(f.G.scene);
 const calls=[],splat=paint.splat;paint.splat=function(at,r,team,opts){const area=splat.call(this,at,r,team,opts);calls.push({at:at.clone(),r,area,face:opts.face});return area;};
 return {paint,level,calls};
}
function actor(id,z=4){const a=f.make(id);a.pos.set(0,20,z);const h={hit:false,point:V(),normal:V()};f.G.physics.raycast(a.pos,V(0,-1,0),40,h,true);assert.ok(h.hit);a.pos.copy(h.point);a.ground.hit=true;a.ground.face=h.face;a.ground.normal.copy(h.normal);a.groundN.copy(h.normal);a.yaw=0;a.aimDir.set(0,-1,.001).normalize();a.grounded=true;a.form='kid';a.ink=100;a.intent.move.set(0,0,1);a.vel.set(0,0,.12);a.weaponRunner.cooldown=0;return a;}
const tick=(a,dt,fire=true)=>{f.G.time+=dt;a.weaponRunner.update(dt,{fire,firePressed:false,sub:false});f.G.paint.advanceSimulation(dt);};

function enableActor(a){delete a._integrate;a.intent.fire=true;a._prevIntent.fire=true;a.intent.move.set(Math.sin(a.yaw),0,Math.cos(a.yaw));a.vel.set(Math.sin(a.yaw)*.12,0,Math.cos(a.yaw)*.12);a.kidT=10;a.aimPitch=-Math.PI/2;a.aimYaw=0;a.weaponRunner.cooldown=0;}
function actorTick(a){f.G.time+=1/60;a.update(1/60);f.G.paint.advanceSimulation(1/60);}
// Production rolling requires both intended movement and nonzero actual speed.
test('stationary, no-stick and blocked rollers never paint, damage or drain ink',()=>{
 for(const r of records)for(const [stick,speed] of [[0,0],[0,.12],[1,0]]){
  const w=world(),a=actor(r.id);a.intent.move.set(0,0,stick);a.vel.set(0,0,speed);
  tick(a,1/60);assert.equal(w.calls.length,0,r.id+' input '+stick+' speed '+speed);
  assert.equal(a.ink,100);assert.equal(a.stats.turf,0);
 }
});
test('all seven families acquire real floor cells at 30/60/120Hz',()=>{
 for(const r of records)for(const hz of [30,60,120]){const w=world(),a=actor(r.id);tick(a,1/hz);assert.ok(w.calls.length>0,r.id+' at '+hz);assert.ok(w.paint.counts[0]>0);assert.ok(a.stats.turf>0);assert.ok(a.ink<100&&a.ink>=0);}
});
test('release and ink exhaustion do not bridge old paint positions',()=>{
 for(const r of records){const w=world(),a=actor(r.id);tick(a,1/60);tick(a,1/60,false);a.pos.z+=8;w.calls.length=0;tick(a,1/60);assert.equal(w.calls.length,1,'release reset '+r.id);a.ink=0;tick(a,1/60);a.pos.z+=8;a.ink=100;w.calls.length=0;tick(a,1/60);assert.equal(w.calls.length,1,'ink reset '+r.id);}
});
test('large steps preserve real paint acquisition with at most six stamps',()=>{
 for(const hz of [30,60,120]){const w=world(),a=actor('s3-roller-compact');tick(a,1/hz);a.pos.z+=8;a.vel.z=8*hz;w.calls.length=0;tick(a,1/hz);assert.ok(w.calls.length>1&&w.calls.length<=6);assert.ok(w.calls.some(c=>c.area>0));assert.ok(w.calls.every((c,i)=>i===0||c.at.z>w.calls[i-1].at.z));}
});
test('uphill rolling finds native ramp face at 30 and45 degrees',()=>{
 for(const degrees of [30,45]){const w=world(degrees),a=actor('s3-roller-compact');tick(a,1/60);assert.ok(w.calls.length>0,'uphill '+degrees+' degrees has a real ray hit');assert.ok(w.paint.counts[0]>0);assert.ok(w.calls.some(c=>w.level.faces[c.face].n.y<.99),'ramp face rather than lower floor');}
});

test('all families confirm uphill and downhill45 degree contact at30/60/120Hz',()=>{
 for(const r of records)for(const hz of [30,60,120])for(const yaw of [0,Math.PI]){
  const w=world(45),a=actor(r.id);a.yaw=yaw;tick(a,1/hz);
  assert.ok(w.calls.length>0,r.id+' '+hz+' yaw'+yaw);assert.ok(w.paint.counts[0]>0);
  assert.ok(w.calls.every(c=>c.face===a.ground.face));
 }
});
test('ledge does not paint lower ground and overhang never becomes support',()=>{
 const ledge=world(0,{floorY:-3,extra:[{kind:'box',min:[-4,-.5,0],max:[4,0,4.3]}]});
 const a=actor('s3-roller-compact',4);tick(a,1/60);
 assert.equal(ledge.calls.length,0,'forward drum centre leaves finite upper face');
 assert.equal(ledge.paint.counts[0],0,'no projection onto lower floor');
 const roof=world(0,{extra:[{kind:'box',min:[-4,2,2],max:[4,2.3,8]}]});
 const b=actor('s3-roller-compact',0);b.pos.z=4;tick(b,1/60);
 assert.ok(roof.calls.length>0);assert.ok(roof.calls.every(c=>Math.abs(c.at.y)<1e-8),'floor, never overhead roof');
});
test('changing accepted support face cannot bridge an old stroke across a gap',()=>{
 const w=world(0,{floorY:-3,extra:[{kind:'box',min:[-4,-.5,0],max:[4,0,4.3]},
  {kind:'box',min:[-4,1.5,10],max:[4,2,16]}]});
 const a=actor('s3-roller-compact',2);tick(a,1/60);const oldFace=a.ground.face;
 const h={hit:false,point:V(),normal:V()};f.G.physics.raycast(V(0,20,12),V(0,-1,0),40,h,true);
 assert.ok(h.hit&&h.face!==oldFace);a.pos.copy(h.point);a.ground.face=h.face;a.ground.normal.copy(h.normal);a.groundN.copy(h.normal);
 w.calls.length=0;tick(a,1/60);assert.equal(w.calls.length,1);assert.equal(w.calls[0].face,h.face);assert.ok(w.calls[0].at.z>12);
 a.ground.hit=false;w.calls.length=0;tick(a,1/60);assert.equal(w.calls.length,0,'missing support must not paint');
});
test('real Actor integration refreshes support before rolling on flat and ramp',()=>{
 for(const degrees of [0,45]){const w=world(degrees),a=actor('s3-roller-compact');enableActor(a);a.ground.hit=false;a.ground.face=-1;actorTick(a);assert.ok(a.grounded);assert.ok(a.ground.hit);assert.ok(a.ground.face>=0);assert.ok(w.calls.length>0);assert.ok(w.calls.every(c=>c.face===a.ground.face));console.log('ACTOR_SUPPORT',degrees,a.pos.toArray(),a.ground.face,w.calls.length);}
});
test('adjacent coplanar boxes: real Actor preserves paint contact across a flush seam',()=>{
 const w=world(0,{floorY:-3,extra:[{kind:'box',min:[-4,-.5,0],max:[4,0,4.3]},{kind:'box',min:[-4,-.5,4.3],max:[4,0,10]}]});
 const a=actor('s3-roller-compact',3.9);enableActor(a);actorTick(a);
 const h={hit:false,point:V(),normal:V()};f.G.physics.raycast(V(0,.15,4.5),V(0,-1,0),.3,h,true);
 console.log('FLUSH_SEAM',JSON.stringify({pos:a.pos.toArray(),grounded:a.grounded,support:a.ground.face,drumHit:h.hit,drumFace:h.face,calls:w.calls.length,ink:a.ink}));
 assert.ok(a.grounded&&a.ground.hit&&h.hit);assert.notEqual(h.face,a.ground.face);assert.ok(w.calls.length>0,'a drum touching the connected coplanar next face must still paint');
});
test('nearby parallel planes above and below cannot masquerade as contact',()=>{
 for(const y of [-.1,.1]){const w=world(0,{floorY:-3,extra:[{kind:'box',min:[-4,-.5,0],max:[4,0,4.3]},{kind:'box',min:[-4,y-.5,4.3],max:[4,y,10]}]});const a=actor('s3-roller-compact',3.9);enableActor(a);actorTick(a);const h={hit:false,point:V(),normal:V()};f.G.physics.raycast(V(0,.15,4.5),V(0,-1,0),.3,h,true);assert.ok(h.hit);assert.equal(a.pos.y,0);assert.equal(w.calls.length,0);console.log('SHIFTED_PLANE_REJECTED',y,h.point.toArray());}
});
test('connected noncoplanar ramp junction retains actual contact',()=>{
 const w=world(0,{floorY:0,extra:[{kind:'ramp',low:[0,0,4.3],high:[0,2,16.3],width:8,thickness:.5}]});
 const a=actor('s3-roller-compact',3.9);enableActor(a);actorTick(a);const h={hit:false,point:V(),normal:V()};f.G.physics.raycast(V(0,.15,4.5),V(0,-1,0),.3,h,true);
 console.log('RAMP_JUNCTION',JSON.stringify({pos:a.pos.toArray(),grounded:a.grounded,support:a.ground.face,drumHit:h.hit,drumFace:h.face,drumPoint:h.point.toArray(),normal:h.normal.toArray(),calls:w.calls.length}));assert.ok(a.grounded&&h.hit);assert.notEqual(h.face,a.ground.face);assert.ok(w.calls.length>0,'rolling should paint while drum contacts connected gentle ramp');
});

test('three adjacent coplanar strips remain continuously paintable',()=>{
 const w=world(0,{floorY:-3,extra:[{kind:'box',min:[-4,-.5,-2],max:[4,0,.2]},{kind:'box',min:[-4,-.5,.2],max:[4,0,.4]},{kind:'box',min:[-4,-.5,.4],max:[4,0,2]}]});const a=actor('s3-roller-compact',0);enableActor(a);actorTick(a);console.log('THREE_STRIPS',a.pos.toArray(),a.ground.face,w.calls.length);assert.ok(w.calls.length>0,'continuous three-face path must paint');
});
test('native chart bounds must not prove connectivity across an actual mesh hole',()=>{
 world();const tris=[];for(const [z0,z1] of [[-2,.2],[.4,2]])tris.push(-2,0,z0,2,0,z0,2,0,z1,-2,0,z0,2,0,z1,-2,0,z1);
 const d={triangles:new Float32Array(tris),normals:new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0]),flags:new Uint32Array([3,3,3,3]),objectIds:new Uint32Array([0,0,0,0]),nodes:new Float32Array([-2,0,-2,2,0,2,-1,4]),order:new Uint32Array([0,1,2,3]),triangleFace:new Int32Array([0,0,0,0]),mask:new Uint8Array(64).fill(1),manifest:{id:'gap',bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2},spawnPads:[[0,0,-1],[0,0,1]],spawnBarrier:0,gridCells:64,objects:[{collidable:true,bounds:[[-2,0,-2],[2,0,2]]}],faces:[{origin:[-2,0,-2],u:[1,0,0],v:[0,0,1],n:[0,1,0],su:4,sv:4,nu:8,nv:8,cu:.5,cv:.5,grid:0,object:0,triangles:[0,1,2,3],bounds:[[-2,0,-2],[2,0,2]]}]}};
 const level=f.G.level=new f.NativeLevel(d);f.G.physics=new f.NativePhysics(level);const calls=[];f.G.paint={sample:()=>0,splat:(...args)=>{calls.push(args);return 0;},advanceSimulation:()=>{}};
 const a=actor('s3-roller-compact',0);const h=new f.Hit();f.G.physics.raycast(V(0,.15,.3),V(0,-1,0),.3,h,true);assert.equal(h.hit,false,'actual mesh gap');tick(a,1/60);console.log('NATIVE_GAP',a.ground.face,calls.length);assert.equal(calls.length,0,'chart rectangle cannot prove continuous support through missing triangles');
});
test('downhill ramp must not paint its buried extension below covering floor',()=>{
 const w=world(45),a=actor('s3-roller-compact',.2);a.yaw=Math.PI;enableActor(a);a.aimYaw=Math.PI;actorTick(a);console.log('BURIED_RAMP',JSON.stringify({pos:a.pos.toArray(),support:a.ground.face,calls:w.calls.map(c=>({at:c.at.toArray(),face:c.face}))}));assert.ok(w.calls.length>0);assert.ok(w.calls.every(c=>c.at.y>=-1e-8),'actual visible floor is y0, never buried ramp y<0');
});
function placed(id,z,back=false){const a=f.make(id);const p=rotate([0,20,z]);a.pos.set(...p);const h={hit:false,point:V(),normal:V()};f.G.physics.raycast(a.pos,V(0,-1,0),40,h,true);assert.ok(h.hit);a.pos.copy(h.point);a.ground.hit=true;a.ground.face=h.face;a.ground.normal.copy(h.normal);a.groundN.copy(h.normal);a.yaw=orientation+(back?Math.PI:0);a.aimDir.set(0,-1,.001).normalize();a.grounded=true;a.form='kid';a.ink=100;a.intent.move.set(Math.sin(a.yaw),0,Math.cos(a.yaw));a.vel.set(Math.sin(a.yaw)*.12,0,Math.cos(a.yaw)*.12);a.weaponRunner.cooldown=0;return a;}
function junction(gap=0,rise=2){return world(0,{floorY:-3,extra:[{kind:'box',min:[-4,-.5,0],max:[4,0,4.3]},{kind:'ramp',low:[0,0,4.3+gap],high:[0,rise,16.3+gap],width:8,thickness:.5}]});}
for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2])for(const r of records)for(const back of [false,true])for(const rise of [2,12])test(`seam ${r.id} angle ${angle} reverse ${back} rise ${rise}`,()=>{
  orientation=angle;const w=junction(0,rise),a=placed(r.id,back?4.7:3.9,back);tick(a,1/60);
  assert.ok(w.calls.length>0,`${r.id} angle ${angle} back ${back} rise ${rise}`);assert.ok(w.paint.counts[0]>0);
  assert.ok(w.calls.some(c=>c.face!==a.ground.face),`drum reached adjacent face: ${r.id} angle ${angle} back ${back} rise ${rise}; support ${a.ground.face} calls ${JSON.stringify(w.calls)}`);
});
test('narrow open gaps reject disconnected coplanar destinations in all orientations',()=>{
 for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2])for(const gap of [.0001,.01,.1])for(const rise of [0]){
  orientation=angle;const w=world(0,{floorY:-3,extra:[{kind:'box',min:[-4,-.5,0],max:[4,0,4.3]},{kind:'box',min:[-4,-.5,4.3+gap],max:[4,0,16.3]}]}),a=placed('s3-roller-compact',3.9);tick(a,1/60);assert.equal(w.calls.length,0,`gap ${gap} rise ${rise} angle ${angle}`);
 }
});

// A partially initialized level cannot prove floor coverage, but must not
// throw or suppress the separately validated ink and body-damage behavior.
test('missing collision-query capability skips paint without breaking rolling',()=>{
 orientation=0;const w=world(),a=actor('s3-roller-compact');
 const enemy={alive:true,team:1-a.team,pos:a.pos.clone()};f.G.actors=[a,enemy];
 let hits=0;const originalHit=f.G.projectiles.applyHit;f.G.projectiles.applyHit=()=>{hits++;};
 const originalLos=f.G.physics.los;f.G.physics.los=()=>true;
 f.G.level={faces:w.level.faces};
 try {assert.doesNotThrow(()=>tick(a,1/60));assert.equal(w.calls.length,0);assert.ok(a.ink<100);assert.equal(hits,1);}
 finally {f.G.level=w.level;f.G.projectiles.applyHit=originalHit;f.G.physics.los=originalLos;}
});
