// #581 — Halyard reflection-skip cache retains disposed PropKit atlas/meshes after leaving the map.
// Focused native regression for the build-only invalidation in ../refl-skip-adapter.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptReflSkip } from '../refl-skip-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import { compose, idleFixture } from './idle-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const count = (s, needle) => s.split(needle).length - 1;
const RAW = 'src/world/environment.js';
const readRaw = () => fs.readFileSync(path.join(ROOT, 'inkwave-public', RAW), 'utf8');

test('#581 invalidation is wired on the arena rebuild and the marina transition, nowhere else', () => {
  const out = compose(RAW);

  assert.equal(count(out, '_invalidateReflSkips() {'), 1, 'exactly one helper definition');
  assert.equal(count(out, 'this._invalidateReflSkips();'), 2, 'arena rebuild + marina transition');
  assert.match(out, /rebuildForArena\(bounds, rects\) \{\n    this\._invalidateReflSkips\(\);\n    this\._marina = this\._stageMarina\(\);/);
  assert.match(out, /const stageMarina = this\._stageMarina\(\);\n    if \(stageMarina !== this\._marina\) \{ this\._marina = stageMarina; this\._invalidateReflSkips\(\); this\._rebuildDock\(\); \}/);

  // Both anchors are consumed by one application, so the layer can never stack a duplicate definition.
  assert.equal(out.includes('rebuildForArena(bounds, rects) {\n    this._marina = this._stageMarina();'), false);
  assert.equal(out.includes('stageMarina !== this._marina) { this._marina = stageMarina; this._rebuildDock(); }'), false);
  assert.throws(() => adaptReflSkip(RAW, out, replaceOnce), /refl-skip: arena rebuild/);

  // The lazy cache and the ultra / non-ultra reflection exclusion block are untouched.
  assert.match(out, /if \(this\._reflSkipKey === key\) return this\._reflSkipList;/);
  assert.match(out, /this\._reflSkipKey = key; this\._reflSkipList = list;/);
  assert.match(out, /if \(q !== 'ultra'\) \{/);
  assert.match(out, /hide\.push\(\.\.\.this\._reflSkips\(scene\)\);/);

  // Raw inkwave-public/ stays byte-identical: the native anchors are still there, unpatched.
  const raw = readRaw();
  assert.equal(raw.includes('_invalidateReflSkips'), false, 'raw upstream untouched');
  assert.equal(raw.includes('rebuildForArena(bounds, rects) {\n    this._marina = this._stageMarina();'), true, 'native arena rebuild anchor still native');
  assert.equal(raw.includes('stageMarina !== this._marina) { this._marina = stageMarina; this._rebuildDock(); }'), true, 'native marina transition anchor still native');
  assert.equal(compose(RAW), out, 'composition is deterministic');
});

// ----------------------------------------------------------------------------- lifecycle

const PROP_NAMES = ['props:flags', 'props:glow', 'props:blink', 'props:spin:a', 'props:fence', 'props:blob', 'props:foliage'];

function stageScene(label, propNames, uid) {
  const mesh = (n) => ({
    name: n, gen: label, uuid: `${label}-${n}-${uid()}`, children: [],
    geometry: { position: { array: new Float32Array(9) } },
    material: { map: { image: { width: 2048, height: 2048 } } },
  });
  return {
    label,
    children: [
      { name: 'decor', gen: label, uuid: `${label}-decor`, children: [] },
      { name: 'FX', gen: label, uuid: `${label}-fx`, children: [] },
      { name: 'props', gen: label, uuid: `${label}-props`, children: propNames.map(mesh) },
    ],
  };
}

function harness(Environment) {
  const e = Object.create(Environment.prototype);
  const calls = [];
  e._writeRects = () => calls.push('rects');
  e._rebuildDock = () => calls.push('dock');
  e._applyMarina = () => calls.push('marina');
  e._fitShadow = () => calls.push('shadow');
  e._bakeFarReflection = () => calls.push('bake');
  e._stageMarina = () => false;
  return { e, calls };
}

const BOUNDS = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };

test('#581 arena teardown drops the stale skip list, re-enter and repeated transitions stay bounded', async () => {
  const { Environment } = await idleFixture();
  const { e, calls } = harness(Environment);
  let n = 0;
  const halyard = stageScene('halyard', PROP_NAMES, () => n++);
  const tidewater = stageScene('tidewater', ['props:flags', 'props:blob'], () => n++);

  // 1. a Halyard planar-reflection frame below ultra populates the cache with live Halyard objects
  const first = e._reflSkips(halyard);
  assert.equal(e._reflSkipList, first);
  assert.ok(e._reflSkipKey, 'cache keyed after the first reflection frame');
  assert.equal(first.length, 2 + PROP_NAMES.length, 'decor + FX + the selected atlas-backed prop meshes');
  const flags = first.find((o) => o.name === 'props:flags');
  assert.ok(flags, 'the Halyard flags mesh is cached');
  assert.equal(flags.material.map.image.width, 2048, 'the cached mesh still points at the 2048² atlas canvas');
  assert.ok(first.every((o) => o.gen === 'halyard'));

  // 2. leaving Halyard: main.js _buildWorld disposes props/decor, then calls rebuildForArena
  const stale = [...first];
  e.rebuildForArena(BOUNDS, [BOUNDS]);
  assert.equal(e._reflSkipList, null, 'no Environment path to the disposed Halyard meshes');
  assert.equal(e._reflSkipKey, null, 'stale key dropped, not reused');
  assert.deepEqual(calls, ['rects', 'dock', 'marina', 'shadow', 'bake'], 'the native rebuild still runs, in order');

  // 3. re-entering Halyard rebuilds the exclusions from the scene that is live then
  const again = e._reflSkips(halyard);
  assert.notEqual(again, first, 'rebuilt, not the disposed generation');
  assert.equal(again.length, first.length, 'the exclusion set itself is unchanged');
  assert.equal(e._reflSkipList, again);
  assert.equal(e._reflSkips(halyard), again, 'the lazy cache still short-circuits a repeated call');
  assert.ok(again.every((o) => stale.includes(o)), 'same live scene, same exclusions');

  // 4. repeated transitions never keep a previous generation alive and never grow the cache
  for (let i = 0; i < 6; i++) {
    const scene = i % 2 ? halyard : tidewater;
    e.rebuildForArena(BOUNDS, []);
    assert.equal(e._reflSkipList, null, `generation ${i}: cache empty right after the rebuild`);
    assert.equal(e._reflSkipKey, null, `generation ${i}: key empty right after the rebuild`);
    const list = e._reflSkips(scene);
    assert.ok(list.length > 0 && list.length <= 2 + PROP_NAMES.length, `generation ${i}: bounded`);
    assert.ok(list.every((o) => o.gen === scene.label), `generation ${i}: only the live stage is reachable`);
  }
});

test('#581 the marina transition rides the native setTheme branch and the invalidator is idempotent', async () => {
  const { Environment } = await idleFixture();
  const out = compose(RAW);
  assert.match(
    out,
    /const stageMarina = this\._stageMarina\(\);\n    if \(stageMarina !== this\._marina\) \{ this\._marina = stageMarina; this\._invalidateReflSkips\(\); this\._rebuildDock\(\); \}/,
    'setTheme drops the cache exactly when the stage water mode flips',
  );

  const e = Object.create(Environment.prototype);
  e._invalidateReflSkips();
  assert.equal(e._reflSkipKey, null, 'safe on an unpopulated cache');
  assert.equal(e._reflSkipList, null, 'safe on an unpopulated cache');
  e._reflSkipKey = 'stale';
  e._reflSkipList = [{ name: 'props:flags' }];
  e._invalidateReflSkips();
  assert.equal(e._reflSkipKey, null);
  assert.equal(e._reflSkipList, null);
  e._invalidateReflSkips();
  assert.equal(e._reflSkipList, null, 'repeated teardown transitions stay harmless');
});
