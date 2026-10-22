import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../inkwave-public/vendor/three/build/three.module.js';
import {configureWiperCoverageCamera} from '../lib/inkwave-wiper-flight-coverage.mjs';
import {inspectWiperSceneOcclusion,assertWiperOcclusionReceipt} from '../lib/inkwave-wiper-occlusion.mjs';
const anchor = new THREE.Vector3(.9904027378916139, 2.1, -13.922429031925958);
function fixture() {
  const scene = new THREE.Scene(), material = new THREE.MeshBasicMaterial();
  const horizontal = new THREE.InstancedMesh(new THREE.BoxGeometry(.3,.3,.3), material, 1); horizontal.count = 0;
  const vertical = new THREE.InstancedMesh(new THREE.BoxGeometry(.3,.3,.3), material, 1);
  vertical.setMatrixAt(0,new THREE.Matrix4().makeTranslation(.9772416147840828,2.092347905827398,-14.828672122679036));
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),material);sheet.position.set(0,-20,0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(29,.75,.6),material); beam.name='firing-line gantry';beam.position.set(-2,4.825,-.62);
  scene.add(horizontal,vertical,sheet,beam);scene.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera();configureWiperCoverageCamera(THREE,camera,anchor,'front');
  return {scene,camera,beam,meshes:[horizontal,vertical,sheet]};
}
const inspect=f=>inspectWiperSceneOcclusion(THREE,f.scene,f.meshes,f.camera);
const counts={slashH:0,slashV:1};
test('actual old camera/beam coordinates fail opaque occlusion while corrected fixed view clears',()=>{
 const f=fixture();const focus=anchor.clone().add(new THREE.Vector3(0,0,6));
 f.camera.position.copy(focus).add(new THREE.Vector3(.2,5,18));f.camera.lookAt(focus);f.camera.updateMatrixWorld(true);
 const old=inspect(f);assert.ok(old.blocked.length>0);assert.throws(()=>assertWiperOcclusionReceipt(old,counts));
 configureWiperCoverageCamera(THREE,f.camera,anchor,'front');const next=inspect(f);assert.equal(next.blocked.length,0);assertWiperOcclusionReceipt(next,counts);
});
test('fixed front and top contain conservative common flight/sheet envelope with unchanged strict margin',()=>{
 for(const view of ['front','top']){
  const c=new THREE.PerspectiveCamera();configureWiperCoverageCamera(THREE,c,anchor,view);
  for(const x of [-4,4])for(const y of [-2.1,5.5])for(const z of [-5,17]){
   const p=anchor.clone().add(new THREE.Vector3(x,y,z)),v=p.clone().applyMatrix4(c.matrixWorldInverse);p.project(c);
   assert.ok(-v.z>=1.6&&-v.z<=250);assert.ok(Math.max(Math.abs(p.x),Math.abs(p.y))<=.9);
  }
  assert.equal(c.fov,50);assert.equal(c.aspect,960/720);assert.equal(c.zoom,1);assert.equal(c.view?.enabled??false,false);
 }
});
test('new opaque blocker is caught without changing world, target matrices or camera',()=>{
 const f=fixture(),target=new THREE.Vector3(.977,2.092,-14.829);
 const obstruction=new THREE.Mesh(new THREE.BoxGeometry(3,3,3),new THREE.MeshBasicMaterial());
 obstruction.position.copy(f.camera.position).lerp(target,.5);f.scene.add(obstruction);f.scene.updateMatrixWorld(true);
 const before=JSON.stringify({camera:f.camera.matrixWorld.toArray(),objects:f.scene.children.map(o=>[o.id,o.visible,o.layers.mask,o.matrixWorld.toArray(),o.material.opacity,o.material.transparent])});
 assert.ok(inspect(f).blocked.length>0);
 const after=JSON.stringify({camera:f.camera.matrixWorld.toArray(),objects:f.scene.children.map(o=>[o.id,o.visible,o.layers.mask,o.matrixWorld.toArray(),o.material.opacity,o.material.transparent])});assert.equal(after,before);
});
test('geometry behind target is not a blocker; transparent geometry is explicitly outside ray admission',()=>{
 const f=fixture();f.beam.position.set(0,-20,0);const transparent=new THREE.Mesh(new THREE.BoxGeometry(3,3,3),new THREE.MeshBasicMaterial({transparent:true,opacity:.5}));
 transparent.position.copy(f.camera.position).lerp(new THREE.Vector3(.977,2.092,-14.829),.5);f.scene.add(transparent);f.scene.updateMatrixWorld(true);
 const r=inspect(f);assert.equal(r.blocked.length,0);assert.equal(r.transparentMeshes,1);assert.match(r.scope,/original full PNG/);
});
for(const [label,mutate] of [
 ['missing receipt',()=>null],['empty scene',r=>({...r,consideredMeshes:0})],['blocked sample',r=>({...r,blocked:[{}]})],
 ['missing instance',r=>({...r,meshes:[r.meshes[0],{instances:0,samples:0}]})],
 ['missing samples',r=>({...r,meshes:[r.meshes[0],{instances:1,samples:0}]})],
 ['unrecognized method',r=>({...r,method:'frustum-only'})]
])test('admission rejects '+label,()=>{const r=inspect(fixture());assert.throws(()=>assertWiperOcclusionReceipt(mutate(r),counts));});

