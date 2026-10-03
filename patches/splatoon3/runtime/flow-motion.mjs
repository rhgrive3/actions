// Nintendo report clip xovjK0Ll8Nz: brief expanding spirals on entry, then
// sparse sharp glints close to the body. All visual constants are calibration;
// actor.s3.flow remains the only gameplay state. Install AFTER weapon-motion
// and the other Character hooks so this layer owns the final uGlow assignment.
export const FLOW_MOTION_CALIBRATION = Object.freeze({
  entryTime: .65, extensionTime: .35, attackTime: .10, expiryTime: .24,
  glints: 18, ribbonSegments: 24, ribbonCount: 3, shellWidth: .012,
  status: 'visible calibration; original particle curves and expiry unmeasured',
});
const INSTALL = Symbol.for('inkwave.s3.flow-motion.install.v1');
const states = new WeakMap(), disposed = new WeakSet();
const TAU = Math.PI * 2, EPS = 1e-10;
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

function makeState(ch, THREE) {
  let s = states.get(ch);
  if (s) return s;
  s = { active: false, phase: 'off', age: 0, time: 0, level: 0, fadeStart: 0,
    remaining: 0, event: null, eventAge: 0, activationCount: 0, extensionCount: 0,
    expiryCount: 0, resources: null, owner: null, seed: ((ch.seed || 0) % 997) / 997,
    anchors: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    bones: [ch.bones.hips, ch.bones.spine, ch.bones.head],
    matrix: new THREE.Matrix4(), rotation: new THREE.Quaternion(),
    scale: new THREE.Vector3(), point: new THREE.Vector3() };
  states.set(ch, s); return s;
}

const shellVertex = `
  #include <common>
  #include <skinning_pars_vertex>
  uniform float uWidth;
  varying vec3 vFlowNormal;
  varying vec3 vFlowView;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    transformed += normalize(objectNormal) * uWidth;
    #include <project_vertex>
    vFlowNormal = normalize(transformedNormal);
    vFlowView = -mvPosition.xyz;
  }`;
