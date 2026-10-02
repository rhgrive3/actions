// Nintendo how-to-play move03/04: ink-burst disappearance and team-ink
// coating on entry, then ordinary movement/shooting. Keep native air/weapon/IK
// and immediate splat hiding. No Nintendo joint curves or shield timings are
// published here; the coating blend and fades below are visual calibration.
export const HIT_SPAWN_MOTION_CALIBRATION = Object.freeze({
  entryTime: .08, exitTime: .12, coating: .90, roughness: .18,
  status: 'visual calibration; original coating shader, joint curves and timings unknown',
});
const INSTALL = Symbol.for('inkwave.s3.hit-spawn-motion.install.v1');
const MATERIAL = Symbol.for('inkwave.s3.spawn-coating.material.v1');
const COATED = Object.freeze(['skin', 'cloth', 'hair', 'squid', 'squidGhost']);
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

export function hitSpawnMotionSnapshot(ch) {
  const s = ch?.[INSTALL]?.states.get(ch);
  return s ? { phase: s.phase, age: s.age, spawnProtection: s.spawnProtection,
    coating: s.level.value, visible: s.level.value > 0 && ch.root.visible,
    disposed: s.disposed, materials: s.materials.size, resources: 0 } : null;
}

function coatMaterial(material, s, cfg) {
  if (!material || material[MATERIAL]) return;
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
  Object.defineProperty(material, MATERIAL, { value: true });
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    // Native dither clones delegate to their already-hooked base. The Flow
    // lane also asks this material only for vertex deformation, with an empty
    // fragment program. Neither path needs a second fragment injection.
    if (shader.uniforms.uS3SpawnCoating === s.level || shader.fragmentShader === '') return;
    const colorAnchor = '#include <roughnessmap_fragment>';
    const lightAnchor = '#include <lights_physical_fragment>';
    if (!shader.fragmentShader.includes(colorAnchor) || !shader.fragmentShader.includes(lightAnchor))
      throw new Error('INKWAVE spawn coating conflict: native physical material anchors');
    shader.uniforms.uS3SpawnCoating = s.level;
    shader.uniforms.uS3SpawnColor = s.color;
    shader.fragmentShader = 'uniform float uS3SpawnCoating;\nuniform vec3 uS3SpawnColor;\n' +
      shader.fragmentShader.replace(colorAnchor,
        'diffuseColor.rgb = mix(diffuseColor.rgb, uS3SpawnColor, uS3SpawnCoating);\n' + colorAnchor)
      .replace(lightAnchor, 'roughnessFactor = mix(roughnessFactor, ' + cfg.roughness.toFixed(2) +
        ', uS3SpawnCoating);\n' + lightAnchor);
    // The real material vertex deformation, indexed geometry, skeleton,
    // lighting, face, hurt mask and LOD discard all remain in that program.
  };
  material.customProgramCacheKey = function () { return key.call(this) + '|iwSpawnCoating1'; };
  material.needsUpdate = true;
  s.materials.add(material);
}

