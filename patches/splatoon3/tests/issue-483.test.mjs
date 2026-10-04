// Issue #483 — bounded hair-geometry cache lifecycle.
// Unit level: exact ref-count pairing, far-tier quality dedup, rematch plateau.
// Native level: a real `Character` graph (production modules through `adaptSource` plus
// `adaptIssue483Character`) constructed in a vm — asserts real THREE.BufferGeometry
// dispose() events, shared-mesh survival for live Characters, quality rebuild release
// and a zero post-match baseline. Negative control: the same native graph without the
// adapter proves the raw main build reads rig meta from a hero mesh (the defect).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import {
  adaptIssue483Character,
  ISSUE_483_REL,
  ISSUE_483_RIG_ANCHOR,
  ISSUE_483_RIG_TAIL_ANCHOR,
  ISSUE_483_TIER_ANCHOR,
  ISSUE_483_QUALITY_ANCHOR,
  ISSUE_483_DISPOSE_ANCHOR,
} from '../issue-483-adapter.mjs';
import {
  acquireHair,
  releaseHair,
  getAnatomy,
  releaseAnatomy,
  hairCacheKey,
  hairStats,
  resetHairForTests,
} from '../runtime/hair-cache.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const NATIVE_CHAR = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/character.js'), 'utf8');

function counts() { return { hair: 8, hats: 4, brows: 4 }; }

function makeNative(log) {
  const entries = new Map();
  return {
    entries,
    log,
    getHairStyle(style, lod = 'game') {
      const tier = lod === 'hero' || lod === 'far' ? lod : 'game';
      const key = hairCacheKey(style, tier, 'high', counts());
      let entry = entries.get(key);
      if (!entry) {
        const geo = { isBufferGeometry: true, disposed: 0, dispose() { this.disposed += 1; } };
        entry = { geo, meta: [{ tier, style: { ...style } }], rest: { head: { x: 1, clone() { return { x: 1 }; } } } };
        entries.set(key, entry);
        log.builds += 1;
      } else log.reuses += 1;
      if (tier === 'hero') log.heroBuilds += 1;
      return entry;
    },
    hairQuality: () => 'high',
  };
}

