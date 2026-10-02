import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installWallMotion as installDuplicate, wallMotionSnapshot as duplicateSnapshot } from '../runtime/wall-motion.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const EVIDENCE = process.env.INKWAVE_WALL_EVIDENCE;
let cached;
const near = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
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
    export { installWallMotion, wallMotionSnapshot } from './patches/splatoon3/runtime/wall-motion.mjs';
    export { movementMotionSnapshot } from './patches/splatoon3/runtime/movement-motion.mjs';
    export { beforeActions } from './patches/splatoon3/runtime/movement.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'wall-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile, load, context };
  assert.throws(() => api.install(profile), /already installed/);
  // All comparisons share this single native Character/Actor/THREE module realm.
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  G.camera.position.set(1.4, 1.2, 3); G.camera.lookAt(0, .5, 0); G.camera.updateMatrixWorld();
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 }; G.time = 0;
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = [];
  cached = api; return api;
}

function rig(api, weapon = 'shooter', enabled = true) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'native wall regression', weapon, isLocal: true,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; G.actors.push(a); G.scene.add(ch.root);
  ch.s3WallMotionEnabled = enabled;
  a.grounded = a.ground.hit = true;
  const draw = (dt = 1 / 60) => {
    G.time += dt; a._finishFrame(dt); ch.root.updateMatrixWorld(true); ch.skeleton.update();
  };
  for (let i = 0; i < 90; i++) draw();
  const climb = () => {
    a.form = 'squid'; a.submerged = false; a.climbing = true; a.grounded = false;
    a.intent.squid = true; a.wallN.set(0, 0, 1); a.anim.wallNormal.copy(a.wallN);
    a.intent.move.set(0, 0, -1); a.vel.set(0, 0, 0);
    for (let i = 0; i < 45; i++) draw();
    assert.equal(ch.squidRoot.visible, true); assert.equal(ch.kid.visible, false);
  };
  const action = (dt = 1 / 60, pressed = false) => {
    api.beforeActions(a, dt, pressed); draw(dt);
  };
  const grip = () => ch.weapon.off.localToWorld(ch.weapon.def.handR.pos.clone())
    .distanceTo(ch.bones.handR.getWorldPosition(new THREE.Vector3()));
  return { a, ch, draw, climb, action, grip, close() {
    G.actors.splice(G.actors.indexOf(a), 1); ch.dispose();
  } };
}

function gameplay(a) {
  return { pos: a.pos.toArray(), vel: a.vel.toArray(), ink: a.ink, hp: a.hp,
    yaw: a.yaw, grounded: a.grounded, climbing: a.climbing, form: a.form,
    climbV: a.climbV, jumpBuffer: a.jumpBuffer, coyote: a.coyote,
    input: { move: a.intent.move.toArray(), jump: a.intent.jump, squid: a.intent.squid,
      fire: a.intent.fire, sub: a.intent.sub },
    actions: a.s3.actions ? JSON.parse(JSON.stringify(a.s3.actions)) : null,
    clocks: Array.from(a.character.tr), runnerCharge: a.weaponRunner.charge,
    runnerCooldown: a.weaponRunner.cooldown };
}

