import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const source = fs.readFileSync(new URL('../native-paint-transfer.mjs', import.meta.url), 'utf8')
  .replace("from 'three'", `from '${pathToFileURL(new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url).pathname).href}'`);
const { installNativePaintTransfer } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const state = Symbol.for('inkwave.native-paint-transfer.state.v1');
function fixture(native = true, throwDraw = false) {
  class Paint {
    _initGPU() {
      this.aPos = new Float32Array(6000 * 8); this.aLocal = new Float32Array(6000 * 12);
      this.aSplat = new Float32Array(6000 * 16); this.aStretch = new Float32Array(6000 * 12); this.aGrow = new Float32Array(6000 * 16);
      this.geo = new THREE.BufferGeometry();
      for (const [name, size] of [['aPos', 2], ['aLocal', 3], ['aSplat', 4], ['aStretch', 3], ['aGrow', 4]]) this.geo.setAttribute(name, new THREE.BufferAttribute(this[name], size));
      this.geo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
      this.mat = new THREE.ShaderMaterial({ vertexShader: 'attribute vec2 aPos; attribute vec3 aLocal; attribute vec3 aStretch; void main(){ vStretch = aStretch; vLocal = aLocal; gl_Position = vec4(aPos, 0.0, 1.0); }', fragmentShader: 'void main(){}' });
      this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.scene = new THREE.Scene();
      this.renderer = { capabilities: { isWebGL2: true }, getContext: () => ({ isContextLost: () => false }) };
      this.quads = 1;
      this.aPos.set([-0, 1, 2, 1, 2, 3, -0, 3]);
      this.aLocal.set([-4, 5, 6, 7, 5, 6, 7, 8, 6, -4, 8, 6]);
      for (let v = 0; v < 4; v++) { this.aSplat.set([9, 10, 11, 12], v * 4); this.aStretch.set([13, 14, 15], v * 3); this.aGrow.set([16, 17, 18, 19], v * 4); }
    }
    _drawQuads() { this.lastGeometry = this.mesh.geometry; this.lastMaterial = this.mesh.material; if (throwDraw) throw Error('draw failure'); this.quads = 0; }
    dispose() { this.baseDisposed = true; }
  }
  assert.equal(installNativePaintTransfer(Paint), true);
  assert.equal(installNativePaintTransfer(Paint), false);
  const paint = new Paint(); paint.level = { native }; paint._initGPU();
  return paint;
}

test('packs exact rectangle data into one 80-byte instance and restores the original geometry', () => {
  const p = fixture(); const geo = p.geo, material = p.mat; p._drawQuads();
  assert.notEqual(p.lastGeometry, geo); assert.notEqual(p.lastMaterial, material);
  assert.equal(p.mesh.geometry, geo); assert.equal(p.mesh.material, material);
  const b = p.lastGeometry.attributes.iwRect.data;
  assert.equal(b.updateRanges[0].count, 20); assert.equal(b.array.BYTES_PER_ELEMENT * 20, 80);
  assert.deepEqual(Array.from(b.array.slice(0, 20)), [-0, 1, 2, 3, -4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 6, 16, 17, 18, 19]);
  p.dispose(); assert.equal(p[state], null); assert.equal(p.baseDisposed, true);
});

test('per-vertex edits, changed hooks and unsupported contexts fall back', () => {
  for (const [key, at] of [['aPos', 6], ['aLocal', 9], ['aSplat', 4], ['aStretch', 3], ['aGrow', 4]]) {
    const p = fixture(); p[key][at] += .125; p._drawQuads(); assert.equal(p.lastGeometry, p.geo, key);
  }
  const changedUpload = fixture(); changedUpload.geo.attributes.aPos.onUpload(() => {}); changedUpload._drawQuads(); assert.equal(changedUpload.lastGeometry, changedUpload.geo);
  const changedIndex = fixture(); changedIndex.geo.index.array[1] = 2; changedIndex._drawQuads(); assert.equal(changedIndex.lastGeometry, changedIndex.geo);
  const p = fixture(); p.mesh.onBeforeRender = () => {}; p._drawQuads(); assert.equal(p.lastGeometry, p.geo);
  const q = fixture(); q.renderer.capabilities.isWebGL2 = false; q._drawQuads(); assert.equal(q.lastGeometry, q.geo);
  const ordinary = fixture(false); assert.equal(ordinary[state], null); ordinary._drawQuads(); assert.equal(ordinary.lastGeometry, ordinary.geo);
});

test('restores geometry if the underlying draw throws', () => {
  const p = fixture(true, true); const geometry = p.geo, material = p.mat;
  assert.throws(() => p._drawQuads(), /draw failure/);
  assert.notEqual(p.lastGeometry, geometry);
  assert.equal(p.mesh.geometry, geometry); assert.equal(p.mesh.material, material);
});
