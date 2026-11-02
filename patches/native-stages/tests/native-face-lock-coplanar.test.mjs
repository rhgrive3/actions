import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSource } from '../runtime/source-convert.mjs';
import { nativeFixture } from './fixture.mjs';

// A face-locked impact (main weapon shot) must reach the other charts of the same
// physical surface, but never a parallel plane that is far above or below it.
let runtime;
const api = () => runtime ||= nativeFixture();
const definition = { id: 'face-lock-seam', bounds: { minX: 0, maxX: 16, minZ: 0, maxZ: 8 },
  spawnPads: [[5, 0, 2], [11, 0, 6]], spawnBarrier: 0 };

// floors: [name, x0, x1, y] spanning z 0..8. walls: [name, x, y1]: vertical wall at x.
function geometry({ floors = [], walls = [] }) {
  let vertices = 0;
  const rows = [];
  function quad(name, points, normal) {
    if (name) rows.push(`o ${name}`, 'usemtl Concrete00');
    for (const p of points) rows.push(`v ${p.join(' ')}`, `vn ${normal.join(' ')}`);
    const [a, b, c, d] = [1, 2, 3, 4].map(i => `${vertices + i}//${vertices + i}`);
    rows.push(`f ${a} ${b} ${c}`, `f ${c} ${b} ${d}`);
    vertices += 4;
  }
  for (const [name, x0, x1, y] of floors) quad(name, [[x0, y, 0], [x0, y, 8], [x1, y, 0], [x1, y, 8]], [0, 1, 0]);
  for (const [name, x, y1] of walls) quad(name, [[x, 0, 0], [x, y1, 0], [x, 0, 8], [x, y1, 8]], [1, 0, 0]);
  return convertSource(definition, rows.join('\n'), 'newmtl Concrete00\nKd 1 1 1\n', {});
}

async function world(layout) {
  const f = await api(), data = geometry(layout);
  const level = f.G.level = new f.NativeLevel(data);
  f.G.physics = new f.NativePhysics(level);
  f.G.netm = null;
  class CpuPaint extends f.PaintSystem {
    _initGPU() { this.quads = []; }
    _pushQuad(face) { this.quads.push(face.id); }
  }
  const paint = f.G.paint = new CpuPaint(null, level, { atlasSize: 512, maxDensity: 18 });
  // The struck chart is the one whose origin lies on y=0 and whose upper-x bound is 8.
  const reference = level.faces.find(face => face.n.y > .99 && Math.abs(face.origin.y) < 1e-8 && face.bounds[1][0] <= 8);
  assert.ok(reference, 'a struck chart on the left of the seam');
  const at = new f.THREE.Vector3(7.9, 0, 4);
  return { f, data, level, paint, at, reference };
}

const shot = (reference, extra = {}) => ({ kind: 'source-shot', face: reference.id, seed: .2, instant: true, ...extra });
const isUntouched = (paint, face) => paint.grid.slice(face.grid, face.grid + face.nu * face.nv).every(value => value === 0) &&
  !paint.quads.includes(face.id);

test('a face-locked native impact paints the coplanar chart across an 8 m seam in CPU and GPU submissions', async () => {
  const { f, level, paint, at, reference } = await world({ floors: [['Fld_Left', 4, 8, 0], ['Fld_Right', 8, 12, 0]] });
  assert.equal(level.faces.length, 2, 'two charts of one surface');
  const other = level.faces.find(face => face !== reference);
  paint.splat(at, 2, 0, shot(reference));
  assert.equal(paint.sampleWorld(reference.id, new f.THREE.Vector3(7, 0, 4)), 1);
  assert.equal(paint.sampleWorld(other.id, new f.THREE.Vector3(9, 0, 4)), 1, 'the neighbour must receive the ink');
  assert.ok(paint.quads.includes(reference.id) && paint.quads.includes(other.id), 'both charts get a visual stamp');
});

