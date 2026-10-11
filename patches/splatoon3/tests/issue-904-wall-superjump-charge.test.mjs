import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptConstrainedSource } from './source-fixture.mjs';

// #904: a wall-start Super Jump keeps the wall-cling squid basis while its charge
// is supported. Gameplay (position lock, no climb input, charge time) is unchanged.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptConstrainedSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { installSuperjumpMotion } from './patches/splatoon3/runtime/superjump-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'issue-904-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installSuperjumpMotion(api, profile);
  const { G, THREE } = api, V = THREE.Vector3, center = new V(0, -.1, 0), half = new V(100, .1, 100);
  const floor = { id: 0, solid: true, center, half, axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  G.level = { blocks: [floor], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0, pointInside: () => false,
    spawnPads: [new V(), new V(80, 0, 80)], spawnBarrier: 1,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' }; G.time = 0;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.physics = new api.Physics(G.level);
  G.paint = { sample: () => 0, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster',
    'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; cached = api; return api;
}
function rig(api) {
  const { Actor, Character, G, THREE } = api;
  // The composed production module is cached across tests; reset the per-test overrides.
  G.physics = new api.Physics(G.level); G.paint.sample = () => 0; G.actors = [];
  const a = new Actor({ team: 0, name: 'issue 904 wall charge', weapon: 'shooter',
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3SuperjumpMotionEnabled = true;
  G.scene.add(ch.root); G.actors.push(a); a.grounded = true;
  G.physics.groundProbe(0, 0, 0, .4, .35, .24, a.ground, false);
  const step = (dt = 1 / 60) => { G.time += dt; a.intent.squid = a.form === 'squid'; a.update(dt); ch.root.updateMatrixWorld(true); };
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  for (let i = 0; i < 90; i++) step();
  assert.equal(ch._owner(), a); assert.equal(a.grounded, true);
  return { api, a, ch, step, visual, close() { G.actors = G.actors.filter(x => x !== a); G.scene.remove(ch.root); ch.dispose(); } };
}
const pose = r => r.ch.squid.pivot.getWorldQuaternion(new r.api.THREE.Quaternion());
// Puts the actor on an inked vertical wall (normal -Z), settles the wall-cling pose,
// then admits a wall-start Super Jump through the production admission path.
function wallStart(r) {
  const { a, api } = r, V = api.THREE.Vector3;
  a.reset(); a.form = 'squid'; a.climbing = true; a.grounded = false; a.pos.set(0, 2, 0);
  a.wallN.set(0, 0, -1); a.intent.squid = true; a.intent.move.set(0, 0, 0);
  api.G.paint.sample = () => 1;
  api.G.physics.raycast = (_o, _d, _r, h) => { h.hit = true; h.face = 0; h.normal.set(0, 0, -1); h.u = h.v = .5; return h; };
  for (let i = 0; i < 60; i++) r.visual();
  const before = pose(r);
  assert.equal(a.superJump(new V(10, 0, 10)), true, 'wall-start Super Jump is admitted');
  assert.ok(a.superJumpState.wallSupport, 'admission captured the supporting wall');
  return before;
}

test('#904 supported wall-start charge keeps the wall basis and the locked position at 30/60/120 Hz', async t => {
  const api = await production(), r = rig(api); t.after(() => r.close());
  const outcomes = [];
  for (const hz of [30, 60, 120]) {
    const before = wallStart(r), position = r.a.pos.clone(), clock = new api.FixedClock();
    let chargeTicks = 0, launchTick = null;
    for (let frame = 0; frame < hz * 4 && launchTick === null; frame++) {
      clock.advance(1 / hz, () => {
        if (launchTick !== null) return;
        r.step();
        if (r.a.superJumpState?.phase === 'charge') {
          chargeTicks++;
          assert.equal(r.a.climbing, false, 'charge does not resume climb input');
          assert.ok(r.a.pos.distanceTo(position) < 1e-10, 'charge keeps the wall position');
          assert.ok(before.angleTo(pose(r)) < 1e-4, `wall basis rotated by ${before.angleTo(pose(r))} rad at ${hz} Hz`);
          assert.equal(r.a.anim.form, 'squid', 'gameplay-facing form stays squid');
          assert.equal(r.ch.form, 'squid', 'borrowed climb basis is released after the update call');
        } else launchTick = clock.ticks;
      });
    }
    assert.ok(launchTick !== null, `${hz} Hz charge reaches launch`);
    assert.ok(chargeTicks > 0, `${hz} Hz charge runs for at least one fixed tick`);
    outcomes.push({ chargeTicks, launchTick });
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test('#904 repainted wall support clears the wall-start state on the same tick and leaves no borrowed form behind', async t => {
  const api = await production(), r = rig(api); t.after(() => r.close());
  wallStart(r);
  r.step();
  assert.ok(r.a.superJumpState.wallSupport, 'supported charge is active');
  assert.equal(r.ch.form, 'squid');
  api.G.paint.sample = () => 2;
  r.step();
  assert.equal(r.a.superJumpState.wallSupport, null, 'lost support clears the captured wall');
  assert.equal(r.a.anim.form, 'squid');
  assert.equal(r.ch.form, 'squid');
  assert.equal(r.a.climbing, false);
});
