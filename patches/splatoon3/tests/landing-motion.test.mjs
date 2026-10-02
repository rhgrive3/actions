import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installLandingMotion as duplicateInstall, landingMotionSnapshot as duplicateSnapshot } from '../runtime/landing-motion.mjs';

// The production installer, all existing motion hooks, native Actor/Runner,
// THREE and complete indexed/skinned Character execute in ONE module realm.
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
    export { installLandingMotion, landingMotionSnapshot } from './patches/splatoon3/runtime/landing-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'landing-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installLandingMotion(api, profile);
  const hooks = ['_poseLand', '_updateStates', 'trigger', 'setWeapon', 'dispose'].map(k => api.Character.prototype[k]);
  api.installLandingMotion(api, profile); duplicateInstall(api, profile);
  assert.deepEqual(hooks, ['_poseLand', '_updateStates', 'trigger', 'setWeapon', 'dispose'].map(k => api.Character.prototype[k]));
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(k => [k, () => {}]));
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, kind = 'shooter', enabled = true) {
  const { Actor, Character, G } = api;
  const a = new Actor({ team: 0, name: 'landing native regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3LandingMotionEnabled = enabled;
  G.scene.add(ch.root); G.actors.push(a); a.grounded = a.ground.hit = true;
  // This lane measures animation/contact/IK. World collision and projectile
  // impact are fixture stubs, not claimed as a native physics or Switch test.
  const step = (dt = 1 / 60, input = {}) => {
    a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    a.weaponRunner.update(dt, input); a._finishFrame(dt);
    ch.root.updateMatrixWorld(true); ch.skeleton.update();
  };
  for (let i = 0; i < 90; i++) step();
  return { api, a, ch, step, close() { G.actors = G.actors.filter(x => x !== a); ch.dispose(); } };
}
function land(r, speed = 15.5) {
  r.a.vel.y = -speed; r.a._onLand(false); r.a.vel.y = 0;
}
function vec(r, bone) { return r.ch.bones[bone].getWorldPosition(new r.api.THREE.Vector3()); }
function knee(r, side) {
  const hip = vec(r, 'thigh' + side), shin = vec(r, 'shin' + side), foot = vec(r, 'foot' + side);
  return Math.PI - shin.clone().sub(hip).angleTo(shin.clone().sub(foot));
}
function contactError(r, j) {
  const { THREE, CHARACTER_FOOT_METRICS: M } = r.api, ch = r.ch, f = ch.feet[j];
  let pitch = f.pitch;
  if (!ch.moving && j === (ch.shiftS > 0 ? 1 : 0)) pitch += .1 * Math.abs(ch.shiftS) * (1 - ch.gaitW);
  const ay = M.ANKLE_H * Math.cos(pitch) + (pitch >= 0 ? M.BALL_Z : -M.HEEL_Z) * Math.sin(pitch);
  const az = pitch >= 0 ? M.BALL_Z + M.ANKLE_H * Math.sin(pitch) - M.BALL_Z * Math.cos(pitch)
    : -M.HEEL_Z + M.ANKLE_H * Math.sin(pitch) + M.HEEL_Z * Math.cos(pitch);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.cn);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.cyaw));
  return vec(r, j ? 'footR' : 'footL').distanceTo(new THREE.Vector3(0, ay, az).applyQuaternion(q).add(f.cw));
}
function grip(r, side = 'R') {
  const w = side === 'L' && r.ch.dual ? r.ch.weapon.left : r.ch.weapon;
  const h = side === 'L' ? w.def.handL : w.def.handR;
  return w.off.localToWorld(h.pos.clone()).distanceTo(vec(r, 'hand' + side));
}
function gameplay(r) {
  const a = r.a;
  return { pos: a.pos.toArray(), vel: a.vel.toArray(), root: r.ch.root.position.toArray(),
    hp: a.hp, ink: a.ink, form: a.form, grounded: a.grounded, landT: a.landT,
    hardLand: a.hardLand, runner: Object.fromEntries(['cooldown', 'charge', 'slosh', 'flick', 'dodgeT', 'lockT',
      'aimingSub', 'subFuse', 'firing'].map(k => [k, a.weaponRunner[k]])), intent: { fire: a.intent.fire, sub: a.intent.sub } };
}
function visible(mesh) { for (let p = mesh; p; p = p.parent) if (!p.visible) return false; return true; }
function geometry(r, complete = false) {
  const result = [], V = r.api.THREE.Vector3;
  r.ch.root.traverse(mesh => {
    let weapon = false;
    for (let p = mesh; p; p = p.parent) if (p === r.ch.weapon.pivot || p === r.ch.weapon.left?.pivot) weapon = true;
    if (!(mesh.isSkinnedMesh || (complete && weapon && mesh.isMesh)) || !visible(mesh) || !mesh.geometry.index) return;
    const g = mesh.geometry, index = Array.from(g.index.array), vertices = [];
    const used = complete ? Array.from({ length: g.attributes.position.count }, (_, i) => i)
      : [...new Set(index.filter((_, i) => i % 31 === 0))];
    for (const i of used) { const p = new V(); mesh.getVertexPosition(i, p); mesh.localToWorld(p); vertices.push(p.toArray()); }
    result.push({ name: mesh.name, role: weapon ? 'native-weapon' : 'native-skinned-body', indexedTriangles: index.length / 3, vertexIDs: used, vertices,
      ...(complete ? { index, color: mesh.material.color?.getHexString() || '888888' } : {}) });
  });
  return result;
}
function row(r, stage, complete = false) {
  return { stage, diagnostic: r.api.landingMotionSnapshot(r.ch), pose: Array.from(r.ch.P),
    nativeIK: Array.from(r.ch.ikErr), knee: ['L', 'R'].map(s => knee(r, s)),
    bones: Object.fromEntries(['hips', 'spine', 'chest', 'head', 'thighL', 'shinL', 'footL', 'thighR',
      'shinR', 'footR', 'handL', 'handR'].map(k => [k, { position: vec(r, k).toArray(), quaternion:
        r.ch.bones[k].getWorldQuaternion(new r.api.THREE.Quaternion()).toArray() }])),
    weapon: { position: r.ch.weapon.off.getWorldPosition(new r.api.THREE.Vector3()).toArray(),
      quaternion: r.ch.weapon.off.getWorldQuaternion(new r.api.THREE.Quaternion()).toArray(), gripR: grip(r) },
    drawnGeometry: geometry(r, complete), gameplay: gameplay(r) };
}
function save(rows) {
  const dest = process.env.INKWAVE_LANDING_TRACE_PATH;
  if (!dest) return;
  const folder = fs.realpathSync(path.dirname(dest));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(folder, path.basename(dest));
  const sha = name => createHash('sha256').update(fs.readFileSync(path.join(ROOT, name))).digest('hex');
  const body = { schema: 1, proof: 'native source CPU skinning of actual visible indexed geometry; GPU/browser verification belongs to parent',
    runtimeSHA256: sha('patches/splatoon3/runtime/landing-motion.mjs'), sourceSHA256: sha('inkwave-public/src/game/character.js'), rows };
  fs.writeFileSync(file + '.pending', JSON.stringify(body) + '\n'); fs.renameSync(file + '.pending', file);
}

