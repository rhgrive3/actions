import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installIdleMotion as installFromAnotherRealm, idleMotionSnapshot as crossRealmSnapshot } from '../runtime/idle-motion.mjs';

// Actual production composition in ONE realm. No fake Character/rig and no
// individual motion installer stitched to the two-installer character fixture.
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
    export { installIdleMotion, idleMotionSnapshot } from './patches/splatoon3/runtime/idle-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'idle-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  const hooks = [api.Character.prototype.update, api.Character.prototype._updateStates,
    api.Character.prototype._poseFidget, api.Actor.prototype.reset];
  api.installIdleMotion(api, profile); installFromAnotherRealm(api, profile);
  assert.deepEqual([api.Character.prototype.update, api.Character.prototype._updateStates,
    api.Character.prototype._poseFidget, api.Actor.prototype.reset], hooks);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], spawnPads: [new THREE.Vector3(), new THREE.Vector3(0, 0, 20)], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0; cached = api; return api;
}
function rig(api, kind = 'shooter', enabled = true) {
  const { Actor, Character, G } = api;
  const a = new Actor({ team: 0, name: 'idle native regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3IdleMotionEnabled = enabled;
  G.scene.add(ch.root); G.actors = [a]; a.grounded = a.ground.hit = true;
  const step = (dt = 1 / 60, input = {}) => {
    a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    G.time += dt; a.weaponRunner.update(dt, { fire: !!input.fire, sub: !!input.sub,
      subReleased: !!input.subReleased });
    a._finishFrame(dt); ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  for (let i = 0; i < 90; i++) step();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  return { api, a, ch, step, visual, snapshot: () => api.idleMotionSnapshot(ch),
    close() { ch.dispose(); G.actors = G.actors.filter(actor => actor !== a); } };
}
function forceFidget(r, id, elapsed = .6) {
  // Reproduce the actual native clock state at the point an idle gesture fires.
  // Keep native _updateStates, layering and IK; no target setters or fake bones.
  r.ch.fidget = id; r.ch.fidgetT = elapsed - 1 / 60; r.ch.nextFidget = 99;
}
function frame(r) {
  const { ch, api: { THREE } } = r;
  ch.root.updateMatrixWorld(true); ch.skeleton.update();
  const bones = Object.fromEntries(['hips', 'spine', 'chest', 'head', 'uArmL', 'fArmL',
    'handL', 'uArmR', 'fArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']
    .map(name => [name, { position: ch.bones[name].getWorldPosition(new THREE.Vector3()).toArray(),
      quaternion: ch.bones[name].getWorldQuaternion(new THREE.Quaternion()).toArray() }]));
  const meshes = [];
  ch.root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.index || !mesh.visible) return;
    for (let p = mesh.parent; p; p = p.parent) if (!p.visible) return;
    const indices = mesh.geometry.index, vertices = [], v = new THREE.Vector3();
    // Sample *drawn indexed* vertices and skin them with the native skeleton.
    // Retain the concrete index/position pairs, not just an AABB or anchor.
    const start = mesh.geometry.drawRange.start, end = Math.min(indices.count, start + mesh.geometry.drawRange.count);
    for (let i = start; i + 2 < end; i += 3 * Math.max(1, Math.floor((end - start) / 192)))
      for (let corner = 0; corner < 3; corner++) {
        const index = indices.getX(i + corner); mesh.getVertexPosition(index, v); v.applyMatrix4(mesh.matrixWorld);
        vertices.push({ index, position: v.toArray() });
      }
    meshes.push({ name: mesh.name, kind: mesh.userData.iwMat || null, skinned: !!mesh.isSkinnedMesh,
      indexCount: indices.count, vertices });
  });
  return { diagnostic: r.snapshot(), pose: Array.from(ch.P), root: ch.root.position.toArray(), bones, meshes,
    nativeIK: Array.from(ch.ikErr), muzzle: ch.getMuzzle(new THREE.Vector3()).toArray(),
    armIKWeights: [ch.P[r.api.CHARACTER_CHANNELS.IKR], ch.P[r.api.CHARACTER_CHANNELS.IKL]],
    gripDistances: ['R', 'L'].map(side => {
      const weapon = side === 'L' && ch.dual ? ch.weapon.left : ch.weapon;
      return weapon.off.localToWorld(weapon.def[side === 'L' ? 'handL' : 'handR'].pos.clone())
        .distanceTo(ch.bones[side === 'L' ? 'handL' : 'handR'].getWorldPosition(new THREE.Vector3()));
    }),
    weapon: { position: ch.weapon.pivot.getWorldPosition(new THREE.Vector3()).toArray(),
      quaternion: ch.weapon.pivot.getWorldQuaternion(new THREE.Quaternion()).toArray() },
    feet: ch.feet.map(f => ({ planted: f.planted, swing: f.sw, contact: f.cw.toArray() })) };
}
function distance(a, b) { return Math.hypot(...a.map((v, i) => v - b[i])); }
function geometryDistance(a, b) {
  assert.equal(a.meshes.length, b.meshes.length);
  return Math.max(...a.meshes.flatMap((mesh, i) => mesh.vertices.map((v, j) =>
    distance(v.position, b.meshes[i].vertices[j].position))));
}
function gameplay(r) {
  const { a, ch } = r, runner = a.weaponRunner;
  return { time: r.api.G.time, pos: a.pos.toArray(), velocity: a.vel.toArray(), yaw: a.yaw,
    root: ch.root.position.toArray(), rootQ: ch.root.quaternion.toArray(), hp: a.hp, ink: a.ink,
    input: { move: a.intent.move.toArray(), fire: a.intent.fire, sub: a.intent.sub },
    runner: Object.fromEntries(['shotT', 'chargeT', 'charge', 'lockT', 'slosh', 'rolling',
      'aimingSub', 'dodge', 'streaming', 'charging'].map(k => [k, runner[k]])),
    clocks: Array.from(ch.tr) };
}
const evidenceRows = [];
function saveEvidence(rows) {
  evidenceRows.push(...rows);
  const destination = process.env.INKWAVE_IDLE_TRACE_PATH;
  if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(folder, path.basename(destination));
  const body = { schema: 1, proof: 'actual production CPU bones, indexed posed vertices and native IK; GPU/browser verification belongs to parent',
    runtimeSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT,
      'patches/splatoon3/runtime/idle-motion.mjs'))).digest('hex'), rows: evidenceRows };
  fs.writeFileSync(file + '.pending', JSON.stringify(body, null, 2) + '\n');
  fs.renameSync(file + '.pending', file);
}
function saveNativeGeometry(r, name) {
  const destination = process.env.INKWAVE_IDLE_TRACE_PATH;
  if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const { ch, api: { THREE } } = r, lines = [
    '# actual source indexed mesh, native CPU skinning and world transforms',
    '# procedural vertex/fragment shader effects require parent GPU verification'], v = new THREE.Vector3();
  let offset = 1;
  ch.root.updateMatrixWorld(true); ch.skeleton.update();
  ch.root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.index || !mesh.visible) return;
    for (let p = mesh.parent; p; p = p.parent) if (!p.visible) return;
    lines.push('o ' + (mesh.name || 'native-mesh').replace(/\s/g, '_'));
    const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    for (let i = 0; i < positions.count; i++) {
      mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld);
      lines.push(`v ${v.x.toFixed(7)} ${v.y.toFixed(7)} ${v.z.toFixed(7)}`);
    }
    const start = mesh.geometry.drawRange.start, end = Math.min(index.count, start + mesh.geometry.drawRange.count);
    for (let i = start; i + 2 < end; i += 3)
      lines.push(`f ${index.getX(i) + offset} ${index.getX(i + 1) + offset} ${index.getX(i + 2) + offset}`);
    offset += positions.count;
  });
  const file = path.join(folder, name + '.obj');
  fs.writeFileSync(file + '.pending', lines.join('\n') + '\n'); fs.renameSync(file + '.pending', file);
}

