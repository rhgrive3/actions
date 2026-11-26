import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { replaceOnce } from '../adapter.mjs';
import { adaptRenderTransfers } from '../render-transfer-optimization-adapter.mjs';
import { adaptCombatGpuCpuPerfect } from '../combat-gpu-cpu-perfect-adapter.mjs';
import { FixedClock } from '../../splatoon3/runtime/clock.mjs';
import { installIntermediateTickBudget } from '../intermediate-tick-budget.mjs';
import {
  inViewVolumeDistSq,
  runWithCachedViewDistSq,
  installOffscreenVisualBudget,
} from '../offscreen-visual-budget.mjs';
import {
  computeCharacterThrottleStride,
  installDistanceOffscreenThrottle,
} from '../distance-offscreen-throttle.mjs';
import { updateSplatlingStages } from '../splatling-reticle.mjs';

const readRaw = (rel) => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const readPatch = (rel) => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

function makePerspectiveCamera(pos = [0, 2, 0]) {
  let updates = 0;
  const elements = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    pos[0], pos[1], pos[2], 1,
  ];
  return {
    isPerspectiveCamera: true,
    fov: 60,
    aspect: 16 / 9,
    near: 0.1,
    far: 500,
    zoom: 1,
    filmOffset: 0,
    matrixWorld: { elements },
    updateMatrixWorld() { updates++; },
    get updates() { return updates; },
    resetUpdates() { updates = 0; },
  };
}

function makeCharacterClass(onUpdate) {
  return class MockCharacter {
    constructor(x = 0, y = 0, z = -10) {
      this.inWorld = true;
      this.rootInit = true;
      this.form = 'kid';
      this.kidScale = 1;
      this._camFrame = 0;
      this.root = { position: { x, y, z }, parent: null };
      this.calls = [];
    }
    update(dt, s) {
      this.calls.push(dt);
      return onUpdate ? onUpdate(this, dt, s) : 'ok';
    }
    _ground() { return 0; }
    _buildPose() {}
    _applyPose() {}
  };
}

function makeLiveMatchContext(cam, clock = null) {
  const local = { isLocal: true, alive: true, form: 'kid' };
  const actors = [local, {}, {}, {}];
  return {
    camera: cam,
    renderer: { info: { render: { frame: 10 } } },
    game: clock ? { s3Clock: clock } : {},
    match: { state: 'playing', local, actors, opts: {} },
  };
}

test('CPU-2: install.mjs registers installDistanceOffscreenThrottle before installIntermediateTickBudget (outermost)', () => {
  const src = readPatch('install.mjs');
  const distIdx = src.indexOf('installDistanceOffscreenThrottle(api,G);');
  const interIdx = src.indexOf('installIntermediateTickBudget(api,G);');
  assert.ok(distIdx >= 0 && interIdx >= 0, 'both installers present');
  assert.ok(distIdx < interIdx, 'intermediate tick budget must wrap distance throttle as outermost wrapper');

  const clock = new FixedClock();
  const cam = makePerspectiveCamera([0, 2, 0]);
  const G = makeLiveMatchContext(cam, clock);
  const Character = makeCharacterClass();
  const api = { Character };
  installOffscreenVisualBudget(api, G);
  installDistanceOffscreenThrottle(api, G);
  installIntermediateTickBudget(api, G);

  const ch = new Character(0, 0, -5); // onscreen, near (<14m -> stride 1)
  const actor = { remote: true, alive: true, form: 'kid' };

  // Intermediate tick: must short-circuit before distance throttle touches camera or _dotTick.
  clock.advancing = true;
  clock.finalTick = false;
  ch.update(1 / 60, actor);
  assert.equal(cam.updates, 0, 'intermediate tick skips frustum check');
  assert.equal(ch._dotTick, 0, 'intermediate tick does not consume throttle stride ticks');
  assert.equal(ch.calls.length, 0);

  // Drawn tick: distance throttle computes distSq once, offscreen-visual-budget reuses it.
  clock.finalTick = true;
  ch.update(1 / 60, actor);
  assert.equal(cam.updates, 1, 'final tick evaluates camera frustum once across both wrappers');
  assert.equal(ch._dotTick, 1);
  assert.equal(ch.calls.length, 1);
  clock.advancing = false;
});