// Evaluate the displacement extracted from the actual native material shader.
const fieldCache = new WeakMap();
function nativeField(ch, THREE) {
  if (fieldCache.has(ch)) return fieldCache.get(ch);
  const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
  ch.squid.body.material.onBeforeCompile(shader);
  const begin = shader.vertexShader.indexOf('float wig = color.g;');
  const end = shader.vertexShader.indexOf('vTint = color.r;', begin);
  assert.ok(begin >= 0 && end > begin, 'native travelling tentacle shader is present');
  const source = shader.vertexShader.slice(begin, end);
  let js = source.replaceAll('float ', 'let ')
    .replace('vec2 rad = position.xz;', 'let rad = [position.x, position.z];')
    .replace('length(rad)', 'Math.hypot(...rad)')
    .replace('rad / rl', 'rad.map(x => x / rl)')
    .replace('vec2(0.0, 1.0)', '[0, 1]')
    .replace('vec2 tng = vec2(-rad.y, rad.x);', 'let tng = [-rad[1], rad[0]];')
    .replace(/transformed\.xz \+= rad \* (\([^;]+\)) \+ tng \* (\([^;]+\));/,
      'transformed.x += rad[0] * $1 + tng[0] * $2; transformed.z += rad[1] * $1 + tng[1] * $2;')
    .replace(/\bsin\(/g, 'Math.sin(').replace(/\bcos\(/g, 'Math.cos(');
  assert.doesNotMatch(js, /\bvec2\b|transformed\.xz|\bfloat\b/);
  const evaluate = new Function('position', 'color', 'uTime', 'uWig',
    'const transformed = position.clone();\n' + js + '\nreturn transformed;');
  const field = { shader, source, evaluate };
  fieldCache.set(ch, field); return field;
}
function posed(ch, THREE) {
  const body = ch.squid.body, geometry = body.geometry;
  assert.ok(geometry.index?.count > 100, 'the real drawn squid is indexed geometry');
  const indices = [], vertices = [], p = new THREE.Vector3(), field = nativeField(ch, THREE);
  // Sample actual drawn indices through native vertex attributes and wiggle.
  for (let k = 0; k < geometry.index.count; k += Math.max(1, Math.floor(geometry.index.count / 96))) {
    const i = geometry.index.getX(k); indices.push(i); body.getVertexPosition(i, p);
    const color = geometry.getAttribute('color');
    p.copy(field.evaluate(p, { g: color.getY(i), b: color.getZ(i) }, ch.u.uTime.value, ch.u.uWig.value));
    p.applyMatrix4(body.matrixWorld); vertices.push(p.toArray());
  }
  const skin = ch.kid.children.find(x => x.isSkinnedMesh);
  assert.ok(skin, 'native skinned kid is retained');
  const skinIndex = skin.geometry.index.getX(0); skin.getVertexPosition(skinIndex, p); p.applyMatrix4(skin.matrixWorld);
  return JSON.parse(JSON.stringify({ indices, vertices, bodyMatrix: body.matrixWorld.toArray(),
    squidQuaternion: ch.squid.pivot.quaternion.toArray(), squidScale: ch.squid.pivot.scale.toArray(),
    root: ch.root.matrixWorld.toArray(), bones: Object.fromEntries(['hips', 'head', 'handR', 'handL', 'footR', 'footL']
      .map(name => [name, ch.bones[name].matrixWorld.toArray()])), pose: Array.from(ch.P),
    skinIndex, skinVertex: p.toArray(), ikError: Array.from(ch.ikErr.slice(0, 2)),
    muzzle: ch.getMuzzle(new THREE.Vector3()).toArray(),
    emission: ch.mats.squid.emissive.toArray(), flash: ch.u.uFlash.value.toArray(), glow: ch.u.uGlow.value.toArray(),
    ghostVisible: ch.squid.ghost.visible, ghostDepthFunc: ch.mats.squidGhost.depthFunc }));
}
function evidence(name, data) {
  if (!EVIDENCE) return;
  const dir = fs.realpathSync(EVIDENCE);
  assert.ok(dir.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(dir, name), stage = file + '.pending';
  fs.writeFileSync(stage, JSON.stringify(data, null, 2)); fs.renameSync(stage, file);
}

function drawGeometryProof(ch, THREE, name) {
  if (!EVIDENCE) return;
  const body = ch.squid.body, geometry = body.geometry, color = geometry.attributes.color;
  const p = new THREE.Vector3(), vertices = [], field = nativeField(ch, THREE);
  // Full indexed mesh projection, with the existing native shader deformation.
  // This is CPU pose visualization; it is explicitly not browser/GPU proof.
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    body.getVertexPosition(i, p);
    p.copy(field.evaluate(p, { g: color.getY(i), b: color.getZ(i) }, ch.u.uTime.value, ch.u.uWig.value));
    p.applyMatrix4(body.matrixWorld); vertices.push(p.toArray());
  }
  const triangles = [];
  for (let k = 0; k < geometry.index.count; k += 3) {
    const triangle = [0, 1, 2].map(n => vertices[geometry.index.getX(k + n)]);
    const cross = new THREE.Vector3().subVectors(new THREE.Vector3(...triangle[1]), new THREE.Vector3(...triangle[0]))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...triangle[2]), new THREE.Vector3(...triangle[0])));
    if (cross.lengthSq() < 1e-20) continue;
    triangles.push({ triangle, depth: triangle.reduce((s, v) => s + v[2], 0), shade: .3 + .6 * Math.abs(cross.normalize().z) });
  }
  assert.ok(triangles.length > 100, 'proof contains nondegenerate actual drawn triangles');
  triangles.sort((a, b) => a.depth - b.depth);
  const emission = ch.mats.squid.emissive.r;
  const polygons = triangles.map(({ triangle, shade }) => {
    const points = triangle.map(v => `${(260 + 450 * v[0]).toFixed(2)},${(420 - 450 * v[1]).toFixed(2)}`).join(' ');
    const rgb = [255, 125, 24].map(v => Math.min(255, Math.round(v * shade + emission * 110)));
    return `<polygon points="${points}" fill="rgb(${rgb})"/>`;
  });
  const star = ch.squid.pivot.getObjectByName('s3-wall-ready-glint');
  if (star?.visible) {
    const sg = star.geometry, sv = new THREE.Vector3(); star.updateWorldMatrix(true, false);
    for (let k = 0; k < sg.index.count; k += 3) {
      const points = [0, 1, 2].map(n => {
        star.getVertexPosition(sg.index.getX(k + n), sv); sv.applyMatrix4(star.matrixWorld);
        return `${(260 + 450 * sv.x).toFixed(2)},${(420 - 450 * sv.y).toFixed(2)}`;
      }).join(' ');
      polygons.push(`<polygon points="${points}" fill="white" opacity="${star.material.opacity}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520" viewBox="0 0 520 520"><rect width="520" height="520" fill="#173a43"/><text x="16" y="24" fill="white" font-size="15">${name}: actual native indexed geometry</text>${polygons.join('')}<text x="16" y="496" fill="white" font-size="12">CPU pose projection + native shader wiggle; not GPU/console capture</text></svg>`;
  const dir = fs.realpathSync(EVIDENCE);
  assert.ok(dir.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(dir, name + '.svg'); fs.writeFileSync(file + '.pending', svg); fs.renameSync(file + '.pending', file);
}
function difference(a, b) {
  return Math.sqrt(a.vertices.reduce((sum, v, i) => sum + v.reduce((s, x, j) => s + (x - b.vertices[i][j]) ** 2, 0), 0) / a.vertices.length);
}

function nativeWallTrace(api, hz = 60, enabled = true) {
  const { THREE, G, Physics, FixedClock, PLAYER } = api, V = THREE.Vector3;
  const previous = { level: G.level, physics: G.physics };
  const box = (id, center, half, faces) => ({ id, solid: true, center, half, faces,
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) });
  const level = { blocks: [box(0, new V(0, -.1, 0), new V(100, .1, 100), [-1, -1, 0, -1, -1, -1]),
    box(1, new V(0, 1.5, -.5), new V(3, 1.5, .5), [-1, -1, 1, -1, 2, -1])],
    faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) },
      { origin: new V(-3, 3, -1), u: new V(1, 0, 0), v: new V(0, 0, 1) },
      { origin: new V(-3, 0, 0), u: new V(1, 0, 0), v: new V(0, 1, 0) }],
    hasRails: false, groundHeight: () => 0, spawnBarrier: 1,
    spawnPads: [new V(-1000, 0, 0), new V(1000, 0, 0)],
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0, 1); return out; } };
  G.level = level; G.physics = new Physics(level);
  const r = rig(api, 'shooter', enabled), rows = [], poses = [], clock = new FixedClock();
  try {
    r.a.pos.set(0, .5, PLAYER.radius + .02); r.a.grounded = false; r.a.ink = 50;
    r.a.intent.squid = true; r.a.intent.move.set(0, 0, -1);
    for (let frame = 0; frame < hz * 2; frame++) clock.advance(1 / hz, dt => {
      const tick = clock.ticks;
      r.a.intent.jump = tick >= 6 && tick < 51;
      r.a.update(dt); r.ch.root.updateMatrixWorld(true); r.ch.skeleton.update();
      rows.push(JSON.parse(JSON.stringify(gameplay(r.a))));
      if ([5, 6, 50, 51, 58, 64, 80, 119].includes(tick)) {
        poses.push({ tick, motion: api.wallMotionSnapshot(r.ch), posed: posed(r.ch, THREE) });
      }
    });
    assert.equal(clock.ticks, 120);
    assert.ok(rows[5].climbing, 'native own-ink raycast attaches to wall');
    assert.equal(rows[50].actions.surge.charge, 1, 'native live input fully charges');
    assert.ok(rows.some(row => row.actions?.surge?.phase === 'burst'));
    assert.ok(rows.slice(51).some(row => !row.climbing && row.pos[1] > 3), 'native collision/ledge path crests');
    return { rows, poses };
  } finally { r.close(); G.level = previous.level; G.physics = previous.physics; }
}

