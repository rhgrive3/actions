import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GTAO_RESOLUTION_SCALE,
  scaledGtaoDimension,
  installHalfResGtao,
  collectGtaoNonOccluders,
  installGtaoOccluderFilter,
} from '../gtao-budget.mjs';
import { adaptResourceSource } from '../resource-adapter.mjs';
import { replaceOnce, qualityIdentity } from '../adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = new URL('../../../', import.meta.url);

test('scaledGtaoDimension handles normal, fractional/odd rounding, 1px, invalid sizes, and invalid scales without NaN', () => {
  assert.equal(GTAO_RESOLUTION_SCALE, 0.5);
  assert.equal(scaledGtaoDimension(1280), 640);
  assert.equal(scaledGtaoDimension(720), 360);
  assert.equal(scaledGtaoDimension(1359.6), 680);
  assert.equal(scaledGtaoDimension(1359), 680);
  assert.equal(scaledGtaoDimension(829), 415);
  assert.equal(scaledGtaoDimension(3), 2);
  assert.equal(scaledGtaoDimension(1), 1);

  for (const badSize of [0, -1, -500, NaN, Infinity, -Infinity, undefined, null, '100']) {
    const out = scaledGtaoDimension(badSize);
    assert.equal(out, 1);
    assert.equal(Number.isNaN(out), false);
  }

  for (const badScale of [0, -0.5, NaN, Infinity, -Infinity, null, 'bad']) {
    const out = scaledGtaoDimension(1000, badScale);
    assert.equal(out, 500);
    assert.equal(Number.isNaN(out), false);
  }

  assert.equal(scaledGtaoDimension(1000, 0.25), 250);
  assert.equal(scaledGtaoDimension(1, 0.1), 1);
});

test('installHalfResGtao guards invalid targets, is idempotent, normalizes bad options, and scales setSize and updatePdMaterial non-destructively', () => {
  assert.equal(installHalfResGtao(null), false);
  assert.equal(installHalfResGtao(undefined), false);
  assert.equal(installHalfResGtao({}), false);
  assert.equal(installHalfResGtao({ setSize: 'nope' }), false);

  const sizes = [];
  const pdCalls = [];
  const gtao = {
    setSize(w, h) {
      sizes.push([w, h]);
      return `${w}x${h}`;
    },
    updatePdMaterial(params) {
      pdCalls.push(params);
      return params;
    },
  };

  assert.equal(installHalfResGtao(gtao, { basePdRadius: 6 }), true);
  assert.equal(gtao._iwResolutionScale, 0.5);
  assert.deepEqual(pdCalls, [{ radius: 3 }]);

  // Idempotent: second call must not wrap again or double-shrink.
  assert.equal(installHalfResGtao(gtao, { basePdRadius: 6 }), false);
  assert.equal(pdCalls.length, 1);

  // Repeated setSize calls (EffectComposer.addPass / setSize / setPixelRatio / setDynamicScale) stay at 0.5x.
  assert.equal(gtao.setSize(1359.6, 829.2), '680x415');
  assert.equal(gtao.setSize(1920, 1080), '960x540');
  assert.equal(gtao.setSize(1920, 1080), '960x540');
  assert.equal(gtao.setSize(0, -10), '1x1');
  assert.deepEqual(sizes, [
    [680, 415],
    [960, 540],
    [960, 540],
    [1, 1],
  ]);

  // Subsequent updatePdMaterial calls preserve scaled radius and do not mutate caller object.
  const input = { radius: 6, samples: 16, rings: 2 };
  gtao.updatePdMaterial(input);
  assert.deepEqual(input, { radius: 6, samples: 16, rings: 2 });
  assert.deepEqual(pdCalls[1], { radius: 3, samples: 16, rings: 2 });

  // Calls without radius pass through untouched; invalid radius falls back cleanly.
  const noRadius = { samples: 16 };
  gtao.updatePdMaterial(noRadius);
  assert.equal(pdCalls[2], noRadius);
  gtao.updatePdMaterial({ radius: NaN, lumaPhi: 10 });
  assert.deepEqual(pdCalls[3], { radius: 3, lumaPhi: 10 });

  // Invalid scale/basePdRadius normalize to defaults (0.5 and 6 -> radius 3).
  const badOptSizes = [];
  const badOptPd = [];
  const gtaoBad = {
    setSize(w, h) { badOptSizes.push([w, h]); },
    updatePdMaterial(p) { badOptPd.push(p); },
  };
  assert.equal(installHalfResGtao(gtaoBad, { scale: -1, basePdRadius: NaN }), true);
  assert.equal(gtaoBad._iwResolutionScale, 0.5);
  assert.deepEqual(badOptPd, [{ radius: 3 }]);
  gtaoBad.setSize(800, 600);
  assert.deepEqual(badOptSizes, [[400, 300]]);

  // Target without updatePdMaterial still installs cleanly.
  const noPdSizes = [];
  const gtaoNoPd = { setSize(w, h) { noPdSizes.push([w, h]); } };
  assert.equal(installHalfResGtao(gtaoNoPd), true);
  gtaoNoPd.setSize(400, 200);
  assert.deepEqual(noPdSizes, [[200, 100]]);
});

