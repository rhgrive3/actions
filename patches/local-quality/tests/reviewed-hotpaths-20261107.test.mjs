import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { qualityIdentity, replaceOnce } from '../adapter.mjs';
import { adaptReviewedHotpaths20261107 } from '../reviewed-hotpaths-20261107-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { buildSourceBVH } from '../../native-stages/runtime/source-convert.mjs';

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

const env = await fixture({
  fullRuntime: true,
  includeCharacter: true,
  productionComposition: true,
  extraExports: [
    "export { NativeLevel, NativePhysics } from './patches/native-stages/runtime/engine.mjs';",
    "export { installQuality } from './patches/local-quality/install.mjs';",
    "export { Level } from './src/world/level.js';",
    "export { installFlowMotion, flowMotionSnapshot } from './patches/splatoon3/runtime/flow-motion.mjs';",
  ].join('\n'),
});

test('reviewed-hotpaths-20261107-adapter is build-only, identity-tracked, and conflict-guarded', () => {
  assert.equal(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/reviewed-hotpaths-20261107-adapter.mjs'), true);
  const identity = qualityIdentity();
  assert.equal(typeof identity['reviewed-hotpaths-20261107-adapter.mjs'], 'string');
  for (const rel of [
    'src/core/renderer.js',
    'src/game/physics.js',
    'src/game/motion/gait-targets.js',
    'src/game/motion/source-controller.js',
    'src/game/character.js',
  ]) {
    const composed = adaptBuildSource(rel, read(rel));
    assert.throws(() => adaptReviewedHotpaths20261107(rel, composed, replaceOnce), /conflict/);
    assert.throws(() => adaptReviewedHotpaths20261107(rel, '', replaceOnce), /conflict/);
  }
  assert.equal(adaptReviewedHotpaths20261107('src/main.js', 'unchanged', replaceOnce), 'unchanged');
});

test('TriangleWorld.hasWalkableInBox and NativePhysics.groundProbe handle negative raw normal.y, grate bit 4, and dynamic blocks', () => {
  const verts = [
    // Floor at y=0 (+Y normal)
    -5, 0, -5,   -5, 0, 5,    5, 0, 5,
    -5, 0, -5,    5, 0, 5,    5, 0, -5,
    // Elevated walkable ledge at y=0.35 in x=[0.18, 1.0] (+Y normal for rayDownBatch)
    0.18, 0.35, -1,   0.18, 0.35, 1,   1.0, 0.35, 1,
    0.18, 0.35, -1,   1.0, 0.35,  1,   1.0, 0.35, -1,
    // Elevated grate quad at y=0.45 in x=[-1.0, -0.18] (flag bit 4)
    -1.0, 0.45, -1,  -1.0, 0.45,  1,  -0.18, 0.45,  1,
    -1.0, 0.45, -1,  -0.18, 0.45, 1,  -0.18, 0.45, -1,
    // Double-sided floor at y=0.25 in z=[2.0, 3.0] with negative raw normal.y (-1)
    -1, 0.25, 2.0,   1, 0.25, 2.0,   1, 0.25, 3.0,
  ];
  const normals = [
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, -1, 0,
  ];
  const flags = [3, 3, 3, 3, 7, 7, 3]; // 3 = solid non-grate (bit 4 unset), 7 = solid + grate (bit 4 set)
  const triangles = new Float32Array(verts);
  const stageData = {
    triangles,
    normals: new Float32Array(normals),
    flags: new Uint32Array(flags),
    objectIds: new Uint32Array([0, 0, 0, 0, 1, 1, 0]),
    ...buildSourceBVH(triangles),
    triangleFace: new Int32Array(flags.length).fill(-1),
    mask: new Uint8Array(),
    manifest: {
      id: 'hotpath-test',
      bounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 8 },
      spawnPads: [[0, 0, -4], [0, 0, 4]],
      spawnBarrier: 0,
      objects: [
        { name: 'floor', collidable: true, grate: false, bounds: [[-5, -0.1, -5], [5, 0.5, 5]] },
        { name: 'grate', collidable: true, grate: true, bounds: [[-1, 0.4, -1], [-0.18, 0.5, 1]] },
      ],
      faces: [],
    },
  };
  const level = new env.NativeLevel(stageData);
  const world = level.triangleWorld;
  const phys = new env.NativePhysics(level);

  assert.equal(world.normals[6 * 3 + 1], -1, 'double-sided triangle stores negative raw normal.y');
  assert.equal(world.hasWalkableInBox(-0.5, 0.1, 1.9, 0.5, 0.4, 3.1, false, 0.68), true,
    'double-sided floor with negative raw ny must be detected as walkable');
  assert.equal(world.hasWalkableInBox(-0.35, 0.12, -0.3, -0.1, 0.6, 0.3, false, 0.68), true,
    'grate triangle is walkable when ignoreGrates=false');
  assert.equal(world.hasWalkableInBox(-0.35, 0.12, -0.3, -0.1, 0.6, 0.3, true, 0.68), false,
    'grate triangle (bit 4) is skipped when ignoreGrates=true');

  const out = new env.GroundHit();
  phys.groundProbe(0.10, 0, 0, 0.5, 1.0, 0.25, out, false, 0.12);
  assert.equal(out.hit, true);
  assert.equal(out.center, false);
  assert.ok(Math.abs(out.y - 0.35) < 1e-5, `expected step y=0.35, got ${out.y}`);

  phys.groundProbe(-0.10, 0, 0, 0.5, 1.0, 0.25, out, false, 0.12);
  assert.equal(out.grate, true);
  assert.ok(Math.abs(out.y - 0.45) < 1e-5);

  phys.groundProbe(-0.10, 0, 0, 0.5, 1.0, 0.25, out, true, 0.12);
  assert.equal(out.grate, false);
  assert.ok(Math.abs(out.y - 0) < 1e-5);

  // Dynamic collider added after staticBlockCount bypasses static BVH-only ring prune
  const dynId = level.blocks.length;
  level.blocks.push({
    id: dynId,
    center: new env.THREE.Vector3(0, 0.15, -2.0),
    half: new env.THREE.Vector3(0.4, 0.15, 0.4),
    axes: [new env.THREE.Vector3(1, 0, 0), new env.THREE.Vector3(0, 1, 0), new env.THREE.Vector3(0, 0, 1)],
    aabbMin: new env.THREE.Vector3(-0.4, 0, -2.4),
    aabbMax: new env.THREE.Vector3(0.4, 0.30, -1.6),
    solid: true, paint: false, grate: false, aligned: true,
    faces: [-1, -1, -1, -1, -1, -1],
  });
  level._buildHash();
  phys.groundProbe(0, 0, -1.45, 0.5, 1.0, 0.25, out, false, 0.12);
  assert.equal(out.hit, true);
  assert.equal(out.block, dynId);
  assert.ok(Math.abs(out.y - 0.30) < 1e-5);
});

