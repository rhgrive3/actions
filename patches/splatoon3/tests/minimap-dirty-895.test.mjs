// Issue #895: the live minimap must not rescan/copy the whole W*H raster for a
// localized paint change. Adapter patches/splatoon3/minimap-dirty-adapter.mjs +
// owned helper runtime/minimap-dirty.mjs; inkwave-public is immutable.
// The source under test runs through the full six-adapter production stack.
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
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { installMinimapDirty } from '../runtime/minimap-dirty.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel, code = read('inkwave-public/' + rel)) =>
  adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));

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

function makeHarness({ minimapOff = false, nativeDrawInk = false } = {}) {
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
  if (nativeDrawInk) {
    // Independent control: use the actual unmodified upstream raster method,
    // including its flash history. Keep the same class/cadence and dirty driver.
    const raw = read('inkwave-public/src/game/minimap.js');
    const endMarker = '\n  // ------------------------------------------------------------------------------------------ per frame';
    const a = raw.indexOf('  _drawInk(y0 = 0, y1 = this.h) {');
    const b = raw.indexOf(endMarker, a);
    const c = code.indexOf('  _drawInk(y0 = 0, y1 = this.h, x0 = 0, x1 = this.w) {');
    const d = code.indexOf(endMarker, c);
    assert.ok(a >= 0 && b > a && c >= 0 && d > c);
    code = code.slice(0, c) + raw.slice(a, b) + code.slice(d);
  }
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
const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const bbox = (a, b) => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const alphaSum = (data, rect, W) => {
  let s = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) s += data[(y * W + x) * 4 + 3];
  }
  return s;
};

// The ink layer is a pure function of the grid. The flash layer is a bounded
// transition history: the partial path clears the previously flashed box before
// each draw (bounded historical cleanup), so after the correction it must equal
// a forced whole-map refresh both inside *and* outside the affected union —
// this is the #895 resurrection regression check.
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
  assert.match(out, /this\.grid\[k\] = val;\n        changed = true;\n        if \(this\._inkMark\) this\._inkMark\(f, i, j\);/);
  assert.match(out, /this\.version\+\+;\n    if \(this\.inkDirty\) this\.inkDirty\.full = true;/);
  // The build-only public adapter rejects a completed or partial BUILD tree.
  // Only the narrow #895 sub-adapter recognizes its own complete hooks.
  assert.throws(() => adaptSource('src/world/paint.js', out), /conflict/);
  // A genuine upstream drift to the write site also fails closed.
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
      assert.equal(fd.outside, 0, `${name}: flash identical outside the redrawn rect (stale residue cleared) at step (${cx},${cz})`);
      assert.deepEqual(bytes(mm.flashImg.data), bytes(ref.flashImg.data), `${name}: flash layer byte-identical at step (${cx},${cz})`);
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

for (const invalidation of ['clear', 'force', 'viewer-team', 'team-colour']) {
  test(`#895 ${invalidation} consumes pending bounds before the next distant splat`, () => {
    const stage = makeStage(STAGES.Tidewater);
    const h = makeHarness();
    const paint = stage.makePaint();
    const mm = new h.Minimap(stage.level, paint);
    const rec = instrument(mm, stage);
    mm.update(0.016, true);
    splat(paint, stage, 2, 2, 1);
    mm.update(0.01); // A remains pending inside the native 150 ms gate.
    assert.ok(Number.isFinite(paint.inkDirty.x0));
    if (invalidation === 'clear') {
      paint.grid.fill(0); paint.version++; paint.inkDirty.full = true;
    } else if (invalidation === 'viewer-team') mm.setViewerTeam(1);
    else if (invalidation === 'team-colour') h.G.teamHex = ['#ff0000', '#00ff00'];
    mm.update(0.2, invalidation === 'force');
    assert.equal(paint.inkDirty.full, false);
    assert.equal(paint.inkDirty.x0, Infinity);
    assert.equal(paint.inkDirty.z0, Infinity);
    assert.equal(paint.inkDirty.x1, -Infinity);
    assert.equal(paint.inkDirty.z1, -Infinity);
    rec.ink.length = 0; rec.flash.length = 0;
    splat(paint, stage, 45, 80, 1); // B must not union with consumed A.
    mm.update(0.2);
    assert.equal(mm._band, 0, 'the distant splat remains a local refresh');
    assert.equal(rec.ink.length, 1);
    assert.ok(rec.ink[0].w * rec.ink[0].h < mm.w * mm.h / 100);
    const control = new h.Minimap(stage.level, stage.makePaint());
    control.paint.grid.set(paint.grid);
    if (invalidation === 'viewer-team') control.setViewerTeam(1);
    control.update(0.016, true);
    assert.equal(bytes(mm.inkImg.data), bytes(control.inkImg.data));
  });
}

