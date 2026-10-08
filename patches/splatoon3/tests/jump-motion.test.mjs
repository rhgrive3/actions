import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installJumpMotion as duplicateInstall, jumpReferenceCandidate, JUMP_REFERENCE_CANDIDATES } from '../runtime/jump-motion.mjs';

// Actual production installer + native Character/Actor/Runner/THREE in one
// realm. World collision is outside this pose test; no rig or IK test double.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;
const evidenceRows = [];
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const text = fs.readFileSync(file, 'utf8');
    const m = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), text) : text,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installJumpMotion, jumpMotionSnapshot } from './patches/splatoon3/runtime/jump-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'jump-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installJumpMotion(api, profile);
  const before = ['trigger', 'update', '_poseAir', 'setWeapon', 'dispose'].map(k => api.Character.prototype[k]);
  const reset = api.Actor.prototype.reset;
  api.installJumpMotion(api, profile); duplicateInstall(api, profile);
  assert.deepEqual(['trigger', 'update', '_poseAir', 'setWeapon', 'dispose'].map(k => api.Character.prototype[k]), before);
  assert.equal(api.Actor.prototype.reset, reset);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true };
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(k => [k, () => {}]));
  G.actors = []; G.time = 0;
  cached = api; return api;
}
function rig(api, enabled = true, kind = 'shooter', speed = 0, aim = true) {
  const a = new api.Actor({ team: 0, name: 'native jump regression', weapon: kind,
    CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null;
  ch.s3JumpMotionEnabled = enabled; api.G.scene.add(ch.root);
  a.grounded = a.ground.hit = true; a.vel.set(0, 0, speed);
  function visual(dt = 1 / 60, fire = aim) {
    a.intent.fire = fire; a.weaponRunner.update(dt, { fire }); a._finishFrame(dt);
    ch.root.updateMatrixWorld(true); ch.skeleton.update();
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  }
  for (let i = 0; i < 90; i++) visual();
  const input = { form: 'kid', grounded: false, speed, localMove: { x: 0, z: 1 },
    firing: aim, charge: 0, hp: 1, ink: 1, vy: 0, aimPitch: .15, runner: a.weaponRunner };
  const air = ch._poseAir;
  ch._poseAir = function (...args) {
    const springs = Array.from(this.sp), timers = Array.from(this.tr), root = this.root.matrix.toArray();
    const gameplay = [a.ink, a.hp, a.weaponRunner.charge, a.weaponRunner.cooldown, a.weaponRunner.lockT];
    const result = air.apply(this, args);
    assert.deepEqual(Array.from(this.sp), springs, 'air hook never writes native springs');
    assert.deepEqual(Array.from(this.tr), timers, 'air hook never writes native clocks');
    assert.deepEqual(this.root.matrix.toArray(), root);
    assert.deepEqual([a.ink, a.hp, a.weaponRunner.charge, a.weaponRunner.cooldown, a.weaponRunner.lockT], gameplay);
    return result;
  };
  const startZ = a.pos.z;
  function begin() { a.grounded = false; ch.trigger('jump'); }
  function frame(t, dt = 1 / 60) {
    // Deterministic externally supplied trajectory, shared by before/after.
    // It is not a measured Splatoon trajectory or a replacement physics test.
    a.pos.y = 4 * t - 4 * t * t; a.pos.z = startZ + speed * t; a.vel.y = input.vy = 4 - 8 * t;
    ch.root.position.copy(a.pos); ch.update(dt, input); ch.root.updateMatrixWorld(true); ch.skeleton.update();
  }
  return { a, ch, input, begin, frame, visual,
    close() { ch.dispose(); assert.equal(ch.root.parent, null); assert.equal(api.jumpMotionSnapshot(ch), null); } };
}
function row(api, r, stage) {
  const { ch } = r, V = api.THREE.Vector3;
  const local = name => ch.kid.worldToLocal(ch.bones[name].getWorldPosition(new V())).toArray();
  const mesh = ch.root.getObjectsByProperty('isSkinnedMesh', true).find(m => m.visible && m.name.startsWith('kid:skin:'));
  assert.ok(mesh?.geometry.index?.count > 0, 'actual drawn indexed body mesh');
  const indices = new Set(Array.from(mesh.geometry.index.array));
  const skin = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
  const legs = new Set(['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'].map(n => ch.boneList.indexOf(ch.bones[n])));
  const vertices = [...indices].filter(i => [0, 1, 2, 3].some(j => legs.has(skin.getComponent(i, j)) && weights.getComponent(i, j) > .1));
  assert.ok(vertices.length > 50, 'sample real drawn leg vertices through native skinning');
  const geometry = vertices.filter((_, i) => i % Math.max(1, Math.floor(vertices.length / 24)) === 0)
    .map(i => ({ index: i, world: mesh.localToWorld(mesh.getVertexPosition(i, new V())).toArray() }));
  return { stage, diagnostic: api.jumpMotionSnapshot(ch), pose: Array.from(ch.P),
    bones: Object.fromEntries(['hips', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'handL', 'handR'].map(n => [n, local(n)])),
    boneQuaternions: Object.fromEntries(['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'].map(n => [n, ch.bones[n].quaternion.toArray()])),
    geometry: { mesh: mesh.name, triangles: mesh.geometry.index.count / 3, vertices: geometry },
    nativeIK: Array.from(ch.ikErr), root: ch.root.position.toArray(),
    weapon: ch.weapon.off.matrixWorld.toArray(), muzzle: ch.getMuzzle(new V()).toArray(),
    nativeTimers: Array.from(ch.tr), springs: Array.from(ch.sp) };
}
function saveTrace(rows) {
  const destination = process.env.INKWAVE_JUMP_TRACE_PATH;
  if (!destination) return;
  evidenceRows.push(...rows);
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const file = path.join(folder, path.basename(destination));
  const body = { schema: 1, evidence: 'Native CPU pose, bones, indexed skinned vertices and IK; GPU/browser and original hardware comparison remain parent-owned.',
    runtimeSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/jump-motion.mjs'))).digest('hex'), rows: evidenceRows };
  fs.writeFileSync(file + '.pending', JSON.stringify(body, null, 2) + '\n'); fs.renameSync(file + '.pending', file);
}
function saveNativeProjection(api, r, stage) {
  const destination = process.env.INKWAVE_JUMP_TRACE_PATH;
  if (!destination) return;
  const folder = fs.realpathSync(path.dirname(destination));
  assert.ok(folder.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/'));
  const triangles = [], V = api.THREE.Vector3;
  r.ch.root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry.index) return;
    for (let p = mesh; p; p = p.parent) if (!p.visible) return;
    const geo = mesh.geometry, index = geo.index;
    const vertices = Array.from({ length: geo.attributes.position.count }, (_, i) => {
      const p = mesh.getVertexPosition(i, new V());
      r.ch.root.worldToLocal(mesh.localToWorld(p));
      return p;
    });
    const hue = mesh.name.startsWith('kid:skin:') ? '#edb398' : mesh.name.startsWith('kid:cloth:') ? '#45546b'
      : mesh.name.startsWith('kid:hair:') ? '#f6c72b' : '#697b84';
    for (let i = 0; i < index.count; i += 3) {
      const vs = [vertices[index.getX(i)], vertices[index.getX(i + 1)], vertices[index.getX(i + 2)]];
      // Orthographic three-quarter projection of actual indexed triangles.
      const pts = vs.map(p => [200 + (p.z + .35 * p.x) * 210, 385 - p.y * 210]);
      const area = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]);
      if (Math.abs(area) < .03) continue;
      const shade = Math.max(.5, Math.min(1, .65 + Math.abs(area) * .015));
      triangles.push({ depth: vs.reduce((n, p) => n + p.x - p.z * .35, 0),
        svg: `<polygon points="${pts.map(p => p.map(x => x.toFixed(2)).join(',')).join(' ')}" fill="${hue}" opacity="${shade.toFixed(2)}"/>` });
    }
  });
  triangles.sort((a, b) => a.depth - b.depth);
  const content = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="440" viewBox="0 0 420 440"><rect width="420" height="440" fill="#f7f8fc"/><text x="12" y="22" font-family="sans-serif" font-size="15">${stage}; native indexed mesh projection</text><text x="12" y="425" font-family="sans-serif" font-size="12">CPU diagnostic projection; GPU/browser pending</text>${triangles.map(t => t.svg).join('')}</svg>`;
  const file = path.join(folder, `${stage}.svg`);
  fs.writeFileSync(file + '.pending', content); fs.renameSync(file + '.pending', file);
}

test('aimed ordinary jump bends both knees with rearward shoes in actual native geometry', async () => {
  const api = await production(), C = api.CHARACTER_CHANNELS, traces = [];
  const changed = new Set([C.FOOTL, C.FOOTR, C.FOOTLR, C.FOOTRR].flatMap(x => [x, x + 1, x + 2]));
  for (const speed of [0, 4.32]) {
    const before = rig(api, false, 'shooter', speed), after = rig(api, true, 'shooter', speed);
    try {
      before.begin(); after.begin();
      for (let f = 1; f <= 54; f++) {
        before.frame(f / 60); after.frame(f / 60);
        for (let i = 0; i < before.ch.P.length; i++) if (!changed.has(i)) assert.equal(after.ch.P[i], before.ch.P[i], `unowned pose channel ${i}`);
        assert.deepEqual(Array.from(after.ch.tr), Array.from(before.ch.tr), 'native clocks untouched');
        assert.deepEqual(after.a.pos.toArray(), before.a.pos.toArray());
        assert.deepEqual(after.a.vel.toArray(), before.a.vel.toArray());
        assert.equal(after.a.ink, before.a.ink); assert.equal(after.a.hp, before.a.hp);
        if ([1, 12, 30, 42, 54].includes(f)) {
          const b = row(api, before, `before-${speed}-${f}`), a = row(api, after, `after-${speed}-${f}`);
          traces.push(b, a);
          // The native pelvis reach solver can shift the entire torso slightly;
          // preserve the aim anchor channels and actual native grip/IK, and
          // bound the resulting world muzzle difference rather than disabling IK.
          assert.ok(Math.hypot(...a.muzzle.map((x, i) => x - b.muzzle[i])) < .001, 'native weapon transform stays stable');
          const hand = after.ch.bones.handR.getWorldPosition(new api.THREE.Vector3());
          assert.ok(after.ch.weapon.off.localToWorld(after.ch.weapon.def.handR.pos.clone()).distanceTo(hand) < .025, 'native drawn weapon grip');
          assert.deepEqual(a.root, b.root);
          assert.ok(a.nativeIK.every(e => e < .0005), 'native IK reaches both ankles and weapon grips');
          if (f === 1) assert.deepEqual(a.boneQuaternions, b.boneQuaternions, 'push-off extension preserved');
          if (f === 30) {
            saveNativeProjection(api, before, `before-apex-${speed}`);
            saveNativeProjection(api, after, `after-apex-${speed}`);
            for (const side of ['L', 'R']) {
              assert.ok(a.bones['foot' + side][2] < a.bones.hips[2] - .08, 'drawn ankle behind hips at apex');
              assert.ok(a.bones['shin' + side][2] > a.bones['foot' + side][2] + .05, 'native knee bends ahead of rearward shoe');
              assert.ok(a.bones['foot' + side][1] > .25, 'both legs flexed');
            }
            assert.ok(a.geometry.vertices.some((v, i) => Math.hypot(...v.world.map((x, j) => x - b.geometry.vertices[i].world[j])) > .05), 'drawn vertices change, not only assigned targets');
          }
        }
      }
    } finally { before.close(); after.close(); }
  }
  saveTrace(traces);
});

test('production fixed clock composes jump at 30/60/120Hz; paused dt0 does not advance jump age', async () => {
  const api = await production(), traces = [];
  for (const hz of [30, 60, 120]) {
    const r = rig(api), clock = new api.FixedClock(), rows = [];
    try {
      r.begin();
      for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
        r.frame((clock.ticks + 1) / 60, dt);
        rows.push({ pose: Array.from(r.ch.P), bones: r.ch.boneList.map(b => b.quaternion.toArray()), ik: Array.from(r.ch.ikErr), snapshot: api.jumpMotionSnapshot(r.ch) });
      });
      assert.equal(clock.ticks, 60); traces.push(rows);
      const age = api.jumpMotionSnapshot(r.ch).age, timers = Array.from(r.ch.tr);
      r.frame(1, 0); assert.equal(api.jumpMotionSnapshot(r.ch).age, age); assert.deepEqual(Array.from(r.ch.tr), timers);
      const ticks = clock.ticks; clock.advance(0, () => assert.fail('paused frame must not tick')); assert.equal(clock.ticks, ticks);
    } finally { r.close(); }
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
  // Direct native variable-dt preview is also checked qualitatively; native
  // spring/filter integration is not asserted numerically equal across dt.
  for (const hz of [30, 60, 120]) {
    const r = rig(api);
    try {
      r.begin(); for (let f = 1; f <= hz / 2; f++) r.frame(f / hz, 1 / hz);
      const a = row(api, r, `direct-${hz}-apex`);
      assert.ok(a.bones.footL[2] < -.08 && a.bones.footR[2] < -.08);
      assert.ok(a.nativeIK.every(e => e < .0005));
      assert.ok(Math.abs(a.diagnostic.age - .5) < 1e-12);
    } finally { r.close(); }
  }
});

test('interruptions cannot resume an old jump; landing, carry, other weapons and off-ledge falls retain native pose', async () => {
  const api = await production();
  for (const interrupt of ['reset', 'death', 'form', 'sub', 'weapon', 'special', 'superjump', 'land', 'dodge', 'throw', 'spawn', 'hidden']) {
    const r = rig(api);
    try {
      r.begin(); for (let i = 1; i <= 16; i++) r.frame(i / 60);
      assert.ok(api.jumpMotionSnapshot(r.ch).weight > .5);
      if (interrupt === 'reset') r.a.reset();
      else if (interrupt === 'death') r.a.alive = false;
      else if (interrupt === 'form') r.input.form = 'squid';
      else if (interrupt === 'sub') r.input.subAim = true;
      else if (interrupt === 'weapon') r.a.setWeapon('charger');
      else if (interrupt === 'special') r.a.specialActive = { id: 'leap' };
      else if (interrupt === 'superjump') r.a.superJumpState = { phase: 1 };
      else if (interrupt === 'hidden') { r.ch.setVisible(false); r.input.form = 'squid'; }
      else r.ch.trigger(interrupt, interrupt === 'dodge' ? { t: .2 } : undefined);
      r.frame(.3); assert.equal(api.jumpMotionSnapshot(r.ch).active, false, interrupt);
      r.ch.setVisible(true); r.input.form = 'kid'; r.input.subAim = false; r.a.alive = true;
      r.a.specialActive = r.a.superJumpState = null;
      r.frame(.4); assert.equal(api.jumpMotionSnapshot(r.ch).active, false, 'interrupted jump stays cancelled');
    } finally { r.close(); }
  }
  for (const scenario of ['carry', 'fall', 'landing', 'dualies', 'charger', 'roller', 'slosher', 'splatling', 'blaster']) {
    const kind = ['carry', 'fall', 'landing'].includes(scenario) ? 'shooter' : scenario;
    const a = rig(api, true, kind, 0, scenario !== 'carry'), b = rig(api, scenario === 'landing', kind, 0, scenario !== 'carry');
    try {
      if (scenario !== 'fall') { a.begin(); b.begin(); }
      for (let f = 1; f <= 40; f++) {
        if (scenario === 'landing' && f === 20) {
          b.ch.s3JumpMotionEnabled = false;
          a.input.grounded = b.input.grounded = true; a.ch.trigger('land', 8); b.ch.trigger('land', 8);
        }
        a.frame(f / 60); b.frame(f / 60);
        assert.deepEqual(Array.from(a.ch.P), Array.from(b.ch.P), scenario);
      }
    } finally { a.close(); b.close(); }
  }
  const preview = new api.Character({ name: 'nullable jump preview' });
  try { preview.update(0, null); preview.trigger('jump'); preview.update(1 / 60, null); assert.ok(Array.from(preview.P).every(Number.isFinite)); }
  finally { preview.dispose(); }
});


test('hiding an airborne character cancels ordinary jump without a form change', async () => {
  const api = await production();
  for (const ancestor of [false, true]) {
    const r = rig(api);
    try {
      r.begin(); for (let i = 1; i <= 16; i++) r.frame(i / 60);
      assert.ok(api.jumpMotionSnapshot(r.ch).weight > .5);
      if (ancestor) api.G.scene.visible = false; else r.ch.setVisible(false);
      r.frame(.3); assert.equal(api.jumpMotionSnapshot(r.ch).active, false);
      api.G.scene.visible = true; r.ch.setVisible(true); r.frame(.4);
      assert.equal(api.jumpMotionSnapshot(r.ch).active, false);
    } finally { api.G.scene.visible = true; r.close(); }
  }
});


test('ordinary input-driven jump uses actual production Actor/Runner/Physics through apex and landing at 30/60/120Hz', async () => {
  const api = await production(), { G, THREE, Physics } = api, V = THREE.Vector3;
  const previous = { physics: G.physics, level: G.level };
  const center = new V(0, -.1, 0), half = new V(100, .1, 100);
  const floor = { id: 0, solid: true, center, half, axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  const level = { blocks: [floor], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0, spawnPads: [new V(1000, 0, 1000), new V(-1000, 0, -1000)], spawnBarrier: 1,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  const rows = [];
  try {
    G.level = level; G.physics = new Physics(level);
    for (const hz of [30, 60, 120]) {
      const before = rig(api, false), after = rig(api, true);
      try {
        for (const r of [before, after]) { r.a.pos.set(0, 0, 0); r.a.vel.set(0, 0, 0); r.a.intent.fire = true; }
        let airborne = false, landed = false, maxWeight = 0, changedGeometry = false;
        const game = r => ({ pos: r.a.pos.toArray(), vel: r.a.vel.toArray(), ink: r.a.ink, hp: r.a.hp,
          grounded: r.a.grounded, form: r.a.form, landT: r.a.landT, hardLand: r.a.hardLand,
          runner: [r.a.weaponRunner.cooldown, r.a.weaponRunner.charge],
          clocks: Array.from(r.ch.tr), root: r.ch.root.position.toArray() });
        for (let i = 0; i < hz; i++) {
          G.time += 1 / hz;
          for (const r of [before, after]) {
            r.a.intent.jump = i === 0; r.a.update(1 / hz);
            r.ch.root.updateMatrixWorld(true); r.ch.skeleton.update();
          }
          assert.deepEqual(game(after), game(before), 'presentation cannot change input-driven native trajectory or clocks');
          airborne ||= !after.a.grounded; landed ||= airborne && after.a.grounded;
          const weight = api.jumpMotionSnapshot(after.ch).weight;
          if (weight > maxWeight) {
            maxWeight = weight;
            if (weight > .5) {
              const a = row(api, after, 'actual-physics-' + hz + '-' + i), b = row(api, before, 'native-counterfactual-' + hz + '-' + i);
              assert.ok(a.nativeIK.every(x => x < .0005), 'actual native limb IK reaches its drawn endpoints');
              assert.ok(a.bones.footL[2] < a.bones.hips[2] - .06 && a.bones.footR[2] < a.bones.hips[2] - .06);
              changedGeometry ||= a.geometry.vertices.some((v, k) => Math.hypot(...v.world.map((x, j) => x - b.geometry.vertices[k].world[j])) > .01);
              rows.push(b, a);
            }
          }
        }
        assert.ok(airborne && landed, 'real jump input and Physics must take off and emit landing');
        assert.ok(maxWeight > .5 && changedGeometry, 'native trajectory reaches the calibrated indexed-geometry pose');
        assert.equal(after.a.pos.y, 0); assert.equal(after.a.vel.y, 0);
        assert.equal(api.jumpMotionSnapshot(after.ch).active, false);
      } finally { before.close(); after.close(); }
    }
  } finally { G.physics = previous.physics; G.level = previous.level; }
  // The supplied-parabola tests above remain pose-envelope tests only.
  saveTrace(rows);
});


test('fresh ordinary jump after cancelled Slam is not blocked by orphaned leap/slam clocks', async () => {
  const api = await production(), r = rig(api);
  try {
    r.a.weapon={...r.a.weapon,special:'slam'}; // Explicit native pose fixture; current public Shooter uses Trizooka.
    r.a._startSpecial(); assert.equal(r.a.specialActive.id,'slam'); r.visual(); r.a.specialActive = null; r.visual();
    assert.ok(r.ch.tr[api.CHARACTER_TIMERS.T_LEAP] < 1.9);
    r.begin(); for (let i = 1; i <= 16; i++) r.frame(i / 60);
    const output = row(api, r, 'fresh-jump-after-cancelled-slam');
    assert.ok(output.diagnostic.weight > .5);
    assert.ok(output.nativeIK.every(x => x < .0005));
    assert.ok(output.bones.footL[2] < output.bones.hips[2] - .08);
    saveTrace([output]);
  } finally { r.close(); }
});


test('#1116 class jump clip names are reference candidates, not unverified installed pose curves', () => {
  assert.equal(jumpReferenceCandidate('shooter'),'Jump_Shtr00');
  assert.equal(jumpReferenceCandidate('roller'),'Jump_Rllr00');
  assert.equal(jumpReferenceCandidate('dualies'),'Jump_Mnvr00');
  assert.equal(jumpReferenceCandidate('slosher'),'Jump_Slsh00');
  assert.equal(jumpReferenceCandidate('splatling'),'Jump_Spnr00');
  assert.equal(jumpReferenceCandidate('missing-class'),JUMP_REFERENCE_CANDIDATES.fallback);
});