test('CPU-2: runWithCachedViewDistSq is reentrant-safe, exception-safe, and strictly scoped', () => {
  const cam1 = makePerspectiveCamera([0, 0, 0]);
  const cam2 = makePerspectiveCamera([0, 0, 0]);
  const ch1 = { root: { position: { x: 0, y: 0, z: -5 }, parent: null } };
  const ch2 = { root: { position: { x: 0, y: 0, z: 50 }, parent: null } }; // behind camera -> -1

  // Outside scope: real computation
  assert.equal(inViewVolumeDistSq(ch1, cam1), 25);
  assert.equal(cam1.updates, 1);
  cam1.resetUpdates();

  // Nested scopes with distinct characters/cameras
  const res = runWithCachedViewDistSq(ch1, cam1, 123, () => {
    assert.equal(inViewVolumeDistSq(ch1, cam1), 123);
    assert.equal(cam1.updates, 0, 'cached hit avoids recomputation');
    // Different camera misses cache
    assert.equal(inViewVolumeDistSq(ch1, cam2), 25);
    assert.equal(cam2.updates, 1);

    const inner = runWithCachedViewDistSq(ch2, cam2, -1, () => {
      assert.equal(inViewVolumeDistSq(ch2, cam2), -1);
      // Outer ch1/cam1 is shadowed while inner scope is active
      assert.equal(inViewVolumeDistSq(ch1, cam1), 25);
      return 'inner-ok';
    });
    assert.equal(inner, 'inner-ok');
    // Outer scope restored
    cam1.resetUpdates();
    assert.equal(inViewVolumeDistSq(ch1, cam1), 123);
    assert.equal(cam1.updates, 0);
    return 'outer-ok';
  });
  assert.equal(res, 'outer-ok');

  // After scope exits: real computation resumes
  cam1.resetUpdates();
  assert.equal(inViewVolumeDistSq(ch1, cam1), 25);
  assert.equal(cam1.updates, 1);

  // Exception inside fn restores previous scope
  assert.throws(() => {
    runWithCachedViewDistSq(ch1, cam1, 999, () => {
      throw new Error('boom');
    });
  }, /boom/);
  cam1.resetUpdates();
  assert.equal(inViewVolumeDistSq(ch1, cam1), 25);
  assert.equal(cam1.updates, 1);
});

test('CPU-2: distance-offscreen-throttle shares single cached scope across catch-up slices, final update, and reentrancy', () => {
  const cam = makePerspectiveCamera([0, 0, 0]);
  const G = makeLiveMatchContext(cam);
  const seenDistSq = [];
  let reentrantTarget = null;
  let reentrantActor = null;

  const Character = makeCharacterClass((self, dt, s) => {
    seenDistSq.push([self, inViewVolumeDistSq(self, cam)]);
    if (reentrantTarget && self !== reentrantTarget) {
      const target = reentrantTarget;
      const actor = reentrantActor;
      reentrantTarget = null;
      reentrantActor = null;
      target.update(dt, actor);
    }
  });
  installDistanceOffscreenThrottle({ Character }, G);

  // Public helper without out returns numeric stride; with out reports hasDistSq cleanly
  const ch = new Character(0, 0, -5); // distSq = 25 -> stride 1
  const bot = { isBot: true, alive: true, form: 'kid' };
  const local = { isLocal: true, alive: true, form: 'kid' };
  const out = {};
  assert.equal(computeCharacterThrottleStride(ch, local, G, out), 1);
  assert.equal(out.hasDistSq, false, 'early return marks hasDistSq=false');
  assert.equal(computeCharacterThrottleStride(ch, bot, G), 1, 'no out arg still returns number');
  assert.equal(computeCharacterThrottleStride(ch, bot, G, out), 1);
  assert.equal(out.hasDistSq, true);
  assert.equal(out.distSq, 25);
  assert.equal(out.cam, cam);

  // Catch-up slices + final nativeUpdate share ONE cached scope (only 1 camera update total)
  cam.resetUpdates();
  seenDistSq.length = 0;
  ch._dotDeferredDt = 0.25; // forces 2 catch-up slices of 0.1 + 1 final slice of ~0.0667
  ch.update(1 / 60, bot);
  assert.equal(ch.calls.length, 3, '2 catch-up slices + 1 final nativeUpdate');
  assert.equal(cam.updates, 1, 'all slices and final update reuse single cached distSq');
  assert.deepEqual(seenDistSq.map(([, d]) => d), [25, 25, 25]);

  // Reentrant _dotUpdate on another character does not clobber scratchOut or outer scope
  const ch2 = new Character(0, 0, -8); // distSq = 64 -> stride 1
  const bot2 = { isBot: true, alive: true, form: 'kid' };
  cam.resetUpdates();
  seenDistSq.length = 0;
  ch._dotDeferredDt = 0.15; // slice 1 triggers reentrant ch2.update, then final slice runs for ch
  reentrantTarget = ch2;
  reentrantActor = bot2;
  ch.update(1 / 60, bot);
  assert.equal(cam.updates, 2, 'one frustum eval for outer ch and one for inner ch2');
  assert.deepEqual(seenDistSq, [
    [ch, 25],
    [ch2, 64],
    [ch, 25],
  ]);

  // Early-return path (local actor) does not use stale cached scope
  cam.resetUpdates();
  seenDistSq.length = 0;
  ch.update(1 / 60, local);
  assert.equal(cam.updates, 1, 'early-return path does not wrap in stale cache');
});

