import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptQueueVisualContinuation20261029 as adapt} from '../queue-visual-continuation-20261029-adapter.mjs';
import {updateShapePoolBounds} from '../../splatoon3/runtime/shape-pool-bounds.mjs';
const frozen=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/queue-visual-continuation-20261029-before.json.gz',import.meta.url))));
const root=new URL('../../../',import.meta.url),three=new URL('inkwave-public/vendor/three/build/three.module.js',root).href;
async function load(source,base,extra=''){
 source=source.replace(/from\s+(['"])([^'"]+)\1/g,(m,q,p)=>'from '+JSON.stringify(p==='three'?three:new URL(p,base).href));
 return import('data:text/javascript;base64,'+Buffer.from(source+'\n'+extra).toString('base64'));
}
function geometry(g){return {attrs:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{itemSize:a.itemSize,normalized:a.normalized,array:Array.from(a.array)}])),index:g.index&&Array.from(g.index.array)};}
test('actual teeth and tongue builders preserve every vertex, skin descriptor, index, normal, UV and AO at all nonzero LOD resolutions',async()=>{
 const old=frozen['composed-character-face.js'],next=adapt('src/game/character-face.js',old),base=new URL('inkwave-public/src/game/',root);
 const rewrite=s=>s.replace("import { G } from '../core/ctx.js';","const G={settings:{quality:'high'}};");
 const a=await load(rewrite(old),base,'export {Acc,addTeethTongue,finishFace};'),b=await load(rewrite(next),base,'export {Acc,addTeethTongue,finishFace};');
 let vertices=0;
 for(const n of [6,8,16,22]){
  const x=new a.Acc(),y=new b.Acc();a.addTeethTongue(x,{teeth:n});b.addTeethTongue(y,{teeth:n});
  assert.deepEqual({...y},{...x});const p=a.finishFace(x),q=b.finishFace(y);assert.deepEqual(geometry(q.geo),geometry(p.geo));assert.deepEqual(q.ao,p.ao);vertices+=x.P.length;
 }
 console.log(JSON.stringify({actualTeethTongueVertices:vertices}));
});
test('actual descriptor signatures and full Far geometry match with absent, partial and present attributes',async()=>{
 const old=frozen['composed-character-lod.js'],base=new URL('inkwave-public/src/game/',root);
 const a=await load(old,base,'export {getVertexSigs};'),b=await load(fs.readFileSync(new URL('inkwave-public/src/game/character-lod.js',root),'utf8'),base,'export {getVertexSigs};');
 for(let mask=0;mask<32;mask++){
  const g=new THREE.TorusGeometry(.4,.08,12,40),n=g.attributes.position.count;
  for(const [bit,name,size] of [[1,'skinIndex',4],[2,'skinWeight',4],[4,'aEx',1],[8,'aCloth',2],[16,'aTint',1]])if(mask&bit)g.setAttribute(name,new THREE.BufferAttribute(Float32Array.from({length:n*size},(_,i)=>name==='skinWeight'?(i%4===0?1:0):name==='aTint'?-2:i%3),size));
  g.setAttribute('aMat',new THREE.BufferAttribute(Float32Array.from({length:n},(_,i)=>i%4),1));g.setAttribute('color',new THREE.BufferAttribute(Float32Array.from({length:n*3},(_,i)=>(i%13)/13),3));
  assert.deepEqual(b.getVertexSigs(g),a.getVertexSigs(g));assert.strictEqual(b.getVertexSigs(g),b.getVertexSigs(g));
  assert.deepEqual(geometry(b.farGeometry(g,160)),geometry(a.farGeometry(g,160)));
 }
});
test('real PerspectiveCamera projection cache preserves moving/rotating/resized camera verdicts and all fallback guards',async()=>{
 const base=new URL('patches/local-quality/',root),a=await load(frozen['offscreen-visual-budget.mjs'],base),b=await load(fs.readFileSync(new URL('offscreen-visual-budget.mjs',base),'utf8'),base);
 const camera=new THREE.PerspectiveCamera(70,16/9,.1,200),actor={root:new THREE.Object3D()};let checks=0;
 for(const hz of [30,60,120])for(let frame=0;frame<hz*4;frame++){
  const t=frame/hz;camera.fov=40+30*Math.sin(t);camera.aspect=frame%29<10?4/3:16/9;camera.near=.1;camera.far=100+frame%30;camera.position.set(Math.sin(t),2,3);camera.rotation.y=t;camera.updateProjectionMatrix();
  for(let i=0;i<7;i++){actor.root.position.set(50*Math.sin(i*2+t),i-3,50*Math.cos(i*2+t));assert.equal(b.inViewVolume(actor,camera),a.inViewVolume(actor,camera));checks++;}
 }
 for(const [key,value] of [['zoom',2],['filmOffset',2],['view',{enabled:true}],['parent',new THREE.Group()],['fov',NaN],['aspect',0],['near',-1]]){const previous=camera[key];camera[key]=value;assert.equal(b.inViewVolume(actor,camera),a.inViewVolume(actor,camera));camera[key]=previous;}
 console.log(JSON.stringify({actualCameraVerdicts:checks}));
});
test('wave rings share geometry only inside one runtime epoch and retain independent materials/disposal ownership',async()=>{
 const base=new URL('patches/splatoon3/runtime/',root),file=new URL('all-specials.mjs',base);
 const m=await load(fs.readFileSync(file,'utf8'),base,'export {worldMesh,disposeMesh,retireWaveFrontGeometry};');
 const rt={api:{THREE,G:{scene:new THREE.Scene(),teamColors:[0xff0000,0x00ff00]}}},owner={team:0,color:0xff0000};
 const nodes=Array.from({length:9},(_,i)=>({mesh:m.worldMesh(rt,owner,'waveFront',new THREE.Vector3(i,0,0))}));
 const g=nodes[0].mesh.geometry;let disposals=0,materials=0;g.addEventListener('dispose',()=>disposals++);
 for(const o of nodes){assert.strictEqual(o.mesh.geometry,g);o.mesh.material.addEventListener('dispose',()=>materials++);}
 assert.equal(new Set(nodes.map(o=>o.mesh.material)).size,9);assert.deepEqual(geometry(g),geometry(new THREE.RingGeometry(.96,1,48)));
 m.disposeMesh(rt,nodes[0]);assert.equal(disposals,0);assert.equal(materials,1);
 m.retireWaveFrontGeometry(rt);assert.equal(disposals,0);
 const fresh={mesh:m.worldMesh(rt,owner,'waveFront',new THREE.Vector3())};assert.notStrictEqual(fresh.mesh.geometry,g);
 for(const o of nodes.slice(1))m.disposeMesh(rt,o);assert.equal(disposals,1);assert.equal(materials,9);
 m.disposeMesh(rt,fresh);m.retireWaveFrontGeometry(rt);
 const standalone=m.worldMeshParts(THREE,'waveFront',0);assert.notStrictEqual(standalone.geometry,g);standalone.geometry.dispose();standalone.material.dispose();
});
test('Angle line bounds contain stored float endpoints without unused origin and keep invalid inputs visible',async()=>{
 const base=new URL('patches/splatoon3/runtime/',root),m=await load(fs.readFileSync(new URL('all-subs.mjs',base),'utf8'),base,'export {appendAngleLine};');
 const scene=new THREE.Scene(),api={THREE,G:{scene,teamColors:[1]}},o={lineSegments:[],spec:{flightFrames:7},owner:{},team:0};
 for(let i=0;i<7;i++){m.appendAngleLine(api,{},o,new THREE.Vector3(100+i,2,-3),new THREE.Vector3(101+i,2,-3));const g=o.lineMesh.geometry;for(let j=0;j<g.drawRange.count;j++)assert(g.boundingSphere.containsPoint(new THREE.Vector3().fromBufferAttribute(g.attributes.position,j)));}
 assert(o.lineMesh.frustumCulled);assert(o.lineMesh.geometry.boundingSphere.center.x>100);assert(o.lineMesh.geometry.boundingSphere.radius<4);
 const invalid={lineSegments:[],spec:{flightFrames:7},owner:{},team:0};m.appendAngleLine(api,{},invalid,new THREE.Vector3(Infinity,0,0),new THREE.Vector3(2,0,0));assert.equal(invalid.lineMesh.frustumCulled,false);
});
test('all eight actual ShapePools retain simulation and buffer values while per-pass draw suppression restores ranges',async()=>{
 const base=new URL('patches/splatoon3/runtime/',root),a=await load(frozen['special-vfx-kit.mjs'],base),b=await load(fs.readFileSync(new URL('special-vfx-kit.mjs',base),'utf8'),base);
 const old=new a.SpecialVfxKit(THREE,new THREE.Group()),next=new b.SpecialVfxKit(THREE,new THREE.Group()),camera=new THREE.PerspectiveCamera(60,1,.1,100);camera.updateMatrixWorld();
 let drawsAvoided=0;
 for(const name of ['beams','inkBeams','shells','inkShells','bands','inkBands','discs','inkDiscs']){
  const p=old[name],q=next[name],values=[1000,0,-10,1,1001,1,-10,1,1,.3,.4,.9,0,.2,.3,.4];
  if(name.toLowerCase().includes('shell'))values.splice(4,4,1,2,3,.5);
  if(name.toLowerCase().includes('band'))values.splice(4,4,1,2,.8,.5);
  if(name.toLowerCase().includes('disc'))values.splice(4,4,0,1,0,.5);
  p.add(3,values);q.add(3,values);p.update(.1);q.update(.1);
  for(let i=0;i<p.buf.length;i++)assert.deepEqual(q.buf[i].array,p.buf[i].array);
  assert.equal(q.recs[0].t,p.recs[0].t);q._warmed=true;const g=q.mesh.geometry,range=g.instanceCount;
  q.mesh.onBeforeRender({},null,camera,g,q.mesh.material,null);assert.equal(g.instanceCount,0);drawsAvoided++;q.mesh.onAfterRender({},null,camera,g,q.mesh.material,null);assert.equal(g.instanceCount,range);
  camera.position.x=1000;camera.updateMatrixWorld();q.mesh.onBeforeRender({},null,camera,g,q.mesh.material,null);assert.equal(g.instanceCount,range);q.mesh.onAfterRender({},null,camera,g,q.mesh.material,null);camera.position.x=0;camera.updateMatrixWorld();
  q.recs[0].v[0]=NaN;updateShapePoolBounds(q);assert.equal(q._shapeBoundsValid,false);
 }
 console.log(JSON.stringify({shapePoolDrawsSuppressed:drawsAvoided}));
});

