import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

async function fixture(customData=null) {
  const context = vm.createContext({ console });
  const make = values => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const modules = {
    three: make(THREE),
    '../../../src/world/levelMaterial.js': make({ createLevelMaterial() { throw Error('unused'); } }),
  };
  const module = new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-render.mjs', import.meta.url), 'utf8'), { context });
  await module.link(name => modules[name]);
  await module.evaluate();
  const vertices = new Float32Array([
    1, 2, 3, 0, 1, 0, 0, 0,
    4, 2, 3, 0, 1, 0, 1, 0,
    1, 2, 6, 0, 1, 0, 0, 1,
  ]);
  const object = { active: true, material: 'concrete', vo: 0, vc: 3, io: 0, ic: 3, collidable: true };
  const data = { vertices, indices: new Uint32Array([0, 1, 2]), manifest: { materials: {}, objects: [object] } };
  return { display: module.namespace.nativeDisplay(customData||data, new Map(), 'high'), vertices, nativeNormalCones:module.namespace.nativeNormalCones, compactNativeIndices:module.namespace.compactNativeIndices, installNativeDisplayCulling:module.namespace.installNativeDisplayCulling, specializeNativeSourceAmbient:module.namespace.specializeNativeSourceAmbient };
}

test('normal cones conservatively certify every incident triangle, including transformed views',async()=>{
 const {display,nativeNormalCones:cones}=await fixture();display.dispose();
 const positions=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
 const vertices=Float32Array.from(positions.flatMap(p=>[...p,1,1,1,0,0])),indices=new Uint32Array([0,1,2,0,3,1,0,2,3]);
 const before=vertices.slice(),ib=indices.slice(),bound=cones(vertices,indices);
 assert.equal(bound.normalized,true);assert.equal(bound.array.BYTES_PER_ELEMENT,1);
 assert.deepEqual(vertices,before);assert.deepEqual(indices,ib);
 let certified=0,fallback=0;
 const n=new THREE.Vector3(1,1,1).normalize();
 for(const scale of [[1,1,1],[.3,2,1.1],[-.7,1.4,2]])for(let t=0;t<240;t++){
  const modelView=new THREE.Matrix4().compose(new THREE.Vector3(2,-1,3),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.5,-.4)),new THREE.Vector3(...scale));
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(modelView);
  const eyeView=new THREE.Vector3(Math.sin(t*1.37),Math.cos(t*.71),Math.sin(t*.91)).normalize();
  const eye=eyeView.clone().applyMatrix3(normalMatrix.clone().transpose()).normalize(),facing=n.dot(eye);
  if(Math.abs(facing)>bound.array[0]/255){
   certified++;
   for(const face of [[0,0,1],[0,1,0],[1,0,0]])assert.equal(Math.sign(new THREE.Vector3(...face).dot(eye)),Math.sign(facing));
  }else fallback++;
 }
 assert.ok(certified>20&&fallback>20,'exercise both certified hemispheres and silhouette fallback');
 const invalid=vertices.slice();invalid.set([-1,-1,-1],3);
 assert.equal(cones(invalid,indices).array[0],255,'inverted normals cannot certify');
 assert.equal(cones(vertices,new Uint32Array([0,0,0])).array[0],255,'unused/degenerate corners retain both hemispheres');
 const thin=new Float32Array([0,0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,1,1e-7,0,0,0,1,0,0]);
 assert.deepEqual(Array.from(cones(thin,new Uint32Array([0,1,2])).array),[255,255,255]);
 assert.equal(cones(vertices,[0,1,-1]),null);assert.equal(cones(vertices,[0,1,99]),null);assert.equal(cones(vertices,[0,1]),null);
});