test('CPU-3: s3-hud-look-adapter quantizes swim tank transform, resets tx/ty on exit, and manages tubeGeo freshness', () => {
  const hudSrc = adaptBuildSource('src/ui/hud.js', readRaw('src/ui/hud.js'));
  const tankStart = hudSrc.indexOf('  _updTank(f, dt) {');
  const tankEnd = hudSrc.indexOf('  // ---------------------------------------------------------------- special gauge', tankStart);
  assert.ok(tankStart > 0 && tankEnd > tankStart);

  function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      toggle: (c, on) => (on === undefined ? (set.has(c) ? (set.delete(c), false) : (set.add(c), true)) : (on ? set.add(c) : set.delete(c), !!on)),
      contains: (c) => set.has(c),
    };
  }

  function makeHudHarness({ withRO = true } = {}) {
    const observers = [];
    class FakeRO {
      constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
      observe(el) { this.targets.push(el); }
    }
    const docEl = { classList: makeClassList() };
    const doc = {
      documentElement: docEl,
      createElementNS: () => ({ setAttribute() {}, append() {} }),
    };
    const G = { camera: {} };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const Path2D = class {
      moveTo() {} lineTo() {} arcTo() {} closePath() {} roundRect() {}
    };
    const qtMap = new WeakMap();
    const writeQueueTransform = (el, text) => {
      let row = qtMap.get(el);
      if (row && row.text === text && el.style.transform === row.serialized) return;
      el.style.transform = text;
      if (!row) { row = {}; qtMap.set(el, row); }
      row.text = text; row.serialized = el.style.transform;
    };
    const Hud = new Function(
      'G', 'clamp', 'innerWidth', 'innerHeight', 'document', 'ResizeObserver', 'Path2D', 'devicePixelRatio', 'shade', 'writeQueueTransform',
      `return class { ${hudSrc.slice(tankStart, tankEnd)} }`
    )(G, clamp, 1280, 720, doc, withRO ? FakeRO : undefined, Path2D, 1, (s) => s, writeQueueTransform);

    const h = new Hud();
    let transformWrites = 0;
    let offsetReads = 0;
    const size = { l: -20, t: 10, w: 60, h: 110 };
    const tankStyle = {
      _transform: '',
      get transform() { return this._transform; },
      set transform(v) { transformWrites++; this._transform = v; },
    };
    const tank = {
      classList: makeClassList(),
      style: tankStyle,
      prepend() {},
      get offsetLeft() { offsetReads++; return size.l; },
      get offsetTop() { offsetReads++; return size.t; },
      get offsetWidth() { offsetReads++; return size.w; },
      get offsetHeight() { offsetReads++; return size.h; },
    };
    const me = { alive: true, form: 'squid', superJumpState: null, pos: { x: 0, y: 0, z: 0 } };
    let proj = { x: 0.25, y: -0.1, z: 0.5 };
    const noopCtx = new Proxy({}, { get: () => () => {}, set: () => true });
    Object.assign(h, {
      _L: {},
      _tank: { level: 0.5, target: 0.5, wobble: 0, t: 0, bubbles: [] },
      tank,
      tankCanvas: { width: 0, height: 0, clientWidth: 22, clientHeight: 67 },
      tankCtx: noopCtx,
      _local: () => me,
      _project: () => proj,
    });
    return {
      h, me, tank, docEl, size, observers,
      setProj(p) { proj = p; },
      get transformWrites() { return transformWrites; },
      get offsetReads() { return offsetReads; },
      resetCounters() { transformWrites = 0; offsetReads = 0; },
    };
  }

  // 1) Swim transform quantization + !swimTank NaN reset + ResizeObserver tubeGeo retention
  const r = makeHudHarness({ withRO: true });
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.transformWrites, 1);
  assert.equal(r.tank.style.transform, 'translate3d(160.0px,36.0px,0)');
  assert.equal(r.offsetReads, 4, 'initial swim reads tank offset geometry once');
  assert.ok(r.h._tankBox?.ro, 'ResizeObserver attached');

  // Sub-0.05px jitter: no transform write, no offset reads
  r.resetCounters();
  r.setProj({ x: 0.25 + 0.01 / 640, y: -0.1, z: 0.5 });
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.transformWrites, 0, 'sub-0.1px jitter skips style.transform write');
  assert.equal(r.offsetReads, 0, 'cached tubeGeo skips layout reads');

  // Layout-independent classes do not invalidate tubeGeo
  r.tank.classList.add('is-low');
  r.tank.classList.add('is-nosub');
  r.tank.classList.add('is-idle');
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.offsetReads, 0, 'non-layout classes do not invalidate tubeGeo');

  // Movement >= 0.1px updates transform
  r.setProj({ x: 0.25 + 0.2 / 640, y: -0.1, z: 0.5 });
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.transformWrites, 1);

  // Exit swim: clears transform AND resets L.tx / L.ty to NaN; with RO attached, L.tubeGeo stays valid
  r.resetCounters();
  r.me.form = 'kid';
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.tank.style.transform, '');
  assert.ok(Number.isNaN(r.h._L.tx) && Number.isNaN(r.h._L.ty), 'L.tx and L.ty reset to NaN on !swimTank');
  assert.ok(r.h._L.tubeGeo !== null, 'RO-attached tank keeps L.tubeGeo across swim toggle');

  // Re-enter swim at exact same coordinates: must rewrite style.transform because L.tx/L.ty were reset
  r.resetCounters();
  r.me.form = 'squid';
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.transformWrites, 1, 're-entering swim at same coords rewrites transform');
  assert.equal(r.offsetReads, 0, 're-entering swim with RO attached avoids synchronous reflow');

  // ResizeObserver callback invalidates L.tubeGeo
  r.observers[0].cb([]);
  assert.equal(r.h._L.tubeGeo, null, 'ResizeObserver callback invalidates L.tubeGeo');
  r.resetCounters();
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.offsetReads, 4, 'tubeGeo re-measured after ResizeObserver callback');

  // Layout-affecting class `iw-touch-ui` synchronously invalidates tubeGeo
  r.resetCounters();
  r.docEl.classList.add('iw-touch-ui');
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.offsetReads, 4, 'iw-touch-ui toggle invalidates tubeGeo synchronously');

  // Zero-sized tank (w <= 0 || h <= 0) does NOT commit to L.tubeGeo
  r.size.w = 0;
  r.size.h = 0;
  r.h._L.tubeGeo = null;
  r.resetCounters();
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(r.h._L.tubeGeo, null, 'zero-size measurement must not be cached in L.tubeGeo');
  assert.equal(r.offsetReads, 4);
  r.size.w = 60;
  r.size.h = 110;
  r.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.ok(r.h._L.tubeGeo && r.h._L.tubeGeo.w === 60 && r.h._L.tubeGeo.h === 110, 'positive size commits to L.tubeGeo');

  // 2) Fallback when ResizeObserver is unavailable (!this._tankBox?.ro): toggling swimTank invalidates tubeGeo
  const noRo = makeHudHarness({ withRO: false });
  noRo.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.ok(noRo.h._L.tubeGeo !== null);
  noRo.me.form = 'kid';
  noRo.h._updTank({ ink: 0.5, subCost: 0.7 }, 1 / 60);
  assert.equal(noRo.h._L.tubeGeo, null, 'without ResizeObserver, swimTank toggle invalidates L.tubeGeo');

  // 3) main.js reuses this._iwHitFb payload object
  const mainSrc = adaptBuildSource('src/main.js', readRaw('src/main.js'));
  assert.ok(mainSrc.includes('this._iwHitFb'), 'main.js reuses _iwHitFb object');
  assert.match(mainSrc, /hitMarker\([^;]*damage/, 'preserves reticle-feedback test contract');
});

