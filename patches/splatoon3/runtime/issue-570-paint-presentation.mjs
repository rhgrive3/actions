const INSTALLED = Symbol.for('inkwave.issue570.paint-body-presentation');
const GROWTH_CAPTURE = Symbol.for('inkwave.issue570.paint-growth-capture');

function captureGrowthPush(g) {
  const state = this[GROWTH_CAPTURE];
  if (state?.depth) state.frames[state.depth - 1].growth = g;
  return state.nativePush.call(this, g);
}

function growthCaptureFor(growing) {
  let state = growing[GROWTH_CAPTURE];
  if (!state) {
    state = { nativePush: growing.push, depth: 0, frames: [] };
    Object.defineProperty(growing, GROWTH_CAPTURE, { value: state });
    Object.defineProperty(growing, 'push', { value: captureGrowthPush, writable: true, configurable: true });
  }
  return state;
}

// Keep the gameplay grid authoritative while making its full native body visible on the landing call.
export function installIssue570PaintPresentation(PaintSystem) {
  const proto = PaintSystem?.prototype;
  if (!proto || typeof proto.splat !== 'function' || typeof proto._emitGrowth !== 'function' || typeof proto._pushQuad !== 'function') {
    throw new TypeError('Issue #570 paint presentation requires native splat, growth, and quad methods');
  }
  if (proto[INSTALLED]) return false;

  const nativeSplat = proto.splat;
  const nativeEmitGrowth = proto._emitGrowth;

  proto._emitGrowth = function issue570EmitGrowth(g, tn, dT, dripOnly, bodyOnly = false) {
    if (!bodyOnly) return nativeEmitGrowth.call(this, g, tn, dT, dripOnly);

    const hadOwnPush = Object.prototype.hasOwnProperty.call(this, '_pushQuad');
    const previousPush = this._pushQuad;
    this._pushQuad = function issue570BodyQuad(...args) {
      const modeIndex = args.length - 1;
      if (args[modeIndex] !== 0) throw new Error('Issue #570 body-only draw expected a native body quad');
      args[modeIndex] = 2; // aGrow.z: 0 = growth, 1 = drips only, 2 = body only (shader adapter above)
      return previousPush.apply(this, args);
    };
    try {
      return nativeEmitGrowth.call(this, g, tn, dT, dripOnly);
    } finally {
      if (hadOwnPush) this._pushQuad = previousPush;
      else delete this._pushQuad;
    }
  };

  proto.splat = function issue570Splat(center, radius, team, opts = {}) {
    if (opts.cosmetic || opts.instant || !Array.isArray(this.growing)) {
      return nativeSplat.call(this, center, radius, team, opts);
    }

    // Capture the native append itself; this also works if a separate adapter reuses a growth record object.
    const state = growthCaptureFor(this.growing);
    const frame = state.frames[state.depth] || (state.frames[state.depth] = { growth: null });
    frame.growth = null;
    state.depth++;
    let claimed, g;
    try {
      claimed = nativeSplat.call(this, center, radius, team, opts);
      g = frame.growth;
    } finally {
      state.depth--;
      frame.growth = null;
    }
    if (g && g.team === team && g.kind !== 7) this._emitGrowth(g, 3, 0, false, true);
    return claimed;
  };

  Object.defineProperty(proto, INSTALLED, { value: true });
  return true;
}
