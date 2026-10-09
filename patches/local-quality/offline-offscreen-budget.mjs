// Offline bot offscreen Character visual budget - issue #845 residual.
//
// PR #1175's offscreen-visual-budget.mjs handles network replicas. Offline bots
// still run Character.update at fixed simulation cadence because their live
// weapon projectiles use the native rig-bone muzzle. This residual suppresses
// only offscreen decorative pose work and foot-IK raycasts, plus hair,
// and material updates after a sustained renderer-frame absence.
//
// This adapter covers ONLY that residual, and only with visual work whose
// gameplay dependencies remain live on the native path (inkwave-public/src/game/character.js):
//   * _updateHair(dt) integrates the hx/hv/tipX/tipV spring chains and writes
//     hair-bone quaternions. Nothing outside the Character reads them for
//     gameplay: Actor, BotBrain, WeaponRunner/Projectiles (which read the
//     weapon rig bones via getMuzzle, not hair bones), movement, collision,
//     ink, damage, networking, Flow, LOD and clocks never touch them. While
//     long-undrawn the springs freeze and hidden-time debt is dropped, so no
//     catch-up burst flings strands on return.
//   * _updateFeet() gait/swing state, pelvis, torso, arms and weapon-rig
//     transforms still advance every tick. Stable grounded ticks replace its
//     per-foot raycasts with the same exact vertical oriented-box ray test over
//     the level's broadphase blocks (including ramp faces).
//     Replant/airborne transitions keep native IK live. The source adapter then
//     skips leg-joint IK and the decorative pose tail only after the muzzle rig
//     is current. Hair/material work is deferred and caught up before drawing.
//
// Draw signal: native _camHook (onBeforeRender) records _camFrame only when
// really submitted. The grace is a local renderer-frame policy, not a Splatoon 3
// timing value. A chained pre-submission hook repairs feet/hair if the camera
// turns toward a bot between its Character update and render. Range, local
// actors, remotes (PR #1175), non-bots, attract scenes, forced LOD, menus and
// characters that have never been drawn stay at full rate.
const INSTALLED = Symbol.for('inkwave.local-quality.offline-offscreen-budget.v1');
const CHAINED = Symbol.for('inkwave.local-quality.offline-offscreen-budget.render-hook.v1');
export const GRACE_FRAMES = 30;
export function offlineBudgeted(ch, s, G) {
  if (!ch || !s) return false;
  if (s.isBot !== true || s.remote === true) return false;
  // Squid/climb/transition projectiles use the squid/head emitter and another
  // visual update path; keep those forms at full rate.
  if (s.form !== 'kid' || ch.form !== 'kid' || !(ch.kidScale > 0.001)) return false;
  if (s.isLocal || ch.isLocal) return false;
  if (G?.match?.local && s === G.match.local) return false;
  if (!G?.match || G.match.attract || G.match?.opts?.range) return false;
  if (!ch.inWorld) return false;
  if (ch.lod && ch.lod.force >= 0) return false;
  const last = ch._camFrame;
  if (!Number.isFinite(last) || last < 0) return false;
  const frame = G?.renderer?.info?.render?.frame;
  if (!Number.isFinite(frame)) return false;
  return frame - last >= GRACE_FRAMES;
}

function catchUpBeforeVisible(ch, nativeUpdateHair, nativeUpdateMaterials) {
  if (!ch?._oobWasBudgeted) return false;
  const dt = Math.min(0.1, Math.max(0, Number(ch._oobLastDt) || 0));
  const s = ch._oobLastState;
  if (!ch.inWorld) return false;

  // Character.update already advanced clocks, gait and pose for this tick.
  // Replant/rebuild at dt=0 so no presentation clock or gait phase advances a
  // second time; hair receives this tick's dt once, without hidden-time debt.
  ch._oobBudget = false;
  ch._oobGroundBudget = false;
  ch._oobPoseTailSkip = false;
  try {
    ch.feetValid = false;
    ch.headInit = false;
    ch._headSet = false;
    if (ch.kidScale > 0.001 && typeof ch._updateFeet === 'function'
        && typeof ch._buildPose === 'function' && typeof ch._applyPose === 'function') {
      // Native _applyPose may consume its half-rate hair accumulator. Drop
      // any hidden interval before rebuilding, then integrate only this tick.
      ch._hairAcc = 0;
      ch._updateFeet(0, s);
      ch._buildPose(0, s);
      ch._applyPose(0, s);
      if (typeof nativeUpdateHair === 'function') {
        nativeUpdateHair.call(ch, dt);
        ch._oobHairCatchUps++;
      }
      ch._hairAcc = 0;
    }
    if (ch._oobMaterialDirty && typeof nativeUpdateMaterials === 'function') {
      nativeUpdateMaterials.call(ch, 0, s);
      ch._oobMaterialDirty = false;
      ch._oobMaterialCatchUps++;
    }
    ch._oobWasBudgeted = false;
    ch._oobCatchUps++;
    return true;
  } finally {
    ch._oobBudget = false;
  }
}

function chainRenderCatchup(ch, tierSet, nativeUpdateHair, nativeUpdateMaterials) {
  const mesh = tierSet?.list?.[0];
  if (!mesh || mesh[CHAINED]) return;
  mesh[CHAINED] = true;
  const nativeHook = mesh.onBeforeRender;
  mesh.onBeforeRender = function _oobRenderHook(renderer, scene, camera, geometry, material, group) {
    try { catchUpBeforeVisible(ch, nativeUpdateHair, nativeUpdateMaterials); } catch { /* presentation recovery must not break drawing */ }
    if (typeof nativeHook === 'function') {
      return nativeHook.call(this, renderer, scene, camera, geometry, material, group);
    }
  };
}