test('CPU-3: turf-lead-adapter avoids string concatenation in _setTurfLead', () => {
  const hudSrc = adaptBuildSource('src/ui/hud.js', readRaw('src/ui/hud.js'));
  assert.ok(hudSrc.includes("side === 0 ? 'turfLead0' : 'turfLead1'"));
  assert.ok(!hudSrc.includes("'turfLead' + side"));
});

test('CPU-3: splatling-reticle quantizes strokeDashoffset writes while preserving 0..1 float and null reset contracts', () => {
  let firstWrites = 0;
  let secondWrites = 0;
  const makeStyle = (onWrite) => ({
    _v: '',
    get strokeDashoffset() { return this._v; },
    set strokeDashoffset(v) { onWrite(); this._v = v; },
  });
  const hud = {
    _L: {},
    _chargeEl: { style: makeStyle(() => firstWrites++) },
    _chargeSecond: { style: makeStyle(() => secondWrites++) },
    ret: { classList: { toggle() {} } },
  };
  const weapon = { firstChargeTime: 0.8, chargeTime: 1.2 };

  // Initial update writes both rings
  updateSplatlingStages(hud, 0.3, null, weapon);
  assert.equal(firstWrites, 1);
  assert.equal(secondWrites, 1);
  const exactFirst = hud._L.splatFirst;
  assert.ok(Math.abs(exactFirst - 0.45) < 1e-12);

  // Tiny float delta that rounds to same quantized integer skips DOM write, but updates exact float
  updateSplatlingStages(hud, 0.3 + 1e-7, null, weapon);
  assert.equal(firstWrites, 1, 'sub-0.01% delta skips strokeDashoffset write');
  assert.equal(secondWrites, 1);
  assert.notEqual(hud._L.splatFirst, exactFirst, 'L.splatFirst still stores exact 0..1 float');

  // Meaningful change writes DOM
  updateSplatlingStages(hud, 0.5, null, weapon);
  assert.equal(firstWrites, 2);
  assert.equal(secondWrites, 1);

  // Weapon switch null reset contract forces DOM write even if charge value is unchanged
  hud._L.splatFirst = hud._L.splatSecond = null;
  updateSplatlingStages(hud, 0.5, null, weapon);
  assert.equal(firstWrites, 3, 'null reset forces first ring write even at same quantized value');
  assert.equal(secondWrites, 2, 'null reset forces second ring write even at same quantized value');
});