export function installHitSpawnMotion(api, _profile) {
  const { Character, Actor, THREE } = api;
  if (!Character || !THREE) throw new Error('Hit/spawn motion requires native Character and THREE');
  const C = Character.prototype;
  let hooks = Object.hasOwn(C, INSTALL) ? C[INSTALL] : null;
  if (!hooks) {
    const states = new WeakMap(), cfg = HIT_SPAWN_MOTION_CALIBRATION;
    const get = ch => {
      let s = states.get(ch);
      if (!s) {
        s = { phase: 'off', age: 0, spawnProtection: false, disposed: false, owner: null,
          level: { value: 0 }, color: { value: ch.color.clone() }, materials: new Set() };
        states.set(ch, s);
      }
      return s;
    };
    const clear = ch => {
      const s = states.get(ch);
      if (s) { s.phase = 'off'; s.age = 0; s.spawnProtection = false; s.level.value = 0; s.owner = null; }
    };
    const start = (ch, owner) => {
      const s = get(ch);
      if (s.disposed) return;
      // Actor.spawnAt knows the owner before Character's first update has set
      // inWorld/discovered it. A subsequent native spawn trigger keeps that
      // binding; a standalone Character preview still has no gameplay owner.
      const bound = owner || ch._owner() || s.owner;
      clear(ch); s.spawnProtection = true; s.phase = 'entry';
      s.owner = bound?.character === ch ? bound : null;
    };
    const coatAll = ch => {
      const s = get(ch);
      for (const kind of COATED) {
        coatMaterial(ch.mats[kind], s, cfg);
        for (const dither of ch.matsD || []) coatMaterial(dither[kind], s, cfg);
      }
    };
    hooks = { states, get, clear, start };
    Object.defineProperty(C, INSTALL, { value: hooks });
    const trigger = C.trigger, update = C.update, spawn = C._poseSpawn;
    const materials = C._updateMaterials, visible = C.setVisible, dispose = C.dispose;
    const matFor = C._matFor, warm = C.warmAll;
    C._matFor = function (kind, ...args) {
      const material = matFor.call(this, kind, ...args);
      if (COATED.includes(kind)) coatMaterial(material, get(this), cfg);
      return material;
    };
    C.warmAll = function (...args) {
      coatAll(this); return warm.apply(this, args);
    };
    C.trigger = function (name, ...args) {
      const result = trigger.call(this, name, ...args);
      if (name === 'spawn' && this.s3HitSpawnMotionEnabled !== false) start(this);
      return result;
    };
    C._poseSpawn = function (...args) {
      if (this.s3HitSpawnMotionEnabled === false) return spawn.apply(this, args);
      // Called only by the native T_SPAWN branch, AFTER weapon/sub poses.
      // Suppress the legacy dive/crouch/flourish rather than assigning targets
      // after IK. Native air, feet, form, hit and weapon layers own the pose.
    };
    C.update = function (dt, input) {
      const s = get(this);
      if (s.disposed) return;
      // Hook per-character base materials before native LOD clones are made.
      // Existing dither clones also retain their original vertex/discard code.
      coatAll(this);
      const frame = input || {}, owner = this._owner() || (s.owner?.character === this ? s.owner : null);
      const enabled = this.s3HitSpawnMotionEnabled !== false;
      const alive = !owner || owner.alive !== false;
      const protectedNow = owner ? owner.invuln > 0 : !!frame.invuln;
      if (!enabled || !alive || !this.visible || this.dance || owner?.specialActive || !protectedNow) clear(this);
      if (s.spawnProtection) {
        s.age += Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
        const remaining = owner ? owner.invuln : Infinity;
        const entry = smooth(s.age / cfg.entryTime), exit = smooth(remaining / cfg.exitTime);
        s.level.value = cfg.coating * entry * exit;
        s.phase = remaining < cfg.exitTime ? 'expiry' : entry < 1 ? 'entry' : 'protected';
        s.color.value.copy(this.color);
      }
      return update.call(this, dt, input);
    };
    C._updateMaterials = function (dt, frame) {
      const s = states.get(this);
      // Replace only the spawn flash; generic action invulnerability retains
      // its native shader. No writes to hurt, Flow or special glow channels.
      if (!s?.spawnProtection) return materials.call(this, dt, frame);
      const result = materials.call(this, dt, frame);
      this.u.uFlash.value.setRGB(0, 0, 0);
      return result;
    };
    C.setVisible = function (value) {
      if (!value) clear(this);
      return visible.call(this, value);
    };
    C.dispose = function (...args) {
      const s = get(this);
      if (s.disposed) return;
      clear(this); s.disposed = true;
      // No geometry/material clones or GPU resources: the native owner
      // disposes its original materials. Our shared scalar is reset first.
      const result = dispose.apply(this, args);
      s.materials.clear(); return result;
    };
  }
  if (Actor && !Object.hasOwn(Actor.prototype, INSTALL)) {
    const A = Actor.prototype, reset = A.reset, spawnAt = A.spawnAt;
    Object.defineProperty(A, INSTALL, { value: true });
    A.reset = function (...args) {
      if (this.character) hooks.clear(this.character);
      return reset.apply(this, args);
    };
    A.spawnAt = function (...args) {
      const result = spawnAt.apply(this, args);
      if (this.character?.s3HitSpawnMotionEnabled !== false) hooks.start(this.character, this);
      return result;
    };
  }
}