test('shape world bounds contain actual shader vertices across signed scale, taper, spin and oblique normals',()=>{
 let seed=123456789;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},sample=()=>random()*8-4;
 const geometries={iA:new THREE.CylinderGeometry(1,1,1,14,2,true).translate(0,.5,0),iScl:new THREE.SphereGeometry(1,20,12),iDim:new THREE.CylinderGeometry(1,1,1,24,4,true).translate(0,.5,0),iNrm:new THREE.PlaneGeometry(2,2)};
 let vertices=0;
 for(const [kind,geometry] of Object.entries(geometries))for(let trial=0;trial<80;trial++){
  const v=Float32Array.from({length:16},sample);if(kind==='iScl')v[3]=trial%2;
  const pool={_shapeKind:kind,_shapeBounds:new THREE.Sphere(),recs:[{v}]};updateShapePoolBounds(pool);assert(pool._shapeBoundsValid);
  const position=geometry.attributes.position;
  for(let i=0;i<position.count;i++){
   const p=new THREE.Vector3().fromBufferAttribute(position,i),center=new THREE.Vector3(v[0],v[1],v[2]);let w;
   if(kind==='iA'){
    const d=new THREE.Vector3(v[4],v[5],v[6]).sub(center),y=d.clone().divideScalar(Math.max(d.length(),1e-4)),h=Math.abs(y.y)<.95?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0),x=h.clone().cross(y).normalize(),z=x.clone().cross(y);
    w=center.addScaledVector(d,p.y).addScaledVector(x,p.x*(v[3]*(1-p.y)+v[7]*p.y)).addScaledVector(z,p.z*(v[3]*(1-p.y)+v[7]*p.y));
   }else if(kind==='iScl'){
    const c=Math.cos(v[7]),s=Math.sin(v[7]),x=c*p.x+s*p.z,z=-s*p.x+c*p.z;w=center.add(new THREE.Vector3(x*v[4],(v[3]>.5?Math.abs(p.y):p.y)*v[5],z*v[6]));
   }else if(kind==='iDim'){
    const angle=Math.atan2(p.z,p.x)+v[3]+v[7]*p.y,r=v[4]*(1-p.y+v[6]*p.y);w=center.add(new THREE.Vector3(Math.cos(angle)*r,p.y*v[5],Math.sin(angle)*r));
   }else{
    const n=new THREE.Vector3(v[4],v[5],v[6]).normalize(),h=Math.abs(n.y)<.95?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0),x=h.clone().cross(n).normalize(),y=n.clone().cross(x),c=Math.cos(v[7]),s=Math.sin(v[7]);w=center.addScaledVector(x,(c*p.x+s*p.y)*v[3]).addScaledVector(y,(-s*p.x+c*p.y)*v[3]).addScaledVector(n,.02);
   }
   assert(pool._shapeBounds.containsPoint(w),kind+' vertex '+i);vertices++;
  }
 }
 console.log(JSON.stringify({boundedActualShapeVertices:vertices}));
});