test('installGtaoOccluderFilter hides only the 15 non-occluder nodes during normalMaterial pass, keeps arena geometry, and restores on normal/reentrant/error paths', () => {
  assert.equal(installGtaoOccluderFilter(null, {}), false);
  assert.equal(installGtaoOccluderFilter({}, {}), false);
  assert.equal(installGtaoOccluderFilter({ _renderOverride: 123 }, {}), false);

  const node = (name, visible = true) => ({ name, visible });
  const env = {
    root: node('env.root'),
    pilings: node('env.pilings'),
    dockProps: node('env.dockProps'),
    moored: node('env.moored'),
    props: node('env.props'),
    sky: node('env.sky'),
    sea: node('env.sea'),
    lhBeam: node('env.lhBeam'),
    city: node('env.city'),
    terrain: node('env.terrain'),
    staticScenery: node('env.staticScenery'),
    ferris: node('env.ferris'),
    trees: node('env.trees'),
    sailInst: node('env.sailInst'),
    buoyInst: node('env.buoyInst'),
    gullInst: node('env.gullInst'),
  };
  const hiddenInitially = node('env.gullInst.hidden', false);
  env.gullInst = hiddenInitially;
  // Duplicate reference check: lhBeam aliases sky.
  env.lhBeam = env.sky;

  const fxRoot = node('fx.root');
  const blobs = node('projectiles.blobs');
  const projVisualsMesh = node('projectiles.projectileVisuals.mesh');
  const arcRing = node('projectiles.arcRing');
  const arenaActor = node('arena.actor');

  const G = {
    env,
    fx: { root: fxRoot },
    projectiles: {
      blobs,
      projectileVisuals: { mesh: projVisualsMesh },
      arcRing,
    },
  };

  // Direct collectGtaoNonOccluders check: excludes hiddenInitially and deduplicates env.sky/env.lhBeam.
  const collected = collectGtaoNonOccluders(G);
  assert.equal(collected.length, 13);
  assert.equal(collected.includes(hiddenInitially), false);
  assert.equal(collected.filter((n) => n === env.sky).length, 1);
  assert.equal(collected.includes(env.root), false);
  assert.equal(collected.includes(env.pilings), false);
  assert.equal(collected.includes(env.dockProps), false);
  assert.equal(collected.includes(env.moored), false);
  assert.equal(collected.includes(env.props), false);

  const normalMat = { name: 'normal' };
  const otherMat = { name: 'other' };
  let observed = null;
  let shouldThrow = false;
  let reenter = false;
  let reenterObserved = null;

  const gtao = {
    normalMaterial: normalMat,
    _renderOverride(renderer, material) {
      if (reenter) {
        reenter = false;
        // Re-entrant call while outer pass holds scratch array.
        const extra = node('reenter.extra');
        G.env.gullInst = extra;
        this._renderOverride(renderer, normalMat);
        reenterObserved = { extraRestored: extra.visible };
        G.env.gullInst = hiddenInitially;
      }
      observed = {
        material,
        sky: env.sky.visible,
        sea: env.sea.visible,
        city: env.city.visible,
        terrain: env.terrain.visible,
        staticScenery: env.staticScenery.visible,
        ferris: env.ferris.visible,
        trees: env.trees.visible,
        sailInst: env.sailInst.visible,
        buoyInst: env.buoyInst.visible,
        gullInst: hiddenInitially.visible,
        fxRoot: fxRoot.visible,
        blobs: blobs.visible,
        projVisualsMesh: projVisualsMesh.visible,
        arcRing: arcRing.visible,
        envRoot: env.root.visible,
        pilings: env.pilings.visible,
        dockProps: env.dockProps.visible,
        moored: env.moored.visible,
        props: env.props.visible,
        arenaActor: arenaActor.visible,
        shadowAuto: renderer.shadowMap.autoUpdate,
        shadowNeeds: renderer.shadowMap.needsUpdate,
      };
      if (shouldThrow) throw new Error('boom');
      return 'ok';
    },
  };

  assert.equal(installGtaoOccluderFilter(gtao, G), true);
  assert.equal(installGtaoOccluderFilter(gtao, G), false);

  const renderer = { shadowMap: { autoUpdate: true, needsUpdate: true } };

  // Non-normal material: nothing hidden, shadowMap untouched.
  assert.equal(gtao._renderOverride(renderer, otherMat), 'ok');
  assert.equal(observed.sky, true);
  assert.equal(observed.fxRoot, true);
  assert.equal(observed.blobs, true);
  assert.equal(observed.shadowAuto, true);
  assert.equal(observed.shadowNeeds, true);

  // Normal material: non-occluders hidden, arena geometry kept, shadowMap protected, all restored after.
  assert.equal(gtao._renderOverride(renderer, normalMat), 'ok');
  assert.equal(observed.sky, false);
  assert.equal(observed.sea, false);
  assert.equal(observed.city, false);
  assert.equal(observed.terrain, false);
  assert.equal(observed.staticScenery, false);
  assert.equal(observed.ferris, false);
  assert.equal(observed.trees, false);
  assert.equal(observed.sailInst, false);
  assert.equal(observed.buoyInst, false);
  assert.equal(observed.gullInst, false);
  assert.equal(observed.fxRoot, false);
  assert.equal(observed.blobs, false);
  assert.equal(observed.projVisualsMesh, false);
  assert.equal(observed.arcRing, false);
  assert.equal(observed.envRoot, true);
  assert.equal(observed.pilings, true);
  assert.equal(observed.dockProps, true);
  assert.equal(observed.moored, true);
  assert.equal(observed.props, true);
  assert.equal(observed.arenaActor, true);
  assert.equal(observed.shadowAuto, false);
  assert.equal(observed.shadowNeeds, false);

  // Restored states after normal pass.
  assert.equal(env.sky.visible, true);
  assert.equal(fxRoot.visible, true);
  assert.equal(blobs.visible, true);
  assert.equal(projVisualsMesh.visible, true);
  assert.equal(arcRing.visible, true);
  assert.equal(hiddenInitially.visible, false);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(renderer.shadowMap.needsUpdate, true);

  // Re-entrant call safety.
  reenter = true;
  assert.equal(gtao._renderOverride(renderer, normalMat), 'ok');
  assert.equal(reenterObserved.extraRestored, true);
  assert.equal(env.sky.visible, true);
  assert.equal(hiddenInitially.visible, false);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(renderer.shadowMap.needsUpdate, true);

  // Exception path: finally must still restore visibility, shadowMap, and busy flag.
  shouldThrow = true;
  assert.throws(() => gtao._renderOverride(renderer, normalMat), /boom/);
  assert.equal(env.sky.visible, true);
  assert.equal(fxRoot.visible, true);
  assert.equal(arcRing.visible, true);
  assert.equal(hiddenInitially.visible, false);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(renderer.shadowMap.needsUpdate, true);

  // Subsequent call works cleanly after exception.
  shouldThrow = false;
  assert.equal(gtao._renderOverride(renderer, normalMat), 'ok');
  assert.equal(observed.sky, false);
  assert.equal(env.sky.visible, true);

  // Null/missing G subtrees are safely ignored.
  assert.deepEqual(collectGtaoNonOccluders(null), []);
  assert.deepEqual(collectGtaoNonOccluders({ env: null, fx: null, projectiles: null }), []);
});

