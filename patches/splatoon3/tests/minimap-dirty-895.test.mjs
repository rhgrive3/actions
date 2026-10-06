// Issue #895: the live minimap must not rescan/copy the whole W*H raster for a
// localized paint change. Adapter patches/splatoon3/minimap-dirty-adapter.mjs +
// owned helper runtime/minimap-dirty.mjs; inkwave-public is immutable.
//
// The strongest claim here is equivalence: the partial path and a forced
// whole-map refresh are compared byte-for-byte on the real Minimap class for all
// three stage layouts. This is logic/CPU-level evidence only — no browser
// canvas, no GPU and no hardware speedup is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptMinimapDirty } from '../minimap-dirty-adapter.mjs';
import { installMinimapDirty } from '../runtime/minimap-dirty.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel, code = read('inkwave-public/' + rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

// Real stage layouts from the Issue (metres), mapped at the default 7 px/m.
const STAGES = {
  Tidewater: { W: 50, D: 88 },
  Kelpline: { W: 48, D: 96 },
  Halyard: { W: 48, D: 92 },
};
const PX_PER_M = 7;
const CELL = 0.25;

class PaintSystem {}   // stub class the helper hangs _inkMark on
// The helper installs _inkMark on the paint prototype; do it once here so the
// bounds-recording test can drive it directly without booting a full minimap.
installMinimapDirty({ Minimap: class {}, PaintSystem });

function makeStage({ W, D }) {
  const nu = Math.round(W / CELL), nv = Math.round(D / CELL);
  const face = {
    origin: { x: 0, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 },
    su: W, sv: D, nu, nv, cu: W / nu, cv: D / nv, grid: 0, turf: true, block: 0,
  };
  const level = { bounds: { minX: 0, maxX: W, minZ: 0, maxZ: D }, blocks: [], spawnPads: [{ x: 2, z: 2 }, { x: W - 2, z: D - 2 }], spawnBarrier: 4 };
  const makePaint = () => ({ grid: new Uint8Array(nu * nv), dead: new Uint8Array(nu * nv), paintFaces: [face], version: 0, cell: CELL });
  return { level, makePaint, face, nu, nv };
}

