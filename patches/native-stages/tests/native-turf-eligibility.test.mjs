import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSource } from '../runtime/source-convert.mjs';
import { nativeFixture } from './fixture.mjs';

// Turf War judge eligibility on source stages (classifyTurfCells). Ink still
// lands on every masked cell; only the judge's area ignores covered, buried,
// duplicated and grazed cells.
let runtime;
const api = () => runtime ||= nativeFixture();
const definition = { id: 'turf-eligibility', bounds: { minX: 0, maxX: 16, minZ: 0, maxZ: 8 },
  spawnPads: [[2, 0, 2], [14, 0, 6]], spawnBarrier: 0 };

function source(objects) {
  let vertices = 0;
  const rows = [];
  // Two triangles (p0,p1,p2), (p2,p1,p3); (p1-p0)x(p2-p0) is the outward normal.
  const quad = (p, n) => {
    for (const q of p) rows.push(`v ${q.join(' ')}`, `vn ${n.join(' ')}`);
    const [a, b, c, d] = [1, 2, 3, 4].map(i => `${vertices + i}//${vertices + i}`);
    rows.push(`f ${a} ${b} ${c}`, `f ${c} ${b} ${d}`);
    vertices += 4;
  };
  for (const o of objects) {
    rows.push(`o ${o.name}`, 'usemtl Concrete00');
    if (o.floor) { const [x0, x1, z0, z1, y] = o.floor; quad([[x0, y, z0], [x0, y, z1], [x1, y, z0], [x1, y, z1]], [0, 1, 0]); }
    if (o.box) {
      const [x0, x1, y0, y1, z0, z1] = o.box;
      quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z0], [x1, y1, z1]], [0, 1, 0]);
      quad([[x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1]], [0, -1, 0]);
      quad([[x1, y0, z0], [x1, y1, z0], [x1, y0, z1], [x1, y1, z1]], [1, 0, 0]);
      quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z0], [x0, y1, z1]], [-1, 0, 0]);
      quad([[x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1]], [0, 0, 1]);
      quad([[x0, y0, z0], [x0, y1, z0], [x1, y0, z0], [x1, y1, z0]], [0, 0, -1]);
    }
  }
  return convertSource(definition, rows.join('\n'), 'newmtl Concrete00\nKd 1 1 1\n', {});
}

async function judge(objects) {
  const f = await api(), level = new f.NativeLevel(source(objects));
  f.G.level = level; f.G.physics = new f.NativePhysics(level); f.G.netm = null;
  class CpuPaint extends f.PaintSystem { _initGPU() { this.quads = []; } _pushQuad() {} }
  const paint = new CpuPaint(null, level, { atlasSize: 512, maxDensity: 18 });
  // Judge area (m2 of upward floor) and the cells each face keeps.
  let area = 0;
  const kept = new Map();
  for (const face of paint.paintFaces) {
    if (!face.turf) continue;
    let cells = 0;
    for (let k = face.grid; k < face.grid + face.nu * face.nv; k++) if (!paint.dead[k] && !paint.turfIgnore?.[k]) cells++;
    kept.set(face, cells); area += cells * face.cu * face.cv * face.n.y;
  }
  return { f, level, paint, area, kept };
}
const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test('an open floor keeps its whole area in the judge', async () => {
  const { area, paint } = await judge([{ name: 'Fld_Floor', floor: [0, 16, 0, 8, 0] }]);
  near(area, 128, 1e-6, 'open floor area');
  assert.ok(paint.turfIgnore, 'native grids publish their judge mask');
});

test('a kitbashed duplicate of the same floor is counted once', async () => {
  const { area, kept, paint } = await judge([
    { name: 'Fld_Base', floor: [0, 16, 0, 8, 0] },
    { name: 'Fld_Copy', floor: [4, 12, 0, 8, 0] }]);
  near(area, 128, 1, 'stacked copies do not add area');
  assert.equal([...kept.values()].filter(cells => cells > 0).length >= 1, true);
  // The copy still takes ink: its cells are not dead.
  const copy = paint.paintFaces.find(face => face.turf && kept.get(face) === 0);
  assert.ok(copy && paint.dead.slice(copy.grid, copy.grid + copy.nu * copy.nv).some(v => !v), 'the duplicate remains paintable');
});

test('floor inside a closed solid and under a 2 cm slab leaves the judge, its top stays', async () => {
  const { area } = await judge([
    { name: 'Fld_Floor', floor: [0, 16, 0, 8, 0] },
    // A 2 x 1 x 2 m box sunk 0.5 m into the floor: the floor inside it is buried.
    { name: 'FldObj_Box', box: [2, 4, -.5, .5, 2, 4] },
    // A 4 x 4 m slab 2 cm over the floor: the floor below is covered.
    { name: 'Fld_Slab', floor: [10, 14, 2, 6, .02] }]);
  // 128 floor - 4 buried - 16 covered + 4 box top + 16 slab top.
  near(area, 128, 1, 'only the reachable surfaces count');
});

test('floor beneath an open canopy stays in the judge', async () => {
  const { area } = await judge([
    { name: 'Fld_Floor', floor: [0, 16, 0, 8, 0] },
    { name: 'Fld_Canopy', box: [6, 10, 3, 3.2, 2, 6] }]);
  // 128 floor + 16 canopy top; the floor under the canopy is reachable.
  near(area, 144, 1, 'covered but open floor counts');
});

test('the reported coverage divides by the judge area, not every masked cell', async () => {
  const { f, paint } = await judge([
    { name: 'Fld_Floor', floor: [0, 16, 0, 8, 0] },
    { name: 'FldObj_Box', box: [0, 8, -.5, .5, 0, 8] }]);
  // Ink the whole stage for team 0 from above both levels.
  for (let x = .5; x < 16; x += 1) for (let z = .5; z < 8; z += 1)
    paint.splat(new f.THREE.Vector3(x, x < 8 ? .5 : 0, z), .9, 0, { kind: 'test', seed: .1, instant: true });
  const [team0] = paint.coverage();
  // 64 m2 box top + 64 m2 open floor; the 64 m2 inside the box is not turf.
  near(paint._s3CoverageIndex.area, 128, 1, 'judge area');
  near(team0, 1, .02, 'a fully inked stage reads as fully inked');
});

test('whole-object source boxes never reach a block query', async () => {
  const { level } = await judge([
    { name: 'Fld_Floor', floor: [0, 16, 0, 8, 0] },
    { name: 'FldObj_Box', box: [2, 4, 0, 1, 2, 4] }]);
  const objects = level.blocks.filter(block => block.nativeObject !== undefined);
  assert.ok(objects.length >= 2, 'collidable objects keep their block for triangle ownership');
  const ids = level.queryBlocks(-10, -10, 30, 30, []);
  assert.ok(ids.length > 0);
  for (const id of ids) assert.equal(level.blocks[id].nativeObject, undefined, 'object box ' + id + ' in the hash');
  assert.equal(level.blockStamp.length, level.blocks.length);
  // A triangle with no chart still names its object block.
  const wall = level.data.triangleFace.findIndex(face => face < 0);
  if (wall >= 0) assert.equal(level.blocks[level.blockForTriangle(wall)].nativeObject, level.triangleWorld.objectIds[wall]);
});
