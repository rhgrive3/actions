// Controlled, instrumented QA only. Never imported by production composition.
// Buffer events are actual delegated WebGL calls. The ArrayBuffer relation is
// deliberately NOT a claim that a geometry exclusively owns a GPU allocation.
export function installExplosherGeometryLifetime(env = globalThis) {
  const limits = { geometries: 1024, buffers: 8192, events: 128, stacks: 48, snapshots: 8, nodes: 30000, links: 64 };
  const geometries = new Map(), buffers = new Map(), stacks = new Map();
  const geometryObjects = new WeakMap(), bufferObjects = new WeakMap(), arrays = new WeakMap(), contexts = new WeakMap();
  const patches = [], events = [], snapshots = [];
  const counts = { registrations: 0, bufferData: 0, bufferSubData: 0, deleteBuffer: 0, vertexArrayBind: 0, unmappedBufferCalls: 0, geometryDispose: 0, observerErrors: 0 };
  const dropped = { geometries: 0, buffers: 0, events: 0, stacks: 0, snapshots: 0, nodes: 0, links: 0 };
  const coverage = { webglPrototypes: 0, geometryMethodOwners: 0, geometryAttachment: 'late-existing-object-only', preConstructionCoverage: false,
    weakReferences: typeof WeakRef === 'function', wrapperConflicts: 0, extensionVAOBindingsObserved: false };
  let stopped = false, sequence = 0, contextId = 0, bufferId = 0, cleanup = null;
  const attempt = fn => { try { return fn(); } catch { counts.observerErrors++; } };
  const event = (kind, fields = {}) => {
    const row = { sequence: ++sequence, kind, ...fields };
    if (events.length === limits.events) { events.shift(); dropped.events++; }
    events.push(row); return row.sequence;
  };
  const stack = () => {
    const value = String(new Error().stack || '').split('\n').slice(3, 11).join('\n')
      .replace(/https?:\/\/[^/\s)]+/g, '<origin>').replace(/\/_versions\/[^/]+\//g, '/').slice(0, 900);
    if (stacks.has(value)) return stacks.get(value);
    if (stacks.size >= limits.stacks) { dropped.stacks++; return null; }
    const id = stacks.size + 1; stacks.set(value, id); return id;
  };
  const relate = (g, b) => {
    if (!g.bufferIds.includes(b.id)) {
      if (g.bufferIds.length < limits.links) g.bufferIds.push(b.id); else dropped.links++;
    }
    if (!b.geometryIds.includes(g.id)) {
      if (b.geometryIds.length < limits.links) b.geometryIds.push(g.id); else dropped.links++;
    }
  };
  const arrayRecord = value => {
    if (!value || typeof value !== 'object') return null;
    const a = ArrayBuffer.isView(value) ? value.buffer : value;
    if (!(a instanceof ArrayBuffer) && !(typeof SharedArrayBuffer === 'function' && a instanceof SharedArrayBuffer)) return null;
    let record = arrays.get(a);
    if (!record) { record = { geometryIds: new Set(), bufferIds: new Set() }; arrays.set(a, record); }
    return record;
  };
  const register = (geometry, source) => {
    if (stopped || !geometry || !Number.isSafeInteger(geometry.id) || geometry.id < 0) return null;
    attachGeometry(geometry);
    let row = geometryObjects.get(geometry);
    if (!row) {
      if (geometries.size >= limits.geometries) { dropped.geometries++; return null; }
      row = { id: geometry.id, firstObservation: source, firstObservationStack: stack(), bufferIds: [], disposed: false,
        firstSequence: event('geometry-observed', { id: geometry.id }), disposeSequence: null };
      if (coverage.weakReferences) {
        row.reference = new WeakRef(geometry);
        row.listener = function () {
          if (stopped) return;
          attempt(() => { counts.geometryDispose++; row.disposed = true; row.disposeSequence = event('geometry-dispose', { id: row.id }); });
        };
        geometry.addEventListener('dispose', row.listener);
      }
      geometryObjects.set(geometry, row); geometries.set(row.id, row); counts.registrations++;
    }
    for (const attribute of [...Object.values(geometry.attributes || {}), geometry.index]) {
      const record = arrayRecord(attribute?.isInterleavedBufferAttribute ? attribute.data?.array : attribute?.array);
      if (!record) continue;
      if (record.geometryIds.size < limits.links) record.geometryIds.add(row.id); else dropped.links++;
      for (const id of record.bufferIds) { const b = buffers.get(id); if (b) relate(row, b); }
    }
    return row;
  };
  const context = gl => {
    let row = contexts.get(gl);
    if (!row) {
      row = { id: ++contextId, canvas: gl.canvas?.id === 'game-canvas' ? 'game-canvas' : 'other-or-unidentified-canvas', bound: new Map() };
      contexts.set(gl, row);
    }
    return row;
  };
  const buffer = (object, gl) => {
    if (!object || typeof object !== 'object') return null;
    let row = bufferObjects.get(object);
    if (!row) {
      if (buffers.size >= limits.buffers) { dropped.buffers++; return null; }
      const c = context(gl);
      row = { id: ++bufferId, context: c.id, canvas: c.canvas, geometryIds: [], dataCalls: 0, subDataCalls: 0,
        deleted: false, firstUploadStack: null, lastInputByteLength: null, deleteSequence: null };
      bufferObjects.set(object, row); buffers.set(row.id, row);
    }
    return row;
  };
  const patch = (prototype, name, observe) => {
    let owner = prototype;
    while (owner && !Object.hasOwn(owner, name)) owner = Object.getPrototypeOf(owner);
    if (!owner || patches.some(p => p.owner === owner && p.name === name)) return;
    const descriptor = Object.getOwnPropertyDescriptor(owner, name), original = descriptor?.value;
    if (typeof original !== 'function' || (!descriptor.configurable && !descriptor.writable)) return;
    const wrapped = function (...args) {
      // The native call is first, exactly once. Its receiver, arguments, return
      // identity and thrown error are never replaced by observation failures.
      const result = Reflect.apply(original, this, args);
      if (!stopped) attempt(() => observe(this, args));
      return result;
    };
    Object.defineProperty(owner, name, { ...descriptor, value: wrapped });
    patches.push({ owner, name, descriptor, wrapped });
  };
  const attachGeometry = geometry => {
    if (stopped || !geometry || typeof geometry !== 'object') return;
    const proto = Object.getPrototypeOf(geometry);
    if (!proto) return;
    // Discover the actual application's existing object. Never import a second
    // Three module, assume constructor identity, or add a native startup wait.
    patch(proto, 'setAttribute', object => register(object, 'attribute-assignment'));
    patch(proto, 'setIndex', object => register(object, 'index-assignment'));
    coverage.geometryMethodOwners = patches.filter(p => p.name === 'setAttribute').length;
  };
  for (const Constructor of [env.WebGLRenderingContext, env.WebGL2RenderingContext]) {
    if (!Constructor?.prototype) continue;
    attempt(() => {
      const before = patches.length;
      patch(Constructor.prototype, 'bindBuffer', (gl, args) => {
        // WebGL1's optional VAO extension is not observed. Do not invent an
        // ELEMENT_ARRAY_BUFFER binding when an unobserved extension can own it.
        const coreVAOObserved = patches.some(p => p.name === 'bindVertexArray' && gl.bindVertexArray === p.wrapped);
        if (args[0] === 34963 && !coreVAOObserved) context(gl).bound.delete(args[0]);
        else context(gl).bound.set(args[0], args[1]);
      });
      patch(Constructor.prototype, 'bindVertexArray', (gl) => {
        counts.vertexArrayBind++;
        // Core VAO changes implicitly restore an element binding. Without any
        // GL query, only a subsequent explicit bindBuffer makes it observable.
        context(gl).bound.delete(34963);
      });
      for (const name of ['bufferData', 'bufferSubData']) patch(Constructor.prototype, name, (gl, args) => {
        counts[name]++;
        const row = buffer(context(gl).bound.get(args[0]), gl);
        if (!row) { counts.unmappedBufferCalls++; return; }
        if (name === 'bufferData') row.dataCalls++; else row.subDataCalls++;
        if (row.firstUploadStack === null) row.firstUploadStack = stack();
        const value = args[name === 'bufferData' ? 1 : 2], record = arrayRecord(value);
        row.lastInputByteLength = typeof value === 'number' && Number.isFinite(value) ? value : Number.isFinite(value?.byteLength) ? value.byteLength : null;
        if (record) {
          if (record.bufferIds.size < limits.links) record.bufferIds.add(row.id); else dropped.links++;
          for (const id of record.geometryIds) { const g = geometries.get(id); if (g) relate(g, row); }
        }
        event(name, { id: row.id });
      });
      patch(Constructor.prototype, 'deleteBuffer', (gl, args) => {
        counts.deleteBuffer++;
        const row = bufferObjects.get(args[0]);
        if (row) { row.deleted = true; row.deleteSequence = event('buffer-delete', { id: row.id }); }
      });
      if (patches.length > before) coverage.webglPrototypes++;
    });
  }
  const labels = new Set(['range-entry', 'before-character-reset', 'after-character-reset', 'shot-input', 'native-birth', 'after-draw-probe', 'capture-finally']);
  const api = {
    attachGeometry(geometry) { attempt(() => attachGeometry(geometry)); },
    boundary(label) {
      if (stopped || !labels.has(label)) return;
      attempt(() => {
        const G = env.__G, game = env.__inkwave, roots = { world: G?.scene, showcase: game?.showcase?.scene }, ids = {};
        for (const [name, root] of Object.entries(roots)) {
          const seen = new Set(), queue = root ? [root] : [], found = new Set(); let visited = 0;
          while (queue.length && visited < limits.nodes) {
            const object = queue.pop(); if (!object || seen.has(object)) continue;
            seen.add(object); visited++;
            const row = register(object.geometry, 'scene-census'); if (row) found.add(row.id);
            if (Array.isArray(object.children)) for (const child of object.children) queue.push(child);
          }
          if (queue.length) dropped.nodes++;
          ids[name] = [...found].sort((a, b) => a - b);
        }
        const renderer = G?.renderer || game?.R?.renderer, memory = renderer?.info?.memory;
        const row = { label, sequence, nativeMemory: { geometries: Number.isFinite(memory?.geometries) ? memory.geometries : null,
          textures: Number.isFinite(memory?.textures) ? memory.textures : null }, sceneGeometryIds: ids,
          observedGeometryCount: geometries.size, relatedLiveBufferCount: [...buffers.values()].filter(b => !b.deleted && b.geometryIds.length).length };
        const old = snapshots.findIndex(s => s.label === label);
        if (old >= 0) snapshots.splice(old, 1);
        if (snapshots.length < limits.snapshots) snapshots.push(row); else dropped.snapshots++;
      });
    },
    report() {
      return { schema: 1, kind: 'controlled-instrumented-geometry-lifetime-QA', acceptance: false,
        scope: 'Returned native WebGL buffer calls and geometry attribute-array relationships; no GL error polling, proof of GPU success, exclusive GPU ownership, complete allocation attribution, ordinary-input acceptance or performance evidence.',
        limits: { ...limits }, coverage: { ...coverage }, counts: { ...counts }, dropped: { ...dropped },
        geometries: [...geometries.values()].map(({ reference, listener, ...row }) => ({ ...row, bufferIds: [...row.bufferIds] })),
        buffers: [...buffers.values()].map(row => ({ ...row, geometryIds: [...row.geometryIds] })),
        stacks: [...stacks].map(([text, id]) => ({ id, text })), events: events.map(e => ({ ...e })),
        snapshots: snapshots.map(s => ({ ...s, nativeMemory: { ...s.nativeMemory }, sceneGeometryIds: { world: [...s.sceneGeometryIds.world], showcase: [...s.sceneGeometryIds.showcase] } })), cleanup };
    },
    restore() {
      if (!stopped) {
        stopped = true; let restored = 0, conflicts = 0;
        for (const p of patches.slice().reverse()) attempt(() => {
          if (Object.getOwnPropertyDescriptor(p.owner, p.name)?.value !== p.wrapped) { conflicts++; return; }
          Object.defineProperty(p.owner, p.name, p.descriptor); restored++;
        });
        for (const row of geometries.values()) attempt(() => { row.reference?.deref()?.removeEventListener('dispose', row.listener); });
        coverage.wrapperConflicts = conflicts;
        cleanup = { stopped: true, patchedMethods: patches.length, restoredMethods: restored, conflicts };
      }
      return api.report();
    },
  };
  return api;
}