function makeHarness({ minimapOff = false } = {}) {
  const state = { minimapOff, paints: [] };
  const mkCtx = (canvas) => ({
    _canvas: canvas,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: () => ({ data: [] }), putImageData() {}, drawImage() {},
    save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    fillRect() {}, clearRect() {}, setLineDash() {}, closePath() {},
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineDashOffset: 0,
  });
  const mkCanvas = () => {
    const c = { _w: 0, _h: 0 };
    Object.defineProperty(c, 'width', { get: () => c._w, set: (v) => { c._w = v; }, enumerable: true });
    Object.defineProperty(c, 'height', { get: () => c._h, set: (v) => { c._h = v; }, enumerable: true });
    c.getContext = () => mkCtx(c);
    return c;
  };
  const G = { settings: { minimap: minimapOff ? false : true }, match: { attract: false }, teamHex: ['#ff8a14', '#2f5bff'], projectiles: null, game: { theme: 'day' } };
  const sandbox = {
    console, Math, JSON, Object, Array, Float32Array, Int32Array, Int8Array, Uint8Array, Uint8ClampedArray, Map, Set, Infinity, Number, String, Boolean, Error,
    G, document: { createElement: () => mkCanvas() },
    requestIdleCallback: () => 1, setTimeout: () => 1,
    __G: G, __state: state,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  let code = compose('src/game/minimap.js');
  code = code.replace("import { G, on } from '../core/ctx.js';", 'const on = () => () => {};');
  code = code.replace("import { SPECIALS, SUB } from '../config.js';", 'const SPECIALS = { slam: { radius: 3 }, storm: { radius: 3.4 } }; const SUB = { bomb: { radius: 3, fuse: 1 } };');
  code = code.replace(/export class Minimap/, 'class Minimap');
  code += '\n;globalThis.__Minimap = Minimap;';
  vm.runInContext(code, context, { filename: 'minimap.js' });
  const Minimap = context.__Minimap;
  installMinimapDirty({ Minimap, PaintSystem });
  return { G, state, context, Minimap };
}

// Per-instance raster instrumentation: every putImageData dirty rectangle.
function instrument(mm, stage) {
  const rec = { ink: [], flash: [], drawCalls: 0, baseCalls: 0 };
  mm.ictx.putImageData = (img, dx, dy, x, y, w, h) => { rec.ink.push({ x, y, w, h }); };
  mm.fctx.putImageData = (img, dx, dy, x, y, w, h) => { rec.flash.push({ x, y, w, h }); };
  const draw = mm._drawInk.bind(mm);
  mm._drawInk = function (...args) { rec.drawCalls++; return draw(...args); };
  const base = mm._drawBase.bind(mm);
  mm._drawBase = function () { rec.baseCalls++; return base(); };
  rec.area = () => [...rec.ink, ...rec.flash].reduce((s, r) => s + r.w * r.h, 0);
  rec.stage = stage;
  return rec;
}

// Paint a small disc of cells and mark exactly those cells dirty, the way the
// adapter hook in _cpuSplat does.
function splat(paint, stage, cx, cz, rCells, team = 1) {
  const { nu, nv, face } = stage;
  const ci = Math.round(cx / face.cu - 0.5), cj = Math.round(cz / face.cv - 0.5);
  let touched = 0;
  for (let j = cj - rCells; j <= cj + rCells; j++) {
    for (let i = ci - rCells; i <= ci + rCells; i++) {
      if (i < 0 || j < 0 || i >= nu || j >= nv) continue;
      const k = j * nu + i;
      if (paint.grid[k] === team) continue;
      paint.grid[k] = team;
      PaintSystem.prototype._inkMark.call(paint, face, i, j);
      touched++;
    }
  }
  paint.version++;
  return touched;
}

const bytes = arr => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');

// The ink layer is the authoritative raster and a pure function of the grid, so
// it must match a whole-map refresh byte-for-byte. The flash overlay is a
// transition-history channel: the whole-map path clears flash alpha for every
// row it processes, while a bounded refresh only reprocesses its own rectangle.
// Any divergence is therefore allowed *outside* that rectangle and must be
// exactly zero inside it (no stale ink pixel can hide in the redrawn region).
function flashDiff(partial, ref, rect, W, H) {
  let inside = 0, outside = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4 + 3;
      if (partial[o] === ref[o]) continue;
      if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) inside++;
      else outside++;
    }
  }
  return { inside, outside };
}