function queryStaticGround(ch, x, z, n, G) {
  const level = G?.level;
  if (typeof level?.queryBlocks !== 'function' || !Array.isArray(level.blocks)) return null;
  const ry = ch.root.position.y;
  const originY = ry + 0.55, maxDist = 1.25;
  const ids = level.queryBlocks(x, z, x, z,
    ch._oobGroundIds || (ch._oobGroundIds = []));
  let best = maxDist, bestBlock = null, bestAxis = -1, bestSign = 0;
  for (const id of ids) {
    const b = level.blocks[id];
    if (!b?.solid || !b.axes?.length) continue;
    const rx = x - b.center.x, rz = z - b.center.z;
    let tmin = -Infinity, tmax = Infinity, axisMin = -1, signMin = 0, miss = false;
    for (let k = 0; k < 3; k++) {
      const axis = b.axes[k], half = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;
      const origin = rx * axis.x + (originY - b.center.y) * axis.y + rz * axis.z;
      const direction = -axis.y;
      if (Math.abs(direction) < 1e-9) {
        if (origin < -half || origin > half) { miss = true; break; }
        continue;
      }
      let t1 = (-half - origin) / direction, t2 = (half - origin) / direction, sign = -1;
      if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; sign = 1; }
      if (t1 > tmin) { tmin = t1; axisMin = k; signMin = sign; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) { miss = true; break; }
    }
    if (miss || tmax < 0 || tmin < 0 || tmin > best) continue;
    best = tmin; bestBlock = b; bestAxis = axisMin; bestSign = signMin;
  }
  const hitY = originY - best;
  if (bestBlock && bestAxis >= 0) {
    const normal = bestBlock.axes[bestAxis];
    const ny = normal.y * bestSign;
    if (ny > 0.55 && hitY > ry - 0.55 && hitY < ry + 0.52) {
      if (n) n.copy(normal).multiplyScalar(bestSign);
      return hitY;
    }
  }
  if (n) n.set(0, 1, 0);
  return ry;
}

export function installOfflineOffscreenBudget(api, G) {
  const proto = api?.Character?.prototype;
  if (!proto || Object.hasOwn(proto, INSTALLED)) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });
  const nativeUpdate = proto.update;
  const nativeGround = proto._ground;
  const nativeUpdateHair = proto._updateHair;
  const nativeUpdateMaterials = proto._updateMaterials;
  const nativeApplyPose = proto._applyPose;
  const nativeTierSet = proto._tierSet;
  proto._oobBudget = false;
  proto._oobTicks = 0;
  proto._oobBudgetTicks = 0;
  proto._oobRaycastsSkipped = 0;
  proto._oobHairSkips = 0;
  proto._oobHairCatchUps = 0;
  proto._oobPoseCoreTicks = 0;
  proto._oobPoseDecorativeSkips = 0;
  proto._oobMaterialSkips = 0;
  proto._oobMaterialCatchUps = 0;
  proto._oobMaterialDirty = false;
  proto._oobCatchUps = 0;
  proto._oobWasBudgeted = false;
  proto._oobLastDt = 0;
  proto._oobLastState = null;

  if (typeof nativeTierSet === 'function') {
    proto._tierSet = function _oobTierSet(...args) {
      const tierSet = nativeTierSet.apply(this, args);
      try { chainRenderCatchup(this, tierSet, nativeUpdateHair, nativeUpdateMaterials); } catch { /* do not break tier construction */ }
      return tierSet;
    };
  }
  proto._ground = function _oobGround(x, z, n) {
    if (this._oobGroundBudget) {
      const exact = queryStaticGround(this, x, z, n, G);
      if (exact !== null) {
        this._oobRaycastsSkipped++;
        return exact;
      }
    }
    return nativeGround.call(this, x, z, n);
  };
  if (nativeUpdateHair) {
    proto._updateHair = function _oobUpdateHair(...args) {
      if (this._oobBudget) { this._oobHairSkips++; return undefined; }
      return nativeUpdateHair.apply(this, args);
    };
  }
  if (nativeApplyPose) {
    proto._applyPose = function _oobApplyPose(...args) {
      const budget = this._oobBudget;
      this._oobPoseTailSkipped = false;
      const result = nativeApplyPose.apply(this, args);
      if (budget) {
        this._oobPoseCoreTicks++;
        if (this._oobPoseTailSkipped) {
          this._oobPoseDecorativeSkips++;
          this._oobHairSkips++;
        }
      }
      return result;
    };
  }
  if (nativeUpdateMaterials) {
    proto._updateMaterials = function _oobUpdateMaterials(...args) {
      if (this._oobBudget) {
        this._oobMaterialDirty = true;
        this._oobMaterialSkips++;
        return undefined;
      }
      return nativeUpdateMaterials.apply(this, args);
    };
  }
  proto.update = function _oobUpdate(dt, s) {
    const budget = offlineBudgeted(this, s, G);
    const returning = !budget && this._oobWasBudgeted;
    this._oobWasBudgeted = budget;
    this._oobBudget = budget;
    this._oobGroundBudget = budget && s?.grounded !== false && this.feetValid && !this.replant;
    this._oobPoseTailSkip = budget && s?.grounded !== false && this.feetValid && !this.replant;
    this._oobTicks++;
    this._oobLastDt = dt;
    this._oobLastState = s;
    if (budget) this._oobBudgetTicks++;
    if (returning) {
      this.feetValid = false;
      this.headInit = false;
      this._headSet = false;
    }
    try {
      return nativeUpdate.call(this, dt, s);
    } finally {
      this._oobBudget = false;
      this._oobGroundBudget = false;
      this._oobPoseTailSkip = false;
    }
  };
  return true;
}
