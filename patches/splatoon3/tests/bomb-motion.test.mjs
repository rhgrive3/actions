import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource, replaceOnce } from '../adapter.mjs';

// Production installs once in one VM, then the owned proposed installer uses
// that same module realm. No second copy of an installer's WeakSet is involved.
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
    const raw = fs.readFileSync(file, 'utf8');
    const relative = path.relative(SRC, file);
    let source = file.startsWith(SRC + path.sep) ? adaptSource(relative, raw) : raw;
    // Exercise the exact proposed shared adapter connections without writing
    // the parent-owned adapter or production installer in this component lane.
    if (relative === 'src/game/character.js' && !source.includes('export const CHARACTER_BOMB_POSE'))
      source += '\nexport const CHARACTER_BOMB_POSE = Object.freeze({ throw: Character.prototype._poseThrow, apply: Character.prototype._applyPose });\n';
    if (relative === 'src/game/weapons.js' && !source.includes('bombReleasePosition(a, pos)')) {
      source = replaceOnce(source, 'const pos = _v.copy(a.pos); pos.y += 1.35;',
        'const pos = _v.copy(a.pos); pos.y += 1.35; bombReleasePosition(a, pos);', 'bomb release origin');
      source = replaceOnce(source, 'const p = _v.copy(a.pos); p.y += 1.35;',
        'const p = _v.copy(a.pos); p.y += 1.35; bombPreviewPosition(a, p);', 'bomb preview origin');
      source = "import { bombReleasePosition, bombPreviewPosition } from '../../patches/splatoon3/runtime/bomb-motion.mjs';\n" + source;
    }
    if (relative === 'src/game/weapons.js' && !source.includes('        vel.y -= SUB.bomb.gravity * dt;'))
      source = replaceOnce(source, '        vel.y -= 24 * dt;', '        vel.y -= SUB.bomb.gravity * dt;', 'bomb preview gravity');
    const module = new vm.SourceTextModule(source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { CHARACTER_BOMB_POSE } from './inkwave-public/src/game/character.js';
    export { installBombMotion, bombMotionSnapshot, bombReleasePosition, bombPreviewPosition } from './patches/splatoon3/runtime/bomb-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'bomb-test-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), CHARACTER_BOMB_POSE: entry.namespace.CHARACTER_BOMB_POSE };
  entry.namespace.installBombMotion(api, profile);
  // Applying the same installer twice must not stack pose or reset wrappers.
  const wrapper = api.Character.prototype._buildPose;
  entry.namespace.installBombMotion(api, profile);
  assert.equal(api.Character.prototype._buildPose, wrapper);
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; },
    segment: (_a, _b, hit) => { hit.hit = false; return hit; } };
  G.actors = []; G.time = 0;
  cached = { ...api, ...entry.namespace, profile }; return cached;
}
function rig(api, kind = 'shooter', enabled = true) {
  const { G, THREE, Actor, Character } = api;
  const a = new Actor({ team: 0, name: 'bomb motion regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.isLocal = true; a.grounded = true; a.ground.hit = true;
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3BombMotionEnabled = enabled;
  G.actors = [a]; G.scene.add(ch.root);
  const projectiles = new api.Projectiles(G.scene);
  const releaseEvents = [];
  const throwBomb = projectiles.throwBomb;
  projectiles.throwBomb = function (owner) {
    releaseEvents.push({ held: ch.bombHeld, visible: ch.bomb.group.visible,
      timer: ch.tr[api.CHARACTER_TIMERS.T_THROW], ink: a.ink });
    const result = throwBomb.call(this, owner);
    releaseEvents[releaseEvents.length - 1].position = this.bombs[this.bombs.length - 1].pos.toArray();
    return result;
  };
  // Keep native bomb creation/geometry/velocity; projectile hits and other
  // weapon volleys are separate tests. This fixture needs no renderer.
  for (const name of ['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster', 'fireSlosh', 'fireFlick'])
    projectiles[name] = () => {};
  function step(dt = 1 / 60, input = {}) {
    G.projectiles = projectiles;
    a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    G.time += dt; a.weaponRunner.update(dt, input); a._finishFrame(dt); ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
    assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite));
  }
  function grip(side) {
    const weapon = side === 'L' ? ch.weapon.left : ch.weapon;
    const bone = side === 'L' ? ch.bones.handL : ch.bones.handR;
    const point = side === 'L' ? weapon.def.handL : weapon.def.handR;
    return weapon.off.localToWorld(point.pos.clone()).distanceTo(bone.getWorldPosition(new THREE.Vector3()));
  }
  for (let i = 0; i < 90; i++) step();
  return { a, ch, step, grip, projectiles, releaseEvents,
    close() { for (const bomb of projectiles.bombs) G.scene.remove(bomb.mesh); G.scene.remove(projectiles.blobs); ch.dispose(); } };
}
function drawnVertices(group, THREE) {
  const result = [];
  group.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible) return;
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.index;
    assert.ok(index, 'native held/projectile geometry is measured from its indexed draw');
    const start = geometry.drawRange.start, end = Math.min(index.count, start + geometry.drawRange.count);
    for (let i = start; i < end; i++)
      result.push(new THREE.Vector3().fromBufferAttribute(position, index.getX(i)).applyMatrix4(mesh.matrixWorld));
  });
  return result;
}
function fields(object) {
  const result = {};
  for (const key of Object.keys(object)) {
    const value = object[key], type = typeof value;
    if (value === null || ['number', 'string', 'boolean', 'undefined'].includes(type)) result[key] = value;
    else if (ArrayBuffer.isView(value)) result[key] = Array.from(value);
    else if (value?.isVector2 || value?.isVector3 || value?.isVector4 || value?.isQuaternion || value?.isEuler || value?.isMatrix3 || value?.isMatrix4 || value?.isColor)
      result[key] = Array.from(value.toArray());
  }
  return result;
}
function preservedRig(r, api) {
  const nodes = [];
  r.ch.root.traverse(node => nodes.push({ name: node.name, position: Array.from(node.position.toArray()),
    rotation: Array.from(node.rotation.toArray()), quaternion: Array.from(node.quaternion.toArray()), scale: Array.from(node.scale.toArray()),
    matrix: Array.from(node.matrix.elements), world: Array.from(node.matrixWorld.elements), visible: node.visible, dirty: node.matrixWorldNeedsUpdate }));
  return { character: fields(r.ch), feet: Array.from(r.ch.feet, fields), nodes,
    weapon: fields(r.ch.weapon), leftWeapon: r.ch.weapon.left ? fields(r.ch.weapon.left) : null,
    actor: fields(r.a), anim: fields(r.a.anim), intent: fields(r.a.intent), runner: fields(r.a.weaponRunner),
    flow: fields(r.a.s3.flow), time: api.G.time, launches: r.projectiles.bombs.length };
}
function countCalls(ch) {
  const counts = {};
  for (const name of ['update', '_trackRoot', '_updateFeet', '_buildPose', '_animWeapon', '_updateHair', '_hairKick', '_updateTank', '_applyJiggle', '_applyFingers']) {
    const previous = ch[name]; counts[name] = 0;
    ch[name] = function (...args) { counts[name]++; return previous.apply(this, args); };
  }
  return counts;
}