test('installGtaoOccluderFilter chains cleanly with a self-occlusion style wrapper in both installation orders', () => {
  const SELF_OCCLUSION_SYM = Symbol.for('inkwave.self-occlusion.gtao.v1');
  function installSelfOcclusionWrapper(gtao, localRoot) {
    if (gtao[SELF_OCCLUSION_SYM]) return false;
    gtao[SELF_OCCLUSION_SYM] = true;
    const prev = gtao._renderOverride;
    gtao._renderOverride = function (renderer, material) {
      if (material !== this.normalMaterial) return prev.apply(this, arguments);
      const wasVisible = localRoot.visible;
      const shadow = renderer?.shadowMap;
      const autoUpdate = shadow?.autoUpdate;
      const needsUpdate = shadow?.needsUpdate;
      try {
        localRoot.visible = false;
        if (shadow) { shadow.autoUpdate = false; shadow.needsUpdate = false; }
        return prev.apply(this, arguments);
      } finally {
        localRoot.visible = wasVisible;
        if (shadow) { shadow.autoUpdate = autoUpdate; shadow.needsUpdate = needsUpdate; }
      }
    };
    return true;
  }

  for (const order of ['occluder-first', 'self-occlusion-first']) {
    const normalMat = { name: 'normal' };
    const sky = { visible: true };
    const localRoot = { visible: true };
    const G = { env: { sky }, fx: null, projectiles: null };
    const renderer = { shadowMap: { autoUpdate: true, needsUpdate: true } };
    let snap = null;

    const gtao = {
      normalMaterial: normalMat,
      _renderOverride(r) {
        snap = {
          sky: sky.visible,
          localRoot: localRoot.visible,
          autoUpdate: r.shadowMap.autoUpdate,
          needsUpdate: r.shadowMap.needsUpdate,
        };
      },
    };

    if (order === 'occluder-first') {
      assert.equal(installGtaoOccluderFilter(gtao, G), true);
      assert.equal(installSelfOcclusionWrapper(gtao, localRoot), true);
    } else {
      assert.equal(installSelfOcclusionWrapper(gtao, localRoot), true);
      assert.equal(installGtaoOccluderFilter(gtao, G), true);
    }

    gtao._renderOverride(renderer, normalMat);
    assert.deepEqual(snap, { sky: false, localRoot: false, autoUpdate: false, needsUpdate: false }, order);
    assert.equal(sky.visible, true, order);
    assert.equal(localRoot.visible, true, order);
    assert.equal(renderer.shadowMap.autoUpdate, true, order);
    assert.equal(renderer.shadowMap.needsUpdate, true, order);
  }
});

