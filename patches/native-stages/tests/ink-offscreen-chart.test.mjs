import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeFixture } from './fixture.mjs';

test('new offscreen ink charts retain source-order rendering without reuploading the current view', async () => {
  const { THREE, NativeInkMesh } = await nativeFixture();
  const geometry = new THREE.BufferGeometry();
  const triangle = (x, z) => [x, 0, z, x + 1, 0, z, x, 0, z + 1];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    ...triangle(0, 0), ...triangle(100, 100), ...triangle(102, 100),
    ...triangle(2, 0), ...triangle(4, 0),
  ], 3));
  const chart = (x, z, i) => ({
    atlas: { pad: 1, ppm: 4 }, triangles: [i], su: 1, sv: 1,
    origin: new THREE.Vector3(x, 0, z), u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 0, 1),
  });
  const faces = [chart(0, 0, 0), chart(100, 100, 1), chart(102, 100, 2),
    chart(2, 0, 3), chart(4, 0, 4)];
  const paint = { grid: new Uint8Array(5), paintFaces: faces, _pushQuad() {}, clear() { this.grid.fill(0); } };
  const material = new THREE.MeshBasicMaterial();
  const mesh = new NativeInkMesh(geometry, material);
  mesh.bindPaint(paint);
  mesh.updateMatrixWorld();
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 40);
  const look = (x, z) => {
    camera.position.set(x, 5, z + 12);
    camera.lookAt(x, 0, z);
    camera.updateMatrixWorld();
    mesh.selectVisible(camera);
  };
  const drawn = () => Array.from(geometry.index.array.subarray(0, geometry.drawRange.count));
  const reach = i => paint._pushQuad(faces[i], 0, 1, 0, 1);
  try {
    reach(0); reach(1);
    look(1, 0);
    assert.deepEqual(drawn(), [0, 1, 2]);
    let version = geometry.index.version;
    reach(2);
    mesh.selectVisible(camera);
    assert.equal(geometry.index.version, version, 'offscreen paint does not upload identical visible indices');
    assert.deepEqual(drawn(), [0, 1, 2]);

    look(101, 100);
    assert.deepEqual(drawn(), [3, 4, 5, 6, 7, 8], 'camera reveals both previously reached far charts');
    version = geometry.index.version;
    reach(3);
    mesh.selectVisible(camera);
    assert.equal(geometry.index.version, version);
    look(1, 0);
    assert.deepEqual(drawn(), [0, 1, 2, 9, 10, 11], 'interleaved source order is retained');

    mesh.faceCulling = false;
    mesh.selectVisible(camera);
    assert.deepEqual(drawn(), [0, 1, 2, 9, 10, 11, 12, 13, 14]);
    look(101, 100);
    version = geometry.index.version;
    reach(4);
    mesh.selectVisible(camera);
    assert.equal(geometry.index.version, version, 'tile-only selection does not consume newly painted chart bits');
    mesh.faceCulling = true;
    look(1, 0);
    assert.deepEqual(drawn(), [0, 1, 2, 9, 10, 11, 12, 13, 14]);

    paint.clear();
    mesh.selectVisible(camera);
    assert.equal(geometry.drawRange.count, 0);
    reach(2);
    look(101, 100);
    assert.deepEqual(drawn(), [6, 7, 8], 'clear invalidates prior chart membership');
  } finally {
    mesh.dispose();
    material.dispose();
  }
});