test('integrated idle and bomb layers keep the held-bomb hand and ready weapon stable', async () => {
  const api = await production(), rows = [];
  for (const enabled of [false, true]) {
    const r = rig(api, 'shooter', enabled);
    try {
      for (let i = 0; i < 30; i++) r.step(1 / 60, { sub: true });
      const stable = frame(r); forceFidget(r, 0); r.step(1 / 60, { sub: true });
      assert.ok(r.ch.wSub > .99); assert.equal(r.a.weaponRunner.aimingSub, true);
      assert.equal(r.ch.fidget, 0, 'native idle scheduler remains eligible during sub aim: reproduce bug');
      const posed = frame(r), change = distance(stable.bones.handL.position, posed.bones.handL.position);
      rows.push({ enabled, stable, posed, handChange: change });
      saveNativeGeometry(r, enabled ? 'bomb-ready-after' : 'bomb-ready-before');
      // Bomb motion is now integrated after native one-shots and already
      // protects this hand in the idle opt-out. Do not require obsolete damage
      // as proof that the idle layer works; validate both real outputs.
      assert.ok(change < .008, `integrated held bomb stays readied (${change})`);
      if (enabled) {
        assert.equal(r.snapshot().reason, 'sub'); assert.ok(change < .008, `held bomb stays readied (${change})`);
        assert.ok(r.snapshot().filteredFidgets > 0);
        assert.ok(posed.meshes.some(m => m.skinned && m.indexCount > 100));
        assert.ok(posed.meshes.some(m => !m.skinned && m.vertices.length > 0));
        assert.ok(geometryDistance(stable, posed) < .03);
        assert.ok(posed.nativeIK.slice(0, 2).every(v => v < .025));
      }
    } finally { r.close(); }
  }
  saveEvidence(rows);
});

