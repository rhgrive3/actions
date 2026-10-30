import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeFixture } from './fixture.mjs';

function make(f) {
  const { THREE } = f, geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0,0,0, 1,0,0, 0,0,1,
    100,0,100, 101,0,100, 100,0,101,
  ], 3));
  const mesh = new f.NativeInkMesh(geometry, new THREE.MeshBasicMaterial());
  const face = {
    atlas: { pad: 1, ppm: 2 }, triangles: [0], su: 2, sv: 2,
    origin: new THREE.Vector3(), u: new THREE.Vector3(1,0,0), v: new THREE.Vector3(0,0,1),
  };
  const other = { ...face, origin: new THREE.Vector3(100,0,100), triangles: [1] };
  const paint = {
    grid: new Uint8Array(4), paintFaces: [face, other],
    _pushQuad() {}, clear() { this.grid.fill(0); },
  };
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 50);
  camera.position.set(0,5,12); camera.lookAt(0,0,0); camera.updateMatrixWorld();
  mesh.updateMatrixWorld(); mesh.bindPaint(paint);
  return { mesh, geometry, face, other, paint, camera };
}

test('empty native ink skips view/frustum work and the first later paint uses the current camera', async () => {
  const f = await nativeFixture({renderOnly:true}), { mesh, geometry, other, paint, camera } = make(f);
  let views = 0, frustums = 0;
  const multiply = mesh._view.multiplyMatrices, setFrustum = mesh._frustum.setFromProjectionMatrix;
  mesh._view.multiplyMatrices = function(...args) { views++; return multiply.apply(this, args); };
  mesh._frustum.setFromProjectionMatrix = function(...args) { frustums++; return setFrustum.apply(this, args); };
  const version = geometry.index.version;
  for (let i = 0; i < 4; i++) {
    assert.equal(mesh.selectVisible(camera), 0);
    assert.equal(geometry.drawRange.count, 0);
    camera.position.x += 1; camera.updateMatrixWorld();
  }
  assert.equal(views, 0); assert.equal(frustums, 0);
  assert.equal(geometry.index.version, version);

  camera.position.set(100,5,112); camera.lookAt(100,0,100); camera.updateMatrixWorld();
  mesh.onBeforeRender(null, { overrideMaterial: {} }, camera);
  mesh.onBeforeRender(null, { overrideMaterial: null }, camera);
  assert.equal(views, 0); assert.equal(geometry.drawRange.count, 0);
  paint._pushQuad(other, 0, 1, 0, 1);
  assert.equal(mesh.selectVisible(camera), 1);
  assert.equal(views, 2); assert.equal(frustums, 1);
  assert.deepEqual(Array.from(geometry.index.array.subarray(0, geometry.drawRange.count)), [3,4,5]);

  paint.clear();
  const paintedVersion = geometry.index.version;
  for (let i = 0; i < 4; i++) assert.equal(mesh.selectVisible(camera), 0);
  assert.equal(views, 2); assert.equal(frustums, 1);
  assert.equal(geometry.drawRange.count, 0);
  assert.equal(geometry.index.version, paintedVersion);
  paint._pushQuad(other, 0, 1, 0, 1);
  assert.equal(mesh.selectVisible(camera), 1);
  assert.deepEqual(Array.from(geometry.index.array.subarray(0, geometry.drawRange.count)), [3,4,5]);
  mesh.dispose(); mesh.material.dispose();
});

test('native ink releases face/chunk caches on rebind, geometry replacement and disposal', async () => {
  const f = await nativeFixture({renderOnly:true}), { mesh, geometry, face, paint } = make(f);
  const list = mesh._faceChunks(face);
  assert.equal(mesh._faceChunkLists.get(face).list, list);
  const wrappedPush = paint._pushQuad;
  mesh.bindPaint(paint);
  assert.equal(mesh._faceChunkLists, null);
  assert.notEqual(paint._pushQuad, wrappedPush);
  mesh._faceChunks(face);
  assert.equal(mesh._faceChunkLists.size, 1);

  const next = geometry.clone().setIndex(null);
  mesh.geometry = next; geometry.dispose();
  assert.equal(mesh._faceChunkLists, null);
  mesh.bindPaint(paint); mesh._faceChunks(face);
  assert.equal(mesh._faceChunkLists.size, 1);
  mesh.dispose();
  assert.equal(mesh._faceChunkLists, null);
  assert.equal(mesh._paintBinding, null);
  assert.equal(mesh._drawIndex, null);
  assert.equal(mesh._visible, null);
  assert.equal(mesh._painted, null);
  assert.equal(mesh.geometry, null);
  mesh.dispose(); mesh.material.dispose();
});

test('native ink stencil shares current atlas geometry, falls back on reflections and releases only its material',async()=>{
 const f=await nativeFixture({renderOnly:true}),{THREE}=f,{mesh,paint,geometry,face,camera}=make(f);
 mesh.material.dispose();mesh.material=f.nativeInkMaterial({texture:new THREE.Texture(),size:256},new THREE.Texture());
 let target={stencilBuffer:true};const renderer={getRenderTarget:()=>target};paint.renderer=renderer;
 mesh.bindPaint(paint);const mask=mesh._stencilMask;
 assert.ok(mask);assert.equal(mask.parent,mesh);assert.equal(mask.geometry,geometry);
 assert.equal(mask.material.colorWrite,false);assert.equal(mask.material.depthWrite,false);
 assert.equal(mask.material.stencilFunc,THREE.AlwaysStencilFunc);assert.equal(mask.material.stencilZPass,THREE.ReplaceStencilOp);
 assert.equal(mesh.material.stencilFunc,THREE.EqualStencilFunc);assert.equal(mesh.material.stencilWriteMask,0);
 assert.equal(mask.material.stencilRef,mesh.material.stencilRef);assert.ok(mask.renderOrder<mesh.renderOrder);
 paint._pushQuad(face,0,1,0,1);mask.onBeforeRender(renderer,{},camera);
 assert.equal(mesh.material.stencilWrite,true);assert.equal(mask.material.visible,true);assert.equal(geometry.drawRange.count,3);
 const texture=new THREE.Texture();mesh.material.userData.uniforms.uPaint.value=texture;
 const next=geometry.clone().setIndex(null);mesh.geometry=next;mesh.bindPaint(paint);geometry.dispose();
 mask.onBeforeRender(renderer,{},camera);
 assert.equal(mask.geometry,next);assert.equal(mask.material.uniforms.uPaint.value,texture);
 target={stencilBuffer:false};mesh.onBeforeRender(renderer,{},camera);
 assert.equal(mask.material.visible,false);assert.equal(mesh.material.stencilWrite,false,'reflection retains the original unmasked ink draw');
 target=null;mesh.onBeforeRender(renderer,{},camera);assert.equal(mask.material.visible,false);assert.equal(mesh.material.stencilWrite,false);
 let disposed=0;mask.material.addEventListener('dispose',()=>disposed++);
 mesh.dispose();mesh.dispose();assert.equal(disposed,1);assert.equal(mask.parent,null);assert.equal(mesh._stencilMask,null);
 mesh.material.dispose();texture.dispose();
});
