import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installHitSpawnMotion as installAgain, hitSpawnMotionSnapshot as crossRealmSnapshot } from '../runtime/hit-spawn-motion.mjs';

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
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installHitSpawnMotion, hitSpawnMotionSnapshot } from './patches/splatoon3/runtime/hit-spawn-motion.mjs';
    export { installFlowMotion, flowMotionSnapshot } from './patches/splatoon3/runtime/flow-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'hit-spawn-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const before = [api.Character.prototype.update, api.Character.prototype._poseSpawn,
    api.Actor.prototype.reset, api.Actor.prototype.spawnAt];
  api.installHitSpawnMotion(api, profile); installAgain(api, profile);
  assert.deepEqual([api.Character.prototype.update, api.Character.prototype._poseSpawn,
    api.Actor.prototype.reset, api.Actor.prototype.spawnAt], before);
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.level = { blocks: [], spawnPads: [new THREE.Vector3(), new THREE.Vector3(0, 0, 40)], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true,
    groundProbe: (_x, _y, _z, _up, _down, _radius, hit) => { hit.hit = false; return hit; },
    raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, { kind = 'shooter', enabled = true, team = 0 } = {}) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team, name: 'hit spawn production regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3HitSpawnMotionEnabled = enabled;
  G.actors.push(a); G.scene.add(ch.root); a.grounded = a.ground.hit = true;
  // Keep actual Actor/Runner/Character code; collision integration is separate.
  a._integrate = () => {}; a._spawnBarrier = () => {}; a._updateClimb = () => {};
  const visual = (dt = 1 / 60) => {
    a._finishFrame(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update();
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  const step = (dt = 1 / 60, input = {}) => {
    a.intent.fire = !!input.fire; a.intent.sub = !!input.sub; a.intent.squid = a.form === 'squid';
    G.time += dt; a.update(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update();
  };
  for (let i = 0; i < 90; i++) visual();
  return { a, ch, api, step, visual, snapshot: () => api.hitSpawnMotionSnapshot(ch),
    close() { G.actors = G.actors.filter(x => x !== a); ch.dispose(); } };
}
function grip(r, side = 'R') {
  const w = side === 'L' ? r.ch.weapon.left : r.ch.weapon;
  const h = side === 'L' ? w.def.handL : w.def.handR;
  const b = side === 'L' ? r.ch.bones.handL : r.ch.bones.handR;
  return w.off.localToWorld(h.pos.clone()).distanceTo(b.getWorldPosition(new r.api.THREE.Vector3()));
}
function gameplay(r) {
  const a = r.a, runner = a.weaponRunner;
  return { alive: a.alive, hp: a.hp, ink: a.ink, special: a.special, invuln: a.invuln,
    respawnTimer: a.respawnTimer, form: a.form, grounded: a.grounded,
    pos: a.pos.toArray(), vel: a.vel.toArray(), root: r.ch.root.position.toArray(),
    rootQuaternion: r.ch.root.quaternion.toArray(), input: { ...a.intent, move: a.intent.move.toArray() },
    runner: Object.fromEntries(Object.entries(runner).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean')) };
}
function shader(api, material) {
  const source = api.THREE.ShaderLib.physical;
  const program = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader,
    uniforms: api.THREE.UniformsUtils.clone(source.uniforms) };
  material.onBeforeCompile(program); return program;
}
// Skin actual vertices that the indexed draw references, including a sample
// influenced by the left arm. Bone/target agreement alone cannot prove this.
function drawnVertices(r) {
  const { ch, api } = r, rows = [];
  const drawn = ch.lodSets[ch.lod.tier].list;
  for (const mesh of drawn) {
    if (!mesh.visible || !mesh.isSkinnedMesh) continue;
    const geo = mesh.geometry, index = geo.index, si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
    assert.ok(index && index.count > 0, 'native indexed geometry');
    const selected = new Set();
    for (let i = 0; i < index.count; i += Math.max(1, Math.floor(index.count / 24))) selected.add(index.getX(i));
    // Add up to eight actual draw vertices attached to the left arm bones.
    let arm = 0;
    for (let i = 0; i < index.count && arm < 8; i++) {
      const n = index.getX(i);
      for (let k = 0; k < 4; k++) {
        const bone = mesh.skeleton.bones[si.getComponent(n, k)];
        if (sw.getComponent(n, k) > .5 && [ch.bones.uArmL, ch.bones.fArmL, ch.bones.handL].includes(bone)) {
          if (!selected.has(n)) { selected.add(n); arm++; } break;
        }
      }
    }
    const vertices = [...selected].map(n => {
      const point = new api.THREE.Vector3().fromBufferAttribute(geo.getAttribute('position'), n);
      mesh.applyBoneTransform(n, point).applyMatrix4(mesh.matrixWorld);
      return { index: n, world: point.toArray() };
    });
    rows.push({ mesh: mesh.name, drawIndexCount: index.count, vertices });
  }
  assert.ok(rows.length > 0); return rows;
}
function posed(r) {
  return { pose: Array.from(r.ch.P), nativeIK: Array.from(r.ch.ikErr),
    bones: Object.fromEntries(['hips', 'spine', 'chest', 'head', 'handL', 'handR', 'footL', 'footR'].map(name =>
      [name, r.ch.bones[name].matrixWorld.toArray()])),
    weapon: r.ch.weapon.off.matrixWorld.toArray(), muzzle: r.ch.getMuzzle(new r.api.THREE.Vector3()).toArray(),
    geometry: drawnVertices(r), grip: grip(r), diagnostic: r.snapshot() };
}
const evidenceRows = [];
function saveTrace() {
  const destination = process.env.INKWAVE_HIT_SPAWN_TRACE_PATH;
  if (!destination) return;
  const directory = fs.realpathSync(path.dirname(destination));
  assert.ok(directory.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(directory, path.basename(destination));
  const runtime = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/hit-spawn-motion.mjs'));
  fs.writeFileSync(file + '.pending', JSON.stringify({ schema: 1,
    evidence: 'actual source CPU native bones, indexed skinned vertices, IK and material programs; GPU/browser and console comparison are parent-owned',
    runtimeSha256: createHash('sha256').update(runtime).digest('hex'), rows: evidenceRows }, null, 2) + '\n');
  fs.renameSync(file + '.pending', file);
}

test('spawn removes the legacy ground-hand flourish while native weapon grips and drawn body remain valid', async () => {
  const api = await production(), before = rig(api, { enabled: false }), after = rig(api);
  try {
    const C = api.CHARACTER_CHANNELS;
    for (const r of [before, after]) {
      r.a.respawn(); r.visual(); r.a.grounded = true; r.a.vel.set(0, 0, 0);
      r.ch.trigger('land', .6);
      r.a.weaponRunner.update(1 / 60, { fire: true });
      for (let i = 0; i < 17; i++) r.visual();
    }
    assert.ok(before.ch.P[C.LTW] > .9, 'legacy spawn sends the left hand to the floor after shooting pose');
    assert.equal(after.ch.P[C.LTW], 0, 'no ceremonial floor target overrides the weapon');
    assert.ok(after.ch.P[C.IKL] > .99); assert.ok(after.ch.ikErr[0] < .001); assert.ok(after.ch.ikErr[1] < .001);
    assert.ok(grip(after) < .03);
    const leftPoint = after.ch.weapon.def.handL.pos.clone().applyMatrix4(after.ch.weapon.off.matrixWorld);
    assert.ok(leftPoint.distanceTo(after.ch.bones.handL.getWorldPosition(new api.THREE.Vector3())) < .03);
    const b = posed(before), a = posed(after);
    assert.notDeepEqual(a.bones.handL, b.bones.handL); assert.notDeepEqual(a.geometry, b.geometry);
    assert.deepEqual(gameplay(after), gameplay(before));
    evidenceRows.push({ stage: 'legacy-ground-hand-vs-native-weapon', before: b, after: a });
    saveTrace();
  } finally { before.close(); after.close(); }
});

test('spawn coating uses native physical shaders, geometry and LOD, expires with authoritative protection, and preserves generic invulnerability', async () => {
  const api = await production(), r = rig(api);
  try {
    const meshes = r.ch.lodSets[r.ch.lod.tier].list;
    const geometries = meshes.map(m => m.geometry), skeleton = r.ch.skeleton;
    const original = gameplay(r); r.a.respawn(); const protection = r.a.invuln;
    r.visual(.1); assert.equal(r.snapshot().phase, 'protected'); assert.ok(r.snapshot().coating > .8);
    assert.equal(r.a.invuln, protection); assert.equal(r.ch.skeleton, skeleton);
    assert.deepEqual(meshes.map(m => m.geometry), geometries);
    assert.deepEqual(Array.from(r.ch.u.uFlash.value.toArray()), [0, 0, 0]);
    for (const kind of ['skin', 'cloth', 'hair', 'squid', 'squidGhost']) {
      const program = shader(api, r.ch.mats[kind]);
      assert.equal(program.uniforms.uS3SpawnCoating.value, r.snapshot().coating);
      assert.ok(program.vertexShader.includes('#include <skinning_vertex>'));
      assert.ok(program.fragmentShader.includes('diffuseColor.rgb = mix(diffuseColor.rgb, uS3SpawnColor'));
      assert.equal((program.fragmentShader.match(/uniform float uS3SpawnCoating/g) || []).length, 1);
      assert.equal(program.uniforms.uFlash, r.ch.u.uFlash, 'native flash uniform identity survives composition');
      if (['skin', 'cloth', 'hair'].includes(kind)) {
        assert.equal(program.uniforms.uHurt, r.ch.u.uHurt);
        assert.ok(program.fragmentShader.includes('iwHurtM'), 'native directional hurt mask remains in the program');
      }
      if (kind === 'skin') assert.equal(program.uniforms.uMouth, r.ch.u.uMouth);
      if (['hair', 'squid', 'squidGhost'].includes(kind)) assert.equal(program.uniforms.uGlow, r.ch.u.uGlow);
      assert.ok(r.ch.mats[kind].customProgramCacheKey().includes('|iwSpawnCoating1'));
      const vertexOnly = { vertexShader: api.THREE.ShaderLib.physical.vertexShader, fragmentShader: '', uniforms: {} };
      assert.doesNotThrow(() => r.ch.mats[kind].onBeforeCompile(vertexOnly));
    }
    for (const tier of [0, 1, 2]) {
      r.ch._setTier(tier); r.visual(0);
      for (const mesh of r.ch.lodSets[tier].list) {
        if (!['skin', 'cloth', 'hair'].includes(mesh.userData.iwMat)) continue;
        assert.equal(shader(api, mesh.material).uniforms.uS3SpawnCoating.value, r.snapshot().coating);
      }
    }
    const dither = r.ch._ditherMat('skin', 0); r.visual(0); const program = shader(api, dither);
    assert.equal((program.fragmentShader.match(/uniform float uS3SpawnCoating/g) || []).length, 1);
    assert.equal(program.uniforms.uLodFade, r.ch.lod.fadeOut);
    assert.ok(program.fragmentShader.includes('discard'));
    r.a.invuln = .05; r.visual(0); assert.equal(r.snapshot().phase, 'expiry');
    assert.ok(r.snapshot().coating > 0 && r.snapshot().coating < .8);
    evidenceRows.push({ stage: 'spawn-coating-and-expiry', native: posed(r), invuln: r.a.invuln }); saveTrace();
    r.a.invuln = 0; r.visual(0); assert.equal(r.snapshot().phase, 'off'); assert.equal(program.uniforms.uS3SpawnCoating.value, 0);
    r.a.invuln = 1; r.visual(.013); assert.equal(r.snapshot().spawnProtection, false);
    assert.ok(r.ch.u.uFlash.value.r > 0, 'non-spawn invulnerability keeps the native flash');
    assert.equal(original.hp, r.a.hp);
  } finally { r.close(); }
});

test('direct 30/60/120Hz native frames follow the same spawn protection duration and retain finite output', async () => {
  const api = await production();
  for (const hz of [30, 60, 120]) {
    const r = rig(api);
    try {
      r.a.respawn(); r.a.grounded = true; r.a.vel.set(0, 0, 0);
      const duration = r.a.invuln;
      for (let i = 0; i < hz * 2; i++) r.step(1 / hz);
      assert.equal(r.a.invuln, 0); assert.equal(r.snapshot().phase, 'off');
      assert.equal(duration, api.PLAYER.spawnInvuln);
      const output = posed(r); assert.ok(output.pose.every(Number.isFinite));
      assert.ok(output.nativeIK.every(Number.isFinite)); assert.ok(output.geometry.length > 0);
      const before = gameplay(r); r.visual(0); assert.deepEqual(gameplay(r), before);
      evidenceRows.push({ stage: 'direct-frame-rate', hz, native: output }); saveTrace();
    } finally { r.close(); }
  }
});

test('native directional hits and splat disappearance remain gameplay-identical', async () => {
  const api = await production(), before = rig(api, { enabled: false }), after = rig(api);
  try {
    const initialChest = Array.from(after.ch.bones.chest.matrixWorld.elements);
    for (const r of [before, after]) {
      r.a.damage(30, { pos: new api.THREE.Vector3(5, 0, 0) }); r.visual();
    }
    assert.deepEqual(gameplay(after), gameplay(before));
    assert.deepEqual(Array.from(after.ch.P), Array.from(before.ch.P));
    assert.deepEqual(after.ch.hitX, before.ch.hitX); assert.ok(after.ch.hitX > .99);
    assert.notDeepEqual(Array.from(after.ch.bones.chest.matrixWorld.elements), initialChest,
      'actual native side-hit torso motion remains');
    evidenceRows.push({ stage: 'native-hit-preserved', before: posed(before), after: posed(after) });
    for (const r of [before, after]) { r.a.damage(100, null); }
    assert.deepEqual(gameplay(after), gameplay(before)); assert.equal(after.a.alive, false);
    assert.equal(after.ch.root.visible, false); assert.equal(after.snapshot().visible, false);
    const timer = after.a.respawnTimer; after.a.update(.1);
    assert.ok(Math.abs(after.a.respawnTimer - timer + .1) < 1e-10);
    assert.equal(after.ch.root.visible, false); saveTrace();
  } finally { before.close(); after.close(); }
});

test('reset, death, special, weapon/sub/action interruption and form returns cannot replay a spawn flourish or alter other channels', async () => {
  const api = await production(), r = rig(api);
  try {
    r.a.respawn(); r.visual(.1); const coating = r.snapshot().coating;
    r.a.form = 'squid'; for (let i = 0; i < 20; i++) r.visual();
    assert.equal(r.ch.kidForm, false); assert.equal(r.snapshot().coating, coating);
    r.a.form = 'kid'; r.a.grounded = true; r.visual();
    r.a.setWeapon('dualies'); r.visual();
    assert.equal(r.snapshot().phase, 'protected'); assert.equal(r.ch.P[api.CHARACTER_CHANNELS.LTW], 0);
    r.a.intent.sub = true; r.a.weaponRunner.update(1 / 60, { sub: true }); r.visual();
    assert.equal(r.ch.P[api.CHARACTER_CHANNELS.LTW], 0);
    r.ch.trigger('throw'); r.visual(); assert.ok(Array.from(r.ch.P).every(Number.isFinite));
    r.a.specialActive = { armor: true }; r.visual(); assert.equal(r.snapshot().phase, 'off');
    r.a.specialActive = null; r.visual(); assert.equal(r.snapshot().phase, 'off');
    r.a.respawn(); r.visual(); r.a.reset(); assert.equal(r.snapshot().coating, 0);
    r.visual(); assert.equal(r.snapshot().phase, 'off');
    r.a.respawn(); r.visual(); r.ch.setVisible(false); r.ch.setVisible(true); r.visual();
    assert.equal(r.snapshot().phase, 'off');
    r.a.respawn(); r.visual(); r.a.splat(null); assert.equal(r.snapshot().coating, 0);
    r.a.respawn(); r.visual(); assert.ok(r.snapshot().coating > 0);
    assert.equal(r.a.invuln, api.PLAYER.spawnInvuln); assert.equal(r.a.hp, api.PLAYER.hp);
  } finally { r.close(); }
});

test('Flow production hooks still derive native shell deformation and own their existing glow', async () => {
  const api = await production(), r = rig(api);
  try {
    r.a.s3.flow.active = true; r.a.s3.flow.remaining = 10; r.visual(.1);
    assert.equal(api.flowMotionSnapshot(r.ch).active, true);
    const glow = r.ch.u.uGlow.value.toArray();
    r.a.respawn(); r.a.s3.flow.active = true; r.a.s3.flow.remaining = 10; r.visual(.1);
    assert.equal(api.flowMotionSnapshot(r.ch).active, true); assert.deepEqual(r.ch.u.uGlow.value.toArray(), glow);
    const flowShell = r.ch.root.getObjectsByProperty('isMesh', true).find(m => m.name.startsWith('s3-flow-edge:'));
    assert.ok(flowShell); assert.ok(flowShell.material.vertexShader.includes('#include <skinning_vertex>'));
    assert.ok(r.snapshot().coating > 0);
  } finally { r.close(); }
});

test('a first native Actor frame uses the real remaining spawn protection before Character discovers its owner', async () => {
  const api = await production(), { G, THREE, Actor, Character } = api;
  const a = new Actor({ team: 0, name: 'first-frame spawn', weapon: 'shooter', CharacterClass: Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.onEvent = null;
  G.scene.add(ch.root); G.actors.push(a);
  try {
    assert.equal(ch._owner(), null, 'no test-injected Actor pointer or warm-up frames');
    a.spawnAt(new THREE.Vector3(), 0); a.grounded = a.ground.hit = true;
    a.invuln = .05; const before = { ink: a.ink, hp: a.hp, invuln: a.invuln, pos: a.pos.toArray(), vel: a.vel.toArray() };
    a._finishFrame(1 / 60); ch.root.updateMatrixWorld(true); ch.skeleton.update();
    const snapshot = api.hitSpawnMotionSnapshot(ch);
    assert.equal(ch._owner(), a); assert.equal(snapshot.phase, 'expiry');
    const smooth = x => x * x * (3 - 2 * x);
    assert.ok(Math.abs(snapshot.coating - .9 * smooth((1 / 60) / .08) * smooth(.05 / .12)) < 1e-12);
    assert.deepEqual({ ink: a.ink, hp: a.hp, invuln: a.invuln, pos: a.pos.toArray(), vel: a.vel.toArray() }, before);
    const r = { a, ch, api, snapshot: () => api.hitSpawnMotionSnapshot(ch) };
    assert.ok(drawnVertices(r).length > 0); assert.ok(Array.from(ch.ikErr).every(Number.isFinite));
    evidenceRows.push({ stage: 'first-native-frame-expiry', native: posed(r), protection: a.invuln }); saveTrace();
  } finally { G.actors = G.actors.filter(x => x !== a); ch.dispose(); }
});

test('30/60/120Hz production clock yields identical posed native geometry, protection clocks and pause behavior', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      api.G.time = 0; r.a.respawn();
      for (let frame = 0; frame < hz * 2; frame++) clock.advance(1 / hz, dt => {
        r.step(dt); rows.push({ pose: Array.from(r.ch.P), hand: r.ch.bones.handR.matrixWorld.toArray(),
          geometry: clock.ticks === 30 || clock.ticks === 90 ? drawnVertices(r) : null,
          nativeIK: Array.from(r.ch.ikErr), invuln: r.a.invuln, visual: r.snapshot() });
      });
      const paused = r.snapshot(), gameplayBefore = gameplay(r); r.visual(0);
      assert.deepEqual(r.snapshot(), paused); assert.deepEqual(gameplay(r), gameplayBefore);
      assert.equal(clock.ticks, 120); assert.equal(r.a.invuln, 0);
      traces.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('nullable preview is safe, duplicate realms are harmless, and native resources dispose once', async () => {
  const api = await production(), r = rig(api);
  try {
    assert.deepEqual(JSON.parse(JSON.stringify(crossRealmSnapshot(r.ch))), JSON.parse(JSON.stringify(r.snapshot())));
    r.ch.actor = null; api.G.actors = []; r.ch.inWorld = false; r.ch.root.removeFromParent();
    assert.doesNotThrow(() => r.ch.update(0, null)); assert.equal(r.snapshot().phase, 'off');
    r.ch.trigger('spawn'); r.ch.update(.1, { invuln: true, grounded: false });
    assert.equal(r.snapshot().phase, 'protected');
    const disposeCounts = new Map();
    for (const kind of ['skin', 'cloth', 'hair', 'squid', 'squidGhost']) {
      const material = r.ch.mats[kind]; disposeCounts.set(material, 0);
      material.addEventListener('dispose', () => disposeCounts.set(material, disposeCounts.get(material) + 1));
    }
    let geometryDisposed = 0;
    r.ch.lodSets[r.ch.lod.tier].list[0].geometry.addEventListener('dispose', () => geometryDisposed++);
    r.ch.dispose(); r.ch.dispose();
    assert.ok([...disposeCounts.values()].every(n => n === 1)); assert.equal(geometryDisposed, 0);
    assert.equal(r.snapshot().disposed, true); assert.equal(r.snapshot().coating, 0); assert.equal(r.snapshot().resources, 0);
    assert.doesNotThrow(() => r.ch.update(.1, null));
  } finally { r.close(); }
});
