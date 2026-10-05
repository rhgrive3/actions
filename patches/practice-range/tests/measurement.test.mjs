// Measurement integrity: every distance the range shows is derived from world coordinates, and the geometry agrees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeRealm, rangeWorld } from './harness.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);   // values across the vm realm

test('zones: floors tile without overlap, inside the bounds; the paint-test floor is exactly 20 × 20 m', async () => {
  const R = await rangeRealm();
  const { ZONES: Z, LAYOUT } = R;
  const rects = Object.entries(Z.ZONES).map(([id, z]) => [id, z.rect]);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, A] = rects[i], [b, Bb] = rects[j];
    const ox = Math.min(A[1], Bb[1]) - Math.max(A[0], Bb[0]), oz = Math.min(A[3], Bb[3]) - Math.max(A[2], Bb[2]);
    assert.ok(!(ox > 1e-6 && oz > 1e-6), `zones ${a} and ${b} overlap`);
  }
  for (const [id, r] of rects) assert.ok(r[0] >= LAYOUT.bounds.minX && r[1] <= LAYOUT.bounds.maxX && r[2] >= LAYOUT.bounds.minZ && r[3] <= LAYOUT.bounds.maxZ, `${id} inside bounds`);
  const P = Z.PAINT_FLOOR;
  assert.equal((P.x[1] - P.x[0]) * (P.z[1] - P.z[0]), 400);
  same(Z.ZONES.paint.rect, [P.x[0], P.x[1], P.z[0], P.z[1]]);
});

test('level: the paint floor face is exactly 400 m² with nothing standing on it; floors are flat at y = 0', async () => {
  const R = await rangeRealm(); rangeWorld(R);
  const L = R.G.level;
  const faces = L.faces.filter((f) => f.turf && L.blocks[f.block].tag === 'floor:paint');
  assert.equal(faces.length, 1);
  assert.ok(near(faces[0].su * faces[0].sv, 400));
  assert.ok(faces[0].paintable);
  // nothing solid stands on the test floor (a block over it would hide part of the known area)
  const [x0, x1, z0, z1] = R.ZONES.ZONES.paint.rect;
  const on = L.blocks.filter((b) => b.solid && b.aabbMin.y >= -0.01 && b.aabbMax.y > 0.01 && b.aabbMin.x < x1 - 1e-3 && b.aabbMax.x > x0 + 1e-3 && b.aabbMin.z < z1 - 1e-3 && b.aabbMax.z > z0 + 1e-3);
  same(on.map((b) => b.tag), []);
  for (const [id, z] of Object.entries(R.ZONES.ZONES)) {
    const cx = (z.rect[0] + z.rect[1]) / 2, cz = (z.rect[2] + z.rect[3]) / 2;
    const y = L.groundHeight(cx + 0.37, cz + 0.41, 0.5);
    assert.ok(Number.isFinite(y), `${id} has a floor`);
  }
  assert.ok(near(L.groundHeight(6, 25, 0.5), 0), 'lane floor y = 0');
  assert.ok(near(L.groundHeight(23, -10, 0.5), 0), 'paint floor y = 0');
});

test('targets: each gallery target stands on its plinth at the distance printed on it, one per column', async () => {
  const R = await rangeRealm(); rangeWorld(R);
  const { GALLERY_TARGETS, FIRE_Z, SIGNS } = R.ZONES;
  const xs = new Set();
  for (const t of GALLERY_TARGETS) {
    assert.ok(near(t.z - FIRE_Z, Math.round(t.z - FIRE_Z)), 'whole metres downrange');
    assert.ok(near(R.G.level.groundHeight(t.x, t.z, 0.5), 0.02), 'on its 2 cm plinth');
    xs.add(t.x);
  }
  assert.equal(xs.size, GALLERY_TARGETS.length, 'one target per column');
  const sorted = [...xs].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 2.4 - 1e-9, 'columns ≥ 2.4 m apart');
  // the distance boards stand at the world z they print
  const dist = SIGNS.flatMap((s) => s.faces.filter((f) => f.art.kind === 'dist').map((f) => [f.art.value, (s.box[4] + s.box[5]) / 2]));
  assert.ok(dist.length >= 20);
  for (const [value, z] of dist) assert.ok(near(z, FIRE_Z + value, 1e-9), `board ${value} at z ${z}`);
});

