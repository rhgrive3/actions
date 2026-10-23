import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
let cached;
const boot = () => cached ||= fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,
  extraExports:"export {updateStormBoundary,disposeStormBoundary} from './patches/splatoon3/runtime/storm-boundary.mjs'; export {Level} from './src/world/level.js'; export {Physics} from './src/game/physics.js'; export {stormRainScale} from './patches/splatoon3/runtime/storm-effects.mjs'; export {NativePhysics} from './patches/native-stages/runtime/native-physics.mjs'; export {TriangleWorld} from './patches/native-stages/runtime/triangle-world.mjs';"});
function setup(f) {
  const {THREE,G}=f;
  G.scene=new THREE.Scene();
  G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[0,0,0],[10,0,10]],single:[
    {kind:'box',min:[-10,-1,-10],max:[10,0,10]}, {kind:'box',min:[-8,0,2],max:[8,3,2.5]}],half:[]});
  G.physics=new f.Physics(G.level);
  const c={team:0,t:1,dur:8,group:new THREE.Group()};c.group.position.set(0,4.6,0);c.group.scale.setScalar(1);
  return {G,c,step:()=>f.updateStormBoundary(c,G,G.scene,3.4,THREE)};
}
test('temporary boundary has real wall and floor surfaces and follows the moving cloud without paint calls',async()=>{
  const f=await boot(),{G,c,step}=setup(f);let writes=0;
  const paint=G.paint;G.paint={splat(){writes++;throw Error('boundary painted');}};
  try {
    step();const mesh=c.rainBoundary,p=mesh.geometry.attributes.position;
    assert.ok(p.count>=12);let wall=false,floor=false;
    for(let i=0;i<p.count;i++){floor ||= Math.abs(p.getY(i)-.006)<1e-5;wall ||= Math.abs(p.getZ(i)-1.994)<1e-5;}
    assert.ok(floor&&wall,'both surfaces, not a floating plane ring');
    const geometry=mesh.geometry;c.group.position.x+=.2;step();assert.equal(mesh.geometry,geometry,'uniform-only drift inside cached patch');
    assert.equal(mesh.material.uniforms.center.value.x,.2);assert.equal(mesh.material.uniforms.radius.value,3.4);
    c.group.scale.setScalar(.5);step();assert.equal(mesh.material.uniforms.radius.value,1.7);
    c.group.position.x+=1;step();assert.notEqual(mesh.geometry,geometry,'refresh after leaving margin');
    assert.equal(writes,0);assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.depthTest,true);
    const override={};G.scene.overrideMaterial=override;const count=mesh.geometry.drawRange.count;
    mesh.onBeforeRender(null,G.scene,null,mesh.geometry,override);assert.equal(mesh.geometry.drawRange.count,0,'no opaque AO/depth override surface');
    mesh.onAfterRender(null,G.scene,null,mesh.geometry,override);assert.equal(mesh.geometry.drawRange.count,count);G.scene.overrideMaterial=null;
    c.t=c.dur;step();assert.equal(mesh.visible,false,'ends with the last rain, no persistent paint');
    f.disposeStormBoundary(c);f.disposeStormBoundary(c);assert.equal(c.rainBoundary,null);assert.equal(mesh.parent,null);
  }finally{G.paint=paint;f.disposeStormBoundary(c);}
});
test('hidden moving hardware does not leave a cached floating receiver',async()=>{
  const f=await boot(),{G,c,step}=setup(f);G.level.blocks.forEach(b=>{b.hidden=true;});
  step();assert.equal(c.rainBoundary.geometry.attributes.position.count,0);f.disposeStormBoundary(c);
});
test('production cloud expiry, clear and repeated release dispose boundary once; owner death keeps a deployed cloud',async()=>{
  const f=await boot();for(const action of ['expiry','clear','release']){
    const {G}=setup(f),owner={alive:true,team:0,addTurf(){}};G.actors=[];G.fx=null;G.audio=null;
    const p=new f.Projectiles(G.scene);G.projectiles=p;
    p._spawnCloud({owner,team:0,pos:new f.THREE.Vector3(),dir:new f.THREE.Vector3(0,0,1)});
    const c=p.clouds[0];p._updateClouds(1/60);assert.ok(c.rainBoundary);
    owner.alive=false;p._updateClouds(1/60);assert.ok(c.rainBoundary.visible,'native deployed cloud survives owner death');
    let materials=0,geometries=0;const mesh=c.rainBoundary;
    mesh.material.addEventListener('dispose',()=>materials++);mesh.geometry.addEventListener('dispose',()=>geometries++);
    if(action==='expiry')p._updateClouds(c.dur);else if(action==='clear')p.clear();else p._releaseCloud(c);
    p._releaseCloud(c);p.clear();assert.equal(materials,1,action);assert.equal(geometries,1,action);assert.equal(mesh.parent,null);
  }
});

