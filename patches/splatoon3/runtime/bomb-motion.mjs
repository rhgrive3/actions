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
    phase: value?.throwing ? 'recovery' : ch?.bombHeld ? 'aim' : 'idle',
    elapsed: value?.throwing ? value.elapsed : null,
    nativeCurveAge: value?.throwing ? RELEASE_AGE + value.elapsed : null,
    releasePosition: value?.releasePosition?.toArray() ?? null, recovery: RECOVERY };
}
function hidden(root) {
  for (let node = root; node; node = node.parent) if (node.visible === false) return true;
  return false;
}
function specialAllows(ch, owner, timers) {
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
export function installBombMotion({ Character, WeaponRunner, CHARACTER_TIMERS: timers, CHARACTER_BOMB_POSE: curves }) {
  if (!Character || !Number.isInteger(timers?.T_THROW))
    throw Error('Bomb motion requires the actual Character and exact exported T_THROW');
  if (typeof curves?.throw !== 'function' || typeof curves?.apply !== 'function')
    throw Error('Bomb motion requires the exact exported native throw and apply pose methods');
  const C = Character.prototype;
  // A globally registered own prototype stamp survives imports into other VM
  // realms. Keep the original state/curve registry available to their helpers.
  if (Object.hasOwn(C, INSTALL)) return;
  Object.defineProperty(C, INSTALL, { value: Object.freeze({ states, curves, timers, disposed }) });
  function clear(ch) {
    if (!ch?.tr) return;
    // Retire the presentation, not the native event clock. Native Runner reset
    // and setWeapon may independently reset clocks; preserve those exact calls.
    stateMap(ch).set(ch, { throwing: false, elapsed: 0, cancelled: true });
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
  const throwing = C._poseThrow, holding = C._poseSubAim;
  const setWeapon = C.setWeapon, setVisible = C.setVisible, dispose = C.dispose;
  C.trigger = function (name, ...args) {
    const result = trigger.call(this, name, ...args);
    if (enabled(this) && name === 'throw') {
      const value = state(this);
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
    const result = updateStates.call(this, dt, s);
    if (!enabled(this)) return result;
    const owner = this._owner(), value = state(this);
    if (!this.kidForm || this.dance || hidden(this.root) || owner?.alive === false
      || owner?.superJumpState || owner?.specialActive?.id !== 'storm' && !specialAllows(this, owner, timers)) {
      clear(this); return result;
    }
    const age = this.tr[timers.T_THROW]; value.elapsed = age;
    if (age >= RECOVERY) value.throwing = false;
    if (age >= NATIVE_END) value.externalThrow = false;
    if (value.cancelled) this.bombSwap = 0;
    if (owner?.specialActive?.id === 'storm') {
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
