import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../scripts/inkwave-source-composition.mjs';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
import { BASE, SUITES, suiteBase } from './config.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
assert(!process.env.INKWAVE_BUILT_SITE, 'Source overlay-link tests run before build; native runner separately verifies emitted overlays');
const baseline = (file, base) => {
  const local = base === BASE ? process.env.INKWAVE_QA_BASELINE_SOURCE : process.env.INKWAVE_QA_AIR_BASELINE_SOURCE;
  return local ? fs.readFileSync(path.join(local, file), 'utf8') : execFileSync('git', ['show', base + ':' + file], { cwd: ROOT, encoding: 'utf8' });
};
const make = async (suite, before) => {
  const consumed = new Set(), overlay = new Map(before ? SUITES[suite].before.map(file => [file, baseline(file, suiteBase(suite))]) : []);
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true, vmMathRandom: () => .5,
    adaptRuntime: (file, source) => { if (overlay.has(file)) { consumed.add(file); source = overlay.get(file); } return adaptBuildSource(file, source); },
    extraExports: "export {installRanked} from './patches/splatoon3/runtime/ranked/install.mjs';" });
  f.installRanked(f.installedRuntime);
  for (const file of overlay.keys()) assert(consumed.has(file), 'Historical module actually linked: ' + file);
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
    a.character.dispose(); G.actors = []; G.local = null;
  }
  assert.deepEqual(poses[1], poses[0], 'Shared handoff change preserves ordinary Clams pose, hand matrices, visibility and gameplay');
});
