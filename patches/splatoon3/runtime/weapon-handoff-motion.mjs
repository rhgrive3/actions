// Upper-body ownership switches between the legacy source carry and the native
// attack pose in one frame (source-weapon-owner): the weapon jumped 0.3-0.5 m
// when an attack started and when its hold window ended. Splatoon 3's official
// weapon movies show the weapon raised and lowered over several frames. Fade
// from the last rendered upper body instead, in both directions.
// Gameplay reads the muzzle (shot spawn) from the pose WITHOUT this fade, so
// shot positions, timing and every gameplay value stay exactly as before.
// Fade times are INKWAVE calibration, not retail frame counts.
// Reference: reports/inkwave-weapon-hold-motion-2026-10-17.md.
import { applyClamThrowGrip } from './bomb-motion.mjs';
import { applyRainmakerPose, rainmakerAimQuaternion } from './ranked/rainmaker-motion.mjs';
const INSTALLED = Symbol.for('inkwave.s3.weapon-handoff-motion.v1');
export const HANDOFF_FADE = 0.2, HANDOFF_RAISE = 0.1;
const OBJECTIVE_SUPPORT_BONES = ['clavL', 'uArmL', 'fArmL', 'handL'];
const BONES = ['spine', 'chest', 'neck', 'clavL', 'clavR', 'uArmL', 'uArmR', 'fArmL', 'fArmR', 'handL', 'handR'];
const smooth = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

function record(ch) { return ch?.constructor?.prototype?.[INSTALLED]; }
/** Read-only view for regressions: null before the first sourced frame. */
export function weaponHandoffSnapshot(ch) {
  const st = record(ch)?.states.get(ch);
  return st ? { owner: st.owner, elapsed: st.t, duration: st.d, weight: st.w, valid: st.valid } : null;
}

