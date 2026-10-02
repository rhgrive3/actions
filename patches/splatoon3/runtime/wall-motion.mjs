// Wall-only presentation on the public Character. Nintendo footage establishes
// hold -> readiness glint -> climb -> crest, not joint/shape/timing constants.
import { movementMotionSnapshot, MOVEMENT_MOTION_CALIBRATION as legacyVisual } from './movement-motion.mjs';

export const WALL_MOTION_CALIBRATION = Object.freeze({
  compress: .14, stretch: .14, releaseBlend: .08, crestTuck: .07,
  readyFlashTime: .14, readyEmission: .85, glintSize: .58,
  status: 'visual calibration; original shape curves and crest rotation unknown',
});
const INSTALL = Symbol.for('inkwave.s3.wall-motion.install.v1');
const states = new WeakMap(), disposed = new WeakSet();
const EPS = 1e-10;
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const wallPhase = p => p === 'surge-charge' || p === 'surge-burst' || p === 'surge-top';

export function wallMotionSnapshot(ch) {
  return ch?.[INSTALL]?.snapshot(ch) ?? null;
}

function restore(ch, m) {
  if (m.applied) {
    ch.squid.pivot.scale.copy(m.baseScale);
    ch.squid.pivot.quaternion.copy(m.baseQuaternion);
    m.applied = false;
  }
  if (m.emissionApplied) {
    ch.mats.squid.emissive.copy(m.baseEmission);
    ch.mats.squidGhost.emissive.copy(m.baseGhostEmission);
    m.emissionApplied = false;
  }
  if (m.glint) m.glint.visible = false;
}

function clear(ch, m, block = false) {
  restore(ch, m);
  if (block) m.blocked = m.action;
  m.phase = null; m.burst = m.crest = null;
  m.ready = false; m.readyAge = 0; m.charge = m.glow = 0; m.shape = 1;
  m.hasWallPose = false;
}

function glint(ch, m, THREE) {
  if (m.glint) return m.glint;
  // Indexed four-point glint, with its centre on the actual squid mantle.
  // A short readiness signal, not a gameplay armor/health indicator.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0, .5, 0, .045, .045, 0, .5, 0, 0, .045, -.045, 0,
    0, -.5, 0, -.045, -.045, 0, -.5, 0, 0, -.045, .045, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5,
    0, 5, 6, 0, 6, 7, 0, 7, 8, 0, 8, 1]);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
    opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 's3-wall-ready-glint'; mesh.renderOrder = 5; mesh.visible = false;
  ch.squid.pivot.add(mesh); m.glint = mesh;
  return mesh;
}

