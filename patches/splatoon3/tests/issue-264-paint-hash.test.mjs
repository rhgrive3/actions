import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { paintShapeSeed, paintShapeHash, PAINT_SHAPE_HASH_GLSL } from '../runtime/paint-ownership.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture } from './source-fixture.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js', import.meta.url), 'utf8');
const composed = adaptBuildSource('src/world/paint.js', raw);

test('all 16-bit ancillary seeds use exact float32 integer arithmetic across every shape stream', () => {
  const f = Math.fround, mod = (x, n) => f(x - f(n * Math.floor(f(x / n))));
  function gpu(word, stream, index) {
    let x = mod(f(f(word + f(stream * 4099)) + f(index * 131)), 65536);
    x = mod(f(f(x * 251) + 13849), 65536);
    x = f(f(mod(x, 256) * 256) + Math.floor(f(x / 256)));
    x = mod(f(f(x * 251) + 13849), 65536);
    return f(x / 65536);
  }
  const shaderBody = PAINT_SHAPE_HASH_GLSL.slice(PAINT_SHAPE_HASH_GLSL.indexOf('{') + 1, -1)
    .replace(/float x/g, 'let x').replace(/floor\(/g, 'Math.floor(');
  const emittedHash = new Function('word', 'stream', 'index', 'mod', shaderBody);
  for (let word = 0; word < 65536; word++) for (let stream = 0; stream < 12; stream++) {
    const index = word % 14;
    const expected = paintShapeHash(word, stream, index);
    assert.equal(expected, gpu(word, stream, index));
    assert.equal(expected, emittedHash(word, stream, index, mod), 'evaluate the emitted GLSL scalar body independently');
  }
  assert.ok(65535 * 251 + 13849 < 2 ** 24, 'the largest multiply/add is exactly representable even with FMA');
  assert.equal(paintShapeSeed(0.37), 24248);
  assert.equal(paintShapeSeed(1 - 2 ** -26), 0, 'packing follows the GPU float32 seed, including its wrap to 1');
});

test('composed ancillary GLSL consumes the shared hash while body and cosmetic tone remain native', () => {
  assert.ok(composed.includes(PAINT_SHAPE_HASH_GLSL));
  assert.equal([...composed.matchAll(/paintShapeHash\(paintSeed, \d+\.0, fk\)/g)].length, 12);
  assert.doesNotMatch(composed, /hsh\(seed \* [\d.]+ \+ fk/);
  for (const source of [raw, composed]) {
    assert.match(source, /float hsh\(float n\) \{ return fract\(sin\(n\) \* 43758\.5453123\); \}/);
    assert.match(source, /hsh\(seed \* 1\.73\)/);
  }
  const body = source => source.match(/float wob\(float a, float s\) \{[^}]+\}/)[0];
  assert.equal(body(composed), body(raw));
  assert.match(composed, /float paintSeed = floor\(vGrow.w \+ 0\.5\)/);
});

test('native composed quad submission packs the same exact ancillary word on all four vertices', async () => {
  const { PaintSystem } = await fixture({ productionComposition: true });
  const paint = Object.create(PaintSystem.prototype);
  Object.assign(paint, { size: 512, quads: 0,
    aPos: new Float32Array(8), aLocal: new Float32Array(12), aSplat: new Float32Array(16),
    aStretch: new Float32Array(12), aGrow: new Float32Array(16) });
  const face = { atlas: { x: 0, y: 0, pad: 2, ppm: 32 }, su: 8, sv: 8, wall: false };
  for (const seed of [0, 0.37, 0.72, 1 - 2 ** -26, 24249 / 65536 - 2 ** -26]) {
    paint.quads = 0;
    paint._pushQuad(face, 0, 1, 0, 1, 0.5, 0.5, 0, 2.7, 0, seed, 3, 0, 0, 0, 3, 1, 0);
    for (let vertex = 0; vertex < 4; vertex++) {
      assert.equal(paint.aGrow[vertex * 4 + 3], paintShapeSeed(seed));
      assert.equal(paint.aSplat[vertex * 4 + 2], Math.fround(seed), 'native body seed is not quantized');
    }
  }
});


test('the real browser probe acquires the composed shader and produces all CPU mask cases without game boot', async () => {
  const { PaintSystem } = await fixture({ productionComposition: true });
  const probeSource = fs.readFileSync(new URL('./paint-mask-browser-fixture.mjs', import.meta.url), 'utf8');
  const setup = probeSource.match(/export function createPaintMaskProbe\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(setup, 'exercise the browser fixture setup itself with both native and emitted modules');
  const paint = new Function('PaintSystem', setup)(PaintSystem);
  assert.ok(paint.mat.fragmentShader.includes(PAINT_SHAPE_HASH_GLSL));
  const face = { atlas: { x: 0, y: 0, pad: 2, ppm: 64 }, su: 32, sv: 32, nu: 128, nv: 128, cu: 0.25, cv: 0.25,
    grid: 0, wall: false, turf: true };
  let rows = 0, cells = 0;
  for (const wall of [false, true]) for (const kind of [0, 1, 2, 3, 4, 5]) for (const seed of [0.37, 0.72, 0.99999]) for (const tn of [0.6, 1.1, 3]) {
    paint.clear(); face.wall = wall;
    const order = paint._paintOrderId({ tick: 1, peer: 'mask-probe', seq: 1 });
    const sa = kind === 1 ? 1.2 : 0;
    paint._advanceSplatOwnership({ R: 2.7, team: 0, seed, kind, age: tn, dur: 1, dripDur: wall ? 3 : 0,
      entries: [face, 16, 20, 0, sa ? 0.6 : 0, sa ? 0.8 : 0, sa], paintOrder: order, netOrderId: order });
    const claimed = paint.grid.filter(Boolean).length;
    assert.ok(claimed > 0, `probe needs real ancillary cells: ${JSON.stringify({ wall, kind, seed, tn })}`);
    cells += claimed; rows++;
  }
  assert.equal(rows, 108);
  assert.ok(cells > 10000);
});