const shellFragment = `
  uniform vec3 uColor;
  uniform float uLevel;
  varying vec3 vFlowNormal;
  varying vec3 vFlowView;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vFlowNormal), normalize(vFlowView))), 2.0);
    gl_FragColor = vec4(uColor, rim * uLevel * .28);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const glintVertex = `
  attribute float aFlowAlpha;
  varying vec2 vFlowUv;
  varying float vFlowAlpha;
  void main() {
    mat4 modelViewInstance = modelViewMatrix * instanceMatrix;
    vec4 center = modelViewInstance * vec4(0.0, 0.0, 0.0, 1.0);
    float size = length(modelViewInstance[0].xyz);
    center.xy += position.xy * size;
    gl_Position = projectionMatrix * center;
    vFlowUv = uv;
    vFlowAlpha = aFlowAlpha;
  }`;
const glintFragment = `
  uniform vec3 uColor;
  varying vec2 vFlowUv;
  varying float vFlowAlpha;
  void main() {
    vec2 p = (vFlowUv - .5) * 2.0;
    float h = pow(max(0.0, 1.0 - abs(p.y) / .09), 2.0) * max(0.0, 1.0 - abs(p.x));
    float v = pow(max(0.0, 1.0 - abs(p.x) / .09), 2.0) * max(0.0, 1.0 - abs(p.y));
    float core = exp(-dot(p, p) * 23.0);
    float alpha = max(h, v) + core * .55;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * .9), alpha * vFlowAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const ribbonVertex = `
  varying vec2 vFlowUv;
  void main() {
    vFlowUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const ribbonFragment = `
  uniform vec3 uColor;
  uniform float uLevel;
  varying vec2 vFlowUv;
  void main() {
    float taper = pow(sin(vFlowUv.x * 3.14159265), .7);
    float edge = 1.0 - abs(vFlowUv.y * 2.0 - 1.0);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), edge * .35), uLevel * taper * edge * .65);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function material(THREE, ch, vertexShader, fragmentShader, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader,
    uniforms: { uColor: { value: ch.color.clone().multiplyScalar(1.45) },
      uLevel: { value: 0 }, ...extra }, transparent: true, depthWrite: false,
    depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false });
}
function shellMaterial(ch, source, THREE) {
  // Ask the real source material for its vertex deformation (facial skin,
  // hair geometry normals, squid tentacle wave). Keep only its vertex shader,
  // never duplicate its private parameter math or its lighting fragment.
  const vertex = { vertexShader: shellVertex, fragmentShader: '', uniforms: {} };
  source.onBeforeCompile(vertex);
  const m = material(THREE, ch, vertex.vertexShader, shellFragment,
    { ...vertex.uniforms, uWidth: { value: FLOW_MOTION_CALIBRATION.shellWidth } });
  m.vertexColors = source.vertexColors; m.side = THREE.BackSide;
  return m;
}
// Follow the native projectile ribbon gate: custom transparent vertices must
// not become opaque occluders when GTAO replaces their material with normals.
const beautyRanges = new WeakMap(), borrowedGeometry = new WeakSet();
function overrideGate(_renderer, scene, _camera, geometry) {
  geometry.drawRange.count = scene.overrideMaterial ? 0 : beautyRanges.get(geometry);
}
function gate(mesh) {
  beautyRanges.set(mesh.geometry, mesh.geometry.drawRange.count);
  mesh.onBeforeRender = overrideGate; return mesh;
}
function geometryView(source, THREE) {
  // Independent drawRange/VAO identity, actual source vertex/index attributes.
  // Never change a native geometry or duplicate its skinning/vertex buffers.
  const view = new THREE.BufferGeometry();
  view.index = source.index; view.attributes = { ...source.attributes };
  view.morphAttributes = { ...source.morphAttributes };
  view.morphTargetsRelative = source.morphTargetsRelative;
  view.groups = source.groups.map(group => ({ ...group }));
  view.drawRange = { ...source.drawRange };
  view.boundingBox = source.boundingBox?.clone() ?? null;
  view.boundingSphere = source.boundingSphere?.clone() ?? null;
  borrowedGeometry.add(view); return view;
}
function disposeGeometry(geometry) {
  if (borrowedGeometry.has(geometry)) {
    // WebGLGeometries removes index/attribute GPU buffers on dispose. Detach
    // these borrowed references first, so only this view's VAOs are released.
    geometry.index = null; geometry.attributes = {}; geometry.morphAttributes = {};
  }
  geometry.dispose();
}
function retireShell(r, shell) {
  shell.removeFromParent();
  const i = r.ownedGeometries.indexOf(shell.geometry);
  if (i >= 0) { r.ownedGeometries.splice(i, 1); disposeGeometry(shell.geometry); }
}
function makeResources(ch, s, THREE) {
  const group = new THREE.Group(); group.name = 's3-flow-exterior';
  group.visible = false; ch.root.add(group);
  const glintGeo = new THREE.PlaneGeometry(1, 1);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(FLOW_MOTION_CALIBRATION.glints), 1);
  alpha.setUsage(THREE.DynamicDrawUsage); glintGeo.setAttribute('aFlowAlpha', alpha);
  const glintMat = material(THREE, ch, glintVertex, glintFragment);
  const glints = gate(new THREE.InstancedMesh(glintGeo, glintMat, FLOW_MOTION_CALIBRATION.glints));
  glints.name = 's3-flow-glints'; glints.frustumCulled = false; glints.renderOrder = 6;
  glints.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(glints);

  // An open tapered helix, not a persistent torus around the feet.
  const n = FLOW_MOTION_CALIBRATION.ribbonSegments;
  const position = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), index = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, angle = t * TAU * .73, r = 1 + .05 * Math.sin(t * TAU);
    for (let side = 0; side < 2; side++) {
      const k = i * 6 + side * 3;
      position[k] = Math.cos(angle) * r; position[k + 1] = t - .5 + (side - .5) * .10;
      position[k + 2] = Math.sin(angle) * r;
      uv[i * 4 + side * 2] = t; uv[i * 4 + side * 2 + 1] = side;
    }
    if (i < n) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); ribbonGeo.setIndex(index);
  const ribbonMat = material(THREE, ch, ribbonVertex, ribbonFragment); ribbonMat.side = THREE.DoubleSide;
  const ribbons = Array.from({ length: FLOW_MOTION_CALIBRATION.ribbonCount }, (_, i) => {
    const mesh = gate(new THREE.Mesh(ribbonGeo, ribbonMat)); mesh.name = `s3-flow-entry-spiral:${i}`;
    mesh.frustumCulled = false; mesh.renderOrder = 5; group.add(mesh); return mesh;
  });
  const shellMat = shellMaterial(ch, ch.mats.squid, THREE);
  const squidView = geometryView(ch.squid.body.geometry, THREE);
  const squidShell = gate(new THREE.Mesh(squidView, shellMat));
  squidShell.name = 's3-flow-squid-edge'; squidShell.frustumCulled = false; squidShell.renderOrder = 4;
  squidShell.visible = false; ch.squid.body.parent.add(squidShell);
  const r = { group, glints, alpha, glintGeo, glintMat, ribbonGeo, ribbonMat,
    ribbons, shellMat, squidShell, kidShells: new Map(), kidSources: new Map(),
    shellMaterials: new Map([['squid', shellMat]]), ownedGeometries: [glintGeo, ribbonGeo, squidView], squidSource: ch.squid.body.geometry,
    ownedMaterials: [glintMat, ribbonMat, shellMat] };
  s.resources = r; return r;
}
function syncShell(ch, s, r, THREE, shown) {
  // Reuse each actual indexed/skinned mesh and its skeleton. No copied rig,
  // AABB proxy or assets. LOD caches are bounded by the Character's three tiers.
  const lod = ch.lod, tier = lod.to >= 0 && lod.f >= .5 ? lod.to : lod.tier;
  const source = ch.lodSets?.[tier];
  if (shown && ch.kid.visible && source && r.kidSources.get(tier) !== source) {
    // Native quality changes rebuild the source tier objects. Retire stale
    // siblings before reconnecting, otherwise old geometry would accumulate.
    for (const { shell } of r.kidShells.get(tier) || []) retireShell(r, shell);
    const shells = [];
    for (const mesh of source.list) {
      if (!['skin', 'cloth', 'hair'].includes(mesh.userData.iwMat)) continue;
      const kind = mesh.userData.iwMat;
      if (!r.shellMaterials.has(kind)) {
        const mat = shellMaterial(ch, ch.mats[kind], THREE);
        mat.uniforms.uLevel = r.shellMat.uniforms.uLevel;
        r.shellMaterials.set(kind, mat); r.ownedMaterials.push(mat);
      }
      const view = geometryView(mesh.geometry, THREE); r.ownedGeometries.push(view);
      const shell = gate(new THREE.SkinnedMesh(view, r.shellMaterials.get(kind)));
      shell.name = 's3-flow-edge:' + mesh.name; shell.bind(mesh.skeleton, mesh.bindMatrix);
      shell.frustumCulled = false; shell.renderOrder = 4; shell.matrixAutoUpdate = false;
      mesh.parent.add(shell); shells.push({ source: mesh, shell });
    }
    r.kidShells.set(tier, shells); r.kidSources.set(tier, source);
  }
  for (const [t, shells] of r.kidShells) for (const { source: mesh, shell } of shells) {
    shell.visible = shown && t === tier && ch.kid.visible && mesh.visible;
    shell.matrix.copy(mesh.matrix); shell.matrixWorldNeedsUpdate = true;
  }
  const sq = ch.squid.body;
  if (r.squidSource !== sq.geometry) {
    const previous = r.squidShell.geometry;
    r.ownedGeometries.splice(r.ownedGeometries.indexOf(previous), 1); disposeGeometry(previous);
    r.squidShell.geometry = geometryView(sq.geometry, THREE); gate(r.squidShell);
    r.ownedGeometries.push(r.squidShell.geometry); r.squidSource = sq.geometry;
  }
  r.squidShell.position.copy(sq.position);
  r.squidShell.quaternion.copy(sq.quaternion); r.squidShell.scale.copy(sq.scale);
  r.squidShell.visible = shown && ch.squidRoot.visible && sq.visible;
}
function anchors(ch, s) {
  if (ch.kidForm) {
    for (let i = 0; i < 3; i++) ch.root.worldToLocal(s.bones[i].getWorldPosition(s.anchors[i]));
  } else {
    ch.root.worldToLocal(ch.squid.pivot.getWorldPosition(s.anchors[0]));
    s.anchors[1].copy(s.anchors[0]); s.anchors[2].copy(s.anchors[0]);
  }
}
function draw(ch, s, THREE) {
  const shown = ch.visible !== false && ch.root.visible && s.level > EPS;
  if (!s.resources && shown) makeResources(ch, s, THREE);
  const r = s.resources; if (!r) return;
  r.group.visible = shown; syncShell(ch, s, r, THREE, shown);
  const color = ch.color;
  for (const m of r.ownedMaterials) m.uniforms.uColor.value.copy(color).multiplyScalar(1.45);
  r.shellMat.uniforms.uLevel.value = s.level;
  if (!shown) return;
  anchors(ch, s);
  const leg = ch.rest.hips.y - ch.rest.footL.y;
  const radius = leg * (ch.kidForm ? .62 : .50);
  const eventDuration = s.event === 'entry' ? FLOW_MOTION_CALIBRATION.entryTime
    : FLOW_MOTION_CALIBRATION.extensionTime;
  const burst = s.event ? Math.max(0, 1 - s.eventAge / eventDuration) : 0;
  for (let i = 0; i < FLOW_MOTION_CALIBRATION.glints; i++) {
    const phase = (s.time * (1.05 + (i % 4) * .08) + i * .61803398875 + s.seed) % 1;
    const angle = TAU * (s.time * .32 + i * .381966 + s.seed);
    const radial = radius * (.36 + (i % 5) * .13 + burst * .6);
    s.point.copy(s.anchors[i % 3]);
    s.point.x += Math.cos(angle) * radial; s.point.z += Math.sin(angle) * radial;
    s.point.y += (phase - .5) * leg * (ch.kidForm ? .75 : .35);
    const duty = .24 + .58 * burst;
    const life = phase < duty ? Math.sin(phase / duty * Math.PI) ** 4 : 0;
    const size = leg * (.14 + .12 * life + .1 * burst);
    s.scale.setScalar(size); s.matrix.compose(s.point, s.rotation, s.scale);
    r.glints.setMatrixAt(i, s.matrix);
    r.alpha.setX(i, s.level * life * (.65 + .35 * burst));
  }
  r.alpha.needsUpdate = true; r.glints.instanceMatrix.needsUpdate = true;
  r.ribbonMat.uniforms.uLevel.value = s.level * burst;
  for (let i = 0; i < r.ribbons.length; i++) {
    const mesh = r.ribbons[i]; mesh.visible = burst > EPS;
    mesh.position.copy(s.anchors[1]);
    mesh.position.y += (i - 1) * leg * .28;
    mesh.rotation.set(.08 * (i - 1), s.eventAge * TAU * 1.1 + i * TAU / 3, .10 * (i - 1));
    const size = radius * (1.1 + (1 - burst) * 1.35) * (s.event === 'extension' ? .72 : 1);
    mesh.scale.set(size, leg * (ch.kidForm ? 1.3 : .65), size);
  }
}
function nativeGlow(ch) {
  return ch.wGlow * (.35 + .45 * (.5 + .5 * Math.sin(ch.t * TAU * 1.6)));
}
function clear(ch) {
  const s = states.get(ch); if (!s) return;
  s.active = false; s.phase = 'off'; s.age = s.time = s.level = s.remaining = 0;
  s.event = null; s.eventAge = 0; s.fadeStart = 0; s.owner = null;
  if (s.resources) {
    s.resources.group.visible = s.resources.squidShell.visible = false;
    for (const shells of s.resources.kidShells.values()) for (const { shell } of shells) shell.visible = false;
    s.resources.shellMat.uniforms.uLevel.value = 0;
  }
  ch.u.uGlow.value.copy(ch.color).multiplyScalar(nativeGlow(ch));
}
function step(ch, dt, THREE) {
  if (disposed.has(ch)) return;
  const actor = ch._owner(), flow = actor?.s3?.flow;
  const enabled = ch.s3FlowMotionEnabled !== false && actor && actor.alive !== false;
  const s = makeState(ch, THREE);
  if (ch.s3FlowMotionEnabled === false) {
    // Counterfactual review renders keep the already-installed material hooks,
    // including their old Flow emission. Opt-out suppresses only this layer.
    const glow = ch.u.uGlow.value, { r, g, b } = glow;
    clear(ch); glow.setRGB(r, g, b); draw(ch, s, THREE); return;
  }
  if (!enabled || s.owner && s.owner !== actor) clear(ch);
  s.owner = enabled ? actor : null;
  const active = !!(enabled && flow?.active);
  if (active && !s.active) {
    s.phase = 'entry'; s.age = s.time = 0; s.event = 'entry'; s.eventAge = 0; s.activationCount++;
  } else if (active && flow.remaining > s.remaining + EPS) {
    s.event = 'extension'; s.eventAge = 0; s.extensionCount++;
  } else if (!active && s.active) {
    s.phase = 'expiry'; s.age = 0; s.fadeStart = s.level; s.event = null; s.expiryCount++;
  }
  s.active = active; s.remaining = active ? flow.remaining : 0;
  if (enabled && (active || s.phase === 'expiry')) {
    s.time += dt; s.age += dt; if (s.event) s.eventAge += dt;
  }
  if (active) {
    s.level = smooth(s.age / FLOW_MOTION_CALIBRATION.attackTime);
    if (s.age >= FLOW_MOTION_CALIBRATION.entryTime) s.phase = 'active';
    const duration = s.event === 'entry' ? FLOW_MOTION_CALIBRATION.entryTime : FLOW_MOTION_CALIBRATION.extensionTime;
    if (s.event && s.eventAge + EPS >= duration) s.event = null;
  } else if (s.phase === 'expiry') {
    s.level = s.fadeStart * (1 - smooth(s.age / FLOW_MOTION_CALIBRATION.expiryTime));
    if (s.level <= EPS) { s.level = 0; s.phase = 'off'; }
  }
  draw(ch, s, THREE);
  // Supersede the old instantaneous Flow glow while preserving special-ready.
  // Do not write wGlow, special fractions, runner clocks or any flow gameplay.
  const glow = .40 + .15 * Math.sin(s.time * TAU * 1.6);
  ch.u.uGlow.value.copy(ch.color).multiplyScalar(Math.max(nativeGlow(ch), s.level * glow));
}

