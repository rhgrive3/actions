// The public runner creates the bomb on the release event. Its native throw
// curve instead begins with a second cock after that event. Keep the native rig
// and gameplay, but put its existing whip on the real release and its cock in
// the aiming phase. Curve ages below are native visual calibration, not Switch
// input-frame measurements or extracted Nintendo animation parameters.
import { specialMotionAllowsAction } from './action-admission.mjs';
const INSTALL = Symbol.for('inkwave.s3.bomb-motion.install.v1'), RESET = Symbol.for('inkwave.s3.bomb-motion.reset.v1');
const states = new WeakMap(), sampleCaches = new WeakMap(), disposed = new WeakSet();
const RELEASE_AGE = .10, NATIVE_END = .62, RECOVERY = NATIVE_END - RELEASE_AGE;
const enabled = ch => !!ch && ch.s3BombMotionEnabled !== false && !registry(ch)?.disposed?.has(ch);
function registry(ch) {
  for (let prototype = Object.getPrototypeOf(ch); prototype; prototype = Object.getPrototypeOf(prototype))
    if (Object.hasOwn(prototype, INSTALL)) return prototype[INSTALL];
}
const stateMap = ch => ch && registry(ch)?.states || states;
function state(ch) {
  const map = stateMap(ch); let value = map.get(ch);
  if (!value) { value = { throwing: false, elapsed: 0 }; map.set(ch, value); }
  return value;
}
export function bombMotionSnapshot(ch) {
  const value = ch && stateMap(ch).get(ch);
  return { throwing: !!value?.throwing, held: !!ch?.bombHeld,
    phase: value?.clamGrip ? 'clam-recovery' : value?.throwing ? 'recovery' : ch?.bombHeld ? 'aim' : 'idle',
    elapsed: value?.clamGrip ? value.clamGrip.elapsed : value?.throwing ? value.elapsed : null,
    nativeCurveAge: value?.throwing ? RELEASE_AGE + value.elapsed : null,
    releasePosition: value?.releasePosition?.toArray() ?? null, clamGrip: !!value?.clamGrip, recovery: RECOVERY };
}
// Called only by the existing final handoff owner while this one-shot is live.
// Its ordinary-frame path is one boolean check in that owner, not a new wrapper.
export function applyClamThrowGrip(ch) {
  if (ch?.s3ClamGripActive) registry(ch)?.clamGrip(ch);
}
function hidden(root) {
  for (let node = root; node; node = node.parent) if (node.visible === false) return true;
  return false;
}
function specialAllows(ch, owner, timers) {
  if (owner?.specialActive?.id === 'storm' && owner.specialActive.phase === 'hold') return true;
  return specialMotionAllowsAction(ch, !owner?.specialActive
    && ch.tr[timers.T_LEAP] >= 1.9 && ch.tr[timers.T_SLAM] >= 1.4);
}
const SECONDARY = ['_animWeapon', '_applyFace', '_updateHair', '_updateTank', '_applyJiggle', '_applyFingers'];
const noop = () => {};
function fieldBank() { return { map: new Map(), active: [], keys: new Set() }; }
function captureFields(object, bank) {
  bank.active.length = 0; bank.keys.clear();
  for (const key in object) {
    if (!Object.hasOwn(object, key)) continue;
    bank.keys.add(key);
    const value = object[key], type = typeof value;
    const scalar = value === null || type === 'number' || type === 'string' || type === 'boolean' || type === 'undefined';
    const typed = ArrayBuffer.isView(value) && value.slice;
    const copyable = value?.isVector2 || value?.isVector3 || value?.isVector4 || value?.isQuaternion || value?.isEuler || value?.isMatrix3 || value?.isMatrix4 || value?.isColor;
    if (!scalar && !typed && !copyable) continue;
    let item = bank.map.get(key);
    if (!item) { item = { key }; bank.map.set(key, item); }
    item.original = value; item.scalar = scalar; item.typed = !!typed;
    if (!scalar) {
      if (!item.copy || item.copy.constructor !== value.constructor || typed && item.copy.length !== value.length)
        item.copy = typed ? value.slice() : value.clone();
      else typed ? item.copy.set(value) : item.copy.copy(value);
    }
    bank.active.push(item);
  }
}
function restoreFields(object, bank) {
  for (const item of bank.active) {
    object[item.key] = item.original;
    if (!item.scalar) item.typed ? item.original.set(item.copy) : item.original.copy(item.copy);
  }
  for (const key in object) if (Object.hasOwn(object, key) && !bank.keys.has(key)) delete object[key];
}
function sampleCache(ch) {
  let cache = sampleCaches.get(ch);
  if (!cache) {
    cache = { pose: new Float32Array(ch.P.length), receiver: { PX: new Float32Array(ch.P.length), _effort: 0 },
      fields: fieldBank(), feet: ch.feet.map(() => fieldBank()), nodes: [], nodeStates: new WeakMap(),
      methods: SECONDARY.map(name => ({ name, descriptor: null })), busy: false };
    sampleCaches.set(ch, cache);
  }
  return cache;
}
function sampleRelease(a, out) {
  const ch = a?.character, value = ch && stateMap(ch).get(ch), installation = ch && registry(ch), curves = installation?.curves;
  if (!curves || !enabled(ch) || !ch.bomb || !ch.weapon || hidden(ch.root) || ch.dance || a.alive === false || a.form === 'squid'
    || !specialAllows(ch, a, installation.timers) || a.superJumpState) return out;
  if (ch.s3RainmakerSupportPending) ch._restoreRainmakerSupport();
  // Evaluate the exported native curve into isolated buffers. The receiver
  // deliberately has no gameplay clocks, springs, footsteps or hair to mutate.
  const cache = sampleCache(ch), pose = cache.pose;
  if (cache.busy) throw Error('Recursive bomb pose sampling');
  cache.busy = true; pose.set(value?.basePose || ch.P); cache.receiver._effort = 0;
  try { curves.throw.call(cache.receiver, pose, RELEASE_AGE); }
  catch (error) { cache.busy = false; throw error; }
  // Apply the actual native rig's pelvis/limb solvers in a transaction, without
  // invoking Character.update, Actor._finishFrame, root tracking, gait stepping,
  // weapon animation or secondary simulation. Native apply also writes foot
  // display points and head bookkeeping, so restore those as well as bones.
  captureFields(ch, cache.fields);
  for (let i = 0; i < ch.feet.length; i++) captureFields(ch.feet[i], cache.feet[i]);
  let nodeCount = 0;
  ch.root.traverse(node => {
    let item = cache.nodeStates.get(node);
    if (!item) {
      item = { node, position: node.position.clone(), quaternion: node.quaternion.clone(), rotation: node.rotation.clone(), scale: node.scale.clone(),
        matrix: node.matrix.clone(), world: node.matrixWorld.clone() };
      cache.nodeStates.set(node, item);
    } else {
      item.position.copy(node.position); item.quaternion.copy(node.quaternion); item.rotation.copy(node.rotation); item.scale.copy(node.scale);
      item.matrix.copy(node.matrix); item.world.copy(node.matrixWorld);
    }
    item.visible = node.visible; item.dirty = node.matrixWorldNeedsUpdate;
    cache.nodes[nodeCount++] = item;
  });
  cache.nodes.length = nodeCount;
  for (const method of cache.methods) method.descriptor = Object.getOwnPropertyDescriptor(ch, method.name);
  try {
    for (const method of cache.methods) Object.defineProperty(ch, method.name, { configurable: true, writable: true, value: noop });
    ch.P = pose; ch._dt = 0; ch.bombHeld = false;
    ch.root.position.copy(a.pos); ch.root.position.y += a.smoothY || 0;
    ch.root.rotation.y = a.yaw; ch.yaw = a.yaw;
    curves.apply.call(ch, 0, a.anim || {});
    ch.root.updateMatrixWorld(true);
    // The hierarchy has just been evaluated. Avoid getWorldPosition's parent
    // update, which would also mutate an external scene's matrix bookkeeping.
    out.setFromMatrixPosition(ch.bomb.group.matrixWorld);
  } finally {
    for (const method of cache.methods) method.descriptor ? Object.defineProperty(ch, method.name, method.descriptor) : delete ch[method.name];
    restoreFields(ch, cache.fields);
    for (let i = 0; i < ch.feet.length; i++) restoreFields(ch.feet[i], cache.feet[i]);
    for (const item of cache.nodes) {
      item.node.position.copy(item.position); item.node.scale.copy(item.scale);
      // Keep both stored representations exactly. Their normal Three.js
      // callbacks would otherwise convert Euler -> quaternion -> Euler and
      // introduce roundoff into the following native root-yaw measurement.
      const rotationChanged = item.node.rotation._onChangeCallback, quaternionChanged = item.node.quaternion._onChangeCallback;
      try {
        item.node.rotation._onChangeCallback = item.node.quaternion._onChangeCallback = noop;
        item.node.rotation.copy(item.rotation); item.node.quaternion.copy(item.quaternion);
      } finally {
        item.node.rotation._onChangeCallback = rotationChanged; item.node.quaternion._onChangeCallback = quaternionChanged;
      }
      item.node.matrix.copy(item.matrix); item.node.matrixWorld.copy(item.world);
      item.node.visible = item.visible; item.node.matrixWorldNeedsUpdate = item.dirty;
    }
    cache.busy = false;
  }
  return out;
}
// Exact adapter hooks call these after constructing the legacy candidate
// origin and before native mesh/network/event/arc creation. Unsupported or
// explicitly disabled previews keep that supplied origin unchanged.
export function bombReleasePosition(a, out) {
  const ch = a?.character, value = ch && stateMap(ch).get(ch);
  if (!value?.throwing) return out;
  sampleRelease(a, out);
  value.releasePosition = out.clone();
  return out;
}
export function bombPreviewPosition(a, out) {
  if (!a?.weaponRunner?.aimingSub) return out;
  return sampleRelease(a, out);
}
export function installBombMotion({ THREE, G, Character, WeaponRunner, CHARACTER_TIMERS: timers, CHARACTER_CHANNELS: channels, CHARACTER_BOMB_POSE: curves }) {
  if (!Character || !Number.isInteger(timers?.T_THROW))
    throw Error('Bomb motion requires the actual Character and exact exported T_THROW');
  if (typeof curves?.throw !== 'function' || typeof curves?.apply !== 'function')
    throw Error('Bomb motion requires the exact exported native throw and apply pose methods');
  const C = Character.prototype;
  // A globally registered own prototype stamp survives imports into other VM
  // realms. Keep the original state/curve registry available to their helpers.
  if (Object.hasOwn(C, INSTALL)) return;
  Object.defineProperty(C, INSTALL, { value: Object.freeze({ states, curves, timers, disposed, clamGrip }) });
  function clear(ch) {
    if (!ch?.tr) return;
    if (ch.s3RainmakerSupportPending) ch._restoreRainmakerSupport();
    restoreClamPose(ch, stateMap(ch).get(ch));
    // Retire the presentation, not the native event clock. Native Runner reset
    // and setWeapon may independently reset clocks; preserve those exact calls.
    stateMap(ch).set(ch, { throwing: false, elapsed: 0, cancelled: true });
    ch.s3ClamGripActive = false;
    ch.bombHeld = false; ch.wSub = 0; ch.bombSwap = 0;
    if (ch.bomb) { ch.bomb.group.visible = false; ch.bomb.group.scale.setScalar(1); }
  }
  if (WeaponRunner && !Object.hasOwn(WeaponRunner.prototype, RESET)) {
    Object.defineProperty(WeaponRunner.prototype, RESET, { value: true });
    const reset = WeaponRunner.prototype.reset;
    WeaponRunner.prototype.reset = function (...args) {
      const result = reset.apply(this, args);
      if (enabled(this.a.character)) clear(this.a.character);
      return result;
    };
  }
  const trigger = C.trigger, updateStates = C._updateStates, buildPose = C._buildPose;
  const clamBones = ['clavL', 'uArmL', 'fArmL', 'handL'];
  function restoreClamPose(ch, value) {
    const grip = value?.clamGrip;
    if (!grip?.restorePending) return;
    for (let i = 0; i < 4; i++) ch.bones[clamBones[i]].quaternion.copy(grip.base[i]);
    grip.restorePending = false;
  }
  function stopClam(ch, value) {
    restoreClamPose(ch, value);
    ch.s3ClamGripActive = false;
    if (value) value.clamGrip = null;
  }
  function clamGrip(ch) {
    const value = stateMap(ch).get(ch), grip = value?.clamGrip;
    if (!grip || G?.match?.mode !== 'clams' || grip.elapsed >= RECOVERY || !(ch.kidScale > .001) || hidden(ch.root)) {
      stopClam(ch, value); return;
    }
    const owner = ch._owner();
    if (ch.dual || owner?.alive === false || owner?.superJumpState || owner?.weaponRunner?.aimingSub || owner?.specialActive || owner?.weapon?.id === 'rainmaker'
      || owner?.pos && grip.world.distanceToSquared(owner.pos) > 4) { stopClam(ch, value); return; }
    // A final-owner overlay is transient. Preserve the normal pose before
    // either the event solve or recovery, then remove it before next frame's
    // source controller captures its dive/return history.
    for (let i = 0; i < 4; i++) grip.base[i].copy(ch.bones[clamBones[i]].quaternion);
    grip.restorePending = true;
    if (!grip.started) {
      // Success arrives after the normal pose. One free-arm solve establishes
      // contact; its feedback must not change next frame's normal weapon pose.
      grip.target.copy(grip.world); ch.kid.worldToLocal(grip.target);
      const error = ch.ikErr[0];
      try { ch._solveLimb(ch.limbs.armL, grip.target, grip.pole, null, 1, 0); }
      finally { ch.ikErr[0] = error; }
      for (let i = 0; i < 4; i++) grip.release[i].copy(ch.bones[clamBones[i]].quaternion);
      grip.started = true; return;
    }
    // Sample the existing native curve in isolated buffers, then apply only
    // left arm/clavicle rotations after the single normal pose evaluation.
    // Native clocks, source ownership, torso, right gun and IK feedback stay
    // untouched. Subsequent frames add no second limb solve.
    const t = grip.elapsed, blend = Math.min(1, t / .10), b = blend * blend * (3 - 2 * blend);
    const fade = Math.min(1, Math.max(0, (t - .30) / (RECOVERY - .30))), w = (1 - fade * fade * (3 - 2 * fade)) * Math.min(1, Math.max(0, ch.kidScale));
    grip.pose.set(ch.P); grip.receiver._effort = 0;
    curves.throw.call(grip.receiver, grip.pose, RELEASE_AGE + t);
    for (let i = 0; i < 4; i++) {
      const j = grip.channels[i], bone = ch.bones[clamBones[i]];
      grip.euler.set(grip.pose[j], grip.pose[j + 1], grip.pose[j + 2], bone.rotation.order);
      grip.rotation.setFromEuler(grip.euler);
      grip.shown.copy(grip.release[i]).slerp(grip.rotation, b);
      bone.quaternion.slerp(grip.shown, w);
    }
  }
  const throwing = C._poseThrow, holding = C._poseSubAim;
  const setWeapon = C.setWeapon, setVisible = C.setVisible, dispose = C.dispose;
  C.trigger = function (name, ...args) {
    const clam = args[0]?.clamRelease;
    if (name === 'clam-throw') {
      // Ranked throw is already simulated. Do not enter native T_THROW: that
      // clock also controls dual guns, source ownership and gameplay muzzles.
      const value = state(this); stopClam(this, value);
      if (!enabled(this) || !this.kidForm || G?.match?.mode !== 'clams' || !THREE || !channels || this.dual
        || !['small', 'power'].includes(clam?.kind) || !Array.isArray(clam.pos) || clam.pos.length !== 3 || !clam.pos.every(Number.isFinite)) return;
      // A fixed scratch bank per live Character; repeated throws reuse it.
      const grip = value.clamCache ||= {
        world: new THREE.Vector3(), target: new THREE.Vector3(), pole: new THREE.Vector3(1, -.1, .1),
        pose: new Float32Array(this.P.length), receiver: { PX: new Float32Array(this.P.length), _effort: 0 },
        channels: [channels.CLAVL, channels.UARML, channels.FARML, channels.HANDL], release: clamBones.map(() => new THREE.Quaternion()), base: clamBones.map(() => new THREE.Quaternion()), restorePending: false,
        euler: new THREE.Euler(), rotation: new THREE.Quaternion(), shown: new THREE.Quaternion()
      };
      grip.elapsed = 0; grip.started = false; grip.world.fromArray(clam.pos);
      grip.world.y -= clam.kind === 'power' ? .255 * 1.2 : .066 * 1.4;
      value.clamGrip = grip; this.s3ClamGripActive = true; clamGrip(this); return;
    }
    const result = trigger.call(this, name, ...args);
    if (enabled(this) && name === 'throw') {
      const value = state(this); stopClam(this, value);
      // Storm shares the native event and timer, but its installed special
      // layer owns that throw. Never classify it as a Splat Bomb recovery.
      value.externalThrow = this._owner()?.specialActive?.id === 'storm';
      value.throwing = !value.externalThrow; value.elapsed = 0; value.cancelled = false;
      // No held copy survives the event that creates the real projectile,
      // including an update while the Character is hidden or paused.
      this.bombHeld = false;
      if (this.bomb) this.bomb.group.visible = false;
    }
    return result;
  };
  C._updateStates = function (dt, s) {
    if (this.s3RainmakerSupportPending) this._restoreRainmakerSupport();
    // Character.update calls this before sourceMotion.advance. Restoring here
    // keeps the displayed left-arm overlay out of source diveFrom/air history
    // and therefore out of the ordinary bomb's real pose-based release origin.
    if (this.s3ClamGripActive) restoreClamPose(this, stateMap(this).get(this));
    const result = updateStates.call(this, dt, s);
    if (!enabled(this)) return result;
    const owner = this._owner(), value = state(this);
    // Once the human has disappeared, never resume an old recovery on return.
    if (value.clamGrip && !(this.kidScale > .001)) stopClam(this, value);
    if (!this.kidForm || this.dance || hidden(this.root) || owner?.alive === false
      || owner?.superJumpState || owner?.specialActive?.id !== 'storm' && !specialAllows(this, owner, timers)) {
      // Ordinary bomb state still clears exactly as before. A fading human
      // may display the same bounded Clam recovery until its existing form
      // envelope hides it; its clean baseline was restored before this call.
      const retain = !this.kidForm && this.kidScale > .001 && !this.dance && !hidden(this.root)
        && owner?.alive !== false && !owner?.superJumpState && !owner?.specialActive
        && !owner?.weaponRunner?.aimingSub && ['swim', 'squid', 'climb'].includes(this.form)
        && G?.match?.mode === 'clams' && value.clamGrip;
      const grip = retain && value.clamGrip, bank = value.clamCache;
      clear(this);
      if (grip) {
        grip.elapsed += Math.max(0, dt || 0);
        if (grip.elapsed < RECOVERY) {
          const next = state(this); next.clamGrip = grip; next.clamCache = bank;
          this.s3ClamGripActive = true;
        }
      }
      return result;
    }
    const age = this.tr[timers.T_THROW]; value.elapsed = age;
    if (value.clamGrip) {
      value.clamGrip.elapsed += Math.max(0, dt || 0);
      if (value.clamGrip.elapsed >= RECOVERY) stopClam(this, value);
    }
    if (age >= RECOVERY) value.throwing = false;
    if (age >= NATIVE_END) value.externalThrow = false;
    if (value.cancelled) this.bombSwap = 0;
    if (owner?.specialActive?.id === 'storm' && owner.specialActive.phase !== 'hold') {
      value.throwing = false; this.bombHeld = false;
      if (this.bomb) this.bomb.group.visible = false;
      return result;
    }
    const sub = s.subAim ?? !!owner?.weaponRunner?.aimingSub;
    if (sub && !value.throwing && !this.bombHeld) {
      // Returning to human/visible form with a still-held real input starts a
      // fresh presentation, rather than depending on stale _subPrev.
      this.bombHeld = true; this.bombT = 0;
    }
    if (!sub) {
      this.bombHeld = false;
      if (this.bomb) this.bomb.group.visible = false;
    }
    // The native gradual pistol scale-down overlaps its left-hand bomb. Make
    // room immediately, and retain the free hand through the full recovery.
    // The native damped return resumes once that arm can hold its pistol again.
    if (this.dual && (this.bombHeld || value.throwing)) this.bombSwap = 1;
    return result;
  };
  C._poseThrow = function (...args) {
    if (!enabled(this) || stateMap(this).get(this)?.externalThrow) return throwing.apply(this, args);
    // Applied once after native main-weapon overlays; a simultaneous main
    // attack must not reclaim the hand currently drawing the held bomb.
  };
  C._poseSubAim = function (...args) {
    if (!enabled(this)) return holding.apply(this, args);
  };
  C._buildPose = function (...args) {
    const result = buildPose.apply(this, args);
    const owner = this._owner();
    if (!enabled(this) || !this.kidForm || this.dance || hidden(this.root) || owner?.alive === false
      || owner?.superJumpState || !specialAllows(this, owner, timers)) return result;
    const value = state(this), age = this.tr[timers.T_THROW];
    value.basePose ||= new Float32Array(this.P.length); value.basePose.set(this.P);
    if (value.throwing && age < RECOVERY) throwing.call(this, this.P, RELEASE_AGE + age);
    else if (this.bombHeld && this.wSub > .001) holding.call(this, this.P, this.wSub);
    return result;
  };
  C.setWeapon = function (...args) {
    if (enabled(this) && args[0] !== this.weaponKind) clear(this);
    return setWeapon.apply(this, args);
  };
  C.setVisible = function (visible) {
    if (enabled(this) && !visible) clear(this);
    return setVisible.call(this, visible);
  };
  C.dispose = function (...args) {
    if (enabled(this)) clear(this);
    stateMap(this).delete(this);
    disposed.add(this);
    sampleCaches.delete(this);
    return dispose.apply(this, args);
  };
}
