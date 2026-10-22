// QA-only, read-only geometric admission. It never changes visibility, layers,
// materials, scene geometry, renderer state, the gameplay camera, or RNG.
// Opaque geometry only; sampled rays cannot certify every pixel. Original PNG
// visual review remains required, including transparent/shader-only occlusion.
export function inspectWiperSceneOcclusion(THREE, scene, meshes, camera) {
  // Constructor-free shadows use canonical Three methods, never object query
  // overrides. Lazy bounds belong only to these disposable CPU query objects.
  // Typed arrays, posed matrices, materials and skeleton data remain read-only.
  const shadowAttribute = attribute => {
    if (!attribute) return attribute;
    if (attribute.isGLBufferAttribute) throw Error('GPU-only occlusion geometry is unsupported');
    if (attribute.isFloat16BufferAttribute && !THREE.Float16BufferAttribute) throw Error('Float16 occlusion query type is unavailable');
    const interleaved = attribute.isInterleavedBufferAttribute;
    const array = interleaved ? attribute.data?.array : attribute.array;
    if (!ArrayBuffer.isView(array)) throw Error('Missing CPU occlusion attribute');
    const prototype = interleaved ? THREE.InterleavedBufferAttribute.prototype
      : attribute.isFloat16BufferAttribute ? THREE.Float16BufferAttribute.prototype : THREE.BufferAttribute.prototype;
    const shadow = Object.create(prototype);
    Object.assign(shadow, {itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized});
    if (interleaved) Object.assign(shadow, {isInterleavedBufferAttribute: true, offset: attribute.offset,
      data: {array, stride: attribute.data.stride}});
    else Object.assign(shadow, {isBufferAttribute: true, array});
    return shadow;
  };
  const shadowGeometry = geometry => {
    if (!geometry?.isBufferGeometry) throw Error('Unsupported occlusion geometry');
    const shadow = Object.create(THREE.BufferGeometry.prototype);
    Object.assign(shadow, {isBufferGeometry: true, attributes: {}, morphAttributes: {},
      index: shadowAttribute(geometry.index), morphTargetsRelative: geometry.morphTargetsRelative,
      groups: geometry.groups.map(group => ({...group})), drawRange: {...geometry.drawRange},
      boundingSphere: geometry.boundingSphere ? new THREE.Sphere().copy(geometry.boundingSphere) : null,
      boundingBox: geometry.boundingBox ? new THREE.Box3().copy(geometry.boundingBox) : null});
    for (const [key, attribute] of Object.entries(geometry.attributes)) shadow.attributes[key] = shadowAttribute(attribute);
    for (const [key, attributes] of Object.entries(geometry.morphAttributes)) shadow.morphAttributes[key] = attributes.map(shadowAttribute);
    return shadow;
  };
  const geometryShadows = new Map();
  const shadowMesh = object => {
    if (object.isBatchedMesh) throw Error('Batched opaque occluder requires dedicated query support');
    const prototype = object.isSkinnedMesh ? THREE.SkinnedMesh.prototype
      : object.isInstancedMesh ? THREE.InstancedMesh.prototype : THREE.Mesh.prototype;
    const shadow = Object.create(prototype);
    if (!geometryShadows.has(object.geometry)) geometryShadows.set(object.geometry, shadowGeometry(object.geometry));
    Object.assign(shadow, {isMesh: true, id: object.id, name: object.name, type: object.type,
      geometry: geometryShadows.get(object.geometry), material: object.material,
      matrixWorld: object.matrixWorld, morphTargetInfluences: object.morphTargetInfluences,
      layers: {mask: object.layers.mask, test(other) { return (this.mask & other.mask) !== 0; }}, children: []});
    if (object.isInstancedMesh || object.isSkinnedMesh) Object.assign(shadow, {
      boundingSphere: object.boundingSphere ? new THREE.Sphere().copy(object.boundingSphere) : null,
      boundingBox: object.boundingBox ? new THREE.Box3().copy(object.boundingBox) : null});
    if (object.isInstancedMesh) Object.assign(shadow, {isInstancedMesh: true, count: object.count,
      instanceMatrix: shadowAttribute(object.instanceMatrix)});
    if (object.isSkinnedMesh) Object.assign(shadow, {isSkinnedMesh: true,
      bindMatrix: object.bindMatrix, bindMatrixInverse: object.bindMatrixInverse, skeleton: object.skeleton});
    return shadow;
  };
  const related = new Set(meshes), blockers = [], pending = [scene];
  let transparentMeshes = 0;
  while (pending.length) {
    const object = pending.pop();
    if (object.visible === false) continue;
    pending.push(...object.children);
    if (!object.isMesh || related.has(object) || !(camera.layers.mask & object.layers.mask)) continue;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(m => m && m.visible !== false && m.opacity !== 0 && !m.transparent)) blockers.push(shadowMesh(object));
    else transparentMeshes++;
  }
  const ray = new THREE.Raycaster(), matrix = new THREE.Matrix4();
  const point = new THREE.Vector3(), direction = new THREE.Vector3();
  const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const rows = [], blocked = [];
  for (const mesh of meshes.slice(0, 2)) {
    if (!mesh || !Number.isInteger(mesh.count) || mesh.count < 0) throw Error('Invalid occlusion target');
    const position = shadowAttribute(mesh.geometry?.attributes?.position), index = shadowAttribute(mesh.geometry?.index);
    if (mesh.count && (!position || position.count < 3)) throw Error('Missing occlusion vertices');
    const triangles = Math.floor((index ? index.count : position?.count ?? 0) / 3);
    if (mesh.count && triangles < 12) throw Error('Insufficient occlusion triangle samples');
    let samples = 0;
    for (let instance = 0; instance < mesh.count; instance++) {
      matrix.fromArray(mesh.instanceMatrix.array, instance * 16); matrix.premultiply(mesh.matrixWorld);
      // Twelve fixed, evenly spaced triangle centroids per instance. These are
      // points on the actual mesh, not an independently fitted proxy or crop.
      for (let sample = 0; sample < 12; sample++) {
        const triangle = Math.floor(sample * triangles / 12); point.set(0, 0, 0);
        for (let corner = 0; corner < 3; corner++) {
          const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
          point.add(direction.fromBufferAttribute(position, vertex));
        }
        point.multiplyScalar(1 / 3).applyMatrix4(matrix);
        direction.subVectors(point, origin); const distance = direction.length();
        if (!Number.isFinite(distance) || distance <= .001) throw Error('Invalid occlusion ray');
        ray.set(origin, direction.multiplyScalar(1 / distance)); ray.near = 0; ray.far = distance - .001;
        const hit = ray.intersectObjects(blockers, false).find(hit => {
          const m = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
          return m && m.visible !== false && m.opacity !== 0 && !m.transparent;
        });
        samples++;
        if (hit) blocked.push({mesh: rows.length, instance, sample, distance: hit.distance,
          object: hit.object.name || hit.object.type, objectId: hit.object.id});
      }
    }
    rows.push({instances: mesh.count, samples});
  }
  return {schema: 1, method: 'opaque-scene-triangle-rays-v1', samplesPerInstance: 12,
    consideredMeshes: blockers.length, transparentMeshes, meshes: rows, blocked,
    scope: 'Sampled opaque-scene occlusion only; original full PNG visual review required'};
}

export function assertWiperOcclusionReceipt(receipt, counts) {
  if (!receipt || receipt.schema !== 1 || receipt.method !== 'opaque-scene-triangle-rays-v1'
      || receipt.samplesPerInstance !== 12 || !Number.isInteger(receipt.consideredMeshes)
      || receipt.consideredMeshes <= 0 || !Number.isInteger(receipt.transparentMeshes)
      || receipt.transparentMeshes < 0 || !Array.isArray(receipt.blocked) || receipt.blocked.length
      || !Array.isArray(receipt.meshes) || receipt.meshes.length !== 2) throw Error('Opaque scene occlusion admission failed');
  for (const [i, name] of ['slashH', 'slashV'].entries()) {
    const count = counts?.[name], row = receipt.meshes[i];
    if (!Number.isInteger(count) || count < 0 || !row || row.instances !== count
        || row.samples !== count * 12) throw Error('Missing occlusion sample coverage');
  }
  return true;
}
