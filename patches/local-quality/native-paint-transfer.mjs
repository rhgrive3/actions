// Keep the existing CPU arrays and paint renderer intact. For ordinary native
// paint rectangles, upload one instance instead of four copies of each value.
// An unrecognised material, geometry, hook or per-vertex edit uses the original
// path. Packing uses float32 bit patterns, preserving signed zero exactly.
import * as THREE from 'three';

const INSTALLED = Symbol.for('inkwave.native-paint-transfer.v1');
const STATE = Symbol.for('inkwave.native-paint-transfer.state.v1');
const NAMES = ['aPos', 'aLocal', 'aSplat', 'aStretch', 'aGrow'];
const MAX_QUADS = 6000;

function attach(paint) {
  const draw = paint._drawQuads, mesh = paint.mesh, geo = paint.geo, mat = paint.mat;
  const renderer = paint.renderer, arrays = NAMES.map(name => paint[name]);
  if (typeof draw !== 'function' || !mesh || !geo?.attributes || !mat || typeof mat.clone !== 'function' || !renderer || !paint.scene ||
      arrays.some((a, i) => !(a instanceof Float32Array) || a.length !== MAX_QUADS * [8, 12, 16, 12, 16][i] || !geo.attributes[NAMES[i]])) return null;
  const vertex = mat.vertexShader;
  const substitutions = [
    ['attribute vec2 aPos;', 'attribute float iwCorner; attribute vec4 iwRect; attribute vec4 iwLocalRect;'],
    ['attribute vec3 aLocal;', ''],
    ['attribute vec3 aStretch;', 'attribute vec4 iwStretch;'],
    ['vStretch = aStretch;', 'vStretch = iwStretch.xyz;'],
    ['vLocal = aLocal;', 'bool iwRight = iwCorner > 0.5 && iwCorner < 2.5; bool iwTop = iwCorner > 1.5; vec2 iwPos = vec2(iwRight ? iwRect.z : iwRect.x, iwTop ? iwRect.w : iwRect.y); vec3 iwLocal = vec3(iwRight ? iwLocalRect.z : iwLocalRect.x, iwTop ? iwLocalRect.w : iwLocalRect.y, iwStretch.w); vLocal = iwLocal;'],
    ['gl_Position = vec4(aPos, 0.0, 1.0);', 'gl_Position = vec4(iwPos, 0.0, 1.0);'],
  ];
  if (typeof vertex !== 'string' || substitutions.some(([a]) => vertex.split(a).length !== 2)) return null;
  let packedVertex = vertex;
  for (const [from, to] of substitutions) packedVertex = packedVertex.replace(from, to);
  const buffer = new THREE.InstancedInterleavedBuffer(new Float32Array(MAX_QUADS * 20), 20, 1).setUsage(THREE.DynamicDrawUsage);
  const fastGeo = new THREE.InstancedBufferGeometry();
  fastGeo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  fastGeo.setAttribute('iwCorner', new THREE.BufferAttribute(new Float32Array([0, 1, 2, 3]), 1));
  for (const [name, offset] of [['iwRect', 0], ['iwLocalRect', 4], ['aSplat', 8], ['iwStretch', 12], ['aGrow', 16]])
    fastGeo.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, 4, offset));
  fastGeo.boundingSphere = geo.boundingSphere?.clone();
  fastGeo.setDrawRange(0, 6);
  fastGeo.instanceCount = 0;
  const fastMat = mat.clone();
  fastMat.uniforms = mat.uniforms;
  fastMat.vertexShader = packedVertex;
  const attributes = NAMES.map(name => geo.attributes[name]);
  const bits = arrays.map(a => new Uint32Array(a.buffer, a.byteOffset, a.length));
  const packed = new Uint32Array(buffer.array.buffer);
  const index = geo.index, indexVersion = index?.version, indexArray = index?.array, uniforms = mat.uniforms;
  const fragment = mat.fragmentShader, defines = JSON.stringify(mat.defines || {}), extensions = JSON.stringify(mat.extensions || {});
  const attrLayout = attributes.map(a => [a?.itemSize, a?.normalized, a?.gpuType]);
  const scalarKeys = Object.keys(mat).filter(k => ['number', 'boolean', 'string'].includes(typeof mat[k]));
  const scalars = scalarKeys.map(k => mat[k]);
  const scene = paint.scene;

  function compatible(count) {
    return Number.isInteger(count) && count > 0 && count <= MAX_QUADS &&
      renderer.capabilities?.isWebGL2 === true && typeof renderer.getContext === 'function' &&
      typeof renderer.getContext().isContextLost === 'function' && !renderer.getContext().isContextLost() &&
      paint.geo === geo && paint.mesh === mesh && paint.mat === mat && paint.renderer === renderer &&
      mesh.geometry === geo && mesh.material === mat && mesh.frustumCulled === false && geo.groups.length === 0 &&
      geo.index === index && index?.version === indexVersion && index?.array === indexArray &&
      indexArray instanceof Uint16Array && indexArray.length >= count * 6 && index.onUploadCallback === THREE.BufferAttribute.prototype.onUploadCallback &&
      NAMES.every((name, i) => paint[name] === arrays[i] && geo.attributes[name] === attributes[i] &&
        !Object.getOwnPropertyDescriptor(attributes[i], 'array')?.get && attributes[i].array === arrays[i] &&
        attributes[i].itemSize === attrLayout[i][0] && attributes[i].normalized === attrLayout[i][1] && attributes[i].gpuType === attrLayout[i][2] &&
        attributes[i].onUploadCallback === THREE.BufferAttribute.prototype.onUploadCallback) &&
      mat.uniforms === uniforms && mat.vertexShader === vertex && mat.fragmentShader === fragment &&
      JSON.stringify(mat.defines || {}) === defines && JSON.stringify(mat.extensions || {}) === extensions &&
      mat.clippingPlanes === null && mat.blendColor?.equals?.(fastMat.blendColor) === true && scalarKeys.every((k, i) => Object.is(mat[k], scalars[i])) &&
      mat.onBeforeCompile === THREE.Material.prototype.onBeforeCompile &&
      mat.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey &&
      mat.onBeforeRender === THREE.Material.prototype.onBeforeRender &&
      mesh.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && mesh.onAfterRender === THREE.Object3D.prototype.onAfterRender &&
      paint.scene === scene && scene.onBeforeRender === THREE.Scene.prototype.onBeforeRender &&
      scene.onAfterRender === THREE.Scene.prototype.onAfterRender;
  }
  function pack(count) {
    const [p, l, s, t, g] = bits;
    for (let q = 0; q < count; q++) {
      const x = q * 8, y = q * 12, z = q * 16, o = q * 20;
      // Only the stock triangle order, rectangles and shared attributes are representable.
      const ii = q * 6, v = q * 4;
      if (indexArray[ii] !== v || indexArray[ii+1] !== v+1 || indexArray[ii+2] !== v+2 ||
          indexArray[ii+3] !== v || indexArray[ii+4] !== v+2 || indexArray[ii+5] !== v+3) return false;
      if (p[x] !== p[x+6] || p[x+1] !== p[x+3] || p[x+2] !== p[x+4] || p[x+5] !== p[x+7] ||
          l[y] !== l[y+9] || l[y+1] !== l[y+4] || l[y+3] !== l[y+6] || l[y+7] !== l[y+10] ||
          l[y+2] !== l[y+5] || l[y+2] !== l[y+8] || l[y+2] !== l[y+11]) return false;
      for (let i = 0; i < 4; i++)
        if (s[z+i] !== s[z+4+i] || s[z+i] !== s[z+8+i] || s[z+i] !== s[z+12+i] ||
            g[z+i] !== g[z+4+i] || g[z+i] !== g[z+8+i] || g[z+i] !== g[z+12+i]) return false;
      for (let i = 0; i < 3; i++)
        if (t[y+i] !== t[y+3+i] || t[y+i] !== t[y+6+i] || t[y+i] !== t[y+9+i]) return false;
      packed[o] = p[x]; packed[o+1] = p[x+1]; packed[o+2] = p[x+2]; packed[o+3] = p[x+5];
      packed[o+4] = l[y]; packed[o+5] = l[y+1]; packed[o+6] = l[y+3]; packed[o+7] = l[y+7];
      for (let i = 0; i < 4; i++) { packed[o+8+i] = s[z+i]; packed[o+16+i] = g[z+i]; }
      for (let i = 0; i < 3; i++) packed[o+12+i] = t[y+i];
      packed[o+15] = l[y+2];
    }
    return true;
  }
  const wrapped = function (...args) {
    const count = this.quads;
    let accepted = false;
    try { accepted = compatible(count) && pack(count); } catch { /* unrecognised custom state */ }
    if (!accepted) return draw.apply(this, args);
    buffer.clearUpdateRanges();
    buffer.addUpdateRange(0, count * 20);
    buffer.needsUpdate = true;
    fastGeo.instanceCount = count;
    mesh.geometry = fastGeo;
    mesh.material = fastMat;
    try { return draw.apply(this, args); }
    finally { mesh.geometry = geo; mesh.material = mat; }
  };
  paint._drawQuads = wrapped;
  return { dispose() { if (paint._drawQuads === wrapped) paint._drawQuads = draw; fastGeo.dispose(); fastMat.dispose(); } };
}

export function installNativePaintTransfer(PaintSystem) {
  const P = PaintSystem?.prototype;
  if (!P || Object.hasOwn(P, INSTALLED)) return false;
  const init = P._initGPU, dispose = P.dispose;
  if (typeof init !== 'function' || typeof dispose !== 'function') return false;
  P._initGPU = function (...args) {
    this[STATE]?.dispose(); this[STATE] = null;
    const result = init.apply(this, args);
    if (this.level?.native) {
      try { this[STATE] = attach(this); } catch { this[STATE] = null; }
    }
    return result;
  };
  P.dispose = function (...args) {
    this[STATE]?.dispose(); this[STATE] = null;
    return dispose.apply(this, args);
  };
  Object.defineProperty(P, INSTALLED, { value: true });
  return true;
}