export function instrumentExplosherGeometryDriver(driver) {
  const once = (a, b) => {
    if (driver.split(a).length !== 2) throw Error('Geometry lifetime diagnostic anchor missing or duplicated: ' + a);
    driver = driver.replace(a, b);
  };
  once('let browser;', 'let browser; let geometryPage;');
  once('const page = await browser.newPage(', 'const page = geometryPage = await browser.newPage(');
  once('  await enterRangeFromMenu(page,base);', `  await page.addInitScript(() => {
    window.__inkwaveExplosherGeometryLifetime = (${installExplosherGeometryLifetime.toString()})();
    // No module import or startup barrier. Geometry method observation starts
    // late from actual existing scene objects and reports that partial coverage.
  });
  await enterRangeFromMenu(page,base);
  await page.evaluate(() => window.__inkwaveExplosherGeometryLifetime?.boundary('range-entry'));`);
  once("      window.resetExplosherRandom('character-reset');", "      window.__inkwaveExplosherGeometryLifetime?.boundary('before-character-reset');\n      window.resetExplosherRandom('character-reset');");
  once('      await resetCaptureCharacter(a);', "      await resetCaptureCharacter(a);\n      window.__inkwaveExplosherGeometryLifetime?.boundary('after-character-reset');");
  once("      window.resetExplosherRandom('shot-input');", "      window.__inkwaveExplosherGeometryLifetime?.boundary('shot-input');\n      window.resetExplosherRandom('shot-input');");
  once("      window.markExplosherRandomBoundary('native-birth');", "      window.markExplosherRandomBoundary('native-birth');\n      window.__inkwaveExplosherGeometryLifetime?.boundary('native-birth');");
  once("          window.markExplosherRandomBoundary('after-draw-probe');", "          window.markExplosherRandomBoundary('after-draw-probe');\n          window.__inkwaveExplosherGeometryLifetime?.boundary('after-draw-probe');");
  once('  await browser?.close();', `  try {
    if (geometryPage && !geometryPage.isClosed()) {
      const diagnostic = await geometryPage.evaluate(() => {
        const observer = window.__inkwaveExplosherGeometryLifetime;
        if (!observer) return {schema:1,acceptance:false,unavailable:'observer-not-installed'};
        observer.boundary('capture-finally');
        try { return observer.restore(); }
        finally { delete window.__inkwaveExplosherGeometryLifetime; }
      });
      fs.writeFileSync(path.join(out,'geometry-lifetime.json'),JSON.stringify(diagnostic,null,2));
    } else fs.writeFileSync(path.join(out,'geometry-lifetime.json'),JSON.stringify({schema:1,acceptance:false,unavailable:'page-closed-before-cleanup'}));
  } catch {
    // The existing capture error remains authoritative. Closing the browser
    // below destroys this isolated realm even when evaluation is unavailable.
    try { fs.writeFileSync(path.join(out,'geometry-lifetime.json'),JSON.stringify({schema:1,acceptance:false,unavailable:'diagnostic-cleanup-unavailable'})); } catch {}
  }
  await browser?.close();`);
  return driver;
}