test('production wall opt-out exposes the legacy missing ready cue and retains native IK', async () => {
  const api = await production(), baseline = rig(api, 'shooter', false);
  const gameplayBefore = nativeWallTrace(api, 60, false);
  let before;
  try {
    baseline.climb(); baseline.a.intent.jump = true;
    for (let i = 0; i < 45; i++) baseline.action();
    assert.equal(baseline.a.s3.surge.charge, 1);
    before = posed(baseline.ch, api.THREE);
    drawGeometryProof(baseline.ch, api.THREE, 'native-before-ready');
    assert.deepEqual(before.emission, [0, 0, 0]); assert.deepEqual(before.flash, [0, 0, 0]);
    assert.equal(baseline.ch.squid.pivot.getObjectByName('s3-wall-ready-glint'), undefined);
  } finally { baseline.close(); }
  api.installWallMotion(api, api.profile);
  const gameplayAfter = nativeWallTrace(api);
  assert.deepEqual(gameplayAfter.rows, gameplayBefore.rows,
    'actual native physics, input, actions/resources, runner and timer sequence must be identical');
  assert.deepEqual(gameplayAfter.poses[0].posed.vertices, gameplayBefore.poses[0].posed.vertices,
    'ordinary climb vertices remain exactly native before Surge begins');
  evidence('native-physics-before-after.json', { before: gameplayBefore, after: gameplayAfter });
  const update = api.Character.prototype.update, trigger = api.Character.prototype.trigger;
  api.installWallMotion(api, api.profile);
  assert.equal(api.Character.prototype.update, update); assert.equal(api.Character.prototype.trigger, trigger);
  installDuplicate(api, api.profile); // host realm; all native production modules stay in the one VM
  assert.equal(api.Character.prototype.update, update, 'another module instance must not stack wrappers');
  const after = rig(api);
  try {
    after.climb(); after.a.intent.jump = true;
    for (let i = 0; i < 45; i++) after.action();
    const snapshot = api.wallMotionSnapshot(after.ch), proof = posed(after.ch, api.THREE);
    drawGeometryProof(after.ch, api.THREE, 'native-after-ready');
    assert.deepEqual(duplicateSnapshot(after.ch), snapshot);
    assert.equal(snapshot.ready, true); assert.ok(snapshot.glow > .5);
    assert.ok(proof.emission[0] > .5); assert.deepEqual(proof.flash, before.flash);
    assert.deepEqual(proof.glow, before.glow, 'other motion/status uniforms retain native ownership');
    assert.ok(difference(before, proof) > .01, 'drawn squid vertices change beyond assigning a target');
    const star = after.ch.squid.pivot.getObjectByName('s3-wall-ready-glint');
    assert.ok(star.visible && star.geometry.index.count === 24 && star.material.opacity > .9);
    assert.equal(star.material.depthTest, false, 'local cue survives the same inked-wall occlusion as native ghost');
    assert.equal(after.ch.squid.ghost.visible, true);
    const shader = { uniforms: {}, vertexShader: api.THREE.ShaderLib.physical.vertexShader,
      fragmentShader: api.THREE.ShaderLib.physical.fragmentShader };
    after.ch.mats.squid.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /totalEmissiveRadiance/);
    assert.match(shader.vertexShader, /transformed\.xz \+= rad/);
    assert.equal(shader.uniforms.uWig, after.ch.u.uWig);
    after.a.form = 'kid'; after.a.climbing = false; after.a.grounded = true; after.a.s3.actions.surge = null;
    for (let i = 0; i < 90; i++) after.draw();
    assert.ok(after.grip() < .025, 'native hand grip remains solved after wall return');
    assert.ok(Array.from(after.ch.ikErr.slice(0, 2)).every(x => x < .0005));
    evidence('native-before-after.json', { before, ready: proof, returned: posed(after.ch, api.THREE), snapshot,
      interpretation: 'native indexed geometry and CPU evaluation of its shader wiggle; no browser or Switch IK parity claim' });
  } finally { after.close(); }
});

