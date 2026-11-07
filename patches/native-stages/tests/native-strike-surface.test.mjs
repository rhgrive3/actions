import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSource } from '../runtime/source-convert.mjs';
import { nativeFixture } from './fixture.mjs';

// A native stamp reaches every chart its ink touches: a neighbouring object's
// floor at the same height (roller drum contact) and the next facets of a
// ramp or a crest leading down a slope (face-locked shots).
let runtime;
const api = () => runtime ||= nativeFixture();
const definition = { id: 'strike-surface', bounds: { minX: 0, maxX: 24, minZ: 0, maxZ: 8 },
  spawnPads: [[2, 0, 2], [22, 0, 6]], spawnBarrier: 0 };

// Strips across x at the given profile: [[x, y], ...] per object, spanning z 0..8.
function source(objects) {
  let vertices = 0;
  const rows = [];
  for (const { name, profile } of objects) {
    rows.push(`o ${name}`, 'usemtl Concrete00');
    for (let i = 0; i + 1 < profile.length; i++) {
      const [x0, y0] = profile[i], [x1, y1] = profile[i + 1];
      const length = Math.hypot(x1 - x0, y1 - y0), n = [-(y1 - y0) / length, (x1 - x0) / length, 0];
      for (const p of [[x0, y0, 0], [x0, y0, 8], [x1, y1, 0], [x1, y1, 8]]) rows.push(`v ${p.join(' ')}`, `vn ${n.join(' ')}`);
      const [a, b, c, d] = [1, 2, 3, 4].map(k => `${vertices + k}//${vertices + k}`);
      rows.push(`f ${a} ${b} ${c}`, `f ${c} ${b} ${d}`);
      vertices += 4;
    }
  }
  return convertSource(definition, rows.join('\n'), 'newmtl Concrete00\nKd 1 1 1\n', {});
}

async function world(objects) {
  const f = await api(), level = f.G.level = new f.NativeLevel(source(objects));
  f.G.physics = new f.NativePhysics(level); f.G.netm = null;
  class CpuPaint extends f.PaintSystem { _initGPU() { this.quads = []; } _pushQuad(face) { this.quads.push(face.id); } }
  const paint = f.G.paint = new CpuPaint(null, level, { atlasSize: 1024, maxDensity: 18 });
  const V = (x, y, z) => new f.THREE.Vector3(x, y, z);
  const faceAt = (x, z) => {
    const hit = f.G.physics.raycast(V(x, 5, z), V(0, -1, 0), 20);
    assert.ok(hit.hit && hit.face >= 0, `a floor chart under ${x},${z}`);
    return { face: hit.face, point: hit.point.clone() };
  };
  const inked = (x, z) => { const { face, point } = faceAt(x, z); return paint.sampleWorld(face, point); };
  return { f, level, paint, V, faceAt, inked };
}

test('a rolling contact reaches the neighbouring object floor 2 mm lower at the seam', async () => {
  const { paint, V, faceAt, inked } = await world([
    { name: 'Fld_Left', profile: [[0, 0], [8, 0]] },
    { name: 'Fld_Right', profile: [[8, -.002], [16, -.002]] }]);
  const { face, point } = faceAt(7.9, 4);
  paint.splat(point, .8, 0, { kind: 'ink-contact', face, seed: .3, instant: true });
  assert.equal(inked(7.8, 4), 1, 'the struck floor');
  const right = faceAt(8.1, 4).face;
  assert.notEqual(right, face, 'the seam splits the floor into two charts');
  assert.ok(paint.quads.includes(right), 'the other object floor takes a visual stamp');
  assert.equal(inked(8.1, 4), 1, 'the drum also rests on the other object floor');
});

test('a rolling contact never reaches a floor half a metre below it', async () => {
  const { paint, faceAt, inked } = await world([
    { name: 'Fld_Upper', profile: [[0, 0], [8, 0]] },
    { name: 'Fld_Lower', profile: [[8, -.5], [16, -.5]] }]);
  const { face, point } = faceAt(7.7, 4);
  paint.splat(point, .8, 0, { kind: 'ink-contact', face, seed: .3, instant: true });
  assert.equal(inked(8.3, 4), 0);
});

test('a face-locked shot at a crest also inks the downhill slope', async () => {
  // Flat to x=8, then a 15 degree slope down to x=16.
  const drop = Math.tan(15 * Math.PI / 180) * 8;
  const { paint, faceAt, inked } = await world([{ name: 'Fld_Hill', profile: [[0, 0], [8, 0], [16, -drop]] }]);
  const { face, point } = faceAt(7.9, 4);
  paint.splat(point, .8, 0, { kind: 'source-shot', face, seed: .4, instant: true });
  assert.equal(inked(7.6, 4), 1, 'the struck flat');
  assert.equal(inked(8.4, 4), 1, 'the slope below the crest');
});

test('a face-locked shot on a faceted ramp inks the neighbouring facets', async () => {
  // A curved ramp: each 1 m facet has its own normal, hence its own chart.
  const profile = [];
  for (let i = 0; i <= 8; i++) profile.push([8 + i, -.03 * i * i]);
  const { paint, faceAt, inked } = await world([{ name: 'Fld_Ramp', profile }]);
  const { face, point } = faceAt(12.5, 4);
  paint.splat(point, .9, 0, { kind: 'source-shot', face, seed: .5, instant: true });
  assert.equal(inked(12.5, 4), 1, 'the struck facet');
  assert.equal(inked(11.7, 4), 1, 'the facet above');
  assert.equal(inked(13.3, 4), 1, 'the facet below');
});