export function installWeaponHandoffMotion({ THREE, Character, CHARACTER_CHANNELS: C, G }) {
  const proto = Character?.prototype;
  if (!proto?._applyPose || !proto?._solveLimb || !proto?._kidXform || !C) throw Error('Weapon handoff motion requires the native Character');
  if (Object.hasOwn(proto, INSTALLED)) return;
  const states = new WeakMap(), supportStates = new WeakMap();
  Object.defineProperty(proto, INSTALLED, { value: { states } });
  const applyPose = proto._applyPose, getMuzzle = proto.getMuzzle, setWeapon = proto.setWeapon, dispose = proto.dispose;
  const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3(), pT = new THREE.Vector3(), pN = new THREE.Vector3();
  const q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), q4 = new THREE.Quaternion(), q5 = new THREE.Quaternion();

  // Same foregrip target as the native left-arm solve, from the faded right hand.
  function refitSupport(ch) {
    const P = ch.P, w = ch.weapon, d = w?.def;
    if (ch.dual || !d?.handL || P[C.IKL] <= 0.5 || P[C.LTW] > 0.001 || ch.sourceMotion?.constrainLeft === false) return;
    ch._kidXform(ch.bones.handR, v3, q3);
    v4.copy(w.pivot.position).applyQuaternion(q3).add(v3); q4.copy(q3).multiply(w.pivot.quaternion);
    v5.copy(w.off.position).applyQuaternion(q4).add(v4); q5.copy(q4).multiply(w.off.quaternion);
    pT.copy(d.handL.pos); if (w.pump) pT.z -= 0.036 * w.pump; if (w.supportZ) pT.z += w.supportZ;
    pT.applyQuaternion(q5).add(v5);
    q2.copy(q5).multiply(d.handL.quat);
    pN.set(P[C.POLEL], P[C.POLEL + 1], P[C.POLEL + 2]);
    ch._solveLimb(ch.limbs.armL, pT, pN, q2, P[C.IKL], 0);
    // Still short of the grip in the in-between pose: protract the shoulder as the native solve does.
    const clav = ch.bones.clavL, cy = clav.rotation.y;
    for (let it = 0; it < 4 && ch.ikErr[0] > 0.0005 && clav.rotation.y > cy - 0.55; it++) {
      const extra = Math.min(0.3, ch.ikErr[0] * 12);
      clav.rotation.y -= extra; clav.rotation.x -= extra * 0.35;
      pN.set(P[C.POLEL], P[C.POLEL + 1], P[C.POLEL + 2]);
      ch._solveLimb(ch.limbs.armL, pT, pN, q2, P[C.IKL], 0);
    }
  }

  // The same native left-arm solve, replacing the hidden main-weapon grip.
  // Use this owner's existing scratch values: no frame allocations or new rig.
  function objectiveSupport(ch) {
    const a = ch.actor || ch._owner?.(), dir = a?.aimDir, P = ch.P;
    if (dir && dir.lengthSq() > 1e-12) v5.copy(dir).normalize();
    else v5.set(Math.sin(a?.yaw || 0), 0, Math.cos(a?.yaw || 0));
    rainmakerAimQuaternion(q3, v5, ch._rainmakerPitch, a?.yaw, v4, q4);
    ch.weapon.pivot.getWorldPosition(v3);
    pT.set(0, 0, .07 * ch.kidScale).applyQuaternion(q3).add(v3);
    ch.kid.worldToLocal(pT);
    ch.kid.getWorldQuaternion(q2).invert(); q2.multiply(q3);
    // The existing fist's pivot is the mirrored canonical left grip-hole.
    const hole = ch.weapon.pivot.position;
    v4.set(-hole.x, hole.y, hole.z).applyQuaternion(q2); pT.sub(v4);
    pN.set(P[C.POLEL], P[C.POLEL + 1], P[C.POLEL + 2]);
    const err = ch.ikErr[0];
    ch._solveLimb(ch.limbs.armL, pT, pN, q2, 1, 0);
    ch.ikErr[0] = err;
    // Keep the legacy one-solve pose for the next source-history update.
    // The displayed correction is a rigid shoulder/arm rotation after that solve.
    if (ch.sourceMotion?.active && ch.sourceMotion.state === 'air') {
      const arm = ch.limbs.armL, clav = ch.bones.clavL;
      ch._kidXform(clav, v3, q3);
      v4.copy(arm.up.position).applyQuaternion(q3).add(v3);
      ch._kidXform(ch.bones.handL, v5, q5);
      const reach = v5.distanceTo(v4);
      const excess = pT.distanceTo(v4) - reach;
      if (excess > 1e-8) {
        v5.subVectors(pT, v3); v4.sub(v3);
        const distance = v5.length(), length = v4.length();
        if (distance > 1e-8 && length > 1e-8) {
          const current = Math.max(-1, Math.min(1, v4.dot(v5) / (distance * length)));
          const needed = Math.max(-1, Math.min(1, (distance * distance + length * length - reach * reach) / (2 * distance * length)));
          // Rig calibration: observed maximum .1343 rad; .2 is a bounded
          // margin, not a retail value. An unreachable capped target stays short.
          const angle = Math.min(.2, Math.max(0, Math.acos(current) - Math.acos(needed)));
          v3.crossVectors(v4, v5);
          if (angle > 0 && v3.lengthSq() > 1e-12) {
            let support = supportStates.get(ch);
            if (!support) supportStates.set(ch, support = { bones: OBJECTIVE_SUPPORT_BONES.map(n => ch.bones[n]), base: OBJECTIVE_SUPPORT_BONES.map(() => new THREE.Quaternion()), position: new THREE.Vector3() });
            for (let i = 0; i < 4; i++) support.base[i].copy(support.bones[i].quaternion);
            support.position.copy(clav.position);
            ch.s3RainmakerSupportPending = true;
            q4.setFromAxisAngle(v3.normalize(), angle); q3.premultiply(q4);
            ch._kidXform(clav.parent, v3, q5); clav.quaternion.copy(q5.invert().multiply(q3));
            // Rotate the already solved chain about its shoulder toward the
            // target, then keep the original desired hand orientation.
            ch._kidXform(arm.up, v3, q3);
            ch._kidXform(ch.bones.handL, v4, q4);
            v4.sub(v3).normalize(); v5.subVectors(pT, v3).normalize();
            q4.setFromUnitVectors(v4, v5); q3.premultiply(q4);
            ch._kidXform(arm.up.parent, v3, q5); arm.up.quaternion.copy(q5.invert().multiply(q3));
            ch._kidXform(ch.bones.handL.parent, v3, q5); ch.bones.handL.quaternion.copy(q5.invert().multiply(q2));
            // Bounded scapular translation only after the existing rotation
            // reaches its .2 rad cap. Keep all arm bone lengths unchanged.
            // .03 world units is a rig calibration, not a retail measurement.
            // The saved baseline position is restored before source history.
            if (angle >= .2 - 1e-12) {
              ch.bones.handL.getWorldPosition(v4);
              v5.copy(pT); ch.kid.localToWorld(v5); v5.sub(v4);
              const distance = v5.length();
              if (distance > 1e-8) {
                v5.multiplyScalar(Math.min(.03, distance) / distance).add(v4);
                clav.parent.worldToLocal(v5); clav.parent.worldToLocal(v4);
                clav.position.add(v5.sub(v4));
              }
            }
          }
        }
      }
    }
    // Source air/emergence transitions must remember the actually displayed
    // support, just as the existing handoff fade records its displayed bones.
    const saved = ch.sourceMotion?.active && ch.sourceMotion.renderedPose;
    if (saved && ch.boneList) for (const name of OBJECTIVE_SUPPORT_BONES) {
      const bone = ch.bones[name], i = ch.boneList.indexOf(bone);
      if (i >= 0) saved[i].q.copy(bone.quaternion);
    }
  }

  function handoff(ch, dt) {
    const sm = ch.sourceMotion;
    const on = ch.s3WeaponHandoffEnabled !== false && ch.kidForm && !ch.dance && !!ch.weapon && !!sm?.active && !sm.manual && !ch._rainmakerPose;
    let st = states.get(ch);
    if (st) st.faded = false;
    if (!on) { if (st) { st.valid = false; st.t = st.d = 0; st.w = 0; } return; }
    if (!st) states.set(ch, st = { valid: false, faded: false, owner: '', t: 0, d: 0, w: 0, time: 0, weapon: null,
      bones: BONES.map(n => ch.bones[n]), prev: BONES.map(() => new THREE.Quaternion()),
      from: BONES.map(() => new THREE.Quaternion()), raw: BONES.map(() => new THREE.Quaternion()), shown: BONES.map(() => new THREE.Quaternion()) });
    // Hidden frames skip _applyPose: a stale previous pose is not a fade source.
    if (st.valid && (st.weapon !== ch.weapon || ch.t - st.time > 0.1 || ch.t < st.time)) st.valid = false;
    const owner = sm.sourceUpper ? 'source' : 'native';
    if (!st.valid) st.t = st.d = 0;
    else if (st.owner !== owner) {
      for (let i = 0; i < BONES.length; i++) st.from[i].copy(st.prev[i]);
      st.t = 0; st.d = owner === 'native' ? HANDOFF_RAISE : HANDOFF_FADE;
    }
    st.w = 0;
    if (st.t < st.d) {
      st.t += Math.max(0, dt || 0);
      st.w = 1 - smooth(st.t / st.d);
      if (st.w > 1e-4) {
        for (let i = 0; i < BONES.length; i++) { st.raw[i].copy(st.bones[i].quaternion); st.bones[i].quaternion.slerp(st.from[i], st.w); }
        st.faded = true;
        const err = ch.ikErr[0];
        refitSupport(ch);
        ch.ikErr[0] = err;   // presentation only: next frame's reach integration keeps its native input
        const saved = sm.renderedPose, list = ch.boneList;
        if (saved && list) for (const b of st.bones) { const k = list.indexOf(b); if (k >= 0) saved[k].q.copy(b.quaternion); }
      }
    }
    for (let i = 0; i < BONES.length; i++) st.prev[i].copy(st.bones[i].quaternion);
    st.owner = owner; st.weapon = ch.weapon; st.time = ch.t; st.valid = true;
  }

  proto._restoreRainmakerSupport = function () {
    const support = supportStates.get(this);
    if (this.s3RainmakerSupportPending && support) {
      for (let i = 0; i < 4; i++) {
        const bone = support.bones[i]; bone.quaternion.copy(support.base[i]);
        if (i === 0) bone.position.copy(support.position);
        const index = this.boneList.indexOf(bone);
        if (index >= 0 && this.sourceMotion?.renderedPose) this.sourceMotion.renderedPose[index].q.copy(support.base[i]);
      }
    }
    this.s3RainmakerSupportPending = false;
  };
  proto._applyPose = function (dt, s) {
    // Last pose-channel owner, after native one-shots and before the one IK pass.
    if (G?.match?.mode === 'rainmaker') applyRainmakerPose(this, s, C, G.match, dt);
    else if (this._rainmakerPose) this._rainmakerPose = false;
    const result = applyPose.call(this, dt, s);
    if (this._rainmakerPose) objectiveSupport(this);
    handoff(this, dt);
    if (this.s3ClamGripActive && !this._rainmakerPose) applyClamThrowGrip(this);
    return result;
  };
  // Gameplay muzzle: evaluated on the unfaded upper body (the pose every
  // previous build rendered), then the faded presentation is restored.
  proto.getMuzzle = function (out) {
    const st = states.get(this);
    if (!st?.faded || this.form !== 'kid' || !this.weapon) return getMuzzle.call(this, out);
    const now = st.shown;
    for (let i = 0; i < BONES.length; i++) { now[i].copy(st.bones[i].quaternion); st.bones[i].quaternion.copy(st.raw[i]); }
    try { return getMuzzle.call(this, out); }
    finally {
      for (let i = 0; i < BONES.length; i++) st.bones[i].quaternion.copy(now[i]);
      this.weapon.muzzle.updateWorldMatrix(true, false);
    }
  };
  proto.setWeapon = function (...args) { if (this.s3RainmakerSupportPending) this._restoreRainmakerSupport(); supportStates.delete(this); states.delete(this); return setWeapon.apply(this, args); };
  proto.dispose = function (...args) { if (this.s3RainmakerSupportPending) this._restoreRainmakerSupport(); supportStates.delete(this); states.delete(this); return dispose.apply(this, args); };
}