test('CPU-3: motion-fk-hotpath-adapter and combat-gpu-cpu-perfect-adapter remove hot-path allocations', () => {
  const balanceSrc = adaptBuildSource('src/game/motion/body-balance.js', readRaw('src/game/motion/body-balance.js'));
  const fnStart = balanceSrc.indexOf('function updateBalanceCenterRotations(balance)');
  const fnEnd = balanceSrc.indexOf('export class BodyBalance {', fnStart);
  const fnBody = balanceSrc.slice(fnStart, fnEnd);
  assert.ok(fnBody.includes('for(let k=0;k<indices.length;k++)'), 'indexed loop in updateBalanceCenterRotations');
  assert.ok(!fnBody.includes('target._onChangeCallback()'), 'empty _onChangeCallback calls removed');

  const fxPre = adaptRenderTransfers('src/fx/fx.js', readRaw('src/fx/fx.js'), replaceOnce);
  const fxSrc = adaptCombatGpuCpuPerfect('src/fx/fx.js', fxPre, replaceOnce);
  assert.ok(!fxSrc.includes('for (const attr of [S.geo.attributes.aColA, S.geo.attributes.aAxis])'), 'no per-update [aColA, aAxis] array literal');
  assert.ok(fxSrc.includes('ai === 0 ? S.geo.attributes.aColA : S.geo.attributes.aAxis'));

  const scSrc = adaptBuildSource('src/core/shadowcache.js', readRaw('src/core/shadowcache.js'));
  assert.ok(!scSrc.includes('dyn.push([o, o.castShadow])'), 'no [o, o.castShadow] pair allocation');
  assert.ok(scSrc.includes('dyn.push(o, o.castShadow)'));
  assert.ok(scSrc.includes('for (let i = 0; i < dyn.length; i += 2) dyn[i].castShadow = dyn[i + 1];'));

  // Runtime verification of flat dyn storage & exception-safe castShadow restoration
  const scClean = scSrc.replace(/^import .*$/gm, '').replace(/^export /gm, '');
  class FakeWebGL2 {}
  const ShadowCache = new Function(
    'THREE', 'G', 'WebGL2RenderingContext', 'installDepthOnlyShadowCache', 'attachDepthCacheLifecycle',
    scClean + '; return ShadowCache;'
  )(THREE, {}, FakeWebGL2, () => {}, () => {});
  const staticMesh = { isMesh: true, castShadow: true };
  const dynA = { isMesh: true, castShadow: true };
  const dynB = { isInstancedMesh: true, castShadow: true };
  const nonCaster = { isMesh: true, castShadow: false };
  const scene = {
    traverse(fn) { fn(staticMesh); fn(dynA); fn(dynB); fn(nonCaster); },
  };
  const sun = {
    isDirectionalLight: true,
    position: { x: 1, y: 2, z: 3 },
    shadow: {
      map: { width: 64, height: 64 },
      mapSize: { x: 64, y: 64 },
      camera: { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 },
    },
  };
  const renderObservations = [];
  let shouldThrow = false;
  const sm = {
    enabled: true,
    autoUpdate: true,
    needsUpdate: true,
    render() {
      renderObservations.push([staticMesh.castShadow, dynA.castShadow, dynB.castShadow]);
      if (shouldThrow) throw new Error('shadow-render-fail');
    },
  };
  const gl = new FakeWebGL2();
  const sc = new ShadowCache({
    shadowMap: sm,
    getContext: () => gl,
    clear() {},
  });
  sc._collect = () => [{ o: staticMesh }];
  sc._cullActors = () => [];
  sc._ensureCache = () => { sc.cache = { width: 64, height: 64 }; };
  sc._blitDepth = () => true;
  sc._rebind = () => {};
  sc._rebindTo = () => {};
  sc.enabled = true;
  sc.roots = [{}];
  sc.dirty = true;
  sc._render(sm, [sun], scene, {});
  assert.deepEqual(renderObservations[0], [true, false, false], 'dynamic casters disabled during static shadow pass');
  assert.equal(dynA.castShadow, true, 'dynA castShadow restored');
  assert.equal(dynB.castShadow, true, 'dynB castShadow restored');
  assert.equal(sc._dynList.length, 0, '_dynList cleared in finally');

  // Exception path also restores all dynamic casters
  sc.dirty = true;
  shouldThrow = true;
  assert.throws(() => sc._render(sm, [sun], scene, {}), /shadow-render-fail/);
  assert.equal(dynA.castShadow, true, 'dynA castShadow restored after throw');
  assert.equal(dynB.castShadow, true, 'dynB castShadow restored after throw');
  assert.equal(sc._dynList.length, 0, '_dynList cleared after throw');
});
