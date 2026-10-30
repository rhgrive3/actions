import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSource } from '../runtime/source-convert.mjs';
import { nativeFixture } from './fixture.mjs';

let runtime;
const api = () => runtime ||= nativeFixture();
const definition = { id: 'roller-seam', bounds: { minX: 0, maxX: 16, minZ: 0, maxZ: 8 },
  spawnPads: [[5, 0, 2], [11, 0, 6]], spawnBarrier: 0 };

function geometry({ neighbours = false } = {}) {
  let vertices = 0;
  const rows = [];
  function quad(name, points, normal, material = 'Concrete00') {
    if (name) rows.push(`o ${name}`, `usemtl ${material}`);
    for (const p of points) rows.push(`v ${p.join(' ')}`, `vn ${normal.join(' ')}`);
    const [a,b,c,d] = [1,2,3,4].map(i => `${vertices + i}//${vertices + i}`);
    rows.push(`f ${a} ${b} ${c}`, `f ${c} ${b} ${d}`);
    vertices += 4;
  }
  const floor = (name, x0, x1, y, material) => quad(name,
    [[x0,y,0],[x0,y,8],[x1,y,0],[x1,y,8]], [0,1,0], material);
  // Same object and exact same horizontal plane; only the native 8m chart key changes.
  floor('Fld_Floor', 4, 8, 0);
  floor(null, 8, 12, 0);
  if (neighbours) {
    floor('Fld_Lower', 4, 12, -.25);
    floor('Fld_Upper', 4, 12, .25);
    floor('Fld_Dry', 12, 14, 0, 'Concrete00_np');
    quad('Fld_Wall', [[8,0,0],[8,2,0],[8,0,8],[8,2,8]], [1,0,0]);
  }
  return convertSource(definition, rows.join('\n'), 'newmtl Concrete00\nKd 1 1 1\nnewmtl Concrete00_np\nKd 1 1 1\n', {});
}

async function world(options) {
  const f = await api(), data = geometry(options);
  const level = f.G.level = new f.NativeLevel(data);
  f.G.physics = new f.NativePhysics(level);
  f.G.netm = null;
  class CpuPaint extends f.PaintSystem {
    _initGPU() { this.quads = []; }
    _pushQuad(face) { this.quads.push(face.id); }
  }
  const paint = f.G.paint = new CpuPaint(null, level, { atlasSize: 512, maxDensity: 18 });
  const at = new f.THREE.Vector3(7.9, 0, 4);
  const reference = level.faces.find(face => face.n.y > .99 && Math.abs(face.origin.y) < 1e-8 &&
    face.bounds[1][0] <= 8);
  assert.ok(reference);
  const contact = { kind: 'source-shot', footprint: 'ink-contact', face: reference.id, seed: .2, instant: true,
    stretch: new f.THREE.Vector3(0, 0, 1), stretchAmt: 1.5 / (1.2 * 2) - 1 };
  return { f, data, level, paint, at, reference, contact };
}

test('native roller contact paints both sides of a coplanar chart seam in CPU and GPU submissions', async () => {
  const { f, level, paint, at, reference, contact } = await world();
  assert.equal(level.faces.length, 2);
  const other = level.faces.find(face => face !== reference);
  paint.splat(at, 2, 0, contact);
  for (const [face, x] of [[reference, 7], [other, 9]]) {
    assert.equal(paint.sampleWorld(face.id, new f.THREE.Vector3(x, 0, 4)), 1,
      `the roller's interior must be painted on chart ${face.id}`);
    assert.ok(paint.quads.includes(face.id), `chart ${face.id} must receive the visual stamp too`);
  }
  // Every interior sample across the former seam remains swimmable.
  for (let x = 6.5; x <= 9.5; x += .125) {
    const face = level.faces.find(face => x >= face.bounds[0][0] && x <= face.bounds[1][0]);
    assert.equal(paint.sampleWorld(face.id, new f.THREE.Vector3(x, 0, 4)), 1, `gap at ${x}`);
  }
});

test('native contact cannot paint through a raised floor, lower floor, wall or NoPaint material', async () => {
  const { level, paint, at, contact } = await world({ neighbours: true });
  paint.splat(at, 2, 0, contact);
  const accepted = level.faces.filter(face => Math.abs(face.origin.y) < 1e-8 && face.n.y > .99);
  const rejected = level.faces.filter(face => !accepted.includes(face));
  assert.ok(accepted.length >= 2); assert.ok(rejected.length >= 3);
  for (const face of rejected) {
    assert.ok(paint.grid.slice(face.grid, face.grid + face.nu * face.nv).every(value => value === 0));
    assert.ok(!paint.quads.includes(face.id));
  }
  assert.equal(level.manifest.objects.find(object => object.name === 'Fld_Dry').paintable, false);
});

test('ordinary native projectile impacts remain restricted to their struck chart', async () => {
  const { level, paint, at, reference } = await world();
  paint.splat(at, 2, 0, { kind: 'source-shot', face: reference.id, seed: .2, instant: true });
  const other = level.faces.find(face => face !== reference);
  assert.ok(paint.grid.slice(other.grid, other.grid + other.nu * other.nv).every(value => value === 0));
  assert.ok(!paint.quads.includes(other.id));
});

test('a native contact crossing charts records one event and replays identical ownership', async () => {
  const { f, paint, at, contact } = await world();
  const calls = [], order = { clock: 60, epoch: 'roller-test', peer: 'local', seq: 1 };
  f.G.netm = { mute: 0, applying: false, recSplat(center, radius, team, options) {
    calls.push({ center: center.clone(), radius, team, options: { ...options } }); return order;
  } };
  paint.splat(at, 2, 0, contact);
  assert.equal(calls.length, 1, 'crossing a chart must not duplicate network paint events');
  assert.equal(calls[0].options.kind, 'ink-contact', 'the transmitted footprint is independent of the current weapon');
  const expected = Array.from(paint.grid);
  const replay = await world();
  replay.f.G.netm = { mute: 0, applying: true };
  replay.paint.splat(calls[0].center, calls[0].radius, calls[0].team, { ...calls[0].options, __netOrder: order });
  assert.deepEqual(Array.from(replay.paint.grid), expected);
  replay.f.G.netm = null;
});

test('legacy contact retains its struck-face scope', async () => {
  const f = await api();
  const level = f.G.level = new f.Level({ bounds: definition.bounds, spawnPads: definition.spawnPads,
    spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [4,-1,0], max: [8,0,8] },
      { kind: 'box', min: [8,-1,0], max: [12,0,8] },
    ] });
  class CpuPaint extends f.PaintSystem { _initGPU() {} _pushQuad() {} }
  const paint = f.G.paint = new CpuPaint(null, level, { atlasSize: 512, maxDensity: 18 });
  const [left,right] = level.faces.filter(face => face.turf && face.n.y > .99);
  assert.ok(left && right);
  paint.splat(new f.THREE.Vector3(7.9,0,4), 2, 0, { kind: 'ink-contact', face: left.id,
    seed: .2, instant: true, stretch: new f.THREE.Vector3(0,0,1), stretchAmt: -.375 });
  assert.ok(paint.grid.slice(right.grid, right.grid + right.nu * right.nv).every(value => value === 0));
});
