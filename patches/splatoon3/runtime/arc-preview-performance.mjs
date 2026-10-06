// Trajectory-preview presentation budget for Issue #798.
//
// The native bomb/special arc preview (`Projectiles.updateArc` in
// `inkwave-public/src/game/weapons.js`) recomputes its full ballistic +
// collision path whenever the actor's exact position or throw velocity
// changes. While aiming/moving, that is every render frame: up to
// (arcN - 1) * 2 = 126 `Physics.segment()` queries per frame (about 7.5k/s
// at 60 FPS). The guide is pure presentation: the actual bomb uses
// `throwBomb()` + `_updateBombs()` and never reads the preview buffers.
//
// This wrapper keeps every native trajectory semantic (same integrator,
// same collision call, same drawn buffers, same landing marker) and only
// decouples the collision-query cadence from the render cadence:
//   - throttle native recomputation to ARC_PREVIEW_MIN_INTERVAL_S (30 Hz);
//   - within an interval, reuse the cached line and still refresh the
//     per-frame presentation state (colors, visibility, ring pulse);
//   - always recompute on hide/show, actor change, physics change, or a
//     throw-parameter change above a small quantization epsilon;
//   - never skip when the cached native result is stale or absent.
//
// Actual bomb gameplay physics, damage, paint, networking and lifecycle
// are untouched. The wrapper delegates to the original `updateArc` for
// every recomputation and every guard evaluation.
export const ARC_PREVIEW_MIN_INTERVAL_S = 1 / 30;
export const ARC_PREVIEW_POS_EPSILON = 0.05;
export const ARC_PREVIEW_VEL_EPSILON = 0.25;
export const ARC_PREVIEW_SPEED_EPSILON = 0.05;

const INSTALL = Symbol.for('inkwave.s3.arc-preview-performance.install.v1');
const STATE = Symbol('inkwave.s3.arc-preview-performance.state');

function previewInputs(system, api, actor) {
  const speed = api.SUB?.bomb?.throwSpeed;
  if (typeof system.throwVelocity !== 'function' || !Number.isFinite(speed)) return null;
  const scratch = system._arcPreviewPerfScratch
    || (system._arcPreviewPerfScratch = new api.THREE.Vector3());
  try {
    system.throwVelocity.call(system, actor, speed, scratch);
  } catch {
    return null;
  }
  return {
    px: actor.pos.x, py: actor.pos.y + 1.35, pz: actor.pos.z,
    vx: scratch.x, vy: scratch.y, vz: scratch.z,
    speed,
  };
}

function withinEpsilon(previous, current) {
  if (!previous || !current) return false;
  return Math.abs(previous.px - current.px) <= ARC_PREVIEW_POS_EPSILON
    && Math.abs(previous.py - current.py) <= ARC_PREVIEW_POS_EPSILON
    && Math.abs(previous.pz - current.pz) <= ARC_PREVIEW_POS_EPSILON
    && Math.abs(previous.vx - current.vx) <= ARC_PREVIEW_VEL_EPSILON
    && Math.abs(previous.vy - current.vy) <= ARC_PREVIEW_VEL_EPSILON
    && Math.abs(previous.vz - current.vz) <= ARC_PREVIEW_VEL_EPSILON
    && Math.abs((previous.speed ?? 0) - (current.speed ?? 0)) <= ARC_PREVIEW_SPEED_EPSILON;
}

function nativeCacheReady(system, physics) {
  const cache = system._arcCache;
  return !!(cache && Number.isFinite(cache.px) && Number.isFinite(cache.vx)
    && cache.physics === physics);
}

function refreshPresentationOnly(system, api, actor) {
  const cache = system._arcCache;
  const inkCost = api.SUB?.bomb?.inkCost;
  const hasInk = !(Number.isFinite(inkCost) && actor.ink < inkCost);
  const color = hasInk ? actor.color : system._arcPreviewPerfGrey
    || (system._arcPreviewPerfGrey = new api.THREE.Color(0.6, 0.6, 0.6));
  system.arcLine.material.color.copy(color).multiplyScalar(1.4);
  system.arcRing.material.color.copy(color).multiplyScalar(1.4);
  system.arcLine.visible = true;
  system.arcRing.visible = !!cache.landed;
  const now = api.G?.time;
  system.arcRing.scale.setScalar(1 + Math.sin((Number.isFinite(now) ? now : 0) * 8) * 0.06);
}

export function installArcPreviewPerformance(api) {
  const { G, Projectiles } = api;
  if (!Projectiles?.prototype?.updateArc || Projectiles.prototype[INSTALL]) return;
  const nativeUpdateArc = Projectiles.prototype.updateArc;
  Projectiles.prototype.updateArc = function (actor, show) {
    if (!show || !actor || !actor.alive) {
      delete this[STATE];
      return nativeUpdateArc.call(this, actor, show);
    }
    const now = Number.isFinite(G?.time) ? G.time : 0;
    const inputs = previewInputs(this, api, actor);
    const state = this[STATE];
    const actorChanged = !state || state.actor !== actor;
    const physicsChanged = !state || state.physics !== G.physics;
    const inputsUnknown = !inputs;
    const largeMove = !inputsUnknown && !withinEpsilon(state?.inputs, inputs);
    const cacheStale = !nativeCacheReady(this, G.physics);
    const intervalElapsed = !state || !Number.isFinite(state.time)
      || (now - state.time) >= ARC_PREVIEW_MIN_INTERVAL_S - 1e-9
      || now < state.time;
    const mustRecompute = actorChanged || physicsChanged || inputsUnknown
      || cacheStale || intervalElapsed || largeMove;
    if (!mustRecompute && state && state.inputs) {
      refreshPresentationOnly(this, api, actor);
      state.hits = (state.hits || 0) + 1;
      return;
    }
    const result = nativeUpdateArc.call(this, actor, show);
    this[STATE] = {
      actor, physics: G.physics, time: now,
      inputs: inputsUnknown ? null : { ...inputs },
      hits: 0,
    };
    return result;
  };
  Object.defineProperty(Projectiles.prototype, INSTALL, { value: true, configurable: false });
  Object.defineProperty(Projectiles.prototype, Symbol.for('inkwave.s3.arc-preview-performance.originals.v1'), {
    value: Object.freeze({ updateArc: nativeUpdateArc }), configurable: false,
  });
}