test('Physics.raycast aligned downward fast path and groundProbe per-column prune match general OBB queries bit-for-bit', async () => {
  const baselineEnv = await fixture({
    productionComposition: false,
    adapt: (rel, raw) => {
      const prev = adaptBuildSource(rel, raw);
      if (rel !== 'src/game/physics.js') return prev;
      return prev
        .replace(/if \(b\.aligned && dx0 === 0[\s\S]*?continue;\n        \}\n      \}\n      /, '')
        .replace(/if \(!\(have && len >= 0 && y \+ up <= by\)\) \{[\s\S]*?\n    \}/, `const hr = this._gh2 || (this._gh2 = new Hit());
    for (let i = 0; i < RING.length; i++) {
      _go.set(x + RING[i][0] * foot, y + up, z + RING[i][1] * foot);
      this.raycast(_go, DOWNV, len, hr, skipGrates, columns?.[i + 1]);
      if (!hr.hit || hr.normal.y < WALKABLE) continue;
      if (hr.point.y > by) { by = hr.point.y; bi = i; this._fillGround(out, hr, false); }
    }`);
    },
    extraExports: "export { Level } from './src/world/level.js';",
  });

  function buildTestLevel(E) {
    const lvl = new E.Level({
      id: 'hotpath-box-level',
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      spawnPads: [[0, 0, -4], [0, 0, 4]],
      spawnBarrier: 0,
      single: [
        { kind: 'box', min: [-6, -1, -6], max: [6, 0, 6] },
        { kind: 'box', min: [0.4, 0, -1], max: [1.6, 0.3, 1] },
        { kind: 'box', min: [-1.6, 0.2, -1], max: [-0.4, 0.3, 1], grate: true },
        { kind: 'obox', center: [0, 0.4, 2.0], size: [2.0, 0.4, 1.0], rotY: 0.3 },
      ],
      half: [],
    });
    return new E.Physics(lvl);
  }

  const pNew = buildTestLevel(env);
  const pOld = buildTestLevel(baselineEnv);
  let seed = 1337;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  for (let i = 0; i < 600; i++) {
    const x = (rnd() - 0.5) * 6, y = rnd() * 2 - 0.4, z = (rnd() - 0.5) * 6;
    const maxDist = rnd() * 4, skipGrates = (i & 1) === 1;
    const hNew = new env.Hit(), hOld = new baselineEnv.Hit();
    pNew.raycast(new env.THREE.Vector3(x, y, z), new env.THREE.Vector3(0, -1, 0), maxDist, hNew, skipGrates);
    pOld.raycast(new baselineEnv.THREE.Vector3(x, y, z), new baselineEnv.THREE.Vector3(0, -1, 0), maxDist, hOld, skipGrates);
    assert.equal(hNew.hit, hOld.hit);
    if (hNew.hit) {
      assert.ok(Object.is(hNew.dist, hOld.dist));
      assert.deepEqual(Array.from(hNew.point.toArray()), Array.from(hOld.point.toArray()));
      assert.deepEqual(Array.from(hNew.normal.toArray()), Array.from(hOld.normal.toArray()));
      assert.equal(hNew.block, hOld.block);
      assert.equal(hNew.face, hOld.face);
    }

    const gNew = new env.GroundHit(), gOld = new baselineEnv.GroundHit();
    pNew.groundProbe(x, y, z, 0.5, 2.0, 0.28, gNew, skipGrates, 0.12);
    pOld.groundProbe(x, y, z, 0.5, 2.0, 0.28, gOld, skipGrates, 0.12);
    assert.equal(gNew.hit, gOld.hit);
    if (gNew.hit) {
      assert.ok(Object.is(gNew.y, gOld.y));
      assert.equal(gNew.center, gOld.center);
      assert.equal(gNew.block, gOld.block);
      assert.equal(gNew.grate, gOld.grate);
      assert.deepEqual(Array.from(gNew.normal.toArray()), Array.from(gOld.normal.toArray()));
    }
  }
});