test('idle diagnostics read installing-realm state and disposal through the shared prototype registry', async () => {
  const api = await production(), r = rig(api);
  try {
    forceFidget(r, 1); r.step();
    assert.equal(r.snapshot().phase, 'ready'); assert.ok(r.snapshot().filteredFidgets > 0);
    assert.deepEqual(crossRealmSnapshot(r.ch), JSON.parse(JSON.stringify(r.snapshot())));
    const pose = frame(r); r.visual(0);
    assert.ok(geometryDistance(pose, frame(r)) < 1e-7);
  } finally { r.close(); }
  assert.equal(crossRealmSnapshot(r.ch).disposed, true);
  assert.deepEqual(crossRealmSnapshot(r.ch), JSON.parse(JSON.stringify(r.snapshot())));
});

test('quiet match carry remains ready instead of a weapon flourish; looking, breathing and foot adjustment survive', async () => {
  const api = await production();
  for (const kind of ['shooter', 'blaster', 'charger', 'splatling', 'slosher', 'roller', 'dualies']) {
    const rows = [];
    for (const enabled of [false, true]) {
      const r = rig(api, kind, enabled);
      try {
        const before = frame(r); forceFidget(r, 1); r.step(); const after = frame(r);
        rows.push({ enabled, before, after });
        if (kind === 'shooter') saveNativeGeometry(r, enabled ? 'idle-carry-after' : 'idle-carry-before');
        const swing = distance(before.weapon.position, after.weapon.position);
        if (enabled) {
          assert.equal(r.snapshot().phase, 'ready'); assert.ok(swing < .012, `${kind} quiet carry (${swing})`);
          assert.ok(after.nativeIK.slice(0, 2).every(v => v < .025), `${kind} native arms remain reachable`);
          assert.ok(after.gripDistances[0] < .025, `${kind}: actual right-hand grip`);
          if (kind === 'dualies') assert.ok(after.gripDistances[1] < .025);
          if (kind === 'shooter') {
            // A zero solver residual with IK disabled proves no foregrip
            // contact. Keep this shared carry gap explicit for the parent.
            assert.equal(after.armIKWeights[1], 0); assert.ok(after.gripDistances[1] > .1);
          }
        } else assert.ok(swing > .015, `${kind} native flourish reproduction (${swing})`);
      } finally { r.close(); }
    }
    assert.ok(geometryDistance(rows[0].after, rows[1].after) > .015, `${kind} changes actual drawn geometry`);
    saveEvidence([{ stage: 'quiet-carry', kind, comparisons: rows }]);
  }
  const r = rig(api);
  try {
    const before = frame(r); forceFidget(r, 2); r.step(); const look = frame(r);
    assert.ok(r.snapshot().looks > 0);
    assert.ok(distance(before.bones.head.quaternion, look.bones.head.quaternion) > .01);
    const weaponGlanceChange = distance(before.weapon.position, look.weapon.position);
    assert.ok(weaponGlanceChange < .012, `glance preserves ready weapon (${weaponGlanceChange})`);
    // Native breathing changes the real rib cage without moving root physics.
    r.ch.fidget = -1; r.ch.nextFidget = 99;
    const chest = []; const root = r.ch.root.position.toArray();
    for (let i = 0; i < 240; i++) { r.step(); chest.push(r.ch.bones.chest.quaternion.toArray()); }
    assert.ok(chest.some(q => distance(q, chest[0]) > .025));
    assert.deepEqual(r.ch.root.position.toArray(), root);
    // A native shuffle is made reproducible by its own expiration clock.
    r.ch.idleT = 3; r.ch.shufT = 0; const feet = r.ch.feet.map(f => f.cw.clone());
    let steps = 0; for (let i = 0; i < 120; i++) { r.step(); if (r.ch.feet.some(f => f.sw)) steps++; }
    assert.ok(steps > 0); assert.ok(r.ch.feet.some((f, i) => f.cw.distanceTo(feet[i]) > .035));
    assert.ok(r.ch.feet.every(f => f.planted));
    // Turning the actual Actor invokes native planted-foot settling and gaze.
    const head = r.ch.bones.head.getWorldQuaternion(new api.THREE.Quaternion());
    r.a.yaw = Math.PI / 2; for (let i = 0; i < 120; i++) r.step();
    assert.ok(head.angleTo(r.ch.bones.head.getWorldQuaternion(new api.THREE.Quaternion())) > .6);
  } finally { r.close(); }
});