test('heights and slopes: the wall gauge spans world y 0 … wall height; ramp angles are the printed angles', async () => {
  const R = await rangeRealm(); rangeWorld(R);
  const { SIGNS, TEST_WALL, SWIM, LANE_BOARDS } = R.ZONES;
  const gauge = SIGNS.find((s) => s.gauge);
  assert.equal(gauge.box[2], 0); assert.equal(gauge.box[3], TEST_WALL.h);
  assert.equal(gauge.faces[0].art.h, TEST_WALL.h);
  const slopes = SIGNS.flatMap((s) => s.faces.filter((f) => f.art.kind === 'slope').map((f) => f.art.deg));
  // measure the real ramp blocks: angle of their top face normal
  const ramps = R.G.level.blocks.filter((b) => /swim-ramp/.test(b.tag || ''));
  const deg = ramps.map((b) => Math.acos(b.axes[1].y) * 180 / Math.PI).sort((a, b) => a - b);
  assert.equal(ramps.length, 2);
  const printed = [...slopes].sort((a, b) => a - b);
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(deg[i] - printed[i]) < 0.05, `ramp ${deg[i].toFixed(2)}° vs sign ${printed[i].toFixed(2)}°`);
  assert.ok(Math.abs(deg[0] - 9.7) < 0.1 && Math.abs(deg[1] - 29.7) < 0.1);
  assert.equal(SWIM.chicane.gap, 1.8);
  same(LANE_BOARDS, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
});

test('floor markings: the mural frame maps world metres to the slab face exactly', async () => {
  const R = await rangeRealm();
  const { ZONES } = R.ZONES;
  // record the transforms drawMurals sets and check them against the level face convention (u = maxX − x, v = z − minZ)
  const { drawMurals } = R;
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k === 'setTransform' ? (...a) => calls.push(a) : k === 'measureText' ? () => ({ width: 10 }) : t[k] ?? (() => {})), set: (t, k, v) => { t[k] = v; return true; } });
  const region = { x: 0, y: 1040, w: 2048, h: 1008 };
  const table = drawMurals(g, region);
  assert.equal(table.length, 8);
  same(table.map((m) => m.id).sort((a, b) => a - b), [4, 5, 6, 7, 8, 9, 10, 11]);
  for (const m of table) {
    assert.ok(m.x >= region.x && m.y >= region.y && m.x + m.w <= region.x + region.w && m.y + m.h <= region.y + region.h, 'inside the stage region');
  }
  for (let i = 0; i < table.length; i++) for (let j = i + 1; j < table.length; j++) {
    const a = table[i], b = table[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, 'atlas rects do not overlap');
  }
  // the lane mural: world (x, z) → canvas; at x = maxX (12), z = minZ (0) it must hit the rect's bottom-left
  const lane = table.find((m) => m.id === 4);
  const T = calls.find((c) => c[0] < 0 && Math.abs(c[4] - (lane.x + 12 * (-c[0]))) < 1e-6);
  assert.ok(T, 'a lane frame transform');
  const [a, , , d, e, f] = T;
  const px = (x, z) => [a * x + e, d * z + f];
  same(px(12, 0).map((v) => +v.toFixed(6)), [lane.x, lane.y + lane.h].map((v) => +v.toFixed(6)));
  same(px(0, 50).map((v) => +v.toFixed(6)), [lane.x + lane.w, lane.y].map((v) => +v.toFixed(6)));
  same(lane.place, [0, 12, 0, 50]);
});

test('bomb pit and special arena rings are centred on their marked spots', async () => {
  const R = await rangeRealm();
  const { BOMB_TARGET, BOMB_STAND, BOMB_RINGS, SPECIAL_TARGETS, SPECIAL_CENTER, ZONES } = R.ZONES;
  assert.equal(Math.hypot(BOMB_TARGET[0] - BOMB_STAND[0], BOMB_TARGET[1] - BOMB_STAND[1]), 7);
  const [x0, x1, z0, z1] = ZONES.bomb.rect;
  for (const r of BOMB_RINGS) assert.ok(BOMB_TARGET[0] - r >= x0 && BOMB_TARGET[0] + r <= x1 && BOMB_TARGET[1] - r >= z0 && BOMB_TARGET[1] + r <= z1, `ring ${r} fits`);
  for (const t of SPECIAL_TARGETS) assert.ok(Math.abs(Math.hypot(t.x - SPECIAL_CENTER[0], t.z - SPECIAL_CENTER[1]) - t.r) < 1e-9, 'endurance target on its radius');
});
