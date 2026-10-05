// Issue #483 — bounded hair-geometry cache lifecycle + native CPU-retention correction.
// Unit level: exact ref-count pairing, far-tier quality dedup, rematch plateau, and the rule that
// the helper only ever builds through the NARROW native owned builder (never the caching
// getHairStyle, which would keep every disposed geometry strongly referenced forever).
// Native level: a real `Character` graph (production modules through `adaptSource` + `adaptIssue483`)
// constructed in a vm, with TEST-ONLY probes on the module-private `_hair` / `_inv` maps of
// character-geo.js (instrumented in this fixture only — no shipping test exports). Asserts:
//   * owned builds never enter the native caches (the reported CPU-retention root),
//   * real THREE.BufferGeometry dispose() events + shared-mesh survival for live Characters,
//   * a re-seen look gets FRESH geometry after the final release (never re-enters a disposed entry),
//   * varied looks x qualities x rematches keep the native cache at zero while the owned set stays
//     bounded and returns to a zero baseline,
//   * the released geometry becomes unreachable (WeakRef + GC) — no CPU strong reference remains,
//   * native bone/rest parity with the untouched getRestPositions contract, and the legacy public
//     getHairStyle still caches for non-owned callers,
//   * the full production order S3 -> 483 -> touch-layout -> reliability -> quality compiles for
//     both transformed rels.
// Negative control: the same native graph without the adapter reproduces the defect natively
// (rig meta read from a hero mesh, native caches grow by themselves).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import {
  adaptIssue483,
  adaptIssue483Character,
  adaptIssue483CharacterGeo,
  ISSUE_483_REL,
  ISSUE_483_GEO_REL,
  ISSUE_483_RIG_ANCHOR,
  ISSUE_483_RIG_TAIL_ANCHOR,
  ISSUE_483_TIER_ANCHOR,
  ISSUE_483_QUALITY_ANCHOR,
  ISSUE_483_DISPOSE_ANCHOR,
  ISSUE_483_GEO_ANCHOR,
} from '../issue-483-adapter.mjs';
import {
  acquireHair,
  releaseHair,
  hairKeyFor,
  getAnatomy,
  releaseAnatomy,
  hairCacheKey,
  hairStats,
  resetHairForTests,
} from '../runtime/hair-cache.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const NATIVE_CHAR = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/character.js'), 'utf8');
const NATIVE_GEO = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/character-geo.js'), 'utf8');

function counts() { return { hair: 8, hats: 4, brows: 4 }; }
function mkLog() { return { builds: 0, reuses: 0, heroBuilds: 0, ownedBuilds: 0, legacyHits: 0, built: [] }; }

function makeEntry(tier, style) {
  const geo = { isBufferGeometry: true, disposed: 0, dispose() { this.disposed += 1; } };
  return { geo, lod: tier, meta: [{ tier, style: { ...style } }], rest: { head: { x: 1, clone() { return { x: 1 }; } } } };
}
/**
 * Stand-in for character-geo.js: the legacy caching getHairStyle (public contract, must NOT be used
 * by the helper) plus the narrow owned builder exposed by adaptIssue483CharacterGeo (always fresh).
 */
function makeNative(log) {
  const entries = new Map();
  const tierOf = (lod) => (lod === 'hero' || lod === 'far' ? lod : 'game');
  return {
    entries,
    log,
    hairStyleCount: 8, hatKindCount: 4, browKindCount: 4,
    getHairStyle(style, lod = 'game') {
      const tier = tierOf(lod);
      const key = hairCacheKey(style, tier, 'high', counts());
      let entry = entries.get(key);
      if (!entry) { entry = makeEntry(tier, style); entries.set(key, entry); log.builds += 1; }
      else log.reuses += 1;
      log.legacyHits += 1;
      if (tier === 'hero') log.heroBuilds += 1;
      return entry;
    },
    buildOwnedHairStyle(style, lod = 'game') {
      const entry = makeEntry(tierOf(lod), style);
      log.ownedBuilds += 1;
      log.built.push(entry);
      if (tierOf(lod) === 'hero') log.heroBuilds += 1;
      return entry;
    },
    hairQuality: () => 'high',
  };
}