test('flow-motion idle fast path preserves 19-key snapshot and clears uGlow on dead actor with flow.active', () => {
  env.installFlowMotion(env);
  const { Actor, Character, G, THREE, flowMotionSnapshot } = env;
  G.scene ||= new THREE.Scene();
  G.camera ||= new THREE.PerspectiveCamera();
  G.settings ||= { quality: 'high' };
  G.teamColors ||= [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level ||= { blocks: [], groundHeight: () => 0 };
  G.paint ||= { sample: () => 1, splat: () => 0 };
  G.match ||= { playing: () => true, canRespawn: () => false };
  G.physics ||= { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.actors ||= [];

  const actor = new Actor({
    team: 0,
    name: 'flow-hotpath-regression',
    weapon: 'shooter',
    CharacterClass: Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 },
  });
  const ch = actor.character;
  ch.actor = actor;
  G.scene.add(ch.root);
  G.actors.push(actor);
  actor.grounded = actor.ground.hit = true;
  actor._integrate = () => {};
  actor._spawnBarrier = () => {};
  actor._updateClimb = () => {};

  try {
    actor.update(1 / 60);
    actor._finishFrame(1 / 60);
    const snap1 = flowMotionSnapshot(ch);
    assert.ok(snap1);
    assert.equal(Object.keys(snap1).length, 19, 'first idle update initializes full 19-key snapshot');
    assert.equal(snap1.phase, 'off');

    actor.s3.flow.active = true;
    actor.s3.flow.remaining = 5;
    actor._finishFrame(1 / 60);
    assert.equal(flowMotionSnapshot(ch).active, true);

    actor.alive = false;
    ch.u.uGlow.value.setRGB(9, 9, 9);
    actor._finishFrame(1 / 60);
    assert.equal(flowMotionSnapshot(ch).phase, 'off');
    assert.ok(ch.u.uGlow.value.r < 1, 'dead actor resets uGlow even when flow.active is still true');
  } finally {
    G.actors = G.actors.filter(a => a !== actor);
    ch.dispose();
  }
});

test('installQuality Scene.updateMatrixWorld dedup is strictly scoped to _iwComposerPass and Skeleton.update matches Matrix4.multiplyMatrices', () => {
  env.installQuality(env.profile);
  const THREE = env.THREE;
  const scene = new THREE.Scene();
  const child = new THREE.Object3D();
  scene.add(child);

  // Outside composer pass: consecutive updates within the same tick both propagate
  child.position.set(1, 2, 3);
  scene.updateMatrixWorld();
  assert.equal(child.matrixWorld.elements[12], 1);
  child.position.set(7, 8, 9);
  scene.updateMatrixWorld();
  assert.equal(child.matrixWorld.elements[12], 7, 'consecutive calls outside composer.render() are never suppressed');

  // Inside composer pass: redundant second call is skipped unless force=true
  scene._iwComposerPass = true;
  scene._iwComposerWorldReady = false;
  child.position.set(11, 12, 13);
  scene.updateMatrixWorld();
  assert.equal(child.matrixWorld.elements[12], 11);
  child.matrixWorldNeedsUpdate = true;
  scene.updateMatrixWorld();
  assert.equal(child.matrixWorld.elements[12], 11, 'GTAOPass non-forced updateMatrixWorld() is skipped');
  scene.updateMatrixWorld(true);
  assert.equal(child.matrixWorld.elements[12], 11);
  scene._iwComposerPass = false;
  scene._iwComposerWorldReady = false;

  // Verify Skeleton.prototype.update pure-translation fast path matches general multiplyMatrices bit-for-bit
  const b0 = new THREE.Bone(), b1 = new THREE.Bone();
  b0.add(b1);
  b0.position.set(0.3, 1.1, -0.4);
  b0.quaternion.setFromEuler(new THREE.Euler(0.2, -0.5, 0.3));
  b1.position.set(-0.15, 0.42, 0.08);
  b1.quaternion.setFromEuler(new THREE.Euler(-0.4, 0.1, 0.6));
  b0.updateMatrixWorld(true);

  const inv0 = new THREE.Matrix4().makeTranslation(-0.3, -1.1, 0.4); // pure translation
  const inv1 = new THREE.Matrix4().copy(b1.matrixWorld).invert();    // general rotation+translation
  const skel = new THREE.Skeleton([b0, b1], [inv0, inv1]);
  skel.update();

  const expected = new Float32Array(32);
  const scratch = new THREE.Matrix4();
  scratch.multiplyMatrices(b0.matrixWorld, inv0).toArray(expected, 0);
  scratch.multiplyMatrices(b1.matrixWorld, inv1).toArray(expected, 16);
  for (let i = 0; i < 32; i++) {
    assert.ok(Object.is(skel.boneMatrices[i], expected[i]), `element ${i}: ${skel.boneMatrices[i]} vs ${expected[i]}`);
  }
});