function covered(mesh, point) {
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i+=3){
    const v=[0,1,2].map(k=>[p.getX(i+k),p.getY(i+k),p.getZ(i+k)]),ab=v[1].map((x,k)=>x-v[0][k]),ac=v[2].map((x,k)=>x-v[0][k]),ap=point.map((x,k)=>x-v[0][k]);
    const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),d00=dot(ab,ab),d01=dot(ab,ac),d11=dot(ac,ac),d20=dot(ap,ab),d21=dot(ap,ac),den=d00*d11-d01*d01;
    if(Math.abs(den)<1e-12)continue;const b=(d11*d20-d01*d21)/den,c=(d00*d21-d01*d20)/den;
    if(b>=-1e-5&&c>=-1e-5&&b+c<=1+1e-5&&Math.hypot(...ap.map((x,k)=>x-ab[k]*b-ac[k]*c))<1e-4)return true;
  }
  return false;
}
for(const name of ['partial','complete','narrow'])test(`${name} roof removes the blocked floor while retaining exposed receivers`,async()=>{
  const f=await boot(),{G,c,step}=setup(f);
  const roof=name==='complete'?{min:[-12,2.5,-12],max:[12,2.8,12]}:name==='narrow'?{min:[3.39,2.5,-.01],max:[3.41,2.8,.01]}:{min:[1,2.5,-5],max:[5,2.8,5]};
  G.level=new f.Level({...G.level.layout,single:[...G.level.layout.single,{kind:'box',paint:false,...roof}]});G.physics=new f.Physics(G.level);
  step();assert.equal(c.rainBoundary.userData.occlusion.fallback,null);
  assert.equal(covered(c.rainBoundary,[3.4,.006,0]),false,'no boundary under roof, including a 2cm roof');
  assert.equal(covered(c.rainBoundary,[-3.4,.006,0]),name!=='complete','uncovered side retained');
  assert.ok(c.rainBoundary.userData.occlusion.rays<=256);
  // Moving a blocker invalidates the cutout without waiting for cloud drift.
  const b=G.level.blocks.at(-1);b.center.x+=30;b.aabbMin.x+=30;b.aabbMax.x+=30;G.level._buildHash();step();
  assert.equal(covered(c.rainBoundary,[3.4,.006,0]),true);
  f.disposeStormBoundary(c);
});
test('visible extent and duration follow composed rain, including the growth and final ticks',async()=>{
  const f=await boot(),{c,step}=setup(f);
  for(const t of [1/60,7.6,8-1/60]){c.t=t;c.group.scale.setScalar(f.stormRainScale(c));step();assert.equal(c.rainBoundary.material.uniforms.radius.value,3.4*c.group.scale.x);assert.equal(c.rainBoundary.visible,true);}
  c.t=8;step();assert.equal(c.rainBoundary.visible,false);f.disposeStormBoundary(c);
});
for(const count of [1,5000])test(`native BVH selects bounded exact source triangles (${count})`,async()=>{
  const f=await boot(),{G,c,step}=setup(f),V=(x,y,z)=>new f.THREE.Vector3(x,y,z);
  const triangles=new Float32Array(count*9);for(let i=0;i<count;i++)triangles.set([0,0,0,0,0,3,3,0,0],i*9);
  const data={triangles,normals:new Float32Array(count*3),flags:new Uint8Array(count),objectIds:new Uint32Array(count),order:Uint32Array.from({length:count},(_,i)=>i),nodes:new Float32Array([0,0,0,3,0,3,-1,count]),triangleFace:new Int32Array(count)};
  for(let i=0;i<count;i++)data.normals[i*3+1]=1;
  const face={paintable:true,block:0,n:V(0,1,0),origin:V(0,0,0),u:V(1,0,0),v:V(0,0,1)};
  Object.defineProperty(face,'triangles',{get(){throw Error('global face triangles were scanned');}});
  G.level={native:true,data,staticBlockCount:1,blocks:[{hidden:false}],faces:[face],triangleWorld:new f.TriangleWorld(data),
    blockForTriangle:()=>0,queryBlocks(){throw Error('native static broadphase should be BVH');},queryDynamicBlocks(_a,_b,_c,_d,out){out.length=0;return out;}};
  G.physics=new f.NativePhysics(G.level);step();const mesh=c.rainBoundary;
  if(count===1){assert.equal(mesh.geometry.attributes.position.count,3);for(let i=0;i<3;i++)assert.ok(mesh.geometry.attributes.position.getX(i)+mesh.geometry.attributes.position.getZ(i)<=3);}
  else {assert.equal(mesh.geometry.attributes.position.count,0);assert.equal(mesh.visible,false);assert.equal(mesh.userData.occlusion.fallback,'occluder-budget');assert.ok(mesh.userData.sourceVisits<=513);}
  f.disposeStormBoundary(c);
});
for(const t of [1/60,7.6])test(`composed paint, actor hit and boundary share the scaled radius at t=${t}`,async()=>{
  const f=await boot(),{G}=setup(f),p=new f.Projectiles(G.scene),owner={alive:true,team:0,addTurf(){}};
  const cloud={owner,team:0,group:new f.THREE.Group(),t:t-1/60,dur:8,dir:new f.THREE.Vector3(),rainT:0};cloud.group.position.set(0,4.6,0);p.clouds.push(cloud);
  const r=f.SPECIALS.storm.radius*f.stormRainScale({t,dur:8}),hits=[];
  G.actors=[r-.1,r+.1].map((x,i)=>({alive:true,team:1,remote:false,pos:new f.THREE.Vector3(x,0,0),damage(){hits.push(i);return false;}}));
  const original=G.paint.splat,spots=[];G.paint.splat=(point,...args)=>{spots.push(point.clone());return original.call(G.paint,point,...args);};
  try{p._updateClouds(1/60);assert.deepEqual(hits,[0]);assert.equal(cloud.rainBoundary.material.uniforms.radius.value,r);assert.ok(spots.length);for(const point of spots)assert.ok(Math.hypot(point.x,point.z)<=r+.001);}finally{G.paint.splat=original;G.actors=[];p.clear();}
});
test('ray budget hides the complete contour instead of exposing a partially checked area',async()=>{
  const f=await boot(),{G,c,step}=setup(f);
  G.level=new f.Level({...G.level.layout,single:Array.from({length:65},()=>({kind:'box',min:[-10,-1,-10],max:[10,0,10]}))});
  for(const face of G.level.faces)face.paintable=face.n.y>.7;
  G.physics=new f.Physics(G.level);step();
  assert.equal(c.rainBoundary.userData.occlusion.fallback,'ray-budget');
  assert.equal(c.rainBoundary.userData.occlusion.rays,64);
  assert.equal(c.rainBoundary.geometry.attributes.position.count,0);assert.equal(c.rainBoundary.visible,false);
  f.disposeStormBoundary(c);
});