test('cone shader falls back at silhouettes, unusual cameras and missing attributes',async()=>{
 const {display,specializeNativeSourceAmbient:specialize}=await fixture(),mesh=display.group.children[0];
 assert.deepEqual(Array.from(mesh.material.defaultAttributeValues.nativeNormalCone),[1]);
 const attr=mesh.geometry.getAttribute('nativeNormalCone');assert.ok(attr);attr.onUploadCallback();assert.equal(attr.array,null);
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,envMap:true,normalMap:false,envMapCubeUVHeight:1024};
 assert.equal(specialize(shader,true,true),true);
 assert.match(shader.vertexShader,/abs\(nativeFacing\)>nativeNormalCone/);
 assert.match(shader.vertexShader,/determinant\(mat3\(viewMatrix\)\)>0.0/);
 assert.match(shader.vertexShader,/if\(!nativeSingle\)\{vNativeIrradianceBack=getIBLIrradiance/);
 assert.match(shader.fragmentShader,/gl_FrontFacing\?vNativeRadianceFront:vNativeRadianceBack/);
 display.dispose();
});

test('native diffuse ambient keeps unapproved normal maps, unsupported and unfamiliar shader layouts on their original path',async()=>{
 const {display,specializeNativeSourceAmbient:specialize}=await fixture();display.dispose();
 const source=()=>({vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,envMap:true,normalMap:false,envMapCubeUVHeight:1024});
 for(const change of [{normalMap:true},{envMap:false},{envMapCubeUVHeight:null},{envMapCubeUVHeight:768},{vertexShader:'void main(){}'},{fragmentShader:'void main(){}'}]){
  const shader=Object.assign(source(),change),before={...shader};assert.equal(specialize(shader),false);assert.deepEqual(shader,before);
 }
 const shader=source();assert.equal(specialize(shader),true);
 assert.match(shader.vertexShader,/vNativeIrradianceFront=getIBLIrradiance\(normalize\(transformedNormal\)\)/);
 assert.match(shader.vertexShader,/vNativeIrradianceBack=getIBLIrradiance\(-normalize\(transformedNormal\)\)/,'DoubleSide back faces need the opposite environment hemisphere');
 assert.match(shader.fragmentShader,/gl_FrontFacing\?vNativeIrradianceFront:vNativeIrradianceBack/);
 assert.ok(shader.fragmentShader.includes('getIBLRadiance( geometryViewDir, geometryNormal, material.roughness )'),'view-dependent specular remains per pixel');
 assert.ok(shader.fragmentShader.includes('#include <shadowmap_pars_fragment>'),'shadow sampling is unchanged');
 const broad=source();assert.equal(specialize(broad,true),true);
 assert.match(broad.vertexShader,/nativeView=isOrthographic\?vec3\(0.0,0.0,1.0\):normalize\(-mvPosition.xyz\)/,'both camera types use the production view direction');
 assert.match(broad.fragmentShader,/gl_FrontFacing\?vNativeRadianceFront:vNativeRadianceBack/);
 const missing=source();missing.vertexShader=missing.vertexShader.replace('#include <project_vertex>','');const before={...missing};
 assert.equal(specialize(missing,true),false);assert.deepEqual(missing,before,'unsupported source layout fails open before mutating either stage');
 const mapped=Object.assign(source(),{normalMap:true}),unchanged={...mapped};
 assert.equal(specialize(mapped,true,true),false);assert.deepEqual(mapped,unchanged,'normal maps retain all pixel-frequency IBL, even with cones enabled');

});

test('native glass retains pixel-frequency reflections while matte source surfaces interpolate the broad lobe',async()=>{
 const {display}=await fixture(),matte=display.group.children[0].material;
 const compile=mat=>{const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,envMap:true,normalMap:false,envMapCubeUVHeight:1024};mat.onBeforeCompile(shader);return shader;};
 assert.match(compile(matte).fragmentShader,/vNativeRadianceFront/);
 const vertices=new Float32Array([0,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,1,0,1,0,0,1]);
 const data={vertices,indices:new Uint32Array([0,1,2]),manifest:{materials:{glass:{}},objects:[{active:true,glass:true,material:'glass',vo:0,vc:3,io:0,ic:3}]}};
 const glass=await fixture(data),shader=compile(glass.display.group.children[0].material);
 assert.doesNotMatch(shader.vertexShader,/vNativeRadiance/);
 assert.ok(shader.fragmentShader.includes('getIBLRadiance( geometryViewDir, geometryNormal, material.roughness )'));
 glass.display.dispose();display.dispose();
});

