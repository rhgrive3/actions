// Serialized QA-only observer. Delegates native submissions once; never hides
// objects, changes instance data, advances clocks, or changes render budgets.
export function installHissenCaptureObserver(engine, THREE, viewport) {
  if (!engine?.isInkVolumes || typeof engine.begin !== 'function' || typeof engine.submitComposite !== 'function')
    throw Error('Hissen observation requires the native volume owner');
  const originalBegin = engine.begin, originalSubmit = engine.submitComposite;
  const descriptors = Object.fromEntries(['begin', 'submitComposite'].map(key => [key, Object.getOwnPropertyDescriptor(engine, key)]));
  for (const descriptor of Object.values(descriptors)) {
    if ((descriptor && (!Object.hasOwn(descriptor, 'value') || !descriptor.writable)) || (!descriptor && !Object.isExtensible(engine)))
      throw Error('Hissen observation requires replaceable native methods');
  }
  let records = [], restored = false;
  const actorOf = p => p?.catalog?.r?.sourceActor || p?.s3Weapon?.sourceActor;
  function begin(...args) { records = []; return originalBegin.apply(this, args); }
  function submit(source, ...args) {
    const observe = !this.measureOnly && actorOf(source) === 'WeaponSlosherDiffusion';
    const before = observe ? new Map(this.activeBatches.map(batch => [batch, batch.n])) : null;
    const value = originalSubmit.call(this, source, ...args);
    if (observe) for (const batch of this.activeBatches) {
      const first = before.get(batch) || 0;
      for (let slot = first; slot < batch.n; slot++) records.push({ batch, slot,
        source: { wid: source.wid, seed: source.seed, age: source.age,
          unit: source.catalog?.descriptor?.unit ?? null, index: source.catalog?.index ?? null,
          pos: source.pos.toArray(), velocity: source.vel.toArray() } });
    }
    return value;
  }
  const install = (key, value) => Object.defineProperty(engine, key,
    descriptors[key] ? { ...descriptors[key], value } : { value, writable: true, configurable: true, enumerable: true });
  install('begin', begin); install('submitComposite', submit);
  const visible = mesh => {
    for (let node = mesh; node; node = node.parent) if (node.visible === false) return false;
    return true;
  };
  function snapshot(camera) {
    const matrix = new THREE.Matrix4(), world = new THREE.Matrix4(), point = new THREE.Vector3();
    const draws = [];
    for (const { batch, slot, source } of records) for (const [pass, mesh] of [['opaque', batch.mesh], ['fringe', batch.fringe]]) {
      if (!mesh || slot >= mesh.count || !visible(mesh)) continue;
      const geometry = mesh.geometry, positions = geometry.getAttribute('position'), index = geometry.getIndex();
      if (!positions || !index) throw Error('Hissen observed draw has no indexed geometry');
      mesh.getMatrixAt(slot, matrix); world.multiplyMatrices(mesh.matrixWorld, matrix);
      const start = geometry.drawRange.start, count = Math.min(index.count - start, geometry.drawRange.count);
      const used = new Set(), bounds = [Infinity, Infinity, -Infinity, -Infinity];
      let minimumDepth = Infinity, maximumDepth = -Infinity;
      for (let i = start; i < start + count; i++) {
        const vertex = index.getX(i); if (used.has(vertex)) continue; used.add(vertex);
        point.fromBufferAttribute(positions, vertex).applyMatrix4(world).project(camera);
        const x = (point.x + 1) * viewport.width / 2, y = (1 - point.y) * viewport.height / 2;
        if (![x, y, point.z].every(Number.isFinite)) throw Error('Hissen observed projection is non-finite');
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
        minimumDepth = Math.min(minimumDepth, point.z); maximumDepth = Math.max(maximumDepth, point.z);
      }
      if (!used.size) continue;
      draws.push({ source, pass, mesh: mesh.name, slot, instanceMatrix: matrix.toArray(), meshMatrixWorld: mesh.matrixWorld.toArray(),
        indexedVertices: used.size, triangles: count / 3, projectedGeometryBounds: bounds,
        projectedDepth: [minimumDepth, maximumDepth],
        boundsKind: 'indexed-geometry envelope, not alpha/depth-tested visible pixel silhouette' });
    }
    return { protocol: 1, mode: 'passive-native-visible-draw-observation', viewport: { ...viewport },
      camera: { matrixWorld: camera.matrixWorld.toArray(), projection: camera.projectionMatrix.toArray(),
        fov: camera.fov, aspect: camera.aspect }, loadedAssets: [...engine.assets.keys()],
      metrics: { ...engine.metrics }, draws };
  }
  return { snapshot, restore() {
    if (!restored) {
      if (engine.begin !== begin || engine.submitComposite !== submit) throw Error('Hissen observer ownership changed before restoration');
      for (const key of ['begin', 'submitComposite']) {
        if (descriptors[key]) Object.defineProperty(engine, key, descriptors[key]);
        else delete engine[key];
      }
      records = []; restored = true;
    }
    return true;
  } };
}
