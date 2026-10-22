// Evaluated and rejected static batching trial; never shipped in the game.
import * as THREE from 'three';
const point = new THREE.Vector3(), transformedSphere = new THREE.Sphere();
const margin = box => 2e-6 * (Math.max(box.min.length(), box.max.length()) + 1);
// Keep the old mesh centre for renderer sorting, but use the exact source
// range sphere for culling. This preserves coplanar source-triangle order.
function intersectsRangeFrustum(frustum) {
  transformedSphere.copy(this.geometry.boundingSphere).applyMatrix4(this.matrixWorld);
  return frustum.intersectsSphere(transformedSphere);
}

// At most four contiguous triangle ranges, sharing the original attributes
// and index (including gl_VertexID). No triangle is reordered or duplicated.
// Leave small/transparent/poorly clustered buckets as their original one draw.
export function createStaticDrawBatches(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  const total = geometry.index?.count ?? geometry.attributes.position.count;
  if (material.transparent || geometry.groups.length || total < 3072) return mesh;
  geometry.computeBoundingSphere();
  const ranges = [], p = geometry.attributes.position, ix = geometry.index;
  for (let k = 0; k < 4; k++) {
    const start = Math.floor(total / 3 * k / 4) * 3, end = Math.floor(total / 3 * (k + 1) / 4) * 3;
    const box = new THREE.Box3();
    for (let i = start; i < end; i++) box.expandByPoint(point.fromBufferAttribute(p, ix ? ix.getX(i) : i));
    box.expandByScalar(margin(box));
    ranges.push({ start, count: end - start, box, sphere: box.getBoundingSphere(new THREE.Sphere()) });
  }
  // Spend extra draw submissions only on demonstrably tighter spatial runs.
  if (ranges.reduce((sum, range) => sum + range.sphere.radius, 0) >= geometry.boundingSphere.radius * 3.2) return mesh;
  const root = new THREE.Group();
  // Existing ownership, stats and material consumers keep the source handle.
  // Groups do not render it; child views alone submit its disjoint ranges.
  root.geometry = geometry; root.material = material;
  for (const range of ranges) {
    const view = new THREE.BufferGeometry();
    for (const [key, attribute] of Object.entries(geometry.attributes)) view.setAttribute(key, attribute);
    view.setIndex(geometry.index); view.setDrawRange(range.start, range.count);
    view.boundingBox = range.box; view.boundingSphere = range.sphere;
    const child = new THREE.Mesh(view, material);
    child.boundingSphere = geometry.boundingSphere;
    child.intersectsFrustum = intersectsRangeFrustum;
    child.matrixAutoUpdate = false;
    root.add(child);
  }
  // PropKit assigns shadow/name/order flags after this factory returns. Use
  // inherited accessors to apply them to the same four draw objects.
  for (const key of ['castShadow', 'receiveShadow', 'renderOrder', 'name']) {
    let value = root[key];
    Object.defineProperty(root, key, { configurable: true, enumerable: true,
      get: () => value, set(next) { value = next; for (const child of this.children) child[key] = next; } });
  }
  return root;
}

export function adaptStaticDrawCounterfactual(code) {
  for (const [from, to] of [
    ['this.terrain = new THREE.Mesh(mergeGeometries(terrainParts), terrainMat);', 'this.terrain = createStaticDrawBatches(mergeGeometries(terrainParts), terrainMat);'],
    ['this.staticScenery = new THREE.Mesh(mergeGeometries(staticParts), shoreMat);', 'this.staticScenery = createStaticDrawBatches(mergeGeometries(staticParts), shoreMat);'],
    ['this.city = new THREE.Mesh(geo, mat);', 'this.city = createStaticDrawBatches(geo, mat);'],
  ]) {
    if (code.split(from).length !== 2) throw Error('Static batching counterfactual source anchor drift');
    code = code.replace(from, to);
  }
  return code;
}
