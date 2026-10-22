import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { compactModuleStrings } from '../../../scripts/lib/inkwave-source-compaction.mjs';

const REL = 'patches/splatoon3/runtime/weapon-detail-motion.mjs';
const canonical = fs.readFileSync(new URL('../runtime/weapon-detail-motion.mjs', import.meta.url), 'utf8');
const gate = "const chargerHeld = this.weaponKind === 'charger' && enabled(this) &&";
assert.equal(canonical.split(gate).length, 2, 'unique current Charger correction gate, no historical source pin');
const disabled = canonical.replace(gate, gate.replace('= ', '= false && '));
const emitted = process.env.INKWAVE_BUILT_SITE ? await (async () => {
  const { transformSync } = await import(process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild');
  const compile = source => compactModuleStrings(transformSync(adaptBuildSource(REL, source), {
    loader: 'js', format: 'esm', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: REL,
  }).code).code;
  return { original: compile(canonical), disabled: compile(disabled) };
})() : null;

async function makeFixture(control) {
  let observed = 0;
  if (emitted) {
    const f = await sourceLoadedActorFixture({
      emittedTransform(rel, source) {
        if (rel !== REL) return source;
        observed++;
        assert.equal(source, emitted.original, 'actual emitted bytes must equal the production compiler before counterfactual substitution');
        return control ? emitted.disabled : source;
      },
      extraExports: `export {getWeaponDef} from './src/game/character-weapons.js';`,
    });
    assert.equal(observed, 1, 'actual emitted detail runtime consumed exactly once');
    return f;
  }
  // The source-loaded fixture deliberately exposes no runtime test switch.
  // Substitute only this one already-read source module while creating its VM.
  // All other modules and all current-lane bytes stay real and untouched.
  const original = fs.readFileSync;
  fs.readFileSync = function(file, options) {
    const value = Reflect.apply(original, this, arguments);
    const name = file instanceof URL ? fileURLToPath(file) : file;
    if (typeof name !== 'string' || !name.endsWith('/' + REL)) return value;
    observed++;
    assert.equal(String(value), canonical, 'source fixture consumes the current detail runtime');
    return control ? (typeof value === 'string' ? disabled : Buffer.from(disabled)) : value;
  };
  try {
    const f = await sourceLoadedActorFixture({ extraExports: `export {getWeaponDef} from './src/game/character-weapons.js';` });
    assert.equal(observed, 1, 'current source detail runtime consumed exactly once');
    return f;
  } finally { fs.readFileSync = original; }
}

async function trajectory(control) {
  const f = await makeFixture(control);
  const { Actor, Character, THREE, G, Physics, CHARACTER_CHANNELS: C } = f;
  G.scene = new THREE.Scene(); G.settings = null; G.mode = 'boot'; G.local = null; G.renderer = null;
  G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
  const camera = new THREE.PerspectiveCamera(34, 960 / 720, .01, 50); G.camera = camera;
  G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; return out; } };
  G.physics = new Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true }; G.time = 0;
  const normalize = (value, depth = 0) => {
    if (value === G.actors?.[0]) return { actor: value.name, weapon: value.weapon?.kind };
    if (value == null || ['number', 'string', 'boolean'].includes(typeof value)) return value;
    if (value.isVector3 || value.isQuaternion || value.isColor) return Array.from(value.toArray());
    if (depth > 3) return 'depth-limit';
    if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value, v => normalize(v, depth + 1));
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== 'function').map(([k, v]) => [k, normalize(v, depth + 1)]));
  };
  const shots = [];
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireBlaster', 'fireSlosh', 'fireFlick', 'fireCharger', 'fireSplatling', 'throwBomb'].map(method =>
    [method, (...args) => shots.push({ method, time: G.time, args: args.map(arg => normalize(arg)) })]));
  const rows = [], contacts = [];
  for (const kind of ['shooter', 'charger']) {
    const d = f.getWeaponDef(kind), model = new THREE.Group();
    model.add(new THREE.Mesh(d.body), new THREE.Mesh(d.ink)); if (d.glow) model.add(new THREE.Mesh(d.glow));
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    camera.position.copy(center).add(new THREE.Vector3(-.9, .45, 1.1).normalize().multiplyScalar(Math.max(...size.toArray()) * 2.45));
    camera.lookAt(center); camera.updateMatrixWorld(true);
    const a = new Actor({ team: 0, weapon: kind, isLocal: true, name: kind, CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    const ch = a.character; ch.actor = a; ch.onEvent = null;
    a.grounded = a.ground.hit = true; G.actors = [a]; G.scene.add(ch.root);
    try {
      await ch._sourceMotionLoader; if (ch.sourceMotion?.ready) await ch.sourceMotion.ready;
      assert.equal(ch.sourceMotion?.status, 'ready', 'real source bank loaded');
      for (let frame = 0; frame < 270; frame++) {
        const input = { fire: frame >= 90 && frame < 190, sub: frame >= 220 && frame < 230 };
        a.ink = 100; a.intent.fire = input.fire; a.intent.sub = input.sub;
        a.grounded = !(frame >= 130 && frame < 145); a.aimPitch = frame >= 130 && frame < 145 ? .75 : 0;
        if (frame >= 45 && frame < 90) { a.vel.set(0, 0, 3); a.pos.z += 3 / 60; } else a.vel.set(0, 0, 0);
        G.time += 1 / 60; a.weaponRunner.update(1 / 60, input); a._finishFrame(1 / 60);
        ch.root.updateMatrixWorld(true); ch.skeleton.update();
        rows.push({ kind, frame, time: G.time, actor: { pos: Array.from(a.pos.toArray()), vel: Array.from(a.vel.toArray()), ink: a.ink },
          runner: Object.fromEntries(Object.entries(a.weaponRunner).filter(([, v]) => v == null || ['number', 'string', 'boolean'].includes(typeof v))),
          P: Array.from(ch.P), ikErrPre: ch.ikErrPre, lReach: ch.lReach,
          body: [ch.kid, ch.bones.chest, ch.bones.hips].map(b => Array.from(b.matrixWorld.toArray())),
          feet: [ch.bones.footL, ch.bones.footR].map(b => Array.from(b.matrixWorld.toArray())),
          clavicle: [ch.bones.clavL, ch.bones.clavR].map(b => ({ position: Array.from(b.position.toArray()), quaternion: Array.from(b.quaternion.toArray()) })) });
        if (!ch.dual && ch.P[C.IKL] > .99 && ch.P[C.LTW] < .001) {
          const live = ch.weapon.def;
          contacts.push({ kind, frame, left: ch.weapon.off.localToWorld(live.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())),
            right: ch.weapon.off.localToWorld(live.handR.pos.clone()).distanceTo(ch.bones.handR.getWorldPosition(new THREE.Vector3())) });
        }
        if (frame === 80 || frame === 150) {
          camera.position.copy(a.pos).add(new THREE.Vector3(-1.8, 1.25, 3.25)); camera.lookAt(a.pos.clone().add(new THREE.Vector3(0, .8, .12))); camera.updateMatrixWorld(true);
          ch._camHook({ getRenderTarget: () => null, getPixelRatio: () => 1, getSize: out => out.set(960, 720), info: { render: { frame: frame === 80 ? 1 : 2 } } }, G.scene, camera);
        }
      }
    } finally { G.scene.remove(ch.root); ch.dispose(); G.actors = []; }
  }
  return { rows, shots, contacts };
}

