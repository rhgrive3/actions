import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../scripts/inkwave-source-composition.mjs';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
import { BASE, SUITES, suiteBase } from './config.mjs';
import { historicalBombCompatibility, assertHistoricalBombCompatibilityUnused, HISTORICAL_BOMB_BASE, HISTORICAL_BOMB_FILE, HISTORICAL_BOMB_SHA256, HISTORICAL_BOMB_CALLS } from './historical-bomb-compat.mjs';
import { createHash } from 'node:crypto';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
assert(!process.env.INKWAVE_BUILT_SITE, 'Source overlay-link tests run before build; native runner separately verifies emitted overlays');
const baseline = (file, base) => {
  const local = base === BASE ? process.env.INKWAVE_QA_BASELINE_SOURCE : process.env.INKWAVE_QA_AIR_BASELINE_SOURCE;
  return local ? fs.readFileSync(path.join(local, file), 'utf8') : execFileSync('git', ['show', base + ':' + file], { cwd: ROOT, encoding: 'utf8' });
};
const make = async (suite, before) => {
  const consumed = new Set(), overlay = new Map(before ? SUITES[suite].before.map(file => [file, baseline(file, suiteBase(suite))]) : []);
  let compatibility = null;
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true, vmMathRandom: () => .5,
    adaptRuntime: (file, source) => {
      if (overlay.has(file)) {
        consumed.add(file);
        const bridged = historicalBombCompatibility({ suite, file, base: suiteBase(suite), historicalSource: overlay.get(file), candidateSource: source });
        source = bridged.source;
        if (bridged.receipt) compatibility = bridged.receipt;
      }
      return adaptBuildSource(file, source);
    },
    extraExports: `export {installRanked} from './patches/splatoon3/runtime/ranked/install.mjs';
      export {RankedEngine} from './patches/splatoon3/runtime/ranked/engine.mjs';
      export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';
      export {Match} from './inkwave-public/src/game/match.js';
      export {bombReleasePosition,bombPredictionPosition,stormThrowPosition} from './patches/splatoon3/runtime/bomb-motion.mjs';
      export const qaHistoricalBombCalls = globalThis.${HISTORICAL_BOMB_CALLS};` });
  f.installRanked(f.installedRuntime);
  for (const file of overlay.keys()) assert(consumed.has(file), 'Historical module actually linked: ' + file);
  if (compatibility) assertHistoricalBombCompatibilityUnused(f.qaHistoricalBombCalls);
  return f;
};
for (const suite of Object.keys(SUITES)) test(suite + ' exact historical runtime overlay links in the actual production module graph', async () => {
  const f = await make(suite, true);
  assert(f.Actor && f.Character && f.installedRuntime && f.G);
});
test('Clam comparison fixes clams mode, leaves Rainmaker inactive, and preserves the ordinary pose with old/new shared handoff', async () => {
  const poses = [];
  for (const before of [true, false]) {
    const f = await make('clam', before), { G, Actor, Character } = f;
    class FixedCharacter extends Character { constructor(opts) { super({ ...opts, sourceMotion: false }); } }
    const a = new Actor({ team: 0, isLocal: true, name: 'clam-before-scope', weapon: 'shooter', CharacterClass: FixedCharacter, style: { hair: 0, hat: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.nid = 'carrier'; a.character.actor = a; a.character.onEvent = null; a.grounded = a.ground.hit = true;
    G.actors = [a]; G.local = a;
    // Deliberately include Rainmaker-like carrier/charge data. Mode must be the
    // gate; unrelated state cannot activate the objective pose during Clams.
    G.match = { mode: 'clams', state: 'playing', playing: () => true, canRespawn: () => false, ranked: { rule: { state: { carrier: a.nid, charge: { value: 1, recovery: .2 } } } } };
    const gameplay = () => ({pos:Array.from(a.pos.toArray()),vel:Array.from(a.vel.toArray()),hp:a.hp,ink:a.ink,special:a.special,alive:a.alive});
    const initialGameplay = gameplay();
    for (let i = 0; i < 60; i++) {
      G.time += 1 / 60; a._finishFrame(1 / 60);
      assert.equal(G.match.mode, 'clams'); assert(!a.character._rainmakerPose, 'Rainmaker branch remains inactive in Clams');
    }
    assert.deepEqual(gameplay(), initialGameplay, 'Pose-only updates do not change gameplay');
    a.character.root.updateMatrixWorld(true);
    poses.push({pose:Array.from(a.character.P),left:Array.from(a.character.bones.handL.matrixWorld.elements),right:Array.from(a.character.bones.handR.matrixWorld.elements),root:Array.from(a.character.root.matrixWorld.elements),opacity:a.character.u.uOpacity.value,pivotVisible:a.character.weapon.pivot.visible,gameplay:gameplay()});
    if (before) assertHistoricalBombCompatibilityUnused(f.qaHistoricalBombCalls);
    a.character.dispose(); G.actors = []; G.local = null;
  }
  assert.deepEqual(poses[1], poses[0], 'Shared handoff change preserves ordinary Clams pose, hand matrices, visibility and gameplay');
});

test('Clam compatibility preserves the complete immutable body and copies only the reviewed genuine forecast definitions', () => {
  const historicalSource = baseline(HISTORICAL_BOMB_FILE, HISTORICAL_BOMB_BASE);
  const candidateSource = fs.readFileSync(path.join(ROOT, HISTORICAL_BOMB_FILE), 'utf8');
  const args = { suite: 'clam', file: HISTORICAL_BOMB_FILE, base: HISTORICAL_BOMB_BASE, historicalSource, candidateSource };
  const bridged = historicalBombCompatibility(args), digest = value => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(bridged.source.slice(0, historicalSource.length)), HISTORICAL_BOMB_SHA256);
  assert.equal(bridged.source.slice(0, historicalSource.length), historicalSource);
  assert.deepEqual(Object.keys(bridged.receipt.copiedExports), ['stormThrowPosition', 'bombPredictionPosition']);
  for (const [name, entry] of Object.entries(bridged.receipt.copiedExports)) {
    const pattern = new RegExp('^export function ' + name + '\\(a, out\\) \\{\\n[\\s\\S]*?^\\}', 'gm');
    const original = [...candidateSource.matchAll(pattern)], copied = [...bridged.source.matchAll(pattern)];
    assert.equal(original.length, 1); assert.equal(copied.length, 1);
    assert.equal(copied[0][0], original[0][0]); assert.equal(digest(copied[0][0]), entry.sha256);
  }
  assert.throws(() => historicalBombCompatibility({ ...args, historicalSource: historicalSource + '\n' }), /byte-exact/);
  assert.throws(() => historicalBombCompatibility({ ...args, base: 'f'.repeat(40) }), /immutable/);
  assert.throws(() => historicalBombCompatibility({ ...args, candidateSource: candidateSource.replace('out.y += 1.45', 'out.y += 1.46') }), /definition changed/);
  assert.throws(() => historicalBombCompatibility({ ...args, candidateSource: candidateSource + '\nexport function bombPredictionPosition(a, out) {\n return out;\n}' }), /Exactly one/);
  assert.equal(historicalBombCompatibility({ ...args, suite: 'rainmaker' }).source, historicalSource);
  assert.throws(() => assertHistoricalBombCompatibilityUnused(undefined), /must never run/);
  assert.throws(() => assertHistoricalBombCompatibilityUnused({ stormThrowPosition: 1, bombPredictionPosition: 0 }), /must never run/);
  assert.throws(() => assertHistoricalBombCompatibilityUnused({ stormThrowPosition: 0, bombPredictionPosition: 1 }), /must never run/);
});

test('Clam historical carry, real rule events and release timelines never call the forecast compatibility exports', async t => {
  const f = await make('clam', true), { G, THREE, Actor, Character, RankedEngine, RankedWorld, Match, bombReleasePosition } = f;
  G.scene = new THREE.Scene(); G.audio = { play() {} };
  const stage = { id: 'clam-native-qa', clams: { spawns: [], goals: [[0, 0, 8], [0, 0, -18]] } };
  class FixedCharacter extends Character { constructor(opts) { super({ ...opts, sourceMotion: false }); } }
  const actor = new Actor({ team: 0, isLocal: true, name: 'clam-compatibility-scope', weapon: 'shooter', CharacterClass: FixedCharacter, style: { hair: 0, hat: 0, skin: 2, outfit: 0, eyes: 0 } });
  actor.nid = 'player'; actor.character.actor = actor; actor.character.onEvent = null; actor.grounded = actor.ground.hit = true;
  actor.pos.set(0, 0, 0); actor.yaw = actor.aimYaw = 0; G.actors = [actor]; G.local = actor;
  const engine = new RankedEngine('clams', stage), rule = engine.rule;
  const match = G.match = { mode: 'clams', state: 'playing', ranked: engine, actors: [actor], playing: () => true, rankedGains: [0, 0], rankedEffects: { event() {} } };
  const world = match.rankedWorld = new RankedWorld(f.installedRuntime, match, stage);
  let frames = 0, releases = 0;
  try {
    for (const weapon of ['shooter', 'dualies']) {
      actor.setWeapon(weapon);
      for (let i = 0; i < 60; i++) { G.time += 1 / 60; actor._finishFrame(1 / 60); frames++; }
      for (const [kind, count] of [['small', 1], ['small', 7], ['power', 1]]) {
        rule.state.inventories.player = { team: 0, small: kind === 'small' ? count : 0, power: kind === 'power' }; world.update(engine, 0);
      }
      assert(rule._throw({ id: 'player', team: 0, alive: true, pos: actor.pos.toArray() }, { aim: [0, 0, 1] }, { actors: [], floorAt: () => 0 }));
      Match.prototype.playRankedEvents.call(match, engine.events.splice(0)); releases++;
      const clam = rule.state.clams.at(-1); bombReleasePosition(actor, new THREE.Vector3(...clam.pos));
      let previous = 0;
      for (const t of [0, 1 / 60, 2 / 60, .05, .15, .30, .52]) {
        while (previous < t - 1e-10) {
          const dt = Math.min(1 / 60, t - previous); previous += dt; G.time += dt; actor._finishFrame(dt); frames++;
          engine.update(dt, { actors: [], inputs: {}, floorAt: () => 0, blocked: () => false }); world.update(engine, dt);
        }
        world.update(engine, 0); assertHistoricalBombCompatibilityUnused(f.qaHistoricalBombCalls);
      }
      rule.state.clams = []; rule.state.inventories = {}; world.update(engine, 0);
    }
    assert.equal(releases, 2); assert.equal(frames, 184);
    const comparisonCalls = assertHistoricalBombCompatibilityUnused(f.qaHistoricalBombCalls);
    t.diagnostic(JSON.stringify({ historicalSha256: HISTORICAL_BOMB_SHA256, weapons: ['shooter', 'dualies'], frames, releases, comparisonCalls }));
    // Prove the receipt observes the actual exported bindings. These deliberate
    // calls happen only after the comparison ends and must invalidate its gate.
    const current = await import('../../patches/splatoon3/runtime/bomb-motion.mjs');
    for (const name of ['stormThrowPosition', 'bombPredictionPosition']) {
      const expected = new THREE.Vector3(3, 4, 5), actual = expected.clone();
      assert.equal(f[name](actor, actual), actual);
      current[name](actor, expected);
      assert.deepEqual(actual.toArray(), expected.toArray(), 'Counter delegates to the genuine production helper');
      assert.equal(f.qaHistoricalBombCalls[name], 1);
      assert.throws(() => assertHistoricalBombCompatibilityUnused(f.qaHistoricalBombCalls), /must never run/);
    }
  } finally { world.dispose(); actor.character.dispose(); G.actors = []; G.local = null; }
});
