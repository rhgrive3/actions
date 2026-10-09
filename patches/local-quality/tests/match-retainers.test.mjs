import {configDependency} from './config-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, replaceOnce, qualityIdentity } from '../adapter.mjs';
import { adaptMatchRetainers } from '../match-retainer-adapter.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

// Logic-only checks on the real composed sources (match.js, cameraRig.js, weapons.js, hud-boss.js) loaded through
// vm.SourceTextModule with stubbed dependencies. This is NOT a browser heap snapshot and not an S3 comparison.
const ROOT = new URL('../../../', import.meta.url);
const raw = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');
const upToReliability = rel => adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw(rel))));

async function realm({ baseline = false } = {}) {
  const G = { settings: {}, actors: [] };
  const bus = new Map();
  const emitted = [];
  const emit = (n, e) => { emitted.push([n, e]); for (const fn of bus.get(n) || []) fn(e); };
  const on = (n, fn) => { let v = bus.get(n); if (!v) bus.set(n, v = new Set()); v.add(fn); return () => v.delete(fn); };
  const context = vm.createContext({ console, performance, Math, Map, Set });
  const config = new vm.SourceTextModule(raw('src/config.js'), { context });
  await config.link(spec=>configDependency(spec,context)); await config.evaluate();
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const util = { G, on, emit, clamp, lerp: (a, b, t) => a + (b - a) * t, damp: (a, b) => b, dampAngle: (a, b) => b,
    smoothstep: (a, b, x) => x, ...config.namespace, ...THREE };
  async function load(rel) {
    const code = baseline ? upToReliability(rel) : adaptQualitySource(rel, upToReliability(rel));
    const imports = new Map();
    for (const n of parse(code, { ecmaVersion: 'latest', sourceType: 'module' }).body) if (n.type === 'ImportDeclaration') {
      let names = imports.get(n.source.value); if (!names) imports.set(n.source.value, names = new Set());
      for (const s of n.specifiers) if (s.type === 'ImportNamespaceSpecifier') Object.keys(THREE).forEach(k => names.add(k)); else names.add(s.imported?.name || 'default');
    }
    const mod = new vm.SourceTextModule(code, { context });
    await mod.link(spec => new vm.SyntheticModule([...imports.get(spec)], function () {
      for (const k of imports.get(spec)) this.setExport(k, k in util ? util[k] : function () {});
    }, { context }));
    await mod.evaluate();
    return mod.namespace;
  }
  const { Match } = await load('src/game/match.js'), { CameraRig } = await load('src/game/cameraRig.js');
  const { Projectiles } = await load('src/game/weapons.js'), { BossHud } = await load('src/ui/hud-boss.js');
  return { G, emitted, Match, CameraRig, Projectiles, BossHud };
}

const actor = (name, team = 0) => ({ name, team, alive: false, pos: new THREE.Vector3(),
  character: { root: { visible: false }, dispose() {} }, weaponRunner: { reset() {} } });
function matchOf(f, actors, boss = null) {
  return Object.assign(Object.create(f.Match.prototype), { actors, bossMode: boss ? { dispose() {} } : null, boss, events: [], unsubs: [] });
}
function rigOf(f) {
  const rig = Object.create(f.CameraRig.prototype);
  rig.mode = 'follow'; rig.target = null; rig._prevTarget = null; rig.spectate = null;
  return rig;
}
function hudBoss(f) {
  const stubEl = () => ({ classList: { toggle() {}, remove() {} }, querySelector: () => ({}), className: '', innerHTML: '' });
  const hb = Object.create(f.BossHud.prototype);
  Object.assign(hb, { on: false, boss: null, hud: { el: stubEl(), overLayer: stubEl() }, bar: stubEl(), emb: stubEl(), numLayer: stubEl(),
    over: stubEl(), call: stubEl(), notches: [], _fresh: () => ({}), _pips() {}, _writeBar() {} });
  return hb;
}
function projectiles(f) {
  const removed = [];
  const p = Object.create(f.Projectiles.prototype);
  Object.assign(p, { inkFlight:{clear(){}}, scene: { remove: m => removed.push(m) }, sights: new Map(), vols: Array.from({ length: 32 }, () => ({ hits: [] })), volI: 0,
    list: [], pool: [], bombs: [], clouds: [], beams: [], beamPool: [], blobs: { count: 5 }, ribbonGeo: { disposed: 0, dispose() { this.disposed++; } } });
  p._releaseBomb = p._releaseCloud = () => {};
  return Object.assign(p, { removed });
}
const sight = () => ({ material: { disposed: 0, dispose() { this.disposed++; } } });