test('Charger final reach preserves the full native feedback and gameplay trajectory against its disabled control', async t => {
  const control = await trajectory(true), current = await trajectory(false);
  assert.equal(current.rows.length, 540); assert.equal(control.rows.length, 540);
  for (let i = 0; i < current.rows.length; i++) {
    for (const key of Object.keys(control.rows[i])) assert.deepEqual(current.rows[i][key], control.rows[i][key], `${current.rows[i].kind} frame ${current.rows[i].frame}: protected ${key}`);
  }
  assert.deepEqual(current.shots, control.shots, 'actual native WeaponRunner method-call arguments and timing unchanged; not a collision proof');
  assert.ok(current.shots.some(s => s.method === 'fireShooter') && current.shots.some(s => s.method === 'fireCharger'));
  const priorGap = Math.max(...control.contacts.filter(r => r.kind === 'charger').map(r => r.left));
  assert.ok(priorGap > .006, 'disabled correction still exposes the actual native landing failure');
  for (const row of current.contacts) { assert.ok(row.left < .006, `${row.kind} ${row.frame}: left physical grip`); assert.ok(row.right < .002, `${row.kind} ${row.frame}: right physical grip`); }
  t.diagnostic(JSON.stringify({ mode: emitted ? 'actual-emitted-with-byte-verified-counterfactual' : 'source', framesPerLane: 540, protectedRowsExact: current.rows.length, methodCalls: current.shots.length, controlMaxGap: priorGap, currentMaxGap: Math.max(...current.contacts.map(r => r.left)), limits: ['headless native Actor/Character', 'no GPU, full match or actual projectile collision'] }));
});
