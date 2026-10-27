// Initialization-only pixel check. No readPixels or synchronous queries in the
// playing-frame path. Incompatible shader backends keep the original material.
import * as THREE from 'three';
const results = new WeakMap(), observed = new WeakSet();

export function profileShaderCompatibility(renderer, reference, fast) {
  const gl = renderer.getContext();
  if (gl.isContextLost()) { results.delete(gl); return { compatible: false, reason: 'context-lost' }; }
  const cached = results.get(gl);
  if (cached?.vertex === reference.vertexShader && cached?.fragment === reference.fragmentShader &&
      cached?.fastVertex === fast.vertexShader && cached?.fastFragment === fast.fragmentShader &&
      cached?.profileUUID===reference.uniforms.uMainInkProfiles.value.uuid && cached?.profileVersion===reference.uniforms.uMainInkProfiles.value.version)
    return cached.result;
  if (!observed.has(gl) && gl.canvas?.addEventListener) {
    observed.add(gl);
    const invalidate = () => results.delete(gl);
    gl.canvas.addEventListener('webglcontextlost', invalidate);
    gl.canvas.addEventListener('webglcontextrestored', invalidate);
  }
  const cols = 10, rows = 8, width = cols * 32, height = rows * 32, count = cols * rows;
  const geometry = new THREE.BufferGeometry();
  const arrays = { aPos: new Float32Array(count * 8), aLocal: new Float32Array(count * 12),
    aSplat: new Float32Array(count * 16), aStretch: new Float32Array(count * 12), aGrow: new Float32Array(count * 16) };
  const sizes = { aPos: 2, aLocal: 3, aSplat: 4, aStretch: 3, aGrow: 4 }, indices = new Uint16Array(count * 6);
  const ages = [.054644808, .38251367, .71038252, .99999, 1, 1.74863, 3, .1];
  for (let q = 0; q < count; q++) {
    const col = q % cols, row = Math.floor(q / cols), kind = 10 + col;
    const R = .25 + (q % 9) * .43, plane = q % 3 === 0 ? R * .6 : .02;
    const angle = q * .527, sx = Math.cos(angle), sy = Math.sin(angle), stretch = (q % 5) * .35;
    const extent = R * (1 + stretch) * 1.42, word = (q * 1729 + 97) % 65536, seed = word / 65536;
    const x0 = (col * 32 + .37) / width * 2 - 1, x1 = (col * 32 + 31.61) / width * 2 - 1;
    const y0 = (row * 32 + .21) / height * 2 - 1, y1 = (row * 32 + 31.73) / height * 2 - 1;
    for (let c = 0; c < 4; c++) {
      const at = q * 4 + c, right = c === 1 || c === 2, top = c >= 2;
      arrays.aPos.set([right ? x1 : x0, top ? y1 : y0], at * 2);
      arrays.aLocal.set([right ? extent : -extent, top ? extent : -extent, plane], at * 3);
      arrays.aSplat.set([R, q % 2, seed, kind * 2 + (q % 2)], at * 4);
      arrays.aStretch.set([sx, sy, stretch], at * 3);
      arrays.aGrow.set([ages[row], .6, q % 13 === 0 ? 1 : q % 3 === 0 ? 2 : 0, word], at * 4);
    }
    const v = q * 4; indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
  }
  for (const [name, array] of Object.entries(arrays)) geometry.setAttribute(name, new THREE.BufferAttribute(array, sizes[name]));
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1)); geometry.setDrawRange(0, count * 6);
  const scene = new THREE.Scene(), mesh = new THREE.Mesh(geometry, reference);
  mesh.frustumCulled = false; scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const settings = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const a = new THREE.WebGLRenderTarget(width, height, settings), b = new THREE.WebGLRenderTarget(width, height, settings);
  const before = renderer.getRenderTarget(), face = renderer.getActiveCubeFace?.() || 0, mip = renderer.getActiveMipmapLevel?.() || 0;
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha(), auto = renderer.autoClear;
  let result = { compatible: false, reason: 'initialization-failed', bytesCompared: 0, differentBytes: null };
  try {
    renderer.autoClear = false;
    renderer.setClearColor(new THREE.Color(.13, .27, .41), .37);
    const A = new Uint8Array(width * height * 4), B = new Uint8Array(A.length);
    for (const [target, material, pixels] of [[a, reference, A], [b, fast, B]]) {
      renderer.setRenderTarget(target); renderer.setClearColor(new THREE.Color(.13, .27, .41), .37); renderer.clear(true, false, false);
      mesh.material = material;
      renderer.render(scene, camera); renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    }
    let different = 0;
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) different++;
    result = { compatible: different === 0, reason: different ? 'pixel-mismatch' : 'pixel-identical',
      bytesCompared: A.length, differentBytes: different, quads: count, layers: 2 };
  } catch (error) {
    result = { ...result, reason: 'initialization-failed', message: String(error?.message || error) };
  } finally {
    renderer.setRenderTarget(before, face, mip); renderer.setClearColor(clear, alpha); renderer.autoClear = auto;
    a.dispose(); b.dispose(); geometry.dispose();
  }
  results.set(gl, { vertex: reference.vertexShader, fragment: reference.fragmentShader,
    fastVertex: fast.vertexShader, fastFragment: fast.fragmentShader, profileUUID:reference.uniforms.uMainInkProfiles.value.uuid,
    profileVersion:reference.uniforms.uMainInkProfiles.value.version, result });
  return result;
}