export function installWallMotion(api, profile) {
  const { Character, Actor, THREE, G } = api;
  if (!Character || !THREE || !profile?.movement?.surge) throw new Error('Wall motion requires Character, THREE and surge tuning');
  const C = Character.prototype;
  // Guard lives on the real prototype, including independently evaluated copies.
  if (Object.hasOwn(C, INSTALL)) return;
  const cfg = profile.movement.surge, visual = WALL_MOTION_CALIBRATION;
  const get = ch => {
    let m = states.get(ch);
    if (!m) {
      m = { phase: null, action: null, blocked: null, burst: null, crest: null,
        ready: false, readyAge: 0, charge: 0, glow: 0, shape: 1, applied: false,
        emissionApplied: false, hasWallPose: false, glint: null,
        baseScale: new THREE.Vector3(), baseQuaternion: new THREE.Quaternion(),
        baseEmission: new THREE.Color(), baseGhostEmission: new THREE.Color(),
        lastWorldQuaternion: new THREE.Quaternion(), parentQuaternion: new THREE.Quaternion(),
        rotation: new THREE.Quaternion(), axis: new THREE.Vector3(0, 1, 0) };
      states.set(ch, m);
    }
    return m;
  };
  Object.defineProperty(C, INSTALL, { value: { snapshot(ch) {
    const m = states.get(ch);
    return m ? { phase: m.phase, charge: m.charge, ready: m.ready,
      readyAge: m.readyAge, glow: m.glow, shape: m.shape,
      burstAge: m.burst?.age ?? null, crestAge: m.crest?.age ?? null,
      resources: m.glint ? 1 : 0 } : null;
  } } });

  const update = C.update, squid = C._updateSquid, trigger = C.trigger;
  C.trigger = function (name, arg) {
    if (!disposed.has(this)) {
      const m = get(this);
      if (name === 'squidsurge') {
        m.crest = null;
        m.burst = { age: 0, duration: Math.max(EPS, arg?.duration ?? cfg.duration),
          charge: clamp(arg?.charge ?? 1), from: m.shape };
      } else if (name === 'squidsurge_top') {
        m.legacyTopDuration = Math.max(EPS, arg?.duration ?? cfg.duration);
        m.crest = { age: 0, duration: Math.max(EPS, arg?.duration ?? cfg.duration),
          charge: clamp(arg?.charge ?? 1), from: m.shape,
          worldQuaternion: m.hasWallPose ? m.lastWorldQuaternion.clone() : null };
        m.burst = null;
      } else if (['movement_cancel', 'spawn', 'land', 'squidroll', 'throw', 'shoot',
        'slosh', 'charge_release', 'dodge'].includes(name)) clear(this, m, true);
    }
    return trigger.call(this, name, arg);
  };

  C.update = function (dt, s) {
    if (disposed.has(this)) return update.call(this, dt, s);
    s = s || {};
    const m = get(this), step = Math.max(0, Math.min(.1, dt || 0));
    // Restore before any existing installer can cancel/restore its own offset.
    restore(this, m);
    const owner = this._owner(), frame = s.movementMotion;
    const actions = frame?.actions ?? owner?.s3?.actions;
    const action = actions?.surge;
    const allowed = (s.form === 'climb' || s.form === 'squid') && !this.dance &&
      owner?.alive !== false && frame?.alive !== false && !owner?.specialActive &&
      !frame?.special && !owner?.superJumpState && !frame?.superJump &&
      (!actions?.roll || action?.phase === 'charge' || action?.phase === 'burst') &&
      !s.subAim && !s.firing && !owner?.weaponRunner?.aimingSub;
    if (!action) m.blocked = null;
    if (action !== m.action) { m.action = action ?? null; m.ready = false; m.readyAge = 0; }
    if (!allowed || action && action === m.blocked) clear(this, m, true);
    else {
      m.phase = null; m.charge = m.glow = 0;
      if (action?.phase === 'charge' && s.form === 'climb') {
        m.burst = m.crest = null; m.phase = 'charge'; m.charge = clamp(action.charge);
        const ready = m.charge >= 1;
        if (ready && !m.ready) m.readyAge = 0;
        else if (ready) m.readyAge += step;
        m.ready = ready;
        m.glow = ready ? visual.readyEmission * (1 - ease(m.readyAge / visual.readyFlashTime)) : 0;
        m.shape = 1 - visual.compress * ease(m.charge);
      } else {
        m.ready = false; m.readyAge = 0;
        if (m.crest) {
          m.crest.age += step;
          if (s.grounded || s.form === 'climb' || m.crest.age + EPS >= m.crest.duration) m.crest = null;
        }
        if (m.burst) {
          m.burst.age += step;
          if (s.form !== 'climb' || m.burst.age + EPS >= m.burst.duration || actions && action?.phase !== 'burst') m.burst = null;
        }
        if (m.crest) { m.phase = 'crest'; m.charge = m.crest.charge; }
        else if (m.burst) { m.phase = 'launch'; m.charge = m.burst.charge; }
        if (m.phase === 'launch') {
          const u = clamp(m.burst.age / m.burst.duration);
          const blend = ease(m.burst.age / Math.min(visual.releaseBlend, m.burst.duration * .5));
          m.shape = m.burst.from * (1 - blend) + (1 + visual.stretch * m.charge * Math.sin(Math.PI * u)) * blend;
        } else if (m.phase === 'crest') {
          const u = clamp(m.crest.age / m.crest.duration);
          m.shape = m.crest.from + (1 - m.crest.from) * ease(u) - visual.crestTuck * m.charge * Math.sin(Math.PI * u);
        } else m.shape = 1;
      }
    }
    const result = update.call(this, dt, s);
    // Hidden bodies still cancel/advance their action; they draw no glint.
    if (!this.root.visible || this.root.parent?.visible === false) restore(this, m);
    return result;
  };

  C._updateSquid = function (dt, s) {
    const result = squid.call(this, dt, s);
    if (disposed.has(this) || this.sqScale <= .001) return result;
    const m = get(this), pivot = this.squid.pivot;
    const legacy = movementMotionSnapshot(this);
    // Replace just the old wall action contribution. Native springs, wall basis,
    // swim/roll/Super Jump and other pose/material channels retain ownership.
    if (wallPhase(legacy?.phase)) {
      let factor = 1;
      if (legacy.phase === 'surge-charge') factor = 1 - legacyVisual.surgeCompress * ease(legacy.charge);
      else if (legacy.phase === 'surge-burst') factor = 1 + legacyVisual.surgeStretch * legacy.charge;
      else {
        factor = 1 - legacyVisual.rollTuck * Math.sin(Math.PI * clamp(legacy.topAge / (m.legacyTopDuration ?? cfg.duration)));
        pivot.quaternion.multiply(m.rotation.setFromAxisAngle(m.axis, -legacy.spin));
      }
      pivot.scale.y /= factor; pivot.scale.x *= Math.sqrt(factor); pivot.scale.z *= Math.sqrt(factor);
    }
    if (!m.phase) return result;
    m.baseScale.copy(pivot.scale); m.baseQuaternion.copy(pivot.quaternion);
    if (m.phase === 'crest' && m.crest.worldQuaternion) {
      // Keep the last wall pose at departure, then blend onto native flight.
      // No invented full axial spin: the official crest clip does not verify it.
      pivot.parent.getWorldQuaternion(m.parentQuaternion).invert();
      m.rotation.copy(m.parentQuaternion).multiply(m.crest.worldQuaternion);
      pivot.quaternion.copy(m.rotation).slerp(m.baseQuaternion, ease(m.crest.age / m.crest.duration));
    }
    pivot.scale.y *= m.shape;
    const width = 1 / Math.sqrt(m.shape);
    pivot.scale.x *= width; pivot.scale.z *= width; m.applied = true;
    if (s.form === 'climb') {
      pivot.getWorldQuaternion(m.lastWorldQuaternion); m.hasWallPose = true;
    }
    // The native local squid uses a GreaterDepth ghost while inside wall ink.
    // Its self-readiness cue must also remain readable there. Do not reveal a
    // remote submerged character through scene geometry with this overlay.
    if (m.glow > EPS && (this.isLocal || !this.inWorld)) {
      m.baseEmission.copy(this.mats.squid.emissive);
      m.baseGhostEmission.copy(this.mats.squidGhost.emissive);
      this.mats.squid.emissive.addScalar(m.glow);
      this.mats.squidGhost.emissive.addScalar(m.glow);
      m.emissionApplied = true;
      const star = glint(this, m, THREE);
      star.position.set(0, .12, .055);
      if (G?.camera) {
        pivot.getWorldQuaternion(m.parentQuaternion).invert();
        G.camera.getWorldQuaternion(m.rotation); star.quaternion.copy(m.parentQuaternion).multiply(m.rotation);
      }
      star.scale.setScalar(visual.glintSize * (.75 + .25 * ease(m.readyAge / visual.readyFlashTime)));
      star.material.opacity = m.glow / visual.readyEmission;
      star.visible = true;
    }
    return result;
  };

  const setWeapon = C.setWeapon, dispose = C.dispose;
  C.setWeapon = function (...args) {
    if (states.has(this) && args[0] !== this.weaponKind) clear(this, get(this), true);
    return setWeapon.apply(this, args);
  };
  C.dispose = function (...args) {
    if (!disposed.has(this)) {
      const m = states.get(this);
      if (m) {
        restore(this, m); m.glint?.removeFromParent();
        m.glint?.geometry.dispose(); m.glint?.material.dispose();
      }
      states.delete(this); disposed.add(this);
    }
    return dispose.apply(this, args);
  };
  if (Actor) for (const method of ['reset', 'splat', '_startSpecial', 'superJump']) {
    const original = Actor.prototype[method];
    if (!original) continue;
    Actor.prototype[method] = function (...args) {
      const result = original.apply(this, args);
      if (method === 'reset' || this.alive === false || this.specialActive || this.superJumpState) {
        const m = states.get(this.character);
        if (m) clear(this.character, m, true);
      }
      return result;
    };
  }
}
