import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resourceFixture } from './resource-fixture.mjs';
import { cachePortrait, clearPortraitCache, portraitPixels, PORTRAIT_PIXELS, reflectionDue } from '../resource-budget.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';
const ROOT = new URL('../../../', import.meta.url);
const canvas = (size = 224) => ({ width: size, height: size, getContext: () => ({ drawImage(src) { this.copied = [src.width, src.height]; } }) });
let api;
test.before(async () => { api = await resourceFixture({ globals: { document: { createElement: () => canvas() } } }); });

test('10000 attract splats retain zero history; normal match timestamps/references survive until disposal', () => {
  const { Match, G } = api;
  const attract = new Match({ attract: true, duration: 99999 }), normal = new Match({ duration: 90 });
  const victim = {}, attacker = {}, event = { victim, attacker, cause: 'main' };
  for (let i = 0; i < 10000; i++) { attract.time--; attract._onSplatted(event); }
  assert.equal(attract.events.length, 0);
  normal.time = 85; normal._onSplatted(event);
  assert.equal(normal.events.length, 1); assert.equal(normal.events[0].t, 5);
  assert.equal(normal.events[0].victim, victim); assert.equal(normal.events[0].attacker, attacker);
  normal.dispose(); assert.equal(normal.events.length, 0); assert.equal(G.local, null);
});

test('mixed portrait sizes obey pixel and entry ceilings; eviction releases only cached source storage', () => {
  for (const touch of [true, false]) {
    const owner = { _pcache: new Map(), mode: 'locker' }, first = canvas();
    cachePortrait(owner, 'first', first, touch, 0);
    for (let i = 0; i < 1000; i++) {
      cachePortrait(owner, 'style-' + i, canvas(i % 2 ? 224 : 176), touch, 0);
      assert.ok(portraitPixels(owner._pcache) <= PORTRAIT_PIXELS[touch ? 'touch' : 'desktop']);
      assert.ok(owner._pcache.size <= 96);
    }
    assert.equal(first.width, 0); assert.equal(first.height, 0);
    const huge = canvas(4096);
    assert.equal(cachePortrait(owner, 'oversize', huge, touch, 0), false);
    assert.equal(huge.width, 4096, 'caller still needs the uncached source for UI copies');
    clearPortraitCache(owner); assert.equal(portraitPixels(owner._pcache), 0);
    assert.equal(cachePortrait(owner, 'old-epoch', canvas(), touch, 0), false);
  }
});

test('native portrait request/cache hit/cancel and late readbacks retain independent current-style copies', async () => {
  const { Showcase, G, THREE } = api; G.game = { mobile: { touch: true } };
  const sc = Object.create(Showcase.prototype);
  Object.assign(sc, { mode: 'locker', _warmState: 'done', _pq: [], _pcache: new Map(), _c2: new THREE.Color(), color: new THREE.Color('orange'), chars: [] });
  let renders = 0, resolve, delivered;
  sc._renderPortrait = () => { renders++; return new Promise(r => { resolve = r; }); };
  const req = { style: { hair: 1 }, size: 224 };
  const canceled = sc.portrait(req, () => assert.fail('canceled callback')); canceled.cancel(); sc._portraitStep(); assert.equal(renders, 0);
  sc.portrait(req, cv => { delivered = cv; }); sc._portraitStep(); const source = canvas(); resolve(source); await Promise.resolve();
  assert.notEqual(delivered, source); assert.equal(delivered.width, 224); assert.equal(sc._pcache.size, 1);
  let hit; sc.portrait(req, cv => { hit = cv; }); assert.equal(renders, 1); assert.notEqual(hit, source);
  sc.portrait({ ...req, style: { hair: 2 } }, cv => { delivered = cv; }); sc._portraitStep();
  sc.hide(); assert.equal(source.width, 0); assert.equal(hit.width, 224, 'visible copy is not invalidated');
  sc.mode = 'locker'; const late = canvas(); resolve(late); await Promise.resolve();
  assert.equal(sc._pcache.size, 0, 'old session cannot repopulate after hide/reopen');
  assert.equal(late.width, 0); assert.equal(delivered.width, 224);
});

test('effective quality preserves desktop and explicitly reduces touch reflection size/cadence/actors', () => {
  const { effectiveQuality } = api;
  for (const [quality, scale] of [['low', 0], ['medium', .28], ['high', .4], ['ultra', .5]]) {
    const desktop = effectiveQuality({ quality }, {}), mobile = effectiveQuality({ quality }, { touch: true, ios: true });
    assert.equal(desktop.reflectionScale, scale); assert.equal(desktop.reflectionInterval, 1);
    assert.equal(desktop.reflectionActors, quality === 'ultra');
    assert.equal(mobile.reflectionScale, Math.min(scale, .2)); assert.equal(mobile.reflectionInterval, 2); assert.equal(mobile.reflectionActors, false);
    assert.equal(mobile, effectiveQuality({ quality }, { touch: true, ios: true }));
  }
});

test('reflection cadence forces quality/resize/re-enable/clock-reset updates without stale matrix edits', () => {
  const p = { reflectionInterval: 2, reflectionActors: false }, e = { _frameId: 0, U: { uReflOn: { value: 0 } } };
  assert.ok(reflectionDue(e, p, 200, 100, .2));
  e._reflRT = { width: 200, height: 100 }; e._reflPolicy = e._reflPendingPolicy; e._reflRenderedFrame = 0; e.U.uReflOn.value = 1;
  e._frameId = 1; assert.equal(reflectionDue(e, p, 200, 100, .2), false);
  e._frameId = 2; assert.ok(reflectionDue(e, p, 200, 100, .2));
  e._frameId = 1; assert.ok(reflectionDue(e, p, 202, 100, .2)); assert.ok(reflectionDue(e, p, 200, 100, .28));
  e.U.uReflOn.value = 0; assert.ok(reflectionDue(e, p, 200, 100, .2));
  e.U.uReflOn.value = 1; e._frameId = -1; assert.ok(reflectionDue(e, p, 200, 100, .2));
});

test('all five native resource connections compose strictly and new runtime files enter build identity', () => {
  for (const file of ['src/game/match.js', 'src/game/showcase.js', 'src/config.js', 'src/world/environment.js', 'src/core/shadowcache.js']) {
    const native = fs.readFileSync(new URL('inkwave-public/' + file, ROOT), 'utf8');
    const out = adaptQualitySource(file, native); assert.notEqual(out, native);
    assert.throws(() => adaptQualitySource(file, out), /quality patch conflict/);
  }
  const identity = qualityIdentity();
  for (const file of ['resource-adapter.mjs', 'resource-budget.mjs', 'depth-cache.mjs']) assert.match(identity[file], /^[a-f0-9]{64}$/);
});

test('portrait callback navigation cannot invalidate the source before remaining UI copies', async () => {
  const { Showcase, G, THREE } = api; G.game = { mobile: { touch: true } };
  const sc = Object.create(Showcase.prototype);
  Object.assign(sc, { mode: 'locker', _warmState: 'done', _pq: [], _pcache: new Map(), _c2: new THREE.Color(), color: new THREE.Color(), chars: [] });
  sc._renderPortrait = () => Promise.resolve(canvas());
  const sizes = [], req = { style: { hair: 0 } };
  sc.portrait(req, cv => { sizes.push(cv.width); sc.hide(); }); sc.portrait(req, cv => sizes.push(cv.width));
  sc._portraitStep(); await Promise.resolve(); assert.deepEqual(sizes, [224, 224]); assert.equal(sc._pcache.size, 0);
});