test('idle releases to native walk and action layers without changing gameplay, clocks or input', async () => {
  const api = await production();
  for (const scenario of ['walk', 'fire', 'charge', 'roller', 'sub', 'form', 'jump', 'spawn', 'special', 'hit', 'superjump']) {
    const traces = [];
    for (const enabled of [false, true]) {
      const r = rig(api, scenario === 'charge' ? 'charger' : scenario === 'roller' ? 'roller' : 'shooter', enabled);
      try {
        r.ch.fidget = -1; r.ch.nextFidget = 99;
        const rows = [];
        for (let i = 0; i < 45; i++) {
          if (scenario === 'walk') { r.a.vel.set(0, 0, 3); r.a.pos.z += 3 / 60; }
          if (scenario === 'form') { r.a.form = 'squid'; r.a.submerged = true; }
          if (scenario === 'jump') { r.a.grounded = false; r.a.vel.y = 3; }
          if (scenario === 'spawn' && i === 0) r.ch.trigger('spawn');
          if (scenario === 'special') r.a.specialActive = { id: 'leap', t: .2 };
          if (scenario === 'hit' && i === 0) { r.ch.trigger('hit', { x: 1, z: 0, amp: 1 }); r.a.hurtFlash = 1; }
          if (scenario === 'superjump') r.a.superJumpState = { t: .2, phase: 'charge' };
          r.step(1 / 60, { fire: ['fire', 'charge', 'roller'].includes(scenario), sub: scenario === 'sub' });
          const g = gameplay(r); delete g.time;
          rows.push({ pose: Array.from(r.ch.P), nativeIK: Array.from(r.ch.ikErr), gameplay: g,
            hand: r.ch.bones.handR.getWorldPosition(new api.THREE.Vector3()).toArray() });
        }
        assert.notEqual(r.snapshot().phase, 'ready'); traces.push(rows);
      } finally { r.close(); }
    }
    assert.deepEqual(traces[0], traces[1], `${scenario}: active layer and gameplay remain identical`);
  }
});

test('starting a walk no longer drops a mid-flourish weapon back to carry', async () => {
  const api = await production(), rows = [];
  for (const enabled of [false, true]) {
    const r = rig(api, 'shooter', enabled);
    try {
      forceFidget(r, 1); r.step(); const idle = frame(r);
      r.a.vel.set(0, 0, 2);
      // Native idle scheduling runs before the feet establish `moving` on the
      // first tick; it cancels a fidget on the following tick. The idle patch
      // also reads the actual incoming speed, so it cannot overlap that tick.
      r.a.pos.z += 2 / 60; r.step(); r.a.pos.z += 2 / 60; r.step(); const walking = frame(r);
      // Compare in root space: world translation is legitimate locomotion,
      // not a weapon-pose snap, and must not inflate the transition measure.
      const snap = distance(idle.weapon.position.map((v, i) => v - idle.root[i]),
        walking.weapon.position.map((v, i) => v - walking.root[i]));
      rows.push({ enabled, idle, walking, snap });
      assert.equal(r.ch.fidget, -1); assert.equal(r.ch.moving, true);
      if (enabled) { assert.equal(r.snapshot().reason, 'walk'); assert.ok(snap < .06); }
      else assert.ok(snap > .08, `native flourish abruptly returns at walk onset (${snap})`);
    } finally { r.close(); }
  }
  saveEvidence([{ stage: 'idle-to-walk', comparisons: rows }]);
  assert.ok(rows[1].snap < rows[0].snap * .5, `pose discontinuity improves (${rows[0].snap} -> ${rows[1].snap})`);
});