test('normal/hard landing produces actual knee/ankle absorb and recovery with native contact and drawn geometry', async () => {
  const api = await production(), rows = [], complete = !!process.env.INKWAVE_LANDING_TRACE_PATH;
  for (const speed of [8.5, 15.5]) for (const aimed of [false, true]) {
    const baseline = rig(api, 'shooter', false), patched = rig(api);
    try {
      for (let i = 0; i < 30; i++) { baseline.step(1 / 60, { fire: aimed }); patched.step(1 / 60, { fire: aimed }); }
      const atRest = ['L', 'R'].map(s => knee(patched, s));
      rows.push(row(baseline, `before-${speed}-${aimed}-rest`, complete), row(patched, `after-${speed}-${aimed}-rest`, complete));
      land(baseline, speed); land(patched, speed);
      let bent = 0, maxContact = 0, peakDelta = 0;
      for (let frame = 1; frame <= 45; frame++) {
        baseline.step(1 / 60, { fire: aimed }); patched.step(1 / 60, { fire: aimed });
        assert.deepEqual(gameplay(patched), gameplay(baseline), 'landing layer never writes gameplay/root/runner state');
        for (const [j, f] of patched.ch.feet.entries()) {
          maxContact = Math.max(maxContact, contactError(patched, j));
          assert.ok(patched.ch.ikErr[j + 2] < 1e-6, 'native two-bone leg IK reaches the drawn ankle');
          bent = Math.max(bent, knee(patched, j ? 'R' : 'L') - atRest[j]);
        }
        if ([3, 9, 24, 45].includes(frame)) {
          rows.push(row(baseline, `before-${speed}-${aimed}-${frame}`, complete), row(patched, `after-${speed}-${aimed}-${frame}`, complete));
          const a = geometry(baseline), b = geometry(patched);
          assert.ok(a.length && b.length && b.every(x => x.indexedTriangles > 0));
          const delta = a.flatMap((m, j) => m.vertices.map((v, k) => Math.hypot(...v.map((x, n) => x - b[j].vertices[k][n]))));
          peakDelta = Math.max(peakDelta, ...delta);
        }
      }
      assert.ok(bent > .12, 'drawn leg bends on impact'); assert.ok(maxContact < .001, `drawn ankle retains native heel/toe contact (${maxContact})`);
      assert.ok(peakDelta > .004, 'the correction reaches indexed drawn body vertices');
      assert.equal(api.landingMotionSnapshot(patched.ch).phase, null, 'landing relinquishes the pose to ordinary grounded motion');
      assert.ok(Math.max(...['L', 'R'].map((s, j) => Math.abs(knee(patched, s) - atRest[j]))) < .16, 'knees recover after landing');
      if (aimed) { assert.ok(grip(patched) < .025); assert.ok(grip(patched, 'L') < .025); }
    } finally { baseline.close(); patched.close(); }
  }
  save(rows);
});

