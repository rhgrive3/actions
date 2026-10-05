// Normal-battle isolation: the range exists only behind startMatch({ mapId: 'range' }); nothing it adds reaches a
// Turf War, a Boss Battle, an online room or the stage pickers, and the upstream sources stay byte-for-byte intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rangeRealm, compose, ROOT, SRC } from './harness.mjs';
import { adaptRange, rangeIdentity, replaceOnce } from '../adapter.mjs';
import { checkCompatibility } from '../../splatoon3/adapter.mjs';

const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

test('the range is not a stage of any picker: MAPS / OFFLINE_MAPS never list it; only MAP_LAYOUTS knows its layout', async () => {
  const R = await rangeRealm();
  assert.ok(!R.MAPS.some((m) => m.id === 'range'));
  assert.ok(!R.OFFLINE_MAPS.some((m) => m.id === 'range'));
  assert.ok(R.MAP_LAYOUTS.range && R.MAP_LAYOUTS.range.id === 'range');
  for (const m of R.MAPS) { assert.equal(R.isRangeMap(m), false); assert.equal(R.rangeMapFor(m.id), null); }
  assert.equal(R.rangeMapFor('range'), R.RANGE_MAP);
  assert.equal(R.RANGE_MAP.noBots, true); assert.equal(R.RANGE_MAP.noBoss, true);
});

test('network and weapon tuning sources are byte-exact pass-through for the practice layer', () => {
  const untouched = [
    'src/net/mock.js', 'src/net/netmatch.js', 'src/net/session.js', 'src/net/transport.js',
    'src/game/weapons.js', 'src/game/actor.js', 'src/config.js',
  ];
  for (const rel of untouched) {
    const before = read(rel);
    assert.equal(adaptRange(rel, before), before, rel + ' must not be patched by Practice Range');
  }
  const id = rangeIdentity();
  assert.ok(!Object.keys(id).some((rel) => rel.startsWith('src/net/') || rel === 'src/game/weapons.js' || rel === 'src/config.js'));
});

test('main.js connections: every range branch is gated on the range map; other stages keep the old values', () => {
  const main = compose('src/main.js', read('src/main.js'));
  for (const s of ['rangeMapFor(opts.mapId)', '!isRangeMap(map)', 'noBots: mapNoBots(map.id) || isRangeMap(map), range: isRangeMap(map)',
    'noBots: mapNoBots(this.mapDef?.id) || isRangeMap(this.mapDef)', 'match.opts?.range) return;', 'installPracticeRange(Game);']) {
    assert.equal(main.split(s).length - 1, 1, s);
  }
  // the online path is untouched: a room can never resolve 'range'
  const net = main.slice(main.indexOf('async startNetMatch('), main.indexOf('async _warmCharacters('));
  assert.ok(!/range/i.test(net));
});

test('a normal match gets no range session, no targets, its intro and its timer', async () => {
  const R = await rangeRealm();
  const { Match } = R;
  const calls = [];
  // the installer is already applied in the realm (main.js would call it); a fake Game exercises the wrappers
  class FakeGame { async boot() {} _buildWorld() {} _updateHud() {} }
  if (!R.__installed) { R.installPracticeRange(FakeGame); R.__installed = true; }
  const m = Object.create(Match.prototype);
  Object.assign(m, { opts: { attract: false }, attract: false, actors: [], state: 'init', stateT: 0, paused: false, setState(s) { calls.push(s); this.state = s; } });
  m.start();
  assert.deepEqual(calls, ['intro']);
  assert.equal(R.isRangeMatch(m), false);
  const r = Object.create(Match.prototype);
  Object.assign(r, { opts: { range: true }, attract: false, actors: [], state: 'init', setState(s) { calls.push('range:' + s); this.state = s; } });
  r.start();
  assert.equal(calls.at(-1), 'range:playing', 'the range skips the intro');
  assert.equal(R.isRangeMatch({ attract: true, opts: { range: true } }), false, 'an attract backdrop on the range is not a range match');
});

test('texture slots: the range owns 31–33 only; Cargo keeps 28–30', async () => {
  const R = await rangeRealm();
  assert.equal(JSON.stringify(R.STAGE_SLOTS), JSON.stringify({ cargo: [28, 29, 30], range: [31, 32, 33] }));
  assert.equal(R.FIRST_STAGE_SLOT, 28); assert.equal(R.LAST_STAGE_SLOT, 33);
  const range = R.STAGE_SURFACES.filter((s) => s.stage === 'range').map((s) => [s.slot, s.name]);
  assert.equal(JSON.stringify(range), JSON.stringify([[31, 'range:court'], [32, 'range:panel'], [33, 'range:rubber']]));
  assert.ok(R.STAGES.range.register && R.STAGES.range.PLACEMENTS.every((p) => p.mirror === false));
  // the shader branches only fire for the range slots (no other stage uses pattern 31 / 32)
  const mat = compose('src/world/levelMaterial.js', read('src/world/levelMaterial.js'));
  assert.match(mat, /if \(pid == 31 && isTop\)/); assert.match(mat, /if \(pid == 32 && isWall\)/);
  for (const [id, L] of Object.entries(R.MAP_LAYOUTS)) if (id !== 'range') {
    for (const b of [...L.single, ...L.half]) assert.ok(b.pattern !== 31 && b.pattern !== 32 && b.pattern !== 33, `${id} uses no range slot`);
  }
});

test('adapter: exact single connections, re-application fails closed, upstream untouched', () => {
  const files = ['src/world/maps.js', 'src/world/stages/index.js', 'src/world/stages/surfaces.js', 'src/main.js', 'src/world/levelMaterial.js', 'src/ui/hud.js', 'index.html'];
  for (const rel of files) {
    const once = compose(rel, read(rel));
    assert.notEqual(once, read(rel), rel);
    if (rel !== 'src/ui/hud.js') assert.throws(() => adaptRange(rel, once), /practice range conflict/, rel);
  }
  assert.throws(() => replaceOnce('a a', 'a', 'b', 'x'), /conflict/);
  checkCompatibility(SRC);   // the hash-locked upstream files are byte-for-byte what the gameplay layer reviewed
  const id = rangeIdentity();
  for (const f of Object.keys(id)) assert.ok(!f.startsWith('tests/') && !f.endsWith('.md'), f);
  for (const f of ['adapter.mjs', 'install.mjs', 'range-map.mjs', 'stage/layout.mjs', 'stage/zones.mjs', 'runtime/session.mjs', 'styles/range.css', 'assets/lightmaps/range.json', 'assets/lightmaps/range.png', 'assets/stages/range-day.webp']) assert.ok(id[f], f);
  // the range's assets never shadow an upstream file
  for (const f of Object.keys(id).filter((k) => k.startsWith('assets/'))) assert.ok(!fs.existsSync(path.join(SRC, f)), f);
  void ROOT;
});

test('lightmap: the shipped bake matches the current layout hash (a stale bake would be rejected in game)', async () => {
  const R = await rangeRealm();
  const { rangeWorld } = await import('./harness.mjs');
  rangeWorld(R);
  const meta = JSON.parse(fs.readFileSync(new URL('../assets/lightmaps/range.json', import.meta.url), 'utf8'));
  R.G.level.layoutLightmap(meta.ppm, meta.size);
  assert.equal(R.G.level.layoutHash, meta.hash, 'run patches/practice-range/tools/bake-ao.mjs after a layout change');
});