test('renderer.js build composition wires half-res GTAO and occluder filter, rejects double resource patch, and registers gtao-budget.mjs in qualityIdentity', () => {
  const native = fs.readFileSync(new URL('inkwave-public/src/core/renderer.js', ROOT), 'utf8');

  const built = adaptBuildSource('src/core/renderer.js', native);
  assert.match(
    built,
    /import \{ scaledGtaoDimension, installHalfResGtao, installGtaoOccluderFilter \} from '\.\.\/\.\.\/patches\/local-quality\/gtao-budget\.mjs';/,
  );
  assert.ok(built.includes('new GTAOPass(this.scene, this.camera, scaledGtaoDimension(w * pr), scaledGtaoDimension(h * pr))'));
  const installHalfIdx = built.indexOf('installHalfResGtao(ao, { basePdRadius: 6 });');
  const installFilterIdx = built.indexOf('installGtaoOccluderFilter(ao, G);');
  const addPassIdx = built.indexOf('comp.addPass(ao);');
  assert.ok(installHalfIdx > 0 && installFilterIdx > installHalfIdx && addPassIdx > installFilterIdx);

  const once = adaptResourceSource('src/core/renderer.js', native, replaceOnce);
  assert.notEqual(once, native);
  assert.throws(() => adaptResourceSource('src/core/renderer.js', once, replaceOnce), /quality patch conflict/);

  const identity = qualityIdentity();
  assert.match(identity['gtao-budget.mjs'], /^[a-f0-9]{64}$/);
});
