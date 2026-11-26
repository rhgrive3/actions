import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nativeApproachEdgeAllowed, nativePaintGoalIds } from '../runtime/native-bots.mjs';
import { nativeTowerClearance } from '../runtime/native-tower-clearance.mjs';
import { nativeTowerBoarding } from '../runtime/native-tower-boarding.mjs';
import { buildSourceBVH } from '../runtime/source-convert.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { nativeFixture } from './fixture.mjs';

if (!vm.SourceTextModule) {
  test('audit-native-stages-p0-p1 (vm-modules subprocess)', () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(
      process.execPath,
      ['--experimental-vm-modules', '--test', fileURLToPath(import.meta.url)],
      { env, stdio: 'pipe' },
    );
  });
} else {
  const f = await nativeFixture();
  const THREE = f.THREE;

  function makeLevel(
    triangles,
    { nodes, order } = { nodes: new Float32Array(0), order: new Uint32Array(0) },
    normals = new Float32Array(0),
    flags = new Uint32Array(0),
    objectIds = new Uint32Array(0),
    triangleFace = new Int32Array(0),
  ) {
    return new f.NativeLevel({
      triangles,
      nodes,
      order,
      normals,
      flags,
      objectIds,
      triangleFace,
      mask: new Uint8Array(0),
      manifest: {
        id: 'audit-native-stages-unit-fixture',
        bounds: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
        spawnPads: [[-5, 0, 0], [5, 0, 0]],
        spawnBarrier: 1,
        objects: [],
        faces: [],
      },
    });
  }

  test('P0-9: TriangleWorld ray/rayDownBatch/queryBox and NativeLevel groundHeight/hasGroundAbove guard empty or truncated BVH', () => {
    for (const len of [0, 4, 7]) {
      const level = makeLevel(new Float32Array(0), { nodes: new Float32Array(len), order: new Uint32Array(0) });
      const world = level.triangleWorld;
      const origin = new THREE.Vector3(0, 5, 0);
      const dir = new THREE.Vector3(0, -1, 0);

      assert.equal(world.ray(origin, dir, 20), null);
      assert.equal(world._queryDepth, 0);

      const outputs = [
        { hit: true, point: new THREE.Vector3(), normal: new THREE.Vector3() },
        { hit: true, point: new THREE.Vector3(), normal: new THREE.Vector3() },
      ];
      const batch = world.rayDownBatch([origin, origin], 20, {}, outputs);
      assert.equal(batch, outputs);
      assert.equal(outputs[0].hit, false);
      assert.equal(outputs[1].hit, false);
      assert.equal(world._queryDepth, 0);

      let visited = 0;
      world.queryBox(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10), () => { visited++; });
      assert.equal(visited, 0);
      assert.equal(world._queryDepth, 0);

      assert.equal(level.groundHeight(0, 0, 50), -Infinity);
      assert.equal(level.hasGroundAbove(0, 0, 50, -10), false);
      assert.equal(world._queryDepth, 0);
    }
  });

  test('P1-15: NativePhysics._sourceBodyFits expands broad-phase AABB by pad when margin < 0', () => {
    // Vertical triangle at x = 0.45 (z in [-1, 1], y in [0, 2]).
    // Capsule at x = 0 with radius = 0.35: distance = 0.45.
    // With margin = -0.2, required clearance is radius - margin = 0.55 > 0.45 -> must NOT fit.
    const triangles = new Float32Array([
      0.45, 0, -1, 0.45, 2, -1, 0.45, 2, 1,
      0.45, 0, -1, 0.45, 2, 1, 0.45, 0, 1,
    ]);
    const bvh = buildSourceBVH(triangles);
    const level = makeLevel(
      triangles,
      bvh,
      new Float32Array([-1, 0, 0, -1, 0, 0]),
      new Uint32Array([1, 1]),
      new Uint32Array([0, 0]),
      new Int32Array([-1, -1]),
    );
    const physics = new f.NativePhysics(level);
    const pos = new THREE.Vector3(0, 0, 0);
    assert.equal(physics._sourceBodyFits(pos, 0.35, 0.1, 1.45, false, -0.2), false);
    assert.equal(physics._sourceBodyFits(pos, 0.35, 0.1, 1.45, false, 0.01), true);
  });

  test('P1-17: nativePaintGoalIds filters approach/gap-jump edges by loadout and invalidates cache on loadout/flag change', () => {
    // Direct plain-Node ESM import of native-bots.mjs (zero external deps) + engine re-export check
    assert.equal(typeof nativeApproachEdgeAllowed, 'function');
    assert.equal(typeof f.nativeApproachEdgeAllowed, 'function');

    const nav = {
      nodes: [
        { id: 0, x: 0, y: 0, z: 0, zone: -1, nativePaintable: true, nb: [{ to: 1, climb: { kind: 'approach' } }, { to: 2 }] },
        { id: 1, x: 4, y: 2, z: 0, zone: -1, nativePaintable: true, nb: [] },
        { id: 2, x: 2, y: 0, z: 0, zone: -1, nativePaintable: true, nb: [{ to: 3, climb: { kind: 'gap-jump' } }] },
        { id: 3, x: 6, y: 0, z: 0, zone: -1, nativePaintable: true, nb: [] },
      ],
      valid: new Uint8Array([1, 1, 1, 1]),
      nearest: () => 0,
    };
    const makeG = (wallApproach) => ({
      nav,
      level: { manifest: { sourceNavigation: { wallApproach } } },
    });

    const brain = { a: { pos: { x: 0, y: 0, z: 0 }, team: 0, weaponId: 'shooter', s3: { abilityPoints: {} } } };
    assert.deepEqual(nativePaintGoalIds(brain, makeG(true)), [0, 1, 2, 3]);

    // Same brain, loadout changes to roller -> cache must invalidate and block approach & gap-jump edges.
    brain.a.weaponId = 'roller';
    assert.deepEqual(nativePaintGoalIds(brain, makeG(true)), [0, 2]);

    // Same brain, shooter with non-zero AP -> still blocked.
    brain.a.weaponId = 'shooter';
    brain.a.s3.abilityPoints = { swimSpeed: 3 };
    assert.deepEqual(nativePaintGoalIds(brain, makeG(true)), [0, 2]);

    // wallApproach disabled -> cache invalidates and allows edges.
    assert.deepEqual(nativePaintGoalIds(brain, makeG(false)), [0, 1, 2, 3]);
  });

  test('P1-16: nativeRankedTowerApproach filters approach edges and updateNativeTowerBoarding enforces monotonic totalSeconds > 2 timeout', async () => {
    const context = vm.createContext({ console, Math, Set, Array, Number, Object, Uint8Array, Map });
    const make = (values) => new vm.SyntheticModule(
      Object.keys(values),
      function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); },
      { context },
    );
    const links = {
      three: make({ Vector3: THREE.Vector3 }),
      './native-tower-boarding.mjs': make({ nativeTowerBoarding }),
      './native-bot-support.mjs': make({ nativeSourceFootSupported: () => true }),
      './native-bots.mjs': make({ nativeApproachEdgeAllowed }),
    };
    const mod = new vm.SourceTextModule(
      fs.readFileSync(new URL('../runtime/native-ranked-boarding.mjs', import.meta.url), 'utf8'),
      { context },
    );
    await mod.link((s) => links[s]);
    await mod.evaluate();
    const { nativeRankedTowerApproach, updateNativeTowerBoarding } = mod.namespace;
    // 1) nativeRankedTowerApproach passes acceptEdge when wallApproach is true
    const pathCalls = [];
    const nav = {
      nx: 4,
      nz: 4,
      nodes: [
        { id: 0, ix: 0, iz: 0, x: 0, y: 0, z: 0, zone: -1, nb: [{ to: 1, cost: 2, climb: { kind: 'approach' } }, { to: 1, cost: 9 }] },
        { id: 1, ix: 1, iz: 0, x: 2.0, y: 0, z: 0, zone: -1, nb: [] },
      ],
      cells: Array.from({ length: 16 }, (_, i) => (i === 0 ? [0] : i === 1 ? [1] : [])),
      valid: new Uint8Array([1, 1]),
      validIds: [0, 1],
      nearest: () => 0,
      path(start, goal, team, limit, acceptEdge) {
        pathCalls.push({ start, goal, team, limit, acceptEdge });
        const edges = this.nodes[start].nb.filter(e => e.to === goal && (!acceptEdge || acceptEdge(e)));
        return edges.length ? [start, goal] : null;
      },
    };
    const G = {
      level: {
        native: true,
        manifest: { sourceNavigation: { wallApproach: true } },
        spawnPads: [new THREE.Vector3(0, 0, 0)],
      },
      nav,
      physics: {
        actorBody: f.PLAYER,
        bodyFits: () => true,
      },
      match: { rankedWorld: {} },
    };
    const engine = { stage: { tower: { halfSize: 1.2, boarding: { approaches: [{ sourceNode: 1 }] } } } };

    const rollerBrain = { a: { pos: new THREE.Vector3(0, 0, 0), team: 0, weaponId: 'roller' } };
    const ok = nativeRankedTowerApproach(rollerBrain, { x: 4.3, y: 0.4, z: 0 }, engine, G);
    assert.equal(ok, true);
    assert.equal(pathCalls.length, 1);
    assert.equal(typeof pathCalls[0].acceptEdge, 'function');
    assert.equal(pathCalls[0].acceptEdge({ climb: { kind: 'approach' } }), false);
    assert.equal(pathCalls[0].acceptEdge({}), true);
    assert.equal(rollerBrain._nativeTowerBoarding.totalSeconds, 0);

    // If only an approach edge exists, roller cannot use it.
    nav.nodes[0].nb = [{ to: 1, cost: 2, climb: { kind: 'approach' } }];
    assert.equal(nativeRankedTowerApproach(rollerBrain, { x: 4.3, y: 0.4, z: 0 }, engine, G), false);

    // 2) updateNativeTowerBoarding enemy-ink repaint loop must still time out at totalSeconds > 2
    const towerBlock = { center: new THREE.Vector3(4.3, 0, 0) };
    const level = { native: true, blocks: [towerBlock] };
    const rankedWorld = { level, match: null, towerBlockId: 0, towerBlock, _towerDeckTop: 0.4 };
    const match = { mode: 'tower', rankedWorld };
    rankedWorld.match = match;
    const eng2 = { mode: 'tower' };
    const G2 = {
      level,
      nav,
      match,
      physics: {
        raycast: () => ({ hit: true, face: 0, point: new THREE.Vector3(1.5, 0, 0) }),
      },
    };
    const actor = {
      alive: true,
      grounded: true,
      groundTeam: 2, // enemy ink -> triggers repaint branch which resets state.seconds = 0
      ink: 100,
      pos: new THREE.Vector3(2.0, 0, 0),
      vel: new THREE.Vector3(0, 0, 0),
      aimYaw: 0,
      aimPitch: 0,
      aimPoint: new THREE.Vector3(),
      intent: { fire: false, squid: false, jump: false, sub: false, special: false, move: new THREE.Vector3() },
    };
    const brain2 = {
      a: actor,
      repath: 5,
      noProg: 0,
      aimYaw: 0,
      aimPitch: 0,
      _nativeTowerBoarding: {
        proof: { sourceNode: 1, start: [2.0, 0, 0], end: [3.2, 0.4, 0], jumping: true },
        target: { x: 4.3, y: 0.4, z: 0 },
        phase: 'hop',
        seconds: 0,
        totalSeconds: 0,
        level,
        nav,
        world: rankedWorld,
        engine: eng2,
      },
    };
    // Tick 4 times at 0.5s (= 2.0s total): still active, seconds reset to 0 each tick, totalSeconds accumulates
    for (let i = 0; i < 4; i++) {
      assert.equal(updateNativeTowerBoarding(brain2, G2, eng2, 0.5), true);
      assert.equal(brain2._nativeTowerBoarding.seconds, 0);
    }
    assert.equal(brain2._nativeTowerBoarding.totalSeconds, 2.0);
    // Next tick pushes totalSeconds to 2.1 > 2 -> must time out and clear boarding state
    assert.equal(updateNativeTowerBoarding(brain2, G2, eng2, 0.1), false);
    assert.equal(brain2._nativeTowerBoarding, null);
    assert.equal(brain2.repath, 0);
  });

  test('P1-18: unavailable native stage early reject sets _nativePreReleaseEpoch and skips fatal recovery while keeping #1723 fail-closed', async () => {
    const main = adaptBuildSource(
      'src/main.js',
      fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8'),
    );
    const anchor = 'const nativeStageBuild = Game.prototype._buildWorld;';
    const singleton = 'const game = new Game();';
    const start = main.indexOf(anchor);
    const end = main.indexOf(singleton, start);
    assert.ok(start >= 0 && end > start);
    const wrapperSource = main.slice(start, end);

    assert.match(main, /this\._nativePreReleaseEpoch\s*=\s*this\._nativeStageSwitchEpoch/);
    assert.match(wrapperSource, /this\._nativePreReleaseEpoch\s*!==\s*epoch/);

    let dialogs = 0;
    const Game = new Function(
      'NATIVE_IDS',
      'UNAVAILABLE_NATIVE_STAGES',
      'showNativeWorldRecovery',
      `class Game {
        async _buildWorld(map) {
          const unavailable = UNAVAILABLE_NATIVE_STAGES.find(stage => stage.id === map.id || stage.id === map.layout);
          if (unavailable) { this._nativePreReleaseEpoch = this._nativeStageSwitchEpoch; throw new RangeError(unavailable.name + '：' + unavailable.reason); }
          return map.wait;
        }
      }\n${wrapperSource}\nreturn Game;`,
    )(['native-map'], [{ id: 'lemuria', name: 'リュウグウターミナル', reason: '準備中' }], () => { dialogs++; });

    const game = new Game();
    // Early reject for unavailable stage must NOT trigger fatal recovery or freeze
    await assert.rejects(game._buildWorld({ id: 'lemuria' }), RangeError);
    assert.equal(game._nativeWorldRecoveryFatal, undefined);
    assert.equal(game.frozen, undefined);
    assert.equal(dialogs, 0);
    assert.equal(game._nativeStageSwitchPending, false);

    // Subsequent real legacy build failure must STILL trigger fatal recovery (#1723)
    const err = new Error('legacy lightmap failed');
    await assert.rejects(game._buildWorld({ id: 'legacy-map', wait: Promise.reject(err) }), /legacy lightmap failed/);
    assert.equal(game._nativeWorldRecoveryFatal.error, err);
    assert.equal(game.frozen, true);
    assert.equal(dialogs, 1);
    assert.equal(game._nativeStageSwitchPending, false);
  });

  test('P2-11: nativeTowerClearance stops BVH traversal early on first triangle hit', () => {
    // 4 overlapping ceiling triangles at y = 3.5 inside the box
    const triangles = new Float32Array([
      -1, 3.5, -1, 1, 3.5, -1, 1, 3.5, 1,
      -1, 3.5, -1, 1, 3.5, 1, -1, 3.5, 1,
      -0.5, 3.6, -0.5, 0.5, 3.6, -0.5, 0.5, 3.6, 0.5,
      -0.5, 3.6, -0.5, 0.5, 3.6, 0.5, -0.5, 3.6, 0.5,
    ]);
    const bvh = buildSourceBVH(triangles);
    const level = makeLevel(
      triangles,
      bvh,
      new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]),
      new Uint32Array(4).fill(1),
      new Uint32Array(4),
      new Int32Array(4).fill(-1),
    );
    const check = nativeTowerClearance(level, { radius: 0.35, height: 1.45 }, 1.2);
    assert.equal(check.clear([0, 3.0, 0]), false);
    assert.equal(check.metrics.triangleTests, 1, 'must stop immediately after first intersecting triangle');
  });

  test('P2-12: nativeTowerBoarding cache key includes target x and z coordinates', () => {
    const nodes = [
      { id: 0, ix: 1, iz: 1, x: 0, y: 0, z: 0, zone: -1 },
      { id: 1, ix: 0, iz: 1, x: -2.2, y: 0, z: 0, zone: -1 },
      { id: 2, ix: 2, iz: 1, x: 2.2, y: 0, z: 0, zone: -1 },
    ];
    const cells = Array.from({ length: 9 }, () => []);
    cells[1 * 3 + 1].push(0);
    cells[1 * 3 + 0].push(1);
    cells[1 * 3 + 2].push(2);
    const G = {
      nav: { nx: 3, nz: 3, nodes, cells },
      level: { spawnPads: [new THREE.Vector3(0, 0, 0)] },
      physics: { bodyFits: () => true },
    };
    const body = { radius: 0.35, height: 1.45, stepUp: 0.45, jumpVel: 9, gravity: 24, ledgeAssist: 0.2, runSpeed: 6 };
    const screen = nativeTowerBoarding(G, [0, 1, 2], body, 1.2);

    // Same node id (0) and same target y (0.2), but different target x (-0.1 vs +0.1)
    const first = screen.find(0, [-0.1, 0.2, 0]);
    const second = screen.find(0, [0.1, 0.2, 0]);
    assert.ok(first && second);
    assert.equal(first.sourceNode, 1);
    assert.equal(second.sourceNode, 2);
    assert.notEqual(first, second, 'different target x/z must not collide in boarding cache');
  });

  test('P1-14: applyNativeQuality rebinds levelMesh paint when updatePaintQuality returns true', async () => {
    const context = vm.createContext({ console, AbortController, performance });
    const make = (values) => new vm.SyntheticModule(
      Object.keys(values),
      function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); },
      { context },
    );
    const caps = { maxDimension: 1024, perRole: {} };
    const links = {
      three: make({ LinearFilter: 1006 }),
      './native-load.mjs': make({ async loadNativeTextures() { return new Map(); } }),
      './native-texture-budget.mjs': make({ nativeStageTextureCaps: () => caps }),
      './native-gpu-budget.mjs': make({
        capQuality: (q) => q,
        nativeRenderCaps: () => ({}),
        nativeTextureProfile: () => ({ quality: 'high', caps }),
        nativeCompressedTextureSupport: () => false,
      }),
    };
    const mod = new vm.SourceTextModule(
      fs.readFileSync(new URL('../runtime/native-quality.mjs', import.meta.url), 'utf8'),
      { context },
    );
    await mod.link((s) => links[s]);
    await mod.evaluate();

    const data = { manifest: {} };
    const paint = { texture: {}, size: 2048, ppm: 8 };
    const bindCalls = [];
    const game = {
      levelMesh: { bindPaint(p) { bindCalls.push(p); } },
      nativeWorld: {
        gpuTier: 0,
        disposed: false,
        level: { data, layout: { id: 'test' } },
        textureProfile: { data, quality: 'high', caps },
        metrics: {},
        display: { updateTextures() {} },
      },
    };
    const G = {
      paint,
      renderer: { capabilities: { maxTextureSize: 4096 } },
      env: {},
      fx: {},
      match: null,
    };
    const baseDeps = {
      G,
      q: { paintAtlas: 2048, shadowSize: 1024, particles: 1 },
      updateEnvironmentShadowQuality() {},
      updateFXQuality() {},
    };

    await mod.namespace.applyNativeQuality(game, { quality: 'high' }, { touch: false }, {
      ...baseDeps,
      updatePaintQuality: () => false,
    });
    assert.equal(bindCalls.length, 0, 'bindPaint not called when updatePaintQuality returns false');

    await mod.namespace.applyNativeQuality(game, { quality: 'high' }, { touch: false }, {
      ...baseDeps,
      updatePaintQuality: () => true,
    });
    assert.equal(bindCalls.length, 1, 'bindPaint called when updatePaintQuality returns true');
    assert.equal(bindCalls[0], paint);
  });
}
