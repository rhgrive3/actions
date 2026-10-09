// Offline bot offscreen Character visual budget - issue #845 residual.
//
// PR #1175's offscreen-visual-budget.mjs handles network replicas. Offline bots
// still run Character.update at fixed simulation cadence because their live
// weapon projectiles use the native rig-bone muzzle. This residual suppresses
// only hair spring integration and visual foot-IK ground queries for an offline
// bot that has not actually been submitted for a sustained renderer-frame span.
//
// This adapter covers ONLY that residual, and only with provably visual-only
// work on the native path (inkwave-public/src/game/character.js):
//   * _updateHair(dt) integrates the hx/hv/tipX/tipV spring chains and writes
//     hair-bone quaternions. Nothing outside the Character reads them for
//     gameplay: Actor, BotBrain, WeaponRunner/Projectiles (which read the
//     weapon rig bones via getMuzzle, not hair bones), movement, collision,
//     ink, damage, networking, Flow, LOD and clocks never touch them. While
//     long-undrawn the springs freeze and hidden-time debt is dropped, so no
//     catch-up burst flings strands on return.
//   * _updateFeet() gait/swing state still advances every tick (the pose reads
//     planted feet). Only the _ground() physics raycasts for swing/settle
//     targets use the native no-physics fallback (root.position.y, up normal)
//     - the exact value native _ground() returns when this.phys is unset.
//     Touchdown is preserved (_touchDown still plants the fallback-height
//     target and re-syncs the gait clock). On the first returning render, the
//     pre-submission hook re-queries feet with dt=0, so it restores contact
//     without advancing the gait phase twice.
//   * Pose, muzzle rig bones, squid, materials and LOD run unchanged, so
//     offline firing stays exact.
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

function catchUpBeforeVisible(ch, nativeUpdateHair) {
  if (!ch?._oobWasBudgeted) return false;
  const dt = Math.min(0.1, Math.max(0, Number(ch._oobLastDt) || 0));
  const s = ch._oobLastState;
  if (!ch.inWorld) return false;

  // Character.update already advanced clocks, gait and pose for this tick.
  // Replant/rebuild at dt=0 so no presentation clock or gait phase advances a
  // second time; hair receives this tick's dt once, without hidden-time debt.
  ch._oobBudget = false;
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
    ch._oobWasBudgeted = false;
    ch._oobCatchUps++;
    return true;
  } finally {
    ch._oobBudget = false;
  }
}

function chainRenderCatchup(ch, tierSet, nativeUpdateHair) {
  const mesh = tierSet?.list?.[0];
  if (!mesh || mesh[CHAINED]) return;
  mesh[CHAINED] = true;
  const nativeHook = mesh.onBeforeRender;
  mesh.onBeforeRender = function _oobRenderHook(renderer, scene, camera, geometry, material, group) {
    try { catchUpBeforeVisible(ch, nativeUpdateHair); } catch { /* presentation recovery must not break drawing */ }
    if (typeof nativeHook === 'function') {
      return nativeHook.call(this, renderer, scene, camera, geometry, material, group);
    }
  };
}

export function installOfflineOffscreenBudget(api, G) {
  const proto = api?.Character?.prototype;
  if (!proto || Object.hasOwn(proto, INSTALLED)) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });
  const nativeUpdate = proto.update;
  const nativeGround = proto._ground;
  const nativeUpdateHair = proto._updateHair;
  const nativeTierSet = proto._tierSet;
  proto._oobBudget = false;
  proto._oobTicks = 0;
  proto._oobBudgetTicks = 0;
  proto._oobRaycastsSkipped = 0;
  proto._oobHairSkips = 0;
  proto._oobHairCatchUps = 0;
  proto._oobCatchUps = 0;
  proto._oobWasBudgeted = false;
  proto._oobLastDt = 0;
  proto._oobLastState = null;

  if (typeof nativeTierSet === 'function') {
    proto._tierSet = function _oobTierSet(...args) {
      const tierSet = nativeTierSet.apply(this, args);
      try { chainRenderCatchup(this, tierSet, nativeUpdateHair); } catch { /* do not break tier construction */ }
      return tierSet;
    };
  }
  proto._ground = function _oobGround(x, z, n) {
    if (this._oobBudget) {
      this._oobRaycastsSkipped++;
      if (n) n.set(0, 1, 0);
      return this.root.position.y;
    }
    return nativeGround.call(this, x, z, n);
  };
  if (nativeUpdateHair) {
    proto._updateHair = function _oobUpdateHair(...args) {
      if (this._oobBudget) { this._oobHairSkips++; return undefined; }
      return nativeUpdateHair.apply(this, args);
    };
  }
  proto.update = function _oobUpdate(dt, s) {
    const budget = offlineBudgeted(this, s, G);
    const returning = !budget && this._oobWasBudgeted;
    this._oobWasBudgeted = budget;
    this._oobBudget = budget;
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
    }
  };
  return true;
}
