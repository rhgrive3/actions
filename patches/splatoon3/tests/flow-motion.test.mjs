import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installFlowMotion as installFromAnotherRealm } from '../runtime/flow-motion.mjs';

// Exactly one VM owns the actual production installer, THREE, Actor, Runner,
// full Character and all motion hooks. Do not compose cross-realm fixtures.
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
    const m = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installFlowMotion, flowMotionSnapshot, FLOW_MOTION_CALIBRATION } from './patches/splatoon3/runtime/flow-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'flow-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installFlowMotion(api);
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  // Symbol.for guards the actual prototype even when a duplicate module comes
  // from another realm; independent WeakSets would install this hook twice.
  const update = api.Character.prototype.update;
  api.installFlowMotion(api); installFromAnotherRealm(api);
  assert.equal(api.Character.prototype.update, update);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, kind = 'shooter', team = 0) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team, name: 'flow production regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null;
  G.scene.add(ch.root); G.actors.push(a); a.grounded = a.ground.hit = true;
  // Only world collision/movement integration is stubbed. The actual Actor
  // update, Flow, Runner, _finishFrame, pose and native IK still execute.
  a._integrate = () => {}; a._spawnBarrier = () => {}; a._updateClimb = () => {};
  const step = (dt = 1 / 60, input = {}) => {
    a.ink = 100; a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    a.intent.squid = a.form === 'squid'; G.time += dt; a.update(dt);
    ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  for (let i = 0; i < 60; i++) step();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  return { api, a, ch, step, visual, snapshot: () => api.flowMotionSnapshot(ch),
    close() { G.actors = G.actors.filter(actor => actor !== a); ch.dispose(); } };
}
function prepare(api, a) { api.emit('turf', { actor: a, area: 10000 }); }
function award(_api, attacker, victim) {
  if (!victim.alive) victim.reset();
  victim.character.setVisible(true); victim.splat(attacker);
}
function traceRow(r, stage) {
  return { stage, diagnostic: r.snapshot(), actor: { alive: r.a.alive, form: r.a.form,
    grounded: r.a.grounded, flow: { ...r.a.s3.flow } },
    nativeIK: Array.from(r.ch.ikErr), glow: r.ch.u.uGlow.value.toArray() };
}
function saveTrace(rows) {
  const destination = process.env.INKWAVE_FLOW_TRACE_PATH;
  if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'),
    'requested Flow trace must resolve to persistent evidence storage');
  const file = path.join(folder, path.basename(destination));
  const body = { schema: 1, evidence: 'actual source CPU scene/pose trace; GPU render is parent-owned',
    runtimeSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT,
      'patches/splatoon3/runtime/flow-motion.mjs'))).digest('hex'), rows };
  fs.writeFileSync(file + '.pending', JSON.stringify(body, null, 2) + '\n');
  fs.renameSync(file + '.pending', file);
}
function exterior(ch) { return ch.root.getObjectByName('s3-flow-exterior'); }
function fingerprint(ch) {
  const group = exterior(ch);
  return group ? { matrices: Array.from(group.getObjectByName('s3-flow-glints').instanceMatrix.array),
    alpha: Array.from(group.getObjectByName('s3-flow-glints').geometry.getAttribute('aFlowAlpha').array),
    ribbons: group.children.filter(mesh => mesh.name.startsWith('s3-flow-entry-spiral')).map(mesh => ({
      visible: mesh.visible, matrix: mesh.matrix.toArray() })), glow: ch.u.uGlow.value.toArray() } : null;
}
function grip(ch, THREE, side = 'R') {
  const w = side === 'L' ? ch.weapon.left : ch.weapon;
  const b = side === 'L' ? ch.bones.handL : ch.bones.handR;
  const h = side === 'L' ? w.def.handL : w.def.handR;
  return w.off.localToWorld(h.pos.clone()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
}

test('Flow entry follows actual award, extension and expiry while gameplay stays authoritative', async () => {
  const api = await production(), r = rig(api), victim = rig(api, 'shooter', 1);
  try {
    const trace = [traceRow(r, 'off')];
    prepare(api, r.a); assert.equal(r.a.s3.flow.active, false); assert.equal(exterior(r.ch), undefined);
    award(api, r.a, victim.a); assert.equal(r.a.s3.flow.remaining, api.profile.flow.duration);
    r.step(); assert.equal(r.snapshot().phase, 'entry'); assert.equal(r.snapshot().event, 'entry');
    assert.equal(r.snapshot().activationCount, 1); assert.ok(r.snapshot().aliveParticles > 0);
    trace.push(traceRow(r, 'entry'));
    const group = exterior(r.ch); assert.equal(group.parent, r.ch.root);
    for (let i = 0; i < 59; i++) r.step();
    assert.equal(r.snapshot().phase, 'active'); assert.equal(r.snapshot().event, null);
    trace.push(traceRow(r, 'active'));
    assert.ok(group.children.filter(x => x.name.startsWith('s3-flow-entry-spiral')).every(x => !x.visible));
    assert.ok(Math.abs(r.a.s3.flow.remaining - (api.profile.flow.duration - 1)) < 1e-8);
    const before = r.a.s3.flow.remaining; award(api, r.a, victim.a);
    assert.equal(r.a.s3.flow.remaining, Math.min(api.profile.flow.maxDuration, before + api.profile.flow.extension));
    r.step(); assert.equal(r.snapshot().event, 'extension'); assert.equal(r.snapshot().extensionCount, 1);
    trace.push(traceRow(r, 'extension'));
    const count = r.snapshot().extensionCount; for (let i = 0; i < 30; i++) r.step();
    assert.equal(r.snapshot().extensionCount, count); assert.equal(r.snapshot().event, null);
    // Natural expiry comes from the production advanceFlow wrapper, with no
    // duplicate duration clock in the renderer. Shorten only this test state.
    r.a.s3.flow.remaining = 1 / 60; r.step();
    assert.equal(r.a.s3.flow.active, false); assert.equal(r.snapshot().phase, 'expiry');
    assert.ok(r.snapshot().opacity > 0 && r.snapshot().opacity < 1);
    trace.push(traceRow(r, 'expiry'));
    for (let i = 0; i < 20; i++) r.step();
    assert.equal(r.snapshot().phase, 'off'); assert.equal(r.snapshot().aliveParticles, 0);
    assert.equal(r.snapshot().visible, false); assert.equal(r.a.s3.flow.remaining, 0);
    trace.push(traceRow(r, 'off-after-expiry')); saveTrace(trace);
  } finally { r.close(); victim.close(); }
});

test('actual hostile assist extension restarts one small visual burst', async () => {
  const api = await production(), r = rig(api), killer = rig(api), victim = rig(api, 'shooter', 1);
  try {
    prepare(api, r.a); award(api, r.a, victim.a); for (let i = 0; i < 60; i++) r.step();
    const before = r.a.s3.flow.remaining;
    victim.a.reset(); victim.a.damage(20, r.a, 'shooter');
    award(api, killer.a, victim.a); r.step();
    assert.ok(r.a.s3.flow.remaining > before); assert.equal(r.snapshot().event, 'extension');
    assert.equal(r.snapshot().extensionCount, 1); assert.equal(r.snapshot().activationCount, 1);
  } finally { r.close(); killer.close(); victim.close(); }
});

test('30/60/120Hz and irregular rendering share identical actual 60Hz visual traces', async () => {
  const api = await production(), traces = [];
  for (const intervals of [Array(60).fill(1 / 30), Array(120).fill(1 / 60), Array(240).fill(1 / 120),
    Array.from({ length: 60 }, (_, i) => i % 2 ? 1 / 20 : 1 / 60)]) {
    const r = rig(api), victim = rig(api, 'shooter', 1), clock = new api.FixedClock(), rows = [];
    try {
      prepare(api, r.a); award(api, r.a, victim.a);
      for (const interval of intervals) clock.advance(interval, dt => {
        r.step(dt); const snap = r.snapshot();
        rows.push({ phase: snap.phase, level: snap.level, event: snap.event, alive: snap.aliveParticles,
          remaining: r.a.s3.flow.remaining, geometry: fingerprint(r.ch), pose: Array.from(r.ch.P) });
      });
      assert.equal(clock.ticks, 120); traces.push(rows);
    } finally { r.close(); victim.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]); assert.deepEqual(traces[2], traces[3]);
});

test('dt=0 freezes Flow transitions, particles and gameplay timer', async () => {
  const api = await production(), r = rig(api), victim = rig(api, 'shooter', 1);
  try {
    prepare(api, r.a); award(api, r.a, victim.a); for (let i = 0; i < 12; i++) r.step();
    const snapshot = r.snapshot(), pixels = fingerprint(r.ch), remaining = r.a.s3.flow.remaining;
    // Character may settle other upstream zero-dt pose bookkeeping; check this
    // layer's clocks, shader, instances and ribbons, not a mock pose array.
    for (let i = 0; i < 10; i++) r.step(0);
    assert.deepEqual(r.snapshot(), snapshot); assert.deepEqual(fingerprint(r.ch), pixels);
    assert.equal(r.a.s3.flow.remaining, remaining);
  } finally { r.close(); victim.close(); }
});

test('posed indexed shell geometry follows kid/squid, airborne, weapons and LOD without touching native IK', async () => {
  const api = await production(), { THREE } = api, r = rig(api), victim = rig(api, 'shooter', 1);
  try {
    prepare(api, r.a); award(api, r.a, victim.a); for (let i = 0; i < 60; i++) r.step();
    for (const kind of ['shooter', 'dualies', 'charger', 'splatling', 'blaster', 'slosher', 'roller']) {
      r.a.setWeapon(kind); r.a.grounded = false; r.a.vel.set(0, 2, 0);
      for (let i = 0; i < 20; i++) r.step(1 / 60, { fire: true });
      assert.equal(r.a.s3.flow.active, true); assert.ok(r.snapshot().visible);
      assert.ok(Number.isFinite(grip(r.ch, THREE))); assert.ok(Array.from(r.ch.ikErr).every(Number.isFinite));
    }
    r.a.setWeapon('dualies'); r.a.grounded = true; r.a.vel.set(0, 0, 0);
    for (let i = 0; i < 60; i++) r.step();
    assert.ok(grip(r.ch, THREE) < .025); assert.ok(grip(r.ch, THREE, 'L') < .025);
    assert.ok(Array.from(r.ch.ikErr.slice(0, 2)).every(error => error < .0005));
    for (const tier of [0, 1, 2, 0, 1]) { r.ch.setLod(tier); r.visual(); }
    const shell = r.ch.root.getObjectByName('s3-flow-edge:kid:hair:game')
      || r.ch.root.getObjectsByProperty('isSkinnedMesh', true).find(x => x.name.startsWith('s3-flow-edge:'));
    assert.ok(shell, 'uses actual skinned geometry');
    const source = shell.parent.children.find(x => x !== shell && x.geometry?.index === shell.geometry.index && !x.name.startsWith('s3-flow-edge:'));
    assert.equal(shell.skeleton, source.skeleton); assert.notEqual(shell.geometry, source.geometry);
    assert.equal(shell.geometry.index, source.geometry.index); assert.equal(shell.geometry.attributes.position, source.geometry.attributes.position);
    assert.ok(shell.geometry.index.count > 0);
    // Test a genuinely drawn indexed vertex through the native skinning path;
    // assigned hand targets or an AABB would not prove this shell follows pose.
    const i = shell.geometry.index.getX(0), actual = new THREE.Vector3(), edge = new THREE.Vector3();
    r.ch.skeleton.update(); source.getVertexPosition(i, actual); shell.getVertexPosition(i, edge);
    assert.ok(actual.distanceTo(edge) < 1e-8);
    for (const form of ['squid', 'kid', 'squid']) {
      r.a.form = form; r.a.grounded = false; r.a.submerged = false;
      for (let i = 0; i < 30; i++) r.visual();
      assert.equal(r.ch.kidForm, form === 'kid'); assert.equal(r.snapshot().active, true);
      assert.ok(r.snapshot().visible);
    }
    const squidShell = r.ch.root.getObjectByName('s3-flow-squid-edge');
    assert.notEqual(squidShell.geometry, r.ch.squid.body.geometry); assert.equal(squidShell.geometry.index, r.ch.squid.body.geometry.index); assert.equal(squidShell.parent, r.ch.squid.body.parent);
    assert.equal(squidShell.visible, true); assert.ok(r.snapshot().shells < 50);
    assert.ok(squidShell.material.vertexShader.includes('float wig = color.g'));
    assert.equal(squidShell.material.uniforms.uWig, r.ch.u.uWig,
      'squid edge uses the real material deformation and shared animation uniforms');
  } finally { r.close(); victim.close(); }
});

test('hidden/form return never replays entry; reset/death clear immediately; special-ready stays independent', async () => {
  const api = await production(), r = rig(api), victim = rig(api, 'shooter', 1);
  try {
    prepare(api, r.a); award(api, r.a, victim.a); r.step();
    const group = exterior(r.ch), resources = r.snapshot().resources;
    r.ch.setVisible(false); assert.equal(group.visible, false);
    for (let i = 0; i < 60; i++) r.step();
    r.ch.setVisible(true); r.step(); assert.equal(r.snapshot().event, null);
    assert.equal(r.snapshot().activationCount, 1); assert.equal(exterior(r.ch), group);
    r.a.special = 1e6; for (let i = 0; i < 60; i++) r.step();
    assert.ok(r.ch.wGlow > .99);
    r.a.s3.flow.active = false; r.a.s3.flow.remaining = 0; for (let i = 0; i < 30; i++) r.step();
    assert.equal(r.snapshot().visible, false); assert.ok(r.ch.u.uGlow.value.toArray().some(x => x > .1));
    assert.ok(r.ch.wGlow > .99, 'Flow expiry never writes special-ready wGlow');
    prepare(api, r.a); award(api, r.a, victim.a); r.step();
    r.a.reset(); assert.equal(r.snapshot().phase, 'off'); assert.equal(group.visible, false);
    assert.equal(r.snapshot().resources, resources); assert.equal(r.a.s3.flow.active, false);
    prepare(api, r.a); award(api, r.a, victim.a); r.step();
    r.a.splat(null); assert.equal(r.snapshot().phase, 'off'); assert.equal(group.visible, false);
    assert.equal(r.a.alive, false); assert.equal(r.a.s3.flow.active, false);
  } finally { r.close(); victim.close(); }
});

test('bounded resources survive many Flow cycles and dispose exactly once without disposing shared geometry', async () => {
  const api = await production(), r = rig(api), victim = rig(api, 'shooter', 1);
  try {
    prepare(api, r.a); award(api, r.a, victim.a); r.step();
    const group = exterior(r.ch), glints = group.getObjectByName('s3-flow-glints');
    const ribbon = group.getObjectByName('s3-flow-entry-spiral:0');
    const squidShell = r.ch.root.getObjectByName('s3-flow-squid-edge');
    const shellMaterials = new Set(r.ch.root.getObjectsByProperty('isMesh', true)
      .filter(x => x.name.startsWith('s3-flow-edge:')).map(x => x.material));
    const owned = [glints.geometry, glints.material, ribbon.geometry, ribbon.material,
      squidShell.material, ...shellMaterials, glints, squidShell.geometry, ...r.ch.root.getObjectsByProperty('isSkinnedMesh', true).filter(x => x.name.startsWith('s3-flow-edge:')).map(x => x.geometry)];
    const counts = new Map(owned.map(x => [x, 0]));
    for (const x of owned) x.addEventListener('dispose', () => counts.set(x, counts.get(x) + 1));
    let sharedDisposed = 0; r.ch.squid.body.geometry.addEventListener('dispose', () => sharedDisposed++);
    const initial = r.snapshot().resources;
    for (let cycle = 0; cycle < 40; cycle++) {
      r.a.reset(); r.a.grounded = true; prepare(api, r.a); award(api, r.a, victim.a);
      r.step(); r.a.s3.flow.remaining = 1 / 60; r.step(); for (let i = 0; i < 16; i++) r.step();
      assert.equal(exterior(r.ch), group); assert.equal(r.snapshot().resources, initial);
    }
    r.ch.dispose(); r.ch.dispose(); r.ch.update(1 / 60, r.a.anim);
    assert.equal(api.flowMotionSnapshot(r.ch).disposed, true); assert.equal(group.parent, null);
    assert.equal(squidShell.parent, null); assert.equal(sharedDisposed, 0);
    for (const count of counts.values()) assert.equal(count, 1);
  } finally { r.close(); victim.close(); }
});

test('quality rebuilds replace stale real LOD shells and keep resource counts bounded', async () => {
  const api = await production(), r = rig(api), victim = rig(api, 'shooter', 1);
  try {
    prepare(api, r.a); award(api, r.a, victim.a); for (let i = 0; i < 60; i++) r.step();
    r.ch.setLod('game'); r.visual();
    const shells = () => r.ch.root.getObjectsByProperty('isSkinnedMesh', true)
      .filter(x => x.name.startsWith('s3-flow-edge:'));
    const resources = r.snapshot().resources, original = new Set(shells());
    for (const quality of ['low', 'high', 'low', 'high']) {
      api.G.settings.quality = quality; r.visual();
      assert.equal(r.snapshot().resources, resources);
      assert.equal(shells().length, r.ch.lodSets[r.ch.lod.tier].list
        .filter(x => ['skin', 'cloth', 'hair'].includes(x.userData.iwMat)).length);
      assert.ok(shells().every(shell => !original.has(shell)), 'retired source shells are detached');
      assert.ok(shells().every(shell => shell.parent.children.some(source => source !== shell
        && source.geometry?.index === shell.geometry.index && !source.name.startsWith('s3-flow-edge:'))));
    }
  } finally { api.G.settings.quality = 'high'; r.close(); victim.close(); }
});

test('visual reads do not mutate Flow or weapon state and direct variable intervals keep elapsed transitions', async () => {
  const api = await production(), results = [];
  for (const intervals of [Array(24).fill(1 / 30), Array(48).fill(1 / 60), Array(96).fill(1 / 120),
    Array.from({ length: 32 }, (_, i) => i % 2 ? .04 : .01)]) {
    const r = rig(api), victim = rig(api, 'shooter', 1);
    try {
      prepare(api, r.a); award(api, r.a, victim.a);
      const flow = r.a.s3.flow, runner = r.a.weaponRunner;
      const keys = ['chargeT', 'charge', 'slosh', 'cooldown', 'lockT', 's3Turret', 'streaming'];
      const before = keys.map(key => runner[key]); Object.freeze(flow);
      for (const dt of intervals) r.visual(dt);
      assert.equal(r.a.s3.flow, flow); assert.equal(flow.remaining, api.profile.flow.duration);
      assert.deepEqual(keys.map(key => runner[key]), before);
      assert.equal(r.snapshot().phase, 'active'); assert.equal(r.snapshot().event, null);
      assert.equal(r.snapshot().opacity, 1); assert.equal(r.snapshot().activationCount, 1);
      assert.ok(Math.abs(r.snapshot().time - .8) < 1e-8); results.push(r.snapshot().resources);
    } finally { r.close(); victim.close(); }
  }
  assert.ok(results.every(value => value === results[0]));
});

test('per-Character counterfactual opt-out retains the installed legacy Flow shader only', async () => {
  const api = await production(), r = rig(api), victim = rig(api, 'shooter', 1);
  try {
    r.ch.s3FlowMotionEnabled = false; prepare(api, r.a); award(api, r.a, victim.a); r.step();
    const expected = r.ch.color.clone().multiplyScalar(.35 + .45
      * (.5 + .5 * Math.sin(r.ch.t * Math.PI * 2 * 1.6)));
    assert.ok(r.ch.u.uGlow.value.toArray().every((x, i) => Math.abs(x - expected.toArray()[i]) < 1e-10));
    assert.equal(exterior(r.ch), undefined); assert.equal(r.snapshot().resources, 0);
    assert.equal(r.a.s3.flow.active, true);
    r.ch.s3FlowMotionEnabled = true; r.step(); assert.equal(r.snapshot().phase, 'entry');
  } finally { r.close(); victim.close(); }
});


test('override material passes exclude every Flow mesh without changing shared native geometry or buffers', async () => {
  const api = await production(), r = rig(api), victim = rig(api, 'shooter', 1);
  try {
    prepare(api, r.a); award(api, r.a, victim.a); r.step();
    const meshes = r.ch.root.getObjectsByProperty('isMesh', true).filter(x => x.name.startsWith('s3-flow-'));
    assert.ok(meshes.some(x => x.isInstancedMesh)); assert.ok(meshes.some(x => x.name.startsWith('s3-flow-entry-spiral')));
    const borrowed = meshes.filter(x => x.name.startsWith('s3-flow-edge:') || x.name === 's3-flow-squid-edge');
    assert.ok(borrowed.length > 1);
    const native = borrowed.map(shell => {
      const source = shell.name === 's3-flow-squid-edge' ? r.ch.squid.body : shell.parent.children.find(x => x !== shell && !x.name.startsWith('s3-flow-') && x.geometry?.index === shell.geometry.index);
      assert.ok(source); assert.notEqual(shell.geometry, source.geometry);
      assert.notEqual(shell.geometry.drawRange, source.geometry.drawRange);
      assert.equal(shell.geometry.index, source.geometry.index);
      for (const key of Object.keys(source.geometry.attributes)) assert.equal(shell.geometry.attributes[key], source.geometry.attributes[key]);
      return {shell, source, range:{...source.geometry.drawRange}, index:source.geometry.index, attributes:{...source.geometry.attributes}};
    });
    const scene = {overrideMaterial: new api.THREE.MeshNormalMaterial()};
    for (const mesh of meshes) {
      const count = mesh.geometry.drawRange.count;
      mesh.onBeforeRender({}, scene, {}, mesh.geometry); assert.equal(mesh.geometry.drawRange.count, 0);
      scene.overrideMaterial = null; mesh.onBeforeRender({}, scene, {}, mesh.geometry); assert.equal(mesh.geometry.drawRange.count, count);
      scene.overrideMaterial = {}; // repeat the next mesh's override pass
    }
    for (const record of native) {
      assert.equal(record.source.geometry.drawRange.start, record.range.start); assert.equal(record.source.geometry.drawRange.count, record.range.count); assert.equal(record.source.geometry.index, record.index);
      for (const key of Object.keys(record.attributes)) assert.equal(record.source.geometry.attributes[key], record.attributes[key]);
      record.shell.geometry.addEventListener('dispose', () => {
        assert.equal(record.shell.geometry.index, null, 'dispose cannot delete the source GPU index buffer');
        assert.equal(Object.keys(record.shell.geometry.attributes).length, 0, 'dispose cannot delete source GPU vertex buffers');
      });
    }
    r.close();
    for (const record of native) { assert.equal(record.source.geometry.index, record.index); assert.equal(record.source.geometry.drawRange.start, record.range.start); assert.equal(record.source.geometry.drawRange.count, record.range.count); }
  } finally { r.close(); victim.close(); }
});