test('real release creates its projectile immediately in whip posture, without a second cock', async () => {
  const api = await production(), C = api.CHARACTER_CHANNELS, T = api.CHARACTER_TIMERS;
  const measurements = [];
  for (const hz of [30, 60, 120]) for (const holdFrames of [1, hz / 2]) {
    const old = rig(api, 'shooter', false), r = rig(api);
    try {
      for (const x of [old, r]) {
        for (let i = 0; i < holdFrames; i++) x.step(1 / hz, { sub: true });
        assert.equal(x.projectiles.bombs.length, 0);
        x.step(1 / hz, { subReleased: true });
        assert.equal(x.projectiles.bombs.length, 1);
        assert.equal(x.a.ink, 30, 'actual 70 ink cost remains on the release tick');
        assert.ok(Math.abs(x.ch.tr[T.T_THROW] - 1 / hz) < 1e-8, 'native Float32 clock advances by exactly one rendered update');
      }
      assert.equal(r.releaseEvents[0].timer, 0, 'native release clock is not delayed');
      assert.equal(r.releaseEvents[0].held, false);
      assert.equal(r.releaseEvents[0].visible, false, 'held mesh disappears before actual projectile creation');
      assert.ok(r.ch.P[C.CHEST + 1] < old.ch.P[C.CHEST + 1] - .1,
        'actual torso has already unwound at release; native counterfactual still turns backward');
      assert.ok(r.ch.P[C.FARML] > -1, 'release arm is extended in the first rendered release pose');
      assert.ok(r.ch.P[C.IKL] < .001, 'support hand is released from the main weapon');
      const bomb = r.projectiles.bombs[0];
      assert.deepEqual(Array.from(bomb.pos.toArray()), Array.from(api.bombMotionSnapshot(r.ch).releasePosition));
      assert.ok(bomb.pos.distanceTo(r.a.pos.clone().add(new api.THREE.Vector3(0, 1.35, 0))) > .5,
        'the fixed native origin is corrected to the physical release prop, with no rendered/collider split');
      assert.ok(bomb.mesh.position.distanceTo(bomb.pos) < 1e-12);
      assert.ok(bomb.vel.distanceTo(r.projectiles.throwVelocity(r.a, api.SUB.bomb.throwSpeed, new api.THREE.Vector3())) < 1e-12);
      assert.equal(bomb.fuse, old.projectiles.bombs[0].fuse); assert.equal(bomb.fuse, -1);
      assert.equal(bomb.age, 0, 'no gameplay bomb lifetime elapses during release sampling');
      bomb.mesh.updateMatrixWorld(true);
      const projectileVertices = drawnVertices(bomb.mesh, api.THREE);
      assert.ok(projectileVertices.length > 100);
      const hand = r.ch.bones.handL.getWorldPosition(new api.THREE.Vector3());
      measurements.push({ hz, holdFrames, oldChestYaw: old.ch.P[C.CHEST + 1], chestYaw: r.ch.P[C.CHEST + 1],
        oldElbowPitch: old.ch.P[C.FARML], elbowPitch: r.ch.P[C.FARML],
        releaseHand: hand.toArray(), launchOrigin: bomb.pos.toArray(), oldLaunchOrigin: old.projectiles.bombs[0].pos.toArray(),
        nativeFixedOriginCorrection: bomb.pos.distanceTo(old.projectiles.bombs[0].pos), muzzle: r.ch.getMuzzle(new api.THREE.Vector3()).toArray(),
        nearestDrawnProjectileVertexToHand: Math.min(...projectileVertices.map(v => v.distanceTo(hand))),
        nativeArmReachErrors: Array.from(r.ch.ikErr.slice(0, 2)) });
      assert.ok(Math.min(...projectileVertices.map(v => v.distanceTo(hand))) < .22,
        'the real hand is at the actually drawn projectile body on the release frame');
      for (let i = 0; i < hz; i++) r.step(1 / hz);
      assert.equal(api.bombMotionSnapshot(r.ch).throwing, false);
      assert.equal(r.ch.bomb.group.visible, false);
      assert.ok(r.ch.P[C.UARML] > -1, 'throw overlay is gone; native shooter carry arm resumes');
      assert.ok(r.grip('R') < .03); assert.ok(Array.from(r.ch.ikErr.slice(0, 2)).every(error => error < .001), 'native arm reach is feasible');
    } finally { old.close(); r.close(); }
  }
  if (process.env.INKWAVE_BOMB_EVIDENCE) {
    const destination = fs.realpathSync(process.env.INKWAVE_BOMB_EVIDENCE);
    assert.ok(destination.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
    const file = path.join(destination, 'release-geometry.json'), pending = file + '.pending';
    fs.writeFileSync(pending, JSON.stringify(measurements, null, 2) + '\n'); fs.renameSync(pending, file);
  }
});

test('actual indexed held bomb stays attached and dualies pistol makes room until recovery ends', async () => {
  const api = await production(), C = api.CHARACTER_CHANNELS;
  const r = rig(api, 'dualies');
  try {
    for (let i = 0; i < 40; i++) r.step(1 / 60, { sub: true });
    assert.equal(r.ch.bombHeld, true); assert.equal(r.ch.bomb.group.visible, true);
    assert.equal(r.ch.bomb.group.parent, r.ch.bones.handL);
    assert.equal(r.ch.weapon.left.pivot.visible, false);
    const hand = r.ch.bones.handL.getWorldPosition(new api.THREE.Vector3());
    const vertices = drawnVertices(r.ch.bomb.group, api.THREE);
    assert.ok(vertices.length > 50); assert.ok(Math.min(...vertices.map(v => v.distanceTo(hand))) < .12);
    assert.ok(Array.from(r.ch.ikErr.slice(0, 2)).every(error => error < .001)); assert.ok(r.grip('R') < .03);
    r.step(1 / 60, { subReleased: true });
    for (let i = 0; i < 29; i++) {
      assert.equal(r.ch.weapon.left.pivot.visible, false, 'pistol cannot float at its anchor while the left arm follows through');
      r.step();
    }
    for (let i = 0; i < 70; i++) r.step();
    assert.equal(r.ch.weapon.left.pivot.visible, true); assert.ok(r.ch.P[C.IKL] > .999);
    assert.ok(r.grip('L') < .03); assert.ok(Array.from(r.ch.ikErr.slice(0, 2)).every(error => error < .001), 'native arm reach is feasible again');
  } finally { r.close(); }
});

test('empty release and cancel remove held copy without manufacturing a throw', async () => {
  const api = await production();
  for (const input of [{ subReleased: true }, {}]) {
    const r = rig(api, 'dualies');
    try {
      for (let i = 0; i < 30; i++) r.step(1 / 60, { sub: true });
      r.a.ink = 0; r.step(1 / 60, input);
      assert.equal(r.projectiles.bombs.length, 0); assert.equal(r.ch.bombHeld, false);
      assert.equal(r.ch.bomb.group.visible, false); assert.equal(api.bombMotionSnapshot(r.ch).throwing, false);
      for (let i = 0; i < 60; i++) r.step();
      assert.ok(r.grip('L') < .03);
    } finally { r.close(); }
  }
});

test('hidden, form, death, reset, disposal and weapon swap invalidate owned bomb state', async () => {
  const api = await production(), T = api.CHARACTER_TIMERS;
  for (const action of ['hide', 'form', 'death', 'reset', 'swap', 'dispose']) {
    const r = rig(api, 'dualies');
    try {
      for (let i = 0; i < 20; i++) r.step(1 / 60, { sub: true });
      if (action === 'hide') r.ch.setVisible(false);
      if (action === 'form') { r.a.form = 'squid'; r.step(1 / 60, { sub: true }); }
      if (action === 'death') r.a.splat(null, 'test');
      if (action === 'reset') r.a.reset();
      if (action === 'swap') r.a.setWeapon('slosher');
      if (action === 'dispose') r.ch.dispose();
      assert.equal(r.ch.bombHeld, false, action); assert.equal(r.ch.bomb.group.visible, false, action);
      assert.equal(r.ch.bombSwap, 0, action); assert.equal(r.ch.tr[T.T_THROW], 99, action);
      assert.equal(api.bombMotionSnapshot(r.ch).throwing, false, action);
      if (action === 'hide' || action === 'form') {
        if (action === 'hide') r.ch.setVisible(true); else r.a.form = 'kid';
        for (let i = 0; i < 30; i++) r.step(1 / 60, { sub: true });
        assert.equal(r.ch.bombHeld, true, 'current actual input rebuilds fresh hold after return');
        r.step(1 / 60, { subReleased: true }); assert.equal(r.projectiles.bombs.length, 1);
      }
    } finally { if (action !== 'dispose') r.close(); }
  }
  for (const action of ['reset', 'swap', 'form', 'hide', 'death']) {
    const r = rig(api);
    try {
      r.step(1 / 60, { sub: true }); r.step(1 / 60, { subReleased: true });
      assert.equal(api.bombMotionSnapshot(r.ch).throwing, true);
      if (action === 'reset') r.a.weaponRunner.reset();
      if (action === 'swap') r.a.setWeapon('charger');
      if (action === 'form') { r.a.form = 'squid'; r.step(); }
      if (action === 'hide') r.ch.setVisible(false);
      if (action === 'death') r.a.splat(null, 'test');
      assert.equal(api.bombMotionSnapshot(r.ch).throwing, false, action);
      assert.ok(r.ch.tr[T.T_THROW] >= 99, action);
    } finally { r.close(); }
  }
});

test('held and release overlays reserve the left hand during main attacks, movement and air', async () => {
  const api = await production(), C = api.CHARACTER_CHANNELS;
  for (const kind of ['shooter', 'dualies', 'slosher', 'charger', 'splatling', 'roller']) {
    const r = rig(api, kind);
    try {
      r.a.vel.set(1.5, 0, 1); r.a.grounded = false;
      for (let i = 0; i < 40; i++) { r.a.pos.addScaledVector(r.a.vel, 1 / 60); r.step(1 / 60, { sub: true, fire: true }); r.a.ink = 100; }
      assert.equal(r.ch.bombHeld, true); assert.ok(r.ch.P[C.IKL] < .01, kind);
      r.step(1 / 60, { subReleased: true, fire: true });
      assert.equal(r.ch.bomb.group.visible, false); assert.ok(r.ch.P[C.IKL] < .01, kind);
      assert.ok(r.ch.P[C.FARML] > -1, kind);
      r.a.weaponRunner.reset(); r.a.grounded = true;
      for (let i = 0; i < 80; i++) r.step();
      assert.equal(api.bombMotionSnapshot(r.ch).throwing, false);
    } finally { r.close(); }
  }
});

test('zero dt pauses bomb clocks and variable render intervals keep the real 60Hz release trace identical', async () => {
  const api = await production(), T = api.CHARACTER_TIMERS;
  const paused = rig(api);
  try {
    for (let i = 0; i < 20; i++) paused.step(1 / 60, { sub: true });
    const t = paused.ch.t, heldAge = paused.ch.bombT;
    for (let i = 0; i < 10; i++) paused.step(0, { sub: true });
    assert.equal(paused.ch.t, t); assert.equal(paused.ch.bombT, heldAge);
    paused.step(1 / 60, { subReleased: true });
    const age = paused.ch.tr[T.T_THROW], pose = Array.from(paused.ch.P);
    for (let i = 0; i < 10; i++) paused.step(0);
    assert.equal(paused.ch.tr[T.T_THROW], age);
    assert.ok(Array.from(paused.ch.P).every((value, i) => Math.abs(value - pose[i]) < 1e-7),
      'native Float32 torso rebakes have at most roundoff; bomb clock and arm curve do not advance');
  } finally { paused.close(); }
  const traces = [];
  for (const intervals of [Array(120).fill(1 / 60), Array(60).fill(1 / 30), Array(240).fill(1 / 120), Array(50).fill([.037, .009, .023, .011]).flat()]) {
    const r = rig(api, 'dualies'), clock = new api.FixedClock(), rows = []; let ticks = 0;
    try {
      for (const dt of intervals) {
        clock.advance(dt, fixedDt => {
          if (ticks >= 120) return;
          ticks++; r.step(fixedDt, { sub: ticks <= 20, subReleased: ticks === 21 });
          rows.push({ pose: Array.from(r.ch.P), clock: r.ch.tr[T.T_THROW], bombHeld: r.ch.bombHeld,
            throw: api.bombMotionSnapshot(r.ch).throwing, left: r.ch.bones.handL.getWorldPosition(new api.THREE.Vector3()).toArray(),
            muzzle: r.ch.getMuzzle(new api.THREE.Vector3()).toArray(), launches: r.projectiles.bombs.length });
        });
      }
      assert.equal(rows.length, 120); traces.push(rows);
    } finally { r.close(); }
  }
  for (let i = 1; i < traces.length; i++) assert.deepEqual(traces[i], traces[0]);
});

test('release and per-frame preview sample native rig without changing any live pose, feet, weapon, root or secondary state', async () => {
  const api = await production();
  for (const kind of ['shooter', 'dualies', 'slosher', 'charger', 'splatling', 'roller']) {
    const r = rig(api, kind); let flowEvents = 0;
    const stop = api.on('actor:flow', event => { if (event.actor === r.a) flowEvents++; });
    try {
      api.emit('turf', { actor: r.a, area: api.profile.flow.threshold / api.profile.flow.weights.turf + 1 });
      api.emit('splatted', { attacker: r.a, victim: { team: 1, s3: {} } });
      assert.equal(r.a.s3.flow.active, true); assert.equal(flowEvents, 1);
      const calls = countCalls(r.ch);
      r.a.vel.set(1.8, 0, 2.9);
      for (let i = 0; i < 30; i++) {
        r.a.pos.addScaledVector(r.a.vel, 1 / 60); r.a.yaw = .4 + i * .004;
        r.step(1 / 60, { sub: true, fire: kind === 'slosher' && i === 4 });
        r.a.ink = 100;
        const before = preservedRig(r, api), beforeCalls = { ...calls }, beforeEvents = flowEvents;
        const preview = new api.THREE.Vector3(0, 1.35, 0);
        api.bombPreviewPosition(r.a, preview);
        assert.deepEqual(preservedRig(r, api), before, kind + ' preview preserves the complete live native rig');
        assert.deepEqual(calls, beforeCalls, 'preview performs no update, animation or secondary simulation');
        assert.equal(flowEvents, beforeEvents);
        assert.ok(preview.distanceTo(r.a.pos) < 1.25, 'sample is reachable by this native model');
      }
      const before = preservedRig(r, api), beforeCalls = { ...calls }, preview = api.bombPreviewPosition(r.a, new api.THREE.Vector3());
      r.projectiles.updateArc(r.a, true);
      assert.deepEqual(preservedRig(r, api), before, 'actual native arc path does not mutate Character/runner/Flow');
      assert.deepEqual(calls, beforeCalls);
      const attribute = r.projectiles.arcGeo.getAttribute('position');
      assert.ok(new api.THREE.Vector3().fromBufferAttribute(attribute, 0).distanceTo(preview) < 1e-7,
        'actual drawn native arc starts at the same native release sample');
      // Trigger and launch in the real runner, with no intervening pose update.
      api.G.projectiles = r.projectiles;
      r.a.weaponRunner.update(0, { subReleased: true });
      assert.equal(r.projectiles.bombs.length, 1);
      assert.ok(r.projectiles.bombs[0].pos.distanceTo(preview) < 1e-12, 'preview and creation use the same pose and physical origin');
      assert.deepEqual(calls, beforeCalls, 'actual source throw samples without an extra Character tick');
      assert.equal(flowEvents, 1, 'Flow is not reactivated or extended by preview/release sampling');
    } finally { stop(); r.close(); }
  }
});

test('preview preserves native null/show/dead guards and hidden, form, opt-out fallback candidates', async () => {
  const api = await production(), r = rig(api);
  try {
    r.step(1 / 60, { sub: true });
    for (const [actor, show] of [[null, true], [r.a, false]]) {
      r.projectiles.updateArc(actor, show);
      assert.equal(r.projectiles.arcLine.visible, false); assert.equal(r.projectiles.arcRing.visible, false);
    }
    r.a.alive = false; r.projectiles.updateArc(r.a, true);
    assert.equal(r.projectiles.arcLine.visible, false); r.a.alive = true;
    for (const mode of ['hidden', 'parent-hidden', 'squid', 'disabled', 'missing-character', 'missing-bomb', 'not-aiming']) {
      const original = { character: r.a.character, bomb: r.ch.bomb };
      if (mode === 'hidden') r.ch.root.visible = false;
      if (mode === 'parent-hidden') api.G.scene.visible = false;
      if (mode === 'squid') r.a.form = 'squid';
      if (mode === 'disabled') r.ch.s3BombMotionEnabled = false;
      if (mode === 'missing-character') r.a.character = null;
      if (mode === 'missing-bomb') r.ch.bomb = null;
      if (mode === 'not-aiming') r.a.weaponRunner.aimingSub = false;
      const candidate = r.a.pos.clone(); candidate.y += 1.35;
      const expected = Array.from(candidate.toArray());
      api.bombPreviewPosition(r.a, candidate);
      assert.deepEqual(Array.from(candidate.toArray()), expected, mode);
      r.ch.root.visible = true; api.G.scene.visible = true; r.a.form = 'kid'; r.ch.s3BombMotionEnabled = true;
      r.a.character = original.character; r.ch.bomb = original.bomb; r.a.weaponRunner.aimingSub = true;
    }
  } finally { r.close(); }
});

test('moving real throw tick has the same walking contacts, cadence and root velocity as the unsampled control', async () => {
  const api = await production(), traces = [];
  for (const sampling of [false, true]) {
    api.G.time = 0;
    const r = rig(api, 'slosher'), calls = countCalls(r.ch), rows = [];
    let volleys = 0;
    r.projectiles.fireSlosh = () => { volleys++; };
    if (!sampling) r.projectiles.throwBomb = () => {};
    try {
      r.a.vel.set(1.8, 0, 2.9);
      for (let i = 0; i < 65; i++) {
        r.a.pos.addScaledVector(r.a.vel, 1 / 60); r.a.yaw = .4 + i * .004;
        r.a.ink = 100;
        r.step(1 / 60, { sub: i < 20, subReleased: i === 20, fire: i === 13 });
        rows.push({ feet: Array.from(r.ch.feet, fields), root: fields({ rp: r.ch.rp, rv: r.ch.rv, ra: r.ch.ra,
          prevYaw: r.ch.prevYaw, yawRate: r.ch.yawRate, phase: r.ch.phase, cadence: r.ch.cad, moving: r.ch.moving }),
          pose: Array.from(r.ch.P), springs: Array.from(r.ch.sp), hair: Array.from(r.ch.hv),
          clocks: Array.from(r.ch.tr), calls: { ...calls }, volleys });
      }
      assert.equal(volleys, 1, 'real slosher fire is not duplicated by the concurrent bomb');
      assert.equal(calls.update, 65); assert.equal(calls._trackRoot, 65); assert.equal(calls._updateFeet, 65);
      assert.equal(calls._animWeapon, 65); assert.equal(calls._updateHair, 65);
      assert.ok(rows[20].root.moving, 'throw tick remains a real moving step');
      assert.ok(Math.hypot(...rows[20].root.rv) > 1, 'native root velocity is retained');
      traces.push(rows);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[1], traces[0], 'sampling changes no native gait/contact/impulse trace on the release tick or its recovery');
});

test('pose sampling restores the live rig and sampler after a native limb-solver exception', async () => {
  const api = await production(), r = rig(api, 'dualies');
  try {
    r.step(1 / 60, { sub: true });
    const previous = r.ch._solveLimb;
    r.ch._solveLimb = () => { throw Error('controlled native solver failure'); };
    const before = preservedRig(r, api);
    assert.throws(() => api.bombPreviewPosition(r.a, new api.THREE.Vector3()), /controlled native solver failure/);
    assert.deepEqual(preservedRig(r, api), before, 'transaction rolls back partly changed bones/IK/head/feet');
    delete r.ch._solveLimb;
    assert.equal(r.ch._solveLimb, previous);
    const origin = api.bombPreviewPosition(r.a, new api.THREE.Vector3());
    assert.ok(origin.toArray().every(Number.isFinite), 'the same reusable sampler remains usable after rollback');
    r.step();
  } finally { r.close(); }
});

test('native drawn arc follows actual bomb origin, velocity and gravity at every two 60Hz ticks without advancing live clocks', async () => {
  const api = await production(), r = rig(api), waterY = api.PLAYER.waterY;
  try {
    api.PLAYER.waterY = -10000; // no water removal in this collision-free trajectory fixture
    r.a.yaw = .64; r.a.pitch = -.19;
    for (let i = 0; i < 40; i++) r.step(1 / 60, { sub: true });
    const before = preservedRig(r, api), calls = countCalls(r.ch);
    r.projectiles.updateArc(r.a, true);
    assert.deepEqual(preservedRig(r, api), before);
    assert.ok(Object.values(calls).every(count => count === 0));
    const vertices = r.projectiles.arcGeo.getAttribute('position');
    const drawn = Array.from({ length: r.projectiles.arcGeo.drawRange.count }, (_, i) =>
      [vertices.getX(i), vertices.getY(i), vertices.getZ(i)]);
    assert.equal(drawn.length, 64, 'actual native BufferAttribute draw supplies the complete collision-free arc');
    api.G.projectiles = r.projectiles;
    r.a.weaponRunner.update(0, { subReleased: true });
    const bomb = r.projectiles.bombs[0];
    assert.deepEqual(drawn[0], Array.from(bomb.pos.toArray(), Math.fround));
    const launchVelocity = Array.from(bomb.vel.toArray());
    // The player can start another real aim while the previous bomb flies.
    // Processing that input at dt=0 does not advance Character or bomb clocks.
    r.a.weaponRunner.update(0, { sub: true });
    const live = preservedRig(r, api), rows = [{ tick: 0, vertex: drawn[0], actual: Array.from(bomb.pos.toArray()) }];
    for (let tick = 1; tick <= 126; tick++) {
      const beforeBomb = fields(bomb), beforeCalls = { ...calls };
      r.projectiles.updateArc(r.a, true);
      assert.deepEqual(fields(bomb), beforeBomb, 'preview does not advance existing bomb velocity, age, fuse or origin');
      assert.deepEqual(preservedRig(r, api), live, 'preview preserves Character/runner/root/feet/Flow clocks');
      assert.deepEqual(calls, beforeCalls);
      r.projectiles._updateBombs(1 / 60);
      assert.equal(r.projectiles.bombs.length, 1); assert.equal(bomb.fuse, -1);
      if (tick % 2 === 0) {
        const vertex = tick / 2, actual = Array.from(bomb.pos.toArray());
        assert.deepEqual(drawn[vertex], actual.map(Math.fround), 'native drawn arc vertex equals actual two-tick native bomb integration');
        rows.push({ tick, vertex: drawn[vertex], actual });
      }
    }
    assert.ok(Math.abs(bomb.age - 126 / 60) < 1e-12);
    assert.ok(Math.abs(bomb.vel.y - (launchVelocity[1] - api.SUB.bomb.gravity * 126 / 60)) < 1e-10);
    if (process.env.INKWAVE_BOMB_EVIDENCE) {
      const destination = fs.realpathSync(process.env.INKWAVE_BOMB_EVIDENCE);
      assert.ok(destination.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
      const file = path.join(destination, 'arc-trajectory.json'), pending = file + '.pending';
      fs.writeFileSync(pending, JSON.stringify({ gravity: api.SUB.bomb.gravity, hz: 60, ticksPerVertex: 2, launchVelocity, rows }, null, 2) + '\n');
      fs.renameSync(pending, file);
    }
  } finally { api.PLAYER.waterY = waterY; r.close(); }
});