test('issue-483 transform rewrites exactly the character + character-geo anchors', () => {
  assert.equal(NATIVE_CHAR.split(ISSUE_483_RIG_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_CHAR.split(ISSUE_483_RIG_TAIL_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_CHAR.split(ISSUE_483_TIER_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_CHAR.split(ISSUE_483_QUALITY_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_CHAR.split(ISSUE_483_DISPOSE_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_GEO.split(ISSUE_483_GEO_ANCHOR).length - 1, 1);

  const adapted = adaptIssue483(ISSUE_483_REL, adaptSource(ISSUE_483_REL, NATIVE_CHAR));
  assert.ok(adapted.includes('patches/splatoon3/runtime/hair-cache.mjs'));
  assert.ok(adapted.includes('getHairAnatomy483'));
  assert.ok(adapted.includes('acquireHair483'));
  assert.ok(adapted.includes('releaseHairKey483'));
  assert.ok(adapted.includes('hairKeyFor483'));
  assert.ok(adapted.includes('HAIR_NATIVE_483'));
  // the owned native builder + real catalogs + real native quality drive every helper key
  assert.ok(adapted.includes('buildOwnedHairStyle: buildOwnedHairStyle483'), 'owned builder must reach the helper');
  assert.ok(adapted.includes('hairStyleCount: HAIR_STYLES'), 'hair count must come from the catalog export');
  assert.ok(adapted.includes('hatKindCount: HAT_KINDS483.length'), 'hat count must come from HAT_KINDS');
  assert.ok(adapted.includes('browKindCount: BROW_KINDS483.length'), 'brow count must come from BROW_KINDS');
  assert.ok(adapted.includes('hairQuality: hairQuality483'), 'quality must be the real native hairQuality()');
  assert.ok(!adapted.includes('hatKindCount: 4'), 'no hardcoded hat count');
  assert.ok(!adapted.includes('browKindCount: 4'), 'no hardcoded brow count');
  assert.ok(!adapted.includes("hairQuality: () => (G.settings?.quality || 'high')"), 'no quality re-implementation');
  // native hero/meta paths are gone from the patched character
  assert.ok(!adapted.includes('const hair = getHairStyle(this.style);'));
  assert.ok(!adapted.includes('getRestPositions(this.style)'));
  assert.ok(!adapted.includes('getBoneInverses(this.style)'));
  assert.ok(!adapted.includes('H = getHairStyle(this.style, tn)'));
  assert.equal(adaptIssue483('src/game/actor.js', 'x'), 'x');
  assert.throws(() => adaptIssue483Character(ISSUE_483_REL, 'no anchor'), /patch conflict/);
});
test('issue-483 character-geo transform: owned builder added, legacy getHairStyle untouched', () => {
  const geo = adaptIssue483(ISSUE_483_GEO_REL, NATIVE_GEO);
  assert.ok(geo.includes("export function buildOwnedHairStyle(st, lod = 'hero') {"), 'owned builder must be exported');
  assert.ok(geo.includes('  const k = hairKey(st);\n  return buildHair(k.hair, k.hat, k.brows, lod);'),
    'owned builder must use the real hairKey + buildHair pipeline');
  // legacy public contract stays intact above the insertion point
  assert.ok(geo.includes("export function getHairStyle(st, lod = 'hero') {"));
  assert.equal(geo.split(ISSUE_483_GEO_ANCHOR).length - 1, 1, 'the caching getter keeps its body');
  // no global flush / eviction / disposal of shared native geometry
  assert.ok(!geo.includes('_hair.clear()'), 'no cache flush');
  assert.ok(!geo.includes('_hair.delete('), 'no cache eviction');
  assert.ok(!geo.includes('_inv.clear()'), 'no inverse-cache flush');
  // narrow rel dispatch + idempotence + conflict detection
  assert.equal(adaptIssue483CharacterGeo('src/game/actor.js', 'x'), 'x');
  assert.equal(adaptIssue483CharacterGeo(ISSUE_483_GEO_REL, geo), geo, 'second application must be a no-op');
  assert.throws(() => adaptIssue483CharacterGeo(ISSUE_483_GEO_REL, 'no anchor'), /patch conflict/);
  // adaptSource itself never touches this rel (no branch): the wire lives in the build composition
  assert.equal(adaptSource(ISSUE_483_GEO_REL, NATIVE_GEO), NATIVE_GEO);
});

test('issue-483 helper: refuses the caching native getHairStyle and missing catalog counts', () => {
  resetHairForTests();
  const legacyOnly = {
    hairStyleCount: 8, hatKindCount: 4, browKindCount: 4, hairQuality: () => 'high',
    getHairStyle() { throw new Error('legacy getHairStyle must not be called by the helper'); },
  };
  assert.throws(() => acquireHair(legacyOnly, { hair: 1, hat: 0, brows: 0 }, 'game', 'high'), /owned builder/);
  assert.throws(() => getAnatomy(legacyOnly, { hair: 1, hat: 0, brows: 0 }), /owned builder/);
  // counts are mandatory - no silent 8/4/4 fallback that would desync keys from the real catalogs
  assert.throws(() => hairKeyFor({ buildOwnedHairStyle() {} }, { hair: 1, hat: 0, brows: 0 }, 'game', 'high'), /catalog counts/);
  assert.equal(hairStats().entries, 0);
});

test('issue-483 helper: shared style reuses one owned mesh; last release disposes exactly once', () => {
  resetHairForTests();
  const log = mkLog();
  const native = makeNative(log);
  const style = { hair: 1, hat: 0, brows: 2 };
  const first = acquireHair(native, style, 'game', 'high');
  const second = acquireHair(native, style, 'game', 'high');
  assert.equal(first, second);
  assert.equal(log.ownedBuilds, 1, 'one owned build for the shared entry');
  assert.equal(log.legacyHits, 0, 'the helper must never touch the caching getHairStyle');
  assert.equal(native.entries.size, 0, 'the legacy cache stays empty');
  assert.equal(hairStats().liveUsers, 2);
  assert.equal(releaseHair(style, 'game', 'high', counts()), false);
  assert.equal(first.geo.disposed, 0, 'shared mesh must survive while one Character still uses it');
  assert.equal(releaseHair(style, 'game', 'high', counts()), true);
  assert.equal(first.geo.disposed, 1, 'owned mesh disposed exactly once at zero users');
  assert.equal(hairStats().entries, 0, 'the owned set is empty at zero users');
  assert.equal(releaseHair(style, 'game', 'high', counts()), false);
});
test('issue-483 helper: anatomy never builds hero; far ignores quality in the key', () => {
  resetHairForTests();
  const log = mkLog();
  const native = makeNative(log);
  const style = { hair: 3, hat: 1, brows: 1 };
  const anatomy = getAnatomy(native, style);
  assert.equal(log.heroBuilds, 0, 'rig metadata must not materialise a hero mesh');
  assert.ok(anatomy.meta[0].tier === 'game');
  assert.equal(log.legacyHits, 0, 'anatomy must go through the owned builder');
  releaseAnatomy(anatomy);
  assert.equal(hairStats().entries, 0);
  assert.equal(
    hairCacheKey(style, 'far', 'low', counts()),
    hairCacheKey(style, 'far', 'ultra', counts()),
    'far detail keys must not multiply retained quality variants',
  );
  assert.notEqual(
    hairCacheKey(style, 'game', 'low', counts()),
    hairCacheKey(style, 'game', 'high', counts()),
  );
});

test('issue-483 defect mirror: unpatched native cache grows monotonically per look', () => {
  const log = mkLog();
  const native = makeNative(log);
  // Mirrors the reported defect: every fresh bot look adds a permanent entry and the
  // rig path additionally materialises a hero mesh (heroBuilds tracks that).
  for (let hair = 0; hair < 8; hair += 1) {
    for (let hat = 0; hat < 4; hat += 1) {
      native.getHairStyle({ hair, hat, brows: 0 }, 'game');
      native.getHairStyle({ hair, hat, brows: 0 }, 'hero');
    }
  }
  assert.equal(native.entries.size, 64);
  assert.equal(log.builds, 64);
  assert.equal(log.heroBuilds, 32);
  assert.equal(log.reuses, 0);
  assert.equal(log.ownedBuilds, 0, 'the defect path never uses the owned builder');
});

test('issue-483 acceptance: rematch cycle stays bounded and returns to baseline', () => {
  resetHairForTests();
  const log = mkLog();
  const native = makeNative(log);
  let peak = 0;
  for (let round = 0; round < 3; round += 1) {
    const sequence = [];
    for (let i = 0; i < 40; i += 1) sequence.push({ hair: i % 8, hat: i % 4, brows: (i * 3 + round) % 4 });
    const held = sequence.map((style) => acquireHair(native, style, 'game', 'high'));
    peak = Math.max(peak, hairStats().entries);
    for (let i = 0; i < held.length; i += 1) releaseHair(sequence[i], 'game', 'high', counts());
    const after = hairStats();
    assert.equal(after.entries, 0, 'each round must return to baseline');
    assert.equal(after.liveUsers, 0);
  }
  assert.ok(peak <= 32, 'bounded plateau, saw ' + peak);
  assert.ok(hairStats().reuses > 0, 'repeat looks must reuse cached meshes');
  assert.equal(native.entries.size, 0, 'the legacy native cache is never populated by the helper');
  assert.equal(log.legacyHits, 0);
  for (const entry of log.built) assert.ok(entry.geo.disposed <= 1);
  assert.ok(log.built.length > 0, 'owned builds happened');
});
// Full production composition: S3 -> 483 -> touch-layout -> reliability -> quality.
// The wire point is the build composition (scripts/build-inkwave.mjs adaptBuildSource and
// scripts/check-inkwave-patches.mjs), NOT patches/splatoon3/adapter.mjs: adaptSource's existing
// src/game/character.js branch early-returns, so a wire placed after that branch never runs, and
// adaptSource has no branch at all for src/game/character-geo.js.
async function runProductionOrder() {
  const { execFile } = await import('node:child_process');
  const script = `
    const fs = await import('node:fs');
    const path = await import('node:path');
    const vm = await import('node:vm');
    const ROOT_DIR = ${JSON.stringify(ROOT)};
    const P = path.join(ROOT_DIR, 'patches/splatoon3');
    const { adaptSource } = await import(path.join(P, 'adapter.mjs'));
    const a483 = await import(path.join(P, 'issue-483-adapter.mjs'));
    const { adaptTouchLayout } = await import(path.join(ROOT_DIR, 'patches/touch-layout/adapter.mjs'));
    const { adaptReliability } = await import(path.join(ROOT_DIR, 'patches/reliability/adapter.mjs'));
    const { adaptQualitySource } = await import(path.join(ROOT_DIR, 'patches/local-quality/adapter.mjs'));
    const fail = (m) => { throw new Error('issue-483 production order: ' + m); };
    for (const rel of ['src/game/character.js', 'src/game/character-geo.js']) {
      const raw = fs.readFileSync(path.join(ROOT_DIR, 'inkwave-public', rel), 'utf8');
      const s3 = adaptSource(rel, raw);
      const beforeQuality = adaptReliability(rel, adaptTouchLayout(rel, s3));
      const built = adaptQualitySource(rel, beforeQuality);
      if (built === beforeQuality) fail(rel + ': the issue-483 transform did not apply');
      new vm.SourceTextModule(built, { identifier: rel });   // the full order must compile
      if (rel === 'src/game/character.js') {
        if (!built.includes('patches/splatoon3/runtime/hair-cache.mjs')) fail('helper import lost');
        if (!built.includes('buildOwnedHairStyle: buildOwnedHairStyle483')) fail('owned builder not passed to the helper');
        if (!s3.includes('sp[S_SQ + 1] -= 3.6 * a; ')) fail('landing anchor missing before quality');
        if (built.includes('sp[S_SQ + 1] -= 3.6 * a; ')) fail('the parent quality adapter must run after these');
      } else {
        if (s3 !== raw) fail('adaptSource must be a no-op for character-geo.js (it has no branch)');
        if (!built.includes('export function buildOwnedHairStyle(')) fail('owned builder lost');
        if (!built.includes("export function getHairStyle(st, lod = 'hero') {")) fail('legacy getHairStyle contract lost');
        if (!built.includes('_hair.has(ks)')) fail('legacy caching getter body lost');
        if (built.includes('_hair.clear()')) fail('no global cache flush may be introduced');
      }
      if (built.includes('hatKindCount: 4') || built.includes('browKindCount: 4')) fail('hardcoded catalog count');
    }
    console.log('PRODUCTION483 OK');
  `;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script],
      (err, stdout, stderr) => {
        if (err) reject(new Error(String(stdout) + String(stderr)));
        else resolve(stdout);
      });
  });
}

test('issue-483 production order: S3 -> touch -> reliability -> quality (483) compiles', async () => {
  const out = await runProductionOrder();
  assert.match(out, /PRODUCTION483 OK/);
});
// Native acceptance / negative control: a real Character graph in a vm. character-geo.js gets
// test-only probes on its module-private _hair / _inv maps (fixture instrumentation only - the
// shipping transform never exports test hooks).
async function runNative(mode) {
  const { execFile } = await import('node:child_process');
  const script = `
    const fs = await import('node:fs');
    const path = await import('node:path');
    const vm = await import('node:vm');
    const { adaptSource } = await import(${JSON.stringify(path.join(ROOT, 'patches/splatoon3/adapter.mjs'))});
    const a483 = await import(${JSON.stringify(path.join(ROOT, 'patches/splatoon3/issue-483-adapter.mjs'))});
    const { adaptTouchLayout } = await import(${JSON.stringify(path.join(ROOT, 'patches/touch-layout/adapter.mjs'))});
    const { adaptReliability } = await import(${JSON.stringify(path.join(ROOT, 'patches/reliability/adapter.mjs'))});
    const { adaptQualitySource } = await import(${JSON.stringify(path.join(ROOT, 'patches/local-quality/adapter.mjs'))});
    const ROOT_DIR = ${JSON.stringify(ROOT)};
    const SRC = path.join(ROOT_DIR, 'inkwave-public');
    const MODE = process.env.I483_MODE || 'patched';
    const fail = (m) => { throw new Error('issue-483 native check: ' + m); };
    const context = vm.createContext({ console, performance });
    context.__i483 = {};   // TEST-ONLY probe surface for the module-private native caches
    const modules = new Map();
    const mapPatches = (file) => (file.startsWith(SRC + path.sep + 'patches' + path.sep)
      ? path.join(ROOT_DIR, path.relative(SRC, file)) : file);
    const probeNativeCaches = (rel, text) => {
      if (rel !== 'src/game/character-geo.js') return text;
      const probes = [
        ['const _hair = new Map();', 'const _hair = new Map(); (globalThis.__i483 = globalThis.__i483 || {}).hairSize = () => _hair.size;'],
        ['const _inv = new Map();', 'const _inv = new Map(); (globalThis.__i483 = globalThis.__i483 || {}).invSize = () => _inv.size;'],
      ];
      for (const p of probes) {
        if (!text.includes(p[0])) fail('native cache probe anchor missing: ' + p[0]);
        text = text.replace(p[0], p[1]);
      }
      return text;
    };
    const load = (requested) => {
      const file = mapPatches(requested);
      if (modules.has(file)) return modules.get(file);
      let text = fs.readFileSync(file, 'utf8');
      if (file.startsWith(SRC + path.sep)) {
        const rel = path.relative(SRC, file);
        text = adaptSource(rel, text);
        if (MODE === 'patched') text = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, text)));
        text = probeNativeCaches(rel, text);
      } else if (MODE === 'patched') text = adaptQualitySource(path.relative(ROOT_DIR, file), text);
      const m = new vm.SourceTextModule(text, { context, identifier: file });
      modules.set(file, m);
      return m;
    };
    const NL = String.fromCharCode(10);
    const entry = new vm.SourceTextModule([
      "export { Character } from './inkwave-public/src/game/character.js';",
      "export * as THREE from 'three';",
      "export { G } from './inkwave-public/src/core/ctx.js';",
      "export * as HC from './patches/splatoon3/runtime/hair-cache.mjs';",
      "export * as GEO from './inkwave-public/src/game/character-geo.js';",
      "export * as HAIR from './inkwave-public/src/game/character-hair.js';",
      "export { getHairStyle, getRestPositions, BONE_NAMES } from './inkwave-public/src/game/character-geo.js';",
    ].join(NL), { context, identifier: path.join(ROOT_DIR, 'entry-483.mjs') });
    await entry.link((spec, from) => load(
      spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
        : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice('three/addons/'.length))
          : path.resolve(path.dirname(from.identifier), spec)));
    await entry.evaluate();
    const { Character, G, HC, GEO, HAIR, getHairStyle, getRestPositions, BONE_NAMES } = entry.namespace;
    const hairSize = () => context.__i483.hairSize();
    const invSize = () => context.__i483.invSize();
    G.settings = { quality: 'high' };
    if (MODE === 'patched') {
      if (typeof GEO.buildOwnedHairStyle !== 'function') fail('character-geo transform must expose buildOwnedHairStyle');
      const CATALOG = { hairStyleCount: GEO.HAIR_STYLE_NAMES.length, hatKindCount: GEO.HAT_KINDS.length, browKindCount: GEO.BROW_KINDS.length };
      const styles = [];
      for (let i = 1; i <= 6; i += 1) styles.push({ hair: i, skin: 0, outfit: 0, eyes: 0, hat: i % 4, brows: (i * 2) % 4 });
      styles.push({ hair: 0, skin: 1, outfit: 0, eyes: 1, hat: 2, brows: 1 });
      styles.push({ hair: 0, skin: 1, outfit: 0, eyes: 1, hat: 2, brows: 1 });
      const cast = styles.map((s, i) => new Character({ name: 'bot' + i, weapon: 'shooter', style: s }));
      if (hairSize() !== 0) fail('native _hair must not retain owned builds, saw ' + hairSize());
      if (invSize() !== 0) fail('native _inv must stay empty for owned builds, saw ' + invSize());
      const geo0 = cast[0].hairAnatomy483.entry.geo;
      for (let i = 0; i < cast.length; i += 1) {
        const ch = cast[i];
        if (!ch.hairAnatomy483) fail('rig must carry the anatomy handle (char ' + i + ')');
        if (!ch.hairMeta || !ch.hairMeta.length) fail('rig meta missing');
        if (!ch.rest || !ch.rest.head) fail('rig rest missing');
        if (!ch.hairKeys483 || !ch.hairKeys483.length) fail('tier acquire must record keys');
        for (const r of ch.hairKeys483) if (r.lod !== 'game') fail('construction must install only the game tier, saw ' + r.lod);
        if (ch.hairMeta !== ch.hairAnatomy483.entry.meta) fail('rig meta must come from the owned anatomy entry');
        if (ch.hairAnatomy483.entry.lod !== 'game') fail('anatomy must be a game-tier entry, saw ' + ch.hairAnatomy483.entry.lod);
        const wantKey = HC.hairCacheKey(ch.style, 'game', HAIR.hairQuality(), { hair: CATALOG.hairStyleCount, hats: CATALOG.hatKindCount, brows: CATALOG.browKindCount });
        if (ch.hairKeys483[0].key !== wantKey) fail('helper keys must use the real catalogs: ' + ch.hairKeys483[0].key + ' != ' + wantKey);
      }
      let st = HC.hairStats();
      if (st.builds !== 7) fail('exactly one build per unique appearance, saw ' + st.builds);
      if (st.entries !== 7) fail('expected 7 live entries, saw ' + st.entries);
      if (st.tiers.hero !== 0) fail('helper must never acquire the hero tier, saw ' + st.tiers.hero);
      if (st.liveUsers !== 16) fail('anatomy + tier ref per character, saw ' + st.liveUsers);
      if (hairSize() !== 0) fail('native _hair must stay empty while the cast is alive, saw ' + hairSize());

      const geos = new Set();
      for (const ch of cast) geos.add(ch.hairAnatomy483.entry.geo);
      if (geos.size !== 7) fail('expected 7 distinct geometries, saw ' + geos.size);
      // real BufferGeometry dispose events: one counter per geometry + one global total
      const disposeCount = new WeakMap();
      let disposeEvents = 0;
      const track = (g) => {
        if (disposeCount.has(g)) return g;
        disposeCount.set(g, 0);
        g.addEventListener('dispose', () => { disposeCount.set(g, disposeCount.get(g) + 1); disposeEvents += 1; });
        return g;
      };
      const disposedOf = (g) => disposeCount.get(g) || 0;
      for (const g of geos) track(g);

      // match teardown of six unique looks; the twin pair still uses its shared mesh
      for (let i = 0; i < 6; i += 1) cast[i].dispose();
      st = HC.hairStats();
      if (st.entries !== 1) fail('live twin must keep the shared entry, entries ' + st.entries);
      if (st.disposes !== 6) fail('six unique geometries disposed, saw ' + st.disposes);
      if (disposeEvents !== 6) fail('native dispose events must be 6, saw ' + disposeEvents);
      if (hairSize() !== 0) fail('native _hair must stay empty during teardown, saw ' + hairSize());
      cast[6].dispose();
      cast[7].dispose();
      st = HC.hairStats();
      if (st.entries !== 0 || st.liveUsers !== 0) fail('teardown must return to zero, ' + JSON.stringify(st));
      if (st.disposes !== 7) fail('seven geometries disposed total, saw ' + st.disposes);
      if (disposeEvents !== 7) fail('shared geometry disposed exactly once at zero users, saw ' + disposeEvents);
      if (hairSize() !== 0) fail('native _hair must be empty at baseline, saw ' + hairSize());
      if (invSize() !== 0) fail('native _inv must be empty at baseline, saw ' + invSize());

      // re-see the released look: FRESH geometry, never a re-entered disposed cache entry
      const again = new Character({ name: 'again', weapon: 'shooter', style: styles[0] });
      const rematchGeo = track(again.hairAnatomy483.entry.geo);
      if (rematchGeo === geo0) fail('rematch must build fresh geometry, not re-enter a disposed entry');
      if (disposedOf(geo0) !== 1) fail('the released geometry must stay disposed exactly once, saw ' + disposedOf(geo0));
      if (disposedOf(rematchGeo) !== 0) fail('fresh rematch geometry must be live');
      if (hairSize() !== 0) fail('rematch must not touch the native cache, saw ' + hairSize());
      again.dispose();
      st = HC.hairStats();
      if (st.entries !== 0 || st.liveUsers !== 0) fail('rematch teardown must return to zero, ' + JSON.stringify(st));
      if (disposedOf(rematchGeo) !== 1) fail('fresh rematch geometry must be disposed exactly once, saw ' + disposedOf(rematchGeo));
      if (disposedOf(geo0) !== 1) fail('old geometry must not be disposed a second time, saw ' + disposedOf(geo0));
      if (hairSize() !== 0) fail('native cache must stay empty after the rematch, saw ' + hairSize());
      // quality rebound + far detail keys (LOW -> HIGH -> LOW, no parallel retention)
      G.settings.quality = 'low';
      const qch = new Character({ name: 'qbot', weapon: 'shooter', style: { hair: 7, skin: 0, outfit: 0, eyes: 0, hat: 0, brows: 3 } });
      qch._updateLod(1 / 60);
      qch.setLod('far');
      const farKeys = qch.hairKeys483.filter((r) => r.key.includes('.far.')).map((r) => r.key);
      if (!farKeys.length) fail('far tier must be acquired through the helper');
      for (const k of farKeys) if (!k.endsWith('.fixed')) fail('far keys must be quality-deduped, saw ' + k);
      if (hairSize() !== 0) fail('the far tier must not enter the native cache, saw ' + hairSize());
      G.settings.quality = 'high';
      qch._updateLod(1 / 60);
      for (const r of qch.hairKeys483) if (r.key.endsWith('.low')) fail('LOW->HIGH must release old-quality keys');
      if (hairSize() !== 0) fail('quality rebound must not touch the native cache, saw ' + hairSize());
      G.settings.quality = 'low';
      qch._updateLod(1 / 60);
      for (const r of qch.hairKeys483) if (r.key.endsWith('.high')) fail('HIGH->LOW must release old-quality keys');
      if (hairSize() !== 0 || invSize() !== 0) fail('native caches must stay empty through quality rebinds');
      const qGeos = new Set();
      for (const r of qch.hairKeys483) qGeos.add(r.entry.geo);
      if (qch.hairAnatomy483) qGeos.add(qch.hairAnatomy483.entry.geo);
      for (const g of qGeos) track(g);
      qch.dispose();   // LAST release of the quality path
      st = HC.hairStats();
      if (st.entries !== 0 || st.liveUsers !== 0) fail('quality cycling must return to zero, ' + JSON.stringify(st));
      for (const g of qGeos) if (disposedOf(g) !== 1) fail('last release must dispose each live geometry exactly once, saw ' + disposedOf(g));
      if (hairSize() !== 0 || invSize() !== 0) fail('native caches must be empty after the quality path, saw ' + hairSize() + '/' + invSize());

      // second round with fresh styles: bounded plateau, then baseline again
      const r2 = [];
      for (let i = 20; i < 26; i += 1) r2.push(new Character({ name: 'r2-' + i, weapon: 'shooter', style: { hair: i % 8, skin: 0, outfit: 0, eyes: 0, hat: i % 4, brows: (i + 1) % 4 } }));
      st = HC.hairStats();
      if (st.entries > 6) fail('rematch round must stay bounded, entries ' + st.entries);
      if (hairSize() !== 0) fail('native _hair must stay empty across rematch rounds, saw ' + hairSize());
      for (const ch of r2) ch.dispose();
      st = HC.hairStats();
      if (st.entries !== 0 || st.liveUsers !== 0) fail('second round must return to baseline, ' + JSON.stringify(st));
      if (hairSize() !== 0 || invSize() !== 0) fail('native caches must be empty after round two, saw ' + hairSize() + '/' + invSize());
      // varied looks x qualities x rematches through the REAL native owned builder:
      // the native _hair/_inv maps stay at zero, every ownership epoch builds fresh geometry,
      // and the owned set is bounded by live holds only (zero unreferenced entries).
      const NATIVE = {
        buildOwnedHairStyle: GEO.buildOwnedHairStyle,
        hairQuality: HAIR.hairQuality,
        hairStyleCount: CATALOG.hairStyleCount,
        hatKindCount: CATALOG.hatKindCount,
        browKindCount: CATALOG.browKindCount,
      };
      const COUNTS = { hair: CATALOG.hairStyleCount, hats: CATALOG.hatKindCount, brows: CATALOG.browKindCount };
      const combos = [['game', 'low'], ['game', 'high'], ['far', 'low'], ['far', 'ultra']];
      const freshGeo = new Set();
      const buildsBefore = HC.hairStats().builds;
      let peakOwned = 0;
      for (let round = 0; round < 2; round += 1) {
        const held = [];
        const byKey = new Map();
        for (let i = 0; i < 4; i += 1) {
          const style = { hair: (i + round) % COUNTS.hair, hat: i % COUNTS.hats, brows: (i * 2 + round) % COUNTS.brows };
          for (const c of combos) {
            const item = { style, lod: c[0], q: c[1], entry: HC.acquireHair(NATIVE, style, c[0], c[1]) };
            item.key = HC.hairCacheKey(style, c[0], c[1], COUNTS);
            held.push(item);
            if (byKey.has(item.key)) { if (byKey.get(item.key) !== item.entry) fail('one key must map to one live entry'); }
            else byKey.set(item.key, item.entry);
          }
        }
        peakOwned = Math.max(peakOwned, HC.hairStats().entries);
        for (const e of byKey.values()) {
          if (freshGeo.has(e.geo)) fail('every ownership epoch must build fresh geometry');
          freshGeo.add(e.geo);
          track(e.geo);
        }
        if (hairSize() !== 0 || invSize() !== 0) fail('owned builds must never enter the native caches, saw ' + hairSize() + '/' + invSize());
        let disposedKeys = 0;
        for (const h of held) if (HC.releaseHair(h.style, h.lod, h.q, COUNTS)) disposedKeys += 1;
        if (disposedKeys !== byKey.size) fail('every held key must dispose exactly once, saw ' + disposedKeys + '/' + byKey.size);
        st = HC.hairStats();
        if (st.entries !== 0 || st.liveUsers !== 0) fail('varied round must return to baseline, ' + JSON.stringify(st));
        if (hairSize() !== 0) fail('native cache must stay empty through varied looks, saw ' + hairSize());
      }
      if (peakOwned > 12) fail('owned set must be bounded by live holds, peak ' + peakOwned);
      if (HC.hairStats().builds - buildsBefore !== 24) fail('24 fresh builds expected (12 per round), saw ' + (HC.hairStats().builds - buildsBefore));
      for (const g of freshGeo) if (disposedOf(g) !== 1) fail('every released geometry must be disposed exactly once, saw ' + disposedOf(g));

      // CPU strong-reference drop (the reported root): after the last release the disposed
      // geometry must be unreachable - no native cache, no helper slot, no Character hold.
      if (typeof globalThis.gc !== 'function') fail('run with --expose-gc');
      const gcProbe = async () => {
        const style = {
          hair: CATALOG.hairStyleCount - 1,
          hat: CATALOG.hatKindCount - 1,
          brows: CATALOG.browKindCount - 1,
        };
        let ch = new Character({ name: 'gcprobe', weapon: 'shooter', style });
        const w = new WeakRef(ch.hairAnatomy483.entry.geo);
        const disposesBefore = HC.hairStats().disposes;
        ch.dispose();
        ch = null;
        const s = HC.hairStats();
        if (s.entries !== 0 || s.liveUsers !== 0) fail('gc probe must return to zero, ' + JSON.stringify(s));
        if (s.disposes !== disposesBefore + 1) fail('gc probe geometry must be disposed exactly once, saw ' + (s.disposes - disposesBefore));
        if (hairSize() !== 0 || invSize() !== 0) fail('gc probe: native caches must be empty, saw ' + hairSize() + '/' + invSize());
        await new Promise((r) => setImmediate(r));
        globalThis.gc();
        await new Promise((r) => setImmediate(r));
        globalThis.gc();
        if (w.deref() !== undefined) fail('released hair geometry is still strongly referenced (CPU retention)');
      };
      await gcProbe();
      const ownedBaseline = HC.hairStats();
      if (ownedBaseline.entries !== 0 || ownedBaseline.liveUsers !== 0) fail('baseline before the legacy probe must be zero');
      if (hairSize() !== 0 || invSize() !== 0) fail('owned path must leave both native caches empty, saw ' + hairSize() + '/' + invSize());
      // native bone/rest parity with the untouched getRestPositions contract: the patched rig
      // restores from the game-tier entry, the legacy contract from the hero entry, and bone rest
      // positions are lod-independent (character-hair.js), so both must be identical.
      const beforeLegacy = hairSize();
      const nativeRest = getRestPositions(styles[0]);
      for (const n of BONE_NAMES) {
        const a = cast[0].rest[n], b = nativeRest[n];
        if (!a || !b) fail('rest bone missing: ' + n);
        if (Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.y - b.y) > 1e-9 || Math.abs(a.z - b.z) > 1e-9) {
          fail('native bone/rest parity broken for ' + n + ': ' + a.x + ',' + a.y + ',' + a.z + ' vs ' + b.x + ',' + b.y + ',' + b.z);
        }
      }
      // legacy public contract for non-owned callers is preserved (and is the ONLY _hair traffic)
      const legacyA = getHairStyle(styles[0], 'game');
      const legacyB = getHairStyle(styles[0], 'game');
      if (legacyA !== legacyB) fail('legacy getHairStyle must keep caching for non-owned callers');
      if (cast[0].hairMeta === legacyA.meta) fail('owned rig meta must not come from the native cache');
      if (hairSize() !== beforeLegacy + 2) fail('only the explicit legacy probes may populate _hair, saw ' + hairSize() + ' from ' + beforeLegacy);
      if (invSize() !== 0) fail('the legacy probes must not grow _inv, saw ' + invSize());
      const final = HC.hairStats();
      console.log('NATIVE483 OK builds=' + final.builds + ' disposes=' + final.disposes + ' heroTier=' + final.tiers.hero
        + ' ownedNativeHairCache=' + beforeLegacy + ' nativeInvCache=' + invSize()
        + ' peakOwned=' + peakOwned + ' legacyProbes=' + (hairSize() - beforeLegacy) + ' gc=ok');
    } else {
      const ch = new Character({ name: 'raw', weapon: 'shooter', style: { hair: 3, skin: 0, outfit: 0, eyes: 0, hat: 1, brows: 2 } });
      if (!ch.rest || !ch.rest.head) fail('raw rig rest missing');
      if (ch.hairAnatomy483) fail('raw build must not carry the helper handle');
      const hairAfterBuild = hairSize();
      const invAfterBuild = invSize();
      if (hairAfterBuild < 2) fail('raw build must populate the native hair cache by itself, saw ' + hairAfterBuild);
      if (invAfterBuild < 1) fail('raw build must populate the native inverse cache by itself, saw ' + invAfterBuild);
      const heroEntry = getHairStyle(ch.style);
      if (ch.hairMeta !== heroEntry.meta) fail('raw rig must read meta from the hero entry (defect not reproduced)');
      const gameEntry = getHairStyle(ch.style, 'game');
      if (ch.hairMeta === gameEntry.meta) fail('raw rig must not read the game entry');
      console.log('RAW483 OK nativeHairCache=' + hairAfterBuild + ' nativeInvCache=' + invAfterBuild);
    }
  `;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--experimental-vm-modules', '--expose-gc', '--input-type=module', '-e', script],
      { env: { ...process.env, I483_MODE: mode } },
      (err, stdout, stderr) => {
        if (err) reject(new Error(String(stdout) + String(stderr)));
        else resolve(stdout);
      });
  });
}

test('issue-483 native acceptance: owned builds never enter the native caches, teardown to baseline', async () => {
  const out = await runNative('patched');
  console.log(out.trim());
  assert.match(out, /NATIVE483 OK/);
  assert.match(out, /ownedNativeHairCache=0/);
  assert.match(out, /nativeInvCache=0/);
  assert.match(out, /gc=ok/);
});

test('issue-483 native negative control: raw build reads rig meta from a hero mesh and grows the caches', async () => {
  const out = await runNative('raw');
  console.log(out.trim());
  assert.match(out, /RAW483 OK/);
  assert.match(out, /nativeHairCache=[1-9]/);
  assert.match(out, /nativeInvCache=[1-9]/);
});