test('#747 clear() empties every slosher dedupe list without reallocating the 32-slot ring', async () => {
  const f = await realm(), p = projectiles(f), victim = actor('victim'), boss = { boss: true };
  const ring = p.vols.slice(), lists = p.vols.map(v => v.hits);
  p.vols[3].hits.push(victim, boss); p.vols[31].hits.push(boss);
  p.clear();
  assert.equal(p.vols.length, 32);
  assert(p.vols.every((v, i) => v === ring[i] && v.hits === lists[i] && v.hits.length === 0), 'same objects, all emptied');
});
test('#747 negative control: unpatched composition keeps victims reachable after clear()', async () => {
  const f = await realm({ baseline: true }), p = projectiles(f), victim = actor('victim');
  p.vols[3].hits.push(victim); p.clear();
  assert.equal(p.vols[3].hits[0], victim);
});
test('#733 removeActor releases that charger sight once; others and later clear() are unaffected', async () => {
  const f = await realm(), p = projectiles(f), a = actor('charger'), b = actor('other-charger'), c = actor('plain');
  f.G.projectiles = p; f.G.scene = { remove() {} }; f.G.actors = [];
  const sa = sight(), sb = sight(); p.sights.set(a, sa); p.sights.set(b, sb);
  p.vols[0].hits.push(a, b);
  const m = matchOf(f, [a, b, c]); f.G.actors = m.actors;
  m.removeActor(a);
  assert.equal(p.sights.has(a), false); assert.deepEqual(p.removed, [sa]); assert.equal(sa.material.disposed, 1);
  assert.equal(p.sights.get(b), sb); assert.equal(sb.material.disposed, 0);
  assert.deepEqual(p.vols[0].hits, [b]);
  assert.equal(p.ribbonGeo.disposed, 0, 'shared ribbon geometry is never disposed');
  m.removeActor(c);   // non-charger: nothing to release
  assert.equal(p.sights.get(b), sb); assert.equal(p.removed.length, 1);
  p.releaseActor(a); p.releaseActor(c);   // idempotent
  assert.equal(sa.material.disposed, 1); assert.equal(p.removed.length, 1);
  p.clear();
  assert.equal(p.sights.size, 0); assert.equal(sb.material.disposed, 1); assert.equal(sa.material.disposed, 1);
});
test('#733 negative control: unpatched removeActor leaves the sight (and Actor) in the map', async () => {
  const f = await realm({ baseline: true }), p = projectiles(f), a = actor('charger');
  f.G.projectiles = p; f.G.scene = { remove() {} };
  p.sights.set(a, sight()); const m = matchOf(f, [a]); f.G.actors = m.actors; m.removeActor(a);
  assert.equal(p.sights.has(a), true);
});
test('#749 Boss match dispose retires the boss HUD; an older match cannot clear a newer boss', async () => {
  const f = await realm(), hb = hudBoss(f), b1 = { name: 'old', maxHp: 0 }, b2 = { name: 'new', maxHp: 0 };
  f.G.hud = { boss: hb }; f.G.scene = { remove() {} };
  hb.setMode(true, b1);
  matchOf(f, [], b1).dispose();
  assert.equal(hb.boss, null); assert.equal(hb.on, false);
  hb.setMode(true, b2);
  matchOf(f, [], b1).dispose();   // stale disposal of the older boss match
  assert.equal(hb.boss, b2); assert.equal(hb.on, true);
  matchOf(f, [], null).dispose(); // no boss spawned
  assert.equal(hb.boss, b2);
  f.G.hud = null; matchOf(f, [], b2).dispose();   // no HUD: safe
  f.G.hud = {}; matchOf(f, [], b2).dispose();      // HUD without boss layer: safe
  f.G.hud = { boss: hb }; matchOf(f, [], b2).dispose(); matchOf(f, [], b2).dispose();   // idempotent
  assert.equal(hb.boss, null);
});
test('#749 negative control: unpatched dispose leaves the disposed Boss in BossHud', async () => {
  const f = await realm({ baseline: true }), hb = hudBoss(f), b1 = { name: 'old', maxHp: 0 };
  f.G.hud = { boss: hb }; f.G.scene = { remove() {} }; hb.setMode(true, b1);
  matchOf(f, [], b1).dispose();
  assert.equal(hb.boss, b1);
});
test('#730 follow/orbit/cinematic/overview release spectate.actor but keep the blend vectors', async () => {
  const f = await realm(), local = actor('local'), killer = actor('killer'), v = () => new THREE.Vector3(1, 2, 3);
  for (const [name, run] of [['follow', r => r.follow(local)], ['orbit', r => r.orbit(v(), 1, 1)], ['overview', r => r.overview()],
    ['cinematic', r => r.cinematic(v(), v(), v(), v(), 1)]]) {
    const rig = rigOf(f), pos = v(), from = v();
    rig.spectate = { actor: killer, pos, from };
    run(rig);
    assert.equal(rig.spectate.actor, null, name); assert.equal(rig.spectate.pos, pos, name); assert.equal(rig.spectate.from, from, name);
  }
  assert.doesNotThrow(() => rigOf(f).follow(local), 'no spectate record yet');
});
test('#730 dispose releases spectate.actor only for the retiring roster', async () => {
  const f = await realm(), mine = actor('mine'), other = actor('other'), killer = actor('killer'), rig = f.G.rig = rigOf(f);
  f.G.scene = { remove() {} };
  const pos = new THREE.Vector3();
  rig.spectate = { actor: killer, pos, from: pos };
  matchOf(f, [mine, other]).dispose();
  assert.equal(rig.spectate.actor, killer, 'killer from another match is untouched by dispose');
  matchOf(f, [mine, killer]).dispose();
  assert.equal(rig.spectate.actor, null); assert.equal(rig.spectate.pos, pos);
  f.G.rig = null; matchOf(f, [mine]).dispose();
});
test('#629/#630 dispose nulls camera target, previous target and attract follow of its own roster only', async () => {
  const f = await realm(), old = actor('old'), next = actor('next'), rig = f.G.rig = rigOf(f);
  f.G.scene = { remove() {} }; f.G.game = { _attractFollow: old };
  rig.target = old; rig._prevTarget = old;
  matchOf(f, [old]).dispose();
  assert.equal(rig.target, null); assert.equal(rig._prevTarget, null); assert.equal(f.G.game._attractFollow, null);
  rig.target = next; rig._prevTarget = next; f.G.game._attractFollow = next;
  matchOf(f, [old]).dispose();   // stale disposal of an older match
  assert.equal(rig.target, next); assert.equal(rig._prevTarget, next); assert.equal(f.G.game._attractFollow, next);
  matchOf(f, [next]).dispose(); matchOf(f, [next]).dispose();   // idempotent
  assert.equal(rig.target, null); assert.equal(f.G.game._attractFollow, null);
  f.G.rig = null; f.G.game = null; matchOf(f, [next]).dispose();
});
test('#629/#630 negative control: unpatched dispose leaves the camera and attract director on the dead Actor', async () => {
  const f = await realm({ baseline: true }), old = actor('old'), rig = f.G.rig = rigOf(f);
  f.G.scene = { remove() {} }; f.G.game = { _attractFollow: old }; rig.target = old; rig._prevTarget = old;
  matchOf(f, [old]).dispose();
  assert.equal(rig.target, old); assert.equal(rig._prevTarget, old); assert.equal(f.G.game._attractFollow, old);
});
test('releases run before character teardown', async () => {
  const f = await realm(), a = actor('a'), rig = f.G.rig = rigOf(f); rig.target = a; f.G.scene = { remove() {} };
  let seen = 'unset'; a.character.dispose = () => { seen = rig.target; };
  matchOf(f, [a]).dispose();
  assert.equal(seen, null);
});
test('connections fail closed on missing/duplicate anchors and register in build identity', () => {
  for (const rel of ['src/game/match.js', 'src/game/weapons.js', 'src/game/cameraRig.js']) {
    assert.throws(() => adaptMatchRetainers(rel, '', replaceOnce));
    assert.throws(() => adaptMatchRetainers(rel, raw(rel) + raw(rel), replaceOnce));
  }
  assert.equal(adaptMatchRetainers('unrelated.txt', 'unchanged', replaceOnce), 'unchanged');
  assert(qualityIdentity()['match-retainer-adapter.mjs']);
});
test('verbatim anchors other adapters patch are preserved after the transform', () => {
  const m = adaptQualitySource('src/game/match.js', upToReliability('src/game/match.js'));
  const w = adaptQualitySource('src/game/weapons.js', upToReliability('src/game/weapons.js'));
  assert(m.includes('  dispose() {\n') && m.includes('    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;'));
  assert(w.includes('  clear() {\n    this.inkFlight.clear();\n    for (const p of this.list) this._recycle(p);') && w.split('  clear() {').length === 2, 'current native recycling retains one clear owner');
});
