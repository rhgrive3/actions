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
  return { display: module.namespace.nativeDisplay(customData||data, new Map(), 'high'), vertices, compactNativeIndices:module.namespace.compactNativeIndices };
}

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
