import {assertWiperOcclusionReceipt} from './inkwave-wiper-occlusion.mjs';
// QA only. Fixed full-frame inspection cameras, shared by both variants.
// No projectile-following, dynamic fit, runtime, light, palette or crop edits.
export function configureWiperCoverageCamera(THREE, camera, anchor, view) {
  if (!['front', 'top'].includes(view)) throw Error('Unknown inspection view');
  const focus = anchor.clone().add(new THREE.Vector3(0, 0, 6));
  camera.fov = 50; camera.aspect = 960 / 720;
  camera.near = .05; camera.far = 250;
  camera.zoom = 1; camera.clearViewOffset();
  camera.position.copy(focus).add(view === 'front'
    ? new THREE.Vector3(.2, 26, 24) : new THREE.Vector3(0, 34, -.01));
  camera.up.set(0, 1, 0); camera.lookAt(focus);
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
}

// Convex-frustum full-vertex containment implies full triangle containment.
// Requiring depth >= 1.6 also rules out the flight material's near dither
// anywhere within a triangle, rather than just at sampled vertices.
// This does NOT establish occlusion, pixel fidelity, tail, or retail acceptance.
export function assertWiperFlightCoverage(THREE, mesh, camera, {margin = .9} = {}) {
  if (!(margin > 0 && margin < 1)) throw Error('Invalid coverage margin');
  if (!mesh || !Number.isInteger(mesh.count) || mesh.count < 0) throw Error('Missing or invalid flight mesh');
  if (mesh.count === 0) return {instances: 0, vertices: 0};
  mesh.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4(), world = new THREE.Vector3(), clip = new THREE.Vector4();
  const pos = mesh.geometry?.attributes?.position;
  if (!pos || !Number.isInteger(pos.count) || pos.count <= 0) throw Error('Missing flight vertices');
  let minDepth = Infinity, maxNdc = 0;
  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, matrix); matrix.premultiply(mesh.matrixWorld);
    for (let vertex = 0; vertex < pos.count; vertex++) {
      world.fromBufferAttribute(pos, vertex).applyMatrix4(matrix).applyMatrix4(camera.matrixWorldInverse);
      const depth = -world.z;
      clip.set(world.x, world.y, world.z, 1).applyMatrix4(camera.projectionMatrix);
      minDepth = Math.min(minDepth, depth);
      const extent = Math.max(Math.abs(clip.x / clip.w), Math.abs(clip.y / clip.w));
      maxNdc = Math.max(maxNdc, extent);
      if (!Number.isFinite(depth) || !Number.isFinite(extent) || clip.w <= 0 || depth < Math.max(1.6, camera.near)
          || depth > camera.far || extent > margin) {
        throw Error(`Flight coverage failed: instance=${instance} vertex=${vertex} depth=${depth} ndc=${extent}`);
      }
    }
  }
  return {instances: mesh.count, vertices: pos.count * mesh.count, minDepth, maxNdc, margin};
}

// Observe the actual default framebuffer viewport; never crop, mask, resize,
// change lighting, or adjust runtime objects to make a frame pass.
export function assertWiperFullFrame(THREE, renderer, camera) {
  const viewport = renderer.getCurrentViewport(new THREE.Vector4()).toArray();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2()).toArray();
  const scissorTest = renderer.getScissorTest();
  if (renderer.getRenderTarget() !== null || scissorTest
      || JSON.stringify(viewport) !== '[0,0,960,720]'
      || JSON.stringify(size) !== '[960,720]'
      || camera.view?.enabled || camera.zoom !== 1 || camera.filmOffset !== 0) {
    throw Error('Full-frame coverage requires the uncropped 960x720 default framebuffer');
  }
  return {viewport, size, scissorTest};
}

// Required by the existing strict pair consumer. Projection success is
// additional evidence, never a substitute for seed/paint/resource equality.
export function assertWiperCoverageImage(image, counts) {
  const fail = () => { throw Error('Missing or invalid full-frame flight coverage receipt'); };
  if (!image || !counts || !['front', 'top'].includes(image.view)) fail();
  const camera = image.camera, frame = image.fullFrame;
  if (!camera || camera.fov !== 50 || camera.aspect !== 960 / 720
      || camera.near !== .05 || camera.far !== 250 || camera.zoom !== 1
      || camera.filmOffset !== 0 || camera.view?.enabled
      || !frame || frame.scissorTest !== false
      || JSON.stringify(frame.viewport) !== '[0,0,960,720]'
      || JSON.stringify(frame.size) !== '[960,720]') fail();
  for (const key of ['slashH', 'slashV']) {
    const row = image.flightCoverage?.[key], count = counts[key];
    if (!Number.isInteger(count) || count < 0 || !row || row.instances !== count
        || !Number.isInteger(row.vertices) || row.vertices < 0) fail();
    if (count === 0) { if (row.vertices !== 0) fail(); continue; }
    if (row.vertices < count || row.vertices % count !== 0 || row.margin !== .9
        || !Number.isFinite(row.minDepth) || row.minDepth < 1.6
        || row.minDepth > camera.far || !Number.isFinite(row.maxNdc)
        || row.maxNdc < 0 || row.maxNdc > .9) fail();
  }
  assertWiperOcclusionReceipt(image.occlusion, counts);
  return true;
}
