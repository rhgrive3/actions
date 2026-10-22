import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { turfExperience } from '../../splatoon3/runtime/results-scoring.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const built = process.env.INKWAVE_BUILT_SITE;
const { normalizeQueueProfile, settleProgression } = await import(pathToFileURL(path.join(
  built || root, 'patches/network-replication/queue-recovery.mjs')));
const rawMain = fs.readFileSync(path.join(built || path.join(root, 'inkwave-public'), 'src/main.js'), 'utf8');
const main = built ? rawMain : adaptBuildSource('src/main.js', rawMain);
const weapons = { shooter: { kind: 'shooter' } };
const defaults = { name: 'Player', weapon: 'shooter', level: 1, xp: 0, wins: 0, matches: 0, totalTurf: 0 };
const progression = { xpForLevel: level => 800 + 350 * level, xpWin: 1200, xpLose: 500, xpPerTurfPoint: 1, xpPerSplat: 40 };

function span(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'actual composed source: ' + start);
  return source.slice(first, last);
}

function bootProfile(saved) {
  const storage = new Map(saved === undefined ? [] : [['inkwave.profile', JSON.stringify(saved)]]);
  const load = span(main, 'function loadJSON(', 'const DEFAULT_PROFILE');
  const boot = "this.profile = normalizeQueueProfile(loadJSON('inkwave.profile', DEFAULT_PROFILE), WEAPONS);";
  assert.equal(main.split(boot).length - 1, 1, 'the native boot must call the tested owner exactly once');
  return vm.runInNewContext(`${load}\n(function () { ${boot} return this.profile; }).call({})`, {
    localStorage: { getItem: key => storage.get(key) ?? null },
    DEFAULT_PROFILE: defaults, WEAPONS: weapons, normalizeQueueProfile,
  });
}

function commitResult(profile, mode, won) {
  const method = mode === 'boss'
    ? span(main, '  async _bossResults() {', '  async _judge() {')
    : span(main, '  async _judge() {', '  _fade(');
  const start = mode === 'boss' ? '    const local = m.local, p = this.profile;' : '    const local = m.local;';
  // Execute the actual composed profile/XP/save block. Presentation and match
  // admission are outside this saved-value regression and are not simulated.
  const block = span(method, start, '    const data = {');
  const saved = [];
  const local = { stats: { turf: 500, splats: 0, bossDmg: 0 } };
  vm.runInNewContext(`(function () { ${block} }).call({profile})`, {
    profile, m: { local }, won, G: { netm: null }, WEAPONS: weapons,
    PROGRESSION: progression, normalizeQueueProfile, settleProgression, turfExperience,
    saveJSON(key, value) { assert.equal(key, 'inkwave.profile'); saved.push(JSON.parse(JSON.stringify(value))); },
  });
  assert.equal(saved.length, 1, 'one native result save');
  return saved[0];
}

test('boot repairs corrupt persisted counters before native Turf and Boss result arithmetic and reload', () => {
  for (const mode of ['turf', 'boss']) for (const won of [false, true]) {
    const profile = bootProfile({ wins: 'bad', matches: {}, totalTurf: '120' });
    assert.equal(profile.wins, 0);
    assert.equal(profile.matches, 0);
    assert.equal(profile.totalTurf, 0);
    const saved = commitResult(profile, mode, won);
    assert.equal(saved.wins, won ? 1 : 0);
    assert.equal(saved.matches, 1);
    assert.equal(saved.totalTurf, 500, 'earned turf must add numerically instead of appending to a string');
    const reloaded = bootProfile(saved);
    for (const key of ['wins', 'matches', 'totalTurf']) assert.equal(reloaded[key], saved[key]);
    const again = commitResult(reloaded, mode, won);
    assert.equal(again.wins, won ? 2 : 0);
    assert.equal(again.matches, 2);
    assert.equal(again.totalTurf, 1000);
  }
});

test('result admission also repairs counters changed after boot before saving', () => {
  for (const mode of ['turf', 'boss']) {
    const profile = bootProfile();
    Object.assign(profile, { wins: null, matches: 'bad', totalTurf: [] });
    const saved = commitResult(profile, mode, true);
    assert.equal(saved.wins, 1);
    assert.equal(saved.matches, 1);
    assert.equal(saved.totalTurf, 500);
  }
});

test('counter recovery preserves valid zero and large integers, profile extras and minimal progression records', () => {
  for (const value of [0, 1, 123456789, Number.MAX_SAFE_INTEGER]) {
    const profile = { ...defaults, wins: value, matches: value, totalTurf: value, style: { hair: 2 } };
    const expected = structuredClone(profile);
    assert.equal(normalizeQueueProfile(profile, weapons), profile);
    assert.deepEqual(profile, expected);
  }
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '5', null, {}, [], true]) {
    const profile = { ...defaults, wins: value, matches: value, totalTurf: value };
    normalizeQueueProfile(profile, weapons);
    for (const key of ['wins', 'matches', 'totalTurf']) assert.equal(profile[key], 0);
  }
  const minimal = { level: 1, xp: 1200 };
  settleProgression(minimal, progression);
  assert.deepEqual(minimal, { level: 2, xp: 50 }, 'XP-only callers do not gain unrelated profile fields');
  for (const saved of [undefined, {}, { level: 3, xp: 15 }]) {
    const profile = bootProfile(saved);
    for (const key of ['wins', 'matches', 'totalTurf']) assert.equal(profile[key], 0, 'native defaults supply absent counters');
  }
});
