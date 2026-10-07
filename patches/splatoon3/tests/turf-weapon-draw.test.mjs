// #934: standard offline Turf War draws each bot weapon independently (S3 has no one-weapon-per-team rule).
// Runs the actual composed Match.setup; Actor/BotBrain/PlayerController and the scene are fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const root = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, root), 'utf8');
const compose = (rel, code = read(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
function method(code, start, end) { const a = code.indexOf(start), b = code.indexOf(end, a); assert(a >= 0 && b > a); return code.slice(a, b); }
const ORDER = ['shooter', 'dualies', 'splatling', 'roller', 'slosher', 'charger', 'blaster'];

function setup(source, { mode = 'turf', attract = false, weapon = 'shooter', random }) {
  class Actor {
    constructor(o) { Object.assign(this, o); this.character = { root: {} }; this.stats = {}; }
    spawnAt() {}
  }
  const math = Object.create(Math); math.random = random;
  const G = { scene: { add() {} }, level: { spawnPads: [{ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -10 }] } };
  const Match = vm.runInNewContext(`(() => { class Match {${method(source, '  setup() {', '\n  // Online: the host')}} return Match; })()`, {
    G, Actor, PlayerController: class {}, BotBrain: class {}, on: () => () => {}, Math: math,
    WEAPON_ORDER: ORDER, MATCH: { teamSize: 4 }, BOT_NAMES: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], shuffle: a => a, randomStyle: () => ({}),
    _v: { set() { return this; } },
  });
  const m = Object.assign(Object.create(Match.prototype), { opts: { weapon, CharacterClass: class {} }, mode, attract, actors: [], bossCfg: { squad: 8 }, unsubs: [], bossModule: { BossMode: class { constructor() { this.boss = {}; } } } });
  m.setup();
  return [0, 1].map(team => m.actors.filter(a => a.team === team).map(a => a.weapon));
}
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const unique = list => new Set(list).size === list.length;

test('negative control: native setup draws without replacement, so teams never repeat a weapon', () => {
  const random = lcg(7), raw = read('src/game/match.js');
  for (let i = 0; i < 300; i++) for (const team of setup(raw, { random })) assert(unique(team));
  for (let i = 0; i < 300; i++) assert(!setup(raw, { random })[0].slice(1).includes('shooter'));
});

test('#934: bot slots are independent draws, so duplicates (even four of a kind) are representable', () => {
  const source = compose('src/game/match.js');
  // Index 0 on every draw: the local Shooter plus three Shooter bots on both teams.
  const [a, b] = setup(source, { random: () => 0 });
  assert.deepEqual(a, ['shooter', 'shooter', 'shooter', 'shooter']);
  assert.deepEqual(b, ['shooter', 'shooter', 'shooter', 'shooter']);
  // Three Shooter-class weapons plus one other kind (the S3 sample composition shape).
  const [c] = setup(source, { random: (() => { const seq = [0, 0, 3 / 7]; let i = 0; return () => seq[i++ % seq.length]; })() });
  assert.deepEqual(c, ['shooter', 'shooter', 'shooter', 'roller']);
});

test('#934: the local weapon is kept in slot 0, teams stay 4v4, and both mixed and duplicate teams occur', () => {
  const source = compose('src/game/match.js'), random = lcg(11);
  let duplicateTeams = 0, mixedTeams = 0, localRepeated = 0;
  for (let i = 0; i < 400; i++) {
    const teams = setup(source, { random, weapon: 'charger' });
    assert.deepEqual(teams.map(t => t.length), [4, 4]);
    assert.equal(teams[0][0], 'charger');
    for (const team of teams) { assert(team.every(w => ORDER.includes(w))); unique(team) ? mixedTeams++ : duplicateTeams++; }
    if (teams[0].slice(1).includes('charger')) localRepeated++;
  }
  assert(duplicateTeams > 50 && mixedTeams > 50, `${duplicateTeams} duplicate / ${mixedTeams} mixed teams`);
  assert(localRepeated > 50, 'selecting a weapon must not ban it from the three bot teammates');
});

test('#934: each draw still uses one Math.random call per bot slot', () => {
  let calls = 0;
  setup(compose('src/game/match.js'), { random: () => { calls++; return 0.5; } });
  assert.equal(calls, 3 + 4);
});

test('#934: Boss squads and the attract backdrop keep the balanced no-repeat mix', () => {
  const source = compose('src/game/match.js'), random = lcg(3);
  for (let i = 0; i < 200; i++) {
    const [squad] = setup(source, { mode: 'boss', random });
    assert.equal(squad.length, 8); assert(unique(squad.slice(0, 4))); assert(unique(squad.slice(4)));
    for (const team of setup(source, { attract: true, random })) assert(unique(team));
  }
});

test('#934: the connections fail closed on upstream drift and double application', () => {
  const raw = read('src/game/match.js');
  assert.throws(() => adaptSource('src/game/match.js', raw.replace('const pickTeam = (first) => {', 'const pickTeam = (f) => {')), /standard Turf weapon draws keep the local weapon/);
  assert.throws(() => adaptSource('src/game/match.js', adaptSource('src/game/match.js', raw)), /deterministic Alpha turf tie/);
});