test('production FixedClock yields the same native wall geometry and gameplay at 30/60/120Hz render rates', async () => {
  const api = await production(), traces = [nativeWallTrace(api, 60)];
  for (const hz of [30, 120]) traces.push(nativeWallTrace(api, hz));
  for (const trace of traces.slice(1)) {
    assert.deepEqual(trace.rows, traces[0].rows);
    for (let i = 0; i < trace.poses.length; i++) {
      assert.deepEqual(trace.poses[i].posed.vertices, traces[0].poses[i].posed.vertices);
      assert.deepEqual(trace.poses[i].posed.squidQuaternion, traces[0].poses[i].posed.squidQuaternion);
      assert.deepEqual(trace.poses[i].motion, traces[0].poses[i].motion);
    }
  }
  evidence('native-fixed-clock-traces.json', { renderHz: [60, 30, 120], traces });
});

test('actual surge charge/release/ledge path has smooth shape recovery and frozen dt0 state at 30/60/120Hz', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), dt = 1 / hz;
    try {
      r.climb(); r.a.intent.jump = true;
      for (let i = 0; i < Math.round(.75 * hz); i++) r.action(dt);
      assert.equal(r.a.s3.surge.charge, 1);
      const frozen = api.wallMotionSnapshot(r.ch), physics = gameplay(r.a);
      r.draw(0); assert.deepEqual(api.wallMotionSnapshot(r.ch), frozen);
      assert.deepEqual(gameplay(r.a), physics);
      const releaseStart = r.ch.squid.pivot.scale.clone(), rows = [];
      r.a.intent.jump = false; r.action(dt);
      assert.equal(api.wallMotionSnapshot(r.ch).phase, 'launch');
      assert.ok(r.ch.squid.pivot.scale.y / releaseStart.y < 1.27, 'old 49% release stretch pop is removed');
      for (let i = 0; i < Math.round(.1 * hz); i++) { r.action(dt); rows.push({ ...api.wallMotionSnapshot(r.ch), pose: posed(r.ch, api.THREE) }); }
      // Real native _ledgePop + installed gameplay wrapper; only collision is a fixture.
      const before = gameplay(r.a), q = r.ch.squid.pivot.getWorldQuaternion(new api.THREE.Quaternion());
      r.a._ledgePop(new api.THREE.Vector3(0, 0, -1));
      assert.equal(r.a.climbing, false); assert.ok(r.a.vel.y >= before.vel[1]);
      r.draw(dt); assert.equal(api.wallMotionSnapshot(r.ch).phase, 'crest');
      assert.ok(q.angleTo(r.ch.squid.pivot.getWorldQuaternion(new api.THREE.Quaternion())) < .3,
        'crest begins from the actual wall orientation instead of a full-turn snap');
      for (let i = 0; i < Math.ceil(.35 * hz); i++) r.draw(dt);
      assert.equal(api.wallMotionSnapshot(r.ch).phase, null);
      near(r.ch.squid.pivot.quaternion.angleTo(r.ch.sqQuat), 0, 1e-7);
      assert.deepEqual(Array.from(r.ch.mats.squid.emissive.toArray()), [0, 0, 0]);
      traces.push({ hz, rows, end: posed(r.ch, api.THREE) });
    } finally { r.close(); }
  }
  evidence('native-wall-rate-traces.json', traces);
});

