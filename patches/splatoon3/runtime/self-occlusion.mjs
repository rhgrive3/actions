// Camera-only local-player visibility. Published Splatoon 3 shader metadata
// includes camera_xlu / dither / overlook options, and gameplay captures show
// self-transparency. They do not establish the original angle or alpha curve.
// The overlap envelope, screen-door pattern and fade constants here are
// INKWAVE visual calibration, not purported original-game numerical data.
export const SELF_OCCLUSION_CALIBRATION = Object.freeze({
  headRadius: .27, torsoRadius: .28, reticleMargin: .06, edgeSoftness: .055,
  downStart: .28, downFull: .62, nearStart: 1.25, nearFull: .60,
  minimumOpacity: .10, fadeOutRate: 28, fadeInRate: 16, guideEdgeInset: 40,
  overlapEpsilon: .001, normalOmitOpacity: .90, normalRestoreOpacity: .96,
  status: 'observed camera transparency; overlap, dither and timing are visual calibration',
});

const INSTALLED = Symbol.for('inkwave.self-occlusion.install.v1');
const GTAO = Symbol.for('inkwave.self-occlusion.gtao.v1');
const STATE = new WeakMap();
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const KEY = '|iwLocalAimFade1';
const UNIFORM = 'uIwLocalAimOpacity';
const DISCARD = `
  if (uIwLocalAimOpacity < 1.0) {
    // One screen-door threshold for every local part: overlapping hair,
    // clothes and weapon layers reveal the same background pixels.
    float iwAimDither = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy) + vec2(19.0, 47.0), vec2(0.06711056, 0.00583715))));
    if (iwAimDither >= uIwLocalAimOpacity) discard;
  }
`;

export function projectedSelfOverlap(x, y, radius, downward, cfg = SELF_OCCLUSION_CALIBRATION) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || !Number.isFinite(downward) || radius <= 0) return 0;
  const edge = radius + cfg.reticleMargin;
  const coverage = 1 - smooth((Math.hypot(x, y) - edge + cfg.edgeSoftness) / (2 * cfg.edgeSoftness));
  return coverage * smooth((downward - cfg.downStart) / (cfg.downFull - cfg.downStart));
}

export function stepSelfOpacity(current, overlap, dt, cfg = SELF_OCCLUSION_CALIBRATION) {
  const amount = clamp(overlap);
  const target = 1 - (amount <= cfg.overlapEpsilon ? 0 : amount) * (1 - cfg.minimumOpacity);
  if (!Number.isFinite(current)) current = 1;
  const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const rate = target < current ? cfg.fadeOutRate : cfg.fadeInRate;
  const next = target + (current - target) * Math.exp(-rate * elapsed);
  return target === 1 && next > .9995 ? 1 : clamp(next);
}

export function selfOcclusionSnapshot(character) {
  const s = STATE.get(character);
  return s ? { opacity: s.opacity, overlap: s.overlap, materials: s.variants.size,
    nodes: s.nodes.size, disposed: s.disposed, active: s.opacity < 1, normalOmitted: s.omitNormal } : null;
}

function clear(s) {
  if (s) {
    s.opacity = 1; s.overlap = 0; s.drawOpacity.value = 1; s.omitNormal = false;
    s.camera = s.rig = s.actor = null; s.frameOpacity = 1; s.frameDt = 0;
  }
}

function localShaderUniforms(source) {
  // WebGLRenderer passes ShaderMaterial.uniforms straight to onBeforeCompile.
  // Keep injected entries local while following existing native uniform objects
  // (including later replacements) so a shared source never gains fade state.
  const local = {};
  return new Proxy(local, {
    get(target, key) { return Object.hasOwn(target, key) ? target[key] : source.uniforms?.[key]; },
    set(target, key, value) { target[key] = value; return true; },
    has(target, key) { return Object.hasOwn(target, key) || key in (source.uniforms || {}); },
    ownKeys(target) { return [...new Set([...Reflect.ownKeys(source.uniforms || {}), ...Reflect.ownKeys(target)])]; },
    getOwnPropertyDescriptor(target, key) {
      return Object.getOwnPropertyDescriptor(target, key) || (Object.hasOwn(source.uniforms || {}, key)
        ? { configurable: true, enumerable: true, writable: true, value: source.uniforms[key] } : undefined);
    },
  });
}