test('aimed landing keeps weapon/action channels and genuine native arm IK', async () => {
  const api = await production(), C = api.CHARACTER_CHANNELS;
  for (const kind of ['shooter', 'dualies', 'charger', 'splatling']) {
    const r = rig(api, kind);
    try {
      for (let i = 0; i < 45; i++) r.step(1 / 60, { fire: true });
      land(r); r.step(1 / 60, { fire: true });
      const before = Float32Array.from(r.ch.P); r.ch._poseLand(r.ch.P, .055);
      const changed = new Set([C.HIPS_P + 1, C.HIPS_P + 2, C.HIPS, C.SPINE, C.CHEST, C.KNEEL, C.KNEER]);
      for (let i = 0; i < before.length; i++) if (!changed.has(i)) assert.equal(r.ch.P[i], before[i], 'only landing-owned lower body/torso channels change');
      for (let i = 0; i < 24; i++) { r.step(1 / 60, { fire: true }); assert.ok(grip(r) < .025); }
      assert.ok(r.ch.ikErr[0] < .0005, 'actual native right arm reaches the weapon grip');
      if (r.ch.dual) { assert.ok(grip(r, 'L') < .025); assert.ok(r.ch.ikErr[1] < .0005); }
    } finally { r.close(); }
  }
});

test('reset/death/form/sub/weapon/action interruption cancels only landing and requires a fresh land event', async () => {
  const api = await production(), T = api.CHARACTER_TIMERS;
  for (const action of ['reset', 'death', 'form', 'sub', 'weapon', 'dodge', 'throw', 'spawn', 'leap', 'slam', 'jump', 'special', 'superjump', 'hidden']) {
    const r = rig(api);
    try {
      land(r); r.step(); assert.ok(api.landingMotionSnapshot(r.ch).compression > 0);
      const timer = r.ch.tr[T.T_LAND];
      if (action === 'reset') r.a.reset();
      if (action === 'death') r.a.splat(null);
      if (action === 'form') r.a.form = 'squid';
      if (action === 'weapon') r.a.setWeapon('dualies');
      if (action === 'special') r.a.specialActive = { id: 'ultrashot', t: 0 };
      if (action === 'superjump') r.a.superJumpState = { phase: 'charge', t: 0 };
      if (action === 'hidden') r.ch.root.visible = false;
      if (['dodge', 'throw', 'spawn', 'leap', 'slam', 'jump'].includes(action)) r.ch.trigger(action);
      r.step(1 / 60, { sub: action === 'sub' });
      assert.equal(api.landingMotionSnapshot(r.ch).phase, null, action);
      assert.ok(Math.abs(r.ch.tr[T.T_LAND] - timer - 1 / 60) < 1e-6, 'layer never rewrites native landing clock');
      if (action === 'hidden') { for (let i = 0; i < 60; i++) r.step(); r.ch.root.visible = true; r.step(); }
      else { if (action === 'death') r.a.reset(); r.a.form = 'kid'; r.a.alive = true;
        r.a.specialActive = r.a.superJumpState = null; r.a.grounded = true; r.ch.setVisible(true); }
      r.step(); assert.equal(api.landingMotionSnapshot(r.ch).phase, null, 'interrupted landing cannot replay');
      for (let i = 0; i < 120; i++) r.step();
      land(r); r.step(); assert.ok(api.landingMotionSnapshot(r.ch).compression > 0, 'fresh landing can absorb after ' + action);
    } finally { const ch = r.ch; r.close(); assert.equal(api.landingMotionSnapshot(ch), null, 'no retained resources after native dispose'); }
  }
});