function opaqueFixture(kind, existingBounds=false) {
 const f=fixture(),geometry=new THREE.BoxGeometry(3,3,3),material=new THREE.MeshBasicMaterial();
 let object;
 if(kind==='instanced') {object=new THREE.InstancedMesh(geometry,material,1);object.setMatrixAt(0,new THREE.Matrix4());}
 else if(kind==='skinned') {
  const n=geometry.attributes.position.count,weights=new Float32Array(n*4);for(let i=0;i<n;i++)weights[i*4]=1;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(n*4),4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  object=new THREE.SkinnedMesh(geometry,material);object.bindMode='detached';object.bind(new THREE.Skeleton([new THREE.Bone()]),new THREE.Matrix4());
 }else object=new THREE.Mesh(geometry,material);
 object.position.copy(f.camera.position).lerp(new THREE.Vector3(.977,2.092,-14.829),.5);
 f.scene.add(object);f.scene.updateMatrixWorld(true);
 if(existingBounds){geometry.computeBoundingSphere();geometry.computeBoundingBox();if(object.computeBoundingSphere)object.computeBoundingSphere();if(object.computeBoundingBox)object.computeBoundingBox();}
 return {...f,object};
}
function nativeSnapshot(f) {
 const rows=[];f.scene.traverse(o=>{if(o.isMesh)rows.push({object:o,geometry:o.geometry,
   bounds:[o.boundingSphere,o.boundingBox,o.geometry.boundingSphere,o.geometry.boundingBox],
   values:JSON.stringify([o.boundingSphere,o.boundingBox,o.geometry.boundingSphere,o.geometry.boundingBox]),
   state:JSON.stringify([o.matrix.toArray(),o.matrixWorld.toArray(),o.visible,o.layers.mask,o.count,o.material.visible,o.material.opacity,o.material.transparent]),
   arrays:[...Object.values(o.geometry.attributes),o.geometry.index,o.instanceMatrix].filter(Boolean).map(a=>({attribute:a,array:a.array,bytes:Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength).toString('hex')})),
   skeleton:o.skeleton?JSON.stringify(o.skeleton.bones.map((b,i)=>[b.matrixWorld.toArray(),o.skeleton.boneInverses[i].toArray()])):null});});return rows;
}
function assertNativeUnchanged(f,before){const after=nativeSnapshot(f);assert.equal(after.length,before.length);for(let i=0;i<after.length;i++){
 const a=after[i],b=before[i];assert.equal(a.object,b.object);assert.equal(a.geometry,b.geometry);for(let j=0;j<4;j++)assert.equal(a.bounds[j],b.bounds[j]);assert.equal(a.values,b.values);assert.equal(a.state,b.state);assert.equal(a.skeleton,b.skeleton);
 for(let j=0;j<a.arrays.length;j++){assert.equal(a.arrays[j].attribute,b.arrays[j].attribute);assert.equal(a.arrays[j].array,b.arrays[j].array);assert.equal(a.arrays[j].bytes,b.arrays[j].bytes);}
}}
for(const kind of ['mesh','instanced','skinned'])for(const existing of [false,true])for(const throws of [false,true])test(`${kind}: ${existing?'preexisting':'null'} native bounds and RNG unchanged on ${throws?'ray exception':'success'}`,()=>{
 const f=opaqueFixture(kind,existing);let calls=0;const random=Math.random;
 // This malformed shadow query fails from the actual standard Mesh triangle
 // path after broad-phase bounds, not from an overridden native ray function.
 if(throws) f.object.geometry.drawRange={start:0,count:Symbol('invalid range')};
 const before=nativeSnapshot(f);Math.random=()=>{calls++;return .5;};
 try{if(throws)assert.throws(()=>inspect(f),TypeError);else assert.equal(inspect(f).blocked.length,12);}
 finally{Math.random=random;assert.equal(calls,0);assertNativeUnchanged(f,before);}
});
test('native query overrides are never called, including target accessors and attribute methods',()=>{
 const f=opaqueFixture('skinned');let calls=0;const trap=()=>{calls++;throw Error('native query override invoked');};
 f.object.raycast=trap;f.object.computeBoundingSphere=trap;f.object.getVertexPosition=trap;f.object.applyBoneTransform=trap;
 f.object.geometry.computeBoundingSphere=trap;f.object.geometry.getAttribute=trap;f.object.geometry.attributes.position.getX=trap;
 for(const m of f.meshes.slice(0,2))m.getMatrixAt=trap;
 assert.equal(inspect(f).blocked.length,12);assert.equal(calls,0);
});
test('unsupported opaque batching fails closed rather than disappearing from admission',()=>{
 const f=fixture();f.beam.isBatchedMesh=true;assert.throws(()=>inspect(f),/dedicated query support/);
});
test('does not require Layers or unused Float16 constructors from production tree-shaken namespace',()=>{
 const f=opaqueFixture('instanced'),slim={...THREE};delete slim.Layers;delete slim.Float16BufferAttribute;
 assert.equal(inspectWiperSceneOcclusion(slim,f.scene,f.meshes,f.camera).blocked.length,12);
});