test('production excludes measured regressions while retaining source-identical candidate probes',()=>{
 const fx=frozen['composed-fx.js'],sea=frozen['composed-environment.js'];
 assert(adapt('src/fx/fx.js',fx).includes('float n = fxNoise(vec2(cos(ang), sin(ang)) * 2.2 + seed)'));
 assert.equal(adapt('src/world/environment.js',sea),sea);
 const paint=adapt('src/world/inkShading.js',frozen['composed-inkShading.js']);
 assert(paint.includes('near > 0.0 || !(pnt.a > 0.002)'),'composed far coverage consumer must keep its l2 fallback');
});

test('actual teeth helper reduces only duplicate trigonometry and records exact call counts',async()=>{
 const old=frozen['composed-character-face.js'],base=new URL('inkwave-public/src/game/',root),rewrite=s=>s.replace("import { G } from '../core/ctx.js';","const G={settings:{quality:'high'}};");
 const a=await load(rewrite(old),base,'export {Acc,addTeethTongue};'),b=await load(rewrite(adapt('src/game/character-face.js',old)),base,'export {Acc,addTeethTongue};');
 function run(m,n){let calls=0;const sin=Math.sin,cos=Math.cos;Math.sin=x=>{calls++;return sin(x);};Math.cos=x=>{calls++;return cos(x);};try{m.addTeethTongue(new m.Acc(),{teeth:n});}finally{Math.sin=sin;Math.cos=cos;}return calls;}
 const rows=[];for(const n of [6,8,16,22]){const before=run(a,n),after=run(b,n);assert(after<before);rows.push({teeth:n,before,after});}console.log(JSON.stringify({actualTeethTrigonometry:rows}));
});