test('pause, nullable preview, reset, death, weapon changes and disposal are safe', async () => {
  const api = await production(), r = rig(api);
  try {
    forceFidget(r, 2); r.step(); const before = r.snapshot(), clocks = Array.from(r.ch.tr), pose = frame(r);
    for (let i = 0; i < 10; i++) r.visual(0);
    assert.deepEqual(r.snapshot(), before); assert.deepEqual(Array.from(r.ch.tr), clocks);
    assert.ok(geometryDistance(pose, frame(r)) < 1e-7, 'paused native posed geometry stays fixed');
    r.a.reset(); assert.equal(r.snapshot().reason, 'reset');
    r.a.grounded = true; r.step(); assert.equal(r.snapshot().phase, 'ready');
    r.a.setWeapon('dualies'); assert.equal(r.snapshot().reason, 'weapon-change');
    r.step(); assert.equal(r.ch.weaponKind, 'dualies');
    r.a.splat(null); assert.equal(r.snapshot().reason, 'death');
    r.a.reset(); r.ch.setVisible(true); r.a.grounded = true; r.step();
    r.ch.setDance('victory'); for (let i = 0; i < 60; i++) r.step();
    assert.equal(r.snapshot().reason, 'outside-match');
    assert.equal(r.snapshot().ownedResources, 0);
  } finally { r.close(); }
  r.ch.dispose(); r.ch.update(1 / 60, null); assert.equal(r.snapshot().disposed, true);
  const preview = new api.Character({ name: 'nullable native preview', weapon: 'shooter' });
  let disposalCount = 0; preview.mats.skin.addEventListener('dispose', () => { disposalCount++; });
  try { preview.update(0, null); preview.update(1 / 60, null);
    assert.equal(api.idleMotionSnapshot(preview).reason, 'outside-match');
    assert.ok(Array.from(preview.P).every(Number.isFinite));
  } finally { preview.dispose(); preview.dispose(); }
  assert.equal(disposalCount, 1, 'native character resources are disposed exactly once');
});

test('30/60/120Hz display clocks produce identical native idle-to-walk bones and posed geometry', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      for (let frameIndex = 0; frameIndex < hz * 3; frameIndex++) clock.advance(1 / hz, dt => {
        if (clock.ticks < 60) { r.a.vel.set(0, 0, 2); r.a.pos.z += 2 * dt; }
        else r.a.vel.set(0, 0, 0);
        r.step(dt);
        if (clock.ticks % 15 === 0) rows.push(frame(r));
      });
      assert.equal(clock.ticks, 180); traces.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('direct 30/60/120Hz Actor frames keep quiet carry finite and paused without claiming identical native springs', async () => {
  const api = await production();
  for (const hz of [30, 60, 120]) {
    const r = rig(api);
    try {
      r.ch.nextFidget = 99;
      for (let i = 0; i < hz; i++) r.step(1 / hz);
      const output = frame(r); assert.equal(output.diagnostic.phase, 'ready');
      assert.ok(output.meshes.some(m => m.skinned && m.vertices.length > 0));
      assert.ok(output.nativeIK.every(Number.isFinite)); assert.ok(output.gripDistances[0] < .025);
      const clocks = Array.from(r.ch.tr); r.visual(0);
      assert.deepEqual(Array.from(r.ch.tr), clocks); assert.ok(geometryDistance(output, frame(r)) < 1e-7);
      saveEvidence([{ stage: 'direct-frame-rate', hz, output }]);
    } finally { r.close(); }
  }
});
