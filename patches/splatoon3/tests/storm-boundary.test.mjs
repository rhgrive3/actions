import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
let cached;
const boot = () => cached ||= fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,
  extraExports:"export {updateStormBoundary,disposeStormBoundary} from './patches/splatoon3/runtime/storm-boundary.mjs'; export {Level} from './src/world/level.js';"});
function setup(f) {
  const {THREE,G}=f;
  G.scene=new THREE.Scene();
  G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[0,0,0],[10,0,10]],single:[
    {kind:'box',min:[-10,-1,-10],max:[10,0,10]}, {kind:'box',min:[-8,0,2],max:[8,3,2.5]}],half:[]});
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
    c.t=c.dur-.3;step();assert.equal(mesh.visible,false,'ends with the last rain, no persistent paint');
    f.disposeStormBoundary(c);f.disposeStormBoundary(c);assert.equal(c.rainBoundary,null);assert.equal(mesh.parent,null);
  }finally{G.paint=paint;f.disposeStormBoundary(c);}
});
test('hidden moving hardware does not leave a cached floating receiver',async()=>{
  const f=await boot(),{G,c,step}=setup(f);G.level.blocks.forEach(b=>{b.hidden=true;});
  step();assert.equal(c.rainBoundary.geometry.attributes.position.count,0);f.disposeStormBoundary(c);
});
test('native chart uses exact source triangle, not its rectangular chart extent',async()=>{
  const f=await boot(),{G,c,step}=setup(f),V=(x,y,z)=>new f.THREE.Vector3(x,y,z);
  G.level={queryBlocks(_a,_b,_c,_d,out){out.push(0);return out;},blocks:[{faces:[0]}],
    faces:[{paintable:true,n:V(0,1,0),triangles:[0]}],data:{triangles:new Float32Array([0,0,0, 3,0,0, 0,0,3])}};
  step();const p=c.rainBoundary.geometry.attributes.position;
  assert.equal(p.count,3);for(let i=0;i<p.count;i++)assert.ok(p.getX(i)+p.getZ(i)<=3,'no chart rectangle fill across a hole');
  f.disposeStormBoundary(c);
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