test('#895 adapter anchors are exact, unique and fail-closed; #419 anchors survive', async () => {
  const raw = read('inkwave-public/src/world/paint.js');
  const out = compose('src/world/paint.js');
  assert.notEqual(out, raw);
  assert.match(out, /this\.grid\[k\] = val;\n        if \(this\._inkMark\) this\._inkMark\(f, i, j\);/);
  assert.match(out, /this\.version\+\+;\n    if \(this\.inkDirty\) this\.inkDirty\.full = true;/);
  // re-composition of an already-built tree is idempotent ...
  assert.equal(adaptSource('src/world/paint.js', out), out);
  // ... but a genuine upstream drift to the write site still fails closed
  const paintDrift = raw.replace('        this.grid[k] = val;\n        claimed += cellA;', '        this.grid[k] = val; claimed += cellA;');
  assert.throws(() => adaptSource('src/world/paint.js', paintDrift), /conflict/);

  const mmRaw = read('inkwave-public/src/game/minimap.js');
  const mm = compose('src/game/minimap.js');
  assert.notEqual(mm, mmRaw);
  assert.match(mm, /_drawInk\(y0 = 0, y1 = this\.h, x0 = 0, x1 = this\.w\) \{/);
  assert.match(mm, /for \(let px = x0; px < x1; px\+\+\)/);
  assert.match(mm, /putImageData\(this\.inkImg, 0, 0, x0, y0, x1 - x0, y1 - y0\)/);
  assert.match(mm, /putImageData\(this\.flashImg, 0, 0, x0, y0, x1 - x0, y1 - y0\)/);
  assert.match(mm, /else this\._drawDirtyInk\(_rec\);/);
  assert.equal(adaptSource('src/game/minimap.js', mm), mm);
  const mmDrift = mmRaw.replace('  _drawInk(y0 = 0, y1 = this.h) {', '  _drawInk(y0 = 0, y1 = this.h, extra) {');
  assert.throws(() => adaptSource('src/game/minimap.js', mmDrift), /conflict/);
  // the local-quality #419 build-only adapter still composes on top
  assert.match(mm, /const mkRes = \(G\.settings\?\.minimap === false\) \? mkMin : mk;/);
  // the new sub-adapter is a no-op for any file that is not paint/minimap: it
  // must never claim an anchor (the throw-on-apply replaceOnce proves that).
  const noAnchor = () => { throw new Error('adaptMinimapDirty applied an anchor to an unrelated file'); };
  assert.equal(adaptMinimapDirty('src/main.js', 'x', noAnchor), 'x');
  assert.equal(adaptMinimapDirty('src/game/match.js', 'y', noAnchor), 'y');
});

test('#895 _inkMark records real map-space bounds of changed turf cells only', async () => {
  const face = { origin: { x: 10, y: 0, z: 20 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, cu: 0.25, cv: 0.25, nu: 10, nv: 10, grid: 0, turf: true };
  const paint = { dead: new Uint8Array(100) };
  const mark = (f, i, j) => PaintSystem.prototype._inkMark.call(paint, f, i, j);

  mark(face, 2, 3);
  assert.ok(paint.inkDirty, 'a dirty record is created on the first changed cell');
  assert.equal(paint.inkDirty.gen, 1);
  assert.equal(paint.inkDirty.x0, 10 + 2.5 * 0.25);
  assert.equal(paint.inkDirty.x1, 10 + 2.5 * 0.25);
  assert.equal(paint.inkDirty.z0, 20 + 3.5 * 0.25);
  assert.equal(paint.inkDirty.full, false, 'a normal paint change is a partial invalidation');

  mark(face, 4, 3);
  assert.equal(paint.inkDirty.x1, 10 + 4.5 * 0.25, 'bounds grow to the far cell');
  assert.equal(paint.inkDirty.x0, 10 + 2.5 * 0.25, 'the near edge is kept');

  const before = paint.inkDirty.gen;
  mark({ ...face, turf: false }, 9, 9);
  assert.equal(paint.inkDirty.gen, before, 'a non-turf face has no minimap pixels');
  paint.dead[5 * 10 + 5] = 1;
  mark(face, 5, 5);
  assert.equal(paint.inkDirty.gen, before, 'a buried (dead) cell has no minimap pixels');
});

for (const [name, bounds] of Object.entries(STAGES)) {
  test(`#895 ${name}: partial redraw is byte-identical to a whole-map refresh and bounded`, async () => {
    const stage = makeStage(bounds);
    const h = makeHarness();
    const paint = stage.makePaint();
    const mm = new h.Minimap(stage.level, paint);
    const rec = instrument(mm, stage);
    const W = mm.w, H = mm.h;
    assert.equal(W, Math.round(bounds.W * PX_PER_M));
    assert.equal(H, Math.round(bounds.D * PX_PER_M));

    mm.update(0.016, true);                      // initial whole-map build
    const initialInk = bytes(mm.inkImg.data), initialFlash = bytes(mm.flashImg.data);
    assert.equal(rec.ink.length, 1);
    assert.deepEqual(rec.ink[0], { x: 0, y: 0, w: W, h: H }, 'the first refresh is the whole map');

    // A steady localized fight: successive small splats, each consumed by the
    // ordinary 150 ms gate (no force). Recorded against a reference minimap that
    // is force-refreshed whole-map at every step (the pre-change behaviour).
    const ref = new h.Minimap(stage.level, stage.makePaint ? stage.makePaint() : paint);
    // The reference must see identical grid mutations.
    const refPaint = ref.paint;
    const refRec = instrument(ref, stage);
    ref.update(0.016, true);

    const steps = [[12, 20], [13, 20], [14, 21], [14, 22], [15, 22], [15, 23]];
    let partialArea = 0, fullArea = 0;
    for (const [cx, cz] of steps) {
      splat(paint, stage, cx, cz, 3, 1);
      const touchedRef = splat(refPaint, stage, cx, cz, 3, 1);
      assert.ok(touchedRef > 0, 'the reference really changed cells');
      rec.ink.length = 0; rec.flash.length = 0;
      mm.update(0.2);
      ref.update(0.2, true);
      partialArea += rec.area();
      fullArea += refRec.area();
      assert.deepEqual(bytes(mm.inkImg.data), bytes(ref.inkImg.data), `${name}: ink layer identical at step (${cx},${cz})`);
      const fd = flashDiff(mm.flashImg.data, ref.flashImg.data, rec.ink[0], W, H);
      assert.equal(fd.inside, 0, `${name}: flash identical inside the redrawn rect at step (${cx},${cz})`);
      assert.ok(rec.ink[0].w * rec.ink[0].h < W * H / 4, `${name}: the refresh is a sub-region, not the whole map`);
    }
    assert.ok(partialArea > 0, 'the partial path really drew');
    assert.ok(partialArea < fullArea * 0.05,
      `${name}: processed putImageData area ${partialArea} should be far below the whole-map ${fullArea}`);
    assert.deepEqual(bytes(mm.inkImg.data), bytes(ref.inkImg.data));
    assert.notDeepEqual(initialInk, bytes(mm.inkImg.data), 'painting actually changed the ink layer');
    assert.notDeepEqual(initialFlash, bytes(mm.flashImg.data));
  });
}

test('#895 full invalidations still repaint the whole map', async () => {
  const stage = makeStage(STAGES.Tidewater);
  const h = makeHarness();
  const paint = stage.makePaint();
  const mm = new h.Minimap(stage.level, paint);
  const rec = instrument(mm, stage);
  mm.update(0.016, true);
  const W = mm.w, H = mm.h;

  // 1) PaintSystem.clear() marks a whole-map invalidation. Create the dirty
  // record the way a real splat does first, then raise the whole-map flag.
  PaintSystem.prototype._inkMark.call(paint, stage.face, 1, 1);
  paint.inkDirty.full = true;
  rec.ink.length = 0;
  mm.update(0.2);
  assert.deepEqual(rec.ink[0], { x: 0, y: 0, w: W, h: H }, 'clear() repaints the whole map');

  // 2) viewer-team flip invalidates the raster (native version = -1).
  rec.ink.length = 0;
  mm.setViewerTeam(1);
  mm.update(0.2);
  assert.deepEqual(rec.ink[0], { x: 0, y: 0, w: W, h: H }, 'a viewer flip repaints the whole map');

  // 3) team colour change invalidates through the existing teamKey guard.
  h.G.teamHex = ['#ff0000', '#00ff00'];
  rec.ink.length = 0;
  mm.update(0.2, false);
  assert.deepEqual(rec.ink[0], { x: 0, y: 0, w: W, h: H }, 'a team-colour change repaints the whole map');

  // 4) theme change redraws the whole static base layer.
  rec.baseCalls = 0;
  h.G.game.theme = 'sunset';
  mm.update(0.2, false);
  assert.ok(rec.baseCalls >= 1, 'a theme change redraws the base layer');
});

test('#895 a large repaint keeps the existing 3-band spike bound', async () => {
  const stage = makeStage(STAGES.Kelpline);
  const h = makeHarness();
  const paint = stage.makePaint();
  const mm = new h.Minimap(stage.level, paint);
  const rec = instrument(mm, stage);
  mm.update(0.016, true);
  const W = mm.w, H = mm.h;

  // paint the whole stage, then consume it through the dirty path
  for (let k = 0; k < paint.grid.length; k++) {
    if (!paint.grid[k]) { paint.grid[k] = 1; const j = Math.floor(k / stage.nu), i = k % stage.nu; PaintSystem.prototype._inkMark.call(paint, stage.face, i, j); }
  }
  paint.version++;
  rec.ink.length = 0;
  mm.update(0.2);
  assert.equal(rec.ink.length, 1);
  assert.equal(rec.ink[0].w, W, 'a whole-stage dirty region falls back to full-width bands');
  assert.ok(rec.ink[0].h < H, 'and is still split into bands');
  assert.equal(mm._band, 1, 'the banded sequence continues on the following frames');
  // finish the bands so the whole map is fresh again
  for (let i = 0; i < 2; i++) mm.update(0.2);
  const ref = new h.Minimap(stage.level, stage.makePaint());
  ref.paint.grid.set(paint.grid);
  ref.update(0.016, true);
  // The ink layer is a pure function of the grid; the flash channel is a
  // transition history upstream, so only ownership is compared here.
  assert.deepEqual(bytes(mm.inkImg.data), bytes(ref.inkImg.data), 'the banded whole-map path matches a single-shot full refresh');
});

test('#895 Minimap OFF never runs the live raster and keeps the dirty region O(1)', async () => {
  const stage = makeStage(STAGES.Halyard);
  const h = makeHarness({ minimapOff: true });
  const paint = stage.makePaint();
  const mm = new h.Minimap(stage.level, paint);
  const rec = instrument(mm, stage);
  assert.equal(mm._built, false);

  for (let i = 0; i < 5; i++) splat(paint, stage, 20 + i, 30, 3, 1);
  for (let i = 0; i < 30; i++) mm.tickHidden(0.05);
  assert.equal(rec.drawCalls, 0, 'tickHidden draws no ink raster');
  assert.equal(rec.ink.length, 0, 'tickHidden uploads no ImageData');
  assert.equal(mm._built, false, 'tickHidden does not build the raster');
  assert.equal(paint.inkDirty.full, true, 'off-screen changes collapse to a full invalidation');
  assert.equal(paint.inkDirty.x1, -Infinity, 'the hidden dirty region does not grow');
  assert.equal(paint.inkDirty.x0, Infinity);

  // Re-enabling repaints the whole map once, with no stale region.
  mm.update(0.016, false);
  assert.deepEqual(rec.ink[0], { x: 0, y: 0, w: mm.w, h: mm.h }, 'the first visible refresh is whole-map');
  assert.equal(paint.inkDirty.full, false, 'the invalidation is consumed');
});

test('#895 coalesces several splats inside one presentation window', async () => {
  const stage = makeStage(STAGES.Tidewater);
  const h = makeHarness();
  const paint = stage.makePaint();
  const mm = new h.Minimap(stage.level, paint);
  const rec = instrument(mm, stage);
  mm.update(0.016, true);

  rec.ink.length = 0;
  splat(paint, stage, 10, 10, 2, 1);
  splat(paint, stage, 10.6, 10.2, 2, 1);   // adjacent, same window
  splat(paint, stage, 11.2, 10.4, 2, 1);
  mm.update(0.2);
  assert.equal(rec.ink.length, 1, 'one refresh for the whole window');
  assert.ok(rec.ink[0].w * rec.ink[0].h < mm.w * mm.h / 4, 'and it covers only the coalesced region');

  // every changed pixel is fresh: no stale seam inside the union
  const ref = new h.Minimap(stage.level, stage.makePaint ? stage.makePaint() : paint);
  ref.paint.grid.set(paint.grid);
  ref.update(0.016, true);
  assert.deepEqual(bytes(mm.inkImg.data), bytes(ref.inkImg.data), 'no stale seams inside the coalesced union');
});