test('a parallel plane 0.5 m above or below the struck surface never inherits a face-locked impact', async () => {
  const { level, paint, at, reference } = await world({ floors: [
    ['Fld_Left', 4, 8, 0], ['Fld_Right', 8, 12, 0],
    ['Fld_Below', 4, 12, -.5], ['Fld_Above', 4, 12, .5]] });
  paint.splat(at, 2, 0, shot(reference));
  const below = level.faces.filter(face => Math.abs(face.origin.y + .5) < 1e-8);
  const above = level.faces.filter(face => Math.abs(face.origin.y - .5) < 1e-8);
  assert.ok(below.length >= 1 && above.length >= 1, 'the parallel charts exist');
  // The lower plane is inside the splat's radius (dn 0.505 < 2 m), so only the plane test keeps it clean.
  for (const face of [...below, ...above]) assert.ok(isUntouched(paint, face), `chart ${face.id} at y=${face.origin.y}`);
});

test('a ten-centimetre overlapping step is the same surface, a half-metre step is not', async () => {
  const { f, level, paint, at, reference } = await world({ floors: [
    ['Fld_Left', 4, 8, 0], ['Fld_Step', 8, 12, .1], ['Fld_Low', 4, 8, -.5] ] });
  const step = level.faces.find(face => Math.abs(face.origin.y - .1) < 1e-8);
  const low = level.faces.find(face => Math.abs(face.origin.y + .5) < 1e-8);
  assert.ok(step && low);
  paint.splat(at, 2, 0, shot(reference));
  assert.equal(paint.sampleWorld(step.id, new f.THREE.Vector3(9, .1, 4)), 1, 'a 10 cm step is painted');
  assert.ok(isUntouched(paint, low), 'the half-metre lower chart is not');
});

test('a face-locked impact never paints a wall, even one that shares the struck edge', async () => {
  const { level, paint, at, reference } = await world({ floors: [['Fld_Left', 4, 8, 0], ['Fld_Right', 8, 12, 0]],
    walls: [['Fld_Wall', 8, 2]] });
  const wall = level.faces.find(face => face.wall);
  assert.ok(wall, 'a wall chart exists');
  paint.splat(at, 2, 0, shot(reference));
  assert.ok(isUntouched(paint, wall));
});

test('a face-locked native impact records one network event and replays identical ownership', async () => {
  const { f, paint, at, reference } = await world({ floors: [['Fld_Left', 4, 8, 0], ['Fld_Right', 8, 12, 0]] });
  const calls = [], order = { clock: 60, epoch: 'face-lock-test', peer: 'local', seq: 1 };
  f.G.netm = { mute: 0, applying: false, recSplat(center, radius, team, options) {
    calls.push({ center: center.clone(), radius, team, options: { ...options } }); return order;
  } };
  paint.splat(at, 2, 0, shot(reference));
  assert.equal(calls.length, 1, 'crossing the seam must not duplicate the network event');
  assert.equal(calls[0].options.face, reference.id, 'the event carries the struck chart, not every neighbour');
  const expected = Array.from(paint.grid);
  const replay = await world({ floors: [['Fld_Left', 4, 8, 0], ['Fld_Right', 8, 12, 0]] });
  replay.f.G.netm = { mute: 0, applying: true };
  replay.paint.splat(calls[0].center, calls[0].radius, calls[0].team, { ...calls[0].options, __netOrder: order });
  assert.deepEqual(Array.from(replay.paint.grid), expected);
  replay.f.G.netm = null;
});

test('ordinary (non-native) face-locked shots keep their struck-face scope', async () => {
  const f = await api();
  const level = f.G.level = new f.Level({ bounds: definition.bounds, spawnPads: definition.spawnPads,
    spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [4,-1,0], max: [8,0,8] },
      { kind: 'box', min: [8,-1,0], max: [12,0,8] },
    ] });
  class CpuPaint extends f.PaintSystem {
    _initGPU() { this.quads = []; }
    _pushQuad(face) { this.quads.push(face.id); }
  }
  const paint = f.G.paint = new CpuPaint(null, level, { atlasSize: 512, maxDensity: 18 });
  const [left, right] = level.faces.filter(face => face.turf && face.n.y > .99);
  assert.ok(left && right);
  paint.splat(new f.THREE.Vector3(7.9, 0, 4), 2, 0, { kind: 'source-shot', face: left.id, seed: .2, instant: true });
  assert.ok(isUntouched(paint, right));
});