export function flowMotionSnapshot(ch) {
  const s = states.get(ch);
  if (!s) return { phase: 'off', active: false, level: 0, opacity: 0, aliveParticles: 0,
    ownedResources: 0, disposed: disposed.has(ch), resources: 0 };
  const r = s.resources;
  return { phase: s.phase, active: s.active, age: s.age, time: s.time, level: s.level,
    event: s.event, eventAge: s.eventAge, remaining: s.remaining,
    activationCount: s.activationCount, extensionCount: s.extensionCount, expiryCount: s.expiryCount,
    visible: !!r?.group.visible, glints: r?.glints.count || 0, opacity: s.level,
    aliveParticles: r?.group.visible ? r.alpha.array.reduce((n, alpha) => n + (alpha > .001 ? 1 : 0), 0) : 0,
    ownedResources: r ? { geometries: r.ownedGeometries.length, materials: r.ownedMaterials.length,
      instancedMeshes: 1, ribbons: r.ribbons.length } : 0,
    shells: r ? [...r.kidShells.values()].reduce((n, shells) => n + shells.length, 1) : 0,
    resources: r ? r.ownedGeometries.length + r.ownedMaterials.length : 0, disposed: false };
}

export function installFlowMotion({ THREE, Character, Actor }) {
  if (!THREE || !Character?.prototype?._owner || !Actor?.prototype?.reset)
    throw Error('Flow motion requires production THREE, Character and Actor');
  const C = Character.prototype, A = Actor.prototype;
  if (Object.prototype.hasOwnProperty.call(C, INSTALL)) return;
  Object.defineProperty(C, INSTALL, { value: true });
  const update = C.update, setVisible = C.setVisible, dispose = C.dispose;
  C.update = function (...args) {
    if (disposed.has(this)) return;
    const result = update.apply(this, args);
    step(this, this._dt, THREE); return result;
  };
  C.setVisible = function (...args) {
    const result = setVisible.apply(this, args), s = states.get(this);
    if (!args[0] && s?.resources) {
      s.resources.group.visible = s.resources.squidShell.visible = false;
      for (const shells of s.resources.kidShells.values()) for (const { shell } of shells) shell.visible = false;
    }
    if (this._owner()?.alive === false) clear(this);
    return result;
  };
  C.dispose = function (...args) {
    if (disposed.has(this)) return;
    disposed.add(this);
    const r = states.get(this)?.resources;
    if (r) {
      r.group.removeFromParent(); r.squidShell.removeFromParent();
      for (const shells of r.kidShells.values()) for (const { shell } of shells) shell.removeFromParent();
      for (const geo of r.ownedGeometries) disposeGeometry(geo);
      for (const mat of r.ownedMaterials) mat.dispose();
      r.glints.dispose();
    }
    states.delete(this); return dispose.apply(this, args);
  };
  const reset = A.reset, splat = A.splat;
  A.reset = function (...args) { const result = reset.apply(this, args); clear(this.character); return result; };
  A.splat = function (...args) { const result = splat.apply(this, args); if (!this.alive) clear(this.character); return result; };
}