test('#895 full redraw preserves a newer paint generation arriving during rasterization', () => {
  const stage = makeStage(STAGES.Tidewater);
  const h = makeHarness();
  const paint = stage.makePaint();
  const mm = new h.Minimap(stage.level, paint);
  mm.update(0.016, true);
  splat(paint, stage, 2, 2, 1);
  paint.inkDirty.full = true;
  const consumedGen = paint.inkDirty.gen;
  const draw = mm._drawInk.bind(mm);
  let inject = true;
  mm._drawInk = (...args) => {
    const result = draw(...args);
    if (inject) { inject = false; splat(paint, stage, 45, 80, 1); }
    return result;
  };
  mm.update(0.2);
  assert.equal(mm._inkGen, consumedGen, 'never acknowledge post-draw writes');
  assert.ok(paint.inkDirty.gen > consumedGen);
  assert.equal(paint.inkDirty.full, true, 'newer pending invalidation is retained');
  assert.ok(Number.isFinite(paint.inkDirty.x0));
  mm.update(0.2);
  assert.equal(mm._inkGen, paint.inkDirty.gen);
  assert.equal(paint.inkDirty.full, false);
  assert.equal(paint.inkDirty.x0, Infinity);
  const control = new h.Minimap(stage.level, stage.makePaint());
  control.paint.grid.set(paint.grid); control.update(0.016, true);
  assert.equal(bytes(mm.inkImg.data), bytes(control.inkImg.data));
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

for (const [name, dimensions] of Object.entries(STAGES)) {
  test(`#895 ${name} retains each fresh band flash like the native raster`, () => {
    const stage = makeStage(dimensions);
    const maps = [makeHarness(), makeHarness({ nativeDrawInk: true })].map(h => {
      const paint = stage.makePaint();
      const map = new h.Minimap(stage.level, paint);
      map.update(0.016, true);
      paint.grid.fill(1);
      for (let j = 0; j < stage.nv; j++) for (let i = 0; i < stage.nu; i++) {
        PaintSystem.prototype._inkMark.call(paint, stage.face, i, j);
      }
      paint.version++;
      return map;
    });
    for (const dt of [0.2, 1 / 60, 1 / 60]) {
      for (const map of maps) map.update(dt);
      assert.deepEqual(bytes(maps[0].flashImg.data), bytes(maps[1].flashImg.data),
        'all earlier bands remain visible throughout this native refresh');
      assert.deepEqual(bytes(maps[0].inkImg.data), bytes(maps[1].inkImg.data));
      assert.equal(maps[0].flashT, maps[1].flashT);
    }
    assert.equal(maps[0]._band, 0);
  });
}

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

for (const [name, bounds] of Object.entries(STAGES)) {
  test(`#895 ${name}: a time-separated distant splat never resurrects the old flash`, async () => {
    const stage = makeStage(bounds);
    const h = makeHarness();
    const paint = stage.makePaint();
    const mm = new h.Minimap(stage.level, paint);
    const rec = instrument(mm, stage);
    const ref = new h.Minimap(stage.level, stage.makePaint());
    instrument(ref, stage);
    const W = mm.w, H = mm.h;
    const M = bounds.W, D = bounds.D;

    mm.update(0.016, true);                 // initial whole-map build (both)
    ref.update(0.016, true);

    // ---- region A: near the origin corner
    rec.ink.length = 0; rec.flash.length = 0;
    splat(paint, stage, 8, 8, 3, 1);
    splat(ref.paint, stage, 8, 8, 3, 1);
    mm.update(0.2);
    ref.update(0.2, true);
    const rectA = rec.ink[0];
    assert.ok(alphaSum(mm.flashImg.data, rectA, W) > 0, 'region A holds fresh flash alpha');
    assert.deepEqual(bytes(mm.inkImg.data), bytes(ref.inkImg.data));
    assert.deepEqual(bytes(mm.flashImg.data), bytes(ref.flashImg.data), 'fresh flash at A matches the baseline');

    // ---- enough wall time passes for the flash fade window (0.45 s) to close
    for (let i = 0; i < 4; i++) { mm.update(0.2); ref.update(0.2); }
    assert.ok(mm.flashT > 0.45 && ref.flashT > 0.45, 'the flash has fully faded');
    assert.ok(alphaSum(mm.flashImg.data, rectA, W) > 0,
      'the faded flash alpha still sits in the layer — this is the resurrection residue');

    // ---- region B: the far corner, disjoint from region A
    splat(paint, stage, M - 8, D - 8, 3, 2);
    splat(ref.paint, stage, M - 8, D - 8, 3, 2);
    rec.ink.length = 0; rec.flash.length = 0;
    mm.update(0.2);
    ref.update(0.2, true);
    const rectB = rec.ink[0];
    assert.ok(!intersects(rectA, rectB), 'the two painted regions are genuinely distant');

    // new flash timing/visuals are preserved: both restart into the fade window
    assert.equal(mm.flashT, ref.flashT, 'flashT is reset by the new flash on both paths');
    assert.ok(mm.flashT < 0.45, 'the new flash is inside the visible fade window');

    // affected union = old flashed box ∪ new dirty rect: equality inside AND outside
    const union = bbox(rectA, rectB);
    const fd = flashDiff(mm.flashImg.data, ref.flashImg.data, union, W, H);
    assert.equal(fd.inside, 0, 'flash identical inside the affected union');
    assert.equal(fd.outside, 0, 'flash identical outside the affected union (no resurrection)');
    assert.deepEqual(bytes(mm.flashImg.data), bytes(ref.flashImg.data), 'flash layer byte-identical to the whole-map baseline');
    assert.deepEqual(bytes(mm.inkImg.data), bytes(ref.inkImg.data), 'ink layer byte-identical to the whole-map baseline');

    // bounded kernel: the cleanup is exactly one localized re-upload covering the
    // stale region, and total flash uploads stay far below the whole raster
    assert.ok(rec.flash.some(r => intersects(r, rectA)), 'the stale region A is explicitly cleared + re-uploaded');
    const flashArea = rec.flash.reduce((s, r) => s + r.w * r.h, 0);
    assert.ok(flashArea < W * H / 2, `flash uploads stay bounded (${flashArea} < ${W * H / 2})`);
  });
}

test('#895 the alpha/bilinear pass visits only the halo rectangle, never full width', async () => {
  const stage = makeStage(STAGES.Tidewater);
  const h = makeHarness();
  const paint = stage.makePaint();
  const mm = new h.Minimap(stage.level, paint);
  const rec = instrument(mm, stage);
  mm.update(0.016, true);                   // initial build allocates _alpha

  splat(paint, stage, 20, 30, 3, 1);
  rec.ink.length = 0; rec.flash.length = 0;

  // Every alpha-pass iteration writes al[i] exactly once (all three paths), and
  // _alpha is used nowhere else, so counting writes counts CPU-visited pixels.
  let visits = 0;
  mm._alpha = new Proxy(mm._alpha, {
    get(t, k) { return t[k]; },
    set(t, k, v) { visits++; t[k] = v; return true; },
  });
  mm.update(0.2);
  assert.equal(rec.ink.length, 1, 'one partial draw');

  const r = rec.ink[0];
  const ry0 = Math.max(0, r.y - 1), ry1 = Math.min(mm.h, r.y + r.h + 1);
  const rx0 = Math.max(0, r.x - 1), rx1 = Math.min(mm.w, r.x + r.w + 1);
  const halo = (ry1 - ry0) * (rx1 - rx0);
  const fullWidth = (ry1 - ry0) * mm.w;
  assert.equal(visits, halo, `the first pass visits exactly the halo rectangle (${halo} pixels)`);
  assert.ok(halo < fullWidth, `the halo (${halo}) is strictly narrower than the full-width scan (${fullWidth})`);
});