test('visual draws do not modify gameplay, clocks beyond native dt, IK or indexed geometry ownership', async () => {
  const api = await production(), r = rig(api);
  try {
    r.climb(); r.a.intent.jump = true;
    for (let i = 0; i < 45; i++) r.action();
    const before = gameplay(r.a), geometry = r.ch.squid.body.geometry;
    const positions = Array.from(geometry.attributes.position.array), index = Array.from(geometry.index.array);
    for (let i = 0; i < 12; i++) r.draw(0);
    assert.deepEqual(gameplay(r.a), before);
    assert.deepEqual(Array.from(geometry.attributes.position.array), positions);
    assert.deepEqual(Array.from(geometry.index.array), index);
    const snapshot = api.wallMotionSnapshot(r.ch); assert.equal(snapshot.readyAge, 0);
  } finally { r.close(); }
});

test('form/sub/weapon/action interruption, hidden death/reset and preview cleanup cannot strand a wall cue', async () => {
  const api = await production();
  for (const kind of ['form', 'sub', 'weapon', 'roll', 'special', 'superjump', 'reset', 'death', 'hidden']) {
    const r = rig(api);
    try {
      r.climb(); r.a.intent.jump = true; for (let i = 0; i < 45; i++) r.action();
      assert.ok(api.wallMotionSnapshot(r.ch).glow > .5);
      if (kind === 'form') { r.a.form = 'kid'; r.a.climbing = false; }
      if (kind === 'sub') r.a.weaponRunner.aimingSub = true;
      if (kind === 'weapon') r.a.setWeapon('roller');
      if (kind === 'roll') { r.a.s3.actions.roll = { time: .2 }; r.a.s3.actions.surge = null; r.ch.trigger('squidroll', { duration: .2 }); }
      if (kind === 'special') r.a.specialActive = { id: 'fixture' };
      if (kind === 'superjump') r.a.superJumpState = { phase: 'charge', t: 0 };
      if (kind === 'reset') r.a.reset();
      if (kind === 'death') r.a.splat(null, 'shot');
      if (kind === 'hidden') { r.ch.root.visible = false; r.a.s3.actions.surge = null; }
      const gameplayBefore = gameplay(r.a); r.draw(0);
      assert.equal(api.wallMotionSnapshot(r.ch).phase, null, kind);
      assert.deepEqual(Array.from(r.ch.mats.squid.emissive.toArray()), [0, 0, 0], kind);
      assert.equal(r.ch.squid.pivot.getObjectByName('s3-wall-ready-glint').visible, false, kind);
      // _finishFrame owns transforms/animation state but cannot rewrite the action.
      const { clocks: beforeClocks, ...beforeGameplay } = gameplayBefore;
      const { clocks: afterClocks, ...afterGameplay } = gameplay(r.a);
      // Native _formEnter owns T_FORM resets even at dt0; visual clocks are
      // compared separately by the paused and full before/after physics tests.
      assert.deepEqual(afterGameplay, beforeGameplay, kind);
    } finally { r.close(); }
  }
  const ch = new api.Character({ name: 'nullable wall preview', weapon: 'shooter', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  try {
    ch.onEvent = null; assert.doesNotThrow(() => ch.update(0, null));
    const s = { form: 'climb', grounded: false, speed: 0, vy: 0, wallNormal: new api.THREE.Vector3(0, 0, 1) };
    for (let i = 0; i < 45; i++) ch.update(1 / 60, s);
    ch.trigger('squidsurge', { charge: .4, duration: .12 }); ch.update(0, s);
    assert.equal(api.wallMotionSnapshot(ch).phase, 'launch');
    for (let i = 0; i < 12; i++) ch.update(1 / 60, s);
    assert.equal(api.wallMotionSnapshot(ch).phase, null);
    assert.doesNotThrow(() => ch.update(0, null));
  } finally { ch.dispose(); }
  assert.equal(api.wallMotionSnapshot(ch), null);
});

test('ready resources dispose once; repeated readiness reuses actual indexed glint', async () => {
  const api = await production(), r = rig(api);
  r.climb(); r.a.intent.jump = true; for (let i = 0; i < 45; i++) r.action();
  const star = r.ch.squid.pivot.getObjectByName('s3-wall-ready-glint');
  let geometryDisposals = 0, materialDisposals = 0;
  star.geometry.addEventListener('dispose', () => geometryDisposals++);
  star.material.addEventListener('dispose', () => materialDisposals++);
  r.a.s3.actions.surge = null; r.draw(); r.a.intent.jump = true;
  for (let i = 0; i < 45; i++) r.action();
  assert.equal(r.ch.squid.pivot.getObjectByName('s3-wall-ready-glint'), star);
  r.close(); assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  r.ch.dispose(); assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  assert.equal(star.parent, null); assert.equal(api.wallMotionSnapshot(r.ch), null);
});

test('local wall ghost remains readable without exposing submerged remote readiness through geometry', async () => {
  const api = await production(), r = rig(api);
  try {
    r.a.isLocal = r.ch.isLocal = false;
    r.climb(); r.a.intent.jump = true; for (let i = 0; i < 45; i++) r.action();
    assert.equal(api.wallMotionSnapshot(r.ch).ready, true);
    assert.equal(r.ch.squid.ghost.visible, false);
    assert.equal(r.ch.squid.pivot.getObjectByName('s3-wall-ready-glint'), undefined);
    assert.deepEqual(Array.from(r.ch.mats.squid.emissive.toArray()), [0, 0, 0]);
  } finally { r.close(); }
});

test('hide and dance immediately retire readiness and disposed wall state stays retired', async () => {
  const api = await production();
  for (const event of ['hide', 'dance', 'flick', 'shootL', 'special_leap', 'dispose']) {
    const r = rig(api);
    try {
      r.climb(); r.a.intent.jump = true; for (let i = 0; i < 45; i++) r.action();
      const star = r.ch.squid.pivot.getObjectByName('s3-wall-ready-glint');
      assert.equal(star.visible, true);
      if (event === 'hide') r.ch.setVisible(false);
      if (event === 'dance') r.ch.setDance('victory');
      if (event === 'dispose') r.ch.dispose();
      if (['flick', 'shootL', 'special_leap'].includes(event)) r.ch.trigger(event);
      assert.equal(api.wallMotionSnapshot(r.ch)?.phase ?? null, null, event);
      assert.equal(star.visible, false, event);
      assert.deepEqual(Array.from(r.ch.mats.squid.emissive.toArray()), [0, 0, 0]);
      if (event === 'dispose') {
        r.ch.update(0, null); r.ch.trigger('squidsurge');
        assert.equal(api.wallMotionSnapshot(r.ch), null);
        assert.equal(star.parent, null);
      }
    } finally { r.close(); }
  }
});

test('readiness indexed glint faces the camera without inheriting mantle squash and skips normal/depth draws', async () => {
  const api = await production(), r = rig(api), { THREE, G } = api;
  try {
    r.climb(); r.a.intent.jump = true; for (let i = 0; i < 45; i++) r.action();
    const star = r.ch.squid.pivot.getObjectByName('s3-wall-ready-glint');
    const p = new THREE.Vector3(), cameraX = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(G.camera.getWorldQuaternion(new THREE.Quaternion()));
    const cameraY = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(G.camera.getWorldQuaternion(new THREE.Quaternion()));
    star.updateWorldMatrix(true, false);
    const center = star.getVertexPosition(star.geometry.index.getX(0), p).applyMatrix4(star.matrixWorld).clone();
    const x = star.getVertexPosition(3, p).applyMatrix4(star.matrixWorld).clone().sub(center);
    const y = star.getVertexPosition(1, p).applyMatrix4(star.matrixWorld).clone().sub(center);
    near(x.length(), y.length(), 1e-8);
    assert.ok(x.normalize().dot(cameraX) > 1 - 1e-8);
    assert.ok(y.normalize().dot(cameraY) > 1 - 1e-8);
    const before = posed(r.ch, THREE), normal = new THREE.MeshNormalMaterial();
    // Exercise the real cue's renderer hook with the actual THREE scene and
    // indexed draw. This is a CPU gate contract, not a GPU render assertion.
    try {
      G.scene.overrideMaterial = normal;
      star.onBeforeRender(null, G.scene, G.camera, star.geometry, normal, null);
      assert.equal(star.geometry.drawRange.count, 0);
      G.scene.overrideMaterial = null;
      star.onBeforeRender(null, G.scene, G.camera, star.geometry, star.material, null);
      assert.equal(star.geometry.drawRange.count, star.geometry.index.count);
      const secondCamera = new THREE.PerspectiveCamera();
      secondCamera.quaternion.setFromEuler(new THREE.Euler(.37, -.64, .22, 'XYZ'));
      star.onBeforeRender(null, G.scene, secondCamera, star.geometry, star.material, null);
      const renderedX = star.getVertexPosition(3, p).applyMatrix4(star.matrixWorld).clone().sub(center);
      const renderedY = star.getVertexPosition(1, p).applyMatrix4(star.matrixWorld).clone().sub(center);
      assert.ok(renderedX.clone().normalize().dot(new THREE.Vector3(1, 0, 0)
        .applyQuaternion(secondCamera.quaternion)) > 1 - 1e-8, 'use the actual draw camera');
      assert.ok(renderedY.clone().normalize().dot(new THREE.Vector3(0, 1, 0)
        .applyQuaternion(secondCamera.quaternion)) > 1 - 1e-8);
      near(renderedX.length(), renderedY.length());
      star.onBeforeRender(null, G.scene, G.camera, star.geometry, star.material, null);
      assert.deepEqual(posed(r.ch, THREE), before, 'overlay pass gating does not change native squid/skinned vertices or IK');
    } finally { G.scene.overrideMaterial = null; normal.dispose(); }
  } finally { r.close(); }
});