test('30/60/120Hz rendering yields identical native poses/geometry at fixed gameplay ticks; dt0 preserves landing age', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      land(r);
      for (let frame = 0; frame < hz / 2; frame++) clock.advance(1 / hz, dt => { r.step(dt); rows.push(row(r, rows.length)); });
      assert.equal(clock.ticks, 30); traces.push(rows);
      const age = r.ch.tr[api.CHARACTER_TIMERS.T_LAND], snapshot = api.landingMotionSnapshot(r.ch);
      for (let i = 0; i < 10; i++) r.step(0);
      assert.equal(r.ch.tr[api.CHARACTER_TIMERS.T_LAND], age); assert.deepEqual(api.landingMotionSnapshot(r.ch), snapshot);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('nullable standalone preview, pause and duplicate realm snapshot are safe', async () => {
  const api = await production();
  const ch = new api.Character({ name: 'landing preview', weapon: 'shooter', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  try {
    ch.onEvent = null; assert.equal(ch._owner(), null);
    for (let i = 0; i < 90; i++) ch.update(1 / 60, null);
    ch.trigger('land', 15.5); ch.update(1 / 60, null);
    const a = api.landingMotionSnapshot(ch); assert.ok(a.compression > 0);
    assert.deepEqual(duplicateSnapshot(ch), a);
    for (let i = 0; i < 10; i++) ch.update(0, null);
    assert.deepEqual(api.landingMotionSnapshot(ch), a);
  } finally { ch.dispose(); }
});

test('actual native floor collision lands and recovers with identical actor physics when the landing patch is enabled', async () => {
  const api = await production(), { G, THREE, Physics } = api, V = THREE.Vector3;
  const previous = { physics: G.physics, level: G.level };
  const center = new V(0, -.1, 0), half = new V(100, .1, 100);
  const floor = { id: 0, solid: true, center, half, axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  const level = { blocks: [floor], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0, spawnPads: [new V(1000, 0, 1000), new V(-1000, 0, -1000)], spawnBarrier: 1,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  const traces = [];
  try {
    G.level = level; G.physics = new Physics(level);
    for (const enabled of [false, true]) {
      const r = rig(api, 'shooter', enabled), trace = [];
      try {
        r.a.pos.set(0, 3, 0); r.a.vel.set(0, -8, 0); r.a.grounded = false;
        let impacted = false, bent = false;
        for (let i = 0; i < 90; i++) {
          G.time += 1 / 60; r.a.update(1 / 60); r.ch.root.updateMatrixWorld(true); r.ch.skeleton.update();
          impacted ||= r.a.grounded;
          if (enabled && api.landingMotionSnapshot(r.ch)?.compression > .1) {
            bent = true; assert.ok(r.ch.ikErr[2] < 1e-6 && r.ch.ikErr[3] < 1e-6);
          }
          trace.push(gameplay(r));
        }
        assert.ok(impacted, 'actual collideBody/groundProbe routes through Actor._onLand');
        assert.equal(r.a.pos.y, 0); assert.equal(r.a.vel.y, 0);
        if (enabled) { assert.ok(bent); assert.equal(api.landingMotionSnapshot(r.ch).phase, null); }
        traces.push(trace);
      } finally { r.close(); }
    }
    assert.deepEqual(traces[1], traces[0], 'animation patch cannot alter native fall/contact/gameplay trajectory');
  } finally { G.physics = previous.physics; G.level = previous.level; }
});
