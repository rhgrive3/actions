import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
async function realm() {
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
    export { installFaceMotion, faceMotionSnapshot } from './patches/splatoon3/runtime/face-motion.mjs';
    export { installFlowMotion } from './patches/splatoon3/runtime/flow-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'face-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate(); return entry.namespace;
}
let cached;
async function production() {
  if (cached) return cached;
  const entry = await realm(), profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.install(profile), ...entry, profile };
  // The shared production installer must already own the final face layer.
  // A standalone call here would hide a missing production connection.
  assert.ok(Object.hasOwn(api.Character.prototype, Symbol.for('inkwave.s3.face-motion.install.v1')));
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 }; G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0; cached = api; return api;
}
function rig(api, kind = 'shooter', enabled = true) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'face native regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3FaceMotionEnabled = enabled;
  const nativeRng = ch.rng; let rngCalls = 0;
  ch.rng = function () { rngCalls++; return nativeRng(); };
  G.scene.add(ch.root); a.grounded = a.ground.hit = true;
  a.remote = true; // Real remote Actor route preserves an aim/body yaw gap.
  function aim(yaw = .12, pitch = .06, distance = 8) {
    a.aimYaw = yaw; a.aimPitch = pitch;
    a.aimDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    a.aimPoint.copy(a.pos).add(new THREE.Vector3(0, 1.22, 0)).addScaledVector(a.aimDir, distance);
  }
  function step(dt = 1 / 60, input = {}) {
    G.actors = [a]; G.time += dt; a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    a.weaponRunner.update(dt, input); a._finishFrame(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update();
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  }
  function visual(dt = 1 / 60) { G.actors = [a]; a._finishFrame(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update(); }
  aim(); for (let i = 0; i < 90; i++) step();
  return { a, ch, api, step, visual, aim, get rngCalls() { return rngCalls; }, snapshot: () => api.faceMotionSnapshot(ch),
    close() { G.scene.remove(ch.root); G.actors = []; ch.dispose(); } };
}
function shader(ch, THREE, material = 'eye') {
  const base = THREE.ShaderLib.physical;
  const s = { uniforms: {}, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader };
  ch.mats[material].onBeforeCompile(s); return s;
}
function skinPoint(mesh, index, point) { return mesh.applyBoneTransform(index, point).applyMatrix4(mesh.matrixWorld); }
function eyes(r) {
  const { ch, api: { THREE } } = r, mesh = ch.meshes.eyes, geo = mesh.geometry, s = shader(ch, THREE), u = s.uniforms;
  // This CPU evaluation uses the exact native shader formula and the actual
  // indexed, drawn cap geometry + actual skinning. The GLSL assertions expose
  // upstream shader drift instead of silently accepting an obsolete formula.
  assert.match(s.vertexShader, /float yaw = uEyeRest \+ sd \* clamp\(0\.6/);
  assert.match(s.vertexShader, /vec3 s = R \* aEyeS/);
  assert.match(s.vertexShader, /transformed = iwEP/);
  const ids = [...new Set(geo.index.array)], output = [], centers = [];
  for (const id of ids) {
    const side = geo.attributes.aEx.getX(id) > 0 ? 0 : 1, sign = side ? -1 : 1;
    const look = u.uLook.value, gaze = u.uGaze.value;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const yaw = u.uEyeRest.value + sign * clamp(.6 * (look.x * 1.25 + (side ? gaze.z : gaze.x)), -.36, .36);
    const pitch = clamp(.6 * (look.y * 1.25 + (side ? gaze.w : gaze.y)), -.3, .3);
    const ball = new THREE.Vector3().fromBufferAttribute(geo.attributes.aEyeS, id)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), -pitch).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const p = ball.clone().applyMatrix3(u.uEyeM.value[side]).add(u.uEyeC.value[side]);
    skinPoint(mesh, id, p); output.push([id, ...p.toArray()]);
    // The actual indexed apex (aEyeS.x=y=0) is the iris/cornea axis.
    if (Math.hypot(geo.attributes.aEyeS.getX(id), geo.attributes.aEyeS.getY(id)) < 1e-6) {
      const center = skinPoint(mesh, id, u.uEyeC.value[side].clone());
      const axis = p.clone().sub(center).normalize(), desired = r.a.aimPoint.clone().sub(center).normalize();
      centers[side] = { center: center.toArray(), apex: p.toArray(), axis: axis.toArray(),
        error: axis.angleTo(desired) };
    }
  }
  assert.ok(ids.length > 200 && centers.length === 2);
  return { vertices: output, centers, indices: Array.from(geo.index.array),
    indexHash: hash(geo.index.array), shaderHash: hash(s.vertexShader) };
}
function lids(r) {
  const { ch, api: { THREE } } = r, mesh = ch.meshes.skin, geo = mesh.geometry, s = shader(ch, THREE, 'skin'), u = s.uniforms;
  assert.match(s.vertexShader, /aFace.x \* cl.x - aFace.y \* cl.y/);
  assert.match(s.vertexShader, /ca \* s.y - sa \* s.z, sa \* s.y \+ ca \* s.z/);
  const headId = ch.boneList.findIndex(b => b === ch.bones.head);
  const yLength = id => Math.hypot(...Array.from(ch.skeleton.boneMatrices.slice(id * 16 + 4, id * 16 + 7)));
  const closure = [ch.bones.eyeL, ch.bones.eyeR].map(b => Math.max(0, Math.min(1,
    (1 - yLength(ch.boneList.indexOf(b)) / yLength(headId)) / .93)));
  const vertices = [], lambda = [[], []];
  for (const id of new Set(geo.index.array)) {
    const upper = geo.attributes.aFace.getX(id), lower = geo.attributes.aFace.getY(id);
    if (upper + lower < 1e-4) continue;
    const p = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, id), side = p.x >= 0 ? 0 : 1;
    const lid = u.uLid.value, uc = Math.max(closure[side], side ? lid.y : lid.x), lc = Math.max(closure[side], side ? lid.w : lid.z);
    const ball = p.clone().sub(u.uEyeC.value[side]).applyMatrix3(u.uEyeMi.value[side]);
    const a = upper * uc - lower * lc; ball.applyAxisAngle(new THREE.Vector3(1, 0, 0), a);
    if (Math.abs(ball.x) < .08) lambda[side].push({ upper, lower, angle: Math.atan2(ball.y, ball.z) });
    p.copy(ball).applyMatrix3(u.uEyeM.value[side]).add(u.uEyeC.value[side]);
    vertices.push([id, ...skinPoint(mesh, id, p).toArray()]);
  }
  assert.ok(vertices.length > 50, 'sample drawn native indexed lid vertices');
  return { closure, vertices, lambda, indexHash: hash(geo.index.array) };
}
const hash = x => createHash('sha256').update(typeof x === 'string' ? x : Buffer.from(x.buffer, x.byteOffset, x.byteLength)).digest('hex');
function invariant(r) {
  const { a, ch, api: { THREE } } = r;
  return { pose: Array.from(ch.P), timers: Array.from(ch.tr), springs: Array.from(ch.sp), rngCalls: r.rngCalls,
    gazeState: { ...ch.gz }, blinkState: { ...ch.bl },
    bones: ch.boneList.map(b => [b.name, ...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()]),
    root: ch.root.matrix.toArray(), weapon: ch.weapon.off.matrixWorld.toArray(),
    hand: ch.bones.handR.getWorldPosition(new THREE.Vector3()).toArray(), ik: Array.from(ch.ikErr),
    muzzle: ch.getMuzzle(new THREE.Vector3()).toArray(), hair: Array.from(ch.hx),
    gameplay: { pos: a.pos.toArray(), vel: a.vel.toArray(), hp: a.hp, ink: a.ink, form: a.form,
      yaw: a.yaw, aimYaw: a.aimYaw, aimPitch: a.aimPitch, aimDir: a.aimDir.toArray(), aimPoint: a.aimPoint.toArray(),
      intent: { fire: a.intent.fire, sub: a.intent.sub }, runner: Object.fromEntries(Object.entries(a.weaponRunner)
        .filter(([k, v]) => k !== 'a' && (v === null || ['number', 'boolean', 'string'].includes(typeof v)))) } };
}
function trace(rows, suffix = '') {
  const requested = process.env.INKWAVE_FACE_TRACE_PATH; if (!requested) return;
  const directory = fs.realpathSync(path.dirname(requested));
  assert.ok(directory.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(directory, path.basename(requested).replace(/\.json$/, suffix ? `-${suffix}.json` : '.json'));
  const body = { schema: 1, proof: 'actual indexed native eye/skin geometry evaluated on CPU with native skinning; GPU/browser proof belongs to parent',
    runtimeSha256: hash(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/face-motion.mjs'))), rows };
  fs.writeFileSync(file + '.pending', JSON.stringify(body, null, 2) + '\n'); fs.renameSync(file + '.pending', file);
}

test('production composition and duplicate-realm installation keep one face hook', async () => {
  const api = await production(), C = api.Character.prototype, A = api.Actor.prototype, R = api.WeaponRunner.prototype;
  const before = [C.update, C._applyFace, C.trigger, C.dispose, C.setVisible, A.reset, A.splat, R.reset];
  const other = await realm();
  api.installFaceMotion(api, api.profile); other.installFaceMotion(api, api.profile);
  assert.deepEqual([C.update, C._applyFace, C.trigger, C.dispose, C.setVisible, A.reset, A.splat, R.reset], before);
  const r = rig(api);
  try {
    r.step(1 / 60, { fire: true });
    assert.deepEqual(JSON.parse(JSON.stringify(other.faceMotionSnapshot(r.ch))), JSON.parse(JSON.stringify(r.snapshot())));
    r.close(); assert.equal(other.faceMotionSnapshot(r.ch), null);
    r.ch.update(0, { firing: true }); assert.equal(other.faceMotionSnapshot(r.ch), null);
  } finally { if (r.snapshot()) r.close(); }
  assert.equal(api.faceMotionSnapshot(null), null);
});

test('actual indexed iris axes follow world aim during fire, charge and sub aim without changing native pose/IK/gameplay', async () => {
  const api = await production(), rows = [];
  for (const [kind, input, mode] of [['shooter', { fire: true }, 'fire'], ['charger', { fire: true }, 'charge'],
    ['shooter', { sub: true }, 'sub-aim']]) {
    const before = rig(api, kind, false), after = rig(api, kind, true);
    try {
      for (let tick = 0; tick < 20; tick++) { before.step(1 / 60, input); after.step(1 / 60, input); }
      assert.equal(after.snapshot().mode, mode); assert.equal(after.snapshot().source, 'aim-point');
      assert.deepEqual(invariant(after), invariant(before), 'face patch must preserve native nonface pose and gameplay');
      const oldEye = eyes(before), newEye = eyes(after);
      assert.equal(newEye.indexHash, oldEye.indexHash); assert.equal(newEye.shaderHash, oldEye.shaderHash);
      assert.notDeepEqual(newEye.vertices, oldEye.vertices, 'actual drawn indexed eye cap must move');
      assert.equal(after.snapshot().clamped, false);
      for (let i = 0; i < 2; i++) {
        assert.ok(newEye.centers[i].error < 1e-5, JSON.stringify(newEye.centers));
        assert.ok(oldEye.centers[i].error > .01, JSON.stringify(oldEye.centers));
      }
      rows.push({ kind, mode, before: { face: before.snapshot(), geometry: oldEye, pose: invariant(before) },
        after: { face: after.snapshot(), geometry: newEye, pose: invariant(after) } });
      // Changing actual aim horizontally must take effect on this rendered
      // frame, even while native attention/saccade still aims somewhere else.
      after.aim(.08, .04); after.step(1 / 60, input);
      const changedEyes = eyes(after);
      assert.ok(changedEyes.centers.every(c => c.error < 1e-5), JSON.stringify({ mode, face: after.snapshot(), eyes: changedEyes.centers }));
      after.a.pos.set(2, .7, -3); after.a.yaw = .4; after.aim(.46, .04);
      after.step(1 / 60, input);
      assert.ok(eyes(after).centers.every(c => c.error < 1e-5), 'world aim must survive translated/rotated root and actual posed head');
    } finally { before.close(); after.close(); }
  }
  trace(rows);
});

test('native blink lids, wink, landing/damage and victory expressions still reach the real rig', async () => {
  const api = await production(), a = rig(api), b = rig(api, 'shooter', false);
  try {
    for (const event of [['land', 14], ['hit', { x: -1, z: 0, amount: 1 }], ['wink', undefined]]) {
      a.ch.trigger(...event); b.ch.trigger(...event);
      for (let i = 0; i < 22; i++) {
        a.step(); b.step(); assert.deepEqual(invariant(a), invariant(b));
        assert.deepEqual(a.ch.u.uMouth.value.toArray(), b.ch.u.uMouth.value.toArray());
        assert.deepEqual(a.ch.u.uLid.value.toArray(), b.ch.u.uLid.value.toArray());
      }
    }
    const opened = lids(a);
    a.ch._blinkStart(1, true); b.ch._blinkStart(1, true);
    let maximumClose = 0, closed;
    const skin = shader(a.ch, api.THREE, 'skin'); assert.match(skin.vertexShader, /aFace.x \* cl.x - aFace.y \* cl.y/);
    for (let i = 0; i < 30; i++) {
      a.step(); b.step();
      assert.deepEqual(a.ch.bones.eyeL.scale.toArray(), b.ch.bones.eyeL.scale.toArray());
      maximumClose = Math.max(maximumClose, 1 - a.ch.bones.eyeL.scale.y);
      if (a.ch.bones.eyeL.scale.y < .1) {
        closed = lids(a); assert.deepEqual(closed, lids(b));
      }
    }
    assert.ok(maximumClose > .9, 'native hard blink must close its actual shader-driving bone');
    assert.ok(closed?.closure[0] > .95); assert.equal(closed.indexHash, opened.indexHash);
    assert.notDeepEqual(closed.vertices, opened.vertices, 'native indexed lid surface must actually slide during blink');
    trace([{ kind: 'native-blink-preserved', opened, closed, nativeIK: Array.from(a.ch.ikErr) }], 'blink');
    a.ch.setDance('victory'); b.ch.setDance('victory');
    for (let i = 0; i < 90; i++) { a.step(); b.step(); assert.deepEqual(invariant(a), invariant(b)); }
    assert.equal(a.snapshot().mode, null); assert.deepEqual(a.ch.u.uMouth.value.toArray(), b.ch.u.uMouth.value.toArray());
  } finally { a.close(); b.close(); }
});

test('action gaze composes with actual native blink deformation and expression materials', async () => {
  const api = await production(), a = rig(api), b = rig(api, 'shooter', false);
  try {
    for (const r of [a, b]) {
      r.a.s3.flow.active = true; r.a.s3.flow.remaining = 10;
      r.ch._blinkStart(1, true);
    }
    let closed = false;
    for (let i = 0; i < 22; i++) {
      a.step(1 / 60, { fire: true }); b.step(1 / 60, { fire: true });
      assert.deepEqual(invariant(a), invariant(b), 'final gaze cannot change native RNG, face clocks, body or IK');
      assert.deepEqual(lids(a), lids(b), 'the real indexed lid deformation stays native while eye axes follow aim');
      assert.deepEqual(a.ch.u.uMouth.value.toArray(), b.ch.u.uMouth.value.toArray());
      assert.deepEqual(a.ch.u.uMouth2.value.toArray(), b.ch.u.uMouth2.value.toArray());
      assert.ok(eyes(a).centers.every(c => c.error < 1e-5));
      closed ||= a.ch.bones.eyeL.scale.y < .1;
    }
    assert.equal(closed, true, 'a real hard-blink closed frame was measured during firing');
  } finally { a.close(); b.close(); }
});

test('30/60/120Hz fixed-clock rendering, pause, interruptions and disposal', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
        r.step(dt, { fire: true }); rows.push({ face: r.snapshot(), native: invariant(r) });
      });
      assert.equal(clock.ticks, 60); traces.push(rows);
      const time = r.ch.t, blink = r.ch.bl.t, saved = r.snapshot(); r.visual(0);
      assert.equal(r.ch.t, time); assert.equal(r.ch.bl.t, blink);
      assert.equal(r.snapshot().mode, saved.mode); assert.deepEqual(r.snapshot().target, saved.target);
      // Native Float32 pose recomposition at dt=0 can round the posed head by
      // sub-nanoradians; clocks and visible gaze must remain paused.
      r.snapshot().gazeUniform.forEach((v, i) => assert.ok(Math.abs(v - saved.gazeUniform[i]) < 1e-8));
      r.a.weaponRunner.reset(); assert.equal(r.snapshot(), null); r.visual(); assert.equal(r.snapshot().mode, null);
      r.step(1 / 60, { sub: true }); assert.equal(r.snapshot().mode, 'sub-aim');
      for (let ready = 0; ready < 5; ready++) r.step(1 / 60, { sub: true });
      r.step(1 / 60, { subReleased: true }); assert.equal(r.snapshot().mode, 'throw');
      for (let i = 0; i < 30; i++) r.step(); assert.equal(r.snapshot().mode, null);
      r.a.weaponRunner.reset(); r.a.form = 'squid'; r.visual(); assert.equal(r.snapshot().mode, null);
      r.a.form = 'kid'; r.visual(); assert.equal(r.snapshot().mode, null);
      r.a.setWeapon('charger');
      // The charger now completes its charge in the profile's chargeTime (1 frame), so a single
      // step can already be past the charge preview. Drive the real state to the charge phase
      // inside a bounded window and record the sequence so a lifecycle regression is legible.
      const chargeSeq = [];
      for (let i = 0; i < 8; i++) { r.step(1 / 60, { fire: true }); chargeSeq.push(r.snapshot().mode); if (r.snapshot().mode === 'charge') break; }
      assert.ok(chargeSeq.includes('charge'),
        `firing the charger must produce a charge preview, saw ${JSON.stringify(chargeSeq)}`);
      r.a.weaponRunner.reset();
      r.a.setWeapon('shooter'); assert.equal(r.snapshot(), null); r.visual(); assert.equal(r.snapshot().mode, null);
      r.ch.trigger('hit', 1); r.step(1 / 60, { fire: true }); assert.equal(r.snapshot().mode, null);
      r.a.reset(); assert.equal(r.snapshot(), null); r.a.grounded = true; r.step(1 / 60, { fire: true });
      assert.equal(r.snapshot().mode, 'fire'); r.a.splat(null); assert.equal(r.snapshot(), null);
      r.visual(); assert.equal(r.snapshot().mode, null);
    } finally { r.close(); assert.equal(r.snapshot(), null); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('nullable character preview, invalid aim fallback and shader limits stay finite', async () => {
  const api = await production(), ch = new api.Character({ name: 'nullable face preview', weapon: 'shooter' });
  try {
    ch.onEvent = null; ch.update(0, null); assert.equal(api.faceMotionSnapshot(ch).mode, null);
    for (let i = 0; i < 20; i++) ch.update(1 / 60, { form: 'kid', firing: true, aimPitch: .1 });
    assert.equal(api.faceMotionSnapshot(ch).source, 'preview-pitch');
    assert.ok(ch.u.uGaze.value.toArray().every(Number.isFinite));
    ch.update(1 / 60, { form: 'swim', firing: true }); assert.equal(api.faceMotionSnapshot(ch).mode, null);
  } finally { ch.dispose(); assert.equal(api.faceMotionSnapshot(ch), null); }
  const r = rig(api);
  try {
    r.a.aimPoint.set(0, 0, 0); r.step(1 / 60, { fire: true }); assert.equal(r.snapshot().source, 'aim-direction');
    r.aim(1.5, .8); r.step(1 / 60, { fire: true }); assert.equal(r.snapshot().clamped, true);
    assert.ok(r.ch.u.uGaze.value.toArray().every(Number.isFinite));
    r.a.aimDir.set(NaN, 0, 0); r.step(1 / 60, { fire: true }); assert.equal(r.snapshot().mode, null);
  } finally { r.close(); }
});

test('hidden and disposed characters cannot retain or resurrect action gaze state', async () => {
  const api = await production(), r = rig(api);
  try {
    r.step(1 / 60, { fire: true }); assert.equal(r.snapshot().mode, 'fire');
    r.ch.setVisible(false); assert.equal(r.snapshot(), null, 'hide immediately drops the action gaze');
    r.ch.setVisible(true); r.step(1 / 60, { fire: true }); assert.equal(r.snapshot().mode, 'fire');
    api.G.scene.visible = false; r.step(1 / 60, { fire: true });
    assert.equal(r.snapshot()?.mode ?? null, null, 'hidden ancestors also suppress gaze');
    api.G.scene.visible = true; r.step(1 / 60, { fire: true });
    r.close(); assert.equal(r.snapshot(), null);
    r.ch.update(0, { firing: true }); assert.equal(r.snapshot(), null, 'disposed native update cannot recreate a face track');
  } finally { api.G.scene.visible = true; if (r.snapshot()) r.close(); }
});