function fadeMaterial(source, s) {
  if (!source?.isMaterial) return source;
  if (s.originals.has(source)) return source;
  let clone = s.variants.get(source);
  if (clone) return clone;
  clone = source.clone();
  // Preserve live native state (team colors, coil/lamp animation, glass alpha,
  // maps, side and LOD flags) without mutating a cached shared source material.
  // Identity, program hooks and disposal listeners belong to this local clone.
  const own = new Set(['id', 'uuid', 'version', '_listeners', 'onBeforeCompile', 'customProgramCacheKey', 'onBeforeRender']);
  for (const key of Object.keys(source)) {
    if (own.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(clone, key);
    if (descriptor && !descriptor.configurable) continue;
    if (key === 'uniforms' && source.isShaderMaterial) {
      Object.defineProperty(clone, key, { enumerable: true, configurable: true, writable: true, value: localShaderUniforms(source) });
    } else if (key === 'side') {
      // WebGLRenderer temporarily assigns BackSide/FrontSide for two-pass
      // transparent materials. Keep those render-local writes off the shared
      // original, then resume following it when the renderer restores its side.
      let temporary, overridden = false;
      Object.defineProperty(clone, key, { enumerable: true, configurable: true,
        get() { return overridden ? temporary : source.side; },
        set(value) { temporary = value; overridden = value !== source.side; } });
    } else Object.defineProperty(clone, key, { enumerable: true, configurable: true,
      get() { return source[key]; }, set(value) { source[key] = value; } });
  }
  let localVersion = clone.version;
  Object.defineProperty(clone, 'version', { configurable: true, enumerable: true,
    get() { return localVersion + source.version; }, set(value) { localVersion = value - source.version; } });
  clone.onBeforeCompile = function (shader, renderer) {
    source.onBeforeCompile.call(source, shader, renderer);
    // Flow asks the original hook for deformation with an empty fragment
    // program. LOD/material delegates can also reach the same hook twice.
    if (!shader.fragmentShader || shader.uniforms[UNIFORM] === s.drawOpacity) return;
    const main = /void\s+main\s*\(\s*(?:void\s*)?\)\s*\{/;
    if (!main.test(shader.fragmentShader)) throw new Error('Self-occlusion requires a fragment main function');
    shader.uniforms[UNIFORM] = s.drawOpacity;
    // Place the declaration immediately before main so RawShaderMaterial
    // version/precision directives, when present, remain at the beginning.
    shader.fragmentShader = shader.fragmentShader.replace(main,
      match => `uniform float ${UNIFORM};\n` + match + DISCARD);
  };
  clone.customProgramCacheKey = function () {
    const key = source.customProgramCacheKey.call(source);
    return key.includes(KEY) ? key : key + KEY;
  };
  clone.onBeforeRender = function (renderer, scene, camera, geometry, object, group) {
    source.onBeforeRender?.call(source, renderer, scene, camera, geometry, object, group);
    // Reflections, portraits and other cameras retain the ordinary model.
    // Shadow passes use their native depth/distance material and never this hook.
    s.drawOpacity.value = camera === s.camera ? s.opacity : 1;
  };
  clone.needsUpdate = true;
  s.variants.set(source, clone); s.originals.set(clone, source);
  const disposed = () => {
    clone.dispose(); source.removeEventListener('dispose', disposed);
    s.variants.delete(source); s.originals.delete(clone); s.disposers.delete(source);
  };
  source.addEventListener('dispose', disposed); s.disposers.set(source, disposed);
  return clone;
}

function originalMaterial(material, s) {
  if (Array.isArray(material)) return s.arrays.get(material) ||
    (material.some(m => s.originals.has(m)) ? material.map(m => s.originals.get(m) || m) : material);
  return s.originals.get(material) || material;
}

function mappedMaterial(source, s) {
  if (!Array.isArray(source)) return fadeMaterial(source, s);
  // Keep array edits live without ever replacing entries in a shared native
  // material array with our local clones. Both replacement and index writes
  // retain their normal behavior; an external owner can also mutate source.
  const index = key => typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key);
  const proxy = new Proxy(source, {
    get(target, key, receiver) { const value = Reflect.get(target, key, receiver); return index(key) ? fadeMaterial(value, s) : value; },
    set(target, key, value) { return Reflect.set(target, key, index(key) ? originalMaterial(value, s) : value); },
  });
  s.arrays.set(proxy, source); return proxy;
}

function watchTree(node, s) {
  if (!node || s.nodes.has(node) || s.disposed) return;
  const info = { descriptor: null, source: null };
  s.nodes.set(node, info);
  if (node.isMesh && node.material) {
    const descriptor = Object.getOwnPropertyDescriptor(node, 'material');
    if (!descriptor || (descriptor.configurable && 'value' in descriptor)) {
      info.descriptor = descriptor;
      info.source = originalMaterial(node.material, s);
      let material = mappedMaterial(info.source, s);
      Object.defineProperty(node, 'material', { configurable: true, enumerable: descriptor?.enumerable ?? true,
        get() { return material; }, set(value) {
          if (value === material) return;
          info.source = originalMaterial(value, s); material = mappedMaterial(info.source, s);
        } });
      info.wrapped = true;
    }
  }
  node.addEventListener?.('childadded', s.added);
  node.addEventListener?.('childremoved', s.removed);
  for (const child of node.children || []) watchTree(child, s);
}

function unwatchTree(node, s) {
  for (const child of node.children || []) unwatchTree(child, s);
  const info = s.nodes.get(node);
  if (!info) return;
  node.removeEventListener?.('childadded', s.added);
  node.removeEventListener?.('childremoved', s.removed);
  if (info.wrapped) Object.defineProperty(node, 'material', info.descriptor
    ? { ...info.descriptor, value: info.source }
    : { configurable: true, enumerable: true, writable: true, value: info.source });
  s.nodes.delete(node);
}

function prepare(character, THREE) {
  let s = STATE.get(character);
  if (s || !character?.isLocal || !character.root) return s;
  s = { character, opacity: 1, overlap: 0, omitNormal: false, camera: null, rig: null, actor: null,
    frameOpacity: 1, frameDt: 0, drawOpacity: { value: 1 }, disposed: false,
    nodes: new Map(), variants: new Map(), originals: new Map(), disposers: new Map(), arrays: new WeakMap(),
    head: new THREE.Vector3(), torso: new THREE.Vector3(), view: new THREE.Vector3(), guide: new THREE.Vector3(),
    forward: new THREE.Vector3(), scale: new THREE.Vector3() };
  s.added = event => watchTree(event.child, s);
  s.removed = event => unwatchTree(event.child, s);
  STATE.set(character, s); watchTree(character.root, s);
  return s;
}

function dispose(s) {
  if (!s || s.disposed) return;
  clear(s); s.disposed = true;
  unwatchTree(s.character.root, s);
  for (const [source, clone] of s.variants) {
    source.removeEventListener('dispose', s.disposers.get(source)); clone.dispose();
  }
  s.variants.clear(); s.originals.clear(); s.disposers.clear();
}

function viewOverlap(s, camera, cfg, guide, G, weaponGuide = false, guideCamera = camera, secondaryGuide = null, cameraCenter = true) {
  const ch = s.character;
  camera.getWorldDirection(s.forward);
  const downward = -s.forward.y;
  ch.getHeadPosition(s.head);
  if (ch.bones?.chest?.getWorldPosition) ch.bones.chest.getWorldPosition(s.torso);
  else { s.torso.copy(s.head); s.torso.y -= .65; }
  ch.root.getWorldScale(s.scale);
  const scale = Math.max(Math.abs(s.scale.x), Math.abs(s.scale.y), Math.abs(s.scale.z));
  s.view.setFromMatrixPosition(camera.matrixWorld);
  const nearDistance = Math.sqrt(Math.min(s.view.distanceToSquared(s.head), s.view.distanceToSquared(s.torso))) / Math.max(scale, 1e-6);
  const near = 1 - smooth((nearDistance - cfg.nearFull) / (cfg.nearStart - cfg.nearFull));
  // Collision-compressed cameras can enter the body while looking up as well.
  // Public shader metadata includes a separate near-alpha control; this
  // distance envelope is our calibration, not a measurement from one image.
  if (downward <= cfg.downStart && !guide && !weaponGuide) return near;
  const e = camera.projectionMatrix.elements, aspect = Math.abs(e[5] / e[0]);
  // Bucket/Blaster's HUD guide falls back to the center if its endpoint is
  // absent or behind the camera. Shooter/Splatling instead clamp to the edge.
  let guideVisible = weaponGuide, guideX = 0, guideY = 0;
  if (guide && Number.isFinite(guide.x) && Number.isFinite(guide.y) && Number.isFinite(guide.z)) {
    s.guide.set(guide.x, guide.y, guide.z).project(guideCamera);
    if (Number.isFinite(s.guide.x) && Number.isFinite(s.guide.y)) {
      if (weaponGuide) {
        // Match HUD._updCrosshair's --gx/--gy path, not projectShotGuide:
        // no viewport clamp and no behind-camera inversion for these families.
        if (s.guide.z < 1) { guideX = s.guide.x * aspect; guideY = s.guide.y; }
      } else {
        // Mirror the existing Shooter/Splatling projectShotGuide projection,
        // including its behind-camera inversion and 40 CSS-pixel inset.
        const width = globalThis.innerWidth || G.post?._w || 1280;
        const height = globalThis.innerHeight || G.post?._h || 720;
        const sign = s.guide.z > 1 ? -1 : 1;
        const maxX = 1 - 2 * cfg.guideEdgeInset / width, maxY = 1 - 2 * cfg.guideEdgeInset / height;
        guideX = Math.min(maxX, Math.max(-maxX, s.guide.x * sign)) * aspect;
        guideY = Math.min(maxY, Math.max(-maxY, s.guide.y * sign));
        guideVisible = true;
      }
    }
  }
  // Blasters expose two independently visible marks: the unobstructed aim
  // endpoint and the first world contact. Project both using the HUD camera;
  // neither point is mutated and no separate prediction/scene query is made.
  let secondX = 0, secondY = 0;
  const secondVisible = !!secondaryGuide;
  if (secondVisible && Number.isFinite(secondaryGuide.x) && Number.isFinite(secondaryGuide.y) && Number.isFinite(secondaryGuide.z)) {
    s.guide.set(secondaryGuide.x, secondaryGuide.y, secondaryGuide.z).project(guideCamera);
    if (s.guide.z < 1 && Number.isFinite(s.guide.x) && Number.isFinite(s.guide.y)) {
      secondX = s.guide.x * aspect; secondY = s.guide.y;
    }
  }
  let overlap = near;
  for (let index = 0; index < 2; index++) {
    const center = index ? s.torso : s.head;
    const radius = (index ? cfg.torsoRadius : cfg.headRadius) * scale;
    s.view.copy(center).applyMatrix4(camera.matrixWorldInverse);
    const depth = -s.view.z;
    if (depth <= 0) {
      if (s.view.lengthSq() < radius * radius) overlap = 1;
      continue;
    }
    // Height-normalized screen coordinates preserve the same overlap envelope
    // across FOV, aspect, device pixel ratio and dynamic resolution changes.
    s.view.copy(center).project(camera);
    const screenX = s.view.x * aspect, screenY = s.view.y;
    const screenRadius = radius * Math.abs(e[5]) / Math.max(camera.near, depth);
    if (cameraCenter) overlap = Math.max(overlap, projectedSelfOverlap(screenX, screenY, screenRadius, downward, cfg));
    // The world-space impact guide can cross the player during a jump even
    // with a level/upward camera. Its actual visible overlap is sufficient;
    // only the fixed camera-center envelope uses the downward-angle gate.
    if (guideVisible) overlap = Math.max(overlap,
      projectedSelfOverlap(screenX - guideX, screenY - guideY, screenRadius, cfg.downFull, cfg));
    if (secondVisible) overlap = Math.max(overlap,
      projectedSelfOverlap(screenX - secondX, screenY - secondY, screenRadius, cfg.downFull, cfg));
  }
  return overlap;
}

function protectNormalPass(gtao, currentState) {
  if (!gtao || gtao[GTAO] || typeof gtao._renderOverride !== 'function') return;
  Object.defineProperty(gtao, GTAO, { value: true });
  const renderOverride = gtao._renderOverride;
  gtao._renderOverride = function (renderer, material) {
    const s = currentState(), root = s?.character.root;
    if (!s || s.disposed || !s.omitNormal || this.camera !== s.camera ||
        material !== this.normalMaterial || !root?.visible) return renderOverride.apply(this, arguments);
    // GTAO's override shader cannot see the character's screen-door holes.
    // Omit this camera-only ghost from its normal buffer, otherwise it leaves
    // a solid dark silhouette. Preserve the independently rendered shadows.
    const visible = root.visible, shadow = renderer.shadowMap;
    const autoUpdate = shadow?.autoUpdate, needsUpdate = shadow?.needsUpdate;
    root.visible = false;
    if (shadow) { shadow.autoUpdate = false; shadow.needsUpdate = false; }
    try { return renderOverride.apply(this, arguments); }
    finally {
      root.visible = visible;
      if (shadow) { shadow.autoUpdate = autoUpdate; shadow.needsUpdate = needsUpdate; }
    }
  };
}

export function installSelfOcclusion({ THREE, Character, CameraRig, PlayerController, G }) {
  if (!THREE || !Character || !CameraRig || !G) throw new Error('Self-occlusion requires the native character and camera');
  const C = Character.prototype, R = CameraRig.prototype;
  if (Object.hasOwn(C, INSTALLED)) return;
  Object.defineProperty(C, INSTALLED, { value: true });
  let current = null;
  const currentState = () => current;
  const refresh = (s, guide, weaponGuide = false, guideCamera = s.camera, secondaryGuide = null, cameraCenter = true) => {
    s.overlap = viewOverlap(s, s.camera, SELF_OCCLUSION_CALIBRATION, guide, G, weaponGuide, guideCamera, secondaryGuide, cameraCenter);
    s.opacity = stepSelfOpacity(s.frameOpacity, s.overlap, s.frameDt);
    // Retain normals at the almost-opaque edge. Removing them for numerical
    // noise (e.g. opacity .9999) made AO pop before a visible fade began.
    // Hysteresis also avoids switching the normal pass on every boundary frame.
    s.omitNormal = s.opacity < (s.omitNormal ? SELF_OCCLUSION_CALIBRATION.normalRestoreOpacity
      : SELF_OCCLUSION_CALIBRATION.normalOmitOpacity);
  };
  const warm = C.warmAll, update = C.update, visible = C.setVisible, destroy = C.dispose;
  C.warmAll = function (...args) { prepare(this, THREE); return warm.apply(this, args); };
  Object.defineProperty(C.warmAll, Symbol.for('inkwave.characterWarmParent'), { value: warm });
  C.update = function (dt, input) { if (this.isLocal) prepare(this, THREE); return update.call(this, dt, input); };
  C.setVisible = function (value) { if (!value) clear(STATE.get(this)); return visible.call(this, value); };
  C.dispose = function (...args) {
    const s = STATE.get(this); dispose(s); if (current === s) current = null;
    return destroy.apply(this, args);
  };
  const cameraUpdate = R.update;
  R.update = function (dt) {
    const result = cameraUpdate.call(this, dt), actor = this.target;
    const ch = actor?.character, s = ch?.isLocal ? prepare(ch, THREE) : null;
    if (current && current !== s) clear(current);
    current = s;
    const local = G.match?.local || G.game?.player?.a || G.player?.a;
    const enabled = s && !s.disposed && this.mode === 'follow' && actor.alive !== false &&
      !actor.remote && (!local || local === actor) && !G.match?.attract && !this.mapOpen &&
      !(this.mapK > .0001) && actor.form === 'kid' && ch.visible !== false && ch.root.visible;
    if (!enabled) clear(s);
    else {
      s.camera = this.camera; s.rig = this; s.actor = actor;
      s.frameOpacity = s.opacity; s.frameDt = dt;
      const controller = G.match?.controller;
      refresh(s, controller?.a === actor && controller.enabled !== false ? controller.shotGuide : null);
    }
    protectNormalPass(G.post?.gtao, currentState);
    return result;
  };
  if (PlayerController?.prototype.computeAim) {
    const P = PlayerController.prototype, computeAim = P.computeAim;
    P.computeAim = function (simulation = false) {
      const result = computeAim.apply(this, arguments), s = current;
      if (!simulation && s?.camera && !s.disposed && s.actor === this.a &&
          s.rig === this.rig && G.match?.controller === this) {
        // Gameplay recomputes its guide AFTER CameraRig.update. Re-evaluate
        // from this render frame's start opacity so a fresh guide is effective
        // immediately without advancing the fade twice or at fixed-tick rate.
        const actor = this.a, weapon = actor.weapon;
        const kind = weapon?.behaviorKind || weapon?.catalogRecord?.family ||
          (weapon?.kind === 'catalog' ? weapon.modelKind : weapon?.kind);
        const weaponGuide = this.enabled !== false && (kind === 'blaster' || kind === 'slosher');
        if (weaponGuide) {
          const camera = G.rig?.gameCam || G.camera || s.camera;
          const width = globalThis.innerWidth || G.post?._w || 1280;
          const height = globalThis.innerHeight || G.post?._h || 720;
          // This is the same cached, read-only guide the HUD uses. Query only
          // after render-frame aim is current, never on camera/simulation ticks.
          // The later HUD read reuses its point and native cache certificate.
          const pair = kind === 'blaster'
            ? G.projectiles?.s3BlasterReticleGuides?.(actor, weapon, camera, width, height) : null;
          if (pair?.aim && pair?.impact) {
            // Both marks follow the muzzle shot. The fixed screen center has
            // no visible Blaster mark and must not cause an unrelated fade.
            // The HUD hides the impact mark outside weapon reach.
            refresh(s, pair.aim, true, camera, this.inRange !== false ? pair.impact : null, false);
          } else {
            const point = G.projectiles?.s3WeaponGuide?.(actor, weapon, camera, width, height);
            refresh(s, point, true, camera);
          }
        } else refresh(s, this.enabled !== false ? this.shotGuide : null);
      }
      return result;
    };
  }
}