test('source materials preserve pixel-frequency IBL for normal maps at every strength and encoding',async()=>{
 const {display}=await fixture(),mat=display.group.children[0].material;
 mat.normalMap=new THREE.Texture();
 for(const type of [THREE.TangentSpaceNormalMap,THREE.ObjectSpaceNormalMap])for(const scale of [0,.1,.28,-.28,.5,1]){
  mat.normalMapType=type;mat.normalScale.set(scale,scale);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,envMap:true,normalMap:true,envMapCubeUVHeight:1024};
  mat.onBeforeCompile(shader);
  assert.doesNotMatch(shader.vertexShader,/vNativeIrradiance|vNativeRadiance/);
  assert.ok(shader.fragmentShader.includes('#include <normal_fragment_maps>'));
  assert.ok(shader.fragmentShader.includes('#include <lights_fragment_maps>'));
 }
 mat.normalMap.dispose();display.dispose();
});

test('baked native display preserves vertex positions and follows changing parent transforms without local recomposition', async () => {
  const { display, vertices } = await fixture();
  const scene = new THREE.Scene(), parent = new THREE.Group();
  scene.add(parent); parent.add(display.group);
  const mesh = display.group.children[0];
  const position = mesh.geometry.getAttribute('position');
  let compositions = 0;
  const update = mesh.updateMatrix;
  mesh.updateMatrix = function () { compositions++; return update.call(this); };
  for (let frame = 0; frame < 12; frame++) {
    parent.position.set(frame * 0.25, 2 - frame * 0.1, -3);
    parent.rotation.set(frame * 0.01, frame * 0.03, -frame * 0.02);
    parent.scale.set(1 + frame * 0.01, 0.8, 1.2);
    scene.updateMatrixWorld();
    assert.deepEqual(mesh.matrixWorld.elements, parent.matrixWorld.elements);
    for (let i = 0; i < position.count; i++) {
      const actual = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const expected = new THREE.Vector3().fromArray(vertices, i * 8).applyMatrix4(parent.matrixWorld);
      assert.deepEqual(actual.toArray(), expected.toArray());
    }
  }
  assert.equal(compositions, 0);
  display.dispose();
});

test('native display selects exact index width with the WebGL2 primitive restart boundary',async()=>{
 const {display,compactNativeIndices}=await fixture();display.dispose();
 for(const values of [[],[0,1,2],[65532,65533,65534],[65533,65534,65535],[65534,65535,65536],[4294967295,0,1]]){
  const source=new Uint32Array(values),before=source.slice(),result=compactNativeIndices(source),narrow=values.every(i=>i<65535);
  assert.equal(result.BYTES_PER_ELEMENT,narrow?2:4);
  assert.deepEqual(Array.from(result),values);assert.deepEqual(source,before);
  if(!narrow)assert.equal(result,source,'unsafe index arrays must retain original storage');
 }
});

test('native display reads actual index slices, preserves source values and releases uploaded narrowed arrays',async()=>{
 const vertices=new Float32Array(6*8);for(let i=0;i<6;i++){vertices[i*8]=i;vertices[i*8+4]=1;}
 const indices=new Uint32Array([65536,0,1,2,3,4,5,65535]);
 const data={vertices,indices,manifest:{materials:{},objects:[{active:true,name:'slice',material:'plain',vo:0,vc:6,io:1,ic:6,collidable:true}]}};
 const {display}=await fixture(data),attr=display.group.children[0].geometry.index;
 assert.equal(attr.array.BYTES_PER_ELEMENT,2);assert.deepEqual(Array.from(attr.array),[0,1,2,3,4,5]);
 assert.equal(attr.array.byteLength,12);assert.deepEqual(Array.from(indices),[65536,0,1,2,3,4,5,65535]);
 attr.onUploadCallback();assert.equal(attr.array,null,'narrowed CPU buffer follows existing release-on-upload ownership');display.dispose();
});