test('issue-483 transform rewrites exactly the character anchors', () => {
  assert.equal(NATIVE_CHAR.split(ISSUE_483_RIG_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_CHAR.split(ISSUE_483_RIG_TAIL_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_CHAR.split(ISSUE_483_TIER_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_CHAR.split(ISSUE_483_QUALITY_ANCHOR).length - 1, 1);
  assert.equal(NATIVE_CHAR.split(ISSUE_483_DISPOSE_ANCHOR).length - 1, 1);
  const adapted = adaptIssue483Character(ISSUE_483_REL, adaptSource(ISSUE_483_REL, NATIVE_CHAR));
  assert.ok(adapted.includes('patches/splatoon3/runtime/hair-cache.mjs'));
  assert.ok(adapted.includes('getHairAnatomy483'));
  assert.ok(adapted.includes('acquireHair483'));
  assert.ok(adapted.includes('releaseHairKey483'));
  assert.ok(adapted.includes('hairKeyFor483'));
  assert.ok(adapted.includes('HAIR_NATIVE_483'));
  // native hero/meta paths are gone from the patched character
  assert.ok(!adapted.includes('const hair = getHairStyle(this.style);'));
  assert.ok(!adapted.includes('getRestPositions(this.style)'));
  assert.ok(!adapted.includes('getBoneInverses(this.style)'));
  assert.ok(!adapted.includes('H = getHairStyle(this.style, tn)'));
  assert.equal(adaptIssue483Character('src/game/actor.js', 'x'), 'x');
  assert.throws(() => adaptIssue483Character(ISSUE_483_REL, 'no anchor'), /patch conflict/);
});

test('issue-483 helper: shared style reuses one mesh; last release disposes exactly once', () => {
  resetHairForTests();
  const log = { builds: 0, reuses: 0, heroBuilds: 0 };
  const native = makeNative(log);
  const style = { hair: 1, hat: 0, brows: 2 };
  const first = acquireHair(native, style, 'game', 'high');
  const second = acquireHair(native, style, 'game', 'high');
  assert.equal(first, second);
  assert.equal(log.builds, 1);
  assert.equal(hairStats().liveUsers, 2);
  assert.equal(releaseHair(style, 'game', 'high', counts()), false);
  assert.equal(first.geo.disposed, 0, 'shared mesh must survive while one Character still uses it');
  assert.equal(releaseHair(style, 'game', 'high', counts()), true);
  assert.equal(first.geo.disposed, 1, 'owned mesh disposed exactly once at zero users');
  assert.equal(hairStats().entries, 0);
  assert.equal(releaseHair(style, 'game', 'high', counts()), false);
});

test('issue-483 helper: anatomy never builds hero; far ignores quality in the key', () => {
  resetHairForTests();
  const log = { builds: 0, reuses: 0, heroBuilds: 0 };
  const native = makeNative(log);
  const style = { hair: 3, hat: 1, brows: 1 };
  const anatomy = getAnatomy(native, style);
  assert.equal(log.heroBuilds, 0, 'rig metadata must not materialise a hero mesh');
  assert.ok(anatomy.meta[0].tier === 'game');
  releaseAnatomy(anatomy);
  assert.equal(hairStats().entries, 0);
  assert.equal(
    hairCacheKey(style, 'far', 'low', counts()),
    hairCacheKey(style, 'far', 'ultra', counts()),
    'fixed far ladder must not multiply retained quality variants',
  );
  assert.notEqual(
    hairCacheKey(style, 'game', 'low', counts()),
    hairCacheKey(style, 'game', 'high', counts()),
  );
});

test('issue-483 defect mirror: unpatched native cache grows monotonically per look', () => {
  const log = { builds: 0, reuses: 0, heroBuilds: 0 };
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
});

test('issue-483 acceptance: rematch cycle stays bounded and returns to baseline', () => {
  resetHairForTests();
  const log = { builds: 0, reuses: 0, heroBuilds: 0 };
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
  for (const entry of native.entries.values()) assert.ok(entry.geo.disposed <= 1);
});

async function runNative(mode) {
  const { execFile } = await import('node:child_process');
  const script = `
    const fs = await import('node:fs');
    const path = await import('node:path');
    const vm = await import('node:vm');
    const { adaptSource } = await import(${JSON.stringify(path.join(ROOT, 'patches/splatoon3/adapter.mjs'))});
    const a483 = await import(${JSON.stringify(path.join(ROOT, 'patches/splatoon3/issue-483-adapter.mjs'))});
    const ROOT_DIR = ${JSON.stringify(ROOT)};
    const SRC = path.join(ROOT_DIR, 'inkwave-public');
    const MODE = process.env.I483_MODE || 'patched';
    const fail = (m) => { throw new Error('issue-483 native check: ' + m); };
    const context = vm.createContext({ console, performance });
    const modules = new Map();
    const mapPatches = (file) => (file.startsWith(SRC + path.sep + 'patches' + path.sep)
      ? path.join(ROOT_DIR, path.relative(SRC, file)) : file);
    const load = (requested) => {
      const file = mapPatches(requested);
      if (modules.has(file)) return modules.get(file);
      let text = fs.readFileSync(file, 'utf8');
      if (file.startsWith(SRC + path.sep)) {
        const rel = path.relative(SRC, file);
        text = adaptSource(rel, text);
        if (MODE === 'patched' && rel === 'src/game/character.js') text = a483.adaptIssue483Character(rel, text);
      }
      const m = new vm.SourceTextModule(text, { context, identifier: file });
      modules.set(file, m);
      return m;
    };
    const entry = new vm.SourceTextModule([
      "export { Character } from './inkwave-public/src/game/character.js';",
      "export * as THREE from 'three';",
      "export { G } from './inkwave-public/src/core/ctx.js';",
      "export * as HC from './patches/splatoon3/runtime/hair-cache.mjs';",
      "export { getHairStyle } from './inkwave-public/src/game/character-geo.js';",
    ].join('\\n'), { context, identifier: path.join(ROOT_DIR, 'entry-483.mjs') });
    await entry.link((spec, from) => load(
      spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
        : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice('three/addons/'.length))
          : path.resolve(path.dirname(from.identifier), spec)));
    await entry.evaluate();
    const { Character, G, HC, getHairStyle } = entry.namespace;
    G.settings = { quality: 'high' };

    if (MODE === 'patched') {
      const styles = [];
      for (let i = 1; i <= 6; i += 1) styles.push({ hair: i, skin: 0, outfit: 0, eyes: 0, hat: i % 4, brows: (i * 2) % 4 });
      styles.push({ hair: 0, skin: 1, outfit: 0, eyes: 1, hat: 2, brows: 1 });
      styles.push({ hair: 0, skin: 1, outfit: 0, eyes: 1, hat: 2, brows: 1 });
      const cast = styles.map((s, i) => new Character({ name: 'bot' + i, weapon: 'shooter', style: s }));

      for (let i = 0; i < cast.length; i += 1) {
        const ch = cast[i];
        if (!ch.hairAnatomy483) fail('rig must carry the anatomy handle (char ' + i + ')');
        if (!ch.hairMeta || !ch.hairMeta.length) fail('rig meta missing');
        if (!ch.rest || !ch.rest.head) fail('rig rest missing');
        if (!ch.hairKeys483 || !ch.hairKeys483.length) fail('tier acquire must record keys');
        for (const r of ch.hairKeys483) if (r.lod !== 'game') fail('construction must install only the game tier, saw ' + r.lod);
        if (ch.hairMeta !== getHairStyle(ch.style, 'game').meta) fail('anatomy must read the shared game entry');
        if (ch.hairMeta === getHairStyle(ch.style).meta) fail('rig must not read a hero entry');
      }
      let st = HC.hairStats();
      if (st.builds !== 7) fail('exactly one build per unique appearance, saw ' + st.builds);
      if (st.entries !== 7) fail('expected 7 live entries, saw ' + st.entries);
      if (st.tiers.hero !== 0) fail('helper must never acquire the hero tier, saw ' + st.tiers.hero);
      if (st.liveUsers !== 16) fail('anatomy + tier ref per character, saw ' + st.liveUsers);

      const geos = new Set();
      for (const ch of cast) geos.add(ch.hairAnatomy483.entry.geo);
      if (geos.size !== 7) fail('expected 7 distinct geometries, saw ' + geos.size);
      let disposeEvents = 0;
      for (const g of geos) g.addEventListener('dispose', () => { disposeEvents += 1; });

      // match teardown of six unique looks; the twin pair still uses its shared mesh
      for (let i = 0; i < 6; i += 1) cast[i].dispose();
      st = HC.hairStats();
      if (st.entries !== 1) fail('live twin must keep the shared entry, entries ' + st.entries);
      if (st.disposes !== 6) fail('six unique geometries disposed, saw ' + st.disposes);
      if (disposeEvents !== 6) fail('native dispose events must be 6, saw ' + disposeEvents);
      cast[6].dispose();
      cast[7].dispose();
      st = HC.hairStats();
      if (st.entries !== 0 || st.liveUsers !== 0) fail('teardown must return to zero, ' + JSON.stringify(st));
      if (st.disposes !== 7) fail('seven geometries disposed total, saw ' + st.disposes);
      if (disposeEvents !== 7) fail('shared geometry disposed exactly once at zero users, saw ' + disposeEvents);

      // quality rebuild + far LOD key dedup (LOW -> HIGH -> LOW, no parallel retention)
      G.settings.quality = 'low';
      const qch = new Character({ name: 'qbot', weapon: 'shooter', style: { hair: 7, skin: 0, outfit: 0, eyes: 0, hat: 0, brows: 3 } });
      qch._updateLod(1 / 60);
      qch.setLod('far');
      const farKeys = qch.hairKeys483.filter((r) => r.key.includes('.far.')).map((r) => r.key);
      if (!farKeys.length) fail('far tier must be acquired through the helper');
      for (const k of farKeys) if (!k.endsWith('.fixed')) fail('far keys must be quality-deduped, saw ' + k);
      G.settings.quality = 'high';
      qch._updateLod(1 / 60);
      for (const r of qch.hairKeys483) if (r.key.endsWith('.low')) fail('LOW->HIGH must release old-quality keys');
      G.settings.quality = 'low';
      qch._updateLod(1 / 60);
      for (const r of qch.hairKeys483) if (r.key.endsWith('.high')) fail('HIGH->LOW must release old-quality keys');
      qch.dispose();
      st = HC.hairStats();
      if (st.entries !== 0 || st.liveUsers !== 0) fail('quality cycling must return to zero, ' + JSON.stringify(st));

      // second round with fresh styles: bounded plateau, then baseline again
      const r2 = [];
      for (let i = 20; i < 26; i += 1) r2.push(new Character({ name: 'r2-' + i, weapon: 'shooter', style: { hair: i % 8, skin: 0, outfit: 0, eyes: 0, hat: i % 4, brows: (i + 1) % 4 } }));
      st = HC.hairStats();
      if (st.entries > 6) fail('rematch round must stay bounded, entries ' + st.entries);
      for (const ch of r2) ch.dispose();
      st = HC.hairStats();
      if (st.entries !== 0 || st.liveUsers !== 0) fail('second round must return to baseline, ' + JSON.stringify(st));
      console.log('NATIVE483 OK builds=' + st.builds + ' disposes=' + st.disposes + ' heroTier=' + st.tiers.hero);
    } else {
      const ch = new Character({ name: 'raw', weapon: 'shooter', style: { hair: 3, skin: 0, outfit: 0, eyes: 0, hat: 1, brows: 2 } });
      if (!ch.rest || !ch.rest.head) fail('raw rig rest missing');
      if (ch.hairAnatomy483) fail('raw build must not carry the helper handle');
      const heroEntry = getHairStyle(ch.style);
      if (ch.hairMeta !== heroEntry.meta) fail('raw rig must read meta from the hero entry (defect not reproduced)');
      const gameEntry = getHairStyle(ch.style, 'game');
      if (ch.hairMeta === gameEntry.meta) fail('raw rig must not read the game entry');
      console.log('RAW483 OK');
    }
  `;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script],
      { env: { ...process.env, I483_MODE: mode } },
      (err, stdout, stderr) => {
        if (err) reject(new Error(String(stdout) + String(stderr)));
        else resolve(stdout);
      });
  });
}

test('issue-483 native acceptance: real Character cast disposes exactly once and returns to baseline', async () => {
  const out = await runNative('patched');
  assert.match(out, /NATIVE483 OK/);
});

test('issue-483 native negative control: raw main build reads rig meta from a hero mesh', async () => {
  const out = await runNative('raw');
  assert.match(out, /RAW483 OK/);
});
