// Coalesce atlas submissions within a single fixed-clock slice. Every quad is
// kept in its original order; a dry pass, batch overflow, unusual paint state
// or the slice's last tick uses the existing draw path. The CPU paint clock,
// ownership, growth, drying and public quad arrays remain unchanged.
import * as THREE from 'three';

const STEP = 1 / 60;
const MAX_QUADS = 6000;
const INSTALLED = Symbol.for('inkwave.native-paint-tick-batch.v1');
const STATE = Symbol.for('inkwave.native-paint-tick-batch.state.v1');

function attach(paint, G) {
  const advance = paint.advanceSimulation, draw = paint._drawQuads;
  const push = paint._pushQuad, flush = paint.flush, clear = paint.clear;
  if ([advance, draw, push, flush].some(f => typeof f !== 'function')) return null;
  const material = paint.mat, mesh = paint.mesh, geometry = paint.geo;
  const target = paint.rt, positions = paint.aPos, scene = paint.scene, camera = paint.cam;
  if (!material || !mesh || !geometry || !target?.texture || !positions || !scene || !camera) return null;
  const vertexShader = material.vertexShader, fragmentShader = material.fragmentShader, uniforms = material.uniforms;
  let advancing = false, pending = false;

  // This path is deliberately limited to the known, unmodified offline Turf
  // owner. Any unknown owner, hooks, render target or paint-clock state falls
  // back to the existing synchronous implementation.
  function ready() {
    const game = G.game, clock = game?.s3Clock, match = game?.match;
    const accumulator = paint._paintSimulationAccumulator;
    return !!(clock?.advancing && G.paint === paint && G.mode === 'match' && !G.netm &&
      match && match.mode === 'turf' && match.state === 'playing' && !match.ranked && !match.paused &&
      paint.level?.native && !globalThis.document?.hidden && paint.geo === geometry &&
      paint.aPos === positions && positions.length === MAX_QUADS * 8 &&
      paint._paintUsesFixedClock === true && Number.isFinite(accumulator) &&
      Math.abs(accumulator - (advancing ? STEP : 0)) < 1e-9 &&
      paint.scene === scene && paint.cam === camera && paint.mesh === mesh &&
      mesh.geometry === geometry && mesh.material === material && paint.mat === material &&
      paint.rt === target && !target.texture.generateMipmaps && !paint._mipRequested &&
      !paint._paintRenderError && !paint._hiddenQuads?.length && !paint._hiddenPaintGrowth?.size &&
      material.vertexShader === vertexShader && material.fragmentShader === fragmentShader && material.uniforms === uniforms &&
      mesh.onBeforeRender === THREE.Object3D.prototype.onBeforeRender &&
      mesh.onAfterRender === THREE.Object3D.prototype.onAfterRender &&
      material.onBeforeRender === THREE.Material.prototype.onBeforeRender &&
      material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile &&
      scene.onBeforeRender === THREE.Scene.prototype.onBeforeRender &&
      scene.onAfterRender === THREE.Scene.prototype.onAfterRender);
  }
  function boundary() {
    return !Number.isFinite(paint._dryAcc) || Math.floor((paint._dryAcc + STEP) * 40) >= 2 ||
      !Number.isFinite(paint.clock) || !Number.isFinite(paint._wetUntil) || paint.clock >= paint._wetUntil;
  }
  function emitPending() {
    if (!paint.quads) { pending = false; return; }
    // Pending quads precede any dry pass belonging to the next tick.
    const dry = paint.dryMesh.visible;
    paint.dryMesh.visible = false;
    try { return draw.call(paint); }
    finally { paint.dryMesh.visible = dry; pending = !!paint.quads; }
  }
  const wrappedPush = function () {
    if (!advancing && pending && (!ready() || boundary())) emitPending();
    return push.apply(this, arguments);
  };
  const wrappedDraw = function () {
    const clock = G.game?.s3Clock;
    if (advancing && ready() && clock?.finalTick === false && this.quads > 0 &&
        this.quads < MAX_QUADS && !this.dryMesh.visible) {
      pending = true;
      return;
    }
    try { return draw.apply(this, arguments); }
    finally { if (!this.quads) pending = false; }
  };
  const wrappedAdvance = function (elapsed) {
    if (pending && (!ready() || elapsed !== STEP || boundary())) emitPending();
    if (!ready() || elapsed !== STEP) return advance.call(this, elapsed);
    const previous = advancing;
    advancing = true;
    try { return advance.call(this, elapsed); }
    finally { advancing = previous; }
  };
  const wrappedFlush = function () {
    try { return flush.apply(this, arguments); }
    finally { if (!this.quads) pending = false; }
  };
  const wrappedClear = typeof clear === 'function' ? function () {
    const result = clear.apply(this, arguments);
    pending = false;
    return result;
  } : null;
  paint._pushQuad = wrappedPush;
  paint._drawQuads = wrappedDraw;
  paint.advanceSimulation = wrappedAdvance;
  paint.flush = wrappedFlush;
  if (wrappedClear) paint.clear = wrappedClear;
  return {
    dispose() {
      if (pending && paint.quads && !globalThis.document?.hidden) emitPending();
      if (paint._pushQuad === wrappedPush) paint._pushQuad = push;
      if (paint._drawQuads === wrappedDraw) paint._drawQuads = draw;
      if (paint.advanceSimulation === wrappedAdvance) paint.advanceSimulation = advance;
      if (paint.flush === wrappedFlush) paint.flush = flush;
      if (wrappedClear && paint.clear === wrappedClear) paint.clear = clear;
    },
  };
}

export function installNativePaintTickBatch(PaintSystem, G) {
  const P = PaintSystem?.prototype;
  if (!P || Object.hasOwn(P, INSTALLED)) return false;
  const init = P._initGPU, dispose = P.dispose;
  if (typeof init !== 'function' || typeof dispose !== 'function') return false;
  P._initGPU = function () {
    this[STATE]?.dispose();
    this[STATE] = null;
    const result = init.apply(this, arguments);
    if (this.level?.native) this[STATE] = attach(this, G);
    return result;
  };
  P.dispose = function () {
    this[STATE]?.dispose();
    this[STATE] = null;
    return dispose.apply(this, arguments);
  };
  Object.defineProperty(P, INSTALLED, { value: true });
  return true;
}