function cullingMesh(){
 const positions=[];
 // Separate local triangles plus a large boundary-crossing triangle. A
 // centroid-only bound would incorrectly drop its visible corner.
 for(const x of [0,100,-100])positions.push(x-1,-1,-10,x+1,-1,-10,x,1,-10);
 positions.push(-1,0,-8,110,0,-8,110,1,-8);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setIndex(Array.from({length:12},(_,i)=>i));geometry.computeBoundingSphere();
 return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
}
function view(x=0){
 const c=new THREE.PerspectiveCamera(50,1,.1,60);c.position.x=x;c.lookAt(x,0,-10);c.updateMatrixWorld();return c;
}

test('native display tile selection retains every intersecting triangle, exact index order and baked attributes',async()=>{
 const {display,installNativeDisplayCulling}=await fixture();display.dispose();
 const mesh=cullingMesh(),g=mesh.geometry,source=Array.from(g.index.array),attributes=g.attributes;
 const before=Float32Array.from(g.attributes.position.array),culler=installNativeDisplayCulling(mesh,16,1);
 assert.ok(culler.tiles>=3);
 const originalSphere=g.boundingSphere.clone(),parent=new THREE.Group();parent.add(mesh);
 for(const scale of [1,.7,2])for(const turn of [0,.2,-.5])for(const x of [0,100,-100,20]){
  parent.position.set(2,1,-3);parent.scale.setScalar(scale);parent.rotation.y=turn;parent.updateMatrixWorld();
  const camera=view(x),matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(mesh.matrixWorld);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(matrix);
  culler.select(camera);
  const selected=Array.from(g.index.array.slice(0,g.drawRange.count));
  assert.deepEqual(selected,[...selected].sort((a,b)=>a-b),'original triangle and corner order');
  for(let t=0;t<source.length;t+=3){
   const box=new THREE.Box3();for(let k=0;k<3;k++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(g.attributes.position,source[t+k]));
   if(frustum.intersectsBox(box))assert.ok(selected.includes(source[t]),'a potentially visible source triangle was omitted');
   const present=selected.includes(source[t]);for(let k=0;k<3;k++)assert.equal(selected.includes(source[t+k]),present,'triangles remain whole');
  }
  assert.equal(g.attributes,attributes);assert.deepEqual(g.attributes.position.array,before);assert.deepEqual(g.boundingSphere,originalSphere);
 }
 culler.dispose();g.dispose();mesh.material.dispose();
});

test('native display handles alternating colour/reflection/shadow cameras and preserves pending index uploads',async()=>{
 const {display,installNativeDisplayCulling}=await fixture();display.dispose();
 const mesh=cullingMesh(),g=mesh.geometry,colour=view(),reflection=view(100),shadow=view(-100);
 const beforeRender=mesh.onBeforeRender,beforeShadow=mesh.onBeforeShadow,culler=installNativeDisplayCulling(mesh,16,1);
 const select=camera=>{mesh.onBeforeRender(null,null,camera);return Array.from(g.index.array.slice(0,g.drawRange.count));};
 const main=select(colour);assert.ok(main.includes(0));assert.ok(!main.includes(3));
 const version=g.index.version;select(colour);assert.equal(g.index.version,version,'identical view does not upload');
 const pending=g.index.updateRanges.map(r=>({...r}));
 const reflected=select(reflection);assert.ok(reflected.includes(3));
 mesh.onBeforeShadow(null,mesh,colour,shadow);
 const shadowed=Array.from(g.index.array.slice(0,g.drawRange.count));assert.ok(shadowed.includes(6));assert.ok(!shadowed.includes(0));
 assert.deepEqual(select(colour),main);
 for(const r of pending)assert.ok(g.index.updateRanges.some(next=>next.start<=r.start&&next.start+next.count>=r.start+r.count),'unconsumed writes survive camera changes');
 g.index.clearUpdateRanges();g.index.onUploadCallback();assert.ok(g.index.array,'dynamic selections retain CPU storage');
 culler.dispose();assert.equal(mesh.onBeforeRender,beforeRender);assert.equal(mesh.onBeforeShadow,beforeShadow);
 g.dispose();mesh.material.dispose();
});
