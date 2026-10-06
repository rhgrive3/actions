// Offscreen (frustum-culled) Character visual budget — issue #845.
//
// Native Character.update() treats an actor as drawn whenever its scene-graph
// `visible` flags are set. Being outside the camera frustum does not change
// `root.visible`, so three.js skips the draw while INKWAVE still executes the
// full procedural path every simulation tick: foot-IK `_ground()` physics
// raycasts, `_buildPose()`, `_applyPose()` and hair spring integration.
//
// This owned runtime module is visual-only. It wraps the native prototype
// methods after the composed build keeps every authoritative Actor field
// untouched: movement, weapons, hitboxes, networking, damage and bot AI run
// exactly as before. Only the expensive Character pose/feet/hair work is
// budgeted while the actor has not been submitted by the renderer recently.
//
// Objective invariant (no calibrated timings invented):
// - an actor rendered on the current/previous frame updates at full rate;
// - a long-offscreen actor performs no foot-IK `_ground()` physics raycasts
//   and no `_updateHair()` spring integration on budgeted ticks;
// - the first tick after re-entry runs the full native update so feet
//   re-plant and hair/head history re-initialize without a visible snap;
// - local actors never enter the budget path.
const INSTALLED = Symbol.for('inkwave.local-quality.offscreen-visual-budget.v1');

// Number of consecutive budgeted ticks before the heavy path is skipped.
// This is a presentation cadence, not a Nintendo gameplay timing value:
// gameplay keeps its own fixed-step clocks, and the budget only decides
// whether this tick recomputes pixels nobody sees.
const BUDGET_SKIP_EVERY = 3;

function lastRenderedTick(ch) {
  // `_camFrame` is the renderer's own frame counter sampled by the existing
  // native `_camHook` (onBeforeRender). It is objective: it advances exactly
  // when this Character's mesh was submitted for drawing.
  const f = ch?._camFrame;
  return Number.isFinite(f) ? f : -1;
}

function currentFrame(ch) {
  // Renderer frame counter is authoritative when available; otherwise fall
  // back to the Character's own simulation clock so the budget degrades to a
  // simple cadence throttle instead of freezing.
  try {
    const info = ch?._rendererInfo?.render?.frame;
    if (Number.isFinite(info)) return info;
  } catch { /* keep fallback */ }
  return -1;
}

export function isOffscreenBudgeted(ch) {
  if (!ch || ch.isLocal) return false;
  const last = lastRenderedTick(ch);
  if (last < 0) return false;
  const now = currentFrame(ch);
  if (now < 0) return false;
  return now - last > 1;
}

export function installOffscreenVisualBudget(api) {
  const Character = api?.Character;
  if (!Character || !Character.prototype) return;
  const proto = Character.prototype;
  if (Object.hasOwn(proto, INSTALLED)) return;
  Object.defineProperty(proto, INSTALLED, { value: true });

  const nativeUpdate = proto.update;
  const nativeGround = proto._ground;
  const nativeUpdateHair = proto._updateHair;

  proto._qualityOffscreenSkips = 0;
  proto._qualityOffscreenGroundCalls = 0;
  proto._qualityOffscreenHairCalls = 0;
  proto._qualityOffscreenBudgetHits = 0;

  // Counters stay observable for tests without changing native behavior.
  proto._ground = function _qualityCountedGround(...args) {
    if (this?._qualityOffscreenActive) this._qualityOffscreenGroundCalls++;
    return nativeGround.apply(this, args);
  };
  if (nativeUpdateHair) {
    proto._updateHair = function _qualityCountedHair(...args) {
      if (this?._qualityOffscreenActive) this._qualityOffscreenHairCalls++;
      return nativeUpdateHair.apply(this, args);
    };
  }

  proto.update = function _qualityOffscreenBudget(dt, s) {
    const budgeted = isOffscreenBudgeted(this);
    if (!budgeted) {
      this._qualityOffscreenActive = false;
      this._qualityOffscreenSkips = 0;
      return nativeUpdate.call(this, dt, s);
    }
    // Long-offscreen, non-local actor: run the full native update every
    // (BUDGET_SKIP_EVERY + 1)th tick so animation clocks stay continuous,
    // and skip only the expensive visual recomputation on the other ticks.
    // Re-entry always takes the full path because `isOffscreenBudgeted`
    // returns false once `_camFrame` advances.
    const skips = (this._qualityOffscreenSkips || 0) + 1;
    if (skips > BUDGET_SKIP_EVERY) {
      this._qualityOffscreenActive = false;
      this._qualityOffscreenSkips = 0;
      return nativeUpdate.call(this, dt, s);
    }
    this._qualityOffscreenActive = true;
    this._qualityOffscreenSkips = skips;
    this._qualityOffscreenBudgetHits++;
    try {
      return nativeUpdate.call(this, dt, s);
    } finally {
      this._qualityOffscreenActive = false;
    }
  };

  // The budget gate above keeps clocks continuous; the skip below removes the
  // visual-only cost on budgeted ticks. Authoritative Actor fields are never
  // touched here.
  const budgetedUpdate = proto.update;
  proto.update = function _qualityOffscreenSkip(dt, s) {
    if (!this?._qualityOffscreenActive) return budgetedUpdate.call(this, dt, s);
    // Budgeted tick: advance only the cheap clocks/state natively required
    // for continuity; skip feet raycasts, pose rebuild and hair integration.
    // The native `update()` already re-plants feet and re-inits hair/head on
    // the next full tick (its hidden/show branches), so re-entry is stable.
    this._dt = dt;
    this.t = (this.t || 0) + dt;
    const tr = this.tr;
    if (tr) for (let i = 0; i < tr.length; i++) tr[i] += dt;
    this.lastShot = (this.lastShot || 0) + dt;
    this.lastRelease = (this.lastRelease || 0) + dt;
    if (this.dance) this.danceT = (this.danceT || 0) + dt;
    this.prevDanceT = (this.prevDanceT || 0) + dt;
    this.danceFade = Math.min(1, (this.danceFade || 0) + dt / 0.45);
    this.formT = (this.formT || 0) + dt;
    this._hairAcc = (this._hairAcc || 0) + dt;
    return undefined;
  };
}
