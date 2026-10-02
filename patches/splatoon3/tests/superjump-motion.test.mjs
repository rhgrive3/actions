import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installSuperjumpMotion as secondRealmInstall, superjumpMotionSnapshot as secondRealmSnapshot } from '../runtime/superjump-motion.mjs';

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
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { installSuperjumpMotion, superjumpMotionSnapshot } from './patches/splatoon3/runtime/superjump-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'superjump-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installSuperjumpMotion(api, profile);
  const methods = [api.Character.prototype.update, api.Character.prototype._updateSquid, api.Actor.prototype._finishFrame];
  api.installSuperjumpMotion(api, profile); secondRealmInstall(api, profile);
  assert.deepEqual([api.Character.prototype.update, api.Character.prototype._updateSquid, api.Actor.prototype._finishFrame], methods);
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
function rig(api, enabled = true, weapon = 'shooter') {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'superjump native regression', weapon,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3SuperjumpMotionEnabled = enabled;
  G.scene.add(ch.root); G.actors.push(a); a.grounded = true;
  G.physics.groundProbe(0, 0, 0, .4, .35, .24, a.ground, false);
  const step = (dt = 1 / 60) => { G.time += dt; a.intent.squid = a.form === 'squid'; a.update(dt); ch.root.updateMatrixWorld(true); };
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  for (let i = 0; i < 90; i++) step();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  assert.equal(a.grounded, true);
  const direction = () => new THREE.Vector3(0, 1, 0).applyQuaternion(ch.squid.pivot.getWorldQuaternion(new THREE.Quaternion()));
  return { api, a, ch, step, visual, direction, snapshot: () => api.superjumpMotionSnapshot(ch),
    close() { G.actors = G.actors.filter(x => x !== a); G.scene.remove(ch.root); ch.dispose(); } };
}
function gameplay(r) {
  const a = r.a, runner = a.weaponRunner, sj = a.superJumpState;
  return { pos: a.pos.toArray(), vel: a.vel.toArray(), root: r.ch.root.position.toArray(),
    yaw: a.yaw, yawVel: a.yawVel, form: a.form, grounded: a.grounded, hp: a.hp, ink: a.ink,
    special: a.special, invuln: a.invuln, smoothY: a.smoothY, smoothYV: a.smoothYV,
    landT: a.landT, airTime: a.airTime, kidT: a.kidT,
    superjump: sj ? { phase: sj.phase, t: sj.t, dur: sj.dur, marker: sj.marker,
      from: sj.from.toArray(), to: sj.to.toArray() } : null,
    intent: { ...a.intent, move: a.intent.move.toArray() },
    runner: Object.fromEntries(['charge', 'chargeT', 'cooldown', 'lockT', 'rolling', 'aimingSub',
      'subFuse', 'fuse', 'streaming', 'slosh', 's3Turret'].map(key => [key, runner[key]])) };
}
function advanceToFlight(r, minimumAge = 0) {
  for (let i = 0; i < 300; i++) {
    if (r.a.superJumpState?.phase === 'flight' && r.a.superJumpState.t >= minimumAge) return;
    assert.ok(r.a.superJumpState, 'native Super Jump must still be active'); r.step();
  }
  assert.fail('native Super Jump did not reach the requested flight sample');
}
function meshSamples(r, mesh) {
  const { THREE } = r.api, g = mesh.geometry, rows = [], seen = new Set();
  assert.ok(g.index?.count > 0, 'actual drawn indexed geometry'); r.ch.skeleton.update();
  for (let i = 0; i < g.index.count; i += Math.max(1, Math.floor(g.index.count / 24))) {
    const index = g.index.getX(i); if (seen.has(index)) continue; seen.add(index);
    rows.push(mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
  }
  return rows;
}
function posed(r) {
  const { THREE } = r.api, ch = r.ch;
  ch.root.updateMatrixWorld(true); ch.skeleton.update();
  const skin = ch.lodSets[ch.lod.tier].list.find(mesh => mesh.isSkinnedMesh && mesh.userData.iwMat === 'skin');
  assert.ok(skin, 'native visible LOD skin, not a stand-in rig');
  return { phase: r.snapshot().phase, mantle: r.direction().toArray(),
    squidQuaternion: ch.squid.pivot.quaternion.toArray(), squidScale: ch.squid.pivot.scale.toArray(),
    squidVertices: meshSamples(r, ch.squid.body), kidVertices: meshSamples(r, skin),
    pose: Array.from(ch.P), nativeIK: Array.from(ch.ikErr),
    bones: Object.fromEntries(['hips', 'head', 'handL', 'handR', 'footL', 'footR'].map(name =>
      [name, ch.bones[name].getWorldPosition(new THREE.Vector3()).toArray()])),
    weapon: { matrix: ch.weapon.off.matrixWorld.toArray(), muzzle: ch.getMuzzle(new THREE.Vector3()).toArray() },
    shader: { wiggle: ch.u.uWig.value.toArray(), time: ch.u.uTime.value },
    kidVisible: ch.kid.visible, squidVisible: ch.squidRoot.visible };
}
const evidence = [];
function svg(r, label) {
  const mesh = r.ch.squid.body, g = mesh.geometry, V = r.api.THREE.Vector3, root = r.ch.root.position;
  r.ch.root.updateMatrixWorld(true); const p = new V(), points = [];
  for (let i = 0; i < g.attributes.position.count; i++) {
    mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).sub(root);
    points.push([200 + 230 * p.z, 220 - 230 * p.y]);
  }
  const polygons = [];
  for (let i = 0; i < g.index.count; i += 3) polygons.push(`<polygon points="${[0, 1, 2].map(k =>
    points[g.index.getX(i + k)].map(x => x.toFixed(2)).join(',')).join(' ')}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="350" viewBox="0 0 400 350"><rect width="400" height="350" fill="#fafafa"/><text x="12" y="22">${label}: native indexed squid, side view</text><g fill="#ff8a1444" stroke="#c0661833" stroke-width=".2">${polygons.join('')}</g></svg>`;
}
function saveEvidence(files) {
  const directory = process.env.INKWAVE_SUPERJUMP_EVIDENCE_DIR;
  if (!directory) return;
  const resolved = fs.realpathSync(directory); assert.ok(resolved.startsWith('/mnt/workspace/'));
  const receipts = [];
  const receiptPath = path.join(resolved, 'pose-evidence-hashes.json');
  const previous = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : [];
  for (const [name, bytes] of Object.entries(files)) {
    const destination = path.join(resolved, name), next = destination + '.next';
    fs.writeFileSync(next, bytes); fs.renameSync(next, destination);
    receipts.push({ path: destination, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const merged = new Map(previous.map(row => [row.path, row])); for (const row of receipts) merged.set(row.path, row);
  fs.writeFileSync(receiptPath + '.next', JSON.stringify([...merged.values()], null, 2) + '\n');
  fs.renameSync(receiptPath + '.next', receiptPath);
}

test('native short and vertical Super Jumps follow flight velocity instead of dry-hop tilt', async () => {
  const api = await production(), files = {};
  for (const distance of [0, .5, 1, 16]) {
    const rows = [];
    for (const enabled of [false, true]) {
      api.G.time = 0; const r = rig(api, enabled);
      try {
        assert.equal(r.a.superJump(new api.THREE.Vector3(0, 0, distance)), true);
        advanceToFlight(r);
        if (enabled) assert.equal(r.snapshot().phase, 'takeoff');
        for (let i = 0; i < 24; i++) r.step();
        assert.equal(r.a.superJumpState.phase, 'flight'); assert.equal(r.a.form, 'squid');
        const alignment = r.direction().dot(r.a.vel.clone().normalize());
        if (enabled) assert.ok(alignment > .999999, `mantle must follow flight at distance ${distance}: ${alignment}`);
        else if (distance <= 1) assert.ok(alignment < .97, 'counterfactual reproduces the low-speed dry-hop divergence');
        rows.push({ enabled, alignment, gameplay: gameplay(r), posed: posed(r) });
        if (distance === .5) files[enabled ? 'after-short-flight.svg' : 'before-short-flight.svg'] = svg(r, enabled ? 'After' : 'Before');
        advanceToFlight(r, r.a.superJumpState.dur * .76);
        assert.equal(r.a.form, 'squid'); assert.ok(r.a.vel.y < 0, 'actual native descending trajectory');
        const downAlignment = r.direction().dot(r.a.vel.clone().normalize());
        if (enabled) assert.ok(downAlignment > .999999, 'descending mantle follows actual native velocity');
        else if (distance <= 1) assert.ok(downAlignment < 0, 'counterfactual dry-hop mantle points against descent');
        rows[rows.length - 1].descent = { alignment: downAlignment, gameplay: gameplay(r), posed: posed(r) };
        if (distance === .5) files[enabled ? 'after-short-descent.svg' : 'before-short-descent.svg'] = svg(r, enabled ? 'After' : 'Before');
        assert.equal(JSON.stringify(secondRealmSnapshot(r.ch)), JSON.stringify(r.snapshot()), 'duplicate realm reads the same state');
      } finally { r.close(); }
    }
    assert.deepEqual(rows[0].gameplay, rows[1].gameplay, 'flight presentation never changes gameplay or camera root');
    assert.deepEqual(rows[0].posed.pose, rows[1].posed.pose, 'kid pose channels remain native');
    assert.deepEqual(rows[0].descent.gameplay, rows[1].descent.gameplay, 'descent physics/resources remain identical');
    assert.notDeepEqual(rows[0].posed.squidVertices, rows[1].posed.squidVertices, 'drawn indexed squid vertices change');
    evidence.push({ distance, comparison: rows });
  }
  files['native-before-after.json'] = JSON.stringify(evidence, null, 2) + '\n'; saveEvidence(files);
});

test('actual native collision completes charge, takeoff, flight, descent and touchdown without a parallel clock', async () => {
  const api = await production(), comparisons = [];
  for (const enabled of [false, true]) {
    api.G.time = 0; const r = rig(api, enabled), rows = [], phases = new Set(), y = [];
    try {
      r.a.superJump(new api.THREE.Vector3(0, 0, .5));
      for (let i = 0; i < 290; i++) {
        r.step(); const state = r.snapshot(); phases.add(state.phase);
        rows.push(gameplay(r));
        if (state.phase === 'touchdown') { y.push(r.ch.bones.hips.position.y); assert.equal(r.ch.grounded, true); }
        if (enabled && i % 15 === 0) evidence.push({ tick: i, gameplay: gameplay(r), posed: posed(r) });
      }
      assert.equal(r.a.superJumpState, null); assert.equal(r.a.grounded, true); assert.equal(r.a.pos.y, 0);
      assert.equal(r.snapshot().phase, null); assert.equal(r.snapshot().applied, false);
      if (enabled) {
        for (const phase of ['charge', 'takeoff', 'flight', 'descent', 'touchdown']) assert.ok(phases.has(phase), phase);
        assert.ok(Math.max(...y) - Math.min(...y) > .005, 'native landing bones absorb and recover');
      }
      const error = r.ch.weapon.off.localToWorld(r.ch.weapon.def.handR.pos.clone())
        .distanceTo(r.ch.bones.handR.getWorldPosition(new api.THREE.Vector3()));
      assert.ok(error < .025, 'native right-hand weapon grip recovers');
      assert.ok(r.ch.ikErr[1] < .0005, 'native right-arm two-bone solver remains valid');
      assert.equal(r.ch.feet.every(foot => foot.planted), true);
      comparisons.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(comparisons[0], comparisons[1], 'all native trajectory/resource/input/runner samples are identical');
  saveEvidence({ 'native-sequence.json': JSON.stringify(evidence, null, 2) + '\n' });
});

test('30/60/120Hz and irregular renders give identical native physics and full posed output per 60Hz tick', async () => {
  const api = await production(), traces = [];
  for (const intervals of [Array(150).fill(1 / 30), Array(300).fill(1 / 60), Array(600).fill(1 / 120),
    Array.from({ length: 150 }, (_, i) => i % 2 ? 1 / 20 : 1 / 60)]) {
    api.G.time = 0; const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      r.a.superJump(new api.THREE.Vector3(0, 0, .5));
      for (const interval of intervals) clock.advance(interval, dt => {
        r.step(dt); rows.push({ gameplay: gameplay(r), posed: posed(r), snapshot: r.snapshot() });
      });
      assert.equal(clock.ticks, 300); traces.push(rows);
    } finally { r.close(); }
  }
  for (let i = 1; i < traces.length; i++) assert.deepEqual(traces[0], traces[i]);
});

test('zero-dt and pause freeze this layer; visual reads accept nullable preview and never write native flight state', async () => {
  const api = await production(), r = rig(api);
  try {
    r.ch.update(0, null); assert.equal(r.snapshot().phase, null);
    r.a.superJump(new api.THREE.Vector3(0, 0, .5));
    advanceToFlight(r, .4);
    const sj = r.a.superJumpState, runner = r.a.weaponRunner;
    Object.freeze(sj); Object.freeze(r.a.vel);
    const native = gameplay(r), before = r.snapshot(), q = r.ch.squid.pivot.quaternion.toArray(), scale = r.ch.squid.pivot.scale.toArray();
    for (let i = 0; i < 12; i++) r.ch.update(0, r.a.anim);
    assert.deepEqual(gameplay(r), native); assert.equal(r.a.superJumpState, sj); assert.equal(r.a.weaponRunner, runner);
    assert.deepEqual(r.snapshot(), before); assert.deepEqual(r.ch.squid.pivot.quaternion.toArray(), q);
    assert.deepEqual(r.ch.squid.pivot.scale.toArray(), scale);
    const clock = new api.FixedClock(); for (let i = 0; i < 30; i++) clock.advance(1 / 60, () => {});
    assert.deepEqual(r.snapshot(), before); assert.deepEqual(gameplay(r), native);
  } finally { r.close(); }
});

test('interruption, hidden return, repeated flights and cleanup cannot strand or accumulate a squid offset', async () => {
  const api = await production();
  for (const ending of ['reset', 'death', 'special', 'weapon', 'form', 'sub', 'fire', 'action', 'hidden', 'dispose']) {
    const r = rig(api);
    try {
      r.a.superJump(new api.THREE.Vector3(0, 0, .5));
      advanceToFlight(r, .4);
      assert.equal(r.snapshot().applied, true);
      if (ending === 'reset') r.a.reset();
      if (ending === 'death') r.a.splat(null);
      if (ending === 'special') { r.a.specialActive = { id: 'rush' }; r.visual(); }
      if (ending === 'weapon') r.a.setWeapon('dualies');
      if (ending === 'form') { r.a.superJumpState = null; r.a.form = 'kid'; r.visual(); }
      if (ending === 'sub') { r.a.anim.subAim = true; r.ch.update(1 / 60, r.a.anim); }
      if (ending === 'fire') { r.a.anim.firing = true; r.ch.update(1 / 60, r.a.anim); }
      if (ending === 'action') r.ch.trigger('movement_cancel');
      if (ending === 'hidden') { r.ch.setVisible(false); r.a.superJumpState = null; r.a.form = 'kid'; r.visual(); }
      if (ending === 'dispose') { r.ch.dispose(); r.ch.dispose(); r.ch.update(1 / 60, r.a.anim); }
      assert.equal(r.snapshot().applied, false, ending); assert.equal(r.snapshot().phase, null, ending);
      assert.equal(r.snapshot().resources, 0);
      if (!['death', 'special', 'dispose', 'sub', 'fire'].includes(ending)) {
        r.a.superJumpState = null; r.a.form = 'squid'; r.ch.setVisible(true); r.visual();
        assert.ok(r.ch.squid.pivot.quaternion.angleTo(r.ch.sqQuat) < 1e-7, 'native squid orientation restored');
      }
    } finally { r.close(); }
  }
  const r = rig(api);
  try {
    const meshes = r.ch.root.getObjectsByProperty('isMesh', true).length;
    for (let i = 0; i < 8; i++) {
      r.a.reset(); r.a.grounded = true; r.a.superJump(new api.THREE.Vector3(0, 0, .5));
      for (let tick = 0; tick < 290; tick++) r.step();
      assert.equal(r.snapshot().phase, null); assert.equal(r.snapshot().applied, false);
      assert.equal(r.ch.root.getObjectsByProperty('isMesh', true).length, meshes);
    }
  } finally { r.close(); }
});

test('direct variable visual intervals use the frozen native flight sample and preserve hidden active return', async () => {
  const api = await production(), r = rig(api);
  try {
    r.a.superJump(new api.THREE.Vector3(0, 0, .5)); advanceToFlight(r, .4);
    Object.freeze(r.a.superJumpState); Object.freeze(r.a.vel);
    const original = gameplay(r), progress = r.snapshot().progress;
    for (const dt of [1 / 30, 1 / 60, 1 / 120, .01, .04, 0]) {
      r.ch.update(dt, r.a.anim); r.ch.root.updateMatrixWorld(true);
      assert.equal(r.snapshot().progress, progress, 'visual updates never advance the native flight clock');
      assert.ok(r.direction().dot(r.a.vel.clone().normalize()) > .999999);
      assert.deepEqual(gameplay(r), original);
    }
    r.ch.setVisible(false); r.ch.update(1 / 30, r.a.anim);
    assert.equal(r.snapshot().applied, false);
    r.ch.setVisible(true); r.ch.update(1 / 120, r.a.anim); r.ch.root.updateMatrixWorld(true);
    assert.ok(r.direction().dot(r.a.vel.clone().normalize()) > .999999);
    assert.equal(r.snapshot().progress, progress); assert.deepEqual(gameplay(r), original);
  } finally { r.close(); }
});


test('action interruption blocks the same live Super Jump across subsequent production frames', async () => {
  const api = await production();
  for (const ending of ['weapon', 'action', 'sub', 'fire', 'dance']) {
    const r = rig(api);
    try {
      r.a.superJump(new api.THREE.Vector3(0, 0, .5)); advanceToFlight(r, .4);
      const native = gameplay(r);
      if (ending === 'weapon') r.a.setWeapon('dualies');
      if (ending === 'action') r.ch.trigger('movement_cancel');
      if (ending === 'dance') r.ch.setDance('victory');
      r.a.anim.subAim = ending === 'sub'; r.a.anim.firing = ending === 'fire';
      r.ch.update(1 / 60, r.a.anim);
      r.a.anim.subAim = false; r.a.anim.firing = false; r.ch.setDance(null);
      for (let i = 0; i < 3; i++) r.visual();
      assert.equal(r.snapshot().phase, null, ending + ' cannot resume an interrupted live token');
      assert.equal(r.snapshot().applied, false);
      assert.ok(r.ch.squid.pivot.quaternion.angleTo(r.ch.sqQuat) < 1e-7, 'actual native orientation restored');
      assert.equal(r.a.superJumpState.t, native.superjump.t, 'visual cancellation does not advance gameplay');
      assert.deepEqual(r.a.pos.toArray(), native.pos);
      // A genuinely new action token can acquire the overlay again.
      r.a.superJumpState = null; r.a.superJump(new api.THREE.Vector3(0, 0, 1)); advanceToFlight(r, .4);
      assert.equal(r.snapshot().applied, true); assert.ok(r.direction().dot(r.a.vel.clone().normalize()) > .999999);
    } finally { r.close(); }
  }
});
