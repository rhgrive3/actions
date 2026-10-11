import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { paintShapeSeed, paintShapeHash } from '../runtime/paint-ownership.mjs';

// Issue #264: the native GLSL draws fine spatter dots in the ordinary team-ink
// channel. For seed 0.5, kind bomb (K_BOMB = 3), R = 2.7, each dot k sits at
// distance R*(1.3+1.2*h2) along angle h1*2*pi with radius R*(0.011+0.02*h3)*fall
// (fall = 1 on the face that was hit). Those dots are far smaller than the
// 0.25 m CPU paint grid. A centre-cell claim for them was tried and reverted: the
// browser paint-mask probe (paint-mask-browser-fixture.mjs) found owned cells whose
// five GPU samples were all unpainted, breaking "CPU-owned cells are GPU-visible".
// No GPU-backed rule exists yet, so these dots stay an unowned residual (未確認),
// pinned by the first test below.

const SEED = 0.5, R = 2.7, BOMB_SPATTER = 14;

function makePaintWorld(f) {
  const { G, THREE, PaintSystem } = f;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const axes = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)];
  const face = { origin: V(-40, 0, -5), u: V(1, 0, 0), v: V(0, 0, 1), n: V(0, 1, 0),
    su: 80, sv: 105, wall: false, turf: true, paintable: true };
  const block = { id: 0, solid: true, grate: false, center: V(0, -1, 47.5), half: V(40, 1, 52.5), axes,
    faces: [0, -1, -1, -1, -1, -1], aabbMin: V(-40, -2, -5), aabbMax: V(40, 0, 100) };
  const level = { faces: [face], blocks: [block], pointInside: () => false,
    queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 0; out.push(0); return out; } };
  G.level = level;
  G.physics = new f.Physics(level);
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(); G.camera.position.set(0, 3, -4);
  G.teamColors = [new THREE.Color(0xff8a14), new THREE.Color(0x2f5bff)];
  G.actors = []; G.time = 0; G.mode = 'match';

  class CpuPaint extends PaintSystem {
    _initGPU() { this.quads = 0; this.dryMesh = { visible: false }; this._dryU = { uDry: { value: 0 } }; this.submitted = []; this.drawCalls = 0; }
    _pushQuad(...args) { this.submitted.push({ team: args[9], tn: args[15], dT: args[16], mode: args[17] }); }
    _drawQuads() { this.drawCalls++; this.quads = 0; this.dryMesh.visible = false; }
  }
  const paint = new CpuPaint(null, level, { atlasSize: 4096, maxDensity: 30, cell: 0.25 });
  G.paint = paint;
  G.projectiles = new f.Projectiles(G.scene);
  return { paint, face, V };
}

test('fine-spatter dots of a seed 0.5 bomb stay an unowned residual: no centre-cell claim (#264)', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint, face, V } = makePaintWorld(f);
  const cx = 0, cz = 5;
  const lu0 = cx - face.origin.x, lv0 = cz - face.origin.z;

  paint.useFixedPaintClock();
  paint.splat(V(cx, 0, cz), R, 0, { seed: SEED, kind: 'bomb' });
  for (let tick = 0; tick < 900 && paint.growing.length > 0; tick++) paint.advanceSimulation(1 / 60);
  assert.equal(paint.growing.length, 0, 'the full native growth lifetime was exercised');

  const word = paintShapeSeed(SEED);
  const missed = [];
  for (let k = 0; k < BOMB_SPATTER; k++) {
    const h1 = paintShapeHash(word, 6, k), h2 = paintShapeHash(word, 7, k);
    const dist = R * (1.3 + 1.2 * h2), angle = h1 * 6.2831;
    const x = lu0 + Math.cos(angle) * dist, y = lv0 + Math.sin(angle) * dist;
    const i = Math.floor(x / face.cu), j = Math.floor(y / face.cv);
    assert.ok(i >= 0 && j >= 0 && i < face.nu && j < face.nv, `dot ${k} lies on the face`);
    if (paint.grid[j * face.nu + i] !== 1) missed.push({ k, distOverR: +(dist / R).toFixed(3) });
  }
  // Residual, recorded: all 14 centre cells stay unowned by this rule. Owning them needs a GPU-backed
  // rule; re-record the residual in reports/inkwave-splatoon3-behavior-2026-10-02.md if it changes.
  assert.deepEqual(missed.map(m => m.k), Array.from({ length: BOMB_SPATTER }, (_, k) => k),
    'the sub-cell dots must stay an unowned residual until a GPU-backed rule owns them');
});

test('owned cells of the bomb stay within the native reach', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint, face, V } = makePaintWorld(f);
  const lu0 = 0 - face.origin.x, lv0 = 5 - face.origin.z;
  paint.useFixedPaintClock();
  paint.splat(V(0, 0, 5), R, 0, { seed: SEED, kind: 'bomb' });
  for (let tick = 0; tick < 900 && paint.growing.length > 0; tick++) paint.advanceSimulation(1 / 60);

  // Every owned cell must lie inside the native body/ancillary reach of the bomb (2.75 R plus the
  // largest satellite and dot extent). A stray cell beyond that would mean a rule over-claims.
  let beyond = 0;
  for (let idx = 0; idx < paint.grid.length; idx++) {
    if (!paint.grid[idx]) continue;
    const j = Math.floor(idx / face.nu), i = idx - j * face.nu;
    const d = Math.hypot((i + 0.5) * face.cu - lu0, (j + 0.5) * face.cv - lv0);
    if (d > 2.75 * R + 0.2) beyond++;
  }
  assert.equal(beyond, 0, 'owned cells stay within the native bomb reach');
});
