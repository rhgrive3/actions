// Bot / replica Character visuals on fixed ticks the screen never shows.
//
// Gameplay runs on the S3 fixed 60 Hz clock (patches/splatoon3/runtime/clock.mjs).
// When a device draws below 60 fps, each drawn frame runs 2 (at 24-30 fps up to 3)
// ticks, and every tick ran the full Character.update of every kid: pose, source
// motion retargeting, feet, hair, face, materials and LOD. Only the last tick's
// result is drawn, and in a crowd this visual work is the largest single CPU cost
// of a frame (profiled: ~34 % of a crowded frame), so a slow device paid it 2-3x
// exactly when it could least afford it.
//
// For bots and network replicas this defers Character.update on ticks that are
// not the clock's final tick before a draw and runs it once on the final tick with
// the summed dt (native update clamps dt to 0.1 s; the clock's 1/24 s frame clamp
// keeps the sum far below that). At 60 fps every tick is final: nothing changes.
//
// Accepted, measured trade-off (user decision 2026-10-13): on a deferred tick an
// offline bot's rig-bone muzzle still reflects its arm pose from the last drawn
// tick (root position/rotation are owned by the engine and stay current), so a
// shot fired on that tick leaves from an arm pose at most one or two ticks old;
// Character-driven events (foot touch-down sounds) shift by up to the same ticks;
// spring/smoothing integration takes one summed step instead of two or three.
// The local player, the Practice Range, menus/showcase and anything outside the
// clock's advance keep the full per-tick update.
const INSTALLED = Symbol.for('inkwave.local-quality.intermediate-tick-budget.v1');

/** true when this Character.update may be deferred to the clock's final tick. */
export function intermediateTickDeferred(ch, s, G) {
  if (!ch || !s || ch.s3IntermediateTickBudget === false) return false;
  const clock = G?.game?.s3Clock;
  if (!clock || clock.advancing !== true || clock.finalTick !== false) return false;
  if (s.isLocal || ch.isLocal) return false;
  if (G.match?.local && s === G.match.local) return false;
  if (s.isBot !== true && s.remote !== true) return false;
  if (!G.match || G.match.opts?.range) return false;
  if (!ch.inWorld) return false;
  return true;
}

export function installIntermediateTickBudget(api, G) {
  const proto = api?.Character?.prototype;
  if (!proto || Object.hasOwn(proto, INSTALLED)) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });
  const nativeUpdate = proto.update;
  proto._itbDeferredDt = 0;
  proto._itbDeferred = 0;   // observability only
  proto.update = function _itbUpdate(dt, s) {
    if (intermediateTickDeferred(this, s, G)) {
      this._itbDeferredDt += Number.isFinite(dt) && dt > 0 ? dt : 0;
      this._itbDeferred++;
      return undefined;
    }
    const owed = this._itbDeferredDt;
    if (owed > 0) { this._itbDeferredDt = 0; dt = (Number.isFinite(dt) && dt > 0 ? dt : 0) + owed; }
    return nativeUpdate.call(this, dt, s);
  };
  return true;
}
