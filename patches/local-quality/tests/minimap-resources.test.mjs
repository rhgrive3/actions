// Issue #419: Minimap OFF must not allocate full image/canvas/typed mapping
// buffers or rasterize at offline/network startup. Build-only adapter
// patches/local-quality/minimap-resource-adapter.mjs; cheap native-VM tests
// only (no broad suite). Raw inkwave-public immutable; network/offline call
// sites (main.js) unchanged; paint/gameplay state unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptMinimapResources, replaceOnceMinimap } from '../minimap-resource-adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel, code = read('inkwave-public/' + rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

// ---- native VM harness: rewrite ESM imports to sandbox-provided stubs so the
// real Minimap class body executes natively (constructor/setViewerTeam/idle/
// _build/ensure/update/tickHidden/toCanvas) without a browser or --vm-modules.
function makeHarness({ minimapOff }) {
  const state = {
    minimapOff,
    canvases: [],       // {w,h} at creation; resize tracked via setters
    imageDatas: [],      // {w,h} full-size createImageData calls
    fullBuilds: 0,       // native _build raster entry count (typed-array alloc)
    idleFns: [],
    settings: { minimap: minimapOff ? false : true },
  };
  const mkCtx = (canvas) => ({
    _canvas: canvas,
    createImageData(w, h) { state.imageDatas.push({ w, h }); return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData() { return { data: [] }; },
    putImageData() {},
    drawImage() {}, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, fillRect() {}, clearRect() {}, setLineDash() {},
    set globalAlpha(v) {}, get globalAlpha() { return 1; },
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set strokeStyle(v) {}, get strokeStyle() { return ''; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    set lineDashOffset(v) {}, get lineDashOffset() { return 0; },
  });
  const mkCanvas = () => {
    const c = {};
    let w = 0, h = 0;
    Object.defineProperty(c, 'width', { get: () => w, set: (v) => { w = v; c._ws.push(v); }, enumerable: true });
    Object.defineProperty(c, 'height', { get: () => h, set: (v) => { h = v; c._hs.push(v); }, enumerable: true });
    c._ws = []; c._hs = [];
    c.getContext = () => mkCtx(c);
    c.classList = { add() {} };
    state.canvases.push(c);
    return c;
  };
  const G = { settings: state.settings, match: null, teamHex: ['#ff8a14', '#2f5bff'], projectiles: null };
  const sandbox = {
    console, Math, JSON, Object, Array, Float32Array, Int32Array, Uint8Array, Uint8ClampedArray, Int8Array, Map, Set, Infinity,
    G,
    document: { createElement: () => mkCanvas() },
    requestIdleCallback: (fn) => { state.idleFns.push(fn); return state.idleFns.length; },
    setTimeout: (fn) => { state.idleFns.push(fn); return state.idleFns.length; },
    __G: G, __state: state,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  const load = (rel) => {
    let code = compose(rel);
    // stub ESM imports: keep native class body intact
    code = code.replace("import { G, on } from '../core/ctx.js';", 'const on = () => () => {};');
    code = code.replace("import { SPECIALS, SUB } from '../config.js';", 'const SPECIALS = { slam: { radius: 3 }, storm: { radius: 3.4 } }; const SUB = { bomb: { radius: 3, fuse: 1 } };');
    code = code.replace(/export class Minimap/, 'class Minimap');
    // count native raster entries (typed-array mapping alloc) without changing logic
    code = code.replace('  _build() {', '  _build() { globalThis.__state.fullBuilds++;');
    code += '\n;globalThis.__Minimap = Minimap;';
    vm.runInContext(code, context, { filename: rel });
    return context.__Minimap;
  };
  // tiny level: 8x8 m at 7px/m => 56x56 logical canvas; one flat block, no faces
  const level = (flip) => ({
    bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 },
    blocks: [],
    spawnPads: [{ x: 1, z: 1 }, { x: 7, z: 7 }],
    spawnBarrier: 4,
  });
  const paint = { grid: new Uint8Array(4), paintFaces: [], version: 0 };
  return { state, G, load, level, paint, runIdle: () => { const fns = state.idleFns.splice(0); for (const fn of fns) fn(); } };
}

test('adapter: exact unique fail-closed anchors on minimap.js', () => {
  const raw = read('inkwave-public/src/game/minimap.js');
  const out = compose('src/game/minimap.js');
  assert.notEqual(out, raw);
  // constructor defers all 4 canvases + both ImageData
  assert.match(out, /const mkRes = \(G\.settings\?\.minimap === false\) \? mkMin : mk;/);
  assert.equal((out.match(/= mkRes\(\)/g) || []).length, 4);
  assert.match(out, /\(G\.settings\?\.minimap === false\) \? null : this\.ictx\.createImageData/);
  assert.match(out, /\(G\.settings\?\.minimap === false\) \? null : this\.fctx\.createImageData/);
  // idle rechecks at fire time; viewer-team defers while OFF; lazy build sizes up
  assert.match(out, /idle\(\(\) => \{ if \(G\.settings\?\.minimap === false\) return;/);
  assert.match(out, /if \(G\.settings\?\.minimap === false\) \{ if \(f !== this\.flip\) this\._built = false;/);
  assert.match(out, /for \(const k of \['canvas', 'base', 'inkC', 'flashC'\]\)/);
  // ensure/update left as explicit-demand entry points (no setting guard)
  assert.match(out, /ensure\(\) \{ if \(!this\._built\) this\._build\(\); \}/);
  assert.match(out, /update\(dt, force = false\) \{\n    if \(!this\._built\) this\._build\(\);/);
  // fail-closed: second application + bad anchor both throw
  assert.throws(() => compose('src/game/minimap.js', out), /minimap patch conflict/);
  assert.throws(() => replaceOnceMinimap(out, '.__never_present_anchor__', 'x', 'probe'), /minimap patch conflict/);
  // non-minimap rel untouched; other adapters in chain unaffected for this rel
  assert.equal(adaptMinimapResources('src/game/weapons.js', 'x'), 'x');
});

test('OFF constructor: bounded 1x1 placeholders, no full buffers; w/h + toCanvas preserved', () => {
  const h = makeHarness({ minimapOff: true });
  const Minimap = h.load('src/game/minimap.js');
  const mm = new Minimap(h.level(), h.paint);
  assert.equal(mm.w, 56); assert.equal(mm.h, 56);
  assert.equal(mm._built, false);
  assert.equal(mm.inkImg, null); assert.equal(mm.flashImg, null);
  assert.equal(h.state.canvases.length, 4);
  for (const c of h.state.canvases) { assert.equal(c.width, 1); assert.equal(c.height, 1); }
  assert.equal(h.state.imageDatas.length, 0);
  assert.equal(h.state.fullBuilds, 0);
  // logical projection preserved for both teams (flip applied synchronously)
  mm.setViewerTeam(0);
  const a = mm.toCanvas(8, 8, { x: 0, y: 0 });
  assert.equal(a.x, 0); assert.equal(a.y, 0);
  assert.equal(mm.flip, false); assert.equal(mm.version, -1); assert.equal(mm._built, false);
  mm.setViewerTeam(1);
  const b = mm.toCanvas(8, 8, { x: 0, y: 0 });
  assert.equal(b.x, 56); assert.equal(b.y, 56);
  assert.equal(mm.flip, true); assert.equal(mm.version, -1); assert.equal(mm._built, false);
  assert.equal(h.state.fullBuilds, 0);
  assert.equal(h.state.imageDatas.length, 0);
});

test('OFF setViewerTeam both teams does no canvas work; tickHidden does no canvas work', () => {
  for (const team of [0, 1]) {
    const h = makeHarness({ minimapOff: true });
    const Minimap = h.load('src/game/minimap.js');
    const mm = new Minimap(h.level(), h.paint);
    const sizesBefore = h.state.canvases.map(c => [c.width, c.height].join('x')).join(',');
    mm.setViewerTeam(team);  // offline startMatch(team 0) / online startNetMatch(team)
    assert.equal(mm.flip, team === 1);
    assert.equal(mm.version, -1);
    assert.equal(mm._built, false);
    assert.equal(h.state.fullBuilds, 0);
    assert.equal(h.state.imageDatas.length, 0);
    for (let i = 0; i < 10; i++) mm.tickHidden(1 / 60);
    assert.equal(h.state.fullBuilds, 0);
    assert.equal(h.state.imageDatas.length, 0);
    const sizesAfter = h.state.canvases.map(c => [c.width, c.height].join('x')).join(',');
    assert.equal(sizesAfter, sizesBefore);
  }
});

test('OFF deferred idle: on->off before idle => no build; stale layout => no build', () => {
  const h = makeHarness({ minimapOff: false });
  const Minimap = h.load('src/game/minimap.js');
  const mm = new Minimap(h.level(), h.paint);
  assert.equal(h.state.idleFns.length, 1);
  h.G.settings.minimap = false;   // user turns OFF before idle fires
  h.runIdle();
  assert.equal(h.state.fullBuilds, 0);
  assert.equal(mm._built, false);
  // stale layout: a newer Minimap supersedes the old one before its idle fires
  const h2 = makeHarness({ minimapOff: false });
  const Minimap2 = h2.load('src/game/minimap.js');
  const oldInst = new Minimap2(h2.level(), h2.paint);
  const newInst = new Minimap2(h2.level(), h2.paint);
  void newInst;
  assert.equal(h2.state.idleFns.length, 2);
  h2.state.idleFns.shift()();  // fire the OLD layout callback only
  assert.equal(oldInst._built, false);
  assert.equal(h2.state.fullBuilds, 0);
});

test('off->on then explicit ensure builds complete native raster once; on->off cycles stay bounded', () => {
  const h = makeHarness({ minimapOff: true });
  const Minimap = h.load('src/game/minimap.js');
  const mm = new Minimap(h.level(), h.paint);
  mm.setViewerTeam(1);            // online start as team 1 while OFF: records flip, no build
  assert.equal(mm.flip, true); assert.equal(mm._built, false);
  h.G.settings.minimap = true;    // user turns ON mid-match
  mm.ensure();                    // explicit demand (TAB expanded-map path)
  assert.equal(mm._built, true);
  assert.equal(h.state.fullBuilds, 1);
  assert.equal(mm.flip, true);    // correct team orientation built
  for (const c of h.state.canvases) { assert.equal(c.width, 56); assert.equal(c.height, 56); }
  assert.ok(mm.hgt instanceof Float32Array && mm.hgt.length === 56 * 56);
  assert.ok(mm.topBlock instanceof Int32Array && mm.nrm instanceof Float32Array);
  assert.ok(mm.pixCell instanceof Int32Array && mm.owner instanceof Uint8Array);
  const builds = h.state.fullBuilds;
  h.G.settings.minimap = false;   // OFF again: no rebuild; HUD uses tickHidden
  mm.setViewerTeam(1);
  mm.tickHidden(1 / 60);
  assert.equal(h.state.fullBuilds, builds);
  assert.equal(mm._built, true);  // built raster retained, not rebuilt
  h.G.settings.minimap = true;
  mm.ensure();                    // already built: no second raster pass
  assert.equal(h.state.fullBuilds, builds);
});

test('flip change while OFF invalidates stale raster; later ensure builds correct team once', () => {
  const h = makeHarness({ minimapOff: false });
  const Minimap = h.load('src/game/minimap.js');
  const mm = new Minimap(h.level(), h.paint);
  mm.ensure();                    // ON: native build for team 0
  assert.equal(mm._built, true); assert.equal(mm.flip, false);
  const builds = h.state.fullBuilds;
  h.G.settings.minimap = false;
  mm.setViewerTeam(1);            // flip while OFF: must invalidate, not build
  assert.equal(mm.flip, true); assert.equal(mm.version, -1);
  assert.equal(mm._built, false);
  assert.equal(h.state.fullBuilds, builds);
  h.G.settings.minimap = true;
  mm.ensure();
  assert.equal(mm._built, true);
  assert.equal(h.state.fullBuilds, builds + 1);
  assert.equal(mm.flip, true);
  const p = mm.toCanvas(8, 8, { x: 0, y: 0 });
  assert.equal(p.x, 56); assert.equal(p.y, 56);
});

test('ON path preserves native behavior: eager surfaces + idle build + setViewerTeam fast path', () => {
  const h = makeHarness({ minimapOff: false });
  const Minimap = h.load('src/game/minimap.js');
  const mm = new Minimap(h.level(), h.paint);
  for (const c of h.state.canvases) { assert.equal(c.width, 56); assert.equal(c.height, 56); }
  assert.equal(h.state.imageDatas.length, 2);
  h.runIdle();                    // menu idle builds eagerly while ON
  assert.equal(mm._built, true);
  const builds = h.state.fullBuilds;
  mm.setViewerTeam(0);            // same team + built => version reset only, no rebuild
  assert.equal(h.state.fullBuilds, builds);
  assert.equal(mm.version, -1);
  mm.setViewerTeam(1);            // team change while ON => immediate native rebuild
  assert.equal(h.state.fullBuilds, builds + 1);
  assert.equal(mm.flip, true);
});

test('explicit ensure/update while OFF still build (TAB expanded-map path)', () => {
  const h = makeHarness({ minimapOff: true });
  const Minimap = h.load('src/game/minimap.js');
  const mm = new Minimap(h.level(), h.paint);
  mm.ensure(); // explicit demand works regardless of hidden preference
  assert.equal(mm._built, true);
  assert.equal(h.state.fullBuilds, 1);
  assert.ok(mm.hgt instanceof Float32Array && mm.hgt.length === 56 * 56);
  const h2 = makeHarness({ minimapOff: true });
  const Minimap2 = h2.load('src/game/minimap.js');
  const mm2 = new Minimap2(h2.level(), h2.paint);
  h2.G.teamHex = ['#ff8a14', '#2f5bff'];
  h2.G.game = { theme: 'day' };
  mm2.update(1/60, true); // forced explicit update builds even while OFF
  assert.equal(mm2._built, true);
  assert.equal(h2.state.fullBuilds, 1);
});

test('negative control: original main demonstrates unwanted OFF build/allocation', () => {
  const raw = read('inkwave-public/src/game/minimap.js');
  // unpatched constructor always sizes full canvases + ImageData
  assert.match(raw, /this\.canvas = mk\(\);/);
  assert.match(raw, /this\.inkImg = this\.ictx\.createImageData\(this\.w, this\.h\);/);
  // unpatched setViewerTeam builds whenever !_built (the OFF match-start trap)
  assert.match(raw, /if \(f === this\.flip && this\._built\)/);
  assert.match(raw, /this\.flip = f;\n    this\._build\(\);/);
  // unpatched idle guard only skips scheduling; a scheduled ON callback has no
  // fire-time OFF/CURRENT recheck, and network/offline call sites still force it
  const main = read('inkwave-public/src/main.js');
  assert.match(main, /this\.minimap\.setViewerTeam\(0\);/);
  assert.match(main, /this\.minimap\.setViewerTeam\(m\.local \? m\.local\.team : 0\);/);
  assert.match(main, /else this\.minimap\.tickHidden\?\.\(dt\);/);
});

test('call sites + paint/gameplay state unchanged by this adapter', () => {
  const main = read('inkwave-public/src/main.js');
  assert.equal((main.match(/setViewerTeam/g) || []).length, 2);
  assert.match(main, /if \(showMinimap\) this\.minimap\.update\(dt\);/);
  const out = compose('src/game/minimap.js');
  assert.match(out, /tickHidden\(dt\) \{/); // logical effect aging kept
  assert.match(main, /map: showMinimap \? \{ canvas: this\.minimap\.canvas, expanded: false, players \} : null,/);
  assert.match(out, /this\.owner = new Uint8Array\(N\);/);         // native raster tail intact
  assert.match(out, /this\._built = true;/);
});


test('#907 explicit Turf Map builds/updates the raster even with corner minimap OFF', () => {
  const composed = compose('src/main.js');
  assert.match(composed, /const explicitTurfMap = !!\(m && !m\.attract && !m\.paused && m\.state === 'playing' && m\.controller\?\.mapHeld && !this\.menus\?\.current\);/);
  assert.match(composed, /if \(showMinimap \|\| explicitTurfMap\) this\.minimap\.update\(dt\);/);
  assert.match(composed, /else this\.minimap\.tickHidden\?\.\(dt\);/);
  assert.match(composed, /if \(showMinimap \|\| explicitTurfMap\) \{\s*for \(const o of m\.actors\)/);
  assert.match(composed, /if \(explicitTurfMap\) frame\.map = \{ \.\.\.\(frame\.map \|\| \{\}\), canvas: this\.minimap\.canvas, expanded: true, players \};/);
  // No permanent raster activity: the normal OFF/closed path is still tickHidden.
  assert.match(composed, /map: showMinimap \? \{ canvas: this\.minimap\.canvas, expanded: false, players \} : null,/);
});

test('#907 map availability follows visible live state on keyboard/pad/touch', () => {
  const code = compose('src/main.js');
  const match = code.match(/const explicitTurfMap = ([^\n;]+);/);
  assert.ok(match, 'one shared controller state drives explicit map presentation');
  const isOpen = new Function('m', 'return ' + match[1]);
  const playing = { state: 'playing', attract: false, paused: false, controller: { mapHeld: true } };
  const game = { menus: { current: null } };
  for (const owner of ['keyboard', 'gamepad', 'touch']) {
    playing.controller.mapHeld = true;
    assert.equal(isOpen.call(game, playing), true, owner);
    playing.controller.mapHeld = false;
    assert.equal(isOpen.call(game, playing), false, owner + ' closed');
  }
  playing.controller.mapHeld = true;
  for (const [field, value] of [['state', 'intro'], ['state', 'finish'], ['state', 'results'], ['paused', true], ['attract', true]]) {
    const original = playing[field]; playing[field] = value;
    assert.equal(isOpen.call(game, playing), false, field + '=' + value);
    playing[field] = original;
  }
  game.menus.current = 'settings';
  assert.equal(isOpen.call(game, playing), false, 'menu owns presentation');
  assert.equal(isOpen.call({ menus: null }, null), false);
});
