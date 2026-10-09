// Offline offscreen Character visual budget - issue #845 residual.
//
// PR #1175/#1168 (offscreen-visual-budget.mjs) budgets only network replicas
// (s.remote === true), a deliberate muzzle-authority guard: an offline-owned
// bot fires live projectiles from its rig bones (weapons.js _muzzle ->
// Character.getMuzzle), so its pose must keep being rebuilt. That leaves the
// issue's own offline repro uncovered: a live offline Turf/Boss match with
// seven non-local bots behind the camera still runs hair spring integration
// and foot-IK _ground() physics raycasts at simulation cadence for actors
// nobody draws.
//
// This adapter covers ONLY that residual, and only with provably visual-only
// work on the native path (inkwave-public/src/game/character.js):
//   * _updateHair(dt) integrates the hx/hv/tipX/tipV spring chains and writes
//     hair-bone quaternions. Nothing outside the Character reads them for
//     gameplay: Actor, BotBrain, WeaponRunner/Projectiles (which read the
//     weapon rig bones via getMuzzle, not hair bones), movement, collision,
//     ink, damage, networking, Flow, LOD and clocks never touch them. While
//     long-undrawn the springs freeze and dt debt is dropped (not summed), so
//     no catch-up burst flings strands on return.
//   * _updateFeet() gait/swing state still advances every tick (the pose reads
//     planted feet). Only the _ground() physics raycasts for swing/settle
//     targets use the native no-physics fallback (root.position.y, up normal)
//     - the exact value native _ground() returns when this.phys is unset.
//     Touchdown is preserved (_touchDown still plants the fallback-height
//     target and re-syncs the gait clock), and the return tick replants via
//     the native feetValid=false invalidation.
//   * Pose, muzzle rig bones, squid, materials and LOD run unchanged, so
//     offline firing stays exact.
//
// Draw signal: native _camHook (onBeforeRender) records _camFrame only when
// really submitted. Long-undrawn is counted in renderer frames owned by this
// layer - no Nintendo timing invented, no frustum math duplicated. Stale draw
// alone gates the budget, so camera-turn races and shadow passes can only keep
// full rate, never budget a drawn actor. Range, local actors, remotes (sibling
// adapter), forced LOD, menus and never-drawn characters stay full rate.
// Units: grace is renderer frames (presentation cadence), never world units.
const INSTALLED = Symbol.for('inkwave.local-quality.offline-offscreen-budget.v1');
export const GRACE_FRAMES = 30;
export function offlineBudgeted(ch, s, G) {
  if (!ch || !s) return false;
  if (s.isLocal || ch.isLocal) return false;
  if (G?.match?.local && s === G.match.local) return false;
  if (s.remote === true) return false;
  if (G?.match?.opts?.range) return false;
  if (!ch.inWorld) return false;
  if (ch.lod && ch.lod.force >= 0) return false;
  const last = ch._camFrame;
  if (!Number.isFinite(last) || last < 0) return false;
  const frame = G?.renderer?.info?.render?.frame;
  if (!Number.isFinite(frame)) return false;
  return frame - last >= GRACE_FRAMES;
}
export function installOfflineOffscreenBudget(api, G) {
  const proto = api?.Character?.prototype;
  if (!proto || Object.hasOwn(proto, INSTALLED)) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });
  const nativeUpdate = proto.update;
  const nativeGround = proto._ground;
  const nativeUpdateHair = proto._updateHair;
  proto._oobBudget = false;
  proto._oobTicks = 0;
  proto._oobBudgetTicks = 0;
  proto._oobRaycastsSkipped = 0;
  proto._oobHairSkips = 0;
  proto._oobWasBudgeted = false;
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
